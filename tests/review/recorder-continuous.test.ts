import { describe, expect, it, vi } from 'vitest';
import { FakeFixedRecorder } from './fixtures/fixed-recorder.js';
import { FakeEvidenceStore } from './fixtures/fixed-evidence-store.js';
import { SyntheticStoreRecorderBinding, type BindingInput } from './fixtures/store-recorder-binding.js';

function fixture(attempts = 128, startedAt = 0) {
  let at = startedAt, clocks = 0;
  const directory = {}, events: { op: string; slot: string; offset?: number; bytes?: number }[] = [];
  const files = new Map<string, { handle: object; bytes: number[]; closes: number }>();
  const faults = { create: false, close: 'ok' as 'ok' | 'false' | 'throw' | 'late', flush: false };
  const progress: (number | 'eintr' | 'throw')[] = [];
  const locate = (handle: object) => [...files].find(([, f]) => f.handle === handle)!;
  const input: BindingInput = {
    timing: { startedAt, outerMs: 300000, sessionDeadline: startedAt + 600000, marginMs: 1000,
      reservations: { stop: 1000, force: 2000, confirm: 3000, flush: 4000, manifest: 5000, final: 6000 } },
    root: directory, cleanupMs: 1000, manifestCleanupMs: 1000,
    limits: { fileBytes: 1024, totalBytes: 8192, attempts, retries: 2 },
    now: () => { clocks++; return at; },
    ops: {
      identity() { events.push({ op: 'identity', slot: '' }); return directory; },
      createExclusive(slot) {
        events.push({ op: 'create', slot }); if (faults.create || files.has(slot)) return undefined;
        const handle = {}; files.set(slot, { handle, bytes: [], closes: 0 }); return handle;
      },
      writeOnce(handle, offset, bytes) {
        const [slot, f] = locate(handle); events.push({ op: 'write', slot, offset, bytes: bytes.length });
        const n = progress.shift() ?? bytes.length;
        if (n === 'throw') throw Error('SECRET_WRITE');
        if (n === 'eintr') return { kind: 'eintr' };
        f.bytes.splice(offset, n, ...bytes.slice(0, n)); return { kind: 'written', bytes: n };
      },
      flushOnce(handle) { events.push({ op: 'flush', slot: locate(handle)[0] }); return !faults.flush; },
      closeOnce(handle) {
        const [slot, f] = locate(handle); events.push({ op: 'close', slot }); f.closes++;
        if (faults.close === 'throw') throw Error('SECRET_CLOSE');
        if (faults.close === 'late') at = 289000;
        return faults.close !== 'false';
      },
      readBack(handle, slot) {
        events.push({ op: 'reread', slot }); const f = files.get(slot);
        return f?.handle === handle && f.closes === 1 ? Uint8Array.from(f.bytes) : undefined;
      },
    },
  };
  const r = vi.spyOn(FakeFixedRecorder, 'create'), s = vi.spyOn(FakeEvidenceStore, 'create');
  const result = SyntheticStoreRecorderBinding.create({}, input);
  const recorder = r.mock.results[0]?.value as FakeFixedRecorder;
  const store = s.mock.results[0]?.value as FakeEvidenceStore;
  r.mockRestore(); s.mockRestore();
  if (!result.ok) throw Error('construction');
  const root = result.root;
  function saveHead() {
    const cp = root.checkpoint()!;
    const claim = root.prepare(root.run, root.recorder, root.store, cp)!;
    return root.persist(claim);
  }
  function observing() { expect(root.reserve(true)).toBe(true); expect(saveHead()).toBe(true); expect(root.start()).toBe(true); }
  return { root, recorder, store, input, saveHead, observing, events, files, faults, progress,
    set: (n: number) => { at = n; }, clocks: () => clocks,
    finish: () => root.finishRecorder(root.run, root.recorder, root.store) };
}

describe('DT-C continuous stop, FIFO save and terminal', () => {
  it.each(['ok', 'throw'] as const)('finishes acquired-handle cleanup despite both notification throws, close=%s', close => {
    const f = fixture(); f.observing(); f.set(279000); f.root.poll(); f.faults.close = close;
    const before = f.root.snapshot().recorder!, write = f.input.ops.writeOnce;
    const store = vi.spyOn(f.store, 'cancel').mockImplementation(() => {
      expect(f.finish()).toBe('Pending'); throw Error('SECRET_CANCEL');
    });
    const recorder = vi.spyOn(f.recorder, 'recorderFailure').mockImplementation(() => { throw Error('SECRET_RECORDER'); });
    f.input.ops.writeOnce = (...args) => { f.root.checkpoint(); return write(...args); }; // boundary reentry after handle acquisition
    expect(f.saveHead()).toBe(false);
    const after = f.root.snapshot();
    expect(after).toMatchObject({ reason: 'binding', notifications: { store: 'threw', recorder: 'threw' },
      terminal: { state: 'Committed', claims: 1 } });
    expect(after.saves[1].attempt).toMatchObject({ disposition: 'partial_unverified', closeAttempted: true,
      cleanup: close === 'ok' ? 'confirmed' : 'unconfirmed' });
    expect(f.events.filter(e => e.op === 'close')).toHaveLength(2); // conditions + acquired child handle, one each
    expect(after.recorder!.checkpoints).toEqual(before.checkpoints); expect(after.recorder!.axes).toEqual(before.axes);
    expect(store).toHaveBeenCalledTimes(1); expect(recorder).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(after)).not.toContain('SECRET'); store.mockRestore(); recorder.mockRestore();
  });
  it.each([0, 1, 3])('retains the exact unsaved suffix after %s FIFO saves between D_stop and D_save', saved => {
    const f = fixture(); f.observing(); f.set(1000); f.root.testAnomaly(); f.set(121000); f.root.poll();
    f.set(122000); f.root.endTest('failed', true); f.set(279000); f.root.observeStop();
    const pending = f.root.snapshot().recorder!.checkpoints; f.set(280000);
    for (let i = 0; i < saved; i++) expect(f.saveHead()).toBe(true);
    const before = f.root.snapshot(), operations = f.events.length;
    f.set(288000); expect(f.root.checkpoint()).toBeUndefined(); expect(f.finish()).toBe('Committed');
    const after = f.root.snapshot();
    expect(after.recorder!.checkpoints).toEqual(pending.slice(saved));
    after.recorder!.checkpoints.forEach((cp, i) => expect(cp).toBe(pending[i + saved]));
    expect(after).toMatchObject({ acknowledgements: saved + 1, unacknowledged: 5 - saved,
      terminal: { state: 'Committed', queued: 5 - saved, claims: 1 } });
    expect(after.recorder!.unsaved).toBe(5 - saved);
    expect(after.recorder!.axes).toEqual(before.recorder!.axes); expect(after.saves).toEqual(before.saves);
    expect(f.events).toHaveLength(operations); expect(after.store!.reason).toBeUndefined();
  });
  it('automatically stops observation at D_stop, saves the remaining FIFO and closes only the save lane at D_save', () => {
    const f = fixture(); f.observing(); f.set(279000);
    expect(f.root.poll()).toBe(false);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Idle', recorder: { state: 'Draining', reason: 'deadline' } });
    const queue = f.root.snapshot().recorder!.checkpoints;
    expect(queue.map(c => c.trigger)).toEqual(['child_started', 'stop_requested']);
    expect(queue[1].at).toBe(279000);
    f.set(280000); for (const cp of queue) { expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(cp); expect(f.saveHead()).toBe(true); }
    const before = f.root.snapshot(); f.set(288000); f.root.checkpoint();
    expect(f.finish()).toBe('Committed');
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', acknowledgements: 3, unacknowledged: 0,
      recorder: { state: 'Closed', reason: 'deadline', axes: { test_result: 'incomplete', measurement: 'incomplete',
        preservation: 'unverified', termination: 'unconfirmed' } } });
    expect(f.root.snapshot().saves).toEqual(before.saves);
    expect(f.root.snapshot().store!.reason).toBeUndefined();
  });
  it.each(['ok', 'false', 'throw', 'late'] as const)('retains complete test axes and the original FIFO after partial write and cleanup=%s', close => {
    const f = fixture(); f.observing(); f.set(1000); f.root.endTest('passed', true);
    f.set(279000); f.root.observeStop();
    const before = f.root.snapshot().recorder!, closes = f.events.filter(e => e.op === 'close').length;
    f.faults.close = close; f.progress.push(1, 'throw'); expect(f.saveHead()).toBe(false);
    const failed = f.root.snapshot();
    expect(failed).toMatchObject({ phase: 'Stopped', reason: 'store', store: { reason: 'write' } });
    expect(failed.saves[1].attempt).toMatchObject({ disposition: 'partial_unverified', reason: 'write', closeAttempted: true,
      cleanup: close === 'ok' ? 'confirmed' : close === 'late' ? 'late' : 'unconfirmed' });
    expect(f.events.filter(e => e.op === 'close').length - closes).toBe(1);
    expect(f.finish()).toBe('Committed');
    const after = f.root.snapshot();
    expect(after.recorder!.axes).toEqual(before.axes); expect(after.saves).toEqual(failed.saves);
    expect(after.recorder!.checkpoints).toEqual(before.checkpoints);
    after.recorder!.checkpoints.forEach((cp, i) => expect(cp).toBe(before.checkpoints[i]));
    expect(after.unacknowledged).toBe(3); expect(after.recorder!.unsaved).toBe(3);
    expect(JSON.stringify(after)).not.toContain('SECRET');
  });
  it('never recursively saves a failed stop_requested checkpoint', () => {
    const f = fixture(); f.observing(); f.set(279000); f.root.poll(); f.set(280000);
    expect(f.saveHead()).toBe(true); // child_started
    expect(f.root.snapshot().recorder!.checkpoints.map(c => c.trigger)).toEqual(['stop_requested']);
    f.progress.push('throw'); expect(f.saveHead()).toBe(false);
    const creates = f.events.filter(e => e.op === 'create').length;
    expect(f.finish()).toBe('Committed'); f.root.observeStop();
    expect(f.events.filter(e => e.op === 'create')).toHaveLength(creates);
    expect(f.root.snapshot()).toMatchObject({ acknowledgements: 2, unacknowledged: 1, recorder: { unsaved: 1, issued: 3 } });
    expect(f.root.snapshot().recorder!.checkpoints.map(c => c.trigger)).toEqual(['stop_requested']);
  });
  it('retains create_failed without pretending an unacquired handle was cleaned up', () => {
    const f = fixture(); f.observing(); f.set(279000); f.root.poll(); f.faults.create = true;
    const closes = f.events.filter(e => e.op === 'close').length;
    expect(f.saveHead()).toBe(false); expect(f.finish()).toBe('Committed');
    expect(f.root.snapshot().saves[1].attempt).toMatchObject({ disposition: 'create_failed',
      createAttempted: true, handleAcquired: false, closeAttempted: false, cleanup: 'not_started' });
    expect(f.events.filter(e => e.op === 'close')).toHaveLength(closes);
  });
  it.each([false, true])('retains an uncertain recorder notification with partial side effect=%s', sideEffect => {
    const f = fixture(); f.observing(); f.set(279000); f.root.poll();
    const cp = f.root.checkpoint()!, claim = f.root.prepare(f.root.run, f.root.recorder, f.root.store, cp)!;
    const original = f.recorder.recorderFailure.bind(f.recorder);
    const spy = vi.spyOn(f.recorder, 'recorderFailure').mockImplementation(() => {
      if (sideEffect) original(); throw Error('SECRET_RECORDER');
    });
    expect(() => f.root.discard(claim)).not.toThrow();
    expect(f.root.snapshot()).toMatchObject({ reason: 'discarded', notifications: { store: 'returned', recorder: 'threw' } });
    const before = f.root.snapshot().recorder!; expect(f.finish()).toBe('Committed');
    expect(f.root.snapshot().recorder!.checkpoints).toEqual(before.checkpoints);
    expect(f.root.snapshot().recorder!.axes).toEqual(before.axes); expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET'); spy.mockRestore();
  });
  it('does not report an unclosed recorder as already_closed after partial construction and notification throw', () => {
    const f = fixture();
    const spy = vi.spyOn(FakeFixedRecorder.prototype, 'recorderFailure').mockImplementation(() => { throw Error('SECRET_CONSTRUCTION'); });
    const result = SyntheticStoreRecorderBinding.create({}, { ...f.input, root: {}, failAt: 'store' });
    spy.mockRestore(); expect(result.ok).toBe(false);
    if (result.ok || typeof result.diagnostic === 'string') throw Error('expected diagnostic');
    expect(result.diagnostic).toMatchObject({ reason: 'construction', recorder: { state: 'Gated' },
      notifications: { recorder: 'threw', store: 'not_present' },
      terminal: { state: 'NotRequested', claims: 0, reason: 'observation_not_started', from: 'Gated', to: 'Gated' } });
    expect(JSON.stringify(result.diagnostic)).not.toContain('SECRET');
  });
  it('contains an observation-stop notification throw and closes without inventing a stop checkpoint', () => {
    const f = fixture(); f.observing(); f.set(279000);
    const cancel = vi.spyOn(f.recorder, 'cancel').mockImplementation(() => { throw Error('SECRET_STOP'); });
    expect(() => f.root.observeStop()).not.toThrow();
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'notification', notifications: { observation: 'threw' } });
    const before = f.root.snapshot().recorder!;
    expect(f.finish()).toBe('Committed');
    expect(f.root.snapshot().recorder!.checkpoints).toEqual(before.checkpoints);
    expect(f.root.snapshot().recorder!.axes).toEqual(before.axes);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET'); cancel.mockRestore();
  });
  it('contains a throwing Store notification, still notifies recorder and never restarts saving', () => {
    const f = fixture(); f.observing(); f.set(279000); f.root.poll();
    const cp = f.root.checkpoint()!, claim = f.root.prepare(f.root.run, f.root.recorder, f.root.store, cp)!;
    const cancel = vi.spyOn(f.store, 'cancel').mockImplementation(() => {
      expect(f.finish()).toBe('Pending');
      expect(f.root.snapshot()).toMatchObject({ notifications: { store: 'attempted' }, terminal: { state: 'Pending' } });
      throw Error('SECRET_NOTIFY');
    });
    const notify = vi.spyOn(f.recorder, 'recorderFailure');
    expect(() => f.root.discard(claim)).not.toThrow();
    expect(notify).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1);
    expect(f.root.snapshot()).toMatchObject({ phase: 'Stopped', reason: 'discarded',
      notifications: { store: 'threw', recorder: 'returned' }, store: { reason: 'cancelled' } });
    expect(f.root.snapshot().terminal.state).toBe('Committed'); expect(f.finish()).toBe('rejected');
    expect(f.root.snapshot().recorder!.checkpoints.map(c => c.trigger)).toEqual(['child_started', 'stop_requested']);
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET');
    cancel.mockRestore(); notify.mockRestore();
  });
  it('keeps both throwing notification results and terminalizes only once after their unwind', () => {
    const f = fixture(); f.observing(); f.set(279000); f.root.poll();
    const cp = f.root.checkpoint()!, claim = f.root.prepare(f.root.run, f.root.recorder, f.root.store, cp)!;
    const store = vi.spyOn(f.store, 'cancel').mockImplementation(() => { throw Error('SECRET_STORE'); });
    const recorder = vi.spyOn(f.recorder, 'recorderFailure').mockImplementation(() => { throw Error('SECRET_RECORDER'); });
    expect(() => f.root.discard(claim)).not.toThrow();
    const before = f.root.snapshot();
    expect(before).toMatchObject({ phase: 'Stopped', reason: 'discarded', notifications: { store: 'threw', recorder: 'threw' } });
    expect(f.finish()).toBe('Committed'); f.root.observeStop(); f.root.start(); expect(f.finish()).toBe('rejected');
    expect(store).toHaveBeenCalledTimes(1); expect(recorder).toHaveBeenCalledTimes(1);
    expect(f.root.snapshot().recorder!.checkpoints).toEqual(before.recorder!.checkpoints);
    expect(f.root.snapshot().recorder!.axes).toEqual(before.recorder!.axes);
    expect(JSON.stringify(f.root.snapshot())).not.toContain('SECRET'); store.mockRestore(); recorder.mockRestore();
  });
  it('drains every original checkpoint in order after D_stop, closes at D_save and preserves all axes', () => {
    const f = fixture(); f.observing();
    f.set(1000); f.root.testAnomaly(); f.set(121000); f.root.poll();
    f.set(122000); expect(f.root.endTest('failed', true)).toBe(true);
    f.set(279000); f.root.observeStop();
    const pending = f.root.snapshot().recorder!.checkpoints;
    expect(pending.map(c => c.trigger)).toEqual(['child_started', 'first_anomaly', 'slow_hint', 'test_terminal', 'stop_requested']);
    expect(pending[4].at).toBe(122000); // explicit cancel uses the last known sample, not an invented notification timestamp
    f.set(280000);
    for (let i = 0; i < pending.length; i++) {
      expect(f.root.snapshot().recorder!.checkpoints[0]).toBe(pending[i]);
      expect(f.saveHead()).toBe(true);
    }
    const before = f.root.snapshot();
    expect(before).toMatchObject({ acknowledgements: 6, unacknowledged: 0,
      recorder: { state: 'Draining', axes: { test_result: 'failed', measurement: 'complete', preservation: 'unverified', termination: 'unconfirmed' } } });
    expect(f.events.filter(e => e.op === 'create').map(e => e.slot)).toEqual(
      ['0001', '0002', '0003', '0004', '0005', '0006'].map(s => `report.partial.${s}.json`));
    f.set(288000); expect(f.root.checkpoint()).toBeUndefined();
    expect(f.finish()).toBe('Committed');
    expect(f.root.snapshot()).toMatchObject({ phase: 'Closed', terminal: { from: 'Draining', reason: 'closed_after_drain', claims: 1 } });
    expect(f.root.snapshot().recorder!.axes).toEqual(before.recorder!.axes);
    expect(f.root.snapshot().saves).toEqual(before.saves);
    expect([...f.files.values()].every(file => file.closes === 1)).toBe(true);
  });
});

describe('DT-C independent operation/byte bounds, not runtime admission', () => {
  it('reaches the maximum 95-byte header and W=97 without changing the original deadline window', () => {
    const f = fixture(128, 1_000_000_000_000_000); f.root.reserve(true);
    const deadlines = f.root.snapshot().deadlines;
    const expected = new TextEncoder().encode('{"version":"wfb-checkpoint-1","sequence":1,"trigger":"conditions_ready","at":1000000000000000}\n');
    expect(expected).toHaveLength(95);
    f.progress.push('eintr', 'eintr', ...Array<number>(95).fill(1));
    const start = f.clocks(); expect(f.saveHead()).toBe(true);
    expect(f.events.filter(e => e.op === 'write')).toHaveLength(97);
    expect(f.events.filter(e => e.op === 'identity')).toHaveLength(205);
    expect(f.clocks() - start).toBe(418);
    expect(f.root.snapshot().store!.charged).toBe(95);
    expect(Uint8Array.from(f.files.get('report.partial.0001.json')!.bytes)).toEqual(expected);
    expect(f.root.snapshot().deadlines).toEqual(deadlines);
  });
  it.each(['retry', 'write'] as const)('includes the final refused write after maximal one-byte progress and retries: %s', reason => {
    const f = fixture(); f.root.reserve(true);
    f.progress.push(...Array<number>(79).fill(1), 'eintr', 'eintr', reason === 'retry' ? 'eintr' : 'throw');
    const start = f.clocks(); expect(f.saveHead()).toBe(false);
    const W = f.events.filter(e => e.op === 'write').length;
    expect(W).toBe(82); // H-1 progressing writes + R+1 final attempts = H+R, not H+R+1
    expect(f.root.snapshot().store!.reason).toBe(reason);
    expect(f.clocks() - start).toBeLessThanOrEqual(4 * W + 32);
    expect(f.events.filter(e => e.op === 'close')).toHaveLength(1);
    expect(f.root.snapshot().saves[0].attempt!.cleanup).toBe('confirmed');
  });
  it.each(['full', 'one-byte', 'two-eintr'] as const)('checks measured successful save costs against the independent bound: %s', mode => {
    const f = fixture(); f.root.reserve(true);
    // Independent schema oracle; no kernel encoder/planner/cost function is called.
    const expected = new TextEncoder().encode('{"version":"wfb-checkpoint-1","sequence":1,"trigger":"conditions_ready","at":0}\n');
    if (mode !== 'full') f.progress.push(...(mode === 'two-eintr' ? ['eintr', 'eintr'] as const : []), ...Array<number>(expected.length).fill(1));
    const start = f.clocks(); expect(f.saveHead()).toBe(true);
    const W = mode === 'full' ? 1 : expected.length + (mode === 'two-eintr' ? 2 : 0);
    const count = (op: string) => f.events.filter(e => e.op === op).length;
    expect(count('write')).toBe(W);
    for (const op of ['create', 'flush', 'close', 'reread']) expect(count(op)).toBe(1);
    expect(count('identity')).toBe(2 * W + 11);
    expect(f.clocks() - start).toBe(4 * W + 30); // includes checkpoint/prepare, private consume and pre-ack guards
    expect(f.events.filter(e => e.op === 'write').reduce((n, e) => n + e.bytes!, 0)).toBeLessThanOrEqual(W * expected.length);
    expect(Uint8Array.from(f.files.get('report.partial.0001.json')!.bytes)).toEqual(expected);
    expect(f.root.snapshot().store!.charged).toBe(expected.length);
  });
  it.each(['create', 'write', 'flush', 'close', 'retry', 'limit'] as const)('keeps refusal/cleanup costs within the conservative per-attempt bound: %s', fault => {
    const f = fixture(fault === 'limit' ? 2 : 128); f.root.reserve(true);
    if (fault === 'create') f.faults.create = true;
    if (fault === 'write') f.progress.push(1, 'throw');
    if (fault === 'flush') f.faults.flush = true;
    if (fault === 'close') f.faults.close = 'throw';
    if (fault === 'retry') f.progress.push('eintr', 'eintr', 'eintr');
    if (fault === 'limit') f.progress.push(...Array<number>(128).fill(1));
    const start = f.clocks(), ok = f.saveHead();
    expect(ok).toBe(false);
    expect(f.root.snapshot().store!.reason).toBe(fault === 'retry' ? 'retry' : fault === 'limit' ? 'limit' : fault);
    const W = f.events.filter(e => e.op === 'write').length;
    expect(W).toBeLessThanOrEqual(82);
    expect(W).toBeLessThanOrEqual(f.input.limits.attempts);
    expect(f.clocks() - start).toBeLessThanOrEqual(4 * W + 32);
    expect(f.events.filter(e => e.op === 'identity').length).toBeLessThanOrEqual(2 * W + 11);
    for (const op of ['create', 'flush', 'close', 'reread']) expect(f.events.filter(e => e.op === op).length).toBeLessThanOrEqual(1);
  });
  it.each(['full', 'one-byte-retry'] as const)('bounds a complete six-checkpoint transcript, including closure and terminal: %s', mode => {
    const f = fixture(); f.root.reserve(true);
    function save() {
      const cp = f.root.snapshot().recorder!.checkpoints[0];
      const text = `{"version":"wfb-checkpoint-1","sequence":${cp.sequence},"trigger":"${cp.trigger}","at":${cp.at}}\n`;
      expect(text.length).toBeLessThanOrEqual(95);
      if (mode === 'one-byte-retry') f.progress.push('eintr', 'eintr', ...Array<number>(text.length).fill(1));
      expect(f.saveHead()).toBe(true);
    }
    save(); f.root.start(); f.set(1000); f.root.testAnomaly(); f.set(121000); f.root.poll();
    f.set(122000); f.root.endTest('failed', true); f.set(279000); f.root.observeStop(); f.set(280000);
    for (let i = 0; i < 5; i++) save();
    f.set(288000); f.root.checkpoint(); const terminalStart = f.clocks(); expect(f.finish()).toBe('Committed');
    expect(f.clocks() - terminalStart).toBe(2);
    // Independent structural envelope: Q=6, H=95, A=128, R=2, M<=8, G<=2.
    const Q = 6, H = 95, W = 97;
    expect(f.events.filter(e => e.op !== 'identity').length).toBeLessThanOrEqual(Q * (W + 4));
    expect(f.events.filter(e => e.op === 'identity').length).toBeLessThanOrEqual(Q * (2 * W + 11));
    expect(f.clocks()).toBeLessThanOrEqual(Q * (4 * W + 32) + 8 + 2 + 2);
    expect(f.events.filter(e => e.op === 'write').reduce((n, e) => n + e.bytes!, 0)).toBeLessThanOrEqual(Q * W * H);
    expect(f.root.snapshot()).toMatchObject({ acknowledgements: Q, unacknowledged: 0 });
    expect(f.root.snapshot().store!.charged).toBeLessThanOrEqual(Q * H);
    for (const op of ['create', 'flush', 'close', 'reread']) expect(f.events.filter(e => e.op === op)).toHaveLength(Q);
  });
});
