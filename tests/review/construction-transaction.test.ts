import { afterEach, expect, it, vi } from 'vitest';
import { BoundedReadSession, type ReadSnapshot } from '../../src/servicenow/bounded-read.js';
import * as canonical from '../../src/servicenow/review-canonical-budget.js';
import * as lifecycle from '../../src/servicenow/review-evidence-lifecycle.js';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const snapshot = (): ReadSnapshot => ({ instanceUrl: 'https://synthetic.invalid', authMode: 'per-user', perUserBearerToken: 'PRIVATE_TOKEN', oauth: {} });
it('captures a sealed failure copy when the first clock throws, before creating resources', () => {
    vi.spyOn(performance, 'now').mockImplementation(() => { throw Error('PRIVATE_CLOCK'); });
    const r = BoundedReadSession.create(snapshot());
    expect(r.ok).toBe(false); if (r.ok) throw Error('fixture');
    expect(r.code).toBe('internal_review_error');
    expect(r.construction).toMatchObject({ state: 'closed', sealed: true, primary: { stage: 'clock', code: 'internal_review_error' }, teardown: 'confirmed' });
    expect(r.construction?.resources.deadline_timer.state).toBe('absent');
    expect(r.construction?.resources.admission.state).toBe('absent');
    expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
function failure(r: ReturnType<typeof BoundedReadSession.create>) { if (r.ok) { r.session.close(); throw Error('expected failure'); } return r; }
function nextCloses() { const next = BoundedReadSession.create(snapshot()); expect(next.ok).toBe(true); if (next.ok) next.session.close(); }
it('captures a wall-clock serialization failure before admission', () => {
    vi.spyOn(Date.prototype, 'toISOString').mockImplementationOnce(() => { throw Error('PRIVATE_DATE'); });
    const r = failure(BoundedReadSession.create(snapshot()));
    expect(r.construction).toMatchObject({ primary: { stage: 'clock', code: 'internal_review_error' }, teardown: 'confirmed' });
    expect(r.construction?.resources.admission.state).toBe('absent');
    expect(JSON.stringify(r)).not.toContain('PRIVATE'); nextCloses();
});
it('records and clears the timer returned after a synchronous deadline callback without resuming initialization', () => {
    vi.useFakeTimers(); const schedule = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementationOnce(((callback: () => void, ms: number) => {
        callback(); return schedule(callback, ms);
    }) as typeof setTimeout);
    const r = failure(BoundedReadSession.create(snapshot(), { signal: new AbortController().signal }));
    expect(r.code).toBe('deadline_exceeded');
    expect(r.construction).toMatchObject({ primary: { stage: 'timer' }, teardown: 'confirmed' });
    expect(r.construction?.resources.deadline_timer.releases).toBe(1);
    expect(r.construction?.resources.abort_listener.state).toBe('absent');
    expect(vi.getTimerCount()).toBe(0); nextCloses();
});
it('commits a bound diagnostic owner before timer/listener use and closes each resource once', () => {
    vi.useFakeTimers(); const original = snapshot(), controller = new AbortController();
    const r = BoundedReadSession.create(original, { signal: controller.signal }); expect(r.ok).toBe(true); if (!r.ok) throw Error('fixture');
    expect(r.construction).toMatchObject({ state: 'ready', core_bound: true, teardown: 'not_started' });
    expect(vi.getTimerCount()).toBe(1); r.session.close(); const copy = r.session.constructionStatus(); r.session.close();
    expect(r.session.constructionStatus()).toEqual(copy); expect(copy).toMatchObject({ state: 'closed', sealed: true, teardown: 'confirmed', primary: null });
    for (const slot of Object.values(copy.resources)) expect(slot.releases).toBeLessThanOrEqual(1);
    expect(original.perUserBearerToken).toBe('PRIVATE_TOKEN'); expect(vi.getTimerCount()).toBe(0); nextCloses();
});
it.each([1, 2])('rolls back when controller %i construction throws without leaking admission', n => {
    vi.useFakeTimers(); const Original = AbortController; let created = 0;
    vi.stubGlobal('AbortController', class extends Original { constructor() { if (++created === n) throw Error('PRIVATE_CONTROLLER'); super(); } });
    const r = failure(BoundedReadSession.create(snapshot()));
    expect(r.code).toBe('internal_review_error'); expect(r.construction?.primary?.stage).toBe('controllers');
    expect(r.construction?.resources.admission.state).toBe('released'); expect(r.construction?.resources.core.state).toBe('released');
    expect(r.construction?.resources.deadline_timer.state).toBe('absent'); expect(JSON.stringify(r)).not.toContain('PRIVATE');
    vi.unstubAllGlobals(); expect(vi.getTimerCount()).toBe(0); nextCloses();
});
it('retains timer-handle uncertainty but still releases controllers and admission', () => {
    vi.useFakeTimers(); vi.spyOn(globalThis, 'setTimeout').mockImplementationOnce(() => { throw Error('PRIVATE_TIMER'); });
    const r = failure(BoundedReadSession.create(snapshot()));
    expect(r.construction).toMatchObject({ primary: { stage: 'timer' }, teardown: 'unconfirmed', resources: {
        deadline_timer: { state: 'unconfirmed', release_claim: 1, releases: 0 }, controller: { state: 'released' }, admission: { state: 'released' } } });
    expect(vi.getTimerCount()).toBe(0); nextCloses();
});
it('removes a partially registered listener using the captured callback after add throws', () => {
    vi.useFakeTimers(); const external = new AbortController(), add = AbortSignal.prototype.addEventListener;
    const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    vi.spyOn(AbortSignal.prototype, 'addEventListener').mockImplementation(function (...args) {
        Reflect.apply(add, this, args); if (this === external.signal) throw Error('PRIVATE_ADD');
    });
    const r = failure(BoundedReadSession.create(snapshot(), { signal: external.signal }));
    expect(r.construction).toMatchObject({ primary: { stage: 'listener' }, teardown: 'confirmed', resources: { abort_listener: { state: 'released', releases: 1 }, admission: { state: 'released' } } });
    expect(remove.mock.calls).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks(); nextCloses();
});
it('handles synchronous abort during listener registration without replacing cancellation', () => {
    vi.useFakeTimers(); const external = new AbortController(), add = AbortSignal.prototype.addEventListener;
    vi.spyOn(AbortSignal.prototype, 'addEventListener').mockImplementation(function (...args) { Reflect.apply(add, this, args); if (this === external.signal) external.abort('PRIVATE_REASON'); });
    const r = failure(BoundedReadSession.create(snapshot(), { signal: external.signal }));
    expect(r.code).toBe('cancelled'); expect(r.construction).toMatchObject({ primary: { code: 'cancelled', stage: 'listener' }, teardown: 'confirmed' });
    expect(vi.getTimerCount()).toBe(0); expect(JSON.stringify(r)).not.toContain('PRIVATE'); nextCloses();
});
it('retains the original failure and continues all rollback slots when clearTimeout throws', () => {
    vi.useFakeTimers(); const external = new AbortController(), clear = globalThis.clearTimeout, add = AbortSignal.prototype.addEventListener;
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation((...args) => { Reflect.apply(clear, globalThis, args); throw Error('PRIVATE_CLEAR'); });
    vi.spyOn(AbortSignal.prototype, 'addEventListener').mockImplementation(function (...args) { Reflect.apply(add, this, args); if (this === external.signal) throw Error('PRIVATE_ADD'); });
    const r = failure(BoundedReadSession.create(snapshot(), { signal: external.signal }));
    expect(r.construction).toMatchObject({ primary: { stage: 'listener' }, teardown: 'unconfirmed', resources: {
        deadline_timer: { state: 'unconfirmed', releases: 1 }, phase_controller: { state: 'released' }, controller: { state: 'released' }, admission: { state: 'released' }, snapshot: { state: 'released' } } });
    expect(vi.getTimerCount()).toBe(0); expect(JSON.stringify(r)).not.toContain('PRIVATE'); vi.restoreAllMocks(); nextCloses();
});
it.each(['core', 'owner'])('recovers a fixed failure copy when %s generation throws', stage => {
    if (stage === 'core') vi.spyOn(canonical, 'createCanonicalReviewBudget').mockImplementationOnce(() => { throw Error('PRIVATE_CORE'); });
    else vi.spyOn(lifecycle, 'registerReviewEvidenceSession').mockImplementationOnce(() => { throw Error('PRIVATE_OWNER'); });
    const r = failure(BoundedReadSession.create(snapshot()));
    expect(r.construction?.primary?.stage).toBe(stage); expect(r.code).toBe('internal_review_error');
    expect(r.construction?.resources.deadline_timer.state).toBe('absent'); expect(JSON.stringify(r)).not.toContain('PRIVATE'); nextCloses();
});
it('latches a stop during owner registration without reading an uninitialized owner', () => {
    const register = lifecycle.registerReviewEvidenceSession;
    vi.spyOn(lifecycle, 'registerReviewEvidenceSession').mockImplementationOnce((...args) => { args[4]!.stop('cancelled'); return Reflect.apply(register, undefined, args); });
    const r = failure(BoundedReadSession.create(snapshot()));
    expect(r.code).toBe('cancelled'); expect(r.construction?.resources.registered_owner.state).toBe('released');
    expect(r.construction?.resources.controller.state).toBe('absent'); nextCloses();
});
it('never refunds another run admission on a busy rejection', () => {
    const first = new BoundedReadSession(snapshot());
    try { const second = failure(BoundedReadSession.create(snapshot())); expect(second.code).toBe('review_busy');
        expect(second.construction?.resources.admission.state).toBe('absent'); expect(failure(BoundedReadSession.create(snapshot())).code).toBe('review_busy');
    } finally { first.close(); }
    nextCloses();
});
it('keeps direct-new pre-aborted compatibility while the factory returns a released failure copy', () => {
    vi.useFakeTimers(); const controller = new AbortController(); controller.abort();
    const direct = new BoundedReadSession(snapshot(), { signal: controller.signal }); expect(direct.reviewRunStatus().primary?.code).toBe('cancelled'); direct.close();
    const r = failure(BoundedReadSession.create(snapshot(), { signal: controller.signal }));
    expect(r.code).toBe('cancelled'); expect(r.construction?.teardown).toBe('confirmed'); expect(vi.getTimerCount()).toBe(0); nextCloses();
});
it('reports shell-unavailable without pretending to have a diagnostic owner', () => {
    vi.spyOn(Object, 'fromEntries').mockImplementationOnce(() => { throw Error('PRIVATE_ALLOCATION'); });
    const r = failure(BoundedReadSession.create(snapshot())); expect(r).toEqual({ ok: false, code: 'internal_review_error', construction: null });
    nextCloses();
});
it('releases a successful instance if its initial result projection throws', () => {
    vi.useFakeTimers(); const freeze = Object.freeze; let fired = false;
    vi.spyOn(Object, 'freeze').mockImplementation(value => {
        if (!fired && value && typeof value === 'object' && 'scope' in value && value.scope === 'construction_only' && 'state' in value && value.state === 'ready') { fired = true; throw Error('PRIVATE_COPY'); }
        return freeze(value);
    });
    const r = failure(BoundedReadSession.create(snapshot()));
    expect(fired).toBe(true); expect(r.construction).toMatchObject({ primary: { stage: 'commit' }, teardown: 'confirmed' });
    expect(vi.getTimerCount()).toBe(0); expect(JSON.stringify(r)).not.toContain('PRIVATE'); vi.restoreAllMocks(); nextCloses();
});
it.each([NaN, Infinity, -1])('rejects invalid first monotonic clock %s without losing the internal reason', value => {
    vi.spyOn(performance, 'now').mockReturnValue(value);
    const r = failure(BoundedReadSession.create(snapshot()));
    expect(r.code).toBe('internal_review_error'); expect(r.construction?.primary?.code).toBe('invalid_observation_time');
});
it('does not execute input accessors/proxies or return raw exceptions from direct new', () => {
    let calls = 0;
    const raw = { ...snapshot(), get instanceUrl() { calls++; throw Error('PRIVATE_GETTER'); } };
    expect(() => new BoundedReadSession(raw)).toThrow('invalid_input');
    const proxy = new Proxy(snapshot(), { ownKeys() { calls++; throw Error('PRIVATE_PROXY'); } });
    expect(failure(BoundedReadSession.create(proxy)).code).toBe('invalid_input'); expect(calls).toBe(0);
});
it('preserves configuration then authentication then busy error precedence', () => {
    const held = new BoundedReadSession(snapshot());
    try {
        expect(failure(BoundedReadSession.create({ ...snapshot(), reviewReleaseConfigProvider() { throw Error('PRIVATE_CONFIG'); } })).code).toBe('config_invalid');
        expect(failure(BoundedReadSession.create({ ...snapshot(), perUserBearerToken: undefined })).code).toBe('authentication_failed');
        expect(failure(BoundedReadSession.create(snapshot())).code).toBe('review_busy');
    } finally { held.close(); }
});
it('cannot accept a caller-provided seed, diagnostic or shell', () => {
    for (const key of ['seed', 'construction', 'shell', 'writer']) expect(failure(BoundedReadSession.create(snapshot(), { [key]: {} } as never)).code).toBe('invalid_input');
});
it('returns immutable failure data with no writer, session, credential or take/retry capability', () => {
    const r = failure(BoundedReadSession.create({ ...snapshot(), instanceUrl: 'http://synthetic.invalid' }));
    const visit = (o: unknown) => { if (o && typeof o === 'object') { expect(Object.isFrozen(o)).toBe(true); for (const v of Object.values(o)) visit(v); } }; visit(r);
    expect(r).not.toHaveProperty('session'); expect(r).not.toHaveProperty('error');
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE|clientSecret|perUserBearerToken|https:/);
});
