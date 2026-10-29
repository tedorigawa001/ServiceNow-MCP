import { expect, it } from 'vitest';
import { createCanonicalBootstrapBudget } from '../../src/servicenow/review-canonical-bootstrap-budget.js';
it('binds C/G to one fresh canonical lease and closes update authority without refunding', () => {
    const b = createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 } });
    b.accounting.reserve();
    b.accounting.dispatch(50250);
    b.accounting.chunk(3);
    expect(b.lease.read()).toEqual({ requests: 1, received_bytes: 3, payload_bytes: 0, remaining_ms: 60000 });
    expect(b.accounting.reserved()).toBe(4);
    b.accounting.release();
    b.accounting.release();
    expect(b.accounting.reserved()).toBe(0);
    expect(b.lease.read().requests).toBe(1);
    expect(() => b.accounting.dispatch(50250)).toThrow('internal_review_error');
});
it('cannot reserve twice or restart after release', () => {
    const b = createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 } });
    b.accounting.reserve();
    expect(() => b.accounting.reserve()).toThrow('internal_review_error');
    expect(() => b.accounting.dispatch(50000)).toThrow('internal_review_error');
    expect(b.lease.read().requests).toBe(0);
    b.accounting.release();
    expect(() => b.accounting.reserve()).toThrow('internal_review_error');
});
it('cannot dispatch or charge before reserve or adopt another budget state', () => {
    const b = createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 } });
    expect(() => b.accounting.dispatch(50000)).toThrow('internal_review_error');
    expect(() => b.accounting.chunk(1)).toThrow('internal_review_error');
    expect(b.lease.read()).toMatchObject({ requests: 0, received_bytes: 0, payload_bytes: 0 });
    expect(() => createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 }, initial: { requests: 3 } } as never)).toThrow('invalid_input');
});
it('rejects G equality before dispatch and retains a previous overshoot', () => {
    const b = createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 }, limits: { total_bytes: 3 } });
    b.accounting.reserve();
    b.accounting.chunk(3);
    expect(() => b.accounting.dispatch(50000)).toThrow('receive_budget_exceeded');
    expect(b.lease.read()).toMatchObject({ requests: 0, received_bytes: 3 });
    const c = createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 }, limits: { total_bytes: 3 } });
    c.accounting.reserve();
    expect(() => c.accounting.chunk(4)).toThrow('receive_budget_exceeded');
    expect(c.lease.read().received_bytes).toBe(4);
});
it.each([{ requests: 3 }, { requests: 211 }, { response_bytes: 4194305 }, { total_bytes: 0 }, { deadline_ms: NaN }, { unexpected: 1 }])('rejects invalid bootstrap limits without observing the clock: %j', limits => {
    let calls = 0;
    expect(() => createCanonicalBootstrapBudget({ clock: { remainingMs() { calls++; return 60000; } }, limits: limits as never })).toThrow('invalid_input');
    expect(calls).toBe(0);
});
it('pins data-only dependencies and never accepts an accessor as authority', () => {
    let reads = 0;
    expect(() => createCanonicalBootstrapBudget({ get clock() { reads++; return { remainingMs: () => 60000 }; } })).toThrow('invalid_input');
    expect(reads).toBe(0);
    expect(() => createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 }, limits: { get requests() { reads++; return 210; } } })).toThrow('invalid_input');
    expect(reads).toBe(0);
});
it('does not expose a reset, session registration, payload writer or raw canonical writer', () => {
    const b = createCanonicalBootstrapBudget({ clock: { remainingMs: () => 60000 } });
    expect(Object.keys(b).sort()).toEqual(['accounting', 'diagnostic', 'lease', 'limits']);
    expect(Object.keys(b.lease)).toEqual(['read']);
    expect(Object.isFrozen(b)).toBe(true);
    expect(b.diagnostic().evidence_issuance).toBe('disabled');
});
