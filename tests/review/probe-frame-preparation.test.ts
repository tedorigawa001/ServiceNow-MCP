import { describe, expect, it } from 'vitest';
import { createProbeFramePreparationFake, createCanonicalGateDraftFake, createRetirementStartFake } from './fixtures/snapshot-read-composition-fake.js';

describe('stage A same-start wrapper / prior private cells / closed binding', () => {
  const closed = { frameExecutions: 0, grantIssues: 0, realWriterCalls: 0, journalSupply: 'not_connected',
    admissionConsumptions: 0, packetObjects: 0, closedEvidence: 'not_issued', proofIssuance: 'closed' };
  it('retains prior cells and binds the same start without consuming any execution slot', () => {
    const a = createProbeFramePreparationFake(); expect(a.check().disposition).toBe('not_ready');
    expect(a.prepare().ok).toBe(true);
    expect(a.inspect()).toMatchObject({ ...closed, ready: true, retained: 37, continuationUse: 'unused',
      issuer: { state: 'unused', controlState: 'not_created', admissionIssues: 0, sealAttempts: 0 },
      probe: { phase: 8, boundary: 'post', retained: 8, stages: Array(8).fill('confirmed'), bindingRetained: true,
        use: { state: 'unused', attemptUsed: false }, body: { state: 'not_started', outcome: 'none' },
        grant: { stage: 'empty', current: undefined, issued: undefined, unresolved: false }, exit: { stage: 'empty', accepted: undefined, revoked: false },
        start: { bindingRetained: true, bindingAttempted: true, wrapperCalls: 0, generationBodyCalls: 0, frameExits: 0, starts: 0, claim: 'unused' } } });
    const s = a.inspect(); expect(a.prepare().disposition).toBe('duplicate_preparation'); expect(a.inspect()).toEqual(s);
    expect(a.check().disposition).toBe('blocked_frame_execution'); expect(a.checkLegacy().disposition).toBe('blocked_frame_execution');
    expect(a.inspect()).toMatchObject({ ...closed, probe: { use: { state: 'unused', attemptUsed: false },
      start: { wrapperCalls: 2, generationBodyCalls: 0, frameExits: 0, frame: 'inactive', claim: 'unused', starts: 0 } } });
  });
  it.each(Array.from({ length: 8 }, (_, i) => i + 1).flatMap(n => ['before', 'attempt', 'after', 'done'].map(b => [n, b] as const)))(
    'holds independently derived cell prefix %i/%s', (n, boundary) => {
      const a = createProbeFramePreparationFake(`cell_${boundary}_${n}`), r = a.prepare();
      const stages = Array.from({ length: 8 }, (_, i) => i < n - 1 ? 'confirmed' : i > n - 1 ? 'not_started'
        : boundary === 'before' ? 'not_started' : boundary === 'attempt' ? 'attempting' : boundary === 'after' ? 'provisional' : 'confirmed');
      expect(a.inspect()).toMatchObject({ ...closed, ready: false, retained: n <= 7 ? 30 : 37,
        probe: { phase: n, boundary, stages, retained: n - 1 + Number(boundary === 'after' || boundary === 'done') } });
      if (n <= 7) expect(a.inspect().issuer).toBeUndefined();
      const s = a.inspect(); expect(a.prepare()).toBe(r); expect(a.check()).toBe(r); expect(a.checkLegacy()).toBe(r); expect(a.close()).toBe(r); expect(a.inspect()).toEqual(s);
    });
  it.each(['copy', 'brand', 'extra', 'owner', 'use', 'frame', 'grant', 'body', 'exit', 'diagnostic'])(
    'refuses cells_%s before constructing the issuer', f => {
      const a = createProbeFramePreparationFake('cells_' + f); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, retained: 30, ready: false, probe: { phase: 7, boundary: 'check', retained: 7 } });
      expect(a.inspect().issuer).toBeUndefined();
    });
  it.each(['copy', 'brand', 'extra', 'seed', 'target', 'gate', 'pin', 'scope', 'owner', 'epoch', 'packet', 'draft', 'entry', 'exit', 'cells'])(
    'refuses frame_%s before start binding', f => {
      const a = createProbeFramePreparationFake('frame_' + f); expect(a.prepare().first).toBe('binding_mismatch');
      expect(a.inspect()).toMatchObject({ ...closed, ready: false, probe: { phase: 8, boundary: 'check', retained: 8,
        start: { bindingAttempted: false, bindingRetained: false, wrapperCalls: 0, generationBodyCalls: 0 } } });
    });
  it('checks the receiver private cell independently of the root binding', () => {
    const a = createProbeFramePreparationFake('start_cells_copy'); expect(a.prepare().first).toBe('binding_mismatch');
    expect(a.inspect()).toMatchObject({ ...closed, probe: { start: { bindingAttempted: true, bindingRetained: true, wrapperCalls: 0 } } });
  });
  it.each(['cell_check_7', 'cell_check_8', 'cell_post_8'])('holds %s with no restart', script => {
    const a = createProbeFramePreparationFake(script), r = a.prepare(); expect(r.first).toBe('construction_unconfirmed');
    expect(a.prepare()).toBe(r); expect(a.check()).toBe(r); expect(a.inspect()).toMatchObject({ ...closed, ready: false });
  });
  it('keeps duplicate binding and reentry refusals non-destructive', () => {
    const a = createProbeFramePreparationFake('duplicate_frame_binding'); expect(a.prepare().ok).toBe(true);
    expect(a.inspect()).toMatchObject({ first: 'none', probe: { bindRefusal: 'duplicate_binding', start: { wrapperCalls: 0 } } });
    expect(a.check().disposition).toBe('blocked_frame_execution');
    const b = createProbeFramePreparationFake('reenter_frame_preparation'); expect(b.prepare().ok).toBe(true);
    expect(b.inspect().reentry).toBe('construction_in_progress');
  });
  it('keeps close as an outer stop, retaining cells without requesting retirement', () => {
    const a = createProbeFramePreparationFake(); a.close(); expect(a.prepare().disposition).toBe('closed'); expect(a.inspect().retained).toBe(0);
    const b = createProbeFramePreparationFake(); b.prepare(); const r = b.close(); expect(b.check()).toBe(r);
    expect(b.inspect()).toMatchObject({ ...closed, probe: { retained: 8, start: { starts: 0, claim: 'unused', wrapperCalls: 0 } } });
  });
  it('preserves legacy roots and rejects artifacts without invoking caller hooks', () => {
    const old = createCanonicalGateDraftFake(); old.prepare(); const before = old.inspect();
    const legacy = createRetirementStartFake(); const l = legacy.inspect();
    let calls = 0; const p = new Proxy({}, { get() { calls++; throw Error('secret'); }, ownKeys() { calls++; return []; } });
    for (const args of [[p], ['normal', p], [() => calls++], ['cell_before_9'], [old]]) {
      const a = createProbeFramePreparationFake(...args); expect(a.prepare().first).toBe('input_rejected'); expect(a.inspect().retained).toBe(0);
    }
    expect(calls).toBe(0); expect(old.inspect()).toEqual(before); expect(legacy.inspect()).toEqual(l);
    expect(Object.keys(createProbeFramePreparationFake())).toEqual(['prepare', 'check', 'checkLegacy', 'close', 'inspect']);
  });
});
