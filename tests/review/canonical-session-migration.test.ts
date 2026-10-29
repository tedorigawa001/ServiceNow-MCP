import { afterEach, expect, it, vi } from 'vitest';
import { BoundedReadSession } from '../../src/servicenow/bounded-read.js';
const path = '/api/now/table/sys_update_set?sysparm_limit=1';
const sessions: BoundedReadSession[] = [];
it('retains owner invalid_observation_time while mapping the session failure to internal_review_error', async () => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const s = session((async () => new Response('{}')) as typeof fetch);
    await s.get(path);
    elapsed = -1;
    expect(s.reviewRunStatus()).toMatchObject({ primary: { code: 'invalid_observation_time' } });
    expect(() => s.assertActive()).toThrow('internal_review_error');
});
it('propagates a deadline first observed through the readonly lease to the active abort signal', async () => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    let entered!: () => void, signal!: AbortSignal;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const s = session(((_url, init) => { signal = init!.signal!; entered(); return new Promise<Response>(() => { }); }) as typeof fetch), pending = s.get(path);
    const checked = expect(pending).rejects.toMatchObject({ code: 'deadline_exceeded' });
    await started;
    elapsed = 60000;
    s.reviewRunStatus();
    expect(signal.aborted).toBe(true);
    await checked;
});
afterEach(() => { for (const s of sessions.splice(0))
    s.close(); vi.restoreAllMocks(); vi.useRealTimers(); });
function session(fetcher: typeof fetch, limits: Record<string, number> = {}) {
    const s = new BoundedReadSession({ instanceUrl: 'https://synthetic.invalid', authMode: 'per-user', perUserBearerToken: 'PRIVATE_TOKEN', oauth: { clientId: 'unused' } }, { fetch: fetcher, limits: limits as never });
    sessions.push(s);
    return s;
}
it('keeps legacy dispatch, UTF-8 body and payload accounting in fixed event order', async () => {
    const raw = new TextEncoder().encode('{"result":"日本"}'), events: unknown[] = [];
    let s!: BoundedReadSession;
    s = session((async () => { events.push(['dispatch', s.stats()]); return new Response(new ReadableStream({ start(c) { c.enqueue(raw.slice(0, 12)); c.enqueue(raw.slice(12)); c.close(); } })); }) as typeof fetch);
    expect(await s.get(path)).toEqual({ result: '日本' });
    s.chargePayload('日本');
    expect(events).toEqual([['dispatch', { requests: 1, received_bytes: 0, payload_bytes: 0 }]]);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: raw.length, payload_bytes: 6 });
    expect(s.reviewRunStatus()).toMatchObject({ state: 'ready' });
});
it('does not expose old mutable counters or adopt values assigned under their former names', () => {
    const s = session((async () => { throw Error('unexpected'); }) as typeof fetch);
    for (const key of ['requests', 'receivedBytes', 'payloadBytes']) {
        expect(Object.hasOwn(s, key)).toBe(false);
        Object.assign(s, { [key]: 999 });
    }
    expect(s.stats()).toEqual({ requests: 0, received_bytes: 0, payload_bytes: 0 });
    s.chargePayload('x');
    expect(s.stats().payload_bytes).toBe(1);
});
it('legacy oracle preserves the normal/final request quota and dispatch-before-fetch accounting', async () => {
    const events: number[] = [];
    let s!: BoundedReadSession;
    s = session((async () => { events.push(s.stats().requests); return new Response('{}'); }) as typeof fetch, { requests: 6 });
    await s.get(path);
    await s.get(path);
    await expect(s.get(path)).rejects.toMatchObject({ code: 'request_budget_exceeded' });
    expect(s.stats()).toEqual({ requests: 2, received_bytes: 4, payload_bytes: 0 });
    for (let i = 0; i < 4; i++)
        await s.get(path, true);
    await expect(s.get(path, true)).rejects.toMatchObject({ code: 'request_budget_exceeded' });
    expect(events).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s.stats()).toEqual({ requests: 6, received_bytes: 12, payload_bytes: 0 });
});
it('legacy oracle keeps G equality as a pre-dispatch stop on the next request', async () => {
    let calls = 0;
    const s = session((async () => { calls++; return new Response('{}'); }) as typeof fetch, { totalBytes: 2 });
    await s.get(path);
    await expect(s.get(path)).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    expect(calls).toBe(1);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 2, payload_bytes: 0 });
});
it.each(['responseBytes', 'totalBytes'])('legacy oracle retains the %s overshoot before abort', async (dimension) => {
    let calls = 0;
    const s = session((async () => { calls++; return new Response('{}'); }) as typeof fetch, { [dimension]: 1 });
    await expect(s.get(path)).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    await expect(s.get(path)).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    expect(calls).toBe(1);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 2, payload_bytes: 0 });
});
it('legacy oracle distinguishes local P rejection from total P stop and retains both costs', async () => {
    const s = session((async () => new Response('{}')) as typeof fetch, { payloadBytes: 5, totalPayloadBytes: 10 });
    expect(() => s.chargePayload('日本')).toThrow('payload_limit');
    expect(s.stats().payload_bytes).toBe(6);
    expect(() => s.assertActive()).not.toThrow();
    expect(() => s.chargePayload('12345')).toThrow('payload_budget_exceeded');
    expect(s.stats().payload_bytes).toBe(11);
    await expect(s.get(path)).rejects.toMatchObject({ code: 'payload_budget_exceeded' });
});
it.each([401, 403, 404])('legacy oracle preserves terminal HTTP %s without consuming the error body', async (status) => {
    let calls = 0, cancels = 0;
    const s = session((async () => { calls++; return new Response(new ReadableStream({ cancel() { cancels++; } }), { status }); }) as typeof fetch);
    await expect(s.get(path)).rejects.toMatchObject({ code: status === 401 ? 'authentication_failed' : status === 403 ? 'access_denied' : 'not_found_or_not_visible' });
    expect(calls).toBe(1);
    expect(cancels).toBe(1);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 0, payload_bytes: 0 });
});
it('legacy oracle preserves cumulative retry costs and the fixed backoff', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const s = session((async () => ++calls === 1 ? new Response('xx', { status: 503 }) : new Response('{}')) as typeof fetch);
    const pending = s.get(path);
    await vi.advanceTimersByTimeAsync(250);
    expect(await pending).toEqual({});
    expect(calls).toBe(2);
    expect(s.stats()).toEqual({ requests: 2, received_bytes: 4, payload_bytes: 0 });
});
it('legacy oracle charges synchronous fetch failure once per retry', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const s = session((() => { calls++; throw Error('PRIVATE_FETCH'); }) as typeof fetch), pending = s.get(path);
    const checked = expect(pending).rejects.toMatchObject({ code: 'upstream_unavailable' });
    await vi.advanceTimersByTimeAsync(250);
    await checked;
    expect(calls).toBe(2);
    expect(s.stats()).toEqual({ requests: 2, received_bytes: 0, payload_bytes: 0 });
});
it('legacy oracle charges malformed JSON once without retry', async () => {
    let calls = 0;
    const s = session((async () => { calls++; return new Response('bad'); }) as typeof fetch);
    await expect(s.get(path)).rejects.toMatchObject({ code: 'invalid_response' });
    expect(calls).toBe(1);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 3, payload_bytes: 0 });
});
it.each(['exchange', 'cached'] as const)('legacy oracle shares OAuth %s costs with the same GET budget', async (mode) => {
    const raw = JSON.stringify({ access_token: 'PRIVATE_OAUTH', expires_in: 3600 }), events: string[] = [];
    const s = new BoundedReadSession({ instanceUrl: 'https://synthetic.invalid', oauth: { clientId: 'fake', clientSecret: 'unused' }, ...(mode === 'cached' ? { accessToken: 'PRIVATE_CACHE', tokenExpiry: Date.now() + 3600000 } : {}) }, { fetch: (async (url) => { const pathname = new URL(String(url)).pathname; events.push(pathname); return new Response(pathname === '/oauth_token.do' ? raw : '{}'); }) as typeof fetch });
    sessions.push(s);
    expect(await s.get(path)).toEqual({});
    expect(s.stats()).toEqual({ requests: mode === 'exchange' ? 2 : 1, received_bytes: mode === 'exchange' ? Buffer.byteLength(raw) + 2 : 2, payload_bytes: 0 });
    expect(events).toEqual(mode === 'exchange' ? ['/oauth_token.do', '/api/now/table/sys_update_set'] : ['/api/now/table/sys_update_set']);
    expect(JSON.stringify(s.reviewRunStatus())).not.toContain('PRIVATE');
});
it('legacy oracle preserves normal phase cutoff while allowing the existing final phase transition', async () => {
    let elapsed = 0, calls = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const s = session((async () => { calls++; return new Response('{}'); }) as typeof fetch);
    s.setPhaseReserve(10000);
    elapsed = 50000;
    await expect(s.get(path)).rejects.toMatchObject({ code: 'phase_deadline_exceeded' });
    expect(calls).toBe(0);
    expect(s.stats().requests).toBe(0);
    s.setPhaseReserve(0);
    await s.get(path, true);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 2, payload_bytes: 0 });
});
it('legacy oracle preserves busy rejection and cancellation costs on the same attempt', async () => {
    const external = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const s = new BoundedReadSession({ instanceUrl: 'https://synthetic.invalid', authMode: 'per-user', perUserBearerToken: 'PRIVATE_TOKEN', oauth: { clientId: 'unused' } }, { signal: external.signal, fetch: ((() => { entered(); return new Promise<Response>(() => { }); }) as typeof fetch) });
    sessions.push(s);
    const pending = s.get(path);
    const checked = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await started;
    await expect(s.get(path)).rejects.toMatchObject({ code: 'review_busy' });
    external.abort(Error('PRIVATE_REASON'));
    await checked;
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 0, payload_bytes: 0 });
    s.close();
    s.close();
    expect(JSON.stringify(s.reviewRunStatus())).not.toContain('PRIVATE');
});
