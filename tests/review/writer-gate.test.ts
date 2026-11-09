import { describe, expect, it } from 'vitest';
import * as module from './fixtures/writer-gate-fake.js';

describe('isolated WriterGate/pin/grant pure model', () => {
  const closed = { realFrame: 'not_connected', realWriterCalls: 0, journalSupply: 'not_connected', closedEvidence: 'not_issued',
    admissionConsumptions: 0, packetObjects: 0, proofIssuance: 'closed', rootFinish: 'not_called' };
  it('binds once, grants once and keeps the original grant through stop/revocation', () => {
    const a = module.createWriterGateFake(); expect(a.enter().disposition).toBe('not_bound');
    expect(a.bind().ok).toBe(true); expect(a.enter().ok).toBe(true); expect(a.check().ok).toBe(true);
    expect(a.request().disposition).toBe('deferred_frame'); expect(a.enter().disposition).toBe('generation_in_progress');
    expect(a.check().disposition).toBe('qualified_fake'); expect(a.closeGate().disposition).toBe('deferred_frame');
    expect(a.exit().ok).toBe(true); expect(a.check().ok).toBe(false); expect(a.closeGate()).toMatchObject({ ok: true, disposition: 'closed_fake' });
    const s = a.inspect(); expect(s).toMatchObject({ ...closed, gate: 'closed', frame: 'exited', first: 'none',
      pinRetained: true, grantRetained: true, generationUsed: true, grantAttempts: 1, activations: 1, revocations: 1 });
    a.closeGate(); expect(a.inspect()).toEqual(s);
    expect(a.enter()).toMatchObject({ ok: false, disposition: 'duplicate_grant', first: 'none' });
    expect(a.inspect()).toMatchObject({ gate: 'closed', grantAttempts: 1, refusal: 'duplicate_grant' });
  });
  it('can model no-entry closure only after same-owner bind and stop', () => {
    const a = module.createWriterGateFake(); expect(a.closeGate().ok).toBe(false); a.bind(); a.request(); a.closeGate();
    expect(a.inspect()).toMatchObject({ ...closed, gate: 'closed', frame: 'not_entered', grantRetained: false, grantAttempts: 0 });
    const b = module.createWriterGateFake(); b.request(); expect(b.bind().ok).toBe(false); expect(b.closeGate().ok).toBe(false);
    expect(b.inspect()).toMatchObject({ bound: false, gate: 'stop_requested', grantAttempts: 0, closedEvidence: 'not_issued' });
  });
  it.each(['pin_copy', 'pin_brand', 'pin_extra', 'pin_gate', 'pin_scope', 'pin_owner', 'pin_construction', 'pin_retention', 'pin_sourceSlot', 'pin_claim', 'pin_epoch'])(
    'rejects %s at binding with captured pin retained', script => {
      const a = module.createWriterGateFake(script), r = a.bind(); expect(r.first).toBe('binding_mismatch');
      // A pin mismatch before any frame is a refused binding, not an unconfirmed execution exit.
      expect(a.inspect()).toMatchObject({ ...closed, gate: 'unbound', bound: false, pinRetained: true, grantAttempts: 0 });
      const s = a.inspect(); expect(a.enter()).toBe(r); expect(a.request()).toBe(r); expect(a.inspect()).toEqual(s);
    });
  it.each(['grant_copy', 'grant_brand', 'grant_extra', 'grant_gate', 'grant_owner', 'grant_pin', 'grant_epoch', 'grant_frame', 'grant_phase'])(
    'rejects %s before activation without refunding the generation attempt', script => {
      const a = module.createWriterGateFake(script); a.bind(); const r = a.enter(); expect(r.first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, gate: 'unconfirmed', frame: 'entering', grantStage: 'provisional',
        generationUsed: true, grantAttempts: 1, grantRetained: true, activations: 0 });
      const s = a.inspect(); expect(a.enter()).toBe(r); expect(a.exit()).toBe(r); expect(a.closeGate()).toBe(r); expect(a.inspect()).toEqual(s);
    });
  it.each([
    ['bind_before', 0, false, 0, false, 'not_started', 'not_entered', 0],
    ['bind_mint', 1, false, 0, false, 'not_started', 'not_entered', 0],
    ['bind_capture', 1, true, 0, false, 'not_started', 'not_entered', 0],
    ['bind_post', 1, true, 0, false, 'not_started', 'not_entered', 0],
    ['enter_before', 1, true, 0, false, 'not_started', 'not_entered', 0],
    ['grant_mint', 1, true, 1, false, 'attempting', 'entering', 0],
    ['grant_capture', 1, true, 1, true, 'provisional', 'entering', 0],
    ['grant_post', 1, true, 1, true, 'provisional', 'entering', 0],
    ['exit_before', 1, true, 1, true, 'active', 'exit_unconfirmed', 0],
    ['exit_revoke', 1, true, 1, true, 'revoked', 'exit_unconfirmed', 1],
    ['exit_post', 1, true, 1, true, 'revoked', 'exit_unconfirmed', 1],
  ] as const)('retains independent failure prefix %s', (script, binds, pin, attempts, grant, stage, frame, revocations) => {
    const a = module.createWriterGateFake(script); a.bind(); a.enter(); a.exit();
    const r = a.check(); expect(r.first).toBe('operation_unconfirmed');
    expect(a.inspect()).toMatchObject({ ...closed, gate: 'unconfirmed', frame, bindAttempts: binds, pinRetained: pin,
      grantAttempts: attempts, grantRetained: grant, grantStage: stage, revocations,
      phase: script.split('_')[0], boundary: script.split('_')[1] });
    const s = a.inspect(); expect(a.bind()).toBe(r); expect(a.enter()).toBe(r); expect(a.request()).toBe(r); expect(a.closeGate()).toBe(r); expect(a.inspect()).toEqual(s);
  });
  it.each([['reenter_bind', 'binding_in_progress'], ['reenter_enter', 'generation_in_progress'], ['reenter_exit', 'exit_in_progress']] as const)(
    'rejects %s without a second grant', (script, reentry) => {
      const a = module.createWriterGateFake(script); a.bind(); a.enter(); a.exit();
      expect(a.inspect()).toMatchObject({ ...closed, first: 'none', reentry, bindAttempts: 1, grantAttempts: 1, activations: 1, revocations: 1 });
    });
  it('holds an entering grant when stop arrives before activation', () => {
    const a = module.createWriterGateFake('request_during_enter'); a.bind(); a.enter();
    expect(a.inspect()).toMatchObject({ gate: 'unconfirmed', frame: 'entering', stop: true, grantStage: 'provisional', grantRetained: true, activations: 0 });
    expect(a.closeGate().ok).toBe(false);
  });
  it.each(['normal', 'outcome_throw', 'outcome_cancel', 'prior_failure'])(
    'separates %s outcome/producer diagnosis from synthetic execution exit', script => {
      const a = module.createWriterGateFake(script); a.bind(); a.enter(); a.request(); a.exit(); a.closeGate();
      expect(a.inspect()).toMatchObject({ ...closed, gate: 'closed', frame: 'exited', first: 'none',
        producerFirst: script === 'prior_failure' ? 'synthetic_producer_failure' : 'none',
        outcome: script === 'outcome_throw' ? 'throw' : script === 'outcome_cancel' ? 'cancel' : 'return' });
    });
  it('matches an independent finite event-word oracle without importing the state implementation', () => {
    const ops = ['bind', 'enter', 'request', 'exit', 'closeGate'] as const;
    for (const x of ops) for (const y of ops) for (const z of ops) for (const w of ops) {
      const a = module.createWriterGateFake();
      let gate = 'unbound', frame = 'not_entered', bound = false, stop = false, used = false, first = 'none';
      for (const op of [x, y, z, w]) {
        if (first === 'none') {
          // Duplicate requests are refusals: they never change gate/frame state or the first failure.
          if (op === 'bind') { if (!bound && !stop) { bound = true; gate = 'open'; } }
          if (op === 'enter' && frame !== 'active') { if (!used && bound && !stop && gate === 'open') { used = true; frame = 'active'; } }
          if (op === 'request') { stop = true; if (gate !== 'closed') gate = 'stop_requested'; }
          if (op === 'exit' && frame === 'active') frame = 'exited';
          if (op === 'closeGate' && bound && stop && (frame === 'not_entered' || frame === 'exited')) gate = 'closed';
        }
        a[op](); expect(a.inspect()).toMatchObject({ ...closed, gate, frame, bound, stop, generationUsed: used, first, grantAttempts: Number(used) });
      }
    }
  });
  it('never invokes input hooks or accepts foreign authority', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[p], ['normal', p], ['unknown'], [() => hooks++]]) {
      const a = module.createWriterGateFake(...args); expect(a.bind().first).toBe('input_rejected'); expect(a.enter().ok).toBe(false);
      expect(JSON.stringify(a.inspect())).not.toContain('secret');
    }
    for (const op of ['bind', 'enter', 'request', 'exit', 'check', 'closeGate'] as const) {
      const a = module.createWriterGateFake(); a[op](p); expect(a.bind().first).toBe('input_rejected');
    }
    expect(hooks).toBe(0); expect(Object.keys(module)).toEqual(['createWriterGateFake']);
  });
  it('refuses a duplicate grant after a confirmed exit without blocking closure', () => {
    const a = module.createWriterGateFake(); a.bind(); a.enter(); a.request(); a.exit();
    expect(a.enter()).toMatchObject({ ok: false, disposition: 'duplicate_grant', first: 'none' });
    expect(a.bind()).toMatchObject({ ok: false, disposition: 'duplicate_binding', first: 'none' });
    expect(a.inspect()).toMatchObject({ gate: 'stop_requested', frame: 'exited', grantStage: 'revoked', refusal: 'duplicate_grant' });
    expect(a.closeGate()).toMatchObject({ ok: true, disposition: 'closed_fake' });
  });
  it('keeps the gate state on input rejection instead of claiming an unconfirmed exit', () => {
    const a = module.createWriterGateFake('normal', 'x'); expect(a.bind().first).toBe('input_rejected');
    expect(a.inspect()).toMatchObject({ gate: 'unbound', frame: 'not_entered' });
    const b = module.createWriterGateFake(); b.bind(); b.enter('x');
    expect(b.inspect()).toMatchObject({ gate: 'open', frame: 'not_entered', first: 'input_rejected' });
  });
});
