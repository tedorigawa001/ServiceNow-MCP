import { describe, expect, it } from 'vitest';
import { createProbeLocalExitFake, createProbeExitGuardFake, createProbeExitPreparationFake } from './fixtures/snapshot-read-composition-fake.js';

function fixedData(value: unknown): void {
  const pending = [value]; let count = 0;
  while (pending.length) {
    const v = pending.pop(); expect(++count).toBeLessThan(600);
    if (!v || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const k of Reflect.ownKeys(v)) {
      expect(typeof k).toBe('string'); const d = Object.getOwnPropertyDescriptor(v, k)!;
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined(); if (Array.isArray(v) && k === 'length') continue; pending.push(d.value);
    }
  }
}
describe('B03-C same-target local retirement / all-post / not-started terminal, synthetic only', () => {
  const closed = { authority: 'none', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled', implementation: 'unknown',
    investigations: 'on_hold', bodyStarts: 0, exitRecords: 0, journalSupply: 'not_connected', rootFinish: 'not_called',
    start: { generationBodyCalls: 0, frameExits: 0, retirementStarts: 0, retirementClaimUnused: true },
    terminal: { acceptedRetained: false, candidateRetained: false, issuedRetained: false, exitAccepted: false }, probeBody: { state: 'not_started', outcome: 'none' } };
  it.each([
    ['c_normal', true, 'none'], ['c_not_called', false, 'construction_unconfirmed'], ['c_reserved_not_called', false, 'construction_unconfirmed'],
    ['c_known_issuer', true, 'construction_unconfirmed'], ['c_stop_capture_claim', false, 'closed'], ['c_stop_capture_known', true, 'closed'],
  ] as const)('commits only a body-not-started terminal for %s', (script, known, captureFirst) => {
    const a = createProbeLocalExitFake(script); expect(a.run().disposition).toBe('not_ready'); a.prepare(); const r = a.run();
    expect(r).toMatchObject({ model: 'wfb-probe-local-exit-1', ok: false, disposition: 'held_not_started', first: 'none', captureFirst });
    const s = a.inspect(); expect(s).toMatchObject({ ...closed, retirementAttempts: Number(known), terminalCommits: 1,
      duty: { state: 'settled_not_started', attemptUsed: true, phase: 'project', boundary: 'after' },
      grantState: known ? 'revoked' : 'empty', grantUnresolved: false, probeExit: { stage: 'unsealed', revoked: known, acceptedRetained: false },
      local: { state: 'held_not_started', first: 'none', sameDuty: true, deliveryUnconfirmed: false },
      retirement: { kind: known ? 'confirmed' : 'not_required', confirmed: true, attemptUsed: known, blocked: known,
        targetRetained: known, blockedTargetRetained: known, confirmedTargetRetained: known, sameTarget: known, targetOpen: false },
      absence: { kind: 'not_started', returned: true, routeClosed: true }, terminal: { ...closed.terminal, kind: 'held_not_started',
        prepared: true, committed: true, sameDuty: true, sameAbsence: true, sameRetirement: true } });
    fixedData(r); fixedData(s); expect(a.run()).toBe(r); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('blocked_frame_execution');
    expect(a.close()).toBe(r); expect(a.run()).toBe(r); expect(a.inspect()).toMatchObject({ ...closed, terminalCommits: 1 });
  });
  const known = ['prepare', 'history', 'attempt', 'block', 'revoke', 'confirm', 'absence', 'record', 'post', 'commit', 'project'];
  const empty = ['prepare', 'history', 'not_required', 'absence', 'record', 'post', 'commit', 'project'];
  const points = (phases: string[]) => phases.flatMap(p => ['before', 'after'].map(b => [p, b] as const));
  it.each(['', 'known_first_'].flatMap(prefix => points(known).map((p, index) => [prefix, ...p, index] as const)))(
    'retains independent known %s%s/%s failure prefix', (prefix, phase, boundary, index) => {
      const a = createProbeLocalExitFake(`c_${prefix}fault_${phase}_${boundary}`); a.prepare(); const r = a.run();
      const used = index >= 5, blocked = index >= 7, revoked = index >= 9, confirmed = index >= 11, absent = index >= 13, prepared = index >= 15, committed = index >= 19;
      expect(r).toMatchObject({ first: 'construction_unconfirmed', captureFirst: prefix ? 'construction_unconfirmed' : 'none',
        disposition: committed ? 'held_not_started' : 'exit_unconfirmed' });
      const s = a.inspect(); expect(s).toMatchObject({ ...closed, retirementAttempts: Number(used), terminalCommits: Number(committed),
        grantState: revoked ? 'revoked' : 'provisional', grantUnresolved: false,
        duty: { state: committed ? 'settled_not_started' : 'unconfirmed', attemptUsed: true },
        local: { state: committed ? 'held_not_started' : 'failed', phase, boundary, failurePhase: phase, failureBoundary: boundary,
          first: 'construction_unconfirmed', deliveryUnconfirmed: committed },
        retirement: { attemptUsed: used, blocked, confirmed, targetRetained: used, blockedTargetRetained: blocked, confirmedTargetRetained: confirmed,
          kind: confirmed ? 'confirmed' : 'unconfirmed', sameTarget: confirmed, targetOpen: !blocked },
        absence: { kind: absent ? 'not_started' : 'unobserved', returned: absent, routeClosed: absent },
        terminal: { ...closed.terminal, prepared, committed, kind: committed ? 'held_not_started' : 'exit_unconfirmed' } });
      expect(a.run()).toBe(r); expect(a.close()).toBe(r); fixedData(s);
    });
  it.each(points(empty).map((p, index) => [...p, index] as const))('retains the independent uncalled %s/%s failure prefix', (phase, boundary, index) => {
    const a = createProbeLocalExitFake(`c_empty_fault_${phase}_${boundary}`); a.prepare(); const r = a.run();
    const confirmed = index >= 5, absent = index >= 7, prepared = index >= 9, committed = index >= 13;
    expect(r).toMatchObject({ first: 'construction_unconfirmed', captureFirst: 'construction_unconfirmed' });
    expect(a.inspect()).toMatchObject({ ...closed, grantState: 'empty', grantIssues: 0, retirementAttempts: 0, terminalCommits: Number(committed),
      local: { first: 'construction_unconfirmed', deliveryUnconfirmed: committed, failurePhase: phase, failureBoundary: boundary },
      retirement: { kind: confirmed ? 'not_required' : 'unconfirmed', attemptUsed: false, blocked: false, confirmed,
        targetRetained: false, blockedTargetRetained: false, confirmedTargetRetained: false, targetOpen: false },
      absence: { kind: absent ? 'not_started' : 'unobserved' }, terminal: { ...closed.terminal, prepared, committed } });
    expect(a.run()).toBe(r); fixedData(a.inspect());
  });
  it.each([['', known], ['empty_', empty]] as const)('keeps stop/reentry separate for %s', (prefix, phases) => {
    for (const [phase, boundary] of points([...phases])) for (const mode of ['stop', 'reenter']) {
      const a = createProbeLocalExitFake(`c_${prefix}${mode}_${phase}_${boundary}`); a.prepare(); const r = a.run();
      expect(r.disposition).toBe('held_not_started'); expect(r.first).toBe('none');
      expect(a.inspect()).toMatchObject({ ...closed, retirementAttempts: prefix ? 0 : 1, terminalCommits: 1,
        local: { deliveryUnconfirmed: false, reentry: mode === 'reenter' ? 'run_in_progress' : 'none' },
        guard: { stopRequested: mode === 'stop', captureFirst: prefix ? 'construction_unconfirmed' : 'none' } });
    }
  });
  it.each(['c_context_guard', 'c_context_bundle', 'c_context_duty', 'c_context_control', 'c_context_copy', 'c_context_brand',
    'c_mix_target', 'c_mix_post_target', 'c_mix_terminal_duty'])('refuses late mixing %s without target replacement or release', script => {
    const a = createProbeLocalExitFake(script); a.prepare(); const r = a.run(); expect(r.disposition).toBe('exit_unconfirmed');
    const post = script.includes('post') || script === 'c_mix_terminal_duty';
    expect(a.inspect()).toMatchObject({ ...closed, terminalCommits: 0, retirementAttempts: script.includes('mix_') ? 1 : 0,
      retirement: { confirmed: post, blocked: post, confirmedTargetRetained: post, targetOpen: !post },
      local: { state: 'failed' }, duty: { state: 'unconfirmed', attemptUsed: true } });
    if (script === 'c_mix_post_target') expect(a.inspect().retirement.sameTarget).toBe(false);
    expect(a.run()).toBe(r); fixedData(a.inspect());
  });
  it.each(['c_unknown', ...['copy', 'issued_copy', 'brand', 'extra', 'bindingOrigin', 'gate', 'owner', 'pin', 'epoch', 'frame', 'draft', 'entry', 'exit', 'phase'].map(f => 'c_invalid_' + f)])(
    'never retires or commits rejected history %s', script => {
      const a = createProbeLocalExitFake(script); a.prepare(); expect(a.run().disposition).toBe('exit_unconfirmed');
      expect(a.inspect()).toMatchObject({ ...closed, retirementAttempts: 0, terminalCommits: 0, absence: { kind: 'unobserved' },
        terminal: { ...closed.terminal, kind: 'exit_unconfirmed', committed: false }, grantUnresolved: script === 'c_unknown' });
    });
  it.each(['c_not_entered', 'c_stop_capture_before'])('does not fabricate an exit for %s', script => {
    const a = createProbeLocalExitFake(script); a.prepare(); expect(a.run().disposition).toBe('not_entered');
    expect(a.inspect()).toMatchObject({ ...closed, exitAttempts: 0, retirementAttempts: 0, terminalCommits: 0, local: { state: 'not_entered' },
      terminal: { ...closed.terminal, kind: 'none' }, absence: { kind: 'unobserved' } });
  });
  it.each([1, 2, 3, 4].flatMap(n => ['before', 'attempt', 'after', 'done', ...(n === 4 ? ['bind', 'post'] : [])].map(b => [n, b] as const)))(
    'retains construction prefix %i/%s before execution', (n, boundary) => {
      const a = createProbeLocalExitFake(`c_setup_${boundary}_${n}`); expect(a.prepare().first).toBe('construction_unconfirmed');
      expect(a.run().first).toBe('construction_unconfirmed'); const minted = !['before', 'attempt'].includes(boundary);
      expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 0, exitAttempts: 0, retirementAttempts: 0, terminalCommits: 0,
        construction: { ready: false, phase: n, boundary, retained: n - 1 + Number(minted) } }); fixedData(a.inspect());
    });
  it('preserves old A/B behavior, rejects hooks and keeps closure non-executing', () => {
    const old = createProbeExitGuardFake(); old.prepare(); old.run(); const b = old.inspect();
    const prior = createProbeExitPreparationFake(); prior.prepare(); const a = prior.inspect();
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('private'); }, ownKeys() { hooks++; throw Error('private'); } });
    for (const args of [[p], ['c_normal', p], [() => hooks++], ['c_unknown_input']]) {
      const f = createProbeLocalExitFake(...args); expect(f.prepare().first).toBe('input_rejected'); fixedData(f.inspect());
    }
    for (const key of ['prepare', 'run', 'check', 'checkLegacy', 'close', 'inspect'] as const) {
      const f = createProbeLocalExitFake(); f.prepare(); fixedData(f[key](p)); expect(f.run().first).toBe('input_rejected');
    }
    const f = createProbeLocalExitFake(); f.prepare(); f.close(); expect(f.run().disposition).toBe('closed'); expect(f.inspect().retirementAttempts).toBe(0);
    expect(hooks).toBe(0); expect(old.inspect()).toEqual(b); expect(prior.inspect()).toEqual(a);
    expect(Object.keys(f)).toEqual(['prepare', 'run', 'check', 'checkLegacy', 'close', 'inspect']);
  });
});
