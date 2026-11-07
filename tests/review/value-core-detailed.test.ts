import { describe, expect, it } from 'vitest';
import { inspectCheckpointValueDetailed, validateCheckpointValue } from './fixtures/snapshot-value-core.js';
import { VALUE_FAILURE_STAGE_REASONS } from './fixtures/value-core-accounting.js';
import type { ValueWork } from './fixtures/value-core-accounting.js';
import { runFixedAccountingScenario } from './fixtures/value-core-accounting-assembly.js';

const limits = () => ({ max_scopes: 100, max_workers: 1000, max_nodes: 500000, max_work: 2000000,
  max_snapshot_bytes: 20000000, max_control_bytes: 500, max_file_bytes: 20001000 });
const child = () => ({ version: 'wfb-checkpoint-2', sequence: 1, trigger: 'child_started', at: 0,
  binding: { source_digest: 'a'.repeat(64), inventory_digest: 'b'.repeat(64) }, detail: { lease_ordinal: 1, startup: 'ready_wait' } });
const zero = (): Record<keyof ValueWork, number> => ({ structural: 0, relation: 0, arithmetic: 0, number_formatting: 0, copies: 0, total: 0 });
type Fee = [Exclude<keyof ValueWork, 'total'>, number];
// Independent ordered fee oracle for the fixed child frame. No production counter calls.
const trace: Fee[] = [['structural', 8], ['structural', 1], ['structural', 1], ['copies', 1],
  ...Array.from({ length: 7 }, (): Fee => ['structural', 1]),
  ['structural', 1], ['copies', 1],
  ['structural', 1], ['number_formatting', 1], ['number_formatting', 1], ['copies', 1],
  ['structural', 1], ['copies', 1],
  ['structural', 1], ['number_formatting', 1], ['number_formatting', 1], ['copies', 1],
  ...Array.from({ length: 3 }, (): Fee => ['structural', 1]),
  ['structural', 1], ['copies', 1], ['structural', 1], ['copies', 1], ['copies', 1],
  ...Array.from({ length: 3 }, (): Fee => ['structural', 1]),
  ['structural', 1], ['number_formatting', 1], ['number_formatting', 1], ['copies', 1],
  ['structural', 1], ['copies', 1], ['copies', 1], ['copies', 1],
  ['relation', 8], ...Array.from({ length: 17 }, (): Fee => ['arithmetic', 1])];
function oracle(workCap: number, nodeCap = 500000) {
  const counts = zero();
  for (const [kind, n] of trace) {
    if (counts.total + n > workCap || (kind === 'structural' && counts.structural + n > nodeCap)) break;
    counts[kind] += n; counts.total += n;
  }
  return { state: 'observed', work: counts };
}

describe('RC-A detailed result, legacy projection and no raw connection', () => {
  it('retains observed zero when the first eight-unit charge is refused', () => {
    expect(inspectCheckpointValueDetailed(child(), { ...limits(), max_work: 7 })).toMatchObject({ ok: false, reason: 'limit',
      model: 'wfb-value-core-work-1', accounting: { state: 'observed', work: { structural: 0, relation: 0, arithmetic: 0, number_formatting: 0, copies: 0, total: 0 } } });
    expect(validateCheckpointValue(child(), { ...limits(), max_work: 7 })).toEqual({ ok: false, reason: 'limit' });
  });
  it.each(Array.from({ length: 73 }, (_, i) => i + 1))('retains only accepted charges at work cap %i', cap => {
    expect(inspectCheckpointValueDetailed(child(), { ...limits(), max_work: cap })).toEqual({ ok: false, reason: 'limit',
      model: 'wfb-value-core-work-1', accounting: oracle(cap) });
    expect(validateCheckpointValue(child(), { ...limits(), max_work: cap })).toEqual({ ok: false, reason: 'limit' });
  });
  it.each(Array.from({ length: 30 }, (_, i) => i + 1))('retains accepted fees at node cap %i', cap => {
    expect(inspectCheckpointValueDetailed(child(), { ...limits(), max_nodes: cap })).toEqual({ ok: false, reason: 'limit',
      model: 'wfb-value-core-work-1', accounting: oracle(2000000, cap) });
  });
  it('preserves the independent 74-unit golden and legacy success shape at equality', () => {
    const detailed = inspectCheckpointValueDetailed(child(), { ...limits(), max_work: 74 });
    const legacy = validateCheckpointValue(child(), { ...limits(), max_work: 74 });
    expect(detailed.ok).toBe(true); expect(legacy.ok).toBe(true);
    expect(oracle(74).work).toEqual({ structural: 31, relation: 8, arithmetic: 17, number_formatting: 6, copies: 12, total: 74 });
    if (!detailed.ok || !legacy.ok) throw Error('fixture');
    expect(detailed.accounting).toEqual(oracle(74));
    expect(legacy).toEqual({ ok: true, value: detailed.value, work: detailed.accounting.work });
    expect(Object.keys(legacy)).toEqual(['ok', 'value', 'work']);
    expect(detailed.value.upper).toEqual({ snapshot: null, encoded: 340, control: 500, controlReserve: 3000 });
  });
  it('keeps detailed and legacy normalized values/work equal for all ten variants', () => {
    const details = {
      conditions_ready: { conditions_digest: 'c'.repeat(64), approval_revision: 1, gates: { offline_checked: true, approval_bound: true, scope_locked: true } },
      child_started: child().detail,
      first_anomaly: { kind: 'collector', case_ordinal: null, module_ordinal: null, scope_ordinal: null, reason: 'collector_failure' },
      slow_hint: { threshold_ms: 120000, elapsed_ms: 120001 },
      test_terminal: { test_result: 'incomplete', measurement: 'incomplete' },
      stop_requested: { cause: 'outer_deadline', stop_reason: 'deadline', cleanup_state: 'requested' },
    };
    let count = 0;
    for (const [trigger, detail] of Object.entries(details)) {
      const common = { ...child(), trigger, detail };
      const values = trigger === 'conditions_ready' || trigger === 'child_started' ? [common] : [
        { ...common, snapshot_status: 'captured', snapshot: { version: 'wfb-observation-snapshot-1', generation: 1,
          cutoff: { source_event_ordinal: 0, scope_tails: [], sample_count: 0 },
          coverage: { prefix: 'complete', run: 'incomplete', first_reason: 'none' }, modules: [], cases: [], scopes: [], events: [], workers: [], samples: [] } },
        { ...common, snapshot_status: 'unavailable', snapshot: null, snapshot_reason: 'source_unavailable' }];
      for (const value of values) {
        const detailed = inspectCheckpointValueDetailed(value, limits());
        expect(detailed.ok).toBe(true);
        if (!detailed.ok) throw Error('fixture');
        expect(validateCheckpointValue(value, limits())).toEqual({ ok: true, value: detailed.value, work: detailed.accounting.work });
        expect(detailed.value.value).toEqual(value); expect(detailed.value.value).not.toBe(value); count++;
      }
    }
    expect(count).toBe(10);
  });
  it('distinguishes unavailable bootstrap from observed zero and retains schema fees', () => {
    expect(inspectCheckpointValueDetailed(child(), {})).toEqual({ ok: false, reason: 'schema', model: 'wfb-value-core-work-1', accounting: { state: 'unavailable' } });
    expect(inspectCheckpointValueDetailed(undefined, limits())).toMatchObject({ ok: false, reason: 'schema',
      accounting: { state: 'observed', work: { ...zero(), structural: 9, total: 9 } } });
  });
  it.each(['max_control_bytes', 'max_file_bytes'])('retains full fees on final %s rejection', key => {
    expect(inspectCheckpointValueDetailed(child(), { ...limits(), [key]: 339 })).toEqual({ ok: false, reason: 'limit',
      model: 'wfb-value-core-work-1', accounting: oracle(74) });
  });
  it('keeps relation failure separate from a cap failure without returning partial data', () => {
    const value = { ...child(), trigger: 'slow_hint', detail: { threshold_ms: 120000, elapsed_ms: 120000 },
      snapshot_status: 'unavailable', snapshot: null, snapshot_reason: 'source_unavailable' };
    const result = inspectCheckpointValueDetailed(value, limits());
    expect(result).toMatchObject({ ok: false, reason: 'relation', accounting: { state: 'observed', work: { relation: 1 } } });
    expect(result).not.toHaveProperty('value'); expect(validateCheckpointValue(value, limits())).toEqual({ ok: false, reason: 'relation' });
  });
  it('freezes detached snapshots, avoids hooks and never outputs secrets', () => {
    let hooks = 0; const input = child();
    Object.defineProperty(input, 'at', { enumerable: true, get() { hooks++; throw Error('PRIVATE_TOKEN'); } });
    const result = inspectCheckpointValueDetailed(input, limits());
    expect(result).toMatchObject({ ok: false, reason: 'schema' }); expect(hooks).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_TOKEN|stack/); expect(result).not.toHaveProperty('value');
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.accounting)).toBe(true);
    if (result.accounting.state !== 'observed') throw Error('fixture');
    expect(Object.isFrozen(result.accounting.work)).toBe(true);
    const saved = { ...result.accounting.work }; inspectCheckpointValueDetailed(child(), limits());
    expect(result.accounting.work).toEqual(saved);
  });
});

describe('fixed accounting assembly, not bytes/core reachability claims', () => {
  it.each(['overflow', 'multiply_overflow'] as const)('retains arithmetic charge before %s', scenario => {
    expect(runFixedAccountingScenario(scenario)).toEqual({ ok: false, reason: 'overflow', model: 'wfb-value-core-work-1',
      accounting: { state: 'observed', work: { ...zero(), structural: 8, arithmetic: 1, total: 9 } } });
  });
  it.each(['invalid_value', 'duplicate_install'] as const)('retains fixed %s diagnostics', scenario => {
    expect(runFixedAccountingScenario(scenario)).toMatchObject({ ok: false, reason: 'invalid_value',
      accounting: { state: 'observed', work: { structural: 8, total: 8 } } });
  });
  it('retains unavailable, not zero, before meter and on snapshot faults', () => {
    expect(runFixedAccountingScenario('before_meter')).toMatchObject({ ok: false, reason: 'invalid_value', accounting: { state: 'unavailable' } });
    expect(runFixedAccountingScenario('snapshot_unavailable')).toEqual({ ok: false, reason: 'relation', model: 'wfb-value-core-work-1', accounting: { state: 'unavailable' } });
    expect(runFixedAccountingScenario('success_snapshot_unavailable')).toEqual({ ok: false, reason: 'invalid_value', model: 'wfb-value-core-work-1', accounting: { state: 'unavailable' } });
  });
  it('never overwrites a first failure with later failure or success', () => {
    const result = runFixedAccountingScenario('first_failure');
    if (!('first' in result)) throw Error('fixture');
    expect(result.second).toBe(result.first); expect(result.success).toBe(result.first);
    expect(result.first).toMatchObject({ ok: false, reason: 'relation' });
  });
  it('pins all five future labels without connecting the raw parser', () => {
    expect(VALUE_FAILURE_STAGE_REASONS).toEqual({ schema: 'value_schema', relation: 'value_relation', limit: 'value_limit', overflow: 'value_overflow', invalid_value: 'value_invalid' });
    expect(Object.isFrozen(VALUE_FAILURE_STAGE_REASONS)).toBe(true);
  });
});
