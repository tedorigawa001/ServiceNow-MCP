/** Legacy package-excluded compatibility root; the runtime friend stays only in this root. */
import { types } from 'node:util';
import { ReadableStream as Stream, ReadableStreamDefaultReader as Reader } from 'node:stream/web';
import { BoundedReadError, takeNativeStatusCompositionProbe, type NativeStatusProbeScope, type ReadSnapshot, type BoundedReadOptions } from '../servicenow/bounded-read.js';

import { createNativeDiagnosticState, permissions, type Binding, type Attempt, type Http,
    type NativeFacts, type NativeCleanup, type NativeReason, type Code, type Stage } from './abort-scope-evidence-native-diagnostic-state.js';
import { nativeCleanupReason, nativeCleanupFactsEligible } from './abort-scope-evidence-native-diagnostic-facts.js';

const id = (): object => Object.freeze(Object.create(null));
const makeBinding = (): Binding => Object.freeze({ run: id(), session: id(), snapshot: id(), lease: id(), core: id(),
    source: id(), constructor: id(), transport: id() });

type NativeInput = { fake_io: true; deadline_ms: number; budget: { read(): { remaining_ms: number } };
    schedule(delay: number, wake: () => void): () => void };
type NativeWindow = Readonly<{ purpose: 'release'; ordinal: 1; window_origin_ms: number; cleanup_floor_ms: number }>;
type NativeState = ReturnType<typeof createNativeDiagnosticState>;
type WorkflowPhase = 'prepared' | 'acquiring' | 'cleanup' | 'issue' | 'pre_guard' | 'post_guard' | 'consumed' | 'closed';
type WorkflowSnapshot = Readonly<{ kind: 'injected_native_diagnostic_workflow'; scope: 'injected_only'; phase: WorkflowPhase;
    upper: ReturnType<NativeState['owner']['snapshot']>; operations: Readonly<{ get_reader: number; closed: number; cancel: number; release_lock: number; read: number }>;
    counts: Readonly<{ issued: number; consume_attempts: number; consumed: number }>; token_held: boolean;
    request_rejected: 'invalid_state' | null; foreign_unchanged: boolean; permissions: typeof permissions }>;
type NativeWorkflow = Readonly<{ execute(response: unknown, descriptor: unknown): Promise<WorkflowSnapshot>; stop(code?: Code): void;
    close(): Promise<WorkflowSnapshot>; diagnostics(): WorkflowSnapshot }>;
type NativeFacade = Readonly<Omit<NativeWorkflow, 'stop'> & { stop(): void }>;
type JoinRole = 'run' | 'cleanup';
type JoinGenerationFault = 'invalid_state' | 'evidence_binding_mismatch' | 'internal_review_error';
type JoinPreparationPosition = 'empty' | 'claimed' | 'runtime' | 'context' | 'identity' | 'pin';
type JoinShellContext = Readonly<{ record: object; anchor: object }>;
type JoinShellIdentity<K extends JoinRole> = Readonly<{ recovery: RecoveryAnchor; root: object; seed: object; kind: K;
    context: K extends 'run' ? null : JoinShellContext }>;
type OwnerPromisePin<K extends JoinRole> = Readonly<{ runtime: JoinRuntimeShell<K>; identity: JoinShellIdentity<K>;
    basis: typeof joinPromiseBasis }>;
type JoinRuntimeShell<K extends JoinRole> = {
    readonly recovery: RecoveryAnchor; readonly root: object; readonly seed: object; readonly kind: K;
    readonly contextRecord: object | null; readonly contextAnchor: object | null;
    readiness: 'shell' | 'identity_ready' | 'pin_ready' | 'failed_retained';
    context: JoinShellContext | null; identity: JoinShellIdentity<K> | null; pin: OwnerPromisePin<K> | null;
    pinState: 'unprepared' | 'preparing' | 'ready' | 'rejected'; pinFault: JoinPreparationPosition | null;
    executor: 'not_entered'; executorHandler: null; fulfilledHandler: null; rejectedHandler: null; observerArgs: null;
    candidate: null; work: null; resolve: null; reject: null;
    observerClaim: false; observerState: 'unstarted'; observerBusy: false; observed: 'unobserved'; callbackFault: null;
    observerAckCandidate: null; observerAck: null; settleClaim: false; settleState: 'unattempted'; terminal: 'unobserved';
    notifyAttempted: false; copyAttempted: false; dispatchStarted: false; entered: false;
};
type RoleGenerationSlot<K extends JoinRole> = { readonly role: K; published: null; faultAt: JoinPreparationPosition | null } & (
    | { phase: 'empty'; claimed: false; position: 'empty'; fault: null; pending: null }
    | { phase: 'claimed_unheld'; claimed: true; position: 'claimed'; fault: null; pending: null }
    | { phase: 'building'; claimed: true; position: 'runtime' | 'context' | 'identity' | 'pin'; fault: null; pending: JoinRuntimeShell<K> }
    | { phase: 'failed_retained'; claimed: boolean; position: JoinPreparationPosition; fault: JoinGenerationFault; pending: JoinRuntimeShell<K> | null }
);
type RecoveryAnchor = { state?: NativeState; writer?: ReturnType<NativeState['owner']['writers']>; preparation?: object;
    normal?: NativeWorkflow; facade?: NativeFacade; status: 'building' | 'ready' | 'failed';
    checkpoint: 'anchor' | 'state' | 'bound' | 'writer' | 'facade' | 'preparation' | 'origin' | 'root' | 'runJoin' | 'run' | 'cleanupJoin' | 'duty' | 'normal' | 'ready';
    initializeClaim: boolean; copyPhase: 'unused' | 'building' | 'ready' | 'failed'; copy?: WorkflowSnapshot;
    closePhase: 'unused' | 'closing' | 'closed' | 'unconfirmed'; rejectRecorded: boolean; stopRecorded: boolean; notified: boolean; sealRecorded: boolean;
    operations: WorkflowSnapshot['operations']; counts: WorkflowSnapshot['counts']; runPending: null; cleanupPending: null;
    runGeneration: RoleGenerationSlot<'run'>; cleanupGeneration: RoleGenerationSlot<'cleanup'> };
declare const terminalBrand: unique symbol;
const P = Promise, promiseThen = P.prototype.then, promiseRace = P.race, promiseAll = P.all, enqueue = queueMicrotask;
// JR-B-BASE-BEGIN: module-private reflection baseline, no Promise construction.
const jbGlobal = globalThis, jbObject = Object, jbGet = Object.getOwnPropertyDescriptor, jbProto = Object.getPrototypeOf, jbOwn = Object.hasOwn,
    jbFreeze = Object.freeze, jbFrozen = Object.isFrozen, jbProxy = types.isProxy, jbIsPromise = types.isPromise,
    jbApply = Reflect.apply, jbSpecies = Symbol.species;
const joinPromiseBasis = (() => {
    const pd = jbGet(P, 'prototype'), proto: unknown = pd && 'value' in pd ? pd.value : null;
    const usable = typeof P === 'function' && !jbProxy(P) && !!proto && typeof proto === 'object' && !jbProxy(proto);
    const cd = usable ? jbGet(proto, 'constructor') : undefined, td = usable ? jbGet(proto, 'then') : undefined,
        sd = usable ? jbGet(P, jbSpecies) : undefined, fd = jbGet(jbObject, 'isFrozen'), od = jbGet(jbGlobal, 'Object');
    const ready = !!usable && !!pd && 'value' in pd && !!cd && 'value' in cd && cd.value === P &&
        !!td && 'value' in td && td.value === promiseThen && !!sd && !('value' in sd) &&
        typeof sd.get === 'function' && sd.set === undefined && !!fd && 'value' in fd && fd.value === jbFrozen &&
        !!od && 'value' in od && od.value === jbObject;
    return jbFreeze({ ready, p: P, proto, then: promiseThen, pd: pd && jbFreeze(pd), cd: cd && jbFreeze(cd),
        td: td && jbFreeze(td), sd: sd && jbFreeze(sd), fd: fd && jbFreeze(fd), od: od && jbFreeze(od),
        pParent: usable ? jbProto(P) : null, protoParent: usable ? jbProto(proto) : null,
        isPromise: jbIsPromise, apply: jbApply });
})();
function sameJoinDescriptor(a: PropertyDescriptor | undefined, b: PropertyDescriptor | undefined): boolean {
    if (!a || !b || a.enumerable !== b.enumerable || a.configurable !== b.configurable) return false;
    const dataA = jbOwn(a, 'value'), dataB = jbOwn(b, 'value');
    return dataA === dataB && (dataA ? a.value === b.value && a.writable === b.writable : a.get === b.get && a.set === b.set);
}
function joinLegacyReflectionSafe(): boolean {
    return sameJoinDescriptor(jbGet(jbGlobal, 'Object'), joinPromiseBasis.od) &&
        sameJoinDescriptor(jbGet(jbObject, 'isFrozen'), joinPromiseBasis.fd);
}
function joinPromisePinLive(): boolean {
    return joinPromiseBasis.ready && joinLegacyReflectionSafe() &&
        sameJoinDescriptor(jbGet(P, 'prototype'), joinPromiseBasis.pd) &&
        sameJoinDescriptor(jbGet(joinPromiseBasis.proto, 'constructor'), joinPromiseBasis.cd) &&
        sameJoinDescriptor(jbGet(joinPromiseBasis.proto, 'then'), joinPromiseBasis.td) &&
        sameJoinDescriptor(jbGet(P, jbSpecies), joinPromiseBasis.sd) && jbProto(P) === joinPromiseBasis.pParent &&
        jbProto(joinPromiseBasis.proto) === joinPromiseBasis.protoParent;
}
// JR-B-BASE-END
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
function allocateNativeDiagnosticConstruction(raw: NativeInput, fault?: NativeFault, bridge?: NativeStatusProbeScope) {
    let recovery: RecoveryAnchor | undefined;
    let phase: WorkflowPhase = 'prepared', primary: Code | null = null, revoked = false, sealed = false, notifying = false;
    function refusal(): never { throw new BoundedReadError('internal_review_error'); }
    function notifyStop() {
        if (recovery) recovery.notified = true;
        if (bridge && !notifying) {
            notifying = true;
            try { bridge.stop(primary === 'invalid_state' || primary === 'invalid_observation_time' || primary === 'evidence_binding_mismatch' ? 'internal_review_error' : primary!); }
            finally { notifying = false; }
        }
    }
    function failureCopy(): WorkflowSnapshot {
        if (recovery?.copyPhase !== 'ready' || !recovery.copy) return refusal();
        return recovery.copy;
    }
    function failConstruction(code: Code, stage: Stage = 'binding') {
        primary ??= code; revoked = true; sealed = true; phase = 'closed';
        const a = recovery;
        if (!a) return;
        a.status = 'failed';
        if (a.copyPhase !== 'unused') return;
        a.copyPhase = 'building';
        const upper = a.state?.owner;
        if (!upper) { a.copyPhase = 'failed'; return; }
        try { upper.reject(primary, stage); a.rejectRecorded = true; } catch { /* Keep the first primitive reason. */ }
        try { upper.stop(primary, stage); a.stopRecorded = true; } catch { /* Continue the fixed recovery schedule. */ }
        if (!a.notified) try { notifyStop(); } catch { /* Notification cannot erase local custody. */ }
        try {
            upper.seal(); a.sealRecorded = true;
            const copy = upper.snapshot();
            if (!copy.sealed || !copy.stopped || copy.primary?.code !== primary ||
                copy.primary.public_code !== (primary === 'evidence_binding_mismatch' || primary === 'invalid_state' ? 'internal_review_error' : primary)) return;
            a.copy = Object.freeze({ kind: 'injected_native_diagnostic_workflow', scope: 'injected_only', phase: 'closed', upper: copy,
                operations: Object.freeze({ ...a.operations }), counts: Object.freeze({ ...a.counts }), token_held: false,
                request_rejected: null, foreign_unchanged: true, permissions });
        } catch { /* No normal-snapshot fallback and no copy retry. */ }
        finally { a.copyPhase = a.copy ? 'ready' : 'failed'; }
    }
    function initialize() {
        const a = recovery;
        if (!a || a.initializeClaim || a.status !== 'building') { failConstruction('invalid_state'); return; }
        a.initializeClaim = true;
        try {
            const normal = initializeLegacyWorkflow();
            if (a.status !== 'building' || primary || revoked || a.normal !== normal || !Object.isFrozen(normal)) {
                failConstruction(primary ?? 'internal_review_error'); return;
            }
            a.checkpoint = 'ready'; a.status = 'ready';
        } catch { failConstruction(primary ?? 'internal_review_error'); }
    }
    function initializeLegacyWorkflow(): NativeWorkflow {
    // Reuse the same prior bound owner; never reconstruct it after a partial failure.
    const { binding, owner: upper } = recovery!.state!;
    const writer = recovery!.writer!;
    type RootControlLink = Readonly<{ origin: object; binding: Binding; upper: typeof upper; writer: typeof writer }>;
    type EmptyJoinCell<K extends 'run' | 'cleanup'> = Readonly<{ root: RootControlLink; kind: K; work: null; resolver: null;
        dispatchStarted: false; entered: false; settled: false }>;
    type RunLink = Readonly<{ root: RootControlLink; join: EmptyJoinCell<'run'>; window: null; attempt: null; record: null; startClaimed: false }>;
    type ResourceDuty = Readonly<{ root: RootControlLink; run: RunLink; join: EmptyJoinCell<'cleanup'>; anchor: null;
        record: null; readerIdentity: undefined; retention: 'empty' }>;
    // Field-first custody is local to this creator; no active Promise, claim or resource is created here.
    const controlPreparation: { origin: object | null; root: RootControlLink | null; runJoin: EmptyJoinCell<'run'> | null;
        run: RunLink | null; cleanupJoin: EmptyJoinCell<'cleanup'> | null; duty: ResourceDuty | null } =
        recovery!.preparation = { origin: null, root: null, runJoin: null, run: null, cleanupJoin: null, duty: null };
    recovery!.checkpoint = 'preparation';
    if (recovery!.status !== 'building') throw 'construction_stopped';
    const controlOrigin = controlPreparation.origin = Object.create(null) as object;
    recovery!.checkpoint = 'origin';
    Object.freeze(controlOrigin);
    if (recovery!.status !== 'building') throw 'construction_stopped';
    const controlRoot: RootControlLink = controlPreparation.root = { origin: controlOrigin, binding, upper, writer };
    recovery!.checkpoint = 'root';
    Object.freeze(controlRoot);
    if (recovery!.status !== 'building') throw 'construction_stopped';
    const controlRunJoin: EmptyJoinCell<'run'> = controlPreparation.runJoin = { root: controlRoot, kind: 'run', work: null,
        resolver: null, dispatchStarted: false, entered: false, settled: false };
    recovery!.checkpoint = 'runJoin';
    Object.freeze(controlRunJoin);
    if (recovery!.status !== 'building') throw 'construction_stopped';
    const controlRun: RunLink = controlPreparation.run = { root: controlRoot, join: controlRunJoin, window: null,
        attempt: null, record: null, startClaimed: false };
    recovery!.checkpoint = 'run';
    Object.freeze(controlRun);
    if (recovery!.status !== 'building') throw 'construction_stopped';
    const controlCleanupJoin: EmptyJoinCell<'cleanup'> = controlPreparation.cleanupJoin = { root: controlRoot, kind: 'cleanup', work: null,
        resolver: null, dispatchStarted: false, entered: false, settled: false };
    recovery!.checkpoint = 'cleanupJoin';
    Object.freeze(controlCleanupJoin);
    if (recovery!.status !== 'building') throw 'construction_stopped';
    const controlDuty: ResourceDuty = controlPreparation.duty = { root: controlRoot, run: controlRun, join: controlCleanupJoin,
        anchor: null, record: null, readerIdentity: undefined, retention: 'empty' };
    recovery!.checkpoint = 'duty';
    Object.freeze(controlDuty);
    if (recovery!.status !== 'building') throw 'construction_stopped';
    function sameControlOwner(root: unknown, run: unknown, duty: unknown, runJoin: unknown, cleanupJoin: unknown): boolean {
        // Reject foreign/copy/Proxy values before any property read. Canonical pins are not taken from the mutable holder.
        if (root !== controlRoot || run !== controlRun || duty !== controlDuty || runJoin !== controlRunJoin || cleanupJoin !== controlCleanupJoin) return false;
        if (controlPreparation.origin !== controlOrigin || controlPreparation.root !== controlRoot || controlPreparation.runJoin !== controlRunJoin ||
            controlPreparation.run !== controlRun || controlPreparation.cleanupJoin !== controlCleanupJoin || controlPreparation.duty !== controlDuty) return false;
        return Object.isFrozen(controlOrigin) && Object.isFrozen(controlRoot) && Object.isFrozen(controlRunJoin) && Object.isFrozen(controlRun) &&
            Object.isFrozen(controlCleanupJoin) && Object.isFrozen(controlDuty) &&
            controlRoot.origin === controlOrigin && controlRoot.binding === binding && controlRoot.upper === upper && controlRoot.writer === writer &&
            controlRun.root === controlRoot && controlRun.join === controlRunJoin && controlRun.window === null && controlRun.attempt === null &&
            controlRun.record === null && controlRun.startClaimed === false && controlDuty.root === controlRoot && controlDuty.run === controlRun &&
            controlDuty.join === controlCleanupJoin && controlDuty.anchor === null && controlDuty.record === null && controlDuty.readerIdentity === undefined &&
            controlDuty.retention === 'empty' && controlRunJoin.root === controlRoot && controlRunJoin.kind === 'run' &&
            controlRunJoin.work === null && controlRunJoin.resolver === null && controlRunJoin.dispatchStarted === false &&
            controlRunJoin.entered === false && controlRunJoin.settled === false && controlCleanupJoin.root === controlRoot && controlCleanupJoin.kind === 'cleanup' &&
            controlCleanupJoin.work === null && controlCleanupJoin.resolver === null && controlCleanupJoin.dispatchStarted === false &&
            controlCleanupJoin.entered === false && controlCleanupJoin.settled === false;
    }
    const controlOwnerMatched = sameControlOwner(controlRoot, controlRun, controlDuty, controlRunJoin, controlCleanupJoin);
    // CF-PREP: empty control slots retained; dispatch remains disconnected.
    const d = data(raw, ['fake_io', 'deadline_ms', 'budget', 'schedule']), b = data(d?.budget, ['read']);
    const deadline = d?.deadline_ms;
    const validInput = !!d && !!b && d.fake_io === true && Number.isInteger(deadline) && Number(deadline) > 0 && Number(deadline) <= 60000 &&
        typeof d.schedule === 'function' && !types.isProxy(d.schedule) && typeof b.read === 'function' && !types.isProxy(b.read);
    const readBudget = b?.read, schedule = d?.schedule;
    const operations = recovery!.operations as { -readonly [K in keyof WorkflowSnapshot['operations']]: number };
    const counts = recovery!.counts as { -readonly [K in keyof WorkflowSnapshot['counts']]: number };
    type Anchor = Readonly<{ binding: Binding; attempt: Attempt; window: NativeWindow; response: object; header: Http }>;
    type Record = { anchor: Anchor; stream: object | null; reader?: object; readerIdentity?: object; captured: boolean; owned: boolean;
        cancel: NativeFacts['cancel']; closed: NativeFacts['closed']; release: NativeFacts['release']; closedWork?: Promise<void>;
        cleanup?: NativeCleanup; cleanupWork?: Promise<void> };
    type Terminal = { readonly [terminalBrand]: 'native_status_terminal' };
    type Held = Readonly<{ anchor: Anchor; record: Record; cleanup: NativeCleanup; reader: object | undefined }>;
    const terminals = new WeakMap<object, Held>();
    let started = false, sampling = false;
    let issueClaim = false, consumeClaim = false, live: Terminal | undefined, current: Record | undefined;
    let foreignUnchanged = true;
    let last: number | undefined, runWork: Promise<ReturnType<typeof snapshot>> | undefined;
    // JR-A-BEGIN: closed lexical generation contracts; no Promise, publication or dispatch.
    const joinRecovery = recovery!, runGeneration = joinRecovery.runGeneration, cleanupGeneration = joinRecovery.cleanupGeneration;
    type JoinIdentity<K extends JoinRole> = Readonly<{ recovery: RecoveryAnchor; root: RootControlLink;
        seed: K extends 'run' ? RunLink : ResourceDuty; kind: K;
        context: K extends 'run' ? null : Readonly<{ record: Record; anchor: Anchor }> }>;
    type JoinResolve<K extends JoinRole> = (value: K extends 'run' ? WorkflowSnapshot : void) => void;
    type JoinReject<K extends JoinRole> = K extends 'run' ? (reason: BoundedReadError) => void : null;
    type JoinEmpty = { candidate: null; work: null; resolve: null; reject: null; observerAck: null };
    type JoinCaptured<K extends JoinRole> = { resolve: JoinResolve<K>; reject: JoinReject<K> };
    type JoinWork<K extends JoinRole> = Promise<K extends 'run' ? WorkflowSnapshot : void>;
    type JoinRuntime<K extends JoinRole> = Readonly<{ identity: JoinIdentity<K>; kind: K }> & {
        dispatchStarted: false; entered: false; settleClaim: boolean; fault: Code | null;
    } & (
        | ({ phase: 'building'; prefix: 'runtime'; executor: 'not_entered' } & JoinEmpty)
        | ({ phase: 'capturing'; prefix: 'executor'; executor: 'running' } & JoinEmpty)
        | (K extends 'run' ? { phase: 'capturing'; prefix: 'reject'; executor: 'running'; candidate: null; work: null;
            resolve: null; reject: (reason: BoundedReadError) => void; observerAck: null } : never)
        | ({ phase: 'captured'; prefix: 'resolve'; executor: 'normal_exit'; candidate: null; work: null; observerAck: null } & JoinCaptured<K>)
        | ({ phase: 'candidate_held'; prefix: 'candidate'; executor: 'normal_exit'; candidate: unknown; work: null; observerAck: null } & JoinCaptured<K>)
        | (({ phase: 'checked'; prefix: 'checked' } | { phase: 'published'; prefix: 'published' }) & { executor: 'normal_exit';
            candidate: JoinWork<K>; work: JoinWork<K>; observerAck: Promise<void> } & JoinCaptured<K>)
        | { phase: 'failed_retained'; prefix: 'runtime' | 'executor' | 'reject' | 'resolve' | 'candidate' | 'checked' | 'published';
            executor: 'not_entered' | 'running' | 'normal_exit' | 'abnormal'; candidate: unknown; work: JoinWork<K> | null;
            resolve: JoinResolve<K> | null; reject: JoinReject<K> | null; observerAck: Promise<void> | null }
    );
    // Value-only phase inspection is not an issuer or adoption gate. Later phases have no writer in JR-A.
    function joinRuntimePhaseValid(v: JoinRuntime<'run'> | JoinRuntime<'cleanup'>): boolean {
        if (v.dispatchStarted !== false || v.entered !== false || typeof v.settleClaim !== 'boolean') return false;
        if (v.kind !== 'run' && v.kind !== 'cleanup' || v.kind === 'cleanup' && v.reject !== null) return false;
        if (v.phase === 'failed_retained') return (v.fault === 'invalid_state' || v.fault === 'evidence_binding_mismatch' ||
            v.fault === 'internal_review_error') && ['runtime', 'executor', 'reject', 'resolve', 'candidate', 'checked', 'published'].includes(v.prefix) &&
            ['not_entered', 'running', 'normal_exit', 'abnormal'].includes(v.executor);
        if (v.fault !== null || v.settleClaim) return false;
        if (v.phase === 'building' || v.phase === 'capturing') {
            if (v.candidate !== null || v.work !== null || v.resolve !== null || v.observerAck !== null) return false;
            if (v.phase === 'building') return v.prefix === 'runtime' && v.executor === 'not_entered' && v.reject === null;
            return v.executor === 'running' && (v.prefix === 'executor' && v.reject === null ||
                v.prefix === 'reject' && v.kind === 'run' && typeof v.reject === 'function');
        }
        if (v.executor !== 'normal_exit' || typeof v.resolve !== 'function' || v.kind === 'run' && typeof v.reject !== 'function') return false;
        if (v.phase === 'captured') return v.prefix === 'resolve' && v.candidate === null && v.work === null && v.observerAck === null;
        if (v.phase === 'candidate_held') return v.prefix === 'candidate' && v.work === null && v.observerAck === null;
        if (v.phase === 'checked' || v.phase === 'published') return v.prefix === v.phase && v.work !== null && v.work !== undefined &&
            v.candidate === v.work && v.observerAck !== null && v.observerAck !== undefined;
        return false;
    }
    function sameJoinGenerationOwner(slot: unknown, root: unknown, seed: unknown, role: JoinRole): boolean {
        // Compare all supplied references before reading any supplied field, including revoked Proxies.
        if (role === 'run' ? slot !== runGeneration || seed !== controlRun :
            role === 'cleanup' ? slot !== cleanupGeneration || seed !== controlDuty : true) return false;
        return root === controlRoot && recovery === joinRecovery && joinRecovery.runGeneration === runGeneration &&
            joinRecovery.cleanupGeneration === cleanupGeneration && runGeneration.role === 'run' && cleanupGeneration.role === 'cleanup' &&
            sameControlOwner(controlRoot, controlRun, controlDuty, controlRunJoin, controlCleanupJoin);
    }
    function rejectJoinGeneration(slot: RoleGenerationSlot<JoinRole>, code: JoinGenerationFault): false {
        slot.faultAt ??= slot.position;
        slot.fault ??= code; slot.phase = 'failed_retained';
        primary ??= code; revoked = true;
        // No notification/callback inside the synchronous claim group; no CP failure facade or fictional cleanup facts.
        return false;
    }
    function unusedJoinGeneration(slot: RoleGenerationSlot<JoinRole>): boolean {
        return slot.phase === 'empty' && !slot.claimed && slot.position === 'empty' && slot.fault === null &&
            slot.pending === null && slot.published === null;
    }
    function beginRunGeneration(slot: unknown, root: unknown, seed: unknown): boolean {
        if (!sameJoinGenerationOwner(slot, root, seed, 'run')) return rejectJoinGeneration(runGeneration, 'evidence_binding_mismatch');
        if (joinRecovery.status !== 'ready' || started || revoked || primary !== null || sealed || !unusedJoinGeneration(runGeneration))
            return rejectJoinGeneration(runGeneration, 'invalid_state');
        started = true;
        runGeneration.claimed = true; runGeneration.position = 'claimed'; runGeneration.phase = 'claimed_unheld';
        return true;
    }
    function beginCleanupGeneration(slot: unknown, root: unknown, seed: unknown, record: unknown, anchor: unknown): boolean {
        if (!sameJoinGenerationOwner(slot, root, seed, 'cleanup') || !current || record !== current || anchor !== current.anchor)
            return rejectJoinGeneration(cleanupGeneration, 'evidence_binding_mismatch');
        if (current.anchor.binding !== binding) return rejectJoinGeneration(cleanupGeneration, 'evidence_binding_mismatch');
        if (joinRecovery.status !== 'ready' || !started || sealed || !unusedJoinGeneration(cleanupGeneration))
            return rejectJoinGeneration(cleanupGeneration, 'invalid_state');
        cleanupGeneration.claimed = true; cleanupGeneration.position = 'claimed'; cleanupGeneration.phase = 'claimed_unheld';
        return true;
    }
    // Keep these private continuations uncalled by legacy execute/clean; scratch-only probes exercise the same code.
    void joinRuntimePhaseValid; void beginRunGeneration; void beginCleanupGeneration;
    // JR-A-END: pending/publication slots remain null; legacy work is unchanged.
    // JR-B-PREP-BEGIN: shell and pin only; no Promise, handlers, publication or dispatch.
    let runShellExpected: JoinRuntimeShell<'run'> | null = null, cleanupShellExpected: JoinRuntimeShell<'cleanup'> | null = null;
    let runIdentityExpected: JoinShellIdentity<'run'> | null = null, cleanupIdentityExpected: JoinShellIdentity<'cleanup'> | null = null;
    let runPinExpected: OwnerPromisePin<'run'> | null = null, cleanupPinExpected: OwnerPromisePin<'cleanup'> | null = null;
    function samePreparedControl(): boolean {
        return recovery === joinRecovery && joinRecovery.runGeneration === runGeneration && joinRecovery.cleanupGeneration === cleanupGeneration &&
            runGeneration.role === 'run' && cleanupGeneration.role === 'cleanup' &&
            controlPreparation.origin === controlOrigin && controlPreparation.root === controlRoot && controlPreparation.run === controlRun &&
            controlPreparation.duty === controlDuty && controlPreparation.runJoin === controlRunJoin && controlPreparation.cleanupJoin === controlCleanupJoin &&
            jbFrozen(controlOrigin) && jbFrozen(controlRoot) && jbFrozen(controlRun) && jbFrozen(controlDuty) && jbFrozen(controlRunJoin) && jbFrozen(controlCleanupJoin) &&
            controlRoot.origin === controlOrigin && controlRoot.binding === binding && controlRoot.upper === upper && controlRoot.writer === writer &&
            controlRun.root === controlRoot && controlRun.join === controlRunJoin && controlRun.window === null && controlRun.attempt === null &&
            controlRun.record === null && controlRun.startClaimed === false && controlDuty.root === controlRoot && controlDuty.run === controlRun &&
            controlDuty.join === controlCleanupJoin && controlDuty.anchor === null && controlDuty.record === null && controlDuty.readerIdentity === undefined &&
            controlDuty.retention === 'empty' && controlRunJoin.root === controlRoot && controlRunJoin.kind === 'run' && controlRunJoin.work === null &&
            controlRunJoin.resolver === null && controlRunJoin.dispatchStarted === false && controlRunJoin.entered === false && controlRunJoin.settled === false &&
            controlCleanupJoin.root === controlRoot && controlCleanupJoin.kind === 'cleanup' && controlCleanupJoin.work === null &&
            controlCleanupJoin.resolver === null && controlCleanupJoin.dispatchStarted === false && controlCleanupJoin.entered === false && controlCleanupJoin.settled === false;
    }
    function failPreparedJoin(slot: RoleGenerationSlot<JoinRole>, at: JoinPreparationPosition, code: JoinGenerationFault): false {
        slot.faultAt ??= at;
        const shell = slot.role === 'run' ? runShellExpected : cleanupShellExpected;
        if (shell) { shell.readiness = 'failed_retained'; if (at === 'pin') { shell.pinState = 'rejected'; shell.pinFault ??= at; } }
        return rejectJoinGeneration(slot, code);
    }
    function allocateJoinShell<K extends JoinRole>(kind: K, seed: object, record: object | null, anchor: object | null): JoinRuntimeShell<K> {
        return { recovery: joinRecovery, root: controlRoot, seed, kind, contextRecord: record, contextAnchor: anchor,
            readiness: 'shell', context: null, identity: null, pin: null, pinState: 'unprepared', pinFault: null,
            executor: 'not_entered', executorHandler: null, fulfilledHandler: null, rejectedHandler: null, observerArgs: null,
            candidate: null, work: null, resolve: null, reject: null, observerClaim: false, observerState: 'unstarted', observerBusy: false,
            observed: 'unobserved', callbackFault: null, observerAckCandidate: null, observerAck: null, settleClaim: false,
            settleState: 'unattempted', terminal: 'unobserved', notifyAttempted: false, copyAttempted: false, dispatchStarted: false, entered: false };
    }
    function shellPreparationLive(s: JoinRuntimeShell<'run'> | JoinRuntimeShell<'cleanup'>): boolean {
        if (s !== runShellExpected && s !== cleanupShellExpected) return false;
        const slot = s.kind === 'run' ? runGeneration : cleanupGeneration;
        return samePreparedControl() && slot.pending === s && slot.claimed && slot.phase === 'building' && slot.fault === null &&
            slot.faultAt === null && slot.published === null && joinRecovery.status === 'ready' && started && !sealed &&
            (s.kind === 'cleanup' || !revoked && primary === null) && s.recovery === joinRecovery && s.root === controlRoot &&
            s.seed === (s.kind === 'run' ? controlRun : controlDuty) &&
            (s.kind === 'run' ? s.contextRecord === null && s.contextAnchor === null :
                !!current && s.contextRecord === current && s.contextAnchor === current.anchor && current.anchor.binding === binding);
    }
    function preparedShellMatched(rawShell: unknown, rawIdentity: unknown, rawPin: unknown, role: JoinRole): boolean {
        const s = role === 'run' ? runShellExpected : cleanupShellExpected,
            identity = role === 'run' ? runIdentityExpected : cleanupIdentityExpected, pin = role === 'run' ? runPinExpected : cleanupPinExpected,
            slot = role === 'run' ? runGeneration : cleanupGeneration;
        if (!s || rawShell !== s || !identity || rawIdentity !== identity || !pin || rawPin !== pin) return false;
        return shellPreparationLive(s) && slot.pending === s && slot.claimed && slot.phase === 'building' && slot.position === 'pin' &&
            slot.fault === null && slot.faultAt === null && slot.published === null && joinRecovery.status === 'ready' && !sealed &&
            (role === 'cleanup' || !revoked && primary === null) && s.recovery === joinRecovery && s.root === controlRoot &&
            s.kind === role && s.seed === (role === 'run' ? controlRun : controlDuty) && s.identity === identity && s.pin === pin &&
            identity.recovery === joinRecovery && identity.root === controlRoot && identity.seed === s.seed && identity.kind === role &&
            identity.context === s.context && jbFrozen(identity) && jbFrozen(pin) && pin.runtime === s && pin.identity === identity &&
            pin.basis === joinPromiseBasis && s.readiness === 'pin_ready' && s.pinState === 'ready' && s.pinFault === null &&
            (role === 'run' ? s.context === null && s.contextRecord === null && s.contextAnchor === null :
                !!current && s.contextRecord === current && s.contextAnchor === current.anchor && current.anchor.binding === binding &&
                !!s.context && jbFrozen(s.context) && s.context.record === current && s.context.anchor === current.anchor) &&
            s.executor === 'not_entered' && s.executorHandler === null && s.fulfilledHandler === null && s.rejectedHandler === null && s.observerArgs === null &&
            s.candidate === null && s.work === null && s.resolve === null && s.reject === null && s.observerClaim === false && s.observerState === 'unstarted' &&
            s.observerBusy === false && s.observed === 'unobserved' && s.callbackFault === null && s.observerAckCandidate === null && s.observerAck === null &&
            s.settleClaim === false && s.settleState === 'unattempted' && s.terminal === 'unobserved' && s.notifyAttempted === false && s.copyAttempted === false &&
            s.dispatchStarted === false && s.entered === false && joinPromisePinLive();
    }
    function prepareRunShell(slot: unknown, root: unknown, seed: unknown): boolean {
        if (slot !== runGeneration || root !== controlRoot || seed !== controlRun || !samePreparedControl())
            return failPreparedJoin(runGeneration, 'empty', 'evidence_binding_mismatch');
        if (!joinLegacyReflectionSafe())
            return failPreparedJoin(runGeneration, 'pin', 'internal_review_error');
        if (!beginRunGeneration(slot, root, seed))
            return failPreparedJoin(runGeneration, runGeneration.faultAt ?? 'claimed', runGeneration.fault ?? 'invalid_state');
        let at: JoinPreparationPosition = 'runtime';
        try {
            const s = runShellExpected = runGeneration.pending = allocateJoinShell('run', controlRun, null, null);
            runGeneration.position = 'runtime'; runGeneration.phase = 'building';
            if (!shellPreparationLive(s)) return failPreparedJoin(runGeneration, at, 'invalid_state');
            at = 'identity';
            const identity = runIdentityExpected = s.identity = { recovery: joinRecovery, root: controlRoot, seed: controlRun, kind: 'run', context: null };
            runGeneration.position = 'identity'; jbFreeze(identity); s.readiness = 'identity_ready';
            if (!shellPreparationLive(s)) return failPreparedJoin(runGeneration, at, 'invalid_state');
            at = 'pin'; s.pinState = 'preparing';
            const pin = runPinExpected = s.pin = { runtime: s, identity, basis: joinPromiseBasis };
            runGeneration.position = 'pin';
            if (!joinPromisePinLive()) return failPreparedJoin(runGeneration, at, 'internal_review_error');
            jbFreeze(pin); s.pinState = 'ready'; s.readiness = 'pin_ready';
            if (!preparedShellMatched(s, identity, pin, 'run')) return failPreparedJoin(runGeneration, at, 'invalid_state');
            return true;
        } catch { return failPreparedJoin(runGeneration, at, 'internal_review_error'); }
    }
    function prepareCleanupShell(slot: unknown, root: unknown, seed: unknown, record: unknown, anchor: unknown): boolean {
        if (slot !== cleanupGeneration || root !== controlRoot || seed !== controlDuty || !samePreparedControl())
            return failPreparedJoin(cleanupGeneration, 'empty', 'evidence_binding_mismatch');
        if (!joinLegacyReflectionSafe())
            return failPreparedJoin(cleanupGeneration, 'pin', 'internal_review_error');
        if (!beginCleanupGeneration(slot, root, seed, record, anchor))
            return failPreparedJoin(cleanupGeneration, cleanupGeneration.faultAt ?? 'claimed', cleanupGeneration.fault ?? 'invalid_state');
        const r = current;
        if (!r) return failPreparedJoin(cleanupGeneration, 'context', 'evidence_binding_mismatch');
        let at: JoinPreparationPosition = 'runtime';
        try {
            const s = cleanupShellExpected = cleanupGeneration.pending = allocateJoinShell('cleanup', controlDuty, r, r.anchor);
            cleanupGeneration.position = 'runtime'; cleanupGeneration.phase = 'building';
            if (!shellPreparationLive(s)) return failPreparedJoin(cleanupGeneration, at, 'invalid_state');
            at = 'context'; const context = s.context = { record: r, anchor: r.anchor };
            cleanupGeneration.position = 'context'; jbFreeze(context);
            if (!shellPreparationLive(s)) return failPreparedJoin(cleanupGeneration, at, 'invalid_state');
            at = 'identity';
            const identity = cleanupIdentityExpected = s.identity = { recovery: joinRecovery, root: controlRoot, seed: controlDuty, kind: 'cleanup', context };
            cleanupGeneration.position = 'identity'; jbFreeze(identity); s.readiness = 'identity_ready';
            if (!shellPreparationLive(s)) return failPreparedJoin(cleanupGeneration, at, 'invalid_state');
            at = 'pin'; s.pinState = 'preparing';
            const pin = cleanupPinExpected = s.pin = { runtime: s, identity, basis: joinPromiseBasis };
            cleanupGeneration.position = 'pin';
            if (!joinPromisePinLive()) return failPreparedJoin(cleanupGeneration, at, 'internal_review_error');
            jbFreeze(pin); s.pinState = 'ready'; s.readiness = 'pin_ready';
            if (!preparedShellMatched(s, identity, pin, 'cleanup')) return failPreparedJoin(cleanupGeneration, at, 'invalid_state');
            return true;
        } catch { return failPreparedJoin(cleanupGeneration, at, 'internal_review_error'); }
    }
    void prepareRunShell; void prepareCleanupShell;
    // JR-B-PREP-END
    function stop(code: Code = 'cancelled', stage: Stage = 'stop') {
        if (sealed) return;
        primary ??= code; upper.stop(primary, stage);
        // Authority is revoked synchronously; a pending cleanup keeps its read-only wait until the original floor.
        revoked = true; if (live) terminals.delete(live); live = undefined;
        notifyStop();
    }
    function fail(code: Code, stage: Stage) { upper.reject(code, stage); stop(code, stage); }
    if (!controlOwnerMatched) fail('evidence_binding_mismatch', 'binding');
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
                new P<null>(resolve => { Reflect.apply(promiseThen, work, [() => resolve(null)]); }), boundary]]) as NativeReason | null;
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
            const reason = nativeCleanupReason(!!r.stream, before, r.release, issue);
            r.cleanup = Object.freeze({ disposition: reason ? 'unconfirmed' : 'confirmed', kind: reason ? null : r.stream ? 'cancelled' : 'no_body',
                reason, wait_issue: issue, facts: Object.freeze({ ...before, release: r.release }) });
            writer.cleanup(r.anchor.attempt, reason ? 'unconfirmed' : 'confirmed', r.cleanup.kind, reason, r.cleanup);
            if (reason) stop('internal_review_error', 'cleanup');
        })(); Reflect.apply(promiseThen, work, [resolve, () => { fail('internal_review_error', 'cleanup'); resolve(); }]); }); });
        return r.cleanupWork;
    }
    function eligible(r: Record): boolean {
        const c = r.cleanup;
        if (!c || !c.facts || r.reader ||
            ![403, 404].includes(r.anchor.header.status) || r.anchor.binding !== binding) return false;
        return nativeCleanupFactsEligible(!!r.stream, c, operations);
    }
    function guard(r: Record): boolean {
        if (bridge) { const error = bridge.check(bridge.binding); if (error) { stop(error as Code); return false; } }
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
        if (sample(r.anchor.window.cleanup_floor_ms) || !guard(r)) return;
        if (bridge) {
            const error = bridge.accept(bridge.binding, Object.freeze({ purpose: 'release', status: r.anchor.header.status, cleanup: r.cleanup!.kind }));
            if (error) { stop(error as Code, 'acceptance'); return; }
            if (sample(r.anchor.window.cleanup_floor_ms) || !guard(r)) return;
        }
        if (writer.acceptance(r.anchor.attempt, 'accepted') !== 'recorded') return;
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
    function snapshot(): WorkflowSnapshot {
        return Object.freeze({ kind: 'injected_native_diagnostic_workflow' as const, scope: 'injected_only' as const, phase,
            upper: upper.snapshot(), operations: Object.freeze({ ...operations }), counts: Object.freeze({ ...counts }), token_held: !!live,
            request_rejected: null as 'invalid_state' | null, foreign_unchanged: foreignUnchanged, permissions });
    }
    function execute(response: unknown, descriptor: unknown) {
        // The existing owner closure retains preparation custody; it does not dispatch either empty JoinCell.
        if (!sameControlOwner(controlRoot, controlRun, controlDuty, controlRunJoin, controlCleanupJoin) && !sealed)
            fail('evidence_binding_mismatch', 'binding');
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
                if (bridge) { const error = bridge.check(bridge.binding); if (error) { stop(error as Code); return; } }
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
                // Teardown covers only this lane's own token/claim release; reader cleanup failures stay in the cleanup slot and primary.
                upper.release('confirmed');
                upper.seal(); sealed = true; phase = 'closed';
            }
        })(); Reflect.apply(promiseThen, work, [() => resolve(snapshot()), () => { stop('internal_review_error'); upper.seal(); sealed = true; phase = 'closed'; resolve(snapshot()); }]); }); });
        return runWork;
    }
    async function close() { if (!sealed) stop('closed'); if (runWork) return runWork; upper.seal(); sealed = true; phase = 'closed'; return snapshot(); }
    const normal = recovery!.normal = { execute, stop: (code: Code = 'cancelled') => stop(code), close, diagnostics: snapshot };
    recovery!.checkpoint = 'normal';
    Object.freeze(normal);
    if (recovery!.status !== 'building') throw 'construction_stopped';
    if (!sameControlOwner(controlRoot, controlRun, controlDuty, controlRunJoin, controlCleanupJoin)) {
        fail('evidence_binding_mismatch', 'binding'); throw 'construction_stopped';
    }
    return normal;
    }
    try {
        recovery = { status: 'building', checkpoint: 'anchor', initializeClaim: false, copyPhase: 'unused', closePhase: 'unused',
            rejectRecorded: false, stopRecorded: false, notified: false, sealRecorded: false,
            operations: { get_reader: 0, closed: 0, cancel: 0, release_lock: 0, read: 0 }, counts: { issued: 0, consume_attempts: 0, consumed: 0 },
            runPending: null, cleanupPending: null,
            runGeneration: { role: 'run', claimed: false, phase: 'empty', position: 'empty', fault: null, pending: null, published: null, faultAt: null },
            cleanupGeneration: { role: 'cleanup', claimed: false, phase: 'empty', position: 'empty', fault: null, pending: null, published: null, faultAt: null } };
        recovery.state = createNativeDiagnosticState(); recovery.checkpoint = 'state';
        recovery.state.owner.bind(recovery.state.binding); recovery.checkpoint = 'bound';
        recovery.writer = recovery.state.owner.writers('release'); recovery.checkpoint = 'writer';
        const a = recovery;
        const facade: NativeFacade = a.facade = {
            async execute(response, descriptor) {
                if (a.status === 'ready') return a.normal!.execute(response, descriptor);
                if (a.status === 'building') failConstruction('invalid_state');
                return failureCopy();
            },
            stop() { if (a.status === 'ready') a.normal!.stop('cancelled'); else failConstruction('cancelled', 'stop'); },
            async close() {
                if (a.status === 'ready') return a.normal!.close();
                if (a.closePhase === 'unused') {
                    a.closePhase = 'closing';
                    if (a.status === 'building') failConstruction('closed', 'stop');
                    a.closePhase = a.copyPhase === 'ready' ? 'closed' : 'unconfirmed';
                }
                return failureCopy();
            },
            diagnostics() { return a.status === 'ready' ? a.normal!.diagnostics() : failureCopy(); },
        };
        a.checkpoint = 'facade'; Object.freeze(facade);
        return Object.freeze({ owner: facade, initialize, ready: () => a.status === 'ready',
            failureCode: () => primary === 'invalid_state' || primary === 'evidence_binding_mismatch' || primary === 'invalid_observation_time' ? 'internal_review_error' as const : primary,
            stop: (code: Code) => { if (a.status === 'ready') a.normal!.stop(code); else failConstruction(code, 'stop'); } });
    } catch { failConstruction('internal_review_error'); return refusal(); }
}

function constructInjectedNativeDiagnosticWorkflow(raw: NativeInput, fault?: NativeFault, bridge?: NativeStatusProbeScope) {
    const construction = allocateNativeDiagnosticConstruction(raw, fault, bridge);
    construction.initialize(); return construction.owner;
}

/** ND-02 injection-only entry: strict fake dependencies, no caller-controlled evidence or consumer. */
export function createInjectedNativeDiagnosticWorkflow(raw: NativeInput) {
    return constructInjectedNativeDiagnosticWorkflow(raw);
}

const nativeCompositionProbe = takeNativeStatusCompositionProbe();
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype), byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!,
    arrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!, arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!,
    typedCopy = Uint8Array.prototype.set;
/** ND-03 fresh real-class/fake-I/O composition; no existing session, callback or diagnostic adoption. */
export async function probeNativeStatusComposition(snapshot: ReadSnapshot, input: unknown,
    raw: Pick<BoundedReadOptions, 'signal' | 'limits'> & { parent_bytes: Uint8Array; response: Response }) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)) throw new BoundedReadError('invalid_input');
    const fields = data(raw, Reflect.ownKeys(raw).filter(k => typeof k === 'string') as string[]);
    if (!fields || Reflect.ownKeys(fields).some(k => !['signal', 'limits', 'parent_bytes', 'response'].includes(k as string)) ||
        !types.isUint8Array(fields.parent_bytes) || types.isProxy(fields.parent_bytes))
        throw new BoundedReadError('invalid_input');
    let bytes: Uint8Array;
    try {
        const n = Reflect.apply(byteLengthGetter, fields.parent_bytes, []) as number;
        Reflect.apply(arrayBufferLength, Reflect.apply(arrayBufferGetter, fields.parent_bytes, []), []);
        if (n > 4194304) throw Error('limit');
        bytes = new Uint8Array(n); Reflect.apply(typedCopy, bytes, [fields.parent_bytes]);
    } catch { throw new BoundedReadError('invalid_input'); }
    const response = fields.response;
    let owner: NativeWorkflow | undefined, construction: ReturnType<typeof allocateNativeDiagnosticConstruction> | undefined;
    let started = false, read = false, disposed = false, disposeClaim = false, disposeFailed = false;
    const driver = Object.freeze({
        parent() { if (read || disposed) throw new BoundedReadError('internal_review_error'); read = true; return bytes; },
        begin(scope: NativeStatusProbeScope) {
            if (started || disposed) throw new BoundedReadError('internal_review_error'); started = true;
            construction = allocateNativeDiagnosticConstruction({ fake_io: true, deadline_ms: scope.deadline_ms, budget: scope.budget,
                schedule(ms, wake) { const timer = setTimeout(wake, ms); return () => clearTimeout(timer); } }, undefined, scope);
            owner = construction.owner;
            construction.initialize();
            if (!construction.ready()) throw new BoundedReadError(construction.failureCode() ?? 'internal_review_error');
        },
        async run(window: NativeWindow) { if (!owner || disposed) throw new BoundedReadError('internal_review_error'); await owner.execute(response, window); },
        stop(code: Code) { construction?.stop(code); },
        async close() { await owner?.close(); },
        dispose() {
            if (disposeClaim) { if (disposeFailed) throw new BoundedReadError('internal_review_error'); return; }
            disposeClaim = true; disposed = true; disposeFailed = true;
            bytes.fill(0); disposeFailed = false;
        },
    });
    let firstFailure: ConstructorParameters<typeof BoundedReadError>[0] | null = null;
    try {
        const result = await nativeCompositionProbe(snapshot, input, { ...(Object.hasOwn(fields, 'signal') ? { signal: fields.signal as AbortSignal } : {}),
            ...(Object.hasOwn(fields, 'limits') ? { limits: fields.limits as BoundedReadOptions['limits'] } : {}), driver });
        firstFailure = result.code;
        return Object.freeze({ ...result, native: owner?.diagnostics() ?? null });
    } catch (error) {
        firstFailure ??= error instanceof BoundedReadError ? error.code : 'internal_review_error';
        throw new BoundedReadError(firstFailure);
    } finally {
        let failed = false;
        try { await driver.close(); } catch { failed = true; }
        finally { try { driver.dispose(); } catch { failed = true; } }
        if (failed) throw new BoundedReadError(firstFailure ?? construction?.failureCode() ?? 'internal_review_error');
    }
}

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

export { runSyntheticNativeDiagnosticFixture } from './abort-scope-evidence-native-diagnostic-pure-fixture.js';
