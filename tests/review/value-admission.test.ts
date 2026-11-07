import { describe, expect, it } from 'vitest';
import { calculateValueAdmission } from './fixtures/value-admission-core.js';
import { inspectCheckpointSyntax } from './fixtures/raw-json-boundary.js';
import { inspectCheckpointValueDetailed } from './fixtures/snapshot-value-core.js';
import { readFileSync } from 'node:fs';

const plan = () => ({ max_input_bytes: 2000000, max_input_buffer_bytes: 2000000, max_input_live_bytes: 4000000,
  max_depth: 5, max_tokens: 500000, max_value_nodes: 200000, max_array_items: 30000,
  max_parse_work: 30000000, max_value_work: 2000000, max_total_work: 32000000,
  max_token_scratch_bytes: 66, max_ast_nodes: 200000, max_live_value_nodes: 400000,
  max_scopes: 100, max_workers: 1000, max_nodes: 600010, max_snapshot_bytes: 20000000,
  max_control_bytes: 500, max_file_bytes: 20001000 });

describe('RC-B separate logical tree and structural admission, no core invocation', () => {
  it('accepts each cap at equality without confusing V, 2V and structural units', () => {
    const result = calculateValueAdmission(10, { ...plan(), max_live_value_nodes: 20, max_nodes: 40 });
    expect(result).toMatchObject({ ok: true, kind: 'non_executable_value_admission',
      value: { valueNodes: 10, liveValueNodes: 20, structural: 40 }, coreInvocation: 'not_called' });
  });
  it.each(['max_live_value_nodes', 'max_nodes', 'max_value_nodes', 'max_ast_nodes'] as const)('rejects one below %s independently', key => {
    const caps = { ...plan(), max_live_value_nodes: 20, max_nodes: 40, max_value_nodes: 10, max_ast_nodes: 10 };
    expect(calculateValueAdmission(10, { ...caps, [key]: caps[key] - 1 })).toMatchObject({ ok: false, reason: 'raw_limit', coreInvocation: 'not_called' });
  });
  it('projects the original value reserve and fixed field order, never parser leftovers', () => {
    const input = plan(), r = calculateValueAdmission(10, input);
    if (!r.ok) throw Error('fixture');
    expect(r.value.valueLimits).toEqual({ max_scopes: 100, max_workers: 1000, max_nodes: 600010, max_work: 2000000,
      max_snapshot_bytes: 20000000, max_control_bytes: 500, max_file_bytes: 20001000 });
    expect(Object.keys(r.value.valueLimits)).toEqual(['max_scopes', 'max_workers', 'max_nodes', 'max_work', 'max_snapshot_bytes', 'max_control_bytes', 'max_file_bytes']);
    expect(r.arithmetic).toEqual({ attempted: 4, completed: 4 }); expect(r.bridgeWork).toBe('unmodeled');
    input.max_value_work = 1; expect(r.value.valueLimits.max_work).toBe(2000000);
    for (const v of [r, r.value, r.value.valueLimits, r.arithmetic]) expect(Object.isFrozen(v)).toBe(true);
  });
  it('preserves work-reserve equality and rejects borrowing/overflow before V arithmetic', () => {
    expect(calculateValueAdmission(10, { ...plan(), max_total_work: 31999999 })).toMatchObject({ ok: false, reason: 'raw_limits', arithmetic: { attempted: 1, completed: 1 } });
    expect(calculateValueAdmission(10, { ...plan(), max_parse_work: Number.MAX_SAFE_INTEGER })).toMatchObject({ ok: false, reason: 'raw_overflow', arithmetic: { attempted: 1, completed: 0 } });
  });
  it('pins model identity as fixed DATA, not a user-selected engine or a ready bridge profile', () => {
    expect(calculateValueAdmission(1, plan())).toMatchObject({ model: 'wfb-value-admission-rcb-1',
      structuralModel: 'wfb-value-structural-3v10-1', valueModel: 'wfb-value-core-work-1', bridgeWork: 'unmodeled' });
  });
  it.each([0, -0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10', null, {}])('rejects invalid V %s without coercion', v => {
    expect(calculateValueAdmission(v, plan())).toMatchObject({ ok: false, reason: 'raw_limits' });
  });
  it('rejects malformed plans without executing accessors/proxy/hooks or outputting secrets', () => {
    let calls = 0;
    const getter = plan(); Object.defineProperty(getter, 'max_nodes', { enumerable: true, get() { calls++; throw Error('PRIVATE'); } });
    const proxy = new Proxy(plan(), { ownKeys() { calls++; throw Error('PRIVATE'); }, getPrototypeOf() { calls++; throw Error('PRIVATE'); } });
    const { max_nodes, ...missing } = plan();
    const { max_input_bytes, ...rest } = plan();
    expect(max_nodes).toBeGreaterThan(0);
    for (const input of [getter, proxy, missing, { ...rest, max_input_bytes }, { ...plan(), model: 'forged' },
      { ...plan(), max_nodes: 0 }, { ...plan(), max_nodes: -0 }, { ...plan(), max_nodes: 1.5 },
      { ...plan(), max_nodes: Number.MAX_SAFE_INTEGER + 1 }, { ...plan(), toJSON() { calls++; return 'PRIVATE'; } },
      Object.setPrototypeOf(plan(), { secret: 'PRIVATE' }), { ...plan(), [Symbol('secret')]: 'PRIVATE' }]) {
      const r = calculateValueAdmission(10, input);
      expect(r).toMatchObject({ ok: false, reason: 'raw_limits', arithmetic: { attempted: 0, completed: 0 } });
      expect(JSON.stringify(r)).not.toMatch(/PRIVATE|stack/); expect(r).not.toHaveProperty('value');
    }
    expect(calls).toBe(0);
    expect(calculateValueAdmission(10, Object.setPrototypeOf(plan(), null)).ok).toBe(true);
  });
  it('matches BigInt arithmetic including each overflow edge and first-failure order', () => {
    const max = Number.MAX_SAFE_INTEGER, big = BigInt(max);
    const ns = [...Array.from({ length: 256 }, (_, i) => i + 1), Math.floor((max - 10) / 3), Math.floor((max - 10) / 3) + 1,
      Math.floor(max / 3), Math.floor(max / 3) + 1, Math.floor(max / 2), Math.floor(max / 2) + 1, max];
    for (const n of ns) {
      const p = { ...plan(), max_value_nodes: max, max_ast_nodes: max, max_live_value_nodes: max, max_nodes: max };
      const expectedTree = 2n * BigInt(n), expectedStructural = 3n * BigInt(n) + 10n;
      const r = calculateValueAdmission(n, p);
      if (expectedTree > big || expectedStructural > big) expect(r).toMatchObject({ ok: false, reason: 'raw_overflow' });
      else expect(r).toMatchObject({ ok: true, value: { liveValueNodes: Number(expectedTree), structural: Number(expectedStructural) } });
    }
    expect(calculateValueAdmission(max, { ...plan(), max_value_nodes: max, max_ast_nodes: max })).toMatchObject({ reason: 'raw_overflow', arithmetic: { attempted: 2, completed: 1 } });
    // Tree refusal is earlier than structural overflow; no hidden alternative-formula fallback.
    expect(calculateValueAdmission(Math.floor(max / 3) + 1, { ...plan(), max_value_nodes: max, max_ast_nodes: max })).toMatchObject({ reason: 'raw_limit', arithmetic: { attempted: 2, completed: 2 } });
  });
});

const emptyBody = () => ({ version: 'wfb-observation-snapshot-1', generation: 1,
  cutoff: { source_event_ordinal: 0, scope_tails: [] as { scope_ordinal: number; last_seq: number }[], sample_count: 0 },
  coverage: { prefix: 'complete', run: 'incomplete', first_reason: 'none' },
  modules: [] as object[], cases: [] as object[], scopes: [] as object[], events: [] as object[], workers: [] as object[], samples: [] as object[] });
function populated(samples = 1, status = 'observed') {
  const body = emptyBody();
  body.cutoff = { source_event_ordinal: 10, scope_tails: [{ scope_ordinal: 1, last_seq: 1 }], sample_count: samples };
  if (status !== 'observed') body.coverage = { prefix: 'incomplete', run: 'incomplete', first_reason: 'source_unavailable' };
  body.modules = [{ module_ordinal: 1, state: 'completed', failure_class: 'none', case_counts: { discovered: 0, running: 0, passed: 1, failed: 0, skipped: 0, todo: 0, not_run: 0, unknown: 0 } }];
  body.cases = [{ case_ordinal: 1, module_ordinal: 1, state: 'passed', duration_ms: 0.25, failure_class: 'none', scope_coverage: 'observed' }];
  body.scopes = [{ scope_ordinal: 1, case_ordinal: 1, origin_ms: 0, log_count: 1, log_limit: 4096, active: true, incomplete_reason: 'none' }];
  body.events = [{ scope_ordinal: 1, seq: 1, at_ms: 0.5, review: 0, worker: 0, request: 0, event: 'review_start', phase: 'review', detail: 'none', code: 'none' }];
  body.workers = [{ scope_ordinal: 1, worker_ordinal: 3, created_ms: 0, ready_ms: null, analyze_started_ms: null, finish_started_ms: null, last_reply_ms: null, terminate_ms: null, exit_ms: null, exited: false }];
  body.samples = Array.from({ length: samples }, (_, i) => ({ at_ms: i, scope: 'owned_tree', cpu_ms: { status, value: status === 'observed' ? 0.25 : null }, rss_bytes: { status, value: status === 'observed' ? 0 : null }, owned_process_count: { status, value: status === 'observed' ? 0 : null } }));
  return body;
}
function frame(trigger = 'test_terminal', body: ReturnType<typeof emptyBody> | null = emptyBody()) {
  const details: Record<string, object> = {
    conditions_ready: { conditions_digest: 'c'.repeat(64), approval_revision: 1, gates: { offline_checked: true, approval_bound: true, scope_locked: true } },
    child_started: { lease_ordinal: 1, startup: 'ready_wait' },
    first_anomaly: { kind: 'collector', case_ordinal: null, module_ordinal: null, scope_ordinal: null, reason: 'collector_failure' },
    slow_hint: { threshold_ms: 120000, elapsed_ms: 120001 }, test_terminal: { test_result: 'incomplete', measurement: 'incomplete' },
    stop_requested: { cause: 'outer_deadline', stop_reason: 'deadline', cleanup_state: 'requested' },
  };
  const common = { version: 'wfb-checkpoint-2', sequence: 1, trigger, at: 0, binding: { source_digest: 'a'.repeat(64), inventory_digest: 'b'.repeat(64) }, detail: details[trigger] };
  if (trigger === 'conditions_ready' || trigger === 'child_started') return common;
  return body ? { ...common, snapshot_status: 'captured', snapshot: body }
    : { ...common, snapshot_status: 'unavailable', snapshot: null, snapshot_reason: 'source_unavailable' };
}
function nodes(v: unknown): number { return 1 + (v && typeof v === 'object' ? Object.values(v).reduce<number>((n, x) => n + nodes(x), 0) : 0); }
function coreLimits() { const p = plan(); return { max_scopes: p.max_scopes, max_workers: p.max_workers, max_nodes: p.max_nodes,
  max_work: p.max_value_work, max_snapshot_bytes: p.max_snapshot_bytes, max_control_bytes: p.max_control_bytes, max_file_bytes: p.max_file_bytes }; }
function syntax(value: unknown) { return inspectCheckpointSyntax(new TextEncoder().encode(JSON.stringify(value) + '\n'), plan()); }
const candidates = (v: number) => ({ conservative: 3 * v + 10, alternative: Math.min(3 * v + 10, 2 * v + 1810) });

describe('independent structural oracle, separate syntax/core probes only', () => {
  it('bounds all ten variants, all row kinds, all metric branches and the 600-sample limit', () => {
    const values = [frame('conditions_ready'), frame('child_started')];
    for (const trigger of ['first_anomaly', 'slow_hint', 'test_terminal', 'stop_requested']) {
      values.push(frame(trigger), frame(trigger, null), frame(trigger, populated()));
    }
    for (const status of ['observed', 'unavailable', 'not_supported']) values.push(frame('test_terminal', populated(600, status)));
    for (const value of values) {
      const parsed = syntax(value); expect(parsed.ok).toBe(true);
      const v = nodes(value); expect(parsed.counts.valueNodes).toBe(v); expect(parsed.counts.retiredNodes).toBe(v);
      const detailed = inspectCheckpointValueDetailed(value, coreLimits()); expect(detailed.ok).toBe(true);
      if (!detailed.ok) throw Error('fixture');
      const body = ('snapshot' in value ? value.snapshot : null) as ReturnType<typeof emptyBody> | null;
      const expected = body ? 2 * v + 10 + 3 * body.samples.length : 2 * v + ('snapshot' in value ? 10 : 9);
      expect(detailed.accounting.work.structural, JSON.stringify([value.trigger, 'snapshot_status' in value ? value.snapshot_status : 'control'])).toBe(expected);
      const bounds = candidates(v);
      expect(expected).toBeLessThanOrEqual(bounds.conservative); expect(expected).toBeLessThanOrEqual(bounds.alternative);
      const a = calculateValueAdmission(parsed.counts.valueNodes, plan()); expect(a.ok).toBe(true);
      // This is a test composition of separate calls, not private same-root runtime binding.
      expect(a).toMatchObject({ coreInvocation: 'not_called', bridgeWork: 'unmodeled' });
      const matches = (charge: number) => charge === expected;
      expect(matches(detailed.accounting.work.structural)).toBe(true);
      expect(matches(detailed.accounting.work.structural + 1)).toBe(false);
      expect(matches(detailed.accounting.work.structural - 1)).toBe(false);
      expect(expected * 2).toBeGreaterThan(bounds.conservative); // diagnostic rewalk mutant, not a modified runtime
    }
  });
  it('bounds missing/extra/reordered fields and array-limit prefixes without normalizing them', () => {
    const original = frame('test_terminal', populated());
    const variants: object[] = [];
    for (const [key, child] of Object.entries(original)) {
      const removed = { ...original } as Record<string, unknown>; delete removed[key]; variants.push(removed);
      variants.push({ ...original, [key]: child && typeof child === 'object' && !Array.isArray(child)
        ? Object.fromEntries(Object.entries(child).reverse()) : { extra: child } });
    }
    variants.push({ ...original, extra: 0 }, Object.fromEntries(Object.entries(original).reverse()));
    for (const value of variants) {
      expect(syntax(value).ok).toBe(true);
      const r = inspectCheckpointValueDetailed(value, coreLimits());
      expect(r.ok).toBe(false); expect(r.accounting.state).toBe('observed');
      if (r.accounting.state !== 'observed') throw Error('fixture');
      expect(r.accounting.work.structural).toBeLessThanOrEqual(candidates(nodes(value)).conservative);
    }
  });
  it('bounds charged schema/relation/limit prefixes over deterministic malformed trees', () => {
    const original = frame('test_terminal', populated());
    type Step = string | number;
    const paths: Step[][] = [];
    const walk = (v: unknown, path: Step[]) => {
      paths.push(path);
      if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) walk(child, [...path, Array.isArray(v) ? Number(key) : key]);
    };
    walk(original, []);
    let checked = 0, rejected = 0, syntaxRejected = 0;
    const reasons = new Set<string>();
    for (const path of paths.filter(p => p.length > 0)) for (const replacement of [null, false, 0, 'invalid', [], {}]) {
      const value = JSON.parse(JSON.stringify(original)) as Record<string, unknown>;
      let parent: unknown = value;
      for (const key of path.slice(0, -1)) parent = (parent as Record<Step, unknown>)[key];
      (parent as Record<Step, unknown>)[path.at(-1)!] = replacement;
      const parsed = syntax(value);
      if (!parsed.ok) {
        expect(parsed.reason).toBe('raw_limit'); expect(parsed.stage).toBe('parse');
        syntaxRejected++; continue; // Replacing a scalar at depth five with a container exceeds the unchanged raw profile.
      }
      const v = nodes(value); expect(parsed.counts.valueNodes).toBe(v);
      const detailed = inspectCheckpointValueDetailed(value, coreLimits());
      expect(detailed.accounting.state).toBe('observed');
      if (detailed.accounting.state !== 'observed') throw Error('fixture');
      const actual = detailed.accounting.work.structural, bound = candidates(v);
      expect(actual).toBeLessThanOrEqual(bound.conservative); expect(actual).toBeLessThanOrEqual(bound.alternative);
      if (!detailed.ok) { rejected++; reasons.add(detailed.reason); }
      checked++;
    }
    expect(checked).toBe(526); expect(rejected).toBeGreaterThan(0); expect(syntaxRejected).toBeGreaterThan(0);
    expect(checked + syntaxRejected).toBe(6 * (paths.length - 1));
    expect(reasons.has('schema')).toBe(true); expect(reasons.has('relation')).toBe(true);
    // Current sample cap rejects before visiting even one metric in the oversized array.
    const excessBody = populated(601); excessBody.cutoff.sample_count = 600;
    const excess = frame('test_terminal', excessBody);
    const d = inspectCheckpointValueDetailed(excess, coreLimits());
    expect(d).toMatchObject({ ok: false, reason: 'limit' });
    if (d.accounting.state !== 'observed') throw Error('fixture');
    expect(d.accounting.work.structural).toBeLessThanOrEqual(candidates(nodes(excess)).alternative);
  });
  it('keeps runtime/raw wiring and packaging closed', () => {
    const read = (name: string) => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
    const core = read('tests/review/fixtures/value-admission-core.ts');
    expect(core.match(/^import .*$/gm)).toEqual(["import { types } from 'node:util';",
      "import { VALUE_WORK_MODEL } from './value-core-accounting.js';", "import type { ValueLimits } from './value-core-accounting.js';", "import type { RawLimits } from './raw-json-boundary.js';"]);
    expect(read('tests/review/fixtures/raw-json-boundary.ts')).not.toMatch(/value-admission-core|snapshot-value-core/);
    expect(core).not.toMatch(/inspectCheckpoint|fetch\s*\(|saveAttempt|setTimeout|issueReceipt/);
    expect(JSON.parse(read('tsconfig.json')).exclude).toContain('tests');
    expect(JSON.parse(read('package.json')).files).not.toContain('tests/');
  });
});
