import { describe, expect, it } from 'vitest';
import { createProbeBodyPinStartFake } from './fixtures/snapshot-read-composition-fake.js';

const points = [['identity', 'before', false, false], ['entry', 'before', false, true], ['entry', 'after', false, true],
  ['started', 'after', true, true], ['preflight', 'before', true, true], ['preflight', 'after', true, true], ['blocked', 'before', true, true]] as const;
function finite(value: unknown) {
  const q = [value]; let n = 0;
  while (q.length) {
    const v = q.pop(); expect(++n).toBeLessThan(500);
    if (v === null || typeof v !== 'object') { expect(['string', 'number', 'boolean']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}

describe('C-02 front: private caller admission without a fixed pin call', () => {
  it('starts once on the same source/start, then intentionally fails closed before a receiver call', () => {
    const a = createProbeBodyPinStartFake(), r = a.prepare();
    expect(r).toMatchObject({ model: 'wfb-body-pin-start-1', disposition: 'pin_call_not_connected', first: 'construction_unconfirmed', ok: false });
    expect(a.inspect()).toMatchObject({ callerConfirmed: true, admission: 'accepted', busy: false, step: 'blocked', boundary: 'before',
      callBlocked: true, failureStep: 'blocked', failureSourceBoundary: 'checked',
      route: { attempted: true, state: 'failed', phase: 'BP02', step: 'preflight', first: 'construction_unconfirmed',
        failureRecorded: true, failurePhase: 'BP02', preparingConfirmed: false, postChecked: false },
      contracts: { state: 'held', checked: true, preparationFirst: 'none', failurePhase: 'none' },
      build: { phase: 'BP01', step: 'after', failureRecorded: false, stopRequested: false,
        source: { state: 'failed', claim: 'unused', phase: 'BP02', boundary: 'checked', pinCallReached: false,
          failurePhase: 'BP02', failureBoundary: 'checked' },
        receiver: { pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free' }, storage: { state: 'failed', dataCreated: 0 } },
      fixedCall: 'not_connected', pinStorage: 'not_connected', formalIssuance: 'closed', wholeRunAdmission: 'disabled',
      implementation: 'unknown', investigations: 'on_hold' });
    expect(a.inspect().build.receiver.references.every(r => !r.retained)).toBe(true);
    expect(a.prepare()).toBe(r); expect(a.check()).toBe(r); expect(a.close()).toBe(r);
    expect(a.inspect().build.source.stopMirrored).toBe(true);
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
  });
  it('keeps the first pin failure when entry throws before the start reservation', () => {
    const a = createProbeBodyPinStartFake('ps_fault_entry_before'), r = a.prepare();
    expect(r.first).toBe('construction_unconfirmed');
    expect(a.inspect()).toMatchObject({ callerConfirmed: true, admission: 'pending', busy: false, step: 'entry', boundary: 'before',
      failureStep: 'entry', failureSourceBoundary: 'before', callBlocked: false,
      route: { attempted: false, state: 'failed', failureRecorded: true, first: 'construction_unconfirmed', failurePhase: 'BP02' },
      contracts: { state: 'held', preparationFirst: 'none', failurePhase: 'none' },
      build: { phase: 'BP01', failureRecorded: false, source: { failurePhase: 'BP02', failureBoundary: 'before', pinCallReached: false } } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.inspect().failureStep).toBe('entry');
  });
  it('refuses same-source reentry before reservation without poisoning the original attempt', () => {
    const a = createProbeBodyPinStartFake('ps_reenter_entry_before'), r = a.prepare();
    expect(r.disposition).toBe('pin_call_not_connected');
    expect(a.inspect()).toMatchObject({ reentry: 'refused_existing', busy: false, admission: 'accepted',
      route: { attempted: true, refusal: 'in_progress', first: 'construction_unconfirmed' },
      contracts: { preparationFirst: 'none' } });
  });
  it('handles close after reservation without refunding it or rewriting first position', () => {
    const a = createProbeBodyPinStartFake('ps_close_started_after'), r = a.prepare();
    expect(r.first).toBe('closed');
    expect(a.inspect()).toMatchObject({ step: 'started', failureStep: 'started', busy: false, callBlocked: false,
      route: { attempted: true, state: 'failed', first: 'closed', failurePhase: 'BP02', failureBoundary: 'after' },
      build: { stopRequested: true, source: { first: 'closed', failurePhase: 'BP02', failureBoundary: 'before', stopMirrored: true } } });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it.each(['si_producer_throw', 'si_proxy', 'pc_fault_checked'])('keeps earlier %s failure outside the pin-start diagnosis', script => {
    const a = createProbeBodyPinStartFake(script), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe(script === 'si_proxy' ? 'binding_mismatch' : 'construction_unconfirmed');
    expect(s).toMatchObject({ step: 'none', admission: 'not_started', callerConfirmed: false, busy: false,
      route: { attempted: false, failureRecorded: false, first: 'none' }, callBlocked: false,
      build: { failureRecorded: script !== 'pc_fault_checked', receiver: { pinAttemptUsed: false } } });
    if (script === 'pc_fault_checked') expect(s.contracts).toMatchObject({ state: 'failed', failurePhase: 'checked' });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); finite(a.inspect());
  });
  it('stops before generation when closed before prepare', () => {
    const a = createProbeBodyPinStartFake(), r = a.close();
    expect(a.prepare().disposition).toBe('closed'); expect(r.first).toBe('none');
    expect(a.inspect()).toMatchObject({ step: 'none', admission: 'not_started', callerConfirmed: false,
      route: { attempted: false, failureRecorded: false }, build: { source: { state: 'not_created' } } });
  });
  it('rejects contexts, summaries and callbacks without running input hooks', () => {
    let hooks = 0;
    const hostile = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const value of [hostile, () => { hooks++; }, createProbeBodyPinStartFake().inspect()]) {
      const a = createProbeBodyPinStartFake(value); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect()).toMatchObject({ step: 'none', callerConfirmed: false, route: { attempted: false }, build: { source: { state: 'not_created' } } });
    }
    expect(hooks).toBe(0);
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('preserves first diagnosis on extra arguments to %s after stop', name => {
    const a = createProbeBodyPinStartFake(), r = a.prepare(); a[name]({ secret: 'not-a-context' });
    expect(a.prepare()).toBe(r); expect(a.inspect()).toMatchObject({ failureStep: 'blocked',
      route: { attempted: true, first: 'construction_unconfirmed', failurePhase: 'BP02' },
      contracts: { preparationFirst: 'none' } }); finite(a.inspect());
  });
  it.each(['foreign_root', 'foreign_source', 'foreign_start', 'copy_source', 'proxy_root', 'proxy_source', 'proxy_start'])(
    'rejects outer %s before a reservation or any candidate hook', kind => {
      const a = createProbeBodyPinStartFake('ps_' + kind), r = a.prepare();
      expect(r.first).toBe('binding_mismatch'); expect(a.inspect()).toMatchObject({ callerConfirmed: false, admission: 'rejected_attempt',
        busy: false, hookObserved: false, callBlocked: false, step: 'identity', failureStep: 'identity',
        route: { attempted: false, state: 'failed', first: 'binding_mismatch', refusal: 'foreign_source', failurePhase: 'BP02' },
        contracts: { preparationFirst: 'none', failurePhase: 'none' },
        build: { failureRecorded: false, storage: { state: 'failed' }, source: { pinCallReached: false, claim: 'unused', sameReference: true } } });
      expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); finite(a.inspect());
    });
  it.each(points.flatMap(([step, boundary, started, qualified], i) => ['fault', 'close', 'prior', 'reenter'].map(mode =>
    [step, boundary, started, qualified, i, mode] as const)))(
    'preserves %s/%s start=%s qualified=%s index=%s mode=%s', (step, boundary, started, qualified, i, mode) => {
      const a = createProbeBodyPinStartFake('ps_' + mode + '_' + step + '_' + boundary), r = a.prepare(), s = a.inspect();
      if (mode === 'reenter') {
        expect(r.disposition).toBe('pin_call_not_connected'); expect(s).toMatchObject({ reentry: 'refused_existing', admission: 'accepted',
          route: { refusal: i < 4 ? 'in_progress' : 'duplicate_pin', attempted: true }, callBlocked: true });
      } else {
        const first = mode === 'close' ? 'closed' : mode === 'prior' ? 'state_invalid' : 'construction_unconfirmed';
        expect(r.first).toBe(first); expect(s).toMatchObject({ callerConfirmed: qualified, failureStep: step, step, boundary,
          admission: i < 4 ? 'pending' : 'accepted', callBlocked: false,
          failureSourceBoundary: step === 'blocked' || step === 'preflight' && boundary === 'after' ? 'checked' : 'before',
          route: { attempted: started, state: 'failed', first, failurePhase: 'BP02', preparingConfirmed: false, postChecked: false },
          build: { stopRequested: mode === 'close' } });
      }
      expect(s).toMatchObject({ busy: false, contracts: { state: 'held', checked: true, preparationFirst: 'none', failurePhase: 'none' },
        build: { phase: 'BP01', step: 'after', failureRecorded: false, rootReady: false, grantAttempts: 0, dutyUsed: false, bodyStarts: 0,
          source: { claim: 'unused', pinCallReached: false, bindCallReached: false, postConfirmed: false },
          receiver: { pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free' }, storage: { state: 'failed', dataCreated: 0 } } });
      expect(s.build.receiver.references.every(r => !r.retained)).toBe(true);
      expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.checkLegacy()).toBe(r); finite(a.inspect());
    });
});
