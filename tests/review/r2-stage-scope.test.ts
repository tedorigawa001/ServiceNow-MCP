import { expect, it, vi } from 'vitest';
import { withR2Stage } from './fixtures/r2-stage-scope.js';
import type { R2RunnerOutcome } from '../../src/review/r2-runner.js';
import { getEventListeners } from 'node:events';

const receipt = (code = 'callback_unavailable'): R2RunnerOutcome => ({ ok: false, code, cleanup: 'complete',
  mcpListed: false, tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false });

it('fails promptly with the terminal reason when the runner ends before the expected stage', async () => {
  const root = new AbortController(), scope = new AbortController(), body = vi.fn(async () => {});
  let release!: () => void, settled = false;
  const reached = new Promise<void>(r => { release = r; });
  const task = withR2Stage({ root, reached, task: Promise.resolve(receipt()), signal: scope.signal }, body)
    .then(() => ({ ok: true }), error => ({ ok: false, error }));
  void task.then(() => { settled = true; });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const settledBeforeStage = settled;
  // Always release the old wait in the red control so this regression never leaves a pending test.
  release(); const result = await task;
  expect(settledBeforeStage).toBe(true);
  expect(body).not.toHaveBeenCalled();
  expect(result).toMatchObject({ ok: false, error: { message: 'R2_STAGE_NOT_REACHED:callback_unavailable', cleanup: 'complete' } });
  expect(root.signal.aborted).toBe(true);
});

it('cancels and awaits runner cleanup in finally while retaining a body failure', async () => {
  const root = new AbortController(), scope = new AbortController();
  let close!: () => void, cleanupComplete = false, settled = false;
  const task = new Promise<R2RunnerOutcome>(resolve => {
    root.signal.addEventListener('abort', () => { close = () => { cleanupComplete = true; resolve(receipt('cancelled')); }; }, { once: true });
  });
  const assertion = Error('SYNTHETIC_ASSERTION');
  const run = withR2Stage({ root, signal: scope.signal, reached: Promise.resolve(), task }, async () => { throw assertion; })
    .then(() => undefined, error => error);
  void run.then(() => { settled = true; });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  expect(root.signal.aborted).toBe(true); expect(settled).toBe(false);
  close(); expect(await run).toBe(assertion); expect(cleanupComplete).toBe(true);
  expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0);
});

it.each([false, true])('uses test-scope cancellation before stage entry (already aborted: %s)', async already => {
  const root = new AbortController(), scope = new AbortController(), body = vi.fn(async () => {});
  const task = new Promise<R2RunnerOutcome>(resolve => {
    root.signal.addEventListener('abort', () => resolve(receipt('cancelled')), { once: true });
  });
  if (already) scope.abort(Error('PRIVATE_SCOPE_REASON'));
  const run = withR2Stage({ root, signal: scope.signal, task, reached: new Promise(() => {}) }, body);
  if (!already) scope.abort(Error('PRIVATE_SCOPE_REASON'));
  await expect(run).rejects.toMatchObject({ message: 'R2_STAGE_NOT_REACHED:test_cancelled', cleanup: 'complete' });
  expect(body).not.toHaveBeenCalled(); expect(root.signal.aborted).toBe(true);
  expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0);
});

it.each(['unknown-code', 'rejected'] as const)('does not expose arbitrary runner failures (%s)', async kind => {
  const root = new AbortController(), scope = new AbortController();
  const task = kind === 'rejected' ? Promise.reject(Error('PRIVATE_RUNNER_FAILURE')) : Promise.resolve(receipt('PRIVATE_RUNNER_FAILURE'));
  await expect(withR2Stage({ root, signal: scope.signal, task, reached: new Promise(() => {}) }, async () => {}))
    .rejects.toMatchObject({ message: `R2_STAGE_NOT_REACHED:${kind === 'rejected' ? 'runner_rejected' : 'other'}`,
      cleanup: kind === 'rejected' ? 'unconfirmed' : 'complete' });
  expect(root.signal.aborted).toBe(true); expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0);
});

it('keeps incomplete cleanup distinct from confirmed cleanup on early termination', async () => {
  const root = new AbortController(), scope = new AbortController();
  await expect(withR2Stage({ root, signal: scope.signal, reached: new Promise(() => {}),
    task: Promise.resolve({ ...receipt('cleanup_incomplete'), cleanup: 'incomplete' }) }, async () => {}))
    .rejects.toMatchObject({ message: 'R2_STAGE_NOT_REACHED:cleanup_incomplete', cleanup: 'incomplete' });
});
