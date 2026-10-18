/** No raw report rendering: strict lifecycle/receipt validation, then fixed-field projection. */
import { z } from 'zod';
import { aggregateReviewStructure, aggregateReviewV3Structure, assetOutcomeStructure } from './aggregate-schema.js';
import { parseR2HostReceipt, r2HostFailureCodeSchema } from './r2-host-protocol.js';
import { TARGET_LIMITATIONS } from './target-selection.js';
import type { R2SupervisorReport } from './r2-supervisor.js';
const reason = z.enum(['host_failed', 'deadline_exceeded', 'preflight_timeout', 'protocol_error', 'cancelled',
  'forced_stop', 'cleanup_incomplete', 'fatal', 'termination_unconfirmed', 'spawn_failed', 'invalid_options', 'unsupported_platform', 'completed', 'review_failed']);
const signal = z.enum(['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGKILL',
  'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGALRM', 'SIGTERM', 'SIGCHLD', 'SIGCONT', 'SIGSTOP', 'SIGTSTP',
  'SIGTTIN', 'SIGTTOU', 'SIGURG', 'SIGXCPU', 'SIGXFSZ', 'SIGVTALRM', 'SIGPROF', 'SIGWINCH', 'SIGIO', 'SIGPWR', 'SIGSYS']);
const fields = {
  terminal_reason: reason, process_termination: z.enum(['not_started', 'confirmed', 'unconfirmed']),
  exit_observed: z.boolean(), close_observed: z.boolean(), cleanup: z.enum(['complete', 'incomplete', 'unknown']),
  token_issuance: z.enum(['not_attempted', 'possible', 'unknown']), other_account_token: z.enum(['possible', 'not_reported', 'unknown']),
  kill_request: z.enum(['not_requested', 'sent', 'failed']),
  host_exit: z.strictObject({ code: z.number().int().min(0).max(255).nullable(), signal: signal.nullable() }),
};
const reportStructure = z.strictObject({ schema_version: z.literal('bp5-r2-host-exit-0.1'), ...fields, runner_receipt: z.unknown().optional() });
export const r2SupervisorReportSchema = reportStructure.superRefine((r, ctx) => {
  const fail = () => ctx.addIssue({ code: 'custom', message: 'inconsistent_supervisor_report' });
  const confirmed = r.exit_observed && r.close_observed;
  if ((r.process_termination === 'confirmed') !== confirmed) fail();
  if (r.process_termination === 'unconfirmed' && r.terminal_reason !== 'termination_unconfirmed'
    || r.terminal_reason === 'termination_unconfirmed' && r.process_termination !== 'unconfirmed') fail();
  if (r.exit_observed ? (r.host_exit.code === null) === (r.host_exit.signal === null)
    : r.host_exit.code !== null || r.host_exit.signal !== null) fail();
  if (r.process_termination === 'not_started' && r.exit_observed) fail();
  if (r.host_exit.code === 71 && r.cleanup !== 'incomplete') fail();
  const receipt = r.runner_receipt === undefined ? undefined : parseR2HostReceipt(r.runner_receipt);
  if (r.runner_receipt !== undefined && !receipt) fail();
  if (!receipt) {
    if (r.cleanup === 'complete' || r.token_issuance !== 'unknown' || r.other_account_token !== 'unknown'
      || ['completed', 'review_failed'].includes(r.terminal_reason)) fail();
    if (r.cleanup === 'incomplete' && r.host_exit.code !== 71) fail();
    return;
  }
  if (!confirmed || r.cleanup !== 'complete' || r.kill_request !== 'not_requested' || r.host_exit.signal !== null
    || !['completed', 'review_failed', 'cancelled', 'deadline_exceeded'].includes(r.terminal_reason)) fail();
  if (r.token_issuance !== (receipt.tokenMayHaveBeenIssued ? 'possible' : 'not_attempted')
    || r.other_account_token !== (receipt.otherAccountTokenPossible ? 'possible' : 'not_reported')) fail();
  const stopping = ['cancelled', 'deadline_exceeded'].includes(r.terminal_reason);
  const expectedCode = stopping ? 130 : receipt.ok ? receipt.result.isError ? 10 : 0 : receipt.code === 'deadline_exceeded' ? 124 : 10;
  if (r.host_exit.code !== expectedCode || stopping && receipt.ok) fail();
  if (!stopping && r.terminal_reason !== (receipt.ok && !receipt.result.isError ? 'completed' : 'review_failed')) fail();
}).transform(r => ({ ...r, ...(r.runner_receipt === undefined ? {} : { runner_receipt: parseR2HostReceipt(r.runner_receipt)! }) }));

export function parseR2SupervisorReport(value: unknown): R2SupervisorReport | undefined {
  try { const parsed = r2SupervisorReportSchema.safeParse(value); return parsed.success ? parsed.data as R2SupervisorReport : undefined; }
  catch { return undefined; }
}

const limitations = z.enum(['unclassified', 'source_approval_pending', 'caller_acl_visible_only', 'metadata_truncated',
  'error_details_truncated', 'response_truncated', 'finding_budget_exceeded', 'provisional_results', 'changed_during_review',
  'consistency_unverified', 'soft_deadline_reached', 'deadline_exceeded', 'request_budget_exceeded', 'receive_budget_exceeded',
  'payload_budget_exceeded', 'authentication_failed', 'access_denied', 'upstream_unavailable', 'release_unknown', 'release_mismatch',
  'release_operator_asserted', 'release_not_observed', 'release_config_may_be_stale', 'release_observation_unavailable',
  'release_visible_nodes_only', 'release_evidence_conflict', ...TARGET_LIMITATIONS]);
const errorCode = z.enum([...aggregateReviewV3Structure.shape.errors.element.shape.code.options, ...r2HostFailureCodeSchema.options,
  'worker_unavailable']);
const countReasons = <T extends z.ZodType<string>>(schema: T) => z.array(z.strictObject({ reason: schema, count: z.number().int().min(1).max(100) })).max(100);
export const r2ExitSummarySchema = z.strictObject({ schema_version: z.literal('bp5-r2-exit-summary-0.1'),
  interpretation: z.literal('lifecycle_only_not_safety'), ...fields,
  runner_code: r2HostFailureCodeSchema.optional(), tool_error_code: errorCode.optional(),
  review: z.strictObject({ schema_version: z.enum(['bp-mcp-review-0.2', 'bp-mcp-review-0.3']),
    status: aggregateReviewStructure.shape.status, isError: z.boolean(), analysis_complete: z.boolean(),
    counts: aggregateReviewStructure.shape.counts, limitation_counts: countReasons(limitations),
    rejection_counts: countReasons(assetOutcomeStructure.options[3].shape.reason), error_counts: countReasons(errorCode) }).optional(),
});
export type R2ExitSummary = z.infer<typeof r2ExitSummarySchema>;
function counts(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => ({ reason, count }));
}
export function summarizeR2Report(value: unknown): R2ExitSummary | undefined {
  try {
    const report = parseR2SupervisorReport(value);
    if (!report) return undefined;
    const { runner_receipt, ...metadata } = report;
    const summary: Record<string, unknown> = { ...metadata, schema_version: 'bp5-r2-exit-summary-0.1', interpretation: 'lifecycle_only_not_safety' };
    if (runner_receipt && !runner_receipt.ok) summary.runner_code = runner_receipt.code;
    if (runner_receipt?.ok) {
      // parseR2HostReceipt already checked and canonicalized this bounded JSON.
      const body = JSON.parse(runner_receipt.result.content[0].text);
      const run = body.schema_version ? body : body.result;
      if (!body.schema_version) summary.tool_error_code = body.error.code;
      if (run) summary.review = { schema_version: run.schema_version, status: run.status, isError: runner_receipt.result.isError,
        analysis_complete: run.coverage.analysis_complete, counts: run.counts,
        limitation_counts: counts(run.limitations.map((v: string) => limitations.safeParse(v).success ? v : 'unclassified')),
        rejection_counts: counts(run.assets.filter((a: {state: string}) => a.state === 'rejected').map((a: {reason: string}) => a.reason)),
        error_counts: counts(run.errors.map((e: {code: string}) => e.code)) };
    }
    const parsed = r2ExitSummarySchema.safeParse(summary);
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}
