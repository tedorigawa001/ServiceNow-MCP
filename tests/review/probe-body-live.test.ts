import { describe, expect, it } from 'vitest';
import { createProbeBodyLiveFake, createProbeBodySeedFake } from './fixtures/snapshot-read-composition-fake.js';

// Independent strict field oracle; do not import the builder's schema or state table.
const fields = [
  ['pin', 'bodyCell', 'activationConfirmed', 'callReserved', 'entryObserved', 'returnCaptured', 'callPhase', 'outcome'],
  ['pin', 'progress', 'bodyEntryClosed', 'controlReturned', 'continuationState'],
  ['context', 'rootFailure', 'cellDiagnostic', 'probeFirst', 'exitFirst', 'deliveryFirst', 'failurePhase', 'failureBoundary', 'refusal'],
  ['pin', 'duty', 'control', 'kind', 'used', 'blocked', 'confirmed', 'target', 'blockedTarget', 'confirmedTarget'],
  ['pin', 'duty', 'progress', 'retirement', 'terminalAnchor', 'kind', 'prepared', 'committed', 'candidate', 'issued', 'accepted'],
  ['context', 'pin', 'progress', 'closure', 'diagnostic', 'retirement', 'terminal', 'state', 'routeUsed', 'inProgress', 'phase', 'boundary', 'fixedReply'],
];
const fixedCounts = [3, 3, 4, 4, 9, 8]; // Includes the private brand; deliberately independent.
const checkpoints = fields.flatMap((_, i) => ['before', 'attempt', 'issued',
  ...Array.from({ length: fixedCounts[i] }, (_, j) => `fix_${j}`), 'sealed', 'captured', 'checked', 'confirmed']
  .map(boundary => [i + 6, boundary] as const));
function finite(value: unknown): void {
  const q = [value]; let count = 0;
  while (q.length) {
    const v = q.pop(); expect(++count).toBeLessThan(650);
    if (typeof v !== 'object' || v === null) { expect(['number', 'boolean', 'string']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}
describe('B03 BC06..11 Initial live construction without bind or execution', () => {
  it('retains eleven canonical Initial slots and leaves bundle/draft and execution closed', () => {
    const a = createProbeBodyLiveFake();
    expect(a.prepare()).toMatchObject({ ok: false, disposition: 'live_held', first: 'none', model: 'wfb-body-live-initial-1' });
    const s = a.inspect();
    expect(s).toMatchObject({ state: 'held', ready: false, rootReady: false, bindAttemptUsed: false, borrowRetained: false,
      dataLimit: 11, phase: 'BC11', boundary: 'confirmed', sameOwnerBindings: true,
      execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold',
      grantAttempts: 0, bodyStarts: 0, dutyUsed: false, retirementAttempts: 0, terminalCommits: 0 });
    s.slots.forEach((c, i) => expect(c).toMatchObject({ stage: i < 11 ? 'confirmed' : 'not_started', issuedRetained: i < 11,
      currentRetained: i < 11, sameReference: i < 11, rejectedRetained: false }));
    expect(s.live).toHaveLength(6);
    expect(s.live.every(c => c.initial && c.referencesFixed && c.progressWritable && c.sealed)).toBe(true);
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('not_ready');
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
    const old = createProbeBodySeedFake(); old.prepare(); expect(old.inspect().dataLimit).toBe(5);
  });
  it.each(fields.flatMap((row, i) => [...row, 'brand', 'extra', 'copy', 'getter', 'missing', 'prototype', 'freeze', 'mutable_ref', 'unsealed']
    .map(field => [i + 6, field] as const)))('rejects a malformed Initial live slot %i/%s without losing custody', (n, field) => {
    const a = createProbeBodyLiveFake(`s_live_mix_${n}_${field}`), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('binding_mismatch'); expect(s).toMatchObject({ state: 'failed', failurePhase: `BC${String(n).padStart(2, '0')}`,
      failureBoundary: 'captured', rootReady: false, hookCalls: 0 });
    expect(s.slots[n - 1]).toMatchObject({ stage: 'provisional', issuedRetained: true, currentRetained: true, rejectedRetained: true,
      sameReference: field !== 'copy' });
    expect(s.slots.slice(n).every(c => c.stage === 'not_started' && !c.issuedRetained)).toBe(true);
    // The live projection reports the retained malformed current as not Initial, independent of slot stage.
    expect(s.live[n - 6]).toMatchObject({ initial: false, sealed: field !== 'unsealed' });
    expect(s.live.slice(0, n - 6).every(c => c.initial && c.sealed)).toBe(true);
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it.each(checkpoints)('retains the independent partial-generation prefix %i/%s', (n, boundary) => {
    const a = createProbeBodyLiveFake(`s_fault_BC${String(n).padStart(2, '0')}_${boundary}`), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('construction_unconfirmed');
    expect(s).toMatchObject({ state: 'failed', failurePhase: `BC${String(n).padStart(2, '0')}`, failureBoundary: boundary,
      rootReady: false, dataLimit: 11, bodyStarts: 0, dutyUsed: false });
    const reached = !['before', 'attempt'].includes(boundary), captured = ['captured', 'checked', 'confirmed'].includes(boundary);
    s.slots.forEach((c, i) => {
      const prior = i < n - 1, target = i === n - 1;
      expect(c).toMatchObject({ stage: prior ? 'confirmed' : !target || boundary === 'before' ? 'not_started'
        : boundary === 'attempt' ? 'attempting' : boundary === 'confirmed' ? 'confirmed' : captured ? 'provisional' : 'issued',
      attemptReserved: prior || target && boundary !== 'before', callBoundaryReached: prior || target && reached,
      issuedRetained: prior || target && reached, currentRetained: prior || target && captured, rejectedRetained: false });
    });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); finite(s);
  });
  it.each([6, 7, 8, 9, 10, 11])('retains a call-boundary uncertainty without another producer %i', n => {
    const a = createProbeBodyLiveFake(`s_live_producer_throw_${n}`), r = a.prepare();
    expect(r.first).toBe('construction_unconfirmed'); expect(a.inspect().slots[n - 1]).toMatchObject({ stage: 'attempting',
      attemptReserved: true, callBoundaryReached: true, issuedRetained: false, currentRetained: false }); expect(a.prepare()).toBe(r);
  });
  it.each(['close', 'reenter'])('keeps earlier ownership and diagnostics at every %s boundary', mode => {
    for (const [n, boundary] of checkpoints) {
      const a = createProbeBodyLiveFake(`s_${mode}_BC${String(n).padStart(2, '0')}_${boundary}`), r = a.prepare();
      expect(r).toMatchObject({ first: mode === 'close' ? 'closed' : 'none', disposition: mode === 'close' ? 'closed' : 'live_held' });
      expect(a.inspect()).toMatchObject({ rootReady: false, bodyStarts: 0, bindAttemptUsed: false, borrowRetained: false,
        reentry: mode === 'reenter' ? 'construction_in_progress' : 'none' }); finite(a.inspect());
    }
  });
  it('keeps every entry closed and never evaluates hostile input hooks', () => {
    let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
    for (const xs of [[p], [() => calls++], ['unknown'], ['s_normal', p]]) {
      const a = createProbeBodyLiveFake(...xs); expect(a.prepare().first).toBe('input_rejected'); finite(a.inspect());
    }
    for (const key of ['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const) {
      const a = createProbeBodyLiveFake(); a.prepare(); finite(a[key](p)); expect(a.prepare().first).toBe('input_rejected');
    }
    const a = createProbeBodyLiveFake(); a.close(); expect(a.prepare()).toMatchObject({ disposition: 'closed', first: 'none' });
    const b = createProbeBodyLiveFake(); b.prepare(); const slots = b.inspect().slots, r = b.close();
    expect(b.prepare()).toBe(r); expect(b.inspect().slots).toEqual(slots); expect(calls).toBe(0);
    finite(b.inspect());
  });
});
