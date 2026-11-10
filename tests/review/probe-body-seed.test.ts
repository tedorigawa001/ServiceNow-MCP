import { describe, expect, it } from 'vitest';
import { createProbeBodySeedFake } from './fixtures/snapshot-read-composition-fake.js';

function fixed(value: unknown): void {
  const q = [value]; let count = 0;
  while (q.length) {
    const v = q.pop(); expect(++count).toBeLessThan(500);
    if (v === null || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const key of Reflect.ownKeys(v)) {
      expect(typeof key).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, key)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (key !== 'length') q.push(d.value);
    }
  }
}
const closed = { authority: 'none', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown',
  investigations: 'on_hold', ready: false, rootReady: false, bindAttemptUsed: false, borrowRetained: false,
  grantAttempts: 0, grantIssues: 0, enterUsed: false, dutyUsed: false, bodyStarts: 0, retirementAttempts: 0, terminalCommits: 0,
  journalSupply: 'not_connected', rootFinish: 'not_called', hookCalls: 0 };
const boot = Array.from({ length: 15 }, (_, i) => `BS${String(i).padStart(2, '0')}`);
const bootBounds = ['before', 'attempt', 'retained', 'done'];
const dataBounds = ['before', 'attempt', 'issued', 'captured', 'checked', 'confirmed'];
// Independent field oracle: deliberately not imported from the builder or its field tables.
const fields = [
  ['seed', 'binding', 'cells', 'link', 'duty', 'control', 'start', 'bindingOwner', 'cellOwner', 'scope', 'pin', 'epoch', 'packet', 'frame', 'entry', 'exit', 'runSeal', 'exitBundle'],
  ['context', 'kind'], ['context', 'bodyOrigin', 'kind'], ['context', 'bodyOrigin', 'kind'],
  ['context', 'bodyOrigin', 'throwSentinel', 'cancelSentinel', 'grantSlot', 'kind', 'executable'],
];
describe('B03 body seed: prior shell/carriers and BC01..05 only', () => {
  it('holds five canonical values without binding or ready and rejects a second preparation', () => {
    const a = createProbeBodySeedFake(); expect(a.inspect()).toMatchObject({ ...closed, state: 'not_created', shellRetained: false, arrayRetained: false });
    fixed(a.inspect()); expect(a.prepare()).toMatchObject({ ok: false, disposition: 'seed_held', first: 'none' });
    const s = a.inspect(); expect(s).toMatchObject({ ...closed, state: 'held', shellRetained: true, arrayRetained: true,
      phase: 'BC05', boundary: 'confirmed', sameOwnerBindings: true, bindStage: 'not_attempted' });
    expect(s.slots).toHaveLength(13);
    s.slots.forEach((c, i) => expect(c).toMatchObject({ index: i + 1, carrierRetained: true, stage: i < 5 ? 'confirmed' : 'not_started',
      attemptReserved: i < 5, callBoundaryReached: i < 5, issuedRetained: i < 5, currentRetained: i < 5, rejectedRetained: false, sameReference: i < 5 }));
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('not_ready');
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']); fixed(s);
  });
  it.each(boot.flatMap((phase, index) => bootBounds.map((boundary, b) => [phase, index, boundary, b] as const)))(
    'retains independent bootstrap prefix %s/%i/%s', (phase, index, boundary, b) => {
      const a = createProbeBodySeedFake(`s_fault_${phase}_${boundary}`), r = a.prepare();
      expect(r.first).toBe('construction_unconfirmed'); const s = a.inspect(), captured = b >= 2;
      expect(s).toMatchObject({ ...closed, phase, boundary, failurePhase: phase, failureBoundary: boundary,
        shellRetained: index > 0 || captured, arrayRetained: index > 1 || index === 1 && captured });
      const carriers = index < 2 ? 0 : index - 2 + Number(captured);
      s.slots.forEach((c, i) => expect(c).toMatchObject({ carrierRetained: i < carriers,
        stage: i < carriers ? 'not_started' : 'not_created', issuedRetained: false, currentRetained: false }));
      expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); fixed(s);
    });
  it.each([1, 2, 3, 4, 5].flatMap(n => dataBounds.map((boundary, b) => [n, boundary, b] as const)))(
    'retains issued/current/confirmed prefix %i/%s', (n, boundary, b) => {
      const phase = `BC${String(n).padStart(2, '0')}`, a = createProbeBodySeedFake(`s_fault_${phase}_${boundary}`), r = a.prepare();
      expect(r.first).toBe('construction_unconfirmed'); const s = a.inspect();
      expect(s).toMatchObject({ ...closed, state: 'failed', phase, boundary, failurePhase: phase, failureBoundary: boundary });
      s.slots.forEach((c, i) => {
        const target = i === n - 1, before = i < n - 1;
        expect(c).toMatchObject({ carrierRetained: true, stage: before ? 'confirmed' : target ? ['not_started', 'attempting', 'issued', 'provisional', 'provisional', 'confirmed'][b] : 'not_started',
          attemptReserved: before || target && b >= 1, callBoundaryReached: before || target && b >= 2,
          issuedRetained: before || target && b >= 2, currentRetained: before || target && b >= 3, rejectedRetained: false });
      }); expect(a.prepare()).toBe(r); fixed(s);
    });
  it.each([1, 2, 3, 4, 5])('keeps unresolved constructor custody %i without retry', n => {
    const a = createProbeBodySeedFake(`s_producer_throw_${n}`), r = a.prepare(); expect(r.first).toBe('construction_unconfirmed');
    expect(a.inspect().slots[n - 1]).toMatchObject({ stage: 'attempting', attemptReserved: true, callBoundaryReached: true,
      issuedRetained: false, currentRetained: false }); expect(a.prepare()).toBe(r); expect(a.inspect()).toMatchObject(closed);
  });
  it.each(fields.flatMap((xs, i) => [...xs, 'copy', 'brand', 'extra', 'getter'].map(f => [i + 1, f] as const)))(
    'refuses owned malformed value / same-value copy %i/%s', (n, field) => {
      const a = createProbeBodySeedFake(`s_mix_${n}_${field}`), r = a.prepare(); expect(r.first).toBe('binding_mismatch');
      const s = a.inspect(); expect(s).toMatchObject({ ...closed, state: 'failed', failurePhase: `BC${String(n).padStart(2, '0')}`, failureBoundary: 'captured' });
      expect(s.slots[n - 1]).toMatchObject({ stage: 'provisional', issuedRetained: true, currentRetained: true, rejectedRetained: true, sameReference: field !== 'copy' });
      expect(s.slots.slice(n).every(c => c.stage === 'not_started')).toBe(true); expect(a.prepare()).toBe(r); fixed(s);
    });
  it.each(['before', 'after'])('keeps BC00 rejection %s data-free', boundary => {
    const a = createProbeBodySeedFake(`s_fault_BC00_${boundary}`); a.prepare(); expect(a.inspect()).toMatchObject(closed);
    expect(a.inspect().slots.every(c => c.carrierRetained && !c.attemptReserved && !c.issuedRetained)).toBe(true);
  });
  it.each(['close', 'reenter'])('handles every construction boundary with fixed %s', mode => {
    const points = [...boot.flatMap(p => bootBounds.map(b => `${p}_${b}`)), 'BC00_before', 'BC00_after',
      ...[1, 2, 3, 4, 5].flatMap(n => dataBounds.map(b => `BC${String(n).padStart(2, '0')}_${b}`))];
    for (const point of points) {
      const a = createProbeBodySeedFake(`s_${mode}_${point}`); const r = a.prepare();
      expect(r).toMatchObject({ first: mode === 'close' ? 'closed' : 'none', disposition: mode === 'close' ? 'closed' : 'seed_held' });
      expect(a.inspect()).toMatchObject({ ...closed, reentry: mode === 'reenter' ? 'construction_in_progress' : 'none' }); fixed(a.inspect());
    }
  });
  it('rejects hostile inputs without hooks and closes without running legacy/start code', () => {
    let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
    for (const xs of [[p], ['s_normal', p], [() => calls++], ['unknown']]) {
      const a = createProbeBodySeedFake(...xs); expect(a.prepare().first).toBe('input_rejected'); fixed(a.inspect());
    }
    for (const key of ['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const) {
      const a = createProbeBodySeedFake(); a.prepare(); fixed(a[key](p)); expect(a.prepare().first).toBe('input_rejected');
    }
    const a = createProbeBodySeedFake(); a.close(); expect(a.prepare().disposition).toBe('closed'); expect(a.inspect()).toMatchObject(closed);
    const b = createProbeBodySeedFake(); b.prepare(); const s = b.inspect().slots; const r = b.close();
    expect(b.prepare()).toBe(r); expect(b.inspect().slots).toEqual(s); expect(calls).toBe(0);
  });
});
