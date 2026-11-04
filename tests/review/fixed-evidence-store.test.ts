import { describe, expect, it } from 'vitest';
import { FakeEvidenceStore, RUN_FILES, type EvidenceOps, type FakeSaveReceipt, type StoreCaps, type WriteResult } from './fixtures/fixed-evidence-store.js';

const abc = Uint8Array.of(97, 98, 99);
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
type Operation = 'identity' | 'create' | 'write' | 'flush' | 'close' | 'reread';
function fixture(changes: Partial<StoreCaps> = {}) {
  const root = {}, run = {};
  let currentRoot: object | undefined = root, at = 0;
  const calls: Operation[] = [];
  const files = new Map<string, { handle: object; bytes: number[] }>();
  const handles = new Map<object, string>();
  const closed = new Set<object>();
  const writes: (WriteResult | 'throw')[] = [];
  const faults = { create: false, flush: false, close: false, reread: false, corrupt: false, extra: false, truncate: false };
  let hook: ((operation: Operation) => void) | undefined;
  function enter(op: Operation) { calls.push(op); hook?.(op); }
  const ops: EvidenceOps = {
    identity() { enter('identity'); return currentRoot; },
    createExclusive(slot) {
      enter('create');
      if (faults.create || files.has(slot)) return undefined;
      const handle = {};
      files.set(slot, { handle, bytes: [] });
      handles.set(handle, slot);
      return handle;
    },
    writeOnce(handle, offset, bytes) {
      enter('write');
      if (closed.has(handle)) throw Error('SECRET_CLOSED');
      const value = writes.shift() ?? { kind: 'written', bytes: bytes.length };
      if (value === 'throw') throw Error('SECRET_WRITE');
      const file = files.get(handles.get(handle)!)!;
      if (value.kind === 'written' && Number.isSafeInteger(value.bytes) && value.bytes > 0 && value.bytes <= bytes.length)
        file.bytes.splice(offset, value.bytes, ...bytes.slice(0, value.bytes));
      return value;
    },
    flushOnce(handle) { enter('flush'); expect(handles.has(handle)).toBe(true); return !faults.flush; },
    closeOnce(handle) { enter('close'); expect(closed.has(handle)).toBe(false); closed.add(handle); return !faults.close; },
    readBack(handle, slot, limit) {
      enter('reread');
      expect(limit).toBeGreaterThanOrEqual(abc.length);
      const file = files.get(slot);
      if (faults.reread || !file || file.handle !== handle || !closed.has(handle)) return undefined;
      const bytes = [...file.bytes];
      if (faults.corrupt) bytes[0] ^= 1;
      if (faults.extra) bytes.push(0);
      if (faults.truncate) bytes.pop();
      return Uint8Array.from(bytes);
    },
  };
  const caps: StoreCaps = { fileBytes: 8, totalBytes: 16, attempts: 8, retries: 2, deadline: 100, cleanupDeadline: 120, ...changes };
  const store = FakeEvidenceStore.create(ops, root, run, caps, () => at)!;
  return { store, ops, root, run, caps, calls, files, writes, faults,
    time: (n: number) => { at = n; }, identity: (value?: object) => { currentRoot = value; },
    hook: (value?: (op: Operation) => void) => { hook = value; } };
}
const count = (calls: Operation[], op: Operation) => calls.filter(value => value === op).length;

describe('fake EvidenceStore: no-replace and one-shot receipt', () => {
  it('writes/flushes/closes/rereads in fixed order and consumes a private receipt once', () => {
    const f = fixture();
    const receipt = f.store.save(f.run, 'conditions.json', abc)!;
    expect(receipt).toBeDefined();
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.keys(receipt)).toEqual([]);
    expect(f.calls.filter(x => x !== 'identity')).toEqual(['create', 'write', 'flush', 'close', 'reread']);
    expect(f.files.get('conditions.json')!.bytes).toEqual([97, 98, 99]);
    const saved = f.store.consume(f.run, receipt);
    expect(saved).toEqual({ slot: 'conditions.json', size: 3, digest: ABC_SHA256 });
    expect(Object.isFrozen(saved)).toBe(true);
    expect(Object.isFrozen(f.store.snapshot())).toBe(true);
    expect(f.store.consume(f.run, receipt)).toBeUndefined();
    expect(f.store.snapshot()).toEqual({ reason: 'binding', claimed: 1, charged: 3, cleanup: 'confirmed' });
  });
  it('does not overwrite an existing file, then refuses any restart', () => {
    const f = fixture();
    f.files.set('conditions.json', { handle: {}, bytes: [42] });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.save(f.run, 'report.final.json', abc)).toBeUndefined();
    expect(f.files.get('conditions.json')!.bytes).toEqual([42]);
    expect(count(f.calls, 'create')).toBe(1);
    expect(count(f.calls, 'write')).toBe(0);
    expect(f.store.snapshot().reason).toBe('create');
  });
  it('rejects a successful slot replay before another create', () => {
    const f = fixture();
    expect(f.store.save(f.run, 'report.final.json', abc)).toBeDefined();
    expect(f.store.save(f.run, 'report.final.json', abc)).toBeUndefined();
    expect(count(f.calls, 'create')).toBe(1);
  });
  it.each(['../x', '/tmp/x', 'report.partial.0000.json', 'report.partial.0007.json', 'session.0001.json', 'conditions.json/child'])('rejects unknown name %s', name => {
    const f = fixture();
    expect(f.store.save(f.run, name, abc)).toBeUndefined();
    expect(f.calls).toEqual([]);
  });
  it.each(['foreign', 'copy', 'summary', 'wrong_run'])('refuses %s receipt, with no data promotion', mode => {
    const f = fixture(), other = fixture();
    const receipt = f.store.save(f.run, 'conditions.json', abc)!;
    const wrong = mode === 'foreign' ? other.store.save(other.run, 'conditions.json', abc)!
      : mode === 'copy' ? { ...receipt } as FakeSaveReceipt
        : mode === 'summary' ? { slot: 'conditions.json', size: 3, digest: ABC_SHA256 } as unknown as FakeSaveReceipt : receipt;
    expect(f.store.consume(mode === 'wrong_run' ? {} : f.run, wrong)).toBeUndefined();
    expect(f.store.consume(f.run, receipt)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('binding');
  });
  it.each([
    ['JSON string', '{"slot":"conditions.json","size":3}'], ['number', 1], ['null', null], ['undefined', undefined], ['function', () => undefined],
  ])('treats a %s receipt as the same sticky failure as a forged object', (_name, wrong) => {
    const f = fixture();
    const receipt = f.store.save(f.run, 'conditions.json', abc)!;
    expect(f.store.consume(f.run, wrong as unknown as FakeSaveReceipt)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('binding');
    expect(f.store.consume(f.run, receipt)).toBeUndefined();
  });
  it('rejects wrong run before I/O and retains no caller bytes', () => {
    const f = fixture();
    expect(f.store.save({}, 'conditions.json', abc)).toBeUndefined();
    expect(f.calls).toEqual([]);
    const g = fixture(), input = Uint8Array.from(abc);
    const receipt = g.store.save(g.run, 'conditions.json', input)!;
    input.fill(0);
    expect(g.store.consume(g.run, receipt)?.digest).toBe(ABC_SHA256);
  });
  it('copies caller bytes before the first create callback can mutate them', () => {
    const f = fixture(), bytes = Uint8Array.from(abc);
    f.hook(op => { if (op === 'create') bytes.fill(0); });
    const receipt = f.store.save(f.run, 'conditions.json', bytes)!;
    expect(f.files.get('conditions.json')!.bytes).toEqual([97, 98, 99]);
    expect(f.store.consume(f.run, receipt)?.digest).toBe(ABC_SHA256);
  });
  it('copies at the size check, so an identity callback cannot grow the reservation or the copy', () => {
    const f = fixture();
    const buffer = new (ArrayBuffer as unknown as new (n: number, o: { maxByteLength: number }) => ArrayBuffer & { resize(n: number): void })(3, { maxByteLength: 64 });
    const bytes = new Uint8Array(buffer);
    bytes.set(abc);
    let grown = false;
    f.hook(op => { if (op === 'identity' && !grown) { grown = true; buffer.resize(64); } });
    const receipt = f.store.save(f.run, 'conditions.json', bytes)!;
    expect(grown).toBe(true);
    expect(f.store.snapshot().charged).toBe(3);
    expect(f.files.get('conditions.json')!.bytes).toEqual([97, 98, 99]);
    expect(f.store.consume(f.run, receipt)).toEqual({ slot: 'conditions.json', size: 3, digest: ABC_SHA256 });
  });
  it('uses the real size and bytes when a subclass misreports its length', () => {
    class Short extends Uint8Array { override get byteLength() { return 1; } }
    const f = fixture();
    expect(f.store.save(f.run, 'conditions.json', new Short(9))).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'limit', charged: 0 });
    expect(f.calls).toEqual([]);
    const g = fixture();
    for (const slot of ['conditions.json', 'runner.mjs']) expect(g.store.save(g.run, slot, new Short(8))).toBeDefined();
    expect(g.store.snapshot().charged).toBe(16);
    expect(g.store.save(g.run, 'load-setup.ts', new Short(1))).toBeUndefined();
    expect(g.store.snapshot()).toMatchObject({ reason: 'limit', charged: 16 });
  });
  it('copies the held bytes, not what a subclass iterator yields', () => {
    class Lying extends Uint8Array { override *[Symbol.iterator](): ArrayIterator<number> { yield* [1, 2, 3, 4, 5, 6, 7, 8, 9]; } }
    const f = fixture();
    const receipt = f.store.save(f.run, 'conditions.json', new Lying(abc))!;
    expect(f.files.get('conditions.json')!.bytes).toEqual([97, 98, 99]);
    expect(f.store.consume(f.run, receipt)).toEqual({ slot: 'conditions.json', size: 3, digest: ABC_SHA256 });
  });
  it.each([
    ['array', [97, 98, 99], 'limit'], ['string', 'abc', 'limit'], ['Uint16Array', new Uint16Array(1), 'limit'], ['null', null, 'limit'],
    ['fake instance', Object.create(Uint8Array.prototype), 'binding'],
  ])('refuses %s content before reservation or I/O', (_name, content, reason) => {
    const f = fixture();
    expect(f.store.save(f.run, 'conditions.json', content as unknown as Uint8Array)).toBeUndefined();
    expect(f.calls).toEqual([]);
    expect(f.store.snapshot()).toMatchObject({ reason, claimed: 1, charged: 0 });
  });
  it('accepts all 14 fixed slots, and empty content has the known SHA-256', () => {
    const f = fixture({ totalBytes: 64 });
    for (const slot of RUN_FILES) {
      const receipt = f.store.save(f.run, slot, new Uint8Array())!;
      expect(f.store.consume(f.run, receipt)?.digest).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    }
    expect(f.store.snapshot().claimed).toBe(14);
    expect(count(f.calls, 'write')).toBe(0);
    expect(count(f.calls, 'close')).toBe(14);
  });
});

describe('fake EvidenceStore: bounded writes, retry and cleanup', () => {
  it('uses exact offsets for short writes and EINTR; independent event oracle', () => {
    const f = fixture();
    const offsets: number[] = [], original = f.ops.writeOnce;
    f.ops.writeOnce = (handle, offset, bytes) => { offsets.push(offset); return original(handle, offset, bytes); };
    f.writes.push({ kind: 'written', bytes: 1 }, { kind: 'eintr' }, { kind: 'written', bytes: 1 }, { kind: 'written', bytes: 1 });
    const receipt = f.store.save(f.run, 'conditions.json', abc)!;
    expect(offsets).toEqual([0, 1, 1, 2]);
    expect(f.calls.filter(x => x !== 'identity')).toEqual(['create', 'write', 'write', 'write', 'write', 'flush', 'close', 'reread']);
    expect(f.store.consume(f.run, receipt)?.digest).toBe(ABC_SHA256);
  });
  it('gives each write a private copy, so a driver cannot alter the remaining bytes', () => {
    const f = fixture();
    const original = f.ops.writeOnce;
    f.ops.writeOnce = (handle, offset, bytes) => { const result = original(handle, offset, bytes); bytes.fill(0); return result; };
    f.writes.push({ kind: 'written', bytes: 1 });
    const receipt = f.store.save(f.run, 'conditions.json', abc)!;
    expect(f.files.get('conditions.json')!.bytes).toEqual([97, 98, 99]);
    expect(f.store.consume(f.run, receipt)?.digest).toBe(ABC_SHA256);
  });
  it('passes the fixed file cap to reread', () => {
    const f = fixture();
    const limits: number[] = [], original = f.ops.readBack;
    f.ops.readBack = (handle, slot, limit) => { limits.push(limit); return original(handle, slot, limit); };
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeDefined();
    expect(limits).toEqual([f.caps.fileBytes]);
  });
  it.each([0, 1, 2])('allows exactly %s EINTR retries', retries => {
    const f = fixture({ retries });
    for (let i = 0; i < retries; i++) f.writes.push({ kind: 'eintr' });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeDefined();
    const g = fixture({ retries });
    for (let i = 0; i <= retries; i++) g.writes.push({ kind: 'eintr' });
    expect(g.store.save(g.run, 'conditions.json', abc)).toBeUndefined();
    expect(count(g.calls, 'write')).toBe(retries + 1);
    expect(g.store.snapshot().reason).toBe('retry');
    expect(count(g.calls, 'close')).toBe(1);
  });
  it('caps total attempts separately from EINTR and keeps partial bytes unverified', () => {
    const f = fixture({ attempts: 2 });
    f.writes.push({ kind: 'written', bytes: 1 }, { kind: 'written', bytes: 1 });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(count(f.calls, 'write')).toBe(2);
    expect(f.files.get('conditions.json')!.bytes).toEqual([97, 98]);
    expect(f.store.snapshot()).toMatchObject({ reason: 'limit', charged: 3, cleanup: 'confirmed' });
  });
  it.each([0, -1, 0.5, NaN, Infinity, 4])('refuses invalid write progress %s without retry', bytes => {
    const f = fixture();
    f.writes.push({ kind: 'written', bytes });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(count(f.calls, 'write')).toBe(1);
    expect(count(f.calls, 'close')).toBe(1);
    expect(f.store.snapshot().reason).toBe('write');
  });
  it.each(['create', 'flush', 'close', 'reread', 'corrupt', 'extra', 'truncate'] as const)('refuses %s failure without a receipt', fault => {
    const f = fixture();
    f.faults[fault] = true;
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe(fault === 'corrupt' ? 'digest' : fault === 'extra' || fault === 'truncate' ? 'reread' : fault);
    expect(count(f.calls, 'close')).toBe(fault === 'create' ? 0 : 1);
    expect(f.store.save(f.run, 'report.final.json', abc)).toBeUndefined();
  });
  it('keeps the original error when the one cleanup attempt also fails', () => {
    const f = fixture();
    f.writes.push('throw'); f.faults.close = true;
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'write', cleanup: 'unconfirmed' });
    expect(count(f.calls, 'close')).toBe(1);
    expect(JSON.stringify(f.store.snapshot())).not.toContain('SECRET');
  });
  it('keeps the first reason when cleanup time or a later cancel also fails', () => {
    const f = fixture();
    f.writes.push('throw');
    f.hook(op => { if (op === 'write') f.time(120); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'write', cleanup: 'unconfirmed' });
    expect(count(f.calls, 'close')).toBe(0);
    f.store.cancel();
    expect(f.store.snapshot().reason).toBe('write');
  });
  it('contains a throwing cleanup close and keeps the original reason', () => {
    const f = fixture();
    f.writes.push('throw');
    f.hook(op => { if (op === 'close') throw Error('SECRET_CLEANUP'); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'write', cleanup: 'unconfirmed' });
    expect(count(f.calls, 'close')).toBe(1);
    expect(JSON.stringify(f.store.snapshot())).not.toContain('SECRET');
  });
  it.each([[119, 'confirmed'], [120, 'late'], [500, 'late']] as const)('reports cleanup finishing at %s as %s, in cleanup and in the normal close', (time, cleanup) => {
    const f = fixture();
    f.writes.push('throw');
    f.hook(op => { if (op === 'close') f.time(time); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'write', cleanup });
    expect(count(f.calls, 'close')).toBe(1);
    const g = fixture();
    g.hook(op => { if (op === 'close') g.time(time); });
    expect(g.store.save(g.run, 'conditions.json', abc)).toBeUndefined();
    expect(g.store.snapshot()).toMatchObject({ reason: 'deadline', cleanup });
    expect(count(g.calls, 'close')).toBe(1);
  });
  it('keeps cleanup unconfirmed when a failed close is late or the time after close is unreadable', () => {
    const f = fixture();
    f.writes.push('throw'); f.faults.close = true;
    f.hook(op => { if (op === 'close') f.time(500); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'write', cleanup: 'unconfirmed' });
    for (const time of [5, NaN, Infinity, 0.5]) {
      const g = fixture();
      g.time(10);
      g.writes.push('throw');
      g.hook(op => { if (op === 'close') g.time(time); });
      expect(g.store.save(g.run, 'conditions.json', abc)).toBeUndefined();
      expect(g.store.snapshot()).toMatchObject({ reason: 'write', cleanup: 'unconfirmed' });
      expect(count(g.calls, 'close')).toBe(1);
    }
  });
  it('resets the cleanup axis for each save instead of showing an earlier result', () => {
    const f = fixture();
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeDefined();
    expect(f.store.snapshot().cleanup).toBe('confirmed');
    expect(f.store.save(f.run, 'report.final.json', new Uint8Array(9))).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'limit', cleanup: 'not_started' });
  });
  it.each(['identity', 'create', 'flush', 'close', 'reread'] as const)('normalizes a throwing %s without retaining exceptions', phase => {
    const f = fixture();
    f.hook(op => { if (op === phase) throw Error('SECRET_EXCEPTION'); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe(phase === 'identity' ? 'binding' : phase);
    expect(JSON.stringify(f.store.snapshot())).not.toContain('SECRET_EXCEPTION');
    expect(count(f.calls, 'close')).toBe(phase === 'create' || phase === 'identity' ? 0 : 1);
  });
  it('rejects oversized reread data before hashing or receipt issuance', () => {
    const f = fixture();
    f.ops.readBack = () => new Uint8Array(9);
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('reread');
    class Short extends Uint8Array { override get byteLength() { return 3; } }
    const g = fixture();
    g.ops.readBack = () => new Short(9);
    expect(g.store.save(g.run, 'conditions.json', abc)).toBeUndefined();
    expect(g.store.snapshot().reason).toBe('reread');
  });
  it('does not reflect an unexpected byte accessor exception', () => {
    const f = fixture();
    const bytes = new Proxy(abc, { get() { throw Error('SECRET_ACCESSOR'); } });
    expect(f.store.save(f.run, 'conditions.json', bytes)).toBeUndefined();
    expect(f.calls).toEqual([]);
    expect(f.store.snapshot().reason).toBe('binding');
    expect(JSON.stringify(f.store.snapshot())).not.toContain('SECRET_ACCESSOR');
  });
  it('honors byte reservation bounds without refunding failed attempts', () => {
    const f = fixture({ fileBytes: 3, totalBytes: 3 });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeDefined();
    expect(f.store.save(f.run, 'report.final.json', Uint8Array.of(0))).toBeUndefined();
    expect(f.store.snapshot().charged).toBe(3);
    expect(count(f.calls, 'create')).toBe(1);
    const g = fixture();
    expect(g.store.save(g.run, 'conditions.json', new Uint8Array(9))).toBeUndefined();
    expect(g.store.snapshot().claimed).toBe(1);
    expect(g.calls).toEqual([]);
  });
});

describe('fake EvidenceStore: pinned identity and finite time', () => {
  it.each(['create', 'write', 'flush', 'close', 'reread'] as const)('detects identity change during %s', phase => {
    const f = fixture();
    f.hook(op => { if (op === phase) f.identity({}); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('binding');
    expect(count(f.calls, 'close')).toBe(1);
  });
  it('rejects an unavailable identity before create', () => {
    const f = fixture(); f.identity();
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(count(f.calls, 'create')).toBe(0);
  });
  it.each(['create', 'write', 'flush', 'close', 'reread'] as const)('rejects cancellation during %s without receipt', phase => {
    const f = fixture();
    f.hook(op => { if (op === phase) f.store.cancel(); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('cancelled');
    expect(count(f.calls, 'close')).toBe(1);
  });
  it('reports expiry during an operation before judging that operation\'s own result', () => {
    const f = fixture({ retries: 0 });
    f.writes.push({ kind: 'eintr' });
    f.hook(op => { if (op === 'write') f.time(100); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('deadline');
    const g = fixture();
    g.faults.corrupt = true;
    g.hook(op => { if (op === 'reread') g.time(100); });
    expect(g.store.save(g.run, 'conditions.json', abc)).toBeUndefined();
    expect(g.store.snapshot().reason).toBe('deadline');
  });
  it('rechecks stop after each clock read, before any identity or create dispatch', () => {
    for (const [target, identities] of [[1, 0], [2, 1]] as const) {
      const f = fixture();
      let reads = 0;
      const store: FakeEvidenceStore = FakeEvidenceStore.create(f.ops, f.root, f.run, f.caps, () => { if (++reads === target) store.cancel(); return 0; })!;
      expect(store.save(f.run, 'conditions.json', abc)).toBeUndefined();
      expect(store.snapshot().reason).toBe('cancelled');
      expect(count(f.calls, 'identity')).toBe(identities);
      expect(count(f.calls, 'create')).toBe(0);
    }
  });
  it('issues no receipt when the clock expires on the final guard', () => {
    const f = fixture();
    let reads = 0;
    const counting = FakeEvidenceStore.create(f.ops, f.root, f.run, f.caps, () => { reads++; return 0; })!;
    expect(counting.save(f.run, 'conditions.json', abc)).toBeDefined();
    // Five operations x (two pre-guard + two post-guard reads), one close check, two final-guard reads.
    expect(reads).toBe(5 * 4 + 1 + 2);
    const total = reads, g = fixture();
    reads = 0;
    const store = FakeEvidenceStore.create(g.ops, g.root, g.run, g.caps, () => (++reads >= total - 1 ? 100 : 0))!;
    expect(store.save(g.run, 'conditions.json', abc)).toBeUndefined();
    expect(store.snapshot()).toMatchObject({ reason: 'deadline', cleanup: 'confirmed' });
    expect(count(g.calls, 'reread')).toBe(1);
  });
  it.each([NaN, -1, 0.5, Infinity, 100])('stops before create at invalid/expired time %s', time => {
    const f = fixture(); f.time(time);
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(count(f.calls, 'identity')).toBe(0);
    expect(count(f.calls, 'create')).toBe(0);
  });
  it('uses a finite cleanup reserve after operational expiry, never resets the deadline', () => {
    const f = fixture(); f.hook(op => { if (op === 'write') f.time(100); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'deadline', cleanup: 'confirmed' });
    expect(count(f.calls, 'close')).toBe(1);
    const g = fixture(); g.hook(op => { if (op === 'write') g.time(120); });
    expect(g.store.save(g.run, 'conditions.json', abc)).toBeUndefined();
    expect(g.store.snapshot()).toMatchObject({ reason: 'deadline', cleanup: 'unconfirmed' });
    expect(count(g.calls, 'close')).toBe(0);
  });
  it('does not dispatch after an identity check consumes the remaining time', () => {
    const f = fixture(); f.hook(op => { if (op === 'identity') f.time(100); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('deadline');
    expect(count(f.calls, 'identity')).toBe(1);
    expect(count(f.calls, 'create')).toBe(0);
  });
  it('catches a regressing or throwing clock, with the original failure retained', () => {
    const f = fixture();
    f.time(10);
    f.hook(op => { if (op === 'create') f.time(9); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'clock', cleanup: 'unconfirmed' });
    const g = fixture();
    const store = FakeEvidenceStore.create(g.ops, g.root, g.run, g.caps, () => { throw Error('SECRET_CLOCK'); })!;
    expect(store.save(g.run, 'conditions.json', abc)).toBeUndefined();
    expect(store.snapshot().reason).toBe('clock');
    expect(JSON.stringify(store.snapshot())).not.toContain('SECRET_CLOCK');
  });
  it('marks a failed close as unconfirmed without a second cleanup attempt', () => {
    const f = fixture(); f.faults.close = true;
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().cleanup).toBe('unconfirmed');
    expect(count(f.calls, 'close')).toBe(1);
  });
  it('rejects file replacement at reread even when replacement bytes match', () => {
    const f = fixture(); f.hook(op => { if (op === 'reread') f.files.set('conditions.json', { handle: {}, bytes: [97, 98, 99] }); });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(f.store.snapshot().reason).toBe('reread');
  });
  it('rejects nested save and cleans a handle created during the rejected callback', () => {
    const f = fixture(); f.hook(op => {
      if (op === 'create') expect(f.store.save(f.run, 'report.final.json', abc)).toBeUndefined();
    });
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeUndefined();
    expect(count(f.calls, 'create')).toBe(1);
    expect(count(f.calls, 'close')).toBe(1);
    expect(f.store.snapshot().reason).toBe('binding');
  });
  it('rejects a consume nested in a save callback and a save nested in a consume callback', () => {
    const f = fixture();
    const first = f.store.save(f.run, 'conditions.json', abc)!;
    let inner: unknown = 'not_run';
    f.hook(op => { if (op === 'create') inner = f.store.consume(f.run, first); });
    expect(f.store.save(f.run, 'report.final.json', abc)).toBeUndefined();
    expect(inner).toBeUndefined();
    expect(f.store.snapshot()).toMatchObject({ reason: 'binding', cleanup: 'confirmed' });
    expect(count(f.calls, 'close')).toBe(2);
    const g = fixture();
    const receipt = g.store.save(g.run, 'conditions.json', abc)!;
    let nested: unknown = 'not_run', once = false;
    g.hook(op => { if (op === 'identity' && !once) { once = true; nested = g.store.save(g.run, 'report.final.json', abc); } });
    expect(g.store.consume(g.run, receipt)).toBeUndefined();
    expect(nested).toBeUndefined();
    expect(g.store.snapshot()).toMatchObject({ reason: 'binding', claimed: 1 });
  });
  it('rejects cancellation/expiry on either consume guard, with no second use', () => {
    for (const target of [1, 2]) {
      const f = fixture();
      const receipt = f.store.save(f.run, 'conditions.json', abc)!;
      let seen = 0;
      f.hook(op => { if (op === 'identity' && ++seen === target) f.store.cancel(); });
      expect(f.store.consume(f.run, receipt)).toBeUndefined();
      expect(seen).toBe(target);
      expect(f.store.consume(f.run, receipt)).toBeUndefined();
    }
    const f = fixture(); const receipt = f.store.save(f.run, 'conditions.json', abc)!;
    f.time(100);
    expect(f.store.consume(f.run, receipt)).toBeUndefined();
  });
  it('accepts the exact structural ceilings and keeps a private copy of the caps', () => {
    expect(fixture({ fileBytes: 65_536, totalBytes: 1_048_576, attempts: 4096, retries: 16 }).store).toBeDefined();
    const f = fixture();
    f.caps.fileBytes = 1;
    f.caps.deadline = 0;
    expect(f.store.save(f.run, 'conditions.json', abc)).toBeDefined();
  });
  it.each([[null, {}], [{}, null], ['root', {}], [{}, 'run']])('rejects non-object bindings %j / %j', (root, run) => {
    const f = fixture();
    expect(FakeEvidenceStore.create(f.ops, root as object, run as object, f.caps, () => 0)).toBeUndefined();
  });
  it.each([
    { fileBytes: 0 }, { fileBytes: 65_537, totalBytes: 65_537 }, { totalBytes: 1_048_577 }, { totalBytes: 1 },
    { attempts: 0 }, { attempts: 4097 }, { retries: -1 }, { retries: 17 },
    { deadline: NaN }, { cleanupDeadline: 100 }, { cleanupDeadline: Infinity },
  ])('rejects invalid structural caps %j', caps => { expect(fixture(caps).store).toBeUndefined(); });
});
