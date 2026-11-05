import { describe, expect, it, vi } from 'vitest';
import { FakeFixedRecorder, type State } from './fixtures/fixed-recorder.js';
import { FakeEvidenceStore } from './fixtures/fixed-evidence-store.js';
import { SyntheticStoreRecorderBinding, type BindingInput, type BoundRun } from './fixtures/store-recorder-binding.js';

function setup(failAt?: BindingInput['failAt']) {
  let at = 0, clockReads = 0;
  let onClock: (() => void) | undefined;
  let onOp: ((name: string) => void) | undefined;
  const directory = {}, events: string[] = [];
  const files = new Map<string, { handle: object; bytes: Uint8Array; closed: boolean }>();
  const find = (h: object) => [...files.values()].find(f => f.handle === h)!;
  const faults = { write: false, close: false };
  const op = (name: string) => { events.push(name); onOp?.(name); };
  const input: BindingInput = {
    timing: { startedAt: 0, outerMs: 300000, sessionDeadline: 600000, marginMs: 1000,
      reservations: { stop: 1000, force: 2000, confirm: 3000, flush: 4000, manifest: 5000, final: 6000 } },
    root: directory, cleanupMs: 1000, manifestCleanupMs: 1000,
    limits: { fileBytes: 1024, totalBytes: 8192, attempts: 8, retries: 2 }, failAt,
    now: () => { clockReads++; onClock?.(); return at; },
    ops: {
      identity() { op('identity'); return directory; },
      createExclusive(slot) {
        op('create'); if (files.has(slot)) return undefined;
        const handle = {}; files.set(slot, { handle, bytes: new Uint8Array(), closed: false }); return handle;
      },
      writeOnce(handle, _offset, bytes) {
        op('write'); if (faults.write) throw Error('SECRET_WRITE');
        find(handle).bytes = new Uint8Array(bytes); return { kind: 'written', bytes: bytes.length };
      },
      flushOnce() { op('flush'); return true; },
      closeOnce(handle) { op('close'); expect(find(handle).closed).toBe(false); find(handle).closed = true; return !faults.close; },
      readBack(handle, slot) { op('reread'); const f = files.get(slot); return f?.handle === handle && f.closed ? f.bytes : undefined; },
    },
  };
  const r = vi.spyOn(FakeFixedRecorder, 'create'), s = vi.spyOn(FakeEvidenceStore, 'create');
  const result = SyntheticStoreRecorderBinding.create({}, input);
  const recorder = r.mock.results[0]?.value as FakeFixedRecorder | undefined;
  const store = s.mock.results[0]?.value as FakeEvidenceStore | undefined;
  const call = s.mock.calls[0]; r.mockRestore(); s.mockRestore();
  return { result, recorder, store, privateRun: call?.[2], sharedClock: call?.[4], events, files, faults,
    set: (n: number) => { at = n; }, clock: (fn?: () => void) => { onClock = fn; },
    hook: (fn?: (name: string) => void) => { onOp = fn; }, reads: () => clockReads };
}
function assembly() {
  const f = setup(); if (!f.result.ok) throw Error('construction');
  return { ...f, root: f.result.root, recorder: f.recorder!, store: f.store!, privateRun: f.privateRun!, sharedClock: f.sharedClock! };
}
type Fixture = ReturnType<typeof assembly>;
const request = (f: Fixture) => f.root.finishRecorder(f.root.run, f.root.recorder, f.root.store);
function claim(f: Fixture) {
  const head = f.root.checkpoint()!;
  return f.root.prepare(f.root.run, f.root.recorder, f.root.store, head)!;
}
function observing() {
  const f = assembly(); f.root.reserve(true); expect(f.root.persist(claim(f))).toBe(true);
  expect(f.root.start()).toBe(true); return f;
}
function cutoff(f: Fixture) { f.set(288000); expect(f.root.checkpoint()).toBeUndefined(); }
function assertPreserved(f: Fixture, before: ReturnType<FakeFixedRecorder['snapshot']>) {
  const after = f.recorder.snapshot();
  expect(after.state).toBe('Closed');
  expect(after.checkpoints).toEqual(before.checkpoints);
  after.checkpoints.forEach((entry, i) => expect(entry).toBe(before.checkpoints[i]));
  expect(after.axes).toEqual(before.axes);
  expect(after.reason).toBe(before.reason);
  expect(after.testFailure).toBe(before.testFailure);
  expect(after.issued).toBe(before.issued);
  expect(after.unsaved).toBe(before.checkpoints.length);
  expect(f.root.snapshot().unacknowledged).toBe(before.checkpoints.length);
}

describe('DT-B terminal admission and fixed commit', () => {
  it('keeps an early or foreign request unclaimed; admits exactly one same-owner request after closure', () => {
    const f = assembly(), other = assembly();
    expect(request(f)).toBe('not_ready');
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'NotRequested', claims: 0 });
    cutoff(f);
    for (const run of [other.root.run, { ...f.root.run }, f.root.snapshot().terminal as unknown as BoundRun]) {
      expect(f.root.finishRecorder(run, f.root.recorder, f.root.store)).toBe('rejected');
    }
    expect(f.root.finishRecorder(f.root.run, other.root.recorder, f.root.store)).toBe('rejected');
    expect(f.root.finishRecorder(f.root.run, f.root.recorder, other.root.store)).toBe('rejected');
    const before = f.recorder.snapshot(), reads = f.reads(), events = f.events.slice();
    expect(request(f)).toBe('Committed'); assertPreserved(f, before);
    expect(f.reads() - reads).toBe(2); expect(f.events).toEqual(events);
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'Committed', claims: 1,
      from: 'Gated', to: 'Closed', reason: 'observation_not_started', requestedEpoch: 0, completedEpoch: 0, clock: 'valid', late: false });
    expect(request(f)).toBe('rejected'); expect(f.reads() - reads).toBe(2);
    expect(f.root.reserve(true)).toBe(false);
    expect(Object.isFrozen(f.root.snapshot().terminal)).toBe(true);
  });
  it.each([
    ['Gated', 'observation_not_started'], ['Reserved', 'observation_not_started'],
    ['Observing', 'forced_from_observing'], ['Draining', 'closed_after_drain'],
    ['Verifying', 'closed_after_verify'], ['Published', 'closed_after_publish'], ['Closed', 'already_closed'],
  ] as const)('preserves %s queue, all four axes, anomaly and existing reason', (state: State, reason) => {
    const f = state === 'Gated' || state === 'Reserved' || state === 'Closed' ? assembly() : observing();
    if (state === 'Reserved' || state === 'Closed') f.root.reserve(true);
    if (state === 'Closed') f.root.observeStop();
    if (['Draining', 'Verifying', 'Published'].includes(state)) {
      f.root.testAnomaly(); f.root.endTest('failed', true);
    }
    if (state === 'Verifying' || state === 'Published') expect(f.recorder.verify(true)).toBe(true); // raw branch setup only
    if (state === 'Published') {
      for (const cp of f.recorder.snapshot().checkpoints) expect(f.recorder.acknowledge(cp)).toBe(true);
      expect(f.recorder.publish(true)).toBe(true); // facade has no publish operation
    }
    if (state !== 'Closed') cutoff(f);
    const before = f.recorder.snapshot(), bound = f.root.snapshot();
    expect(before.state).toBe(state);
    const abandon = vi.spyOn(f.recorder, 'abandon'), verify = vi.spyOn(f.recorder, 'verify'), publish = vi.spyOn(f.recorder, 'publish');
    expect(request(f)).toBe('Committed'); assertPreserved(f, before);
    expect(f.root.snapshot().terminal).toMatchObject({ reason, from: state, queued: before.checkpoints.length,
      stopNotObserved: state === 'Observing' });
    expect(f.root.snapshot().acknowledgements).toBe(bound.acknowledgements);
    expect(f.root.snapshot().saves).toEqual(bound.saves);
    expect(abandon).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
  });
  it.each(['owner', 'recorder', 'store'] as const)('retains %s construction diagnostics without exposing a failed owner', stage => {
    const f = setup(stage); expect(f.result.ok).toBe(false);
    if (f.result.ok || typeof f.result.diagnostic === 'string') throw Error('expected owner diagnostic');
    expect(f.result.diagnostic).toMatchObject({ reason: 'construction', terminal: { state: 'NotRequested', claims: 0,
      reason: stage === 'store' ? 'already_closed' : 'not_constructed' } });
    expect(f.result.diagnostic.terminal.to).toBe(stage === 'store' ? 'Closed' : undefined);
    expect(f.result.diagnostic.terminal.from).toBe(stage === 'store' ? 'Closed' : undefined);
    expect(f.result.diagnostic.terminal.queued).toBe(stage === 'store' ? 1 : undefined); // the existing fatal stop checkpoint
    expect(f.result.diagnostic.terminal.queued).toBe(f.result.diagnostic.recorder?.checkpoints.length);
    expect(f.events).toEqual([]);
  });
});

describe('DT-B Pending until the outermost safe unwind', () => {
  it.each(['reserve', 'checkpoint', 'prepare', 'discard'] as const)('does not enter inside %s or its shared-clock callback', operation => {
    const f = assembly(); let prepared: ReturnType<typeof claim> | undefined;
    if (operation !== 'reserve') f.root.reserve(true);
    if (operation === 'discard') prepared = claim(f);
    let head: ReturnType<SyntheticStoreRecorderBinding['checkpoint']>;
    if (operation === 'prepare') head = f.root.checkpoint();
    let reached = 0;
    f.clock(() => {
      f.clock(); reached++;
      f.root.observeStop(); // Reserved => Closed; Gated => Closed; active outer method still owns its interval
      expect(request(f)).toBe('Pending');
      expect(request(f)).toBe('rejected');
      expect(f.root.snapshot().terminal.state).toBe('Pending');
    });
    if (operation === 'reserve') f.root.reserve(true);
    if (operation === 'checkpoint') f.root.checkpoint();
    if (operation === 'prepare') f.root.prepare(f.root.run, f.root.recorder, f.root.store, head!);
    if (operation === 'discard') f.root.discard(prepared!);
    expect(reached).toBe(1);
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'Committed', claims: 1, clock: 'valid' });
  });
  it('defers a clock-only request, without a recursive terminal clock read', () => {
    const f = assembly(); cutoff(f); let inside = 0;
    f.clock(() => {
      f.clock(); inside++; expect(request(f)).toBe('Pending');
      expect(f.root.snapshot().terminal.clock).toBe('not_read');
    });
    const reads = f.reads(); f.sharedClock();
    expect(inside).toBe(1); expect(f.reads() - reads).toBe(3);
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'Committed', clock: 'valid' });
  });
  it.each([false, true])('waits for handle cleanup and frozen attempt, including unconfirmed close=%s', closeFailure => {
    const f = observing(), prepared = claim(f); let reached = 0;
    f.faults.close = closeFailure;
    f.hook(name => {
      if (name === 'write') { f.set(288000); f.root.observeStop(); }
      if (name === 'close') {
        reached++;
        // Store deadline is already sticky. A recursive bridge call closes its save lane.
        f.root.checkpoint();
        expect(request(f)).toBe('Pending');
        expect(f.root.snapshot().terminal.state).toBe('Pending');
        expect(f.root.snapshot().saves[1].attempt).toBeUndefined();
      }
    });
    expect(f.root.persist(prepared)).toBe(false);
    expect(reached).toBe(1);
    expect(f.events.filter(e => e === 'close')).toHaveLength(2); // earlier successful conditions + this attempt
    expect(f.root.snapshot()).toMatchObject({ terminal: { state: 'Committed', claims: 1 }, evidenceIssued: false });
    expect(f.root.snapshot().saves[1].attempt).toMatchObject({ disposition: 'partial_unverified',
      cleanup: closeFailure ? 'unconfirmed' : 'confirmed' });
    expect(f.recorder.snapshot().checkpoints.map(c => c.trigger)).toEqual(['child_started', 'stop_requested']);
  });
  it('retains acknowledged, saved-but-unacknowledged and unattempted slots with the exact remaining queue', () => {
    const f = observing(), prepared = claim(f), save = f.store.saveAttempt.bind(f.store);
    let before: ReturnType<FakeFixedRecorder['snapshot']> | undefined;
    const spy = vi.spyOn(f.store, 'saveAttempt').mockImplementation((...args) => {
      const result = save(...args); expect(result.receipt).toBeDefined();
      f.root.checkpoint(); // fixed injected post-save bridge misuse, not a second Store operation
      before = f.recorder.snapshot(); expect(request(f)).toBe('Pending');
      return result;
    });
    expect(f.root.persist(prepared)).toBe(false); spy.mockRestore();
    expect(before).toBeDefined(); assertPreserved(f, before!);
    const snapshot = f.root.snapshot();
    expect(snapshot).toMatchObject({ acknowledgements: 1, claims: 2, evidenceIssued: false,
      terminal: { state: 'Committed', claims: 1 } });
    expect(snapshot.saves.map(s => s.disposition)).toEqual([
      'acknowledged', 'saved_unacknowledged', 'not_started', 'not_started', 'not_started', 'not_started',
    ]);
    expect(snapshot.slots).toEqual(['acknowledged', 'retired', 'empty', 'empty', 'empty', 'empty']);
    expect(f.root.persist(prepared)).toBe(false);
    expect(f.root.snapshot().saves).toEqual(snapshot.saves);
  });
  it('keeps a terminal request Pending through observeStop itself', () => {
    const f = assembly(); f.root.reserve(true);
    const cancel = f.recorder.cancel.bind(f.recorder); let reached = 0;
    const spy = vi.spyOn(f.recorder, 'cancel');
    // Avoid a recursive fake cancel implementation; the inner call runs the captured original.
    spy.mockImplementationOnce(() => {
      cancel(); spy.mockImplementation(cancel);
      f.root.observeStop(); reached++;
      expect(request(f)).toBe('Pending');
      expect(f.root.snapshot().terminal.state).toBe('Pending');
      return false;
    });
    f.root.observeStop(); spy.mockRestore(); expect(reached).toBe(1);
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'Committed', claims: 1, clock: 'valid' });
  });
  it('also protects the rejection/fatal interval of an entry guard that never starts an operation', () => {
    const f = assembly(); f.root.reserve(true); claim(f); // InFlight, so start must fail before its body
    const fail = f.recorder.recorderFailure.bind(f.recorder); let reached = 0;
    const spy = vi.spyOn(f.recorder, 'recorderFailure').mockImplementation(() => {
      reached++;
      expect(request(f)).toBe('Pending');
      expect(f.root.snapshot().terminal.state).toBe('Pending');
      expect(f.recorder.snapshot().state).toBe('Reserved');
      return fail();
    });
    expect(f.root.start()).toBe(false); spy.mockRestore(); expect(reached).toBe(1);
    expect(f.root.snapshot()).toMatchObject({ reason: 'state', terminal: { state: 'Committed', claims: 1 } });
    expect(f.events).toEqual([]);
  });
  it('waits for a spy-only manifest Store operation, not only owner commands', () => {
    const f = assembly(); cutoff(f); let reached = 0;
    f.hook(name => {
      if (name === 'write') {
        reached++; expect(request(f)).toBe('Pending');
        expect(f.recorder.snapshot().state).toBe('Gated');
      }
      if (name === 'close') expect(f.root.snapshot().terminal.state).toBe('Pending');
    });
    const result = f.store.saveAttempt(f.privateRun, 'manifest.json', Uint8Array.of(1));
    expect(result.receipt).toBeDefined(); expect(reached).toBe(1);
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'Committed', clock: 'valid' });
    expect(f.store.consume(f.privateRun, result.receipt!)).toBeDefined();
  });
  it('waits for a spy-only Store consume and commits at its unwind, with the consume result intact', () => {
    const f = assembly(); cutoff(f); let reached = 0;
    const saved = f.store.saveAttempt(f.privateRun, 'manifest.json', Uint8Array.of(1));
    f.hook(name => {
      if (name !== 'identity' || reached) return;
      reached++; expect(request(f)).toBe('Pending');
      expect(f.recorder.snapshot().state).toBe('Gated');
    });
    expect(f.store.consume(f.privateRun, saved.receipt!)).toMatchObject({ slot: 'manifest.json', size: 1 });
    expect(reached).toBe(1);
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'Committed', clock: 'valid' });
  });
  it('records the advanced save epoch for a request after a fatal stop', () => {
    const f = assembly(); f.root.reserve(true); claim(f);
    expect(f.root.start()).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', epoch: 1 });
    expect(request(f)).toBe('Committed');
    expect(f.root.snapshot().terminal).toMatchObject({ requestedEpoch: 1, completedEpoch: 1, from: 'Closed', reason: 'already_closed' });
  });
});

describe('DT-B terminal clock and first-diagnostic ownership', () => {
  it.each([299999, 300000, 300001])('records D_all boundary %s without reopening or extending any deadline', at => {
    const f = assembly(); cutoff(f); f.set(at);
    const before = f.recorder.snapshot(), deadlines = f.root.snapshot().deadlines, reads = f.reads();
    expect(request(f)).toBe('Committed'); assertPreserved(f, before);
    expect(f.root.snapshot().terminal).toMatchObject({ clock: 'valid', late: at >= 300000 });
    expect(f.root.snapshot().deadlines).toEqual(deadlines); expect(f.reads() - reads).toBe(2);
  });
  it.each(['throw', 'regress', 'nan', 'negative'] as const)('still closes memory with unknown pre-clock %s and poisons Store once', kind => {
    const f = assembly(); cutoff(f); const before = f.recorder.snapshot();
    const cancel = vi.spyOn(f.store, 'cancel'); let reached = 0;
    f.clock(() => {
      reached++; if (kind === 'throw') throw Error('SECRET_CLOCK');
      f.set(kind === 'regress' ? 287999 : kind === 'negative' ? -1 : NaN);
    });
    const reads = f.reads(); expect(request(f)).toBe('Committed');
    expect(reached).toBe(1); expect(f.reads() - reads).toBe(1); assertPreserved(f, before);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: 'clock', terminal: { state: 'Committed', clock: 'unknown' } });
    expect(f.root.snapshot().terminal.late).toBeUndefined(); // unknown time is never reported as inside the window
    f.clock(); f.set(288001); expect(f.sharedClock()).toBe(288001);
    expect(f.store.save(f.privateRun, 'manifest.json', Uint8Array.of(1))).toBeUndefined();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET');
  });
  it('retains a committed memory closure on post-clock failure and refuses reentry in both reads', () => {
    const f = assembly(); cutoff(f); let reads = 0;
    f.clock(() => {
      reads++; expect(request(f)).toBe('rejected');
      expect(f.root.snapshot().terminal.state).toBe(reads === 1 ? 'Entered' : 'Committed');
      expect(f.recorder.snapshot().state).toBe(reads === 1 ? 'Gated' : 'Closed'); // pre-clock precedes the commit
      if (reads === 2) throw Error('SECRET_POST');
    });
    expect(request(f)).toBe('Committed'); expect(reads).toBe(2);
    expect(f.root.snapshot().terminal).toMatchObject({ state: 'Committed', clock: 'unknown', late: undefined, claims: 1 });
    expect(f.recorder.snapshot().state).toBe('Closed');
    expect(f.store.snapshot().reason).toBe('cancelled');
  });
  it('keeps lateness already seen at D_all by the pre-clock when the post-clock then fails', () => {
    const f = assembly(); cutoff(f); f.set(300000); let reads = 0;
    f.clock(() => { reads++; if (reads === 2) throw Error('SECRET_POST'); });
    expect(request(f)).toBe('Committed'); expect(reads).toBe(2);
    expect(f.root.snapshot().terminal).toMatchObject({ clock: 'unknown', late: true });
  });
  it('reports late when only the post-clock reaches D_all', () => {
    const f = assembly(); cutoff(f); f.set(299999); let reads = 0;
    f.clock(() => { reads++; if (reads === 2) f.set(300000); });
    expect(request(f)).toBe('Committed'); expect(reads).toBe(2);
    expect(f.root.snapshot().terminal).toMatchObject({ clock: 'valid', late: true });
  });
  it('cancels the Store only once across repeated clock faults after closure', () => {
    const f = assembly(); cutoff(f); const cancel = vi.spyOn(f.store, 'cancel');
    f.clock(() => { throw Error('SECRET_CLOCK'); });
    expect(() => f.sharedClock()).toThrow('binding_clock');
    expect(() => f.sharedClock()).toThrow('binding_clock');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: 'clock', store: { reason: 'cancelled' } });
  });
  it('treats a nested clock read after closure as a clock fault that stays Closed', () => {
    const f = assembly(); cutoff(f); let nested = 0;
    f.clock(() => {
      f.clock(); nested++;
      expect(() => f.sharedClock()).toThrow('binding_clock');
    });
    expect(f.sharedClock()).toBe(288000); expect(nested).toBe(1);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: 'clock', store: { reason: 'cancelled' } });
    expect(f.store.save(f.privateRun, 'manifest.json', Uint8Array.of(1))).toBeUndefined();
  });
  it('still closes an acquired manifest handle after one clock fault following closure', () => {
    const f = assembly(); cutoff(f); const cancel = vi.spyOn(f.store, 'cancel');
    f.hook(name => {
      if (name === 'write') f.clock(() => { f.clock(); throw Error('SECRET_CLOCK'); });
    });
    const { receipt, attempt } = f.store.saveAttempt(f.privateRun, 'manifest.json', Uint8Array.of(1));
    expect(receipt).toBeUndefined(); expect(cancel).toHaveBeenCalledTimes(1);
    expect(f.events.filter(e => e === 'close')).toHaveLength(1);
    expect(attempt).toMatchObject({ disposition: 'partial_unverified', closeAttempted: true, cleanup: 'confirmed', reason: 'cancelled' });
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', reason: 'clock' });
  });
  it('keeps earlier store/bridge/cleanup diagnoses separate from terminal clock failure', () => {
    const f = observing(); f.faults.write = true; f.faults.close = true;
    expect(f.root.persist(claim(f))).toBe(false);
    const before = f.root.snapshot(), recorder = f.recorder.snapshot();
    expect(before).toMatchObject({ reason: 'store', store: { reason: 'write' } });
    f.clock(() => { throw Error('SECRET_TERMINAL'); });
    expect(request(f)).toBe('Committed'); assertPreserved(f, recorder);
    expect(f.root.snapshot().reason).toBe('store');
    expect(f.root.snapshot().store).toEqual(before.store);
    expect(f.root.snapshot().saves).toEqual(before.saves);
    expect(f.root.snapshot().terminal.clock).toBe('unknown');
  });
});
