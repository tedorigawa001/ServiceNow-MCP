import { describe, expect, it } from 'vitest';
import { createAbsenceJournalFake } from './fixtures/snapshot-read-composition-fake.js';

describe('synthetic AbsenceJournal writer history (no admission consumer)', () => {
  it('commits only the three released building slots and binds distinct generation/capture scopes', () => {
    const a = createAbsenceJournalFake(); expect(a.prepare().ok).toBe(true);
    const before = a.inspect();
    expect(before.source?.cells.map(c => [c.field, c.stage, c.fact])).toEqual([
      [1, 'present', 'none'], [2, 'present', 'none'], [3, 'present', 'none'],
      [4, 'absent', 'preparation_completed'], [5, 'absent', 'preparation_completed'], [6, 'absent', 'preparation_completed'],
      [7, 'present', 'none'], [8, 'present', 'none'], [9, 'present', 'none'], [10, 'present', 'none'], [11, 'present', 'none'],
    ]);
    expect(before.binding.cells.filter(c => c.field === 17 || c.field === 20).map(c => c.fact)).toEqual(['none', 'none']);
    expect(a.seal()).toEqual({ ok: true, reason: 'none' });
    expect(a.inspect()).toMatchObject({ generationBound: true, producerFirst: 'none', admissionConsumption: 'closed',
      packetGeneration: 'closed', proofIssuance: 'closed', fieldClears: 0, rootFinish: 'not_called',
      retained: { R1: 3, R2: 5, R3: 2, R4: 2 } });
    expect(a.inspect().binding.cells.filter(c => c.field === 17 || c.field === 20).map(c => c.fact)).toEqual(['alias_never_assigned', 'alias_never_assigned']);
    const fixed = a.inspect(); expect(a.prepare()).toBe(a.seal()); expect(a.inspect()).toEqual(fixed);
  });
  it.each(['view_failure', 'post_failure', 'post_registry_missing'])('never labels failed preparation as success: %s', script => {
    const a = createAbsenceJournalFake(script); expect(a.prepare().ok).toBe(false);
    const s = a.inspect();
    expect(s.producerFirst).toBe('source_rejected');
    expect(s.source?.preparationCommits).toBe(0);
    expect(s.source?.cells.map(c => c.fact)).toEqual(Array(11).fill('legacy_discard_executed'));
    a.seal(); expect(a.inspect().producerFirst).toBe('source_rejected');
  });
  it.each(['legacy_clear', 'legacy_clear_twice'])('records all eleven actual legacy writes once: %s', script => {
    const a = createAbsenceJournalFake(script); a.prepare(); a.seal();
    expect(a.inspect().source?.cells.map(c => [c.field, c.stamp, c.fact])).toEqual([
      [1, 2, 'legacy_discard_executed'], [2, 2, 'legacy_discard_executed'], [3, 2, 'legacy_discard_executed'],
      [4, 3, 'legacy_discard_executed'], [5, 3, 'legacy_discard_executed'], [6, 3, 'legacy_discard_executed'],
      [7, 2, 'legacy_discard_executed'], [8, 2, 'legacy_discard_executed'], [9, 2, 'legacy_discard_executed'],
      [10, 2, 'legacy_discard_executed'], [11, 2, 'legacy_discard_executed'],
    ]);
  });
  it.each([['retire_binding_with_claim_alias', 17], ['retire_binding_with_control_alias', 20]] as const)(
    'does not infer never-assigned from scenario names or sibling slots: %s', (script, field) => {
      const a = createAbsenceJournalFake(script); a.prepare(); a.seal();
      expect(a.inspect().binding.cells.find(c => c.field === field)).toMatchObject({ stage: 'present', fact: 'none', stamp: 1 });
      expect(a.inspect().binding.cells.find(c => c.field === (field === 17 ? 20 : 17))).toMatchObject({ fact: 'alias_never_assigned' });
      expect(a.inspect().producerFirst).toBe('binding_mismatch');
    });
  it('uses local-only history without fabricating source scopes', () => {
    const a = createAbsenceJournalFake(); expect(a.seal().ok).toBe(true);
    expect(a.inspect().source).toBeUndefined();
    expect(a.inspect().binding.cells.map(c => c.fact)).toEqual([
      'not_minted', 'not_minted', 'not_minted', 'not_minted', 'not_minted', 'alias_never_assigned',
      'not_minted', 'not_minted', 'alias_never_assigned', 'not_minted', 'not_minted', 'not_minted', 'not_minted', 'not_minted',
    ]);
    expect(a.prepare()).toEqual({ ok: true, reason: 'none' }); expect(a.inspect().started).toBe(false);
  });
  it('keeps an uncaptured source attempt unknown, not local-only', () => {
    const a = createAbsenceJournalFake('source_attempt_failure'); a.prepare();
    expect(a.seal()).toEqual({ ok: false, reason: 'source_unconfirmed' });
    expect(a.inspect()).toMatchObject({ generationBound: false, producerFirst: 'generation_unavailable' });
  });
  it('distinguishes a captured but never-prepared source from no source', () => {
    const a = createAbsenceJournalFake('after_source_failure'); a.prepare(); expect(a.seal().ok).toBe(true);
    expect(a.inspect()).toMatchObject({ generationBound: true, producerFirst: 'generation_unavailable' });
    expect(a.inspect().source?.cells.map(c => [c.stage, c.fact, c.producer])).toEqual(
      Array.from({ length: 11 }, () => ['absent', 'not_minted', 'source_supply']));
  });
  it('rejects a second preparation without changing producer records or retained aliases', () => {
    const a = createAbsenceJournalFake(); a.prepare(); const before = a.inspect();
    expect(a.prepare()).toEqual({ ok: false, reason: 'duplicate_preparation' });
    expect(a.inspect().source).toEqual(before.source); expect(a.inspect().binding).toEqual(before.binding);
    expect(a.inspect().retained).toEqual(before.retained); expect(a.seal()).toBe(a.prepare());
  });
  it('does not infer an unconfirmed mint or an issued sibling from the captured current control', () => {
    const a = createAbsenceJournalFake('control_mint_unconfirmed'); a.prepare(); a.seal();
    const s = a.inspect(); expect(s.generationBound).toBe(false);
    expect(s.binding.cells.find(c => c.field === 14)).toMatchObject({ stage: 'unconfirmed', fact: 'none' });
    expect(s.binding.cells.find(c => c.field === 19)).toMatchObject({ stage: 'not_started', fact: 'none' });
    expect(s.producerFirst).toBe('generation_unavailable');
  });
  it.each(['owner_copy', 'pin_copy', 'construction_copy', 'retention_copy', 'source_slot_copy', 'capture_epoch_copy',
    'binding_scope_copy', 'binding_epoch_copy', 'source_identity_copy', 'source_scope_copy', 'source_epoch_copy', 'source_missing'])(
    'rejects private binding mutation %s without losing original slots', script => {
      const a = createAbsenceJournalFake(script); a.prepare(); const before = a.inspect().retained;
      expect(a.seal()).toEqual({ ok: false, reason: 'binding_mismatch' });
      expect(a.inspect()).toMatchObject({ generationBound: false, retained: before, producerFirst: 'none' });
      const fixed = a.inspect(); expect(a.prepare()).toBe(a.seal()); expect(a.inspect()).toEqual(fixed);
    });
  // Independent expected writer sets; not imported from the implementation's layout or counters.
  const writers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21, 22, 23, 24, 25];
  it.each(writers.flatMap(field => ['begin', 'complete'].map(boundary => [field, boundary] as const)))(
    'retains producer success and first metadata failure at %i/%s', (field, boundary) => {
      const a = createAbsenceJournalFake(`${boundary}_${field}`); expect(a.prepare().ok).toBe(true);
      const before = a.inspect(); expect(before.producerFirst).toBe('none');
      expect(a.seal()).toEqual({ ok: false, reason: 'journal_unconfirmed' });
      const j = field <= 11 ? a.inspect().source! : a.inspect().binding;
      expect(j).toMatchObject({ first: 'journal_unconfirmed', firstField: field, firstBoundary: boundary });
      expect(j.cells.find(c => c.field === field)).toMatchObject({ stage: 'unconfirmed', fact: 'none' });
      expect(a.inspect().retained).toEqual(before.retained);
      const fixed = a.inspect(); expect(a.prepare()).toBe(a.seal()); expect(a.inspect()).toEqual(fixed);
    });
  it.each([4, 5, 6].flatMap(field => ['candidate', 'commit'].map(boundary => [field, boundary] as const)))(
    'does not partially commit success after %i/%s metadata failure', (field, boundary) => {
      const a = createAbsenceJournalFake(`${boundary}_${field}`); expect(a.prepare().ok).toBe(true); a.seal();
      expect(a.inspect().source).toMatchObject({ firstField: field, firstBoundary: boundary });
      expect(a.inspect().source?.cells.some(c => c.fact === 'preparation_completed')).toBe(false);
    });
  it.each(Array.from({ length: 25 }, (_, i) => i + 1))('rejects seal failure at field %i with bounded unchanged retention', field => {
    const a = createAbsenceJournalFake(`seal_${field}`); a.prepare(); const before = a.inspect().retained;
    expect(a.seal()).toEqual({ ok: false, reason: 'journal_unconfirmed' });
    expect((field <= 11 ? a.inspect().source : a.inspect().binding)).toMatchObject({ firstField: field, firstBoundary: 'seal' });
    expect(a.inspect().retained).toEqual(before);
  });
  it('keeps the prior source failure separate from a metadata failure', () => {
    const a = createAbsenceJournalFake('before_source_failure'); a.prepare(); a.seal();
    expect(a.inspect()).toMatchObject({ producerFirst: 'generation_unavailable', generationBound: true, source: undefined });
  });
  it('retains both metadata and source failure without recursive clear or reattempt', () => {
    const a = createAbsenceJournalFake('metadata_and_source_failure'); expect(a.prepare().ok).toBe(false);
    expect(a.seal()).toEqual({ ok: false, reason: 'journal_unconfirmed' });
    expect(a.inspect()).toMatchObject({ producerFirst: 'source_rejected', source: { first: 'journal_unconfirmed',
      firstField: 7, firstBoundary: 'complete', preparationCommits: 0 } });
    const fixed = a.inspect(); expect(a.prepare()).toBe(a.seal()); expect(a.inspect()).toEqual(fixed);
  });
  it('rejects input without inspecting hooks or exposing proof adoption/consumption', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('private-secret'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[p], ['normal', p], ['unknown'], [() => { hooks++; }]]) {
      const a = createAbsenceJournalFake(...args); expect(a.prepare().ok).toBe(false); expect(a.seal().ok).toBe(false);
      expect(JSON.stringify(a.inspect())).not.toContain('private-secret');
    }
    expect(hooks).toBe(0); expect(Object.keys(createAbsenceJournalFake())).toEqual(['prepare', 'seal', 'inspect']);
    const a = createAbsenceJournalFake(); expect(a.seal(p).ok).toBe(false); expect(a.prepare().ok).toBe(false);
  });
  it('records the control live retirement as a released write, without inventing an absence fact', () => {
    const a = createAbsenceJournalFake('retire_binding_with_claim_alias'); a.prepare();
    expect(a.inspect().binding.cells.find(c => c.field === 14)).toMatchObject({ stage: 'released', stamp: 2, fact: 'none', producer: 'none' });
    expect(a.seal().ok).toBe(true);
    expect(a.inspect().binding.cells.find(c => c.field === 14)).toMatchObject({ stage: 'released', fact: 'none' });
  });
  it('refuses a legacy clear after the root retirement seal and records it as a sealed-journal write', () => {
    const a = createAbsenceJournalFake('legacy_clear_after_seal'); a.prepare();
    expect(a.seal()).toEqual({ ok: true, reason: 'none' });
    expect(a.inspect()).toMatchObject({ retained: { R1: 3, R2: 5 }, source: { first: 'journal_sealed', firstField: 1 } });
    expect(a.inspect().source?.cells.filter(c => c.fact === 'legacy_discard_executed')).toHaveLength(0);
  });
});
