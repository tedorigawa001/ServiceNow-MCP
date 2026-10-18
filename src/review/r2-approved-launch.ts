/** Repository-only connection. Fixed terminal projection only; no raw report, public CLI, browser or token input. */
import { runR2PlanCheck, type R2PlanCheckProcessOptions } from './r2-plan-check-process.js';
import { requestR2TtyApproval, type R2TtyOptions } from './r2-tty-approval.js';
import { superviseR2Host, type R2SupervisorOptions, type R2SupervisorReport } from './r2-supervisor.js';
import { R2TerminalDisplay } from './r2-terminal-display.js';
import { parseR2SupervisorReport, type R2ExitSummary } from './r2-report-summary.js';
export interface R2ApprovedLaunchOptions {
  signal?: AbortSignal;
  tty?: Omit<R2TtyOptions, 'signal' | 'signalOwner' | 'checkedPlan'>;
  checker?: Omit<R2PlanCheckProcessOptions, 'signal'>;
  supervisor?: Omit<R2SupervisorOptions, 'approvedDigest' | 'signal'>;
  /** Lower-only terminal observation budget. Does not extend host execution. */
  displayTimeoutMs?: number;
}
export type R2ApprovedLaunchResult = { stage: 'check' | 'approval'; ok: false; code: string }
  | { stage: 'display'; ok: false; code: 'display_failed' | 'report_unavailable'; report?: R2SupervisorReport }
  | { stage: 'execution'; report: R2SupervisorReport; summary: R2ExitSummary };
export async function approveAndRunR2Plan(path: string, options: R2ApprovedLaunchOptions = {}): Promise<R2ApprovedLaunchResult> {
  const fixed = { ...options, tty: { ...options.tty }, checker: { ...options.checker }, supervisor: { ...options.supervisor } };
  const root = new AbortController(), cancel = () => root.abort();
  let display: R2TerminalDisplay | undefined;
  fixed.signal?.addEventListener('abort', cancel, { once: true });
  if (fixed.signal?.aborted) cancel();
  // Exactly one signal owner: this phase ends synchronously before supervisor is invoked.
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  const detach = () => { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); };
  try {
    const check = await runR2PlanCheck(path, { ...fixed.checker, signal: root.signal });
    if (check.status !== 'offline_valid') return { stage: 'check', ok: false, code: check.code };
    const approval = await requestR2TtyApproval(check.digest, { ...fixed.tty, checkedPlan: check, signal: root.signal, signalOwner: 'caller' });
    if (!approval.ok) return { stage: 'approval', ok: false, code: approval.code };
    if (root.signal.aborted) return { stage: 'approval', ok: false, code: 'approval_cancelled' };
    detach();
    display = new R2TerminalDisplay(fixed.tty.output ?? process.stderr, cancel, fixed.displayTimeoutMs);
    // No await between handover and supervisor's synchronous handler registration/spawn.
    const report = await superviseR2Host(path, { ...fixed.supervisor, signal: root.signal, approvedDigest: check.digest,
      onReady: () => { display!.ready(); return fixed.supervisor.onReady?.(); } });
    const checked = parseR2SupervisorReport(report);
    const shown = await display.show(checked ?? report);
    if (!shown.ok) return { stage: 'display', ok: false, code: shown.code, ...(checked ? { report: checked } : {}) };
    return { stage: 'execution', report: checked!, summary: shown.summary };
  } finally { display?.close(); detach(); fixed.signal?.removeEventListener('abort', cancel); }
}
