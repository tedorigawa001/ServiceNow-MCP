import { describe, expect, it } from 'vitest';
import { createProbeBodyPinReferenceStorageFake } from './fixtures/snapshot-read-composition-fake.js';

function retained(s: ReturnType<ReturnType<typeof createProbeBodyPinReferenceStorageFake>['inspect']>) {
  return s.build.receiver.references.filter(v => v.retained).map(v => v.field);
}
function finite(value: unknown) {
  const q = [value]; let n = 0;
  while (q.length) {
    const v = q.pop(); expect(++n).toBeLessThan(500);
    if (v === null || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k)!; expect(typeof k).toBe('string');
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value);
    }
  }
}
describe('closed synthetic source reference storage', () => {
  it('retains the same issued/current references but does not confirm the pin', () => {
    const a = createProbeBodyPinReferenceStorageFake(), r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ model: 'wfb-body-pin-reference-storage-1', ok: false,
      disposition: 'pin_confirmation_not_connected', first: 'construction_unconfirmed' });
    expect(s).toMatchObject({ fixedCalls: 1, callActive: false, entryBusy: false, result: 'rejected_attempt',
      reference: { point: 'blocked', failurePoint: 'blocked', hold: 'not_started', boundary: 'after', postChecked: true },
      receiverPin: { step: 'current', failureStep: 'current' },
      build: { receiver: { pinStage: 'captured', first: 'receiver_unconfirmed' },
        source: { claim: 'unused', bindCallReached: false, postConfirmed: false }, rootReady: false, bodyStarts: 0 } });
    expect(s.build.receiver.references.filter(v => v.retained).map(v => v.field))
      .toEqual(['bodyExpectedSourceIssued', 'bodyExpectedSourceCurrent']);
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it('retains only the first already captured mismatching current as rejected', () => {
    const a = createProbeBodyPinReferenceStorageFake('rs_copy_current'), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('binding_mismatch');
    expect(s).toMatchObject({ reference: { point: 'rejected_after', hold: 'confirmed', boundary: 'after' },
      build: { receiver: { pinStage: 'captured', first: 'binding_mismatch', failureBoundary: 'after' } },
      receiverPin: { step: 'current', failureStep: 'current' } });
    expect(s.build.receiver.references.filter(v => v.retained).map(v => v.field))
      .toEqual(['bodyExpectedSourceIssued', 'bodyExpectedSourceCurrent', 'bodyExpectedSourceRejected']);
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
    expect(a.inspect().reference).toEqual(s.reference);
  });
  it('keeps the issued prefix when synchronously closed before current storage', () => {
    const a = createProbeBodyPinReferenceStorageFake('rs_close_before_current'), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('closed');
    expect(s.reference).toMatchObject({ point: 'before_current', hold: 'not_started', boundary: 'before' });
    expect(s.build.receiver).toMatchObject({ pinStage: 'issued', first: 'closed', failureBoundary: 'before' });
    expect(s.build.receiver.references.filter(v => v.retained).map(v => v.field)).toEqual(['bodyExpectedSourceIssued']);
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
  });
  it.each(['before_issued', 'issued', 'before_current', 'captured', 'blocked'].flatMap((point, i) =>
    ['fault', 'close', 'prior', 'reenter'].map(kind => [point, i, kind] as const)))(
    'keeps the independent prefix at %s / %s / %s', (point, i, kind) => {
      const a = createProbeBodyPinReferenceStorageFake('rs_' + kind + '_' + point), r = a.prepare(), s = a.inspect();
      const completed = kind === 'reenter', end = completed ? 4 : i;
      const refs = end === 0 ? [] : end < 3 ? ['bodyExpectedSourceIssued'] : ['bodyExpectedSourceIssued', 'bodyExpectedSourceCurrent'];
      const step = end === 0 ? 'attempt' : end < 3 ? 'issued' : 'current';
      const boundary = end === 0 || end === 2 ? 'before' : 'after';
      const first = kind === 'close' ? 'closed' : kind === 'prior' ? 'state_invalid' : 'construction_unconfirmed';
      expect(r.first).toBe(first); expect(retained(s)).toEqual(refs);
      expect(s).toMatchObject({ reference: { point: completed ? 'blocked' : point, failurePoint: completed ? 'blocked' : point, postChecked: completed,
        boundary, hold: 'not_started', reentry: completed ? 'refused_existing' : 'none' },
        receiverPin: { step, failureStep: step }, callActive: false, entryBusy: false,
        route: { failurePhase: 'BP03', failureStep: 'call', failureBoundary: kind === 'close' || kind === 'prior' ? 'before' : 'after',
          preparingConfirmed: false, postChecked: false },
        build: { rootReady: false, bodyStarts: 0, dutyUsed: false, grantAttempts: 0,
          receiver: { pinStage: end === 0 ? 'attempting' : end < 3 ? 'issued' : 'captured', failureBoundary: boundary,
            first: first === 'construction_unconfirmed' ? 'receiver_unconfirmed' : first, occupancy: 'free', bindingState: 'empty', prefix: 'none' },
          source: { claim: 'unused', bindCallReached: false, postConfirmed: false } } });
      expect(a.check()).toBe(r); expect(a.checkLegacy()).toBe(r); expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
      expect(a.inspect().reference).toEqual(s.reference); finite(a.inspect());
    });
  it.each(['rejected_before', 'rejected_after'].flatMap(point => ['fault', 'close', 'prior', 'reenter'].map(kind => [point, kind] as const)))(
    'separates rejected custody and confirmation at %s / %s', (point, kind) => {
      const a = createProbeBodyPinReferenceStorageFake('rs_copy_' + kind + '_' + point), r = a.prepare(), s = a.inspect();
      const held = point === 'rejected_after' || kind === 'reenter';
      const first = kind === 'close' ? 'closed' : kind === 'prior' ? 'state_invalid' : held ? 'binding_mismatch' : 'construction_unconfirmed';
      expect(r.first).toBe(first); expect(retained(s).length).toBe(held ? 3 : 2);
      expect(s).toMatchObject({ reference: { point: kind === 'reenter' ? 'rejected_after' : point, postChecked: false,
        boundary: held ? 'after' : 'before', hold: held ? kind === 'reenter' ? 'confirmed' : 'retained_unconfirmed' : 'not_started' },
        build: { receiver: { pinStage: 'captured', first: held ? 'binding_mismatch' : first === 'construction_unconfirmed' ? 'receiver_unconfirmed' : first,
          failureBoundary: held ? 'after' : 'before' }, source: { claim: 'unused' }, rootReady: false, bodyStarts: 0 } });
      expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.inspect().reference).toEqual(s.reference); finite(a.inspect());
    });
  it('does not treat an absent current as a candidate to retain', () => {
    const a = createProbeBodyPinReferenceStorageFake('rs_missing_current'); expect(a.prepare().first).toBe('state_invalid');
    expect(retained(a.inspect())).toEqual(['bodyExpectedSourceIssued']);
    expect(a.inspect().reference.hold).toBe('not_started');
  });
  it('does not label an unverified captured prefix as the normal blocked result', () => {
    const a = createProbeBodyPinReferenceStorageFake('rs_fault_captured');
    expect(a.prepare().disposition).toBe('construction_unconfirmed');
    expect(retained(a.inspect()).length).toBe(2);
  });
  it.each(['ec_foreign_source', 'ec_copy_source', 'ec_proxy_source', 'ec_foreign_start', 'ec_proxy_start'])(
    'rejects foreign input without entering the writer: %s', script => {
      const a = createProbeBodyPinReferenceStorageFake(script); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, hookObserved: false, reference: { point: 'none', hold: 'not_started' } });
      expect(retained(a.inspect())).toEqual([]); finite(a.inspect());
    });
  it.each(['si_producer_throw', 'pc_fault_checked', 'ps_fault_entry_before', 'pb_fault_checked', 'ec_close_preflight_before'])(
    'preserves predecessor failure: %s', script => {
      const a = createProbeBodyPinReferenceStorageFake(script), r = a.prepare();
      expect(r.first).toBe(script.startsWith('ec_') ? 'closed' : 'construction_unconfirmed');
      expect(a.inspect()).toMatchObject({ reference: { point: 'none' }, callActive: false, entryBusy: false });
      expect(a.close()).toBe(r); finite(a.inspect());
    });
  it('does not evaluate caller supplied hooks or accept public snapshots as authority', () => {
    let hooks = 0;
    const p = new Proxy({}, { get() { hooks++; throw Error('private_secret'); }, ownKeys() { hooks++; throw Error('private_secret'); } });
    for (const args of [[p], [() => hooks++], ['rs_normal', p], [createProbeBodyPinReferenceStorageFake().inspect()]]) {
      const a = createProbeBodyPinReferenceStorageFake(...args); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, reference: { point: 'none', hold: 'not_created' } }); finite(a.inspect());
    }
    expect(hooks).toBe(0);
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('never restarts after extra %s arguments', method => {
    const a = createProbeBodyPinReferenceStorageFake('rs_copy_current'), r = a.prepare(), s = a.inspect();
    a[method]({ private_secret: 'not-authority' }); expect(a.prepare()).toBe(r); expect(a.inspect().reference).toEqual(s.reference);
    expect(JSON.stringify(a.inspect())).not.toContain('private_secret'); finite(a.inspect());
  });
  it('closes before construction without creating a source or trial', () => {
    const a = createProbeBodyPinReferenceStorageFake(); expect(a.close().disposition).toBe('closed');
    expect(a.prepare().disposition).toBe('closed');
    expect(a.inspect()).toMatchObject({ fixedCalls: 0, reference: { point: 'none', boundary: 'not_created', hold: 'not_created' } });
  });
});
