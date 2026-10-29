import { afterEach, expect, it, vi } from 'vitest';
import { createCanonicalReviewBudget } from '../../src/servicenow/review-canonical-budget.js';
import { createCanonicalBootstrapBudget } from '../../src/servicenow/review-canonical-bootstrap-budget.js';
import { registerReviewEvidenceSession } from '../../src/servicenow/review-evidence-lifecycle.js';
import { createInjectedNativeReaderOwner, NativeDispatchCommitError } from '../../src/servicenow/review-native-adapter.js';
afterEach(() => vi.useRealTimers());
const id = 'a'.repeat(32);
it('retains C=1 if cancellation occurs inside the entered dispatcher', async () => {
    const s = setup({ mode: 'cancel_after_dispatch' });
    expect(await s.run()).toEqual({ ok: false, code: 'cancelled' });
    expect(s.calls()).toBe(1);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 0, payload_bytes: 0 });
    expect(vi.getTimerCount()).toBe(0);
});
it.each(['shape', 'commit_quota', 'raw_commit', 'unknown_commit_code'] as const)('never calls or charges the dispatcher after %s rejection', async (mode) => {
    let calls = 0, commits = 0;
    const b = createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 } });
    b.accounting.reserve();
    const owner = createInjectedNativeReaderOwner({ fake_io: true, deadline_ms: 60000, budget: b.lease, beforeDispatch(request) { commits++; if (mode === 'commit_quota')
            throw new NativeDispatchCommitError('request_budget_exceeded'); if (mode === 'raw_commit')
            throw Error('PRIVATE_COMMIT'); if (mode === 'unknown_commit_code')
            throw new NativeDispatchCommitError('PRIVATE_CODE' as never); b.accounting.dispatch(request.io_floor_ms); }, dispatch() { calls++; return new Response('{}'); }, schedule(ms, wake) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } });
    const result = await owner.acquire({ purpose: 'parent', ordinal: 1, io_floor_ms: mode === 'shape' ? 50000 : 50250, cleanup_floor_ms: 50000 });
    expect(result).toEqual({ ok: false, code: mode === 'shape' ? 'invalid_input' : mode === 'commit_quota' ? 'request_budget_exceeded' : 'internal_review_error' });
    expect(calls).toBe(0);
    expect(b.lease.read().requests).toBe(0);
    expect(commits).toBe(mode === 'shape' ? 0 : 1);
    expect(owner.status().cleanup).toMatchObject({ disposition: 'not_started' });
    expect(JSON.stringify(owner.status())).not.toContain('PRIVATE');
    b.accounting.release();
});
it('checks the attempt floor in the same canonical operation that commits C', () => {
    let remaining = 50250;
    const core = createCanonicalReviewBudget({ clock: { remainingMs: () => remaining } });
    expect(() => core.writer.dispatchAt(50250)).toThrow('upstream_unavailable');
    expect(core.view.stats().requests).toBe(0);
    remaining = 50249;
    expect(() => core.writer.dispatchAt(50250)).toThrow('upstream_unavailable');
    expect(core.view.stats().requests).toBe(0);
});
function setup(options: {
    advanceAtReservedRead?: number;
    mode?: 'ok' | 'throw' | 'reject' | '503' | 'cancel_after_dispatch';
    expireInCommit?: boolean;
    cancelInCommit?: boolean;
    fence?: boolean;
    requests?: number;
} = {}) {
    vi.useFakeTimers();
    let elapsed = 0, reservedReads = 0, calls = 0, committing = false, fenced = false, bytes = 0;
    const source = {}, permit = {}, snapshot = {}, seen: unknown[] = [];
    let owner!: ReturnType<typeof registerReviewEvidenceSession>;
    const budget = createCanonicalBootstrapBudget({ clock: { remainingMs() {
                if (fenced)
                    throw Error('PRIVATE_OBSERVATION_BETWEEN_COMMIT_AND_DISPATCH');
                if (committing && options.expireInCommit)
                    elapsed = 9750;
                if (committing && options.cancelInCommit)
                    owner.revoke('cancelled');
                return 60000 - elapsed;
            } }, limits: { requests: options.requests ?? 210 } });
    const port = { matches: () => true, copyRelease: () => ({ instance_release: { source: 'sys_cluster_state.build_name' as const, resolution_status: 'resolved' as const, family: 'Australia', raw_buildname: 'Australia', observed_at: '2026-10-29T00:00:00Z', visibility_scope: 'caller_acl' as const }, limitations: ['release_visible_nodes_only'] }) };
    const deps = { fake_io: true as const, typed_body: true as const, native_body: true as const, lease: budget.lease, source, target: id, auth: 'per-user' as const, limits: budget.limits, accounting: { ...budget.accounting, reserved() {
                if (++reservedReads === options.advanceAtReservedRead)
                    elapsed = 10000;
                return budget.accounting.reserved();
            }, dispatch(floor?: number) {
                committing = true;
                try {
                    budget.accounting.dispatch(floor);
                }
                finally {
                    committing = false;
                }
                if (options.fence)
                    fenced = true;
            } }, dispatch: (request: {
            purpose: string;
            method: string;
        }) => {
            fenced = false;
            calls++;
            seen.push([request.purpose, request.method, budget.diagnostic().budget.requests, Object.isFrozen(request)]);
            if (options.mode === 'throw')
                throw Error('PRIVATE_THROW');
            if (options.mode === 'cancel_after_dispatch')
                owner.revoke('cancelled');
            if (options.mode === 'reject')
                return Promise.reject(Error('PRIVATE_REJECT'));
            const status = options.mode === '503' && calls === 1 ? 503 : 200;
            const raw = JSON.stringify(status === 503 ? { error: 'PRIVATE_HTTP' } : request.purpose === 'parent' ? { result: { sys_id: id, state: 'in progress', application: 'global', sys_updated_on: '2026-10-29', sys_mod_count: '0' } } : { result: [{ build_name: 'Australia' }] });
            bytes += Buffer.byteLength(raw);
            return Promise.resolve(new Response(raw, { status }));
        }, resolveRelease: () => ({ source, permit, port }), schedule(ms: number, wake: () => void) { const t = setTimeout(wake, ms); return () => clearTimeout(t); } };
    owner = registerReviewEvidenceSession({}, snapshot, budget.lease, deps);
    const claim = owner.transportConstructor.claim(snapshot, budget.lease);
    if (!claim.ok)
        throw Error(claim.code);
    return { run: () => owner.transportConstructor.bootstrap(claim.value, snapshot, budget.lease), owner, stats: () => budget.diagnostic().budget, calls: () => calls, seen, budget, bytes: () => bytes };
}
it('keeps C=0 when the attempt expires after window issue but before native dispatch', async () => {
    const s = setup({ advanceAtReservedRead: 2 });
    expect(await s.run()).toEqual({ ok: false, code: 'upstream_unavailable' });
    expect(s.calls()).toBe(0);
    expect(s.stats()).toEqual({ requests: 0, received_bytes: 0, payload_bytes: 0 });
});
it.each(['throw', 'reject'] as const)('keeps C=1 for a dispatcher %s and never refunds or retries it', async (mode) => {
    const s = setup({ mode });
    expect(await s.run()).toEqual({ ok: false, code: 'upstream_unavailable' });
    expect(s.calls()).toBe(1);
    expect(s.stats()).toEqual({ requests: 1, received_bytes: 0, payload_bytes: 0 });
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ body: { cleanup: { disposition: 'confirmed', kind: 'no_response' }, consumes: 0, acknowledgements: 0 } });
    expect(JSON.stringify(s.owner.transportConstructor.diagnostic())).not.toContain('PRIVATE');
});
it('does not observe the budget between C commit and the dispatcher, and charges G only once', async () => {
    const s = setup({ fence: true });
    expect(await s.run()).toMatchObject({ ok: true });
    expect(s.seen).toEqual([['parent', 'GET', 1, true], ['release', 'GET', 2, true]]);
    expect(s.stats()).toEqual({ requests: 2, received_bytes: s.bytes(), payload_bytes: 0 });
    s.owner.close('closed');
});
it.each([3] as const)('keeps C=0 when time advances inside the last reservation observation (%s)', async (n) => {
    const s = setup({ advanceAtReservedRead: n });
    expect(await s.run()).toEqual({ ok: false, code: 'upstream_unavailable' });
    expect(s.calls()).toBe(0);
    expect(s.stats().requests).toBe(0);
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ body: { cleanup: { disposition: 'not_started' }, native: { claims: 0 } } });
});
it('keeps C=0 when the canonical clock reaches the I/O floor inside commit', async () => {
    const s = setup({ expireInCommit: true });
    expect(await s.run()).toEqual({ ok: false, code: 'upstream_unavailable' });
    expect(s.calls()).toBe(0);
    expect(s.stats().requests).toBe(0);
});
it('keeps C=0 on synchronous owner cancellation inside commit', async () => {
    const s = setup({ cancelInCommit: true });
    expect(await s.run()).toEqual({ ok: false, code: 'cancelled' });
    expect(s.calls()).toBe(0);
    expect(s.stats().requests).toBe(0);
    expect(s.budget.accounting.reserved()).toBe(0);
});
it('preserves the final four reservations and refuses Q=4 without C', async () => {
    const s = setup({ requests: 4 });
    expect(await s.run()).toEqual({ ok: false, code: 'request_budget_exceeded' });
    expect(s.calls()).toBe(0);
    expect(s.stats().requests).toBe(0);
    expect(s.budget.accounting.reserved()).toBe(0);
});
it('uses one C per confirmed HTTP retry without resetting the canonical G budget', async () => {
    const s = setup({ mode: '503' });
    expect(await s.run()).toMatchObject({ ok: true });
    expect(s.calls()).toBe(3);
    expect(s.stats()).toEqual({ requests: 3, received_bytes: s.bytes(), payload_bytes: 0 });
    expect(s.owner.transportConstructor.diagnostic().bootstrap).toMatchObject({ body: { acknowledgements: 3, proofs_consumed: 3 } });
    s.owner.close('closed');
});
