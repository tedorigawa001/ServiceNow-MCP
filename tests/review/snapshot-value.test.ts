import { describe, expect, expectTypeOf, it } from 'vitest';
import { calculateSnapshotBounds, validateCheckpointValue } from './fixtures/snapshot-value-core.js';
import type { CheckpointValue } from './fixtures/snapshot-value-core.js';
import { readFileSync } from 'node:fs';

const limits = () => ({ max_scopes: 100, max_workers: 1000, max_nodes: 500000, max_work: 2000000,
  max_snapshot_bytes: 20000000, max_control_bytes: 500, max_file_bytes: 20001000 });
const emptyShape = () => ({ cases: 0, modules: 0, events: 0, scopes: 0, workers: 0, samples: 0 });
const body = () => ({ version: 'wfb-observation-snapshot-1', generation: 1,
  cutoff: { source_event_ordinal: 0, scope_tails: [], sample_count: 0 },
  coverage: { prefix: 'complete', run: 'incomplete', first_reason: 'none' },
  modules: [], cases: [], scopes: [], events: [], workers: [], samples: [] });
const details = {
  conditions_ready: () => ({ conditions_digest: 'c'.repeat(64), approval_revision: 1,
    gates: { offline_checked: true, approval_bound: true, scope_locked: true } }),
  child_started: () => ({ lease_ordinal: 1, startup: 'ready_wait' }),
  first_anomaly: () => ({ kind: 'collector', case_ordinal: null, module_ordinal: null, scope_ordinal: null, reason: 'collector_failure' }),
  slow_hint: () => ({ threshold_ms: 120000, elapsed_ms: 120001 }),
  test_terminal: () => ({ test_result: 'incomplete', measurement: 'incomplete' }),
  stop_requested: () => ({ cause: 'outer_deadline', stop_reason: 'deadline', cleanup_state: 'requested' }),
};
type Trigger = keyof typeof details;
const zeroCounts = () => ({ discovered: 0, running: 0, passed: 0, failed: 0, skipped: 0, todo: 0, not_run: 0, unknown: 0 });
function populated() {
  return { ...body(), cutoff: { source_event_ordinal: 10, scope_tails: [{ scope_ordinal: 1, last_seq: 1 }], sample_count: 1 },
    modules: [{ module_ordinal: 1, state: 'completed', failure_class: 'none', case_counts: { ...zeroCounts(), passed: 1 } }],
    cases: [{ case_ordinal: 1, module_ordinal: 1, state: 'passed', duration_ms: 0.25, failure_class: 'none', scope_coverage: 'observed' }],
    scopes: [{ scope_ordinal: 1, case_ordinal: 1, origin_ms: 0, log_count: 1, log_limit: 4096, active: true, incomplete_reason: 'none' }],
    events: [{ scope_ordinal: 1, seq: 1, at_ms: 0.5, review: 0, worker: 0, request: 0, event: 'review_start', phase: 'review', detail: 'none', code: 'none' }],
    workers: [{ scope_ordinal: 1, worker_ordinal: 3 as number | null, created_ms: 0, ready_ms: null as number | null, analyze_started_ms: null, finish_started_ms: null, last_reply_ms: null, terminate_ms: null, exit_ms: null as number | null, exited: false }],
    samples: [{ at_ms: 1, scope: 'owned_tree', cpu_ms: { status: 'observed', value: 0.25 as number | null }, rss_bytes: { status: 'observed', value: 0 }, owned_process_count: { status: 'observed', value: 0 } }] };
}
const withBody = (s = populated()) => ({ ...frame(), snapshot: s });
function frame(trigger: Trigger = 'test_terminal', status: 'captured' | 'unavailable' = 'captured') {
  const common = { version: 'wfb-checkpoint-2', sequence: 1, trigger, at: 0,
    binding: { source_digest: 'a'.repeat(64), inventory_digest: 'b'.repeat(64) }, detail: details[trigger]() };
  if (trigger === 'conditions_ready' || trigger === 'child_started') return common;
  return status === 'captured' ? { ...common, snapshot_status: status, snapshot: body() }
    : { ...common, snapshot_status: status, snapshot: null, snapshot_reason: 'source_unavailable' };
}

describe('snapshot pure bounds, never execution authority', () => {
  it('calculates empty snapshot, full envelope and six controls independently', () => {
    expect(calculateSnapshotBounds(emptyShape(), limits())).toMatchObject({ ok: true,
      value: { kind: 'non_executable_bounds', snapshot: 321, captured: 770, control: 500, controlReserve: 3000 } });
  });
});

describe('local relations without source authority', () => {
  it('accepts all rows, a worker gap and fractional times', () => {
    expect(validateCheckpointValue(withBody(), limits())).toMatchObject({ ok: true });
  });
  const bad: [string, (s: ReturnType<typeof populated>) => void][] = [
    ['module counts', s => { s.modules[0].case_counts.passed = 0; }],
    ['missing module', s => { s.cases[0].module_ordinal = 2; }],
    ['missing case', s => { s.scopes[0].case_ordinal = 2; }],
    ['missing scope', s => { s.events[0].scope_ordinal = 2; }],
    ['tail mismatch', s => { s.cutoff.scope_tails[0].last_seq = 0; }],
    ['sequence gap', s => { s.events[0].seq = 2; }],
    ['source zero', s => { s.cutoff.source_event_ordinal = 0; }],
    ['sample count', s => { s.cutoff.sample_count = 0; }],
    ['unknown coverage', s => { s.cases[0].scope_coverage = 'unknown'; }],
    ['outside scope', s => { s.cases[0].scope_coverage = 'outside_scope'; }],
    ['active null worker', s => { s.workers[0].worker_ordinal = null; }],
    ['worker before creation', s => { s.workers[0].created_ms = 2; s.workers[0].ready_ms = 1; }],
    ['exited without time', s => { s.workers[0].exited = true; }],
    ['request phase', s => { s.events[0].request = 1; }],
    ['coverage reason', s => { s.coverage.first_reason = 'clock'; }],
    ['failed state class', s => { s.cases[0].state = 'failed'; }],
    ['terminal duration absent', s => { Object.assign(s.cases[0], { duration_ms: null }); }],
    ['nonterminal run complete', s => { s.coverage.run = 'complete'; s.modules[0].state = 'running'; }],
  ];
  it.each(bad)('rejects %s', (_name, change) => {
    const s = populated(); change(s);
    expect(validateCheckpointValue(withBody(s), limits())).toEqual({ ok: false, reason: 'relation' });
  });
});

describe('strict non-executable value variants', () => {
  it('validates all ten wire variants without producing a receipt or encoding', () => {
    type Key<T> = T extends { trigger: infer K; snapshot_status: infer S } ? `${K & string}/${S & string}` : T extends { trigger: infer K } ? K : never;
    expectTypeOf<Key<CheckpointValue>>().toEqualTypeOf<'conditions_ready' | 'child_started'
      | 'first_anomaly/captured' | 'first_anomaly/unavailable' | 'slow_hint/captured' | 'slow_hint/unavailable'
      | 'test_terminal/captured' | 'test_terminal/unavailable' | 'stop_requested/captured' | 'stop_requested/unavailable'>();
    const values = (Object.keys(details) as Trigger[]).flatMap(t => t === 'conditions_ready' || t === 'child_started'
      ? [frame(t)] : [frame(t), frame(t, 'unavailable')]);
    expect(values).toHaveLength(10);
    for (const input of values) {
      const result = validateCheckpointValue(input, limits());
      expect(result).toMatchObject({ ok: true, value: { kind: 'non_executable_value', value: input } });
    }
  });
});

describe('strict data, no hooks or input retention', () => {
  const mutations: [string, (v: Record<string, unknown>) => unknown][] = [
    ['missing field', v => { delete v.at; return v; }],
    ['extra field', v => ({ ...v, secret: 'not_printed' })],
    ['wrong order', v => { const { at, ...rest } = v; return { ...rest, at }; }],
    ['symbol', v => Object.assign(v, { [Symbol('extra')]: 1 })],
    ['prototype', v => Object.setPrototypeOf(v, { inherited: true })],
    ['boxed number', v => ({ ...v, at: Object(1) })],
    ['negative zero', v => ({ ...v, at: -0 })],
    ['unsafe integer', v => ({ ...v, at: Number.MAX_SAFE_INTEGER + 1 })],
    ['string integer', v => ({ ...v, sequence: '1' })],
    ['zero sequence', v => ({ ...v, sequence: 0 })],
    ['sequence seven', v => ({ ...v, sequence: 7 })],
    ['unknown trigger', v => ({ ...v, trigger: 'unknown' })],
    ['uppercase digest', v => ({ ...v, binding: { source_digest: 'A'.repeat(64), inventory_digest: 'b'.repeat(64) } })],
    ['captured with reason', v => ({ ...v, snapshot_reason: 'source_unavailable' })],
    ['unavailable with body', v => ({ ...v, snapshot_status: 'unavailable', snapshot_reason: 'source_unavailable' })],
    ['unknown snapshot reason', () => ({ ...frame('test_terminal', 'unavailable'), snapshot_reason: 'unknown' })],
    ['control with snapshot', () => ({ ...frame('conditions_ready'), snapshot: null })],
    ['null root', () => null],
    ['array root', () => []],
  ];
  it.each(mutations)('rejects %s', (_name, mutate) => {
    expect(validateCheckpointValue(mutate(frame()), limits()).ok).toBe(false);
  });
  it('rejects accessors, proxies and toJSON without invoking them', () => {
    let calls = 0;
    const getter = frame(); Object.defineProperty(getter, 'at', { enumerable: true, get() { calls++; throw Error('secret'); } });
    const proxy = new Proxy(frame(), { ownKeys() { calls++; throw Error('secret'); }, getPrototypeOf() { calls++; throw Error('secret'); } });
    const hook = { ...frame(), toJSON() { calls++; throw Error('secret'); } };
    for (const v of [getter, proxy, hook]) expect(validateCheckpointValue(v, limits())).toEqual({ ok: false, reason: 'schema' });
    expect(calls).toBe(0);
  });
  it.each(['hole', 'accessor', 'symbol', 'extra', 'cycle', 'proxy', 'iterator'] as const)('rejects array %s without hooks', kind => {
    const v = withBody(); let calls = 0; const rows = v.snapshot.events;
    if (kind === 'hole') delete (rows as unknown[])[0];
    if (kind === 'accessor') Object.defineProperty(rows, '0', { get() { calls++; return null; } });
    if (kind === 'symbol') Object.assign(rows, { [Symbol('x')]: 1 });
    if (kind === 'extra') Object.assign(rows, { extra: 1 });
    if (kind === 'cycle') Object.assign(rows[0], { scope_ordinal: rows });
    if (kind === 'proxy') v.snapshot.events = new Proxy(rows, { get() { calls++; throw Error('secret'); } });
    if (kind === 'iterator') Object.defineProperty(rows, Symbol.iterator, { value() { calls++; throw Error('secret'); } });
    expect(validateCheckpointValue(v, limits())).toEqual({ ok: false, reason: 'schema' }); expect(calls).toBe(0);
  });
  it('accepts null prototypes, clones and recursively freezes all retained data', () => {
    const v = withBody(); Object.setPrototypeOf(v.binding, null);
    const r = validateCheckpointValue(v, limits()); expect(r.ok).toBe(true);
    if (!r.ok || !('snapshot' in r.value.value) || !r.value.value.snapshot) throw Error('fixture');
    v.snapshot.cases[0].duration_ms = 999;
    expect(r.value.value.snapshot.cases[0].duration_ms).toBe(0.25);
    const walk = (x: unknown) => { if (x && typeof x === 'object') { expect(Object.isFrozen(x)).toBe(true); for (const child of Object.values(x)) walk(child); } };
    walk(r);
  });
  it('returns only a fixed reason for secret-bearing invalid input', () => {
    expect(JSON.stringify(validateCheckpointValue({ ...frame(), secret: 'bearer_PRIVATE' }, limits()))).toBe('{"ok":false,"reason":"schema"}');
  });
});

describe('detail and row local boundaries', () => {
  const enumCases = [
    ...['review_start', 'review_end', 'factory_start', 'factory_return', 'factory_throw', 'ready_observed', 'reply_observed', 'post_try', 'post_return', 'post_throw', 'terminate_try', 'terminate_settle', 'terminate_throw', 'worker_exit', 'close_start', 'close_end'].map(v => ['event', v]),
    ...['none', 'review', 'ready', 'analyze', 'finish', 'cleanup'].map(v => ['phase', v]),
    ...['none', 'matched', 'duplicate', 'unmatched', 'fulfilled', 'rejected'].map(v => ['detail', v]),
    ...['none', 'other_fixed_code', 'invalid_input', 'access_denied', 'authentication_failed', 'cancelled', 'deadline_exceeded', 'worker_unavailable', 'internal_review_error', 'review_busy', 'metadata_unavailable'].map(v => ['code', v]),
  ];
  it.each(enumCases)('accepts fixed event %s=%s without adding causal authority', (key, value) => {
    const s = populated(); Object.assign(s.events[0], { [key]: value }); expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(true);
  });
  it.each(['discovered', 'running', 'passed', 'failed', 'skipped', 'todo', 'not_run', 'unknown'])('checks case state %s with its allowed class/duration', state => {
    const s = populated(); s.cases[0].state = state;
    s.cases[0].failure_class = state === 'failed' ? 'assertion' : state === 'unknown' ? 'not_observed' : 'none';
    if (!['passed', 'failed'].includes(state)) Object.assign(s.cases[0], { duration_ms: null });
    Object.assign(s.modules[0].case_counts, zeroCounts(), { [state]: 1 });
    if (state === 'unknown') s.coverage = { prefix: 'incomplete', run: 'incomplete', first_reason: 'missing_case' };
    expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(true);
  });
  it.each(['discovered', 'running', 'completed', 'failed', 'not_run', 'unknown'])('checks module state %s', state => {
    const s = populated(); s.modules[0].state = state;
    s.modules[0].failure_class = state === 'failed' ? 'module' : state === 'unknown' ? 'collector' : 'none';
    if (state === 'unknown') s.coverage = { prefix: 'incomplete', run: 'incomplete', first_reason: 'missing_module' };
    expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(true);
  });
  it.each(['none', 'source_unavailable', 'inventory_unknown', 'missing_case', 'missing_module', 'missing_scope', 'event_gap', 'capacity', 'clock', 'observer', 'protocol', 'secret'])('accepts fixed coverage reason %s with correct prefix', reason => {
    const s = populated(); s.coverage = { prefix: reason === 'none' ? 'complete' : 'incomplete', run: 'incomplete', first_reason: reason };
    expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(true);
  });
  it.each(['source_unavailable', 'snapshot_binding', 'snapshot_invalid', 'snapshot_limit', 'snapshot_encoding', 'snapshot_secret', 'snapshot_cancelled', 'snapshot_deadline'])('accepts bounded unavailable reason %s without a receipt', reason => {
    expect(validateCheckpointValue({ ...frame('first_anomaly', 'unavailable'), snapshot_reason: reason }, limits()).ok).toBe(true);
  });
  it.each(['cancelled', 'deadline', 'window', 'state', 'binding', 'clock', 'checkpoint', 'recorder'])('checks stop mapping for %s', reason => {
    const cause = reason === 'cancelled' ? 'cancelled' : ['deadline', 'window'].includes(reason) ? 'outer_deadline' : 'collector_failure';
    expect(validateCheckpointValue({ ...frame('stop_requested'), detail: { cause, stop_reason: reason, cleanup_state: 'unconfirmed' } }, limits()).ok).toBe(true);
  });
  it('rejects false gates, confirmed cleanup and unknown fixed detail fields', () => {
    for (const value of [
      { ...frame('conditions_ready'), detail: { ...details.conditions_ready(), gates: { offline_checked: false, approval_bound: true, scope_locked: true } } },
      { ...frame('child_started'), detail: { ...details.child_started(), startup: 'unknown' } },
      { ...frame('test_terminal'), detail: { test_result: 'unknown', measurement: 'complete' } },
      { ...frame('stop_requested'), detail: { ...details.stop_requested(), cleanup_state: 'confirmed' } },
    ]) expect(validateCheckpointValue(value, limits())).toEqual({ ok: false, reason: 'schema' });
  });
  it.each([
    ['slow threshold', { ...frame('slow_hint'), detail: { threshold_ms: 120000, elapsed_ms: 120000 } }],
    ['cause mismatch', { ...frame('stop_requested'), detail: { cause: 'cancelled', stop_reason: 'deadline', cleanup_state: 'requested' } }],
    ['not started outside stop', { ...frame('test_terminal', 'unavailable'), snapshot_reason: 'observation_not_started' }],
    ['not started requested', { ...frame('stop_requested', 'unavailable'), snapshot_reason: 'observation_not_started' }],
    ['anomaly mapping', { ...frame('first_anomaly'), detail: { ...details.first_anomaly(), reason: 'case_failure' } }],
    ['anomaly missing ids', { ...frame('first_anomaly'), detail: { ...details.first_anomaly(), kind: 'case', reason: 'case_failure' } }],
  ])('rejects %s', (_name, value) => { expect(validateCheckpointValue(value, limits())).toEqual({ ok: false, reason: 'relation' }); });
  it('accepts not-started only for untouched stop; preserves complete unavailable measurement', () => {
    expect(validateCheckpointValue({ ...frame('stop_requested', 'unavailable'), detail: { ...details.stop_requested(), cleanup_state: 'not_requested' }, snapshot_reason: 'observation_not_started' }, limits()).ok).toBe(true);
    expect(validateCheckpointValue({ ...frame('test_terminal', 'unavailable'), detail: { test_result: 'passed', measurement: 'complete' } }, limits()).ok).toBe(true);
  });
  it('checks anomaly references and passed contradiction', () => {
    const s = populated();
    const v = { ...frame('first_anomaly'), detail: { kind: 'case', case_ordinal: 1, module_ordinal: 1, scope_ordinal: 1, reason: 'case_failure' }, snapshot: s };
    expect(validateCheckpointValue(v, limits()).ok).toBe(true);
    v.detail.scope_ordinal = 2; expect(validateCheckpointValue(v, limits()).ok).toBe(false);
    s.cases[0].state = 'failed'; s.cases[0].failure_class = 'assertion'; Object.assign(s.modules[0].case_counts, { passed: 0, failed: 1 });
    expect(validateCheckpointValue({ ...withBody(s), detail: { test_result: 'passed', measurement: 'complete' } }, limits())).toEqual({ ok: false, reason: 'relation' });
    expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(true);
  });
  it('preserves interleaved local event order, equal sample times and absent worker phases', () => {
    const s = populated(); s.scopes.push({ ...s.scopes[0], scope_ordinal: 2 }); s.cutoff.scope_tails.push({ scope_ordinal: 2, last_seq: 1 });
    s.events.push({ ...s.events[0], scope_ordinal: 2, at_ms: 0 }); s.samples.push({ ...s.samples[0] }); s.cutoff.sample_count = 2;
    const r = validateCheckpointValue(withBody(s), limits());
    expect(r).toMatchObject({ ok: true, value: { value: { snapshot: { events: s.events, samples: s.samples } } } });
  });
  it('accepts numbered then null workers only on inactive scope, never renumbers them', () => {
    const s = populated(); s.coverage = { prefix: 'incomplete', run: 'incomplete', first_reason: 'capacity' };
    s.scopes[0].active = false; s.scopes[0].incomplete_reason = 'capacity';
    s.workers.push({ ...s.workers[0], worker_ordinal: null }, { ...s.workers[0], worker_ordinal: null });
    expect(validateCheckpointValue(withBody(s), limits())).toMatchObject({ ok: true, value: { value: { snapshot: { workers: s.workers } } } });
    s.workers.push({ ...s.workers[0], worker_ordinal: 4 }); expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(false);
  });
  const invalidRows: [string, (s: ReturnType<typeof populated>) => void][] = [
    ['duplicate module', s => s.modules.push({ ...s.modules[0] })],
    ['duplicate case', s => s.cases.push({ ...s.cases[0] })],
    ['duplicate scope', s => s.scopes.push({ ...s.scopes[0] })],
    ['duplicate tail', s => s.cutoff.scope_tails.push({ ...s.cutoff.scope_tails[0] })],
    ['missing tail', s => { s.cutoff.scope_tails = []; }],
    ['duplicate worker', s => s.workers.push({ ...s.workers[0] })],
    ['missing worker scope', s => { s.workers[0].scope_ordinal = 2; }],
    ['worker time mismatch', s => { s.workers[0].exit_ms = 1; }],
    ['decreasing local time', s => { s.events.push({ ...s.events[0], seq: 2, at_ms: 0 }); s.scopes[0].log_count = 2; s.cutoff.scope_tails[0].last_seq = 2; }],
    ['decreasing sample time', s => { s.samples.push({ ...s.samples[0], at_ms: 0 }); s.cutoff.sample_count = 2; }],
    ['unavailable metric complete prefix', s => { s.samples[0].cpu_ms = { status: 'unavailable', value: null }; }],
    ['metric status null mismatch', s => { s.samples[0].cpu_ms.value = null; }],
    ['NaN time', s => { s.events[0].at_ms = NaN; }],
    ['infinite time', s => { s.events[0].at_ms = Infinity; }],
    ['negative zero time', s => { s.events[0].at_ms = -0; }],
    ['bad event enum', s => { s.events[0].event = 'unknown'; }],
    ['bad phase', s => { s.events[0].phase = 'unknown'; }],
    ['bad detail', s => { s.events[0].detail = 'unknown'; }],
    ['bad code', s => { s.events[0].code = 'unknown'; }],
    ['bad module state', s => { s.modules[0].state = 'unknown_enum'; }],
    ['bad case state', s => { s.cases[0].state = 'unknown_enum'; }],
    ['bad log limit', s => { s.scopes[0].log_limit = 4095; }],
  ];
  it.each(invalidRows)('rejects %s', (_name, change) => { const s = populated(); change(s); expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(false); });
  it('requires incomplete prefix for unavailable metrics but does not convert null to zero', () => {
    const s = populated(); s.samples[0].cpu_ms = { status: 'unavailable', value: null };
    s.coverage = { prefix: 'incomplete', run: 'incomplete', first_reason: 'observer' };
    expect(validateCheckpointValue(withBody(s), limits())).toMatchObject({ ok: true, value: { value: { snapshot: { samples: s.samples } } } });
  });
});

describe('count, work and encoded envelopes with independent controls', () => {
  it.each(['max_scopes', 'max_workers', 'max_nodes', 'max_work', 'max_snapshot_bytes', 'max_control_bytes', 'max_file_bytes'] as const)('requires explicit positive %s', key => {
    expect(validateCheckpointValue(frame(), { ...limits(), [key]: 0 })).toEqual({ ok: false, reason: 'schema' });
    const cap = limits(); delete (cap as Partial<typeof cap>)[key]; expect(validateCheckpointValue(frame(), cap).ok).toBe(false);
  });
  it.each(['cases', 'modules', 'events', 'samples'] as const)('checks %s cardinality at and above limit', key => {
    const max = { cases: 20000, modules: 1000, events: 20000, samples: 600 }[key];
    expect(calculateSnapshotBounds({ ...emptyShape(), scopes: 5, [key]: max }, limits()).ok).toBe(true);
    expect(calculateSnapshotBounds({ ...emptyShape(), scopes: 5, [key]: max + 1 }, limits())).toEqual({ ok: false, reason: 'limit' });
  });
  it('checks scope, worker and local aggregate caps; refuses checked overflow', () => {
    for (const shape of [{ ...emptyShape(), scopes: 101 }, { ...emptyShape(), workers: 1001, scopes: 1 }]) expect(calculateSnapshotBounds(shape, limits())).toEqual({ ok: false, reason: 'limit' });
    expect(calculateSnapshotBounds({ ...emptyShape(), scopes: 1, events: 4097 }, limits())).toEqual({ ok: false, reason: 'relation' });
    expect(calculateSnapshotBounds({ ...emptyShape(), scopes: Number.MAX_SAFE_INTEGER }, { ...limits(), max_scopes: Number.MAX_SAFE_INTEGER })).toEqual({ ok: false, reason: 'overflow' });
  });
  it('matches separate BigInt arithmetic at contract maxima including tails', () => {
    const shape = { cases: 20000, modules: 1000, events: 20000, scopes: 5, workers: 1000, samples: 600 };
    const oracle = 321n + 20000n * 177n + 1000n * 218n + 20000n * 227n + 600n * 264n + 5n * 232n + 1000n * 409n;
    expect(calculateSnapshotBounds(shape, limits())).toMatchObject({ ok: true, value: { snapshot: Number(oracle), captured: Number(oracle + 449n) } });
  });
  it('enforces selected file and snapshot/control byte envelopes exactly without increasing caps', () => {
    expect(validateCheckpointValue(frame(), { ...limits(), max_snapshot_bytes: 321, max_file_bytes: 700 }).ok).toBe(true);
    expect(validateCheckpointValue(frame(), { ...limits(), max_snapshot_bytes: 320 })).toEqual({ ok: false, reason: 'limit' });
    expect(validateCheckpointValue(frame(), { ...limits(), max_file_bytes: 699 })).toEqual({ ok: false, reason: 'limit' });
    expect(validateCheckpointValue(frame('conditions_ready'), { ...limits(), max_control_bytes: 486 }).ok).toBe(true);
    expect(validateCheckpointValue(frame('conditions_ready'), { ...limits(), max_control_bytes: 485 })).toEqual({ ok: false, reason: 'limit' });
  });
  it('counts work deterministically and stops one below either structural or total limit', () => {
    const r = validateCheckpointValue(withBody(), limits()); if (!r.ok) throw Error('fixture');
    expect(r.work.total).toBe(r.work.structural + r.work.relation + r.work.arithmetic + r.work.number_formatting + r.work.copies);
    expect(validateCheckpointValue(withBody(), { ...limits(), max_work: r.work.total }).ok).toBe(true);
    expect(validateCheckpointValue(withBody(), { ...limits(), max_work: r.work.total - 1 })).toEqual({ ok: false, reason: 'limit' });
    expect(validateCheckpointValue(withBody(), { ...limits(), max_nodes: r.work.structural - 1 })).toEqual({ ok: false, reason: 'limit' });
  });
  it('independently serializes safe fixtures in tests only; validates LF and all ten bounds', () => {
    for (const t of Object.keys(details) as Trigger[]) for (const status of ['captured', 'unavailable'] as const) {
      const v = frame(t, status), r = validateCheckpointValue(v, limits()); if (!r.ok) throw Error('fixture');
      expect(Buffer.byteLength(JSON.stringify(v) + '\n')).toBeLessThanOrEqual(r.value.upper.encoded);
    }
    const golden = '{"version":"wfb-checkpoint-2","sequence":1,"trigger":"child_started","at":0,"binding":{"source_digest":"' + 'a'.repeat(64) + '","inventory_digest":"' + 'b'.repeat(64) + '"},"detail":{"lease_ordinal":1,"startup":"ready_wait"}}\n';
    expect(JSON.stringify(frame('child_started')) + '\n').toBe(golden);
    const s = populated(), r = validateCheckpointValue(withBody(s), limits()); if (!r.ok) throw Error('fixture');
    expect(Buffer.byteLength(JSON.stringify(s))).toBeLessThanOrEqual(r.value.upper.snapshot!);
    const width = [177, 218, 227, 181, 409, 264, 51];
    const rows = [s.cases[0], s.modules[0], s.events[0], s.scopes[0], s.workers[0], s.samples[0], s.cutoff.scope_tails[0]];
    rows.forEach((row, i) => expect(Buffer.byteLength(JSON.stringify(row)) + 1).toBeLessThanOrEqual(width[i]));
  });
  it('independently derives Metric variant widths, never combining illegal null/status pairs', () => {
    const observed = JSON.stringify({ status: 'observed', value: 0 }).length - 1;
    const absent = Math.max(...['unavailable', 'not_supported'].map(status => JSON.stringify({ status, value: null }).length));
    expect(observed).toBe(30); expect(absent).toBe(39);
    const sampleFixed = JSON.stringify({ at_ms: 0, scope: 'owned_tree', cpu_ms: null, rss_bytes: null, owned_process_count: null }).length - 1 - 12;
    expect(sampleFixed + 32 + Math.max(observed + 32, absent) + 2 * Math.max(observed + 16, absent) + 1).toBe(264);
  });
  it.each([0, Number.MIN_VALUE, 0.1, 1e-7, 1234.5678, Number.MAX_SAFE_INTEGER])('preserves canonical finite scalar %s', time => {
    const s = populated(); s.cases[0].duration_ms = time; s.samples[0].cpu_ms.value = time;
    expect(validateCheckpointValue(withBody(s), limits())).toMatchObject({ ok: true, value: { value: { snapshot: { cases: [{ duration_ms: time }] } } } });
  });
  it('checks actual array limits before walking rows', () => {
    const s = populated(); s.events = new Array(20001);
    expect(validateCheckpointValue(withBody(s), limits())).toEqual({ ok: false, reason: 'limit' });
  });
  it.each([4096, 4097])('checks per-scope worker rows at %s including null ordinals', count => {
    const s = populated(); s.coverage = { prefix: 'incomplete', run: 'incomplete', first_reason: 'capacity' };
    s.scopes[0].active = false; s.scopes[0].incomplete_reason = 'capacity';
    s.workers = Array.from({ length: count }, () => ({ ...s.workers[0], worker_ordinal: null }));
    expect(validateCheckpointValue(withBody(s), { ...limits(), max_workers: 5000 }).ok).toBe(count === 4096);
  });
  it('checks per-scope dense events through 4096 without widening the event ordinal', () => {
    const s = populated(); s.scopes[0].log_count = 4096; s.cutoff.scope_tails[0].last_seq = 4096; s.cutoff.source_event_ordinal = 4096;
    s.events = Array.from({ length: 4096 }, (_, i) => ({ ...s.events[0], seq: i + 1 }));
    expect(validateCheckpointValue(withBody(s), limits()).ok).toBe(true);
    s.events.push({ ...s.events[0], seq: 4097 }); expect(validateCheckpointValue(withBody(s), limits())).toEqual({ ok: false, reason: 'schema' });
  });
});

describe('closed packaging and runtime boundary', () => {
  it('keeps the new core out of the runtime build and distributed roots', () => {
    const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
    const ts = JSON.parse(read('tsconfig.json')) as { include: string[]; exclude: string[] };
    const pkg = JSON.parse(read('package.json')) as { files: string[] };
    expect(ts.include).toEqual(['src/**/*']); expect(ts.exclude).toContain('tests');
    expect(pkg.files).not.toContain('tests/'); expect(pkg.files).not.toContain('tests');
    const core = read('tests/review/fixtures/snapshot-value-core.ts');
    expect(core.match(/^import .*$/gm)).toEqual(["import { types } from 'node:util';"]);
    expect(core).not.toMatch(/\b(?:fetch|writeFile|setTimeout|emit|saveAttempt|persist|issueReceipt)\s*\(/);
    expect(core).not.toContain('store-recorder-kernel');
  });
});
