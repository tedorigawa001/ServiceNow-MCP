import { describe, expect, it } from 'vitest';
import { createProbeExitGuardFake, createProbeExitPreparationFake, createProbeGrantCaptureFake } from './fixtures/snapshot-read-composition-fake.js';

function fixedData(value: unknown): void {
  const pending = [value]; let count = 0;
  while (pending.length) {
    const v = pending.pop(); expect(++count).toBeLessThan(400);
    if (!v || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) {
      expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (Array.isArray(v) && k === 'length') continue; pending.push(d.value);
    }
  }
}

describe('B03-B stable identity / private history / same-duty one-shot settling, no retirement', () => {
  const closed = { authority: 'none', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown',
    investigations: 'on_hold', retirementAttempts: 0, terminalCommits: 0, bodyStarts: 0, exitRecords: 0,
    anchor: { retirement: { kind: 'not_attempted', attemptUsed: false, blocked: false, targetRetained: false },
      body: { kind: 'unobserved', started: false, returned: false }, terminal: { kind: 'none', acceptedRetained: false, exitAccepted: false },
      start: { generationBodyCalls: 0, frameExits: 0, retirementStarts: 0, retirementClaimUnused: true } } };
  const branches = [
    ['g_normal', 'known', 'settling', 'none', 'none', 1, 1, 1],
    ['g_not_called', 'not_called', 'settling', 'construction_unconfirmed', 'none', 0, 0, 1],
    ['g_reserved_not_called', 'not_called', 'settling', 'construction_unconfirmed', 'none', 1, 0, 1],
    ['g_known_issuer', 'known', 'settling', 'construction_unconfirmed', 'none', 1, 1, 1],
    ['g_unknown', 'unknown', 'failed', 'construction_unconfirmed', 'state_invalid', 1, 0, 1],
    ['g_not_entered', 'not_entered', 'not_entered', 'construction_unconfirmed', 'none', 0, 0, 0],
    ['g_stop_capture_before', 'not_entered', 'not_entered', 'closed', 'none', 0, 0, 0],
    ['g_stop_capture_claim', 'not_called', 'settling', 'closed', 'none', 0, 0, 1],
    ['g_stop_capture_known', 'known', 'settling', 'closed', 'none', 1, 1, 1],
  ] as const;
  it.each(branches)('keeps %s independent from retirement and terminal completion', (script, branch, state, captureFirst, first, attempts, issued, exits) => {
    const a = createProbeExitGuardFake(script); expect(a.run().disposition).toBe('not_ready'); a.prepare();
    const r = a.run(); expect(r).toMatchObject({ ok: false, first, captureFirst,
      disposition: state === 'settling' ? 'settling_held' : state === 'not_entered' ? 'not_entered' : 'exit_unconfirmed' });
    const s = a.inspect(); expect(s).toMatchObject({ ...closed, grantAttempts: attempts, grantIssues: issued, exitAttempts: exits,
      enterUsed: exits === 1, progress: { state, branch, captureFirst, first, routeUsed: true, returned: true, inProgress: false,
        exitUsed: exits === 1, sameDuty: true, captureReplyRetained: true, knowledge: branch === 'not_entered' ? 'not_called' : branch },
      anchor: { ...closed.anchor, duty: { state: state === 'failed' ? 'unconfirmed' : state === 'not_entered' ? 'not_owed' : 'settling',
        attemptUsed: exits === 1, phase: exits ? 'guard' : 'none', boundary: exits ? 'after' : 'none' } } });
    fixedData(r); fixedData(s); for (let i = 0; i < 3; i++) expect(a.run()).toBe(r); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('blocked_frame_execution');
    expect(a.close()).toBe(r); expect(a.run()).toBe(r); expect(a.inspect()).toMatchObject({ ...closed, exitAttempts: exits, progress: { captureFirst, first } });
  });
  it.each(['copy', 'issued_copy', 'brand', 'extra', 'bindingOrigin', 'gate', 'owner', 'pin', 'epoch', 'frame', 'draft', 'entry', 'exit', 'phase'])(
    'keeps known invalid %s and consumes only the same-duty failure attempt', field => {
      const a = createProbeExitGuardFake('g_invalid_' + field); a.prepare(); const r = a.run();
      expect(r).toMatchObject({ first: 'state_invalid', captureFirst: 'binding_mismatch', disposition: 'exit_unconfirmed' });
      expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 1, exitAttempts: 1,
        progress: { branch: 'invalid', state: 'failed', knowledge: 'known', issuerRetained: true, currentRetained: true, issuedRetained: true,
          rejectedRetained: true, sameDuty: true }, anchor: { ...closed.anchor, duty: { state: 'unconfirmed', attemptUsed: true } } });
      expect(a.run()).toBe(r); fixedData(a.inspect());
    });
  const identity = ['bundle', 'control', 'link', 'duty', 'binding', 'cells', 'gate', 'scope', 'owner', 'pin', 'epoch', 'packet', 'frame', 'entry', 'exit', 'copy', 'brand'];
  it.each(identity)('refuses same-value/foreign identity %s before consuming a duty', field => {
    const a = createProbeExitGuardFake('g_mix_' + field); a.prepare(); const r = a.run();
    expect(r.first).toBe('binding_mismatch'); expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 1, exitAttempts: 0,
      progress: { state: 'failed', branch: 'none', phase: 'identity', boundary: 'before', exitUsed: false, knowledge: 'known' },
      anchor: { ...closed.anchor, duty: { state: 'owed', attemptUsed: false, phase: 'none' } } });
    expect(a.run()).toBe(r); fixedData(a.inspect());
  });
  it.each(['g_mix_body', 'g_history_unreturned'])('rejects an unconfirmed capture/body boundary %s before claiming', script => {
    const a = createProbeExitGuardFake(script); a.prepare(); const r = a.run(); expect(r.first).toBe('state_invalid');
    expect(a.inspect()).toMatchObject({ ...closed, exitAttempts: 0, progress: { phase: 'history', boundary: 'before', state: 'failed' } });
  });
  const points = [['capture', 'before'], ['return', 'after'], ['identity', 'before'], ['identity', 'after'], ['history', 'before'],
    ['history', 'after'], ['claim', 'before'], ['claim', 'after'], ['branch', 'before'], ['branch', 'after']] as const;
  it.each(points.map((p, index) => [...p, index] as const))('retains the independent failure prefix at %s/%s', (phase, boundary, index) => {
    const a = createProbeExitGuardFake(`g_fault_${phase}_${boundary}`); a.prepare(); const r = a.run(); const used = index >= 7, captured = index >= 1;
    expect(r.first).toBe('construction_unconfirmed'); const s = a.inspect(); expect(s).toMatchObject({ ...closed, grantIssues: Number(captured),
      exitAttempts: Number(used), progress: { state: 'failed', phase, boundary, failurePhase: phase, failureBoundary: boundary,
        returned: captured, exitUsed: used, inProgress: false, sameDuty: true },
      anchor: { ...closed.anchor, duty: { state: used ? 'unconfirmed' : captured ? 'owed' : 'not_owed', attemptUsed: used } } });
    expect(a.run()).toBe(r); expect(a.close()).toBe(r); fixedData(s);
  });
  it.each(points)('keeps stop separate at %s/%s', (phase, boundary) => {
    const a = createProbeExitGuardFake(`g_stop_${phase}_${boundary}`); a.prepare(); a.run();
    expect(a.inspect()).toMatchObject({ ...closed, progress: { first: 'none', stopRequested: true,
      state: phase === 'capture' ? 'not_entered' : 'settling', branch: phase === 'capture' ? 'not_entered' : 'known' },
      exitAttempts: phase === 'capture' ? 0 : 1 });
  });
  it.each(points)('refuses reentry at %s/%s without a second claim', (phase, boundary) => {
    const a = createProbeExitGuardFake(`g_reenter_${phase}_${boundary}`); a.prepare(); a.run();
    expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 1, exitAttempts: 1, progress: { state: 'settling', reentry: 'run_in_progress', first: 'none' } });
  });
  it.each(['g_setup_before', 'g_setup_after', 'g_setup_post'])('keeps setup failure %s non-executing', script => {
    const a = createProbeExitGuardFake(script); expect(a.prepare().first).toBe('construction_unconfirmed');
    expect(a.run().first).toBe('construction_unconfirmed'); expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 0, exitAttempts: 0 });
  });
  it('keeps prior roots unchanged, rejects external artifacts without hooks and never opens check/close', () => {
    const old = createProbeExitPreparationFake(); old.prepare(); const previous = old.inspect();
    const capture = createProbeGrantCaptureFake(); capture.prepare(); capture.enter(); const cap = capture.inspect();
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const args of [[p], ['g_normal', p], [() => hooks++], ['g_unknown_input']]) {
      const a = createProbeExitGuardFake(...args); expect(a.prepare().first).toBe('input_rejected'); expect(a.run().first).toBe('input_rejected'); fixedData(a.inspect());
    }
    for (const name of ['prepare', 'run', 'check', 'checkLegacy', 'close', 'inspect'] as const) {
      const a = createProbeExitGuardFake(); a.prepare(); fixedData(a[name](p)); expect(a.run().first).toBe('input_rejected');
    }
    const a = createProbeExitGuardFake(); a.prepare(); a.close(); expect(a.run().disposition).toBe('closed');
    expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 0, exitAttempts: 0 });
    expect(hooks).toBe(0); expect(old.inspect()).toEqual(previous); expect(capture.inspect()).toEqual(cap);
    expect(Object.keys(createProbeExitGuardFake())).toEqual(['prepare', 'run', 'check', 'checkLegacy', 'close', 'inspect']);
  });
});
