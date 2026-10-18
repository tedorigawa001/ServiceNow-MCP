/** Internal, repository-only terminal contract. No process, display, signal or retry side effects. */
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { r2PlanCheckSchema, r2PlanCheckFailureCodeSchema } from './r2-plan-check.js';
import { r2SupervisorReportSchema, r2ExitSummarySchema, summarizeR2Report } from './r2-report-summary.js';

const approvalCode = z.enum(['approval_denied', 'approval_timeout', 'approval_cancelled', 'approval_unavailable']);
const report = r2SupervisorReportSchema;
const launchResult = z.discriminatedUnion('stage', [
  z.strictObject({ stage: z.literal('check'), ok: z.literal(false), code: r2PlanCheckFailureCodeSchema }),
  z.strictObject({ stage: z.literal('approval'), ok: z.literal(false), code: approvalCode }),
  z.strictObject({ stage: z.literal('display'), ok: z.literal(false),
    code: z.enum(['display_failed', 'report_unavailable']), report: report.optional() }),
  z.strictObject({ stage: z.literal('execution'), report, summary: r2ExitSummarySchema }),
]);
const state = {
  schema_version: z.literal('bp5-r2-entry-terminal-0.1'),
  display: z.enum(['confirmed', 'failed']),
  finalization: z.enum(['complete', 'incomplete']),
  fatal: z.boolean(),
};
export const r2EntryTerminalSchema = z.discriminatedUnion('mode', [
  z.strictObject({ ...state, mode: z.literal('check-plan'), result: r2PlanCheckSchema }),
  z.strictObject({ ...state, mode: z.literal('run'), result: launchResult }),
  z.strictObject({ ...state, mode: z.literal('entry'), code: z.enum(['fatal', 'usage', 'report_unavailable']) }),
]).superRefine((value, ctx) => {
  if (value.mode !== 'run') return;
  const result = value.result;
  if (result.stage === 'execution' && !isDeepStrictEqual(summarizeR2Report(result.report), result.summary)) {
    ctx.addIssue({ code: 'custom', message: 'inconsistent_entry_summary' });
  }
  if (result.stage === 'display' && value.display !== 'failed') {
    ctx.addIssue({ code: 'custom', message: 'inconsistent_entry_display' });
  }
});
export type R2EntryTerminal = z.infer<typeof r2EntryTerminalSchema>;
export function parseR2EntryTerminal(value: unknown): R2EntryTerminal | undefined {
  try {
    const parsed = r2EntryTerminalSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; } // Never expose raw inputs, Zod issues, getters or exception messages.
}

export const R2_ENTRY_EXIT = Object.freeze({
  completed: 0, failed: 10, usage: 64, fatal: 70, cleanup_incomplete: 71, forced_stop: 72,
  termination_unconfirmed: 73, report_unavailable: 80, display_failed: 81, approval_denied: 82,
  timeout: 124, cancelled: 130,
} as const);
export type R2EntryExitCode = typeof R2_ENTRY_EXIT[keyof typeof R2_ENTRY_EXIT];

/** Validate the entire snapshot before inspecting priority fields. Invalid raw data is never evidence. */
export function selectR2EntryExitCode(input: unknown): R2EntryExitCode {
  const value = parseR2EntryTerminal(input);
  if (!value) return R2_ENTRY_EXIT.report_unavailable;
  const result = value.mode === 'entry' ? undefined : value.result;
  const supervisor = value.mode === 'run' && (value.result.stage === 'execution' || value.result.stage === 'display')
    ? value.result.report : undefined;
  const code = value.mode === 'entry' ? value.code
    : value.mode === 'check-plan' ? (value.result.status === 'rejected' ? value.result.code : undefined)
    : value.result.stage === 'execution' ? undefined : value.result.code;
  if (supervisor?.terminal_reason === 'termination_unconfirmed' || code === 'checker_termination_unconfirmed') return 73;
  if (value.finalization === 'incomplete' || supervisor?.cleanup === 'incomplete'
    || supervisor?.terminal_reason === 'cleanup_incomplete') return 71;
  if (value.fatal || code === 'fatal' || supervisor?.terminal_reason === 'fatal') return 70;
  if (supervisor?.terminal_reason === 'forced_stop') return 72;
  if (code === 'report_unavailable') return 80;
  if (value.display === 'failed' || code === 'display_failed') return 81;
  if (['checker_timeout', 'approval_timeout', 'preflight_timeout', 'deadline_exceeded'].includes(code ?? supervisor?.terminal_reason ?? '')) return 124;
  if (['checker_cancelled', 'approval_cancelled', 'cancelled'].includes(code ?? supervisor?.terminal_reason ?? '')) return 130;
  if (code === 'approval_denied') return 82;
  if (code === 'usage') return 64;
  if (value.mode === 'check-plan' && result && 'status' in result && result.status === 'offline_valid') return 0;
  if (value.mode === 'run' && value.result.stage === 'execution' && supervisor?.terminal_reason === 'completed') return 0;
  return 10;
}
