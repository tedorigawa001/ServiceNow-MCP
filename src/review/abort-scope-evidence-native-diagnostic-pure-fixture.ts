/** BG01: fixed data-only cases, independent of runtime friends and resource adapters. */
import { types } from 'node:util';
import { createNativeDiagnosticState, permissions, type Binding, type Purpose } from './abort-scope-evidence-native-diagnostic-state.js';

const id = (): object => Object.freeze(Object.create(null));
const makeBinding = (): Binding => Object.freeze({ run: id(), session: id(), snapshot: id(), lease: id(), core: id(),
    source: id(), constructor: id(), transport: id() });

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
    const { binding: expected, owner } = createNativeDiagnosticState();
    const { binding: foreignBinding, owner: foreign } = createNativeDiagnosticState();
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
