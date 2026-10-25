/** Internal BR-006 building block. No I/O, issuer authority, clock, rule evaluation or MCP wiring. */
import { z } from 'zod';

const id = z.string().regex(/^[a-f0-9]{32}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const tableName = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
const contextSchema = z.strictObject({ instance_binding: hash, update_set_sys_id: id,
  update_xml_sys_id: id, asset_sys_id: id, payload_hash: hash, code_hash: hash,
  started_at: z.iso.datetime(), deadline_ms: z.number().int().min(1).max(60000) });
const payloadSchema = z.strictObject({ source: z.literal('sys_update_xml.payload'),
  target_version: z.literal('update_set_payload'), asset_table: z.literal('sys_script'),
  asset_sys_id: id, payload_hash: hash, code_hash: hash, retrieved_at: z.iso.datetime(),
  collection: z.unknown().optional(), sys_scope: z.unknown().optional() });
const rowSchema = z.strictObject({ sys_id: id, name: tableName, sys_scope: z.unknown().optional(),
  sys_updated_on: z.string().min(1).max(40), sys_mod_count: z.string().regex(/^\d{1,20}$/) });
const unavailableReason = z.enum(['not_collected', 'not_found_or_not_visible', 'field_unavailable',
  'invalid_observation', 'ambiguous_table', 'upstream_unavailable', 'evidence_limit', 'final_recheck_unavailable']);
type UnavailableReason = z.infer<typeof unavailableReason>;
const headerSchema = z.strictObject({ source: z.literal('sys_db_object.current'),
  visibility_scope: z.literal('caller_acl'), phase: z.enum(['initial', 'final']), observed_at: z.iso.datetime() });
const observationSchema = z.discriminatedUnion('state', [headerSchema.extend({ state: z.literal('rows'), rows: z.unknown() }),
  headerSchema.extend({ state: z.literal('unavailable'), reason: unavailableReason })]);

export type ScopeToken = Readonly<{kind:'global_literal'} | {kind:'scope_record_id'; value:string}
  | {kind:'unknown'; reason:'missing_scope'|'invalid_scope'}>;
/** Syntax only. Never trims/coerces/looks up a Global alias or retains an invalid value. */
export function normalizeScopeToken(raw: unknown): ScopeToken {
  if (raw === 'global') return Object.freeze({kind:'global_literal'});
  if (typeof raw === 'string' && /^[a-f0-9]{32}$/.test(raw)) return Object.freeze({kind:'scope_record_id',value:raw});
  return Object.freeze({kind:'unknown',reason:raw === undefined || raw === null || raw === '' ? 'missing_scope' : 'invalid_scope'});
}

declare const contextBrand: unique symbol;
declare const payloadBrand: unique symbol;
declare const observationBrand: unique symbol;
export type ScopeEvidenceContext = {readonly [contextBrand]:true};
export type PayloadScopeEvidence = {readonly [payloadBrand]:true};
export type TableScopeObservation = {readonly [observationBrand]:true};
type FactoryFailure = 'invalid_context'|'invalid_payload_evidence'|'invalid_observation'|'evidence_binding_mismatch';
type Created<T> = Readonly<{ok:true; value:T} | {ok:false; reason:FactoryFailure}>;
type PayloadData = Readonly<{context:ScopeEvidenceContext; retrievedAt:number; collection:string|null; scope:ScopeToken}>;
type RecordData = Readonly<{id:string; name:string; scope:ScopeToken; updated:string; modCount:string}>;
type ObservationData = Readonly<{context:ScopeEvidenceContext; phase:'initial'|'final'; observedAt:number} &
  ({state:'record'; record:RecordData} | {state:'unavailable'; reason:UnavailableReason})>;
const contexts = new WeakMap<ScopeEvidenceContext, Readonly<z.infer<typeof contextSchema>>>();
const payloads = new WeakMap<PayloadScopeEvidence, PayloadData>();
const observations = new WeakMap<TableScopeObservation, ObservationData>();
const handle = <T extends object>() => Object.freeze(Object.create(null)) as T;
const failure = (reason:FactoryFailure):Created<never> => Object.freeze({ok:false,reason});
const created = <T>(value:T):Created<T> => Object.freeze({ok:true,value});

/** Creates a fresh identity, not proof of the run/auth/source provenance supplied by a future owner. */
export function createScopeEvidenceContext(raw:unknown):Created<ScopeEvidenceContext> {
  const parsed=contextSchema.safeParse(raw);
  if(!parsed.success)return failure('invalid_context');
  const value=handle<ScopeEvidenceContext>(); contexts.set(value,Object.freeze(parsed.data));
  return created(value);
}
export function createPayloadScopeEvidence(context:ScopeEvidenceContext, raw:unknown):Created<PayloadScopeEvidence> {
  const binding=contexts.get(context);
  if(!binding)return failure('invalid_context');
  const parsed=payloadSchema.safeParse(raw);
  if(!parsed.success)return failure('invalid_payload_evidence');
  const p=parsed.data;
  if(p.asset_sys_id!==binding.asset_sys_id || p.payload_hash!==binding.payload_hash || p.code_hash!==binding.code_hash)
    return failure('evidence_binding_mismatch');
  const collection=tableName.safeParse(p.collection);
  const value=handle<PayloadScopeEvidence>();
  payloads.set(value,Object.freeze({context,retrievedAt:Date.parse(p.retrieved_at),
    collection:collection.success?collection.data:null,scope:normalizeScopeToken(p.sys_scope)}));
  return created(value);
}
export function createTableScopeObservation(context:ScopeEvidenceContext, raw:unknown):Created<TableScopeObservation> {
  if(!contexts.has(context))return failure('invalid_context');
  const parsed=observationSchema.safeParse(raw);
  if(!parsed.success)return failure('invalid_observation');
  const p=parsed.data;
  let state:{state:'record';record:RecordData}|{state:'unavailable';reason:UnavailableReason};
  if(p.state==='unavailable')state={state:'unavailable',reason:p.reason};
  else if(!Array.isArray(p.rows) || p.rows.length>2)state={state:'unavailable',reason:'invalid_observation'};
  else if(p.rows.length===0)state={state:'unavailable',reason:'not_found_or_not_visible'};
  else if(p.rows.length===2)state={state:'unavailable',reason:'ambiguous_table'};
  else {
    const row=p.rows[0];
    if(!row || typeof row!=='object' || Array.isArray(row))state={state:'unavailable',reason:'invalid_observation'};
    else if(['sys_id','name','sys_updated_on','sys_mod_count'].some(key=>!Object.hasOwn(row,key)))
      state={state:'unavailable',reason:'field_unavailable'};
    else {
      const record=rowSchema.safeParse(row);
      state=record.success?{state:'record',record:Object.freeze({id:record.data.sys_id,name:record.data.name,
        scope:normalizeScopeToken(record.data.sys_scope),updated:record.data.sys_updated_on,modCount:record.data.sys_mod_count})}
        :{state:'unavailable',reason:'invalid_observation'};
    }
  }
  const value=handle<TableScopeObservation>();
  observations.set(value,Object.freeze({context,phase:p.phase,observedAt:Date.parse(p.observed_at),...state}));
  return created(value);
}

export const SCOPE_EVIDENCE_LIMITATIONS = Object.freeze(['source_approval_pending', 'payload_vs_current_declared_table',
  'payload_time_scope_not_reconstructed', 'runtime_table_not_verified', 'execution_path_not_verified',
  'abort_effect_not_verified', 'observation_not_atomic', 'caller_acl_visible_only'] as const);
type Comparison = 'same_literal'|'same_reference'|'different_reference'|'unknown';
type Reason = 'invalid_evidence'|'evidence_binding_mismatch'|'invalid_phase_order'|'invalid_observation_time'
  | 'comparison_deadline_exceeded'|'declared_table_unknown'|'global_table_target_unknown'|'table_binding_mismatch'
  | 'initial_evidence_unavailable'|'final_evidence_unavailable'|'table_changed'|'scope_missing_or_invalid'|'global_alias_unproven';
export type ScopeEvidenceComparison = Readonly<{status:'compared'|'insufficient'|'changed'|'rejected'; comparison:Comparison;
  temporal_relation:'payload_vs_current_declared_table'; reason:Reason|null;
  evidence_phase:'initial'|'final'|null; unavailable_reason:UnavailableReason|null;
  limitations:typeof SCOPE_EVIDENCE_LIMITATIONS}>;
const result=(status:ScopeEvidenceComparison['status'], comparison:Comparison, reason:Reason|null,
  evidence_phase:ScopeEvidenceComparison['evidence_phase']=null, unavailable_reason:UnavailableReason|null=null):ScopeEvidenceComparison =>
  Object.freeze({status,comparison,reason,evidence_phase,unavailable_reason,
    temporal_relation:'payload_vs_current_declared_table',limitations:SCOPE_EVIDENCE_LIMITATIONS});
function sameToken(a:ScopeToken,b:ScopeToken) {
  return a.kind===b.kind && (a.kind==='scope_record_id' && b.kind==='scope_record_id' ? a.value===b.value
    :a.kind==='unknown' && b.kind==='unknown'?a.reason===b.reason:true);
}

/** Deterministic metadata comparison only. No one-shot claim, issuer check, I/O or runtime deadline enforcement. */
export function compareScopeEvidence(context:ScopeEvidenceContext, payload:PayloadScopeEvidence,
  initial:TableScopeObservation, final:TableScopeObservation, comparedAt:unknown):ScopeEvidenceComparison {
  const c=contexts.get(context),p=payloads.get(payload),a=observations.get(initial),b=observations.get(final);
  if(!c || !p || !a || !b)return result('rejected','unknown','invalid_evidence');
  if(p.context!==context || a.context!==context || b.context!==context)return result('rejected','unknown','evidence_binding_mismatch');
  if(a.phase!=='initial' || b.phase!=='final')return result('rejected','unknown','invalid_phase_order');
  const time=z.iso.datetime().safeParse(comparedAt);
  if(!time.success)return result('rejected','unknown','invalid_observation_time');
  const start=Date.parse(c.started_at),end=Date.parse(time.data);
  // Initial table evidence may predate another payload in this same run's shared table cache.
  if(end<start || p.retrievedAt<start || a.observedAt<start || b.observedAt<a.observedAt
    || b.observedAt<p.retrievedAt || end<b.observedAt)return result('rejected','unknown','invalid_observation_time');
  if(end-start>=c.deadline_ms)return result('rejected','unknown','comparison_deadline_exceeded');
  if(!p.collection)return result('insufficient','unknown','declared_table_unknown');
  if(p.collection==='global')return result('insufficient','unknown','global_table_target_unknown');
  // Reject any available record with the wrong name even if its peer is unavailable.
  if(a.state==='record' && a.record.name!==p.collection || b.state==='record' && b.record.name!==p.collection)
    return result('rejected','unknown','table_binding_mismatch');
  if(a.state==='unavailable')return result('insufficient','unknown','initial_evidence_unavailable','initial',a.reason);
  if(b.state==='unavailable')return result('insufficient','unknown','final_evidence_unavailable','final',b.reason);
  const x=a.record,y=b.record;
  if(x.id!==y.id || x.name!==y.name || x.updated!==y.updated || x.modCount!==y.modCount || !sameToken(x.scope,y.scope))
    return result('changed','unknown','table_changed');
  if(p.scope.kind==='unknown' || x.scope.kind==='unknown')return result('insufficient','unknown','scope_missing_or_invalid');
  if(p.scope.kind==='global_literal' && x.scope.kind==='global_literal')return result('compared','same_literal',null);
  if(p.scope.kind==='scope_record_id' && x.scope.kind==='scope_record_id')
    return result('compared',p.scope.value===x.scope.value?'same_reference':'different_reference',null);
  return result('insufficient','unknown','global_alias_unproven');
}
