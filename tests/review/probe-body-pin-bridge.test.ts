import { describe, expect, it } from 'vitest';
import { createProbeBodyPinBridgeFake } from './fixtures/snapshot-read-composition-fake.js';

function finite(value: unknown) {
  const q = [value]; let n = 0;
  while (q.length) {
    const v = q.pop(); expect(++n).toBeLessThan(500);
    if (v === null || typeof v !== 'object') { expect(['string', 'number', 'boolean']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(typeof k).toBe('string'); expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}

describe('closed pin bridge preparation', () => {
  it('checks the same private owner without starting a call or receiver attempt', () => {
    const a = createProbeBodyPinBridgeFake(), r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ model: 'wfb-body-pin-bridge-1', disposition: 'pin_bridge_not_connected', first: 'construction_unconfirmed', ok: false });
    expect(s).toMatchObject({ identityConfirmed: true, checked: true, callActive: false, entryBusy: false,
      activeQualification: false, phase: 'blocked', failurePhase: 'blocked',
      route: { attempted: true, state: 'failed', failurePhase: 'BP02', failureStep: 'preflight', failureBoundary: 'after' },
      build: { phase: 'BP01', failureRecorded: false, source: { claim: 'unused', pinCallReached: false,
        failurePhase: 'BP02', failureBoundary: 'checked' }, receiver: { pinAttemptUsed: false, pinStage: 'empty' },
        storage: { dataCreated: 0 }, bodyStarts: 0, rootReady: false },
      fixedCall: 'not_connected', pinStorage: 'not_connected', formalIssuance: 'closed', wholeRunAdmission: 'disabled',
      implementation: 'unknown', investigations: 'on_hold' });
    expect(s.build.receiver.references.every(r => !r.retained)).toBe(true);
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); expect(a.checkLegacy()).toBe(r);
    expect(a.inspect().build.source.stopMirrored).toBe(true);
  });
  it('keeps a close at the checked boundary without inventing a call or refunding the start', () => {
    const a = createProbeBodyPinBridgeFake('pb_close_checked'), r = a.prepare();
    expect(r.first).toBe('closed');
    expect(a.inspect()).toMatchObject({ phase: 'checked', failurePhase: 'checked', checked: false,
      identityConfirmed: true, callActive: false, entryBusy: false,
      route: { attempted: true, first: 'closed', failurePhase: 'BP02', failureBoundary: 'after' },
      build: { failureRecorded: false, source: { pinCallReached: false, stopMirrored: true, failureBoundary: 'checked' } } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.inspect().failurePhase).toBe('checked');
  });
  it.each(['before', 'checked', 'blocked'].flatMap((p, i) => ['fault', 'close', 'prior', 'reenter'].map(k => [p, i, k] as const)))(
    'keeps the independent prefix at %s / %s / %s', (phase, i, kind) => {
      const a = createProbeBodyPinBridgeFake('pb_' + kind + '_' + phase), r = a.prepare(), s = a.inspect();
      const first = kind === 'close' ? 'closed' : kind === 'prior' ? 'state_invalid' : 'construction_unconfirmed';
      expect(r.first).toBe(first);
      expect(s).toMatchObject({ phase: kind === 'reenter' ? 'blocked' : phase, failurePhase: kind === 'reenter' ? 'blocked' : phase,
        identityConfirmed: kind === 'reenter' || i > 0, checked: kind === 'reenter' || i > 1,
        reentry: kind === 'reenter' ? 'construction_in_progress' : 'none', callActive: false, entryBusy: false, activeQualification: false,
        route: { attempted: true, first, failurePhase: 'BP02', failureStep: 'preflight', failureBoundary: 'after' },
        build: { phase: 'BP01', failureRecorded: false, storage: { state: 'failed', dataCreated: 0 }, rootReady: false,
          stopRequested: kind === 'close', stopFirst: kind === 'close' ? 'closed' : 'none',
          source: { claim: 'unused', pinCallReached: false, failurePhase: 'BP02', failureBoundary: 'checked', stopMirrored: kind === 'close' },
          receiver: { pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free' }, grantAttempts: 0, dutyUsed: false, bodyStarts: 0 } });
      expect(s.build.receiver.references.every(r => !r.retained)).toBe(true);
      expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); finite(a.inspect());
    });
  it.each(['foreign_source', 'copy_source', 'proxy_source', 'foreign_start', 'proxy_start'])(
    'rejects %s without candidate hooks or receiver writes', kind => {
      const a = createProbeBodyPinBridgeFake('pb_' + kind), r = a.prepare(), s = a.inspect();
      expect(r.first).toBe('binding_mismatch'); expect(s).toMatchObject({ phase: 'before', failurePhase: 'before',
        identityConfirmed: false, checked: false, hookObserved: false, callActive: false, entryBusy: false,
        build: { source: { pinCallReached: false, claim: 'unused', sameReference: true }, receiver: { pinAttemptUsed: false, pinStage: 'empty' } } });
      expect(s.build.receiver.references.every(r => !r.retained)).toBe(true); expect(a.close()).toBe(r); finite(a.inspect());
    });
  it.each(['si_producer_throw', 'si_proxy', 'pc_fault_checked', 'ps_fault_entry_before'])(
    'keeps earlier %s diagnosis outside the new bridge phase', script => {
      const a = createProbeBodyPinBridgeFake(script), r = a.prepare();
      expect(r.first).toBe(script === 'si_proxy' ? 'binding_mismatch' : 'construction_unconfirmed');
      expect(a.inspect()).toMatchObject({ phase: 'none', failurePhase: 'none', checked: false, identityConfirmed: false,
        callActive: false, entryBusy: false, build: { receiver: { pinAttemptUsed: false } } });
      expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); finite(a.inspect());
    });
  it('does not generate a source after an early close', () => {
    const a = createProbeBodyPinBridgeFake(); a.close(); expect(a.prepare().disposition).toBe('closed');
    expect(a.inspect()).toMatchObject({ phase: 'none', build: { source: { state: 'not_created' } } });
  });
  it('rejects summaries, functions and hostile inputs without evaluating them', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const xs of [[p], [() => hooks++], [createProbeBodyPinBridgeFake().inspect()], ['pb_normal', p]]) {
      const a = createProbeBodyPinBridgeFake(...xs); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect().build.source.state).toBe('not_created'); finite(a.inspect());
    }
    expect(hooks).toBe(0);
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('retains first diagnosis after extra arguments to %s', name => {
    const a = createProbeBodyPinBridgeFake(), r = a.prepare(); a[name]({ secret: 'not-a-context' });
    expect(a.prepare()).toBe(r); expect(a.inspect().failurePhase).toBe('blocked'); finite(a.inspect());
  });
});
