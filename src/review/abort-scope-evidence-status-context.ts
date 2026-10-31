/** ST-03A/B: closed synthetic contract and one-shot private consumer. No native adoption or token export. */
import { types } from 'node:util';

type Code = 'invalid_input' | 'invalid_state' | 'evidence_binding_mismatch' | 'cancelled' | 'closed' |
    'authentication_failed' | 'internal_review_error' | 'deadline_exceeded' | 'invalid_observation_time';
type Phase = 'context_bound' | 'anchor_bound' | 'record_bound' | 'draft_held' | 'consuming' | 'consumed' | 'diagnostic_only' | 'failed' | 'revoked';
declare const brand: unique symbol;
type Identity<T extends string> = { readonly [brand]: T };
type Window = Readonly<{ purpose: 'release' | 'parent'; ordinal: 1; origin: 60000; floor: 50000 }>;
type Budget = Readonly<{ read: () => number }>;
type Context = Readonly<{ owner: Identity<'owner'>; generation: Identity<'generation'>; budget: Budget; clock: () => number; window: Window }>;
type Anchor = Readonly<{ context: Context; generation: Context['generation']; budget: Budget; clock: Context['clock']; window: Window }>;
type Header = Readonly<{ purpose: 'release' | 'parent'; status: 401 | 403 | 404; body_present: boolean }>;
type Cleanup = Readonly<{ disposition: 'confirmed' | 'unconfirmed'; kind: 'cancelled' | 'no_body' | null;
    reason: 'cancel_rejected' | null; read_started: boolean; read: 0 | 1 }>;
type Record = Readonly<{ context: Context; anchor: Anchor; header: Header; cleanup: Cleanup }>;
type Envelope = Readonly<{ context: Context; anchor: Anchor; record: Record; generation: Context['generation']; budget: Budget; clock: Context['clock']; window: Window }>;
type Draft = Readonly<{ identity: Identity<'non_executable_draft'>; envelope: Envelope }>;
type Claim = 'available' | 'started' | 'spent';
type Stage = 'context' | 'anchor' | 'record' | 'issue' | 'lookup' | 'pre_guard' | 'post_guard' | 'consume';
const permissions = Object.freeze({ dispatch: false, read_body: false, retry: false, fallback: false,
    body_ack: false, release_permit: false, formal_issuance: false } as const);
const identity = <T extends string>(): Identity<T> => Object.freeze(Object.create(null)) as Identity<T>;
type Consumption = Readonly<{ kind: 'synthetic_status_consumed'; scope: 'synthetic_contract_only';
    purpose: 'release'; status: 403 | 404; body_mode: 'cancelled' | 'no_body'; permissions: typeof permissions }>;

/** Private constructor. Neither its identities nor its test controls are exported. */
function construct() {
    const owner = identity<'owner'>(), generation = identity<'generation'>();
    const fake = { time: 60000, throws: false, action: () => {} };
    const clock = () => { fake.action(); if (fake.throws) throw Error('PRIVATE_CLOCK_FAILURE'); return fake.time; };
    const budget: Budget = Object.freeze({ read: clock });
    const window: Window = Object.freeze({ purpose: 'release', ordinal: 1, origin: 60000, floor: 50000 });
    // All finite slots exist before the first clock callback or synthetic record generation.
    const claims = { context: 'available' as Claim, anchor: 'available' as Claim, record: 'available' as Claim, issue: 'available' as Claim, consume: 'available' as Claim };
    const counts = { contexts: 0, anchors: 0, records: 0, drafts: 0, issue_attempts: 0, consume_attempts: 0, consumes: 0 };
    const known = new WeakMap<object, Draft>();
    let issuedToken: Draft['identity'] | undefined, consumption: Consumption | null = null;
    let context: Context | undefined, anchor: Anchor | undefined, record: Record | undefined, draft: Draft | undefined;
    let phase: Phase = 'context_bound', primary: Code | null = null, refusal: Code | null = null;
    let refusedAt: Stage | null = null, revoked = false;
    // phase is the latest state; the first terminal state is kept separately, first-wins like primary.
    let terminal: 'diagnostic_only' | 'failed' | 'revoked' | 'consumed' | null = null;
    let stopReason: 'cancelled' | 'closed' | null = null, last: number | undefined, sampling = false;
    function fail(code: Code, stage: NonNullable<typeof refusedAt>): false {
        primary ??= code; refusal ??= code; refusedAt ??= stage;
        revoked = true; draft = undefined; phase = 'failed'; terminal ??= 'failed'; return false;
    }
    function sample(stage: NonNullable<typeof refusedAt>): boolean {
        if (sampling) return fail('invalid_state', stage);
        sampling = true;
        try {
            const n = budget.read();
            if (!Number.isFinite(n) || n < 0 || n > window.origin || last !== undefined && n > last)
                return fail('invalid_observation_time', stage);
            last = n;
            return n > window.floor || fail('deadline_exceeded', stage);
        } catch { return fail('internal_review_error', stage); }
        finally { sampling = false; }
    }
    function claim(name: keyof typeof claims): boolean {
        if (claims[name] !== 'available') return fail('invalid_state', name);
        claims[name] = 'started'; return true;
    }
    function initialize(): boolean {
        if (!claim('context')) return false;
        try {
            if (revoked || !sample('context') || revoked) return false;
            context = Object.freeze({ owner, generation, budget, clock, window }); counts.contexts++;
            return true;
        } finally { claims.context = 'spent'; }
    }
    function bindAnchor(c: Context): boolean {
        if (!claim('anchor')) return false;
        try {
            if (revoked) return fail(primary ?? 'invalid_state', 'anchor');
            if (!context || c !== context) return fail('evidence_binding_mismatch', 'anchor');
            anchor = Object.freeze({ context, generation, budget, clock, window }); counts.anchors++; phase = 'anchor_bound'; return true;
        } finally { claims.anchor = 'spent'; }
    }
    function mintRecord(a: Anchor, kind: 'body' | 'release_404' | 'no_body' | 'hard' | 'hard_cleanup' | 'unconfirmed' | 'read_started' | 'local' = 'body'): boolean {
        if (!claim('record')) return false;
        try {
            if (revoked) return fail(primary ?? 'invalid_state', 'record');
            if (!context || !anchor || a !== anchor) return fail('evidence_binding_mismatch', 'record');
            if (!sample('record') || revoked) return false;
            const header: Header = Object.freeze({ purpose: kind === 'local' ? 'parent' : 'release',
                status: kind === 'hard' || kind === 'hard_cleanup' ? 401 : kind === 'local' || kind === 'release_404' ? 404 : 403, body_present: kind !== 'no_body' });
            const bad = kind === 'unconfirmed' || kind === 'hard_cleanup';
            const cleanup: Cleanup = Object.freeze({ disposition: bad ? 'unconfirmed' : 'confirmed',
                kind: bad ? null : kind === 'no_body' ? 'no_body' : 'cancelled', reason: bad ? 'cancel_rejected' : null,
                read_started: kind === 'read_started', read: kind === 'read_started' ? 1 : 0 });
            record = Object.freeze({ context, anchor, header, cleanup }); counts.records++; phase = 'record_bound';
            if (header.status === 401) primary ??= 'authentication_failed';
            if (bad) primary ??= 'internal_review_error';
            if (cleanup.read_started) { refusal ??= 'invalid_state'; refusedAt ??= 'record'; }
            return true;
        } finally { claims.record = 'spent'; }
    }
    function envelope(): Envelope {
        if (!context || !anchor || !record) throw Error('synthetic_setup_incomplete');
        return Object.freeze({ context, anchor, record, generation, budget, clock, window });
    }
    function matches(e: Envelope): boolean {
        return !!context && !!anchor && !!record && e.context === context && e.anchor === anchor && e.record === record &&
            e.generation === generation && e.budget === budget && e.clock === clock && e.window === window &&
            anchor.context === context && record.context === context && record.anchor === anchor;
    }
    function issue(e: Envelope): boolean {
        if (!claim('issue')) return false;
        counts.issue_attempts++;
        try {
            if (!matches(e)) return fail('evidence_binding_mismatch', 'issue');
            if (revoked) return fail(primary ?? 'invalid_state', 'issue');
            if (primary || refusal || !record || !eligible(record)) {
                draft = undefined; phase = 'diagnostic_only'; terminal ??= 'diagnostic_only';
                // A refusal alone is a stop, even when the inherited primary was null (ST-T17a).
                if (refusal) return fail(primary ?? refusal, 'issue');
                return false;
            }
            // The claim is already consumed; reentry/cancellation by clock cannot restore it.
            if (!sample('issue') || revoked || primary || refusal || claims.issue !== 'started' || !matches(e)) return false;
            draft = Object.freeze({ identity: identity<'non_executable_draft'>(), envelope: e });
            issuedToken = draft.identity; known.set(issuedToken, draft);
            counts.drafts++; phase = 'draft_held'; return true;
        } finally { claims.issue = 'spent'; }
    }
    function eligible(r: Record): boolean {
        return r.header.purpose === 'release' && [403, 404].includes(r.header.status) && r.cleanup.disposition === 'confirmed' &&
            r.cleanup.reason === null && !r.cleanup.read_started && r.cleanup.read === 0 &&
            r.cleanup.kind === (r.header.body_present ? 'cancelled' : 'no_body');
    }
    function consumeGuard(e: Envelope, held: Draft, stage: 'pre_guard' | 'post_guard'): boolean {
        if (revoked || primary || refusal) return fail(primary ?? refusal ?? 'invalid_state', stage);
        if (!matches(e) || !matches(held.envelope) || held.envelope.record !== e.record) return fail('evidence_binding_mismatch', stage);
        if (claims.consume !== 'started' || phase !== 'consuming' || claims.issue !== 'spent' || !record || !eligible(record)) return fail('invalid_state', stage);
        return true;
    }
    /** Called only by the constructor's fixed synthetic continuation, never an exported adoption API. */
    function consume(e: Envelope, token: unknown): boolean {
        const held = token && typeof token === 'object' ? known.get(token) : undefined;
        if (!held || token !== issuedToken || !matches(e) || !matches(held.envelope)) {
            // The owner is stopped by the failed lookup; mark the unused claim spent so diagnostics match its dead state.
            if (claims.consume === 'available') claims.consume = 'spent';
            return fail('evidence_binding_mismatch', 'lookup');
        }
        if (!claim('consume')) return false;
        // Retain identity history in known, not live authority. The sole live draft is removed BEFORE any callback.
        counts.consume_attempts++; draft = undefined; phase = 'consuming';
        try {
            if (!consumeGuard(e, held, 'pre_guard') || !sample('pre_guard') || !consumeGuard(e, held, 'pre_guard')) return false;
            if (!record || !eligible(record)) return fail('invalid_state', 'consume');
            if (!sample('post_guard') || !consumeGuard(e, held, 'post_guard')) return false;
            // No await/caller getter/callback between the final guard and this commit.
            consumption = Object.freeze({ kind: 'synthetic_status_consumed', scope: 'synthetic_contract_only', purpose: 'release',
                status: record.header.status as 403 | 404, body_mode: record.header.body_present ? 'cancelled' : 'no_body', permissions });
            counts.consumes++; phase = 'consumed'; terminal ??= 'consumed'; return true;
        } finally { claims.consume = 'spent'; }
    }
    function stop(code: 'cancelled' | 'closed' = 'cancelled') {
        revoked = true; draft = undefined; stopReason ??= code; primary ??= code; phase = 'revoked'; terminal ??= 'revoked';
    }
    function diagnostics() {
        return Object.freeze({ scope: 'synthetic_contract_only' as const, phase, first_terminal: terminal, primary, refusal, refusal_stage: refusedAt,
            revoked, stop_reason: stopReason, http: record?.header ?? null, cleanup: record?.cleanup ?? null,
            claims: Object.freeze({ ...claims }), counts: Object.freeze({ ...counts }), draft_held: draft !== undefined,
            consumer_reserved: Object.hasOwn(claims, 'consume'), consumer_implemented: true as const, consumption, permissions });
    }
    initialize();
    // Only the closed fixture below can see these ports. They are not exported from this module.
    return { initialize, bindAnchor, mintRecord, issue, consume, envelope, diagnostics, stop, fake,
        token: () => issuedToken, context: () => context!, anchor: () => anchor! };
}

const scenarios = [
    'body', 'release_404', 'no_body', 'hard', 'hard_cleanup', 'local', 'unconfirmed', 'read_started',
    'foreign_context', 'foreign_anchor', 'foreign_record', 'foreign_generation', 'foreign_budget', 'foreign_clock', 'foreign_window',
    'record_copy', 'external_diagnostic', 'json_diagnostic', 'duplicate_context', 'duplicate_anchor', 'duplicate_record', 'duplicate_issue',
    'anchor_context_mismatch', 'record_anchor_mismatch', 'issue_reentry', 'cancel_during_issue', 'stop_before_issue', 'stop_after_issue',
    'expired', 'reverse_clock', 'clock_rewind', 'clock_throw', 'retry_after_failure', 'stop_after_failure',
    'consume_body', 'consume_404', 'consume_no_body', 'consume_duplicate', 'consume_reissue', 'consume_then_stop',
    'consume_cancel_before', 'consume_close_before', 'consume_expired', 'consume_after_floor', 'consume_before_floor', 'consume_no_body_expired',
    'consume_pre_reentry', 'consume_post_reentry', 'consume_pre_cancel', 'consume_post_cancel', 'consume_pre_close', 'consume_post_close',
    'consume_pre_throw', 'consume_post_throw', 'consume_post_expired', 'consume_clock_rewind', 'consume_nonfinite', 'consume_retry_after_failure', 'consume_post_retry_after_failure',
    'consume_foreign_token', 'consume_foreign_then_retry', 'consume_token_copy', 'consume_diagnostic_token', 'consume_json_result',
    'consume_foreign_context', 'consume_foreign_anchor', 'consume_foreign_record', 'consume_foreign_generation', 'consume_foreign_budget', 'consume_foreign_clock', 'consume_foreign_window',
    'consume_before_issue', 'consume_hard', 'consume_unconfirmed', 'consume_read_started', 'consume_local',
] as const;
type Scenario = typeof scenarios[number];
function scenario(raw: unknown): Scenario | null {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
    const keys = Reflect.ownKeys(raw);
    if (keys.length !== 1 || keys[0] !== 'scenario') return null;
    const field = Object.getOwnPropertyDescriptor(raw, 'scenario')!;
    return Object.hasOwn(field, 'value') && typeof field.value === 'string' && (scenarios as readonly string[]).includes(field.value) ? field.value as Scenario : null;
}
/** Bounded development fixture: a case name only, NEVER raw records, callbacks, sessions or diagnostics. */
export function runSyntheticStatusContextFixture(raw: unknown) {
    const selected = scenario(raw);
    if (!selected) return Object.freeze({ ok: false as const, code: 'invalid_input' as const, permissions });
    const owner = construct();
    const other = selected.startsWith('foreign_') || selected.startsWith('consume_foreign_') || selected === 'anchor_context_mismatch' || selected === 'record_anchor_mismatch' ? construct() : null;
    other?.bindAnchor(other.context()); other?.mintRecord(other.anchor());
    if (selected.startsWith('consume_foreign_')) other!.issue(other!.envelope());
    const foreignBefore = other?.diagnostics();
    owner.bindAnchor(selected === 'anchor_context_mismatch' ? other!.context() : owner.context());
    if (selected === 'clock_rewind') owner.fake.time = 58000;
    const recordKind = selected === 'consume_404' ? 'release_404' : selected === 'consume_no_body' || selected === 'consume_no_body_expired' ? 'no_body' :
        selected === 'consume_hard' ? 'hard' : selected === 'consume_unconfirmed' ? 'unconfirmed' : selected === 'consume_read_started' ? 'read_started' : selected === 'consume_local' ? 'local' :
        ['release_404', 'no_body', 'hard', 'hard_cleanup', 'local', 'unconfirmed', 'read_started'].includes(selected) ? selected as 'release_404' | 'no_body' | 'hard' | 'hard_cleanup' | 'local' | 'unconfirmed' | 'read_started' : 'body';
    if (!owner.diagnostics().revoked) owner.mintRecord(selected === 'record_anchor_mismatch' ? other!.anchor() : owner.anchor(), recordKind);
    if (selected === 'duplicate_context') owner.initialize();
    if (selected === 'duplicate_anchor') owner.bindAnchor(owner.context());
    if (selected === 'duplicate_record') owner.mintRecord(owner.anchor());
    if (owner.diagnostics().counts.records) {
        const bound = owner.envelope(); let requested = bound;
        if (selected.startsWith('foreign_')) {
            const key = selected.slice(8) as keyof Envelope;
            requested = Object.freeze({ ...bound, [key]: other!.envelope()[key] });
        }
        if (selected === 'record_copy') requested = Object.freeze({ ...bound, record: Object.freeze({ ...bound.record }) });
        if (selected === 'external_diagnostic' || selected === 'json_diagnostic') {
            const diagnostic = owner.diagnostics(), copy = selected === 'json_diagnostic' ? JSON.parse(JSON.stringify(diagnostic)) : diagnostic;
            requested = Object.freeze({ ...bound, record: copy as Record });
        }
        if (selected === 'expired') owner.fake.time = 50000;
        if (selected === 'reverse_clock') owner.fake.time = 60001;
        if (selected === 'clock_rewind') owner.fake.time = 59000;
        if (selected === 'clock_throw') owner.fake.throws = true;
        if (selected === 'issue_reentry') owner.fake.action = () => { owner.issue(bound); };
        if (selected === 'cancel_during_issue') owner.fake.action = () => { owner.stop(); };
        if (selected === 'stop_before_issue') owner.stop();
        if (selected === 'retry_after_failure' || selected === 'stop_after_failure') requested = Object.freeze({ ...bound, record: Object.freeze({ ...bound.record }) });
        if (selected === 'consume_before_issue') owner.consume(bound, {});
        owner.issue(requested);
        if (selected === 'duplicate_issue' || selected === 'retry_after_failure') owner.issue(bound);
        if (selected === 'stop_after_issue' || selected === 'stop_after_failure') owner.stop('closed');
        if (selected.startsWith('consume_') && selected !== 'consume_before_issue') {
            let expected = bound, token: unknown = owner.token();
            if (selected === 'consume_foreign_token' || selected === 'consume_foreign_then_retry') token = other!.token();
            else if (selected.startsWith('consume_foreign_')) {
                const key = selected.slice('consume_foreign_'.length) as keyof Envelope;
                expected = Object.freeze({ ...bound, [key]: other!.envelope()[key] });
            }
            if (selected === 'consume_token_copy') token = Object.freeze({ ...owner.token() });
            if (selected === 'consume_diagnostic_token') token = owner.diagnostics();
            if (selected === 'consume_cancel_before' || selected === 'consume_close_before') owner.stop(selected === 'consume_close_before' ? 'closed' : 'cancelled');
            if (selected === 'consume_expired' || selected === 'consume_no_body_expired') owner.fake.time = 50000;
            if (selected === 'consume_after_floor') owner.fake.time = 49999;
            if (selected === 'consume_before_floor') owner.fake.time = 50001;
            if (selected === 'consume_nonfinite') owner.fake.time = NaN;
            if (selected === 'consume_clock_rewind') owner.fake.time = 59000;
            let observations = 0;
            owner.fake.action = () => {
                const n = ++observations;
                const isPre = selected.startsWith('consume_pre_'), isPost = selected.startsWith('consume_post_');
                if (n !== (isPre ? 1 : isPost ? 2 : -1)) {
                    if (selected === 'consume_clock_rewind' && n === 2) owner.fake.time = 59500;
                    if (selected === 'consume_retry_after_failure' && n === 1) owner.fake.throws = true;
                    return;
                }
                if (selected.endsWith('_reentry')) owner.consume(bound, owner.token());
                if (selected.endsWith('_cancel')) owner.stop();
                if (selected.endsWith('_close')) owner.stop('closed');
                if (selected.endsWith('_throw') || selected === 'consume_post_retry_after_failure') owner.fake.throws = true;
                if (selected.endsWith('_expired')) owner.fake.time = 50000;
            };
            owner.consume(expected, token);
            if (selected === 'consume_duplicate' || selected === 'consume_retry_after_failure' || selected === 'consume_post_retry_after_failure' || selected === 'consume_foreign_then_retry') {
                owner.fake.throws = false; owner.fake.action = () => {}; owner.consume(bound, owner.token());
            }
            if (selected === 'consume_reissue') owner.issue(bound);
            if (selected === 'consume_then_stop') owner.stop('closed');
            if (selected === 'consume_json_result') owner.consume(bound, JSON.parse(JSON.stringify(owner.diagnostics().consumption)));
        }
    }
    return Object.freeze({ ok: true as const, kind: 'status_context_contract_fixture' as const, diagnostic: owner.diagnostics(),
        foreign_unchanged: !other || JSON.stringify(other.diagnostics()) === JSON.stringify(foreignBefore), permissions });
}
