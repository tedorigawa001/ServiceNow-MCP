import { describe, expect, it } from 'vitest';
import * as composition from './fixtures/snapshot-read-composition-fake.js';

describe('synthetic stop and capture admission', () => {
  it('seals normal root use without inventing a close reason and issues only non-executable admission', () => {
    const a = composition.createCaptureAdmissionFake(); a.prepare();
    expect(a.admit()).toMatchObject({ ok: true, disposition: 'issued' });
    expect(a.inspect()).toMatchObject({ state: 'issued', stopAck: 'root_captured', controlPin: 'minted',
      admission: 'source_backed', firstReason: 'none', sealAttempts: 1, ackIssues: 1, pinIssues: 1, admissionIssues: 1,
      capture: 'not_connected', fieldWrites: 0, proofIssuance: 'closed', rootFinish: 'not_called',
      source: { root: { retirementSealed: true, closeRequested: false, lifecycleFirst: 'none', readFirst: 'none',
        retainedBorrow: true, retainedSnapshot: true } } });
  });
  it('preserves real close separately and does not reissue on a second admit', () => {
    const a = composition.createCaptureAdmissionFake(); a.prepare(); a.close(); a.admit();
    expect(a.inspect()).toMatchObject({ firstReason: 'supply_closed', sealAttempts: 1, admissionIssues: 1,
      source: { root: { closeRequested: true, readStop: 'supply_closed', retirementSealed: true } } });
    expect(a.admit()).toMatchObject({ ok: false, disposition: 'already_issued' });
    expect(a.inspect().admissionIssues).toBe(1);
  });
  it('uses strict local-only variants when the source was never created', () => {
    const a = composition.createCaptureAdmissionFake(); a.admit();
    expect(a.inspect()).toMatchObject({ stopAck: 'root_not_created', controlPin: 'not_minted', admission: 'local_only', sealAttempts: 0 });
  });
  it('refuses every root normal-use gate after a normal retirement seal without changing the first diagnosis', () => {
    const a = composition.createCaptureAdmissionFake('probe_gates'); a.prepare(); a.admit();
    expect(a.inspect()).toMatchObject({ rootGates: { context: false, open: false, begin: 'supply_closed',
      prepare: 'supply_closed', check: 'supply_closed' }, firstReason: 'none', source: { root: { readFirst: 'none', lifecycleFirst: 'none' } } });
  });
  it.each(['scope_owner', 'scope_construction', 'scope_retention', 'scope_sourceSlot', 'scope_claim',
    'ack_copy', 'ack_scope_copy', 'ack_epoch', 'ack_origin', 'ack_source', 'ack_root', 'ack_variant', 'ack_extra',
    'pin_copy', 'pin_scope_copy', 'pin_epoch', 'pin_origin', 'pin_control', 'pin_variant', 'pin_extra',
    'admission_copy', 'admission_scope_copy', 'admission_epoch', 'admission_origin', 'admission_ack', 'admission_pin', 'admission_packet', 'admission_variant', 'admission_extra'])(
    'rejects %s and retains the same terminal failure without retrying owned operations', script => {
      const a = composition.createCaptureAdmissionFake(script); a.prepare(); const reply = a.admit();
      expect(reply).toMatchObject({ ok: false, disposition: 'binding_rejected' });
      const before = a.inspect(); expect(a.admit()).toBe(reply); expect(a.close()).toBe(reply);
      expect(a.inspect()).toEqual(before);
      expect(before).toMatchObject({ fieldWrites: 0, capture: 'not_connected', rootFinish: 'not_called',
        retained: { R1: 3, R2: 5, R3: 2, R4: 2 } });
    });
  it.each([
    ['seal_before', 1, 0, 0, 0], ['seal_after', 1, 0, 0, 0],
    ['ack_before', 1, 0, 0, 0], ['ack_after', 1, 1, 0, 0],
    ['pin_before', 1, 1, 0, 0], ['pin_after', 1, 1, 1, 0],
    ['admission_before', 1, 1, 1, 0], ['admission_after', 1, 1, 1, 1], ['authority_failure', 1, 1, 1, 1],
  ] as const)('retains independently specified issue prefix %s', (script, seals, ack, pin, admission) => {
    const a = composition.createCaptureAdmissionFake(script); a.prepare(); const r = a.admit();
    expect(r.ok).toBe(false);
    expect(a.inspect()).toMatchObject({ state: 'unconfirmed', sealAttempts: seals, ackIssues: ack, pinIssues: pin,
      admissionIssues: admission, fieldWrites: 0, source: { root: { retainedBorrow: true, retainedSnapshot: true } } });
    expect(a.admit()).toBe(r); expect(a.close()).toBe(r);
  });
  it.each(['source_unknown', 'frame_exit_failure'])('does not issue from %s', script => {
    const a = composition.createCaptureAdmissionFake(script); a.prepare(); const r = a.admit();
    expect(r.ok).toBe(false);
    expect(a.inspect()).toMatchObject({ state: 'unconfirmed', sealAttempts: 0, ackIssues: 0, pinIssues: 0, admissionIssues: 0 });
    expect(a.admit()).toBe(r);
  });
  it('stops on invalid arguments, never invokes input hooks, and exposes no capture consumer', () => {
    let hooks = 0;
    const x = new Proxy({}, { get() { hooks++; throw new Error('private_secret'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[x], ['normal', x], ['unknown'], [() => { hooks++; }]]) {
      const a = composition.createCaptureAdmissionFake(...args); expect(a.prepare().ok).toBe(false); expect(a.admit().ok).toBe(false);
    }
    const a = composition.createCaptureAdmissionFake(); a.prepare(); a.admit(x);
    expect(a.inspect()).toMatchObject({ state: 'rejected', controlState: 'stopped', admissionIssues: 0 });
    expect(hooks).toBe(0); expect(Object.keys(a)).toEqual(['prepare', 'admit', 'close', 'inspect']);
  });
  it('retains an unconfirmed control mint instead of claiming that no control was minted', () => {
    const a = composition.createCaptureAdmissionFake('control_unconfirmed'); a.prepare(); a.admit();
    expect(a.inspect()).toMatchObject({ state: 'unconfirmed', sealAttempts: 0, ackIssues: 0, pinIssues: 0,
      source: { root: { retainedBorrow: true, retainedSnapshot: true } } });
  });
  it.each(['ack_checkpoint', 'pin_checkpoint'])('validates known-absence checkpoints: %s', script => {
    const a = composition.createCaptureAdmissionFake(script);
    expect(a.admit()).toMatchObject({ ok: false, disposition: 'binding_rejected' });
    expect(a.inspect()).toMatchObject({ sealAttempts: 0, fieldWrites: 0 });
  });
  it('does not start a second issuer during synchronous reentry', () => {
    const a = composition.createCaptureAdmissionFake('reenter_issue'); a.prepare(); a.admit();
    expect(a.inspect()).toMatchObject({ reentry: 'in_progress', sealAttempts: 1, admissionIssues: 1 });
  });
  it.each([['source_rejected', 'source_rejected', 'supply_invalid', 'none'],
    ['prepare_failure', 'generation_unavailable', 'none', 'read_prepare_unavailable']] as const)(
    'keeps source-owned diagnosis through admission and late close: %s', (script, first, supply, lifecycle) => {
      const a = composition.createCaptureAdmissionFake(script); a.prepare(); expect(a.admit().ok).toBe(true); a.close();
      expect(a.inspect()).toMatchObject({ firstReason: first, admissionIssues: 1,
        source: { root: { supplyFirst: supply, lifecycleFirst: lifecycle } } });
    });
  it('matches an independent finite lifecycle model and never captures or clears', () => {
    const ops = ['prepare', 'admit', 'close'] as const;
    for (const x of ops) for (const y of ops) for (const z of ops) {
      const a = composition.createCaptureAdmissionFake();
      let prepared = false, requested = false, issued = false, first = 'none';
      for (const op of [x, y, z]) {
        if (op === 'prepare') { if (!requested) prepared = true; }
        else if (op === 'close') { requested = true; if (prepared && first === 'none') first = 'supply_closed'; }
        else { requested = true; issued = true; }
        a[op]();
        expect(a.inspect()).toMatchObject({ state: issued ? 'issued' : 'unused', firstReason: first,
          sealAttempts: Number(issued && prepared), admissionIssues: Number(issued), capture: 'not_connected', fieldWrites: 0,
          proofIssuance: 'closed', rootFinish: 'not_called' });
        if (prepared) expect(a.inspect().retained).toMatchObject({ R1: 3, R2: 5, R3: 2, R4: 2 });
      }
      expect(JSON.stringify(a.inspect())).not.toContain('private_capture_issue');
    }
  });
});
