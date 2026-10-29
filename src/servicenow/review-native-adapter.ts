/** NA-02: injected native Response/Streams only. No fetch fallback, real-session adoption or formal issuer. */
import { types } from 'node:util';
import { ReadableStream as NativeStream, ReadableStreamDefaultReader as NativeReader } from 'node:stream/web';
import { z } from 'zod';
type Code = 'invalid_input' | 'invalid_state' | 'invalid_response' | 'evidence_binding_mismatch' | 'invalid_observation_time' | 'deadline_exceeded' | 'attempt_deadline_exceeded' | 'upstream_unavailable' | 'cancelled' | 'closed' | 'internal_review_error';
type Result<T> = Readonly<{
    ok: true;
    value: T;
} | {
    ok: false;
    code: Code;
}>;
declare const brand: unique symbol;
type Handle = {
    readonly [brand]: 'injected_native_reader';
};
type EndEvidence = {
    readonly [brand]: 'injected_native_end';
};
type Outcome = Readonly<{
    ok: true;
    value: unknown;
} | {
    ok: false;
}>;
type CleanupReason = 'reader_owner_unknown' | 'read_pending' | 'cancel_pending' | 'cancel_rejected' | 'closed_pending' | 'closed_rejected' | 'lock_release_failed' | 'cleanup_deadline' | 'observation_invalid' | 'fetch_pending';
type Cleanup = Readonly<{
    disposition: 'not_started' | 'confirmed' | 'unconfirmed';
    kind: 'eof' | 'cancelled' | 'no_response' | 'no_body' | null;
    reason: CleanupReason | null;
    scope: 'injected_native';
}>;
const shape = z.strictObject({ purpose: z.enum(['authentication', 'parent', 'release']), ordinal: z.union([z.literal(1), z.literal(2)]), io_floor_ms: z.number().finite().nonnegative(), cleanup_floor_ms: z.number().finite().nonnegative(), window_origin_ms: z.number().finite().nonnegative().optional() });
type Descriptor = z.infer<typeof shape>;
const P = Promise, pThen = P.prototype.then, pRace = P.race;
const responseClaims = new WeakMap<object, object>(), streamClaims = new WeakMap<object, object>();
const capture = () => {
    try {
        const rp = Response.prototype, sp = NativeStream.prototype, dp = NativeReader.prototype;
        const get = (proto: object, key: string) => Object.getOwnPropertyDescriptor(proto, key)?.get;
        const value = { rp, sp, status: get(rp, 'status'), body: get(rp, 'body'), used: get(rp, 'bodyUsed'), locked: get(sp, 'locked'), getReader: sp.getReader, streamCancel: sp.cancel, read: dp.read, cancel: dp.cancel, release: dp.releaseLock, closed: get(dp, 'closed') };
        return Object.values(value).every(x => x !== undefined) ? value : null;
    }
    catch {
        return null;
    }
};
const native = capture(), ok = <T>(value: T): Result<T> => Object.freeze({ ok: true, value });
class Failure extends Error {
    constructor(readonly code: Code) { super(code); }
}
function observe(p: unknown): Promise<Outcome> {
    if (types.isProxy(p) || !types.isPromise(p) || Object.getPrototypeOf(p) !== P.prototype || Object.hasOwn(p, 'constructor') || Object.getOwnPropertyDescriptor(P.prototype, 'constructor')?.value !== P)
        throw new Failure('invalid_response');
    return new P(resolve => { Reflect.apply(pThen, p, [value => resolve({ ok: true, value }), () => resolve({ ok: false })]); });
}
export function createInjectedNativeReaderOwner(input: {
    fake_io: true;
    budget: {
        read(): {
            remaining_ms: number;
        };
    };
    deadline_ms: number;
    dispatch(request: Readonly<Descriptor & {
        synthetic: true;
    }>, signal: AbortSignal): unknown;
    schedule(delay: number, wake: () => void): () => void;
}) {
    const fakeIo = input.fake_io, deadline = input.deadline_ms, readBudget = input.budget.read.bind(input.budget), dispatch = input.dispatch, schedule = input.schedule;
    const owner = Object.freeze({}), controller = new AbortController(), records = new WeakMap<Handle, R>(), ends = new WeakMap<EndEvidence, R>();
    type R = {
        descriptor: Readonly<Descriptor>;
        handle: Handle;
        reader?: object;
        closedCaptured: boolean;
        closed: 'pending' | 'fulfilled' | 'rejected';
        closedWork?: Promise<void>;
        pending: boolean;
        readWork?: Promise<void>;
        reading: boolean;
        eof: boolean;
        cancel: 'not_requested' | 'pending' | 'fulfilled' | 'rejected';
        release: 'not_started' | 'succeeded' | 'failed';
        finishClaimed: boolean;
        cleanup?: Cleanup;
        cleanupWork?: Promise<void>;
        endConsumed?: boolean;
    };
    let current: R | undefined, busy = false, closed = false, primary: Code | null = null, last: number | undefined, lastCleanup: Cleanup | null = null, attempts = 0;
    const operations = { claims: 0, reads: 0, cancels: 0, releases: 0, closed_captures: 0 };
    const no = (code: Code): Result<never> => Object.freeze({ ok: false, code: primary ?? code });
    function stop(code: Code) { primary ??= code; controller.abort(); }
    function sample() {
        try {
            const n = readBudget().remaining_ms;
            if (!Number.isFinite(n) || n > deadline || last !== undefined && n > last) {
                stop('invalid_observation_time');
                throw new Failure('invalid_observation_time');
            }
            last = n;
            if (n <= 0) {
                stop('deadline_exceeded');
                throw new Failure('deadline_exceeded');
            }
            return n;
        }
        catch (error) {
            if (error instanceof Failure)
                throw error;
            stop('internal_review_error');
            throw new Failure('internal_review_error');
        }
    }
    function check(floor: number, cleanup = false) {
        const n = sample();
        if (!cleanup && (primary || closed))
            throw new Failure(primary ?? 'closed');
        if (n <= floor)
            throw new Failure('attempt_deadline_exceeded');
        return n;
    }
    async function wait<T>(work: Promise<T>, floor: number, cleanup = false): Promise<T> {
        const n = check(floor, cleanup);
        let dispose: (() => void) | undefined, abort = () => { };
        const boundary = new P<never>((_resolve, reject) => {
            abort = () => reject(new Failure(primary ?? 'cancelled'));
            if (!cleanup) {
                controller.signal.addEventListener('abort', abort, { once: true });
                if (controller.signal.aborted) {
                    abort();
                    return;
                }
            }
            dispose = schedule(n - floor, () => {
                try {
                    check(floor, cleanup);
                    reject(new Failure('internal_review_error'));
                }
                catch (error) {
                    reject(error);
                }
            });
        });
        try {
            const result = await Reflect.apply(pRace, P, [[work, boundary]]) as T;
            check(floor, cleanup);
            return result;
        }
        finally {
            controller.signal.removeEventListener('abort', abort);
            dispose?.();
        }
    }
    function report(r: R, value: Cleanup) { r.cleanup = lastCleanup = Object.freeze(value); }
    function lookup(handle: Handle) {
        const r = records.get(handle);
        if (!r || r !== current) {
            stop('evidence_binding_mismatch');
            throw new Failure('evidence_binding_mismatch');
        }
        return r;
    }
    function discardLate(response: unknown) {
        try {
            if (!native || !response || typeof response !== 'object' || types.isProxy(response) || Object.getPrototypeOf(response) !== native.rp || responseClaims.has(response))
                return;
            const stream = Reflect.apply(native.body!, response, []) as object | null;
            responseClaims.set(response, owner);
            if (!stream || types.isProxy(stream) || Object.getPrototypeOf(stream) !== native.sp || streamClaims.has(stream) || Reflect.apply(native.locked!, stream, []))
                return;
            streamClaims.set(stream, owner);
            void observe(Reflect.apply(native.streamCancel, stream, []));
        }
        catch { /* Best effort only. No new reader or repair of the original terminal. */ }
    }
    async function clean(r: R) {
        if (r.cleanupWork)
            return r.cleanupWork;
        r.cleanupWork = P.resolve().then(async () => {
            if (!r.reader) {
                report(r, { disposition: 'unconfirmed', kind: null, reason: 'reader_owner_unknown', scope: 'injected_native' });
                stop('internal_review_error');
                return;
            }
            let cancelling = P.resolve(), issue: CleanupReason | null = null;
            if (!r.eof && r.cancel === 'not_requested') {
                r.cancel = 'pending';
                operations.cancels++;
                try {
                    cancelling = observe(Reflect.apply(native!.cancel, r.reader, [])).then(outcome => { r.cancel = outcome.ok ? 'fulfilled' : 'rejected'; });
                }
                catch {
                    r.cancel = 'rejected';
                }
            }
            try {
                await wait(P.all([r.readWork ?? P.resolve(), r.closedWork ?? P.resolve(), cancelling]), r.descriptor.cleanup_floor_ms, true);
            }
            catch (error) {
                issue = error instanceof Failure && ['attempt_deadline_exceeded', 'deadline_exceeded'].includes(error.code) ? 'cleanup_deadline' : 'observation_invalid';
            }
            // Capture before release: releaseLock may itself reject pending read/closed promises.
            const before = Object.freeze({ pending: r.pending, eof: r.eof, cancel: r.cancel, closed: r.closed, captured: r.closedCaptured, issue });
            operations.releases++;
            r.release = 'failed';
            try {
                Reflect.apply(native!.release, r.reader, []);
                r.release = 'succeeded';
            }
            catch { /* Fixed terminal below. */ }
            r.reader = undefined;
            try {
                check(r.descriptor.cleanup_floor_ms, true);
            }
            catch (error) {
                issue ??= error instanceof Failure && ['attempt_deadline_exceeded', 'deadline_exceeded'].includes(error.code) ? 'cleanup_deadline' : 'observation_invalid';
                stop(error instanceof Failure ? error.code : 'internal_review_error');
            }
            const reason = !before.captured ? 'reader_owner_unknown' : before.pending ? 'read_pending' : before.cancel === 'pending' ? 'cancel_pending' : before.cancel === 'rejected' ? 'cancel_rejected' : before.closed !== 'fulfilled' ? before.closed === 'pending' ? 'closed_pending' : 'closed_rejected' : r.release !== 'succeeded' ? 'lock_release_failed' : before.issue ?? issue;
            report(r, { disposition: reason ? 'unconfirmed' : 'confirmed', kind: reason ? null : before.cancel === 'fulfilled' ? 'cancelled' : 'eof', reason, scope: 'injected_native' });
            if (reason)
                stop('internal_review_error');
        }).catch(() => { report(r, { disposition: 'unconfirmed', kind: null, reason: 'observation_invalid', scope: 'injected_native' }); stop('internal_review_error'); });
        return r.cleanupWork;
    }
    return Object.freeze({
        async acquire(raw: unknown): Promise<Result<Readonly<{
            handle: Handle;
            status: number;
        }>>> {
            if (primary || closed)
                return no('closed');
            if (busy || current && !current.cleanup) {
                stop('invalid_state');
                if (current)
                    await clean(current);
                return no('invalid_state');
            }
            busy = true;
            const previous = current, previousCleanup = lastCleanup;
            let invoked = false, settled = false, rejected = false, ended = false, adopted = false, deliveredValue: unknown;
            try {
                if (fakeIo !== true || !native || !Number.isInteger(deadline) || deadline < 1 || deadline > 60000)
                    throw new Failure('internal_review_error');
                const parsed = shape.safeParse(raw);
                if (!parsed.success)
                    throw new Failure('invalid_input');
                // The window shape is fixed where the caller issued it; later samples only test the deadline.
                const d = parsed.data, n = check(d.io_floor_ms), origin = d.window_origin_ms ?? n, span = origin - d.cleanup_floor_ms, reserve = d.io_floor_ms - d.cleanup_floor_ms;
                if (origin < n || origin > deadline || span <= 0 || span > 10000 || d.cleanup_floor_ms < Math.min(10000, deadline / 6) || reserve <= 0 || reserve > Math.min(250, span / 4))
                    throw new Failure('invalid_input');
                if (++attempts > 210)
                    throw new Failure('invalid_state');
                let result: unknown;
                try {
                    invoked = true;
                    result = dispatch(Object.freeze({ ...d, synthetic: true }), controller.signal);
                }
                catch {
                    settled = true;
                    rejected = true;
                    throw new Failure('upstream_unavailable');
                }
                const work = (types.isPromise(result) ? observe(result) : P.resolve({ ok: true as const, value: result })).then(outcome => {
                    settled = true;
                    rejected = !outcome.ok;
                    if (outcome.ok) {
                        deliveredValue = outcome.value;
                        if (ended)
                            discardLate(outcome.value);
                    }
                    return outcome;
                });
                const delivered = await wait(work, d.io_floor_ms);
                if (!delivered.ok)
                    throw new Failure('upstream_unavailable');
                const response = delivered.value;
                if (!response || typeof response !== 'object' || types.isProxy(response) || Object.getPrototypeOf(response) !== native.rp)
                    throw new Failure('invalid_response');
                const status = Reflect.apply(native.status!, response, []) as number, used = Reflect.apply(native.used!, response, []) as boolean, stream = Reflect.apply(native.body!, response, []) as object | null;
                if (status < 100 || status > 599 || used || responseClaims.has(response))
                    throw new Failure('invalid_response');
                responseClaims.set(response, owner);
                if (stream === null) {
                    lastCleanup = Object.freeze({ disposition: 'confirmed', kind: 'no_body', reason: null, scope: 'injected_native' });
                    throw new Failure('invalid_response');
                }
                if (!stream || types.isProxy(stream) || Object.getPrototypeOf(stream) !== native.sp || Reflect.apply(native.locked!, stream, []) || streamClaims.has(stream))
                    throw new Failure('invalid_response');
                streamClaims.set(stream, owner);
                const handle = Object.freeze(Object.create(null)) as Handle, r: R = { descriptor: Object.freeze(d), handle, closedCaptured: false, closed: 'pending', pending: false, reading: false, eof: false, cancel: 'not_requested', release: 'not_started', finishClaimed: false };
                records.set(handle, r);
                current = r;
                adopted = true;
                r.reader = Reflect.apply(native.getReader, stream, []) as object;
                operations.claims++;
                const captured = Reflect.apply(native.closed!, r.reader, []);
                operations.closed_captures++;
                r.closedWork = observe(captured).then(value => { r.closed = value.ok ? 'fulfilled' : 'rejected'; });
                r.closedCaptured = true;
                check(d.io_floor_ms);
                return ok(Object.freeze({ handle, status }));
            }
            catch (error) {
                stop(error instanceof Failure ? error.code : 'invalid_response');
                if (current && current !== previous)
                    await clean(current);
                else if (lastCleanup === previousCleanup)
                    lastCleanup = Object.freeze({ disposition: !invoked ? 'not_started' : settled && rejected ? 'confirmed' : 'unconfirmed', kind: settled && rejected ? 'no_response' : null, reason: !invoked || settled && rejected ? null : settled ? 'reader_owner_unknown' : 'fetch_pending', scope: 'injected_native' });
                return no('invalid_response');
            }
            finally {
                ended = true;
                if (!adopted && deliveredValue)
                    discardLate(deliveredValue);
                busy = false;
            }
        },
        async read(handle: Handle): Promise<Result<Readonly<{
            done: boolean;
            value?: Uint8Array;
        }>>> {
            try {
                const r = lookup(handle);
                check(r.descriptor.io_floor_ms);
                if (r.reading || r.eof || r.cleanup)
                    throw new Failure('invalid_state');
                r.reading = true;
                r.pending = true;
                operations.reads++;
                const work = observe(Reflect.apply(native!.read, r.reader!, []));
                r.readWork = work.then(() => { r.pending = false; });
                try {
                    const result = await wait(work, r.descriptor.io_floor_ms);
                    if (!result.ok)
                        throw new Failure('invalid_response');
                    const next = result.value as ReadableStreamReadResult<Uint8Array>;
                    if (next.done) {
                        r.eof = true;
                        return ok(Object.freeze({ done: true }));
                    }
                    if (!types.isUint8Array(next.value))
                        throw new Failure('invalid_response');
                    return ok(Object.freeze({ done: false, value: next.value }));
                }
                finally {
                    r.reading = false;
                }
            }
            catch (error) {
                stop(error instanceof Failure ? error.code : 'invalid_response');
                if (current)
                    await clean(current);
                return no('invalid_response');
            }
        },
        async finish(handle: Handle) {
            try {
                const r = lookup(handle);
                // A finish during a pending read would let the cancel-resolved read look like EOF.
                if (r.finishClaimed || r.reading)
                    throw new Failure('invalid_state');
                r.finishClaimed = true;
                await clean(r);
                if (primary)
                    return no(primary);
                const evidence = Object.freeze(Object.create(null)) as EndEvidence;
                ends.set(evidence, r);
                return ok(Object.freeze({ state: 'native_end_only' as const, cleanup: r.cleanup!, evidence, body_eligible: false as const, evidence_issuance: 'disabled' as const }));
            }
            catch (error) {
                stop(error instanceof Failure ? error.code : 'internal_review_error');
                if (current)
                    await clean(current);
                return no('internal_review_error');
            }
        },
        consumeEnd(handle: Handle, evidence: EndEvidence) {
            try {
                const r = lookup(handle);
                check(r.descriptor.cleanup_floor_ms);
                if (ends.get(evidence) !== r)
                    throw new Failure('evidence_binding_mismatch');
                if (r.endConsumed)
                    throw new Failure('invalid_state');
                r.endConsumed = true;
                if (!r.finishClaimed || r.cleanup?.disposition !== 'confirmed' || r.release !== 'succeeded')
                    throw new Failure('internal_review_error');
                check(r.descriptor.cleanup_floor_ms);
                return ok(r.cleanup);
            }
            catch (error) {
                stop(error instanceof Failure ? error.code : 'internal_review_error');
                return no('internal_review_error');
            }
        },
        stop(code: 'cancelled' | 'closed') {
            stop(code === 'cancelled' || code === 'closed' ? code : 'invalid_input');
            if (current && !current.cleanup)
                void clean(current);
        },
        close() {
            closed = true;
            stop('closed');
            if (current && !current.cleanup)
                void clean(current);
        },
        status() { return Object.freeze({ primary, cleanup: lastCleanup, operations: Object.freeze({ ...operations }), active: busy || !!current && !current.cleanup, evidence_issuance: 'disabled' as const }); },
    });
}
