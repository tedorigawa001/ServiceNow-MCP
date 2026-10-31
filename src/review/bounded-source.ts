/** Fixed BP-5 acquisition with C-mode release admission; no analysis or MCP registration. */
import { z } from 'zod';
import type { ServiceNowClient } from '../servicenow/client.js';
import { BoundedReadError, claimPrivateCompositionSource, type BoundedReadSession, type BoundedReadOptions } from '../servicenow/bounded-read.js';
import { releaseEvidenceStructure, releaseMatchForEvidence, type ReleaseEvidence } from './result-schema-v2.js';
import { bp5RuleIdsSchema } from './result-schema-v2.js';
import { candidatePolicy, selectionModeSchema } from './target-selection.js';
import type {ReviewSourceReleasePort,ReviewSourceReleaseSnapshot} from '../servicenow/review-evidence-lifecycle.js';

const id = z.string().regex(/^[a-f0-9]{32}$/);
const inputSchema = z.strictObject({ update_set_sys_id: id, max_records: z.number().int().min(1).max(100).default(20),
  selection_mode: selectionModeSchema.optional(), requested_rule_ids: bp5RuleIdsSchema.optional() });
/** Pure validation only; returns no session, permit or mutable source consumer. */
export function parseBoundedSourceInput(input:unknown){
  const parsed=inputSchema.safeParse(input);
  if(!parsed.success)throw new BoundedReadError('invalid_input');
  return parsed.data;
}
const version = { sys_updated_on: z.string().min(1).max(40), sys_mod_count: z.string().regex(/^\d{1,20}$/) };
const parentSchema = z.strictObject({ sys_id: id, state: z.string().max(100), application: z.string().max(32), ...version });
const metadataSchema = z.strictObject({ sys_id: id, update_set: id, name: z.string().min(1).max(200),
  type: z.string().max(200), action: z.string().max(40), ...version });
export type ReviewMetadata = z.infer<typeof metadataSchema>;
const parentFields = 'sys_id,state,application,sys_updated_on,sys_mod_count';
const metadataFields = 'sys_id,update_set,name,type,action,sys_updated_on,sys_mod_count';
declare const permitBrand: unique symbol;
/** Opaque, in-memory capability. Shape/JSON/other-source copies are never accepted. */
export type ReleasePermit = { readonly [permitBrand]: true };
export type ReleaseDecision = { instance_release: ReleaseEvidence; limitations: readonly string[] } & (
  { release_match: 'matched'; permit: ReleasePermit } | { release_match: 'unknown' | 'mismatched'; permit?: never }
);
const statusPermissions=Object.freeze({dispatch:false,read_body:false,retry:false,fallback:false,body_ack:false,release_permit:false,formal_issuance:false} as const);
export type StatusAcceptanceDraft=Readonly<{state:'status_accepted_closed_gate';status:403|404;cleanup_kind:'cancelled'|'no_body';fallback:'disabled';evidence_issuance:'disabled';release_permit:'unavailable';permissions:typeof statusPermissions}>;
/** A creator-only continuation, authenticated by the fresh session's private construction key. */
export interface CompositionSourceConstruction {
 readonly key:object;check():void;take(ack:object,purpose:'parent'|'release'):unknown;
 takeStatus?(terminal:object):unknown;
 rejectStatus?(code:'invalid_state'|'evidence_binding_mismatch'):never;
 capture(consumer:Readonly<{parent(ack:object):void;release(ack:object):Promise<ReleaseDecision>;status(terminal:object):StatusAcceptanceDraft;revoke():void}>):void;
}

export class BoundedUpdateSetSource {
  private parent?: z.infer<typeof parentSchema>;
  private metadata?: ReviewMetadata[];
  private readonly attempted = new Set<string>();
  private finalStarted = false;
  private releaseRead = false;
  #permit?: ReleasePermit;
  #decision?: Promise<ReleaseDecision>;
  readonly #session:BoundedReadSession;
  #releaseSnapshot?:ReviewSourceReleaseSnapshot;
  #releasePort?:ReviewSourceReleasePort;
  constructor(session: BoundedReadSession, private readonly input: z.infer<typeof inputSchema>,creation?:CompositionSourceConstruction) {
    this.#session=session;
    if(creation){
      if(!claimPrivateCompositionSource(session,creation.key,this))throw new BoundedReadError('invalid_input');
      const check=creation.check,take=creation.take,takeStatus=creation.takeStatus;let state:'parent'|'release'|'consuming'|'done'|'accepted_status'|'closed'='parent';
      const requireState=(expected:typeof state)=>{check();if(state!==expected)throw new BoundedReadError('internal_review_error');state='consuming';};
      creation.capture(Object.freeze({
        parent:(ack:object)=>{
          requireState('parent');const value=take(ack,'parent');
          const parsed=parentSchema.safeParse(value&&typeof value==='object'&&'result' in value?value.result:null);
          if(!parsed.success||parsed.data.sys_id!==input.update_set_sys_id)throw new BoundedReadError('invalid_response');
          check();this.parent=structuredClone(parsed.data);state='release';
        },
        release:async(ack:object)=>{
          requireState('release');const value=take(ack,'release');this.releaseRead=true;
          this.#decision=this.#observeRelease(async()=>{
            if(!value||typeof value!=='object'||!('result' in value)||!Array.isArray(value.result)||value.result.length>21)throw new BoundedReadError('invalid_response');
            return this.#projectReleaseRows(value.result);
          },check);
          const decision=await this.#decision;check();state='done';return decision;
        },
        status:(terminal:object)=>{
          check();if(state!=='release')creation.rejectStatus?.('invalid_state');
          requireState('release');
          if(!takeStatus)throw new BoundedReadError('invalid_input');
          const parsed=z.strictObject({purpose:z.literal('release'),status:z.union([z.literal(403),z.literal(404)]),cleanup:z.enum(['cancelled','no_body'])}).safeParse(takeStatus(terminal));
          if(!parsed.success)throw new BoundedReadError('invalid_response');
          const draft:StatusAcceptanceDraft=Object.freeze({state:'status_accepted_closed_gate',status:parsed.data.status,cleanup_kind:parsed.data.cleanup,
            fallback:'disabled',evidence_issuance:'disabled',release_permit:'unavailable',permissions:statusPermissions});
          check();this.releaseRead=true;state='accepted_status';return draft;
        },
        revoke:()=>{state='closed';this.parent=undefined;this.#permit=undefined;this.#releaseSnapshot=undefined;this.#releasePort=undefined;this.#decision=undefined;},
      }));
    }
  }
  /** No raw registration. A copied/proxy/foreign source cannot satisfy the private-field check. */
  static releasePortFor(source:unknown,session:BoundedReadSession,permit:object):ReviewSourceReleasePort|undefined{
    if(!source||typeof source!=='object'||!(#session in source)||source.#session!==session||source.#permit!==permit)return undefined;
    return source.#releasePort;
  }
  reviewReleaseStatus(permit:ReleasePermit){return this.#session.reviewReleaseSourceStatus(this,permit);}
  get startedAt() { return this.#session.startedAt; }
  get authMode() { return this.#session.authMode; }
  get instanceBinding() { return this.#session.releasePolicy.instanceBinding; }
  stats() { return this.#session.stats(); }
  #requirePermit(permit: ReleasePermit) {
    this.#session.assertActive();
    if (!this.#permit || permit !== this.#permit) throw new BoundedReadError('release_not_admitted');
    this.#session.reviewReleaseSourceStatus(this,permit);
  }
  private path(table: string, fields: string, query?: string, limit?: number, sysId?: string) {
    const params = new URLSearchParams({ sysparm_fields: fields, sysparm_display_value: 'false', sysparm_exclude_reference_link: 'true' });
    if (query) params.set('sysparm_query', query);
    if (limit !== undefined) params.set('sysparm_limit', String(limit));
    return `/api/now/table/${table}${sysId ? '/' + sysId : ''}?${params}`;
  }
  private async rows(path: string, max: number, final = false): Promise<unknown[]> {
    const value = await this.#session.get(path, final);
    if (!value || typeof value !== 'object' || !('result' in value) || !Array.isArray(value.result)
      || value.result.length > max) throw new BoundedReadError('invalid_response');
    return value.result;
  }
  private async fetchParent(final = false) {
    const value = await this.#session.get(this.path('sys_update_set', parentFields, undefined, undefined, this.input.update_set_sys_id), final);
    const parsed = parentSchema.safeParse(value && typeof value === 'object' && 'result' in value ? value.result : null);
    if (!parsed.success || parsed.data.sys_id !== this.input.update_set_sys_id) throw new BoundedReadError('invalid_response');
    return parsed.data;
  }
  async readParent() {
    if (this.parent || this.finalStarted) throw new BoundedReadError('invalid_input');
    const parent = await this.fetchParent();
    this.parent = structuredClone(parent);
    return parent;
  }
  async #readReleaseRows() {
    if (!this.parent || this.releaseRead || this.finalStarted) throw new BoundedReadError('invalid_input');
    this.releaseRead = true;
    const rows = await this.rows(this.path('sys_cluster_state', 'build_name', undefined, 21), 21);
    // Never retain unexpected internal addresses/certificates, even if a server ignores fields.
    return this.#projectReleaseRows(rows);
  }
  #projectReleaseRows(rows:unknown[]){
    return rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new BoundedReadError('invalid_response');
      const value = 'build_name' in row ? row.build_name : null;
      if (value !== null && (typeof value !== 'string' || value.length > 40)) throw new BoundedReadError('invalid_response');
      return { build_name: value };
    });
  }
  /** No release/family/matched arguments: evidence is collected by this exact pinned source. */
  async resolveRelease(): Promise<ReleaseDecision> {
    this.#session.assertActive();
    if (!this.parent || this.finalStarted) throw new BoundedReadError('invalid_input');
    this.#decision ??= this.#observeRelease();
    return this.#decision;
  }
  async #observeRelease(readRows=()=>this.#readReleaseRows(),guard=()=>this.#session.assertActive()): Promise<ReleaseDecision> {
    const unknown = (reason: Extract<ReleaseEvidence, { source: 'none' }>['reason']): ReleaseDecision => Object.freeze<ReleaseDecision>({
      release_match: 'unknown', instance_release: { source: 'none', resolution_status: 'unknown', family: null,
        visibility_scope: 'unavailable', reason }, limitations: Object.freeze([reason, 'release_unknown']),
    });
    const policy = this.#session.releasePolicy;
    if (policy.issue === 'config_binding_mismatch') return unknown(policy.issue);
    const fallback = (): ReleaseDecision => {
      if (policy.issue) return unknown(policy.issue);
      if (!policy.assertion) return unknown('observation_unavailable');
      return this.#completeRelease(policy.assertion, ['release_operator_asserted', 'release_not_observed',
        'release_config_may_be_stale', 'release_observation_unavailable']);
    };
    let rows: { build_name: string | null }[];
    try { rows = await readRows(); }
    catch (error) {
      if (error instanceof BoundedReadError) {
        if (['access_denied', 'not_found_or_not_visible', 'upstream_unavailable'].includes(error.code)) return fallback();
        if (error.code === 'invalid_response') return unknown('observation_incomplete');
      }
      throw error;
    }
    guard();
    if (rows.length > 20) return unknown('observation_limit');
    if (!rows.length || rows.every(row => !row.build_name?.trim())) return fallback();
    if (rows.some(row => !row.build_name?.trim())) return unknown('observation_incomplete');
    const known = releaseEvidenceStructure.options[1].shape.family.options;
    const values = rows.map(row => known.find(f => f.toLowerCase() === row.build_name!.trim().toLowerCase()));
    if (values.some(f => f === undefined)) return unknown('observation_inconsistent');
    const families = [...new Set(values.filter(f => f !== undefined))];
    if (families.length > 1) return Object.freeze<ReleaseDecision>({ release_match: 'unknown', instance_release: {
      source: 'conflict', resolution_status: 'unknown', family: null, visibility_scope: 'caller_acl',
      observed_families: families, configured_family: policy.assertion?.family ?? null, observed_at: new Date().toISOString(),
    }, limitations: Object.freeze(['release_evidence_conflict', 'release_unknown']) });
    if (policy.assertion && policy.assertion.family !== families[0]) return Object.freeze<ReleaseDecision>({
      release_match: 'unknown', instance_release: { source: 'conflict', resolution_status: 'unknown', family: null,
        visibility_scope: 'caller_acl', observed_families: families, configured_family: policy.assertion.family,
        observed_at: new Date().toISOString() }, limitations: Object.freeze(['release_evidence_conflict', 'release_unknown']),
    });
    const evidence: ReleaseEvidence = { source: 'sys_cluster_state.build_name', resolution_status: 'resolved',
      family: families[0], raw_buildname: rows[0].build_name!.trim(), visibility_scope: 'caller_acl', observed_at: new Date().toISOString() };
    return this.#completeRelease(evidence, ['release_visible_nodes_only', ...(policy.issue ? [policy.issue] : [])]);
  }
  #completeRelease(evidence: ReleaseEvidence, limitations: string[]): ReleaseDecision {
    const match = releaseMatchForEvidence(evidence);
    if (match !== 'matched') return Object.freeze({ release_match: match, instance_release: evidence,
      limitations: Object.freeze([...limitations, match === 'unknown' ? 'release_unknown' : 'release_mismatch']) });
    this.#permit = Object.freeze(Object.create(null)) as ReleasePermit;
    const permit=this.#permit;
    const snapshot:ReviewSourceReleaseSnapshot=Object.freeze({instance_release:Object.freeze(structuredClone(evidence)),limitations:Object.freeze([...limitations])});
    this.#releaseSnapshot=snapshot;
    this.#releasePort=Object.freeze({matches:()=>this.#permit===permit&&this.#releaseSnapshot===snapshot,
      copyRelease:()=>Object.freeze({instance_release:Object.freeze(structuredClone(snapshot.instance_release)),limitations:Object.freeze([...snapshot.limitations])})});
    this.#session.bindReviewReleaseSource(this,permit);
    return Object.freeze({ release_match: 'matched', instance_release: evidence,
      limitations: Object.freeze(limitations), permit: this.#permit });
  }
  async #fetchMetadata(final = false) {
    if (!this.parent) throw new BoundedReadError('invalid_input');
    const policy = this.input.selection_mode === 'review_targets'
      ? candidatePolicy(this.input.requested_rule_ids ?? ['AU-BR-001', 'AU-BR-002', 'AU-CL-004']) : undefined;
    let path = this.path('sys_update_xml', metadataFields,
      `update_set=${this.input.update_set_sys_id}${policy?.query ?? ''}^ORDERBYsys_id`, this.input.max_records + 1);
    if (policy) path += '&sysparm_offset=0&sysparm_no_count=true';
    const rows = await this.rows(path, this.input.max_records + 1, final);
    const parsed = z.array(metadataSchema).safeParse(rows);
    if (parsed.success && policy && parsed.data.some(row => row.update_set !== this.input.update_set_sys_id || !policy.accepts(row))) {
      throw new BoundedReadError('candidate_filter_violation');
    }
    if (!parsed.success || parsed.data.some(row => row.update_set !== this.input.update_set_sys_id)
      || new Set(parsed.data.map(row => row.sys_id)).size !== rows.length
      || parsed.data.some((row, i) => i > 0 && row.sys_id <= parsed.data[i - 1].sys_id)) throw new BoundedReadError('invalid_response');
    return parsed.data;
  }
  async listMetadata(permit: ReleasePermit) {
    this.#requirePermit(permit);
    if (this.metadata || this.finalStarted) throw new BoundedReadError('invalid_input');
    const rows = await this.#fetchMetadata();
    this.metadata = structuredClone(rows);
    return { rows: rows.slice(0, this.input.max_records), metadata_seen: rows.length, truncated: rows.length > this.input.max_records };
  }
  async readPayload(sysId: string, permit: ReleasePermit) {
    this.#requirePermit(permit);
    if (!id.safeParse(sysId).success || !this.metadata || this.finalStarted || this.attempted.has(sysId)) throw new BoundedReadError('invalid_input');
    const original = this.metadata.slice(0, this.input.max_records).find(row => row.sys_id === sysId);
    if (!original) throw new BoundedReadError('invalid_input');
    this.attempted.add(sysId);
    const fields = 'sys_id,update_set,name,action,sys_updated_on,sys_mod_count,payload';
    const rows = await this.rows(this.path('sys_update_xml', fields,
      `sys_id=${sysId}^update_set=${this.input.update_set_sys_id}`, 1), 1);
    if (rows.length !== 1) throw new BoundedReadError('not_found_or_not_visible');
    const raw = rows[0];
    if (raw && typeof raw === 'object' && 'payload' in raw && typeof raw.payload === 'string') this.#session.chargePayload(raw.payload);
    const parsed = metadataSchema.omit({ type: true }).extend({ payload: z.string() }).safeParse(rows[0]);
    if (!parsed.success) throw new BoundedReadError('invalid_response');
    for (const key of ['sys_id', 'update_set', 'name', 'action', 'sys_updated_on', 'sys_mod_count'] as const) {
      if (original[key] !== parsed.data[key]) throw new BoundedReadError('changed_during_review');
    }
    return parsed.data;
  }
  async verify(permit: ReleasePermit) {
    this.#requirePermit(permit);
    if (!this.parent || !this.metadata || this.finalStarted) throw new BoundedReadError('invalid_input');
    this.finalStarted = true;
    const parent = await this.fetchParent(true);
    const observed = await this.#fetchMetadata(true);
    return { consistency: JSON.stringify(parent) === JSON.stringify(this.parent)
      && JSON.stringify(observed) === JSON.stringify(this.metadata) ? 'stable_observation' as const : 'changed' as const };
  }
}

/** The callback's source is internal: payload must never be forwarded as an MCP response. */
export async function withBoundedUpdateSetSource<T>(client: ServiceNowClient, input: unknown,
  work: (source: BoundedUpdateSetSource) => Promise<T>, options?: BoundedReadOptions): Promise<T> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new BoundedReadError('invalid_input');
  const session = client.createBoundedReadSession(options);
  return session.run(() => work(new BoundedUpdateSetSource(session, parsed.data)));
}
