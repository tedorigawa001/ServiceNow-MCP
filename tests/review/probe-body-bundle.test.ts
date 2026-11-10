import { describe, expect, it } from 'vitest';
import { createProbeBodyBundleFake, createProbeBodyLiveFake } from './fixtures/snapshot-read-composition-fake.js';

// Independent semantic field list, never imported from the construction tables.
const fields = [['context', 'pin', 'progress', 'closure', 'diagnostic', 'retirement', 'terminal', 'unwind'],
  ['bundle', 'runSeal', 'kind', 'executable']];
const boundaries = ['before', 'attempt', 'issued', 'frozen', 'captured', 'checked', 'confirmed'];
const points = [...[12, 13].flatMap(n => boundaries.map(b => [n, b] as const)), [13, 'post_before'], [13, 'post_after']] as const;
function finite(value: unknown): void {
  const q = [value]; let size = 0;
  while (q.length) {
    const v = q.pop(); expect(++size).toBeLessThan(700);
    if (v === null || typeof v !== 'object') { expect(['number', 'boolean', 'string']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) { expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (k !== 'length') q.push(d.value); }
  }
}
describe('BC12/13 non-executable aggregate construction', () => {
  it('holds the same thirteen slots with frozen descriptors but writable Initial children', () => {
    const a = createProbeBodyBundleFake();
    expect(a.prepare()).toMatchObject({ model: 'wfb-body-bundle-draft-1', ok: false, disposition: 'bundle_held', first: 'none' });
    const s = a.inspect();
    expect(s).toMatchObject({ dataLimit: 13, state: 'held', phase: 'BC13', boundary: 'post_after', ready: false, rootReady: false,
      execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown', investigations: 'on_hold',
      bindAttemptUsed: false, borrowRetained: false, grantAttempts: 0, bodyStarts: 0, dutyUsed: false, terminalCommits: 0 });
    expect(s.slots.every(c => c.stage === 'confirmed' && c.sameReference && !c.rejectedRetained)).toBe(true);
    expect(s.live.every(c => c.initial && c.referencesFixed && c.progressWritable && c.sealed)).toBe(true);
    expect(s.aggregates).toEqual([{ index: 12, valid: true, frozen: true }, { index: 13, valid: true, frozen: true }]);
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('not_ready');
    const old = createProbeBodyLiveFake(); old.prepare(); expect(old.inspect().dataLimit).toBe(11);
  });
  it.each(fields.flatMap((row, i) => [...row, 'brand', 'extra', 'copy', 'getter', 'missing', 'prototype', 'unfrozen', 'non_enumerable']
    .map(field => [i + 12, field] as const)))('rejects malformed aggregate %i/%s and retains the original custody', (n, field) => {
    const a = createProbeBodyBundleFake(`s_bundle_mix_${n}_${field}`), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('binding_mismatch'); expect(s).toMatchObject({ state: 'failed', failurePhase: `BC${n}`, failureBoundary: 'captured', hookCalls: 0 });
    expect(s.slots[n - 1]).toMatchObject({ stage: 'provisional', issuedRetained: true, currentRetained: true,
      rejectedRetained: true, sameReference: field !== 'copy' });
    expect(s.aggregates[n - 12].valid).toBe(false); expect(s.aggregates[n - 12].frozen).toBe(field !== 'unfrozen');
    expect(s.live.every(c => c.initial && c.progressWritable)).toBe(true);
    expect(s.slots.slice(n).every(c => !c.attemptReserved && !c.issuedRetained)).toBe(true);
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r);
  });
  it.each(points)('holds the partial-generation prefix at %i/%s', (n, boundary) => {
    const a = createProbeBodyBundleFake(`s_fault_BC${n}_${boundary}`), r = a.prepare(), s = a.inspect();
    expect(r.first).toBe('construction_unconfirmed'); expect(s).toMatchObject({ state: 'failed', failurePhase: `BC${n}`, failureBoundary: boundary,
      ready: false, rootReady: false, bindAttemptUsed: false, borrowRetained: false, bodyStarts: 0, dutyUsed: false });
    const post = boundary.startsWith('post_'), reached = !['before', 'attempt'].includes(boundary), captured = ['captured', 'checked', 'confirmed'].includes(boundary) || post;
    s.slots.forEach((c, i) => {
      const prior = i < n - 1, target = i === n - 1;
      expect(c).toMatchObject({ stage: prior ? 'confirmed' : !target || boundary === 'before' ? 'not_started'
        : boundary === 'attempt' ? 'attempting' : boundary === 'confirmed' || post ? 'confirmed' : captured ? 'provisional' : 'issued',
      attemptReserved: prior || target && boundary !== 'before', callBoundaryReached: prior || target && reached,
      issuedRetained: prior || target && reached, currentRetained: prior || target && captured, rejectedRetained: false });
    });
    expect(a.prepare()).toBe(r); expect(a.close()).toBe(r); finite(s);
  });
  it.each([...fields[0].map(f => [12, f] as const), ...['bundle', 'runSeal'].map(f => [13, f] as const)])(
    'rejects a same-value child copy at %i/%s without changing the canonical live objects', (n, field) => {
      const a = createProbeBodyBundleFake(`s_bundle_mix_${n}_child_copy_${field}`), r = a.prepare(), s = a.inspect();
      expect(r.first).toBe('binding_mismatch'); expect(s).toMatchObject({ failurePhase: `BC${n}`, failureBoundary: 'captured' });
      expect(s.slots[n - 1]).toMatchObject({ issuedRetained: true, currentRetained: true, rejectedRetained: true, sameReference: true });
      expect(s.live.every(c => c.initial && c.progressWritable && c.referencesFixed)).toBe(true); finite(s);
    });
  it.each([12, 13].flatMap(n => ['producer', 'freeze'].map(kind => [n, kind] as const)))(
    'does not retry an uncertain %i/%s operation', (n, kind) => {
      const a = createProbeBodyBundleFake(`s_bundle_${kind}_throw_${n}`), r = a.prepare();
      expect(r.first).toBe('construction_unconfirmed'); expect(a.inspect().slots[n - 1]).toMatchObject({ stage: kind === 'producer' ? 'attempting' : 'issued',
        attemptReserved: true, callBoundaryReached: true, issuedRetained: kind === 'freeze', currentRetained: false }); expect(a.prepare()).toBe(r);
    });
  it.each(['close', 'reenter'])('preserves earlier reasons and live custody at every %s point', mode => {
    for (const [n, boundary] of points) {
      const a = createProbeBodyBundleFake(`s_${mode}_BC${n}_${boundary}`), r = a.prepare(), s = a.inspect();
      expect(r).toMatchObject({ first: mode === 'close' ? 'closed' : 'none', disposition: mode === 'close' ? 'closed' : 'bundle_held' });
      expect(s).toMatchObject({ rootReady: false, bodyStarts: 0, bindAttemptUsed: false, borrowRetained: false,
        reentry: mode === 'reenter' ? 'construction_in_progress' : 'none' });
      expect(s.live.every(c => c.initial && c.progressWritable)).toBe(true); finite(s);
    }
  });
  it('rejects hostile input without invoking hooks or gaining a registration/execution interface', () => {
    let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error('private'); }, ownKeys() { calls++; throw Error('private'); } });
    for (const xs of [[p], [() => calls++], ['unknown'], ['s_normal', p]]) {
      const a = createProbeBodyBundleFake(...xs); expect(a.prepare().first).toBe('input_rejected'); finite(a.inspect());
    }
    for (const key of ['prepare', 'check', 'checkLegacy', 'close', 'inspect'] as const) {
      const a = createProbeBodyBundleFake(); a.prepare(); finite(a[key](p)); expect(a.prepare().first).toBe('input_rejected');
    }
    const a = createProbeBodyBundleFake(); expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
    a.close(); expect(a.prepare()).toMatchObject({ first: 'none', disposition: 'closed' });
    const b = createProbeBodyBundleFake(); b.prepare(); const slots = b.inspect().slots, r = b.close();
    expect(b.prepare()).toBe(r); expect(b.inspect().slots).toEqual(slots); expect(calls).toBe(0); finite(b.inspect());
  });
});
