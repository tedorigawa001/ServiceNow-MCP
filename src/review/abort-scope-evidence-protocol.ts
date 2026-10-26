/** Development-only strict BR-006 wire contracts. No transport or production issuer. */
import { z } from 'zod';
import { assetOutcomeStructure } from './aggregate-schema.js';
import { SCOPE_EVIDENCE_LIMITATIONS } from './abort-scope-evidence.js';

export const SCOPE_PROTOCOL = 'br006-worker-0.1' as const;
const id = z.string().regex(/^[a-f0-9]{32}$/), hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const job = z.number().int().min(1).max(100), table = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/);
const date = z.iso.datetime(), mod = z.string().regex(/^\d{1,20}$/);
const target = z.strictObject({ update_set_sys_id: id, update_xml_sys_id: id, asset_sys_id: id });
const position = z.strictObject({ line: z.number().int().min(1).max(1000000), column: z.number().int().min(0).max(2097152) });
const site = z.strictObject({ site_id: job, start: position, end: position }).refine(x =>
  x.start.line < x.end.line || x.start.line === x.end.line && x.start.column <= x.end.column);
const plan = z.discriminatedUnion('state', [
  z.strictObject({ target, payload_hash: hash, code_hash: hash, state: z.literal('needs_observation'),
    plan_id: z.literal(1), collection: table.refine(x => x !== 'global'), sites: z.array(site).min(1).max(100)
      .refine(xs => new Set(xs.map(x => x.site_id)).size === xs.length) }),
  z.strictObject({ target, payload_hash: hash, code_hash: hash, state: z.literal('not_needed'),
    reason: z.enum(['no_target_call', 'unsupported_when', 'receiver_unresolved', 'argument_unresolved', 'declared_table_unknown']) }),
]);
const unavailable = z.enum(['not_collected', 'not_found_or_not_visible', 'field_unavailable', 'invalid_observation',
  'ambiguous_table', 'upstream_unavailable', 'evidence_limit', 'final_recheck_unavailable']);
const observationHeader = { source: z.literal('sys_db_object.current'), visibility_scope: z.literal('caller_acl'),
  phase: z.enum(['initial', 'final']), observed_at: date };
const observation = z.discriminatedUnion('state', [
  z.strictObject({ ...observationHeader, state: z.literal('rows'), rows: z.array(z.strictObject({
    sys_id: id, name: table, sys_scope: z.union([z.literal('global'), id]).nullable(),
    sys_updated_on: z.string().min(1).max(40), sys_mod_count: mod })).max(2) }),
  z.strictObject({ ...observationHeader, state: z.literal('unavailable'), reason: unavailable }),
]);
const comparison = z.strictObject({ status: z.enum(['compared', 'insufficient', 'changed']),
  comparison: z.enum(['same_literal', 'same_reference', 'different_reference', 'unknown']),
  temporal_relation: z.literal('payload_vs_current_declared_table'),
  reason: z.enum(['declared_table_unknown', 'global_table_target_unknown', 'initial_evidence_unavailable',
    'final_evidence_unavailable', 'table_changed', 'scope_missing_or_invalid', 'global_alias_unproven']).nullable(),
  evidence_phase: z.enum(['initial', 'final']).nullable(), unavailable_reason: unavailable.nullable(),
  limitations: z.array(z.enum(SCOPE_EVIDENCE_LIMITATIONS)).length(8).refine(xs => new Set(xs).size === 8),
}).refine(x => {
  if (x.status === 'compared') return x.comparison !== 'unknown' && x.reason === null
    && x.evidence_phase === null && x.unavailable_reason === null;
  if (x.status === 'changed') return x.comparison === 'unknown' && x.reason === 'table_changed'
    && x.evidence_phase === null && x.unavailable_reason === null;
  if (x.comparison !== 'unknown' || x.reason === null || x.reason === 'table_changed') return false;
  if (x.reason === 'initial_evidence_unavailable' || x.reason === 'final_evidence_unavailable')
    return x.evidence_phase === (x.reason === 'initial_evidence_unavailable' ? 'initial' : 'final') && x.unavailable_reason !== null;
  return x.evidence_phase === null && x.unavailable_reason === null;
});
export const scopeAssetRejectionSchema = assetOutcomeStructure.options[3].shape.reason;
const workerCode = z.enum([...scopeAssetRejectionSchema.options, 'evidence_invalid', 'evidence_missing',
  'evidence_binding_mismatch', 'invalid_phase_order', 'invalid_state', 'invalid_evidence',
  'invalid_observation_time', 'table_binding_mismatch', 'comparison_deadline_exceeded', 'internal_review_error']);
export const scopeDiagnosticCodeSchema = z.enum([...workerCode.options, 'protocol_invalid', 'worker_unavailable',
  'worker_exited', 'authentication_failed', 'access_denied', 'deadline_exceeded', 'cancelled',
  'request_budget_exceeded', 'receive_budget_exceeded', 'payload_budget_exceeded', 'scope_evidence_limit', 'upstream_unavailable', 'phase_deadline_exceeded']);
export const scopeDiagnosticStageSchema = z.enum(['owner', 'prepare', 'initial', 'final', 'compare', 'protocol', 'output']);
export const scopeDiagnosticSchema = z.strictObject({ state: z.literal('stopped'), stage: scopeDiagnosticStageSchema,
  code: scopeDiagnosticCodeSchema, cleanup: z.enum(['not_started', 'confirmed', 'unconfirmed']) });

const base = { protocol: z.literal(SCOPE_PROTOCOL), run_nonce: hash, worker_generation: hash, request_id: integer };
const binding = { plan_id: z.literal(1), payload_hash: hash, code_hash: hash };
export const scopeRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, job_id: z.null(), kind: z.literal('hello'), body: z.strictObject({}) }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('prepare'), body: z.strictObject({ target,
    metadata: z.strictObject({ name: z.string().min(1).max(200), action: z.literal('INSERT_OR_UPDATE'),
      sys_updated_on: z.string().min(1).max(40), sys_mod_count: mod }), instance_binding: hash,
    payload: z.string().max(2097152).refine(x => Buffer.byteLength(x) <= 2097152),
    retrieved_at: date, started_at: date, deadline_ms: z.number().int().min(1).max(60000) }) }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('observe_initial'), body: z.strictObject({ ...binding, observation }) }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('observe_final'), body: z.strictObject({ ...binding, observation }) }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('compare'), body: z.strictObject({ ...binding, compared_at: date }) }),
]);
export const scopeResponseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, job_id: z.null(), kind: z.literal('hello_ok'), body: z.strictObject({ accepted: z.literal(true) }) }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('prepare_ok'), body: plan }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('observe_initial_ok'), body: z.strictObject({ plan_id: z.literal(1), phase: z.literal('initial'), accepted: z.literal(true) }) }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('observe_final_ok'), body: z.strictObject({ plan_id: z.literal(1), phase: z.literal('final'), accepted: z.literal(true) }) }),
  z.strictObject({ ...base, job_id: job, kind: z.literal('compare_ok'), body: z.strictObject({ ...binding, result: comparison }) }),
  z.strictObject({ ...base, job_id: job.nullable(), kind: z.literal('error'), body: z.strictObject({
    stage: z.enum(['protocol', 'prepare', 'initial', 'final', 'compare']), code: workerCode }) }),
]);
export type ScopeRequest = z.infer<typeof scopeRequestSchema>;
export type ScopeResponse = z.infer<typeof scopeResponseSchema>;
export type ScopeDiagnostic = Readonly<z.infer<typeof scopeDiagnosticSchema>>;
export const SCOPE_WIRE_LIMITS = Object.freeze({ small: 4096, prepareRequest: 12 * 1048576 + 65536,
  response: 65536, observation: 16384, planTotal: 262144 });
export function scopeWireLimit(kind: ScopeRequest['kind'] | ScopeResponse['kind']) {
  return kind === 'prepare' ? SCOPE_WIRE_LIMITS.prepareRequest : kind === 'prepare_ok' || kind === 'compare_ok'
    ? SCOPE_WIRE_LIMITS.response : kind === 'observe_initial' || kind === 'observe_final'
      ? SCOPE_WIRE_LIMITS.observation : SCOPE_WIRE_LIMITS.small;
}
