import { describe, expect, it } from 'vitest';
import { createProbeBodyPinConfirmationFake } from './fixtures/snapshot-read-composition-fake.js';

describe('C-b fresh closed entry and owning outer return', () => {
  it('runs the original fixed construction once and replays only its closed terminal', () => {
    const a = createProbeBodyPinConfirmationFake();
    expect(a.checkLegacy()).toMatchObject({ disposition: 'not_ready' });
    const reply = a.prepare();
    expect(reply).toMatchObject({ model: 'wfb-body-pin-confirmation-1', ok: false,
      disposition: 'construction_unconfirmed', first: 'construction_unconfirmed', execution: 'closed' });
    expect(a.check()).toBe(reply); expect(a.checkLegacy()).toBe(reply); expect(a.prepare()).toBe(reply);
    expect(a.inspect()).toMatchObject({ contract: { sealed: true, attempts: 1, phase: 'replayable',
      rootEntryExit: 'returned', publicEntryBusy: false, finalPost: false, bodyStarts: 0, sourceGenerations: 1 },
    pipeline: { fixedCalls: 1, result: 'rejected_attempt', stages: { completed: true, finalPost: 'not_connected' } } });
  });
  it('keeps a sealed diagnosis without retrying a failed freeze', () => {
    const a = createProbeBodyPinConfirmationFake('cb_freeze_throw');
    expect(() => a.prepare()).toThrow('private_final_delivery_unconfirmed');
    expect(a.inspect()).toMatchObject({ contract: { first: 'construction_unconfirmed', sealed: true,
      phase: 'failed_empty', attempts: 1, deliveryFirst: 'view_unconfirmed', rootEntryExit: 'threw', publicEntryBusy: false } });
    expect(() => a.check()).toThrow('private_final_delivery_unconfirmed');
    expect(a.inspect().contract.attempts).toBe(1);
  });
  it('defers close inside the owning frame and stops before producing a source', () => {
    const a = createProbeBodyPinConfirmationFake('cb_close_frame');
    expect(a.prepare()).toMatchObject({ disposition: 'closed', first: 'closed' });
    expect(a.inspect()).toMatchObject({ reentry: 'deferred_frame', frame: 'inactive', contract: { stopped: true,
      first: 'closed', sealed: true, phase: 'replayable', attempts: 1, sourceGenerations: 0 },
    pipeline: { fixedCalls: 0, result: 'none' } });
  });
  it('never publishes a cache retained before the outer finally throws', () => {
    const a = createProbeBodyPinConfirmationFake('cb_root_finally_throw');
    expect(() => a.prepare()).toThrow('private_final_delivery_unconfirmed');
    expect(a.inspect()).toMatchObject({ frame: 'inactive', contract: { first: 'construction_unconfirmed', sealed: true,
      cacheRetained: true, phase: 'failed_cached', attempts: 1, rootEntryExit: 'threw', deliveryFirst: 'root_exit_unconfirmed' } });
    for (const op of ['prepare', 'check', 'checkLegacy', 'close'] as const) expect(() => a[op]()).toThrow('private_final_delivery_unconfirmed');
    expect(a.inspect().contract.cacheRetained).toBe(true);
  });
  it.each(Array.from({ length: 37 }, (_, i) => i + 1).flatMap(n => ['before', 'attempt', 'after', 'done'].map(p => [n, p] as const)))(
    'keeps early construction prefix %i/%s under the same terminal policy', (n, point) => {
      const a = createProbeBodyPinConfirmationFake(`${point}_${n}`), r = a.prepare();
      expect(r).toMatchObject({ first: 'construction_unconfirmed', disposition: 'construction_unconfirmed' });
      expect(a.inspect()).toMatchObject({ prefix: { phase: n, boundary: point,
        retained: n - 1 + Number(point === 'after' || point === 'done') },
      contract: { phase: 'replayable', attempts: 1, sourceGenerations: 0 }, pipeline: { fixedCalls: 0 } });
      expect(a.check()).toBe(r); expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
    });
  it.each([
    ['si_producer_throw', 'construction_unconfirmed', 0], ['si_fault_BP00_issued_after', 'construction_unconfirmed', 0],
    ['si_fault_BP00_fix_2_after', 'construction_unconfirmed', 0], ['si_fault_BP01_checked_after', 'construction_unconfirmed', 0],
    ['si_copy', 'binding_mismatch', 0], ['si_proxy', 'binding_mismatch', 0],
    ['pc_fault_checked', 'construction_unconfirmed', 0], ['pc_close_checked', 'closed', 0],
    ['ps_fault_preflight_before', 'construction_unconfirmed', 0], ['ps_prior_preflight_after', 'state_invalid', 0],
    ['pb_fault_checked', 'construction_unconfirmed', 0], ['ec_fault_before_call', 'construction_unconfirmed', 0],
    ['ec_foreign_source', 'binding_mismatch', 0], ['ec_proxy_source', 'binding_mismatch', 0],
    ['cs_fault_checked', 'construction_unconfirmed', 1], ['cs_close_confirmed', 'closed', 1],
    ['cs_prior_blocked', 'state_invalid', 1], ['rs_copy_current', 'binding_mismatch', 1],
  ] as const)('routes %s through one closed terminal without losing its first reason', (script, first, calls) => {
    const a = createProbeBodyPinConfirmationFake(script), r = a.prepare();
    expect(r).toMatchObject({ first, disposition: first });
    expect(a.inspect()).toMatchObject({ frame: 'inactive', contract: { sealed: true, attempts: 1, phase: 'replayable',
      finalPost: false, acceptedReturns: 0, bodyStarts: 0 }, pipeline: { fixedCalls: calls, build: { hookCalls: 0 } } });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); expect(a.check()).toBe(r);
  });
  it.each(['cb_reenter_frame', 'cb_reenter_cached'])('refuses %s without lending it the original entry return', script => {
    const a = createProbeBodyPinConfirmationFake(script), r = a.prepare();
    expect(r.first).toBe('construction_unconfirmed');
    expect(a.inspect()).toMatchObject({ reentry: 'construction_in_progress', contract: { phase: 'replayable',
      rootEntryExit: 'returned', attempts: 1, publicEntryBusy: false } });
  });
  it('seals preconstruction close with first none and keeps it across later invalid input', () => {
    const a = createProbeBodyPinConfirmationFake(), r = a.close();
    expect(r).toMatchObject({ first: 'none', disposition: 'closed' });
    expect(a.prepare('secret')).toBe(r); expect(a.close()).toBe(r);
    expect(a.inspect()).toMatchObject({ contract: { first: 'none', phase: 'replayable', deliveryFirst: 'input_refused', sourceGenerations: 0 } });
  });
  it('keeps inspection-only input failure unsealed until its owning terminal entry', () => {
    let hooks = 0;
    const input = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); },
      getPrototypeOf() { hooks++; throw Error('secret'); } });
    const a = createProbeBodyPinConfirmationFake();
    expect(a.inspect(input)).toMatchObject({ contract: { first: 'input_rejected', sealed: false, attempts: 0 } });
    const r = a.prepare(); expect(r.first).toBe('input_rejected'); expect(a.check(input)).toBe(r);
    for (const x of [input, a, a.inspect(), { ...a.inspect() }, () => { hooks++; }]) {
      expect(createProbeBodyPinConfirmationFake(x).prepare().first).toBe('input_rejected');
    }
    expect(hooks).toBe(0); expect(JSON.stringify(a.inspect())).not.toContain('secret');
  });
});
