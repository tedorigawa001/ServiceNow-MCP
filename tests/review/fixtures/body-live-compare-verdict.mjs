/** Pure per-child verdict for the opt-in ABBA comparator. No process, clock or filesystem access. */
export const CHILD_BUDGET_MS = 60000;
export const STREAM_LIMIT_BYTES = 65536;

/**
 * report: { mode, timedOut, closed?: { code, signal, ms }, cleanupConfirmed, spawnError?, outBytes, errBytes }
 * Returns { verdict: 'ok' | 'failed' | 'inconclusive', reason }.
 */
export function classifyChildRun(report) {
  const failed = reason => ({ verdict: 'failed', reason });
  // Supervision, output and cleanup anomalies come first: a control deadline never hides them (SF17).
  if (!report.cleanupConfirmed) return failed('owned_group_cleanup_unconfirmed');
  if (report.spawnError) return failed('spawn_or_signal_error');
  if (!report.closed) return failed('child_unclosed');
  if (report.outBytes > STREAM_LIMIT_BYTES || report.errBytes > STREAM_LIMIT_BYTES) return failed('child_output_truncated');
  if (report.errBytes !== 0) return failed('child_stderr');
  // The deadline is judged from the observed close time as well, not only from the timer having fired.
  if (report.timedOut || report.closed.ms >= CHILD_BUDGET_MS) {
    return report.mode === 'reference' ? { verdict: 'inconclusive', reason: 'control_deadline' } : failed('child_deadline');
  }
  if (report.closed.code !== 0 || report.closed.signal !== null) return failed('child_failed');
  return { verdict: 'ok', reason: 'none' };
}
