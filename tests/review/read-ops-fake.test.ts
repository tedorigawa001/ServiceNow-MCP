import { describe, expect, it } from 'vitest';
import { createReadOpsFake, createFixedReadOpsFake } from './fixtures/read-ops-fake.js';

describe('A: isolated read operations, no bytes/hash/snapshot connection', () => {
  it('reserves cleanup before one open attempt and finalizes without claiming a hash match', () => {
    const fake = createReadOpsFake();
    expect(fake.openOnce(0)).toMatchObject({ ok: true, hashConnection: 'not_connected', ready: false });
    expect(fake.inspect()).toMatchObject({ budget: { open: 1, cleanupReserved: 1, close: 0 },
      ops: { open: 1, read: 0, close: 0 }, retainedResource: true });
    const end = fake.finish();
    expect(end.slots[0]).toMatchObject({ fileId: 'F01', hash: 'incomplete', cleanup: 'closed_confirmed' });
    expect(end.slots[1]).toMatchObject({ hash: 'not_started', cleanup: 'not_attempted' });
    expect(end).toMatchObject({ hashConnection: 'not_connected', retainedResource: false, budget: { close: 1 } });
    expect(fake.finish()).toBe(end);
  });
  it('uses one resource for before/read/EOF/after/close and shares counters across files', () => {
    const fake = createReadOpsFake();
    for (const [ordinal, size] of [[0, 3], [1, 2]]) {
      expect(fake.openOnce(ordinal).ok).toBe(true);
      expect(fake.observeOnce().ok).toBe(true);
      expect(fake.readOnce(0, size).ok).toBe(true);
      expect(fake.readOnce(size, 1).ok).toBe(true);
      expect(fake.observeOnce().ok).toBe(true);
      expect(fake.closeOnce().ok).toBe(true);
    }
    expect(fake.finish()).toMatchObject({ firstReason: 'none', budget: { open: 2, observe: 4, read: 4, received: 5,
      cleanupReserved: 2, close: 2 }, ops: { open: 2, observe: 4, read: 4, close: 2 } });
    expect(fake.inspect().slots.every(s => s.hash === 'pending' && s.cleanup === 'closed_confirmed')).toBe(true);
  });
  it('does not dispatch after cancellation and still closes an already owned resource once', () => {
    const early = createReadOpsFake(); early.cancel(); early.openOnce(0);
    expect(early.finish()).toMatchObject({ firstReason: 'cancelled', budget: { open: 0, close: 0 },
      slots: [{ cleanup: 'not_attempted' }, { cleanup: 'not_attempted' }] });
    const late = createReadOpsFake(); late.openOnce(0); late.cancel(); late.observeOnce();
    expect(late.inspect()).toMatchObject({ retainedResource: true, ops: { observe: 0, close: 0 } });
    expect(late.finish()).toMatchObject({ firstReason: 'cancelled', budget: { close: 1 }, retainedResource: false });
    late.finish(); expect(late.inspect().ops.close).toBe(1);
  });
  it('uses fixed shared stop/end deadlines and keeps cleanup timing separate', () => {
    const fake = createReadOpsFake(); fake.openOnce(0); fake.advanceTo(900); fake.observeOnce(); fake.advanceTo(1000);
    const end = fake.finish();
    expect(end).toMatchObject({ firstReason: 'deadline', stopReason: 'deadline', cleanupTiming: 'expired',
      deadlines: { stop: 900, end: 1000 }, ops: { open: 1, observe: 0, close: 1 } });
    expect(end.slots[0].cleanup).toBe('closed_confirmed');
  });
  it('charges each EINTR attempt and only retries the identical position/request', () => {
    const fake = createFixedReadOpsFake('interrupt_once'); fake.openOnce(0); fake.observeOnce();
    fake.readOnce(0, 3);
    expect(fake.inspect()).toMatchObject({ offset: 0, budget: { read: 1, retry: 0, received: 0 }, pendingRetry: true });
    fake.readOnce(0, 3);
    expect(fake.inspect()).toMatchObject({ offset: 3, budget: { read: 2, retry: 1, received: 3 }, pendingRetry: false });
    fake.finish();
    const bad = createFixedReadOpsFake('interrupt_once'); bad.openOnce(0); bad.observeOnce(); bad.readOnce(0, 3);
    expect(bad.readOnce(0, 2)).toMatchObject({ ok: false, reason: 'binding' });
    expect(bad.finish()).toMatchObject({ budget: { read: 1, retry: 0 }, ops: { read: 1, close: 1 } });
  });
  it('distinguishes no resource from an acquired resource after open failure', () => {
    const none = createFixedReadOpsFake('open_no_resource'); none.openOnce(0);
    expect(none.finish()).toMatchObject({ budget: { open: 1, close: 0, cleanupReserved: 1, cleanupUnused: 1 },
      slots: [{ cleanup: 'no_resource' }, { cleanup: 'not_attempted' }] });
    const owned = createFixedReadOpsFake('open_owned_failure'); owned.openOnce(0);
    expect(owned.finish()).toMatchObject({ firstReason: 'source_unavailable', ops: { open: 1, close: 1 },
      slots: [{ cleanup: 'closed_confirmed' }, { cleanup: 'not_attempted' }] });
  });
  it('does not reset a shared read cap when advancing to the second file', () => {
    const fake = createFixedReadOpsFake('shared_read_cap');
    fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 2); fake.readOnce(2, 1); fake.readOnce(3, 1); fake.observeOnce(); fake.closeOnce();
    fake.openOnce(1); fake.observeOnce();
    expect(fake.readOnce(0, 2)).toMatchObject({ ok: false, reason: 'source_limit' });
    expect(fake.finish()).toMatchObject({ budget: { read: 3, received: 3, close: 2 }, ops: { read: 3 } });
  });
  it('allows at most 32 retries, counting the first interrupted attempt separately', () => {
    const fake = createFixedReadOpsFake('interrupt_always'); fake.openOnce(0); fake.observeOnce();
    for (let i = 0; i < 33; i++) expect(fake.readOnce(0, 3).ok).toBe(true);
    expect(fake.readOnce(0, 3)).toMatchObject({ ok: false, reason: 'source_limit' });
    expect(fake.finish()).toMatchObject({ budget: { read: 33, retry: 32, received: 0 }, ops: { read: 33, close: 1 } });
  });
  for (const [scenario, reason] of [['early_eof', 'content_mismatch'], ['invalid_n', 'operation_invalid'],
    ['read_throw', 'source_unavailable'], ['read_failed', 'source_unavailable'], ['observe_throw', 'source_unavailable'],
    ['before_size', 'content_mismatch'], ['cancel_during_read', 'cancelled'], ['deadline_during_read', 'deadline']] as const) {
    it(`stops and retains diagnostics for ${scenario}`, () => {
      const fake = createFixedReadOpsFake(scenario); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 3);
      const first = fake.inspect(); expect(first.firstReason).toBe(reason);
      fake.readOnce(0, 3); fake.openOnce(1); fake.observeOnce();
      expect(fake.inspect().ops).toEqual(first.ops);
      const end = fake.finish(); expect(end.firstReason).toBe(reason); expect(end.ops.close).toBe(1);
      expect(end.retainedResource).toBe(false);
    });
  }
  it('charges an excess EOF byte but never reads after the mismatch', () => {
    const fake = createFixedReadOpsFake('extra_byte'); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 3);
    expect(fake.readOnce(3, 1)).toMatchObject({ ok: false, reason: 'content_mismatch' });
    expect(fake.finish()).toMatchObject({ budget: { received: 4, read: 2, observe: 1 }, ops: { observe: 1, close: 1 } });
  });
  it('keeps content mismatch primary when cleanup is unconfirmed', () => {
    const fake = createFixedReadOpsFake('mismatch_close_failure'); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 3);
    fake.cancel();
    const end = fake.finish(); expect(end).toMatchObject({ firstReason: 'content_mismatch', stopReason: 'cancelled',
      cleanupReason: 'close_unconfirmed', ops: { close: 1 } });
    expect(end.slots[0]).toMatchObject({ hash: 'content_mismatch', cleanup: 'close_unconfirmed' });
  });
  it('uses the full fixed capacity without resetting open/observe/cleanup/byte counters', () => {
    const fake = createFixedReadOpsFake('capacity_files');
    for (let i = 0; i < 32; i++) {
      fake.openOnce(i); fake.observeOnce();
      for (let chunk = 0; chunk < 4; chunk++) fake.readOnce(chunk * 65_536, 65_536);
      fake.readOnce(262_144, 1); fake.observeOnce(); fake.closeOnce();
    }
    const end = fake.finish();
    expect(end).toMatchObject({ firstReason: 'none', budget: { open: 32, observe: 64, read: 160, received: 8_388_608,
      cleanupReserved: 32, close: 32 }, guards: 578 });
    expect(BigInt(end.budget.received)).toBe(32n * 4n * 65_536n);
    expect(end.slots).toHaveLength(32); expect(end.slots[31].fileId).toBe('F32');
  });
  it('stops a positive one-byte short-read stream at the shared attempt ceiling', () => {
    const fake = createFixedReadOpsFake('read_limit'); fake.openOnce(0); fake.observeOnce();
    for (let i = 0; i < 65_536; i++) fake.readOnce(i, 65_536);
    expect(fake.readOnce(65_536, 65_536)).toMatchObject({ ok: false, reason: 'source_limit' });
    expect(fake.finish()).toMatchObject({ budget: { read: 65_536, received: 65_536 }, ops: { read: 65_536, close: 1 } });
  });
  it('does not infer no-resource from an untyped open throw', () => {
    const fake = createFixedReadOpsFake('open_throw_unknown'); fake.openOnce(0);
    expect(fake.finish()).toMatchObject({ firstReason: 'source_unavailable', acquisitionUncertain: true,
      budget: { open: 1, close: 0, cleanupUnused: 0 }, slots: [{ cleanup: 'close_unconfirmed' }, { cleanup: 'not_attempted' }] });
  });
  it('keeps cleanup failure primary when the closing call also reaches the deadline', () => {
    const fake = createFixedReadOpsFake('close_throw_late'); fake.openOnce(0); fake.observeOnce();
    fake.readOnce(0, 3); fake.readOnce(3, 1); fake.observeOnce(); fake.closeOnce(); fake.finish();
    expect(fake.inspect()).toMatchObject({ firstReason: 'source_unavailable', acceptedFiles: 0, stopReason: 'deadline',
      cleanupReason: 'close_unconfirmed', cleanupTiming: 'expired', ops: { close: 1 } });
  });
  it('handles clock throws, invalid values and reverse time without skipping cleanup', () => {
    const fail = createFixedReadOpsFake('clock_throw'); fail.openOnce(0);
    expect(fail.finish()).toMatchObject({ firstReason: 'clock_unavailable', budget: { open: 0, close: 0 }, cleanupTiming: 'unknown' });
    for (const time of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1, {}]) {
      const fake = createReadOpsFake(); fake.openOnce(0); fake.advanceTo(time); fake.observeOnce();
      expect(fake.finish()).toMatchObject({ firstReason: 'clock_unavailable', ops: { observe: 0, close: 1 }, cleanupTiming: 'unknown' });
    }
  });
  it('does not restore clock confidence after a reverse observation', () => {
    const fake = createReadOpsFake(); fake.openOnce(0); fake.advanceTo(-1); fake.observeOnce(); fake.advanceTo(0);
    expect(fake.finish()).toMatchObject({ firstReason: 'clock_unavailable', cleanupTiming: 'unknown', ops: { close: 1 } });
  });
  it('reserves the requested byte maximum before dispatching the next file read', () => {
    const fake = createFixedReadOpsFake('shared_received_cap'); fake.openOnce(0); fake.observeOnce();
    fake.readOnce(0, 3); fake.readOnce(3, 1); fake.observeOnce(); fake.closeOnce(); fake.openOnce(1); fake.observeOnce();
    expect(fake.readOnce(0, 2)).toMatchObject({ ok: false, reason: 'source_limit' });
    expect(fake.finish()).toMatchObject({ budget: { received: 3, read: 2 }, ops: { read: 2, close: 2 } });
  });
  it('shares the retry pool across file scopes without charging the initial interruption as retry', () => {
    const fake = createFixedReadOpsFake('shared_retry_cap'); fake.openOnce(0); fake.observeOnce();
    fake.readOnce(0, 3); fake.readOnce(0, 3); fake.readOnce(3, 1); fake.observeOnce(); fake.closeOnce();
    fake.openOnce(1); fake.observeOnce(); fake.readOnce(0, 2);
    expect(fake.readOnce(0, 2)).toMatchObject({ ok: false, reason: 'source_limit' });
    expect(fake.finish()).toMatchObject({ budget: { read: 4, retry: 1, received: 3 }, ops: { read: 4, close: 2 } });
  });
  it('matches an independent event oracle for every normal partial prefix and its cleanup', () => {
    const trace = ['open', 'before', 'read', 'read', 'read', 'eof', 'after', 'close'] as const;
    for (let prefix = 0; prefix <= trace.length; prefix++) {
      const fake = createReadOpsFake();
      let offset = 0, open = 0, observe = 0, read = 0, close = 0;
      for (const event of trace.slice(0, prefix)) {
        if (event === 'open') { fake.openOnce(0); open++; }
        else if (event === 'before' || event === 'after') { fake.observeOnce(); observe++; }
        else if (event === 'close') { fake.closeOnce(); close++; }
        else { fake.readOnce(offset, 1); read++; if (event === 'read') offset++; }
      }
      const end = fake.finish(); if (open && !close) close++;
      expect(end.budget).toEqual({ open, observe, read, retry: 0, received: offset, cleanupReserved: open, cleanupUnused: 0, close });
      expect(end.ops).toEqual({ open, observe, read, close });
      expect(end.guards).toBe(2 * (open + observe + read + close) + 2);
      expect(end.clockCalls).toBe(end.guards);
      expect(end.cleanupOutstanding).toBe(0);
      expect(end.firstReason).toBe(prefix >= 1 && prefix <= 6 ? 'incomplete' : 'none');
      expect(end.acceptedFiles).toBe(prefix >= 7 ? 1 : 0);
    }
  });
  it('rejects invalid order and scalar requests before ReadOps sees them', () => {
    for (const request of [[0, 0], [0, 4], [1, 1], [0, NaN], [0, Infinity], [{}, 1], [0, {}]]) {
      const fake = createReadOpsFake(); fake.openOnce(0); fake.observeOnce(); fake.readOnce(request[0], request[1]);
      expect(fake.finish()).toMatchObject({ firstReason: 'operation_invalid', ops: { read: 0, close: 1 } });
    }
    const unopened = createReadOpsFake(); unopened.observeOnce();
    expect(unopened.finish()).toMatchObject({ firstReason: 'operation_invalid', ops: { open: 0, observe: 0, close: 0 } });
    const active = createReadOpsFake(); active.openOnce(0); active.openOnce(1);
    expect(active.finish()).toMatchObject({ firstReason: 'binding', ops: { open: 1, close: 1 } });
  });
  it('does not claim a known byte count for invalid n or a throwing read', () => {
    for (const scenario of ['invalid_n', 'read_throw']) {
      const fake = createFixedReadOpsFake(scenario); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 3);
      expect(fake.finish()).toMatchObject({ receivedState: 'unavailable', budget: { received: 0, read: 1 }, ops: { read: 1 } });
    }
  });
  it('freezes detached views, latches terminal slots and exposes no resource or byte authority', () => {
    const fake = createReadOpsFake(), before = fake.inspect(); fake.openOnce(0);
    expect(before.budget.open).toBe(0); expect(before.slots[0].cleanup).toBe('not_attempted');
    const end = fake.finish();
    const walk = (v: unknown): void => { if (v && typeof v === 'object') { expect(Object.isFrozen(v)).toBe(true); Object.values(v).forEach(walk); } };
    walk(end); expect(Object.isFrozen(fake)).toBe(true);
    fake.cancel(); fake.advanceTo(-1); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 1); fake.closeOnce();
    expect(fake.finish()).toBe(end); expect(fake.inspect()).toBe(end);
    expect(end).toMatchObject({ authority: 'none', hashConnection: 'not_connected', hashCalls: 0,
      runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown', ready: false });
    expect(end.rows).toHaveLength(12); expect(end.rows.every(r => r.state === 'not_aggregated')).toBe(true);
    expect(JSON.stringify(end)).not.toMatch(/expectedSha256|snapshot|rawError|stack/);
  });
  it('rejects arbitrary profiles, resources and callbacks without executing hooks', () => {
    let hooks = 0;
    const input = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const fake of [createReadOpsFake(input), createFixedReadOpsFake(input), createFixedReadOpsFake('normal', input), createFixedReadOpsFake('unknown')]) {
      fake.openOnce(0); expect(fake.finish()).toMatchObject({ firstReason: 'binding', budget: { open: 0 }, ops: { open: 0 } });
    }
    expect(hooks).toBe(0);
  });
  it('rejects expected file/total size excess before any open attempt', () => {
    for (const scenario of ['bad_file_size', 'bad_total_size']) {
      const fake = createFixedReadOpsFake(scenario); fake.openOnce(0);
      expect(fake.finish()).toMatchObject({ firstReason: 'source_limit', budget: { open: 0, cleanupReserved: 0 }, ops: { open: 0, close: 0 } });
    }
  });
  it('reports only a post-read metadata difference as source_changed', () => {
    const fake = createFixedReadOpsFake('after_stamp'); fake.openOnce(0); fake.observeOnce();
    fake.readOnce(0, 3); fake.readOnce(3, 1);
    expect(fake.observeOnce()).toMatchObject({ ok: false, reason: 'source_changed' });
    expect(fake.finish()).toMatchObject({ ops: { observe: 2, read: 2, close: 1 } });
  });
  it('bounds clock sampling and preserves unknown cleanup timing when its guard pool is exhausted', () => {
    const fake = createFixedReadOpsFake('guard_cap'); fake.openOnce(0); fake.observeOnce();
    expect(fake.finish()).toMatchObject({ firstReason: 'source_limit', guards: 3, clockCalls: 3,
      cleanupTiming: 'unknown', ops: { open: 1, observe: 1, close: 1 } });
  });
  it('discards partial result slots and refuses all operations when slot preparation fails', () => {
    const fake = createFixedReadOpsFake('slot_build_failure'); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 1);
    expect(fake.finish()).toMatchObject({ firstReason: 'source_unavailable', slotsState: 'unavailable', slots: [],
      budget: { open: 0, cleanupReserved: 0 }, ops: { open: 0, observe: 0, read: 0, close: 0 } });
  });
});

describe('A review fixes: completion, late stops and unguarded transitions', () => {
  type Fake = ReturnType<typeof createReadOpsFake>;
  const full = (fake: Fake, ordinal: number, size: number) => {
    fake.openOnce(ordinal); fake.observeOnce(); fake.readOnce(0, size); fake.readOnce(size, 1); fake.observeOnce(); return fake.closeOnce();
  };
  it('keeps a completed file pending and counts it as accepted', () => {
    const fake = createReadOpsFake(); full(fake, 0, 3); full(fake, 1, 2);
    expect(fake.finish()).toMatchObject({ firstReason: 'none', stopReason: 'none', acceptedFiles: 2,
      slots: [{ hash: 'pending', cleanup: 'closed_confirmed' }, { hash: 'pending', cleanup: 'closed_confirmed' }] });
  });
  it('records an abandoned open file as incomplete instead of a clean finish', () => {
    const fake = createReadOpsFake(); full(fake, 0, 3); fake.openOnce(1); fake.observeOnce();
    expect(fake.finish()).toMatchObject({ firstReason: 'incomplete', acceptedFiles: 1,
      slots: [{ hash: 'pending', cleanup: 'closed_confirmed' }, { hash: 'incomplete', cleanup: 'closed_confirmed' }] });
  });
  it('rejects an explicit close in the middle of a read and does not advance to the next file', () => {
    const fake = createReadOpsFake(); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 1);
    expect(fake.closeOnce()).toMatchObject({ ok: false, reason: 'incomplete' });
    expect(fake.openOnce(1)).toMatchObject({ ok: false, reason: 'incomplete' });
    expect(fake.finish()).toMatchObject({ acceptedFiles: 0, ops: { open: 1, close: 1 },
      slots: [{ hash: 'incomplete', cleanup: 'closed_confirmed' }, { hash: 'not_started', cleanup: 'not_attempted' }] });
  });
  it('keeps late stops out of the primary reason once every file is accepted', () => {
    for (const [late, stopReason, cleanupTiming] of [['window', 'deadline', 'within'], ['end', 'deadline', 'expired'],
      ['cancel', 'cancelled', 'within']] as const) {
      const fake = createReadOpsFake(); full(fake, 0, 3); full(fake, 1, 2);
      if (late === 'cancel') fake.cancel(); else fake.advanceTo(late === 'window' ? 950 : 1000);
      expect(fake.finish()).toMatchObject({ firstReason: 'none', stopReason, cleanupTiming, acceptedFiles: 2 });
    }
    const partial = createReadOpsFake(); full(partial, 0, 3); partial.advanceTo(950);
    expect(partial.finish()).toMatchObject({ firstReason: 'deadline', acceptedFiles: 1 });
  });
  it('does not accept a completed read whose cleanup checkpoint reaches the end deadline', () => {
    const fake = createReadOpsFake(); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 3); fake.readOnce(3, 1); fake.observeOnce();
    fake.advanceTo(1000);
    expect(fake.closeOnce()).toMatchObject({ ok: false, reason: 'deadline' });
    expect(fake.finish()).toMatchObject({ acceptedFiles: 0, slots: [{ hash: 'incomplete', cleanup: 'closed_confirmed' }, { hash: 'not_started' }] });
  });
  it('still rejects a non-late misuse after every file is accepted', () => {
    const fake = createReadOpsFake(); full(fake, 0, 3); full(fake, 1, 2);
    expect(fake.openOnce(2)).toMatchObject({ ok: false, reason: 'binding' });
    expect(fake.finish()).toMatchObject({ firstReason: 'binding', acceptedFiles: 2, ops: { open: 2 } });
  });
  it('rejects a first open of a later ordinal before ReadOps sees it', () => {
    const fake = createReadOpsFake();
    expect(fake.openOnce(1)).toMatchObject({ ok: false, reason: 'binding' });
    expect(fake.finish()).toMatchObject({ budget: { open: 0, cleanupReserved: 0 }, ops: { open: 0 } });
  });
  it('rejects observation while an interrupted read awaits its retry', () => {
    const fake = createFixedReadOpsFake('interrupt_once'); fake.openOnce(0); fake.observeOnce(); fake.readOnce(0, 3);
    expect(fake.observeOnce()).toMatchObject({ ok: false, reason: 'operation_invalid' });
    expect(fake.finish()).toMatchObject({ ops: { observe: 1, read: 1, close: 1 } });
  });
  for (const [scenario, reason] of [['after_size', 'source_changed'], ['after_identity', 'source_changed'],
    ['after_kind', 'source_changed'], ['before_identity', 'binding'], ['before_kind', 'binding']] as const) {
    it(`classifies ${scenario} metadata as ${reason}`, () => {
      const fake = createFixedReadOpsFake(scenario); fake.openOnce(0); fake.observeOnce();
      if (scenario.startsWith('after')) { fake.readOnce(0, 3); fake.readOnce(3, 1); fake.observeOnce(); }
      expect(fake.finish()).toMatchObject({ firstReason: reason, acceptedFiles: 0, ops: { close: 1 } });
    });
  }
  it('detects a backward clock step between two positive times', () => {
    const fake = createReadOpsFake(); fake.openOnce(0); fake.advanceTo(500); fake.observeOnce(); fake.advanceTo(400);
    expect(fake.readOnce(0, 1)).toMatchObject({ ok: false, reason: 'clock_unavailable' });
    expect(fake.finish()).toMatchObject({ ops: { read: 0, close: 1 }, cleanupTiming: 'unknown' });
  });
  it('keeps the first late stop reason when a later deadline also appears', () => {
    const fake = createReadOpsFake(); fake.openOnce(0); fake.cancel();
    expect(fake.inspect()).toMatchObject({ firstReason: 'cancelled', stopReason: 'cancelled' });
    fake.advanceTo(1000);
    expect(fake.finish()).toMatchObject({ firstReason: 'cancelled', stopReason: 'cancelled', cleanupTiming: 'expired' });
  });
  it('reports outstanding cleanup only for an uncertain acquisition', () => {
    const none = createFixedReadOpsFake('open_no_resource'); none.openOnce(0);
    expect(none.finish()).toMatchObject({ cleanupOutstanding: 0, budget: { cleanupReserved: 1, cleanupUnused: 1, close: 0 } });
    const unknown = createFixedReadOpsFake('open_throw_unknown'); unknown.openOnce(0);
    expect(unknown.finish()).toMatchObject({ cleanupOutstanding: 1 });
  });
  it('keeps the core path closed on every result and snapshot', () => {
    const fake = createReadOpsFake();
    expect(fake.openOnce(0)).toMatchObject({ coreInvocation: 'not_called' });
    expect(fake.finish()).toMatchObject({ coreInvocation: 'not_called' });
  });
});
