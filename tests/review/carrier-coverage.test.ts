import { describe, expect, it } from 'vitest';
import { inspectCarrier, inspectCoverageLedger } from './fixtures/carrier-coverage-core.js';

const carrier = () => ({ model: 'wfb-carrier-values-1', variant: 'C0', reason: 'raw_work',
  entry: 'not_acquired', seed: 'not_acquired', credit: 'none', usage: 'unavailable',
  ready: false, runtimeCoverage: 'unknown', nativeCost: 'unknown', coreInvocation: 'not_called' });

describe('isolated carrier DATA', () => {
  it('accepts a detached frozen unavailable diagnostic, not an acquisition proof', () => {
    const input = carrier(), result = inspectCarrier(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    input.reason = 'raw_internal';
    expect(result.value.reason).toBe('raw_work');
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.authority).toBe('none');
  });
  const reasons = ['raw_limits', 'raw_work', 'raw_overflow', 'raw_internal'];
  const variants = ['C0', 'C1', 'C4', 'C5', 'C6'];
  const facts = [ ['not_acquired', 'not_acquired', 'none'], ['acquired', 'not_acquired', 'none'],
    ['acquired', 'acquired', 'logically_retired'], ['acquired', 'acquired', 'unconfirmed'],
    ['acquired', 'not_acquired', 'entry_unconfirmed'] ];
  for (let i = 0; i < 5; i++) for (const reason of reasons) it(`accepts value variant ${variants[i]}/${reason}`, () => {
    const [entry, seed, credit] = facts[i];
    expect(inspectCarrier({ ...carrier(), variant: variants[i], reason, entry, seed, credit }).ok).toBe(true);
  });
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (i !== j) it(`rejects mismatched ${variants[i]}/facts${j}`, () => {
    const [entry, seed, credit] = facts[j];
    expect(inspectCarrier({ ...carrier(), variant: variants[i], entry, seed, credit }).ok).toBe(false);
  });
  it.each(['C2', 'C3'])('rejects internal non-returnable %s', variant => {
    expect(inspectCarrier({ ...carrier(), variant, entry: 'acquired', seed: 'acquired',
      credit: variant === 'C2' ? 'entry_pending' : 'target_active' }).ok).toBe(false);
  });
  for (const [field, value] of Object.entries({ model: 'wfb-carrier-values-2', variant: 'C7', reason: 'raw_other', usage: 'observed',
    ready: 'false', runtimeCoverage: 'complete', nativeCost: 'zero', coreInvocation: 'called_once' })) {
    it(`rejects carrier ${field} outside the closed value`, () => {
      expect(inspectCarrier({ ...carrier(), [field]: value }).ok).toBe(false);
    });
  }
  it('rejects a non-enumerable carrier field and freezes the accepted result', () => {
    expect(inspectCarrier(Object.defineProperty(carrier(), 'reason', { value: 'raw_work', enumerable: false })).ok).toBe(false);
    expect(Object.isFrozen(inspectCarrier(carrier()))).toBe(true);
  });
  it('does not execute hostile hooks or retain raw errors', () => {
    let hooks = 0;
    const values = [new Proxy({}, { ownKeys() { hooks++; throw Error('secret'); } }),
      Object.defineProperty(carrier(), 'reason', { get() { hooks++; throw Error('secret'); } }),
      { ...carrier(), raw: 'secret' }, { ...carrier(), usage: 0 }, { ...carrier(), ready: true },
      { ...carrier(), entry: 'not_acquired', seed: 'acquired' }];
    for (const v of values) expect(inspectCarrier(v)).toEqual({ ok: false, reason: 'invalid_value', authority: 'none', ready: false, runtimeCoverage: 'unknown' });
    expect(hooks).toBe(0);
  });
});

const allGaps = ['runtime_coverage', 'native_cost', 'source_mapping', 'ownership', 'cost_bound'];
const row = (i: number) => ({ id: `SC${String(i).padStart(2, '0')}`, status: 'unknown', sourceRevision: null,
  symbol: null, phase: 'unknown', producer: 'unknown', costOwner: 'unknown', maxRepetitions: null,
  slots: [] as string[], paths: [] as string[], diagnostic: 'unknown', verification: 'none', gaps: [...allGaps] });
const ledger = () => ({ model: 'wfb-coverage-values-1', rows: Array.from({ length: 12 }, (_, i) => row(i + 1)),
  ready: false, runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' });
describe('coverage correspondence DATA, never proof', () => {
  it('retains all twelve Unknown rows without inventing zero or complete', () => {
    const input = ledger(), r = inspectCoverageLedger(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    input.rows[0].gaps.pop();
    expect(r.value.rows[0].gaps).toEqual(allGaps);
    expect(Object.isFrozen(r.value.rows[0].gaps)).toBe(true);
    expect(r.value.entryRequirement).toBe('unknown');
  });
  const synthetic = () => ({ ...row(1), status: 'synthetic_only', sourceRevision: 'a'.repeat(64), symbol: 'Synthetic.inspect',
    phase: 'entry_prepare', producer: 'entry', costOwner: 'entry_prepare', maxRepetitions: 1,
    slots: ['slot00'], paths: ['normal'], diagnostic: 'synthetic_only', verification: 'synthetic_only' });
  it('records synthetic correspondence without deriving requirements or runtime coverage', () => {
    const rows: unknown[] = ledger().rows;
    rows[0] = synthetic();
    const r = inspectCoverageLedger({ ...ledger(), rows });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.runtimeCoverage).toBe('unknown');
    expect(r.value.seedRequirement).toBe('unknown');
    expect(Object.isFrozen(r.value.rows)).toBe(true);
    expect(Object.isFrozen(r.value.rows[0])).toBe(true);
  });
  for (const [field, value] of Object.entries({ status: 'complete', sourceRevision: 'A'.repeat(64), symbol: 'x'.repeat(129),
    phase: 'runtime', producer: 'external', costOwner: 'free', maxRepetitions: 1_000_001,
    slots: ['slot64'], paths: ['partial', 'normal'], diagnostic: 'verified', verification: 'runtime', gaps: [] })) {
    it(`rejects invalid ${field} without promoting coverage`, () => {
      const rows: unknown[] = ledger().rows;
      rows[0] = { ...synthetic(), [field]: value };
      expect(inspectCoverageLedger({ ...ledger(), rows }).ok).toBe(false);
    });
  }
  for (const [field, value] of Object.entries({ model: 'wfb-coverage-values-2', ready: true, runtimeCoverage: 'complete',
    nativeCost: 'zero', entryRequirement: 5, seedRequirement: 75 })) {
    it(`rejects ledger ${field} outside the closed value`, () => {
      expect(inspectCoverageLedger({ ...ledger(), [field]: value }).ok).toBe(false);
    });
  }
  const withRow = (value: unknown) => {
    const rows: unknown[] = ledger().rows;
    rows[0] = value;
    return inspectCoverageLedger({ ...ledger(), rows });
  };
  for (const [field, value] of Object.entries({ sourceRevision: 'a'.repeat(64), symbol: 'Synthetic.inspect', phase: 'seed', producer: 'entry',
    costOwner: 'seed', maxRepetitions: 1, slots: ['slot00'], paths: ['normal'], diagnostic: 'synthetic_only', verification: 'synthetic_only' })) {
    it(`rejects a known ${field} on an Unknown row`, () => {
      expect(withRow({ ...row(1), [field]: value }).ok).toBe(false);
    });
  }
  let revisionHooks = 0;
  const revisionLike = { length: 64, toString() { revisionHooks++; return 'a'.repeat(64); } };
  const syntheticBad: readonly (readonly [string, unknown])[] = [
    ['sourceRevision', null], ['sourceRevision', revisionLike], ['sourceRevision', 'a'.repeat(63)], ['sourceRevision', 'g'.repeat(64)],
    ['symbol', null], ['symbol', true], ['symbol', ''], ['symbol', '1x'], ['symbol', 'a-b'], ['symbol', 'a/b'], ['symbol', '$x'], ['symbol', 'a\n'],
    ['maxRepetitions', null], ['maxRepetitions', '1'], ['maxRepetitions', 0], ['maxRepetitions', -1], ['maxRepetitions', 1.5],
    ['paths', []], ['phase', 'unknown'], ['producer', 'unknown'], ['costOwner', 'unknown'], ['diagnostic', 'unknown'], ['verification', 'none'],
  ];
  for (const [field, value] of syntheticBad) {
    it(`rejects synthetic ${field}=${JSON.stringify(value)?.slice(0, 16)}`, () => {
      expect(withRow({ ...synthetic(), [field]: value }).ok).toBe(false);
      expect(revisionHooks).toBe(0);
    });
  }
  it('allows a synthetic row without slots, because a recorded step may use none', () => {
    expect(withRow({ ...synthetic(), slots: [] }).ok).toBe(true);
  });
  for (const gap of allGaps) {
    it(`requires the ${gap} gap on Unknown and synthetic rows`, () => {
      const gaps = allGaps.filter(g => g !== gap);
      expect(withRow({ ...row(1), gaps }).ok).toBe(false);
      expect(withRow({ ...synthetic(), gaps }).ok).toBe(false);
    });
  }
  it('rejects a truncated ledger whose remaining rows are in order', () => {
    expect(inspectCoverageLedger({ ...ledger(), rows: ledger().rows.slice(0, 11) }).ok).toBe(false);
  });
  it('rejects array proxies before traps, on rows and on every row list', () => {
    let hooks = 0;
    const array = () => new Proxy([], { getPrototypeOf() { hooks++; return Array.prototype; },
      ownKeys() { hooks++; return ['length']; }, getOwnPropertyDescriptor() { hooks++; return undefined; } });
    expect(inspectCoverageLedger({ ...ledger(), rows: array() }).ok).toBe(false);
    for (const field of ['slots', 'paths', 'gaps']) expect(withRow({ ...synthetic(), [field]: array() }).ok).toBe(false);
    expect(hooks).toBe(0);
  });
  it('rejects non-standard arrays: subclass, array-like, extra keys, hidden entries and duplicates', () => {
    class Paths extends Array<string> {}
    const subclass = new Paths();
    subclass.push('normal');
    const arrayLike = Object.create(Array.prototype) as object;
    Object.defineProperty(arrayLike, '0', { value: 'normal', enumerable: true });
    Object.defineProperty(arrayLike, 'length', { value: 1 });
    for (const paths of [subclass, arrayLike, Object.assign(['normal'], { extra: 1 }), Object.assign(['normal'], { [Symbol('extra')]: 1 }),
      Object.defineProperty(['normal'], '0', { value: 'normal', enumerable: false }), ['normal', 'normal']]) {
      expect(withRow({ ...synthetic(), paths }).ok).toBe(false);
    }
    expect(withRow({ ...synthetic(), slots: ['slot00', 'slot00'] }).ok).toBe(false);
  });
  it('freezes and detaches the result, ledger, rows and every row list', () => {
    const input = synthetic(), r = withRow(input);
    expect(Object.isFrozen(r)).toBe(true);
    if (!r.ok) throw new Error('expected accepted ledger');
    const accepted = r.value.rows[0];
    expect(Object.isFrozen(r.value)).toBe(true);
    for (const field of ['slots', 'paths', 'gaps'] as const) {
      expect(Object.isFrozen(accepted[field])).toBe(true);
      expect(accepted[field]).not.toBe(input[field]);
    }
  });
  it('accepts finite representation limits, not an operational capacity approval', () => {
    const rows: unknown[] = ledger().rows;
    rows[0] = { ...synthetic(), maxRepetitions: 1_000_000, symbol: 'x'.repeat(128),
      slots: Array.from({ length: 64 }, (_, i) => `slot${String(i).padStart(2, '0')}`), paths: ['normal', 'refused', 'partial'] };
    expect(inspectCoverageLedger({ ...ledger(), rows }).ok).toBe(true);
  });
  it('rejects missing/duplicate/reordered/extra rows and sparse/accessor arrays without hooks', () => {
    let hooks = 0;
    const sparse = ledger().rows; delete (sparse as unknown[])[0];
    const getter = ledger().rows;
    Object.defineProperty(getter, '0', { get() { hooks++; return row(1); } });
    const rows = ledger().rows;
    for (const bad of [rows.slice(1), [...rows, row(13)], [rows[0], ...rows.slice(0, 11)], [...rows].reverse(), sparse, getter]) {
      expect(inspectCoverageLedger({ ...ledger(), rows: bad }).ok).toBe(false);
    }
    expect(hooks).toBe(0);
  });
  it('requires unavailable Unknown rows rather than zero-filled or claimed source evidence', () => {
    for (const change of [{ maxRepetitions: 0 }, { sourceRevision: 'a'.repeat(40) }, { verification: 'synthetic_only' }]) {
      const rows = ledger().rows.map((r, i) => i === 0 ? { ...r, ...change } : r);
      expect(inspectCoverageLedger({ ...ledger(), rows }).ok).toBe(false);
    }
  });
  it('has exact ordered DATA fields, no symbol/nonenumerable extras or custom prototypes', () => {
    for (const fn of [inspectCarrier, inspectCoverageLedger]) {
      const value = fn === inspectCarrier ? carrier() : ledger();
      for (const bad of [Object.assign(Object.create({}), value), { ...value, extra: true },
        Object.defineProperty({ ...value }, 'hidden', { value: 1 }), { ...value, [Symbol('extra')]: true },
        Object.fromEntries(Object.entries(value).reverse())]) expect(fn(bad).ok).toBe(false);
      expect(fn(Object.assign(Object.create(null), value)).ok).toBe(true);
    }
  });
  it('rejects nested proxies before traps and does not expose rejected input', () => {
    let hooks = 0;
    const proxy = new Proxy({}, { getPrototypeOf() { hooks++; throw Error('private'); } });
    const r = inspectCoverageLedger({ ...ledger(), rows: [proxy, ...ledger().rows.slice(1)] });
    expect(r).toEqual({ ok: false, reason: 'invalid_value', authority: 'none', ready: false, runtimeCoverage: 'unknown' });
    expect(hooks).toBe(0);
    expect(Object.isFrozen(r)).toBe(true);
  });
});
