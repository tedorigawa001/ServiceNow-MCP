import { describe, expect, it } from 'vitest';
import { createProbeBodyPinConfirmationFake, createProbeBodyPinFinalPostFake } from './fixtures/snapshot-read-composition-fake.js';

describe('C-c final post / internal accepted / fixed upper stop', () => {
  it('keeps the callee completed while stopping the original caller before PC08', () => {
    const a = createProbeBodyPinFinalPostFake(), r = a.prepare();
    expect(r).toMatchObject({ ok: false, disposition: 'pin_return_not_connected', first: 'construction_unconfirmed', execution: 'closed' });
    expect(a.inspect()).toMatchObject({ contract: { finalPost: true, acceptedReturns: 1, completion: 'completion_observed',
      attempts: 1, phase: 'replayable', currentPoint: 'final_post_before', failurePoint: 'none', pc08: 'not_connected', bodyStarts: 0 },
    pipeline: { fixedCalls: 1, result: 'accepted', callActive: false, entryBusy: false, sourceReason: 'construction_unconfirmed',
      confirmation: { finalPost: 'synthetic_only', acceptedReturn: 'synthetic_only', callerCompletion: 'synthetic_only' },
      stages: { finalPost: 'synthetic_only' },
      route: { failurePhase: 'BP03', failureStep: 'call', failureBoundary: 'after' },
      build: { bodyStarts: 0, source: { state: 'failed', claim: 'unused', first: 'construction_unconfirmed' }, receiver: { first: 'none' } } } });
    expect(a.check()).toBe(r); expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
    expect(a.inspect().pipeline.build.receiver.first).toBe('none');
  });
  it('stops before the final marker on close, retaining the original before-position', () => {
    const a = createProbeBodyPinFinalPostFake('cc_close_final_post_before'), r = a.prepare();
    expect(r).toMatchObject({ disposition: 'closed', first: 'closed' });
    expect(a.inspect()).toMatchObject({ contract: { finalPost: false, acceptedReturns: 0, failurePoint: 'final_post_before',
      phase: 'replayable', attempts: 1, completion: 'rejected' },
    pipeline: { result: 'rejected_attempt', sourceReason: 'closed', route: { failureBoundary: 'before' },
      build: { source: { first: 'closed', stopRequested: true }, receiver: { first: 'closed', failureBoundary: 'before' } } } });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it.each([
    ['cc_fault_final_post_before', 'construction_unconfirmed', 'receiver_unconfirmed', 'after'],
    ['cc_prior_final_post_before', 'state_invalid', 'state_invalid', 'before'],
  ] as const)('retains the failure prefix for %s without accepted or repair', (script, first, receiver, boundary) => {
    const a = createProbeBodyPinFinalPostFake(script), r = a.prepare();
    expect(r).toMatchObject({ first, disposition: first });
    expect(a.inspect()).toMatchObject({ contract: { finalPost: false, acceptedReturns: 0, failurePoint: 'final_post_before',
      currentPoint: 'final_post_before', attempts: 1, phase: 'replayable' },
    pipeline: { fixedCalls: 1, result: 'rejected_attempt', route: { failureBoundary: boundary },
      stages: { checkedPostChecked: true, confirmedPostChecked: true, completed: true },
      build: { receiver: { first: receiver, pinStage: 'confirmed' }, source: { claim: 'unused', first: receiver } } } });
    expect(a.check()).toBe(r); expect(a.close()).toBe(r);
  });
  it('refuses nested enter without consuming the outer result or issuing a second call', () => {
    const a = createProbeBodyPinFinalPostFake('cc_reenter_final_post_before');
    expect(a.prepare().disposition).toBe('pin_return_not_connected');
    expect(a.inspect()).toMatchObject({ contract: { finalPost: true, acceptedReturns: 1, failurePoint: 'none' },
      pipeline: { fixedCalls: 1, stages: { reentry: 'refused_existing' }, build: { receiver: { first: 'none' } } } });
  });
  it.each([['cb_freeze_throw', 'failed_empty', false], ['cb_root_finally_throw', 'failed_cached', true]] as const)(
    'retains callee completion and one-shot ownership after %s', (script, phase, retained) => {
      const a = createProbeBodyPinFinalPostFake(script);
      expect(() => a.prepare()).toThrow('private_final_delivery_unconfirmed');
      expect(a.inspect()).toMatchObject({ contract: { finalPost: true, acceptedReturns: 1, completion: 'completion_observed',
        first: 'construction_unconfirmed', disposition: 'pin_return_not_connected', phase, attempts: 1, cacheRetained: retained },
      pipeline: { result: 'accepted', build: { receiver: { first: 'none' } } } });
      for (const op of ['prepare', 'check', 'checkLegacy', 'close'] as const) expect(() => a[op]()).toThrow('private_final_delivery_unconfirmed');
      expect(a.inspect().contract.attempts).toBe(1); expect(a.inspect().pipeline.build.receiver.first).toBe('none');
    });
  it.each(['si_proxy', 'pc_fault_checked', 'pb_fault_checked', 'ec_fault_before_call', 'cs_fault_checked',
    'cs_close_confirmed', 'rs_copy_current', 'before_1', 'after_37'])(
    'does not enter the final continuation after predecessor failure %s', script => {
      const old = createProbeBodyPinConfirmationFake(script); old.prepare();
      const a = createProbeBodyPinFinalPostFake(script); a.prepare();
      const prior = old.inspect().pipeline;
      expect(a.inspect().pipeline).toEqual({ ...prior, confirmation: { ...prior.confirmation,
        finalPost: 'synthetic_only', acceptedReturn: 'synthetic_only', callerCompletion: 'synthetic_only' },
      stages: { ...prior.stages, finalPost: 'synthetic_only' } });
      expect(a.inspect().contract).toMatchObject({ currentPoint: 'none', failurePoint: 'none', finalPost: false, acceptedReturns: 0 });
    });
  it('keeps first none after preconstruction close, and never adopts public objects as proof', () => {
    let hooks = 0;
    const hostile = new Proxy({}, { get() { hooks++; throw Error('private_secret'); }, ownKeys() { hooks++; throw Error('private_secret'); },
      getPrototypeOf() { hooks++; throw Error('private_secret'); } });
    const a = createProbeBodyPinFinalPostFake(), r = a.close(); expect(r.first).toBe('none');
    expect(a.prepare(hostile)).toBe(r); expect(a.check()).toBe(r);
    expect(a.inspect().contract).toMatchObject({ first: 'none', finalPost: false, acceptedReturns: 0, deliveryFirst: 'input_refused' });
    for (const value of [hostile, a, a.inspect(), () => { hooks++; }]) {
      expect(createProbeBodyPinFinalPostFake(value).prepare().first).toBe('input_rejected');
    }
    expect(hooks).toBe(0); expect(JSON.stringify(a.inspect())).not.toContain('private_secret');
  });
});
