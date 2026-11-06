import { describe, expect, it, vi } from 'vitest';
import { createFakeDeadlineTable, FakeEvidenceStore, planSlotDeadlines, RUN_FILES,
  type EvidenceOps, type FakeDeadlineTable, type StoreCaps, type TableStoreCaps } from './fixtures/fixed-evidence-store.js';
import { SyntheticStoreRecorderBinding } from './fixtures/store-recorder-binding.js';

const input = () => ({
  timing: { startedAt: 0, outerMs: 300_000, sessionDeadline: 600_000, marginMs: 1000,
    reservations: { stop: 1000, force: 2000, confirm: 3000, flush: 4000, manifest: 5000, final: 6000 } },
  cleanupMs: 1000, manifestCleanupMs: 1000,
});
const limits = { fileBytes: 1024, totalBytes: 8192, attempts: 8, retries: 2 };
function fixture() {
  let at = 0;
  const run = {}, budget = {}, directory = {};
  const events: string[] = [];
  let hook: ((event: string) => void) | undefined;
  const files = new Map<string, { handle: object; bytes: Uint8Array; closed: boolean }>();
  const fileFor = (h: object) => [...files.values()].find(f => f.handle === h)!;
  const op = (name: string) => { events.push(name); hook?.(name); };
  const ops: EvidenceOps = {
    identity() { op('identity'); return directory; },
    createExclusive(slot) {
      op('create'); if (files.has(slot)) return undefined;
      const handle = {}; files.set(slot, { handle, bytes: new Uint8Array(), closed: false }); return handle;
    },
    writeOnce(handle, _offset, bytes) {
      op('write'); const f = fileFor(handle); expect(f.closed).toBe(false);
      f.bytes = new Uint8Array(bytes); return { kind: 'written', bytes: bytes.length };
    },
    flushOnce(handle) { op('flush'); expect(fileFor(handle).closed).toBe(false); return true; },
    closeOnce(handle) { op('close'); const f = fileFor(handle); expect(f.closed).toBe(false); f.closed = true; return true; },
    readBack(handle, slot) {
      op('reread'); const f = files.get(slot);
      return f?.handle === handle && f.closed ? new Uint8Array(f.bytes) : undefined;
    },
  };
  const issued = createFakeDeadlineTable(run, budget, input())!;
  const caps: TableStoreCaps = { ...limits, deadlineTable: issued.table, budget };
  const now = () => at;
  const store = FakeEvidenceStore.create(ops, directory, run, caps, now)!;
  return { run, budget, directory, ops, issued, caps, store, now, events,
    set: (n: number) => { at = n; }, hook: (fn?: (event: string) => void) => { hook = fn; } };
}

describe('DT-A pure fixed deadline table', () => {
  it('matches an independent subtraction oracle, pins and deeply freezes both rows', () => {
    const v = input(), p = planSlotDeadlines(v)!;
    // Independent fixed arithmetic, not planTime or the production calculator.
    expect(p).toEqual({ version: 'wfb-slot-deadlines-1', startedAt: 0, stop: 279000, confirm: 285000, all: 300000,
      evidence: { category: 'evidence', deadline: 288000, cleanupDeadline: 289000 },
      manifest: { category: 'manifest', deadline: 293000, cleanupDeadline: 294000 } });
    v.timing.reservations.flush = 1; v.manifestCleanupMs = 2;
    expect(p.manifest.deadline).toBe(293000);
    for (const value of [p, p.evidence, p.manifest]) expect(Object.isFrozen(value)).toBe(true);
  });
  it('uses the earlier original session deadline without deriving a new relative deadline', () => {
    const v = input(); v.timing.sessionDeadline = 290000;
    expect(planSlotDeadlines(v)).toMatchObject({ all: 290000, evidence: { deadline: 278000 }, manifest: { deadline: 283000 } });
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('rejects invalid or empty reserve %s', n => {
    for (const key of ['cleanupMs', 'manifestCleanupMs'] as const) {
      const v = input(); v[key] = n; expect(planSlotDeadlines(v)).toBeUndefined();
    }
  });
  it.each(['stop', 'force', 'confirm', 'flush', 'manifest', 'final'] as const)('validates original reservation %s', key => {
    const v = input(); v.timing.reservations[key] = 0; expect(planSlotDeadlines(v)).toBeUndefined();
  });
  it('rejects overflow, insufficient window, and equal phase boundaries', () => {
    const a = input(); a.timing.startedAt = Number.MAX_SAFE_INTEGER;
    const b = input(); b.timing.outerMs = 200000;
    const c = input(); c.cleanupMs = 4000;
    const d = input(); d.manifestCleanupMs = 5000;
    for (const v of [a, b, c, d]) expect(planSlotDeadlines(v)).toBeUndefined();
  });
  it('rejects missing/extra DATA, symbols, prototypes and accessors without calling them', () => {
    let reads = 0;
    const accessor = { ...input() };
    Object.defineProperty(accessor, 'cleanupMs', { enumerable: true, get() { reads++; return 1000; } });
    const variants = [null, {}, { ...input(), rows: [] }, { ...input(), [Symbol()]: 1 }, accessor,
      Object.assign(Object.create({}), input()), { ...input(), timing: { ...input().timing, extra: 1 } },
      { ...input(), timing: { ...input().timing, reservations: { stop: 1 } } }];
    for (const v of variants) expect(planSlotDeadlines(v)).toBeUndefined();
    expect(reads).toBe(0);
  });
  it('rejects nested accessors, nonenumerable fields, wrong scalar types and reflection failures', () => {
    let reads = 0;
    const a = input();
    Object.defineProperty(a.timing.reservations, 'flush', { enumerable: true, get() { reads++; return 4000; } });
    const b = input(); Object.defineProperty(b, 'cleanupMs', { value: 1000, enumerable: false });
    const c = { ...input(), cleanupMs: '1000' };
    const d = { ...input(), timing: { ...input().timing, startedAt: false } };
    const e = new Proxy({}, { ownKeys() { throw Error('SECRET_REFLECTION'); } });
    for (const v of [a, b, c, d, e]) expect(planSlotDeadlines(v)).toBeUndefined();
    expect(reads).toBe(0);
  });
});

describe('DT-A private run/budget table binding', () => {
  it('accepts only the original registered table for the same run and budget', () => {
    const f = fixture();
    expect(f.store).toBeDefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, {}, f.caps, f.now)).toBeUndefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, f.run, { ...f.caps, budget: {} }, f.now)).toBeUndefined();
    for (const table of [{ ...f.issued.table }, f.issued.plan]) {
      expect(FakeEvidenceStore.create(f.ops, f.directory, f.run,
        { ...f.caps, deadlineTable: table as FakeDeadlineTable }, f.now)).toBeUndefined();
    }
    expect(f.events).toEqual([]);
  });
  it('does not fall back to the legacy pair for malformed table-mode inputs', () => {
    const f = fixture(); let reads = 0;
    const bad = { ...f.caps, deadline: 100, cleanupDeadline: 200 };
    Object.defineProperty(bad, 'deadlineTable', { enumerable: true, get() { reads++; return f.issued.table; } });
    expect(FakeEvidenceStore.create(f.ops, f.directory, f.run, bad, f.now)).toBeUndefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, f.run, { ...f.caps, extra: true } as TableStoreCaps, f.now)).toBeUndefined();
    const inherited = Object.assign(Object.create({ deadlineTable: f.issued.table }),
      { ...limits, budget: f.budget, deadline: 100, cleanupDeadline: 200 });
    expect(FakeEvidenceStore.create(f.ops, f.directory, f.run, inherited, f.now)).toBeUndefined();
    expect(reads).toBe(0);
  });
  it('binds the first Store clock to the pinned start, not just zero', () => {
    const f = fixture(), v = input(); v.timing.startedAt = 1000;
    const t = createFakeDeadlineTable(f.run, f.budget, v)!;
    const store = FakeEvidenceStore.create(f.ops, f.directory, f.run, { ...f.caps, deadlineTable: t.table }, f.now)!;
    expect(store.save(f.run, 'conditions.json', Uint8Array.of(1))).toBeUndefined();
    expect(store.snapshot().reason).toBe('clock');
    expect(f.events).toEqual([]);
  });
  it('pins copied table-mode limits and refuses a genuine receipt from another Store', () => {
    const f = fixture(), second = createFakeDeadlineTable(f.run, f.budget, input())!;
    const other = FakeEvidenceStore.create(f.ops, f.directory, f.run, { ...limits, deadlineTable: second.table, budget: f.budget }, f.now)!;
    f.caps.deadlineTable = {} as FakeDeadlineTable; f.caps.budget = {}; f.caps.fileBytes = 0;
    const receipt = f.store.save(f.run, 'manifest.json', Uint8Array.of(1))!;
    expect(receipt).toBeDefined();
    expect(other.consume(f.run, receipt)).toBeUndefined();
    expect(other.snapshot().reason).toBe('binding');
    expect(f.store.consume(f.run, receipt)).toBeDefined();
  });
  it.each(RUN_FILES)('selects an internal category for %s and hides the private row in receipt DATA', slot => {
    const f = fixture(), result = f.store.saveAttempt(f.run, slot, Uint8Array.of(7));
    expect(result.attempt).toMatchObject({ deadlineClass: slot === 'manifest.json' ? 'manifest' : 'evidence',
      deadlineVersion: 'wfb-slot-deadlines-1', cleanup: 'confirmed', disposition: 'saved' });
    const data = f.store.consume(f.run, result.receipt!);
    expect(Object.keys(data!).sort()).toEqual(['digest', 'size', 'slot']);
    expect(data).toMatchObject({ slot, size: 1 });
    expect(f.events.filter(e => e === 'close')).toHaveLength(1);
    expect(f.store.consume(f.run, result.receipt!)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('binding');
  });
  it.each([['conditions.json', 288000], ['manifest.json', 293000]] as const)('uses %s row for save and receipt consumption', (slot, deadline) => {
    for (const delta of [-1, 0, 1]) {
      const f = fixture(); f.set(deadline + delta);
      const saved = f.store.saveAttempt(f.run, slot, Uint8Array.of(7));
      expect(!!saved.receipt).toBe(delta < 0);
      expect(f.events.includes('create')).toBe(delta < 0);
      if (delta >= 0) expect(f.store.snapshot()).toMatchObject({ reason: 'deadline', claimed: 1, charged: 1 });
      const g = fixture(), receipt = g.store.save(g.run, slot, Uint8Array.of(7))!;
      g.set(deadline + delta);
      expect(!!g.store.consume(g.run, receipt)).toBe(delta < 0);
      if (delta >= 0) expect(g.store.snapshot().reason).toBe('deadline');
    }
  });
  it('does not rescue an expired evidence save with the later manifest row', () => {
    const f = fixture(); f.set(288000);
    expect(f.store.saveAttempt(f.run, 'conditions.json', Uint8Array.of(7)).attempt).toMatchObject({
      deadlineClass: 'evidence', reason: 'deadline', reservedBytes: 1, createAttempted: false });
    expect(f.store.saveAttempt(f.run, 'manifest.json', Uint8Array.of(7)).attempt).toMatchObject({
      rejection: 'sticky', reason: 'store_stopped', reservedBytes: 0 });
    expect(f.events).toEqual([]);
  });
  it.each([['conditions.json', 288000], ['manifest.json', 293000]] as const)(
    'rejects %s post-guard and consume-time crossing on its original row', (slot, deadline) => {
      for (const crossing of ['create', 'write', 'flush', 'reread']) {
        const f = fixture(); f.set(deadline - 1);
        f.hook(event => { if (event === crossing) f.set(deadline); });
        const result = f.store.saveAttempt(f.run, slot, Uint8Array.of(1));
        expect(result.receipt).toBeUndefined();
        expect(result.attempt.reason).toBe('deadline');
        expect(f.events.filter(e => e === 'close')).toHaveLength(1);
      }
      const f = fixture(), receipt = f.store.save(f.run, slot, Uint8Array.of(1))!;
      f.set(deadline - 1);
      f.hook(event => { if (event === 'identity') f.set(deadline); });
      expect(f.store.consume(f.run, receipt)).toBeUndefined();
      expect(f.store.snapshot().reason).toBe('deadline');
      f.hook(); f.set(deadline + 1);
      expect(f.store.consume(f.run, receipt)).toBeUndefined();
    });
  it.each([['conditions.json', 288000, 289000], ['manifest.json', 293000, 294000]] as const)(
    'keeps %s cleanup on its captured row after a failed write', (slot, deadline, cleanup) => {
      for (const end of [cleanup - 1, cleanup, cleanup + 1]) {
        const f = fixture();
        f.hook(event => { if (event === 'write') { f.set(deadline); } if (event === 'close') f.set(end); });
        const result = f.store.saveAttempt(f.run, slot, Uint8Array.of(7));
        expect(result.receipt).toBeUndefined();
        expect(result.attempt).toMatchObject({ reason: 'deadline', closeAttempted: true,
          cleanup: end < cleanup ? 'confirmed' : 'late' });
        expect(f.events.filter(e => e === 'close')).toHaveLength(1);
        expect(f.events.includes('reread')).toBe(false);
      }
    });
  it.each([['conditions.json', 288000, 289000], ['manifest.json', 293000, 294000]] as const)(
    'keeps normal %s close on the selected cleanup row', (slot, deadline, cleanup) => {
      const f = fixture(); f.set(deadline - 1);
      f.hook(event => { if (event === 'close') f.set(cleanup); });
      const result = f.store.saveAttempt(f.run, slot, Uint8Array.of(1));
      expect(result.attempt).toMatchObject({ reason: 'deadline', cleanup: 'late', cleanupReason: 'deadline' });
      expect(f.events.filter(e => e === 'close')).toHaveLength(1);
    });
  it.each([['conditions.json', 289000], ['manifest.json', 294000]] as const)(
    'does not start cleanup for %s when its cleanup reserve is already exhausted', (slot, cleanup) => {
      const f = fixture(); f.hook(event => { if (event === 'write') f.set(cleanup); });
      const result = f.store.saveAttempt(f.run, slot, Uint8Array.of(1));
      expect(result.attempt).toMatchObject({ reason: 'deadline', closeAttempted: false,
        cleanup: 'unconfirmed', cleanupReason: 'deadline' });
      expect(f.events.filter(e => e === 'close')).toHaveLength(0);
    });
  it('refuses unknown slot names without create and retains the first diagnosis', () => {
    const f = fixture();
    expect(f.store.save(f.run, 'manifest.copy.json', Uint8Array.of(7))).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('binding');
    expect(f.events).toEqual([]);
  });
});

describe('DT-A review: one Store per table and strict DATA', () => {
  const tracked = <T extends object>(target: T) => {
    const hits = { n: 0 }, hit = <R>(value: R) => { hits.n++; return value; };
    const proxy = new Proxy(target, {
      ownKeys: t => hit(Reflect.ownKeys(t)), has: (t, k) => hit(Reflect.has(t, k)), get: (t, k) => hit(Reflect.get(t, k)),
      getPrototypeOf: t => hit(Reflect.getPrototypeOf(t)), getOwnPropertyDescriptor: (t, k) => hit(Reflect.getOwnPropertyDescriptor(t, k)),
    });
    return { proxy, hits };
  };
  it('refuses a second Store from a table after a sticky failure, so manifest stays unreachable', () => {
    const f = fixture(); f.set(288000);
    expect(f.store.saveAttempt(f.run, 'conditions.json', Uint8Array.of(1)).attempt.reason).toBe('deadline');
    expect(FakeEvidenceStore.create(f.ops, f.directory, f.run, f.caps, f.now)).toBeUndefined();
    expect(f.store.saveAttempt(f.run, 'manifest.json', Uint8Array.of(1)).attempt).toMatchObject({ rejection: 'sticky', reason: 'store_stopped' });
    expect(f.events).toEqual([]);
  });
  it('refuses a second live Store, so the byte budget stays shared', () => {
    const f = fixture();
    expect(FakeEvidenceStore.create(f.ops, f.directory, f.run, f.caps, f.now)).toBeUndefined();
    expect(f.store.save(f.run, 'analysis.json', Uint8Array.of(1))).toBeDefined();
  });
  it('spends a table once its binding passes, even when a later limit check refuses the Store', () => {
    const run = {}, budget = {}, f = fixture(), t = createFakeDeadlineTable(run, budget, input())!;
    const caps = { ...limits, deadlineTable: t.table, budget };
    expect(FakeEvidenceStore.create(f.ops, f.directory, run, { ...caps, fileBytes: 0 }, f.now)).toBeUndefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, run, caps, f.now)).toBeUndefined();
  });
  it('does not spend a table on a refused run or budget', () => {
    const run = {}, budget = {}, f = fixture(), t = createFakeDeadlineTable(run, budget, input())!;
    const caps = { ...limits, deadlineTable: t.table, budget };
    expect(FakeEvidenceStore.create(f.ops, f.directory, {}, caps, f.now)).toBeUndefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, run, { ...caps, budget: {} }, f.now)).toBeUndefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, run, caps, f.now)).toBeDefined();
  });
  it('refuses a valid-looking Proxy at every plan level without running a trap', () => {
    const root = tracked(input()), timing = input(), inner = tracked(timing.timing), reservations = input(), leaf = tracked(reservations.timing.reservations);
    expect(planSlotDeadlines(root.proxy)).toBeUndefined();
    expect(planSlotDeadlines({ ...timing, timing: inner.proxy })).toBeUndefined();
    expect(planSlotDeadlines({ ...reservations, timing: { ...reservations.timing, reservations: leaf.proxy } })).toBeUndefined();
    expect([root.hits.n, inner.hits.n, leaf.hits.n]).toEqual([0, 0, 0]);
  });
  it('refuses Proxy Store caps in both modes without running a trap or spending the table', () => {
    const f = fixture(), run = {}, budget = {}, t = createFakeDeadlineTable(run, budget, input())!;
    const table = tracked({ ...limits, deadlineTable: t.table, budget }), legacy = tracked({ ...limits, deadline: 100, cleanupDeadline: 200 });
    expect(FakeEvidenceStore.create(f.ops, f.directory, run, table.proxy, f.now)).toBeUndefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, run, legacy.proxy, f.now)).toBeUndefined();
    expect([table.hits.n, legacy.hits.n]).toEqual([0, 0]);
    expect(FakeEvidenceStore.create(f.ops, f.directory, run, { ...limits, deadlineTable: t.table, budget }, f.now)).toBeDefined();
  });
  it('refuses a stray budget on the legacy pair and keeps the plain pair', () => {
    const f = fixture(), pair = { ...limits, deadline: 100, cleanupDeadline: 200 };
    expect(FakeEvidenceStore.create(f.ops, f.directory, {}, { ...pair, budget: {} } as StoreCaps, f.now)).toBeUndefined();
    expect(FakeEvidenceStore.create(f.ops, f.directory, {}, pair, f.now)).toBeDefined();
  });
  it('refuses non-object or identical run and budget origins', () => {
    const same = {};
    expect(createFakeDeadlineTable(same, same, input())).toBeUndefined();
    for (const [run, budget] of [[null, {}], [{}, null], [1, {}], [{}, 'x']])
      expect(createFakeDeadlineTable(run as object, budget as object, input())).toBeUndefined();
  });
  it('refuses a numeric string for either cleanup reserve', () => {
    for (const key of ['cleanupMs', 'manifestCleanupMs'])
      expect(planSlotDeadlines({ ...input(), [key]: '1000' })).toBeUndefined();
  });
  it('accepts null-prototype DATA at each plan level', () => {
    const bare = <T extends object>(v: T) => Object.assign(Object.create(null) as T, v), v = input();
    const value = bare({ ...v, timing: bare({ ...v.timing, reservations: bare(v.timing.reservations) }) });
    expect(planSlotDeadlines(value)).toEqual(planSlotDeadlines(input()));
  });
  it('freezes the issued pair and its table token', () => {
    const f = fixture();
    expect(Object.isFrozen(f.issued)).toBe(true); expect(Object.isFrozen(f.issued.table)).toBe(true);
  });
  it.each([null, undefined, 1, 'caps'])('returns undefined for nonobject caps %s instead of throwing', caps => {
    const f = fixture();
    expect(FakeEvidenceStore.create(f.ops, f.directory, f.run, caps as unknown as StoreCaps, f.now)).toBeUndefined();
  });
});

describe('DT-A bound checkpoint lane', () => {
  it('pins the original table once and leaves a healthy manifest lane after checkpoint closure (spy-only probe)', () => {
    const f = fixture(), v = input(); let manifestReads = 0;
    const args = { ...v, root: f.directory, ops: f.ops, now: f.now, limits };
    Object.defineProperty(args, 'manifestCleanupMs', { get() { return ++manifestReads === 1 ? 1000 : 5000; } });
    const spy = vi.spyOn(FakeEvidenceStore, 'create');
    const result = SyntheticStoreRecorderBinding.create({}, args);
    const calls = spy.mock.calls.slice(), results = spy.mock.results.slice(); spy.mockRestore();
    expect(result.ok).toBe(true); if (!result.ok) throw Error('construction');
    expect(manifestReads).toBe(1);
    const raw = results[0].value as FakeEvidenceStore, privateRun = calls[0][2];
    expect(result.root.reserve(true)).toBe(true);
    f.set(288000); expect(result.root.checkpoint()).toBeUndefined();
    expect(result.root.snapshot()).toMatchObject({ phase: 'Closed', store: { reason: undefined } });
    const saved = raw.saveAttempt(privateRun, 'manifest.json', Uint8Array.of(9));
    expect(saved.attempt).toMatchObject({ disposition: 'saved', deadlineClass: 'manifest', cleanup: 'confirmed' });
    expect(raw.consume(privateRun, saved.receipt!)).toBeDefined();
    expect('saveManifest' in result.root).toBe(false);
    expect(result.root.snapshot().recorder!.axes).toMatchObject({ preservation: 'unverified', termination: 'unconfirmed' });
  });
});
