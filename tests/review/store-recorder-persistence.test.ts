import { describe, expect, it, vi } from 'vitest';
import { SyntheticStoreRecorderBinding, type BindingInput, type PreparationClaim } from './fixtures/store-recorder-binding.js';
import { FakeFixedRecorder } from './fixtures/fixed-recorder.js';
import { FakeEvidenceStore } from './fixtures/fixed-evidence-store.js';

type Op = 'identity' | 'create' | 'write' | 'flush' | 'close' | 'reread';
function setup() {
  let at = 0;
  let onClock: (() => void) | undefined;
  let onOp: ((op: Op) => void) | undefined;
  const directory = {};
  const events: string[] = [];
  const files = new Map<string, { handle: object; bytes: number[] }>();
  const handles = new Map<object, string>();
  const closed = new Set<object>();
  const faults = { create: false, flush: false, close: false, reread: false, corrupt: false, identity: false };
  const progress: (number | 'eintr' | 'throw')[] = [];
  function op(kind: Op) { events.push(kind); onOp?.(kind); }
  const input: BindingInput = {
    timing: { startedAt: 0, outerMs: 300_000, sessionDeadline: 600_000, marginMs: 1_000,
      reservations: { stop: 1_000, force: 2_000, confirm: 3_000, flush: 4_000, manifest: 5_000, final: 6_000 } },
    root: directory, now: () => { onClock?.(); return at; }, cleanupMs: 1000, manifestCleanupMs: 1000,
    limits: { fileBytes: 1024, totalBytes: 8192, attempts: 8, retries: 2 },
    ops: {
      identity() { op('identity'); return faults.identity ? undefined : directory; },
      createExclusive(name) {
        op('create');
        if (faults.create || files.has(name)) return undefined;
        const handle = {};
        files.set(name, { handle, bytes: [] }); handles.set(handle, name);
        return handle;
      },
      writeOnce(handle, offset, bytes) {
        op('write');
        expect(closed.has(handle)).toBe(false);
        const n = progress.shift() ?? bytes.length;
        if (n === 'throw') throw Error('SECRET_WRITE');
        if (n === 'eintr') return { kind: 'eintr' };
        if (n > 0 && n <= bytes.length) files.get(handles.get(handle)!)!.bytes.splice(offset, n, ...bytes.slice(0, n));
        return { kind: 'written', bytes: n };
      },
      flushOnce() { op('flush'); return !faults.flush; },
      closeOnce(handle) { op('close'); expect(closed.has(handle)).toBe(false); closed.add(handle); return !faults.close; },
      readBack(handle, name) {
        op('reread');
        const file = files.get(name);
        if (faults.reread || !file || file.handle !== handle || !closed.has(handle)) return undefined;
        const result = Uint8Array.from(file.bytes);
        if (faults.corrupt) result[0] ^= 1;
        return result;
      },
    },
  };
  function construct() {
    const result = SyntheticStoreRecorderBinding.create({}, input);
    if (!result.ok) throw Error('construction');
    return result.root;
  }
  return { construct, input, files, events, faults, progress,
    set: (value: number) => { at = value; }, clock: (fn?: () => void) => { onClock = fn; }, hook: (fn?: (kind: Op) => void) => { onOp = fn; } };
}
function claim(root: SyntheticStoreRecorderBinding) {
  const binding = root.checkpoint()!;
  expect(binding).toBeDefined();
  const result = root.prepare(root.run, root.recorder, root.store, binding)!;
  expect(result).toBeDefined();
  return result;
}
function persistHead(root: SyntheticStoreRecorderBinding) { return root.persist(claim(root)); }
function reserved() {
  const f = setup(), root = f.construct();
  expect(root.reserve(true)).toBe(true);
  return { ...f, root };
}
function observing() {
  const f = reserved();
  expect(persistHead(f.root)).toBe(true);
  expect(f.root.start()).toBe(true);
  return f;
}
const nonIdentity = (events: string[]) => events.filter(op => op !== 'identity');
/** Captures the raw recorder for fault setup only; the bound path never exposes it. */
function spiedRecorder() {
  const spy = vi.spyOn(FakeFixedRecorder, 'create');
  const f = setup(), root = f.construct();
  const recorder = spy.mock.results[0]!.value as FakeFixedRecorder;
  spy.mockRestore();
  expect(root.reserve(true)).toBe(true);
  return { ...f, root, recorder };
}
/** Replaces the attempt-returning Store call: the receipt stays genuine, saved facts differ. */
function withSave<T>(replace: (save: FakeEvidenceStore['saveAttempt'], store: FakeEvidenceStore, run: object, slot: string, bytes: Uint8Array) => ReturnType<FakeEvidenceStore['saveAttempt']>, body: () => T) {
  const original = FakeEvidenceStore.prototype.saveAttempt;
  FakeEvidenceStore.prototype.saveAttempt = function (this: FakeEvidenceStore, run, slot, bytes) { return replace(original, this, run, slot, bytes); };
  try { return body(); } finally { FakeEvidenceStore.prototype.saveAttempt = original; }
}

describe('SB-B: fixed header to private consumption and ack', () => {
  it('saves exact independent header bytes, then conditions ack allows start', () => {
    const f = reserved();
    const original = f.root.snapshot().recorder!.checkpoints[0];
    expect(f.root.snapshot().acknowledgements).toBe(0);
    expect(persistHead(f.root)).toBe(true);
    const name = 'report.partial.0001.json';
    // Literal oracle, not the implementation encoder/mapper.
    const expected = '{"version":"wfb-checkpoint-1","sequence":1,"trigger":"conditions_ready","at":0}\n';
    expect(f.files.get(name)!.bytes).toEqual([...Buffer.from(expected, 'utf8')]);
    expect(nonIdentity(f.events)).toEqual(['create', 'write', 'flush', 'close', 'reread']);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', acknowledgements: 1, claims: 1, unacknowledged: 0,
      recorder: { axes: { preservation: 'unverified', termination: 'unconfirmed' } } });
    expect(f.root.snapshot().saves[0]).toMatchObject({ disposition: 'acknowledged', file: name, size: expected.length, cleanup: 'confirmed',
      digest: 'aacdba98587d693127aa25cd4a590ae1acb5d1c40450c4780c84695deaec83d1' });
    expect(f.root.snapshot().evidenceIssued).toBe(false);
    expect(f.root.snapshot().slots[0]).toBe('acknowledged');
    expect(Object.isFrozen(f.root.snapshot().saves)).toBe(true);
    expect(Object.isFrozen(f.root.snapshot().saves[0])).toBe(true);
    expect(f.root.start()).toBe(true);
    expect(f.root.snapshot().recorder!.checkpoints[0]).not.toBe(original);
    expect(f.root.snapshot().recorder!.state).toBe('Observing');
  });
  it('preserves sequence order across six triggers and never upgrades whole-run axes', () => {
    const f = observing();
    f.root.testAnomaly();
    f.set(120_001); f.root.poll();
    f.root.endTest('failed', true); f.root.observeStop();
    for (let i = 0; i < 5; i++) expect(persistHead(f.root)).toBe(true);
    expect([...f.files.keys()]).toEqual([
      'report.partial.0001.json', 'report.partial.0002.json', 'report.partial.0003.json',
      'report.partial.0004.json', 'report.partial.0005.json', 'report.partial.0006.json',
    ]);
    expect([...f.files.values()].map(file => JSON.parse(Buffer.from(file.bytes).toString()).trigger)).toEqual([
      'conditions_ready', 'child_started', 'first_anomaly', 'slow_hint', 'test_terminal', 'stop_requested',
    ]);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', claims: 6, acknowledgements: 6, unacknowledged: 0,
      recorder: { state: 'Draining', axes: { test_result: 'failed', measurement: 'complete', preservation: 'unverified', termination: 'unconfirmed' } } });
    expect(f.root.checkpoint()).toBeUndefined();
    expect(f.root.snapshot().saves.every(s => s.disposition === 'acknowledged')).toBe(true);
  });
  it.each(['anomaly_first', 'slow_first'])('keeps actual FIFO order for %s', order => {
    const f = observing();
    if (order === 'anomaly_first') f.root.testAnomaly();
    f.set(120_001); f.root.poll();
    if (order === 'slow_first') f.root.testAnomaly();
    expect(persistHead(f.root)).toBe(true); expect(persistHead(f.root)).toBe(true); expect(persistHead(f.root)).toBe(true);
    const triggers = [...f.files.values()].map(file => JSON.parse(Buffer.from(file.bytes).toString()).trigger);
    expect(triggers).toEqual(['conditions_ready', 'child_started', ...(order === 'anomaly_first' ? ['first_anomaly', 'slow_hint'] : ['slow_hint', 'first_anomaly'])]);
  });
  it('supports short writes/EINTR without a second bridge save', () => {
    const f = reserved(); f.progress.push(1, 'eintr', 2);
    expect(persistHead(f.root)).toBe(true);
    expect(nonIdentity(f.events)).toEqual(['create', 'write', 'write', 'write', 'write', 'flush', 'close', 'reread']);
    expect(f.root.snapshot().acknowledgements).toBe(1);
  });
  it('cannot replay a preparation claim or elevate legacy summary DATA', () => {
    const f = reserved(), prepared = claim(f.root);
    expect(f.root.persist(prepared)).toBe(true);
    const calls = f.events.length;
    expect(f.root.persist(prepared)).toBe(false);
    expect(f.events).toHaveLength(calls);
    expect(f.root.snapshot().acknowledgements).toBe(1);
    expect(f.root.snapshot().saves[0].disposition).toBe('acknowledged');
    const other = reserved();
    claim(other.root);
    expect(other.root.persist(f.root.snapshot().saves[0] as unknown as PreparationClaim)).toBe(false);
    expect(other.files.size).toBe(0);
  });
  it.each(['copy', 'foreign', 'primitive'])('rejects a %s preparation before save', kind => {
    const f = reserved(), prepared = claim(f.root), other = reserved();
    const candidate = kind === 'copy' ? { ...prepared } : kind === 'foreign' ? claim(other.root) : 'SECRET_TOKEN';
    expect(f.root.persist(candidate as PreparationClaim)).toBe(false);
    expect(f.files.size).toBe(0);
    expect(f.events).toEqual([]);
    expect(f.root.snapshot().acknowledgements).toBe(0);
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET_TOKEN');
  });
  it('does not read clock or run another operation after the ack linearization point', () => {
    const f = reserved(), prepared = claim(f.root);
    let reachedConsumed = false;
    f.clock(() => {
      const snapshot = f.root.snapshot();
      if (snapshot.slots[0] === 'consumed') reachedConsumed = true;
      if (snapshot.acknowledgements > 0) throw Error('CLOCK_AFTER_ACK');
    });
    expect(f.root.persist(prepared)).toBe(true);
    expect(reachedConsumed).toBe(true);
    expect(nonIdentity(f.events).at(-1)).toBe('reread');
  });
  it.each([95, 94])('checks the maximum scalar header at file cap %s', cap => {
    const f = setup(), start = Number.MAX_SAFE_INTEGER - 300_001;
    f.input.timing.startedAt = start;
    f.input.timing.sessionDeadline = Number.MAX_SAFE_INTEGER;
    f.input.limits.fileBytes = cap;
    f.set(start);
    const root = f.construct(); root.reserve(true);
    expect(persistHead(root)).toBe(cap === 95);
    if (cap === 95) expect(root.snapshot().saves[0].size).toBe(95);
    else expect(f.events).toEqual([]);
  });
  it('does not call legacy public acknowledge or public consume', () => {
    const oldAck = FakeFixedRecorder.prototype.acknowledge, oldConsume = FakeEvidenceStore.prototype.consume;
    try {
      FakeFixedRecorder.prototype.acknowledge = () => { throw Error('PUBLIC_ACK'); };
      FakeEvidenceStore.prototype.consume = () => { throw Error('PUBLIC_CONSUME'); };
      const f = reserved();
      expect(persistHead(f.root)).toBe(true);
      expect(f.root.snapshot().acknowledgements).toBe(1);
    } finally { FakeFixedRecorder.prototype.acknowledge = oldAck; FakeEvidenceStore.prototype.consume = oldConsume; }
  });
  it('uses the captured queue primitive instead of a replaceable callback at commit', () => {
    const f = reserved(), prepared = claim(f.root), shift = Array.prototype.shift;
    let result: boolean;
    f.hook(op => { if (op === 'reread') Array.prototype.shift = () => { throw Error('CALLBACK_IN_COMMIT'); }; });
    try { result = f.root.persist(prepared); }
    finally { Array.prototype.shift = shift; }
    expect(result).toBe(true);
    expect(f.root.snapshot().acknowledgements).toBe(1);
  });
});

describe('SB-B: failures keep queue / saved-unacknowledged facts', () => {
  it.each(['create', 'flush', 'close', 'reread', 'corrupt', 'identity'] as const)('keeps original head on %s failure', failure => {
    const f = reserved(); f.faults[failure] = true;
    const original = f.root.snapshot().recorder!.checkpoints[0];
    expect(persistHead(f.root)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'store', acknowledgements: 0, evidenceIssued: false });
    expect(f.root.snapshot().saves[0].attempt).toMatchObject({
      disposition: failure === 'identity' ? 'not_started' : failure === 'create' ? 'create_failed' : 'partial_unverified',
      createAttempted: failure !== 'identity', handleAcquired: failure !== 'identity' && failure !== 'create',
      closeAttempted: failure !== 'identity' && failure !== 'create',
    });
    expect(Object.isFrozen(f.root.snapshot().saves[0].attempt)).toBe(true);
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
    expect(f.root.snapshot().recorder!.unsaved).toBe(2);
    expect(f.root.start()).toBe(false);
    const creates = f.events.filter(op => op === 'create').length;
    expect(f.root.checkpoint()).toBeUndefined();
    expect(f.events.filter(op => op === 'create')).toHaveLength(creates);
    expect(f.events.filter(op => op === 'close').length).toBe(failure === 'identity' || failure === 'create' ? 0 : 1);
  });
  it.each([
    { name: 'a write that throws', progress: ['throw'], writes: 1, reason: 'write' },
    { name: 'a partial write, then a throw', progress: [1, 'throw'], writes: 2, reason: 'write' },
    { name: 'EINTR past the retry cap', progress: ['eintr', 'eintr', 'eintr'], writes: 3, reason: 'retry' },
  ] as const)('keeps the head and retries nothing after $name', ({ progress, writes, reason }) => {
    const f = reserved(); f.progress.push(...progress);
    const original = f.root.snapshot().recorder!.checkpoints[0];
    expect(persistHead(f.root)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'store', acknowledgements: 0 });
    expect(f.root.snapshot().saves[0].attempt).toMatchObject({ disposition: 'partial_unverified', createAttempted: true,
      handleAcquired: true, closeAttempted: true, cleanup: 'confirmed', reason });
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
    expect(nonIdentity(f.events)).toEqual(['create', ...Array<string>(writes).fill('write'), 'close']);
  });
  it('acknowledges after a partial write and an EINTR inside the retry cap', () => {
    const f = reserved(); f.progress.push(1, 'eintr');
    expect(persistHead(f.root)).toBe(true);
    expect(f.root.snapshot().saves[0].attempt).toMatchObject({ disposition: 'saved', cleanup: 'confirmed' });
    expect(nonIdentity(f.events)).toEqual(['create', 'write', 'write', 'write', 'flush', 'close', 'reread']);
  });
  it('retains the returned attempt object itself', () => {
    const f = reserved(), prepared = claim(f.root);
    let returned: ReturnType<FakeEvidenceStore['saveAttempt']> | undefined;
    withSave((save, store, run, slot, bytes) => (returned = save.call(store, run, slot, bytes)), () => f.root.persist(prepared));
    expect(returned).toBeDefined();
    expect(f.root.snapshot().saves[0].attempt).toBe(returned!.attempt);
  });
  it('takes a refused save from its own attempt, not from the Store-wide snapshot', () => {
    const f = observing(), prepared = claim(f.root);
    // The bridge starts only healthy saves, so the stopped Store is inserted just before the call. Setup only.
    const result = withSave((save, store, run, slot, bytes) => { store.cancel(); return save.call(store, run, slot, bytes); }, () => f.root.persist(prepared));
    expect(result).toBe(false);
    const { store, saves, acknowledgements } = f.root.snapshot();
    expect(store).toMatchObject({ reason: 'cancelled', cleanup: 'confirmed' }); // the previous save's cleanup, still Store-wide
    expect(saves[1]).toMatchObject({ disposition: 'attempted_unverified', cleanup: 'not_started', reason: 'cancelled' });
    expect(saves[1].attempt).toEqual({ disposition: 'not_started', createAttempted: false, handleAcquired: false,
      closeAttempted: false, cleanup: 'not_started', reason: 'store_stopped', rejection: 'sticky', reservedBytes: 0 });
    expect(saves[0].attempt).toMatchObject({ disposition: 'saved', cleanup: 'confirmed' });
    expect(acknowledgements).toBe(1);
    expect(nonIdentity(f.events).filter(op => op === 'create')).toHaveLength(1);
  });
  it('rejects a small header cap before Store operations', () => {
    const f = setup(); f.input.limits.fileBytes = 32;
    const root = f.construct(); root.reserve(true);
    const original = root.snapshot().recorder!.checkpoints[0];
    expect(persistHead(root)).toBe(false);
    expect(root.snapshot()).toMatchObject({ reason: 'encoding', acknowledgements: 0 });
    expect(root.snapshot().recorder!.checkpoints[0]).toBe(original);
    expect(f.events).toEqual([]);
  });
  it('keeps cumulative reservation failure and a successful earlier ack separate', () => {
    const f = setup(); f.input.limits.fileBytes = 100; f.input.limits.totalBytes = 100;
    const root = f.construct(); root.reserve(true); expect(persistHead(root)).toBe(true); root.start();
    expect(persistHead(root)).toBe(false);
    expect(root.snapshot().acknowledgements).toBe(1);
    expect(root.snapshot().saves[0].disposition).toBe('acknowledged');
    expect(root.snapshot().saves[1]).toMatchObject({ disposition: 'attempted_unverified', reason: 'limit', cleanup: 'not_started' });
    expect(root.snapshot().saves[1].attempt).toMatchObject({ disposition: 'not_started', createAttempted: false,
      closeAttempted: false, cleanup: 'not_started', reason: 'limit', reservedBytes: 0 });
    expect(root.snapshot().saves[0].attempt).toMatchObject({ disposition: 'saved', cleanup: 'confirmed' });
    expect(root.snapshot().slots.slice(0, 2)).toEqual(['acknowledged', 'retired']); // a later failure keeps the earlier ack
    expect(f.files.size).toBe(1);
  });
  it.each(['saved', 'consumed'])('retains saved_unacknowledged on D_save at %s boundary', boundary => {
    const f = reserved(), prepared = claim(f.root), original = f.root.snapshot().recorder!.checkpoints[0];
    let reached = false;
    f.clock(() => {
      const status = f.root.snapshot().slots[0];
      if (status === boundary) { reached = true; f.set(288_000); }
    });
    expect(f.root.persist(prepared)).toBe(false);
    expect(reached).toBe(true);
    expect(f.files.size).toBe(1);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', acknowledgements: 0, unacknowledged: 1, evidenceIssued: false });
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
    expect(f.root.snapshot().saves[0]).toMatchObject({ disposition: 'saved_unacknowledged', cleanup: 'confirmed' });
    expect(f.root.persist(prepared)).toBe(false);
  });
  it.each(['saved', 'consumed'])('rejects fatal reentry at %s without popping queue', boundary => {
    const f = reserved(), prepared = claim(f.root), original = f.root.snapshot().recorder!.checkpoints[0];
    let reached = false;
    f.clock(() => {
      if (!reached && f.root.snapshot().slots[0] === boundary) { reached = true; f.root.checkpoint(); }
    });
    expect(f.root.persist(prepared)).toBe(false);
    expect(reached).toBe(true);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding', acknowledgements: 0, evidenceIssued: false });
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
    expect(f.root.snapshot().saves[0].disposition).toBe('saved_unacknowledged');
  });
  it.each([2, 3])('stops when the Store guard fails on clock read %s inside the consume, keeping saved_unacknowledged', read => {
    const f = reserved(), prepared = claim(f.root), original = f.root.snapshot().recorder!.checkpoints[0];
    let reads = 0;
    f.clock(() => { if (f.root.snapshot().slots[0] === 'saved' && ++reads === read) f.faults.identity = true; });
    expect(f.root.persist(prepared)).toBe(false);
    expect(reads).toBeGreaterThanOrEqual(read);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'store', acknowledgements: 0, store: { reason: 'binding' } });
    expect(f.root.snapshot().saves[0]).toMatchObject({ disposition: 'saved_unacknowledged', consumeReason: 'binding', cleanup: 'confirmed' });
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
  });
  it('treats D_save reached inside the consume as a Store deadline failure, unlike at the bridge guard', () => {
    const inConsume = reserved(), prepared = claim(inConsume.root);
    let reads = 0;
    inConsume.clock(() => { if (inConsume.root.snapshot().slots[0] === 'saved' && ++reads === 2) inConsume.set(288_000); });
    expect(inConsume.root.persist(prepared)).toBe(false);
    expect(inConsume.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'store', acknowledgements: 0, store: { reason: 'deadline' } });
    expect(inConsume.root.snapshot().saves[0]).toMatchObject({ disposition: 'saved_unacknowledged', consumeReason: 'deadline' });
    const atGuard = reserved(), other = claim(atGuard.root);
    atGuard.clock(() => { if (atGuard.root.snapshot().slots[0] === 'saved') atGuard.set(288_000); });
    expect(atGuard.root.persist(other)).toBe(false);
    expect(atGuard.root.snapshot()).toMatchObject({ phase: 'Closed', reason: undefined, acknowledgements: 0, store: { reason: undefined } });
  });
  it.each([
    ['slot', (slot: string, bytes: Uint8Array) => { void slot; return { slot: 'report.partial.0006.json', bytes }; }],
    ['size', (slot: string, bytes: Uint8Array) => ({ slot, bytes: bytes.slice(1) })],
    ['digest', (slot: string, bytes: Uint8Array) => { const changed = bytes.slice(); changed[0] ^= 1; return { slot, bytes: changed }; }],
  ] as const)('refuses a genuine receipt whose saved %s differs from the bound expectation', (_field, change) => {
    const f = reserved(), prepared = claim(f.root), original = f.root.snapshot().recorder!.checkpoints[0];
    const result = withSave((save, store, run, slot, bytes) => {
      const next = change(slot, bytes);
      return save.call(store, run, next.slot, next.bytes);
    }, () => f.root.persist(prepared));
    expect(result).toBe(false);
    expect(f.files.size).toBe(1);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'store', acknowledgements: 0, store: { reason: 'binding' } });
    expect(f.root.snapshot().saves[0]).toMatchObject({ disposition: 'saved_unacknowledged', consumeReason: 'binding' });
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
  });
  it('normalizes an unexpected save exception without reflecting it', () => {
    const f = reserved(), prepared = claim(f.root);
    const result = withSave(() => { throw Error('SECRET_SAVE'); }, () => f.root.persist(prepared));
    expect(result).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding', acknowledgements: 0 });
    expect(f.root.snapshot().saves[0].attempt).toBeUndefined(); // absent lower result is not fabricated from a snapshot
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET_SAVE');
  });
  it('refuses before encoding when the claimed checkpoint is no longer the queue head', () => {
    const f = spiedRecorder(), prepared = claim(f.root);
    f.recorder.acknowledge(f.root.snapshot().recorder!.checkpoints[0]!);
    expect(f.root.persist(prepared)).toBe(false);
    expect(f.events).toEqual([]);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding', acknowledgements: 0 });
  });
  it('does not ack another head when the queue moved during the save', () => {
    const f = spiedRecorder(), prepared = claim(f.root);
    f.hook(op => { if (op === 'reread') f.recorder.acknowledge(f.root.snapshot().recorder!.checkpoints[0]!); });
    expect(f.root.persist(prepared)).toBe(false);
    expect(f.files.size).toBe(1);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'binding', acknowledgements: 0 });
    expect(f.root.snapshot().saves[0].disposition).toBe('saved_unacknowledged');
  });
  it('stops before save at D_save, without giving Store a failing call', () => {
    const f = reserved(), prepared = claim(f.root); f.set(288_000);
    expect(f.root.persist(prepared)).toBe(false);
    expect(f.events).toEqual([]);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', unacknowledged: 1, acknowledgements: 0, store: { reason: undefined } });
  });
});

describe('SB-B: observation stop / cleanup / four-axis separation', () => {
  it.each(['write', 'reread'] as const)('finishes an in-flight save after observation stop during %s', phase => {
    const f = observing();
    let reached = false;
    f.hook(op => { if (!reached && op === phase) { reached = true; f.root.observeStop(); } });
    expect(persistHead(f.root)).toBe(true);
    expect(reached).toBe(true);
    f.hook();
    expect(persistHead(f.root)).toBe(true);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', acknowledgements: 3, unacknowledged: 0,
      store: { reason: undefined }, recorder: { state: 'Draining', reason: 'cancelled' } });
  });
  it('does not ack a Reserved checkpoint after cancellation during saving, even if bytes exist', () => {
    const f = reserved(); f.hook(op => { if (op === 'write') f.root.observeStop(); });
    expect(persistHead(f.root)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', acknowledgements: 0, unacknowledged: 2, store: { reason: undefined } });
    expect(f.root.snapshot().saves[0].disposition).toBe('saved_unacknowledged');
    expect(f.root.snapshot().slots[0]).toBe('retired');
    expect(f.files.size).toBe(1);
  });
  it('keeps the shared clock readable for one cleanup after a fatal callback', () => {
    const f = observing();
    f.hook(op => { if (op === 'write') f.root.checkpoint(); });
    expect(persistHead(f.root)).toBe(false);
    expect(f.root.snapshot().saves[1].cleanup).toBe('confirmed');
    expect(f.events.filter(op => op === 'close')).toHaveLength(2); // one per acquired file
    expect(f.root.snapshot().acknowledgements).toBe(1);
  });
  it('reports cleanup as late without removing the original unacknowledged head', () => {
    const f = reserved(), original = f.root.snapshot().recorder!.checkpoints[0];
    f.hook(op => { if (op === 'close') f.set(289_000); });
    expect(persistHead(f.root)).toBe(false);
    expect(f.root.snapshot().saves[0]).toMatchObject({ disposition: 'attempted_unverified', cleanup: 'late', reason: 'deadline' });
    expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(original);
    expect(f.events.filter(op => op === 'close')).toHaveLength(1);
  });
  it.each([
    ['poll', (root: SyntheticStoreRecorderBinding) => root.poll()],
    ['anomaly', (root: SyntheticStoreRecorderBinding) => root.testAnomaly()],
    ['second end', (root: SyntheticStoreRecorderBinding) => root.endTest('passed', true)],
  ] as const)('keeps saving queued evidence after a stray %s following the test terminal', (_name, stray) => {
    const f = observing();
    expect(f.root.endTest('passed', true)).toBe(true);
    expect(stray(f.root)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', reason: undefined, epoch: 0, store: { reason: undefined }, recorder: { state: 'Draining', reason: 'state' } });
    expect(f.root.snapshot().recorder!.checkpoints.map(c => c.trigger)).toEqual(['child_started', 'test_terminal']);
    expect(persistHead(f.root)).toBe(true);
    expect(persistHead(f.root)).toBe(true);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', acknowledgements: 3, unacknowledged: 0, recorder: { axes: { test_result: 'passed' } } });
  });
  it('keeps the save path after a stray call in Verifying', () => {
    const f = spiedRecorder();
    expect(persistHead(f.root)).toBe(true);
    expect(f.root.start()).toBe(true);
    expect(f.root.endTest('passed', true)).toBe(true);
    expect(f.recorder.verify(true)).toBe(true); // raw child: the bound path has no verify yet
    expect(f.root.poll()).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', reason: undefined, store: { reason: undefined }, recorder: { state: 'Verifying' } });
  });
  it('still treats misuse while observing as a fatal stop', () => {
    const f = observing();
    expect(f.root.reserve(true)).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'state', store: { reason: 'cancelled' }, recorder: { state: 'Draining', reason: 'state' } });
  });
  it('reads the cleanup split and the limits once at construction', () => {
    const f = setup();
    let cleanupReads = 0, limitReads = 0, fileReads = 0;
    Object.defineProperty(f.input, 'cleanupMs', { get() { return cleanupReads++ === 0 ? 1000 : 3999; } });
    const limits = f.input.limits;
    const counted = { ...limits, get fileBytes() { return fileReads++ === 0 ? limits.fileBytes : 1; } };
    Object.defineProperty(f.input, 'limits', { get() { limitReads++; return counted; } });
    const root = f.construct();
    expect([cleanupReads, limitReads, fileReads]).toEqual([1, 1, 1]);
    expect(root.snapshot().deadlines!.save).toBe(288_000);
    expect(root.reserve(true)).toBe(true);
    expect(persistHead(root)).toBe(true);
  });
  it('does not lose complete measurement / failed test on a later Store failure', () => {
    const f = observing(); f.root.testAnomaly(); f.root.endTest('failed', true);
    f.faults.flush = true;
    expect(persistHead(f.root)).toBe(false);
    expect(f.root.snapshot().recorder!.axes).toEqual({ test_result: 'failed', measurement: 'complete', preservation: 'unverified', termination: 'unconfirmed' });
    expect(f.root.snapshot().acknowledgements).toBe(1);
  });
});
