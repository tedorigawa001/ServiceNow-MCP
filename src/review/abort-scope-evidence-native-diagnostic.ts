/** ND-01: pure, package-excluded diagnostic model. No runtime registration or native operations. */
import { types } from 'node:util';
import { ReadableStream as Stream, ReadableStreamDefaultReader as Reader } from 'node:stream/web';

type Purpose = 'authentication' | 'parent' | 'release';
type Stage = 'binding' | 'header' | 'cleanup' | 'acceptance' | 'stop' | 'teardown' | 'seal';
type Code = 'invalid_state' | 'evidence_binding_mismatch' | 'authentication_failed' | 'access_denied' |
    'not_found_or_not_visible' | 'internal_review_error' | 'cancelled' | 'deadline_exceeded' | 'upstream_unavailable' | 'invalid_response' |
    'closed' | 'invalid_input' | 'invalid_observation_time';
type NativeReason = 'reader_owner_unknown' | 'cancel_pending' | 'cancel_rejected' | 'closed_pending' | 'closed_rejected' |
    'lock_release_failed' | 'cleanup_deadline' | 'observation_invalid';
type NativeFacts = Readonly<{ reader_owned: boolean; closed_captured: boolean; read_started: false; read_pending: false;
    cancel: 'not_requested' | 'pending' | 'fulfilled' | 'rejected' | 'not_applicable';
    closed: 'pending' | 'fulfilled' | 'rejected' | 'not_applicable'; release: 'not_started' | 'succeeded' | 'failed' | 'not_applicable' }>;
type NativeCleanup = Readonly<{ disposition: 'confirmed' | 'unconfirmed'; kind: 'cancelled' | 'no_body' | null;
    reason: NativeReason | null; wait_issue: NativeReason | null; facts: NativeFacts }>;
type Reason = Readonly<{ code: Code; stage: Stage }>;
type Binding = Readonly<{ run: object; session: object; snapshot: object; lease: object; core: object;
    source: object; constructor: object; transport: object }>;
type Attempt = Readonly<{ binding: Binding; purpose: Purpose; ordinal: number; window: object }>;
type Http = Readonly<{ status: number; body_present: boolean; classification: 'hard' | 'local' | 'recovery_candidate' | 'other' }>;
type Cleanup = Readonly<{ phase: 'not_started' | 'pending' | 'confirmed' | 'unconfirmed' | 'not_applicable';
    kind: 'cancelled' | 'no_body' | null; reason: NativeReason | 'window_ended' | null; native?: NativeCleanup }>;
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

type NativeInput = { fake_io: true; deadline_ms: number; budget: { read(): { remaining_ms: number } };
    schedule(delay: number, wake: () => void): () => void };
type NativeWindow = Readonly<{ purpose: 'release'; ordinal: 1; window_origin_ms: number; cleanup_floor_ms: number }>;
declare const terminalBrand: unique symbol;
const P = Promise, promiseThen = P.prototype.then, promiseRace = P.race, promiseAll = P.all, enqueue = queueMicrotask;
const pinned = (() => {
    const rp = Response.prototype, sp = Stream.prototype, dp = Reader.prototype;
    const getter = (p: object, key: string) => Object.getOwnPropertyDescriptor(p, key)!.get!;
    return Object.freeze({ rp, sp, dp, status: getter(rp, 'status'), body: getter(rp, 'body'), used: getter(rp, 'bodyUsed'),
        locked: getter(sp, 'locked'), reader: sp.getReader, closed: getter(dp, 'closed'), cancel: dp.cancel, release: dp.releaseLock });
})();
const injectedResponses = new WeakSet<object>(), injectedStreams = new WeakSet<object>();
function data(raw: unknown, keys: readonly string[]): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
    const actual = Reflect.ownKeys(raw);
    if (actual.length !== keys.length || actual.some(k => typeof k !== 'string' || !keys.includes(k))) return null;
    const out = Object.create(null);
    for (const key of keys) { const d = Object.getOwnPropertyDescriptor(raw, key)!; if (!('value' in d)) return null; out[key] = d.value; }
    return out;
}

type NativeFault = 'copy_terminal' | 'foreign_terminal' | 'copy_cleanup' | 'foreign_anchor' | 'consume_twice';
/** Private faults are reachable only from fixed-case fixtures, never the injected constructor input. */
function constructInjectedNativeDiagnosticWorkflow(raw: NativeInput, fault?: NativeFault) {
    // Bind the upper owner before inspecting injected dependencies or observing Response/clock/native state.
    const binding = makeBinding(), upper = construct(binding); upper.bind(binding);
    const writer = upper.writers('release');
    const d = data(raw, ['fake_io', 'deadline_ms', 'budget', 'schedule']), b = data(d?.budget, ['read']);
    const deadline = d?.deadline_ms;
    const validInput = !!d && !!b && d.fake_io === true && Number.isInteger(deadline) && Number(deadline) > 0 && Number(deadline) <= 60000 &&
        typeof d.schedule === 'function' && !types.isProxy(d.schedule) && typeof b.read === 'function' && !types.isProxy(b.read);
    const readBudget = b?.read, schedule = d?.schedule;
    const operations = { get_reader: 0, closed: 0, cancel: 0, release_lock: 0, read: 0 };
    const counts = { issued: 0, consume_attempts: 0, consumed: 0 };
    type Anchor = Readonly<{ binding: Binding; attempt: Attempt; window: NativeWindow; response: object; header: Http }>;
    type Record = { anchor: Anchor; stream: object | null; reader?: object; readerIdentity?: object; captured: boolean; owned: boolean;
        cancel: NativeFacts['cancel']; closed: NativeFacts['closed']; release: NativeFacts['release']; closedWork?: Promise<void>;
        cleanup?: NativeCleanup; cleanupWork?: Promise<void> };
    type Terminal = { readonly [terminalBrand]: 'native_status_terminal' };
    type Held = Readonly<{ anchor: Anchor; record: Record; cleanup: NativeCleanup; reader: object | undefined }>;
    const terminals = new WeakMap<object, Held>();
    let phase: 'prepared' | 'acquiring' | 'cleanup' | 'issue' | 'pre_guard' | 'post_guard' | 'consumed' | 'closed' = 'prepared';
    let primary: Code | null = null, revoked = false, started = false, sealed = false, sampling = false;
    let issueClaim = false, consumeClaim = false, live: Terminal | undefined, current: Record | undefined;
    let foreignUnchanged = true;
    let last: number | undefined, runWork: Promise<ReturnType<typeof snapshot>> | undefined;
    let stopWake!: () => void;
    const stopping = new P<void>(resolve => { stopWake = resolve; });
    function stop(code: Code = 'cancelled', stage: Stage = 'stop') {
        if (sealed) return;
        primary ??= code; upper.stop(primary, stage);
        revoked = true; if (live) terminals.delete(live); live = undefined;
        if (code === 'cancelled' || code === 'closed') stopWake();
    }
    function fail(code: Code, stage: Stage) { upper.reject(code, stage); stop(code, stage); }
    if (!validInput) fail('invalid_input', 'binding');
    function sample(floor: number): NativeReason | null {
        if (sampling) { fail('invalid_state', 'stop'); return 'observation_invalid'; }
        sampling = true;
        try {
            const observation = Reflect.apply(readBudget as () => unknown, d!.budget, []) as { remaining_ms: unknown };
            // A malformed synchronous boundary may return a native rejected Promise: observe it without accepting its value.
            if (types.isPromise(observation)) { void observe(observation, () => {}); stop('invalid_observation_time'); return 'observation_invalid'; }
            const value = data(observation, ['remaining_ms'])?.remaining_ms;
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number(deadline) || last !== undefined && value > last) {
                stop('invalid_observation_time'); return 'observation_invalid';
            }
            last = value;
            if (value <= floor) { stop('deadline_exceeded'); return 'cleanup_deadline'; }
            return null;
        } catch { stop('internal_review_error'); return 'observation_invalid'; }
        finally { sampling = false; }
    }
    function observe(work: unknown, settled: (yes: boolean) => void): Promise<void> {
        if (types.isProxy(work) || !types.isPromise(work) || Object.getPrototypeOf(work) !== P.prototype || Object.hasOwn(work, 'constructor') ||
            Object.getOwnPropertyDescriptor(P.prototype, 'constructor')?.value !== P) throw Error('invalid_promise');
        return new P(resolve => { Reflect.apply(promiseThen, work, [() => { settled(true); resolve(); }, () => { settled(false); resolve(); }]); });
    }
    async function wait(work: Promise<unknown>, floor: number): Promise<NativeReason | null> {
        const start = sample(floor); if (start) return start;
        let dispose: unknown, issue: NativeReason | null = null;
        try {
            const boundary = new P<NativeReason>(resolve => {
                try { dispose = Reflect.apply(schedule as NativeInput['schedule'], undefined, [last! - floor, () => resolve('cleanup_deadline')]); }
                catch { resolve('observation_invalid'); }
            });
            if (types.isPromise(dispose)) { void observe(dispose, () => {}); throw Error('invalid_dispose'); }
            if (typeof dispose !== 'function' || types.isProxy(dispose)) throw Error('invalid_dispose');
            issue = await Reflect.apply(promiseRace, P, [[
                new P<null>(resolve => { Reflect.apply(promiseThen, work, [() => resolve(null)]); }), boundary,
                new P<NativeReason>(resolve => { Reflect.apply(promiseThen, stopping, [() => resolve('observation_invalid')]); })]]) as NativeReason | null;
        } catch { issue = 'observation_invalid'; }
        finally { try { if (typeof dispose === 'function') Reflect.apply(dispose, undefined, []); } catch { issue ??= 'observation_invalid'; } }
        return issue ?? sample(floor);
    }
    function clean(r: Record): Promise<void> {
        if (r.cleanupWork) return r.cleanupWork;
        // Join is installed before any injected budget, scheduler or native operation can reenter.
        r.cleanupWork = new P<void>(resolve => { enqueue(() => { const work = (async () => {
            phase = 'cleanup'; writer.cleanup(r.anchor.attempt, 'pending');
            let issue = sample(r.anchor.window.cleanup_floor_ms);
            let cancelling = new P<void>(resolve => resolve());
            if (r.reader && r.cancel === 'not_requested') {
                r.cancel = 'pending'; operations.cancel++;
                try { cancelling = observe(Reflect.apply(pinned.cancel, r.reader, []), yes => { r.cancel = yes ? 'fulfilled' : 'rejected'; }); }
                catch { r.cancel = 'rejected'; }
            }
            if (r.reader && !issue) issue = await wait(Reflect.apply(promiseAll, P, [[r.closedWork ?? new P<void>(resolve => resolve()), cancelling]]), r.anchor.window.cleanup_floor_ms);
            const before = { reader_owned: r.owned, closed_captured: r.captured, read_started: false as const, read_pending: false as const,
                cancel: r.cancel, closed: r.closed };
            if (r.reader && r.release === 'not_started') {
                operations.release_lock++; r.release = 'failed';
                try { Reflect.apply(pinned.release, r.reader, []); r.release = 'succeeded'; } catch { /* no exception text */ }
                r.reader = undefined;
            }
            issue ??= sample(r.anchor.window.cleanup_floor_ms);
            const reason: NativeReason | null = !r.stream ? issue : !before.reader_owned || !before.closed_captured ? 'reader_owner_unknown' :
                before.cancel === 'pending' || before.cancel === 'not_requested' ? 'cancel_pending' : before.cancel === 'rejected' ? 'cancel_rejected' :
                before.closed !== 'fulfilled' ? before.closed === 'rejected' ? 'closed_rejected' : 'closed_pending' :
                r.release !== 'succeeded' ? 'lock_release_failed' : issue;
            r.cleanup = Object.freeze({ disposition: reason ? 'unconfirmed' : 'confirmed', kind: reason ? null : r.stream ? 'cancelled' : 'no_body',
                reason, wait_issue: issue, facts: Object.freeze({ ...before, release: r.release }) });
            writer.cleanup(r.anchor.attempt, reason ? 'unconfirmed' : 'confirmed', r.cleanup.kind, reason, r.cleanup);
            if (reason) stop('internal_review_error', 'cleanup');
        })(); Reflect.apply(promiseThen, work, [resolve, () => { fail('internal_review_error', 'cleanup'); resolve(); }]); }); });
        return r.cleanupWork;
    }
    function eligible(r: Record): boolean {
        const c = r.cleanup, f = c?.facts;
        if (!c || !f || c.disposition !== 'confirmed' || c.reason || c.wait_issue || operations.read !== 0 || r.reader ||
            ![403, 404].includes(r.anchor.header.status) || r.anchor.binding !== binding) return false;
        return r.stream ? c.kind === 'cancelled' && f.reader_owned && f.closed_captured && f.cancel === 'fulfilled' && f.closed === 'fulfilled' &&
            f.release === 'succeeded' && operations.get_reader === 1 && operations.closed === 1 && operations.cancel === 1 && operations.release_lock === 1 :
            c.kind === 'no_body' && f.cancel === 'not_applicable' && f.closed === 'not_applicable' && f.release === 'not_applicable' && Object.values(operations).every(n => n === 0);
    }
    function guard(r: Record): boolean {
        return !revoked && !primary && current === r && r.anchor.binding === binding && eligible(r);
    }
    function consume(r: Record, token: Terminal) {
        if (consumeClaim) { fail('invalid_state', 'acceptance'); return; }
        consumeClaim = true; const own = live; live = undefined; counts.consume_attempts++;
        const held = own ? terminals.get(own) : undefined;
        if (own) terminals.delete(own); // Spend only this issuer's slot; never look up or consume a foreign map.
        if (!held || own !== token || held.anchor !== r.anchor || held.record !== r || held.cleanup !== r.cleanup || held.reader !== r.readerIdentity) {
            fail('evidence_binding_mismatch', 'acceptance'); return;
        }
        phase = 'pre_guard';
        if (!guard(r) || sample(r.anchor.window.cleanup_floor_ms) || !guard(r) || writer.acceptance(r.anchor.attempt, 'consuming') !== 'recorded') return;
        phase = 'post_guard';
        if (sample(r.anchor.window.cleanup_floor_ms) || !guard(r) || writer.acceptance(r.anchor.attempt, 'accepted') !== 'recorded') return;
        counts.consumed++; phase = 'consumed';
    }
    function issue(r: Record) {
        if (issueClaim || !guard(r)) return;
        issueClaim = true; phase = 'issue';
        if (sample(r.anchor.window.cleanup_floor_ms) || !guard(r)) return;
        const token = Object.freeze(Object.create(null)) as Terminal;
        live = token; terminals.set(token, Object.freeze({ anchor: fault === 'foreign_anchor' ? Object.freeze({ ...r.anchor, binding: makeBinding() }) : r.anchor,
            record: r, cleanup: fault === 'copy_cleanup' ? Object.freeze({ ...r.cleanup! }) : r.cleanup!, reader: r.readerIdentity })); counts.issued++;
        // Negative controls never publish a handle or allow caller-chosen corruption of a real workflow.
        if (fault === 'foreign_terminal') {
            const foreign = new WeakMap<object, boolean>(), foreignToken = Object.freeze(Object.create(null)) as Terminal;
            foreign.set(foreignToken, true); consume(r, foreignToken); foreignUnchanged = foreign.has(foreignToken);
        } else consume(r, fault === 'copy_terminal' ? Object.freeze({ ...token }) as Terminal : token);
        if (fault === 'consume_twice') consume(r, token);
    }
    function snapshot() {
        return Object.freeze({ kind: 'injected_native_diagnostic_workflow' as const, scope: 'injected_only' as const, phase,
            upper: upper.snapshot(), operations: Object.freeze({ ...operations }), counts: Object.freeze({ ...counts }), token_held: !!live,
            request_rejected: null as 'invalid_state' | null, foreign_unchanged: foreignUnchanged, permissions });
    }
    function execute(response: unknown, descriptor: unknown) {
        if (started || sealed) {
            if (!sealed) fail('invalid_state', 'acceptance');
            return new P<ReturnType<typeof snapshot>>(resolve => {
                const rejected = (r: ReturnType<typeof snapshot>) => resolve(Object.freeze({ ...r, request_rejected: 'invalid_state' }));
                if (runWork) Reflect.apply(promiseThen, runWork, [rejected]); else rejected(snapshot());
            });
        }
        started = true;
        runWork = new P<ReturnType<typeof snapshot>>(resolve => { enqueue(() => { const work = (async () => {
            try {
                if (revoked || !validInput) return;
                const w = data(descriptor, ['purpose', 'ordinal', 'window_origin_ms', 'cleanup_floor_ms']);
                if (!w || w.purpose !== 'release' || w.ordinal !== 1 || !Number.isFinite(w.window_origin_ms) || !Number.isFinite(w.cleanup_floor_ms) ||
                    Number(w.window_origin_ms) > Number(deadline) || Number(w.cleanup_floor_ms) < Math.min(10000, Number(deadline) / 6) ||
                    Number(w.window_origin_ms) - Number(w.cleanup_floor_ms) <= 0 || Number(w.window_origin_ms) - Number(w.cleanup_floor_ms) > 10000) {
                    fail('invalid_input', 'binding'); return;
                }
                const window = Object.freeze({ ...w }) as NativeWindow;
                const attempt = upper.open('release')!;
                phase = 'acquiring'; if (sample(window.cleanup_floor_ms) || revoked) return;
                if (last! > window.window_origin_ms || !response || typeof response !== 'object' || types.isProxy(response) ||
                    Object.getPrototypeOf(response) !== pinned.rp || injectedResponses.has(response)) { fail('invalid_response', 'header'); return; }
                const status = Reflect.apply(pinned.status, response, []) as number;
                const stream = Reflect.apply(pinned.body, response, []) as object | null;
                if (Reflect.apply(pinned.used, response, []) || !Number.isInteger(status) || status < 100 || status > 599) { fail('invalid_response', 'header'); return; }
                injectedResponses.add(response);
                const header: Http = Object.freeze({ status, body_present: stream !== null, classification: 'other' });
                writer.header(attempt, status, stream !== null);
                const anchor: Anchor = Object.freeze({ binding, attempt, window, response, header });
                const r: Record = { anchor, stream, owned: false, captured: false, cancel: stream ? 'not_requested' : 'not_applicable',
                    closed: stream ? 'pending' : 'not_applicable', release: stream ? 'not_started' : 'not_applicable' };
                current = r;
                if (status === 401) stop('authentication_failed', 'header');
                if (stream !== null) {
                    if (types.isProxy(stream) || Object.getPrototypeOf(stream) !== pinned.sp || injectedStreams.has(stream) || Reflect.apply(pinned.locked, stream, [])) {
                        fail('invalid_response', 'header'); return;
                    }
                    injectedStreams.add(stream); operations.get_reader++;
                    r.reader = Reflect.apply(pinned.reader, stream, []) as object; r.readerIdentity = r.reader;
                    if (types.isProxy(r.reader) || Object.getPrototypeOf(r.reader) !== pinned.dp) { fail('invalid_response', 'header'); return; }
                    r.owned = true; operations.closed++;
                    r.closedWork = observe(Reflect.apply(pinned.closed, r.reader, []), yes => { r.closed = yes ? 'fulfilled' : 'rejected'; }); r.captured = true;
                }
                if (![401, 403, 404].includes(status)) fail('invalid_response', 'header');
                await clean(r); issue(r);
            } catch { fail('invalid_response', 'header'); }
            finally {
                if (current) await clean(current);
                upper.release('releasing'); revoked = true; if (live) terminals.delete(live); live = undefined;
                upper.release(current && current.cleanup?.disposition !== 'confirmed' ? 'unconfirmed' : 'confirmed');
                upper.seal(); sealed = true; phase = 'closed';
            }
        })(); Reflect.apply(promiseThen, work, [() => resolve(snapshot()), () => { stop('internal_review_error'); upper.seal(); sealed = true; phase = 'closed'; resolve(snapshot()); }]); }); });
        return runWork;
    }
    async function close() { if (!sealed) stop('closed'); if (runWork) return runWork; upper.seal(); sealed = true; phase = 'closed'; return snapshot(); }
    return Object.freeze({ execute, stop: () => stop(), close, diagnostics: snapshot });
}

/** ND-02 injection-only entry: strict fake dependencies, no caller-controlled evidence or consumer. */
export function createInjectedNativeDiagnosticWorkflow(raw: NativeInput) { return constructInjectedNativeDiagnosticWorkflow(raw); }

/** Private-provenance negative controls return only sealed diagnostics, never a terminal or mutable port. */
export async function runNativeDiagnosticFaultFixture(raw: unknown) {
    const d = data(raw, ['scenario']), cases: readonly NativeFault[] = ['copy_terminal', 'foreign_terminal', 'copy_cleanup', 'foreign_anchor', 'consume_twice'];
    if (!d || !cases.includes(d.scenario as NativeFault)) return Object.freeze({ ok: false as const, code: 'invalid_input' as const, permissions });
    const owner = constructInjectedNativeDiagnosticWorkflow({ fake_io: true, deadline_ms: 60000, budget: { read: () => ({ remaining_ms: 60000 }) },
        schedule: () => () => {} }, d.scenario as NativeFault);
    const diagnostic = await owner.execute(new Response(null, { status: 403 }),
        { purpose: 'release', ordinal: 1, window_origin_ms: 60000, cleanup_floor_ms: 50000 });
    return Object.freeze({ ok: true as const, diagnostic, permissions });
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
