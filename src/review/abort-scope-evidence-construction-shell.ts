/** EF-01 pure synthetic model. No constructor registration, callbacks, clock or runtime adoption. */
import { types } from 'node:util';

const permissions = Object.freeze({ dispatch: false, read_body: false, retry: false, fallback: false,
    body_ack: false, release_permit: false, formal_issuance: false } as const);
const resourceNames = ['snapshot', 'core', 'registered_owner', 'admission', 'controller', 'phase_controller',
    'deadline_timer', 'phase_timer', 'abort_listener', 'source_transport'] as const;
type ResourceName = typeof resourceNames[number];
type Resource = { state: 'unstarted' | 'attempted' | 'held' | 'unknown' | 'released' | 'unconfirmed';
    owner: 'none' | 'shell' | 'session'; attempts: 0 | 1; acquisitions: 0 | 1; releases: 0 | 1 };
type Stage = 'core_binding' | 'source_binding' | 'resource' | 'commit' | 'stop' | 'seal';
type Code = 'invalid_state' | 'evidence_binding_mismatch' | 'cancelled' | 'deadline_exceeded' | 'internal_review_error' | 'config_invalid';
type CoreBinding = Readonly<{ run: object; session: object; snapshot: object; core: object; lease: object; registered_owner: object }>;
type SourceBinding = Readonly<{ core_binding: CoreBinding; key: object; source: object; handle: object }>;
const identity = (): object => Object.freeze(Object.create(null));

function constructShell() {
    const resources = Object.fromEntries(resourceNames.map(k => [k, { state: 'unstarted', owner: 'none', attempts: 0, acquisitions: 0, releases: 0 }])) as Record<ResourceName, Resource>;
    // Synthetic issuer graph only: these objects are not actual session/core/lease evidence.
    const core: CoreBinding = Object.freeze({ run: identity(), session: identity(), snapshot: identity(), core: identity(), lease: identity(), registered_owner: identity() });
    const source: SourceBinding = Object.freeze({ core_binding: core, key: identity(), source: identity(), handle: identity() });
    const tokens = Object.fromEntries(resourceNames.map(k => [k, identity()])) as Record<ResourceName, object>;
    const claims = { core: 'available' as 'available' | 'spent', source: 'available' as 'available' | 'spent', commit: 'available' as 'available' | 'spent' };
    const counts = { shells: 1 as const, core_bindings: 0, source_bindings: 0, commits: 0 };
    let state: 'pending' | 'ready' | 'failed' | 'closed' = 'pending', active = false, sealed = false;
    let coreState: 'pending' | 'bound' | 'failed' = 'pending', sourceState: 'pending' | 'bound' | 'failed' = 'pending';
    let primary: Readonly<{ code: Code; public_code: Code; stage: Stage }> | null = null;
    let refusal: Readonly<{ code: Code; stage: Stage }> | null = null;
    let teardown: 'not_started' | 'confirmed' | 'unconfirmed' = 'not_started';
    function stop(code: Code, stage: Stage) {
        if (sealed) return 'late_ignored';
        primary ??= Object.freeze({ code, public_code: code === 'invalid_state' || code === 'evidence_binding_mismatch' ? 'internal_review_error' : code, stage });
        state = 'failed'; active = false;
        for (const k of ['core', 'source', 'commit'] as const) claims[k] = 'spent';
        return 'stopped';
    }
    function reject(code: Code, stage: Stage) {
        if (sealed) return 'late_ignored';
        refusal ??= Object.freeze({ code, stage }); stop(code, stage); return 'rejected';
    }
    function attempt(k: ResourceName) {
        if (sealed) return 'late_ignored';
        const r = resources[k];
        if (state === 'failed' || r.state !== 'unstarted' || k === 'source_transport' && (state !== 'ready' || !active) ||
            state === 'ready' && k !== 'source_transport' ||
            ['deadline_timer', 'phase_timer', 'abort_listener'].includes(k) && (!active || coreState !== 'bound')) return reject('invalid_state', 'resource');
        r.state = 'attempted'; r.owner = counts.commits ? 'session' : 'shell'; r.attempts = 1; return 'attempted';
    }
    function receive(k: ResourceName, token: object) {
        if (sealed) return 'late_ignored';
        const r = resources[k];
        if (r.state !== 'attempted') return reject('invalid_state', 'resource');
        if (token !== tokens[k]) { r.state = 'unknown'; return reject('evidence_binding_mismatch', 'resource'); }
        r.acquisitions = 1;
        r.state = 'held'; r.owner = counts.commits ? 'session' : 'shell'; return 'held';
    }
    function acquire(k: ResourceName, token: object) { if (sealed) return 'late_ignored'; return attempt(k) === 'attempted' ? receive(k, token) : 'rejected'; }
    function unknown(k: ResourceName) {
        if (sealed) return 'late_ignored';
        if (resources[k].state !== 'attempted') return reject('invalid_state', 'resource');
        resources[k].state = 'unknown'; stop('internal_review_error', 'resource'); return 'unknown';
    }
    function release(k: ResourceName, operator: object, disposition: 'confirmed' | 'unconfirmed') {
        if (sealed) return 'late_ignored';
        // An unowned slot (never started or already released) belongs to whoever owns the shell's resources now.
        const r = resources[k], expected = r.owner === 'session' || r.owner === 'none' && counts.commits ? core.session : core.run;
        if (operator !== expected) return reject('evidence_binding_mismatch', 'resource');
        if (r.state === 'unstarted') return 'not_needed';
        if (r.releases || !['held', 'unknown', 'attempted'].includes(r.state) || disposition === 'confirmed' && r.state !== 'held')
            return reject('invalid_state', 'resource');
        r.releases = 1; r.state = disposition === 'confirmed' ? 'released' : 'unconfirmed';
        if (['snapshot', 'core', 'registered_owner', 'source_transport'].includes(k)) active = false;
        if (disposition === 'confirmed') r.owner = 'none'; else stop('internal_review_error', 'resource');
        return disposition;
    }
    function bindCore(value: CoreBinding) {
        if (sealed) return 'late_ignored';
        if (claims.core !== 'available') return reject('invalid_state', 'core_binding');
        claims.core = 'spent'; coreState = 'failed';
        if (value !== core) return reject('evidence_binding_mismatch', 'core_binding');
        if (state !== 'pending' || resources.snapshot.state !== 'held' || resources.core.state !== 'held' || resources.registered_owner.state !== 'held') return reject('invalid_state', 'core_binding');
        coreState = 'bound'; active = true; counts.core_bindings++; return 'bound';
    }
    function commit() {
        if (sealed) return 'late_ignored';
        if (claims.commit !== 'available') return reject('invalid_state', 'commit');
        claims.commit = 'spent';
        if (state !== 'pending' || !active || coreState !== 'bound' || resourceNames.some(k => ['attempted', 'unknown'].includes(resources[k].state)))
            return reject('invalid_state', 'commit');
        counts.commits++; state = 'ready';
        for (const k of resourceNames) if (resources[k].state === 'held') resources[k].owner = 'session';
        return 'committed';
    }
    function bindSource(value: SourceBinding) {
        if (sealed) return 'late_ignored';
        if (claims.source !== 'available') return reject('invalid_state', 'source_binding');
        claims.source = 'spent'; sourceState = 'failed';
        if (value !== source || value.core_binding !== core) return reject('evidence_binding_mismatch', 'source_binding');
        if (state !== 'ready' || !active || coreState !== 'bound' || resources.source_transport.state !== 'held') return reject('invalid_state', 'source_binding');
        sourceState = 'bound'; counts.source_bindings++; return 'bound';
    }
    function diagnostic() {
        return Object.freeze({ scope: 'synthetic_shell_only' as const, state, sealed, primary, refusal, teardown,
            bindings: Object.freeze({ core: coreState, source: sourceState, active }), claims: Object.freeze({ ...claims }), counts: Object.freeze({ ...counts }),
            purposes: Object.freeze({ authentication: false, parent: false, release: false }),
            resources: Object.freeze(Object.fromEntries(resourceNames.map(k => [k, Object.freeze({ ...resources[k] })])) as Record<ResourceName, Readonly<Resource>>) });
    }
    let sealedCopy: ReturnType<typeof diagnostic> | undefined;
    function seal() {
        if (sealed) return 'late_ignored';
        const pending = resourceNames.filter(k => !['unstarted', 'released'].includes(resources[k].state));
        for (const k of pending) resources[k].state = 'unconfirmed';
        teardown = pending.length ? 'unconfirmed' : 'confirmed';
        if (pending.length) stop('internal_review_error', 'seal');
        active = false; for (const k of ['core', 'source', 'commit'] as const) claims[k] = 'spent';
        state = 'closed'; sealed = true; sealedCopy = diagnostic(); return 'sealed';
    }
    return { diagnostic: () => sealedCopy ?? diagnostic(), core, source, tokens, attempt, receive, acquire, unknown, release, bindCore, bindSource, commit, stop, seal };
}

/** Only fixed case names enter; no live shell, binding, resource or writer is exported. */
export function runConstructionShellFixture(raw: unknown) {
    const invalid = () => Object.freeze({ ok: false as const, code: 'invalid_input' as const, permissions });
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalid();
    const keys = Reflect.ownKeys(raw), field = Object.getOwnPropertyDescriptor(raw, 'scenario');
    const cases = ['empty', 'source_bound', 'unknown_resource', 'wrong_release_owner', 'duplicate_core', 'duplicate_source', 'duplicate_commit',
        'core_before_resources', 'source_before_core', 'source_before_commit', 'bind_after_stop', 'commit_after_stop', 'resource_after_stop', 'missing_snapshot',
        'foreign_core', 'copy_core', 'core_run', 'core_session', 'core_snapshot', 'core_core', 'core_lease', 'core_registered_owner',
        'foreign_source', 'copy_source', 'source_core_binding', 'source_key', 'source_source', 'source_handle', 'first_reason', 'late_resource',
        'duplicate_acquire', 'duplicate_release', 'unknown_confirmed', 'foreign_resource', 'seal_pending', 'sealed_late', 'timer_before_core',
        'commit_after_release', 'source_after_release', 'session_release_unstarted', 'session_duplicate_release', 'run_release_unstarted'];
    if (keys.length !== 1 || keys[0] !== 'scenario' || !field || !('value' in field) || typeof field.value !== 'string' || !cases.includes(field.value)) return invalid();
    const scenario = field.value, shell = constructShell(), foreign = constructShell(), before = JSON.stringify(foreign.diagnostic());
    const late: string[] = [];
    let atSeal: ReturnType<typeof shell.diagnostic> | null = null;
    function cleanup() {
        for (const k of ['source_transport', 'registered_owner', 'core', 'abort_listener', 'deadline_timer', 'phase_timer', 'controller', 'phase_controller', 'admission', 'snapshot'] as const) {
            const r = shell.diagnostic().resources[k];
            if (r.state === 'held') shell.release(k, r.owner === 'session' ? shell.core.session : shell.core.run, 'confirmed');
        }
    }
    if (scenario === 'core_before_resources') shell.bindCore(shell.core);
    else if (scenario === 'timer_before_core') shell.attempt('deadline_timer');
    else if (scenario === 'source_before_core') shell.bindSource(shell.source);
    else if (scenario === 'first_reason') { shell.stop('cancelled', 'stop'); shell.stop('config_invalid', 'stop'); shell.bindCore(shell.core); }
    else if (scenario === 'late_resource') {
        shell.attempt('controller'); shell.stop('cancelled', 'stop'); shell.receive('controller', shell.tokens.controller);
        shell.release('controller', shell.core.run, 'confirmed'); shell.seal();
    } else if (scenario !== 'empty') {
        for (const k of ['snapshot', 'core', 'registered_owner'] as const) if (scenario !== 'missing_snapshot' || k !== 'snapshot') shell.acquire(k, shell.tokens[k]);
        let c = shell.core;
        if (scenario === 'foreign_core') c = foreign.core;
        else if (scenario === 'copy_core') c = Object.freeze({ ...c });
        else if (scenario.startsWith('core_')) { const k = scenario.slice(5) as keyof CoreBinding; c = Object.freeze({ ...c, [k]: foreign.core[k] }); }
        shell.bindCore(c);
        if (scenario === 'duplicate_core') shell.bindCore(shell.core);
        else if (scenario === 'commit_after_release') { shell.release('core', shell.core.run, 'confirmed'); shell.commit(); }
        else if (scenario === 'source_after_release') {
            shell.commit(); shell.acquire('source_transport', shell.tokens.source_transport); shell.release('core', shell.core.session, 'confirmed'); shell.bindSource(shell.source);
        }
        else if (scenario === 'source_before_commit') shell.bindSource(shell.source);
        else if (['session_release_unstarted', 'session_duplicate_release', 'run_release_unstarted'].includes(scenario)) {
            shell.commit();
            if (scenario === 'session_release_unstarted') shell.release('phase_timer', shell.core.session, 'confirmed');
            if (scenario === 'run_release_unstarted') shell.release('phase_timer', shell.core.run, 'confirmed');
            if (scenario === 'session_duplicate_release') { shell.release('core', shell.core.session, 'confirmed'); shell.release('core', shell.core.session, 'confirmed'); }
            cleanup(); shell.seal();
        }
        else if (['bind_after_stop', 'commit_after_stop', 'resource_after_stop'].includes(scenario)) {
            shell.stop('cancelled', 'stop');
            if (scenario === 'bind_after_stop') shell.bindCore(shell.core);
            if (scenario === 'commit_after_stop') shell.commit();
            if (scenario === 'resource_after_stop') shell.acquire('admission', shell.tokens.admission);
        } else if (['unknown_resource', 'unknown_confirmed'].includes(scenario)) {
            shell.attempt('deadline_timer'); shell.unknown('deadline_timer');
            shell.release('deadline_timer', shell.core.run, scenario === 'unknown_confirmed' ? 'confirmed' : 'unconfirmed');
            if (scenario === 'unknown_resource') { cleanup(); shell.seal(); }
        } else if (['duplicate_acquire', 'duplicate_release', 'foreign_resource'].includes(scenario)) {
            shell.acquire('admission', scenario === 'foreign_resource' ? foreign.tokens.admission : shell.tokens.admission);
            if (scenario === 'duplicate_acquire') shell.acquire('admission', shell.tokens.admission);
            if (scenario === 'duplicate_release') { shell.release('admission', shell.core.run, 'confirmed'); shell.release('admission', shell.core.run, 'confirmed'); }
        } else if (scenario === 'seal_pending') shell.seal();
        else if (['source_bound', 'duplicate_source', 'duplicate_commit', 'foreign_source', 'copy_source', 'source_core_binding', 'source_key', 'source_source', 'source_handle', 'wrong_release_owner', 'sealed_late'].includes(scenario)) {
            shell.commit();
            if (scenario === 'duplicate_commit') shell.commit();
            else {
                shell.acquire('source_transport', shell.tokens.source_transport);
                let s = shell.source;
                if (scenario === 'foreign_source') s = foreign.source;
                else if (scenario === 'copy_source') s = Object.freeze({ ...s });
                else if (scenario.startsWith('source_') && scenario !== 'source_bound') { const k = scenario.slice(7) as keyof SourceBinding; s = Object.freeze({ ...s, [k]: foreign.source[k] }); }
                shell.bindSource(s);
                if (scenario === 'duplicate_source') shell.bindSource(shell.source);
                if (scenario === 'wrong_release_owner') { shell.release('core', shell.core.run, 'confirmed'); cleanup(); shell.seal(); }
                if (scenario === 'sealed_late') {
                    cleanup(); shell.seal(); atSeal = shell.diagnostic();
                    late.push(shell.bindCore(shell.core), shell.bindSource(shell.source), shell.commit(), shell.stop('cancelled', 'stop'),
                        shell.attempt('controller'), shell.release('core', shell.core.session, 'confirmed'), shell.seal());
                }
            }
        }
    }
    return Object.freeze({ ok: true as const, diagnostic: shell.diagnostic(), at_seal: atSeal, late_results: Object.freeze(late),
        foreign_unchanged: JSON.stringify(foreign.diagnostic()) === before, permissions });
}
