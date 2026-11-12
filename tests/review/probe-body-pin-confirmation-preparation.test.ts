import { describe, expect, it } from 'vitest';
import { createProbeBodyPinConfirmationPreparationFake } from './fixtures/snapshot-read-composition-fake.js';

function finite(value: unknown) {
  const q = [value]; let n = 0;
  while (q.length) {
    const v = q.pop(); expect(++n).toBeLessThan(600);
    if (v === null || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(typeof k).toBe('string'); expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}
describe('closed confirmation contract preparation', () => {
  it('checks only captured-ready and retains a false final marker', () => {
    const a = createProbeBodyPinConfirmationPreparationFake(), r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ model: 'wfb-body-pin-confirmation-preparation-1', ok: false,
      disposition: 'pin_confirmation_not_connected', first: 'construction_unconfirmed' });
    expect(s).toMatchObject({ confirmation: { prepared: true, finalPostChecked: false, classification: 'receiver_unconfirmed',
      diagnosticRecorded: true, acceptedReturn: 'not_connected', finalPost: 'not_connected' },
      build: { receiver: { pinStage: 'captured', first: 'receiver_unconfirmed' }, rootReady: false, bodyStarts: 0 },
      route: { failurePhase: 'BP03', failureStep: 'call', failureBoundary: 'after', preparingConfirmed: false, postChecked: false } });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it('retains the recorded diagnosis when later reply materialization fails', () => {
    const a = createProbeBodyPinConfirmationPreparationFake('cp_reply_throw');
    expect(() => a.prepare()).toThrow('private_confirmation_reply');
    const s = a.inspect();
    expect(s).toMatchObject({ first: 'construction_unconfirmed', confirmation: { diagnosticRecorded: true, replyAttempted: true, finalPostChecked: false },
      build: { receiver: { pinStage: 'captured' }, source: { first: 'receiver_unconfirmed', claim: 'unused' }, bodyStarts: 0 } });
    expect(() => a.prepare()).toThrow('private_confirmation_reply');
    expect(a.inspect().route).toEqual(s.route);
  });
  it('does not overwrite the first root, source or source-reason slot', () => {
    const a = createProbeBodyPinConfirmationPreparationFake('cp_later_reason'), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('construction_unconfirmed');
    expect(s).toMatchObject({ sourceReason: 'receiver_unconfirmed', confirmation: { diagnosticRecorded: true },
      build: { source: { first: 'receiver_unconfirmed' }, receiver: { first: 'receiver_unconfirmed' } } });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); expect(a.inspect().route).toEqual(s.route);
  });
  it.each(['before_issued', 'issued', 'before_current', 'captured', 'blocked'].flatMap((p, i) =>
    ['fault', 'close', 'prior', 'reenter'].map(k => [p, i, k] as const)))(
    'preserves the prefix at %s / %s / %s', (point, i, kind) => {
      const a = createProbeBodyPinConfirmationPreparationFake('rs_' + kind + '_' + point), r = a.prepare(), s = a.inspect();
      const completed = kind === 'reenter', end = completed ? 4 : i;
      expect(r.first).toBe(kind === 'close' ? 'closed' : kind === 'prior' ? 'state_invalid' : 'construction_unconfirmed');
      expect(s).toMatchObject({ confirmation: { prepared: completed, finalPostChecked: false, diagnosticRecorded: true },
        callActive: false, entryBusy: false, route: { preparingConfirmed: false, postChecked: false },
        build: { receiver: { pinStage: end === 0 ? 'attempting' : end < 3 ? 'issued' : 'captured' },
          source: { claim: 'unused', bindCallReached: false, postConfirmed: false }, bodyStarts: 0, rootReady: false } });
      expect(s.build.receiver.references.filter(v => v.retained).length).toBe(end === 0 ? 0 : end < 3 ? 1 : 2);
      expect(a.prepare()).toBe(r); expect(a.check()).toBe(r); expect(a.checkLegacy()).toBe(r); expect(a.close()).toBe(r); finite(a.inspect());
    });
  it.each(['rejected_before', 'rejected_after'].flatMap(p => ['fault', 'close', 'prior', 'reenter'].map(k => [p, k] as const)))(
    'does not promote rejected custody: %s / %s', (point, kind) => {
      const a = createProbeBodyPinConfirmationPreparationFake('rs_copy_' + kind + '_' + point), r = a.prepare(), s = a.inspect();
      const held = point === 'rejected_after' || kind === 'reenter';
      expect(s).toMatchObject({ confirmation: { prepared: false, finalPostChecked: false, diagnosticRecorded: true },
        build: { receiver: { pinStage: 'captured' }, bodyStarts: 0, rootReady: false } });
      expect(s.build.receiver.references.filter(v => v.retained).length).toBe(held ? 3 : 2);
      expect(s.reference.hold).toBe(held ? kind === 'reenter' ? 'confirmed' : 'retained_unconfirmed' : 'not_started');
      expect(a.close()).toBe(r); expect(a.prepare()).toBe(r); finite(a.inspect());
    });
  it('keeps a pre-call throw separate from a returned result', () => {
    const a = createProbeBodyPinConfirmationPreparationFake('ec_fault_before_call'); a.prepare();
    expect(a.inspect()).toMatchObject({ fixedCalls: 0, phase: 'before', result: 'none', confirmation: { classification: 'unreturned', finalPostChecked: false },
      route: { failurePhase: 'BP02', failureStep: 'preflight', failureBoundary: 'after' } });
  });
  it.each(['ec_foreign_source', 'ec_copy_source', 'ec_proxy_source', 'ec_foreign_start', 'ec_proxy_start'])(
    'rejects %s without touching a receiver', script => {
      const a = createProbeBodyPinConfirmationPreparationFake(script), r = a.prepare(); expect(r.first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, hookObserved: false, confirmation: { prepared: false, finalPostChecked: false },
        build: { receiver: { pinAttemptUsed: false, first: 'none' } } }); finite(a.inspect());
    });
  it.each(['si_producer_throw', 'pc_fault_checked', 'ps_fault_entry_before', 'pb_fault_checked'])(
    'retains the predecessor failure: %s', script => {
      const a = createProbeBodyPinConfirmationPreparationFake(script), r = a.prepare(); expect(r.first).toBe('construction_unconfirmed');
      expect(a.inspect()).toMatchObject({ confirmation: { prepared: false, finalPostChecked: false, diagnosticRecorded: false } });
      expect(a.close()).toBe(r); finite(a.inspect());
    });
  it('rejects hostile inputs without executing hooks or creating authority', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('private_secret'); }, ownKeys() { hooks++; throw Error('private_secret'); } });
    for (const args of [[p], [() => hooks++], ['cp_normal', p], [createProbeBodyPinConfirmationPreparationFake().inspect()]]) {
      const a = createProbeBodyPinConfirmationPreparationFake(...args); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect()).toMatchObject({ fixedCalls: 0, confirmation: { prepared: false, finalPostChecked: false } }); finite(a.inspect());
    }
    expect(hooks).toBe(0);
  });
  it.each(['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const)('does not restart on extra %s arguments', method => {
    const a = createProbeBodyPinConfirmationPreparationFake(), r = a.prepare(), s = a.inspect();
    a[method]({ private_secret: 'not-authority' }); expect(a.prepare()).toBe(r); expect(a.inspect().confirmation).toEqual(s.confirmation);
    expect(JSON.stringify(a.inspect())).not.toContain('private_secret'); finite(a.inspect());
  });
  it('retains a closed pre-construction result without retrying materialization', () => {
    const a = createProbeBodyPinConfirmationPreparationFake(), r = a.close();
    expect(r.disposition).toBe('closed'); expect(a.prepare()).toBe(r);
    expect(a.inspect()).toMatchObject({ fixedCalls: 0, confirmation: { finalPostChecked: false, prepared: false } });
  });
  it.each(['check', 'checkLegacy'] as const)('does not cache an unstarted %s as a terminal diagnosis', method => {
    const a = createProbeBodyPinConfirmationPreparationFake(), before = a[method]();
    expect(before).toMatchObject({ ok: false, disposition: method === 'check' ? 'internal_unconfirmed' : 'not_ready', first: 'none' });
    expect(a.inspect()).toMatchObject({ confirmation: { replyAttempted: false, diagnosticRecorded: false } });
    const terminal = a.prepare();
    expect(terminal).not.toBe(before);
    expect(terminal).toMatchObject({ disposition: 'pin_confirmation_not_connected', first: 'construction_unconfirmed' });
    expect(a.prepare()).toBe(terminal);
  });
});
