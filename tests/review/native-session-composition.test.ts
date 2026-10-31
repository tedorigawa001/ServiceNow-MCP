import { afterEach, expect, it, vi } from 'vitest';
import { probeNativeStatusComposition } from '../../src/review/abort-scope-evidence-native-diagnostic.js';
import { BoundedReadSession, type ReadSnapshot } from '../../src/servicenow/bounded-read.js';
import { BoundedUpdateSetSource } from '../../src/review/bounded-source.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const id = 'a'.repeat(32), parent = () => new TextEncoder().encode(JSON.stringify({ result: { sys_id: id, state: 'in progress', application: 'global', sys_updated_on: '2026-10-31', sys_mod_count: '0' } }));
const snapshot = (): ReadSnapshot => ({ instanceUrl: 'https://synthetic.invalid', authMode: 'per-user', perUserBearerToken: 'PRIVATE_TOKEN', oauth: {} });
const probe = (response = new Response(null, { status: 403 }), options: Record<string, unknown> = {}) => probeNativeStatusComposition(snapshot(), { update_set_sys_id: id }, { parent_bytes: parent(), response, ...options });
it('retains the sealed construction failure before the native owner is created', async () => {
    vi.spyOn(performance, 'now').mockImplementationOnce(() => { throw Error('PRIVATE_CONSTRUCTION_CLOCK'); });
    const r = await probe();
    expect(r).toMatchObject({ ok: false, code: 'internal_review_error', native: null, consumptions: 0,
        binding: { same_core: false, same_source: false }, budget: { requests: 0, received_bytes: 0, payload_bytes: 0 },
        run_diagnostic: { internal: 'internal_review_error', public: 'internal_review_error' },
        constructor_diagnostic: { state: 'closed', sealed: true, primary: { stage: 'clock' }, teardown: 'confirmed' } });
    expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect((await probe()).ok).toBe(true);
});
it('connects native cleanup and the sole consumer to a fresh real-class session/source before close', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw Error('PRIVATE_NETWORK_FORBIDDEN'); });
    const get = vi.spyOn(BoundedReadSession.prototype, 'get'), resolve = vi.spyOn(BoundedUpdateSetSource.prototype, 'resolveRelease');
    const stream = new ReadableStream(), r = await probeNativeStatusComposition(snapshot(), { update_set_sys_id: id }, { parent_bytes: parent(), response: new Response(stream, { status: 403 }) });
    expect(r).toMatchObject({ ok: true, code: null, fake_io: true, consumptions: 1, accepted_before_close: true, cleanup: 'closed', reserved: 0,
        binding: { same_core: true, same_source: true }, draft: { status: 403, fallback: 'disabled', release_permit: 'unavailable' },
        budget: { requests: 2, received_bytes: parent().byteLength, payload_bytes: 0 }, native: { counts: { issued: 1, consumed: 1 }, upper: { sealed: true } } });
    expect(fetch).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
    expect(stream.locked).toBe(false); expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it.each([[403, true], [404, true], [403, false], [404, false]] as const)('accepts %i/body=%s once, with no public release decision', async (status, body) => {
    const r = await probe(new Response(body ? new ReadableStream() : null, { status }));
    expect(r.ok).toBe(true); expect(r.native?.counts).toEqual({ issued: 1, consume_attempts: 1, consumed: 1 });
    expect(r.draft?.cleanup_kind).toBe(body ? 'cancelled' : 'no_body'); expect(r.run_diagnostic.internal).toBeNull();
    expect(r.native?.upper.slots.authentication.http).toBeNull(); expect(r.native?.upper.slots.parent.http).toBeNull();
});
it.each([401, 403])('preserves HTTP %i and rejected cleanup through actual session closure', async status => {
    const r = await probe(new Response(new ReadableStream({ cancel() { throw Error('PRIVATE_CANCEL'); } }), { status }));
    expect(r.ok).toBe(false); expect(r.code).toBe(status === 401 ? 'authentication_failed' : 'internal_review_error');
    expect(r.native?.upper.slots.release).toMatchObject({ http: { status }, cleanup: { phase: 'unconfirmed', reason: 'cancel_rejected' } });
    expect(r.native?.counts.issued).toBe(0); expect(r.draft).toBeNull(); expect(r.binding).toEqual({ same_core: true, same_source: true });
    expect(r.constructor_diagnostic).toMatchObject({ state: 'closed', primary: null, teardown: 'confirmed' });
    expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect((await probe()).ok).toBe(true);
});
it.each(['responseBytes', 'totalBytes'] as const)('keeps canonical %s cap and diagnostics before native acquisition', async cap => {
    const r = await probe(undefined, { limits: { [cap]: 1 } });
    expect(r.code).toBe('receive_budget_exceeded'); expect(r.native?.upper.primary?.code).toBe('receive_budget_exceeded');
    expect(r.native?.upper.slots.release.http).toBeNull(); expect(r.budget.received_bytes).toBe(parent().byteLength);
});
it.each([4, 5])('keeps four final slots at request cap %i', async requests => {
    const r = await probe(undefined, { limits: { requests } });
    expect(r.code).toBe('request_budget_exceeded'); expect(r.native?.counts.issued).toBe(0);
});
it.each([new Uint8Array([0xff]), new TextEncoder().encode('{}'), new TextEncoder().encode(JSON.stringify({ result: { sys_id: 'b'.repeat(32) } }))])('retains invalid parent rejection before native acquisition %#', async bytes => {
    const r = await probe(undefined, { parent_bytes: bytes });
    expect(r.code).toBe('invalid_response'); expect(r.native?.upper.slots.release.http).toBeNull(); expect(r.consumptions).toBe(0);
});
it('synchronously revokes on external cancel, joins the same cleanup until the original boundary and retains late facts', async () => {
    vi.useFakeTimers(); let complete!: () => void;
    const controller = new AbortController(), stream = new ReadableStream({ cancel() { return new Promise<void>(r => { complete = r; }); } });
    const pending = probe(new Response(stream, { status: 403 }), { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0); controller.abort('PRIVATE_ABORT'); await vi.advanceTimersByTimeAsync(10000);
    const r = await pending;
    expect(r.code).toBe('cancelled'); expect(r.native?.upper.primary?.code).toBe('cancelled'); expect(r.consumptions).toBe(0);
    expect(r.native?.upper.slots.release.cleanup.phase).toBe('unconfirmed'); expect(r.native?.operations.cancel).toBe(1); expect(stream.locked).toBe(false);
    complete(); await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(0); expect((await probe()).ok).toBe(true);
});
it('stops an already cancelled run before readiness or native creation and frees admission', async () => {
    vi.useFakeTimers(); const controller = new AbortController(); controller.abort();
    const r = await probe(undefined, { signal: controller.signal }); expect(r.code).toBe('cancelled'); expect(r.native).toBeNull();
    expect(r.budget.requests).toBe(0); expect(vi.getTimerCount()).toBe(0); expect((await probe()).ok).toBe(true);
});
it('uses the canonical clock and does not create a fresh cleanup deadline', async () => {
    vi.useFakeTimers(); let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const stream = new ReadableStream({ cancel() { elapsed = 10000; } });
    const r = await probe(new Response(stream, { status: 403 }));
    expect(r.ok).toBe(false); expect(r.native?.counts.issued).toBe(0);
    expect(r.code).toBe('upstream_unavailable'); expect(r.run_diagnostic).toEqual({ internal: 'upstream_unavailable', public: 'upstream_unavailable' });
    expect(r.native?.upper.primary?.code).toBe('deadline_exceeded'); expect(r.native?.upper.slots.release.cleanup.phase).toBe('unconfirmed');
    expect(vi.getTimerCount()).toBe(0);
});
it('keeps deadline_exceeded only when the canonical run deadline itself is reached', async () => {
    vi.useFakeTimers(); let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const r = await probe(new Response(new ReadableStream({ cancel() { elapsed = 60000; } }), { status: 403 }));
    expect(r.code).toBe('deadline_exceeded'); expect(r.run_diagnostic.public).toBe('deadline_exceeded'); expect(r.native?.counts.issued).toBe(0);
});
it('rejects reuse of the injected Response across fresh actual-class runs', async () => {
    const response = new Response(null, { status: 403 }), a = await probe(response), saved = JSON.stringify(a), b = await probe(response);
    expect(a.ok).toBe(true); expect(b.code).toBe('invalid_response'); expect(b.native?.counts.issued).toBe(0); expect(JSON.stringify(a)).toBe(saved);
});
it.each(['session', 'consumer', 'driver', 'cleanup', 'binding', 'fetch'])('rejects caller %s supply', async key => {
    await expect(probe(undefined, { [key]: {} })).rejects.toMatchObject({ code: 'invalid_input' });
});
it('returns frozen diagnostic copies with no live session/source/budget/consumer capabilities', async () => {
    const r = await probe();
    for (const key of ['session', 'source', 'core', 'lease', 'terminal', 'consumer', 'snapshot', 'key']) expect(r).not.toHaveProperty(key);
    const visit = (x: unknown) => { if (x && typeof x === 'object') { expect(Object.isFrozen(x)).toBe(true); for (const v of Object.values(x)) visit(v); } };
    visit(r); expect(Object.values(r.draft!.permissions)).toEqual(Array(7).fill(false));
});
it('copies parent bytes with native accessors and never invokes shadow getters', async () => {
    const bytes = parent(); let calls = 0;
    Object.defineProperty(bytes, 'byteLength', { get() { calls++; throw Error('PRIVATE_LENGTH'); } });
    const r = await probe(undefined, { parent_bytes: bytes }); expect(r.ok).toBe(true); expect(calls).toBe(0);
});
it('rejects proxy/accessor input and shared parent storage without exposing exception text', async () => {
    let calls = 0;
    const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('PRIVATE_PROXY'); } });
    await expect(probeNativeStatusComposition(snapshot(), { update_set_sys_id: id }, proxy as never)).rejects.toMatchObject({ code: 'invalid_input' });
    const raw = { response: new Response(null, { status: 403 }), get parent_bytes() { calls++; throw Error('PRIVATE_GETTER'); } };
    await expect(probeNativeStatusComposition(snapshot(), { update_set_sys_id: id }, raw)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(probe(undefined, { parent_bytes: new Uint8Array(new SharedArrayBuffer(10)) })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(calls).toBe(0);
});
it('keeps the entry out of the runtime class and consumes the fresh-fake friend only once', async () => {
    expect(Object.hasOwn(BoundedReadSession, 'probeNativeStatusComposition')).toBe(false);
    const { takeNativeStatusCompositionProbe } = await import('../../src/servicenow/bounded-read.js');
    expect(() => takeNativeStatusCompositionProbe()).toThrow('internal_review_error');
});
