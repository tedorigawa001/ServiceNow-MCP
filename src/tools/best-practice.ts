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
    description: 'Read-only PoC review of Update Set payloads by sys_id, Australia only. Defaults: AU-BR-001/002 and AU-CL-004. BR opt-ins: AU-QRY-001 (literal addQuery LIKE), AU-QRY-002 (two-argument reserved-name addQuery and fixed one-argument addEncodedQuery; index/search settings remain unverified), AU-BR-004 (script declarations), AU-BR-005 (before BR post-abort), AU-BR-007 (before_display writes). Client Script opt-ins: AU-CL-006 (UI Policy), AU-CL-002 (lookup necessity), AU-CL-008 (type=onChange loading guard and lookup intent), AU-CL-003 (type=onLoad, per-lookup static/runtime/unknown input evidence and timing/exposure review), AU-CL-007 (bounded document-derived versus createElement-subtree DOM lookup candidates; standard UI ownership is not inferred from selectors), AU-CL-005 (two-argument g_form-derived setValue; reference field type and display value availability remain unverified; three-argument calls are outside this rule). Static inputs do not prove data availability before loading. Dynamic inputs do not prove scratchpad is unsuitable. Never blanket-recommend scratchpad, expose sensitive data, auto-migrate, delete lookups or add return/update. Source-free low-confidence candidates with official sources, not certification. Unresolved evidence prevents analysis_complete. selection_mode=review_targets returns 0.3; omitted/bounded_all keeps 0.2. ACL-before-limit/coarse prefixes can hide targets. Zero findings never establish safety. Limits: 100 metadata rows plus lookahead, 60 seconds. No code execution/external LLM lookup.',
    // AU-CL-002 remains an explicit opt-in; defaults and bounded acquisition are unchanged.
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
