/** ND-01: pure, package-excluded diagnostic model. No runtime registration or native operations. */
import { types } from 'node:util';

type Purpose = 'authentication' | 'parent' | 'release';
type Stage = 'binding' | 'header' | 'cleanup' | 'acceptance' | 'stop' | 'teardown' | 'seal';
type Code = 'invalid_state' | 'evidence_binding_mismatch' | 'authentication_failed' | 'access_denied' |
    'not_found_or_not_visible' | 'internal_review_error' | 'cancelled' | 'deadline_exceeded' | 'upstream_unavailable' | 'invalid_response';
type Reason = Readonly<{ code: Code; stage: Stage }>;
type Binding = Readonly<{ run: object; session: object; snapshot: object; lease: object; core: object;
    source: object; constructor: object; transport: object }>;
type Attempt = Readonly<{ binding: Binding; purpose: Purpose; ordinal: number; window: object }>;
type Http = Readonly<{ status: number; body_present: boolean; classification: 'hard' | 'local' | 'recovery_candidate' | 'other' }>;
type Cleanup = Readonly<{ phase: 'not_started' | 'pending' | 'confirmed' | 'unconfirmed' | 'not_applicable';
    kind: 'cancelled' | 'no_body' | null; reason: 'cancel_rejected' | 'window_ended' | null }>;
type Acceptance = { phase: 'not_started' | 'consuming' | 'accepted' | 'rejected' | 'revoked';
    first_terminal: 'accepted' | 'rejected' | 'revoked' | null; consumes: 0 | 1 };
type Slot = { http: Http | null; cleanup: Cleanup; acceptance: Acceptance; later_attempts: number; later_reason: Code | null };
const purposes = ['authentication', 'parent', 'release'] as const;
const permissions = Object.freeze({ dispatch: false, read_body: false, retry: false, fallback: false,
    body_ack: false, release_permit: false, formal_issuance: false } as const);
const id = (): object => Object.freeze(Object.create(null));
const makeBinding = (): Binding => Object.freeze({ run: id(), session: id(), snapshot: id(), lease: id(), core: id(),
    source: id(), constructor: id(), transport: id() });
const emptyCleanup = (): Cleanup => Object.freeze({ phase: 'not_started', kind: null, reason: null });
const emptySlot = (): Slot => ({ http: null, cleanup: emptyCleanup(), acceptance: { phase: 'not_started', first_terminal: null, consumes: 0 },
    later_attempts: 0, later_reason: null });

/** All writers and identity tables stay in this creator; the only export is a fixed-case fake runner. */
function construct(expected: Binding) {
    const slots: Record<Purpose, Slot> = { authentication: emptySlot(), parent: emptySlot(), release: emptySlot() };
    let binding: 'pending' | 'bound' | 'failed' = 'pending', bindClaim = false, sealed = false, stopped = false;
    let primary: (Reason & { public_code: Code }) | null = null, local: Reason | null = null, refusal: Reason | null = null;
    let teardown: 'not_started' | 'releasing' | 'confirmed' | 'unconfirmed' = 'not_started';
    // Fixed three entries, no event history. Attempt identities are fixed by the synthetic creator.
    const active = () => ({ current: null as Attempt | null, observed: false, noResponse: false, body: false, cleanup: emptyCleanup() });
    const attempts = { authentication: active(), parent: active(), release: active() };
    function revoke() {
        stopped = true;
        for (const purpose of purposes) {
            const a = slots[purpose].acceptance;
            a.phase = 'revoked'; a.first_terminal ??= 'revoked';
        }
    }
    function reject(code: Code, stage: Stage): 'rejected' {
        refusal ??= Object.freeze({ code, stage }); revoke(); return 'rejected';
    }
    function bind(candidate: Binding) {
        if (sealed) return 'late_ignored';
        if (bindClaim || stopped) return reject('invalid_state', 'binding');
        bindClaim = true; // Spent even on mismatch; no callback or retry can restore it.
        if (candidate !== expected) { binding = 'failed'; return reject('evidence_binding_mismatch', 'binding'); }
        binding = 'bound'; return 'bound';
    }
    function stop(code: Code, stage: Stage) {
        if (sealed) return 'late_ignored';
        primary ??= Object.freeze({ code, public_code: code === 'evidence_binding_mismatch' || code === 'invalid_state' ? 'internal_review_error' : code, stage });
        revoke(); return 'stopped';
    }
    function open(purpose: Purpose, ordinal = 1): Attempt | null {
        if (sealed) return null;
        if (binding !== 'bound' || stopped) { reject('invalid_state', 'header'); return null; }
        const a = attempts[purpose];
        // The existing contract also retries after a dispatch/fetch failure, which ends an attempt without any header.
        const ended = a.noResponse || a.observed && a.cleanup.phase === 'confirmed';
        if (ordinal !== (a.current?.ordinal ?? 0) + 1 || ordinal > 210 || a.current && !ended) {
            reject('invalid_state', 'header'); return null;
        }
        const attempt = Object.freeze({ binding: expected, purpose, ordinal, window: id() });
        a.current = attempt; a.observed = false; a.noResponse = false; a.body = false; a.cleanup = emptyCleanup(); return attempt;
    }
    function valid(a: Attempt, purpose: Purpose, stage: Stage): boolean {
        if (binding !== 'bound' || a.binding !== expected || a.purpose !== purpose || attempts[purpose].current !== a) {
            reject('evidence_binding_mismatch', stage); return false;
        }
        return true;
    }
    // Producer-specific writer closures: no generic external diagnostic setter or lookup is exported.
    function writers(purpose: Purpose) {
        function header(a: Attempt, status: number, body_present: boolean) {
            if (sealed) return 'late_ignored';
            if (!valid(a, purpose, 'header') || refusal) return 'rejected';
            if (attempts[purpose].observed || attempts[purpose].noResponse) return reject('invalid_state', 'header');
            if (!Number.isSafeInteger(status) || status < 100 || status > 599) return reject('invalid_state', 'header');
            attempts[purpose].observed = true;
            attempts[purpose].body = body_present;
            const classification = status === 401 || status === 403 && purpose !== 'release' ? 'hard' :
                status === 404 && purpose === 'parent' ? 'local' : purpose === 'release' && [403, 404].includes(status) ? 'recovery_candidate' : 'other';
            const code = status === 401 ? 'authentication_failed' : status === 403 ? 'access_denied' : status === 404 ? 'not_found_or_not_visible' : null;
            if (a.ordinal === 1) slots[purpose].http = Object.freeze({ status, body_present, classification });
            // Same reason as the existing contract: 429/5xx are upstream_unavailable, any other non-200 is invalid_response.
            else { slots[purpose].later_attempts++; slots[purpose].later_reason ??= code ?? (status === 429 || status >= 500 ? 'upstream_unavailable' : status !== 200 ? 'invalid_response' : null); }
            if (classification === 'hard') stop(code!, 'header');
            if (classification === 'local') local ??= Object.freeze({ code: code!, stage: 'header' });
            return 'recorded';
        }
        function cleanup(a: Attempt, phase: 'pending' | 'confirmed' | 'unconfirmed', kind: Cleanup['kind'] = null,
            reason: Cleanup['reason'] = null) {
            if (sealed) return 'late_ignored';
            if (!valid(a, purpose, 'cleanup')) return 'rejected';
            const s = slots[purpose], current = attempts[purpose];
            if (!current.observed || current.cleanup.phase !== (phase === 'pending' ? 'not_started' : 'pending') ||
                phase === 'pending' && (kind !== null || reason !== null) ||
                phase === 'confirmed' && (kind !== (current.body ? 'cancelled' : 'no_body') || reason !== null) ||
                phase === 'unconfirmed' && (kind !== null || reason === null)) return reject('invalid_state', 'cleanup');
            current.cleanup = Object.freeze({ phase, kind, reason });
            if (a.ordinal === 1) s.cleanup = current.cleanup;
            if (phase === 'unconfirmed') {
                if (a.ordinal !== 1) s.later_reason ??= 'internal_review_error';
                stop('internal_review_error', 'cleanup');
            }
            return 'recorded';
        }
        function noResponse(a: Attempt) {
            if (sealed) return 'late_ignored';
            if (!valid(a, purpose, 'header') || refusal) return 'rejected';
            const current = attempts[purpose];
            if (current.observed || current.noResponse || current.cleanup.phase !== 'not_started') return reject('invalid_state', 'header');
            current.noResponse = true;
            current.cleanup = Object.freeze({ phase: 'not_applicable', kind: null, reason: null });
            // Ordinal 1 keeps http=null; only the cleanup slot shows that no resource was ever owned.
            if (a.ordinal === 1) slots[purpose].cleanup = current.cleanup;
            else { slots[purpose].later_attempts++; slots[purpose].later_reason ??= 'upstream_unavailable'; }
            return 'recorded';
        }
        function acceptance(a: Attempt, phase: 'consuming' | 'accepted' | 'rejected') {
            if (sealed) return 'late_ignored';
            if (!valid(a, purpose, 'acceptance')) return 'rejected';
            const s = slots[purpose], c = s.acceptance;
            if (stopped || refusal || a.ordinal !== 1 || purpose !== 'release' || s.http?.classification !== 'recovery_candidate' ||
                s.cleanup.phase !== 'confirmed' || c.phase !== (phase === 'consuming' ? 'not_started' : 'consuming'))
                return reject('invalid_state', 'acceptance');
            c.phase = phase;
            if (phase === 'consuming') c.consumes = 1;
            else c.first_terminal ??= phase;
            if (phase === 'rejected') reject('invalid_state', 'acceptance');
            return 'recorded';
        }
        return Object.freeze({ header, noResponse, cleanup, acceptance });
    }
    function release(phase: 'releasing' | 'confirmed' | 'unconfirmed') {
        if (sealed) return 'late_ignored';
        if (teardown !== (phase === 'releasing' ? 'not_started' : 'releasing')) return reject('invalid_state', 'teardown');
        teardown = phase; if (phase === 'unconfirmed') stop('internal_review_error', 'teardown'); return 'recorded';
    }
    function snapshot() {
        const copySlot = (p: Purpose) => Object.freeze({ http: slots[p].http, cleanup: slots[p].cleanup,
            acceptance: Object.freeze({ ...slots[p].acceptance }), later_attempts: slots[p].later_attempts, later_reason: slots[p].later_reason });
        return Object.freeze({ scope: 'synthetic_contract_only' as const, binding, sealed, stopped, primary, local, refusal, teardown,
            slots: Object.freeze({ authentication: copySlot('authentication'), parent: copySlot('parent'), release: copySlot('release') }) });
    }
    let sealedCopy: ReturnType<typeof snapshot> | undefined;
    function seal() {
        if (sealed) return 'late_ignored';
        for (const p of purposes) {
            const current = attempts[p];
            if (current.cleanup.phase !== 'pending') continue;
            current.cleanup = Object.freeze({ phase: 'unconfirmed', kind: null, reason: 'window_ended' });
            if (current.current?.ordinal === 1) slots[p].cleanup = current.cleanup;
            else slots[p].later_reason ??= 'internal_review_error';
            stop('internal_review_error', 'cleanup');
        }
        if (teardown === 'releasing') { teardown = 'unconfirmed'; stop('internal_review_error', 'teardown'); }
        revoke(); sealed = true; sealedCopy = snapshot(); return 'sealed';
    }
    return { bind, stop, open, writers, release, seal, snapshot: () => sealedCopy ?? snapshot() };
}

/** Data-only fixtures cannot supply identities, writers, observations, callbacks or existing sessions. */
export function runSyntheticNativeDiagnosticFixture(input: unknown) {
    const invalid = () => Object.freeze({ ok: false as const, code: 'invalid_input' as const, permissions });
    if (!input || typeof input !== 'object' || types.isProxy(input)) return invalid();
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return invalid();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 1 || keys[0] !== 'scenario') return invalid();
    const d = Object.getOwnPropertyDescriptor(input, 'scenario');
    const scenarios = ['unobserved', 'duplicate_binding', 'foreign_binding', 'binding_retry', 'before_binding', 'hard_cleanup',
        'release_403', 'release_404', 'no_body', 'cancel_then_header', 'deadline_then_header', 'parent_404', 'auth_403', 'parent_403',
        'duplicate_header', 'duplicate_cleanup', 'cleanup_before_header', 'confirmed_without_pending', 'duplicate_consume',
        'accept_without_cleanup', 'wrong_purpose', 'foreign_attempt', 'copy_attempt', 'foreign_window', 'retry_after_refusal',
        'duplicate_teardown', 'pending_seal', 'pending_late_success', 'unconfirmed_late_success', 'sealed_writes',
        'later_attempts', 'duplicate_later', 'ordinal_gap', 'ordinal_limit',
        'cleanup_body_mismatch', 'cleanup_reason_mismatch', 'cleanup_kind_mismatch', 'pending_with_kind',
        'later_cleanup_failure', 'advance_pending_attempt', 'no_response_retry', 'no_response_then_header', 'later_redirect'] as const;
    if (!d || !('value' in d) || typeof d.value !== 'string' || !(scenarios as readonly string[]).includes(d.value)) return invalid();
    const scenario = d.value;
    const expected = makeBinding(), owner = construct(expected), foreignBinding = makeBinding(), foreign = construct(foreignBinding);
    foreign.bind(foreignBinding);
    const foreignAttempt = foreign.open('release')!, foreignBefore = JSON.stringify(foreign.snapshot());
    const late: string[] = [];
    let atSeal: ReturnType<typeof owner.snapshot> | undefined;
    if (scenario === 'before_binding') owner.open('release');
    owner.bind(scenario === 'foreign_binding' || scenario === 'binding_retry' ? makeBinding() : expected);
    if (scenario === 'duplicate_binding' || scenario === 'binding_retry') owner.bind(expected);
    if (!['unobserved', 'duplicate_binding', 'foreign_binding', 'binding_retry', 'before_binding'].includes(scenario)) {
        const purpose: Purpose = scenario === 'auth_403' ? 'authentication' : scenario.startsWith('parent_') ? 'parent' : 'release';
        const a = owner.open(purpose)!, w = owner.writers(purpose);
        if (scenario === 'cancel_then_header' || scenario === 'deadline_then_header')
            owner.stop(scenario === 'cancel_then_header' ? 'cancelled' : 'deadline_exceeded', 'stop');
        if (['wrong_purpose', 'foreign_attempt', 'copy_attempt', 'foreign_window', 'retry_after_refusal'].includes(scenario)) {
            const supplied = scenario === 'foreign_attempt' || scenario === 'retry_after_refusal' ? foreignAttempt :
                scenario === 'foreign_window' ? Object.freeze({ ...a, window: foreignAttempt.window }) : Object.freeze({ ...a });
            if (scenario === 'wrong_purpose') owner.writers('parent').header(a, 403, true);
            else w.header(supplied, 403, true);
            if (scenario === 'retry_after_refusal') w.header(a, 403, true);
        } else if (scenario === 'cleanup_before_header') w.cleanup(a, 'pending');
        else if (scenario === 'no_response_retry' || scenario === 'no_response_then_header') {
            w.noResponse(a);
            if (scenario === 'no_response_then_header') w.header(a, 200, false);
            else { const next = owner.open(purpose, 2)!; w.header(next, 200, false); w.cleanup(next, 'pending'); w.cleanup(next, 'confirmed', 'no_body'); }
        } else {
            const later = ['later_attempts', 'duplicate_later', 'ordinal_gap', 'ordinal_limit', 'later_cleanup_failure', 'later_redirect'].includes(scenario);
            w.header(a, later ? 503 : ['hard_cleanup', 'cancel_then_header', 'deadline_then_header'].includes(scenario) ? 401 :
                scenario === 'release_404' || scenario === 'parent_404' ? 404 : 403, scenario !== 'no_body');
            if (scenario === 'duplicate_header') w.header(a, 404, false);
            else if (scenario === 'confirmed_without_pending') w.cleanup(a, 'confirmed', 'cancelled');
            else if (scenario === 'accept_without_cleanup') w.acceptance(a, 'consuming');
            else {
                w.cleanup(a, 'pending', scenario === 'pending_with_kind' ? 'cancelled' : null);
                if (scenario === 'advance_pending_attempt') owner.open(purpose, 2);
                if (!['pending_seal', 'pending_late_success', 'advance_pending_attempt'].includes(scenario)) {
                    const bad = ['hard_cleanup', 'cancel_then_header', 'deadline_then_header', 'unconfirmed_late_success'].includes(scenario);
                    if (scenario === 'cleanup_body_mismatch') w.cleanup(a, 'confirmed', 'no_body');
                    else if (scenario === 'cleanup_reason_mismatch') w.cleanup(a, 'confirmed', 'cancelled', 'cancel_rejected');
                    else if (scenario === 'cleanup_kind_mismatch') w.cleanup(a, 'unconfirmed', 'cancelled', 'cancel_rejected');
                    else if (scenario !== 'pending_with_kind') w.cleanup(a, bad ? 'unconfirmed' : 'confirmed', bad ? null : scenario === 'no_body' ? 'no_body' : 'cancelled', bad ? 'cancel_rejected' : null);
                    if (scenario === 'duplicate_cleanup' || scenario === 'unconfirmed_late_success') w.cleanup(a, 'confirmed', 'cancelled');
                }
                if (['release_403', 'release_404', 'no_body', 'duplicate_consume', 'sealed_writes'].includes(scenario)) {
                    w.acceptance(a, 'consuming'); w.acceptance(a, 'accepted');
                    if (scenario === 'duplicate_consume') w.acceptance(a, 'consuming');
                }
                if (later) {
                    if (scenario === 'ordinal_gap') owner.open(purpose, 3);
                    else if (scenario === 'ordinal_limit') {
                        for (let n = 2; n <= 210; n++) {
                            const next = owner.open(purpose, n)!;
                            w.header(next, 200, false); w.cleanup(next, 'pending'); w.cleanup(next, 'confirmed', 'no_body');
                        }
                        owner.open(purpose, 211);
                    } else {
                        const next = owner.open(purpose, 2)!; w.header(next, scenario === 'later_redirect' ? 302 : 503, false); w.cleanup(next, 'pending');
                        if (scenario === 'later_cleanup_failure') w.cleanup(next, 'unconfirmed', null, 'cancel_rejected');
                        else if (scenario === 'duplicate_later') w.header(next, 200, false);
                        else {
                            w.cleanup(next, 'confirmed', 'no_body');
                            const third = owner.open(purpose, 3)!;
                            w.header(third, 200, false); w.cleanup(third, 'pending'); w.cleanup(third, 'confirmed', 'no_body');
                        }
                    }
                }
            }
        }
        if (['auth_403', 'parent_403', 'duplicate_teardown'].includes(scenario)) {
            owner.release('releasing'); owner.release('unconfirmed');
            if (scenario === 'duplicate_teardown') owner.release('confirmed');
        }
        if (scenario === 'pending_late_success' || scenario === 'sealed_writes') {
            owner.seal();
            atSeal = owner.snapshot();
            late.push(w.cleanup(a, 'confirmed', 'cancelled'));
            if (scenario === 'sealed_writes') late.push(w.header(a, 200, false), w.acceptance(a, 'consuming'), owner.bind(expected),
                owner.stop('cancelled', 'stop'), owner.release('confirmed'), owner.seal());
        }
    }
    owner.seal();
    atSeal ??= owner.snapshot();
    return Object.freeze({ ok: true as const, kind: 'native_diagnostic_fixture' as const, diagnostic: owner.snapshot(),
        at_seal: atSeal, late_results: Object.freeze(late), foreign_unchanged: JSON.stringify(foreign.snapshot()) === foreignBefore, permissions });
}
