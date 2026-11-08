import { describe, expect, it } from 'vitest';
import { createReadHashFake } from './fixtures/read-hash-fake.js';
import { repeatedByteDigest } from './fixtures/read-hash-capacity-oracle.js';

/** Independent semantic-event accounting, not the target's LIMIT/schedule/counters. */
function eventOracle(fileCount: number, bytesPerFile: number, extra = false) {
  const c = { open: 0, observe: 0, read: 0, retry: 0, received: 0, init: 0, update: 0,
    updateCompleted: 0, hashed: 0, final: 0, close: 0, cleanupReserved: 0, cleanupUnused: 0,
    updateReserved: 0, updateReservations: 0, updateReservationPeak: 1, updateReleased: 0,
    candidateCreated: 0, candidateDiscarded: 0, accepted: 0, guards: 0 };
  const action = () => { c.guards += 2; };
  for (let i = 0; i < fileCount; i++) {
    action(); c.open++; c.cleanupReserved++;
    action(); c.observe++; // before
    action(); c.init++;
    for (let offset = 0; offset < bytesPerFile; offset += 65_536) {
      const n = Math.min(65_536, bytesPerFile - offset);
      action(); c.read++; c.received += n; c.update++; c.updateCompleted++; c.hashed += n; c.updateReservations++;
    }
    action(); c.read++; // declaration-position probe
    if (extra && i === fileCount - 1) { c.received++; action(); c.close++; break; }
    action(); c.observe++; // after
    action(); c.final++; c.candidateCreated++;
    action(); c.close++;
    action(); c.accepted++;
  }
  c.guards += 2; // finish before/after, not a new close
  return c;
}
describe('B capacity: independent vectors and exact 8 MiB envelope', () => {
  it('anchors the independent bounded oracle to empty, single-a and million-a known vectors', () => {
    expect(repeatedByteDigest(97, 0)).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(repeatedByteDigest(97, 1)).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
    expect(repeatedByteDigest(97, 1_000_000)).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
  it('independently reconstructs the two static synthetic capacity digests', () => {
    expect(repeatedByteDigest(97, 1_048_576)).toBe('9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360');
    expect(repeatedByteDigest(97, 262_144)).toBe('dd3dde87623d9a6b354c68c943d189c89c63652d945e7bbdf0986cae91a49521');
  });
  for (const [scenario, count, size, reads, guards] of [['capacity_8m_8', 8, 1_048_576, 136, 386],
    ['capacity_8m_32', 32, 262_144, 160, 770]] as const) {
    it(`completes ${count} files at exactly 8 MiB with independent per-event accounting`, () => {
      const fake = createReadHashFake(scenario), s = fake.run();
      expect(BigInt(count) * BigInt(size)).toBe(8_388_608n);
      expect(s).toMatchObject({ firstReason: 'none', stopReason: 'none', terminalDisposition: 'observed',
        readCompletedFiles: count, receivedState: 'observed', intervalGuards: 0,
        position: size, hashedPrefixBytes: size, retainedScope: false, retainedCandidate: false,
        retainedIssued: false, retainedRecord: false });
      expect(s.counts).toEqual(eventOracle(count, size));
      expect(s.counts).toMatchObject({ received: 8_388_608, hashed: 8_388_608, update: 128,
        updateCompleted: 128, read: reads, guards, close: count, accepted: count });
      expect(s.counts.guards).toBeLessThanOrEqual(131_524);
      expect(s.limits).toMatchObject({ files: 32, maxFile: 1_048_576, expected: 8_388_608,
        received: 8_388_609, chunk: 65_536, read: 65_536, retry: 32, guards: 131_524, stop: 900, end: 1000 });
      expect(s.slots).toHaveLength(count);
      for (const [i, slot] of s.slots.entries()) expect(slot).toEqual({ id: `F${String(i + 1).padStart(2, '0')}`, hash: 'hash_match', cleanup: 'closed_confirmed' });
      fake.step(); fake.cancel(); fake.advanceTo(-1);
      expect(fake.run()).toBe(s); expect(fake.finish()).toBe(s);
    });
  }
  for (const [scenario, count, size, guards] of [['capacity_8m_8_extra', 8, 1_048_576, 380],
    ['capacity_8m_32_extra', 32, 262_144, 764]] as const) {
    it(`charges the last excess byte at 8 MiB+1 but neither hashes nor accepts it (${count} files)`, () => {
      const s = createReadHashFake(scenario).run();
      expect(s).toMatchObject({ firstReason: 'content_mismatch', terminalDisposition: 'stopped', receivedState: 'observed',
        counts: { received: 8_388_609, hashed: 8_388_608, update: 128, accepted: count - 1,
          final: count - 1, observe: 2 * count - 1, close: count, guards }, intervalGuards: 0 });
      expect(s.counts).toEqual(eventOracle(count, size, true));
      expect(s.slots.slice(0, -1).every(x => x.hash === 'hash_match')).toBe(true);
      expect(s.slots.at(-1)).toMatchObject({ hash: 'content_mismatch', cleanup: 'closed_confirmed' });
      expect(s.retainedScope || s.retainedCandidate || s.retainedIssued || s.retainedRecord).toBe(false);
    });
  }
  for (const scenario of ['declared_total_over', 'declared_file_over', 'declared_files_over']) {
    it(`refuses ${scenario} before open/hash/cleanup reservation`, () => {
      const fake = createReadHashFake(scenario), before = fake.inspect();
      expect(before).toMatchObject({ firstReason: 'source_limit', stopReason: 'source_limit',
        counts: { open: 0, cleanupReserved: 0, read: 0, received: 0, init: 0, update: 0, final: 0, close: 0, accepted: 0 } });
      for (let i = 0; i < 3; i++) fake.step();
      expect(fake.inspect().counts).toEqual(before.counts);
      expect(fake.run()).toMatchObject({ firstReason: 'source_limit', counts: { open: 0, read: 0, close: 0, guards: 2 } });
    });
  }
  it('keeps the expanded capacity paths synthetic, package-excluded and not connected to supply/core', () => {
    const s = createReadHashFake('capacity_8m_8').run();
    expect(s).toMatchObject({ authority: 'none', ready: false, formalIssuance: 'closed', wholeRunAdmission: 'disabled',
      snapshotConnection: 'not_connected', rowAggregation: 'not_connected', coreInvocation: 'not_called',
      implementation: 'unknown', runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' });
    expect(s.rows.every(r => r.state === 'not_aggregated')).toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/expectedSha256|9bc1b2a2|dd3dde87|rawError|stack/);
  });
  it('keeps oracle input finite without inheriting model caps or accepting malformed values', () => {
    for (const [byte, length] of [[-1, 0], [256, 0], [NaN, 0], [97, -1], [97, 1.5], [97, 1_048_577]]) {
      expect(() => repeatedByteDigest(byte, length)).toThrow('oracle bounds');
    }
  });
});
