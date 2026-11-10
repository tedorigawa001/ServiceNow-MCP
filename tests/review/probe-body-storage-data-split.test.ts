import { describe, expect, it } from 'vitest';
import { createProbeBodySeedFake, createProbeBodyLiveFake, createProbeBodyBundleFake,
  createProbeBodyBindFieldsFake } from './fixtures/snapshot-read-composition-fake.js';

// Independent legacy outcomes: this refactor adds no public storage-only entry.
const families = [
  ['seed', createProbeBodySeedFake, 'wfb-body-slot-seed-1', 'seed_held', 5, 'BC05', 'confirmed'],
  ['live', createProbeBodyLiveFake, 'wfb-body-live-initial-1', 'live_held', 11, 'BC11', 'confirmed'],
  ['bundle', createProbeBodyBundleFake, 'wfb-body-bundle-draft-1', 'bundle_held', 13, 'BC13', 'post_after'],
] as const;

describe('BS storage and BC data separation with unchanged legacy entry points', () => {
  it.each(families)('preserves %s completion, custody and closed execution', (_name, create, model, disposition, count, phase, boundary) => {
    const a = create(); const r = a.prepare(), s = a.inspect();
    expect(r).toMatchObject({ model, disposition, first: 'none', ok: false, execution: 'closed', formalIssuance: 'closed' });
    expect(s).toMatchObject({ model, state: 'held', phase, boundary, ready: false, rootReady: false,
      shellRetained: true, arrayRetained: true, bindAttemptUsed: false, borrowRetained: false, bodyStarts: 0,
      grantAttempts: 0, grantIssues: 0, enterUsed: false, dutyUsed: false, retirementAttempts: 0, terminalCommits: 0,
      implementation: 'unknown', wholeRunAdmission: 'disabled', investigations: 'on_hold' });
    expect(s.slots.map(c => [c.index, c.carrierRetained, c.stage, c.issuedRetained, c.currentRetained])).toEqual(
      Array.from({ length: 13 }, (_, i) => [i + 1, true, i < count ? 'confirmed' : 'not_started', i < count, i < count]));
    expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('not_ready');
    expect(Object.keys(a)).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
  });
  it.each(['BS14_done', 'BC00_before', 'BC00_after'])('keeps %s failures data-free and never resumes the root', point => {
    const a = createProbeBodySeedFake('s_fault_' + point), r = a.prepare();
    expect(r.first).toBe('construction_unconfirmed');
    expect(a.inspect()).toMatchObject({ state: 'failed', failurePhase: point.split('_')[0], failureBoundary: point.split('_')[1],
      rootReady: false, bindAttemptUsed: false, bodyStarts: 0, dutyUsed: false });
    expect(a.inspect().slots.every(c => c.carrierRetained && c.stage === 'not_started'
      && !c.attemptReserved && !c.callBoundaryReached && !c.issuedRetained && !c.currentRetained && !c.rejectedRetained)).toBe(true);
    for (const op of [a.prepare, a.check, a.checkLegacy, a.close]) expect(op()).toBe(r);
  });
  it.each(['BS14_done', 'BC00_before'])('preserves close and reentry semantics at %s', point => {
    const stopped = createProbeBodySeedFake('s_close_' + point), r = stopped.prepare();
    expect(r.first).toBe('closed'); expect(stopped.inspect().slots.every(c => !c.callBoundaryReached)).toBe(true);
    expect(stopped.prepare()).toBe(r);
    const entered = createProbeBodySeedFake('s_reenter_' + point);
    expect(entered.prepare().disposition).toBe('seed_held'); expect(entered.inspect().reentry).toBe('construction_in_progress');
  });
  it('does not extend the field-only closed route into BS, source or pin preparation', () => {
    const a = createProbeBodyBindFieldsFake(); a.prepare();
    expect(a.inspect()).toMatchObject({ dataCreated: 0, source: { state: 'not_created', claim: 'not_created', metadataConfirmed: false },
      receiver: { pinAttemptUsed: false, pinStage: 'empty', occupancy: 'free' }, sourceIssuance: 'not_connected',
      pin: 'not_connected', claimConsumption: 'not_connected', binding: 'not_connected', constructionReady: 'not_connected' });
  });
});
