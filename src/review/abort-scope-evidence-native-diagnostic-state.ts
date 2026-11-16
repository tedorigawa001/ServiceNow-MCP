/** BG01: fresh, package-excluded diagnostic state. No runtime or native dependencies. */
export type Purpose = 'authentication' | 'parent' | 'release';
export type Stage = 'binding' | 'header' | 'cleanup' | 'acceptance' | 'stop' | 'teardown' | 'seal';
export type Code = 'invalid_state' | 'evidence_binding_mismatch' | 'authentication_failed' | 'access_denied' |
    'not_found_or_not_visible' | 'internal_review_error' | 'cancelled' | 'deadline_exceeded' | 'upstream_unavailable' | 'invalid_response' |
    'closed' | 'invalid_input' | 'invalid_observation_time' | 'receive_budget_exceeded' | 'request_budget_exceeded' | 'phase_deadline_exceeded';
export type NativeReason = 'reader_owner_unknown' | 'cancel_pending' | 'cancel_rejected' | 'closed_pending' | 'closed_rejected' |
    'lock_release_failed' | 'cleanup_deadline' | 'observation_invalid';
export type NativeFacts = Readonly<{ reader_owned: boolean; closed_captured: boolean; read_started: false; read_pending: false;
    cancel: 'not_requested' | 'pending' | 'fulfilled' | 'rejected' | 'not_applicable';
    closed: 'pending' | 'fulfilled' | 'rejected' | 'not_applicable'; release: 'not_started' | 'succeeded' | 'failed' | 'not_applicable' }>;
export type NativeCleanup = Readonly<{ disposition: 'confirmed' | 'unconfirmed'; kind: 'cancelled' | 'no_body' | null;
    reason: NativeReason | null; wait_issue: NativeReason | null; facts: NativeFacts }>;
type Reason = Readonly<{ code: Code; stage: Stage }>;
export type Binding = Readonly<{ run: object; session: object; snapshot: object; lease: object; core: object;
    source: object; constructor: object; transport: object }>;
export type Attempt = Readonly<{ binding: Binding; purpose: Purpose; ordinal: number; window: object }>;
export type Http = Readonly<{ status: number; body_present: boolean; classification: 'hard' | 'local' | 'recovery_candidate' | 'other' }>;
type Cleanup = Readonly<{ phase: 'not_started' | 'pending' | 'confirmed' | 'unconfirmed' | 'not_applicable';
    kind: 'cancelled' | 'no_body' | null; reason: NativeReason | 'window_ended' | null; native?: NativeCleanup }>;
type Acceptance = { phase: 'not_started' | 'consuming' | 'accepted' | 'rejected' | 'revoked';
    first_terminal: 'accepted' | 'rejected' | 'revoked' | null; consumes: 0 | 1 };
type Slot = { http: Http | null; cleanup: Cleanup; acceptance: Acceptance; later_attempts: number; later_reason: Code | null };
const purposes = ['authentication', 'parent', 'release'] as const;
export const permissions = Object.freeze({ dispatch: false, read_body: false, retry: false, fallback: false,
    body_ack: false, release_permit: false, formal_issuance: false } as const);
const id = (): object => Object.freeze(Object.create(null));
const makeBinding = (): Binding => Object.freeze({ run: id(), session: id(), snapshot: id(), lease: id(), core: id(),
    source: id(), constructor: id(), transport: id() });
const emptyCleanup = (): Cleanup => Object.freeze({ phase: 'not_started', kind: null, reason: null });
const emptySlot = (): Slot => ({ http: null, cleanup: emptyCleanup(), acceptance: { phase: 'not_started', first_terminal: null, consumes: 0 },
    later_attempts: 0, later_reason: null });

/** Every owner keeps its own writers and identity state; no existing binding can be adopted. */
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
            reason: Cleanup['reason'] = null, native?: NativeCleanup) {
            if (sealed) return 'late_ignored';
            if (!valid(a, purpose, 'cleanup')) return 'rejected';
            const s = slots[purpose], current = attempts[purpose];
            if (!current.observed || current.cleanup.phase !== (phase === 'pending' ? 'not_started' : 'pending') ||
                phase === 'pending' && (kind !== null || reason !== null) ||
                phase === 'confirmed' && (kind !== (current.body ? 'cancelled' : 'no_body') || reason !== null) ||
                phase === 'unconfirmed' && (kind !== null || reason === null)) return reject('invalid_state', 'cleanup');
            current.cleanup = Object.freeze({ phase, kind, reason, ...(native ? { native } : {}) });
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
    return { bind, stop, reject, open, writers, release, seal, snapshot: () => sealedCopy ?? snapshot() };
}

/** Internal creator: both identities and writer ports originate here, never in a caller. */
export function createNativeDiagnosticState() {
    const binding = makeBinding();
    return Object.freeze({ binding, owner: construct(binding) });
}
