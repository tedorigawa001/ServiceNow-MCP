import { describe, expect, it } from 'vitest';
import { createSupplyBoundaryFake } from './fixtures/supply-boundary-fake.js';

describe('unused-control supply boundary', () => {
  it('checks the same explicit payload without consuming or detaching it', () => {
    const a = createSupplyBoundaryFake();
    expect(a.prepare()).toMatchObject({ ok: true });
    expect(a.checkNormal()).toMatchObject({ ok: true });
    expect(a.checkRelation()).toMatchObject({ ok: true });
    expect(a.inspect()).toMatchObject({ controlState: 'unused', retainedPayload: true, retainedAnchor: true,
      claimsConsumed: 0, sourceDetaches: 0, holderPublications: 0,
      source: { retainedRegistry: true, retainedView: true, counts: { discardPasses: 0 } } });
  });
  it.each(['close', 'fail'] as const)('preserves identity and payload after stop-only %s', kind => {
    const a = createSupplyBoundaryFake(); a.prepare(); a[kind]();
    expect(a.checkNormal()).toMatchObject({ ok: false, reason: kind === 'close' ? 'supply_closed' : 'binding_mismatch' });
    expect(a.checkRelation()).toMatchObject({ ok: true });
    expect(a.inspect()).toMatchObject({ controlState: 'stopped', retainedPayload: true, retainedAnchor: true,
      sourceNormalAllowed: false, source: { retainedRegistry: true, retainedTable: true, retainedView: true,
        counts: { discardPasses: 0 }, retirementOrder: [], root: { retainedBorrow: true, retainedSnapshot: true,
          counts: { borrowRetirements: 0, snapshotRetirements: 0 } } } });
  });
  it('uses the same control at the source gate even while the root remains open', () => {
    const a = createSupplyBoundaryFake('control_stop_only'); a.prepare();
    expect(a.checkNormal()).toMatchObject({ ok: false, reason: 'supply_closed' });
    expect(a.inspect()).toMatchObject({ sourceNormalAllowed: false, legacyMatches: false,
      source: { root: { closeRequested: false, lifecycleFirst: 'none', readStop: 'none' } } });
    expect(a.checkRelation()).toMatchObject({ ok: true });
  });
  it.each(['begin', 'prepare', 'supply'])('blocks stopped source %s before its destructive legacy rejection', kind => {
    const a = createSupplyBoundaryFake(`source_${kind}_stopped`); a.prepare();
    expect(a.inspect()).toMatchObject({ sourceProbe: 'blocked', sourceNormalAllowed: false,
      source: { retainedView: true, counts: { discardPasses: 0 }, root: { lifecycleFirst: 'none' } } });
    expect(a.checkRelation()).toMatchObject({ ok: true });
  });
  it('rejects a copied control and stops through the original pinned control', () => {
    const a = createSupplyBoundaryFake('control_copy'); a.prepare();
    expect(a.checkNormal()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    expect(a.inspect()).toMatchObject({ sourceNormalAllowed: false,
      source: { root: { lifecycleFirst: 'binding_mismatch' }, counts: { discardPasses: 0 } } });
  });
  it.each(['payload_copy', 'anchor_copy', 'envelope_copy', 'registry_copy', 'table_copy', 'view_copy', 'declarations_copy', 'table_origin'])(
    'rejects %s rather than accepting equal values as issuance', scenario => {
      const a = createSupplyBoundaryFake(scenario); a.prepare();
      expect(a.checkRelation()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(a.checkNormal()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(a.inspect()).toMatchObject({ firstReason: 'binding_mismatch', retainedPayload: true, retainedAnchor: true,
        sourceNormalAllowed: false, source: { retainedRegistry: true, counts: { discardPasses: 0 },
          root: { lifecycleFirst: 'binding_mismatch', retainedBorrow: true } } });
    });
  it('does not add actual-length equality to relation checking', () => {
    const a = createSupplyBoundaryFake('source_short'); a.prepare();
    expect(a.checkRelation()).toMatchObject({ ok: true });
    expect(a.inspect().source.sourceShapes[0]).toMatchObject({ declaredBytes: 3, actualBytes: 2 });
  });
  it.each(['table_envelope', 'view_envelope', 'view_table', 'table_origin', 'view_declarations',
    'registry_count', 'binding_count', 'declaration_count', 'registry_file', 'registry_ordinal', 'duplicate_origin',
    'record_origin', 'record_shape', 'record_size', 'link_file', 'link_ordinal', 'link_origin', 'link_table_origin',
    'link_source', 'declaration_file', 'declaration_ordinal', 'declaration_binding'])(
    'rejects isolated value-only %s without installing a replacement issuance', field => {
      const a = createSupplyBoundaryFake(`value_${field}`); a.prepare();
      expect(a.checkRelation()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(a.inspect()).toMatchObject({ valueOnlyProbe: true, claimsConsumed: 0, sourceDetaches: 0,
        source: { retainedRegistry: true, counts: { registryRecords: 4, tables: 1, views: 1, discardPasses: 0 } } });
    });
  it('accepts the coherent value-only rebuild control, not as source issuance authority', () => {
    const a = createSupplyBoundaryFake('value_rebuild_control'); a.prepare();
    expect(a.checkRelation()).toMatchObject({ ok: true, authority: 'none' });
    expect(a.inspect()).toMatchObject({ valueOnlyProbe: true, claimsConsumed: 0, sourceDetaches: 0 });
  });
  it('rejects duplicate binding and repeat preparation without replacing the original authority', () => {
    const duplicate = createSupplyBoundaryFake('duplicate_bind');
    expect(duplicate.prepare()).toMatchObject({ reason: 'binding_mismatch' });
    expect(duplicate.inspect().controlState).toBe('stopped');
    const a = createSupplyBoundaryFake(); a.prepare();
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.inspect().source.counts.preparationClaims).toBe(1);
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
  });
  it('preserves first failure and keeps close as a separate stop axis', () => {
    const a = createSupplyBoundaryFake(); a.prepare(); a.fail(); a.close();
    expect(a.checkRelation()).toMatchObject({ ok: true });
    expect(a.checkNormal()).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.inspect()).toMatchObject({ firstReason: 'binding_mismatch', source: { firstReason: 'none',
      root: { closeRequested: true, lifecycleFirst: 'binding_mismatch', readFirst: 'binding', readStop: 'supply_closed' } } });
  });
  it('keeps a prepared close ahead of a later failure', () => {
    const a = createSupplyBoundaryFake(); a.prepare(); a.close(); a.fail();
    expect(a.checkNormal()).toMatchObject({ reason: 'supply_closed' });
    expect(a.checkRelation()).toMatchObject({ ok: true });
    expect(a.inspect()).toMatchObject({ firstReason: 'supply_closed',
      source: { root: { readFirst: 'supply_closed', readStop: 'supply_closed' }, counts: { discardPasses: 0 } } });
  });
  it('keeps claimless close as stop only and prevents later generation', () => {
    const a = createSupplyBoundaryFake(); a.close();
    expect(a.inspect().firstReason).toBe('none');
    expect(a.prepare()).toMatchObject({ reason: 'supply_closed' });
    expect(a.inspect().source.counts.preparationClaims).toBe(0);
  });
  it('bounds relation diagnostics and matches an independent stop oracle for all three-operation words', () => {
    const actions = ['checkNormal', 'checkRelation', 'close', 'fail'] as const;
    for (const x of actions) for (const y of actions) for (const z of actions) {
      const a = createSupplyBoundaryFake(); a.prepare();
      let stopped = false;
      for (const action of [x, y, z]) {
        if (action === 'close' || action === 'fail') stopped = true;
        const result = a[action]();
        if (action === 'checkNormal') expect(result.ok).toBe(!stopped);
        if (action === 'checkRelation') expect(result.ok).toBe(true);
      }
      const s = a.inspect();
      expect(s.sourceNormalAllowed).toBe(!stopped);
      expect(s.relationChecks).toBeLessThanOrEqual(1);
      expect([s.claimsConsumed, s.sourceDetaches, s.holderPublications, s.source.counts.discardPasses,
        s.source.root.counts.open, s.source.root.counts.read, s.source.root.counts.hash, s.source.root.counts.cleanup]).toEqual(Array(8).fill(0));
      expect(s.source.root.retainedBorrow).toBe(true);
    }
  });
  it('rejects hooks, previous facades and extra arguments without inspecting them', () => {
    let calls = 0;
    const p = new Proxy({}, { get() { calls++; throw Error('secret'); }, ownKeys() { calls++; throw Error('secret'); } });
    for (const input of [p, () => { calls++; }, createSupplyBoundaryFake()]) {
      const a = createSupplyBoundaryFake(input);
      expect(a.prepare()).toMatchObject({ reason: 'source_rejected' });
    }
    const a = createSupplyBoundaryFake();
    expect(a.prepare(p)).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.prepare()).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.inspect().source.counts.preparationClaims).toBe(0);
    expect(calls).toBe(0);
  });
  it('exposes neither take/detach/finish nor private inputs, and retains unretired references honestly', () => {
    const a = createSupplyBoundaryFake(); a.prepare(); a.close(); a.checkRelation();
    expect(Object.keys(a)).toEqual(['prepare', 'checkNormal', 'checkRelation', 'close', 'fail', 'inspect']);
    const s = a.inspect();
    expect(s).toMatchObject({ formalIssuance: 'closed', wholeRunAdmission: 'disabled', authority: 'none', ready: false,
      implementation: 'unknown', retirement: 'not_started', cleanupDisposition: 'not_started', retainedPayload: true });
    expect(Object.isFrozen(s)).toBe(true);
    for (const secret of ['ba7816bf', '"bytes"', 'transferOwner', '"anchor"', '"payload"']) expect(JSON.stringify(s)).not.toContain(secret);
  });
});
