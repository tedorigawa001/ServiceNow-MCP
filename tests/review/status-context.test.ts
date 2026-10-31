import { expect, it, vi } from 'vitest';
import * as module from '../../src/review/abort-scope-evidence-status-context.js';
const run = module.runSyntheticStatusContextFixture;
function result(scenario: string) { const r = run({ scenario }); if (!r.ok) throw Error('fixture'); return r; }
// Independent expected cases: no product scenario list/eligibility helper is imported.
const cases = [
    ['body', 'draft_held', null, 1], ['release_404', 'draft_held', null, 1], ['no_body', 'draft_held', null, 1],
    ['hard', 'diagnostic_only', 'authentication_failed', 0], ['hard_cleanup', 'diagnostic_only', 'authentication_failed', 0],
    ['local', 'diagnostic_only', null, 0], ['unconfirmed', 'diagnostic_only', 'internal_review_error', 0],
    ['read_started', 'failed', 'invalid_state', 0],
    ...['context', 'anchor', 'record', 'generation', 'budget', 'clock', 'window'].map(key => ['foreign_' + key, 'failed', 'evidence_binding_mismatch', 0] as const),
    ['record_copy', 'failed', 'evidence_binding_mismatch', 0], ['external_diagnostic', 'failed', 'evidence_binding_mismatch', 0],
    ['json_diagnostic', 'failed', 'evidence_binding_mismatch', 0],
    ['duplicate_context', 'failed', 'invalid_state', 0], ['duplicate_anchor', 'failed', 'invalid_state', 0], ['duplicate_record', 'failed', 'invalid_state', 0],
    ['duplicate_issue', 'failed', 'invalid_state', 1], ['anchor_context_mismatch', 'failed', 'evidence_binding_mismatch', 0],
    ['record_anchor_mismatch', 'failed', 'evidence_binding_mismatch', 0], ['issue_reentry', 'failed', 'invalid_state', 0],
    ['cancel_during_issue', 'revoked', 'cancelled', 0], ['stop_before_issue', 'failed', 'cancelled', 0],
    ['stop_after_issue', 'revoked', 'closed', 1], ['expired', 'failed', 'deadline_exceeded', 0],
    ['reverse_clock', 'failed', 'invalid_observation_time', 0], ['clock_rewind', 'failed', 'invalid_observation_time', 0],
    ['clock_throw', 'failed', 'internal_review_error', 0], ['retry_after_failure', 'failed', 'evidence_binding_mismatch', 0],
    ['stop_after_failure', 'revoked', 'evidence_binding_mismatch', 0],
] as const;
it('has 34 distinct independent expectations and exports no private ports', () => {
    expect(cases).toHaveLength(34); expect(new Set(cases.map(c => c[0])).size).toBe(34);
    expect(Object.keys(module)).toEqual(['runSyntheticStatusContextFixture']);
});
it.each(cases)('enforces the private contract: %s', (name, phase, primary, drafts) => {
    const r = result(name), d = r.diagnostic;
    expect(r.kind).toBe('status_context_contract_fixture'); expect(d.scope).toBe('synthetic_contract_only');
    expect(d.phase).toBe(phase); expect(d.primary).toBe(primary); expect(d.counts.drafts).toBe(drafts);
    expect(r.foreign_unchanged).toBe(true); expect(d.counts.contexts).toBe(1);
    for (const value of Object.values(d.counts)) expect(value).toBeLessThanOrEqual(1);
    expect(d.consumer_implemented).toBe(true); expect(d.consumer_reserved).toBe(true);
    expect(Object.values(d.permissions)).toEqual(Array(7).fill(false)); expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it.each(['body', 'no_body'])('holds %s draft privately with no consumable token or adopt API', name => {
    const r = result(name);
    expect(r.diagnostic.draft_held).toBe(true);
    expect(Object.keys(r)).toEqual(['ok', 'kind', 'diagnostic', 'foreign_unchanged', 'permissions']);
    for (const key of ['token', 'context', 'anchor', 'record', 'consume', 'issue', 'registry', 'clock', 'budget']) expect(r).not.toHaveProperty(key);
    expect(r.diagnostic.claims).toEqual({ context: 'spent', anchor: 'spent', record: 'spent', issue: 'spent', consume: 'available' });
});
it('keeps HTTP and cleanup facts when duplicate issue revokes the draft', () => {
    const before = result('body').diagnostic, after = result('duplicate_issue').diagnostic;
    expect(after.http).toEqual(before.http); expect(after.cleanup).toEqual(before.cleanup);
    expect(after.draft_held).toBe(false); expect(after.refusal).toBe('invalid_state'); expect(after.refusal_stage).toBe('issue');
    expect(after.counts.drafts).toBe(1); expect(after.counts.issue_attempts).toBe(1);
});
it('retains both hard HTTP and cleanup failure, without any draft', () => {
    const d = result('hard_cleanup').diagnostic;
    expect(d).toMatchObject({ primary: 'authentication_failed', http: { status: 401 }, cleanup: { disposition: 'unconfirmed', reason: 'cancel_rejected' }, draft_held: false });
});
it('stops on read-start refusal even if the synthetic record supplied no primary', () => {
    const d = result('read_started').diagnostic;
    expect(d).toMatchObject({ primary: 'invalid_state', refusal: 'invalid_state', refusal_stage: 'record', revoked: true,
        cleanup: { disposition: 'confirmed', read_started: true, read: 1 }, draft_held: false });
});
it('retains the first mismatch after retry and never restores an issue claim', () => {
    const d = result('retry_after_failure').diagnostic;
    expect(d).toMatchObject({ primary: 'evidence_binding_mismatch', refusal: 'evidence_binding_mismatch', refusal_stage: 'issue', claims: { issue: 'spent' },
        counts: { issue_attempts: 1, drafts: 0 }, draft_held: false });
});
it('reserves claims before the clock can reenter or cancel', () => {
    for (const name of ['issue_reentry', 'cancel_during_issue']) {
        const d = result(name).diagnostic; expect(d.claims.issue).toBe('spent'); expect(d.counts.issue_attempts).toBe(1); expect(d.counts.drafts).toBe(0);
    }
});
it('drops a held draft on stop but retains immutable cleanup facts', () => {
    const d = result('stop_after_issue').diagnostic;
    expect(d).toMatchObject({ phase: 'revoked', primary: 'closed', stop_reason: 'closed', draft_held: false, cleanup: { disposition: 'confirmed' }, counts: { drafts: 1 } });
});
it('does not reset last remaining-time observation between record and issue', () => {
    const d = result('clock_rewind').diagnostic;
    expect(d.primary).toBe('invalid_observation_time'); expect(d.cleanup?.disposition).toBe('confirmed'); expect(d.counts.drafts).toBe(0);
});
it('returns recursively frozen, non-authoritative diagnostic data', () => {
    const r = result('body');
    for (const item of [r, r.permissions, r.diagnostic, r.diagnostic.http, r.diagnostic.cleanup, r.diagnostic.claims, r.diagnostic.counts, r.diagnostic.permissions]) expect(Object.isFrozen(item)).toBe(true);
    expect(Reflect.set(r.diagnostic, 'draft_held', false)).toBe(false); expect(Reflect.set(r.permissions, 'fallback', true)).toBe(false);
    expect(run(r)).toMatchObject({ ok: false, code: 'invalid_input' });
});
const invalids = [null, undefined, 'body', 1, [], () => {}, {}, { scenario: 'unknown' }, { scenario: new String('body') },
    { scenario: 'body', session: {} }, { scenario: 'body', record: {} }, { scenario: 'body', context: {} }, { scenario: 'body', consume() {} },
    { scenario: 'body', callback() {} }, { scenario: 'body', enabled: true }, { scenario: 'body', [Symbol('extra')]: 1 },
    Object.assign(Object.create({}), { scenario: 'body' })];
it.each(invalids)('rejects non-case input without creating authority: %#', input => {
    const r = run(input); expect(r).toMatchObject({ ok: false, code: 'invalid_input' }); expect(r).not.toHaveProperty('diagnostic');
    expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));
});
it('rejects accessor/proxy inputs without invoking traps or leaking values', () => {
    let calls = 0;
    const raw = { get scenario() { calls++; throw Error('PRIVATE_INPUT'); } }, proxy = new Proxy({}, { ownKeys() { calls++; throw Error('PRIVATE_INPUT'); } });
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    for (const value of [raw, proxy, revoked.proxy]) expect(run(value)).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(calls).toBe(0);
});
it('rejects actual ST-01 and ST-02-shaped external diagnostic injection', async () => {
    const { createSyntheticStatusTerminalIssuer } = await import('../../src/review/abort-scope-evidence-status-terminal.js');
    const owner = createSyntheticStatusTerminalIssuer({ fake_io: true, remaining: () => 60000, deadline_ms: 60000, cleanup_floor_ms: 50000 });
    expect(run({ scenario: 'body', record: owner.diagnostics() })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(run({ scenario: 'body', record: { kind: 'cleanup_diagnostic_only', scope: 'injected_status_cleanup', cleanup: { disposition: 'confirmed' } } })).toMatchObject({ ok: false, code: 'invalid_input' });
});
it('runs without native, network, timers or external callbacks', () => {
    const forbidden = () => { throw Error('native forbidden'); };
    for (const name of ['fetch', 'Response', 'ReadableStream', 'setTimeout', 'setInterval']) vi.stubGlobal(name, forbidden);
    try { for (const [name] of cases) expect(result(name).ok).toBe(true); }
    finally { vi.unstubAllGlobals(); }
});
it.each([
    ['stop_before_issue', 'failed', 'revoked'], ['stop_after_failure', 'revoked', 'failed'], ['cancel_during_issue', 'revoked', 'revoked'],
    ['hard', 'diagnostic_only', 'diagnostic_only'], ['stop_after_issue', 'revoked', 'revoked'], ['body', 'draft_held', null],
] as const)('keeps the first terminal state for %s even when phase is overwritten later', (name, phase, first) => {
    const d = result(name).diagnostic;
    expect(d.phase).toBe(phase); expect(d.first_terminal).toBe(first);
});
