import { describe, expect, it } from 'vitest';
import * as composition from './fixtures/snapshot-read-composition-fake.js';

describe('synthetic retirement start boundary', () => {
  it('starts once and holds before field clear without claiming payload or root completion', () => {
    const a = composition.createRetirementStartFake();
    expect(a.prepare().ok).toBe(true);
    expect(a.request()).toMatchObject({ ok: true, disposition: 'blocked_field_clear' });
    expect(a.inspect()).toMatchObject({ attempt: 'running', starts: 1, claim: 'spent', frame: 'inactive',
      payload: 'not_started', fieldWrites: 0, proofIssuance: 'closed', rootFinish: 'not_called',
      retained: { R1: 3, R2: 5, R3: 2, R4: 2 } });
    expect(a.request()).toMatchObject({ ok: false, disposition: 'in_progress' });
    expect(a.inspect().starts).toBe(1);
  });
  it('defers while the generation wrapper frame is active and starts only after its finally exits', () => {
    const a = composition.createRetirementStartFake('request_in_frame'); a.prepare();
    expect(a.inspect()).toMatchObject({ deferred: { disposition: 'deferred_frame', starts: 0, claim: 'unused', frame: 'active' },
      starts: 1, frame: 'inactive', frameExits: 1, attempt: 'running', fieldWrites: 0 });
  });
  it.each(['throw_in_frame', 'prepare_failure'])('keeps the generation reason across finally, repeated requests and close: %s', script => {
    const a = composition.createRetirementStartFake(script); a.prepare(); a.request(); a.close();
    expect(a.inspect()).toMatchObject({ firstReason: 'generation_unavailable', frame: 'inactive', frameExits: 1,
      attempt: 'running', starts: 1, payload: 'not_started', fieldWrites: 0,
      source: { root: { lifecycleFirst: 'read_prepare_unavailable', retainedBorrow: true, retainedSnapshot: true } } });
  });
  it('defers close, rejects synchronous prepare reentry and rejects running request reentry', () => {
    const c = composition.createRetirementStartFake('close_in_frame'); c.prepare();
    expect(c.inspect()).toMatchObject({ firstReason: 'supply_closed', starts: 1,
      deferred: { disposition: 'deferred_frame', starts: 0 }, source: { root: { closeRequested: true } } });
    const p = composition.createRetirementStartFake('reenter_prepare'); p.prepare();
    expect(p.inspect()).toMatchObject({ prepareReentry: 'preparation_in_progress', frameExits: 1 });
    const r = composition.createRetirementStartFake('reenter_request'); r.prepare(); r.request();
    expect(r.inspect()).toMatchObject({ requestReentry: 'in_progress', starts: 1, claim: 'spent' });
  });
  it.each(['owner_copy', 'pin_copy', 'pin_construction', 'pin_retention', 'pin_source_slot', 'claim_copy', 'claim_owner', 'claim_pin'])(
    'rejects %s before claim consumption and fixes the same failure reply', script => {
      const a = composition.createRetirementStartFake(script); a.prepare(); const reply = a.request();
      expect(reply).toMatchObject({ ok: false, disposition: 'binding_rejected' });
      expect(a.request()).toBe(reply); expect(a.close()).toBe(reply);
      expect(a.inspect()).toMatchObject({ starts: 0, claim: 'unused', attempt: 'binding_rejected',
        retirementFirst: 'ownership_mismatch', retained: { R1: 3, R2: 5, R3: 2, R4: 2 } });
    });
  it('does not mistake an unconfirmed frame exit for an inactive frame', () => {
    const a = composition.createRetirementStartFake('frame_exit_failure');
    expect(a.prepare()).toMatchObject({ ok: false, disposition: 'frame_unconfirmed' });
    expect(a.inspect()).toMatchObject({ requested: true, controlState: 'stopped' }); a.request();
    expect(a.inspect()).toMatchObject({ frame: 'unconfirmed', starts: 0, claim: 'unused',
      retirementFirst: 'frame_unconfirmed', attempt: 'not_started', fieldWrites: 0 });
  });
  it('keeps fixed field diagnostics unobserved and does not leak a caught exception', () => {
    const a = composition.createRetirementStartFake('throw_in_frame'); a.prepare();
    expect(a.inspect().fields).toHaveLength(30);
    for (const [i, field] of a.inspect().fields.entries()) expect(field).toEqual({ field: `F${String(i + 1).padStart(2, '0')}`,
      presence: 'not_observed', writeAttempted: false, emptyConfirmed: false });
    expect(Object.isFrozen(a.inspect().fields)).toBe(true);
    expect(a.inspect().groups).toEqual(Array.from({ length: 8 }, (_, i) => ({ group: `R${i + 1}`, status: 'unverified' })));
    expect(JSON.stringify(a.inspect())).not.toContain('synthetic_private_frame_exception');
  });
  it('keeps a prior input diagnosis across close and never prepares after an early retirement request', () => {
    const a = composition.createRetirementStartFake(); a.prepare('invalid'); a.close();
    expect(a.inspect()).toMatchObject({ firstReason: 'binding_mismatch', frameExits: 0, starts: 1, sourceCapture: 'empty' });
    const early = composition.createRetirementStartFake(); early.close();
    expect(early.prepare().ok).toBe(false);
    expect(early.inspect()).toMatchObject({ firstReason: 'none', frameExits: 0, starts: 1, sourceCapture: 'empty' });
  });
  it('matches an independent finite operation oracle without touching retained fields', () => {
    const ops = ['prepare', 'request', 'close'] as const;
    for (const x of ops) for (const y of ops) for (const z of ops) {
      const a = composition.createRetirementStartFake();
      let prepared = false, requested = false, first = 'none';
      for (const op of [x, y, z]) {
        if (op === 'prepare') { if (!prepared && !requested) prepared = true; }
        else { requested = true; if (op === 'close' && prepared && first === 'none') first = 'supply_closed'; }
        a[op]();
        expect(a.inspect()).toMatchObject({ starts: Number(requested), claim: requested ? 'spent' : 'unused',
          firstReason: first, frame: 'inactive', fieldWrites: 0, payload: 'not_started', rootFinish: 'not_called' });
        if (prepared) expect(a.inspect()).toMatchObject({ retained: { R1: 3, R2: 5, R3: 2, R4: 2 },
          source: { counts: { discardPasses: 0 }, root: { retainedBorrow: true, retainedSnapshot: true } } });
      }
    }
  });
  it.each([['source_rejected', 'source_rejected', 'captured'], ['source_unknown', 'generation_unavailable', 'unknown']] as const)(
    'preserves the source prefix without clear or root finish: %s', (script, reason, sourceCapture) => {
      const a = composition.createRetirementStartFake(script); a.prepare(); a.close();
      expect(a.inspect()).toMatchObject({ firstReason: reason, sourceCapture, starts: 1, fieldWrites: 0,
        payload: 'not_started', rootFinish: 'not_called', proofIssuance: 'closed' });
    });
  it('rejects foreign inputs without running their hooks or opening a new execution surface', () => {
    let hooks = 0;
    const input = new Proxy({}, { get() { hooks++; throw new Error('private_marker'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[input], ['normal', input], [() => { hooks++; }], ['unknown']]) {
      const a = composition.createRetirementStartFake(...args);
      expect(a.prepare().ok).toBe(false); expect(a.request().ok).toBe(false);
      expect(a.inspect()).toMatchObject({ starts: 0, claim: 'unused' });
    }
    const a = composition.createRetirementStartFake();
    expect(Object.keys(a)).toEqual(['prepare', 'request', 'close', 'inspect']);
    expect(a.prepare(input).ok).toBe(false); expect(hooks).toBe(0);
  });
  it.each(['throw_in_frame', 'prepare_failure'])('requests retirement from inside the failed frame and starts it only after finally: %s', script => {
    const a = composition.createRetirementStartFake(script);
    expect(a.prepare()).toMatchObject({ ok: false });
    expect(a.inspect()).toMatchObject({ requested: true, starts: 1, claim: 'spent', attempt: 'running', frame: 'inactive',
      deferred: { disposition: 'deferred_frame', starts: 0, claim: 'unused', frame: 'active' }, controlState: 'stopped' });
  });
  it('stops the control when an argument-bearing call is rejected', () => {
    const a = composition.createRetirementStartFake(); a.prepare();
    expect(a.inspect().controlState).toBe('unused');
    expect(a.prepare('x')).toMatchObject({ ok: false, disposition: 'input_rejected' });
    expect(a.inspect()).toMatchObject({ controlState: 'stopped', firstReason: 'binding_mismatch', starts: 0 });
  });
});
