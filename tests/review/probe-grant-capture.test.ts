import { describe, expect, it } from 'vitest';
import { createProbeGrantCaptureFake, createProbeRunPreparationFake, createProbeFramePreparationFake } from './fixtures/snapshot-read-composition-fake.js';

function plainFrozenData(value: unknown): void {
  const pending: unknown[] = [value]; let count = 0;
  while (pending.length) {
    const v = pending.pop(); expect(++count).toBeLessThan(200);
    if (!v || typeof v !== 'object') { expect(['string', 'boolean', 'number']).toContain(typeof v); continue; }
    expect(Object.isFrozen(v)).toBe(true); expect(Reflect.ownKeys(v).every(k => typeof k === 'string')).toBe(true);
    expect(Object.getPrototypeOf(v)).toBe(Array.isArray(v) ? Array.prototype : Object.prototype);
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
      expect(d.get).toBeUndefined(); expect(d.set).toBeUndefined();
      if (Array.isArray(v) && k === 'length') continue; pending.push(d.value);
    }
  }
}

describe('B-02 one-shot enter / same grant capture / retained exit duty with body closed', () => {
  const closed = { authority: 'none', execution: 'closed', formalIssuance: 'closed', wholeRunAdmission: 'disabled',
    implementation: 'unknown', investigations: 'on_hold', bodyStarts: 0, exitRecords: 0, realWriterCalls: 0,
    journalSupply: 'not_connected', rootFinish: 'not_called', body: { state: 'not_started', outcome: 'none' },
    start: { generationBodyCalls: 0, frameExits: 0, retirementStarts: 0, retirementClaimUnused: true },
    exit: { exitAccepted: false, candidateRetained: false, localRevocationConfirmed: false } };
  const points = [['claim', 'before'], ['claim', 'after'], ['issue', 'before'], ['issue', 'attempt'], ['issue', 'issued'],
    ['capture', 'before'], ['capture', 'after'], ['validate', 'before'], ['validate', 'after']] as const;
  it('captures exactly one same-frame grant and keeps the same duty owed, never active', () => {
    const a = createProbeGrantCaptureFake(); expect(a.enter().disposition).toBe('not_ready'); a.prepare();
    expect(a.enter()).toMatchObject({ ok: true, disposition: 'grant_captured_body_closed', first: 'none', execution: 'closed' });
    const s = a.inspect(); expect(s).toMatchObject({ ...closed, model: 'wfb-probe-grant-capture-1', first: 'none', grantIssues: 1,
      use: { phase: 'entering', attemptUsed: true }, grant: { stage: 'provisional', currentRetained: true, issuedRetained: true,
        rejectedRetained: false, unknownObligation: false, localRevocationConfirmed: false },
      duty: { state: 'owed', attemptUsed: false, linkRetained: true },
      capture: { phase: 'validate', boundary: 'after', grantAttempts: 1, grantChecks: 1, issuerRetained: true,
        obligationOwed: true, sameDuty: true, inProgress: false } }); plainFrozenData(s);
    expect(a.checkState().valid).toBe(true); expect(a.check().disposition).toBe('blocked_frame_execution');
    expect(a.checkLegacy().disposition).toBe('blocked_frame_execution');
    expect(a.enter().disposition).toBe('duplicate_enter'); expect(a.enter().disposition).toBe('duplicate_enter');
    expect(a.inspect()).toMatchObject({ ...closed, first: 'none', grantIssues: 1, use: s.use, grant: s.grant, duty: s.duty,
      capture: { grantAttempts: 1, grantChecks: 1, obligationOwed: true, sameDuty: true, refusal: 'duplicate_enter' } });
  });
  it.each(points.flatMap((p, index) => ['fault', 'stop'].map(kind => [kind, p[0], p[1], index] as const)))(
    'keeps independent %s prefix at %s/%s', (kind, phase, boundary, index) => {
      const a = createProbeGrantCaptureFake(`${kind}_${phase}_${boundary}`); a.prepare(); const r = a.enter();
      // Every boundary here is a known checkpoint: the constructor is either not yet called or its result is held by the issuer.
      const used = index >= 1, attempted = index >= 3, issued = index >= 4, checked = index >= 8;
      expect(r.first).toBe(kind === 'stop' ? 'closed' : 'construction_unconfirmed');
      const s = a.inspect(); expect(s).toMatchObject({ ...closed, grantIssues: Number(issued),
        use: { phase: used ? 'entering' : 'unused', attemptUsed: used },
        grant: { stage: issued ? 'provisional' : 'empty', currentRetained: issued, issuedRetained: issued,
          rejectedRetained: false, unknownObligation: false }, duty: { state: used ? 'owed' : 'not_owed', attemptUsed: false, linkRetained: true },
        exit: { stage: 'empty' }, capture: { phase, boundary, grantAttempts: Number(attempted), grantChecks: Number(checked),
          prefix: !used ? 'not_claimed' : issued ? 'grant_known' : 'claimed_not_issued',
          issuerRetained: issued, obligationOwed: used, sameDuty: true, stopRequested: kind === 'stop', inProgress: false } });
      for (const again of [a.enter(), a.check(), a.checkLegacy(), a.close(), a.prepare()]) { expect(again).toBe(r); plainFrozenData(again); }
      expect(a.inspect()).toEqual(s); plainFrozenData(s);
    });
  it.each(points)('refuses synchronous reentry at %s/%s without claiming twice', (phase, boundary) => {
    const a = createProbeGrantCaptureFake(`reenter_${phase}_${boundary}`); a.prepare(); expect(a.enter().ok).toBe(true);
    expect(a.inspect()).toMatchObject({ ...closed, first: 'none', grantIssues: 1, capture: { reentry: 'enter_in_progress',
      grantAttempts: 1, grantChecks: 1, obligationOwed: true, sameDuty: true } });
  });
  it.each(['copy', 'issued_copy', 'brand', 'extra', 'bindingOrigin', 'gate', 'owner', 'pin', 'epoch', 'frame', 'draft', 'entry', 'exit', 'phase'])(
    'retains grant_%s and its duty after validation refuses it', field => {
      const a = createProbeGrantCaptureFake('grant_' + field); a.prepare(); const r = a.enter(); expect(r.first).toBe('binding_mismatch');
      // A rejected but fully captured grant is a known obligation for the later fixed exit, not an unknown one.
      expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 1, use: { phase: 'entering', attemptUsed: true },
        grant: { stage: 'provisional', currentRetained: true, issuedRetained: true, rejectedRetained: true, unknownObligation: false },
        duty: { state: 'owed', attemptUsed: false, linkRetained: true }, exit: { stage: 'empty' },
        capture: { phase: 'validate', boundary: 'before', grantAttempts: 1, grantChecks: 0, sameDuty: true, obligationOwed: true, prefix: 'grant_known' } });
      expect(a.enter()).toBe(r); plainFrozenData(a.inspect());
    });
  it.each(['preflight_link_copy', 'preflight_duty_copy'])('refuses %s before claim and issue', script => {
    const a = createProbeGrantCaptureFake(script); a.prepare(); expect(a.enter().first).toBe('binding_mismatch');
    expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 0, use: { phase: 'unused', attemptUsed: false },
      duty: { state: 'not_owed', attemptUsed: false }, capture: { phase: 'preflight', grantAttempts: 0, obligationOwed: false, sameDuty: false } });
  });
  it('retains an unconfirmed constructor attempt without pretending that no grant was created', () => {
    const a = createProbeGrantCaptureFake('issue_throw'); a.prepare(); expect(a.enter().first).toBe('construction_unconfirmed');
    expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 0, use: { phase: 'unconfirmed' }, duty: { state: 'unconfirmed' }, exit: { stage: 'unconfirmed' },
      grant: { stage: 'unconfirmed', currentRetained: false, issuedRetained: false, unknownObligation: true },
      capture: { grantAttempts: 1, issuerRetained: false, obligationOwed: true, sameDuty: true, prefix: 'grant_unknown' } });
  });
  it('closes before enter without issuing, and after capture without releasing the owed duty', () => {
    const a = createProbeGrantCaptureFake(); a.prepare(); const r = a.close(); expect(a.enter()).toBe(r);
    expect(a.inspect()).toMatchObject({ ...closed, grantIssues: 0, use: { phase: 'unused' }, capture: { stopRequested: true, grantAttempts: 0, obligationOwed: false } });
    const b = createProbeGrantCaptureFake(); b.prepare(); b.enter(); const before = b.inspect(); const br = b.close(); expect(b.enter()).toBe(br);
    expect(b.inspect()).toMatchObject({ ...closed, grantIssues: 1, use: before.use, grant: before.grant, duty: before.duty,
      capture: { sameDuty: true, obligationOwed: true, stopRequested: true } });
  });
  it('keeps previous roots closed and rejects caller artifacts and hooks', () => {
    const run = createProbeRunPreparationFake(); run.prepare(); const r = run.inspect();
    const frame = createProbeFramePreparationFake(); frame.prepare(); const f = frame.inspect();
    let hooks = 0; const p = new Proxy({}, { get() { hooks++; throw Error('secret'); }, ownKeys() { hooks++; throw Error('secret'); } });
    for (const args of [[p], ['normal', p], [() => hooks++], [run], ['grant_unknown']]) {
      const a = createProbeGrantCaptureFake(...args); expect(a.prepare().first).toBe('input_rejected'); expect(a.enter().first).toBe('input_rejected'); plainFrozenData(a.inspect());
    }
    for (const method of ['prepare', 'enter', 'check', 'checkLegacy', 'close', 'checkState'] as const) {
      const a = createProbeGrantCaptureFake(); a.prepare(); plainFrozenData(a[method](p)); expect(a.inspect().first).toBe('input_rejected');
    }
    expect(hooks).toBe(0); expect(run.inspect()).toEqual(r); expect(frame.inspect()).toEqual(f);
    expect(Object.keys(createProbeGrantCaptureFake())).toEqual(['prepare', 'enter', 'check', 'checkLegacy', 'checkState', 'close', 'inspect']);
  });
});
