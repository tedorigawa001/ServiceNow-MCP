import { expect, it, vi } from 'vitest';
import * as module from '../../src/review/abort-scope-evidence-native-diagnostic.js';
import { runSyntheticNativeDiagnosticFixture as run } from '../../src/review/abort-scope-evidence-native-diagnostic.js';
function result(scenario: string) { const r = run({ scenario }); if (!r.ok) throw Error('fixture ' + scenario); return r; }

it('allocates three unobserved slots before binding and seals a non-authoritative copy', () => {
    const r = run({ scenario: 'unobserved' });
    if (!r.ok) throw Error('fixture');
    expect(r.diagnostic.binding).toBe('bound');
    expect(r.diagnostic.sealed).toBe(true);
    expect(Object.keys(r.diagnostic.slots)).toEqual(['authentication', 'parent', 'release']);
    for (const slot of Object.values(r.diagnostic.slots)) {
        expect(slot.http).toBeNull(); expect(slot.cleanup.phase).toBe('not_started');
        expect(slot.later_attempts).toBe(0);
    }
    expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));
});

it.each(['duplicate_binding', 'foreign_binding', 'binding_retry', 'before_binding'])('spends binding on %s and refuses observations after failure', scenario => {
    const d = result(scenario).diagnostic;
    expect(d.stopped).toBe(true); expect(d.refusal).not.toBeNull();
    expect(d.slots.release.http).toBeNull();
});
it('retains hard HTTP and cleanup failure independently without replacing the first reason', () => {
    const d = result('hard_cleanup').diagnostic;
    expect(d.primary).toEqual({ code: 'authentication_failed', public_code: 'authentication_failed', stage: 'header' });
    expect(d.slots.release.http).toEqual({ status: 401, body_present: true, classification: 'hard' });
    expect(d.slots.release.cleanup).toEqual({ phase: 'unconfirmed', kind: null, reason: 'cancel_rejected' });
});

it.each(['release_403', 'release_404', 'no_body'])('records %s without inventing a stop or executable permission', scenario => {
    const r = result(scenario), s = r.diagnostic.slots.release;
    expect(r.diagnostic.primary).toBeNull(); expect(r.diagnostic.refusal).toBeNull();
    expect(s.http?.classification).toBe('recovery_candidate'); expect(s.cleanup.phase).toBe('confirmed');
    expect(s.acceptance).toEqual({ phase: 'revoked', first_terminal: 'accepted', consumes: 1 });
    expect(s.cleanup.kind).toBe(scenario === 'no_body' ? 'no_body' : 'cancelled');
});
it.each(['cancel_then_header', 'deadline_then_header'])('keeps the first %s reason while retaining subsequent HTTP and cleanup', scenario => {
    const d = result(scenario).diagnostic;
    expect(d.primary?.code).toBe(scenario.startsWith('cancel') ? 'cancelled' : 'deadline_exceeded');
    expect(d.slots.release.http?.status).toBe(401); expect(d.slots.release.cleanup.phase).toBe('unconfirmed');
});
it('keeps parent404 local and other purpose slots unobserved', () => {
    const d = result('parent_404').diagnostic;
    expect(d.local).toEqual({ code: 'not_found_or_not_visible', stage: 'header' });
    expect(d.primary).toBeNull(); expect(d.slots.parent.http?.classification).toBe('local');
    expect(d.slots.release.http).toBeNull(); expect(d.slots.authentication.http).toBeNull();
});
it.each(['auth_403', 'parent_403'])('retains the hard %s code ahead of teardown failure', scenario => {
    const d = result(scenario).diagnostic;
    expect(d.primary).toEqual({ code: 'access_denied', public_code: 'access_denied', stage: 'header' });
    expect(d.teardown).toBe('unconfirmed');
});
it.each(['duplicate_header', 'duplicate_cleanup', 'cleanup_before_header', 'confirmed_without_pending',
    'duplicate_consume', 'accept_without_cleanup', 'wrong_purpose', 'foreign_attempt', 'copy_attempt', 'foreign_window',
    'retry_after_refusal', 'duplicate_teardown'])('fails closed on %s with immutable foreign diagnostics', scenario => {
    const r = result(scenario);
    expect(r.diagnostic.refusal).not.toBeNull(); expect(r.diagnostic.stopped).toBe(true);
    expect(r.foreign_unchanged).toBe(true);
    expect(r.diagnostic.slots.release.acceptance.consumes).toBeLessThanOrEqual(1);
});
it.each(['pending_seal', 'pending_late_success', 'unconfirmed_late_success'])('never upgrades %s cleanup after termination', scenario => {
    const r = result(scenario);
    expect(r.diagnostic.slots.release.cleanup.phase).toBe('unconfirmed');
    expect(r.diagnostic.primary?.code).toBe('internal_review_error');
    expect(r.diagnostic.slots.release.acceptance.first_terminal).not.toBe('accepted');
});
it('ignores every writer and a second seal after sealing without altering the retained copy', () => {
    const r = result('sealed_writes');
    expect(r.late_results).toEqual(Array(7).fill('late_ignored'));
    expect(r.diagnostic).toEqual(r.at_seal);
});
it('preserves ordinal1 while later503/200 observations are counted separately', () => {
    const r = result('later_attempts'), s = r.diagnostic.slots.release;
    expect(s.http?.status).toBe(503); expect(s.later_attempts).toBe(2); expect(s.later_reason).toBe('upstream_unavailable');
    expect(s.cleanup.phase).toBe('confirmed'); expect(r.diagnostic.refusal).toBeNull();
});
it.each(['duplicate_later', 'ordinal_gap', 'ordinal_limit'])('rejects %s without rewriting ordinal1', scenario => {
    const d = result(scenario).diagnostic;
    expect(d.slots.release.http?.status).toBe(503); expect(d.refusal?.code).toBe('invalid_state');
    expect(d.slots.release.later_attempts).toBeLessThanOrEqual(209);
});
it('has no I/O, clock, native or registration capability and exposes only fixed-case data', () => {
    const fetch = vi.fn(() => { throw Error('PRIVATE_FETCH'); }), now = vi.spyOn(Date, 'now').mockImplementation(() => { throw Error('PRIVATE_CLOCK'); });
    vi.stubGlobal('fetch', fetch);
    try {
        expect(Object.keys(module)).toEqual(['runSyntheticNativeDiagnosticFixture']);
        const r = result('sealed_writes');
        expect(fetch).not.toHaveBeenCalled(); expect(now).not.toHaveBeenCalled();
        expect(JSON.stringify(r)).not.toMatch(/PRIVATE|token|credential|snapshot|writer|window/);
        const visit = (x: unknown) => { if (x && typeof x === 'object') { expect(Object.isFrozen(x)).toBe(true); for (const v of Object.values(x)) visit(v); } };
        visit(r); expect(run(r)).toMatchObject({ ok: false, code: 'invalid_input' });
    } finally { now.mockRestore(); vi.unstubAllGlobals(); }
});
it.each([null, undefined, [], 'unobserved', {}, { scenario: 'unknown' }, { scenario: 'unobserved', owner: {} },
    { scenario: 'unobserved', callback() {} }, { scenario: 'unobserved', [Symbol()]: true }, Object.create({ scenario: 'unobserved' })])('rejects external supply %#', input => {
    expect(run(input)).toMatchObject({ ok: false, code: 'invalid_input' });
});
it('rejects accessors and proxies before invoking any trap', () => {
    let calls = 0;
    const a = { get scenario() { calls++; throw Error('PRIVATE_GETTER'); } };
    const p = new Proxy({}, { ownKeys() { calls++; throw Error('PRIVATE_PROXY'); } });
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    for (const input of [a, p, revoked.proxy]) expect(run(input)).toMatchObject({ ok: false });
    expect(calls).toBe(0);
});
it.each(['cleanup_body_mismatch', 'cleanup_reason_mismatch', 'cleanup_kind_mismatch', 'pending_with_kind'])('rejects inconsistent %s without upgrading cleanup', scenario => {
    const d = result(scenario).diagnostic;
    expect(d.refusal).toEqual({ code: 'invalid_state', stage: 'cleanup' });
    expect(d.slots.release.cleanup.phase).toBe(scenario === 'pending_with_kind' ? 'not_started' : 'unconfirmed');
});
it('retains later-attempt cleanup failure and stops without altering ordinal1 facts', () => {
    const d = result('later_cleanup_failure').diagnostic;
    expect(d.primary?.code).toBe('internal_review_error');
    expect(d.slots.release.cleanup.phase).toBe('confirmed');
    // The later attempt's first reason is its 503, observed before the cleanup failure stopped the run.
    expect(d.slots.release.later_reason).toBe('upstream_unavailable');
});
it('refuses to replace an attempt whose cleanup is still pending', () => {
    const d = result('advance_pending_attempt').diagnostic;
    expect(d.refusal?.code).toBe('invalid_state');
    expect(d.slots.release.later_attempts).toBe(0);
    expect(d.slots.release.cleanup.phase).toBe('unconfirmed');
});
it('records a later non-retryable status as invalid_response, matching the contract', () => {
    const s = result('later_redirect').diagnostic.slots.release;
    expect(s.http?.status).toBe(503); expect(s.later_attempts).toBe(2); expect(s.later_reason).toBe('invalid_response');
});
it('lets a no-response attempt end and be retried without a header or cleanup claim', () => {
    const d = result('no_response_retry').diagnostic, s = d.slots.release;
    expect(d.refusal).toBeNull(); expect(d.primary).toBeNull();
    expect(s.http).toBeNull(); expect(s.cleanup).toEqual({ phase: 'not_applicable', kind: null, reason: null });
    expect(s.later_attempts).toBe(1); expect(s.later_reason).toBeNull(); expect(s.acceptance.consumes).toBe(0);
});
it('refuses a header after the same attempt ended without a response', () => {
    const d = result('no_response_then_header').diagnostic;
    expect(d.refusal?.code).toBe('invalid_state'); expect(d.slots.release.http).toBeNull();
});
