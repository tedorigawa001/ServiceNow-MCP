import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createInjectedNativeBodyLane } from '../../src/servicenow/review-native-body.js';
import { registerReviewEvidenceSession } from '../../src/servicenow/review-evidence-lifecycle.js';
import { createInjectedNativeReaderOwner } from '../../src/servicenow/review-native-adapter.js';
import { BootstrapBodyFailure } from '../../src/servicenow/review-bootstrap-body.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const window = { purpose: 'parent' as const, ordinal: 1 as const, io_floor_ms: 50250, cleanup_floor_ms: 50000 };
it('keeps the shared total G cap and charges the native overshoot exactly once', async () => {
    const s = bootstrap('per-user', { total_bytes: 3 });
    expect(await s.run()).toEqual({ ok: false, code: 'receive_budget_exceeded' });
    expect(s.counters).toEqual({ requests: 1, received_bytes: s.bytes(), payload_bytes: 0 });
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ reservation_released: true, body: { cleanup: { disposition: 'confirmed', kind: 'cancelled' }, consumes: 0, acknowledgements: 0, retained_bytes: 0 } });
});
it('keeps the four final reservations ahead of native dispatch and closes without a request when C is exhausted', async () => {
    const s = bootstrap('per-user', { requests: 4 });
    expect(await s.run()).toEqual({ ok: false, code: 'request_budget_exceeded' });
    expect(s.counters.requests).toBe(0);
    expect(s.bytes()).toBe(0);
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ state: 'ordinary_closed', reservation_released: true, body: { native: { claims: 0, reads: 0 }, consumes: 0, acknowledgements: 0 } });
});
it.each(['expired', 'cancelled'] as const)('refuses %s native evidence consumption after successful release', async (kind) => {
    vi.useFakeTimers();
    const start = Date.now();
    const owner = createInjectedNativeReaderOwner({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 - (Date.now() - start) }) }, dispatch: () => new Response('{}'), schedule(ms, wake) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } });
    const acquired = await owner.acquire(window);
    if (!acquired.ok)
        throw Error(acquired.code);
    for (let i = 0; i < 3; i++) {
        const next = await owner.read(acquired.value.handle);
        if (!next.ok)
            throw Error(next.code);
        if (next.value.done)
            break;
    }
    const end = await owner.finish(acquired.value.handle);
    if (!end.ok)
        throw Error(end.code);
    if (kind === 'expired')
        vi.setSystemTime(Date.now() + 10000);
    else
        owner.stop('cancelled');
    expect(owner.consumeEnd(acquired.value.handle, end.value.evidence)).toEqual({ ok: false, code: kind === 'expired' ? 'attempt_deadline_exceeded' : 'cancelled' });
    expect(owner.status().cleanup).toMatchObject({ disposition: 'confirmed', kind: 'eof' });
});
it('rejects foreign, copied and replayed native end evidence without consuming another owner proof', async () => {
    const make = () => createInjectedNativeReaderOwner({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, dispatch: () => new Response(new Uint8Array()), schedule(ms, wake) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } });
    const get = <T>(r: {
        ok: true;
        value: T;
    } | {
        ok: false;
        code: string;
    }) => {
        if (!r.ok)
            throw Error(r.code);
        return r.value;
    };
    const a = make(), b = make(), c = make(), ha = get(await a.acquire(window)), hb = get(await b.acquire(window)), hc = get(await c.acquire(window));
    for (const [owner, entry] of [[a, ha], [b, hb], [c, hc]] as const) {
        for (let i = 0; i < 3; i++) {
            if (get(await owner.read(entry.handle)).done)
                break;
        }
    }
    const ea = get(await a.finish(ha.handle)), eb = get(await b.finish(hb.handle)), ec = get(await c.finish(hc.handle));
    expect(b.consumeEnd(hb.handle, ea.evidence)).toEqual({ ok: false, code: 'evidence_binding_mismatch' });
    expect(c.consumeEnd(hc.handle, { ...ec.evidence })).toEqual({ ok: false, code: 'evidence_binding_mismatch' });
    expect(a.consumeEnd(ha.handle, ea.evidence)).toMatchObject({ ok: true, value: { kind: 'eof' } });
    expect(a.consumeEnd(ha.handle, ea.evidence)).toEqual({ ok: false, code: 'invalid_state' });
    expect(b.consumeEnd(hb.handle, eb.evidence)).toEqual({ ok: false, code: 'evidence_binding_mismatch' });
});
function setup(response: () => Response | Promise<Response>, limit = 4194304, factory = createInjectedNativeBodyLane) {
    vi.useFakeTimers();
    const start = Date.now();
    let charged = 0, reason: string | undefined;
    const lane = factory({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 - (Date.now() - start) }) }, dispatch: response, schedule(ms, wake) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } }, { check() { }, charge(n) { charged += n; }, stop(code) { reason ??= code; }, responseLimit: limit });
    return { lane, charged: () => charged, reason: () => reason };
}
function bootstrap(auth: 'per-user' | 'exchange' = 'per-user', limits: Partial<{
    requests: number;
    total_bytes: number;
    response_bytes: number;
    deadline_ms: number;
}> = {}) {
    vi.useFakeTimers();
    const start = Date.now(), id = 'a'.repeat(32), snapshot = {}, source = {}, permit = {}, counters = { requests: 0, received_bytes: 0, payload_bytes: 0 };
    let reserved = 0, bytes = 0;
    const lease = { read: () => ({ ...counters, remaining_ms: 60000 - (Date.now() - start) }) };
    const port = { matches: () => true, copyRelease: () => ({ instance_release: { source: 'sys_cluster_state.build_name' as const, resolution_status: 'resolved' as const, family: 'Australia', raw_buildname: 'Australia', observed_at: '2026-10-29T00:00:00Z', visibility_scope: 'caller_acl' as const }, limitations: ['release_visible_nodes_only'] }) };
    let dispatch = (request: {
        purpose: string;
    }): Response | Promise<Response> => {
        const value = request.purpose === 'authentication' ? { access_token: 'PRIVATE_TOKEN', expires_in: 3600, token_type: 'bearer' } : request.purpose === 'parent' ? { result: { sys_id: id, state: 'in progress', application: 'global', sys_updated_on: '2026-10-29', sys_mod_count: '0' } } : { result: [{ build_name: 'Australia' }] };
        const raw = new TextEncoder().encode(JSON.stringify(value));
        bytes += raw.length;
        return new Response(raw);
    };
    const deps = { fake_io: true as const, typed_body: true as const, native_body: true as const, lease, source, target: id, auth, limits: { requests: 210, total_bytes: 16777216, response_bytes: 4194304, deadline_ms: 60000, ...limits }, accounting: { reserve() { reserved = 4; }, reserved: () => reserved, dispatch() { counters.requests++; }, chunk(n: number) { counters.received_bytes += n; }, release() { reserved = 0; } }, dispatch: async (request: {
            purpose: string;
        }) => dispatch(request), resolveRelease: () => ({ source, permit, port }), schedule(ms: number, wake: () => void) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } };
    const owner = registerReviewEvidenceSession({}, snapshot, lease, deps), claimed = owner.transportConstructor.claim(snapshot, lease);
    if (!claimed.ok)
        throw Error(claimed.code);
    return { owner, counters, bytes: () => bytes, defaultDispatch: dispatch, setDispatch(fn: typeof dispatch) { dispatch = fn; }, run: () => owner.transportConstructor.bootstrap(claimed.value, snapshot, lease) };
}
it('connects injected native bootstrap parent/release through the same budget and prepared acknowledgement', async () => {
    const s = bootstrap();
    const result = await s.run();
    expect(result).toMatchObject({ ok: true, value: { state: 'prepared_only', evidence_issuance: 'disabled' } });
    expect(s.counters).toEqual({ requests: 2, received_bytes: s.bytes(), payload_bytes: 0 });
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ body: { proofs_consumed: 2, consumes: 2, acknowledgements: 2, retained_bytes: 0, cleanup: { disposition: 'confirmed' } } });
    expect(vi.getTimerCount()).toBe(0);
    s.owner.close('closed');
});
it('keeps cancellation separate from confirmed native cleanup and never parses pending bytes', async () => {
    const s = bootstrap();
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancels++; } });
    s.setDispatch(() => new Response(stream));
    const pending = s.run();
    for (let i = 0; i < 50; i++)
        await Promise.resolve();
    s.owner.revoke('cancelled');
    expect(await pending).toEqual({ ok: false, code: 'cancelled' });
    expect(cancels).toBe(1);
    expect(stream.locked).toBe(false);
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ body: { cleanup: { disposition: 'confirmed', kind: 'cancelled' }, consumes: 0, acknowledgements: 0, proofs_consumed: 0, retained_bytes: 0 } });
    expect(vi.getTimerCount()).toBe(0);
});
it('rejects malformed JSON after native EOF cleanup and retains no bytes or parsed values', async () => {
    const s = setup(() => new Response('PRIVATE_INVALID_JSON'));
    await expect(s.lane.read(window)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(s.lane.diagnostic()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'eof' }, proofs_consumed: 1, consumes: 1, acknowledgements: 0, retained_bytes: 0 });
    expect(JSON.stringify(s.lane.diagnostic())).not.toContain('PRIVATE');
});
it.each(['cancel_pending', 'cancel_rejected'] as const)('keeps %s unconfirmed after an over-limit chunk and never consumes native evidence', async (kind) => {
    let complete!: () => void;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4)); }, cancel() { return kind === 'cancel_pending' ? new Promise<void>(resolve => { complete = resolve; }) : Promise.reject(Error('PRIVATE_CANCEL')); } }), s = setup(() => new Response(stream), 3);
    const pending = s.lane.read(window), checked = expect(pending).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    await vi.advanceTimersByTimeAsync(10000);
    await checked;
    const before = s.lane.diagnostic();
    expect(before).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: kind }, proofs_consumed: 0, consumes: 0, acknowledgements: 0, retained_bytes: 0 });
    if (kind === 'cancel_pending')
        complete();
    for (let i = 0; i < 10; i++)
        await Promise.resolve();
    expect(s.lane.diagnostic()).toEqual(before);
    expect(stream.locked).toBe(false);
    expect(s.charged()).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
});
it('allows a confirmed HTTP 503 retry without resetting G/C and only after native proof and ack', async () => {
    const s = bootstrap();
    let calls = 0;
    s.setDispatch(request => ++calls === 1 ? new Response('PRIVATE_HTTP', { status: 503 }) : s.defaultDispatch(request));
    expect(await s.run()).toMatchObject({ ok: true });
    expect(calls).toBe(3);
    expect(s.counters.requests).toBe(3);
    expect(s.counters.received_bytes).toBe(s.bytes() + 12);
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ body: { proofs_consumed: 3, consumes: 3, acknowledgements: 3 } });
    s.owner.close('closed');
});
it('handles injected native OAuth bytes without exposing the token or a body in diagnostics', async () => {
    const s = bootstrap('exchange'), result = await s.run();
    expect(result).toMatchObject({ ok: true });
    expect(s.counters.requests).toBe(3);
    expect(s.counters.received_bytes).toBe(s.bytes());
    const diagnostic = s.owner.transportConstructor.diagnostic();
    expect(diagnostic.bootstrap).toMatchObject({ body: { proofs_consumed: 3, consumes: 3, acknowledgements: 3, retained_bytes: 0 } });
    expect(JSON.stringify({ result, diagnostic })).not.toContain('PRIVATE_TOKEN');
    s.owner.close('closed');
});
it('refuses native release failure before candidate creation instead of trusting fake cleanup fields', async () => {
    vi.resetModules();
    const release = ReadableStreamDefaultReader.prototype.releaseLock;
    vi.spyOn(ReadableStreamDefaultReader.prototype, 'releaseLock').mockImplementation(function () { Reflect.apply(release, this, []); throw Error('PRIVATE_RELEASE'); });
    const { createInjectedNativeBodyLane: factory } = await import('../../src/servicenow/review-native-body.js');
    const s = setup(() => new Response('{"result":1}'), 4194304, factory);
    await expect(s.lane.read(window)).rejects.toMatchObject({ code: 'internal_review_error' });
    expect(s.lane.diagnostic()).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: 'lock_release_failed' }, proofs_consumed: 0, consumes: 0, acknowledgements: 0, retained_bytes: 0 });
    expect(JSON.stringify(s.lane.diagnostic())).not.toContain('PRIVATE');
});
it.each(['empty', 'nonempty'] as const)('enforces the existing %s chunk cap and charges every delivered chunk once', async (kind) => {
    const count = kind === 'empty' ? 17 : 4097;
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>({ start(c) {
            for (let i = 0; i < count; i++)
                c.enqueue(new Uint8Array(kind === 'empty' ? 0 : 1));
        }, cancel() { cancels++; } }), s = setup(() => new Response(stream));
    await expect(s.lane.read(window)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(s.charged()).toBe(kind === 'empty' ? 0 : 4097);
    expect(cancels).toBe(1);
    expect(stream.locked).toBe(false);
    expect(s.lane.diagnostic()).toMatchObject({ proofs_consumed: 0, consumes: 0, acknowledgements: 0, retained_bytes: 0 });
});
it('keeps a copied chunk stable when accounting mutates the delivered source buffer', async () => {
    const raw = new TextEncoder().encode('{"value":7}'), hash = createHash('sha256').update(raw).digest('hex');
    let charged = 0;
    const lane = createInjectedNativeBodyLane({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, dispatch: () => new Response(new ReadableStream({ start(c) { c.enqueue(raw); c.close(); } })), schedule(ms, wake) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } }, { check() { }, charge(n) { charged += n; raw.fill(0); }, stop() { }, responseLimit: 100 });
    expect(await lane.read(window)).toMatchObject({ value: { value: 7 }, sha256: hash, received_bytes: 11 });
    expect(charged).toBe(11);
});
it.each(['shared', 'nonbyte'] as const)('rejects %s chunks without decode or ack', async (kind) => {
    const value = kind === 'shared' ? new Uint8Array(new SharedArrayBuffer(2)) : 'PRIVATE_CHUNK';
    const stream = new ReadableStream({ start(c) { c.enqueue(value); }, cancel() { } }), s = setup(() => new Response(stream));
    await expect(s.lane.read(window)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(s.lane.diagnostic()).toMatchObject({ proofs_consumed: 0, consumes: 0, acknowledgements: 0, retained_bytes: 0 });
    expect(stream.locked).toBe(false);
});
it('does not turn no_body into EOF or a fallback candidate', async () => {
    const s = setup(() => new Response(null));
    await expect(s.lane.read(window)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(s.lane.diagnostic()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'no_body' }, native: { claims: 0, releases: 0 }, proofs_consumed: 0, consumes: 0, acknowledgements: 0 });
});
it('disposes a late native response without repairing the original terminal or charging bytes', async () => {
    let respond!: (r: Response) => void, cancels = 0;
    const s = setup(() => new Promise(resolve => { respond = resolve; }));
    const pending = s.lane.read(window), checked = expect(pending).rejects.toMatchObject({ code: 'upstream_unavailable' });
    await vi.advanceTimersByTimeAsync(9750);
    await checked;
    const before = s.lane.diagnostic();
    respond(new Response(new ReadableStream({ cancel() { cancels++; } })));
    for (let i = 0; i < 20; i++)
        await Promise.resolve();
    expect(cancels).toBe(1);
    expect(s.charged()).toBe(0);
    expect(s.lane.diagnostic()).toEqual(before);
    expect(before).toMatchObject({ cleanup: { disposition: 'unconfirmed', reason: 'fetch_pending' }, proofs_consumed: 0, acknowledgements: 0 });
});
it.each([[401, 'authentication_failed'], [403, 'access_denied'], [404, 'invalid_response']] as const)('keeps native HTTP %s classification after cleanup and never retries', async (status, code) => {
    const s = bootstrap();
    s.setDispatch(() => new Response('PRIVATE_ERROR', { status }));
    expect(await s.run()).toEqual({ ok: false, code });
    expect(s.counters.requests).toBe(1);
    const diagnostic = s.owner.transportConstructor.diagnostic();
    expect(diagnostic.bootstrap).toMatchObject({ body: { cleanup: { disposition: 'confirmed', kind: 'eof' }, proofs_consumed: 1, acknowledgements: 1, retained_bytes: 0 } });
    expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE');
});
it('refuses response reuse across bootstrap attempts without acquiring another reader', async () => {
    const s = bootstrap(), response = s.defaultDispatch({ purpose: 'parent' });
    s.setDispatch(() => response);
    expect(await s.run()).toEqual({ ok: false, code: 'invalid_response' });
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ body: { proofs_consumed: 1, consumes: 1, acknowledgements: 1, native: { claims: 1, releases: 1 } } });
    expect(s.counters.requests).toBe(2);
});
it.each(['cancelled', 'expired'] as const)('refuses %s between decode and ack without returning parsed data', async (kind) => {
    vi.useFakeTimers();
    const start = Date.now();
    let cancelled = false;
    const parse = JSON.parse;
    vi.spyOn(JSON, 'parse').mockImplementation(text => {
        const value = parse(text);
        queueMicrotask(() => {
            if (kind === 'cancelled')
                cancelled = true;
            else
                vi.setSystemTime(Date.now() + 10000);
        });
        return value;
    });
    const lane = createInjectedNativeBodyLane({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 - (Date.now() - start) }) }, dispatch: () => new Response('{"secret":"PRIVATE"}'), schedule(ms, wake) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } }, { check() {
            if (cancelled)
                throw new BootstrapBodyFailure('cancelled');
            if (Date.now() - start >= 10000)
                throw new BootstrapBodyFailure('upstream_unavailable');
        }, charge() { }, stop() { }, responseLimit: 4194304 });
    await expect(lane.read(window)).rejects.toMatchObject({ code: kind === 'cancelled' ? 'cancelled' : 'upstream_unavailable' });
    expect(lane.diagnostic()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'eof' }, proofs_consumed: 1, consumes: 1, acknowledgements: 0, retained_bytes: 0 });
    expect(JSON.stringify(lane.diagnostic())).not.toContain('PRIVATE');
    expect(vi.getTimerCount()).toBe(0);
});
it('charges an overshoot once and cancels the same stream without a candidate or ack', async () => {
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4)); }, cancel() { cancels++; } }), s = setup(() => new Response(stream), 3);
    await expect(s.lane.read(window)).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    expect(s.charged()).toBe(4);
    expect(cancels).toBe(1);
    expect(stream.locked).toBe(false);
    expect(s.lane.diagnostic()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'cancelled' }, consumes: 0, acknowledgements: 0, proofs_consumed: 0, retained_bytes: 0 });
    await expect(s.lane.read(window)).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    expect(cancels).toBe(1);
});
it('charges the same split UTF-8 bytes once and acknowledges only after native EOF cleanup', async () => {
    vi.useFakeTimers();
    const raw = new TextEncoder().encode('{"result":"日本語"}'), chunks = [raw.slice(0, 13), new Uint8Array(), raw.slice(13)];
    let charged = 0;
    const stream = new ReadableStream<Uint8Array>({ start(c) {
            for (const part of chunks)
                c.enqueue(part);
            c.close();
        } });
    const lane = createInjectedNativeBodyLane({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) }, dispatch: () => new Response(stream), schedule(ms, wake) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } }, { check() { }, charge(n) { charged += n; }, stop() { }, responseLimit: 4194304 });
    const accepted = await lane.read(window);
    expect(accepted).toMatchObject({ status: 200, value: { result: '日本語' }, received_bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex') });
    expect(charged).toBe(raw.length);
    expect(stream.locked).toBe(false);
    expect(lane.diagnostic()).toMatchObject({ cleanup: { disposition: 'confirmed', kind: 'eof' }, consumes: 1, acknowledgements: 1, proofs_consumed: 1, retained_bytes: 0, evidence_issuance: 'disabled' });
    expect(vi.getTimerCount()).toBe(0);
});
