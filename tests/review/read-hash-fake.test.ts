import { describe, expect, it } from 'vitest';
import { createReadHashFake } from './fixtures/read-hash-fake.js';

type Fake = ReturnType<typeof createReadHashFake>;
function until(fake: Fake, phase: string, ordinal = 0) {
  for (let i = 0; i < 100; i++) {
    const s = fake.inspect();
    if (s.phase === phase && s.counts.accepted === ordinal) return;
    if (s.firstReason !== 'none') throw Error(`unexpected stop ${s.firstReason}`);
    fake.step();
  }
  throw Error('bounded test driver exhausted');
}
describe('B: fixed synthetic scratch/hash ownership', () => {
  it('matches independently pinned abc, empty and hello vectors without returning bytes or digests', () => {
    const end = createReadHashFake().run();
    expect(end).toMatchObject({ firstReason: 'none', stopReason: 'none', terminalState: 'closed', terminalDisposition: 'observed',
      counts: { open: 3, observe: 6, read: 5, received: 8, init: 3, update: 2, updateCompleted: 2, hashed: 8,
        final: 3, close: 3, accepted: 3, updateReserved: 0, candidateCreated: 3, candidateDiscarded: 0, guards: 54 },
      intervalGuards: 0, retainedScope: false, retainedCandidate: false, retainedIssued: false, retainedRecord: false });
    expect(end.slots.every(s => s.hash === 'hash_match' && s.cleanup === 'closed_confirmed')).toBe(true);
    expect(JSON.stringify(end)).not.toMatch(/sha256|ba7816|e3b0c4|scratch|rawError|stack/);
  });
  it('hashes only the written prefix regardless of poisoned scratch tails or chunk partition', () => {
    const a = createReadHashFake().run(), b = createReadHashFake('one_byte').run();
    expect(b.slots).toEqual(a.slots);
    expect(b.counts).toMatchObject({ read: 11, received: 8, update: 8, hashed: 8, accepted: 3 });
    expect(b.intervalGuards).toBe(0);
  });
  it('agrees with an independent per-event accounting oracle on every first-file prefix', () => {
    // Handwritten semantic trace, not imported schedule coefficients.
    const trace = ['open', 'before', 'init', 'payload', 'eof', 'after', 'final', 'close', 'accept'];
    for (let prefix = 0; prefix <= trace.length; prefix++) {
      const fake = createReadHashFake();
      for (let i = 0; i < prefix; i++) fake.step();
      const s = fake.finish(), events = trace.slice(0, prefix);
      const open = Number(events.includes('open')), close = open;
      const observe = Number(events.includes('before')) + Number(events.includes('after'));
      const read = Number(events.includes('payload')) + Number(events.includes('eof'));
      const init = Number(events.includes('init')), final = Number(events.includes('final'));
      const update = Number(events.includes('payload')), accepted = Number(events.includes('accept'));
      const actions = open + observe + init + read + final + close + accepted;
      expect(s.counts).toMatchObject({ open, observe, read, init, final, close, update, accepted,
        received: update * 3, hashed: update * 3, cleanupReserved: open, guards: 2 * actions + 2 });
      expect(s.firstReason).toBe('incomplete'); // two further files remain, even after the first commit
      expect(s.retainedCandidate || s.retainedRecord || s.retainedScope).toBe(false);
    }
  });
  for (const scenario of ['hash_update_throw', 'hash_partial_throw', 'second_update_throw'] as const) {
    it(`preserves received and known completed prefixes for ${scenario}`, () => {
      const end = createReadHashFake(scenario).run(), second = scenario === 'second_update_throw';
      expect(end).toMatchObject({ firstReason: 'hash_unavailable', hashState: 'poisoned', position: second ? 1 : 0,
        hashedPrefixBytes: second ? 1 : 0, receivedState: 'observed', counts: { read: second ? 2 : 1,
          received: second ? 2 : 3, update: second ? 2 : 1, updateCompleted: second ? 1 : 0,
          hashed: second ? 1 : 0, final: 0, close: 1, accepted: 0, updateReserved: 0 } });
    });
  }
  for (const [scenario, reason] of [['cancel_during_read', 'cancelled'], ['deadline_during_read', 'deadline'],
    ['hash_throw_cancel', 'hash_unavailable']] as const) {
    it(`finishes the single receive/hash interval before observing ${scenario}`, () => {
      const end = createReadHashFake(scenario).run();
      expect(end).toMatchObject({ firstReason: reason, stopReason: scenario === 'deadline_during_read' ? 'deadline' : 'cancelled',
        intervalGuards: 0, counts: { read: 1, received: 3, update: 1, updateCompleted: scenario === 'hash_throw_cancel' ? 0 : 1,
          final: 0, close: 1, accepted: 0 } });
    });
  }
  it('does not dispatch after a pre-guard refusal and still closes an existing resource', () => {
    const fake = createReadHashFake(); until(fake, 'read'); fake.cancel();
    expect(fake.run()).toMatchObject({ firstReason: 'cancelled', counts: { read: 0, update: 0, close: 1 } });
  });
  it('uses one shared retry pool, and never hashes an interrupted attempt', () => {
    const once = createReadHashFake('interrupt_once').run();
    expect(once.counts).toMatchObject({ retry: 1, read: 6, update: 2, updateReleased: 1, received: 8 });
    const always = createReadHashFake('interrupt_always').run();
    expect(always).toMatchObject({ firstReason: 'source_limit', position: 0,
      counts: { read: 33, retry: 32, update: 0, updateReleased: 33, updateReserved: 0, close: 1 } });
  });
  it('measures the concurrent update reservation peak instead of assuming it', () => {
    for (const [scenario, peak] of [['normal', 1], ['one_byte', 1], ['interrupt_always', 1], ['early_eof', 1],
      ['update_cap', 0], ['received_cap', 0], ['before_size', 0], ['open_none', 0]] as const) {
      const c = createReadHashFake(scenario).run().counts;
      expect([scenario, c.updateReservationPeak]).toEqual([scenario, peak]);
      expect(c.updateReservationPeak > 0).toBe(c.updateReservations > 0);
    }
  });
  it('conserves every attempt-bound update reservation without creating credit', () => {
    for (const scenario of ['normal', 'interrupt_once', 'interrupt_always', 'read_throw', 'hash_partial_throw', 'update_cap']) {
      const s = createReadHashFake(scenario).run(), c = s.counts;
      expect(c.updateReservations).toBe(c.update + c.updateReleased + c.updateReserved);
      expect(c.updateReserved).toBe(0); expect(c.updateReservationPeak).toBeLessThanOrEqual(1);
      expect(c.cleanupReserved).toBe(c.close + c.cleanupUnused);
    }
  });
  it('charges excess EOF bytes without hashing, skips after metadata on early or excess EOF', () => {
    expect(createReadHashFake('extra_byte').run()).toMatchObject({ firstReason: 'content_mismatch',
      counts: { received: 4, hashed: 3, update: 1, observe: 1, final: 0, close: 1 } });
    expect(createReadHashFake('early_eof').run()).toMatchObject({ firstReason: 'content_mismatch',
      counts: { received: 0, hashed: 0, update: 0, observe: 1, updateReleased: 1 } });
  });
  for (const scenario of ['invalid_n', 'read_throw', 'read_failed'] as const) {
    it(`retains unknown read volume and attempted charges for ${scenario}`, () => {
      expect(createReadHashFake(scenario).run()).toMatchObject({ receivedState: 'unavailable',
        firstReason: scenario === 'invalid_n' ? 'operation_invalid' : 'source_unavailable',
        counts: { read: 1, received: 0, update: 0, updateReserved: 0, updateReleased: 1, close: 1 } });
    });
  }
  for (const scenario of ['hash_init_throw', 'hash_final_throw', 'digest_mismatch', 'before_size', 'after_changed'] as const) {
    it(`stops and never accepts on ${scenario}`, () => {
      const s = createReadHashFake(scenario).run();
      expect(s.firstReason).toBe(scenario.startsWith('hash_') ? 'hash_unavailable'
        : scenario === 'after_changed' ? 'source_changed' : 'content_mismatch');
      expect(s.counts.accepted).toBe(0); expect(s.counts.close).toBe(1);
      if (scenario === 'before_size') expect(s.counts.read).toBe(0);
    });
  }
  for (const scenario of ['foreign_scope', 'foreign_owner', 'file_copy', 'candidate_copy'] as const) {
    it(`rejects private identity mixing: ${scenario}`, () => {
      expect(createReadHashFake(scenario).run()).toMatchObject({ firstReason: 'binding',
        counts: { candidateCreated: 1, candidateDiscarded: 1, accepted: 0, close: 1 } });
    });
  }
  for (const scenario of ['record_failure', 'accept_cancel', 'accept_clock', 'close_failure', 'close_throw', 'close_late'] as const) {
    it(`does not commit a provisional match on ${scenario}`, () => {
      const s = createReadHashFake(scenario).run();
      expect(s.counts).toMatchObject({ candidateCreated: 1, candidateDiscarded: 1, accepted: 0, close: 1 });
      expect(s.slots[0].hash).toBe('incomplete'); expect(s.terminalDisposition).toBe('stopped');
      if (scenario.startsWith('close_') && scenario !== 'close_late') expect(s.cleanupReason).toBe('close_unconfirmed');
    });
  }
  it('rejects a second acceptance without increasing the slot count', () => {
    const s = createReadHashFake('double_accept').run();
    expect(s).toMatchObject({ firstReason: 'binding', counts: { accepted: 1, candidateCreated: 1, candidateDiscarded: 0 } });
    expect(s.slots[0].hash).toBe('hash_match');
  });
  for (const scenario of ['update_cap', 'read_cap', 'received_cap', 'guard_cap'] as const) {
    it(`enforces ${scenario} before the disallowed operation with reserved cleanup intact`, () => {
      const s = createReadHashFake(scenario).run();
      expect(s.firstReason).toBe('source_limit'); expect(s.counts.close).toBe(1);
      if (scenario === 'update_cap' || scenario === 'received_cap') expect(s.counts.read).toBe(0);
      expect(s.counts.updateReserved).toBe(0);
    });
  }
  it('derives the ceiling from independent maximum action counts and enforces a long short-read limit', () => {
    const s = createReadHashFake('long_short_reads').run();
    const maximumActions = 65_536n + 32n + 32n + 32n + 32n + 32n + 32n + 32n;
    expect(BigInt(s.limits.guards)).toBe(2n * maximumActions + 2n + 2n);
    expect(s).toMatchObject({ firstReason: 'source_limit', counts: { read: 65_536, update: 65_536,
      received: 65_536, hashed: 65_536, close: 1, accepted: 0 } });
    expect(s.counts.guards).toBeLessThanOrEqual(s.limits.guards);
  });
  it('shares all counters across 32 accepted scopes', () => {
    const s = createReadHashFake('capacity_files').run();
    expect(s).toMatchObject({ firstReason: 'none', counts: { accepted: 32, open: 32, observe: 64,
      init: 32, read: 64, update: 32, hashed: 96, final: 32, close: 32, guards: 578 } });
  });
  it('distinguishes no-resource from acquired failure and closes each acquired resource once', () => {
    expect(createReadHashFake('open_none').run()).toMatchObject({ counts: { open: 1, close: 0, cleanupUnused: 1 },
      slots: [{ hash: 'incomplete', cleanup: 'no_resource' }, { hash: 'not_started' }, { hash: 'not_started' }] });
    expect(createReadHashFake('open_owned_failure').run()).toMatchObject({ counts: { open: 1, close: 1, cleanupUnused: 0 } });
  });
  it('keeps accepted slots when a partial run stops and distinguishes late stops after all commits', () => {
    const partial = createReadHashFake(); until(partial, 'open', 1); partial.cancel();
    const p = partial.finish(); expect(p.firstReason).toBe('cancelled'); expect(p.counts.accepted).toBe(1);
    expect(p.slots[0].hash).toBe('hash_match'); expect(p.slots[1].hash).toBe('not_started');
    for (const late of ['cancel', 'deadline', 'clock'] as const) {
      const fake = createReadHashFake(); until(fake, 'done', 3);
      if (late === 'cancel') fake.cancel(); else fake.advanceTo(late === 'deadline' ? 1000 : -1);
      const s = fake.finish();
      expect(s).toMatchObject({ firstReason: 'none', terminalDisposition: 'stopped', counts: { accepted: 3 } });
      expect(s.stopReason).toBe(late === 'cancel' ? 'cancelled' : late === 'deadline' ? 'deadline' : 'clock_unavailable');
      expect(s.slots.every(slot => slot.hash === 'hash_match')).toBe(true);
    }
  });
  it('does not accept while cleanup or the final acceptance guard remains pending', () => {
    const fake = createReadHashFake(); until(fake, 'close');
    expect(fake.inspect()).toMatchObject({ counts: { accepted: 0, candidateCreated: 1, close: 0 }, retainedCandidate: true });
    fake.step();
    expect(fake.inspect()).toMatchObject({ phase: 'accept', counts: { accepted: 0, close: 1 }, readCompletedFiles: 1 });
    fake.cancel();
    expect(fake.finish()).toMatchObject({ firstReason: 'cancelled', readCompletedFiles: 1,
      counts: { accepted: 0, candidateDiscarded: 1, close: 1 }, retainedIssued: false });
  });
  it('counts read completion at after equality, independent of final, cleanup and acceptance', () => {
    const fake = createReadHashFake(); until(fake, 'after');
    expect(fake.inspect().readCompletedFiles).toBe(0); fake.step();
    expect(fake.inspect()).toMatchObject({ phase: 'final', readCompletedFiles: 1, counts: { close: 0, accepted: 0 } });
    expect(createReadHashFake('close_failure').run()).toMatchObject({ readCompletedFiles: 1, counts: { accepted: 0 } });
    expect(createReadHashFake('hash_final_throw').run()).toMatchObject({ readCompletedFiles: 1, counts: { accepted: 0 } });
  });
  it('discards a failed pre-close candidate and retains confirmed cleanup on record preparation failure', () => {
    expect(createReadHashFake('candidate_failure').run()).toMatchObject({ firstReason: 'source_unavailable',
      counts: { candidateCreated: 0, close: 1, accepted: 0 }, retainedIssued: false });
    expect(createReadHashFake('record_failure').run()).toMatchObject({ firstReason: 'source_unavailable',
      slots: [{ hash: 'incomplete', cleanup: 'closed_confirmed' }, { hash: 'not_started' }, { hash: 'not_started' }] });
  });
  it('keeps mismatch primary and cleanup unconfirmed on separate axes', () => {
    expect(createReadHashFake('mismatch_close_failure').run()).toMatchObject({ firstReason: 'content_mismatch',
      cleanupReason: 'close_unconfirmed', slots: [{ hash: 'content_mismatch', cleanup: 'close_unconfirmed' },
        { hash: 'not_started' }, { hash: 'not_started' }], counts: { close: 1, accepted: 0 } });
  });
  it('keeps clock failures sticky through cleanup and rejects unsafe/reversed clock samples', () => {
    expect(createReadHashFake('clock_throw').run()).toMatchObject({ firstReason: 'clock_unavailable', counts: { open: 0 } });
    for (const value of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, {}]) {
      const fake = createReadHashFake(); until(fake, 'read'); fake.advanceTo(value); fake.step(); fake.advanceTo(0);
      expect(fake.finish()).toMatchObject({ firstReason: 'clock_unavailable', cleanupTiming: 'unknown', counts: { read: 0, close: 1 } });
    }
  });
  it('freezes detached summaries, retires all private payloads and latches terminal without new operations', () => {
    const fake = createReadHashFake(), before = fake.inspect(); const end = fake.run();
    expect(before.counts.read).toBe(0);
    const frozen = (v: unknown): void => { if (v && typeof v === 'object') { expect(Object.isFrozen(v)).toBe(true); Object.values(v).forEach(frozen); } };
    frozen(end); expect(Object.isFrozen(fake)).toBe(true);
    fake.step(); fake.cancel(); fake.advanceTo(-1); expect(fake.run()).toBe(end); expect(fake.finish()).toBe(end);
    expect(end).toMatchObject({ formalIssuance: 'closed', wholeRunAdmission: 'disabled', authority: 'none', ready: false,
      coreInvocation: 'not_called', snapshotConnection: 'not_connected', runtimeCoverage: 'unknown',
      entryRequirement: 'unknown', seedRequirement: 'unknown', nativeCost: 'unknown' });
    expect(end.rows.every(r => r.state === 'not_aggregated')).toBe(true);
  });
  it('adds no read, update or guard when stepped directly after a sticky stop', () => {
    const fake = createReadHashFake('hash_update_throw');
    for (let i = 0; i < 4; i++) fake.step();
    const stopped = fake.inspect();
    expect(stopped).toMatchObject({ firstReason: 'hash_unavailable', hashState: 'poisoned', counts: { read: 1, update: 1, guards: 8 } });
    for (let i = 0; i < 5; i++) fake.step();
    expect(fake.inspect().counts).toEqual(stopped.counts);
  });
  it('records misuse after all commits as binding even after a late stop', () => {
    for (const late of [false, true]) {
      const fake = createReadHashFake(); until(fake, 'done', 3);
      if (late) fake.cancel();
      fake.step();
      expect(fake.finish()).toMatchObject({ firstReason: 'binding', stopReason: late ? 'cancelled' : 'none', counts: { accepted: 3 } });
    }
  });
  it('rejects a payload whose real digest differs from the independently pinned value', () => {
    for (const scenario of ['digest_mismatch', 'mismatch_close_failure'] as const) {
      expect(createReadHashFake(scenario).run()).toMatchObject({ firstReason: 'content_mismatch',
        counts: { final: 1, updateCompleted: 1, hashed: 3, candidateCreated: 0, accepted: 0 },
        slots: [{ hash: 'content_mismatch' }, { hash: 'not_started' }, { hash: 'not_started' }] });
    }
  });
  it('pins the fixed 900 stop and 1000 cleanup boundaries with literal times', () => {
    for (const [time, read, first] of [[899, 1, 'none'], [900, 0, 'deadline']] as const) {
      const fake = createReadHashFake(); until(fake, 'read'); fake.advanceTo(time); fake.step();
      expect(fake.inspect()).toMatchObject({ firstReason: first, counts: { read } });
    }
    for (const [time, timing] of [[999, 'within'], [1000, 'expired']] as const) {
      const fake = createReadHashFake(); until(fake, 'done', 3); fake.advanceTo(time);
      expect(fake.finish()).toMatchObject({ firstReason: 'none', stopReason: 'deadline', cleanupTiming: timing });
    }
  });
  it('detects a clock reversal between two accepted samples', () => {
    const fake = createReadHashFake(); fake.advanceTo(500); fake.step(); fake.advanceTo(400); fake.step();
    expect(fake.finish()).toMatchObject({ firstReason: 'clock_unavailable', cleanupTiming: 'unknown', counts: { open: 1, observe: 0, close: 1 } });
  });
  it('keeps the first control stop when a later cleanup deadline also fails', () => {
    const fake = createReadHashFake(); fake.cancel(); fake.advanceTo(1000);
    expect(fake.finish()).toMatchObject({ firstReason: 'cancelled', stopReason: 'cancelled', cleanupTiming: 'expired' });
  });
  it('marks cleanup timing unknown when the guard ceiling itself is exhausted', () => {
    expect(createReadHashFake('guard_cap').run()).toMatchObject({ firstReason: 'source_limit', cleanupTiming: 'unknown',
      counts: { guards: 3, close: 1 } });
  });
  it('admits exactly one fixed selector argument, or none for normal', () => {
    expect(createReadHashFake().run().firstReason).toBe('none');
    const loose = createReadHashFake as (...args: unknown[]) => ReturnType<typeof createReadHashFake>;
    for (const args of [[undefined], ['normal', new Uint8Array(3)], ['normal', 'normal']]) {
      expect(loose(...args).run()).toMatchObject({ firstReason: 'binding', counts: { open: 0, read: 0, init: 0 } });
    }
  });
  it('rejects arbitrary suppliers and buffers without evaluating input hooks', () => {
    let hooks = 0; const proxy = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const input of [proxy, new Uint8Array(3), {}, 'unknown']) {
      expect(createReadHashFake(input).run()).toMatchObject({ firstReason: 'binding', counts: { open: 0, read: 0, init: 0 } });
    }
    expect(hooks).toBe(0);
  });
});
