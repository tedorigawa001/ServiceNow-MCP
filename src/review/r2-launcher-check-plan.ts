/** Repository-only offline entry body. No host/execution approval, session, SDK or browser path. */
import { isAbsolute, normalize } from 'node:path';
import { runR2PlanCheck, type R2PlanCheckProcessOptions } from './r2-plan-check-process.js';
import { r2PlanCheckSchema, rejectedR2PlanCheck } from './r2-plan-check.js';
import type { R2EntryTerminal } from './r2-entry-terminal.js';
import { canWriteR2EntryNotice, writeR2EntryNotice, type R2EntryOutput } from './r2-entry-display.js';

export interface R2CheckPlanEntryOptions {
  output?: R2EntryOutput;
  signal?: AbortSignal;
  /** Internal OS test boundary/lower-only limits. Never argv/manifest/env inputs. */
  checker?: Omit<R2PlanCheckProcessOptions, 'signal'>;
  displayTimeoutMs?: number;
  /** Fixed internal bootstrap notification. Not an argv/manifest callback or execution grant. */
  onTerminationUnconfirmed?: () => void;
}
export async function runR2CheckPlanEntry(args: readonly string[], options: R2CheckPlanEntryOptions = {}): Promise<R2EntryTerminal> {
  const output = options.output ?? process.stderr, timeout = options.displayTimeoutMs ?? 1000;
  const root = new AbortController(), cancel = () => root.abort();
  const external = options.signal, checker = { ...options.checker };
  const onTerminationUnconfirmed = options.onTerminationUnconfirmed;
  const base = { schema_version: 'bp5-r2-entry-terminal-0.1', finalization: 'complete', fatal: false } as const;
  if (!canWriteR2EntryNotice(output, timeout)) return { ...base, mode: 'entry', code: 'usage', display: 'failed' };
  const path = Array.isArray(args) && args.length === 1 ? args[0]
    : Array.isArray(args) && args.length === 2 && args[0] === 'check-plan' ? args[1] : undefined;
  const valid = process.platform !== 'win32' && typeof path === 'string' && isAbsolute(path)
    && normalize(path) === path && path.length <= 4096 && !path.includes('\0');
  external?.addEventListener('abort', cancel, { once: true });
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  if (external?.aborted) cancel();
  try {
    if (!valid) {
      const shown = await writeR2EntryNotice(output, 'Usage: r2-launcher [check-plan] <absolute-manifest-path>\nOffline validation only; run is unavailable.\n', root.signal, timeout);
      return { ...base, mode: 'entry', code: 'usage', display: shown ? 'confirmed' : 'failed' };
    }
    const parsed = r2PlanCheckSchema.safeParse(await runR2PlanCheck(path, { ...checker, signal: root.signal }));
    if (!parsed.success) {
      const shown = await writeR2EntryNotice(output, 'report_unavailable\n', root.signal, timeout);
      return { ...base, mode: 'entry', code: 'report_unavailable', display: shown ? 'confirmed' : 'failed' };
    }
    if (parsed.data.status === 'rejected' && parsed.data.code === 'checker_termination_unconfirmed') onTerminationUnconfirmed?.();
    // Decide the terminal result before rendering, so the notice never shows a validity it does not return.
    const result = root.signal.aborted && parsed.data.status === 'offline_valid' ? rejectedR2PlanCheck('checker_cancelled') : parsed.data;
    // A cancellation already observed by the checker still gets one bounded fixed terminal notice.
    const noticeSignal = root.signal.aborted ? new AbortController().signal : root.signal;
    const shown = await writeR2EntryNotice(output, `${JSON.stringify(result)}\n`, noticeSignal, timeout);
    return { ...base, mode: 'check-plan', result, display: shown ? 'confirmed' : 'failed' };
  } catch {
    // Fixed fatal state only: do not inspect/retain/output filesystem, stream or consumer reasons.
    return { ...base, mode: 'entry', code: 'fatal', display: 'failed', fatal: true };
  } finally {
    process.off('SIGINT', cancel); process.off('SIGTERM', cancel); external?.removeEventListener('abort', cancel);
  }
}
