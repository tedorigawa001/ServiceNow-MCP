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
    description: 'Read-only PoC best-practice review of a local Update Set payload snapshot by sys_id. Australia only; AU-BR-001/002 and AU-CL-004 only. Returns unverified low-confidence candidates with official sources, never source code. For BR/Client Script rule evaluation, explicitly set selection_mode=review_targets: fixed update candidates, 0.3 JSON. Omitted/bounded_all keeps the legacy 0.2 all-type bounded window. Neither inventories all assets: ACL-before-limit and coarse prefixes can hide targets. Partial/zero findings do not establish safety or compliance. Bounded to 100 selected metadata rows plus one lookahead and 60 seconds; no external code/LLM lookup.',
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
