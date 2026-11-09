import { describe, expect, it } from 'vitest';
import * as composition from './fixtures/snapshot-read-composition-fake.js';
import { createPendingConstructionFake } from './fixtures/pending-construction-fake.js';

describe('private pending/source binding', () => {
  it('keeps the old unbound factory as the same thin compatibility entry', () => {
    expect(composition.createPendingConstructionFake).toBe(createPendingConstructionFake);
    const a = createPendingConstructionFake(); a.prepare();
    expect(a.inspect()).toMatchObject({ source: 'not_created', sourceBinding: 'not_connected', retainedSlots: 4 });
  });
  it('binds one private retention construction to its own source and control without moving payload', () => {
    const a = composition.createPendingBindingFake();
    expect(a.prepare()).toMatchObject({ ok: true });
    expect(a.inspect()).toMatchObject({ state: 'bound', bindingStarts: 1, bound: true, rootSlot: 'captured',
      corePayloadFree: true, controlLiveBinding: true, claimsConsumed: 0, payloadMoves: 0,
      sourceDetaches: 0, holderPublications: 0, proofIssuance: 'closed', rootFinish: 'not_called',
      retainedSlots: 4, pendingPayload: false, failurePayload: false });
  });
  it.each(['core_owner', 'core_construction', 'core_retention', 'core_source', 'core_claim', 'core_extra_payload',
    'receipt_copy', 'receipt_construction', 'receipt_retention', 'receipt_source_slot', 'receipt_control', 'receipt_core', 'receipt_slots',
    'anchor_copy', 'payload_copy', 'claim_copy', 'claim_receiver'])(
    'refuses %s and stops only the owned source while retaining its obligations', scenario => {
      const a = composition.createPendingBindingFake(scenario);
      expect(a.prepare()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(a.inspect()).toMatchObject({ bound: false, bindingStarts: 1, rootSlot: 'captured', claimsConsumed: 0,
        retentionTable: { R1: 3, R2: 5, R3: 2, R4: 2 }, source: { counts: { discardPasses: 0 },
          root: { retainedBorrow: true, retainedSnapshot: true, lifecycleFirst: 'binding_mismatch' } } });
      expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
    });
  it('retires only the control live cell, preserves core identity and exposes remaining claim aliases', () => {
    const a = composition.createPendingBindingFake('retire_binding'); a.prepare();
    expect(a.inspect()).toMatchObject({ bound: true, sourceAttached: true, controlState: 'retired',
      controlLiveBinding: false, corePayloadFree: true, controlBindingRetirements: 1,
      retirement: 'not_started', retentionTable: { R1: 3, R2: 5,
        R7: { localControl: false, issuedControl: false, sourceControl: false, claimAliases: 2 } } });
    expect(a.check()).toMatchObject({ ok: false });
    a.close(); expect(a.inspect().controlState).toBe('retired');
  });
  it.each([
    ['before_source_failure', 'generation_unavailable', 'empty', false],
    ['source_attempt_failure', 'generation_unavailable', 'unknown', false],
    ['source_failure', 'source_rejected', 'captured', false],
    ['after_source_failure', 'generation_unavailable', 'captured', false],
    ['before_bind_failure', 'generation_unavailable', 'captured', false],
    ['after_bind_failure', 'generation_unavailable', 'captured', true],
    ['close_before_bind', 'supply_closed', 'captured', false],
    ['close_after_bind', 'supply_closed', 'captured', true],
    ['reenter_before_bind', 'duplicate_binding', 'captured', false],
  ] as const)('retains the independently specified prefix at %s', (script, reason, slot, attached) => {
    const a = composition.createPendingBindingFake(script);
    expect(a.prepare()).toMatchObject({ ok: false, reason });
    const before = a.inspect();
    expect(before).toMatchObject({ bound: false, firstReason: reason, rootSlot: slot, bindingStarts: 1,
      sourceAttached: attached, retainedSlots: 4, claimsConsumed: 0, payloadMoves: 0,
      sourceDetaches: 0, rootFinish: 'not_called', resourceCleanup: 'not_started' });
    a.prepare(); a.check(); a.close(); a.close();
    expect(a.inspect()).toMatchObject({ firstReason: reason, rootSlot: slot, bindingStarts: 1,
      sourceAttached: attached, retentionTable: before.retentionTable });
    if (before.source) expect(a.inspect().source).toMatchObject({ counts: { discardPasses: before.source.counts.discardPasses } });
  });
  it('never rebinds after a normal bind or hides the first duplicate diagnosis with close', () => {
    const a = composition.createPendingBindingFake();
    a.prepare(); expect(a.check().ok).toBe(true);
    expect(a.prepare()).toMatchObject({ ok: false, reason: 'duplicate_binding' });
    expect(a.close()).toMatchObject({ reason: 'duplicate_binding' });
    expect(a.inspect()).toMatchObject({ bindingStarts: 1, sourceAttached: true, controlState: 'stopped',
      source: { counts: { discardPasses: 0 }, root: { retainedBorrow: true, retainedSnapshot: true } } });
  });
  it('close before prepare never generates a source', () => {
    const a = composition.createPendingBindingFake(); a.close();
    expect(a.prepare()).toMatchObject({ ok: false, reason: 'supply_closed' });
    expect(a.inspect()).toMatchObject({ firstReason: 'none', bindingStarts: 0, rootSlot: 'empty', source: undefined });
  });
  it('a premature check permanently refuses preparation without generating a source', () => {
    const a = composition.createPendingBindingFake(); a.check();
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.inspect()).toMatchObject({ bindingStarts: 0, rootSlot: 'empty' });
  });
  it.each(['retire_binding_twice', 'retire_binding_with_claim_alias', 'retire_binding_with_control_alias'])(
    'distinguishes a single cell retirement from all-alias retirement: %s', script => {
      const a = composition.createPendingBindingFake(script); a.prepare();
      expect(a.inspect()).toMatchObject({ controlBindingRetirements: 1, controlState: 'retired',
        retirement: 'not_started', rootFinish: 'not_called', retentionTable: { R1: 3, R2: 5, R3: 2, R4: 2,
          R7: { localControl: false, issuedControl: false, sourceControl: false, extraControl: false,
            claimAliases: script === 'retire_binding_with_claim_alias' ? 3 : 2,
            controlAliases: script === 'retire_binding_with_control_alias' ? 3 : 2 } } });
      expect(a.check().ok).toBe(false);
    });
  it('does not adopt summaries or invoke input hooks and has no execution/finish surface', () => {
    let hooks = 0;
    const hostile = new Proxy({}, { get() { hooks++; throw new Error('must_not_read'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[hostile], ['normal', hostile], [() => { hooks++; }]]) {
      const a = composition.createPendingBindingFake(...args);
      expect(a.prepare().ok).toBe(false);
      expect(a.inspect()).toMatchObject({ bindingStarts: 0, rootSlot: 'empty' });
    }
    const a = composition.createPendingBindingFake();
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'close', 'inspect']);
    expect(a.prepare(hostile).ok).toBe(false); expect(hooks).toBe(0);
    const old = createPendingConstructionFake(); expect(old.prepare().ok).toBe(true);
    expect(old.inspect()).toMatchObject({ source: 'not_created', sourceBinding: 'not_connected' });
  });
  it('refuses a retired control even when its original root is still live and has no first failure', () => {
    const a = composition.createPendingBindingFake('retire_binding_root_live'); a.prepare();
    expect(a.inspect()).toMatchObject({ firstReason: 'none', controlState: 'retired', retiredSourceAllowed: false,
      source: { root: { lifecycleFirst: 'none', retainedBorrow: true, retainedSnapshot: true } } });
    expect(a.check()).toMatchObject({ ok: false, reason: 'supply_closed' });
  });
  it('matches a finite lifecycle oracle without changing retained obligations', () => {
    const operations = ['prepare', 'check', 'close'] as const;
    for (const x of operations) for (const y of operations) for (const z of operations) {
      const a = composition.createPendingBindingFake();
      let started = false, closed = false, first = 'none';
      for (const op of [x, y, z]) {
        if (op === 'close') { closed = true; if (started && first === 'none') first = 'supply_closed'; }
        else if (first === 'none' && !closed) {
          if (op === 'prepare') { if (started) first = 'duplicate_binding'; else started = true; }
          else if (!started) first = 'binding_mismatch';
        }
        a[op]();
        expect(a.inspect()).toMatchObject({ bindingStarts: Number(started), firstReason: first,
          rootSlot: started ? 'captured' : 'empty', sourceAttached: started,
          claimsConsumed: 0, payloadMoves: 0, sourceDetaches: 0 });
        if (started) expect(a.inspect()).toMatchObject({ retentionTable: { R1: 3, R2: 5, R3: 2, R4: 2 },
          source: { counts: { discardPasses: 0 }, root: { retainedBorrow: true, retainedSnapshot: true } } });
      }
    }
  });
  it.each([
    ['after_source_failure', 'read_prepare_unavailable', 'read_prepare_unavailable'],
    ['before_bind_failure', 'read_prepare_unavailable', 'read_prepare_unavailable'],
    ['after_bind_failure', 'read_prepare_unavailable', 'read_prepare_unavailable'],
    ['reenter_before_bind', 'binding_mismatch', 'binding'],
  ] as const)('maps %s to the root lifecycle reason of its own failure class', (script, lifecycleFirst, readFirst) => {
    const a = composition.createPendingBindingFake(script); a.prepare();
    expect(a.inspect().source?.root).toMatchObject({ lifecycleFirst, readFirst });
  });
  it('leaves the source-owned supply failure diagnosis alone instead of adding a binding diagnosis to the root', () => {
    const a = composition.createPendingBindingFake('source_failure'); a.prepare();
    expect(a.inspect()).toMatchObject({ firstReason: 'source_rejected', source: { firstReason: 'supply_prepare_unavailable',
      root: { supplyFirst: 'supply_invalid', lifecycleFirst: 'none', readFirst: 'none' } } });
  });
  it.each(['normal', 'close_after_bind'])('propagates close to the control, the owned root and the retention root: %s', script => {
    const a = composition.createPendingBindingFake(script); a.prepare(); a.close();
    expect(a.inspect()).toMatchObject({ firstReason: 'supply_closed', controlState: 'stopped', retentionCloseRequested: true,
      source: { counts: { discardPasses: 0 }, root: { closeRequested: true, readStop: 'supply_closed', retainedBorrow: true } } });
    const early = composition.createPendingBindingFake(); early.close();
    expect(early.inspect()).toMatchObject({ firstReason: 'none', retentionCloseRequested: true });
  });
  it('refuses a retired control at every source gate, not only check()', () => {
    const a = composition.createPendingBindingFake('retire_binding_gate_probe'); a.prepare();
    expect(a.inspect()).toMatchObject({ controlState: 'retired', firstReason: 'none',
      retiredGateProbe: { capture: 'refused', matches: 'refused', begin: 'supply_closed', prepare: 'supply_closed',
        prepareSupply: 'supply_closed' }, source: { firstReason: 'none', counts: { discardPasses: 0 },
        root: { lifecycleFirst: 'none', retainedBorrow: true, retainedSnapshot: true } } });
  });
});
