import { afterEach, expect, it, vi } from 'vitest';
import { ReadableStream, ReadableStreamDefaultReader } from 'node:stream/web';
import { createInjectedStatusCleanupOwner, createInjectedStatusWorkflowOwner } from '../../src/review/abort-scope-evidence-status-cleanup.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const window = { purpose: 'release', ordinal: 1, window_origin_ms: 60000, cleanup_floor_ms: 50000 };
type Owner = ReturnType<typeof createInjectedStatusWorkflowOwner>;
function get<T>(r: { ok: true; value: T } | { ok: false; code: string }): T { if (!r.ok) throw Error(r.code); return r.value; }
function workflow(owner: Owner) { const d = owner.diagnostics().workflow; if (!d) throw Error('workflow missing'); return d; }
function setup(factory = createInjectedStatusWorkflowOwner, clock?: () => number) {
    vi.useFakeTimers(); const start = Date.now();
    return factory({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: clock ? clock() : 60000 - (Date.now() - start) }) },
        schedule(delay, wake) { const timer = setTimeout(wake, delay); return () => clearTimeout(timer); } });
}
const expectations = [
    ['release', 403, true, null, 1], ['release', 404, true, null, 1], ['release', 403, false, null, 1], ['release', 404, false, null, 1],
    ['authentication', 401, true, 'authentication_failed', 0], ['parent', 401, false, 'authentication_failed', 0], ['release', 401, true, 'authentication_failed', 0],
    ['authentication', 403, false, 'access_denied', 0], ['parent', 403, true, 'access_denied', 0], ['parent', 404, true, null, 0], ['parent', 404, false, null, 0],
] as const;
it('has eleven unique purpose/status/body expectations independent of product eligibility helpers', () => {
    expect(expectations).toHaveLength(11); expect(new Set(expectations.map(r => r.slice(0, 3).join('/'))).size).toBe(11);
});
it.each(expectations)('connects native cleanup to fixed consumption: %s/%s/body=%s', async (purpose, status, body, primary, consumed) => {
    vi.stubGlobal('fetch', () => { throw Error('network forbidden'); });
    const stream = body ? new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('PRIVATE_CODE_BODY')); } }) : null;
    const owner = setup(), a = get(await owner.acquire(new Response(stream, { status }), { ...window, purpose }));
    const done = get(await owner.finish(a.handle)), w = workflow(owner);
    expect(done).toMatchObject({ kind: 'injected_status_workflow', primary, cleanup: { disposition: 'confirmed', kind: body ? 'cancelled' : 'no_body' } });
    expect(w).toMatchObject({ scope: 'injected_only', phase: consumed ? 'consumed' : 'diagnostic_only', first_terminal: consumed ? 'consumed' : 'diagnostic_only',
        claims: { issue: 'spent', consume: 'spent' }, counts: { issued: consumed, consume_attempts: consumed, consumed }, token_held: false });
    expect(owner.diagnostics().operations).toEqual(body ? { get_reader: 1, read: 0, cancel: 1, closed: 1, release_lock: 1 } : { get_reader: 0, read: 0, cancel: 0, closed: 0, release_lock: 0 });
    expect(w.consumption).toEqual(consumed ? { kind: 'injected_status_consumed', scope: 'injected_only', purpose: 'release', status,
        body_mode: body ? 'cancelled' : 'no_body', permissions: done.permissions } : null);
    expect(Object.values(w.permissions)).toEqual(Array(7).fill(false)); expect(JSON.stringify(done)).not.toContain('PRIVATE');
    if (stream) expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('observes the same reader through cleanup, then issue/pre/post clocks, without any read', async () => {
    vi.resetModules(); const events: string[] = [], readers: unknown[] = [];
    const getReader = ReadableStream.prototype.getReader, closed = Object.getOwnPropertyDescriptor(ReadableStreamDefaultReader.prototype, 'closed')!.get!;
    const cancel = ReadableStreamDefaultReader.prototype.cancel, release = ReadableStreamDefaultReader.prototype.releaseLock;
    vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(function () { events.push('reader'); return Reflect.apply(getReader, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(function () { events.push('closed'); readers.push(this); return Reflect.apply(closed, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel').mockImplementation(function () { events.push('cancel'); readers.push(this); return Reflect.apply(cancel, this, []); });
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { events.push('release'); readers.push(this); return Reflect.apply(release, this, []); });
    const read = vi.spyOn(ReadableStreamDefaultReader.prototype, 'read').mockImplementation(() => { throw Error('forbidden read'); });
    const { createInjectedStatusWorkflowOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    const owner = setup(factory, () => { const p = workflow(owner).phase; if (['issuing', 'consuming_pre', 'consuming_post'].includes(p)) events.push(p); return 60000; });
    const a = get(await owner.acquire(new Response(new ReadableStream(), { status: 403 }), window)); get(await owner.finish(a.handle));
    expect(events).toEqual(['reader', 'closed', 'cancel', 'release', 'issuing', 'consuming_pre', 'consuming_post']);
    expect(new Set(readers).size).toBe(1); expect(read).not.toHaveBeenCalled(); expect(workflow(owner).counts.consumed).toBe(1);
});
it.each(['issuing', 'consuming_pre', 'consuming_post'] as const)('rejects cancellation during %s without rewriting cleanup', async stage => {
    let fired = false;
    const owner = setup(undefined, () => { if (!fired && workflow(owner).phase === stage) { fired = true; owner.stop(); } return 60000; });
    const stream = new ReadableStream(), a = get(await owner.acquire(new Response(stream, { status: 403 }), window)); get(await owner.finish(a.handle));
    expect(fired).toBe(true);
    expect(owner.diagnostics()).toMatchObject({ primary: 'cancelled', revoked: true, stop_reason: 'cancelled', cleanup: { disposition: 'confirmed' } });
    expect(workflow(owner)).toMatchObject({ first_terminal: 'revoked', counts: { issued: stage === 'issuing' ? 0 : 1, consumed: 0 }, consumption: null, claims: { issue: 'spent', consume: 'spent' }, token_held: false });
    expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it.each(['issuing', 'consuming_pre', 'consuming_post'] as const)('rejects reentry during %s and never repeats native cleanup', async stage => {
    let fired = false, handle: Parameters<Owner['finish']>[0], reentered: ReturnType<Owner['finish']> | undefined;
    const owner = setup(undefined, () => { if (!fired && workflow(owner).phase === stage) { fired = true; reentered = owner.finish(handle); } return 60000; });
    handle = get(await owner.acquire(new Response(new ReadableStream(), { status: 403 }), window)).handle;
    get(await owner.finish(handle)); expect(await reentered).toMatchObject({ ok: false, code: 'invalid_state' });
    expect(workflow(owner)).toMatchObject({ first_terminal: 'failed', counts: { consumed: 0 }, consumption: null });
    expect(owner.diagnostics().operations).toMatchObject({ read: 0, cancel: 1, release_lock: 1 }); expect(vi.getTimerCount()).toBe(0);
});
it.each(['issuing', 'consuming_pre', 'consuming_post'] as const)('rejects an original-floor crossing during %s', async stage => {
    let time = 60000;
    const owner = setup(undefined, () => { if (workflow(owner).phase === stage) time = 50000; return time; });
    const a = get(await owner.acquire(new Response(new ReadableStream(), { status: 403 }), window)); get(await owner.finish(a.handle));
    expect(owner.diagnostics()).toMatchObject({ primary: 'deadline_exceeded', cleanup: { disposition: 'confirmed' } });
    expect(workflow(owner)).toMatchObject({ counts: { consumed: 0 }, consumption: null, token_held: false }); expect(vi.getTimerCount()).toBe(0);
});
it.each(['issuing', 'consuming_pre', 'consuming_post'] as const)('does not leak clock failure during %s', async stage => {
    const owner = setup(undefined, () => { if (workflow(owner).phase === stage) throw Error('PRIVATE_CLOCK_TOKEN'); return 60000; });
    const a = get(await owner.acquire(new Response(null, { status: 404 }), window)); get(await owner.finish(a.handle));
    expect(owner.diagnostics()).toMatchObject({ primary: 'internal_review_error', cleanup: { disposition: 'confirmed', kind: 'no_body' } });
    expect(workflow(owner).consumption).toBeNull(); expect(JSON.stringify(owner.diagnostics())).not.toContain('PRIVATE');
});
it('does not reset last remaining between release and private issuance', async () => {
    let base = 59000;
    const owner = setup(undefined, () => workflow(owner).phase === 'issuing' ? 59500 : base);
    const a = get(await owner.acquire(new Response(new ReadableStream(), { status: 403 }), window)); base = 58000;
    get(await owner.finish(a.handle));
    expect(owner.diagnostics().primary).toBe('invalid_observation_time'); expect(workflow(owner).counts.issued).toBe(0);
    expect(owner.diagnostics().cleanup?.disposition).toBe('confirmed');
});
it('checks monotonicity between pre/post consume clocks within the original upper limit', async () => {
    const owner = setup(undefined, () => workflow(owner).phase === 'consuming_pre' ? 58000 : workflow(owner).phase === 'consuming_post' ? 58500 : 60000);
    const a = get(await owner.acquire(new Response(null, { status: 403 }), window)); get(await owner.finish(a.handle));
    expect(owner.diagnostics().primary).toBe('invalid_observation_time'); expect(workflow(owner)).toMatchObject({ counts: { issued: 1, consume_attempts: 1, consumed: 0 }, consumption: null });
});
it('joins stop/close/finish cleanup and never issues on cancellation while cancel is pending', async () => {
    let resolve!: () => void, calls = 0;
    const stream = new ReadableStream({ cancel() { calls++; return new Promise<void>(r => { resolve = r; }); } }), owner = setup();
    const a = get(await owner.acquire(new Response(stream, { status: 401 }), window)), work = owner.finish(a.handle);
    await vi.advanceTimersByTimeAsync(0); owner.stop(); const closing = owner.close(); resolve(); get(await work); await closing;
    expect(calls).toBe(1); expect(owner.diagnostics()).toMatchObject({ primary: 'authentication_failed', stop_reason: 'cancelled', cleanup: { disposition: 'confirmed' } });
    expect(workflow(owner)).toMatchObject({ first_terminal: 'revoked', counts: { issued: 0, consumed: 0 }, consumption: null });
    expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('freezes an unconfirmed pending cleanup and never issues when it settles late', async () => {
    let resolve!: () => void;
    const stream = new ReadableStream({ cancel() { return new Promise<void>(r => { resolve = r; }); } }), owner = setup();
    const a = get(await owner.acquire(new Response(stream, { status: 403 }), window)), work = owner.finish(a.handle);
    await vi.advanceTimersByTimeAsync(10000); get(await work); const before = owner.diagnostics();
    expect(before.cleanup).toMatchObject({ disposition: 'unconfirmed', reason: 'cancel_pending' }); expect(workflow(owner).counts.issued).toBe(0);
    resolve(); await vi.advanceTimersByTimeAsync(0); expect(owner.diagnostics()).toEqual(before); expect(vi.getTimerCount()).toBe(0);
});
it.each([403, 401])('preserves HTTP %s separately from rejected cancel', async status => {
    const owner = setup(), a = get(await owner.acquire(new Response(new ReadableStream({ cancel() { throw Error('PRIVATE_CANCEL'); } }), { status }), window));
    get(await owner.finish(a.handle));
    expect(owner.diagnostics()).toMatchObject({ primary: status === 401 ? 'authentication_failed' : 'internal_review_error', http: { status }, cleanup: { disposition: 'unconfirmed', reason: 'cancel_rejected' } });
    expect(workflow(owner)).toMatchObject({ first_terminal: 'failed', claims: { issue: 'spent', consume: 'spent' }, counts: { issued: 0, consumed: 0 } });
});
it.each(['get_reader', 'closed', 'release'] as const)('retains native %s failure without issuing or retrying', async mode => {
    vi.resetModules(); const release = ReadableStreamDefaultReader.prototype.releaseLock;
    if (mode === 'get_reader') vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(() => { throw Error('PRIVATE_ACQUIRE'); });
    if (mode === 'closed') vi.spyOn(ReadableStreamDefaultReader.prototype, 'closed', 'get').mockImplementation(() => { throw Error('PRIVATE_CAPTURE'); });
    if (mode === 'release') vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { Reflect.apply(release, this, []); throw Error('PRIVATE_RELEASE'); });
    const { createInjectedStatusWorkflowOwner: factory } = await import('../../src/review/abort-scope-evidence-status-cleanup.js');
    const owner = setup(factory), a = await owner.acquire(new Response(new ReadableStream(), { status: 403 }), window);
    if (a.ok) get(await owner.finish(a.value.handle));
    expect(owner.diagnostics().cleanup?.disposition).toBe('unconfirmed'); expect(workflow(owner).counts.issued).toBe(0);
    expect(owner.diagnostics().operations).toMatchObject({ read: 0, release_lock: mode === 'get_reader' ? 0 : 1 }); expect(JSON.stringify(owner.diagnostics())).not.toContain('PRIVATE');
});
it('rejects foreign/copy handles before any private issuance and leaves foreign ownership intact', async () => {
    const a = setup(), b = setup(), own = new ReadableStream(), foreign = new ReadableStream();
    const x = get(await a.acquire(new Response(own, { status: 403 }), window)), y = get(await b.acquire(new Response(foreign, { status: 403 }), window));
    const before = b.diagnostics(); expect(await a.finish(y.handle)).toMatchObject({ ok: false, code: 'evidence_binding_mismatch' });
    expect(b.diagnostics()).toEqual(before); expect(own.locked).toBe(false); expect(foreign.locked).toBe(true); expect(workflow(a).counts.issued).toBe(0);
    get(await b.finish(y.handle)); expect(workflow(b).counts.consumed).toBe(1);
    expect((await a.finish({ ...x.handle })).ok).toBe(false); expect(workflow(a).counts.consumed).toBe(0);
});
it.each(['finish', 'stop', 'close'] as const)('keeps successful history when later %s changes the latest state', async action => {
    const owner = setup(), a = get(await owner.acquire(new Response(null, { status: 403 }), window)); const first = get(await owner.finish(a.handle));
    if (action === 'finish') expect((await owner.finish(a.handle)).ok).toBe(false);
    if (action === 'stop') owner.stop();
    if (action === 'close') await owner.close();
    expect(workflow(owner)).toMatchObject({ first_terminal: 'consumed', counts: { issued: 1, consume_attempts: 1, consumed: 1 }, consumption: first.workflow?.consumption });
    expect(owner.diagnostics().cleanup).toEqual(first.cleanup); expect(owner.diagnostics().operations).toEqual(first.operations);
});
it('retains immutable, non-authoritative output and exposes no token/consume/adopt port', async () => {
    const owner = setup(), a = get(await owner.acquire(new Response(null, { status: 404 }), window)), r = get(await owner.finish(a.handle));
    expect(Object.keys(owner)).toEqual(['acquire', 'finish', 'stop', 'close', 'diagnostics']);
    for (const key of ['token', 'context', 'anchor', 'record', 'registry', 'consumer', 'consume', 'adopt']) expect(r).not.toHaveProperty(key);
    for (const o of [r, r.http, r.cleanup, r.cleanup?.facts, r.operations, r.permissions, r.workflow, r.workflow?.claims, r.workflow?.counts, r.workflow?.consumption, r.workflow?.permissions]) expect(Object.isFrozen(o)).toBe(true);
    expect(Reflect.set(r.workflow!.counts, 'consumed', 99)).toBe(false); expect(Reflect.set(r.permissions, 'fallback', true)).toBe(false);
    expect((await owner.acquire(new Response(null, { status: 403 }), window)).ok).toBe(false);
});
it.each(['record', 'consumer', 'callback', 'registry', 'context', 'session'] as const)('rejects constructor injection of %s before Response ownership', async key => {
    const input = { fake_io: true as const, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, schedule: () => () => {}, [key]: {} };
    const owner = createInjectedStatusWorkflowOwner(input), stream = new ReadableStream();
    expect(await owner.acquire(new Response(stream, { status: 403 }), window)).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(Object.values(owner.diagnostics().operations)).toEqual([0, 0, 0, 0, 0]); expect(stream.locked).toBe(false);
});
it('rejects constructor/descriptor accessors and proxies without executing getters', async () => {
    let calls = 0; const input = { fake_io: true as const, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, schedule: () => () => {} };
    Object.defineProperty(input, 'budget', { get() { calls++; throw Error('PRIVATE_GET'); } });
    const owner = createInjectedStatusWorkflowOwner(input);
    expect((await owner.acquire(new Response(null, { status: 403 }), window)).ok).toBe(false);
    const proxy = new Proxy(input, { ownKeys() { calls++; throw Error('PRIVATE_PROXY'); } });
    expect((await createInjectedStatusWorkflowOwner(proxy).acquire(new Response(null, { status: 403 }), window)).ok).toBe(false); expect(calls).toBe(0);
});
it('pins the original readonly budget method and deadline rather than adopting replacements', async () => {
    vi.useFakeTimers(); let calls = 0;
    const input = { fake_io: true as const, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, schedule: () => () => {} };
    const owner = createInjectedStatusWorkflowOwner(input);
    input.budget.read = () => { calls++; return { remaining_ms: 0 }; }; input.deadline_ms = 1;
    const a = get(await owner.acquire(new Response(null, { status: 403 }), window)); get(await owner.finish(a.handle));
    expect(calls).toBe(0); expect(workflow(owner).counts.consumed).toBe(1);
});
it.each([true, false])('does not adopt legacy cleanup ownership or diagnostics (body=%s)', async body => {
    const legacy = setup(createInjectedStatusCleanupOwner), stream = body ? new ReadableStream() : null, response = new Response(stream, { status: 403 });
    const a = get(await legacy.acquire(response, window)), d = get(await legacy.finish(a.handle)), before = legacy.diagnostics();
    expect(d.kind).toBe('cleanup_diagnostic_only'); expect(d.workflow).toBeUndefined();
    const owner = setup(); expect((await owner.acquire(response, window)).ok).toBe(false);
    expect((await owner.finish(a.handle)).ok).toBe(false);
    expect(workflow(owner).counts).toEqual({ issued: 0, consume_attempts: 0, consumed: 0 });
    expect(legacy.diagnostics()).toEqual(before);
});
