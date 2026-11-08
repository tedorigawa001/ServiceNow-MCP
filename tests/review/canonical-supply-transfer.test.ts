import { describe, expect, it } from 'vitest';
import { createCanonicalSupplyTransferFake } from './fixtures/canonical-supply-transfer-fake.js';

describe('nonexecuting supply transfer preflight', () => {
  it('binds one anchor and empty shells without spending or moving the source', () => {
    const a = createCanonicalSupplyTransferFake();
    expect(a.prepare()).toMatchObject({ ok: true });
    expect(a.inspect()).toMatchObject({ firstReason: 'none', state: 'prepared', claimState: 'unused',
      retainedAnchor: true, retainedClaim: true, retainedShells: 3, emptyShells: 3, payloadSlots: 0,
      counts: { anchors: 1, claimsIssued: 1, claimsConsumed: 0, sourceDetaches: 0, holderPublications: 0 },
      source: { preparationState: 'prepared', retainedRegistry: true, retainedTable: true, retainedView: true } });
  });
  it.each(['anchor_failure', 'claim_failure', 'pending_failure', 'holder_failure', 'failure_failure', 'pre_failure'])(
    'stops %s without consuming the claim or inventing a receiver', scenario => {
      const a = createCanonicalSupplyTransferFake(scenario);
      expect(a.prepare()).toMatchObject({ ok: false, reason: 'transfer_prepare_unavailable' });
      const before = a.inspect();
      expect(before).toMatchObject({ state: 'rejected', retainedAnchor: false, emptyShells: 0, payloadSlots: 0,
        counts: { claimsConsumed: 0, sourceDetaches: 0, holderPublications: 0 },
        source: { firstReason: 'supply_prepare_unavailable', retainedRegistry: false,
          root: { lifecycleFirst: 'read_prepare_unavailable' } } });
      expect(a.prepare()).toMatchObject({ reason: 'transfer_prepare_unavailable' });
      expect(a.inspect()).toEqual(before);
      expect(a.finish().source.root.retainedBorrow).toBe(false);
    });
  const identityCases = [
    ...['copy', 'owner', 'source', 'envelope', 'registry', 'table', 'view', 'declarations', 'origin'].map(f => `anchor_${f}`),
    ...['copy', 'owner', 'source', 'anchor', 'receiver', 'brand', 'state'].map(f => `claim_${f}`),
    ...['pending', 'holder', 'failure'].flatMap(r => ['copy', 'role', 'owner', 'source', 'anchor', 'claim', 'receiver', 'payload'].map(f => `${r}_${f}`)),
  ];
  it.each(identityCases)('rejects isolated %s before spending or moving', scenario => {
    const a = createCanonicalSupplyTransferFake(scenario);
    expect(a.prepare()).toMatchObject({ ok: false, reason: 'binding_mismatch' });
    expect(a.inspect()).toMatchObject({ firstReason: 'binding_mismatch', retainedAnchor: false, emptyShells: 0,
      counts: { preparationStarts: 1, anchors: 1, claimsIssued: 1, claimsConsumed: 0, preChecks: 1,
        sourceDetaches: 0, holderPublications: 0 }, source: { firstReason: 'binding_mismatch',
        root: { lifecycleFirst: 'binding_mismatch', readFirst: 'binding' } } });
    const end = a.finish();
    a.prepare(); a.close(); expect(a.finish()).toBe(end);
  });
  it('keeps source failure ahead of destination construction', () => {
    const a = createCanonicalSupplyTransferFake('source_failure');
    expect(a.prepare()).toMatchObject({ reason: 'source_rejected' });
    expect(a.inspect()).toMatchObject({ retainedAnchor: false, emptyShells: 0,
      counts: { anchors: 0, claimsIssued: 0, claimsConsumed: 0, pendingShells: 0, holderShells: 0, failureShells: 0 },
      source: { firstReason: 'supply_prepare_unavailable', root: { lifecycleFirst: 'read_prepare_unavailable' } } });
    a.close(); expect(a.finish().firstReason).toBe('source_rejected');
  });
  it.each(['source_closed', 'close_before_pre'])('classifies %s separately from binding rejection', scenario => {
    const a = createCanonicalSupplyTransferFake(scenario);
    expect(a.prepare()).toMatchObject({ reason: 'supply_closed' });
    expect(a.inspect()).toMatchObject({ firstReason: 'supply_closed', stopReason: 'supply_closed', retainedAnchor: false,
      counts: { claimsConsumed: 0, preChecks: 0, sourceDetaches: 0 },
      source: { root: { readFirst: 'supply_closed', readStop: 'supply_closed' } } });
    expect(a.prepare()).toMatchObject({ reason: 'supply_closed' });
    expect(a.finish().source.root.retainedSnapshot).toBe(false);
  });
  it('makes duplicate preparation sticky without refunding any original claim', () => {
    const a = createCanonicalSupplyTransferFake(); a.prepare();
    expect(a.prepare()).toMatchObject({ reason: 'duplicate_transfer_preparation' });
    expect(a.inspect()).toMatchObject({ counts: { preparationStarts: 1, claimsIssued: 1, claimsConsumed: 0 },
      source: { counts: { preparationClaims: 1 }, root: { counts: { startClaims: 1 } } } });
    a.close(); expect(a.finish().firstReason).toBe('duplicate_transfer_preparation');
  });
  it('uses a fixed allocation-prefix oracle, not the implementation counters as expectations', () => {
    const points = ['anchor', 'claim', 'pending', 'holder', 'failure', 'pre'];
    for (let stop = 0; stop < points.length; stop++) {
      const a = createCanonicalSupplyTransferFake(`${points[stop]}_failure`); a.prepare();
      const expected = [0, 0, 0, 0, 0];
      for (let i = 0; i < stop && i < expected.length; i++) expected[i] = 1;
      const c = a.inspect().counts;
      expect([c.anchors, c.claimsIssued, c.pendingShells, c.holderShells, c.failureShells]).toEqual(expected);
      expect([c.claimsConsumed, c.sourceDetaches, c.holderPublications, c.open, c.read, c.hash, c.cleanup]).toEqual([0, 0, 0, 0, 0, 0, 0]);
      a.finish();
    }
  });
  it('keeps legacy roots separate and rejects caller hooks, facades and summaries without inspection', () => {
    let calls = 0;
    const proxy = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
    const original = createCanonicalSupplyTransferFake(); original.prepare();
    for (const input of [proxy, () => { calls++; }, original, original.inspect(), original.finish()]) {
      const a = createCanonicalSupplyTransferFake(input);
      expect(a.prepare()).toMatchObject({ reason: 'source_rejected' });
      expect(a.inspect().counts.claimsIssued).toBe(0); a.finish();
    }
    const a = createCanonicalSupplyTransferFake();
    expect(a.prepare(proxy)).toMatchObject({ reason: 'binding_mismatch' });
    expect(a.inspect().counts.preparationStarts).toBe(0); expect(calls).toBe(0);
  });
  it('exposes only fixed diagnostics and clears anchor before source borrow retirement', () => {
    const a = createCanonicalSupplyTransferFake();
    expect(Object.keys(a)).toEqual(['prepare', 'close', 'finish', 'inspect']);
    a.prepare(); const end = a.finish();
    expect(end).toMatchObject({ state: 'terminal', retainedAnchor: false, retainedClaim: false, retainedShells: 0,
      anchorRetiredWithBorrowLive: true, emptyShells: 0, payloadSlots: 0,
      claimState: 'retired_unused', formalIssuance: 'closed', wholeRunAdmission: 'disabled',
      authority: 'none', ready: false, cExecution: 'not_connected', cleanupDisposition: 'not_started',
      source: { retainedRegistry: false, retainedView: false, root: { retainedBorrow: false } } });
    expect(Object.isFrozen(end)).toBe(true); expect(Object.isFrozen(end.counts)).toBe(true);
    expect(a.prepare()).toMatchObject({ reason: 'read_already_used' });
    a.close(); expect(a.finish()).toBe(end);
    const encoded = JSON.stringify(end);
    for (const secret of ['ba7816bf', 'sourceRecord', 'tableOrigin', 'transferOwner', '"bytes"']) expect(encoded).not.toContain(secret);
  });
});
