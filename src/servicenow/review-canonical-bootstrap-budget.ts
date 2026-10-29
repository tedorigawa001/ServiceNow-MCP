/** CM-03 fresh constructor budget only. No raw-session adoption or production transport registration. */
import { createCanonicalReviewBudget, CanonicalBudgetError } from './review-canonical-budget.js';
const maxima = Object.freeze({ requests: 210, total_bytes: 16777216, response_bytes: 4194304, deadline_ms: 60000 });
type Limits = {
    [K in keyof typeof maxima]: number;
};
export function createCanonicalBootstrapBudget(input: {
    clock: {
        remainingMs(): number;
    };
    limits?: Partial<Limits>;
}) {
    if (!input || typeof input !== 'object' || Reflect.ownKeys(input).some(k => k !== 'clock' && k !== 'limits'))
        throw new CanonicalBudgetError('invalid_input');
    const field = (key: 'clock' | 'limits') => {
        const d = Object.getOwnPropertyDescriptor(input, key);
        if (d && !Object.hasOwn(d, 'value'))
            throw new CanonicalBudgetError('invalid_input');
        return d?.value;
    };
    const clock = field('clock') as {
        remainingMs(): number;
    }, reduced = field('limits') as Partial<Limits> | undefined;
    if (reduced !== undefined && (!reduced || typeof reduced !== 'object' || Array.isArray(reduced) || Reflect.ownKeys(reduced).some(k => typeof k !== 'string' || !Object.hasOwn(maxima, k) || !Object.hasOwn(Object.getOwnPropertyDescriptor(reduced, k)!, 'value'))))
        throw new CanonicalBudgetError('invalid_input');
    const limits = Object.freeze({ ...maxima, ...reduced });
    for (const [k, n] of Object.entries(limits))
        if (!Number.isSafeInteger(n) || n < 1 || n > maxima[k as keyof Limits])
            throw new CanonicalBudgetError('invalid_input');
    if (limits.requests < 4)
        throw new CanonicalBudgetError('invalid_input');
    const core = createCanonicalReviewBudget({ clock, limits: { requests: limits.requests, totalBytes: limits.total_bytes, deadlineMs: limits.deadline_ms } });
    let port: ReturnType<typeof core.construction.takeBootstrapAccounting> | undefined;
    let released = false;
    function refuse(): never { core.writer.stop('invalid_state'); throw new CanonicalBudgetError(core.view.failure()!); }
    const accounting = Object.freeze({
        reserve() { if (released || port)
            return refuse(); port = core.construction.takeBootstrapAccounting(); port.reserve(); },
        reserved: () => port?.reserved() ?? 0,
        dispatch(floor?: number) { if (released || !port)
            return refuse(); port.dispatch(floor); },
        chunk(n: number) { if (released || !port)
            return refuse(); port.chunk(n); },
        release() { if (released)
            return; released = true; if (port)
            port.release();
        else
            core.writer.close(); },
    });
    return Object.freeze({ lease: core.view.lease, limits, accounting, diagnostic: () => Object.freeze({ ...core.view.diagnostic(), reservation: released ? 'released' : core.construction.status().reservation, reserved: accounting.reserved(), budget: core.view.stats() }) });
}
