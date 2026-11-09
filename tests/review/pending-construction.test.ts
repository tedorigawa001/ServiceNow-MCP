import { describe, expect, it } from 'vitest';
import { createPendingConstructionFake } from './fixtures/pending-construction-fake.js';
import { createSupplyBoundaryFake } from './fixtures/supply-boundary-fake.js';

describe('unbound pending construction', () => {
  it('prepares four empty slots under one prior owner without creating a source', () => {
    const a = createPendingConstructionFake();
    expect(a.prepare()).toMatchObject({ ok: true });
    expect(a.inspect()).toMatchObject({ state: 'prepared_unbound', generationClaim: 'spent',
      retainedSlots: 4, confirmedSlots: 4, diagnosticSlot: 'ready', resultSlot: 'empty',
      source: 'not_created', sourceBinding: 'not_connected', payloadMoves: 0, claimsConsumed: 0,
      proofIssuance: 'closed', rootFinish: 'not_called', retirement: 'not_started' });
  });
  it.each(['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'])(
    'keeps the exact captured prefix when %s cannot be generated', role => {
      const a = createPendingConstructionFake(`mint_${role}_failure`);
      expect(a.prepare()).toMatchObject({ reason: 'generation_unavailable' });
      const order = ['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'];
      const n = order.indexOf(role);
      expect(a.inspect()).toMatchObject({ generationClaim: 'spent', retainedSlots: n, confirmedSlots: n, generationStarts: 1 });
      expect(a.inspect().stages[n]).toMatchObject({ stage: 'not_created', retained: false });
      const before = a.inspect();
      expect(a.prepare()).toMatchObject({ reason: 'generation_unavailable' });
      expect(a.inspect()).toEqual(before);
    });
  it.each(['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'])(
    'retains provisional %s rather than pretending capture failure means no object', role => {
      const a = createPendingConstructionFake(`capture_${role}_failure`);
      expect(a.prepare()).toMatchObject({ reason: 'capture_unconfirmed' });
      const i = ['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'].indexOf(role);
      expect(a.inspect()).toMatchObject({ retainedSlots: i + 1, confirmedSlots: i, generationStarts: 1 });
      expect(a.inspect().stages[i]).toMatchObject({ stage: 'provisional', retained: true });
      const end = a.seal();
      a.close(); a.prepare(); expect(a.seal()).toBe(end);
    });
  it.each(['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'])(
    'does not label an uncaptured %s attempt as proven not-created', role => {
      const a = createPendingConstructionFake(`attempt_${role}_failure`);
      expect(a.prepare()).toMatchObject({ reason: 'capture_unconfirmed' });
      const i = ['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'].indexOf(role);
      expect(a.inspect()).toMatchObject({ retainedSlots: i, confirmedSlots: i, generationStarts: 1 });
      expect(a.inspect().stages[i]).toMatchObject({ stage: 'attempting', retained: false });
    });
  const roles = ['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'];
  it.each(roles.flatMap(role => ['construction', 'retention', 'origin', 'role', 'state', 'brand', 'parent', 'payload', 'copy']
    .map(field => ({ role, field }))))('rejects isolated $role/$field under the prior owner', ({ role, field }) => {
    const a = createPendingConstructionFake(`mix_${role}_${field}`);
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
    const n = roles.indexOf(role);
    expect(a.inspect()).toMatchObject({ generationClaim: 'spent', retainedSlots: n + 1, confirmedSlots: n,
      source: 'not_created', claimsConsumed: 0, rootFinish: 'not_called' });
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
  });
  it.each(['claim_copy', 'claim_construction', 'claim_retention', 'diagnostic_construction', 'diagnostic_retention',
    'result_construction', 'result_retention'])('refuses %s before the generation claim starts', scenario => {
    const a = createPendingConstructionFake(scenario);
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.inspect()).toMatchObject({ inputValid: true, generationStarts: 0, generationClaim: 'unused', retainedSlots: 0 });
    if (scenario.startsWith('diagnostic_') || scenario.startsWith('result_')) {
      expect(a.seal()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(a.inspect().resultSlot).toBe('empty');
    }
  });
  it.each(roles.flatMap(role => ['close', 'reenter'].map(action => ({ role, action }))))(
    'stops after captured $role on $action without generating later slots', ({ role, action }) => {
      const a = createPendingConstructionFake(`${action}_after_${role}`);
      expect(a.prepare()).toMatchObject({ ok: false, reason: action === 'close' ? 'supply_closed' : 'duplicate_generation' });
      const n = roles.indexOf(role) + 1;
      expect(a.inspect()).toMatchObject({ generationStarts: 1, retainedSlots: n, confirmedSlots: n });
      const end = a.seal(); a.prepare(); a.close(); expect(a.seal()).toBe(end);
    });
  it('keeps the claim spent on repeat generation and preserves the first diagnosis', () => {
    const a = createPendingConstructionFake(); a.prepare();
    expect(a.prepare()).toMatchObject({ reason: 'duplicate_generation' });
    expect(a.close()).toMatchObject({ reason: 'duplicate_generation' });
    expect(a.inspect()).toMatchObject({ firstReason: 'duplicate_generation', generationStarts: 1, retainedSlots: 4 });
    expect(a.prepare()).toMatchObject({ reason: 'duplicate_generation' });
  });
  it('keeps a claimless close as stop only and does not start generation afterwards', () => {
    const a = createPendingConstructionFake(); a.close();
    expect(a.prepare()).toMatchObject({ reason: 'supply_closed' });
    expect(a.inspect()).toMatchObject({ firstReason: 'none', generationStarts: 0, retainedSlots: 0 });
  });
  it('seals only diagnostic results, not retirement, and never mutates the terminal result afterwards', () => {
    const a = createPendingConstructionFake(); a.prepare();
    const end = a.seal();
    expect(end).toMatchObject({ resultSlot: 'sealed', state: 'sealed', retainedSlots: 4, retirement: 'not_started' });
    expect(a.prepare()).toMatchObject({ reason: 'already_sealed' });
    expect(a.close()).toMatchObject({ reason: 'already_sealed' });
    expect(a.seal()).toBe(end); expect(a.inspect()).toBe(end);
    expect(Object.isFrozen(end)).toBe(true);
    if ('stages' in end) { expect(Object.isFrozen(end.stages)).toBe(true); expect(Object.isFrozen(end.stages[0])).toBe(true); }
  });
  it('rejects foreign facades, summaries, hooks and extra arguments without inspecting them', () => {
    let calls = 0;
    const p = new Proxy({}, { get() { calls++; throw Error('secret'); }, ownKeys() { calls++; throw Error('secret'); } });
    const existing = createPendingConstructionFake(); existing.prepare();
    for (const input of [p, () => { calls++; }, existing, existing.inspect(), existing.seal()]) {
      const a = createPendingConstructionFake(input);
      expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
      expect(a.inspect()).toMatchObject({ inputValid: false, generationStarts: 0, retainedSlots: 0 });
    }
    expect(createPendingConstructionFake('normal', p).prepare()).toMatchObject({ reason: 'binding_mismatch' });
    const a = createPendingConstructionFake(); expect(a.prepare(p)).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' }); expect(calls).toBe(0);
  });
  it('does not alter an existing source assembly and exposes no binding or runtime operations', () => {
    const old = createSupplyBoundaryFake(); old.prepare(); const before = old.inspect();
    const a = createPendingConstructionFake(); a.prepare(); a.close(); a.seal();
    expect(old.inspect()).toEqual(before);
    expect(Object.keys(a)).toEqual(['prepare', 'close', 'seal', 'inspect']);
    const s = a.inspect();
    expect(s).toMatchObject({ formalIssuance: 'closed', wholeRunAdmission: 'disabled', authority: 'none', ready: false,
      implementation: 'unknown', sourceBinding: 'not_connected', claimsConsumed: 0, payloadMoves: 0,
      rootFinish: 'not_called', retirement: 'not_started' });
    for (const secret of ['secret', '"payload"', '"construction"', '"retention"']) expect(JSON.stringify(s)).not.toContain(secret);
  });
  it('matches an independent allocation/capture-prefix oracle', () => {
    const sequence = ['pendingShell', 'pendingActive', 'failureShell', 'failureCustody'];
    for (let stop = 0; stop < sequence.length; stop++) for (const boundary of ['mint', 'attempt', 'capture']) {
      const a = createPendingConstructionFake(`${boundary}_${sequence[stop]}_failure`); a.prepare();
      const expected = sequence.map((role, i) => ({ role,
        stage: i < stop ? 'confirmed' : i > stop ? 'not_started' : boundary === 'mint' ? 'not_created' : boundary === 'attempt' ? 'attempting' : 'provisional',
        retained: i < stop || (i === stop && boundary === 'capture') }));
      expect(a.inspect().stages).toEqual(expected);
    }
  });
  it('matches an independent lifecycle oracle for all three-operation words', () => {
    const actions = ['prepare', 'close', 'seal', 'inspect'] as const;
    for (const x of actions) for (const y of actions) for (const z of actions) {
      const a = createPendingConstructionFake();
      const model = { state: 'unused', firstReason: 'none', closeRequested: false, spent: false, sealed: false, retained: 0 };
      for (const action of [x, y, z]) {
        if (!model.sealed) {
          if (action === 'prepare' && model.firstReason === 'none' && !model.closeRequested) {
            if (model.spent) { model.firstReason = 'duplicate_generation'; model.state = 'rejected'; }
            else { model.spent = true; model.retained = 4; model.state = 'prepared_unbound'; }
          }
          if (action === 'close') {
            model.closeRequested = true; model.state = 'closed';
            if (model.spent && model.firstReason === 'none') model.firstReason = 'supply_closed';
          }
          if (action === 'seal') { model.sealed = true; model.state = 'sealed'; }
        }
        a[action]();
        expect(a.inspect()).toMatchObject({ state: model.state, firstReason: model.firstReason,
          closeRequested: model.closeRequested, retainedSlots: model.retained, confirmedSlots: model.retained,
          generationStarts: model.spent ? 1 : 0, generationClaim: model.spent ? 'spent' : 'unused',
          resultSlot: model.sealed ? 'sealed' : 'empty', source: 'not_created', claimsConsumed: 0 });
      }
    }
  });
  it('links each active/custody slot to its own shell, checked against the captured cells rather than the parent helper', () => {
    const a = createPendingConstructionFake(); a.prepare();
    expect(a.inspect()).toMatchObject({ parentLinks: { pendingShell: 'none', pendingActive: 'own_shell',
      failureShell: 'none', failureCustody: 'own_shell' } });
    const early = createPendingConstructionFake('mint_failureShell_failure'); early.prepare();
    expect(early.inspect()).toMatchObject({ parentLinks: { pendingShell: 'none', pendingActive: 'own_shell',
      failureShell: 'absent', failureCustody: 'absent' } });
  });
  it('keeps role origins and the construction/retention scopes distinct', () => {
    const a = createPendingConstructionFake();
    expect(a.inspect()).toMatchObject({ scopeOriginsDistinct: true, roleOriginsDistinct: true });
    a.prepare();
    expect(a.inspect()).toMatchObject({ scopeOriginsDistinct: true, roleOriginsDistinct: true, retainedSlots: 4 });
  });
  it('keeps the first diagnosis on an argument-bearing retry and seals the pre-seal state separately', () => {
    const failed = createPendingConstructionFake('mint_pendingActive_failure'); failed.prepare();
    expect(failed.prepare('x')).toMatchObject({ ok: false, reason: 'generation_unavailable' });
    expect(failed.inspect().firstReason).toBe('generation_unavailable');
    expect(failed.seal()).toMatchObject({ state: 'sealed', sealedFrom: 'rejected' });
    expect(failed.prepare('x')).toMatchObject({ ok: false, reason: 'already_sealed' });
    const prepared = createPendingConstructionFake(); prepared.prepare();
    expect(prepared.seal()).toMatchObject({ sealedFrom: 'prepared_unbound' });
    const closed = createPendingConstructionFake(); closed.close();
    expect(closed.seal()).toMatchObject({ sealedFrom: 'closed', firstReason: 'none' });
  });
});
