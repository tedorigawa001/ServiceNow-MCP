import { describe, expect, it, vi } from 'vitest';
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
/** Captures the children and the wired arguments for assertions; the public surface stays closed. */
function wired() {
  const f = input();
  const bytes = Uint8Array.of(1);
  const hook: { onCreate?: () => void } = {};
  f.value.ops.createExclusive = () => { f.calls.push('create'); hook.onCreate?.(); return {}; };
  f.value.ops.writeOnce = (_handle, _offset, chunk) => { f.calls.push('write'); return { kind: 'written', bytes: chunk.length }; };
  f.value.ops.readBack = () => { f.calls.push('reread'); return bytes; };
  const storeSpy = vi.spyOn(FakeEvidenceStore, 'create');
  const recorderSpy = vi.spyOn(FakeFixedRecorder, 'create');
  const result = SyntheticStoreRecorderBinding.create({}, f.value);
  const [, , run, caps, clock] = storeSpy.mock.calls[0]!;
  const store = storeSpy.mock.results[0]!.value as FakeEvidenceStore;
  const recorder = recorderSpy.mock.results[0]!.value as FakeFixedRecorder;
  storeSpy.mockRestore();
  recorderSpy.mockRestore();
  if (!result.ok) throw Error('construction');
  return { ...f, root: result.root, run, caps, clock, store, recorder, hook, bytes };
}
/** Test setup only: SB-A has no bound ack, so the raw child reaches Observing for the classification tests. */
function observing() {
  const f = wired();
  f.root.reserve(true);
  f.recorder.acknowledge(f.root.snapshot().recorder!.checkpoints[0]!);
  expect(f.root.start()).toBe(true);
  expect(f.root.snapshot().recorder!.state).toBe('Observing');
  return f;
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
    const result = SyntheticStoreRecorderBinding.create(key, f.value);
    expect(result.ok).toBe(false);
    if (result.ok) throw Error('split accepted');
    expect(result.diagnostic).toMatchObject({ stage: 'owner', reason: 'construction' }); // refused before any child
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
  it('refuses a fresh run key over a root that already has an owner, also after a failure', () => {
    const f = assembly();
    f.set(NaN);
    f.root.checkpoint();
    expect(f.root.snapshot().store!.reason).toBe('cancelled');
    const second = input();
    second.value.root = f.value.root;
    const result = SyntheticStoreRecorderBinding.create({}, second.value);
    expect(result.ok).toBe(false);
    if (result.ok) throw Error('second owner');
    expect(result.diagnostic).toMatchObject({ phase: 'Stopped', stage: 'owner', reason: 'construction', recorder: undefined, store: undefined });
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock' });
  });
  it('keeps the root claim after a construction failure and refuses a non-object root', () => {
    const f = input();
    f.value.failAt = 'store';
    expect(SyntheticStoreRecorderBinding.create({}, f.value).ok).toBe(false);
    f.value.failAt = undefined;
    expect(SyntheticStoreRecorderBinding.create({}, f.value).ok).toBe(false);
    const bad = input();
    bad.value.root = 'SECRET_ROOT' as unknown as object;
    const result = SyntheticStoreRecorderBinding.create({}, bad.value);
    expect(result.ok).toBe(false);
    if (result.ok) throw Error('non-object root');
    expect(result.diagnostic).toMatchObject({ stage: 'owner', reason: 'construction' });
    expect(JSON.stringify(result.diagnostic)).not.toContain('SECRET_ROOT');
  });
  it.each([null, 1, 'key', undefined])('reports non-object run key %s as a refused claim without throwing', key => {
    expect(SyntheticStoreRecorderBinding.create(key as unknown as object, input().value)).toEqual({ ok: false, diagnostic: 'run_claim' });
  });
  it('reads a changing timing input once and gives the recorder the pinned plan', () => {
    const f = input();
    let reads = 0;
    const t = f.value.timing;
    f.value.timing = { ...t, get outerMs() { return reads++ === 0 ? 300_000 : 400_000; } };
    const result = SyntheticStoreRecorderBinding.create({}, f.value);
    if (!result.ok) throw Error('construction');
    expect(reads).toBe(1);
    expect(result.root.snapshot().recorder!.deadlines.all).toBe(300_000);
  });
  it('gives the Store the root it claimed, reading a changing root input once', () => {
    const f = input(), claimed = {}, other = {};
    let reads = 0;
    Object.defineProperty(f.value, 'root', { get() { return reads++ === 0 ? claimed : other; } });
    const spy = vi.spyOn(FakeEvidenceStore, 'create');
    const result = SyntheticStoreRecorderBinding.create({}, f.value);
    const passed = spy.mock.calls[0]![1];
    spy.mockRestore();
    expect(result.ok).toBe(true);
    expect(reads).toBe(1);
    expect(passed).toBe(claimed);
  });
  it('wires the Store to the same clock, the D_save split and a private run origin', () => {
    const f = wired();
    expect(f.caps).toMatchObject({ fileBytes: 1024, totalBytes: 8192, attempts: 8, retries: 2, deadline: 288_000, cleanupDeadline: 289_000 });
    expect(f.caps.deadline).toBe(f.root.snapshot().deadlines!.save);
    expect(f.caps.cleanupDeadline).toBe(f.root.snapshot().deadlines!.cleanup);
    for (const token of [f.root.run, f.root.recorder, f.root.store]) expect(f.run).not.toBe(token);
    f.set(10);
    f.root.reserve(true);
    f.set(9);
    expect(() => f.clock()).toThrow('binding_clock'); // regression against what the recorder read
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock', store: { reason: 'cancelled' } });
  });
  it('rejects a clock below a nonzero start on the first owner read', () => {
    const f = input();
    f.value.timing.startedAt = 100;
    f.set(99);
    const result = SyntheticStoreRecorderBinding.create({}, f.value);
    if (!result.ok) throw Error('construction');
    expect(result.root.checkpoint()).toBeUndefined();
    expect(result.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock' });
  });
  it('treats no checkpoint yet as nothing to bind, not a failure', () => {
    const f = assembly();
    expect(f.root.checkpoint()).toBeUndefined();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', reason: undefined, slots: ['empty', 'empty', 'empty', 'empty', 'empty', 'empty'] });
    expect(f.root.reserve(true)).toBe(true);
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
    expect(snapshot).toMatchObject({ phase: 'Stopped', reason: 'discarded', claims: 1, epoch: 1, evidenceIssued: false, store: { reason: 'cancelled' } });
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
  it('does not accept a discard before any preparation, as a state failure', () => {
    const f = assembly(), other = prepared();
    f.root.reserve(true);
    expect(f.root.discard(other.claim)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'state' });
    expect(other.root.snapshot()).toMatchObject({ phase: 'InFlight', reason: undefined });
  });
  it('rejects a binding whose checkpoint is no longer the queue head', () => {
    const f = wired();
    f.root.reserve(true);
    const binding = f.root.checkpoint()!;
    f.recorder.acknowledge(f.root.snapshot().recorder!.checkpoints[0]!); // raw child moves the head; setup only
    expect(f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)).toBeUndefined();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding', claims: 0 });
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
  it('keeps a stray call after an observation close from cancelling the Store or changing the phase', () => {
    const f = prepared();
    f.root.observeStop();
    const before = f.root.snapshot();
    expect(f.root.discard(f.claim)).toBe(false);
    expect(f.root.reserve(true)).toBe(false);
    expect(f.root.snapshot()).toEqual(before);
    expect(before).toMatchObject({ phase: 'Closed', epoch: 0, store: { reason: undefined } });
  });
  it('keeps the fatal diagnostics when an observation stop arrives after them', () => {
    const f = assembly(); f.root.reserve(true);
    f.set(NaN);
    f.root.checkpoint();
    f.root.observeStop();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock', store: { reason: 'cancelled' } });
  });
  it('does not relay an observation stop after D_save closed the path (left to SB-C)', () => {
    const f = assembly(); f.root.reserve(true);
    f.set(288_000);
    f.root.checkpoint();
    f.root.observeStop();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', recorder: { state: 'Reserved' }, store: { reason: undefined } });
  });
  it('admits preparation on the last time unit before D_save', () => {
    const f = assembly(); f.root.reserve(true);
    const binding = f.root.checkpoint()!;
    f.set(287_999);
    expect(f.root.prepare(f.root.run, f.root.recorder, f.root.store, binding)).toBeDefined();
    expect(f.root.snapshot().phase).toBe('InFlight');
  });
  it('closes at D_save instead of cancelling the Store when a discard arrives late', () => {
    const f = prepared();
    f.set(288_000);
    expect(f.root.discard(f.claim)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: undefined, epoch: 0, store: { reason: undefined } });
    expect(f.root.snapshot().slots[0]).toBe('retired');
  });
  it('stops on an invalid clock at discard', () => {
    const f = prepared();
    f.set(NaN);
    expect(f.root.discard(f.claim)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock', store: { reason: 'cancelled' } });
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
  it('keeps the fatal phase when the first recorder read fails', () => {
    const f = assembly();
    f.set(NaN);
    expect(f.root.reserve(true)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock', store: { reason: 'cancelled' }, recorder: { state: 'Closed' } });
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
  it('stops on a clock callback reentering while the Store reads the shared clock', () => {
    const f = input();
    const spy = vi.spyOn(FakeEvidenceStore, 'create');
    let root: SyntheticStoreRecorderBinding;
    let reenter = true;
    f.value.now = () => { if (reenter) { reenter = false; root.checkpoint(); } return 0; };
    const result = SyntheticStoreRecorderBinding.create({}, f.value);
    const clock = spy.mock.calls[0]![4];
    spy.mockRestore();
    if (!result.ok) throw Error('construction');
    root = result.root;
    expect(() => clock()).not.toThrow();
    expect(root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'clock', store: { reason: 'cancelled' } });
  });
  it.each([
    ['refused gate', 'binding', (r: SyntheticStoreRecorderBinding) => r.reserve(false)],
    ['double reserve', 'state', (r: SyntheticStoreRecorderBinding) => { r.reserve(true); return r.reserve(true); }],
    ['start without ack', 'state', (r: SyntheticStoreRecorderBinding) => { r.reserve(true); return r.start(); }],
    ['poll in Reserved', 'state', (r: SyntheticStoreRecorderBinding) => { r.reserve(true); return r.poll(); }],
  ] as const)('treats recorder misuse as a fatal stop: %s', (_name, reason, act) => {
    const f = assembly();
    expect(act(f.root)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason, epoch: 1, store: { reason: 'cancelled' }, recorder: { state: 'Closed', reason } });
  });
  it('keeps a recorder D_stop before reservation observation-only, closing without Store cancellation', () => {
    const f = assembly();
    f.set(279_000);
    expect(f.root.reserve(true)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: undefined, epoch: 0, store: { reason: undefined }, recorder: { state: 'Closed', reason: 'deadline' } });
  });
  it('keeps a too-short start window observation-only', () => {
    const f = wired();
    f.root.reserve(true);
    f.recorder.acknowledge(f.root.snapshot().recorder!.checkpoints[0]!);
    f.set(60_000);
    expect(f.root.start()).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: undefined, store: { reason: undefined }, recorder: { state: 'Closed', reason: 'window' } });
  });
  it('leaves the bridge usable through an observation stop in Observing', () => {
    const f = observing();
    f.root.observeStop();
    const snapshot = f.root.snapshot();
    expect(snapshot).toMatchObject({ phase: 'Idle', reason: undefined, epoch: 0, store: { reason: undefined }, recorder: { state: 'Draining', reason: 'cancelled' } });
    expect(snapshot.recorder!.checkpoints.map(c => c.trigger)).toEqual(['child_started', 'stop_requested']);
    expect(f.root.checkpoint()).toBeDefined();
  });
  it('leaves the bridge usable through D_stop in Observing', () => {
    const f = observing();
    f.set(279_000);
    expect(f.root.poll()).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', reason: undefined, store: { reason: undefined }, recorder: { state: 'Draining', reason: 'deadline' } });
  });
  it('stops on a contradictory test result in Observing, not only on a Closed recorder', () => {
    const f = observing();
    expect(f.root.testAnomaly()).toBe(true);
    expect(f.root.endTest('passed', true)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding', store: { reason: 'cancelled' }, recorder: { state: 'Draining', reason: 'binding' } });
  });
  it('lets a save in progress finish and close through an observation stop', () => {
    const f = wired();
    f.root.reserve(true);
    f.hook.onCreate = () => { f.root.observeStop(); };
    expect(f.store.save(f.run, 'report.partial.0001.json', f.bytes)).toBeDefined();
    expect(f.root.snapshot().phase).toBe('Closed');
    expect(f.store.snapshot()).toMatchObject({ reason: undefined, cleanup: 'confirmed' });
    expect(f.calls.filter(c => c !== 'identity')).toEqual(['create', 'write', 'flush', 'close', 'reread']);
  });
  it('leaves a healthy Store usable by the clock after an observation close', () => {
    const f = wired();
    f.root.reserve(true);
    f.root.observeStop();
    expect(f.store.save(f.run, 'manifest.json', f.bytes)).toBeDefined();
    expect(f.store.snapshot().reason).toBeUndefined();
  });
  it('still releases the handle after a fatal stop during a save', () => {
    const f = wired();
    f.root.reserve(true);
    f.hook.onCreate = () => { f.root.prepare(f.root.run, f.root.recorder, f.root.store, {} as BoundCheckpoint); };
    expect(f.store.save(f.run, 'report.partial.0001.json', f.bytes)).toBeUndefined();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding' });
    expect(f.store.snapshot()).toMatchObject({ reason: 'cancelled', cleanup: 'confirmed' });
    expect(f.calls.filter(c => c !== 'identity')).toEqual(['create', 'close']);
  });
  it('reports D_save, not a clock failure, and releases a handle when a save crosses it', () => {
    const f = wired();
    f.root.reserve(true);
    f.hook.onCreate = () => { f.set(288_500); f.root.checkpoint(); };
    expect(f.store.save(f.run, 'report.partial.0001.json', f.bytes)).toBeUndefined();
    expect(f.root.snapshot().phase).toBe('Closed');
    expect(f.store.snapshot()).toMatchObject({ reason: 'deadline', cleanup: 'confirmed' });
  });
  it('keeps validating the clock after a stop, so regression is still refused', () => {
    const f = wired();
    f.root.reserve(true);
    f.set(10);
    f.root.observeStop();
    expect(f.clock()).toBe(10);
    f.set(9);
    expect(() => f.clock()).toThrow('binding_clock');
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: undefined });
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
