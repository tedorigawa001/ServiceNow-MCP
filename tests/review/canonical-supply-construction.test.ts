import { describe, expect, it } from 'vitest';
import { createCanonicalSupplyConstructionFake, createCaptureAdmissionFake } from './fixtures/snapshot-read-composition-fake.js';
import { createJournalSupplyShellFake } from './fixtures/journal-supply-shell-fake.js';
import { SUPPLY_FIELDS, supplyStageAllows } from './fixtures/supply-construction-kernel.js';

describe('canonical prior construction only (SS03)', () => {
  const closed = { writerStop: 'not_connected', journalSupply: 'not_connected', supplyConsumptions: 0,
    admissionConsumptions: 0, packetObjects: 0, cellObjects: 0, finalAnchor: 'not_issued', proofIssuance: 'closed', sourcePreparations: 0 };
  it('constructs the same real issuer/start after all prior slots but does not prepare it', () => {
    const legacy = createCaptureAdmissionFake(), before = legacy.inspect();
    const a = createCanonicalSupplyConstructionFake(); expect(a.prepare()).toMatchObject({ ok: true, disposition: 'bound_only' });
    expect(a.inspect()).toMatchObject({ ...closed, bound: true, retained: 35, issuerCaptures: 1,
      stages: Array(35).fill('confirmed'), issuer: { state: 'unused', admissionIssues: 0, sealAttempts: 0, firstReason: 'none', controlState: 'not_created' } });
    expect(a.check()).toMatchObject({ ok: false, disposition: 'blocked_supply' });
    expect(legacy.inspect()).toEqual(before);
    expect(a.inspect().layout).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27]);
  });
  it.each(Array.from({ length: 35 }, (_, i) => i + 1).flatMap(n => ['before', 'attempt', 'after', 'done'].map(b => [n, b] as const)))(
    'retains construction prefix %i/%s before source preparation', (n, boundary) => {
      const a = createCanonicalSupplyConstructionFake(`${boundary}_${n}`), r = a.prepare();
      expect(r).toMatchObject({ first: 'construction_unconfirmed' });
      const caught = boundary === 'after' || boundary === 'done';
      const stages = Array.from({ length: 35 }, (_, i) => i < n - 1 ? 'confirmed' : i > n - 1 ? 'not_started'
        : boundary === 'before' ? 'not_started' : boundary === 'attempt' ? 'attempting' : boundary === 'after' ? 'provisional' : 'confirmed');
      expect(a.inspect()).toMatchObject({ ...closed, bound: false, phase: n, boundary,
        retained: n - 1 + Number(caught), stages, frame: 'inactive' });
      const snapshot = a.inspect(); expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); expect(a.check()).toBe(r); expect(a.inspect()).toEqual(snapshot);
    });
  it.each(['target_copy', 'target_brand', 'target_extra', 'start_copy', 'scope_copy', 'epoch', 'packet',
    'claim_brand', 'claim_target', 'claim_state', 'scope_owner', 'scope_construction', 'scope_retention', 'scope_sourceSlot', 'scope_claim', 'scope_extra'])(
    'rejects %s without invoking the real start or dropping candidates', script => {
      const a = createCanonicalSupplyConstructionFake(script), r = a.prepare();
      expect(r).toMatchObject({ first: 'binding_mismatch' });
      expect(a.inspect()).toMatchObject({ ...closed, bound: false, retained: 35, boundary: 'binding', issuer: { state: 'unused', admissionIssues: 0 } });
      expect(a.check()).toBe(r);
    });
  it('keeps the independent synthetic brand/root unchanged', () => {
    const a = createJournalSupplyShellFake(); a.prepare(); const before = a.inspect();
    const b = createCanonicalSupplyConstructionFake(); b.prepare();
    expect(a.inspect()).toEqual(before); expect(a.inspect().issuerConnection).toBe('closed');
    expect(Object.keys(b)).toEqual(['prepare', 'check', 'close', 'inspect']);
  });
  it('keeps a pre-start close as stop only; reentry and in-frame close never start a second root', () => {
    const a = createCanonicalSupplyConstructionFake(); a.close(); a.prepare();
    expect(a.inspect()).toMatchObject({ ...closed, first: 'none', retained: 0, issuerCaptures: 0 });
    const b = createCanonicalSupplyConstructionFake('reenter'); b.prepare(); expect(b.inspect()).toMatchObject({ bound: true, reentry: 'construction_in_progress' });
    const c = createCanonicalSupplyConstructionFake('close_in_frame'); c.prepare(); expect(c.inspect()).toMatchObject({ first: 'closed', retained: 31, issuerCaptures: 0 });
    const first = b.prepare(); expect(first.first).toBe('duplicate_preparation'); expect(b.close()).toBe(first);
  });
  it('does not execute external hooks or accept synthetic artifacts', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[p], ['normal', p], [createJournalSupplyShellFake()], ['attempt_36'], ['unknown']]) {
      const a = createCanonicalSupplyConstructionFake(...args); expect(a.prepare().first).toBe('input_rejected'); expect(a.inspect().retained).toBe(0);
    }
    expect(hooks).toBe(0);
  });
  it('shares values only with an independent finite transition oracle', () => {
    const stages = ['not_started', 'attempting', 'provisional', 'confirmed'] as const;
    for (const [i, from] of stages.entries()) for (const [j, to] of stages.entries()) expect(supplyStageAllows(from, to)).toBe(j === i + 1);
    expect(Object.isFrozen(SUPPLY_FIELDS)).toBe(true);
  });
});
