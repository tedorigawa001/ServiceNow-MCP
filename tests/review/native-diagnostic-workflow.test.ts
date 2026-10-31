import { afterEach, expect, it, vi } from 'vitest';
import { ReadableStream, ReadableStreamDefaultReader } from 'node:stream/web';
import { createInjectedNativeDiagnosticWorkflow, runNativeDiagnosticFaultFixture } from '../../src/review/abort-scope-evidence-native-diagnostic.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const window = { purpose: 'release', ordinal: 1, window_origin_ms: 60000, cleanup_floor_ms: 50000 };
type Owner = ReturnType<typeof createInjectedNativeDiagnosticWorkflow>;
function setup(factory = createInjectedNativeDiagnosticWorkflow, clock?: () => number) {
    vi.useFakeTimers(); const start = Date.now();
    return factory({ fake_io: true, deadline_ms: 60000,
        budget: { read: () => ({ remaining_ms: clock ? clock() : 60000 - Date.now() + start }) },
        schedule(delay, wake) { const t = setTimeout(wake, delay); return () => clearTimeout(t); } });
}
it('binds diagnostics before observation and connects one same-reader terminal to the sole consumer', async () => {
    const owner = setup();
    expect(owner.diagnostics().upper.binding).toBe('bound');
    expect(owner.diagnostics().upper.slots.release.http).toBeNull();
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('PRIVATE_BODY')); } });
    const r = await owner.execute(new Response(stream, { status: 403 }), window);
    expect(r.counts).toEqual({ issued: 1, consume_attempts: 1, consumed: 1 });
    expect(r.upper.slots.release).toMatchObject({ http: { status: 403 }, cleanup: { phase: 'confirmed', kind: 'cancelled' },
        acceptance: { phase: 'revoked', first_terminal: 'accepted', consumes: 1 } });
    expect(r.operations).toEqual({ get_reader: 1, closed: 1, cancel: 1, release_lock: 1, read: 0 });
    expect(r.upper.sealed).toBe(true); expect(stream.locked).toBe(false);
    expect(r.upper.slots.authentication.http).toBeNull(); expect(r.upper.slots.parent.http).toBeNull();
    expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));
    expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect(vi.getTimerCount()).toBe(0);
});
it.each([[403, true], [404, true], [403, false], [404, false]] as const)('consumes release%s body=%s with native no-body distinct from EOF', async (status, body) => {
    const owner = setup(), stream = body ? new ReadableStream() : null;
    const r = await owner.execute(new Response(stream, { status }), window), c = r.upper.slots.release.cleanup;
    expect(r.upper.primary).toBeNull(); expect(r.counts.consumed).toBe(1);
    expect(c.native).toMatchObject({ disposition: 'confirmed', kind: body ? 'cancelled' : 'no_body', reason: null, wait_issue: null,
        facts: { reader_owned: body, closed_captured: body, read_started: false, read_pending: false,
            cancel: body ? 'fulfilled' : 'not_applicable', closed: body ? 'fulfilled' : 'not_applicable', release: body ? 'succeeded' : 'not_applicable' } });
    expect(r.operations.read).toBe(0); if (!body) expect(Object.values(r.operations)).toEqual([0, 0, 0, 0, 0]);
});
it.each([true, false])('keeps hard401 and cleanup independently (body=%s) without issuance', async body => {
    const r = await setup().execute(new Response(body ? new ReadableStream() : null, { status: 401 }), window);
    expect(r.upper.primary).toEqual({ code: 'authentication_failed', public_code: 'authentication_failed', stage: 'header' });
    expect(r.upper.slots.release.cleanup.phase).toBe('confirmed');
    expect(r.counts).toEqual({ issued: 0, consume_attempts: 0, consumed: 0 });
});
it.each([401, 403])('preserves HTTP%s before native cancel rejection and never issues', async status => {
    const stream = new ReadableStream({ cancel() { throw Error('PRIVATE_CANCEL'); } });
    const r = await setup().execute(new Response(stream, { status }), window);
    expect(r.upper.primary?.code).toBe(status === 401 ? 'authentication_failed' : 'internal_review_error');
    expect(r.upper.slots.release).toMatchObject({ http: { status }, cleanup: { phase: 'unconfirmed', reason: 'cancel_rejected', native: { facts: { cancel: 'rejected' } } } });
    expect(r.counts.issued).toBe(0); expect(stream.locked).toBe(false); expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('does not upgrade timed-out cleanup when cancellation resolves late', async () => {
    let complete!: () => void;
    const stream = new ReadableStream({ cancel() { return new Promise<void>(resolve => { complete = resolve; }); } });
    const owner = setup(), pending = owner.execute(new Response(stream, { status: 403 }), window);
    await vi.advanceTimersByTimeAsync(10000); const before = await pending;
    expect(before.upper.slots.release.cleanup).toMatchObject({ phase: 'unconfirmed', reason: 'cancel_pending', native: { facts: { cancel: 'pending' }, wait_issue: 'cleanup_deadline' } });
    expect(before.counts.issued).toBe(0); expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
    complete(); await vi.advanceTimersByTimeAsync(0); expect(owner.diagnostics()).toEqual(before);
});
it.each(['issue', 'pre_guard', 'post_guard'] as const)('refuses cancellation at %s without losing native facts', async stage => {
    let fired = false, owner: Owner;
    owner = setup(undefined, () => { if (!fired && owner.diagnostics().phase === stage) { fired = true; owner.stop(); } return 60000; });
    const r = await owner.execute(new Response(new ReadableStream(), { status: 403 }), window);
    expect(fired).toBe(true); expect(r.upper.primary?.code).toBe('cancelled');
    expect(r.upper.slots.release.cleanup.phase).toBe('confirmed'); expect(r.counts.consumed).toBe(0);
    expect(r.counts.issued).toBe(stage === 'issue' ? 0 : 1); expect(r.token_held).toBe(false);
});
it.each(['issue', 'pre_guard', 'post_guard'] as const)('rejects equality at the original floor in %s', async stage => {
    let owner: Owner;
    owner = setup(undefined, () => owner.diagnostics().phase === stage ? 50000 : 60000);
    const r = await owner.execute(new Response(null, { status: 404 }), window);
    expect(r.upper.primary?.code).toBe('deadline_exceeded'); expect(r.counts.consumed).toBe(0);
    expect(r.upper.slots.release.cleanup.phase).toBe('confirmed'); expect(r.token_held).toBe(false);
});
it.each(['issue', 'pre_guard', 'post_guard'] as const)('fails closed on reentry at %s with one cleanup', async stage => {
    let fired = false, reentered: ReturnType<Owner['execute']> | undefined, owner: Owner;
    owner = setup(undefined, () => { if (!fired && owner.diagnostics().phase === stage) { fired = true; reentered = owner.execute(new Response(null, { status: 403 }), window); } return 60000; });
    const r = await owner.execute(new Response(new ReadableStream(), { status: 403 }), window);
    expect(await reentered).toMatchObject({ request_rejected: 'invalid_state' }); expect(r.counts.consumed).toBe(0); expect(r.upper.refusal?.code).toBe('invalid_state');
    expect(r.operations).toMatchObject({ read: 0, cancel: 1, release_lock: 1 });
});
it('explicitly refuses owner/Response reuse after success without rewriting sealed history', async () => {
    const response = new Response(null, { status: 403 }), owner = setup();
    const r = await owner.execute(response, window);
    const replay = await owner.execute(response, window);
    expect(replay.request_rejected).toBe('invalid_state');
    expect(owner.diagnostics()).toEqual(r); expect(replay.counts).toEqual(r.counts);
    const other = await setup().execute(response, window);
    expect(other.upper.primary?.code).toBe('invalid_response'); expect(other.counts.issued).toBe(0);
});
it('observes and releases exactly the same reader without reading any payload', async () => {
    vi.resetModules(); const readers: unknown[] = [], events: string[] = [];
    const get = ReadableStream.prototype.getReader, cancel = ReadableStreamDefaultReader.prototype.cancel,
        release = ReadableStreamDefaultReader.prototype.releaseLock, closed = Object.getOwnPropertyDescriptor(ReadableStreamDefaultReader.prototype, 'closed')!.get!;
    vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(function () { events.push('reader'); return Reflect.apply(get, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(function () { readers.push(this); events.push('closed'); return Reflect.apply(closed, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(function () { readers.push(this); events.push('cancel'); return Reflect.apply(cancel, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { readers.push(this); events.push('release'); return Reflect.apply(release, this, []); });
    const read = vi.spyOn(ReadableStreamDefaultReader.prototype, 'read').mockImplementation(() => { throw Error('PRIVATE_READ'); });
    const { createInjectedNativeDiagnosticWorkflow: factory } = await import('../../src/review/abort-scope-evidence-native-diagnostic.js');
    const owner = setup(factory, () => { expect(owner.diagnostics().upper.binding).toBe('bound'); return 60000; });
    const r = await owner.execute(new Response(new ReadableStream(), { status: 403 }), window);
    expect(events).toEqual(['reader', 'closed', 'cancel', 'release']); expect(new Set(readers).size).toBe(1);
    expect(read).not.toHaveBeenCalled(); expect(r.counts.consumed).toBe(1);
});
it.each(['reader', 'closed', 'release', 'closed_rejected'] as const)('retains native %s failure with no issuance and no secret output', async mode => {
    vi.resetModules(); const release = ReadableStreamDefaultReader.prototype.releaseLock;
    if (mode === 'reader') vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(() => { throw Error('PRIVATE_READER'); });
    if (mode === 'closed') vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => { throw Error('PRIVATE_CLOSED'); });
    if (mode === 'closed_rejected') vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => Promise.reject(Error('PRIVATE_CLOSED')));
    if (mode === 'release') vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { Reflect.apply(release, this, []); throw Error('PRIVATE_RELEASE'); });
    const { createInjectedNativeDiagnosticWorkflow: factory } = await import('../../src/review/abort-scope-evidence-native-diagnostic.js');
    const stream = new ReadableStream(), r = await setup(factory).execute(new Response(stream, { status: 403 }), window);
    expect(r.upper.slots.release.http?.status).toBe(403); expect(r.upper.slots.release.cleanup.phase).toBe('unconfirmed');
    expect(r.upper.teardown).toBe('unconfirmed'); expect(r.counts.issued).toBe(0);
    expect(r.operations.release_lock).toBe(mode === 'reader' ? 0 : 1); expect(stream.locked).toBe(false);
    expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect(vi.getTimerCount()).toBe(0);
});
it('joins cancel/close with pending native cleanup and freezes an unconfirmed terminal', async () => {
    let resolve!: () => void, calls = 0;
    const stream = new ReadableStream({ cancel() { calls++; return new Promise<void>(r => { resolve = r; }); } }), owner = setup();
    const pending = owner.execute(new Response(stream, { status: 403 }), window);
    await vi.advanceTimersByTimeAsync(0); owner.stop(); const closing = owner.close();
    const r = await pending; expect(await closing).toEqual(r); expect(calls).toBe(1);
    expect(r.upper.primary?.code).toBe('cancelled'); expect(r.upper.slots.release.cleanup.phase).toBe('unconfirmed');
    expect(r.operations).toMatchObject({ cancel: 1, release_lock: 1, read: 0 }); expect(r.counts.issued).toBe(0);
    resolve(); await vi.advanceTimersByTimeAsync(0); expect(owner.diagnostics()).toEqual(r); expect(vi.getTimerCount()).toBe(0);
});
it.each([200, 302, 500])('does not infer non-200 semantics or issue from HTTP%s', async status => {
    const r = await setup().execute(new Response(new ReadableStream(), { status }), window);
    expect(r.upper.slots.release.http?.status).toBe(status); expect(r.counts.issued).toBe(0);
    expect(r.upper.primary?.code).toBe('invalid_response'); expect(r.operations.cancel).toBe(1);
});
it.each(['issue', 'pre_guard', 'post_guard'] as const)('sanitizes clock failure at %s', async stage => {
    let owner: Owner;
    owner = setup(undefined, () => { if (owner.diagnostics().phase === stage) throw Error('PRIVATE_CLOCK'); return 60000; });
    const r = await owner.execute(new Response(null, { status: 403 }), window);
    expect(r.upper.primary?.code).toBe('internal_review_error'); expect(r.counts.consumed).toBe(0);
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('does not reset monotonic sampling between cleanup, issue and pre/post guards', async () => {
    let owner: Owner;
    owner = setup(undefined, () => owner.diagnostics().phase === 'pre_guard' ? 58000 : owner.diagnostics().phase === 'post_guard' ? 58500 : 60000);
    const r = await owner.execute(new Response(null, { status: 403 }), window);
    expect(r.upper.primary?.code).toBe('invalid_observation_time'); expect(r.counts.consumed).toBe(0); expect(r.token_held).toBe(false);
});
it.each(['schedule_throw', 'dispose_throw'] as const)('stops on %s without native retry', async mode => {
    const owner = createInjectedNativeDiagnosticWorkflow({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) },
        schedule() { if (mode === 'schedule_throw') throw Error('PRIVATE_SCHEDULER'); return () => { throw Error('PRIVATE_DISPOSE'); }; } });
    const r = await owner.execute(new Response(new ReadableStream(), { status: 403 }), window);
    expect(r.upper.slots.release.cleanup.phase).toBe('unconfirmed'); expect(r.counts.issued).toBe(0);
    expect(r.operations).toMatchObject({ cancel: 1, release_lock: 1, read: 0 }); expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('returns recursively frozen non-authoritative data without native handles or adopt/consumer ports', async () => {
    const owner = setup(), r = await owner.execute(new Response(null, { status: 404 }), window);
    expect(Object.keys(owner)).toEqual(['execute', 'stop', 'close', 'diagnostics']);
    for (const key of ['anchor', 'terminal', 'reader', 'token', 'consumer', 'binding', 'issue', 'adopt', 'registry', 'consume']) expect(r).not.toHaveProperty(key);
    const visit = (o: unknown) => { if (o && typeof o === 'object') { expect(Object.isFrozen(o)).toBe(true); for (const v of Object.values(o)) visit(v); } };
    visit(r); expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));
    const other = await setup().execute(r, window); expect(other.upper.primary?.code).toBe('invalid_response'); expect(other.counts.issued).toBe(0);
});
it.each(['session', 'consumer', 'cleanup', 'anchor', 'terminal', 'context', 'callback'] as const)('rejects constructor supply of %s before native or clock operations', async key => {
    const read = vi.fn(() => ({ remaining_ms: 60000 }));
    const raw = { fake_io: true, deadline_ms: 60000, budget: { read }, schedule: () => () => {}, [key]: {} };
    const r = await createInjectedNativeDiagnosticWorkflow(raw as never).execute(new Response(null, { status: 403 }), window);
    expect(read).not.toHaveBeenCalled(); expect(r.counts.issued).toBe(0); expect(r.upper.primary?.code).toBe('invalid_input');
});
it.each([{ ...window, purpose: 'parent' }, { ...window, purpose: 'authentication' }, { ...window, ordinal: 2 },
    { ...window, extra: 1 }, { ...window, cleanup_floor_ms: 60000 }, { ...window, window_origin_ms: 60001 },
    { ...window, window_origin_ms: Infinity }, { ...window, cleanup_floor_ms: NaN }])('rejects invalid descriptor %# before observing Response', async descriptor => {
    const owner = setup(), r = await owner.execute(new Response(null, { status: 403 }), descriptor);
    expect(r.upper.slots.release.http).toBeNull(); expect(r.counts.issued).toBe(0); expect(r.upper.primary?.code).toBe('invalid_input');
});
it('rejects descriptor/constructor proxies and accessors without invoking traps', async () => {
    let calls = 0; const input = { get budget() { calls++; throw Error('PRIVATE_GET'); }, fake_io: true, deadline_ms: 60000, schedule: () => () => {} };
    const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('PRIVATE_PROXY'); } });
    const a = createInjectedNativeDiagnosticWorkflow(input as never), b = setup();
    expect((await a.execute(new Response(null, { status: 403 }), window)).counts.issued).toBe(0);
    expect((await b.execute(new Response(null, { status: 403 }), proxy)).counts.issued).toBe(0);
    expect(calls).toBe(0);
});
it.each(['copy_terminal', 'foreign_terminal', 'copy_cleanup', 'foreign_anchor'])('rejects private provenance mismatch %s after spending its own consume claim', async scenario => {
    const r = await runNativeDiagnosticFaultFixture({ scenario }); if (!r.ok) throw Error('fixture');
    expect(r.diagnostic.counts).toEqual({ issued: 1, consume_attempts: 1, consumed: 0 });
    expect(r.diagnostic.upper.refusal?.code).toBe('evidence_binding_mismatch'); expect(r.diagnostic.token_held).toBe(false);
    expect(r.diagnostic.foreign_unchanged).toBe(true);
});
it('rejects a second private consumer invocation without erasing prior non-executable acceptance', async () => {
    const r = await runNativeDiagnosticFaultFixture({ scenario: 'consume_twice' }); if (!r.ok) throw Error('fixture');
    expect(r.diagnostic.counts).toEqual({ issued: 1, consume_attempts: 1, consumed: 1 });
    expect(r.diagnostic.upper.refusal?.code).toBe('invalid_state');
    expect(r.diagnostic.upper.slots.release.acceptance).toEqual({ phase: 'revoked', first_terminal: 'accepted', consumes: 1 });
});
it('does not accept fault controls or copied diagnostic supply at the injection-only constructor', async () => {
    const input = { fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, schedule: () => () => {}, fault: 'copy_terminal' };
    const r = await createInjectedNativeDiagnosticWorkflow(input as never).execute(new Response(null, { status: 403 }), window);
    expect(r.upper.primary?.code).toBe('invalid_input');
    expect(await runNativeDiagnosticFaultFixture(r)).toMatchObject({ ok: false, code: 'invalid_input' });
});
it.each(['budget', 'scheduler'] as const)('handles a rejected Promise returned by the synchronous %s boundary', async mode => {
    const input = { fake_io: true, deadline_ms: 60000,
        budget: { read: mode === 'budget' ? () => Promise.reject(Error('PRIVATE_ASYNC_BUDGET')) : () => ({ remaining_ms: 60000 }) },
        schedule: mode === 'scheduler' ? () => Promise.reject(Error('PRIVATE_ASYNC_SCHEDULER')) : () => () => {} };
    const r = await createInjectedNativeDiagnosticWorkflow(input as never).execute(new Response(new ReadableStream(), { status: 403 }), window);
    expect(r.counts.issued).toBe(0); expect(r.upper.primary).not.toBeNull(); expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
