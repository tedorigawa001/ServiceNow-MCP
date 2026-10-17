/** Offline, case-level evaluation. Gold labels never modify the review engine. */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { reviewUpdateSetPayload } from './payload-review.js';

const caseSchema = z.strictObject({
  id: z.string().regex(/^[PNEI]\d{2}$/),
  label: z.enum(['problem', 'no_problem', 'exception', 'insufficient']),
  rule_id: z.enum(['AU-BR-001', 'AU-BR-002', 'AU-CL-004']),
  code: z.string().max(8000), rationale: z.string().min(1).max(1000),
  when: z.string().max(40).optional(), active: z.boolean().optional(),
  release: z.enum(['Australia', 'Zurich']).nullable().optional(),
  condition: z.string().max(1000).optional(), filter_tree: z.boolean().optional(),
  auxiliary_script: z.string().max(1000).optional(), omit_script: z.boolean().optional(),
  expected_reason: z.enum(['release_unknown', 'release_mismatch', 'javascript_parse_failed', 'missing_script', 'missing_context']).optional(),
}).refine(c => (c.label === 'insufficient') === (c.expected_reason !== undefined), 'Only insufficient cases require a reason');
export const evaluationSetSchema = z.strictObject({
  version: z.literal('bp4-synthetic-0.1'), provenance: z.string().min(1), cases: z.array(caseSchema).length(48),
}).superRefine((set, ctx) => {
  if (new Set(set.cases.map(c => c.id)).size !== 48) ctx.addIssue({ code: 'custom', message: 'Case IDs must be unique' });
  for (const label of ['problem', 'no_problem', 'exception', 'insufficient']) {
    for (const rule of ['AU-BR-001', 'AU-BR-002', 'AU-CL-004']) {
      if (set.cases.filter(c => c.label === label && c.rule_id === rule).length !== 4) ctx.addIssue({ code: 'custom', message: 'Each label/rule cell must contain four cases' });
    }
  }
});
type EvaluationCase = z.infer<typeof caseSchema>;
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function buildInput(c: EvaluationCase) {
  const table = c.rule_id === 'AU-CL-004' ? 'sys_script_client' : 'sys_script';
  const sysId = '1'.repeat(32);
  const field = (key: string, value: string) => `<${key}>${escape(value)}</${key}>`;
  const body = field('sys_id', sysId) + field('sys_scope', 'global')
    + (c.when === undefined ? '' : field('when', c.when))
    + field('active', String(c.active ?? true)) + (c.omit_script ? '' : field('script', c.code))
    + (c.condition === undefined ? '' : field('condition', c.condition))
    + (c.filter_tree ? '<filter_condition><item field="priority" operator="VALCHANGES" value=""/></filter_condition>' : '');
  const aux = c.auxiliary_script === undefined ? '' : `<sys_es_latest_script>${field('script', c.auxiliary_script)}</sys_es_latest_script>`;
  const family = c.release === undefined ? 'Australia' : c.release;
  return { name: `${table}_${sysId}`, update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE">${body}</${table}>${aux}</record_update>`,
    retrieved_at: '2026-10-17T05:00:00Z', record_updated_at: null,
    instance_release: { family, raw_buildname: family, source: 'sys_cluster_state.build_name',
      retrieved_at: family === null ? null : '2026-10-17T04:59:00Z',
      resolution_status: family === null ? 'unknown' : 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: [c.rule_id] };
}

type Counts = { tp: number; fp: number; tn: number; fn: number; negative_abstentions: number; assessed: number; total: number };
const counts = (): Counts => ({ tp: 0, fp: 0, tn: 0, fn: 0, negative_abstentions: 0, assessed: 0, total: 0 });
const ratio = (n: number, d: number) => d ? Number((n / d).toFixed(6)) : null;
const metrics = (n: Counts) => ({ ...n, precision: ratio(n.tp, n.tp + n.fp), recall: ratio(n.tp, n.tp + n.fn),
  assessment_coverage: ratio(n.assessed, n.total) });

/** Predictions are measured at case × requested-rule level, not occurrence level. */
export function evaluateBestPracticeCases(raw: unknown, review = reviewUpdateSetPayload) {
  const set = evaluationSetSchema.parse(raw);
  const overall = counts();
  const byRule: Record<string, Counts> = {};
  const byLabel: Record<string, Counts> = {};
  let abstentions = 0, correctAbstentions = 0, confirmedFindings = 0;
  const rows = set.cases.map(c => {
    const output = review(buildInput(c));
    const relevant = output.status === 'reviewed' ? output.result.findings.filter(f => f.rule_id === c.rule_id) : [];
    if (output.status === 'reviewed') confirmedFindings += output.result.findings.filter(f => f.verification_status !== 'candidate').length;
    const assessed = output.status === 'reviewed' && output.result.coverage.evaluated_rule_ids.includes(c.rule_id);
    const actual = relevant.length ? 'candidate' : assessed ? 'clear' : 'abstain';
    const reasons = output.status === 'rejected' ? [output.reason]
      : output.result.coverage.skipped_rules.filter(s => s.rule_id === c.rule_id).map(s => s.reason);
    const classification = c.label === 'insufficient' ? 'abstain_check'
      : c.label === 'problem' ? actual === 'candidate' ? 'tp' : 'fn'
        : actual === 'candidate' ? 'fp' : actual === 'clear' ? 'tn' : 'negative_abstention';
    const abstentionCorrect = c.label === 'insufficient' && actual === 'abstain' && reasons.length === 1 && reasons[0] === c.expected_reason
      && (output.status === 'rejected' || (output.result.findings.length === 0 && output.result.review_status !== 'completed'));
    if (c.label === 'insufficient') { abstentions++; if (abstentionCorrect) correctAbstentions++; }
    else for (const group of [overall, byRule[c.rule_id] ??= counts(), byLabel[c.label] ??= counts()]) {
      group.total++;
      if (assessed) group.assessed++;
      if (classification === 'negative_abstention') group.negative_abstentions++;
      else if (classification !== 'abstain_check') group[classification]++;
    }
    return { case_id: c.id, label: c.label, rule_id: c.rule_id, actual, classification,
      finding_count: relevant.length, reasons, ...(c.label === 'insufficient' ? { abstention_correct: abstentionCorrect } : {}) };
  });
  const measured = metrics(overall);
  const targets = { precision: 0.8, recall: 0.9, assessment_coverage: 1, abstention_accuracy: 1, confirmed_findings: 0 };
  const abstentionAccuracy = ratio(correctAbstentions, abstentions);
  return { evaluation_version: set.version, poc_only: true,
    // Canonical parsed data hash identifies the exact labels and synthetic inputs; not a source-code hash.
    dataset_hash: createHash('sha256').update(JSON.stringify(set)).digest('hex'),
    evaluation_unit: 'case_x_requested_rule', finding_threshold: 'candidate_or_higher',
    total_cases: rows.length, overall: measured,
    by_rule: Object.fromEntries(Object.entries(byRule).map(([id, n]) => [id, metrics(n)])),
    by_label: Object.fromEntries(Object.entries(byLabel).map(([label, n]) => [label, metrics(n)])),
    insufficient: { total: abstentions, correct: correctAbstentions, accuracy: abstentionAccuracy },
    confirmed_findings: confirmedFindings, targets,
    quality_gate_passed: (measured.precision ?? 0) >= targets.precision && (measured.recall ?? 0) >= targets.recall
      && measured.assessment_coverage === 1 && abstentionAccuracy === 1 && confirmedFindings === 0,
    limitations: ['synthetic_only', 'author_not_blind', 'human_adjudication_pending', 'related_cases_not_independent_samples',
      'candidate_noise_not_confirmed_vulnerability_false_positives', 'exception_context_not_available_to_engine', 'three_rules_only'],
    cases: rows };
}
