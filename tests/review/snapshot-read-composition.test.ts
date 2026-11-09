import { describe, expect, it } from 'vitest';
import * as composition from './fixtures/snapshot-read-composition-fake.js';
import * as b from './fixtures/read-hash-fake.js';
import * as shared from './fixtures/shared-read-hash-kernel-fake.js';
import * as c from './fixtures/snapshot-read-start-fake.js';

describe('physical B/C-start composition move without connection', () => {
  it('preserves both old export sets and factory identities at the new physical boundary', () => {
    expect(Object.keys(composition).sort()).toEqual(['createAbsenceJournalFake', 'createCanonicalGateDraftFake', 'createCanonicalSupplyConstructionFake', 'createCanonicalSupplyTransferFake', 'createCanonicalSupplyViewFake', 'createCaptureAdmissionFake', 'createPendingBindingFake', 'createPendingConstructionFake', 'createProbeFramePreparationFake', 'createReadHashFake', 'createRetirementStartFake', 'createSnapshotReadStartFake', 'createSupplyBoundaryFake']);
    expect(Object.keys(b)).toEqual(['createReadHashFake']);
    expect(Object.keys(shared)).toEqual(['createReadHashFake']);
    expect(Object.keys(c)).toEqual(['createSnapshotReadStartFake']);
    expect(b.createReadHashFake).toBe(composition.createReadHashFake);
    expect(shared.createReadHashFake).toBe(composition.createReadHashFake);
    expect(c.createSnapshotReadStartFake).toBe(composition.createSnapshotReadStartFake);
  });
  it('adds no supply/view/take or C execution method to either old facade', () => {
    expect(Object.keys(composition.createReadHashFake())).toEqual(['step', 'run', 'finish', 'inspect', 'cancel', 'advanceTo']);
    const start = composition.createSnapshotReadStartFake();
    expect(Object.keys(start)).toEqual(['check', 'begin', 'prepare', 'close', 'finish', 'inspect']);
    start.begin(); start.prepare();
    expect(start.inspect()).toMatchObject({ readState: 'prepared', snapshotConnection: 'identity_only',
      readKernel: 'not_connected', actualBudget: 'not_connected', rowAggregation: 'not_connected',
      counts: { snapshots: 1, startClaims: 1, sessions: 1, budgetOrigins: 1, borrows: 1, preparationRecords: 1,
        open: 0, read: 0, hash: 0, cleanup: 0 } });
    expect(start.finish()).toMatchObject({ disposition: 'preparation_discarded', cleanupDisposition: 'not_started' });
  });
  it('does not adopt the colocated factory, facade or summary as a cross-root supply', () => {
    const start = composition.createSnapshotReadStartFake(); start.begin(); start.prepare();
    for (const input of [start, start.inspect(), start.finish(), composition.createSnapshotReadStartFake]) {
      expect(composition.createReadHashFake(input).run()).toMatchObject({ firstReason: 'binding', counts: { open: 0, read: 0 } });
    }
    for (const input of [composition.createReadHashFake, b.createReadHashFake(), b.createReadHashFake().run()]) {
      expect(composition.createSnapshotReadStartFake(input).inspect()).toMatchObject({ supplyFirst: 'supply_invalid',
        counts: { snapshots: 0, startClaims: 0, open: 0, read: 0, hash: 0, cleanup: 0 } });
    }
  });
  it('keeps B progress and C close/retirement isolated despite physical colocation', () => {
    const hash = composition.createReadHashFake(); hash.step(); hash.step(); hash.step();
    const start = composition.createSnapshotReadStartFake(); start.begin(); start.prepare(); start.close();
    expect(hash.run()).toMatchObject({ firstReason: 'none', counts: { received: 8, hashed: 8, accepted: 3, guards: 54 } });
    const end = start.finish();
    expect(end).toMatchObject({ readFirst: 'supply_closed', readStop: 'supply_closed', cleanupDisposition: 'not_started' });
    expect(start.inspect()).toMatchObject({ retainedSnapshot: false, retainedBorrow: false,
      counts: { borrowRetirements: 1, snapshotRetirements: 1, open: 0, read: 0, hash: 0, cleanup: 0 } });
    start.begin(); start.prepare(); start.close(); expect(start.finish()).toBe(end);
  });
  it('does not inspect arbitrary caller objects or execute callbacks through the new module', () => {
    let calls = 0;
    const input = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
    for (const value of [input, () => { calls++; }]) {
      expect(composition.createReadHashFake(value).run().firstReason).toBe('binding');
      expect(composition.createSnapshotReadStartFake(value).finish().supplyFirst).toBe('supply_invalid');
    }
    expect(calls).toBe(0);
  });
  it('keeps closed authority and immutable terminal diagnostics at both moved factories', () => {
    const hash = composition.createReadHashFake(); const hashEnd = hash.run(); hash.cancel(); hash.advanceTo(1000); hash.step();
    expect(hash.finish()).toBe(hashEnd);
    const start = composition.createSnapshotReadStartFake(); start.begin(); start.prepare(); const startEnd = start.finish();
    start.close(); start.begin(); start.prepare(); expect(start.finish()).toBe(startEnd);
    for (const end of [hashEnd, startEnd]) expect(end).toMatchObject({ authority: 'none', ready: false,
      formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', nativeCost: 'unknown',
      entryRequirement: 'unknown', seedRequirement: 'unknown', coreInvocation: 'not_called' });
  });
});
