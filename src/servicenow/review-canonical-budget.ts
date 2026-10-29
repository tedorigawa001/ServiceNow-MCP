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
    if (!input || typeof input !== 'object' || Reflect.ownKeys(input).some(k => k !== 'clock' && k !== 'limits') || !input.clock || ![Object.prototype, null].includes(Object.getPrototypeOf(input.clock)) || Reflect.ownKeys(input.clock).some(k => k !== 'remainingMs'))
        throw new CanonicalBudgetError('invalid_input');
    const operation = Object.getOwnPropertyDescriptor(input.clock, 'remainingMs')?.value;
    if (typeof operation !== 'function' || input.limits !== undefined && (!input.limits || typeof input.limits !== 'object' || Array.isArray(input.limits) || Reflect.ownKeys(input.limits).some(k => typeof k !== 'string' || !Object.hasOwn(ceilings, k))))
        throw new CanonicalBudgetError('invalid_input');
    const limits = { ...ceilings, ...input.limits }, clock = Function.prototype.bind.call(operation, input.clock) as () => number;
    for (const [key, value] of Object.entries(limits))
        if (!Object.hasOwn(ceilings, key) || !Number.isSafeInteger(value) || value < 1 || value > ceilings[key as keyof Limits])
            throw new CanonicalBudgetError('invalid_input');
    let requests = 0, received = 0, payload = 0, closed = false, last: number | undefined, observing = false;
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
    function check() { read(); if (primary)
        throw new CanonicalBudgetError(primary.public); if (closed)
        throw new CanonicalBudgetError('closed'); }
    function sum(before: number, n: number) { if (!Number.isSafeInteger(n) || n < 0 || !Number.isSafeInteger(before + n))
        return fail('invalid_input'); return before + n; }
    const writer = Object.freeze({
        dispatch(final = false) { check(); if (typeof final !== 'boolean')
            return fail('invalid_input'); if (requests >= limits.requests - (final ? 0 : 4))
            throw new CanonicalBudgetError('request_budget_exceeded'); requests++; },
        chunk(n: number) { check(); received = sum(received, n); if (received > limits.totalBytes)
            return fail('receive_budget_exceeded'); },
        payload(value: string) { check(); if (typeof value !== 'string')
            return fail('invalid_input'); const n = Buffer.byteLength(value, 'utf8'); payload = sum(payload, n); if (payload > limits.totalPayloadBytes)
            return fail('payload_budget_exceeded'); if (n > limits.payloadBytes)
            throw new CanonicalBudgetError('payload_limit'); },
        stop,
        close() { closed = true; },
    });
    const view = Object.freeze({ stats, lease: Object.freeze({ read }), failure: () => primary?.public ?? null, diagnostic: () => Object.freeze({ primary, closed, evidence_issuance: 'disabled' as const }) });
    return Object.freeze({ writer, view });
}
