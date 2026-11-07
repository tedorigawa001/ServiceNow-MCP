import { describe, expect, it } from 'vitest';
import { createFixedBootstrapFake, createSeedBootstrapFake } from './fixtures/seed-bootstrap-fake.js';
import { readFileSync } from 'node:fs';

describe('K0/E pure fake, no seed/core or real budget connection', () => {
  it('refuses E one below capacity without a debit or a fabricated zero usage', () => {
    const fake = createSeedBootstrapFake(14, 10, 0);
    expect(fake.acquireEntry()).toMatchObject({ ok: false, reason: 'raw_work', entry: 'not_acquired', bootstrapUsage: { state: 'unavailable' },
      k0Work: 'excluded', ready: false, runtimeCoverage: 'unknown', coreInvocation: 'not_called' });
    expect(fake.inspect()).toMatchObject({ budget: { state: 'observed', parser: 10, bridge: 0, total: 10 }, ownerBuilt: false, runtimeCoverage: 'unknown' });
    expect(fake.inspect().diagnostics).toEqual({ firstReason: 'raw_work', snapshot: 'not_reported', cleanup: 'not_reported' });
  });
  it('debits once at equality and rejects a second acquisition without refund or a second debit', () => {
    const fake = createSeedBootstrapFake(15, 10, 0);
    expect(fake.acquireEntry()).toMatchObject({ ok: true, entry: 'acquired', bootstrapUsage: { state: 'unavailable' } });
    expect(fake.inspect()).toMatchObject({ state: 'EntryDebited', budget: { total: 15, bridge: 5 }, ownerBuilt: false });
    const refused = fake.acquireEntry();
    expect(refused).toMatchObject({ ok: false, reason: 'raw_limits', entry: 'acquired' });
    expect(fake.acquireEntry()).toBe(refused); expect(fake.inspect()).toMatchObject({ budget: { total: 15, bridge: 5 } });
  });
  it('builds only after E and retires the fake credit without refunding its unused reservation', () => {
    const fake = createSeedBootstrapFake(20, 10, 0);
    fake.acquireEntry();
    expect(fake.buildEntry()).toMatchObject({ ok: true, bootstrapUsage: { state: 'observed', charged: 5, executed: 1, prepaidUnused: 4 } });
    expect(fake.checkProfile()).toMatchObject({ ok: true, ready: false });
    expect(fake.close()).toMatchObject({ ok: true, bootstrapUsage: { state: 'observed', charged: 5, executed: 5, prepaidUnused: 0 } });
    expect(fake.inspect()).toMatchObject({ state: 'Retired', cleanupAttempts: 1, creditRetires: 1, budget: { total: 15 } });
  });
  it('preserves the first failure, accounting and reserved terminal path on repeated calls', () => {
    const fake = createSeedBootstrapFake(20, 10, 0); fake.acquireEntry(); fake.buildEntry();
    const first = fake.reject('raw_work');
    expect(first).toMatchObject({ ok: false, reason: 'raw_work', diagnostics: { firstReason: 'raw_work' },
      bootstrapUsage: { state: 'observed', charged: 5, executed: 4, prepaidUnused: 1 } });
    const ended = fake.inspect();
    for (let i = 0; i < 100; i++) {
      expect(fake.acquireEntry()).toBe(first); expect(fake.buildEntry()).toBe(first);
      expect(fake.checkProfile()).toBe(first); expect(fake.close()).toBe(first); expect(fake.reject('raw_internal')).toBe(first);
    }
    expect(fake.inspect()).toEqual(ended); expect(ended.cleanupAttempts).toBe(1); expect(ended.creditRetires).toBe(1);
    expect(ended.budget).toMatchObject({ total: 15 });
  });
  it.each(['buildEntry', 'checkProfile', 'close'] as const)('rejects %s before E and never starts an owner/profile/debit', operation => {
    const fake = createSeedBootstrapFake(20, 10, 0), r = fake[operation]();
    expect(r).toMatchObject({ ok: false, reason: 'raw_limits', entry: 'not_acquired', bootstrapUsage: { state: 'unavailable' } });
    expect(fake.acquireEntry()).toBe(r);
    expect(fake.inspect()).toMatchObject({ ownerBuilt: false, buildAttempted: false, profileChecked: false, entryDebits: 0, cleanupAttempts: 0, creditRetires: 0, budget: { total: 10 } });
  });
  it.each(['buildEntry', 'checkProfile'] as const)('poisons a duplicate %s without rerunning or losing the E debit', operation => {
    const fake = createSeedBootstrapFake(20, 10, 0); fake.acquireEntry(); fake.buildEntry();
    if (operation === 'checkProfile') fake.checkProfile();
    const r = fake[operation]();
    expect(r).toMatchObject({ ok: false, reason: 'raw_limits', entry: 'acquired' });
    expect(fake[operation]()).toBe(r); expect(fake.acquireEntry()).toBe(r);
    expect(fake.inspect()).toMatchObject({ entryDebits: 1, cleanupAttempts: 1, creditRetires: 1, budget: { total: 15 } });
  });
  it('does not turn an already closed success into a new acquisition or overwrite its stored diagnostics', () => {
    const fake = createSeedBootstrapFake(20, 10, 0); fake.acquireEntry(); fake.buildEntry(); fake.checkProfile();
    const terminal = fake.close(), snapshot = fake.inspect();
    expect(fake.acquireEntry()).toMatchObject({ ok: false, reason: 'raw_limits' });
    expect(fake.buildEntry()).toMatchObject({ ok: false }); expect(fake.checkProfile()).toMatchObject({ ok: false, reason: 'raw_limits' }); expect(fake.reject('raw_work')).toMatchObject({ ok: false });
    expect(fake.buildEntry()).toBe(fake.acquireEntry());
    expect(fake.close()).toBe(terminal); expect(fake.inspect()).toEqual(snapshot);
    expect(snapshot.diagnostics.firstReason).toBe('none');
  });
  it('keeps E acquired when the fixed entry-building scenario fails before an owner exists', () => {
    const fake = createFixedBootstrapFake('entry_build_failure');
    fake.acquireEntry(); const r = fake.buildEntry();
    expect(r).toMatchObject({ ok: false, reason: 'raw_internal', entry: 'acquired', bootstrapUsage: { state: 'unavailable' } });
    expect(fake.inspect()).toMatchObject({ ownerBuilt: false, buildAttempted: true, profileChecked: false, entryDebits: 1,
      cleanupAttempts: 1, creditRetires: 1, budget: { total: 15 } });
    expect(fake.reject('raw_work')).toBe(r); expect(fake.acquireEntry()).toBe(r);
  });
  it('checks the fixed fake profile only after E and preserves a profile refusal', () => {
    const fake = createFixedBootstrapFake('profile_rejected'); fake.acquireEntry(); fake.buildEntry(); const r = fake.checkProfile();
    expect(r).toMatchObject({ ok: false, reason: 'raw_limits', entry: 'acquired', bootstrapUsage: { state: 'observed', charged: 5, executed: 5, prepaidUnused: 0 } });
    expect(fake.reject('raw_internal')).toBe(r); expect(fake.inspect()).toMatchObject({ profileChecked: true, budget: { total: 15 } });
  });
  it.each(['snapshot_failure', 'cleanup_failure', 'snapshot_cleanup_failure'] as const)('preserves the first failure with fixed %s secondary diagnostics', scenario => {
    const fake = createFixedBootstrapFake(scenario); fake.acquireEntry(); fake.buildEntry();
    const r = fake.reject('raw_work'); expect(r).toMatchObject({ ok: false, reason: 'raw_work', diagnostics: { firstReason: 'raw_work' } });
    expect(r.bootstrapUsage.state).toBe(scenario === 'cleanup_failure' ? 'observed' : 'unavailable');
    expect(fake.inspect().diagnostics).toEqual({ firstReason: 'raw_work',
      snapshot: scenario === 'cleanup_failure' ? 'not_failed' : 'unavailable',
      cleanup: scenario === 'snapshot_failure' ? 'simulated_released' : 'simulated_unconfirmed' });
    expect(fake.checkProfile()).toBe(r); expect(fake.close()).toBe(r);
    expect(fake.inspect()).toMatchObject({ cleanupAttempts: 1, creditRetires: 1, budget: { total: 15 } });
  });
  it.each(['snapshot_failure', 'cleanup_failure', 'snapshot_cleanup_failure'] as const)('refuses terminal success on %s instead of fabricating proof', scenario => {
    const fake = createFixedBootstrapFake(scenario); fake.acquireEntry(); fake.buildEntry(); fake.checkProfile();
    const r = fake.close(); expect(r).toMatchObject({ ok: false, reason: 'raw_internal', diagnostics: { firstReason: 'raw_internal' }, ready: false });
    expect(fake.close()).toBe(r); expect(fake.acquireEntry()).toBe(r);
  });
  it('uses immutable shared carriers as DATA, not identities or previous-invocation counters', () => {
    const a = createSeedBootstrapFake(14, 10, 0), b = createSeedBootstrapFake(104, 100, 0);
    expect(a.acquireEntry()).toBe(b.acquireEntry()); // Same fixed reason, different private fake budgets.
    expect(a.inspect().budget).toMatchObject({ total: 10 }); expect(b.inspect().budget).toMatchObject({ total: 100 });
    const c = createSeedBootstrapFake(15, 10, 0); expect(c.acquireEntry().ok).toBe(true);
    expect(a.inspect()).toMatchObject({ entryDebits: 0 }); expect(c.inspect()).toMatchObject({ entryDebits: 1 });
  });
  it('matches BigInt capacity and non-refund accounting without charging K0 itself', () => {
    for (const parser of [0n, 10n, 65n, 110n, 312n, 9007199254740000n]) for (const bridge of [0n, 1n, 102n]) for (const gap of [-1n, 0n, 1n]) {
      const cap = parser + bridge + 5n + gap, fake = createSeedBootstrapFake(Number(cap), Number(parser), Number(bridge));
      const r = fake.acquireEntry();
      if (gap < 0n) expect(r).toMatchObject({ ok: false, reason: 'raw_work', bootstrapUsage: { state: 'unavailable' } });
      else expect(r).toMatchObject({ ok: true, entry: 'acquired' });
      expect(fake.inspect().budget).toEqual({ state: 'observed', parser: Number(parser), bridge: Number(bridge + (gap < 0n ? 0n : 5n)), total: Number(parser + bridge + (gap < 0n ? 0n : 5n)) });
      expect(r.k0Work).toBe('excluded'); expect(r.nativeCost).toBe('unknown'); expect(r).not.toHaveProperty('k0Units');
    }
  });
  it('matches a separate finite reference machine for every five-command word, including after success', () => {
    const commands = ['acquire', 'build', 'profile', 'close', 'reject'] as const;
    let doneSteps = 0;
    for (let word = 0; word < 3125; word++) {
      const fake = createSeedBootstrapFake(20, 10, 0);
      let state: 'base' | 'debit' | 'built' | 'checked' | 'failed' | 'done' = 'base';
      let acquired = false, ownerBuilt = false, cleanup = false, first = 'none', n = word;
      for (let i = 0; i < 5; i++) {
        const command = commands[n % 5]; n = Math.floor(n / 5);
        let ok = false, reason = 'raw_limits';
        if (state === 'failed') reason = first;
        else if (state === 'done') { ok = command === 'close'; doneSteps++; }
        else if (command === 'acquire' && state === 'base') { state = 'debit'; acquired = true; ok = true; }
        else if (command === 'build' && state === 'debit') { state = 'built'; ownerBuilt = true; ok = true; }
        else if (command === 'profile' && state === 'built') { state = 'checked'; ok = true; }
        else if (command === 'close' && state === 'checked') { state = 'done'; cleanup = true; ok = true; }
        else { reason = command === 'reject' ? 'raw_work' : 'raw_limits'; first = reason; state = 'failed'; cleanup = acquired; }
        const result = command === 'acquire' ? fake.acquireEntry() : command === 'build' ? fake.buildEntry()
          : command === 'profile' ? fake.checkProfile() : command === 'close' ? fake.close() : fake.reject('raw_work');
        expect(result.ok).toBe(ok); if (!result.ok) expect(result.reason).toBe(reason);
        expect(result.seed).toBe('not_acquired'); expect(result.ready).toBe(false);
        expect(fake.inspect()).toMatchObject({ ownerBuilt, entryDebits: acquired ? 1 : 0, cleanupAttempts: cleanup ? 1 : 0,
          creditRetires: cleanup ? 1 : 0, diagnostics: { firstReason: first }, budget: { total: acquired ? 15 : 10 } });
      }
    }
    expect(doneSteps).toBe(5); // acquire, build, profile, close, then each of the five commands.
  });
  it('rejects fake-only impossible base states, unsafe inputs and objects without running hooks', () => {
    let calls = 0; const object = { valueOf() { calls++; throw Error('PRIVATE'); }, toString() { calls++; throw Error('PRIVATE'); } };
    const proxy = new Proxy({}, { get() { calls++; throw Error('PRIVATE'); } });
    for (const bad of [0, -0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '20', null, object, proxy]) {
      const fake = createSeedBootstrapFake(bad, 0, 0); expect(fake.acquireEntry()).toMatchObject({ ok: false, reason: 'raw_limits' });
      expect(fake.inspect().budget).toEqual({ state: 'unavailable' });
    }
    for (const key of [1, 2]) for (const bad of [-0, -1, 0.5, Infinity, NaN, '0', object]) {
      const values: unknown[] = [20, 0, 0]; values[key] = bad;
      expect(createSeedBootstrapFake(...values as [unknown, unknown, unknown]).acquireEntry()).toMatchObject({ ok: false, reason: 'raw_limits' });
    }
    expect(createSeedBootstrapFake(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1).acquireEntry()).toMatchObject({ ok: false, reason: 'raw_overflow' });
    expect(createSeedBootstrapFake(1, 2, 0).acquireEntry()).toMatchObject({ ok: false, reason: 'raw_limits' });
    expect(createFixedBootstrapFake(proxy).acquireEntry()).toMatchObject({ ok: false, reason: 'raw_limits' }); expect(calls).toBe(0);
    const fake = createSeedBootstrapFake(20, 0, 0); expect(JSON.stringify(fake.reject(object))).not.toMatch(/PRIVATE|stack/); expect(calls).toBe(0);
  });
  it('freezes all detached views and never exports a fake budget, root, seed or runtime binding', () => {
    const fake = createSeedBootstrapFake(20, 10, 0), before = fake.inspect(); fake.acquireEntry(); const debit = fake.inspect();
    fake.buildEntry(); const built = fake.inspect(); fake.reject('raw_work'); const ended = fake.inspect();
    const walk = (v: unknown) => { if (v && typeof v === 'object') { expect(Object.isFrozen(v)).toBe(true); for (const x of Object.values(v)) walk(x); } };
    for (const v of [before, debit, built, ended]) walk(v);
    expect(before).toMatchObject({ entryDebits: 0, budget: { total: 10 } }); expect(debit.bootstrapUsage).toEqual({ state: 'unavailable' });
    expect(built).toMatchObject({ bootstrapUsage: { state: 'observed', executed: 1 } }); expect(ended.seed).toBe('not_acquired');
    expect(Object.isFrozen(fake)).toBe(true);
    const read = (name: string) => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
    const source = read('tests/review/fixtures/seed-bootstrap-fake.ts'); expect(source).not.toMatch(/^import /m);
    expect(source).not.toMatch(/\b(?:fetch|inspectCheckpoint|parseCheckpoint|saveAttempt|setTimeout|issueReceipt)\s*\(/);
    for (const name of ['raw-json-boundary', 'snapshot-value-core', 'value-admission-core', 'bridge-work-core']) expect(read('tests/review/fixtures/' + name + '.ts')).not.toContain('seed-bootstrap-fake');
    expect(JSON.parse(read('tsconfig.json')).exclude).toContain('tests'); expect(JSON.parse(read('package.json')).files).not.toContain('tests/');
  });
});

describe('K0/E review: returned results, boundary and fixed-state diagnostics', () => {
  const walk = (v: unknown) => { if (v && typeof v === 'object') { expect(Object.isFrozen(v)).toBe(true); for (const x of Object.values(v)) walk(x); } };
  it('freezes every returned result, including carriers and late refusals', () => {
    walk(createSeedBootstrapFake(14, 10, 0).acquireEntry());
    walk(createSeedBootstrapFake(0, 0, 0).acquireEntry());
    const failed = createFixedBootstrapFake('entry_build_failure'); walk(failed.acquireEntry()); walk(failed.buildEntry());
    const fake = createSeedBootstrapFake(20, 10, 0);
    walk(fake.acquireEntry()); walk(fake.buildEntry()); walk(fake.checkProfile()); walk(fake.close()); walk(fake.acquireEntry());
    const rejected = createSeedBootstrapFake(20, 10, 0); rejected.acquireEntry(); rejected.buildEntry(); walk(rejected.reject('raw_work'));
  });
  it('refuses E with raw_work, not an invalid base, when the used amount equals the cap', () => {
    const fake = createSeedBootstrapFake(10, 10, 0);
    expect(fake.inspect()).toMatchObject({ state: 'BaseEstablished', budget: { total: 10 } });
    expect(fake.acquireEntry()).toMatchObject({ ok: false, reason: 'raw_work', entry: 'not_acquired' });
  });
  it('keeps the carrier diagnostics visible when the base itself is invalid', () => {
    const fake = createSeedBootstrapFake(0, 0, 0);
    expect(fake.inspect().diagnostics).toEqual({ firstReason: 'raw_limits', snapshot: 'not_reported', cleanup: 'not_reported' });
  });
  it('does not report a snapshot fault when no entry owner exists', () => {
    const fake = createFixedBootstrapFake('snapshot_failure'); fake.acquireEntry();
    expect(fake.reject('raw_work')).toMatchObject({ ok: false, reason: 'raw_work', entry: 'acquired', bootstrapUsage: { state: 'unavailable' } });
    expect(fake.inspect().diagnostics).toEqual({ firstReason: 'raw_work', snapshot: 'not_failed', cleanup: 'simulated_released' });
  });
  it('ends a refused run in Rejected, not Retired', () => {
    const fake = createSeedBootstrapFake(20, 10, 0); fake.acquireEntry(); fake.reject('raw_work');
    expect(fake.inspect()).toMatchObject({ state: 'Rejected', cleanupAttempts: 1, creditRetires: 1 });
  });
});
