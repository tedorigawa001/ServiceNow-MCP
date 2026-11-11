import { describe, expect, it } from 'vitest';
import { createProbeBodyPinContractsFake } from './fixtures/snapshot-read-composition-fake.js';

function finite(value: unknown) {
  const q = [value]; let count = 0;
  while (q.length) {
    const v = q.pop(); expect(++count).toBeLessThan(500);
    if (v === null || typeof v !== 'object') { expect(['string', 'number', 'boolean']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}

describe('C-01 closed pin contracts without pin attempts', () => {
  it('holds checked contracts on the same unpinned source and untouched receiver', () => {
    const a = createProbeBodyPinContractsFake();
    expect(a.prepare()).toMatchObject({ model: 'wfb-body-pin-contracts-1', disposition: 'pin_contracts_held', ok: false, first: 'none' });
    const s = a.inspect();
    expect(s).toMatchObject({ state: 'held', phase: 'held', checked: true,
      route: { attempted: false, state: 'not_started', phase: 'none', first: 'none', preparingConfirmed: false, postChecked: false },
      receiverPin: { step: 'none', failureStep: 'none' },
      build: { state: 'held', metadataConfirmed: true, stage: 'confirmed', failureRecorded: false, phase: 'BP01', step: 'after',
        source: { state: 'initializing', claim: 'unused', pinCallReached: false },
        storage: { state: 'building', dataCreated: 0 }, receiver: { pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free' } },
      pinAttempt: 'not_connected', pinStorage: 'not_connected', execution: 'closed', formalIssuance: 'closed',
      wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold' });
    expect(s.build.receiver.references.every(r => !r.retained)).toBe(true);
    expect(a.prepare().disposition).toBe('duplicate_preparation');
    expect(a.check().disposition).toBe('blocked_frame_execution');
    expect(a.checkLegacy().disposition).toBe('not_ready');
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
  });
  it('keeps contract-check failure apart from generation and pin-attempt diagnoses after close', () => {
    const a = createProbeBodyPinContractsFake('pc_fault_checked'), r = a.prepare();
    expect(r.first).toBe('construction_unconfirmed');
    expect(a.inspect()).toMatchObject({ state: 'failed', preparationFirst: 'construction_unconfirmed', failurePhase: 'checked',
      route: { attempted: false, state: 'not_started', phase: 'none', first: 'none', failureRecorded: false },
      build: { failureRecorded: false, stage: 'confirmed', phase: 'BP01', step: 'after', source: { claim: 'unused', pinCallReached: false } } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
    expect(a.inspect()).toMatchObject({ failurePhase: 'checked', build: { stopRequested: true, failureRecorded: false,
      source: { state: 'failed', first: 'construction_unconfirmed', stopMirrored: true } } });
  });
  it.each(['before', 'checked', 'after'].flatMap(p => ['fault', 'close', 'reenter', 'prior'].map(k => [p, k])))(
    'retains %s/%s without a pin call or receiver write', (phase, mode) => {
      const a = createProbeBodyPinContractsFake('pc_' + mode + '_' + phase), r = a.prepare();
      if (mode === 'reenter') {
        expect(r.disposition).toBe('pin_contracts_held'); expect(a.inspect().reentry).toBe('construction_in_progress');
      } else {
        const first = mode === 'close' ? 'closed' : mode === 'prior' ? 'state_invalid' : 'construction_unconfirmed';
        expect(r.first).toBe(first); expect(a.inspect()).toMatchObject({ state: 'failed', preparationFirst: first, failurePhase: phase,
          checked: false, build: { failureRecorded: false, metadataConfirmed: true, fixedCount: 9,
            phase: 'BP01', step: 'after', boundary: 'after', stopRequested: mode === 'close' } });
        expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.inspect().failurePhase).toBe(phase);
      }
      expect(a.inspect()).toMatchObject({ route: { attempted: false, state: 'not_started', phase: 'none', step: 'none',
        failureRecorded: false, first: 'none', failurePhase: 'none', preparingConfirmed: false, postChecked: false },
      receiverPin: { step: 'none', failureStep: 'none' }, build: { source: { claim: 'unused', pinCallReached: false, bindCallReached: false, postConfirmed: false },
        receiver: { pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free' }, state: 'held',
        storage: { state: mode === 'reenter' ? 'building' : 'failed', dataCreated: 0 }, rootReady: false, bodyStarts: 0, grantAttempts: 0, dutyUsed: false } });
      expect(a.inspect().build.receiver.references.every(r => !r.retained)).toBe(true); finite(a.inspect());
    });
  it.each(['si_producer_throw', 'si_getter_first', 'si_proxy'])('keeps original generation failure %s separate', script => {
    const a = createProbeBodyPinContractsFake(script), r = a.prepare();
    expect(r.first).toBe(script === 'si_producer_throw' ? 'construction_unconfirmed' : 'binding_mismatch');
    expect(a.inspect()).toMatchObject({ state: 'not_started', preparationFirst: 'none', failurePhase: 'none', checked: false,
      route: { attempted: false, first: 'none' }, build: { failureRecorded: true, hookCalls: 0 },
      receiverPin: script === 'si_producer_throw' ? { step: 'not_created', failureStep: 'not_created' } : { step: 'none', failureStep: 'none' } });
    expect(a.close()).toBe(r); expect(a.inspect().build.hookCalls).toBe(0); finite(a.inspect());
  });
  it('keeps close before preparation empty and close after hold diagnosed without pin progress', () => {
    const before = createProbeBodyPinContractsFake(); before.close(); expect(before.prepare().disposition).toBe('closed');
    expect(before.inspect()).toMatchObject({ state: 'not_started', route: { attempted: false },
      receiverPin: { step: 'not_created', failureStep: 'not_created' }, build: { source: { state: 'not_created' } } });
    const a = createProbeBodyPinContractsFake(); a.prepare(); const r = a.close();
    expect(r.first).toBe('closed'); expect(a.inspect()).toMatchObject({ state: 'failed', checked: true, failurePhase: 'held',
      route: { failureRecorded: false }, build: { state: 'held', failureRecorded: false, storage: { state: 'failed' }, source: { stopMirrored: true, claim: 'unused' } } });
    expect(a.close()).toBe(r); finite(a.inspect());
  });
  it('rejects summaries, callbacks and hostile objects without evaluating them', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('private'); }, ownKeys() { hooks++; throw Error('private'); } });
    const good = createProbeBodyPinContractsFake(); good.prepare();
    for (const xs of [[p], [good], [good.inspect()], [() => hooks++], ['bad'], ['pc_normal', p]]) {
      const a = createProbeBodyPinContractsFake(...xs); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect().build.source.issuedRetained).toBe(false); finite(a.inspect());
    }
    expect(hooks).toBe(0); expect(good.inspect().first).toBe('none');
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('rejects arguments to %s without consuming a claim', op => {
    const a = createProbeBodyPinContractsFake(); a.prepare(); a[op]({}); const r = a.check();
    expect(r.first).toBe('input_rejected'); expect(a.close()).toBe(r);
    expect(a.inspect()).toMatchObject({ failurePhase: 'held', checked: true, route: { attempted: false, first: 'none' },
      build: { failureRecorded: false, metadataConfirmed: true, source: { claim: 'unused', pinCallReached: false },
        receiver: { pinAttemptUsed: false, pinStage: 'empty' } } }); finite(a.inspect());
  });
});
