import { describe, expect, it } from 'vitest';
import * as module from './fixtures/journal-supply-shell-fake.js';

describe('independent prior journal supply shell', () => {
  const closed = { issuerConnection: 'closed', finalAnchor: 'not_issued', supplyConsumptions: 0, admissionConsumptions: 0,
    packetObjects: 0, cellObjects: 0, sourceGenerations: 0, journalReads: 0, fieldClears: 0, proofIssuance: 'closed', rootFinish: 'not_called' };
  it('binds a non-executable target only after all prior holders; supply stays blocked', () => {
    const a = module.createJournalSupplyShellFake(); expect(a.check().disposition).toBe('not_ready');
    expect(a.prepare()).toMatchObject({ ok: true, disposition: 'bound_only' });
    expect(a.inspect()).toMatchObject({ ...closed, state: 'bound', retained: 34, cellHolders: 25, bindings: 1, supplyClaim: 'unused' });
    expect(a.inspect().stages).toEqual(Array(34).fill('confirmed'));
    // Independent C→F table (not imported from implementation).
    expect(a.inspect().layout).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27]);
    const before = a.inspect(); expect(a.check()).toMatchObject({ ok: false, disposition: 'blocked_supply' }); expect(a.inspect()).toEqual(before);
  });
  it.each(Array.from({ length: 34 }, (_, i) => i + 1).flatMap(n => ['before', 'attempt', 'after', 'done'].map(b => [n, b] as const)))(
    'retains independent allocation prefix %i/%s without a second construction', (n, boundary) => {
      const a = module.createJournalSupplyShellFake(`${boundary}_${n}`), r = a.prepare();
      expect(r).toMatchObject({ ok: false, first: 'construction_unconfirmed' });
      const caught = boundary === 'after' || boundary === 'done';
      const retained = n - 1 + Number(caught);
      const stages = Array.from({ length: 34 }, (_, i) => i < n - 1 ? 'confirmed' : i > n - 1 ? 'not_started'
        : boundary === 'before' ? 'not_started' : boundary === 'attempt' ? 'attempting' : boundary === 'after' ? 'provisional' : 'confirmed');
      expect(a.inspect()).toMatchObject({ ...closed, state: 'rejected', phase: n, boundary, retained, stages,
        cellHolders: Math.max(0, Math.min(25, retained - 4)), bindings: 0, frame: 'inactive' });
      const before = a.inspect(); expect(a.prepare()).toBe(r); expect(a.check()).toBe(r); expect(a.close()).toBe(r); expect(a.inspect()).toEqual(before);
    });
  it.each(['descriptor_copy', 'descriptor_extra', 'descriptor_variant', 'foreign_start', 'scope_copy',
    'owner', 'construction', 'retention', 'sourceSlot', 'claim', 'epoch', 'packet'])(
    'rejects %s before binding/claim use and retains both candidate and issued slots', script => {
      const a = module.createJournalSupplyShellFake(script); const r = a.prepare();
      expect(r).toMatchObject({ ok: false, first: 'binding_mismatch' });
      expect(a.inspect()).toMatchObject({ ...closed, bindings: 0, retained: 34, boundary: 'binding', supplyClaim: 'unused' });
      expect(a.check()).toBe(r);
    });
  it('rejects repeated preparation without dropping retained slots or consuming claims', () => {
    const a = module.createJournalSupplyShellFake(); a.prepare();
    const r = a.prepare(); expect(r).toMatchObject({ first: 'duplicate_preparation' });
    expect(a.close()).toBe(r); expect(a.inspect()).toMatchObject({ ...closed, bindings: 1, retained: 34 });
  });
  it('does not start a second construction on synchronous reentry', () => {
    const a = module.createJournalSupplyShellFake('reenter'); a.prepare();
    expect(a.inspect()).toMatchObject({ ...closed, bindings: 1, retained: 34, reentry: 'construction_in_progress' });
  });
  it('defers in-frame close, retains prior holders and does not create a synthetic start', () => {
    const a = module.createJournalSupplyShellFake('close_in_frame'); const r = a.prepare();
    expect(r.first).toBe('closed'); expect(a.inspect()).toMatchObject({ ...closed, retained: 30, bindings: 0,
      closeRequested: true, frame: 'inactive', supplyClaim: 'not_created' });
    expect(a.close()).toBe(r); expect(a.prepare()).toBe(r);
  });
  it('holds every captured reference on close and does not claim discard/cleanup', () => {
    const a = module.createJournalSupplyShellFake(); a.prepare(); const r = a.close();
    expect(a.check()).toBe(r); expect(a.prepare()).toBe(r);
    expect(a.inspect()).toMatchObject({ ...closed, retained: 34, bindings: 1, first: 'closed' });
  });
  it('rejects arguments without input hooks and exposes no adoption/consumer API', () => {
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; return []; } });
    for (const args of [[p], ['normal', p], ['before_35'], ['attempt_0'], ['unknown'], [() => hooks++]]) {
      const a = module.createJournalSupplyShellFake(...args); expect(a.prepare().first).toBe('input_rejected');
      expect(a.inspect()).toMatchObject({ ...closed, retained: 0 });
    }
    for (const method of ['prepare', 'check', 'close'] as const) {
      const a = module.createJournalSupplyShellFake(); a[method](p); expect(a.prepare().first).toBe('input_rejected');
    }
    expect(hooks).toBe(0); expect(Object.keys(module)).toEqual(['createJournalSupplyShellFake']);
    expect(Object.keys(module.createJournalSupplyShellFake())).toEqual(['prepare', 'check', 'close', 'inspect']);
  });
});
