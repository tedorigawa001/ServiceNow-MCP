/** Synthetic pure values only. No recorder, Store, clock, issuer or runtime ledger imports. */
import { types } from 'node:util';
import { ValueCost as Cost, ValueAccountingOwner, projectLegacyValueResult, refuse, valueFailureOf } from './value-core-accounting.js';
import type { ValueLimits, ValueResult, DetailedValueResult } from './value-core-accounting.js';
export type { ValueLimits, ValueFailure, ValueWork, ValueResult, ValueWorkSnapshot, DetailedValueResult } from './value-core-accounting.js';
export { VALUE_WORK_MODEL } from './value-core-accounting.js';
export interface SnapshotShape {
  readonly cases: number; readonly modules: number; readonly events: number;
  readonly scopes: number; readonly workers: number; readonly samples: number;
}
export interface SnapshotBounds {
  readonly kind: 'non_executable_bounds'; readonly snapshot: number; readonly captured: number;
  readonly control: 500; readonly controlReserve: 3000;
}
const MAX = Number.MAX_SAFE_INTEGER;
const numberText = Number.prototype.toString;
function uint(value: unknown, max = MAX, min = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
}
function ownData(value: unknown, keys: readonly string[], spend: () => void): Record<string, unknown> {
  spend();
  if (!value || typeof value !== 'object' || types.isProxy(value)) refuse('schema');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) refuse('schema');
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length) refuse('schema');
  const out = Object.create(null) as Record<string, unknown>;
  for (let i = 0; i < keys.length; i++) {
    spend();
    if (names[i] !== keys[i]) refuse('schema');
    const d = Object.getOwnPropertyDescriptor(value, keys[i]);
    if (!d || !d.enumerable || !('value' in d)) refuse('schema');
    out[keys[i]] = d.value;
  }
  return out;
}
function readLimits(value: unknown): ValueLimits {
  const keys = ['max_scopes', 'max_workers', 'max_nodes', 'max_work', 'max_snapshot_bytes', 'max_control_bytes', 'max_file_bytes'];
  const data = ownData(value, keys, () => {});
  for (const key of keys) if (!uint(data[key], MAX, 1)) refuse('schema');
  return Object.freeze(data) as unknown as ValueLimits;
}
function shapeOf(value: unknown, c: Cost): SnapshotShape {
  const data = ownData(value, ['cases', 'modules', 'events', 'scopes', 'workers', 'samples'], () => c.spend('structural'));
  for (const key of Object.keys(data)) { c.spend('structural'); if (!uint(data[key])) refuse('schema'); }
  return data as unknown as SnapshotShape;
}
function baseBounds(s: SnapshotShape, c: Cost): SnapshotBounds {
  c.spend('relation', 8);
  if (s.cases > 20000 || s.modules > 1000 || s.events > 20000 || s.samples > 600
    || s.scopes > c.limits.max_scopes || s.workers > c.limits.max_workers) refuse('limit');
  const local = c.mul(s.scopes, 4096);
  if (s.events > local || s.workers > local) refuse('relation');
  let size = 321;
  for (const [n, width] of [[s.cases, 177], [s.modules, 218], [s.events, 227], [s.scopes, 181],
    [s.workers, 409], [s.samples, 264], [s.scopes, 51]]) size = c.add(size, c.mul(n, width));
  return Object.freeze({ kind: 'non_executable_bounds', snapshot: size, captured: c.add(size, 449), control: 500, controlReserve: 3000 });
}
function failure(error: unknown): { readonly ok: false; readonly reason: ReturnType<typeof valueFailureOf> } {
  return Object.freeze({ ok: false, reason: valueFailureOf(error) });
}
export function calculateSnapshotBounds(shape: unknown, limits: unknown): ValueResult<SnapshotBounds> {
  try {
    const c = new Cost(readLimits(limits)); c.spend('structural', 8);
    const value = baseBounds(shapeOf(shape, c), c);
    if (value.snapshot > c.limits.max_snapshot_bytes || value.captured > c.limits.max_file_bytes || value.control > c.limits.max_control_bytes) refuse('limit');
    return Object.freeze({ ok: true, value, work: c.snapshot() });
  } catch (error) { return failure(error); }
}
type Schema<T> = (v: unknown, c: Cost) => T;
type Parsed<S> = S extends Schema<infer T> ? T : never;
function record<S extends Record<string, Schema<unknown>>>(fields: S): Schema<{ readonly [K in keyof S]: Parsed<S[K]> }> {
  return (v, c) => {
    const data = ownData(v, Object.keys(fields), () => c.spend('structural'));
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(fields)) out[key] = fields[key](data[key], c);
    c.spend('copies'); return Object.freeze(out) as { readonly [K in keyof S]: Parsed<S[K]> };
  };
}
function scalar<T>(check: (v: unknown) => v is T): Schema<T> {
  return (v, c) => {
    c.spend('structural'); if (!check(v)) refuse('schema');
    if (typeof v === 'number') {
      c.spend('number_formatting'); const token = numberText.call(v);
      c.spend('number_formatting', token.length);
      if (token.length > 32 || Number(token) !== v) refuse('schema');
    }
    c.spend('copies'); return v;
  };
}
function one<const T extends readonly (string | number | boolean | null)[]>(...values: T): Schema<T[number]> {
  return scalar((v): v is T[number] => values.some(x => Object.is(v, x)));
}
const integer = (max = MAX, min = 0) => scalar((v): v is number => uint(v, max, min));
const time = scalar((v): v is number => typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0) && v >= 0 && v <= MAX);
const hex = scalar((v): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v));
const bool = one(true, false), positive = integer(MAX, 1), caseId = integer(20000, 1), moduleId = integer(1000, 1);
function nullable<T>(schema: Schema<T>): Schema<T | null> { return (v, c) => v === null ? one(null)(v, c) : schema(v, c); }
function list<T>(schema: Schema<T>, cap: number | ((c: Cost) => number)): Schema<readonly T[]> {
  return (v, c) => {
    c.spend('structural');
    if (!v || typeof v !== 'object' || types.isProxy(v) || !Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) refuse('schema');
    const len = Object.getOwnPropertyDescriptor(v, 'length')?.value as unknown;
    if (!uint(len)) refuse('schema');
    if (len > (typeof cap === 'number' ? cap : cap(c))) refuse('limit');
    if (Reflect.ownKeys(v).length !== len + 1) refuse('schema');
    const out: T[] = [];
    for (let i = 0; i < len; i++) {
      c.spend('structural'); const d = Object.getOwnPropertyDescriptor(v, String(i));
      if (!d || !d.enumerable || !('value' in d)) refuse('schema');
      out.push(schema(d.value, c));
    }
    c.spend('copies'); return Object.freeze(out);
  };
}
function peek(v: unknown, key: string, c: Cost): unknown {
  c.spend('structural');
  if (!v || typeof v !== 'object' || types.isProxy(v)) refuse('schema');
  const d = Object.getOwnPropertyDescriptor(v, key);
  if (!d || !d.enumerable || !('value' in d)) refuse('schema');
  return d.value;
}
const caseStates = ['discovered', 'running', 'passed', 'failed', 'skipped', 'todo', 'not_run', 'unknown'] as const;
const failureClass = one('none', 'assertion', 'module', 'hook', 'unhandled', 'collector', 'not_observed');
const counts = record({ discovered: integer(20000), running: integer(20000), passed: integer(20000), failed: integer(20000),
  skipped: integer(20000), todo: integer(20000), not_run: integer(20000), unknown: integer(20000) });
const moduleRow = record({ module_ordinal: moduleId, state: one('discovered', 'running', 'completed', 'failed', 'not_run', 'unknown'), failure_class: failureClass, case_counts: counts });
const caseRow = record({ case_ordinal: caseId, module_ordinal: moduleId, state: one(...caseStates), duration_ms: nullable(time), failure_class: failureClass, scope_coverage: one('observed', 'outside_scope', 'unknown') });
const scopeRow = record({ scope_ordinal: positive, case_ordinal: caseId, origin_ms: time, log_count: integer(4096), log_limit: one(4096), active: bool, incomplete_reason: one('none', 'capacity', 'clock', 'observer') });
const eventRow = record({ scope_ordinal: positive, seq: integer(4096, 1), at_ms: time, review: integer(4096), worker: integer(4096), request: integer(4096),
  event: one('review_start', 'review_end', 'factory_start', 'factory_return', 'factory_throw', 'ready_observed', 'reply_observed', 'post_try', 'post_return', 'post_throw', 'terminate_try', 'terminate_settle', 'terminate_throw', 'worker_exit', 'close_start', 'close_end'),
  phase: one('none', 'review', 'ready', 'analyze', 'finish', 'cleanup'), detail: one('none', 'matched', 'duplicate', 'unmatched', 'fulfilled', 'rejected'),
  code: one('none', 'other_fixed_code', 'invalid_input', 'access_denied', 'authentication_failed', 'cancelled', 'deadline_exceeded', 'worker_unavailable', 'internal_review_error', 'review_busy', 'metadata_unavailable') });
const workerRow = record({ scope_ordinal: positive, worker_ordinal: nullable(integer(4096, 1)), created_ms: time, ready_ms: nullable(time), analyze_started_ms: nullable(time), finish_started_ms: nullable(time), last_reply_ms: nullable(time), terminate_ms: nullable(time), exit_ms: nullable(time), exited: bool });
function metric<T>(value: Schema<T>): Schema<{ readonly status: 'observed'; readonly value: T } | { readonly status: 'unavailable' | 'not_supported'; readonly value: null }> {
  return (v, c) => peek(v, 'status', c) === 'observed'
    ? record({ status: one('observed'), value })(v, c)
    : record({ status: one('unavailable', 'not_supported'), value: one(null) })(v, c);
}
const sampleRow = record({ at_ms: time, scope: one('root', 'owned_tree'), cpu_ms: metric(time), rss_bytes: metric(integer()), owned_process_count: metric(integer()) });
const snapshot = record({ version: one('wfb-observation-snapshot-1'), generation: positive,
  cutoff: record({ source_event_ordinal: integer(), scope_tails: list(record({ scope_ordinal: positive, last_seq: integer(4096) }), c => c.limits.max_scopes), sample_count: integer(600) }),
  coverage: record({ prefix: one('complete', 'incomplete'), run: one('complete', 'incomplete'), first_reason: one('none', 'source_unavailable', 'inventory_unknown', 'missing_case', 'missing_module', 'missing_scope', 'event_gap', 'capacity', 'clock', 'observer', 'protocol', 'secret') }),
  modules: list(moduleRow, 1000), cases: list(caseRow, 20000), scopes: list(scopeRow, c => c.limits.max_scopes), events: list(eventRow, 20000), workers: list(workerRow, c => c.limits.max_workers), samples: list(sampleRow, 600) });
export type ModuleValue = Parsed<typeof moduleRow>;
export type CaseValue = Parsed<typeof caseRow>;
export type ScopeValue = Parsed<typeof scopeRow>;
export type EventValue = Parsed<typeof eventRow>;
export type WorkerValue = Parsed<typeof workerRow>;
export type SampleValue = Parsed<typeof sampleRow>;
export type SnapshotValue = Parsed<typeof snapshot>;
const detailSchemas = {
  conditions_ready: record({ conditions_digest: hex, approval_revision: positive, gates: record({ offline_checked: one(true), approval_bound: one(true), scope_locked: one(true) }) }),
  child_started: record({ lease_ordinal: positive, startup: one('started', 'ready_wait') }),
  first_anomaly: record({ kind: one('case', 'module', 'hook', 'unhandled', 'collector'), case_ordinal: nullable(caseId), module_ordinal: nullable(moduleId), scope_ordinal: nullable(positive), reason: one('case_failure', 'module_failure', 'hook_failure', 'unhandled_error', 'collector_failure') }),
  slow_hint: record({ threshold_ms: one(120000), elapsed_ms: time }),
  test_terminal: record({ test_result: one('passed', 'failed', 'incomplete'), measurement: one('complete', 'incomplete') }),
  stop_requested: record({ cause: one('cancelled', 'outer_deadline', 'collector_failure'), stop_reason: one('cancelled', 'deadline', 'window', 'state', 'binding', 'clock', 'checkpoint', 'recorder'), cleanup_state: one('not_requested', 'requested', 'unconfirmed') }),
};
type Trigger = keyof typeof detailSchemas;
type Common<K extends Trigger> = { readonly version: 'wfb-checkpoint-2'; readonly sequence: number; readonly trigger: K; readonly at: number;
  readonly binding: { readonly source_digest: string; readonly inventory_digest: string }; readonly detail: Parsed<(typeof detailSchemas)[K]> };
type BodyTrigger = Exclude<Trigger, 'conditions_ready' | 'child_started'>;
export type SnapshotReason = 'observation_not_started' | 'source_unavailable' | 'snapshot_binding' | 'snapshot_invalid' | 'snapshot_limit' | 'snapshot_encoding' | 'snapshot_secret' | 'snapshot_cancelled' | 'snapshot_deadline';
export type CheckpointValue = { [K in Trigger]: K extends BodyTrigger
  ? Common<K> & ({ readonly snapshot_status: 'captured'; readonly snapshot: SnapshotValue } | { readonly snapshot_status: 'unavailable'; readonly snapshot: null; readonly snapshot_reason: SnapshotReason })
  : Common<K> }[Trigger];
export interface ValidatedValue { readonly kind: 'non_executable_value'; readonly value: CheckpointValue;
  readonly shape: SnapshotShape; readonly upper: { readonly snapshot: number | null; readonly encoded: number; readonly control: 500; readonly controlReserve: 3000 } }
function parseFrame(v: unknown, c: Cost): CheckpointValue {
  const trigger = one('conditions_ready', 'child_started', 'first_anomaly', 'slow_hint', 'test_terminal', 'stop_requested')(peek(v, 'trigger', c), c);
  const common = { version: one('wfb-checkpoint-2'), sequence: integer(6, 1), trigger: one(trigger), at: integer(), binding: record({ source_digest: hex, inventory_digest: hex }), detail: detailSchemas[trigger] as Schema<unknown> };
  if (trigger === 'conditions_ready' || trigger === 'child_started') return record(common)(v, c) as CheckpointValue;
  return (peek(v, 'snapshot_status', c) === 'captured'
    ? record({ ...common, snapshot_status: one('captured'), snapshot })(v, c)
    : record({ ...common, snapshot_status: one('unavailable'), snapshot: one(null), snapshot_reason: one('observation_not_started', 'source_unavailable', 'snapshot_binding', 'snapshot_invalid', 'snapshot_limit', 'snapshot_encoding', 'snapshot_secret', 'snapshot_cancelled', 'snapshot_deadline') })(v, c)) as CheckpointValue;
}
function relations(frame: CheckpointValue, c: Cost): void {
  const check = (condition: boolean) => { c.spend('relation'); if (!condition) refuse('relation'); };
  if (frame.trigger === 'slow_hint') check(frame.detail.elapsed_ms > 120000);
  if (frame.trigger === 'stop_requested') {
    const r = frame.detail.stop_reason;
    check(frame.detail.cause === (r === 'cancelled' ? 'cancelled' : r === 'deadline' || r === 'window' ? 'outer_deadline' : 'collector_failure'));
  }
  if ('snapshot_reason' in frame && frame.snapshot_reason === 'observation_not_started')
    check(frame.trigger === 'stop_requested' && frame.detail.cleanup_state === 'not_requested');
  if (frame.trigger === 'first_anomaly') {
    const d = frame.detail;
    check(d.reason === ({ case: 'case_failure', module: 'module_failure', hook: 'hook_failure', unhandled: 'unhandled_error', collector: 'collector_failure' })[d.kind]);
    check(d.scope_ordinal === null || (d.case_ordinal !== null && d.module_ordinal !== null));
    check(d.case_ordinal === null || d.module_ordinal !== null);
    if (d.kind === 'case') check(d.case_ordinal !== null && d.module_ordinal !== null);
    if (d.kind === 'module') check(d.module_ordinal !== null && d.case_ordinal === null && d.scope_ordinal === null);
    if (d.kind === 'hook') check(d.module_ordinal !== null);
  }
  if (!('snapshot_status' in frame) || frame.snapshot_status !== 'captured') return;
  const s = frame.snapshot;
  check((s.coverage.prefix === 'complete') === (s.coverage.first_reason === 'none'));
  check(s.coverage.run !== 'complete' || s.coverage.prefix === 'complete');
  check(s.coverage.run !== 'complete' || s.modules.length + s.cases.length + s.scopes.length + s.events.length + s.workers.length + s.samples.length > 0);
  function index<T>(rows: readonly T[], ordinal: (row: T) => number): Map<number, T> {
    const out = new Map<number, T>(); let previous = 0;
    for (const row of rows) { const n = ordinal(row); check(n > previous); c.spend('relation'); out.set(n, row); previous = n; }
    return out;
  }
  const modules = index(s.modules, r => r.module_ordinal), cases = index(s.cases, r => r.case_ordinal), scopes = index(s.scopes, r => r.scope_ordinal);
  const tails = index(s.cutoff.scope_tails, r => r.scope_ordinal);
  check(scopes.size === tails.size); check(s.samples.length === s.cutoff.sample_count);
  check(s.events.length <= s.cutoff.source_event_ordinal);
  if (s.cutoff.source_event_ordinal === 0) check(s.modules.length + s.cases.length + s.scopes.length + s.events.length + s.workers.length + s.samples.length === 0);
  let incomplete = false;
  const countsByModule = new Map<number, Record<CaseValue['state'], number>>(), scopesByCase = new Map<number, number>();
  const eventState = new Map<number, { seq: number; at: number }>(), workerState = new Map<number, { ordinal: number; nullSeen: boolean; count: number }>();
  for (const m of s.modules) {
    c.spend('relation'); countsByModule.set(m.module_ordinal, { discovered: 0, running: 0, passed: 0, failed: 0, skipped: 0, todo: 0, not_run: 0, unknown: 0 });
    check(m.state === 'failed' ? ['module', 'hook', 'unhandled'].includes(m.failure_class)
      : m.state === 'unknown' ? ['collector', 'not_observed'].includes(m.failure_class) : m.failure_class === 'none');
    if (m.state === 'unknown') incomplete = true;
    if (s.coverage.run === 'complete') check(['completed', 'failed', 'not_run'].includes(m.state));
  }
  for (const scope of s.scopes) {
    c.spend('relation', 3); check(cases.has(scope.case_ordinal));
    check(tails.get(scope.scope_ordinal)?.last_seq === scope.log_count);
    check(scope.active === (scope.incomplete_reason === 'none'));
    if (!scope.active) incomplete = true;
    scopesByCase.set(scope.case_ordinal, (scopesByCase.get(scope.case_ordinal) ?? 0) + 1);
  }
  for (const r of s.cases) {
    c.spend('relation', 2); const count = countsByModule.get(r.module_ordinal); check(count !== undefined);
    count![r.state]++;
    const classes = r.state === 'failed' ? ['assertion', 'module', 'hook', 'unhandled'] : r.state === 'unknown'
      ? ['collector', 'not_observed'] : r.state === 'not_run' ? ['none', 'module', 'hook', 'not_observed'] : ['none'];
    check(classes.includes(r.failure_class));
    if (r.state !== 'passed' && r.state !== 'failed') check(r.duration_ms === null);
    if (r.state === 'unknown' || r.scope_coverage === 'unknown' || ((r.state === 'passed' || r.state === 'failed') && r.duration_ms === null)) incomplete = true;
    const n = scopesByCase.get(r.case_ordinal) ?? 0;
    if (r.scope_coverage === 'observed') check(n > 0);
    if (r.scope_coverage === 'outside_scope') check(n === 0);
    if (s.coverage.run === 'complete') check(!['discovered', 'running', 'unknown'].includes(r.state));
  }
  for (const m of s.modules) for (const state of caseStates) {
    c.spend('relation'); check(m.case_counts[state] === countsByModule.get(m.module_ordinal)![state]);
  }
  for (const e of s.events) {
    c.spend('relation', 2); check(scopes.has(e.scope_ordinal));
    const prev = eventState.get(e.scope_ordinal) ?? { seq: 0, at: 0 };
    check(e.seq === prev.seq + 1 && e.at_ms >= prev.at);
    check(e.request === 0 || e.phase === 'analyze' || e.phase === 'finish');
    eventState.set(e.scope_ordinal, { seq: e.seq, at: e.at_ms });
  }
  for (const scope of s.scopes) { c.spend('relation'); check((eventState.get(scope.scope_ordinal)?.seq ?? 0) === scope.log_count); }
  let previousScope = 0;
  for (const w of s.workers) {
    c.spend('relation', 2); const scope = scopes.get(w.scope_ordinal); check(scope !== undefined); check(w.scope_ordinal >= previousScope); previousScope = w.scope_ordinal;
    const prev = workerState.get(w.scope_ordinal) ?? { ordinal: 0, nullSeen: false, count: 0 };
    check(prev.count < 4096);
    if (w.worker_ordinal === null) { check(!scope!.active); prev.nullSeen = true; }
    else { check(!prev.nullSeen && w.worker_ordinal > prev.ordinal); prev.ordinal = w.worker_ordinal; }
    prev.count++; workerState.set(w.scope_ordinal, prev);
    for (const t of [w.ready_ms, w.analyze_started_ms, w.finish_started_ms, w.last_reply_ms, w.terminate_ms, w.exit_ms]) check(t === null || t >= w.created_ms);
    check(w.exited === (w.exit_ms !== null));
  }
  let previousSample = 0;
  for (const p of s.samples) {
    check(p.at_ms >= previousSample); previousSample = p.at_ms;
    for (const metric of [p.cpu_ms, p.rss_bytes, p.owned_process_count]) { c.spend('relation'); if (metric.status !== 'observed') incomplete = true; }
  }
  if (incomplete) check(s.coverage.prefix === 'incomplete');
  if (frame.trigger === 'first_anomaly') {
    const d = frame.detail;
    c.spend('relation', 3);
    if (d.module_ordinal !== null) check(modules.has(d.module_ordinal));
    if (d.case_ordinal !== null) check(cases.get(d.case_ordinal)?.module_ordinal === d.module_ordinal);
    if (d.scope_ordinal !== null) check(scopes.get(d.scope_ordinal)?.case_ordinal === d.case_ordinal);
  }
  if (frame.trigger === 'test_terminal' && frame.detail.test_result === 'passed') {
    for (const row of s.cases) check(row.state !== 'failed' && !['module', 'hook', 'unhandled'].includes(row.failure_class));
    for (const row of s.modules) check(row.state !== 'failed' && row.failure_class !== 'unhandled');
  }
}
function runValueEngine(value: unknown, limits: unknown): DetailedValueResult<ValidatedValue> {
  const owner = new ValueAccountingOwner<ValidatedValue>();
  try {
    const c = new Cost(readLimits(limits)); owner.install(c); c.spend('structural', 8);
    const parsed = parseFrame(value, c);
    const s = 'snapshot_status' in parsed && parsed.snapshot_status === 'captured' ? parsed.snapshot : null;
    relations(parsed, c);
    const shape = Object.freeze({ cases: s?.cases.length ?? 0, modules: s?.modules.length ?? 0, events: s?.events.length ?? 0,
      scopes: s?.scopes.length ?? 0, workers: s?.workers.length ?? 0, samples: s?.samples.length ?? 0 });
    const bounds = baseBounds(shape, c);
    const overhead = { conditions_ready: 486, child_started: 340, first_anomaly: 449, slow_hint: 389, test_terminal: 379, stop_requested: 413 }[parsed.trigger];
    const encoded = s ? c.add(bounds.snapshot, overhead) : c.add(overhead, 'snapshot_status' in parsed ? 51 : 0);
    if ((s && bounds.snapshot > c.limits.max_snapshot_bytes) || encoded > c.limits.max_file_bytes || (!s && encoded > c.limits.max_control_bytes)) refuse('limit');
    return owner.success(Object.freeze({ kind: 'non_executable_value', value: parsed, shape,
      upper: Object.freeze({ snapshot: s ? bounds.snapshot : null, encoded, control: 500, controlReserve: 3000 }) }));
  } catch (error) { return owner.failure(error); }
}
export function inspectCheckpointValueDetailed(value: unknown, limits: unknown): DetailedValueResult<ValidatedValue> { return runValueEngine(value, limits); }
export function validateCheckpointValue(value: unknown, limits: unknown): ValueResult<ValidatedValue> { return projectLegacyValueResult(runValueEngine(value, limits)); }
