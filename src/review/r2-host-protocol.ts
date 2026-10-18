/** Secret-free IPC validation. No OAuth/session imports or access to secret comparison values. */
import { z } from 'zod';
import { aggregateReviewStructure, anyAggregateReviewSchema } from './aggregate-schema.js';
import type { R2RunnerOutcome } from './r2-runner.js';

const failureCodes = [
  'manifest_untrusted', 'manifest_invalid', 'manifest_unavailable', 'manifest_consumer_failed', 'approval_expired',
  'approval_validity_insufficient', 'release_config_expired', 'release_config_validity_insufficient',
  'manifest_binding_mismatch', 'manifest_clock_invalid', 'manifest_changed', 'invalid_runner_options',
  'runner_failed', 'cancelled', 'interrupted', 'deadline_exceeded', 'host_budget_invalid', 'cleanup_notification_failed',
  'invalid_oauth_config', 'authorization_unavailable', 'authorization_consumer_failed', 'callback_rejected',
  'authorization_denied', 'authorization_timeout', 'exchange_outcome_unknown', 'exchange_rejected',
  'invalid_token_response', 'token_expired', 'consumer_failed', 'invalid_session', 'identity_access_denied',
  'identity_unconfirmed', 'identity_mismatch', 'identity_request_failed', 'identity_budget_exceeded', 'review_busy',
  'review_failed', 'cleanup_incomplete', 'secret_output_detected', 'callback_unavailable', 'start_page_reused', 'listener_failed',
] as const;
export const r2HostFailureCodeSchema = z.enum(failureCodes);
const receiptBase = { cleanup: z.literal('complete'), mcpListed: z.boolean(), tokenMayHaveBeenIssued: z.boolean(),
  otherAccountTokenPossible: z.boolean() };
const receiptSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ...receiptBase, ok: z.literal(false), code: r2HostFailureCodeSchema }),
  z.strictObject({ ...receiptBase, ok: z.literal(true), result: z.strictObject({ isError: z.boolean(),
    content: z.array(z.strictObject({ type: z.literal('text'), text: z.string().max(262144) })).length(1) }) }),
]);
const errorShape = aggregateReviewStructure.shape.errors.element.shape;
const toolErrorSchema = z.strictObject({ status: z.literal('failed'),
  error: z.strictObject({ stage: z.enum([...errorShape.stage.options, 'identity']),
    code: z.enum([...errorShape.code.options, ...failureCodes, 'worker_unavailable', 'candidate_filter_violation']) }),
  result: anyAggregateReviewSchema.optional(),
});

/** Never return raw strings rejected by a schema, or original JSON whitespace/duplicate fields. */
export function parseR2HostReceipt(value: unknown): R2RunnerOutcome | undefined {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const receipt = parsed.data;
  if (receipt.otherAccountTokenPossible && !receipt.tokenMayHaveBeenIssued || receipt.ok &&
      (!receipt.mcpListed || !receipt.tokenMayHaveBeenIssued || receipt.otherAccountTokenPossible)) return undefined;
  if (!receipt.ok) return receipt;
  let body: unknown;
  try { body = JSON.parse(receipt.result.content[0].text); } catch { return undefined; }
  const checked = receipt.result.isError ? toolErrorSchema.safeParse(body) : anyAggregateReviewSchema.safeParse(body);
  if (!checked.success) return undefined;
  const aggregate = 'schema_version' in checked.data ? checked.data : checked.data.result;
  if (aggregate && aggregate.principal.auth_mode !== 'per-user' ||
      !receipt.result.isError && aggregate?.status === 'failed') return undefined;
  return { ...receipt, result: { ...receipt.result, content: [{ type: 'text', text: JSON.stringify(checked.data) }] } };
}
