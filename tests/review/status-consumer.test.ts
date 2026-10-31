import { expect, it, vi } from 'vitest';
import * as model from '../../src/review/abort-scope-evidence-status-context.js';
const run = model.runSyntheticStatusContextFixture;
function result(scenario: string) { const r = run({ scenario }); if (!r.ok) throw Error('fixture'); return r; }
// Independent hand-written expectations, not imported from the product scenario/guard definitions.
const cases = [
    ['consume_body', 'consumed', null, 'consumed', 1, 1],
    ['consume_404', 'consumed', null, 'consumed', 1, 1],
    ['consume_no_body', 'consumed', null, 'consumed', 1, 1],
    ['consume_duplicate', 'failed', 'invalid_state', 'consumed', 1, 1],
    ['consume_reissue', 'failed', 'invalid_state', 'consumed', 1, 1],
    ['consume_then_stop', 'revoked', 'closed', 'consumed', 1, 1],
    ['consume_cancel_before', 'failed', 'cancelled', 'revoked', 1, 0],
    ['consume_close_before', 'failed', 'closed', 'revoked', 1, 0],
    ['consume_expired', 'failed', 'deadline_exceeded', 'failed', 1, 0],
    ['consume_after_floor', 'failed', 'deadline_exceeded', 'failed', 1, 0],
    ['consume_before_floor', 'consumed', null, 'consumed', 1, 1],
    ['consume_no_body_expired', 'failed', 'deadline_exceeded', 'failed', 1, 0],
    ...['pre', 'post'].flatMap(p => [
        [`consume_${p}_reentry`, 'failed', 'invalid_state', 'failed', 1, 0],
        [`consume_${p}_cancel`, 'failed', 'cancelled', 'revoked', 1, 0],
        [`consume_${p}_close`, 'failed', 'closed', 'revoked', 1, 0],
        [`consume_${p}_throw`, 'failed', 'internal_review_error', 'failed', 1, 0],
    ] as const),
    ['consume_post_expired', 'failed', 'deadline_exceeded', 'failed', 1, 0],
    ['consume_clock_rewind', 'failed', 'invalid_observation_time', 'failed', 1, 0],
    ['consume_nonfinite', 'failed', 'invalid_observation_time', 'failed', 1, 0],
    ['consume_retry_after_failure', 'failed', 'internal_review_error', 'failed', 1, 0],
    ['consume_post_retry_after_failure', 'failed', 'internal_review_error', 'failed', 1, 0],
    ['consume_foreign_token', 'failed', 'evidence_binding_mismatch', 'failed', 0, 0],
    ['consume_foreign_then_retry', 'failed', 'evidence_binding_mismatch', 'failed', 1, 0],
    ['consume_token_copy', 'failed', 'evidence_binding_mismatch', 'failed', 0, 0],
    ['consume_diagnostic_token', 'failed', 'evidence_binding_mismatch', 'failed', 0, 0],
    ['consume_json_result', 'failed', 'evidence_binding_mismatch', 'consumed', 1, 1],
    ...['context', 'anchor', 'record', 'generation', 'budget', 'clock', 'window'].map(k => [`consume_foreign_${k}`, 'failed', 'evidence_binding_mismatch', 'failed', 0, 0] as const),
    ['consume_before_issue', 'failed', 'evidence_binding_mismatch', 'failed', 0, 0],
    ['consume_hard', 'failed', 'authentication_failed', 'diagnostic_only', 0, 0],
    ['consume_unconfirmed', 'failed', 'internal_review_error', 'diagnostic_only', 0, 0],
    ['consume_read_started', 'failed', 'invalid_state', 'diagnostic_only', 0, 0],
    ['consume_local', 'failed', 'evidence_binding_mismatch', 'diagnostic_only', 0, 0],
] as const;
it('covers forty-two unique consumer cases with an independent expectation table', () => {
    expect(cases).toHaveLength(42); expect(new Set(cases.map(c => c[0])).size).toBe(42);
});
it.each(cases)('enforces private one-shot consumption: %s', (name, phase, primary, first, attempts, consumes) => {
    const r = result(name), d = r.diagnostic;
    expect(d).toMatchObject({ phase, primary, first_terminal: first, consumer_implemented: true, draft_held: false,
        counts: { consume_attempts: attempts, consumes } });
    expect(r.foreign_unchanged).toBe(true); expect(Object.values(d.permissions)).toEqual(Array(7).fill(false));
    expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));
    for (const n of Object.values(d.counts)) expect(n).toBeLessThanOrEqual(1);
    expect(d.claims.consume).toBe(attempts ? 'spent' : 'available');
    expect(d.consumption === null).toBe(consumes === 0);
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it.each([['consume_body', 403, 'cancelled'], ['consume_404', 404, 'cancelled'], ['consume_no_body', 403, 'no_body']] as const)(
    'returns only a frozen non-authoritative historical result: %s', (name, status, mode) => {
        const d = result(name).diagnostic;
        expect(d.consumption).toEqual({ kind: 'synthetic_status_consumed', scope: 'synthetic_contract_only', purpose: 'release', status,
            body_mode: mode, permissions: { dispatch: false, read_body: false, retry: false, fallback: false, body_ack: false, release_permit: false, formal_issuance: false } });
        expect(Object.isFrozen(d.consumption)).toBe(true); expect(Object.isFrozen(d.consumption!.permissions)).toBe(true);
        expect(run(d.consumption)).toMatchObject({ ok: false, code: 'invalid_input' });
    });
it.each(['consume_duplicate', 'consume_reissue', 'consume_then_stop', 'consume_json_result'])('does not erase successful consumption facts after %s', name => {
    const d = result(name).diagnostic;
    expect(d.consumption).toEqual(result('consume_body').diagnostic.consumption); expect(d.first_terminal).toBe('consumed');
    expect(d.revoked).toBe(true); expect(d.http).toEqual(result('body').diagnostic.http); expect(d.cleanup).toEqual(result('body').diagnostic.cleanup);
});
it.each(['pre', 'post'])('records the first reentry/stop/time diagnostic at the %s guard', where => {
    expect(result(`consume_${where}_reentry`).diagnostic).toMatchObject({ refusal: 'invalid_state', refusal_stage: 'consume', first_terminal: 'failed' });
    expect(result(`consume_${where}_cancel`).diagnostic).toMatchObject({ refusal: 'cancelled', refusal_stage: `${where}_guard`, stop_reason: 'cancelled', first_terminal: 'revoked' });
    expect(result(`consume_${where}_throw`).diagnostic).toMatchObject({ refusal: 'internal_review_error', refusal_stage: `${where}_guard`, first_terminal: 'failed' });
});
it('does not restore the consumed claim after a failed pre-guard or repair the first failure', () => {
    const d = result('consume_retry_after_failure').diagnostic;
    expect(d).toMatchObject({ primary: 'internal_review_error', refusal: 'internal_review_error', refusal_stage: 'pre_guard',
        claims: { consume: 'spent' }, counts: { consume_attempts: 1, consumes: 0 }, consumption: null });
});
it.each(['consume_expired', 'consume_no_body_expired', 'consume_post_expired', 'consume_clock_rewind', 'consume_nonfinite'])('keeps confirmed cleanup unchanged when %s rejects consumption', name => {
    const d = result(name).diagnostic;
    expect(d.cleanup?.disposition).toBe('confirmed'); expect(d.consumption).toBeNull(); expect(d.counts.drafts).toBe(1);
});
it('rejects all external consumer/token/registry inputs and exports no consumer ports', () => {
    expect(Object.keys(model)).toEqual(['runSyntheticStatusContextFixture']);
    for (const key of ['consume', 'token', 'consumer', 'registry', 'record', 'context', 'callback'])
        expect(run({ scenario: 'consume_body', [key]: {} })).toMatchObject({ ok: false, code: 'invalid_input' });
    const r = result('consume_body');
    expect(Object.keys(r)).toEqual(['ok', 'kind', 'diagnostic', 'foreign_unchanged', 'permissions']);
    expect(run(r)).toMatchObject({ ok: false, code: 'invalid_input' });
});
it('runs every consumer path with native/network/timer operations forbidden', () => {
    const forbidden = () => { throw Error('native forbidden'); };
    for (const name of ['fetch', 'Response', 'ReadableStream', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    try { for (const [name] of cases) expect(result(name).ok).toBe(true); }
    finally { vi.unstubAllGlobals(); }
});
