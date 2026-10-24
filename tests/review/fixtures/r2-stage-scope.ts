/** Test-only runner lifetime. No new timer or deadline. */
import type { R2RunnerOutcome } from '../../../src/review/r2-runner.js';

const reasons = new Set(['callback_unavailable', 'cancelled', 'deadline_exceeded', 'exchange_outcome_unknown',
  'identity_mismatch', 'secret_output_detected', 'cleanup_incomplete']);
export class R2StageNotReached extends Error {
  cleanup: 'complete' | 'incomplete' | 'unconfirmed' = 'unconfirmed';
  constructor(reason: string) { super(`R2_STAGE_NOT_REACHED:${reason}`); }
}

export async function withR2Stage<T>(options: {
  reached: Promise<void>; root: AbortController; task: Promise<R2RunnerOutcome>; signal: AbortSignal;
}, body: () => Promise<T>): Promise<T> {
  // Observe rejection immediately too: no unhandled runner promise or arbitrary exception output.
  const terminal = options.task.then(result => ({ kind: 'terminal' as const, result }),
    () => ({ kind: 'rejected' as const }));
  let cancel!: () => void;
  const cancelled = new Promise<{ kind: 'cancelled' }>(resolve => { cancel = () => {
    options.root.abort(); resolve({ kind: 'cancelled' });
  }; });
  options.signal.addEventListener('abort', cancel, { once: true });
  if (options.signal.aborted) cancel();
  let failure: R2StageNotReached | undefined;
  try {
    const first = await Promise.race([cancelled, terminal,
      options.reached.then(() => ({ kind: 'stage' as const }))]);
    if (first.kind !== 'stage') {
      const reason = first.kind === 'terminal'
        ? first.result.ok ? 'completed' : reasons.has(first.result.code) ? first.result.code : 'other'
        : first.kind === 'rejected' ? 'runner_rejected' : 'test_cancelled';
      failure = new R2StageNotReached(reason); throw failure;
    }
    return await body();
  } finally {
    options.root.abort();
    const ended = await terminal;
    options.signal.removeEventListener('abort', cancel);
    if (failure) failure.cleanup = ended.kind === 'terminal' ? ended.result.cleanup : 'unconfirmed';
  }
}
