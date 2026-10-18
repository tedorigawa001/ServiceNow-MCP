/** Repository-only connection. No public CLI, browser automation, result printing or token input. */
import { runR2PlanCheck, type R2PlanCheckProcessOptions } from './r2-plan-check-process.js';
import { requestR2TtyApproval, type R2TtyOptions } from './r2-tty-approval.js';
import { superviseR2Host, type R2SupervisorOptions, type R2SupervisorReport } from './r2-supervisor.js';
export interface R2ApprovedLaunchOptions {
  signal?: AbortSignal;
  tty?: Omit<R2TtyOptions, 'signal' | 'signalOwner' | 'checkedPlan'>;
  checker?: Omit<R2PlanCheckProcessOptions, 'signal'>;
  supervisor?: Omit<R2SupervisorOptions, 'approvedDigest' | 'signal'>;
}
export type R2ApprovedLaunchResult = { stage: 'check' | 'approval'; ok: false; code: string }
  | { stage: 'execution'; report: R2SupervisorReport };
export async function approveAndRunR2Plan(path: string, options: R2ApprovedLaunchOptions = {}): Promise<R2ApprovedLaunchResult> {
  const fixed = { ...options, tty: { ...options.tty }, checker: { ...options.checker }, supervisor: { ...options.supervisor } };
  const root = new AbortController(), cancel = () => root.abort();
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
    // No await between handover and supervisor's synchronous handler registration/spawn.
    return { stage: 'execution', report: await superviseR2Host(path, { ...fixed.supervisor, signal: root.signal, approvedDigest: check.digest }) };
  } finally { detach(); fixed.signal?.removeEventListener('abort', cancel); }
}
