import { describe, expect, it } from 'vitest';
import { createProbeBodyPinConfirmationStagesFake } from './fixtures/snapshot-read-composition-fake.js';

function finite(value: unknown) {
  const q = [value]; let count = 0;
  while (q.length) {
    const v = q.pop(); expect(++count).toBeLessThan(600);
    if (v === null || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const key of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, key)!;
      expect(typeof key).toBe('string'); expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (key !== 'length') q.push(d.value); }
  }
}

describe('closed same-owner pin confirmation stages', () => {
  it('confirms both intermediate posts but stops before the final post', () => {
    const a = createProbeBodyPinConfirmationStagesFake(), r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ model: 'wfb-body-pin-confirmation-stages-1', ok: false,
      disposition: 'pin_final_post_not_connected', first: 'construction_unconfirmed' });
    expect(s).toMatchObject({ confirmation: { prepared: true, finalPostChecked: false, acceptedReturn: 'not_connected' },
      stages: { point: 'blocked', failurePoint: 'blocked', checkedPostChecked: true, confirmedPostChecked: true, completed: true },
      build: { receiver: { pinStage: 'confirmed', first: 'receiver_unconfirmed' }, source: { claim: 'unused', first: 'receiver_unconfirmed' },
        rootReady: false, bodyStarts: 0 }, receiverPin: { step: 'confirmed', failureStep: 'confirmed' },
      route: { phase: 'BP03', step: 'call', preparingConfirmed: false, postChecked: false } });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
    finite(r); finite(a.inspect());
  });
  it('preserves checked ownership and its completed post when the next observation throws', () => {
    const a = createProbeBodyPinConfirmationStagesFake('cs_fault_before_confirmed'), r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ first: 'construction_unconfirmed', disposition: 'construction_unconfirmed' });
    expect(s).toMatchObject({ stages: { point: 'before_confirmed', failurePoint: 'before_confirmed', checkedPostChecked: true,
      confirmedPostChecked: false, completed: false }, confirmation: { finalPostChecked: false },
      build: { receiver: { pinStage: 'captured', first: 'receiver_unconfirmed', failureBoundary: 'before' } },
      receiverPin: { step: 'checked', failureStep: 'checked' }, reference: { boundary: 'before' } });
    expect(s.build.receiver.references.filter(v => v.retained)).toHaveLength(2);
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
  });
  it('stops after confirmed recording without claiming its post when closed', () => {
    const a = createProbeBodyPinConfirmationStagesFake('cs_close_confirmed'), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('closed');
    expect(s).toMatchObject({ stages: { failurePoint: 'confirmed', checkedPostChecked: true, confirmedPostChecked: false, completed: false },
      build: { receiver: { pinStage: 'confirmed', first: 'closed' }, source: { first: 'closed', stopRequested: true } },
      confirmation: { finalPostChecked: false }, entryBusy: false, callActive: false });
    expect(a.prepare()).toBe(r);
  });
  it('keeps a prior reason separate from the later refusal', () => {
    const a = createProbeBodyPinConfirmationStagesFake('cs_prior_checked'), r = a.prepare();
    expect(r.first).toBe('state_invalid');
    expect(a.inspect()).toMatchObject({ stages: { failurePoint: 'checked', checkedPostChecked: false, completed: false },
      build: { source: { first: 'state_invalid' }, receiver: { first: 'state_invalid' } } });
  });
  it('refuses nested entry without spending another trial or losing stage progress', () => {
    const a = createProbeBodyPinConfirmationStagesFake('cs_reenter_before_confirmed');
    expect(a.prepare().disposition).toBe('pin_final_post_not_connected');
    expect(a.inspect()).toMatchObject({ fixedCalls: 1, stages: { reentry: 'refused_existing', completed: true },
      route: { refusal: 'in_progress' }, build: { receiver: { pinAttemptUsed: true, pinStage: 'confirmed' }, bodyStarts: 0 } });
  });
  it.each(['before_checked', 'checked', 'before_confirmed', 'confirmed', 'blocked'].flatMap((p, i) =>
    ['fault', 'close', 'prior', 'reenter'].map(k => [p, i, k] as const)))(
    'keeps the independent prefix at %s / %s / %s', (point, index, kind) => {
      const a = createProbeBodyPinConfirmationStagesFake('cs_' + kind + '_' + point), r = a.prepare(), s = a.inspect();
      const end = kind === 'reenter' ? 4 : index;
      const reason = kind === 'close' ? 'closed' : kind === 'prior' ? 'state_invalid' : 'construction_unconfirmed';
      expect(r).toMatchObject({ first: reason, disposition: kind === 'reenter' ? 'pin_final_post_not_connected' : reason });
      expect(s).toMatchObject({ stages: { point: kind === 'reenter' ? 'blocked' : point,
        failurePoint: kind === 'reenter' ? 'blocked' : point, checkedPostChecked: end >= 2, confirmedPostChecked: end === 4,
        completed: kind === 'reenter', reentry: kind === 'reenter' ? 'refused_existing' : 'none' },
        confirmation: { finalPostChecked: false }, entryBusy: false, callActive: false,
        route: { failurePhase: 'BP03', failureStep: 'call', failureBoundary: kind === 'close' || kind === 'prior' ? 'before' : 'after' },
        receiverPin: { step: end === 0 ? 'current' : end < 3 ? 'checked' : 'confirmed' },
        build: { receiver: { pinStage: end < 3 ? 'captured' : 'confirmed',
          first: kind === 'close' ? 'closed' : kind === 'prior' ? 'state_invalid' : 'receiver_unconfirmed',
          failureBoundary: end === 0 || end === 2 ? 'before' : 'after' }, source: { claim: 'unused', bindCallReached: false,
          postConfirmed: false, failureBoundary: 'call' }, storage: { state: 'failed', dataCreated: 0 }, bodyStarts: 0, rootReady: false } });
      expect(s.build.receiver.references.filter(v => v.retained)).toHaveLength(2);
      const original = s.stages; expect(a.check()).toBe(r); expect(a.checkLegacy()).toBe(r); expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
      expect(a.inspect().stages).toEqual(original);
      finite(a.inspect());
    });
  it('rejects public values and hooks instead of adopting authority', () => {
    let hooks = 0; const hostile = new Proxy({}, { get() { hooks++; throw Error('private_secret'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[hostile], [() => hooks++], ['cs_normal', hostile], ['before_final_post'], [createProbeBodyPinConfirmationStagesFake().inspect()]]) {
      const a = createProbeBodyPinConfirmationStagesFake(...args); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, stages: { point: 'none', completed: false }, confirmation: { finalPostChecked: false } });
      expect(JSON.stringify(a.inspect())).not.toContain('private_secret');
    }
    expect(hooks).toBe(0);
  });
  it.each(['check', 'checkLegacy'] as const)('does not turn unstarted %s into a cached terminal', method => {
    const a = createProbeBodyPinConfirmationStagesFake(); expect(a[method]().first).toBe('none');
    expect(a.inspect().confirmation.replyAttempted).toBe(false);
    expect(a.prepare().disposition).toBe('pin_final_post_not_connected');
  });
  it('keeps close before construction terminal and starts no receiver', () => {
    const a = createProbeBodyPinConfirmationStagesFake(), r = a.close(); expect(r.disposition).toBe('closed');
    expect(a.prepare()).toBe(r); expect(a.inspect()).toMatchObject({ fixedCalls: 0, stages: { completed: false } });
  });
  it('retains completed intermediate posts when terminal reply materialization throws', () => {
    const a = createProbeBodyPinConfirmationStagesFake('cs_reply_throw');
    expect(() => a.prepare()).toThrowError(new Error('private_confirmation_reply_fault'));
    expect(a.inspect()).toMatchObject({ confirmation: { diagnosticRecorded: true, finalPostChecked: false },
      stages: { completed: true, checkedPostChecked: true, confirmedPostChecked: true, failurePoint: 'blocked' } });
    expect(() => a.prepare()).toThrowError(new Error('private_confirmation_reply_unconfirmed'));
    expect(a.inspect().build.receiver.references.filter(v => v.retained)).toHaveLength(2);
  });
  it.each(['si_producer_throw', 'pc_fault_checked', 'ps_fault_entry_before', 'pb_fault_checked', 'ec_foreign_source',
    'ec_copy_source', 'ec_proxy_source', 'ec_foreign_start', 'ec_proxy_start', 'ec_fault_before_call', 'ec_close_preflight_before',
    'rs_copy_current', 'rs_missing_current'])('does not enter later stages after predecessor %s', script => {
    const a = createProbeBodyPinConfirmationStagesFake(script), r = a.prepare();
    const first = script === 'ec_close_preflight_before' ? 'closed' : script === 'rs_missing_current' ? 'state_invalid'
      : script.startsWith('ec_') && script !== 'ec_fault_before_call' || script === 'rs_copy_current' ? 'binding_mismatch' : 'construction_unconfirmed';
    expect(r.first).toBe(first);
    expect(a.inspect()).toMatchObject({ hookObserved: false, stages: { point: 'none', completed: false,
      checkedPostChecked: false, confirmedPostChecked: false }, confirmation: { finalPostChecked: false }, build: { rootReady: false, bodyStarts: 0 } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('does not restart for extra %s arguments', method => {
    const a = createProbeBodyPinConfirmationStagesFake(), r = a.prepare(), before = a.inspect();
    a[method]({ private_secret: true }); expect(a.prepare()).toBe(r); expect(a.inspect().stages).toEqual(before.stages);
    expect(JSON.stringify(a.inspect())).not.toContain('private_secret');
  });
});
