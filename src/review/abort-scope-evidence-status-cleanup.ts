/** ST-02/03C: injected Response/Streams only. No dispatch, public token/consumer or runtime adoption. */
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
type Header = Readonly<{ purpose: Window['purpose']; status: number; body_present: boolean }>;
type State = 'pending' | 'fulfilled' | 'rejected' | 'not_applicable';
type Facts = Readonly<{ reader_owned: boolean; closed_captured: boolean; read_started: false; read_pending: false;
    cancel: State | 'not_requested'; closed: State; release: 'not_started' | 'succeeded' | 'failed' | 'not_applicable' }>;
type Cleanup = Readonly<{ disposition: 'confirmed' | 'unconfirmed'; kind: 'cancelled' | 'no_body' | null;
    reason: Reason | null; wait_issue: Reason | null; facts: Facts }>;
type OwnerInput = { fake_io: true; deadline_ms: number; budget: { read(): { remaining_ms: number } };
    schedule(delay: number, wake: () => void): () => void };
type WPhase = 'prepared' | 'cleanup_running' | 'issuing' | 'issued' | 'consuming_pre' | 'consuming_post' | 'consumed' | 'diagnostic_only' | 'failed' | 'revoked';
type WStage = 'native' | 'issue' | 'lookup' | 'pre_guard' | 'post_guard';
type Claim = 'available' | 'started' | 'spent';
type Consumption = Readonly<{ kind: 'injected_status_consumed'; scope: 'injected_only'; purpose: 'release'; status: 403 | 404;
    body_mode: 'cancelled' | 'no_body'; permissions: typeof permissions }>;
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

function constructStatusOwner(input: OwnerInput, workflow: boolean) {
    const fake = input.fake_io, deadline = input.deadline_ms, readBudget = input.budget.read.bind(input.budget), schedule = input.schedule;
    // Created before acquisition; never derived from an externally returned diagnostic.
    const context = Object.freeze({ owner: Object.freeze({}), generation: Object.freeze({}), budget: input.budget, clock: readBudget, deadline });
    type Anchor = Readonly<{ context: typeof context; window: Window; handle: Handle; header: Header }>;
    type Record = { handle: Handle; window: Window; anchor: Anchor; header: Header; body: boolean; reader?: object; owned: boolean;
        captured: boolean; closed: State; closedWork?: Promise<void>; cancel: Facts['cancel']; release: Facts['release'];
        finishClaimed: boolean; cleanup?: Cleanup; cleanupWork?: Promise<void> };
    const handles = new WeakMap<object, Record>();
    let started = false, primary: Code | null = null, refusal: Code | null = null, current: Record | undefined;
    let http: Header | null = null;
    let last: number | undefined, sampling = false;
    let revoked = false, stopReason: 'cancelled' | 'closed' | null = null;
    let wPhase: WPhase = 'prepared', firstTerminal: 'consumed' | 'diagnostic_only' | 'failed' | 'revoked' | null = null;
    let activeStage: WStage = 'native', refusalStage: WStage | null = null;
    let issueClaim: Claim = 'available', consumeClaim: Claim = 'available';
    let liveToken: object | undefined, issuedToken: object | undefined, consumption: Consumption | null = null;
    const counts = { issued: 0, consume_attempts: 0, consumed: 0 };
    type Held = Readonly<{ context: typeof context; record: Record; anchor: Anchor; header: Header; cleanup: Cleanup; window: Window }>;
    const known = new WeakMap<object, Held>();
    const ops = { get_reader: 0, read: 0, cancel: 0, closed: 0, release_lock: 0 };
    function revokeWorkflow(terminal: 'failed' | 'revoked') {
        if (!workflow) return;
        liveToken = undefined; wPhase = terminal; firstTerminal ??= terminal;
        if (issueClaim === 'available') issueClaim = 'spent';
        if (consumeClaim === 'available') consumeClaim = 'spent';
    }
    const fail = (code: Code, stage: WStage = activeStage): Result<never> => {
        revoked = true; primary ??= code; refusal ??= code;
        if (workflow) refusalStage ??= stage;
        revokeWorkflow('failed'); return Object.freeze({ ok: false, code: primary });
    };
    function status() {
        return Object.freeze({ kind: workflow ? 'injected_status_workflow' as const : 'cleanup_diagnostic_only' as const, scope: 'injected_status_cleanup' as const,
            http, primary, refusal, revoked, stop_reason: stopReason, cleanup: current?.cleanup ?? null, operations: Object.freeze({ ...ops }), permissions,
            ...(workflow ? { workflow: Object.freeze({ scope: 'injected_only' as const, phase: wPhase, first_terminal: firstTerminal,
                refusal_stage: refusalStage, claims: Object.freeze({ issue: issueClaim, consume: consumeClaim }),
                counts: Object.freeze({ ...counts }), token_held: liveToken !== undefined, consumption, permissions }) } : {}) });
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
            if (workflow && !revoked) wPhase = 'cleanup_running';
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
            if (why) { primary ??= 'internal_review_error'; if (workflow) { revoked = true; revokeWorkflow('failed'); } }
        });
        return r.cleanupWork;
    }
    function stop(code: 'cancelled' | 'closed' = 'cancelled') {
        revoked = true;
        revokeWorkflow('revoked');
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
            const anchor: Anchor = Object.freeze({ context, window: d, handle, header: http });
            const r: Record = { handle, window: d, anchor, header: http, body: stream !== null, owned: false, captured: false,
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
    function sameRecord(r: Record): boolean {
        return current === r && handles.get(r.handle) === r && r.anchor.context === context && r.anchor.window === r.window &&
            r.anchor.handle === r.handle && r.anchor.header === r.header && r.header === http && context.budget === input.budget && context.clock === readBudget;
    }
    function eligible(r: Record): boolean {
        const c = r.cleanup;
        if (!c || c.disposition !== 'confirmed' || c.reason !== null || c.wait_issue !== null || r.header.purpose !== 'release' ||
            ![403, 404].includes(r.header.status) || ops.read !== 0 || c.facts.read_started || c.facts.read_pending || r.reader) return false;
        return r.body ? c.kind === 'cancelled' && c.facts.reader_owned && c.facts.closed_captured && c.facts.cancel === 'fulfilled' &&
            c.facts.closed === 'fulfilled' && c.facts.release === 'succeeded' && ops.get_reader === 1 && ops.closed === 1 && ops.cancel === 1 && ops.release_lock === 1 :
            c.kind === 'no_body' && !c.facts.reader_owned && !c.facts.closed_captured && c.facts.cancel === 'not_applicable' &&
            c.facts.closed === 'not_applicable' && c.facts.release === 'not_applicable' && Object.values(ops).every(n => n === 0);
    }
    function continuation(r: Record, stage: WStage): boolean {
        if (revoked || primary || refusal) { fail(primary ?? refusal ?? 'invalid_state', stage); return false; }
        if (!sameRecord(r)) { fail('evidence_binding_mismatch', stage); return false; }
        if (!eligible(r)) { fail('invalid_state', stage); return false; }
        return true;
    }
    function consumeFixed(r: Record, token: object) {
        const held = known.get(token);
        activeStage = 'lookup';
        if (!held || token !== issuedToken || held.context !== context || held.record !== r || held.anchor !== r.anchor ||
            held.header !== r.header || held.cleanup !== r.cleanup || held.window !== r.window || !sameRecord(r)) {
            fail('evidence_binding_mismatch'); activeStage = 'native'; return;
        }
        if (consumeClaim !== 'available') { fail('invalid_state'); activeStage = 'native'; return; }
        consumeClaim = 'started'; liveToken = undefined; counts.consume_attempts++;
        try {
            activeStage = 'pre_guard'; wPhase = 'consuming_pre';
            if (!continuation(r, 'pre_guard')) return;
            const pre = sample(r.window.cleanup_floor_ms);
            if (pre.issue || !continuation(r, 'pre_guard') || consumeClaim !== 'started' || wPhase !== 'consuming_pre') {
                fail(primary ?? 'invalid_state', 'pre_guard'); return;
            }
            activeStage = 'post_guard'; wPhase = 'consuming_post';
            const post = sample(r.window.cleanup_floor_ms);
            if (post.issue || !continuation(r, 'post_guard') || consumeClaim !== 'started' || wPhase !== 'consuming_post') {
                fail(primary ?? 'invalid_state', 'post_guard'); return;
            }
            // The fixed continuation commits without an intervening await/caller getter/callback.
            consumption = Object.freeze({ kind: 'injected_status_consumed', scope: 'injected_only', purpose: 'release',
                status: r.header.status as 403 | 404, body_mode: r.body ? 'cancelled' : 'no_body', permissions });
            counts.consumed++; wPhase = 'consumed'; firstTerminal ??= 'consumed';
        } finally { consumeClaim = 'spent'; activeStage = 'native'; }
    }
    function issueAndConsume(r: Record) {
        if (!workflow || revoked) return;
        if (issueClaim !== 'available') { fail('invalid_state', 'issue'); return; }
        issueClaim = 'started'; activeStage = 'issue'; wPhase = 'issuing';
        let token: object | undefined;
        try {
            if (!sameRecord(r)) { fail('evidence_binding_mismatch'); return; }
            if (primary || refusal || !eligible(r)) {
                wPhase = 'diagnostic_only'; firstTerminal ??= 'diagnostic_only'; consumeClaim = 'spent'; return;
            }
            const at = sample(r.window.cleanup_floor_ms);
            if (at.issue || !continuation(r, 'issue') || issueClaim !== 'started' || wPhase !== 'issuing') {
                fail(primary ?? 'invalid_state', 'issue'); return;
            }
            const minted: object = Object.freeze(Object.create(null)); token = minted; issuedToken = liveToken = minted;
            known.set(minted, Object.freeze({ context, record: r, anchor: r.anchor, header: r.header, cleanup: r.cleanup!, window: r.window }));
            counts.issued++; wPhase = 'issued';
        } finally { issueClaim = 'spent'; activeStage = 'native'; }
        if (token) consumeFixed(r, token);
    }
    async function finish(handle: Handle) {
        const r = typeof handle === 'object' && handle !== null ? handles.get(handle) : undefined;
        if (!r || r !== current) { fail('evidence_binding_mismatch'); if (current) await clean(current); return fail('evidence_binding_mismatch'); }
        if (r.finishClaimed) { fail('invalid_state'); await clean(r); return fail('invalid_state'); }
        r.finishClaimed = true;
        await clean(r);
        issueAndConsume(r);
        return ok(status());
    }
    async function close() { stop('closed'); if (current) await clean(current); return status(); }
    return Object.freeze({ acquire, finish, stop, close, diagnostics: status });
}

/** Legacy ST-02 entry retains its diagnostic-only behavior. */
export function createInjectedStatusCleanupOwner(input: OwnerInput) { return constructStatusOwner(input, false); }

/** ST-03C fixed constructor. Only fake I/O dependencies, never caller-supplied records/consumers/sessions. */
export function createInjectedStatusWorkflowOwner(raw: OwnerInput) {
    const data = (v: unknown, keys: readonly string[]): { [key: string]: unknown } | null => {
        if (!v || typeof v !== 'object' || types.isProxy(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return null;
        const actual = Reflect.ownKeys(v); if (actual.length !== keys.length || actual.some(k => typeof k !== 'string' || !keys.includes(k))) return null;
        const copy = Object.create(null);
        for (const key of keys) { const d = Object.getOwnPropertyDescriptor(v, key)!; if (!Object.hasOwn(d, 'value')) return null; copy[key] = d.value; }
        return copy;
    };
    const d = data(raw, ['fake_io', 'deadline_ms', 'budget', 'schedule']), b = data(d?.budget, ['read']);
    if (!d || !b || d.fake_io !== true || typeof d.schedule !== 'function' || typeof b.read !== 'function')
        return constructStatusOwner({ fake_io: true, deadline_ms: 0, budget: { read: () => ({ remaining_ms: 0 }) }, schedule: () => () => {} }, true);
    // Preserve the original readonly budget identity and pin its method once in the same constructor.
    return constructStatusOwner({ fake_io: true, deadline_ms: d.deadline_ms as number, budget: d.budget as OwnerInput['budget'], schedule: d.schedule as OwnerInput['schedule'] }, true);
}
