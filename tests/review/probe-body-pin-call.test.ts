import { describe, expect, it } from 'vitest';
import { createProbeBodyPinCallFake } from './fixtures/snapshot-read-composition-fake.js';

const points = ['before_call', 'preflight_before', 'preflight_after', 'attempt_after', 'returned'] as const;
function finite(value: unknown) {
  const q = [value]; let n = 0;
  while (q.length) {
    const v = q.pop(); expect(++n).toBeLessThan(500);
    if (v === null || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(typeof k).toBe('string'); expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}

describe('fixed synthetic pin call and entry without reference storage', () => {
  it('enters the same receiver once and drains busy flags before a fixed storage refusal', () => {
    const a = createProbeBodyPinCallFake(), r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ model: 'wfb-body-pin-call-1', disposition: 'pin_storage_not_connected', first: 'construction_unconfirmed', ok: false });
    expect(s).toMatchObject({ phase: 'returned', failurePhase: 'returned', fixedCalls: 1, callActive: false, entryBusy: false,
      result: 'rejected_attempt', sourceReason: 'receiver_unconfirmed',
      route: { attempted: true, state: 'failed', phase: 'BP03', step: 'call', boundary: 'after',
        failurePhase: 'BP03', failureStep: 'call', failureBoundary: 'after', preparingConfirmed: false, postChecked: false },
      build: { phase: 'BP01', failureRecorded: false, storage: { dataCreated: 0 },
        source: { pinCallReached: true, claim: 'unused', first: 'receiver_unconfirmed', phase: 'BP03', boundary: 'call', failureBoundary: 'call' },
        receiver: { pinAttemptUsed: true, pinStage: 'attempting', occupancy: 'free', first: 'receiver_unconfirmed',
          failurePhase: 'pin', failurePrefix: 'none', failureBoundary: 'after' }, rootReady: false, bodyStarts: 0 },
      receiverPin: { step: 'attempt', failureStep: 'attempt' }, pinStorage: 'not_connected', binding: 'not_connected',
      formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold' });
    expect(s.build.receiver.references.every(r => !r.retained)).toBe(true);
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); expect(a.checkLegacy()).toBe(r);
    expect(a.inspect()).toMatchObject({ fixedCalls: 1, callActive: false, entryBusy: false,
      route: { failurePhase: 'BP03', failureStep: 'call', failureBoundary: 'after' },
      build: { source: { stopMirrored: true, first: 'receiver_unconfirmed', claim: 'unused' },
        receiver: { pinStage: 'attempting', first: 'receiver_unconfirmed', failureBoundary: 'after' } } });
  });
  it('stops inside receiver preflight and releases busy without recording a trial or reference', () => {
    const a = createProbeBodyPinCallFake('ec_close_preflight_before'), r = a.prepare();
    expect(r.first).toBe('closed');
    expect(a.inspect()).toMatchObject({ fixedCalls: 1, phase: 'returned', failurePhase: 'calling', callActive: false, entryBusy: false,
      route: { failurePhase: 'BP03', failureStep: 'call', failureBoundary: 'before' },
      build: { stopRequested: true, source: { pinCallReached: true, first: 'closed', stopMirrored: true },
        receiver: { pinAttemptUsed: false, pinStage: 'empty', first: 'closed', failurePhase: 'pin', failureBoundary: 'before' } },
      receiverPin: { step: 'preflight', failureStep: 'preflight' } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
  });
  it('rejects a foreign source before call without reading its hooks', () => {
    const a = createProbeBodyPinCallFake('ec_proxy_source'), r = a.prepare();
    expect(r.first).toBe('binding_mismatch');
    expect(a.inspect()).toMatchObject({ fixedCalls: 0, callActive: false, entryBusy: false,
      route: { failurePhase: 'BP02' }, build: { source: { pinCallReached: false, claim: 'unused' },
        receiver: { pinAttemptUsed: false, pinStage: 'empty', first: 'none' } } });
  });
  it.each(points.flatMap((p, i) => ['fault', 'close', 'prior', 'root_reenter'].map(k => [p, i, k] as const)))(
    'preserves independent caller/receiver prefix at %s / %s / %s', (point, i, kind) => {
      const a = createProbeBodyPinCallFake('ec_' + kind + '_' + point), r = a.prepare(), s = a.inspect();
      const reentry = kind === 'root_reenter', completed = i === 4 || reentry;
      const first = completed || kind === 'fault' ? 'construction_unconfirmed' : kind === 'close' ? 'closed' : 'state_invalid';
      const called = i > 0 || reentry, attempted = i >= 3 || reentry;
      const receiverFirst = !called ? 'none' : first === 'construction_unconfirmed' ? 'receiver_unconfirmed' : first;
      const rootBoundary = !called || completed || kind === 'fault' ? 'after' : 'before';
      expect(r.first).toBe(first); expect(s).toMatchObject({ fixedCalls: called ? 1 : 0, callActive: false, entryBusy: false,
        phase: called ? 'returned' : 'before', failurePhase: !called ? 'before' : !completed && kind !== 'fault' ? 'calling' : 'returned',
        result: called ? 'rejected_attempt' : 'none',
        reentry: reentry ? i === 4 ? 'rejected_attempt' : 'refused_existing' : 'none',
        route: { failurePhase: called ? 'BP03' : 'BP02', failureBoundary: rootBoundary },
        build: { phase: 'BP01', failureRecorded: false, rootReady: false, bodyStarts: 0, grantAttempts: 0, dutyUsed: false,
          storage: { dataCreated: 0 }, stopRequested: kind === 'close',
          source: { pinCallReached: called, claim: 'unused', failureBoundary: called ? 'call' : 'checked' },
          receiver: { pinAttemptUsed: attempted, pinStage: attempted ? 'attempting' : 'empty', first: receiverFirst,
            failurePhase: called ? 'pin' : 'none', failurePrefix: 'none',
            failureBoundary: !called ? 'none' : attempted ? 'after' : 'before' } },
        receiverPin: { step: !called ? 'none' : attempted ? 'attempt' : 'preflight', failureStep: !called ? 'none' : attempted ? 'attempt' : 'preflight' } });
      expect(s.build.receiver.references.every(r => !r.retained)).toBe(true);
      expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); expect(a.checkLegacy()).toBe(r); finite(a.inspect());
    });
  it.each(points.slice(1))('refuses a receiver reentry at %s without changing the original result', point => {
    const a = createProbeBodyPinCallFake('ec_reenter_' + point), r = a.prepare(), s = a.inspect();
    expect(r.disposition).toBe('pin_storage_not_connected');
    expect(s).toMatchObject({ fixedCalls: 1, result: 'rejected_attempt', reentry: point === 'returned' ? 'rejected_attempt' : 'refused_existing',
      callActive: false, entryBusy: false, route: { refusal: point === 'returned' ? 'none' : 'in_progress' },
      build: { receiver: { pinAttemptUsed: true, pinStage: 'attempting', first: 'receiver_unconfirmed' } } });
  });
  it.each(['foreign_source', 'copy_source', 'proxy_source', 'foreign_start', 'proxy_start'])(
    'rejects %s with no call or foreign hook', kind => {
      const a = createProbeBodyPinCallFake('ec_' + kind); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, hookObserved: false, callActive: false, entryBusy: false,
        build: { source: { pinCallReached: false, sameReference: true }, receiver: { pinAttemptUsed: false, first: 'none' } } });
    });
  it.each(['si_producer_throw', 'pc_fault_checked', 'ps_fault_entry_before', 'pb_fault_checked'])(
    'keeps earlier %s failure outside the call continuation', script => {
      const a = createProbeBodyPinCallFake(script), r = a.prepare(); expect(r.first).toBe('construction_unconfirmed');
      expect(a.inspect()).toMatchObject({ phase: 'none', failurePhase: 'none', fixedCalls: 0, callActive: false, entryBusy: false });
      expect(a.close()).toBe(r); finite(a.inspect());
    });
  it('does not construct a source when closed before prepare', () => {
    const a = createProbeBodyPinCallFake(); a.close(); expect(a.prepare().disposition).toBe('closed');
    expect(a.inspect()).toMatchObject({ fixedCalls: 0, build: { source: { state: 'not_created' } } });
  });
  it('rejects untrusted inputs without evaluating getters, proxies or callbacks', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const xs of [[p], [() => hooks++], [createProbeBodyPinCallFake().inspect()], ['ec_normal', p]]) {
      const a = createProbeBodyPinCallFake(...xs); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect().fixedCalls).toBe(0); finite(a.inspect());
    }
    expect(hooks).toBe(0);
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('retains first result on extra %s arguments', method => {
    const a = createProbeBodyPinCallFake(), r = a.prepare(); a[method]({ secret: 'not-an-anchor' });
    expect(a.prepare()).toBe(r); expect(a.inspect().fixedCalls).toBe(1); finite(a.inspect());
  });
});
