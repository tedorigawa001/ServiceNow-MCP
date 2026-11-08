import { describe, expect, it } from 'vitest';
import { createReadHashFake } from './fixtures/read-hash-fake.js';
import { declaredActualOracle } from './fixtures/declared-actual-oracle.js';

describe('B declaration and actual source are independent', () => {
  it('keeps the three-byte declaration when the source shrinks to two after before metadata', () => {
    const end = createReadHashFake('da_shrink_two').run();
    expect(end).toMatchObject({ firstReason: 'content_mismatch', position: 2, hashedPrefixBytes: 2,
      counts: { read: 2, received: 2, hashed: 2, update: 1, observe: 1, final: 0, accepted: 0,
        close: 1, updateReleased: 1, updateReserved: 0 } });
  });
  it('receives but does not hash the byte grown at the declared EOF probe', () => {
    expect(createReadHashFake('da_grow_probe').run()).toMatchObject({ firstReason: 'content_mismatch', position: 3,
      counts: { read: 2, received: 4, hashed: 3, update: 1, observe: 1, final: 0, accepted: 0, close: 1 } });
  });
  it('does not replay a visibility mutation after an interrupted attempt at the same offset', () => {
    expect(createReadHashFake('da_interrupt_shrink').run()).toMatchObject({ firstReason: 'content_mismatch',
      counts: { read: 3, retry: 1, received: 2, hashed: 2, update: 1, updateReleased: 2, close: 1 } });
  });
  for (const scenario of ['da_declared_two', 'da_declared_four', 'da_actual_two', 'da_actual_four']) {
    it(`rejects before metadata independently of the declaration/actual length for ${scenario}`, () => {
      expect(createReadHashFake(scenario).run()).toMatchObject({ firstReason: 'content_mismatch',
        counts: { open: 1, observe: 1, read: 0, init: 0, update: 0, final: 0, close: 1, accepted: 0 } });
    });
  }
  it('preserves legacy empty success and detects a byte grown after the empty before observation', () => {
    expect(createReadHashFake('da_empty').run()).toMatchObject({ firstReason: 'none',
      counts: { read: 1, received: 0, update: 0, hashed: 0, final: 1, accepted: 1 } });
    expect(createReadHashFake('da_empty_grow').run()).toMatchObject({ firstReason: 'content_mismatch',
      counts: { read: 1, received: 1, update: 0, hashed: 0, observe: 1, final: 0, accepted: 0 } });
  });
  for (const scenario of ['da_zero_n', 'da_fraction_n', 'da_bad_variant']) {
    it(`separates actual EOF from malformed returns for ${scenario}`, () => {
      expect(createReadHashFake(scenario).run()).toMatchObject({ firstReason: 'operation_invalid', receivedState: 'unavailable',
        counts: { read: 1, received: 0, update: 0, updateReleased: 1, updateReserved: 0, close: 1 } });
    });
  }
  for (const [scenario, firstReason, stopReason] of [
    ['da_failed_cancel', 'source_unavailable', 'cancelled'], ['da_bad_n_deadline', 'operation_invalid', 'deadline'],
  ]) {
    it(`retains both operation and stop diagnoses when a non-payload result carries a signal: ${scenario}`, () => {
      expect(createReadHashFake(scenario).run()).toMatchObject({ firstReason, stopReason, receivedState: 'unavailable',
        counts: { read: 1, received: 0, update: 0, close: 1, updateReleased: 1 }, intervalGuards: 0 });
    });
  }
  it('agrees with a separately enumerated actual/offset/request grid, without exporting a producer', () => {
    const probe = createReadHashFake('da_source_probe').inspect().sourceProbe;
    expect(probe).toBeDefined();
    const oracle = [];
    for (let actual = 0; actual <= 4; actual++) for (let offset = 0; offset <= 4; offset++) {
      for (let requested = 1; requested <= 3; requested++) {
        // Independently enumerate available positions instead of using the producer's min expression.
        let n = 0;
        for (let p = offset; p < actual && n < requested; p++) n++;
        oracle.push({ actual, offset, requested, kind: n === 0 ? 'eof' : 'bytes', n });
      }
    }
    expect(probe?.grid).toEqual(oracle);
    expect(probe).toMatchObject({ foreignHandleRejected: true, copiedOriginRejected: true,
      duplicateOpenRejected: true, duplicateCloseRejected: true, closedReadRejected: true });
    expect(probe?.invalidEvents.every(Boolean)).toBe(true);
    expect(probe?.invalidEvents.length).toBe(8);
  });
  for (const [scenario, declared, events] of [
    ['da_shrink_two', 3, ['open', 'before', 'init', 'bytes:2', 'eof']],
    ['da_grow_probe', 3, ['open', 'before', 'init', 'bytes:3', 'extra:1']],
    ['da_interrupt_shrink', 3, ['open', 'before', 'init', 'interrupt', 'bytes:2', 'eof']],
    ['da_empty', 0, ['open', 'before', 'init', 'eof', 'after', 'final', 'close', 'accept']],
    ['da_empty_grow', 0, ['open', 'before', 'init', 'extra:1']],
  ] as const) {
    it(`preserves every prefix and cleanup reservation against a separate event oracle: ${scenario}`, () => {
      for (let prefix = 0; prefix <= events.length; prefix++) {
        const fake = createReadHashFake(scenario);
        for (let i = 0; i < prefix; i++) fake.step();
        const end = fake.finish();
        expect(end).toMatchObject(declaredActualOracle(events.slice(0, prefix), declared));
        expect(end.counts.updateReservations).toBe(end.counts.update + end.counts.updateReleased);
        expect(end.counts.cleanupReserved).toBe(end.counts.close + end.counts.cleanupUnused);
        expect(end).toMatchObject({ intervalGuards: 0, retainedScope: false, retainedCandidate: false,
          formalIssuance: 'closed', wholeRunAdmission: 'disabled', snapshotConnection: 'not_connected', coreInvocation: 'not_called' });
        fake.cancel(); fake.advanceTo(1000); fake.step(); expect(fake.run()).toBe(end);
      }
    });
  }
});
