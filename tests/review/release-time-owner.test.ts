import {expect, it} from 'vitest';
import {createReleaseTimeScope, type ReleaseTimeBinding, type ReleaseTimeStop} from '../../src/servicenow/review-kernel/release-time-owner.js';
const S = '2026-11-01T00:00:00.000Z', O = '2026-11-01T00:00:01.000Z';
const binding = (): ReleaseTimeBinding => Object.freeze({run: {}, session: {}, source: {}, key: {}, origin: {}, budget: {}, started_at: S, deadline_ms: 60000});
it('moves the same observation once into a non-executable upper time slot', () => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined);
  scope.allocate(b); scope.observe(b, O); const transfer = scope.issue(b); scope.accept(b, transfer);
  expect(scope.inspect()).toMatchObject({state: 'held', time: {started_at: S, deadline_ms: 60000, observed_at: O, last_utc: O}});
});
it('rejects a repeated allocation and does not allow restart', () => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined);
  scope.allocate(b);
  expect(() => scope.allocate(b)).toThrow('internal_review_error');
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null});
  expect(() => scope.observe(b, O)).toThrow('internal_review_error');
});
it('rejects a foreign binding without spending another scope', () => {
  const b = binding(), other = binding(), f = createReleaseTimeScope(b, () => undefined), g = createReleaseTimeScope(other, () => undefined);
  expect(() => f.allocate(other)).toThrow('internal_review_error');
  g.allocate(other); g.observe(other, O); g.accept(other, g.issue(other));
  expect(g.inspect().state).toBe('held');
});
it('refuses a copied transfer while preserving the original foreign scope', () => {
  const b = binding(), other = binding(), f = createReleaseTimeScope(b, () => undefined), g = createReleaseTimeScope(other, () => undefined);
  f.allocate(b); f.observe(b, O); f.issue(b);
  g.allocate(other); g.observe(other, O); const transfer = g.issue(other);
  expect(() => f.accept(b, {...transfer})).toThrow('internal_review_error');
  g.accept(other, transfer); expect(g.inspect().state).toBe('held');
});
it.each([1, 2, 3, 4, 5, 6, 7, 8])('preserves cancellation/deadline at guard %i and cannot restart', at => {
  const b = binding(); let checks = 0;
  const code: ReleaseTimeStop = at % 2 ? 'cancelled' : 'deadline_exceeded';
  const scope = createReleaseTimeScope(b, () => ++checks === at ? code : undefined);
  expect(() => { scope.allocate(b); scope.observe(b, O); scope.accept(b, scope.issue(b)); }).toThrow(code);
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null, diagnostic: {code}});
  expect(() => scope.allocate(b)).toThrow(code);
});
it.each(['2026-10-31T23:59:59.999Z', '2026-11-01T00:01:00.001Z', 'not-utc', '2026-02-30T00:00:00.000Z'])('refuses invalid/out-of-window O %s', observed => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b);
  expect(() => scope.observe(b, observed)).toThrow('internal_review_error');
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null});
});
it('discards held times once and cannot restart', () => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined);
  scope.allocate(b); scope.observe(b, O); scope.accept(b, scope.issue(b)); scope.discard(b);
  expect(scope.inspect()).toMatchObject({state: 'discarded', time: null, diagnostic: null});
  expect(() => scope.discard(b)).toThrow('internal_review_error');
  expect(() => scope.allocate(b)).toThrow('internal_review_error');
  expect(JSON.stringify(scope.inspect())).not.toContain('2026');
});
it('synchronously revokes held times and preserves the first fixed diagnostic', () => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined);
  scope.allocate(b); scope.observe(b, O); scope.accept(b, scope.issue(b)); scope.revoke('cancelled');
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null, diagnostic: {code: 'cancelled', phase: 'revoke'}});
  scope.revoke('deadline_exceeded'); expect(() => scope.allocate(b)).toThrow('cancelled');
});
it.each([S, '2026-11-01T00:01:00.000Z'])('allows UTC equality at %s without changing full L', observed => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined);
  scope.allocate(b); scope.observe(b, observed); scope.accept(b, scope.issue(b));
  expect(scope.inspect().time).toEqual({started_at: S, deadline_ms: 60000, observed_at: observed, last_utc: observed});
});
it.each([0, -1, 60001, 1.5, NaN, Infinity])('refuses invalid full deadline %s before observation', deadline_ms => {
  const b = {...binding(), deadline_ms}, scope = createReleaseTimeScope(b, () => undefined);
  expect(() => scope.allocate(b)).toThrow('internal_review_error'); expect(scope.inspect().time).toBeNull();
});
it.each(['run', 'session', 'source', 'key', 'origin', 'budget', 'started_at', 'deadline_ms'] as const)('refuses mutated %s on the original binding', key => {
  const b = {...binding()}, scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b);
  Object.assign(b, {[key]: key === 'started_at' ? O : key === 'deadline_ms' ? 15000 : {}});
  expect(() => scope.observe(b, O)).toThrow('internal_review_error'); expect(scope.inspect().time).toBeNull();
});
it.each(['observe', 'issue', 'accept'] as const)('refuses repeated %s and retains no reusable transfer', phase => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b); scope.observe(b, O);
  if (phase === 'observe') expect(() => scope.observe(b, O)).toThrow('internal_review_error');
  else { const transfer = scope.issue(b);
    if (phase === 'issue') expect(() => scope.issue(b)).toThrow('internal_review_error');
    else { scope.accept(b, transfer); expect(() => scope.accept(b, transfer)).toThrow('internal_review_error'); }
    expect(() => scope.accept(b, transfer)).toThrow('internal_review_error');
  }
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null});
});
it.each(['foreign', 'clone', 'snapshot'] as const)('rejects %s transfer without affecting its original scope', mode => {
  const b = binding(), other = binding(), f = createReleaseTimeScope(b, () => undefined), g = createReleaseTimeScope(other, () => undefined);
  f.allocate(b); f.observe(b, O); f.issue(b); g.allocate(other); g.observe(other, O); const t = g.issue(other);
  const value = mode === 'foreign' ? t : mode === 'clone' ? structuredClone(t) : g.inspect();
  expect(() => f.accept(b, value)).toThrow('internal_review_error'); g.accept(other, t); expect(g.inspect().state).toBe('held');
});
it.each([1, 2, 3, 4, 5, 6, 7, 8])('fails closed on caught reentry at guard %i', at => {
  const b = binding(); let n = 0;
  const scope = createReleaseTimeScope(b, () => {
    if (++n === at) { try { scope.allocate(b); } catch {} }
    return undefined;
  });
  expect(() => {scope.allocate(b); scope.observe(b, O); scope.accept(b, scope.issue(b));}).toThrow('internal_review_error');
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null});
});
it.each([9, 10])('preserves a stop at discard guard %i without retaining held times', at => {
  const b = binding(); let n = 0;
  const scope = createReleaseTimeScope(b, () => ++n === at ? 'deadline_exceeded' : undefined);
  scope.allocate(b); scope.observe(b, O); scope.accept(b, scope.issue(b));
  expect(() => scope.discard(b)).toThrow('deadline_exceeded'); expect(scope.inspect().time).toBeNull();
});
it('normalizes a throwing guard without leaking its raw exception or overwriting external diagnostics', () => {
  const diagnostics = Object.freeze({http: 'http_503', cleanup: 'unconfirmed'}), b = binding();
  const scope = createReleaseTimeScope(b, () => {throw Error('PRIVATE_EXCEPTION');});
  expect(() => scope.allocate(b)).toThrow('internal_review_error');
  expect(JSON.stringify(scope.inspect())).not.toContain('PRIVATE_EXCEPTION');
  expect(diagnostics).toEqual({http: 'http_503', cleanup: 'unconfirmed'});
});
it('refuses cloned bindings with identical fields and does not accept guessed values before issuance', () => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b);
  expect(() => scope.observe({...b}, O)).toThrow('internal_review_error');
  const next = createReleaseTimeScope(b, () => undefined); next.allocate(b);
  expect(() => next.accept(b, {started_at: S, deadline_ms: 60000, observed_at: O})).toThrow('internal_review_error');
});
it.each(['allocated', 'observed', 'issued'] as const)('invalidates %s values synchronously and refuses later acceptance', phase => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b);
  if (phase !== 'allocated') scope.observe(b, O);
  const t = phase === 'issued' ? scope.issue(b) : {};
  scope.revoke('cancelled'); expect(() => scope.accept(b, t)).toThrow('cancelled');
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null});
});
it('rejects an accessor substituted into the bound identity without executing or exposing it', () => {
  const b = {...binding()}, scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b); let calls = 0;
  Object.defineProperty(b, 'origin', {get() {calls++; throw Error('PRIVATE_GETTER');}});
  expect(() => scope.observe(b, O)).toThrow('internal_review_error');
  expect(calls).toBe(0); expect(scope.inspect()).toMatchObject({state: 'failed', time: null});
});
it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('preserves synchronous revocation at guard %i even if the callback returns normally', at => {
  const b = binding(); let checks = 0;
  const scope = createReleaseTimeScope(b, () => {if (++checks === at) scope.revoke('cancelled'); return undefined;});
  expect(() => {scope.allocate(b); scope.observe(b, O); scope.accept(b, scope.issue(b)); scope.discard(b);}).toThrow('cancelled');
  expect(scope.inspect()).toMatchObject({state: 'failed', time: null, diagnostic: {code: 'cancelled', phase: 'revoke'}});
});
it.each(['', 'PRIVATE_START', '2026-02-30T00:00:00.000Z'])('rejects invalid pinned S without retaining raw diagnostics: %s', started_at => {
  const b = {...binding(), started_at}, scope = createReleaseTimeScope(b, () => undefined);
  expect(() => scope.allocate(b)).toThrow('internal_review_error'); expect(scope.inspect()).toMatchObject({state: 'failed', time: null});
  expect(scope.inspect().diagnostic).toEqual({code: 'internal_review_error', phase: 'allocate'});
});
it('refuses a remaining-time replacement, despite O fitting that smaller value', () => {
  const b = {...binding()}, scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b); b.deadline_ms = 15000;
  expect(() => scope.observe(b, O)).toThrow('internal_review_error');
});
it('exposes only frozen non-authoritative data, never identity or a transfer handle', () => {
  const b = binding(), scope = createReleaseTimeScope(b, () => undefined); scope.allocate(b); scope.observe(b, O);
  const t = scope.issue(b); expect(Object.getPrototypeOf(t)).toBeNull(); expect(Object.keys(t)).toEqual([]);
  scope.accept(b, t); const data = scope.inspect();
  expect(Object.keys(data)).toEqual(['state', 'time', 'diagnostic']); expect(Object.isFrozen(data)).toBe(true); expect(Object.isFrozen(data.time)).toBe(true);
  const copy = structuredClone(data); scope.discard(b);
  expect(() => scope.accept(b, copy)).toThrow('internal_review_error'); expect(scope.inspect().time).toBeNull();
});
it('keeps a completed discard terminal when later calls are refused', () => {
  const S = '2026-11-01T00:00:00.000Z', b = Object.freeze({run: {}, session: {}, source: {}, key: {}, origin: {}, budget: {}, started_at: S, deadline_ms: 60000});
  const scope = createReleaseTimeScope(b, () => undefined);
  scope.allocate(b); scope.observe(b, S); const handle = scope.issue(b); scope.accept(b, handle); scope.discard(b);
  for (const call of [() => scope.accept(b, handle), () => scope.issue(b), () => scope.discard(b), () => scope.allocate(b), () => scope.observe(b, S)])
    expect(call).toThrow('internal_review_error');
  scope.revoke('cancelled');
  expect(scope.inspect()).toEqual({state: 'discarded', time: null, diagnostic: null});
});
