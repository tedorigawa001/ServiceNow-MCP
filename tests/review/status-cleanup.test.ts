import { afterEach, expect, it, vi } from 'vitest';
import { ReadableStream, ReadableStreamDefaultReader } from 'node:stream/web';
import { createInjectedStatusCleanupOwner } from '../../src/review/abort-scope-evidence-status-cleanup.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const window = { purpose: 'release', ordinal: 1, window_origin_ms: 60000, cleanup_floor_ms: 50000 };
function get<T>(r: { ok: true; value: T } | { ok: false; code: string }): T { if (!r.ok) throw Error(r.code); return r.value; }
function setup(factory = createInjectedStatusCleanupOwner, custom?: () => number) {
    vi.useFakeTimers(); const start = Date.now();
    return factory({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: custom ? custom() : 60000 - (Date.now() - start) }) },
        schedule(delay, wake) { const timer = setTimeout(wake, delay); return () => clearTimeout(timer); } });
}
it('never reads and uses the same reader for capture, cancel and release, exactly once', async () => {
    vi.resetModules();
    const events: string[] = [], identities: unknown[] = [];
    const gr = ReadableStream.prototype.getReader, cl = Object.getOwnPropertyDescriptor(ReadableStreamDefaultReader.prototype, 'closed')!.get!;
    const cancel = ReadableStreamDefaultReader.prototype.cancel, release = ReadableStreamDefaultReader.prototype.releaseLock;
    vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(function () { events.push('getReader'); return Reflect.apply(gr, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(function () { events.push('closed'); identities.push(this); return Reflect.apply(cl, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(function () { events.push('cancel'); identities.push(this); return Reflect.apply(cancel, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { events.push('release'); identities.push(this); return Reflect.apply(release, this, []); });
    const read = vi.spyOn(ReadableStreamDefaultReader.prototype, 'read').mockImplementation(() => { throw Error('read forbidden'); });
    const { createInjectedStatusCleanupOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    let underlying = 0;
    const stream = new ReadableStream<Uint8Array>({ cancel() { underlying++; } }), owner = setup(factory);
    const a = get(await owner.acquire(new Response(stream, { status: 403 }), window));
    const result = get(await owner.finish(a.handle));
    expect(events).toEqual(['getReader', 'closed', 'cancel', 'release']); expect(new Set(identities).size).toBe(1);
    expect(read).not.toHaveBeenCalled(); expect(underlying).toBe(1); expect(stream.locked).toBe(false);
    expect(result).toMatchObject({ kind: 'cleanup_diagnostic_only', primary: null, cleanup: { disposition: 'confirmed', kind: 'cancelled' },
        operations: { get_reader: 1, read: 0, cancel: 1, closed: 1, release_lock: 1 } });
    expect(Object.values(result.permissions)).toEqual(Array(7).fill(false));
    expect(vi.getTimerCount()).toBe(0);
});
it.each([401, 403, 404])('preserves native no-body %s without any reader operations or EOF', async status => {
    const owner = setup(), a = get(await owner.acquire(new Response(null, { status }), window));
    const r = get(await owner.finish(a.handle));
    expect(r.cleanup).toMatchObject({ disposition: 'confirmed', kind: 'no_body', facts: {
        reader_owned: false, closed_captured: false, cancel: 'not_applicable', closed: 'not_applicable', release: 'not_applicable' } });
    expect(Object.values(r.operations)).toEqual([0, 0, 0, 0, 0]); expect(vi.getTimerCount()).toBe(0);
});
it.each([['authentication', 401, 'authentication_failed'], ['parent', 403, 'access_denied'], ['release', 401, 'authentication_failed']])(
    'retains HTTP/cleanup independently for %s/%s', async (purpose, status, code) => {
        const owner = setup(), stream = new ReadableStream({ cancel() { throw Error('PRIVATE_CANCEL'); } });
        const a = get(await owner.acquire(new Response(stream, { status: Number(status) }), { ...window, purpose }));
        const r = get(await owner.finish(a.handle));
        expect(r).toMatchObject({ primary: code, http: { purpose, status }, cleanup: { disposition: 'unconfirmed', reason: 'cancel_rejected' }, operations: { read: 0, cancel: 1, release_lock: 1 } });
        expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect(stream.locked).toBe(false);
    });
it('joins stop, close and finish onto one cleanup promise', async () => {
    let finishCancel!: () => void, calls = 0;
    const stream = new ReadableStream({ cancel() { calls++; return new Promise<void>(resolve => { finishCancel = resolve; }); } });
    const owner = setup(), a = get(await owner.acquire(new Response(stream, { status: 403 }), window));
    const first = owner.finish(a.handle); owner.stop(); const closing = owner.close();
    await vi.advanceTimersByTimeAsync(0); expect(calls).toBe(1); finishCancel();
    const r = get(await first); await closing;
    expect(r).toMatchObject({ primary: 'cancelled', cleanup: { disposition: 'confirmed' }, operations: { cancel: 1, closed: 1, release_lock: 1, read: 0 } });
    expect(await owner.acquire(new Response(null, { status: 403 }), window)).toMatchObject({ ok: false, code: 'cancelled' });
    expect(vi.getTimerCount()).toBe(0);
});
it('rejects duplicate finish but performs cleanup only once', async () => {
    const owner = setup(), a = get(await owner.acquire(new Response(new ReadableStream(), { status: 403 }), window));
    const one = owner.finish(a.handle), two = owner.finish(a.handle);
    get(await one); expect(await two).toMatchObject({ ok: false, code: 'invalid_state' });
    expect(owner.diagnostics()).toMatchObject({ primary: 'invalid_state', operations: { read: 0, cancel: 1, release_lock: 1 } });
});
it('rejects foreign handles, cleans only its own resource and leaves the foreign owner untouched', async () => {
    const a = setup(), b = setup(), own = new ReadableStream(), foreign = new ReadableStream();
    const x = get(await a.acquire(new Response(own, { status: 403 }), window)), y = get(await b.acquire(new Response(foreign, { status: 404 }), window));
    const before = b.diagnostics();
    expect(await a.finish(y.handle)).toMatchObject({ ok: false, code: 'evidence_binding_mismatch' });
    expect(own.locked).toBe(false); expect(foreign.locked).toBe(true); expect(b.diagnostics()).toEqual(before);
    get(await b.finish(y.handle)); await a.finish(x.handle);
    expect(b.diagnostics().operations.cancel).toBe(1);
});
it.each(['response', 'stream'])('rejects reuse of the %s after release', async kind => {
    const stream = new ReadableStream(), response = new Response(stream, { status: 403 }),
        second = kind === 'response' ? response : new Response(stream, { status: 403 }), a = setup();
    const x = get(await a.acquire(response, window)); get(await a.finish(x.handle)); const before = a.diagnostics();
    const b = setup(); expect((await b.acquire(second, window)).ok).toBe(false);
    expect(b.diagnostics().operations.get_reader).toBe(0); expect(a.diagnostics()).toEqual(before);
});
it.each(['pending', 'rejected'])('never upgrades %s cancel later, and drops its timer at the original deadline', async mode => {
    let complete!: () => void;
    const stream = new ReadableStream({ cancel() { return mode === 'pending' ? new Promise<void>(resolve => { complete = resolve; }) : Promise.reject(Error('PRIVATE_CANCEL')); } });
    const owner = setup(), a = get(await owner.acquire(new Response(stream, { status: 403 }), window)), pending = owner.finish(a.handle);
    await vi.advanceTimersByTimeAsync(mode === 'pending' ? 10000 : 0);
    const r = get(await pending);
    expect(r).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: mode === 'pending' ? 'cancel_pending' : 'cancel_rejected' }, operations: { cancel: 1, release_lock: 1, read: 0 } });
    const before = owner.diagnostics(); complete?.(); await vi.advanceTimersByTimeAsync(0);
    expect(owner.diagnostics()).toEqual(before); expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it.each(['capture_throw', 'closed_reject', 'closed_pending', 'release_throw', 'get_reader_throw'])('stops and keeps fixed diagnostics on %s', async mode => {
    vi.resetModules();
    const release = ReadableStreamDefaultReader.prototype.releaseLock;
    if (mode === 'capture_throw') vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => { throw Error('PRIVATE_CLOSED'); });
    if (mode === 'closed_reject') vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => Promise.reject(Error('PRIVATE_CLOSED')));
    if (mode === 'closed_pending') vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => new Promise(() => {}));
    if (mode === 'release_throw') vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { Reflect.apply(release, this, []); throw Error('PRIVATE_RELEASE'); });
    if (mode === 'get_reader_throw') vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(() => { throw Error('PRIVATE_GET'); });
    const { createInjectedStatusCleanupOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    const stream = new ReadableStream(), owner = setup(factory);
    const acquired = await owner.acquire(new Response(stream, { status: 403 }), window);
    if (acquired.ok) {
        const work = owner.finish(acquired.value.handle); await vi.advanceTimersByTimeAsync(mode === 'closed_pending' ? 10000 : 0); get(await work);
    } else expect(['capture_throw', 'get_reader_throw']).toContain(mode);
    const reason = mode === 'capture_throw' || mode === 'get_reader_throw' ? 'reader_owner_unknown' : mode === 'release_throw' ? 'lock_release_failed' : mode === 'closed_pending' ? 'closed_pending' : 'closed_rejected';
    expect(owner.diagnostics()).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason }, operations: { read: 0, get_reader: 1, release_lock: mode === 'get_reader_throw' ? 0 : 1 } });
    expect(owner.diagnostics().primary).not.toBeNull(); expect(JSON.stringify(owner.diagnostics())).not.toContain('PRIVATE'); expect(vi.getTimerCount()).toBe(0);
});
it('does not steal a locked foreign reader', async () => {
    let calls = 0; const stream = new ReadableStream({ cancel() { calls++; } }), response = new Response(stream, { status: 403 }), reader = stream.getReader(), owner = setup();
    expect((await owner.acquire(response, window)).ok).toBe(false); expect(stream.locked).toBe(true); expect(calls).toBe(0);
    expect(owner.diagnostics().operations).toEqual({ get_reader: 0, read: 0, cancel: 0, closed: 0, release_lock: 0 });
    await reader.cancel(); reader.releaseLock();
});
it.each(['proxy', 'forged', 'plain', 'subclass', 'used'])('rejects %s Response without invoking caller getters', async mode => {
    let calls = 0; class Sub extends Response {}
    const response = new Response('test', { status: 403 });
    if (mode === 'used') await response.text();
    const raw = mode === 'proxy' ? new Proxy(response, { getPrototypeOf() { calls++; throw Error('PRIVATE'); } }) : mode === 'forged' ? Object.create(Response.prototype) :
        mode === 'plain' ? { get body() { calls++; throw Error('PRIVATE'); } } : mode === 'subclass' ? new Sub(null, { status: 403 }) : response;
    const owner = setup(); expect((await owner.acquire(raw, window)).ok).toBe(false); expect(calls).toBe(0);
    expect(owner.diagnostics().operations.read).toBe(0);
});
it('pins native operations and ignores instance overrides, even after acquisition', async () => {
    const stream = new ReadableStream(), response = new Response(stream, { status: 404 }); let calls = 0;
    const locked = Object.getOwnPropertyDescriptor(ReadableStream.prototype, 'locked')!.get!;
    for (const [o, k] of [[response, 'status'], [response, 'body'], [response, 'bodyUsed'], [stream, 'locked']] as const)
        Object.defineProperty(o, k, { get() { calls++; throw Error('PRIVATE'); } });
    Object.defineProperty(stream, 'getReader', { value() { calls++; throw Error('PRIVATE'); } });
    const owner = setup(), a = get(await owner.acquire(response, window));
    for (const k of ['read', 'cancel', 'releaseLock'] as const) vi.spyOn(ReadableStreamDefaultReader.prototype, k).mockImplementation(() => { calls++; throw Error('PRIVATE'); });
    get(await owner.finish(a.handle)); expect(calls).toBe(0); expect(Reflect.apply(locked, stream, [])).toBe(false);
});
it.each([50000, 49999])('does not confirm cleanup at/after the original floor %s, even with best-effort disposal', async now => {
    let time = 60000, cancels = 0;
    const owner = setup(undefined, () => time), stream = new ReadableStream({ cancel() { cancels++; } });
    const a = get(await owner.acquire(new Response(stream, { status: 403 }), window)); time = now;
    get(await owner.finish(a.handle)); const r = owner.diagnostics();
    expect(r.primary).toBe('deadline_exceeded'); expect(r.cleanup?.disposition).toBe('unconfirmed'); expect(r.cleanup?.wait_issue).toBe('cleanup_deadline');
    expect(cancels).toBe(1); expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it.each(['reverse', 'throw'])('keeps cleanup unconfirmed on clock %s', async mode => {
    let broken = false;
    const owner = setup(undefined, () => { if (!broken) return 60000; if (mode === 'throw') throw Error('PRIVATE_CLOCK'); return 60001; });
    const stream = new ReadableStream(), a = get(await owner.acquire(new Response(stream, { status: 401 }), window)); broken = true;
    const r = get(await owner.finish(a.handle));
    expect(r.primary).toBe('authentication_failed'); expect(r.cleanup?.disposition).toBe('unconfirmed'); expect(r.cleanup?.wait_issue).toBe('observation_invalid');
    expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect(stream.locked).toBe(false);
});
it('uses a post-release clock check and cannot confirm if release crosses the floor', async () => {
    vi.resetModules(); let time = 60000;
    const release = ReadableStreamDefaultReader.prototype.releaseLock;
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { Reflect.apply(release, this, []); time = 50000; });
    const { createInjectedStatusCleanupOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    const owner = setup(factory, () => time), a = get(await owner.acquire(new Response(new ReadableStream(), { status: 403 }), window));
    const r = get(await owner.finish(a.handle)); expect(r.cleanup).toMatchObject({ disposition: 'unconfirmed', reason: 'cleanup_deadline' });
    expect(r.operations.release_lock).toBe(1);
});
it('claims before clock reentry and cleans an acquired reader on post-acquire cancellation', async () => {
    let sample = 0, closing: Promise<unknown> | undefined;
    const owner = setup(undefined, () => { if (++sample === 2) closing = owner.close(); return 60000; });
    const stream = new ReadableStream(); expect((await owner.acquire(new Response(stream, { status: 403 }), window)).ok).toBe(false); await closing;
    expect(owner.diagnostics()).toMatchObject({ primary: 'closed', cleanup: { disposition: 'confirmed' }, operations: { read: 0, cancel: 1, release_lock: 1 } });
    expect(stream.locked).toBe(false);
});
it('keeps hard HTTP primary but does not return a handle after post-acquire cancellation', async () => {
    let sample = 0, closing: Promise<unknown> | undefined;
    const owner = setup(undefined, () => { if (++sample === 2) closing = owner.close(); return 60000; });
    const stream = new ReadableStream();
    expect(await owner.acquire(new Response(stream, { status: 401 }), window)).toMatchObject({ ok: false, code: 'authentication_failed' });
    await closing;
    expect(owner.diagnostics()).toMatchObject({ primary: 'authentication_failed', revoked: true, stop_reason: 'closed', cleanup: { disposition: 'confirmed' }, operations: { cancel: 1, release_lock: 1, read: 0 } });
    expect(stream.locked).toBe(false);
});
it.each([200, 429, 500])('cleans unsupported status %s but does not adopt it', async status => {
    const stream = new ReadableStream(), owner = setup();
    expect((await owner.acquire(new Response(stream, { status }), window)).ok).toBe(false);
    expect(owner.diagnostics()).toMatchObject({ primary: 'invalid_response', http: { status }, cleanup: { disposition: 'confirmed' }, operations: { read: 0 } });
    expect(stream.locked).toBe(false);
});
it('rejects an accessor descriptor before touching the injected Response', async () => {
    let calls = 0; const raw = { ...window };
    Object.defineProperty(raw, 'purpose', { get() { calls++; throw Error('PRIVATE'); } });
    const owner = setup(); expect((await owner.acquire(new Response(null, { status: 403 }), raw)).ok).toBe(false); expect(calls).toBe(0);
    expect(Object.values(owner.diagnostics().operations)).toEqual([0, 0, 0, 0, 0]);
});
it('counts a synchronous cancel throw once and still releases its own reader', async () => {
    vi.resetModules();
    const cancel = ReadableStreamDefaultReader.prototype.cancel;
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(function () {
        void Reflect.apply(cancel, this, []); throw Error('PRIVATE_SYNC_CANCEL');
    });
    const { createInjectedStatusCleanupOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    const owner = setup(factory), stream = new ReadableStream(), a = get(await owner.acquire(new Response(stream, { status: 403 }), window));
    const r = get(await owner.finish(a.handle));
    expect(r).toMatchObject({ primary: 'internal_review_error', cleanup: { reason: 'cancel_rejected' }, operations: { read: 0, cancel: 1, release_lock: 1 } });
    expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('retains pre-release closed_pending when releasing the lock rejects the captured promise', async () => {
    vi.resetModules();
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(() => new Promise(() => {}));
    const { createInjectedStatusCleanupOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    const owner = setup(factory), stream = new ReadableStream(), a = get(await owner.acquire(new Response(stream, { status: 403 }), window));
    const work = owner.finish(a.handle); await vi.advanceTimersByTimeAsync(10000); const r = get(await work);
    expect(r.cleanup?.facts.closed).toBe('pending'); expect(r.cleanup?.facts.cancel).toBe('pending');
    expect(r.cleanup?.reason).toBe('cancel_pending'); expect(stream.locked).toBe(false);
    await vi.advanceTimersByTimeAsync(0); expect(owner.diagnostics().cleanup).toEqual(r.cleanup); expect(vi.getTimerCount()).toBe(0);
});
it('does not retry a release which throws before unlocking; cleanup stays unconfirmed', async () => {
    vi.resetModules(); let held: ReadableStreamDefaultReader | undefined;
    const gr = ReadableStream.prototype.getReader, release = ReadableStreamDefaultReader.prototype.releaseLock;
    vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(function () { return held = Reflect.apply(gr, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(() => { throw Error('PRIVATE_RELEASE'); });
    const { createInjectedStatusCleanupOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    const owner = setup(factory), stream = new ReadableStream(), a = get(await owner.acquire(new Response(stream, { status: 403 }), window));
    const r = get(await owner.finish(a.handle)); await owner.close();
    expect(r.cleanup?.reason).toBe('lock_release_failed'); expect(owner.diagnostics().operations.release_lock).toBe(1); expect(stream.locked).toBe(true);
    // Test teardown only: the owner must NOT retry the failed release.
    Reflect.apply(release, held!, []); expect(stream.locked).toBe(false);
});
it('refuses descriptor replay/second acquire and cleans the original reader before returning', async () => {
    const owner = setup(), stream = new ReadableStream();
    get(await owner.acquire(new Response(stream, { status: 403 }), window));
    expect(await owner.acquire(new Response(null, { status: 403 }), window)).toMatchObject({ ok: false, code: 'invalid_state' });
    expect(owner.diagnostics().operations).toMatchObject({ get_reader: 1, cancel: 1, release_lock: 1, read: 0 }); expect(stream.locked).toBe(false);
});
