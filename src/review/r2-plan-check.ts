/** Internal offline check only. No listener, host, SDK, network or execution grant. */
import { z } from 'zod';
import { loadR2ApprovalManifest, R2ManifestError, type R2ManifestOptions } from './r2-approval-manifest.js';
import { selectionModeSchema } from './target-selection.js';
import { bp5RuleIdsSchema } from './result-schema-v2.js';

export const r2PlanCheckFailureCodeSchema = z.enum([
  'manifest_untrusted', 'manifest_invalid', 'manifest_unavailable', 'manifest_consumer_failed',
  'approval_expired', 'approval_validity_insufficient', 'release_config_expired', 'release_config_validity_insufficient',
  'manifest_binding_mismatch', 'manifest_clock_invalid', 'manifest_changed', 'checker_failed',
  'checker_timeout', 'checker_cancelled', 'checker_termination_unconfirmed',
  'validity_insufficient_for_approval',
]);
const base = { schema_version: z.literal('bp5-r2-plan-check-0.1'), mode: z.literal('check-plan'), pdi: z.literal('not_verified') };
export const r2PlanCheckSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...base, status: z.literal('offline_valid'),
    checks: z.strictObject({ structure: z.literal(true), file_trust: z.literal(true), binding: z.literal(true), validity: z.literal(true) }),
    selection_mode: selectionModeSchema, max_records: z.number().int().min(1).max(100),
    requested_rule_ids: bp5RuleIdsSchema.refine(v => new Set(v).size === v.length),
    has_release_assertion: z.boolean(), digest: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({ ...base, status: z.literal('rejected'), code: r2PlanCheckFailureCodeSchema }),
]);
export type R2PlanCheck = z.infer<typeof r2PlanCheckSchema>;
export const r2PlanCheckJsonSchema = { ...z.toJSONSchema(r2PlanCheckSchema, { target: 'draft-7' }),
  $id: 'urn:servicenow-mcp:r2-plan-check:0.1', $comment: 'Offline validation only. Not human approval, measured release evidence or permission to execute.' };
export function rejectedR2PlanCheck(code: z.infer<typeof r2PlanCheckFailureCodeSchema>): R2PlanCheck {
  return { schema_version: 'bp5-r2-plan-check-0.1', mode: 'check-plan', status: 'rejected', pdi: 'not_verified', code };
}
export async function checkR2PlanOffline(path: string, options: R2ManifestOptions = {}): Promise<R2PlanCheck> {
  let loaded: ReturnType<typeof loadR2ApprovalManifest> | undefined;
  try {
    let checkedAt = NaN;
    loaded = loadR2ApprovalManifest(path, { now: () => checkedAt = (options.now ?? Date.now)() });
    let receipt: R2PlanCheck | undefined;
    const consumed = await loaded.consume((context, digest) => {
      // Preserve 385s runtime validation; this offline gate additionally reserves human/preflight time.
      if (Date.parse(context.approval.expires_at) <= checkedAt + 450000
        || (context.plan.reviewReleaseConfig.assertion
          && Date.parse(context.plan.reviewReleaseConfig.assertion.expires_at) <= checkedAt + 450000)) {
        receipt = rejectedR2PlanCheck('validity_insufficient_for_approval'); return;
      }
      receipt = r2PlanCheckSchema.parse({ ...baseValues, status: 'offline_valid',
        checks: { structure: true, file_trust: true, binding: true, validity: true },
        selection_mode: context.review.selection_mode, max_records: context.review.max_records,
        requested_rule_ids: [...context.review.requested_rule_ids], has_release_assertion: !!context.plan.reviewReleaseConfig.assertion, digest });
    });
    return consumed.ok ? receipt ?? rejectedR2PlanCheck('checker_failed') : rejectedR2PlanCheck(consumed.code);
  } catch (error) {
    // Never serialize raw input, filesystem errors, Zod issues, stacks or causes.
    return rejectedR2PlanCheck(error instanceof R2ManifestError ? error.code : 'checker_failed');
  } finally { loaded?.close(); }
}
const baseValues = { schema_version: 'bp5-r2-plan-check-0.1', mode: 'check-plan', pdi: 'not_verified' } as const;
