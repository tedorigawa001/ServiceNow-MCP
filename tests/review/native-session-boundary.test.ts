import { afterEach, expect, it, vi } from 'vitest';
const controls = vi.hoisted(() => ({ mode: 'save', abort: () => {}, tokens: [] as object[], consumers: [] as { status(t: object): unknown }[] }));
vi.mock('../../src/servicenow/review-evidence-lifecycle.js', async original => {
    const actual = await original<typeof import('../../src/servicenow/review-evidence-lifecycle.js')>();
    return { ...actual, registerReviewEvidenceSession(...args: Parameters<typeof actual.registerReviewEvidenceSession>) {
        const owner = actual.registerReviewEvidenceSession(...args);
        return controls.mode === 'fake_ready' ? Object.freeze({ ...owner, markReady: () => true }) : owner;
    } };
});
vi.mock('../../src/review/bounded-source.js', async original => {
    const actual = await original<typeof import('../../src/review/bounded-source.js')>();
    return { ...actual, BoundedUpdateSetSource: class extends actual.BoundedUpdateSetSource {
        constructor(...args: ConstructorParameters<typeof actual.BoundedUpdateSetSource>) {
            const creation = args[2];
            if (creation) args[2] = { ...creation, capture(c) {
                controls.consumers.push(c);
                creation.capture({ ...c, status(token) {
                    if (controls.mode === 'cancel_pre') controls.abort();
                    const draft = c.status(controls.mode === 'copy' ? Object.freeze({ ...token }) : controls.mode === 'foreign' ? controls.tokens[0] : token);
                    controls.tokens.push(token);
                    if (controls.mode === 'duplicate') c.status(token);
                    if (controls.mode === 'cancel_post') controls.abort();
                    if (controls.mode === 'cancel_gap') queueMicrotask(controls.abort);
                    return draft;
                } });
            } };
            super(...args);
        }
    } };
});
import { probeNativeStatusComposition } from '../../src/review/abort-scope-evidence-native-diagnostic.js';
const id = 'a'.repeat(32);
function probe(signal?: AbortSignal) {
    return probeNativeStatusComposition({ instanceUrl: 'https://synthetic.invalid', authMode: 'per-user', perUserBearerToken: 'PRIVATE_TOKEN', oauth: {} },
        { update_set_sys_id: id }, { signal, response: new Response(null, { status: 403 }), parent_bytes: new TextEncoder().encode(JSON.stringify({ result: {
            sys_id: id, state: 'in progress', application: 'global', sys_updated_on: '2026-10-31', sys_mod_count: '0' } })) });
}
afterEach(() => { controls.mode = 'save'; controls.abort = () => {}; controls.tokens.length = 0; controls.consumers.length = 0; vi.restoreAllMocks(); });
it('rejects a terminal from a different closed source/core without changing its diagnostic history', async () => {
    const a = await probe(), before = JSON.stringify(a); controls.mode = 'foreign'; const b = await probe();
    expect(b.ok).toBe(false); expect(b.run_diagnostic.internal).toBe('evidence_binding_mismatch');
    expect(b.native?.counts.consumed).toBe(0); expect(b.native?.upper.slots.release.cleanup.phase).toBe('confirmed');
    expect(JSON.stringify(a)).toBe(before); expect(() => controls.consumers[0].status(controls.tokens[0])).toThrow('closed');
});
it.each(['copy', 'duplicate'])('rejects %s at the actual source boundary and retains both diagnostic layers', async mode => {
    controls.mode = mode; const r = await probe();
    expect(r.code).toBe('internal_review_error'); expect(r.run_diagnostic.internal).toBe(mode === 'copy' ? 'evidence_binding_mismatch' : 'invalid_state');
    expect(r.native?.counts.consumed).toBe(0); expect(r.draft).toBeNull();
    controls.mode = 'save'; expect((await probe()).ok).toBe(true);
});
it.each(['cancel_pre', 'cancel_post', 'cancel_gap'])('discards unpublished drafts at %s and preserves cancellation', async mode => {
    const controller = new AbortController(); controls.mode = mode; controls.abort = () => controller.abort('PRIVATE_REASON');
    const r = await probe(controller.signal);
    expect(r.code).toBe('cancelled'); expect(r.draft).toBeNull(); expect(r.native?.upper.sealed).toBe(true); expect(r.run_diagnostic.internal).toBe('cancelled');
});
it('rejects all source consumers after close and does not return source/core identity handles', async () => {
    const r = await probe(); expect(r.ok).toBe(true);
    expect(() => controls.consumers[0].status(controls.tokens[0])).toThrow('closed');
    expect(r.binding).toEqual({ same_core: true, same_source: true }); expect(JSON.stringify(r)).not.toMatch(/PRIVATE|perUserBearerToken/);
});
it('does not trust a successful-looking ready callback without the same registered generation', async () => {
    controls.mode = 'fake_ready'; const r = await probe();
    expect(r.code).toBe('internal_review_error'); expect(r.budget.requests).toBe(0);
    expect(r.native?.operations).toEqual({ get_reader: 0, closed: 0, cancel: 0, release_lock: 0, read: 0 });
});
