/** ST-01: development-only synthetic issuer. No Response, I/O, runtime registry or continuation authority. */
import { types } from 'node:util';
import { z } from 'zod';

type Code = 'invalid_input' | 'invalid_state' | 'evidence_binding_mismatch' | 'cancelled' | 'closed' |
    'deadline_exceeded' | 'invalid_observation_time' | 'authentication_failed' | 'access_denied' | 'internal_review_error';
type Reason = 'reader_owner_unknown' | 'read_pending' | 'cancel_pending' | 'cancel_rejected' |
    'closed_pending' | 'closed_rejected' | 'lock_release_failed' | 'cleanup_deadline' | 'observation_invalid';
type Result<T> = Readonly<{ ok: true; value: T } | { ok: false; code: Code }>;
declare const brand: unique symbol;
type Binding = { readonly [brand]: 'synthetic_status_binding' };
type Attempt = { readonly [brand]: 'synthetic_status_attempt' };
type Terminal = { readonly [brand]: 'synthetic_status_terminal' };
const permissions = Object.freeze({ dispatch: false, read_body: false, retry: false, fallback: false,
    body_ack: false, release_permit: false, formal_issuance: false } as const);
const headerSchema = z.strictObject({ purpose: z.enum(['authentication', 'parent', 'release']),
    status: z.union([z.literal(401), z.literal(403), z.literal(404)]), body_present: z.boolean() });
const factsSchema = z.strictObject({ reader_owned: z.boolean(), closed_captured: z.boolean(),
    read_started: z.boolean(), read_pending: z.boolean(),
    cancel: z.enum(['not_requested', 'pending', 'fulfilled', 'rejected', 'not_applicable']),
    closed: z.enum(['pending', 'fulfilled', 'rejected', 'not_applicable']),
    release: z.enum(['not_started', 'succeeded', 'failed', 'not_applicable']) });
type Header = Readonly<z.infer<typeof headerSchema>>;
type Facts = Readonly<z.infer<typeof factsSchema>>;
type Cleanup = Readonly<{ disposition: 'confirmed' | 'unconfirmed'; kind: 'cancelled' | 'no_body' | null;
    reason: Reason | null; facts: Facts }>;
type Diagnostic = Readonly<{ scope: 'synthetic_only'; http: Header | null; cleanup: Cleanup | null;
    primary: Code | null; refusal: Code | null; eligibility: 'not_finished' | 'diagnostic_only' | 'synthetic_candidate';
    permissions: typeof permissions }>;
const ok = <T>(value: T): Result<T> => Object.freeze({ ok: true, value });
const no = (code: Code): Result<never> => Object.freeze({ ok: false, code });
const opaque = <T>(): T => Object.freeze(Object.create(null)) as T;

/** Reject accessors/proxies before schema validation; never coerce or invoke caller getters. */
function data(raw: unknown, count: number): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
    const keys = Reflect.ownKeys(raw), copy = Object.create(null);
    if (keys.length !== count) return null;
    for (const key of keys) {
        const field = Object.getOwnPropertyDescriptor(raw, key)!;
        if (typeof key !== 'string' || !Object.hasOwn(field, 'value')) return null;
        copy[key] = field.value;
    }
    return copy;
}

/** One synthetic binding represents one session/source/lease/ready-generation tuple. Not a real-session adoption API. */
export function createSyntheticStatusTerminalIssuer(input: {
    fake_io: true; remaining(): number; deadline_ms: number; cleanup_floor_ms: number;
}) {
    const fake = input.fake_io, remaining = input.remaining, deadline = input.deadline_ms, floor = input.cleanup_floor_ms;
    const binding = opaque<Binding>(), attempts = new WeakSet<object>(), terminals = new WeakMap<object, Attempt>();
    let state: 'idle' | 'issued' | 'finishing' | 'finished' | 'consuming' | 'consumed' | 'failed' = 'idle';
    let active: Attempt | null = null, header: Header | null = null, cleanup: Cleanup | null = null;
    let primary: Code | null = null, refusal: Code | null = null, last: number | undefined;
    let eligibility: Diagnostic['eligibility'] = 'not_finished', terminal: Terminal | null = null;
    let observing = false, consumed = false;

    function reject(code: Code): Result<never> {
        refusal ??= code; primary ??= code; state = 'failed'; terminal = null;
        eligibility = cleanup ? 'diagnostic_only' : 'not_finished';
        return no(primary);
    }
    function sample(): Reason | null {
        if (observing) { reject('invalid_state'); return 'observation_invalid'; }
        observing = true;
        try {
            const n = remaining();
            if (!Number.isFinite(n) || n < 0 || n > deadline || last !== undefined && n > last) {
                primary ??= 'invalid_observation_time'; return 'observation_invalid';
            }
            last = n;
            if (n <= floor) { primary ??= 'deadline_exceeded'; return 'cleanup_deadline'; }
            return null;
        } catch { primary ??= 'internal_review_error'; return 'observation_invalid'; }
        finally { observing = false; }
    }
    function lookup(handle: unknown): boolean {
        return typeof handle === 'object' && handle !== null && attempts.has(handle) && handle === active;
    }
    function hard(h: Header): Code | null {
        return h.status === 401 ? 'authentication_failed' : h.status === 403 && h.purpose !== 'release' ? 'access_denied' : null;
    }
    function reason(f: Facts, body: boolean): Reason | null {
        if (!body) return null;
        if (!f.reader_owned || !f.closed_captured) return 'reader_owner_unknown';
        if (f.read_pending) return 'read_pending';
        if (f.cancel === 'pending' || f.cancel === 'not_requested') return 'cancel_pending';
        if (f.cancel === 'rejected') return 'cancel_rejected';
        if (f.closed === 'pending') return 'closed_pending';
        if (f.closed === 'rejected') return 'closed_rejected';
        if (f.release !== 'succeeded') return 'lock_release_failed';
        return null;
    }
    function snapshot(): Diagnostic {
        return Object.freeze({ scope: 'synthetic_only', http: header, cleanup, primary, refusal, eligibility, permissions });
    }
    function issue(key: Binding, raw: unknown): Result<Attempt> {
        if (key !== binding) return reject('evidence_binding_mismatch');
        if (state !== 'idle' || primary) return reject('invalid_state');
        // Claim before schema/clock work, including callbacks that can reenter.
        state = 'issued';
        if (fake !== true || !Number.isFinite(deadline) || deadline <= 0 || deadline > 60_000 ||
            !Number.isFinite(floor) || floor < 0 || floor >= deadline) return reject('invalid_input');
        const value = data(raw, 3), parsed = headerSchema.safeParse(value);
        if (!parsed.success) return reject('invalid_input');
        const issue = sample();
        if (issue || primary || state !== 'issued') return reject(primary ?? 'invalid_state');
        header = Object.freeze(parsed.data);
        active = opaque<Attempt>(); attempts.add(active);
        primary ??= hard(header);
        return ok(active);
    }
    function finish(handle: Attempt, raw: unknown): Result<Readonly<{ diagnostic: Diagnostic; terminal: Terminal | null }>> {
        if (!lookup(handle)) return reject('evidence_binding_mismatch');
        if (state !== 'issued') return reject('invalid_state');
        state = 'finishing';
        const value = data(raw, 7), parsed = factsSchema.safeParse(value);
        if (!parsed.success || !header) return reject('invalid_input');
        const f: Facts = Object.freeze(parsed.data), body = header.body_present;
        // Inapplicable facts must not masquerade as native success or disappear on a body-present report.
        const na = [f.cancel, f.closed, f.release].filter(v => v === 'not_applicable').length;
        if (body ? na !== 0 : na !== 3 || f.reader_owned || f.closed_captured || f.read_started || f.read_pending)
            return reject('invalid_input');
        const wait = sample(), why = reason(f, body) ?? wait;
        cleanup = Object.freeze({ disposition: why ? 'unconfirmed' : 'confirmed',
            kind: why ? null : body ? 'cancelled' : 'no_body', reason: why, facts: f });
        // A callback may have stopped/reentered this owner. Preserve facts without resurrecting authority.
        const canIssue = state === 'finishing' && !primary && !why && !f.read_started && header.purpose === 'release';
        eligibility = canIssue ? 'synthetic_candidate' : 'diagnostic_only';
        if (f.read_started) refusal ??= 'invalid_state';
        if (why) primary ??= 'internal_review_error';
        if (state === 'finishing') state = 'finished';
        if (canIssue) { terminal = opaque<Terminal>(); terminals.set(terminal, handle); }
        return ok(Object.freeze({ diagnostic: snapshot(), terminal }));
    }
    function consume(key: Binding, handle: Attempt, evidence: Terminal): Result<Diagnostic> {
        if (key !== binding || !lookup(handle) || typeof evidence !== 'object' || evidence === null ||
            terminals.get(evidence) !== handle || terminal !== evidence) return reject('evidence_binding_mismatch');
        if (state !== 'finished' || consumed) return reject('invalid_state');
        consumed = true; state = 'consuming'; terminal = null; terminals.delete(evidence);
        const issue = sample();
        if (issue || primary || state !== 'consuming') return reject(primary ?? 'invalid_state');
        state = 'consumed';
        // A consumed synthetic diagnostic is still NOT an authentic HTTP proof or continuation permission.
        return ok(snapshot());
    }
    function stop(code: 'cancelled' | 'closed' = 'cancelled'): void {
        primary ??= code === 'cancelled' || code === 'closed' ? code : 'internal_review_error'; terminal = null;
        if (state !== 'issued' && state !== 'finishing') state = 'failed';
        eligibility = cleanup ? 'diagnostic_only' : 'not_finished';
    }
    return Object.freeze({ binding, issue, finish, consume, stop, diagnostics: snapshot });
}
