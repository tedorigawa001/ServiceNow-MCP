import { expect, it } from 'vitest';
import { createCanonicalReviewBudget } from '../../src/servicenow/review-canonical-budget.js';
it('rejects session adoption and seeded accounting inputs rather than silently accepting them', () => {
    expect(() => createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 }, initial: { requests: 9 } } as never)).toThrow('invalid_input');
});
it('rejects a class instance as the clock instead of adopting a session-shaped object', () => {
    class SessionLike {
        remainingMs() { return 60000; }
    }
    expect(() => createCanonicalReviewBudget({ clock: new SessionLike() })).toThrow('invalid_input');
});
it('sanitizes a clock exception and refuses further accounting', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs() { throw Error('PRIVATE_CLOCK'); } } });
    expect(() => writer.dispatch()).toThrow('internal_review_error');
    expect(view.stats().requests).toBe(0);
    expect(JSON.stringify(view.diagnostic())).not.toContain('PRIVATE');
});
it('refuses reentrant accounting from the clock with the original internal diagnosis', () => {
    let recurse: () => void = () => { };
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs() { recurse(); return 60000; } } });
    recurse = () => writer.chunk(1);
    expect(() => writer.dispatch()).toThrow('internal_review_error');
    expect(view.diagnostic().primary?.internal).toBe('invalid_state');
    expect(view.stats()).toEqual({ requests: 0, received_bytes: 0, payload_bytes: 0 });
});
it('does not let an immutable snapshot or a separate budget change another owner', () => {
    const a = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } }), b = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } }), snapshot = a.view.stats();
    expect(Reflect.set(snapshot, 'requests', 123)).toBe(false);
    b.writer.chunk(9);
    b.writer.stop('cancelled');
    expect(a.view.stats()).toEqual({ requests: 0, received_bytes: 0, payload_bytes: 0 });
    expect(a.view.failure()).toBeNull();
});
it.each(['evidence_binding_mismatch', 'invalid_observation_time', 'invalid_state'] as const)('retains internal %s while publishing only internal_review_error', reason => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } });
    writer.stop(reason);
    writer.stop('authentication_failed');
    expect(view.diagnostic().primary).toEqual({ internal: reason, public: 'internal_review_error' });
    expect(() => writer.chunk(1)).toThrow('internal_review_error');
    expect(view.stats().received_bytes).toBe(0);
    expect(view.lease.read().remaining_ms).toBe(60000);
});
it('retains the first ordinary stop across close and refuses every later mutation', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } });
    writer.chunk(2);
    writer.stop('cancelled');
    writer.stop('authentication_failed');
    writer.close();
    writer.close();
    for (const op of [() => writer.dispatch(), () => writer.chunk(1), () => writer.payload('x')])
        expect(op).toThrow('cancelled');
    expect(view.stats()).toEqual({ requests: 0, received_bytes: 2, payload_bytes: 0 });
    expect(view.diagnostic()).toMatchObject({ primary: { internal: 'cancelled', public: 'cancelled' }, closed: true });
});
it('retains an overshoot G charge and makes the global stop sticky', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 }, limits: { totalBytes: 5 } });
    writer.chunk(2);
    writer.chunk(3);
    expect(view.failure()).toBeNull();
    expect(() => writer.chunk(1)).toThrow('receive_budget_exceeded');
    expect(view.stats().received_bytes).toBe(6);
    expect(() => writer.chunk(1)).toThrow('receive_budget_exceeded');
    expect(view.stats().received_bytes).toBe(6);
});
it('keeps a local payload limit distinct from a total P stop and charges UTF-8 bytes once', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 }, limits: { payloadBytes: 5, totalPayloadBytes: 10 } });
    expect(() => writer.payload('日本')).toThrow('payload_limit');
    expect(view.stats().payload_bytes).toBe(6);
    expect(view.failure()).toBeNull();
    expect(() => writer.payload('12345')).toThrow('payload_budget_exceeded');
    expect(view.stats().payload_bytes).toBe(11);
    expect(view.failure()).toBe('payload_budget_exceeded');
});
it('preserves four legacy final slots without reserving them a second time', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 }, limits: { requests: 6 } });
    writer.dispatch();
    writer.dispatch();
    expect(() => writer.dispatch()).toThrow('request_budget_exceeded');
    expect(view.failure()).toBeNull();
    for (let i = 0; i < 4; i++)
        writer.dispatch(true);
    expect(view.stats().requests).toBe(6);
    expect(() => writer.dispatch(true)).toThrow('request_budget_exceeded');
    expect(view.stats().requests).toBe(6);
});
it.each([-1, NaN, Infinity, 1.1])('refuses invalid byte count %s before updating G', n => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } });
    expect(() => writer.chunk(n)).toThrow('invalid_input');
    expect(view.stats().received_bytes).toBe(0);
    expect(view.failure()).toBe('invalid_input');
});
it('refuses arithmetic overflow before mutation without allocating bytes', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } });
    writer.chunk(1);
    expect(() => writer.chunk(Number.MAX_SAFE_INTEGER)).toThrow('invalid_input');
    expect(view.stats().received_bytes).toBe(1);
});
it.each([NaN, Infinity, -1, 60001])('rejects invalid clock %s and preserves the internal diagnosis', remaining => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => remaining } });
    expect(() => writer.dispatch()).toThrow('internal_review_error');
    expect(view.diagnostic().primary?.internal).toBe('invalid_observation_time');
    expect(view.stats().requests).toBe(0);
});
it('pins the clock and limits, rejects a later increase and never creates a new time origin', () => {
    let remaining = 1000;
    const clock = { remainingMs: () => remaining }, limits = { deadlineMs: 1000, totalBytes: 5 };
    const { writer, view } = createCanonicalReviewBudget({ clock, limits });
    clock.remainingMs = () => 999999;
    limits.deadlineMs = 999999;
    limits.totalBytes = 999999;
    expect(view.lease.read().remaining_ms).toBe(1000);
    remaining = 999;
    writer.chunk(5);
    remaining = 1000;
    expect(() => writer.dispatch()).toThrow('internal_review_error');
    expect(view.stats()).toEqual({ requests: 0, received_bytes: 5, payload_bytes: 0 });
});
it('stops at hard deadline equality but leaves readonly accounting available for cleanup', () => {
    let remaining = 1;
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => remaining } });
    writer.dispatch();
    remaining = 0;
    expect(view.lease.read().remaining_ms).toBe(0);
    expect(() => writer.payload('x')).toThrow('deadline_exceeded');
    expect(view.failure()).toBe('deadline_exceeded');
    expect(view.stats().requests).toBe(1);
});
it('closes idempotently without exposing update authority or using external I/O', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } });
    const before = view.stats();
    writer.close();
    writer.close();
    expect(() => writer.dispatch()).toThrow('closed');
    expect(view.stats()).toEqual(before);
    expect(Object.keys(view).sort()).toEqual(['diagnostic', 'failure', 'lease', 'stats']);
    expect(Object.keys(view.lease)).toEqual(['read']);
    expect(view.diagnostic().evidence_issuance).toBe('disabled');
});
it.each([{ requests: 211 }, { totalBytes: 16777217 }, { deadlineMs: 60001 }, { requests: 0 }, { requests: 1.5 }, { toString: 1 }])('rejects raised or unknown limits before using the clock: %j', limits => {
    let calls = 0;
    expect(() => createCanonicalReviewBudget({ clock: { remainingMs() { calls++; return 60000; } }, limits: limits as never })).toThrow('invalid_input');
    expect(calls).toBe(0);
});
it('normalizes an unknown stop reason without retaining or reflecting secrets', () => {
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => 60000 } });
    writer.stop('PRIVATE_STOP' as never);
    expect(view.failure()).toBe('internal_review_error');
    expect(view.diagnostic().primary).toEqual({ internal: 'internal_review_error', public: 'internal_review_error' });
    expect(JSON.stringify(view.diagnostic())).not.toContain('PRIVATE');
});
it('uses one zero-initialized state for stats and a frozen readonly lease', () => {
    let remaining = 60000;
    const { writer, view } = createCanonicalReviewBudget({ clock: { remainingMs: () => remaining } });
    expect(view.stats()).toEqual({ requests: 0, received_bytes: 0, payload_bytes: 0 });
    writer.dispatch();
    writer.chunk(7);
    writer.payload('日本');
    remaining = 59900;
    const expected = { requests: 1, received_bytes: 7, payload_bytes: new TextEncoder().encode('日本').length };
    expect(view.stats()).toEqual(expected);
    expect(view.lease.read()).toEqual({ ...expected, remaining_ms: 59900 });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.lease.read())).toBe(true);
    expect(Object.keys(view.lease)).toEqual(['read']);
    expect('writer' in view).toBe(false);
});
