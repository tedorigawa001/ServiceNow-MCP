import { describe, expect, it } from 'vitest';
import { createProbeBodyPinStorageFake } from './fixtures/snapshot-read-composition-fake.js';

const points = ['before', 'checked', 'before_issued', 'blocked'] as const;
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
describe('synthetic pin storage preparation without reference storage', () => {
  it('checks the same live attempt and stops before storing an issued reference', () => {
    const a = createProbeBodyPinStorageFake(), r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ model: 'wfb-body-pin-storage-1', ok: false, disposition: 'pin_storage_not_connected', first: 'construction_unconfirmed' });
    expect(s).toMatchObject({ storage: { point: 'blocked', failurePoint: 'blocked', boundary: 'before' }, fixedCalls: 1,
      callActive: false, entryBusy: false, result: 'rejected_attempt', referenceStorage: 'not_connected',
      build: { source: { claim: 'unused', pinCallReached: true, first: 'receiver_unconfirmed' },
        receiver: { pinAttemptUsed: true, pinStage: 'attempting', first: 'receiver_unconfirmed', failureBoundary: 'before' },
        rootReady: false, bodyStarts: 0 } });
    expect(s.build.receiver.references.every(v => !v.retained)).toBe(true);
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
    expect(a.inspect().storage).toEqual(s.storage);
  });
  it('keeps a close before issuance distinct from an after-attempt failure', () => {
    const a = createProbeBodyPinStorageFake('sp_close_before_issued'), r = a.prepare();
    expect(r.first).toBe('closed');
    expect(a.inspect()).toMatchObject({ storage: { point: 'before_issued', failurePoint: 'before_issued', boundary: 'before' },
      callActive: false, entryBusy: false, build: { source: { first: 'closed', stopMirrored: true },
        receiver: { pinStage: 'attempting', first: 'closed', failurePhase: 'pin', failureBoundary: 'before' } } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
  });
  it.each(points.flatMap((p, i) => ['fault', 'close', 'prior', 'reenter'].map(k => [p, i, k] as const)))(
    'retains the independent prefix for %s / %s / %s', (point, i, kind) => {
      const a = createProbeBodyPinStorageFake('sp_' + kind + '_' + point), r = a.prepare(), s = a.inspect();
      const completed = kind === 'reenter', first = kind === 'close' ? 'closed' : kind === 'prior' ? 'state_invalid' : 'construction_unconfirmed';
      const boundary = completed || i >= 2 ? 'before' : i === 1 ? 'after' : 'none';
      expect(r.first).toBe(first);
      expect(s).toMatchObject({ storage: { point: completed ? 'blocked' : point, failurePoint: completed ? 'blocked' : point,
        boundary, reentry: completed ? 'refused_existing' : 'none' },
        fixedCalls: 1, callActive: false, entryBusy: false, result: 'rejected_attempt',
        route: { failurePhase: 'BP03', failureStep: 'call', failureBoundary: kind === 'close' || kind === 'prior' ? 'before' : 'after',
          preparingConfirmed: false, postChecked: false },
        build: { phase: 'BP01', failureRecorded: false, rootReady: false, bodyStarts: 0, grantAttempts: 0, dutyUsed: false,
          storage: { dataCreated: 0 }, source: { claim: 'unused', pinCallReached: true, bindCallReached: false, postConfirmed: false },
          receiver: { pinAttemptUsed: true, pinStage: 'attempting', occupancy: 'free', bindingState: 'empty', prefix: 'none',
            first: first === 'construction_unconfirmed' ? 'receiver_unconfirmed' : first,
            failurePhase: 'pin', failurePrefix: 'none', failureBoundary: boundary } },
        receiverPin: { step: 'attempt', failureStep: 'attempt' }, referenceStorage: 'not_connected', returnAcceptance: 'not_connected',
        formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold' });
      expect(s.build.receiver.references.every(v => !v.retained)).toBe(true);
      expect(a.prepare()).toBe(r); expect(a.checkLegacy()).toBe(r); expect(a.close()).toBe(r);
      expect(a.inspect().storage).toEqual(s.storage); finite(a.inspect());
    });
  it.each(['ec_foreign_source', 'ec_copy_source', 'ec_proxy_source', 'ec_foreign_start', 'ec_proxy_start'])(
    'does not enter storage for %s', script => {
      const a = createProbeBodyPinStorageFake(script); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, hookObserved: false, storage: { point: 'none', failurePoint: 'none', boundary: 'none' },
        build: { receiver: { pinAttemptUsed: false, first: 'none' } } }); finite(a.inspect());
    });
  it.each(['si_producer_throw', 'pc_fault_checked', 'ps_fault_entry_before', 'pb_fault_checked', 'ec_close_preflight_before'])(
    'does not erase predecessor failure %s', script => {
      const a = createProbeBodyPinStorageFake(script), r = a.prepare();
      expect(r.first).toBe(script.startsWith('ec_') ? 'closed' : 'construction_unconfirmed');
      expect(a.inspect()).toMatchObject({ storage: { point: 'none', failurePoint: 'none' }, callActive: false, entryBusy: false });
      expect(a.close()).toBe(r); finite(a.inspect());
    });
  it('rejects hostile inputs without hooks or source construction', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const xs of [[p], [() => hooks++], ['sp_normal', p], [createProbeBodyPinStorageFake().inspect()]]) {
      const a = createProbeBodyPinStorageFake(...xs); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, storage: { point: 'none', boundary: 'not_created' } }); finite(a.inspect());
    }
    expect(hooks).toBe(0);
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('retains first result on extra %s arguments', method => {
    const a = createProbeBodyPinStorageFake(), r = a.prepare(); a[method]({ secret: 'not-a-pin' });
    expect(a.prepare()).toBe(r); expect(a.inspect().fixedCalls).toBe(1); finite(a.inspect());
  });
  it('keeps the boundary absent when closed before prepare', () => {
    const a = createProbeBodyPinStorageFake(); a.close(); expect(a.prepare().disposition).toBe('closed');
    expect(a.inspect()).toMatchObject({ fixedCalls: 0, storage: { point: 'none', boundary: 'not_created' } });
  });
});
