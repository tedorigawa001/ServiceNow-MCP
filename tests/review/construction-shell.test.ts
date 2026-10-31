import { expect, it, vi } from 'vitest';
import { runConstructionShellFixture } from '../../src/review/abort-scope-evidence-construction-shell.js';
import * as module from '../../src/review/abort-scope-evidence-construction-shell.js';
function result(scenario: string) { const r = runConstructionShellFixture({ scenario }); if (!r.ok) throw Error('fixture'); return r; }

it('creates a pending shell with three unobserved purposes, fixed resources and no observations', () => {
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw Error('PRIVATE_CLOCK'); });
    try {
        const r = runConstructionShellFixture({ scenario: 'empty' }); if (!r.ok) throw Error('fixture');
        expect(r.diagnostic.state).toBe('pending');
        expect(Object.keys(r.diagnostic.purposes)).toEqual(['authentication', 'parent', 'release']);
        expect(Object.values(r.diagnostic.purposes)).toEqual([false, false, false]);
        expect(Object.keys(r.diagnostic.resources)).toHaveLength(10);
        expect(Object.values(r.permissions)).toEqual(Array(7).fill(false));
        expect(now).not.toHaveBeenCalled();
    } finally { now.mockRestore(); }
});
it('binds core then source with independent one-shot claims and one ownership transfer', () => {
    const r = result('source_bound'), d = r.diagnostic;
    expect(d.state).toBe('ready'); expect(d.bindings).toEqual({ core: 'bound', source: 'bound', active: true });
    expect(d.claims).toEqual({ core: 'spent', source: 'spent', commit: 'spent' });
    expect(d.counts).toEqual({ shells: 1, core_bindings: 1, source_bindings: 1, commits: 1 });
    expect(d.resources.core.owner).toBe('session'); expect(d.primary).toBeNull();
});
it('records partial acquisition as unknown and refuses to claim confirmed cleanup', () => {
    const d = result('unknown_resource').diagnostic;
    expect(d.primary?.code).toBe('internal_review_error'); expect(d.resources.deadline_timer).toMatchObject({ state: 'unconfirmed', attempts: 1, acquisitions: 0, releases: 1 });
    expect(d.teardown).toBe('unconfirmed'); expect(d.sealed).toBe(true);
});
it('transfers held resources once and permits only the new owner to release them', () => {
    const d = result('wrong_release_owner').diagnostic;
    expect(d.refusal?.code).toBe('evidence_binding_mismatch');
    expect(d.resources.core).toMatchObject({ state: 'released', owner: 'none', releases: 1 });
    expect(d.teardown).toBe('confirmed'); expect(d.counts.commits).toBe(1);
});
it.each(['duplicate_core', 'duplicate_source', 'duplicate_commit', 'core_before_resources', 'source_before_core', 'source_before_commit',
    'bind_after_stop', 'commit_after_stop', 'resource_after_stop', 'missing_snapshot'])('fails closed on %s and never restores a claim', scenario => {
    const d = result(scenario).diagnostic;
    expect(d.state).toBe('failed'); expect(d.bindings.active).toBe(false); expect(d.refusal?.code).toBe('invalid_state');
    expect(Object.values(d.claims)).toEqual(['spent', 'spent', 'spent']);
    for (const n of Object.values(d.counts)) expect(n).toBeLessThanOrEqual(1);
});
it.each(['foreign_core', 'copy_core', 'core_run', 'core_session', 'core_snapshot', 'core_core', 'core_lease', 'core_registered_owner',
    'foreign_source', 'copy_source', 'source_core_binding', 'source_key', 'source_source', 'source_handle'])('rejects %s without touching a foreign shell', scenario => {
    const r = result(scenario), d = r.diagnostic;
    expect(d.primary?.code).toBe('evidence_binding_mismatch'); expect(d.primary?.public_code).toBe('internal_review_error');
    expect(d.bindings.active).toBe(false); expect(r.foreign_unchanged).toBe(true);
});
it('retains an early cancel before core binding despite later configuration and binding failures', () => {
    const d = result('first_reason').diagnostic;
    expect(d.primary).toEqual({ code: 'cancelled', public_code: 'cancelled', stage: 'stop' });
    expect(d.refusal).toEqual({ code: 'invalid_state', stage: 'core_binding' });
    expect(d.counts.core_bindings).toBe(0);
});
it('records a handle returned after synchronous stop for cleanup, without reviving initialization', () => {
    const d = result('late_resource').diagnostic;
    expect(d.primary?.code).toBe('cancelled'); expect(d.resources.controller).toMatchObject({ attempts: 1, acquisitions: 1, releases: 1, state: 'released' });
    expect(d.counts.commits).toBe(0); expect(d.teardown).toBe('confirmed');
});
it('lets only the new owner report an unstarted slot as not needed after commit', () => {
    const d = result('session_release_unstarted').diagnostic;
    expect(d.refusal).toBeNull(); expect(d.primary).toBeNull(); expect(d.teardown).toBe('confirmed');
    expect(d.resources.phase_timer).toMatchObject({ state: 'unstarted', owner: 'none', attempts: 0, releases: 0 });
    const old = result('run_release_unstarted').diagnostic;
    expect(old.refusal?.code).toBe('evidence_binding_mismatch'); expect(old.resources.phase_timer.releases).toBe(0);
});
it('classifies a repeated new-owner release as a duplicate, not a foreign owner', () => {
    const d = result('session_duplicate_release').diagnostic;
    expect(d.refusal?.code).toBe('invalid_state'); expect(d.resources.core).toMatchObject({ state: 'released', owner: 'none', releases: 1 });
});
it.each(['duplicate_acquire', 'duplicate_release', 'unknown_confirmed', 'foreign_resource'])('rejects %s without duplicating an operation', scenario => {
    const d = result(scenario).diagnostic;
    expect(d.refusal).not.toBeNull();
    for (const r of Object.values(d.resources)) { expect(r.attempts).toBeLessThanOrEqual(1); expect(r.acquisitions).toBeLessThanOrEqual(1); expect(r.releases).toBeLessThanOrEqual(1); }
});
it('does not claim release for held resources merely because the shell was sealed', () => {
    const d = result('seal_pending').diagnostic;
    expect(d.sealed).toBe(true); expect(d.teardown).toBe('unconfirmed'); expect(d.resources.core).toMatchObject({ state: 'unconfirmed', releases: 0 });
});
it('ignores late mutations and a second seal while retaining the first sealed copy', () => {
    const r = result('sealed_late');
    expect(r.late_results).toEqual(Array(7).fill('late_ignored')); expect(r.diagnostic).toEqual(r.at_seal);
});
it('does not permit a timer acquisition before core binding', () => {
    const d = result('timer_before_core').diagnostic;
    expect(d.refusal).toEqual({ code: 'invalid_state', stage: 'resource' });
    expect(d.resources.deadline_timer.attempts).toBe(0);
});
it('has no public adoption/writer ports and returns recursively frozen secret-free diagnostic copies', () => {
    expect(Object.keys(module)).toEqual(['runConstructionShellFixture']);
    const r = result('source_bound');
    const visit = (x: unknown) => { if (x && typeof x === 'object') { expect(Object.isFrozen(x)).toBe(true); for (const v of Object.values(x)) visit(v); } };
    visit(r); expect(JSON.stringify(r)).not.toMatch(/PRIVATE|credential|sys_id|principal|https:/);
    expect(runConstructionShellFixture(r)).toMatchObject({ ok: false, code: 'invalid_input' });
    for (const key of ['core', 'source', 'lease', 'snapshot', 'session', 'tokens', 'writer', 'bind', 'register', 'acquire', 'release']) expect(r).not.toHaveProperty(key);
});
it.each([null, undefined, [], 'empty', {}, { scenario: 'unknown' }, { scenario: new String('empty') },
    { scenario: 'empty', session: {} }, { scenario: 'empty', callback() {} }, { scenario: 'empty', token: {} },
    { scenario: 'empty', [Symbol()]: true }, Object.create({ scenario: 'empty' })])('rejects external supply %#', raw => {
    expect(runConstructionShellFixture(raw)).toMatchObject({ ok: false, code: 'invalid_input' });
});
it('rejects accessors/proxies without invoking any trap', () => {
    let calls = 0;
    const accessor = { get scenario() { calls++; throw Error('PRIVATE_GETTER'); } };
    const proxy = new Proxy({}, { ownKeys() { calls++; throw Error('PRIVATE_PROXY'); } });
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    for (const raw of [accessor, proxy, revoked.proxy]) expect(runConstructionShellFixture(raw)).toMatchObject({ ok: false });
    expect(calls).toBe(0);
});
it('does not start a clock, controller, fetch, timer or listener while creating and binding the synthetic shell', () => {
    const perf = vi.spyOn(performance, 'now').mockImplementation(() => { throw Error('PRIVATE_CLOCK'); });
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => { throw Error('PRIVATE_TIMER'); });
    const fetch = vi.fn(() => { throw Error('PRIVATE_FETCH'); }), controller = vi.fn(() => { throw Error('PRIVATE_CONTROLLER'); });
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('AbortController', controller);
    try {
        expect(result('source_bound').diagnostic.state).toBe('ready');
        expect(perf).not.toHaveBeenCalled(); expect(timer).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(controller).not.toHaveBeenCalled();
    } finally { perf.mockRestore(); timer.mockRestore(); vi.unstubAllGlobals(); }
});
it('does not commit or bind a source after its core resource has been released', () => {
    for (const scenario of ['commit_after_release', 'source_after_release']) {
        const d = result(scenario).diagnostic;
        expect(d.refusal?.code).toBe('invalid_state'); expect(d.bindings.active).toBe(false);
        expect(d.counts.source_bindings).toBe(0);
    }
});
