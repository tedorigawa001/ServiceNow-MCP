import { describe, expect, it } from 'vitest';
import { createProbeBodyBindFieldsFake, createProbeBodyBundleFake } from './fixtures/snapshot-read-composition-fake.js';

function finite(value: unknown): void {
  const queue = [value]; let size = 0;
  while (queue.length) {
    const v = queue.pop(); expect(++size).toBeLessThan(250);
    if (v === null || typeof v !== 'object') { expect(['number', 'boolean', 'string']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) {
      expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') queue.push(d.value);
    }
  }
}
function closed(a: ReturnType<typeof createProbeBodyBindFieldsFake>): void {
  const s = a.inspect();
  expect(s).toMatchObject({ rootReady: false, bodyStarts: 0, grantAttempts: 0, dutyUsed: false, dataCreated: 0,
    sourceIssuance: 'not_connected', pin: 'not_connected', claimConsumption: 'not_connected', binding: 'not_connected', constructionReady: 'not_connected' });
  expect(s.source).toEqual({ state: 'not_created', claim: 'not_created', issuedRetained: false, currentRetained: false,
    rejectedRetained: false, metadataConfirmed: false });
  expect(s.receiver.pinAttemptUsed).toBe(false);
  expect(s.receiver.references.map(r => [r.field, r.retained])).toEqual([
    ['bodyExpectedSourceIssued', false], ['bodyExpectedSourceCurrent', false], ['bodyExpectedSourceRejected', false],
    ['bodyBundleIssued', false], ['bodyBundleCurrent', false], ['bodyRejectedBundle', false],
    ['bodyDraftIssued', false], ['bodyDraftCurrent', false], ['bodyRejectedDraft', false],
  ]);
  finite(s);
}

describe('body bind primitive fields without issuance or pin', () => {
  it('retains only primitive prior fields on the same start while source issuance stays absent', () => {
    const a = createProbeBodyBindFieldsFake();
    expect(a.inspect().receiver.available).toBe(false);
    expect(a.prepare()).toMatchObject({ model: 'wfb-body-bind-fields-1', ok: false, disposition: 'bind_fields_held', first: 'none' });
    const s = a.inspect();
    expect(s).toMatchObject({ state: 'held', rootReady: false, phase: 'after', failurePhase: 'none', authority: 'none', execution: 'closed',
      formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold',
      source: { state: 'not_created', claim: 'not_created', issuedRetained: false, currentRetained: false, rejectedRetained: false, metadataConfirmed: false },
      receiver: { available: true, pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free', bindingState: 'empty', prefix: 'none',
        first: 'none', failurePhase: 'none', failurePrefix: 'none', failureBoundary: 'none', refusal: 'none' },
      sourceIssuance: 'not_connected', pin: 'not_connected', claimConsumption: 'not_connected', binding: 'not_connected',
      constructionReady: 'not_connected', bodyStarts: 0, grantAttempts: 0, dutyUsed: false, dataCreated: 0 });
    expect(s.receiver.references).toHaveLength(9); expect(s.receiver.references.every(r => r.retained === false)).toBe(true);
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('not_ready');
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
    const old = createProbeBodyBundleFake(); expect(old.prepare().disposition).toBe('bundle_held');
    closed(a); finite(a.prepare());
  });
  it.each(['before', 'checked', 'after'])('keeps empty ownership and the failure location at %s', phase => {
    const a = createProbeBodyBindFieldsFake(`bf_fault_${phase}`), r = a.prepare();
    expect(r).toMatchObject({ first: 'construction_unconfirmed', disposition: 'construction_unconfirmed' });
    expect(a.inspect()).toMatchObject({ state: 'failed', phase, failurePhase: phase });
    for (const op of [a.prepare, a.check, a.checkLegacy, a.close]) expect(op()).toBe(r);
    closed(a);
  });
  it.each(['before', 'checked', 'after'])('retains a close at %s without issuing a pin or grant', phase => {
    const a = createProbeBodyBindFieldsFake(`bf_close_${phase}`), r = a.prepare();
    expect(r.first).toBe('closed'); expect(a.inspect()).toMatchObject({ state: 'failed', closed: true, failurePhase: phase });
    expect(a.prepare()).toBe(r); closed(a);
  });
  it.each(['before', 'checked', 'after'])('rejects a second prepare at %s without reentry effects', phase => {
    const a = createProbeBodyBindFieldsFake(`bf_reenter_${phase}`);
    expect(a.prepare().disposition).toBe('bind_fields_held');
    expect(a.inspect()).toMatchObject({ state: 'held', first: 'none', reentry: 'construction_in_progress' }); closed(a);
  });
  it('preserves the first root and receiver diagnosis through a later throw and invalid call', () => {
    const a = createProbeBodyBindFieldsFake('bf_prior_diagnostic'), r = a.prepare();
    expect(r.first).toBe('state_invalid');
    expect(a.inspect()).toMatchObject({ failurePhase: 'checked', receiver: { first: 'state_invalid', failurePhase: 'none',
      failurePrefix: 'none', failureBoundary: 'none', pinStage: 'empty', bindingState: 'empty' } });
    expect(a.check('later')).toBe(r); expect(a.close()).toBe(r); closed(a);
  });
  it('keeps pre-start close and post-hold close separate from a source claim', () => {
    const before = createProbeBodyBindFieldsFake(); expect(before.close().disposition).toBe('closed');
    expect(before.prepare().disposition).toBe('closed'); expect(before.inspect().receiver.available).toBe(false); closed(before);
    const after = createProbeBodyBindFieldsFake(); after.prepare(); after.close();
    expect(after.check().disposition).toBe('closed'); expect(after.checkLegacy().disposition).toBe('closed'); closed(after);
  });
  it('does not evaluate arbitrary inputs, hooks, registrations or same-value summary copies', () => {
    let calls = 0; const hostile = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
    const good = createProbeBodyBindFieldsFake(); good.prepare();
    for (const xs of [[hostile], [() => calls++], [good], [good.inspect()], [{ ...good.inspect() }], ['unknown'], ['bf_normal', hostile]]) {
      const a = createProbeBodyBindFieldsFake(...xs);
      expect(a.prepare().first).toBe('input_rejected'); expect(a.inspect().receiver.available).toBe(false); closed(a);
    }
    expect(calls).toBe(0); expect(good.inspect().first).toBe('none');
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('rejects supplied arguments at %s and never reopens execution', name => {
    const a = createProbeBodyBindFieldsFake(); a.prepare(); a[name]({});
    expect(a.check().first).toBe('input_rejected'); expect(a.inspect()).toMatchObject({ first: 'input_rejected', state: 'failed' }); closed(a);
  });
});
