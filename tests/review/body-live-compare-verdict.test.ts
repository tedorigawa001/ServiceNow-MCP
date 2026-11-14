import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs fixture without declarations
import { classifyChildRun } from './fixtures/body-live-compare-verdict.mjs';

// Hand-written reports; expectations are not derived from the classifier.
const ok = { mode: 'js', timedOut: false, closed: { code: 0, signal: null, ms: 15_000 }, cleanupConfirmed: true, outBytes: 21_328, errBytes: 0 };
const controlTimeout = { ...ok, mode: 'reference', timedOut: true, closed: { code: null, signal: 'SIGTERM', ms: 60_080 }, outBytes: 0 };

describe('BL-B comparator per-child verdict (pure, no process)', () => {
  it('accepts only a clean, closed, in-budget child', () => {
    expect(classifyChildRun(ok)).toEqual({ verdict: 'ok', reason: 'none' });
  });
  it('reports a clean legacy-control deadline as inconclusive', () => {
    expect(classifyChildRun(controlTimeout)).toEqual({ verdict: 'inconclusive', reason: 'control_deadline' });
  });
  it('keeps a JS-path deadline a failure', () => {
    expect(classifyChildRun({ ...controlTimeout, mode: 'js' })).toMatchObject({ verdict: 'failed', reason: 'child_deadline' });
  });
  it.each([
    ['stderr overflow', { errBytes: 70_000 }, 'child_output_truncated'],
    ['stdout overflow', { outBytes: 65_537 }, 'child_output_truncated'],
    ['any stderr', { errBytes: 1 }, 'child_stderr'],
    ['spawn or signal error', { spawnError: 'EPERM' }, 'spawn_or_signal_error'],
    ['unconfirmed cleanup', { cleanupConfirmed: false }, 'owned_group_cleanup_unconfirmed'],
  ] as const)('does not hide %s behind a control deadline (SF17)', (_, change, reason) => {
    expect(classifyChildRun({ ...controlTimeout, ...change })).toEqual({ verdict: 'failed', reason });
  });
  it.each([[65_536, 'ok'], [65_537, 'failed']] as const)('applies the byte limit exactly at %i stdout bytes', (outBytes, verdict) => {
    expect(classifyChildRun({ ...ok, outBytes }).verdict).toBe(verdict);
  });
  it.each([60_000, 60_001])('does not accept a close at %i ms even if the deadline timer has not fired', ms => {
    expect(classifyChildRun({ ...ok, closed: { ...ok.closed, ms } })).toMatchObject({ verdict: 'failed', reason: 'child_deadline' });
    expect(classifyChildRun({ ...ok, mode: 'reference', closed: { ...ok.closed, ms } })).toEqual({ verdict: 'inconclusive', reason: 'control_deadline' });
  });
  it('accepts 59,999 ms and refuses a non-zero exit or a signal', () => {
    expect(classifyChildRun({ ...ok, closed: { ...ok.closed, ms: 59_999 } }).verdict).toBe('ok');
    expect(classifyChildRun({ ...ok, closed: { ...ok.closed, code: 1 } })).toEqual({ verdict: 'failed', reason: 'child_failed' });
    expect(classifyChildRun({ ...ok, closed: { ...ok.closed, signal: 'SIGTERM' } })).toEqual({ verdict: 'failed', reason: 'child_failed' });
  });
  it('fails closed when close was never observed', () => {
    expect(classifyChildRun({ ...ok, closed: undefined })).toEqual({ verdict: 'failed', reason: 'child_unclosed' });
  });
});
