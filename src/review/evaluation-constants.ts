import { z } from 'zod';
import { followupCaseSchema } from './evaluation-followups.js';
import { measureFollowupPolicy } from './evaluation-followups-policy.js';
import { reviewUpdateSetPayload } from './payload-review.js';
import { FOLLOW_UP_CATALOG_VERSION } from './follow-up-catalog.js';

export const constantValidationSetSchema = z.strictObject({ version: z.literal('constant-validation-0.1'),
  provenance: z.string().min(1), cases: z.array(followupCaseSchema('CONST')).length(18),
}).superRefine((set, ctx) => {
  if (new Set(set.cases.map(c => c.id)).size !== 18 || new Set(set.cases.map(c => c.code.trim())).size !== 18)
    ctx.addIssue({ code: 'custom', message: 'Duplicate validation cases' });
  for (const rule of ['AU-BR-001', 'AU-BR-002', 'AU-CL-004'])
    for (const [basis, count] of [['catalog_contract', 5], ['semantic_boundary', 1]] as const)
      if (set.cases.filter(c => c.rule_id === rule && c.basis === basis).length !== count)
        ctx.addIssue({ code: 'custom', message: 'Five declared cases and one boundary required per rule' });
});

export function evaluateConstantValidation(raw: unknown, review: (input: unknown) => unknown = reviewUpdateSetPayload) {
  return measureFollowupPolicy(constantValidationSetSchema.parse(raw), review, FOLLOW_UP_CATALOG_VERSION);
}
