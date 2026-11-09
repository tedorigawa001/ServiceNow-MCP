import { describe, expect, it } from 'vitest';
import { createCanonicalGateDraftFake, createCanonicalSupplyConstructionFake } from './fixtures/snapshot-read-composition-fake.js';
import { createWriterGateFake } from './fixtures/writer-gate-fake.js';

describe('canonical prior gate / SS03 / non-executable continuation draft', () => {
  const closed = { frameExecutions: 0, grantIssues: 0, realWriterCalls: 0, journalSupply: 'not_connected',
    admissionConsumptions: 0, packetObjects: 0, closedEvidence: 'not_issued', proofIssuance: 'closed' };
  it('captures the gate before the same issuer/start and only holds an unused draft', () => {
    const a = createCanonicalGateDraftFake(); expect(a.prepare()).toMatchObject({ ok: true, disposition: 'draft_held' });
    expect(a.inspect()).toMatchObject({ ...closed, ready: true, retained: 37, stages: Array(37).fill('confirmed'),
      gate: { state: 'open', pinRetained: true, bound: true }, seedRetained: true, draftRetained: true, continuationUse: 'unused',
      issuer: { state: 'unused', firstReason: 'none', controlState: 'not_created', admissionIssues: 0, sealAttempts: 0 } });
    const s = a.inspect(); expect(a.check()).toMatchObject({ ok: false, disposition: 'blocked_frame_execution' });
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
  });
  it.each(Array.from({ length: 37 }, (_, i) => i + 1).flatMap(n => ['before', 'attempt', 'after', 'done'].map(b => [n, b] as const)))(
    'retains independent allocation prefix %i/%s', (n, boundary) => {
      const a = createCanonicalGateDraftFake(`${boundary}_${n}`), r = a.prepare();
      expect(r.first).toBe('construction_unconfirmed');
      const stages = Array.from({ length: 37 }, (_, i) => i < n - 1 ? 'confirmed' : i > n - 1 ? 'not_started'
        : boundary === 'before' ? 'not_started' : boundary === 'attempt' ? 'attempting' : boundary === 'after' ? 'provisional' : 'confirmed');
      expect(a.inspect()).toMatchObject({ ...closed, ready: false, phase: n, boundary, stages,
        retained: n - 1 + Number(boundary === 'after' || boundary === 'done'), frame: 'inactive' });
      const s = a.inspect(); expect(a.prepare()).toBe(r); expect(a.check()).toBe(r); expect(a.close()).toBe(r); expect(a.inspect()).toEqual(s);
    });
  it.each(['seed_copy', 'seed_brand', 'seed_extra', 'seed_gate', 'seed_origin', 'issuer_seed_copy', 'start_seed_copy', 'binding_seed_copy'])(
    'rejects %s before pin issuance and retains the same construction', script => {
      const a = createCanonicalGateDraftFake(script); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, phase: 33, boundary: 'seed_check', retained: 33,
        gate: { bound: false, state: 'unbound', pinRetained: false }, draftRetained: false });
    });
  it.each(['start_owner_copy', 'start_claim_copy', 'start_pin_copy', 'start_claim_owner', 'start_claim_pin', 'start_claim_spent', 'start_pin_construction',
    'scope_owner', 'scope_construction', 'scope_retention', 'scope_sourceSlot', 'scope_claim', 'scope_extra', 'issuer_rejected'])(
    'rejects same-start ownership control %s before pin issuance', script => {
      const a = createCanonicalGateDraftFake(script); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, phase: 34, boundary: 'target_check', retained: 34, draftRetained: false, gate: { bound: false, pinRetained: false } });
    });
  it.each(['pin_copy', 'pin_brand', 'pin_extra', 'pin_gate', 'pin_scope', 'pin_owner', 'pin_construction', 'pin_retention', 'pin_sourceSlot', 'pin_claim', 'pin_epoch'])(
    'rejects %s at gate binding, not a later draft guard', script => {
      const a = createCanonicalGateDraftFake(script); const r = a.prepare(); expect(r.first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, phase: 35, boundary: 'pin_check', retained: 35,
        gate: { bound: false, state: 'unbound', pinRetained: true }, draftRetained: false });
      expect(a.check()).toBe(r);
    });
  it.each(['draft_copy', 'draft_brand', 'draft_extra', 'draft_gate', 'draft_pin', 'draft_target', 'draft_entry', 'draft_exit', 'draft_kind', 'draft_executable'])(
    'rejects %s with the bound gate and provisional draft retained', script => {
      const a = createCanonicalGateDraftFake(script); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, phase: 36, boundary: 'draft_check', retained: 36, ready: false,
        gate: { bound: true, state: 'open' }, draftRetained: true, continuationUse: 'not_created' });
    });
  it.each([['seed_check_33', 33, 'seed_check'], ['target_check_34', 34, 'target_check'], ['pin_check_35', 35, 'pin_check'],
    ['draft_check_36', 36, 'draft_check'], ['post_37', 37, 'post']] as const)(
    'holds fixed identity/post failure %s', (script, phase, boundary) => {
      const a = createCanonicalGateDraftFake(script); a.prepare();
      expect(a.inspect()).toMatchObject({ ...closed, first: 'construction_unconfirmed', phase, boundary, retained: phase, ready: false });
    });
  it('keeps old roots/brands independent and exposes no frame runner', () => {
    const old = createCanonicalSupplyConstructionFake(); old.prepare(); const before = old.inspect();
    const pure = createWriterGateFake(); pure.bind(); const p = pure.inspect();
    const a = createCanonicalGateDraftFake(); a.prepare(); expect(old.inspect()).toEqual(before); expect(pure.inspect()).toEqual(p);
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'close', 'inspect']);
  });
  it('keeps pre-start close reason-free, defers construction close and refuses synchronous reentry', () => {
    const a = createCanonicalGateDraftFake(); a.close(); a.prepare(); expect(a.inspect()).toMatchObject({ first: 'none', retained: 0 });
    const b = createCanonicalGateDraftFake('close_in_frame'); b.prepare();
    expect(b.inspect()).toMatchObject({ first: 'closed', retained: 32, gate: { bound: false }, closeInFrame: 'deferred_frame' });
    const c = createCanonicalGateDraftFake('reenter'); c.prepare(); expect(c.inspect()).toMatchObject({ ready: true, reentry: 'construction_in_progress' });
    const r = c.close(); expect(c.check()).toBe(r); expect(c.inspect()).toMatchObject({ ...closed, retained: 37, draftRetained: true });
  });
  it('rejects artifacts and callbacks without executing hooks', () => {
    let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error('secret'); }, ownKeys() { calls++; return []; } });
    for (const args of [[p], ['normal', p], ['attempt_38'], ['unknown'], [createWriterGateFake()], [() => calls++]]) {
      const a = createCanonicalGateDraftFake(...args); expect(a.prepare().first).toBe('input_rejected'); expect(a.inspect().retained).toBe(0);
    }
    expect(calls).toBe(0);
  });
});
