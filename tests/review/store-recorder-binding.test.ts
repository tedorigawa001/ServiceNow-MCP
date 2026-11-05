import { describe, expect, it } from 'vitest';
import { FakeFixedRecorder } from './fixtures/fixed-recorder.js';
import { FakeEvidenceStore } from './fixtures/fixed-evidence-store.js';
import { SyntheticStoreRecorderBinding, type BindingInput, type BoundRun, type BoundRecorder, type BoundStore, type BoundCheckpoint, type PreparationClaim } from './fixtures/store-recorder-binding.js';

function input() {
  let at = 0;
  const calls: string[] = [];
  const directory = {};
  const value: BindingInput = {
    timing: { startedAt: 0, outerMs: 300_000, sessionDeadline: 600_000, marginMs: 1_000,
      reservations: { stop: 1_000, force: 2_000, confirm: 3_000, flush: 4_000, manifest: 5_000, final: 6_000 } },
    root: directory, cleanupMs: 1_000,
    limits: { fileBytes: 1024, totalBytes: 8192, attempts: 8, retries: 2 },
    now: () => at,
    ops: {
      identity() { calls.push('identity'); return directory; },
      createExclusive() { calls.push('create'); return {}; },
      writeOnce() { calls.push('write'); throw Error('UNEXPECTED_IO'); },
      flushOnce() { calls.push('flush'); return true; },
      closeOnce() { calls.push('close'); return true; },
      readBack() { calls.push('reread'); return undefined; },
    },
  };
  return { value, calls, set: (n: number) => { at = n; } };
}
function assembly() {
  const f = input(), key = {};
  const result = SyntheticStoreRecorderBinding.create(key, f.value);
  if (!result.ok) throw Error('unexpected construction failure');
  return { ...f, key, root: result.root };
}
function prepared() {
  const f = assembly();
  expect(f.root.reserve(true)).toBe(true);
  const binding = f.root.checkpoint()!;
  expect(binding).toBeDefined();
  const claim = f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)!;
  expect(claim).toBeDefined();
  return { ...f, binding, claim };
}

describe('SB-A: private construction and admissions', () => {
  it('preallocates six slots and pins the same run clock/deadlines without touching Store ops', () => {
    const f = assembly();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', stage: 'ready', claims: 0, evidenceIssued: false,
      slots: ['empty', 'empty', 'empty', 'empty', 'empty', 'empty'], deadlines: { save: 288_000, cleanup: 289_000, all: 300_000 } });
    expect(Object.isFrozen(f.root)).toBe(true);
    expect(f.root.run).not.toBe(f.root.recorder);
    expect(f.root.run).not.toBe(f.root.store);
    expect(f.root.recorder).not.toBe(f.root.store);
    f.value.timing.reservations.flush = 900_000;
    f.value.limits.fileBytes = 0;
    f.value.now = () => NaN;
    expect(f.root.reserve(true)).toBe(true);
    expect(f.root.snapshot().deadlines).toEqual({ save: 288_000, cleanup: 289_000, all: 300_000 });
    expect(f.calls).toEqual([]);
  });
  it('claims generation once per external run key, without affecting the first owner', () => {
    const f = assembly(), before = f.root.snapshot();
    expect(SyntheticStoreRecorderBinding.create(f.key, f.value)).toEqual({ ok: false, diagnostic: 'run_claim' });
    expect(f.root.snapshot()).toEqual(before);
    expect(f.calls).toEqual([]);
  });
  it.each(['owner', 'recorder', 'store'] as const)('keeps the creation claim after %s failure and normalizes diagnostics', stage => {
    const f = input(), key = {};
    f.value.failAt = stage;
    const result = SyntheticStoreRecorderBinding.create(key, f.value);
    expect(result.ok).toBe(false);
    if (result.ok) throw Error('wrong construction branch');
    expect(result.diagnostic).toMatchObject({ phase: 'Stopped', reason: 'construction', stage, claims: 0, evidenceIssued: false });
    f.value.failAt = undefined;
    expect(SyntheticStoreRecorderBinding.create(key, f.value)).toEqual({ ok: false, diagnostic: 'run_claim' });
    expect(f.calls).toEqual([]);
  });
  it.each([0, -1, 0.5, NaN, Infinity, 4000, Number.MAX_SAFE_INTEGER])('rejects invalid/empty cleanup split %s without lower admission', n => {
    const f = input(), key = {};
    f.value.cleanupMs = n;
    expect(SyntheticStoreRecorderBinding.create(key, f.value).ok).toBe(false);
    expect(SyntheticStoreRecorderBinding.create(key, input().value).ok).toBe(false);
    expect(f.calls).toEqual([]);
  });
  it('retains the run claim after actual child validation failure, not just a fault label', () => {
    const f = input(), key = {};
    f.value.limits.fileBytes = 0;
    const result = SyntheticStoreRecorderBinding.create(key, f.value);
    expect(result.ok).toBe(false);
    if (result.ok) throw Error('validation did not run');
    expect(result.diagnostic).toMatchObject({ phase: 'Stopped', stage: 'store', reason: 'construction' });
    expect(SyntheticStoreRecorderBinding.create(key, input().value).ok).toBe(false);
    expect(f.calls).toEqual([]);
  });
  it('normalizes input inspection failure into the preallocated owner diagnostics', () => {
    const f = input(), key = {};
    Object.defineProperty(f.value, 'timing', { get() { throw Error('SECRET_CONSTRUCTION'); } });
    const result = SyntheticStoreRecorderBinding.create(key, f.value);
    expect(result.ok).toBe(false);
    if (result.ok) throw Error('inspection did not run');
    expect(result.diagnostic).toMatchObject({ phase: 'Stopped', stage: 'owner', reason: 'construction' });
    expect(JSON.stringify(result.diagnostic)).not.toContain('SECRET_CONSTRUCTION');
    expect(SyntheticStoreRecorderBinding.create(key, input().value).ok).toBe(false);
    expect(f.calls).toEqual([]);
  });
  it('does not expose child classes or legacy acknowledge/save/consume methods', () => {
    const f = assembly();
    expect(f.root.recorder).not.toBeInstanceOf(FakeFixedRecorder);
    expect(f.root.store).not.toBeInstanceOf(FakeEvidenceStore);
    expect(Object.keys(f.root.recorder)).toEqual([]);
    expect(Object.keys(f.root.store)).toEqual([]);
    expect('acknowledge' in f.root).toBe(false);
    expect('save' in f.root).toBe(false);
    expect('consume' in f.root).toBe(false);
    expect('publish' in f.root).toBe(false);
    expect('verify' in f.root).toBe(false);
    f.root.reserve(true);
    const before = f.root.snapshot();
    const checkpoint = before.recorder!.checkpoints[0];
    expect(() => FakeFixedRecorder.prototype.acknowledge.call(f.root.recorder as never, checkpoint)).toThrow(TypeError);
    expect(() => FakeEvidenceStore.prototype.consume.call(f.root.store as never, f.root.run, {} as never)).toThrow(TypeError);
    expect(f.root.snapshot()).toEqual(before);
    expect(f.calls).toEqual([]);
  });
  it('requires nonstructural brands at compile time as well as runtime origins', () => {
    // TypeScript must reject each of these even though transpilation leaves plain fake objects.
    // @ts-expect-error caller DATA cannot construct a BoundRun
    const run: BoundRun = {};
    // @ts-expect-error caller DATA cannot construct a BoundRecorder
    const recorder: BoundRecorder = {};
    // @ts-expect-error caller DATA cannot construct a BoundStore
    const store: BoundStore = {};
    // @ts-expect-error checkpoint DATA cannot construct a BoundCheckpoint
    const checkpoint: BoundCheckpoint = {};
    // @ts-expect-error caller DATA cannot construct a PreparationClaim
    const claim: PreparationClaim = {};
    const f = assembly();
    f.root.reserve(true);
    expect(f.root.prepare(run, recorder, store, checkpoint)).toBeUndefined();
    expect(f.root.discard(claim)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ reason: 'binding', evidenceIssued: false, claims: 0 });
    expect(f.calls).toEqual([]);
  });
  it('cannot start from a preparatory claim, because no save evidence or ack exists yet', () => {
    const f = prepared();
    expect(f.root.snapshot()).toMatchObject({ phase: 'InFlight', claims: 1, evidenceIssued: false, unacknowledged: 1 });
    expect(f.root.start()).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'state', evidenceIssued: false });
    expect(f.root.snapshot().recorder!.checkpoints[0].trigger).toBe('conditions_ready');
    expect(f.calls).toEqual([]);
  });
});

describe('SB-A: checkpoint origin and irreversible preparation', () => {
  it('returns the same opaque binding for the same original head and discards once', () => {
    const f = assembly();
    f.root.reserve(true);
    const binding = f.root.checkpoint()!;
    expect(f.root.checkpoint()).toBe(binding);
    expect(Object.isFrozen(binding)).toBe(true);
    const original = f.root.snapshot().recorder!.checkpoints[0];
    const claim = f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)!;
    expect(Object.isFrozen(claim)).toBe(true);
    expect(f.root.snapshot().slots).toEqual(['claimed', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(f.root.discard(claim)).toBe(true);
    const snapshot = f.root.snapshot();
    expect(snapshot).toMatchObject({ phase: 'Stopped', reason: 'discarded', claims: 1, epoch: 1, evidenceIssued: false });
    expect(snapshot.slots).toEqual(['retired', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(snapshot.recorder!.checkpoints[0]).toBe(original);
    expect(snapshot.recorder!.unsaved).toBe(2); // original head plus the fatal stop checkpoint
    expect(f.root.discard(claim)).toBe(false);
    expect(f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)).toBeUndefined();
    expect(f.root.checkpoint()).toBeUndefined();
    expect(f.root.reserve(true)).toBe(false);
    expect(f.root.snapshot().reason).toBe('discarded');
    expect(f.calls).toEqual([]);
  });
  it.each(['run', 'recorder', 'store', 'checkpoint', 'raw', 'copy', 'summary', 'primitive'] as const)('rejects foreign or forged %s at preparation', kind => {
    const f = assembly(), other = assembly();
    f.root.reserve(true); other.root.reserve(true);
    const binding = f.root.checkpoint()!, foreign = other.root.checkpoint()!;
    const original = f.root.snapshot().recorder!.checkpoints[0];
    let candidate = binding;
    if (kind === 'checkpoint') candidate = foreign;
    if (kind === 'raw') candidate = original as unknown as BoundCheckpoint;
    if (kind === 'copy') candidate = { ...binding } as BoundCheckpoint;
    if (kind === 'summary') candidate = { ...original } as unknown as BoundCheckpoint;
    if (kind === 'primitive') candidate = 'SECRET' as unknown as BoundCheckpoint;
    expect(f.root.prepare(kind === 'run' ? other.root.run : f.root.run,
      kind === 'recorder' ? other.root.recorder : f.root.recorder,
      kind === 'store' ? other.root.store : f.root.store, candidate)).toBeUndefined();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding', claims: 0, evidenceIssued: false });
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET');
    expect(other.root.snapshot().phase).toBe('Idle');
    expect(f.calls).toEqual([]);
  });
  it('rejects a second prepare, retires the original in-flight claim, and never refunds it', () => {
    const f = prepared();
    expect(f.root.prepare(f.root.run, f.root.recorder, f.root.store, f.binding)).toBeUndefined();
    expect(f.root.discard(f.claim)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'state', claims: 1 });
    expect(f.root.snapshot().slots[0]).toBe('retired');
    expect(f.calls).toEqual([]);
  });
  it.each(['copy', 'foreign', 'data'] as const)('rejects %s discard token without consuming a different owner', kind => {
    const f = prepared(), other = prepared();
    const token = kind === 'foreign' ? other.claim : kind === 'copy' ? { ...f.claim } : { saved: true };
    expect(f.root.discard(token as PreparationClaim)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ reason: 'binding', claims: 1, evidenceIssued: false });
    expect(other.root.discard(other.claim)).toBe(true);
    expect(f.calls).toEqual([]);
  });
});

describe('SB-A: failure/clock boundary, not runtime I/O', () => {
  it('closes on observation stop in Reserved without cancelling Store', () => {
    const f = assembly(); f.root.reserve(true);
    const binding = f.root.checkpoint()!;
    f.root.observeStop();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', unacknowledged: 2, store: { reason: undefined, claimed: 0, charged: 0 } });
    expect(f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)).toBeUndefined();
    expect(f.calls).toEqual([]);
  });
  it('does not turn observation stop after preparation into fatal Store cancellation', () => {
    const f = prepared();
    f.root.observeStop();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: undefined, claims: 1,
      store: { reason: undefined }, unacknowledged: 2 });
    expect(f.root.discard(f.claim)).toBe(false);
    expect(f.calls).toEqual([]);
  });
  it('accepts observation stop during a preparation guard without minting a claim or cancelling Store', () => {
    const f = input();
    let root: SyntheticStoreRecorderBinding, stop = false;
    f.value.now = () => { if (stop) root.observeStop(); return 0; };
    const result = SyntheticStoreRecorderBinding.create({}, f.value);
    if (!result.ok) throw Error('construction');
    root = result.root;
    root.reserve(true);
    const checkpoint = root.checkpoint()!;
    stop = true;
    expect(root.prepare(root.run, root.recorder, root.store, checkpoint)).toBeUndefined();
    expect(root.snapshot()).toMatchObject({ phase: 'Closed', reason: undefined, claims: 1,
      store: { reason: undefined }, evidenceIssued: false, unacknowledged: 2 });
    expect(f.calls).toEqual([]);
  });
  it('retires a pre-spent claim at the same save deadline, with no Store call or cancellation', () => {
    const f = assembly(); f.root.reserve(true);
    const binding = f.root.checkpoint()!;
    f.set(288_000);
    expect(f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)).toBeUndefined();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', claims: 1, unacknowledged: 1, store: { reason: undefined } });
    expect(f.root.snapshot().slots[0]).toBe('retired');
    expect(f.calls).toEqual([]);
  });
  it.each([NaN, Infinity, -1, 0.5])('rejects invalid shared clock %s, with no evidence issuance', time => {
    const f = assembly(); f.root.reserve(true);
    const binding = f.root.checkpoint()!;
    f.set(time);
    expect(f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)).toBeUndefined();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock', claims: 1, evidenceIssued: false });
    expect(f.calls).toEqual([]);
  });
  it('detects clock regression across recorder and binding calls, not just within one child', () => {
    const f = assembly(); f.set(10); f.root.reserve(true);
    f.set(9);
    expect(f.root.checkpoint()).toBeUndefined();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock' });
    expect(f.root.snapshot().recorder!.checkpoints[0].at).toBe(10);
  });
  it.each(['throw', 'reenter'] as const)('normalizes a clock %s and blocks restoration', kind => {
    const f = input(), key = {};
    let root: SyntheticStoreRecorderBinding;
    let invoke = false;
    f.value.now = () => {
      if (invoke) {
        if (kind === 'throw') throw Error('SECRET_CLOCK');
        root.checkpoint();
      }
      return 0;
    };
    const result = SyntheticStoreRecorderBinding.create(key, f.value);
    if (!result.ok) throw Error('construction');
    root = result.root;
    root.reserve(true);
    const binding = root.checkpoint()!;
    invoke = true;
    expect(root.prepare(root.run, root.recorder, root.store, binding)).toBeUndefined();
    expect(root.snapshot()).toMatchObject({ phase: 'Stopped', claims: 1, evidenceIssued: false });
    expect(root.snapshot().reason).toBe(kind === 'throw' ? 'clock' : 'binding');
    expect(root.reserve(true)).toBe(false);
    expect(JSON.stringify(root.snapshot())).not.toContain('SECRET_CLOCK');
    expect(f.calls).toEqual([]);
  });
  it('returns immutable diagnostic DATA, not reusable claims', () => {
    const f = prepared();
    const snapshot = f.root.snapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.slots)).toBe(true);
    expect(Object.isFrozen(snapshot.deadlines)).toBe(true);
    expect(Object.isFrozen(snapshot.recorder!.checkpoints)).toBe(true);
    expect(f.root.discard(snapshot as unknown as PreparationClaim)).toBe(false);
    expect(f.root.snapshot().reason).toBe('binding');
  });
});
