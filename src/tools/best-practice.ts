/** Read-only PoC integration. Never returns payloads or raw diagnostics. */
import { z } from 'zod';
import type { ServiceNowClient } from '../servicenow/client.js';
import { reviewBoundedUpdateSet, reviewUpdateSetInputSchema, type BoundedReviewOutcome, type ReviewAdapterOptions } from '../review/update-set-adapter.js';

export const REVIEW_TOOL_NAME = 'review_update_set_best_practices';
// instance is a server-owned selector; it is never passed to the adapter.
export const reviewToolArgumentsSchema = reviewUpdateSetInputSchema.extend({ instance: z.string().min(1).max(100).optional() });
const json = z.toJSONSchema(reviewToolArgumentsSchema, { target: 'draft-7', io: 'input' });
const rulesJson = json.properties?.requested_rule_ids;
export function getBestPracticeToolDefinitions() {
  return [{ name: REVIEW_TOOL_NAME,
    description: 'Read-only PoC review of Update Set payload snapshots by sys_id, Australia only. Defaults: AU-BR-001/002 and AU-CL-004. Explicit BR-only opt-ins: AU-QRY-001 (bounded GlideRecord addQuery literal LIKE, not encoded queries); AU-BR-004 (declared script variables, not function/block locals); AU-BR-005 (before BR post-abort calls/property writes, bounded if/return handling); AU-BR-007 (stored before_display only, bounded current assignments/increments/delete and field setters). Necessary post-abort or display-only changes are not confirmed violations; never auto-add return/update. Sharing/persistence are not approved or verified. Unresolved evidence prevents analysis_complete. Source-free low-confidence candidates with official sources. selection_mode=review_targets returns 0.3; omitted/bounded_all keeps 0.2. ACL-before-limit/coarse prefixes can hide targets. Zero/partial findings never establish safety. Limits: 100 metadata rows plus lookahead, 60 seconds. No code execution/external LLM lookup.',
    inputSchema: { ...json, properties: { ...json.properties,
      requested_rule_ids: { ...(typeof rulesJson === 'object' ? rulesJson : {}), uniqueItems: true } } },
  }];
}
export async function executeBestPracticeToolCall(client: ServiceNowClient, name: string,
  args: Record<string, unknown>, context?: Pick<ReviewAdapterOptions, 'signal' | 'workerFactory'>) {
  if (name !== REVIEW_TOOL_NAME) return null;
  return reviewBoundedUpdateSet(client, args, { signal: context?.signal,
    ...(context?.workerFactory ? { workerFactory: context.workerFactory } : {}) });
}

/** Compact MCP boundary, not the server's generic pretty-printer/error logger. */
export function renderReviewToolOutcome(outcome: BoundedReviewOutcome) {
  const value = outcome.isError ? { status: 'failed', error: outcome.error,
    ...(outcome.result ? { result: outcome.result } : {}) } : outcome.result;
  const result = { content: [{ type: 'text' as const, text: JSON.stringify(value) }], isError: outcome.isError };
  // Include JSON-string escaping and the CallToolResult envelope, not just the
  // aggregate's raw JSON bytes. Never return an oversized, unvalidated fragment.
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 262144) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ status: 'failed',
      error: { stage: 'output', code: 'response_limit' } }) }], isError: true };
  }
  return result;
}
