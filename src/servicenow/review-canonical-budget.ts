/** CM-01 internal state only. No session adoption, transport, activation or fixture registry. */
import type { ReadFailureCode } from './bounded-read.js';
type InternalCode = ReadFailureCode | 'invalid_state' | 'invalid_observation_time' | 'evidence_binding_mismatch';
const ceilings = Object.freeze({ requests: 210, totalBytes: 16777216, payloadBytes: 2097152, totalPayloadBytes: 8388608, deadlineMs: 60000 });
type Limits = {
    [K in keyof typeof ceilings]: number;
};
const reasons = new Set<string>(['invalid_input', 'authentication_failed', 'access_denied', 'not_found_or_not_visible', 'upstream_unavailable', 'deadline_exceeded', 'receive_budget_exceeded', 'request_budget_exceeded', 'payload_budget_exceeded', 'payload_limit', 'invalid_response', 'review_busy', 'cancelled', 'closed', 'changed_during_review', 'release_not_admitted', 'config_invalid', 'phase_deadline_exceeded', 'candidate_filter_violation', 'internal_review_error', 'invalid_state', 'invalid_observation_time', 'evidence_binding_mismatch']);
export class CanonicalBudgetError extends Error {
    constructor(readonly code: ReadFailureCode) { super(code); }
}
/** Trusted constructor dependencies. Never receives a session, snapshot, initial counters or update callbacks. */
export function createCanonicalReviewBudget(input: {
    clock: {
        remainingMs(): number;
    };
    limits?: Partial<Limits>;
}) {
    if (!input || typeof input !== 'object' || Reflect.ownKeys(input).some(k => k !== 'clock' && k !== 'limits'))
        throw new CanonicalBudgetError('invalid_input');
    // Read each dependency once as a data property: a getter could swap it after validation.
    const field = (key: 'clock' | 'limits'): unknown => {
        const d = Object.getOwnPropertyDescriptor(input, key);
        if (d && !Object.hasOwn(d, 'value'))
            throw new CanonicalBudgetError('invalid_input');
        return d?.value;
    };
    const source = field('clock') as {
        remainingMs(): number;
    } | undefined, reduced = field('limits') as Partial<Limits> | undefined;
    if (!source || typeof source !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(source)) || Reflect.ownKeys(source).some(k => k !== 'remainingMs'))
        throw new CanonicalBudgetError('invalid_input');
    const operation = Object.getOwnPropertyDescriptor(source, 'remainingMs')?.value;
    if (typeof operation !== 'function' || reduced !== undefined && (!reduced || typeof reduced !== 'object' || Array.isArray(reduced) || Reflect.ownKeys(reduced).some(k => typeof k !== 'string' || !Object.hasOwn(ceilings, k))))
        throw new CanonicalBudgetError('invalid_input');
    const limits = { ...ceilings, ...reduced }, clock = Function.prototype.bind.call(operation, source) as () => number;
    for (const [key, value] of Object.entries(limits))
        if (!Object.hasOwn(ceilings, key) || !Number.isSafeInteger(value) || value < 1 || value > ceilings[key as keyof Limits])
            throw new CanonicalBudgetError('invalid_input');
    let requests = 0, received = 0, payload = 0, closed = false, last: number | undefined, observing = false;
    let legacyStarted = false, claim: 'unclaimed' | 'consuming' | 'claimed' | 'failed' = 'unclaimed';
    let reservation: 'unclaimed' | 'reserving' | 'reserved' | 'failed' | 'released' = 'unclaimed';
    let primary: Readonly<{
        internal: InternalCode;
        public: ReadFailureCode;
    }> | null = null;
    const stats = () => Object.freeze({ requests, received_bytes: received, payload_bytes: payload });
    const publicCode = (code: InternalCode): ReadFailureCode => code === 'invalid_state' || code === 'invalid_observation_time' || code === 'evidence_binding_mismatch' ? 'internal_review_error' : code;
    function stop(raw: unknown) { const code: InternalCode = typeof raw === 'string' && reasons.has(raw) ? raw as InternalCode : 'internal_review_error'; primary ??= Object.freeze({ internal: code, public: publicCode(code) }); }
    function fail(code: InternalCode): never { stop(code); throw new CanonicalBudgetError(primary!.public); }
    function read() {
        if (observing)
            return fail('invalid_state');
        observing = true;
        try {
            let remaining: number;
            try {
                remaining = clock();
            }
            catch {
                return fail('internal_review_error');
            }
            if (!Number.isFinite(remaining) || remaining < 0 || remaining > limits.deadlineMs || last !== undefined && remaining > last)
                return fail('invalid_observation_time');
            last = remaining;
            if (remaining === 0)
                stop('deadline_exceeded');
            return Object.freeze({ ...stats(), remaining_ms: remaining });
        }
        finally {
            observing = false;
        }
    }
    function check() {
        const sampled = read();
        if (primary)
            throw new CanonicalBudgetError(primary.public);
        if (closed)
            throw new CanonicalBudgetError('closed');
        return sampled.remaining_ms;
    }
    function sum(before: number, n: number) {
        if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(before + n))
            return fail('invalid_input');
        return before + n;
    }
    function dispatchAt(floor: number) {
        if (!Number.isFinite(floor) || floor < 0 || floor >= limits.deadlineMs)
            return fail('invalid_input');
        const remaining = check();
        if (remaining <= floor)
            throw new CanonicalBudgetError('upstream_unavailable');
        if (requests >= limits.requests - 4)
            throw new CanonicalBudgetError('request_budget_exceeded');
        if (received >= limits.totalBytes)
            return fail('receive_budget_exceeded');
        requests++;
    }
    function dispatch(final = false) {
        check();
        if (typeof final !== 'boolean')
            return fail('invalid_input');
        if (requests >= limits.requests - (final ? 0 : 4))
            throw new CanonicalBudgetError('request_budget_exceeded');
        requests++;
    }
    function chunk(n: number) {
        check();
        received = sum(received, n);
        if (received > limits.totalBytes)
            return fail('receive_budget_exceeded');
    }
    function chargePayload(value: string) {
        check();
        if (typeof value !== 'string')
            return fail('invalid_input');
        const n = Buffer.byteLength(value, 'utf8');
        payload = sum(payload, n);
        if (payload > limits.totalPayloadBytes)
            return fail('payload_budget_exceeded');
        if (n > limits.payloadBytes)
            throw new CanonicalBudgetError('payload_limit');
    }
    function selectLegacy() { if (claim !== 'unclaimed')
        return fail('invalid_state'); legacyStarted = true; }
    const accounting = Object.freeze({
        reserve() {
            if (claim !== 'claimed' || reservation !== 'unclaimed')
                return fail('invalid_state');
            reservation = 'reserving';
            try {
                check();
                if (requests || received || payload)
                    return fail('invalid_state');
                reservation = 'reserved';
            }
            catch (error) {
                reservation = 'failed';
                if (error instanceof CanonicalBudgetError) {
                    stop(error.code);
                    throw error;
                }
                return fail('internal_review_error');
            }
        },
        reserved: () => reservation === 'reserved' ? 4 : 0,
        dispatch(floor?: number) { if (claim !== 'claimed' || reservation !== 'reserved')
            return fail('invalid_state'); if (floor === undefined)
            dispatch();
        else
            dispatchAt(floor); },
        chunk(n: number) { if (claim !== 'claimed' || reservation !== 'reserved')
            return fail('invalid_state'); chunk(n); },
        release() { if (reservation === 'released')
            return; reservation = 'released'; closed = true; },
    });
    const construction = Object.freeze({
        takeBootstrapAccounting(...args: never[]) {
            if (claim !== 'unclaimed') {
                claim = 'failed';
                return fail('invalid_state');
            }
            claim = 'consuming';
            try {
                if (args.length)
                    return fail('invalid_input');
                if (limits.requests < 4)
                    return fail('invalid_input');
                if (legacyStarted)
                    return fail('invalid_state');
                check();
                if (requests || received || payload)
                    return fail('invalid_state');
                claim = 'claimed';
                return accounting;
            }
            catch (error) {
                claim = 'failed';
                if (error instanceof CanonicalBudgetError) {
                    stop(error.code);
                    throw error;
                }
                return fail('internal_review_error');
            }
        },
        status: () => Object.freeze({ claim, reservation, reserved: accounting.reserved() }),
    });
    const writer = Object.freeze({
        dispatchAt(floor: number) { selectLegacy(); dispatchAt(floor); },
        dispatch(final = false) { selectLegacy(); dispatch(final); },
        chunk(n: number) { selectLegacy(); chunk(n); },
        payload(value: string) { selectLegacy(); chargePayload(value); },
        stop,
        close() { closed = true; },
    });
    const view = Object.freeze({ stats, lease: Object.freeze({ read }), failure: () => primary?.public ?? null, diagnostic: () => Object.freeze({ primary, closed, evidence_issuance: 'disabled' as const }) });
    return Object.freeze({ writer, view, construction });
}
