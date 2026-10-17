/** Policy v0.2: contextual discrimination and intrinsic completeness are separate axes. */
import { z } from 'zod';
import { followupCaseSchema, measureFollowupCases } from './evaluation-followups.js';
import { reviewUpdateSetPayload } from './payload-review.js';
import { FOLLOW_UP_CATALOG_VERSION, FOLLOW_UP_DEFINITIONS, RULE_SPECIFIC_FOLLOW_UP } from './follow-up-catalog.js';
import { wilsonSummary } from './evaluation-v2.js';

const rules = ['AU-BR-001', 'AU-BR-002', 'AU-CL-004'] as const;
const caseSchema = followupCaseSchema('NEXT').safeExtend({ variant: z.enum(['ordinary', 'defensive', 'control', 'boundary']) });
export const followupPolicySetSchema = z.strictObject({ version: z.literal('followups-policy-0.2'), provenance: z.string().min(1),
  cases: z.array(caseSchema).length(24),
}).superRefine((set, ctx) => {
  if (new Set(set.cases.map(c => c.id)).size !== 24 || new Set(set.cases.map(c => c.code.trim())).size !== 24)
    ctx.addIssue({ code: 'custom', message: 'Duplicate cases' });
  for (const rule of rules) for (const variant of ['ordinary', 'defensive', 'control', 'boundary'])
    if (set.cases.filter(c => c.rule_id === rule && c.variant === variant).length !== 2)
      ctx.addIssue({ code: 'custom', message: 'Two cases required per rule/variant' });
  for (const c of set.cases) {
    if ((c.variant === 'boundary') !== (c.basis === 'semantic_boundary')) ctx.addIssue({ code: 'custom', message: 'Boundary mismatch' });
    if (FOLLOW_UP_DEFINITIONS[RULE_SPECIFIC_FOLLOW_UP[c.rule_id]].kind === 'rule_intrinsic' && c.expected.some(e => !e.followup))
      ctx.addIssue({ code: 'custom', message: 'Detected intrinsic-rule findings always require their item' });
  }
});

export function evaluateFollowupPolicy(raw: unknown, review: (input: unknown) => unknown = reviewUpdateSetPayload) {
  const set = followupPolicySetSchema.parse(raw);
  const base = measureFollowupCases(set, review, FOLLOW_UP_CATALOG_VERSION);
  const variants = new Map(set.cases.map(c => [c.id, c.variant]));
  const rows = base.cases.map(c => ({ ...c, variant: variants.get(c.case_id)!,
    followup_kind: FOLLOW_UP_DEFINITIONS[RULE_SPECIFIC_FOLLOW_UP[c.rule_id]].kind }));
  type Row = typeof rows[number];
  const sum = (xs: Row[], key: 'followup_tp' | 'followup_fp' | 'followup_fn' | 'followup_tn' | 'negative_unassessed'
    | 'detection_tp' | 'detection_fp' | 'detection_fn' | 'missing_attached_followups' | 'missed_candidate_followups') => xs.reduce((n, r) => n + r[key], 0);
  const context = (xs: Row[]) => {
    const tp = sum(xs, 'followup_tp'), fp = sum(xs, 'followup_fp'), fn = sum(xs, 'followup_fn');
    return { cases: xs.length, tp, fp, fn, tn: sum(xs, 'followup_tn'), negative_unassessed: sum(xs, 'negative_unassessed'),
      precision: wilsonSummary(tp, tp + fp), recall: wilsonSummary(tp, tp + fn),
      attached_item_misses: sum(xs, 'missing_attached_followups'), candidate_misses: sum(xs, 'missed_candidate_followups') };
  };
  const intrinsic = (xs: Row[]) => {
    const detected = sum(xs, 'detection_tp') + sum(xs, 'detection_fp');
    const wrongRule = xs.reduce((n, c) => n + c.wrong_rule_codes.length, 0);
    const attached = sum(xs, 'followup_tp') + sum(xs, 'followup_fp') - wrongRule;
    const correct = sum(xs, 'followup_tp'), missed = sum(xs, 'followup_fn');
    return { cases: xs.length, required_item_on_detected: wilsonSummary(attached, detected),
      missing_on_detected: detected - attached, wrong_rule_items: wrongRule,
      end_to_end_required_item_recall: wilsonSummary(correct, correct + missed),
      candidate_fp: sum(xs, 'detection_fp'), candidate_fn: sum(xs, 'detection_fn'),
      candidate_misses_with_required_item: sum(xs, 'missed_candidate_followups'),
      note: 'Completeness on detected candidates is not exception discrimination or candidate accuracy.' };
  };
  const groups = <T>(kind: Row['followup_kind'], summarize: (xs: Row[]) => T) => {
    const xs = rows.filter(c => c.followup_kind === kind);
    return { all: summarize(xs), declared_scope: summarize(xs.filter(c => c.basis === 'catalog_contract')),
      semantic_boundary: summarize(xs.filter(c => c.basis === 'semantic_boundary')),
      by_variant: Object.fromEntries(['ordinary', 'defensive', 'control', 'boundary'].map(v => [v, summarize(xs.filter(c => c.variant === v))])) };
  };
  // Do not expose the old mixed followup aggregate as a headline metric in this policy report.
  const { overall, by_basis: _byBasis, cases: _cases, ...metadata } = base;
  void _byBasis; void _cases;
  return { ...metadata, evaluation_unit: 'separate_context_discrimination_and_intrinsic_completeness',
    rule_policy: Object.fromEntries(rules.map(rule => [rule, FOLLOW_UP_DEFINITIONS[RULE_SPECIFIC_FOLLOW_UP[rule]].kind])),
    candidate_detection: { tp: overall.detection_tp, fp: overall.detection_fp, fn: overall.detection_fn },
    by_rule: Object.fromEntries(rules.map(rule => {
      const xs = rows.filter(c => c.rule_id === rule), kind = FOLLOW_UP_DEFINITIONS[RULE_SPECIFIC_FOLLOW_UP[rule]].kind;
      return [rule, { kind, cases: xs.length, expectation_satisfied: xs.filter(c => c.expectation_satisfied).length,
        metrics: kind === 'context_specific' ? context(xs) : intrinsic(xs) }];
    })),
    context_discrimination: groups('context_specific', context), intrinsic_completeness: groups('rule_intrinsic', intrinsic), cases: rows };
}
