import { afterEach, expect, it, vi } from 'vitest';
import { createInjectedNativeReaderOwner } from '../../src/servicenow/review-native-adapter.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const get = <T>(r: {
    ok: true;
    value: T;
} | {
    ok: false;
    code: string;
}): T => { if (!r.ok)
    throw Error(r.code); return r.value; };
const window = { purpose: 'parent' as const, ordinal: 1 as const, io_floor_ms: 50250, cleanup_floor_ms: 50000 };
const bytes = new TextEncoder().encode('{"result":[]}');
it('cleans its own reader after a foreign finish request without touching the foreign reader', async () => {
    const ownStream = new ReadableStream<Uint8Array>(), otherStream = new ReadableStream<Uint8Array>();
    const owner = setup(() => new Response(ownStream)), other = setup(() => new Response(otherStream));
    const own = get(await owner.acquire(window)), foreign = get(await other.acquire(window));
    expect(await owner.finish(foreign.handle)).toEqual({ ok: false, code: 'evidence_binding_mismatch' });
    expect(ownStream.locked).toBe(false);
    expect(otherStream.locked).toBe(true);
    expect(owner.status().operations).toMatchObject({ cancels: 1, releases: 1 });
    await owner.finish(own.handle);
    expect(owner.status().operations.releases).toBe(1);
    await other.finish(foreign.handle);
    expect(otherStream.locked).toBe(false);
});
it.each([
    { ...window, extra: true },
    { ...window, io_floor_ms: 50000 },
    { ...window, cleanup_floor_ms: 49999 },
    { ...window, ordinal: 3 },
])('rejects invalid attempt windows before dispatch: %j', async (descriptor) => {
    let calls = 0;
    const owner = setup(() => { calls++; throw Error('must not dispatch'); });
    expect(await owner.acquire(descriptor)).toEqual({ ok: false, code: 'invalid_input' });
    expect(calls).toBe(0);
    expect(owner.status().cleanup).toMatchObject({ disposition: 'not_started' });
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'invalid_input' });
});
function setup(dispatch: (request: unknown, signal: AbortSignal) => unknown, factory = createInjectedNativeReaderOwner) { vi.useFakeTimers(); const start = Date.now(); return factory({ fake_io: true, budget: { read: () => ({ remaining_ms: 60000 - (Date.now() - start) }) }, deadline_ms: 60000, dispatch, schedule(delay, wake) { const timer = setTimeout(wake, delay); return () => clearTimeout(timer); } }); }
it('acquires one injected native reader and confirms EOF/closed/release without formal authority', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }), owner = setup(() => new Response(stream)), { handle, status } = get(await owner.acquire(window));
    expect(status).toBe(200);
    expect(get(await owner.read(handle))).toEqual({ done: false, value: bytes });
    expect(get(await owner.read(handle))).toEqual({ done: true });
    expect(get(await owner.finish(handle))).toMatchObject({ state: 'native_end_only', cleanup: { disposition: 'confirmed', kind: 'eof' }, body_eligible: false, evidence_issuance: 'disabled' });
    expect(stream.locked).toBe(false);
    expect(owner.status()).toMatchObject({ primary: null, operations: { claims: 1, reads: 2, cancels: 0, releases: 1, closed_captures: 1 } });
    expect(vi.getTimerCount()).toBe(0);
    owner.close();
});
it('cancels and releases a pending read once when the owner stops, while keeping first failure separate from cleanup', async () => {
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancels++; } }), owner = setup(() => new Response(stream)), { handle } = get(await owner.acquire(window)), pending = owner.read(handle);
    await vi.advanceTimersByTimeAsync(0);
    owner.stop('cancelled');
    expect(await pending).toEqual({ ok: false, code: 'cancelled' });
    expect(cancels).toBe(1);
    expect(stream.locked).toBe(false);
    expect(owner.status()).toMatchObject({ primary: 'cancelled', cleanup: { disposition: 'confirmed', kind: 'cancelled' }, operations: { cancels: 1, releases: 1 }, active: false });
    expect(vi.getTimerCount()).toBe(0);
});
it('keeps getReader failure unconfirmed and never attempts a second acquisition', async () => {
    vi.resetModules();
    let calls = 0;
    vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(() => { calls++; throw Error('PRIVATE_GET_READER'); });
    const { createInjectedNativeReaderOwner: factory } = await import('../../src/servicenow/review-native-adapter.js');
    const stream = new ReadableStream<Uint8Array>(), owner = setup(() => new Response(stream), factory);
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'invalid_response' });
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'invalid_response' });
    expect(calls).toBe(1);
    expect(owner.status()).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: 'reader_owner_unknown' }, operations: { claims: 0, releases: 0 } });
    expect(JSON.stringify(owner.status())).not.toContain('PRIVATE');
});
it('retains the acquired reader when closed capture fails and cleans it up once', async () => {
    vi.resetModules();
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => { throw Error('PRIVATE_CLOSED_CAPTURE'); });
    const { createInjectedNativeReaderOwner: factory } = await import('../../src/servicenow/review-native-adapter.js');
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancels++; } }), owner = setup(() => new Response(stream), factory);
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'invalid_response' });
    expect(stream.locked).toBe(false);
    expect(cancels).toBe(1);
    expect(owner.status()).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: 'reader_owner_unknown' }, operations: { claims: 1, cancels: 1, releases: 1, closed_captures: 0 } });
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.stringify(owner.status())).not.toContain('PRIVATE');
});
it('ignores Response/stream/reader overrides and pins native operations, including closed capture', async () => {
    let calls = 0;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }), response = new Response(stream);
    for (const [object, key] of [[response, 'status'], [response, 'body'], [response, 'bodyUsed'], [response, 'then'], [stream, 'locked']] as const)
        Object.defineProperty(object, key, { get() { calls++; throw Error('PRIVATE_GETTER'); } });
    Object.defineProperty(stream, 'getReader', { value() { calls++; throw Error('PRIVATE_METHOD'); } });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'read').mockImplementation(() => { calls++; throw Error('PRIVATE_READ'); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => { calls++; throw Error('PRIVATE_CLOSED'); });
    const owner = setup(() => response), { handle } = get(await owner.acquire(window));
    get(await owner.read(handle));
    get(await owner.read(handle));
    get(await owner.finish(handle));
    expect(calls).toBe(0);
    expect(owner.status().operations).toMatchObject({ claims: 1, reads: 2, releases: 1, closed_captures: 1 });
});
it.each(['response', 'stream'] as const)('rejects reused %s ownership across owners after release, without mutating the original owner', async (kind) => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } }), firstResponse = new Response(stream), secondResponse = kind === 'response' ? firstResponse : new Response(stream), first = setup(() => firstResponse), { handle } = get(await first.acquire(window));
    get(await first.read(handle));
    get(await first.read(handle));
    get(await first.finish(handle));
    const before = first.status(), second = setup(() => secondResponse);
    expect(await second.acquire(window)).toEqual({ ok: false, code: 'invalid_response' });
    expect(second.status().operations.claims).toBe(0);
    expect(first.status()).toEqual(before);
});
it('never steals a foreign reader or calls its cancel/release', async () => {
    let cancelled = 0;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } }), response = new Response(stream), foreign = stream.getReader(), owner = setup(() => response);
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'invalid_response' });
    expect(stream.locked).toBe(true);
    expect(cancelled).toBe(0);
    expect(owner.status().operations).toMatchObject({ claims: 0, cancels: 0, releases: 0 });
    await foreign.cancel();
    foreign.releaseLock();
});
it('rejects a second read in flight and cleans up the original reader once', async () => {
    const stream = new ReadableStream<Uint8Array>(), owner = setup(() => new Response(stream)), { handle } = get(await owner.acquire(window)), first = owner.read(handle);
    await vi.advanceTimersByTimeAsync(0);
    expect(await owner.read(handle)).toEqual({ ok: false, code: 'invalid_state' });
    expect(await first).toEqual({ ok: false, code: 'invalid_state' });
    expect(owner.status().operations).toMatchObject({ reads: 1, cancels: 1, releases: 1 });
    expect(stream.locked).toBe(false);
});
it.each(['proxy', 'forged', 'plain', 'response_subclass', 'stream_subclass'] as const)('rejects %s input without caller method/getter execution', async (kind) => {
    let calls = 0;
    class SubResponse extends Response {
    }
    class SubStream extends ReadableStream<Uint8Array> {
    }
    const raw = kind === 'proxy' ? new Proxy(new Response(bytes), { get() { calls++; throw Error(); }, getPrototypeOf() { calls++; throw Error(); } }) : kind === 'forged' ? Object.create(Response.prototype) : kind === 'plain' ? { get body() { calls++; throw Error(); } } : kind === 'response_subclass' ? new SubResponse(bytes) : new Response(new SubStream());
    const owner = setup(() => raw);
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'invalid_response' });
    expect(owner.status().operations.claims).toBe(0);
    expect(calls).toBe(0);
});
it('records native no-body without manufacturing EOF, a reader, or body authority', async () => {
    const owner = setup(() => new Response(null));
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'invalid_response' });
    expect(owner.status()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'no_body' }, operations: { claims: 0, reads: 0, cancels: 0, releases: 0 } });
});
it.each(['sync', 'async'] as const)('classifies %s source failure without exposing the error or inventing a reader', async (mode) => {
    const owner = setup(() => { if (mode === 'sync')
        throw Error('PRIVATE_SOURCE'); return Promise.reject(Error('PRIVATE_SOURCE')); });
    expect(await owner.acquire(window)).toEqual({ ok: false, code: 'upstream_unavailable' });
    expect(owner.status()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'no_response' }, operations: { claims: 0, cancels: 0, releases: 0 } });
    expect(JSON.stringify(owner.status())).not.toContain('PRIVATE');
    expect(vi.getTimerCount()).toBe(0);
});
it('reserves the original attempt cleanup window, cancels on timeout and does not create a retry', async () => {
    let dispatches = 0, cancels = 0;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancels++; } }), owner = setup(() => { dispatches++; return new Response(stream); }), { handle } = get(await owner.acquire(window)), pending = owner.read(handle);
    await vi.advanceTimersByTimeAsync(9750);
    expect(await pending).toEqual({ ok: false, code: 'attempt_deadline_exceeded' });
    expect(dispatches).toBe(1);
    expect(cancels).toBe(1);
    expect(owner.status()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'cancelled' }, operations: { reads: 1, releases: 1 } });
    expect(vi.getTimerCount()).toBe(0);
});
it.each(['pending', 'rejected'] as const)('retains %s cancel independently of read/closed settlement and never repairs a terminal later', async (kind) => {
    let complete!: () => void;
    const stream = new ReadableStream<Uint8Array>({ cancel() { return kind === 'pending' ? new Promise<void>(resolve => { complete = resolve; }) : Promise.reject(Error('PRIVATE_CANCEL')); } }), owner = setup(() => new Response(stream)), { handle } = get(await owner.acquire(window)), pending = owner.read(handle);
    await vi.advanceTimersByTimeAsync(0);
    owner.stop('cancelled');
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toEqual({ ok: false, code: 'cancelled' });
    const before = owner.status();
    expect(before).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: kind === 'pending' ? 'cancel_pending' : 'cancel_rejected' }, operations: { cancels: 1, releases: 1 }, active: false });
    complete?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(owner.status()).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
});
it('keeps pre-release pending read unconfirmed even when releaseLock itself rejects the read promise', async () => {
    vi.resetModules();
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(() => new Promise(() => { }));
    const { createInjectedNativeReaderOwner: factory } = await import('../../src/servicenow/review-native-adapter.js');
    const stream = new ReadableStream<Uint8Array>(), owner = setup(() => new Response(stream), factory), { handle } = get(await owner.acquire(window)), pending = owner.read(handle);
    await vi.advanceTimersByTimeAsync(0);
    owner.stop('cancelled');
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toEqual({ ok: false, code: 'cancelled' });
    const before = owner.status();
    expect(before).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: 'read_pending' }, operations: { cancels: 1, releases: 1 }, active: false });
    expect(stream.locked).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(owner.status()).toEqual(before);
});
it('records release failure without a second release or exposing its raw exception', async () => {
    vi.resetModules();
    const release = ReadableStreamDefaultReader.prototype.releaseLock;
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { Reflect.apply(release, this, []); throw Error('PRIVATE_RELEASE'); });
    const { createInjectedNativeReaderOwner: factory } = await import('../../src/servicenow/review-native-adapter.js');
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.close(); } }), owner = setup(() => new Response(stream), factory), { handle } = get(await owner.acquire(window));
    get(await owner.read(handle));
    expect(await owner.finish(handle)).toEqual({ ok: false, code: 'internal_review_error' });
    expect(owner.status()).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: 'lock_release_failed' }, operations: { releases: 1 } });
    expect(JSON.stringify(owner.status())).not.toContain('PRIVATE');
});
it('rejects replay and foreign handles without operating on the foreign reader', async () => {
    const a = setup(() => new Response(bytes)), b = setup(() => new Response(bytes)), slot = get(await b.acquire(window)), before = b.status();
    expect(await a.read(slot.handle)).toEqual({ ok: false, code: 'evidence_binding_mismatch' });
    expect(b.status()).toEqual(before);
    get(await b.read(slot.handle));
    get(await b.read(slot.handle));
    get(await b.finish(slot.handle));
    expect(await b.finish(slot.handle)).toEqual({ ok: false, code: 'invalid_state' });
    expect(b.status().operations.releases).toBe(1);
});
it('cancels a late injected Response without acquiring a reader or repairing the pending-dispatch terminal', async () => {
    let resolve!: (x: Response) => void, cancels = 0;
    const owner = setup(() => new Promise<Response>(r => { resolve = r; })), pending = owner.acquire(window);
    await vi.advanceTimersByTimeAsync(9750);
    expect(await pending).toEqual({ ok: false, code: 'attempt_deadline_exceeded' });
    const before = owner.status();
    expect(before.cleanup).toMatchObject({ disposition: 'unconfirmed', reason: 'fetch_pending' });
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancels++; } });
    resolve(new Response(stream));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancels).toBe(1);
    expect(stream.locked).toBe(false);
    expect(owner.status()).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
});
it('rejects a second acquire while a reader is owned and releases only that owned reader', async () => {
    let dispatches = 0;
    const stream = new ReadableStream<Uint8Array>(), owner = setup(() => { dispatches++; return new Response(stream); });
    get(await owner.acquire(window));
    expect(await owner.acquire({ ...window, purpose: 'release' })).toEqual({ ok: false, code: 'invalid_state' });
    expect(dispatches).toBe(1);
    expect(stream.locked).toBe(false);
    expect(owner.status().operations).toMatchObject({ claims: 1, cancels: 1, releases: 1 });
});
it('refuses release completion at the original cleanup deadline and retains that deadline reason', async () => {
    vi.resetModules();
    const release = ReadableStreamDefaultReader.prototype.releaseLock;
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { Reflect.apply(release, this, []); vi.setSystemTime(Date.now() + 10000); });
    const { createInjectedNativeReaderOwner: factory } = await import('../../src/servicenow/review-native-adapter.js');
    const owner = setup(() => new Response(new ReadableStream<Uint8Array>({ start(c) { c.close(); } })), factory), { handle } = get(await owner.acquire(window));
    get(await owner.read(handle));
    expect(await owner.finish(handle)).toEqual({ ok: false, code: 'attempt_deadline_exceeded' });
    expect(owner.status().cleanup).toMatchObject({ disposition: 'unconfirmed', reason: 'cleanup_deadline' });
});
it('refuses finish during a pending read so the cancel-resolved read is not reported as EOF', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); } }), owner = setup(() => new Response(stream)), { handle } = get(await owner.acquire(window));
    get(await owner.read(handle));
    const [pending, finished] = await Promise.all([owner.read(handle), owner.finish(handle)]);
    expect(finished).toEqual({ ok: false, code: 'invalid_state' });
    expect(pending).toEqual({ ok: false, code: 'invalid_state' });
    expect(owner.status()).toMatchObject({ primary: 'invalid_state', active: false, operations: { cancels: 1, releases: 1 } });
    expect(stream.locked).toBe(false);
});
