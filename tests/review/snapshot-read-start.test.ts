import { describe, expect, it } from 'vitest';
import { createSnapshotReadStartFake } from './fixtures/snapshot-read-start-fake.js';

describe('C-start: private snapshot borrow and one-shot synthetic preparation', () => {
  it('preallocates diagnostic/result/custody before claim, then binds only one private preparation', () => {
    const fake = createSnapshotReadStartFake();
    expect(fake.inspect()).toMatchObject({ diagnosticOwnerReady: true, resultSlotReady: true, custodyReady: true,
      supplyState: 'open', readState: 'unused', retainedSnapshot: true, retainedBorrow: false,
      counts: { diagnosticOwners: 1, resultSlots: 1, custodySlots: 1, mapChecks: 1, snapshots: 1, startClaims: 0 } });
    for (let i = 0; i < 3; i++) expect(fake.check().ok).toBe(true);
    expect(fake.inspect().counts.startClaims).toBe(0);
    expect(fake.begin().ok).toBe(true);
    expect(fake.inspect()).toMatchObject({ readState: 'starting', counts: { startClaims: 1, sessions: 0, budgetOrigins: 0, borrows: 0 } });
    expect(fake.prepare().ok).toBe(true);
    expect(fake.inspect()).toMatchObject({ readState: 'prepared', retainedBorrow: true, retainedIssuedBorrow: true, retainedPreparation: true,
      retainedSession: true, retainedBudgetOrigin: true,
      counts: { startClaims: 1, sessions: 1, budgetOrigins: 1, borrows: 1, identityChecks: 1, preparationRecords: 1 } });
  });
  for (const scenario of ['owner_mix', 'snapshot_mix', 'version_mix', 'map_wrapper', 'map_copy', 'files_copy',
    'rows_copy', 'file_copy', 'ordinal_mix', 'session_mix', 'budget_mix', 'borrow_copy', 'origin_input']) {
    it(`refuses private tuple mixing: ${scenario}`, () => {
      const fake = createSnapshotReadStartFake(scenario); fake.begin();
      expect(fake.prepare()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
      expect(fake.inspect()).toMatchObject({ supplyFirst: 'none', lifecycleFirst: 'binding_mismatch', readFirst: 'binding',
        readState: 'unwinding', counts: { startClaims: 1, identityChecks: 1, preparationRecords: 0, open: 0 } });
      const counts = fake.inspect().counts;
      fake.begin(); fake.prepare(); fake.begin(); expect(fake.inspect().counts).toEqual(counts);
      const end = fake.finish(); expect(end).toMatchObject({ lifecycleFirst: 'binding_mismatch', disposition: 'rejected' });
      expect(fake.inspect()).toMatchObject({ readState: 'terminal', retainedBorrow: false, retainedIssuedBorrow: false, retainedPreparation: false,
        retainedSession: false, retainedBudgetOrigin: false, counts: { borrowRetirements: 1 } });
      expect(fake.begin()).toMatchObject({ ok: false, reason: 'read_already_used' }); expect(fake.finish()).toBe(end);
    });
  }
  for (const scenario of ['owner_failure', 'result_slot_failure', 'custody_failure', 'source_failure',
    'map_rejected', 'snapshot_failure', 'after_snapshot_failure']) {
    it(`contains constructor prefix failure before I/O: ${scenario}`, () => {
      const fake = createSnapshotReadStartFake(scenario);
      expect(fake.inspect()).toMatchObject({ supplyFirst: 'supply_invalid', readState: 'unused',
        supplyState: 'retired', retainedSnapshot: false, counts: { startClaims: 0, sessions: 0, borrows: 0, open: 0 } });
      const before = fake.inspect().counts;
      expect(fake.begin()).toMatchObject({ ok: false, reason: 'supply_invalid' });
      expect(fake.prepare()).toMatchObject({ ok: false, reason: 'supply_invalid' });
      fake.close(); expect(fake.inspect().counts).toEqual(before);
      expect(fake.finish()).toMatchObject({ supplyFirst: 'supply_invalid', disposition: 'rejected' });
      if (scenario === 'owner_failure') expect(before.diagnosticOwners).toBe(0);
      if (scenario === 'custody_failure') expect(before).toMatchObject({ resultSlots: 1, custodySlots: 0, mapChecks: 0 });
      if (scenario === 'after_snapshot_failure') expect(before).toMatchObject({ snapshots: 1, snapshotRetirements: 1 });
    });
  }
  for (const scenario of ['borrow_failure', 'after_borrow_failure', 'result_prepare_failure']) {
    it(`keeps the claim spent after partial preparation fails: ${scenario}`, () => {
      const fake = createSnapshotReadStartFake(scenario); fake.begin();
      expect(fake.prepare()).toMatchObject({ ok: false, reason: 'read_prepare_unavailable' });
      const before = fake.inspect();
      expect(before).toMatchObject({ readState: 'unwinding', lifecycleFirst: 'read_prepare_unavailable', readFirst: 'read_prepare_unavailable',
        counts: { startClaims: 1, sessions: 1, budgetOrigins: 1, preparationRecords: 0, open: 0 } });
      fake.begin(); fake.prepare(); expect(fake.inspect().counts).toEqual(before.counts);
      fake.close(); const end = fake.finish();
      expect(end).toMatchObject({ lifecycleFirst: 'read_prepare_unavailable', readFirst: 'read_prepare_unavailable', readStop: 'supply_closed' });
      expect(fake.inspect()).toMatchObject({ retainedSnapshot: false, retainedBorrow: false, retainedBudgetOrigin: false, retainedPreparation: false,
        counts: { startClaims: 1, snapshotRetirements: 1, borrowRetirements: scenario === 'borrow_failure' ? 0 : 1 } });
    });
  }
  it('rejects duplicate begin in starting, prepared and unwinding without creating another origin', () => {
    for (const prepared of [false, true]) {
      const fake = createSnapshotReadStartFake(); fake.begin(); if (prepared) fake.prepare();
      const before = fake.inspect().counts;
      expect(fake.begin()).toMatchObject({ ok: false, reason: 'duplicate_start' });
      expect(fake.inspect()).toMatchObject({ readState: 'unwinding', lifecycleFirst: 'duplicate_start', readFirst: 'binding' });
      fake.begin(); fake.prepare(); expect(fake.inspect().counts).toEqual(before);
      const end = fake.finish(); fake.begin(); fake.prepare(); expect(fake.finish()).toBe(end);
    }
  });
  it('rejects a second prepare and fixed reentry using the same claim path', () => {
    const fake = createSnapshotReadStartFake(); fake.begin(); fake.prepare();
    expect(fake.prepare()).toMatchObject({ ok: false, reason: 'duplicate_start' });
    expect(fake.inspect().counts.preparationRecords).toBe(1);
    const reentrant = createSnapshotReadStartFake('reentrant_begin'); reentrant.begin();
    expect(reentrant.prepare()).toMatchObject({ ok: false, reason: 'duplicate_start' });
    expect(reentrant.inspect()).toMatchObject({ readFirst: 'binding', counts: { startClaims: 1, sessions: 0, budgetOrigins: 0, borrows: 0 } });
  });
  it('requires begin before prepare and never creates a claim after a misuse', () => {
    const fake = createSnapshotReadStartFake(); expect(fake.prepare()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    fake.begin(); expect(fake.inspect().counts.startClaims).toBe(0);
  });
  it('retains the actual pre-validation input only for its fixed origin-mixing probe', () => {
    const fake = createSnapshotReadStartFake('origin_input');
    expect(fake.inspect().retainedOriginInput).toBe(true); fake.begin();
    expect(fake.prepare()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    fake.finish(); expect(fake.inspect().retainedOriginInput).toBe(false);
    expect(createSnapshotReadStartFake().inspect().retainedOriginInput).toBe(false);
  });
  it('distinguishes pre-start close refusal from recorded close during preparation', () => {
    const unused = createSnapshotReadStartFake(); unused.close();
    expect(unused.check()).toMatchObject({ ok: false, reason: 'supply_closed' });
    expect(unused.begin()).toMatchObject({ ok: false, reason: 'supply_closed' });
    expect(unused.inspect()).toMatchObject({ supplyFirst: 'none', readFirst: 'none', readStop: 'none', counts: { startClaims: 0, snapshotRetirements: 1 } });
    const starting = createSnapshotReadStartFake(); starting.begin(); starting.close();
    expect(starting.prepare()).toMatchObject({ ok: false, reason: 'supply_closed' });
    expect(starting.finish()).toMatchObject({ supplyFirst: 'none', readFirst: 'supply_closed', readStop: 'supply_closed' });
  });
  it('does not record a read stop for close after a supply failure or a pre-claim misuse', () => {
    for (const scenario of ['owner_failure', 'custody_failure', 'source_failure', 'after_snapshot_failure']) {
      const fake = createSnapshotReadStartFake(scenario);
      expect(fake.inspect()).toMatchObject({ supplyState: 'retired', readState: 'unused' });
      fake.close();
      expect(fake.inspect()).toMatchObject({ readState: 'unused', readFirst: 'none', readStop: 'none', supplyFirst: 'supply_invalid' });
      expect(fake.finish()).toMatchObject({ supplyFirst: 'supply_invalid', readFirst: 'none', readStop: 'none', disposition: 'rejected' });
    }
    const misuse = createSnapshotReadStartFake(); misuse.prepare(); misuse.close();
    expect(misuse.inspect()).toMatchObject({ lifecycleFirst: 'binding_mismatch', readFirst: 'binding', readStop: 'none', counts: { startClaims: 0 } });
  });
  it('marks a close-only preparation stop as rejected, unlike an ordinary discard', () => {
    const starting = createSnapshotReadStartFake(); starting.begin(); starting.close();
    expect(starting.finish()).toMatchObject({ disposition: 'rejected', supplyFirst: 'none', lifecycleFirst: 'none' });
    const prepared = createSnapshotReadStartFake(); prepared.begin(); prepared.prepare(); prepared.close();
    expect(prepared.finish()).toMatchObject({ disposition: 'rejected', supplyFirst: 'none', lifecycleFirst: 'none' });
  });
  it('returns the first prior reason from readonly check after a lifecycle or supply failure', () => {
    const misuse = createSnapshotReadStartFake(); misuse.prepare();
    expect(misuse.check()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    const duplicate = createSnapshotReadStartFake(); duplicate.begin(); duplicate.begin();
    expect(duplicate.check()).toMatchObject({ ok: false, reason: 'duplicate_start' });
    const partial = createSnapshotReadStartFake('borrow_failure'); partial.begin(); partial.prepare();
    expect(partial.check()).toMatchObject({ ok: false, reason: 'read_prepare_unavailable' });
    expect(createSnapshotReadStartFake('source_failure').check()).toMatchObject({ ok: false, reason: 'supply_invalid' });
  });
  it('refuses prepare after an ordinary terminal without changing any diagnostic or count', () => {
    for (const prepared of [false, true]) {
      const fake = createSnapshotReadStartFake(); fake.begin(); if (prepared) fake.prepare(); const end = fake.finish();
      const before = fake.inspect();
      expect(fake.prepare()).toMatchObject({ ok: false, reason: 'read_already_used' });
      expect(fake.inspect()).toEqual(before); expect(fake.finish()).toBe(end);
    }
  });
  it('keeps a live borrow during close, retires it at discard, and does not claim cleanup confirmation', () => {
    const fake = createSnapshotReadStartFake(); fake.begin(); fake.prepare(); fake.close(); fake.close();
    expect(fake.inspect()).toMatchObject({ supplyState: 'closing', closeRequested: true, readState: 'unwinding', retainedSnapshot: true,
      retainedBorrow: true, counts: { snapshotRetirements: 0, borrowRetirements: 0, cleanup: 0 } });
    const end = fake.finish(); expect(end).toMatchObject({ cleanupDisposition: 'not_started', readStop: 'supply_closed' });
    expect(fake.inspect()).toMatchObject({ supplyState: 'retired', retainedSnapshot: false, retainedBorrow: false,
      counts: { snapshotRetirements: 1, borrowRetirements: 1, cleanup: 0 } });
    const before = fake.inspect(); fake.close(); fake.close(); expect(fake.finish()).toBe(end); expect(fake.inspect()).toEqual(before);
  });
  it('retires only the read borrow on ordinary discard, preserving readonly supply and immutable terminal diagnostics', () => {
    const fake = createSnapshotReadStartFake(); fake.begin(); fake.prepare(); const end = fake.finish();
    expect(end).toMatchObject({ disposition: 'preparation_discarded', cleanupDisposition: 'not_started', readFirst: 'none' });
    expect(fake.inspect()).toMatchObject({ retainedSnapshot: true, retainedBorrow: false, retainedPreparation: false, counts: { borrowRetirements: 1, snapshotRetirements: 0 } });
    expect(fake.check().ok).toBe(true); expect(fake.begin()).toMatchObject({ ok: false, reason: 'read_already_used' });
    fake.close(); expect(fake.finish()).toBe(end);
    expect(fake.inspect().counts.snapshotRetirements).toBe(1); expect(end.readStop).toBe('none');
  });
  it('agrees with an independent state/count oracle for all begin/prepare words of length zero through five', () => {
    for (let length = 0; length <= 5; length++) for (let word = 0; word < 2 ** length; word++) {
      const fake = createSnapshotReadStartFake();
      let state = 'unused', first = 'none', claims = 0, preparations = 0;
      for (let i = 0; i < length; i++) {
        const prepare = !!(word & (1 << i));
        if (prepare) fake.prepare(); else fake.begin();
        if (first !== 'none') continue;
        if (!prepare && state === 'unused') { claims++; state = 'starting'; }
        else if (prepare && state === 'starting') { preparations++; state = 'prepared'; }
        else { first = state === 'unused' ? 'binding_mismatch' : 'duplicate_start'; state = 'unwinding'; }
      }
      expect(fake.inspect()).toMatchObject({ readState: state, lifecycleFirst: first,
        counts: { startClaims: claims, sessions: preparations, budgetOrigins: preparations, borrows: preparations,
          identityChecks: preparations, preparationRecords: preparations, open: 0, read: 0, hash: 0, cleanup: 0 } });
      fake.finish(); expect(fake.inspect().counts.borrowRetirements).toBe(preparations);
    }
  });
  it('rejects external data, callbacks and extra factory arguments without invoking hooks', () => {
    let hooks = 0; const hostile = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const args of [[undefined], [hostile], [() => { hooks++; }], ['normal', hostile], ['unknown']]) {
      const fake = createSnapshotReadStartFake(...args);
      expect(fake.begin()).toMatchObject({ ok: false, reason: 'supply_invalid' });
      expect(fake.inspect()).toMatchObject({ counts: { mapChecks: 0, snapshots: 0, startClaims: 0 } });
    }
    expect(hooks).toBe(0);
  });
  it('does not accept caller data through begin or prepare, or mutate a sealed result on such requests', () => {
    let hooks = 0; const hostile = new Proxy({}, { get() { hooks++; throw Error('secret'); } });
    const a = createSnapshotReadStartFake(); expect(a.begin(hostile)).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    a.begin(); expect(a.inspect().counts.startClaims).toBe(0);
    const b = createSnapshotReadStartFake(); b.begin();
    expect(b.prepare(hostile)).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    expect(b.inspect().counts.borrows).toBe(0); const end = b.finish();
    expect(b.begin(hostile)).toMatchObject({ ok: false, reason: 'read_already_used' }); expect(b.finish()).toBe(end);
    expect(hooks).toBe(0);
  });
  it('returns only detached frozen diagnostics, not origins, borrowed data or execution authority', () => {
    const fake = createSnapshotReadStartFake(); const before = fake.inspect(); fake.begin(); fake.prepare(); const end = fake.finish();
    expect(before.counts.startClaims).toBe(0);
    const frozen = (x: unknown): void => { if (x && typeof x === 'object') { expect(Object.isFrozen(x)).toBe(true); Object.values(x).forEach(frozen); } };
    frozen(fake.inspect()); frozen(end); expect(Object.isFrozen(fake)).toBe(true);
    expect(Object.keys(fake)).toEqual(['check', 'begin', 'prepare', 'close', 'finish', 'inspect']);
    expect(end).toMatchObject({ authority: 'none', ready: false, formalIssuance: 'closed', wholeRunAdmission: 'disabled',
      readKernel: 'not_connected', rowAggregation: 'not_connected', actualBudget: 'not_connected', coreInvocation: 'not_called',
      runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' });
    expect(JSON.stringify(fake.inspect())).not.toMatch(/expectedSha256|ba7816|synthetic-read-start\/F01|rawError|stack|secret/);
  });
});
