import { expect, it, vi } from 'vitest';
import { createSyntheticStatusTerminalIssuer } from '../../src/review/abort-scope-evidence-status-terminal.js';
const body = { reader_owned: true, closed_captured: true, read_started: false, read_pending: false,
    cancel: 'fulfilled', closed: 'fulfilled', release: 'succeeded' };
const empty = { reader_owned: false, closed_captured: false, read_started: false, read_pending: false,
    cancel: 'not_applicable', closed: 'not_applicable', release: 'not_applicable' };
function fixture() {
    let time = 1000;
    const owner = createSyntheticStatusTerminalIssuer({ fake_io: true, remaining: () => time, deadline_ms: 1000, cleanup_floor_ms: 20 });
    return { owner, time(n: number) { time = n; } };
}
function start(owner: ReturnType<typeof fixture>['owner'], purpose = 'release', status = 403, body_present = true) {
    const a = owner.issue(owner.binding, { purpose, status, body_present });
    if (!a.ok) throw Error('expected synthetic attempt');
    return a.value;
}
function candidate(owner: ReturnType<typeof fixture>['owner']) {
    const attempt = start(owner), end = owner.finish(attempt, body);
    if (!end.ok || !end.value.terminal) throw Error('expected synthetic terminal');
    return { attempt, evidence: end.value.terminal };
}
it('consumes a frozen synthetic diagnostic once, with all continuation authority disabled', () => {
    const { owner } = fixture(), { attempt, evidence } = candidate(owner);
    const result = owner.consume(owner.binding, attempt, evidence);
    expect(result).toMatchObject({ ok: true, value: { scope: 'synthetic_only', cleanup: { disposition: 'confirmed', kind: 'cancelled' } } });
    if (!result.ok) throw Error('consume');
    expect(Object.values(result.value.permissions)).toEqual(Array(7).fill(false));
    for (const v of [result, result.value, result.value.http, result.value.cleanup, result.value.cleanup?.facts, result.value.permissions]) expect(Object.isFrozen(v)).toBe(true);
    expect(owner.consume(owner.binding, attempt, evidence).ok).toBe(false);
    expect(owner.diagnostics().eligibility).toBe('diagnostic_only');
});
// Independent hand-written event/fact oracle; does not import product classification helpers.
const cases = [
    ['success', {}, 'confirmed', null],
    ['owner unknown', { reader_owned: false }, 'unconfirmed', 'reader_owner_unknown'],
    ['capture missing', { closed_captured: false }, 'unconfirmed', 'reader_owner_unknown'],
    ['read pending', { read_pending: true, cancel: 'rejected' }, 'unconfirmed', 'read_pending'],
    ['cancel absent', { cancel: 'not_requested' }, 'unconfirmed', 'cancel_pending'],
    ['cancel pending', { cancel: 'pending', closed: 'rejected' }, 'unconfirmed', 'cancel_pending'],
    ['cancel rejected', { cancel: 'rejected', release: 'failed' }, 'unconfirmed', 'cancel_rejected'],
    ['closed pending', { closed: 'pending' }, 'unconfirmed', 'closed_pending'],
    ['closed rejected', { closed: 'rejected' }, 'unconfirmed', 'closed_rejected'],
    ['release failed', { release: 'failed' }, 'unconfirmed', 'lock_release_failed'],
    ['release absent', { release: 'not_started' }, 'unconfirmed', 'lock_release_failed'],
] as const;
it('requires the independent cleanup table to be populated and uniquely named', () => {
    expect(cases).toHaveLength(11); expect(new Set(cases.map(c => c[0])).size).toBe(11);
});
it.each(cases)('retains independent cleanup facts: %s', (_name, patch, disposition, reason) => {
    const { owner } = fixture(), attempt = start(owner), facts = { ...body, ...patch };
    const result = owner.finish(attempt, facts);
    expect(result).toMatchObject({ ok: true, value: { diagnostic: { cleanup: { disposition, reason, facts } } } });
    if (!result.ok) throw Error('finish');
    expect(Boolean(result.value.terminal)).toBe(disposition === 'confirmed');
    if (reason) expect(owner.diagnostics().primary).toBe('internal_review_error');
});
it.each([['authentication', 401], ['parent', 401], ['release', 401], ['authentication', 403], ['parent', 403]] as const)(
    'retains hard HTTP and cleanup axes without a consumable terminal: %s/%s', (purpose, status) => {
        const { owner } = fixture(), attempt = start(owner, purpose, status);
        const result = owner.finish(attempt, { ...body, cancel: 'rejected' });
        expect(result).toMatchObject({ ok: true, value: { terminal: null, diagnostic: {
            primary: status === 401 ? 'authentication_failed' : 'access_denied',
            http: { purpose, status }, cleanup: { disposition: 'unconfirmed', reason: 'cancel_rejected' }, eligibility: 'diagnostic_only',
        } } });
    });
it.each([403, 404])('keeps no-body %s distinct from EOF and native operation success', status => {
    const { owner } = fixture(), attempt = start(owner, 'release', status, false);
    expect(owner.finish(attempt, empty)).toMatchObject({ ok: true, value: { diagnostic: { cleanup: { disposition: 'confirmed', kind: 'no_body', facts: empty } } } });
});
it('keeps parent 404 local and diagnostic-only', () => {
    const { owner } = fixture(), attempt = start(owner, 'parent', 404);
    expect(owner.finish(attempt, body)).toMatchObject({ ok: true, value: { terminal: null, diagnostic: { primary: null, eligibility: 'diagnostic_only' } } });
});
it('retains cleanup truth even when read-start makes status evidence ineligible', () => {
    const { owner } = fixture(), attempt = start(owner);
    expect(owner.finish(attempt, { ...body, read_started: true })).toMatchObject({ ok: true, value: { terminal: null,
        diagnostic: { cleanup: { disposition: 'confirmed' }, refusal: 'invalid_state', eligibility: 'diagnostic_only' } } });
});
it('allows disposal facts after cancellation, never resurrection', () => {
    const { owner } = fixture(), attempt = start(owner); owner.stop();
    expect(owner.finish(attempt, body)).toMatchObject({ ok: true, value: { terminal: null, diagnostic: { primary: 'cancelled', cleanup: { disposition: 'confirmed' } } } });
    expect(owner.issue(owner.binding, { purpose: 'release', status: 403, body_present: true }).ok).toBe(false);
});
it.each(['cancelled', 'closed'] as const)('revokes unconsumed terminals synchronously on %s', code => {
    const { owner } = fixture(), { attempt, evidence } = candidate(owner); owner.stop(code);
    expect(owner.consume(owner.binding, attempt, evidence)).toMatchObject({ ok: false, code });
    expect(owner.diagnostics().cleanup?.disposition).toBe('confirmed');
});
it('rejects duplicate generation, late finish and failed-owner reuse', () => {
    const { owner } = fixture(), attempt = start(owner);
    expect(owner.issue(owner.binding, { purpose: 'release', status: 403, body_present: true }).ok).toBe(false);
    expect(owner.finish(attempt, body).ok).toBe(false);
    expect(owner.issue(owner.binding, { purpose: 'release', status: 403, body_present: true }).ok).toBe(false);
});
it('rejects duplicate finish and revokes the earlier terminal without changing cleanup facts', () => {
    const { owner } = fixture(), { attempt, evidence } = candidate(owner);
    expect(owner.finish(attempt, body).ok).toBe(false);
    expect(owner.consume(owner.binding, attempt, evidence).ok).toBe(false);
    expect(owner.diagnostics().cleanup?.facts).toEqual(body);
});
it.each(['binding', 'attempt', 'terminal', 'copy'] as const)('rejects foreign %s without consuming the foreign owner', which => {
    const a = fixture().owner, b = fixture().owner, x = candidate(a), y = candidate(b);
    const key = which === 'binding' ? b.binding : a.binding;
    const handle = which === 'attempt' ? y.attempt : x.attempt;
    const proof = which === 'terminal' ? y.evidence : which === 'copy' ? { ...x.evidence } : x.evidence;
    expect(a.consume(key, handle, proof as typeof x.evidence).ok).toBe(false);
    expect(b.consume(b.binding, y.attempt, y.evidence).ok).toBe(true);
    expect(a.consume(a.binding, x.attempt, x.evidence).ok).toBe(false);
});
it.each([20, 19, 0])('refuses terminal confirmation at/after the original floor %s', time => {
    const f = fixture(), attempt = start(f.owner); f.time(time);
    expect(f.owner.finish(attempt, body)).toMatchObject({ ok: true, value: { terminal: null, diagnostic: {
        primary: 'deadline_exceeded', cleanup: { disposition: 'unconfirmed', reason: 'cleanup_deadline' },
    } } });
});
it('accepts before the floor but consumes the claim permanently on expiry', () => {
    const f = fixture(), attempt = start(f.owner); f.time(21);
    const r = f.owner.finish(attempt, body); if (!r.ok || !r.value.terminal) throw Error('terminal');
    f.time(20); expect(f.owner.consume(f.owner.binding, attempt, r.value.terminal)).toMatchObject({ ok: false, code: 'deadline_exceeded' });
    f.time(21); expect(f.owner.consume(f.owner.binding, attempt, r.value.terminal).ok).toBe(false);
});
it('rejects reversed clock while retaining HTTP and cleanup facts', () => {
    const f = fixture(), a = start(f.owner); f.time(1001);
    expect(f.owner.finish(a, body)).toMatchObject({ ok: true, value: { terminal: null, diagnostic: { primary: 'invalid_observation_time', cleanup: { reason: 'observation_invalid' } } } });
});
it('does not leak clock exceptions or repair a confirmed HTTP primary', () => {
    let broken = false;
    const owner = createSyntheticStatusTerminalIssuer({ fake_io: true, deadline_ms: 1000, cleanup_floor_ms: 20,
        remaining() { if (broken) throw Error('PRIVATE_CLOCK_TOKEN'); return 1000; } });
    const a = start(owner, 'parent', 401); broken = true; owner.finish(a, body);
    expect(owner.diagnostics()).toMatchObject({ primary: 'authentication_failed', cleanup: { reason: 'observation_invalid' } });
    expect(JSON.stringify(owner.diagnostics())).not.toContain('PRIVATE');
});
it('claims before reentrant clock calls and never restores a failed owner', () => {
    let reenter = () => {};
    const owner = createSyntheticStatusTerminalIssuer({ fake_io: true, deadline_ms: 1000, cleanup_floor_ms: 20,
        remaining() { reenter(); return 1000; } });
    reenter = () => { owner.issue(owner.binding, { purpose: 'release', status: 403, body_present: true }); };
    expect(owner.issue(owner.binding, { purpose: 'release', status: 403, body_present: true })).toMatchObject({ ok: false, code: 'invalid_state' });
});
it('revokes a consume claim on reentry through the clock', () => {
    let reenter = () => {};
    const owner = createSyntheticStatusTerminalIssuer({ fake_io: true, deadline_ms: 1000, cleanup_floor_ms: 20,
        remaining() { reenter(); return 1000; } });
    const x = candidate(owner); reenter = () => { owner.consume(owner.binding, x.attempt, x.evidence); };
    expect(owner.consume(owner.binding, x.attempt, x.evidence).ok).toBe(false);
    reenter = () => {}; expect(owner.consume(owner.binding, x.attempt, x.evidence).ok).toBe(false);
});
it.each(['header', 'facts'] as const)('rejects accessor/proxy/injected %s without reading getters', target => {
    for (const kind of ['getter', 'proxy', 'extra']) {
        const { owner } = fixture(), raw = target === 'header' ? { purpose: 'release', status: 403, body_present: true } : { ...body };
        let calls = 0; let input: unknown = raw;
        if (kind === 'getter') Object.defineProperty(raw, target === 'header' ? 'status' : 'cancel', { enumerable: true, get() { calls++; throw Error('PRIVATE'); } });
        if (kind === 'proxy') input = new Proxy(raw, { ownKeys() { calls++; throw Error('PRIVATE'); } });
        if (kind === 'extra') Object.assign(raw, { approved: true });
        const result = target === 'header' ? owner.issue(owner.binding, input) : owner.finish(start(owner), input);
        expect(result.ok).toBe(false); expect(calls).toBe(0); expect(JSON.stringify(owner.diagnostics())).not.toContain('PRIVATE');
    }
});
it.each([body, { ...empty, cancel: 'fulfilled' }])('rejects fabricated no-body success facts', facts => {
    const { owner } = fixture(), attempt = start(owner, 'release', 403, false);
    expect(owner.finish(attempt, facts).ok).toBe(false);
});
it('never invokes global fetch, Response, Streams or timers', () => {
    const forbidden = () => { throw Error('forbidden native call'); };
    for (const key of ['fetch', 'Response', 'ReadableStream', 'setTimeout']) vi.stubGlobal(key, forbidden);
    try { const { owner } = fixture(), x = candidate(owner); expect(owner.consume(owner.binding, x.attempt, x.evidence).ok).toBe(true); }
    finally { vi.unstubAllGlobals(); }
});
it('retains immutable fact copies after caller mutation', () => {
    const { owner } = fixture(), a = start(owner), raw = { ...body };
    owner.finish(a, raw); raw.cancel = 'rejected';
    expect(owner.diagnostics().cleanup?.facts.cancel).toBe('fulfilled');
});
it('does not mint a terminal if the clock callback cancels during finish', () => {
    let action = () => {};
    const owner = createSyntheticStatusTerminalIssuer({ fake_io: true, remaining() { action(); return 1000; }, deadline_ms: 1000, cleanup_floor_ms: 20 });
    const a = start(owner); action = () => owner.stop();
    expect(owner.finish(a, body)).toMatchObject({ ok: true, value: { terminal: null, diagnostic: { primary: 'cancelled', cleanup: { disposition: 'confirmed' } } } });
});
it.each([200, 201, 429, 500, '403', NaN])('leaves non-target status %s to later stages', status => {
    const { owner } = fixture(); expect(owner.issue(owner.binding, { purpose: 'release', status, body_present: true })).toMatchObject({ ok: false, code: 'invalid_input' });
});
it('does not adopt a session-shaped object as a binding', () => {
    const { owner } = fixture();
    expect(owner.issue({ session: {}, source: {}, lease: {}, ready: true } as unknown as typeof owner.binding,
        { purpose: 'release', status: 403, body_present: true })).toMatchObject({ ok: false, code: 'evidence_binding_mismatch' });
});
