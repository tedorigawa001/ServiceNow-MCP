import { describe, expect, it } from 'vitest';
import { createCanonicalSupplyViewFake } from './fixtures/canonical-supply-view-fake.js';
import { canonicalFailurePoints, canonicalGenerationOracle } from './fixtures/canonical-supply-oracle.js';
import { createReadHashFake } from './fixtures/read-hash-fake.js';
import { createSnapshotReadStartFake } from './fixtures/snapshot-read-start-fake.js';

describe('C canonical registry/table/view preparation only', () => {
  it('prepares all four canonical files without execution or transfer authority', () => {
    const c = createCanonicalSupplyViewFake(); c.begin(); c.prepare();
    expect(c.prepareSupply()).toMatchObject({ ok: true });
    expect(c.inspect()).toMatchObject({ preparationState: 'prepared', firstReason: 'none',
      retainedRegistry: true, retainedTable: true, retainedView: true, transferClaim: 'not_issued',
      counts: { preparationClaims: 1, registryRecords: 4, bindings: 4, declarations: 4, tables: 1, views: 1 },
      fileSlots: [{ id: 'F01', ordinal: 0 }, { id: 'F02', ordinal: 1 }, { id: 'O01', ordinal: 2 }, { id: 'T01', ordinal: 3 }],
      root: { readState: 'prepared', counts: { mapChecks: 1, snapshots: 1, sessions: 1, budgetOrigins: 1,
        open: 0, read: 0, hash: 0, cleanup: 0 } } });
  });
  it('rejects swapping equally sized abc source records across canonical files', () => {
    const c = createCanonicalSupplyViewFake('record_swap'); c.begin(); c.prepare();
    expect(c.prepareSupply()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    expect(c.inspect()).toMatchObject({ firstReason: 'binding_mismatch', preparationState: 'discarded',
      retainedRegistry: false, retainedTable: false, retainedView: false, counts: { preparationClaims: 1 },
      root: { readState: 'unwinding', counts: { open: 0, read: 0, hash: 0 } } });
  });
  it('keeps partial registry custody and the consumed claim on a generation failure', () => {
    const c = createCanonicalSupplyViewFake('registry_2_failure'); c.begin(); c.prepare();
    expect(c.prepareSupply()).toMatchObject({ ok: false, reason: 'supply_prepare_unavailable' });
    const stopped = c.inspect();
    expect(stopped).toMatchObject({ firstReason: 'supply_prepare_unavailable', preparationState: 'discarded',
      retainedRegistry: false, retainedBuilding: false, retainedEnvelope: false,
      counts: { preparationClaims: 1, registryRecords: 2, bindings: 0, discardPasses: 1 } });
    c.prepareSupply(); c.begin(); c.prepare(); expect(c.inspect().counts).toEqual(stopped.counts);
  });
  it('rejects foreign envelope components, malformed correspondence and unissued copies', () => {
    for (const scenario of ['envelope_owner_mix', 'envelope_snapshot_mix', 'envelope_set_mix', 'envelope_map_copy',
      'envelope_map_redecode', 'envelope_raw_map', 'envelope_files_copy', 'envelope_rows_copy', 'envelope_file_copy',
      'envelope_ordinal_mix', 'envelope_session_mix', 'envelope_budget_mix', 'envelope_borrow_copy', 'envelope_prepared_copy',
      'binding_missing', 'binding_duplicate', 'binding_extra', 'binding_order', 'binding_ordinal', 'binding_file_copy',
      'binding_legacy', 'origin_swap', 'record_origin_swap', 'table_copy', 'view_copy', 'foreign_table', 'foreign_view']) {
      const c = createCanonicalSupplyViewFake(scenario); c.begin(); c.prepare();
      expect(c.prepareSupply(), scenario).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(c.inspect(), scenario).toMatchObject({ counts: { preparationClaims: 1 }, preparationState: 'discarded',
        retainedRegistry: false, retainedTable: false, retainedView: false, retainedBuilding: false });
    }
  });
  it('does not confuse actual length/content changes with identity failure or replace the declaration', () => {
    for (const [scenario, actualBytes, backingBytes, eventCount] of [
      ['source_zero', 0, 0, 0], ['source_short', 2, 2, 0], ['source_extra', 4, 4, 0], ['source_abd', 3, 3, 0],
      ['source_shrink', 3, 3, 1], ['source_grow', 3, 4, 1],
    ] as const) {
      const c = createCanonicalSupplyViewFake(scenario); c.begin(); c.prepare();
      expect(c.prepareSupply(), scenario).toMatchObject({ ok: true });
      expect(c.inspect().sourceShapes[0]).toEqual({ id: 'F01', declaredBytes: 3, actualBytes, backingBytes, eventCount });
      expect(c.inspect()).toMatchObject({ hash: 'not_checked', transferClaim: 'not_issued',
        root: { counts: { open: 0, read: 0, hash: 0, cleanup: 0 } } });
    }
  });
  it('conserves every generation prefix, stops permanently and retires references before the borrow', () => {
    for (const point of canonicalFailurePoints) {
      const c = createCanonicalSupplyViewFake(point + '_failure'); c.begin(); c.prepare();
      expect(c.prepareSupply(), point).toMatchObject({ ok: false, reason: 'supply_prepare_unavailable' });
      expect(c.inspect().counts, point).toEqual(canonicalGenerationOracle(point));
      expect(c.inspect()).toMatchObject({ retainedRegistry: false, retainedTable: false, retainedView: false,
        retainedBuilding: false, root: { retainedBorrow: true, retainedSnapshot: true } });
      const stopped = c.inspect().counts; c.prepareSupply(); c.begin(); c.prepare(); c.check();
      expect(c.inspect().counts).toEqual(stopped);
      const end = c.finish();
      expect(end).toMatchObject({ retainedRegistry: false, retainedTable: false, retainedView: false,
        retainedEnvelope: false, retainedIssuedTable: false, retainedIssuedView: false, retainedBuilding: false,
        root: { retainedBorrow: false, retainedSnapshot: false, counts: { borrowRetirements: 1, snapshotRetirements: 1 } } });
      expect(end.retirementOrder).toEqual(point === 'envelope'
        ? ['borrow_retired', 'snapshot_retired'] : ['supply_references_cleared', 'borrow_retired', 'snapshot_retired']);
    }
  });
  it('fails closed on duplicate or reentrant preparation without issuing a second claim', () => {
    const c = createCanonicalSupplyViewFake(); c.begin(); c.prepare(); c.prepareSupply();
    expect(c.prepareSupply()).toMatchObject({ ok: false, reason: 'duplicate_preparation' });
    expect(c.inspect()).toMatchObject({ preparationState: 'discarded', retainedView: false,
      counts: { preparationClaims: 1, registryRecords: 4, tables: 1, views: 1 } });
    const r = createCanonicalSupplyViewFake('reentrant_preparation'); r.begin(); r.prepare();
    expect(r.prepareSupply()).toMatchObject({ ok: false, reason: 'duplicate_preparation' });
    expect(r.inspect()).toMatchObject({ counts: { preparationClaims: 1, registryRecords: 0, tables: 0, views: 0 } });
  });
  it('rejects wrong-order and argument-based adoption without inspecting caller objects', () => {
    const early = createCanonicalSupplyViewFake();
    expect(early.prepareSupply()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    early.begin(); early.prepare(); expect(early.inspect().counts.preparationClaims).toBe(0);
    let hooks = 0;
    const input = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    const invalid = createCanonicalSupplyViewFake(input); invalid.begin(); invalid.prepareSupply();
    expect(invalid.inspect()).toMatchObject({ root: { supplyFirst: 'supply_invalid', readState: 'unused', counts: { startClaims: 0 } } });
    const c = createCanonicalSupplyViewFake(); c.begin(); c.prepare(); c.prepareSupply(input);
    expect(c.inspect()).toMatchObject({ firstReason: 'binding_mismatch', counts: { preparationClaims: 0 } });
    expect(hooks).toBe(0);
  });
  it('separates close from binding faults and preserves the terminal diagnosis on later calls', () => {
    for (const scenario of ['normal', 'close_during_registry', 'close_before_post']) {
      const c = createCanonicalSupplyViewFake(scenario); c.begin(); c.prepare(); c.prepareSupply(); c.close();
      const end = c.finish();
      expect(end).toMatchObject({ firstReason: 'supply_closed', retainedView: false, transferClaim: 'not_issued',
        root: { readStop: 'supply_closed', counts: { open: 0, read: 0, hash: 0, cleanup: 0 } } });
      c.prepareSupply(); c.begin(); c.prepare(); c.close(); expect(c.finish()).toBe(end); expect(c.inspect()).toBe(end);
    }
  });
  it('keeps all 625 four-operation words bounded, non-executing and terminally immutable', () => {
    const operations = ['begin', 'prepare', 'prepareSupply', 'close', 'finish'] as const;
    for (let word = 0; word < 625; word++) {
      const c = createCanonicalSupplyViewFake(); let rest = word;
      for (let i = 0; i < 4; i++) { c[operations[rest % 5]](); rest = Math.floor(rest / 5); }
      const end = c.finish();
      expect(end.counts.preparationClaims).toBeLessThanOrEqual(1);
      expect(end.counts.registryRecords).toBeLessThanOrEqual(4);
      expect(end.counts.tables).toBeLessThanOrEqual(1); expect(end.counts.views).toBeLessThanOrEqual(1);
      expect(end.retirementOrder.length).toBeLessThanOrEqual(3);
      expect(end).toMatchObject({ retainedRegistry: false, retainedTable: false, retainedView: false, retainedEnvelope: false,
        retainedIssuedTable: false, retainedIssuedView: false, retainedIssuedDeclarations: false, retainedBuilding: false,
        transferClaim: 'not_issued', root: { counts: { open: 0, read: 0, hash: 0, cleanup: 0 } } });
      c.begin(); c.prepare(); c.prepareSupply(); c.close(); expect(c.finish()).toBe(end);
    }
  });
  it('keeps readonly checks claim-free, exposes no private values and has no transfer method', () => {
    const c = createCanonicalSupplyViewFake(); c.begin(); c.prepare(); c.prepareSupply();
    const prepared = c.inspect(); c.check(); c.check(); expect(c.inspect().counts).toEqual(prepared.counts);
    expect(prepared.rowStates).toEqual(Array.from({ length: 12 }, (_, i) =>
      ({ id: `SC${String(i + 1).padStart(2, '0')}`, status: 'unimplemented', missingCount: 1 })));
    expect(Object.keys(c)).toEqual(['check', 'begin', 'prepare', 'prepareSupply', 'close', 'finish', 'inspect']);
    expect(JSON.stringify(prepared)).not.toMatch(/ba7816|synthetic-read-start\/|\[97|sourceRecord|rawError|stack|expectedSha256/);
    const end = c.finish(); expect(end.root.retainedSnapshot).toBe(true);
    expect(end).toMatchObject({ firstReason: 'none', root: { counts: { borrowRetirements: 1, snapshotRetirements: 0 } } });
  });
  it('keeps source/owner construction failures before the supply claim without inventing a read stop', () => {
    for (const scenario of ['owner_failure', 'result_slot_failure', 'custody_failure', 'source_failure',
      'map_rejected', 'snapshot_failure', 'after_snapshot_failure']) {
      const c = createCanonicalSupplyViewFake(scenario); c.begin(); c.prepare(); c.prepareSupply(); c.close();
      expect(c.inspect(), scenario).toMatchObject({ firstReason: 'supply_prepare_unavailable',
        counts: { preparationClaims: 0, registryRecords: 0 },
        root: { supplyFirst: 'supply_invalid', readState: 'unused', readFirst: 'none', readStop: 'none', counts: { startClaims: 0 } } });
      c.finish();
    }
  });
  it('cannot adopt another root, legacy result or a valid-looking public summary', () => {
    const other = createCanonicalSupplyViewFake(); other.begin(); other.prepare(); other.prepareSupply();
    const start = createSnapshotReadStartFake(); start.begin(); start.prepare();
    for (const input of [other, other.inspect(), other.finish(), start.inspect(), createReadHashFake().run()]) {
      const c = createCanonicalSupplyViewFake(input); c.begin(); c.prepareSupply();
      expect(c.inspect()).toMatchObject({ counts: { preparationClaims: 0, registryRecords: 0 },
        root: { supplyFirst: 'supply_invalid', counts: { startClaims: 0 } } });
    }
  });
});

describe('C canonical post-validation clauses in isolation (review fix)', () => {
  // Each selector re-issues a consistent table/view/registry so exactly one post-validation clause fails.
  for (const [scenario, fileChecks] of [
    ['post_table_unissued', 0], ['post_table_envelope', 0], ['post_view_envelope', 0], ['post_view_table', 0],
    ['post_table_origin', 0], ['post_declarations_unissued', 0], ['post_registry_missing', 0],
    ['post_table_bindings_short', 0], ['post_view_declarations_short', 0],
    ['post_registry_file', 1], ['post_registry_ordinal', 1], ['post_registry_duplicate_origin', 2],
    ['post_source_origin', 1], ['post_invalid_record', 1], ['post_source_oversize', 1],
    ['post_binding_file', 1], ['post_binding_ordinal', 1], ['post_binding_table_origin', 1],
    ['post_declaration_file', 1], ['post_declaration_ordinal', 1], ['post_declaration_binding', 1],
  ] as const) {
    it(`rejects only its own clause: ${scenario}`, () => {
      const c = createCanonicalSupplyViewFake(scenario); c.begin(); c.prepare();
      expect(c.prepareSupply()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(c.inspect()).toMatchObject({ firstReason: 'binding_mismatch', preparationState: 'discarded',
        retainedRegistry: false, retainedTable: false, retainedView: false, retainedTableOrigin: false,
        counts: { preparationClaims: 1, registryRecords: 4, tables: 1, views: 1, validationPasses: 1, fileChecks },
        root: { lifecycleFirst: 'binding_mismatch', readFirst: 'binding' } });
    });
  }
  it('accepts the re-issued valid bases used by the isolated controls', () => {
    for (const scenario of ['post_reissue_control', 'post_registry_rebuild_control']) {
      const c = createCanonicalSupplyViewFake(scenario); c.begin(); c.prepare();
      expect(c.prepareSupply(), scenario).toMatchObject({ ok: true });
      expect(c.inspect().counts, scenario).toMatchObject({ validationPasses: 1, fileChecks: 4 });
    }
  });
});

describe('C canonical supply reason routing (review fix)', () => {
  it('records the generation failure on the parent lifecycle as read_prepare_unavailable', () => {
    const c = createCanonicalSupplyViewFake('registry_2_failure'); c.begin(); c.prepare(); c.prepareSupply();
    expect(c.inspect().root).toMatchObject({ lifecycleFirst: 'read_prepare_unavailable', readFirst: 'read_prepare_unavailable' });
    expect(c.check()).toMatchObject({ ok: false, reason: 'supply_prepare_unavailable' });
  });
  it('maps parent prepare failures without inventing a supply claim', () => {
    for (const [scenario, reason] of [['borrow_failure', 'supply_prepare_unavailable'], ['result_prepare_failure', 'supply_prepare_unavailable'],
      ['borrow_copy', 'binding_mismatch']] as const) {
      const c = createCanonicalSupplyViewFake(scenario); c.begin();
      expect(c.prepare(), scenario).toMatchObject({ ok: false, reason });
      expect(c.inspect(), scenario).toMatchObject({ firstReason: reason, counts: { preparationClaims: 0 } });
    }
  });
  it('rejects a direct preparation after a construction failure as supply_prepare_unavailable', () => {
    const c = createCanonicalSupplyViewFake('map_rejected');
    expect(c.prepareSupply()).toMatchObject({ ok: false, reason: 'supply_prepare_unavailable' });
    expect(c.inspect()).toMatchObject({ counts: { preparationClaims: 0 }, root: { supplyFirst: 'supply_invalid', readState: 'unused' } });
  });
  it('does not admit a valid selector followed by an extra factory argument', () => {
    const c = createCanonicalSupplyViewFake('normal', 'extra'); c.begin(); c.prepare();
    expect(c.prepareSupply()).toMatchObject({ ok: false, reason: 'supply_prepare_unavailable' });
    expect(c.inspect()).toMatchObject({ counts: { preparationClaims: 0 }, root: { supplyFirst: 'supply_invalid', counts: { startClaims: 0 } } });
  });
  it('distinguishes a claim-less close from a later rejected preparation', () => {
    const quiet = createCanonicalSupplyViewFake(); quiet.begin(); quiet.prepare(); quiet.close();
    expect(quiet.finish()).toMatchObject({ firstReason: 'none', counts: { preparationClaims: 0 } });
    const late = createCanonicalSupplyViewFake(); late.begin(); late.prepare(); late.close();
    expect(late.prepareSupply()).toMatchObject({ ok: false, reason: 'supply_closed' });
    expect(late.finish()).toMatchObject({ firstReason: 'supply_closed', counts: { preparationClaims: 0, registryRecords: 0 } });
  });
  it('releases every building slot and keeps only issued references in the prepared state', () => {
    const c = createCanonicalSupplyViewFake(); c.begin(); c.prepare(); c.prepareSupply();
    expect(c.inspect()).toMatchObject({ preparationState: 'prepared', retainedBuilding: false, retainedEnvelope: true,
      retainedIssuedTable: true, retainedIssuedView: true, retainedIssuedDeclarations: true, retainedTableOrigin: true });
    expect(c.finish()).toMatchObject({ retainedTableOrigin: false, retainedEnvelope: false });
  });
  it('answers read_already_used after the terminal without changing the terminal diagnosis', () => {
    const c = createCanonicalSupplyViewFake(); c.begin(); c.prepare(); c.prepareSupply(); const end = c.finish();
    for (const reply of [c.begin(), c.prepare(), c.prepareSupply(), c.prepareSupply('extra')]) {
      expect(reply).toMatchObject({ ok: false, reason: 'read_already_used' });
    }
    expect(c.inspect()).toBe(end); expect(end.firstReason).toBe('none');
  });
});
