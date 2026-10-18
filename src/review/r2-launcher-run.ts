/** Internal run entry: the approval-bound launcher is the only execution path. No raw result output. */
import { parseR2LauncherArguments } from './r2-launcher-args.js';
import type { R2ApprovedLaunchOptions } from './r2-approved-launch.js';
import type { R2TtyOptions } from './r2-tty-approval.js';
import { parseR2EntryTerminal, type R2EntryTerminal } from './r2-entry-terminal.js';
import { canWriteR2EntryNotice, writeR2EntryNotice } from './r2-entry-display.js';
import { runR2CheckPlanEntry } from './r2-launcher-check-plan.js';

export interface R2RunEntryOptions extends Omit<R2ApprovedLaunchOptions, 'tty' | 'onTerminalPriority'> {
  input?: R2TtyOptions['input']; output?: R2TtyOptions['output']; approvalTimeoutMs?: number;
  /** Fixed internal bootstrap state only, never an argv/manifest callback. */
  onKnownPriority?: (code: 71 | 73) => void;
}
const base = { schema_version: 'bp5-r2-entry-terminal-0.1', finalization: 'complete', fatal: false } as const;
async function notice(text: string, output: NonNullable<R2TtyOptions['output']>, timeout: number): Promise<boolean> {
  const root = new AbortController(), cancel = () => root.abort();
  // Launcher has already detached its handlers (or has not started). Do not stack signal owners.
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  try { return await writeR2EntryNotice(output, text, root.signal, timeout); }
  finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
}
export async function runR2ApprovedEntry(args: readonly string[], options: R2RunEntryOptions = {}): Promise<R2EntryTerminal> {
  const fixed = { ...options, checker: { ...options.checker }, supervisor: { ...options.supervisor } };
  const input = fixed.input ?? process.stdin, output = fixed.output ?? process.stderr, timeout = fixed.displayTimeoutMs ?? 1000;
  let priority: 71 | 73 | undefined;
  const remember = (code: 71 | 73) => {
    if (priority === 73 || priority === code) return;
    priority = code; fixed.onKnownPriority?.(code);
  };
  const parsedArgs = parseR2LauncherArguments(args);
  if (!parsedArgs || parsedArgs.mode !== 'run')
    return runR2CheckPlanEntry([], { output, signal: fixed.signal, displayTimeoutMs: timeout });
  if (!canWriteR2EntryNotice(output, timeout)) return { ...base, mode: 'entry', code: 'usage', display: 'failed' };
  const finish = async (result: unknown): Promise<R2EntryTerminal> => {
    // Validate everything before inspecting stage/code/report; never salvage individual raw fields.
    const parsed = parseR2EntryTerminal({ ...base, mode: 'run', result, display: 'failed' });
    if (!parsed || parsed.mode !== 'run') {
      const shown = await notice('report_unavailable\n', output, timeout);
      return { ...base, mode: 'entry', code: 'report_unavailable', display: shown ? 'confirmed' : 'failed' };
    }
    const run = parsed.result;
    if (run.stage === 'execution' || run.stage === 'display') {
      if (run.report?.terminal_reason === 'termination_unconfirmed') remember(73);
      else if (run.report?.cleanup === 'incomplete' || run.report?.terminal_reason === 'cleanup_incomplete') remember(71);
      // The launcher already showed the strict summary. Never print it twice or fall back to raw JSON.
      return { ...parsed, display: run.stage === 'execution' ? 'confirmed' : 'failed' };
    }
    if (run.stage === 'check' && run.code === 'checker_termination_unconfirmed') remember(73);
    const shown = await notice(`${JSON.stringify({ schema_version: 'bp5-r2-run-notice-0.1', stage: run.stage, code: run.code })}\n`, output, timeout);
    return { ...parsed, display: shown ? 'confirmed' : 'failed' };
  };
  try {
    if (!input.isTTY || input.isRaw || input.destroyed || input.readableEnded || input.readableLength
      || input.listenerCount('data') || input.listenerCount('readable'))
      return await finish({ stage: 'approval', ok: false, code: 'approval_unavailable' });
    const { approveAndRunR2Plan } = await import('./r2-approved-launch.js');
    return await finish(await approveAndRunR2Plan(parsedArgs.path, { signal: fixed.signal, checker: fixed.checker, supervisor: fixed.supervisor,
      tty: { input, output, timeoutMs: fixed.approvalTimeoutMs }, displayTimeoutMs: timeout,
      onTerminalPriority: remember }));
  } catch { return { ...base, mode: 'entry', code: 'fatal', fatal: true, display: 'failed' }; }
}
