import { describe, expect, it } from 'vitest';
import * as compatibility from './fixtures/read-hash-fake.js';
import * as shared from './fixtures/shared-read-hash-kernel-fake.js';
import { createSnapshotReadStartFake } from './fixtures/snapshot-read-start-fake.js';

describe('mechanical B kernel extraction, no C execution entry', () => {
  it('exports exactly the same fixed diagnostic factory through the compatibility path', () => {
    expect(Object.keys(compatibility)).toEqual(['createReadHashFake']);
    expect(Object.keys(shared)).toEqual(['createReadHashFake']);
    expect(compatibility.createReadHashFake).toBe(shared.createReadHashFake);
    expect(Object.keys(compatibility.createReadHashFake())).toEqual(['step', 'run', 'finish', 'inspect', 'cancel', 'advanceTo']);
  });
  it('retains fixed B success and shared-attempt diagnostics through both import paths', () => {
    for (const scenario of ['normal', 'one_byte', 'interrupt_always', 'hash_partial_throw', 'digest_mismatch', 'close_failure']) {
      expect(compatibility.createReadHashFake(scenario).run()).toEqual(shared.createReadHashFake(scenario).run());
    }
    expect(shared.createReadHashFake().run()).toMatchObject({ model: 'wfb-read-hash-fake-B-1',
      firstReason: 'none', counts: { received: 8, hashed: 8, accepted: 3, guards: 54 } });
  });
  it('keeps C prepared non-executable and rejects C diagnostics as a B supply', () => {
    const c = createSnapshotReadStartFake(); c.begin(); c.prepare();
    expect(c.inspect()).toMatchObject({ readState: 'prepared', readKernel: 'not_connected', actualBudget: 'not_connected',
      counts: { open: 0, read: 0, hash: 0, cleanup: 0 } });
    for (const input of [c, c.inspect(), c.finish(), 'C', 'canonical', 'prepared']) {
      expect(shared.createReadHashFake(input).run()).toMatchObject({ firstReason: 'binding', counts: { open: 0, read: 0, init: 0 } });
    }
  });
  it('does not add arbitrary constructor, source, reader or callback adoption at the new path', () => {
    let hooks = 0; const input = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const args of [[input], ['normal', input], [() => { hooks++; }], [undefined]]) {
      expect(shared.createReadHashFake(...args).run()).toMatchObject({ firstReason: 'binding', counts: { open: 0 } });
    }
    expect(hooks).toBe(0);
  });
  it('keeps closed authority and terminal immutability on the extracted implementation', () => {
    const b = shared.createReadHashFake(); const end = b.run(); b.step(); b.cancel(); b.advanceTo(-1);
    expect(b.finish()).toBe(end);
    expect(end).toMatchObject({ authority: 'none', ready: false, formalIssuance: 'closed', wholeRunAdmission: 'disabled',
      snapshotConnection: 'not_connected', rowAggregation: 'not_connected', coreInvocation: 'not_called',
      runtimeCoverage: 'unknown', nativeCost: 'unknown', entryRequirement: 'unknown', seedRequirement: 'unknown' });
  });
});
