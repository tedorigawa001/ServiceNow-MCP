/** ST-02: injected Response/Streams only. Diagnostic-only; no dispatch, body reader API or runtime adoption. */
import { types } from 'node:util';
import { ReadableStream as Stream, ReadableStreamDefaultReader as Reader } from 'node:stream/web';
import { z } from 'zod';

type Code = 'invalid_input' | 'invalid_state' | 'invalid_response' | 'evidence_binding_mismatch' |
    'authentication_failed' | 'access_denied' | 'internal_review_error' | 'invalid_observation_time' |
    'deadline_exceeded' | 'cancelled' | 'closed';
type Reason = 'reader_owner_unknown' | 'cancel_pending' | 'cancel_rejected' | 'closed_pending' |
    'closed_rejected' | 'lock_release_failed' | 'cleanup_deadline' | 'observation_invalid';
type Result<T> = Readonly<{ ok: true; value: T } | { ok: false; code: Code }>;
declare const brand: unique symbol;
type Handle = { readonly [brand]: 'injected_status_cleanup_attempt' };
const shape = z.strictObject({ purpose: z.enum(['authentication', 'parent', 'release']), ordinal: z.literal(1),
    window_origin_ms: z.number().finite().nonnegative(), cleanup_floor_ms: z.number().finite().nonnegative() });
type Window = Readonly<z.infer<typeof shape>>;
type State = 'pending' | 'fulfilled' | 'rejected' | 'not_applicable';
type Facts = Readonly<{ reader_owned: boolean; closed_captured: boolean; read_started: false; read_pending: false;
    cancel: State | 'not_requested'; closed: State; release: 'not_started' | 'succeeded' | 'failed' | 'not_applicable' }>;
type Cleanup = Readonly<{ disposition: 'confirmed' | 'unconfirmed'; kind: 'cancelled' | 'no_body' | null;
    reason: Reason | null; wait_issue: Reason | null; facts: Facts }>;
const permissions = Object.freeze({ dispatch: false, read_body: false, retry: false, fallback: false,
    body_ack: false, release_permit: false, formal_issuance: false } as const);
const P = Promise, then = P.prototype.then, race = P.race, all = P.all, resolved = P.resolve;
// Pinned like NA-02: a later global Promise patch must not shorten or replace the cleanup wait.
const done = (): Promise<void> => Reflect.apply(resolved, P, []) as Promise<void>;
const after = <T, U>(p: Promise<T>, next: (value: T) => U): Promise<Awaited<U>> => Reflect.apply(then, p, [next]) as Promise<Awaited<U>>;
// This isolated development lane does not register/adopt real sessions or share fixture identity tables.
const responses = new WeakSet<object>(), streams = new WeakSet<object>();
const native = (() => {
    try {
        const rp = Response.prototype, sp = Stream.prototype, dp = Reader.prototype;
        const getter = (p: object, k: string) => Object.getOwnPropertyDescriptor(p, k)?.get;
        const v = { rp, sp, dp, status: getter(rp, 'status'), body: getter(rp, 'body'), used: getter(rp, 'bodyUsed'),
            locked: getter(sp, 'locked'), getReader: sp.getReader, closed: getter(dp, 'closed'), cancel: dp.cancel, release: dp.releaseLock };
        return Object.values(v).every(x => x !== undefined) ? v : null;
    } catch { return null; }
})();
const ok = <T>(value: T): Result<T> => Object.freeze({ ok: true, value });
function observe(p: unknown, settled: (success: boolean) => void): Promise<void> {
    if (types.isProxy(p) || !types.isPromise(p) || Object.getPrototypeOf(p) !== P.prototype || Object.hasOwn(p, 'constructor') ||
        Object.getOwnPropertyDescriptor(P.prototype, 'constructor')?.value !== P) throw Error('invalid_promise');
    return new P(resolve => { Reflect.apply(then, p, [() => { settled(true); resolve(); }, () => { settled(false); resolve(); }]); });
}
function descriptor(raw: unknown): Window | null {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
    const keys = Reflect.ownKeys(raw), copy = Object.create(null);
    if (keys.length !== 4) return null;
    for (const key of keys) {
        const d = Object.getOwnPropertyDescriptor(raw, key)!;
        if (typeof key !== 'string' || !Object.hasOwn(d, 'value')) return null;
        copy[key] = d.value;
    }
    const parsed = shape.safeParse(copy);
    return parsed.success ? Object.freeze(parsed.data) : null;
}

export function createInjectedStatusCleanupOwner(input: {
    fake_io: true; deadline_ms: number; budget: { read(): { remaining_ms: number } };
    schedule(delay: number, wake: () => void): () => void;
}) {
    const fake = input.fake_io, deadline = input.deadline_ms, readBudget = input.budget.read.bind(input.budget), schedule = input.schedule;
    type Record = { handle: Handle; window: Window; body: boolean; reader?: object; owned: boolean;
        captured: boolean; closed: State; closedWork?: Promise<void>; cancel: Facts['cancel']; release: Facts['release'];
        finishClaimed: boolean; cleanup?: Cleanup; cleanupWork?: Promise<void> };
    const handles = new WeakMap<object, Record>();
    let started = false, primary: Code | null = null, refusal: Code | null = null, current: Record | undefined;
    let http: Readonly<{ purpose: Window['purpose']; status: number; body_present: boolean }> | null = null;
    let last: number | undefined, sampling = false;
    let revoked = false, stopReason: 'cancelled' | 'closed' | null = null;
    const ops = { get_reader: 0, read: 0, cancel: 0, closed: 0, release_lock: 0 };
    const fail = (code: Code): Result<never> => { revoked = true; primary ??= code; refusal ??= code; return Object.freeze({ ok: false, code: primary }); };
    function status() {
        return Object.freeze({ kind: 'cleanup_diagnostic_only' as const, scope: 'injected_status_cleanup' as const,
            http, primary, refusal, revoked, stop_reason: stopReason, cleanup: current?.cleanup ?? null, operations: Object.freeze({ ...ops }), permissions });
    }
    function sample(floor: number): { n: number; issue: Reason | null } {
        if (sampling) { fail('invalid_state'); return { n: 0, issue: 'observation_invalid' }; }
        sampling = true;
        try {
            const n = readBudget().remaining_ms;
            if (!Number.isFinite(n) || n < 0 || n > deadline || last !== undefined && n > last) {
                primary ??= 'invalid_observation_time'; return { n: 0, issue: 'observation_invalid' };
            }
            last = n;
            if (n <= floor) { primary ??= 'deadline_exceeded'; return { n, issue: 'cleanup_deadline' }; }
            return { n, issue: null };
        } catch { primary ??= 'internal_review_error'; return { n: 0, issue: 'observation_invalid' }; }
        finally { sampling = false; }
    }
    async function bounded(work: Promise<void>, floor: number): Promise<Reason | null> {
        const start = sample(floor); if (start.issue) return start.issue;
        let dispose: (() => void) | undefined, issue: Reason | null = null;
        try {
            const boundary = new P<Reason>(resolve => { dispose = schedule(start.n - floor, () => resolve('cleanup_deadline')); });
            issue = await Reflect.apply(race, P, [[after(work, () => null), boundary]]) as Reason | null;
        } catch { issue = 'observation_invalid'; }
        finally { try { dispose?.(); } catch { issue ??= 'observation_invalid'; } }
        const end = sample(floor);
        return issue ?? end.issue;
    }
    function clean(r: Record): Promise<void> {
        if (r.cleanupWork) return r.cleanupWork;
        // Install the join point before any clock/native/scheduler callback can reenter.
        r.cleanupWork = after(done(), async () => {
            let issue = sample(r.window.cleanup_floor_ms).issue;
            let cancelling = done();
            if (r.reader && r.cancel === 'not_requested') {
                r.cancel = 'pending'; ops.cancel++;
                try { cancelling = observe(Reflect.apply(native!.cancel, r.reader, []), yes => { r.cancel = yes ? 'fulfilled' : 'rejected'; }); }
                catch { r.cancel = 'rejected'; }
            }
            if (r.body && r.reader && !issue)
                issue = await bounded(after(Reflect.apply(all, P, [[r.closedWork ?? done(), cancelling]]) as Promise<unknown>, () => {}), r.window.cleanup_floor_ms);
            // releaseLock can change closed. Freeze its observed state BEFORE releasing this same reader.
            const before = { reader_owned: r.owned, closed_captured: r.captured, read_started: false as const, read_pending: false as const,
                cancel: r.cancel, closed: r.closed };
            if (r.reader && r.release === 'not_started') {
                ops.release_lock++; r.release = 'failed';
                try { Reflect.apply(native!.release, r.reader, []); r.release = 'succeeded'; }
                catch { /* one attempt only; retain failure, never echo exception */ }
                r.reader = undefined;
            }
            const post = sample(r.window.cleanup_floor_ms).issue;
            issue ??= post;
            const facts: Facts = Object.freeze({ ...before, release: r.release });
            const why: Reason | null = !r.body ? issue : !before.reader_owned || !before.closed_captured ? 'reader_owner_unknown' :
                before.cancel === 'pending' || before.cancel === 'not_requested' ? 'cancel_pending' : before.cancel === 'rejected' ? 'cancel_rejected' :
                before.closed !== 'fulfilled' ? before.closed === 'rejected' ? 'closed_rejected' : 'closed_pending' :
                r.release !== 'succeeded' ? 'lock_release_failed' : issue;
            r.cleanup = Object.freeze({ disposition: why ? 'unconfirmed' : 'confirmed', kind: why ? null : r.body ? 'cancelled' : 'no_body',
                reason: why, wait_issue: issue, facts });
            if (why) primary ??= 'internal_review_error';
        });
        return r.cleanupWork;
    }
    function stop(code: 'cancelled' | 'closed' = 'cancelled') {
        revoked = true;
        if (code === 'cancelled' || code === 'closed') stopReason ??= code;
        primary ??= code === 'cancelled' || code === 'closed' ? code : 'internal_review_error';
        if (current) void clean(current);
    }
    async function acquire(response: unknown, raw: unknown): Promise<Result<Readonly<{ handle: Handle; status: number }>>> {
        if (started || primary || revoked) { fail('invalid_state'); if (current) await clean(current); return fail('invalid_state'); }
        started = true;
        const d = descriptor(raw);
        if (fake !== true || !native || !d || !Number.isInteger(deadline) || deadline < 1 || deadline > 60_000 ||
            d.window_origin_ms > deadline || d.window_origin_ms - d.cleanup_floor_ms <= 0 ||
            d.window_origin_ms - d.cleanup_floor_ms > 10_000 || d.cleanup_floor_ms < Math.min(10_000, deadline / 6)) return fail('invalid_input');
        const at = sample(d.cleanup_floor_ms);
        if (at.issue || primary) return fail(primary ?? 'invalid_state');
        if (at.n > d.window_origin_ms) return fail('invalid_input');
        try {
            if (!response || typeof response !== 'object' || types.isProxy(response) || Object.getPrototypeOf(response) !== native.rp || responses.has(response)) return fail('invalid_response');
            const statusCode = Reflect.apply(native.status!, response, []) as number;
            const used = Reflect.apply(native.used!, response, []) as boolean, stream = Reflect.apply(native.body!, response, []) as object | null;
            if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599 || used) return fail('invalid_response');
            responses.add(response);
            http = Object.freeze({ purpose: d.purpose, status: statusCode, body_present: stream !== null });
            if (statusCode === 401) primary ??= 'authentication_failed';
            else if (statusCode === 403 && d.purpose !== 'release') primary ??= 'access_denied';
            const handle = Object.freeze(Object.create(null)) as Handle;
            const r: Record = { handle, window: d, body: stream !== null, owned: false, captured: false,
                closed: stream === null ? 'not_applicable' : 'pending', cancel: stream === null ? 'not_applicable' : 'not_requested',
                release: stream === null ? 'not_applicable' : 'not_started', finishClaimed: false };
            current = r; handles.set(handle, r);
            if (stream !== null) {
                if (!stream || types.isProxy(stream) || Object.getPrototypeOf(stream) !== native.sp || streams.has(stream) || Reflect.apply(native.locked!, stream, [])) {
                    fail('invalid_response'); await clean(r); return fail('invalid_response');
                }
                streams.add(stream); ops.get_reader++;
                r.reader = Reflect.apply(native.getReader, stream, []) as object;
                if (!r.reader || types.isProxy(r.reader) || Object.getPrototypeOf(r.reader) !== native.dp) throw Error('reader_invalid');
                r.owned = true; ops.closed++;
                r.closedWork = observe(Reflect.apply(native.closed!, r.reader, []), yes => { r.closed = yes ? 'fulfilled' : 'rejected'; });
                r.captured = true;
            }
            if (![401, 403, 404].includes(statusCode)) { fail('invalid_response'); await clean(r); return fail('invalid_response'); }
            const after = sample(d.cleanup_floor_ms);
            // Hard HTTP is diagnostic-only, but its owned reader still needs finish/stop cleanup.
            if (after.issue || revoked || refusal || primary && primary !== 'authentication_failed' && primary !== 'access_denied') {
                await clean(r); return fail(primary ?? 'invalid_state');
            }
            return ok(Object.freeze({ handle, status: statusCode }));
        } catch { fail('invalid_response'); if (current) await clean(current); return fail('invalid_response'); }
    }
    async function finish(handle: Handle) {
        const r = typeof handle === 'object' && handle !== null ? handles.get(handle) : undefined;
        if (!r || r !== current) { fail('evidence_binding_mismatch'); if (current) await clean(current); return fail('evidence_binding_mismatch'); }
        if (r.finishClaimed) { fail('invalid_state'); await clean(r); return fail('invalid_state'); }
        r.finishClaimed = true;
        await clean(r);
        return ok(status());
    }
    async function close() { stop('closed'); if (current) await clean(current); return status(); }
    return Object.freeze({ acquire, finish, stop, close, diagnostics: status });
}
