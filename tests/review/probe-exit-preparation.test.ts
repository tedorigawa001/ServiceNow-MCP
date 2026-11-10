import { describe, expect, it } from 'vitest';
import { createProbeExitPreparationFake, createProbeGrantCaptureFake, createProbeRunPreparationFake } from './fixtures/snapshot-read-composition-fake.js';

function fixedData(value: unknown): void {
  const pending = [value]; let count = 0;
  while (pending.length) {
    const v = pending.pop(); expect(++count).toBeLessThan(260);
    if (!v || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const key of Reflect.ownKeys(v)) {
      expect(typeof key).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, key)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined();
      if (Array.isArray(v) && key === 'length') continue; pending.push(d.value);
    }
  }
}

describe('B03-A same-duty prior exit preparation, with every execution boundary closed', () => {
  const closed = { authority: 'none', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown',
    investigations: 'on_hold', enterUsed: false, grantIssues: 0, exitAttempts: 0, retirementAttempts: 0, terminalCommits: 0, bodyStarts: 0,
    exitRecords: 0, journalSupply: 'not_connected', rootFinish: 'not_called',
    duty: { state: 'not_owed', attemptUsed: false, phase: 'none', boundary: 'none' },
    knowledge: { kind: 'not_called', callStarted: false, issuerRetained: false, receiverRetained: false },
    retirement: { attemptUsed: false, blocked: false }, body: { started: false, returned: false },
    start: { generationBodyCalls: 0, frameExits: 0, retirementStarts: 0, retirementClaimUnused: true } };
  const points = [1, 2, 3, 4, 5].flatMap(n => ['before', 'attempt', 'after', 'done', 'check', ...(n === 5 ? ['bind', 'post'] : [])].map(b => [n, b] as const));
  const slots = [
    ['copy', 'brand', 'extra', 'link', 'duty', 'binding', 'cells', 'start', 'state', 'captureReturned'],
    ['copy', 'extra', 'duty', 'control', 'kind', 'used', 'blocked', 'target'],
    ['copy', 'extra', 'duty', 'control', 'kind', 'started', 'returned'],
    ['copy', 'extra', 'duty', 'control', 'absence', 'kind', 'candidate', 'issued', 'accepted'],
    ['copy', 'brand', 'extra', 'link', 'duty', 'start', 'control', 'retirement', 'absence', 'terminal'],
  ];
  it('reports absent slots as not_created before preparation, never as a positive or unconfirmed state', () => {
    const s = createProbeExitPreparationFake().inspect(); fixedData(s);
    expect(s).toMatchObject({ duty: { state: 'not_created', phase: 'not_created', boundary: 'not_created', linkRetained: false },
      knowledge: { kind: 'not_created', callStarted: false }, control: { state: 'not_created' }, retirement: { kind: 'not_created' },
      body: { kind: 'not_created' }, terminal: { kind: 'not_created' } });
  });
  it('binds all five prior slots to the existing same start and unspent duty, without entering', () => {
    const a = createProbeExitPreparationFake(); fixedData(a.inspect()); expect(a.check().disposition).toBe('not_ready');
    expect(a.prepare()).toMatchObject({ ok: true, model: 'wfb-probe-exit-preparation-1', first: 'none', execution: 'closed' });
    const s = a.inspect(); fixedData(s);
    expect(s).toMatchObject({ ...closed, preparation: { ready: true, phase: 5, boundary: 'post', first: 'none', retained: 5,
      stages: Array(5).fill('confirmed'), issuedRetained: Array(5).fill(true) },
      binding: { receiverAttempted: true, receiverRetained: true, sameDuty: true, controlRetained: true, bundleRetained: true },
      control: { state: 'idle', captureReturned: false }, retirement: { kind: 'not_attempted', targetRetained: false },
      body: { kind: 'unobserved' }, terminal: { kind: 'none', candidateRetained: false, issuedRetained: false, acceptedRetained: false, exitAccepted: false } });
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('blocked_frame_execution');
    expect(a.inspect()).toMatchObject({ ...closed, start: { wrapperCalls: 2 } });
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'checkAxes', 'close', 'inspect']);
    expect(Object.keys(s)).toEqual(['model', 'schema', 'authority', 'execution', 'formalIssuance', 'wholeRunAdmission', 'implementation',
      'investigations', 'first', 'preparation', 'binding', 'duty', 'control', 'knowledge', 'retirement', 'body', 'terminal', 'start',
      'enterUsed', 'grantIssues', 'exitAttempts', 'retirementAttempts', 'terminalCommits', 'bodyStarts', 'exitRecords', 'journalSupply', 'rootFinish']);
  });
  it.each(points.flatMap(([n, b]) => ['fault', 'stop'].map(kind => [n, b, kind] as const)))(
    'retains the independent prefix at %i/%s/%s', (n, boundary, kind) => {
      const a = createProbeExitPreparationFake(`exit_${kind === 'stop' ? 'stop_' : ''}${boundary}_${n}`), r = a.prepare();
      const minted = !['before', 'attempt'].includes(boundary);
      const stage = boundary === 'before' ? 'not_started' : boundary === 'attempt' ? 'attempting' : boundary === 'after' ? 'provisional' : 'confirmed';
      const stages = Array.from({ length: 5 }, (_, i) => i < n - 1 ? 'confirmed' : i > n - 1 ? 'not_started' : stage);
      expect(r.first).toBe(kind === 'stop' ? 'closed' : 'construction_unconfirmed');
      const s = a.inspect(); expect(s).toMatchObject({ ...closed, preparation: { ready: false, phase: n, boundary, stages,
        retained: n - 1 + Number(minted), issuedRetained: Array.from({ length: 5 }, (_, i) => i < n - 1 || i === n - 1 && minted) },
        binding: { receiverAttempted: n === 5 && boundary === 'post', receiverRetained: n === 5 && boundary === 'post' } });
      for (const again of [a.prepare(), a.check(), a.checkLegacy(), a.close()]) { expect(again).toBe(r); fixedData(again); }
      expect(a.inspect()).toEqual(s); fixedData(s);
    });
  it.each(points)('refuses construction reentry at %i/%s without new slots', (n, boundary) => {
    const a = createProbeExitPreparationFake(`exit_reenter_${boundary}_${n}`); expect(a.prepare().ok).toBe(true);
    expect(a.inspect()).toMatchObject({ ...closed, preparation: { ready: true, retained: 5, reentry: 'construction_in_progress' } });
  });
  it.each(slots.flatMap((fs, i) => fs.map(f => [i + 1, f] as const)))(
    'refuses private slot %i/%s before any following slot', (n, field) => {
      const a = createProbeExitPreparationFake(`exit_slot_${n}_${field}`), r = a.prepare(); expect(r.first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, preparation: { phase: n, boundary: 'check', retained: n, ready: false },
        retirement: { attemptUsed: n === 2 && field === 'used', blocked: n === 2 && field === 'blocked' },
        body: { started: n === 3 && field === 'started', returned: n === 3 && field === 'returned' },
        binding: { receiverAttempted: false } }); fixedData(a.inspect()); expect(a.prepare()).toBe(r);
    });
  it('retains receiver rejection and refuses duplicate private binding without changing same-duty custody', () => {
    const a = createProbeExitPreparationFake('exit_receiver_copy'), r = a.prepare(); expect(r.first).toBe('binding_mismatch');
    const s = a.inspect(); expect(s).toMatchObject({ ...closed, preparation: { retained: 5, ready: false },
      binding: { receiverAttempted: true, receiverRetained: true, sameDuty: true } }); expect(a.close()).toBe(r); expect(a.inspect()).toEqual(s);
    const b = createProbeExitPreparationFake('exit_duplicate_binding'); expect(b.prepare().ok).toBe(true);
    expect(b.inspect()).toMatchObject({ ...closed, preparation: { ready: true, bindRefusal: 'duplicate_binding' }, binding: { sameDuty: true } });
  });
  const axes = [
    ['idle', true], ['known', true], ['known_rejected', true], ['unknown', true], ['retirement_unknown', true], ['retired', true],
    ['held_empty', true], ['held_known', true], ['held_body', true],
    ['phase', false], ['boundary', false], ['phase_pair', false], ['accepted', false], ['knowledge', false], ['not_called_started', false],
    ['unknown_issuer', false], ['receiver_without_issuer', false], ['canonical_without_receiver', false], ['retirement', false],
    ['unused_retirement_used', false], ['unused_retirement_blocked', false], ['unused_retirement_target', false], ['confirmed_unspent', false],
    ['confirmed_unblocked', false], ['confirmed_targetless', false], ['confirmed_uncanonical', false], ['body', false], ['unobserved_started', false], ['unobserved_returned', false],
    ['unobserved_outcome', false], ['completed_none', false], ['completed_unreturned', false], ['terminal', false], ['duty', false],
    ['duty_unowed_spent', false], ['duty_settling_unspent', false], ['held_wrong_body', false], ['held_wrong_duty', false],
    ['not_required_used', false], ['not_required_target', false], ['not_required_known', false], ['not_started_started', false],
    ['not_started_unreturned', false], ['not_started_outcome', false], ['completed_unstarted', false], ['outcome', false],
    ['settled_without_terminal', false], ['unconfirmed_wrong_duty', false], ['held_unretired', false], ['held_body_unretired', false],
  ] as const;
  it.each(axes)('compares value-only %s to an independent three-axis table; never adopts it', (shape, valid) => {
    const a = createProbeExitPreparationFake('axis_' + shape);
    expect(a.checkAxes()).toEqual({ model: 'wfb-probe-exit-axes-value-1', kind: 'value_only', authority: 'none', valid });
    expect(a.prepare().ok).toBe(true); const s = a.inspect(); a.checkAxes(); expect(a.inspect()).toEqual(s);
    expect(s).toMatchObject({ ...closed, retirement: { kind: 'not_attempted' }, body: { kind: 'unobserved' }, terminal: { kind: 'none' } });
  });
  it.each(['guard', 'history', 'retire', 'record', 'project'].flatMap(p => ['before', 'after'].map(b => [p, b] as const)))(
    'accepts the finite %s/%s value without changing the live duty phase', (phase, boundary) => {
      const a = createProbeExitPreparationFake(`axis_phase_${phase}_${boundary}`); expect(a.checkAxes().valid).toBe(true); a.prepare();
      expect(a.inspect()).toMatchObject({ ...closed, duty: { phase: 'none', boundary: 'none' } });
    });
  it('closes and rejects all external artifacts without a hook or prior-root change', () => {
    const old = createProbeGrantCaptureFake(); old.prepare(); old.enter(); const before = old.inspect();
    const run = createProbeRunPreparationFake(); run.prepare(); const previous = run.inspect();
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('private'); }, ownKeys() { hooks++; throw Error('private'); } });
    for (const args of [[p], ['normal', p], [() => hooks++], ['exit_after_6']]) {
      const a = createProbeExitPreparationFake(...args); expect(a.prepare().first).toBe('input_rejected'); fixedData(a.inspect());
    }
    for (const key of ['prepare', 'check', 'checkLegacy', 'checkAxes', 'close', 'inspect'] as const) {
      const a = createProbeExitPreparationFake(); a.prepare(); fixedData(a[key](p)); expect(a.inspect().first).toBe('input_rejected');
    }
    const a = createProbeExitPreparationFake(); const r = a.close(); expect(a.prepare()).toMatchObject({ first: 'none', disposition: 'closed' }); fixedData(r);
    const b = createProbeExitPreparationFake(); b.prepare(); const br = b.close(); expect(b.check()).toBe(br);
    expect(b.inspect()).toMatchObject({ ...closed, preparation: { retained: 5 }, binding: { sameDuty: true }, control: { state: 'idle' } });
    expect(hooks).toBe(0); expect(old.inspect()).toEqual(before); expect(run.inspect()).toEqual(previous);
  });
});
