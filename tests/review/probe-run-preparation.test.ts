import { describe, expect, it } from 'vitest';
import { createProbeRunPreparationFake, createProbeFramePreparationFake, createCanonicalGateDraftFake } from './fixtures/snapshot-read-composition-fake.js';

function publicData(value: unknown, depth = 0): void {
  expect(depth).toBeLessThan(8);
  if (value === null || typeof value !== 'object') { expect(['boolean', 'string', 'number']).toContain(typeof value); return; }
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.getPrototypeOf(value)).toBe(Array.isArray(value) ? Array.prototype : Object.prototype);
  expect(Reflect.ownKeys(value).every(k => typeof k === 'string')).toBe(true);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  expect(Object.keys(descriptors).length).toBeLessThan(40);
  for (const [k, d] of Object.entries(descriptors)) {
    expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined();
    if (Array.isArray(value) && k === 'length') continue;
    publicData(d.value, depth + 1);
  }
}

describe('B-01 state types / prior RunLink and duty / fixed non-executable projection', () => {
  const closed = { authority: 'none', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled',
    implementation: 'unknown', investigations: 'on_hold', grantIssues: 0, bodyStarts: 0, exitRecords: 0,
    realWriterCalls: 0, journalSupply: 'not_connected', rootFinish: 'not_called' };
  it('prepares the same binding with all execution cells unused and exposes no token', () => {
    const a = createProbeRunPreparationFake(); publicData(a.inspect()); publicData(a.check());
    expect(a.prepare()).toMatchObject({ ok: true, first: 'none', execution: 'closed' });
    const s = a.inspect(); publicData(s);
    expect(Object.keys(s)).toEqual(['model', 'schema', 'authority', 'execution', 'formalIssuance', 'wholeRunAdmission', 'implementation',
      'investigations', 'first', 'construction', 'use', 'grant', 'body', 'exit', 'duty', 'start', 'grantIssues', 'bodyStarts', 'exitRecords', 'realWriterCalls', 'journalSupply', 'rootFinish']);
    expect(s).toMatchObject({ ...closed, first: 'none', construction: { ready: true, retained: 4, priorRetained: 37,
      stages: Array(4).fill('confirmed'), phase: 4, boundary: 'post', linkRetained: true, dutyRetained: true },
      use: { phase: 'unused', attemptUsed: false }, grant: { stage: 'empty', currentRetained: false, issuedRetained: false, rejectedRetained: false },
      body: { state: 'not_started', outcome: 'none' }, duty: { state: 'not_owed', attemptUsed: false, linkRetained: true },
      exit: { stage: 'empty', candidateRetained: false, exitAccepted: false }, start: { linkRetained: true, dutyRetained: true, bindAttempted: true,
        wrapperCalls: 0, generationBodyCalls: 0, frameExits: 0, retirementStarts: 0, retirementClaimUnused: true } });
    expect(Object.keys(s.grant)).toEqual(['stage', 'currentRetained', 'issuedRetained', 'rejectedRetained', 'unknownObligation', 'localRevocationConfirmed']);
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    for (const r of [a.check(), a.checkLegacy(), a.checkState()]) publicData(r);
    expect(a.check().disposition).toBe('blocked_frame_execution');
    expect(a.inspect()).toMatchObject({ ...closed, use: { phase: 'unused', attemptUsed: false }, duty: { state: 'not_owed' },
      start: { wrapperCalls: 3, generationBodyCalls: 0, frameExits: 0, retirementStarts: 0 } });
  });
  it.each(Array.from({ length: 4 }, (_, i) => i + 1).flatMap(n => ['before', 'attempt', 'after', 'done'].map(b => [n, b] as const)))(
    'retains independent RunLink construction prefix %i/%s', (n, boundary) => {
      const a = createProbeRunPreparationFake(`run_${boundary}_${n}`), r = a.prepare();
      expect(r.first).toBe('construction_unconfirmed'); publicData(r);
      const stages = Array.from({ length: 4 }, (_, i) => i < n - 1 ? 'confirmed' : i > n - 1 ? 'not_started'
        : boundary === 'before' ? 'not_started' : boundary === 'attempt' ? 'attempting' : boundary === 'after' ? 'provisional' : 'confirmed');
      expect(a.inspect()).toMatchObject({ ...closed, construction: { ready: false, priorRetained: 37, phase: n, boundary, stages,
        retained: n - 1 + Number(boundary === 'after' || boundary === 'done') }, start: { bindAttempted: false } });
      const s = a.inspect(); for (const again of [a.prepare(), a.check(), a.checkLegacy(), a.close()]) { expect(again).toBe(r); publicData(again); }
      expect(a.inspect()).toEqual(s); publicData(s);
    });
  it.each(['copy', 'brand', 'extra', 'origin', 'binding', 'cells', 'frame', 'entry', 'exit'])(
    'rejects link_%s before creating the duty', f => {
      const a = createProbeRunPreparationFake('link_' + f); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, construction: { phase: 2, boundary: 'check', retained: 2, dutyRetained: false }, start: { bindAttempted: false } });
      publicData(a.inspect());
    });
  it.each(['copy', 'brand', 'extra', 'link', 'state', 'attempt', 'phase', 'boundary'])(
    'rejects duty_%s before receiver binding', f => {
      const a = createProbeRunPreparationFake('duty_' + f); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, construction: { phase: 3, boundary: 'check', retained: 3 }, start: { bindAttempted: false } });
      publicData(a.inspect());
    });
  it.each(['copy', 'extra', 'link', 'duty', 'executable'])(
    'rejects seal_%s before private receiver capture', f => {
      const a = createProbeRunPreparationFake('seal_' + f); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, construction: { phase: 4, boundary: 'check', retained: 4 }, start: { bindAttempted: false } });
    });
  it.each(['start_run_link_copy', 'start_run_duty_copy'])(
    'checks isolated receiver identity %s', script => {
      const a = createProbeRunPreparationFake(script); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, construction: { ready: false }, start: { bindAttempted: true, linkRetained: true, dutyRetained: true } });
    });
  it.each(['run_check_2', 'run_check_3', 'run_check_4', 'run_post_4'])('holds %s without retrying', script => {
    const a = createProbeRunPreparationFake(script), r = a.prepare(); expect(r.first).toBe('construction_unconfirmed');
    expect(a.check()).toBe(r); expect(a.prepare()).toBe(r); publicData(a.inspect());
  });
  it.each([
    ['unused', true], ['entering', true], ['active', true], ['exiting', true], ['unsealed', true], ['unconfirmed', true],
    ['unused_spent', false], ['entering_unspent', false], ['active_empty', false], ['active_provisional', false],
    ['running_revoked', false], ['accepted', false], ['finished', false], ['duty_unspent', false], ['unsealed_active', false],
    ['empty_reference', false], ['outcome_mismatch', false], ['unknown_variant', false], ['before_use_body', false],
    ['exiting_empty', false], ['exiting_provisional_body', false],
  ] as const)('compares value-only shape_%s to an independent relation table', (name, valid) => {
    const a = createProbeRunPreparationFake('shape_' + name);
    expect(a.checkState()).toEqual({ model: 'wfb-probe-state-value-1', authority: 'none', kind: 'value_only', valid });
    a.prepare(); expect(a.inspect()).toMatchObject({ ...closed, use: { phase: 'unused', attemptUsed: false }, grant: { stage: 'empty' }, duty: { state: 'not_owed' } });
  });
  it('keeps duplicate binding, preparation reentry and close non-executing', () => {
    const a = createProbeRunPreparationFake('duplicate_run_binding'); expect(a.prepare().ok).toBe(true);
    expect(a.inspect().construction.bindRefusal).toBe('duplicate_binding'); expect(a.check().disposition).toBe('blocked_frame_execution');
    const b = createProbeRunPreparationFake('reenter_run_preparation'); expect(b.prepare().ok).toBe(true);
    expect(b.inspect().construction.reentry).toBe('construction_in_progress');
    const c = createProbeRunPreparationFake('close_during_run_preparation'); const r = c.prepare();
    expect(r.first).toBe('closed'); expect(c.check()).toBe(r); expect(c.inspect()).toMatchObject({ ...closed, construction: { ready: false, retained: 4 } });
    const d = createProbeRunPreparationFake(); d.close(); expect(d.prepare().disposition).toBe('closed');
    const e = createProbeRunPreparationFake(); e.prepare(); const er = e.close(); expect(e.check()).toBe(er);
    expect(e.inspect()).toMatchObject({ ...closed, construction: { retained: 4 }, duty: { state: 'not_owed' }, start: { retirementStarts: 0 } });
  });
  it('rejects arbitrary inputs and call arguments without hooks; keeps old assemblies unchanged', () => {
    const old = createProbeFramePreparationFake(); old.prepare(); const s = old.inspect();
    const gate = createCanonicalGateDraftFake(); gate.prepare(); const g = gate.inspect(); let hooks = 0;
    const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const args of [[p], ['normal', p], [() => hooks++], [old], ['run_before_5']]) {
      const a = createProbeRunPreparationFake(...args); expect(a.prepare().first).toBe('input_rejected'); publicData(a.inspect());
    }
    for (const method of ['prepare', 'check', 'checkLegacy', 'close', 'checkState'] as const) {
      const a = createProbeRunPreparationFake(); a.prepare(); publicData(a[method](p)); expect(a.inspect().first).toBe('input_rejected');
    }
    expect(hooks).toBe(0); expect(old.inspect()).toEqual(s); expect(gate.inspect()).toEqual(g);
    expect(Object.keys(createProbeRunPreparationFake())).toEqual(['prepare', 'check', 'checkLegacy', 'checkState', 'close', 'inspect']);
  });
});
