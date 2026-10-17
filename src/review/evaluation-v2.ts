/** BP-4 v0.2: frozen gold expectations never become engine input or alter predictions. */
import { z } from 'zod';
import { reviewUpdateSetPayload } from './payload-review.js';
import { reviewResultSchema } from './result-schema.js';
import { sha256 } from './update-xml.js';
import { RULE_SPECIFIC_FOLLOW_UP } from './follow-up-catalog.js';

const rules = ['AU-BR-001', 'AU-BR-002', 'AU-CL-004'] as const;
const specificFollowup = RULE_SPECIFIC_FOLLOW_UP;
const expectationSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('abstain'), reason: z.enum(['release_unknown', 'release_mismatch', 'missing_context',
    'javascript_parse_failed', 'missing_script', 'duplicate_field', 'identity_mismatch']) }),
  z.strictObject({ mode: z.literal('decision'), outcome: z.enum(['candidate', 'clear', 'candidate_with_followup']),
    // Preserve the frozen v0.2 subset and semantics; vocabulary ownership is shared.
    required_follow_up: z.array(z.enum([...Object.values(RULE_SPECIFIC_FOLLOW_UP), 'binding_and_reachability'])).max(4).default([]),
    required_limitations: z.array(z.literal('inactive_asset')).max(1).default([]),
  }).superRefine((e, ctx) => {
    if (e.outcome === 'candidate_with_followup') {
      if (!e.required_follow_up.some(f => f !== 'binding_and_reachability') && !e.required_limitations.length)
        ctx.addIssue({ code: 'custom', message: 'Followup expectations need specific context, not generic advice alone' });
    } else if (e.required_follow_up.length || e.required_limitations.length)
      ctx.addIssue({ code: 'custom', message: 'Only followup expectations declare requirements' });
    if (new Set(e.required_follow_up).size !== e.required_follow_up.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate requirement' });
  }),
]);
const caseSchema = z.strictObject({
  id: z.string().regex(/^V2-[PCFI]\d{2}$/), category: z.enum(['problem', 'no_problem', 'exception', 'insufficient']),
  rule_id: z.enum(rules), code: z.string().max(8000), rationale: z.string().min(1).max(1000),
  when: z.string().max(40).optional(), active: z.boolean().optional(),
  release: z.enum(['Australia', 'Zurich']).nullable().optional(), omit_script: z.boolean().optional(),
  duplicate_script: z.boolean().optional(), identity_mismatch: z.boolean().optional(), expectation: expectationSchema,
}).superRefine((c, ctx) => {
  const expected = { problem: 'candidate', no_problem: 'clear', exception: 'candidate_with_followup', insufficient: 'abstain' }[c.category];
  if ((c.expectation.mode === 'abstain' ? 'abstain' : c.expectation.outcome) !== expected)
    ctx.addIssue({ code: 'custom', message: 'Category and expectation mismatch' });
  if (c.expectation.mode === 'decision' && c.expectation.required_follow_up.some(f => f !== 'binding_and_reachability' && f !== specificFollowup[c.rule_id]))
    ctx.addIssue({ code: 'custom', message: 'Followup belongs to a different rule' });
});
export const evaluationV2SetSchema = z.strictObject({ version: z.literal('bp4-synthetic-0.2'),
  provenance: z.string().min(1), cases: z.array(caseSchema).length(72),
}).superRefine((set, ctx) => {
  if (new Set(set.cases.map(c => c.id)).size !== 72) ctx.addIssue({ code: 'custom', message: 'Duplicate case IDs' });
  for (const category of ['problem', 'no_problem', 'exception', 'insufficient']) for (const rule of rules)
    if (set.cases.filter(c => c.category === category && c.rule_id === rule).length !== 6)
      ctx.addIssue({ code: 'custom', message: 'Six cases required per category/rule cell' });
});
type Case = z.infer<typeof caseSchema>;
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function buildInput(c: Case) {
  const table = c.rule_id === 'AU-CL-004' ? 'sys_script_client' : 'sys_script';
  const id = sha256(c.id).slice(0, 32);
  const field = (name: string, text: string) => `<${name}>${escape(text)}</${name}>`;
  const script = field('script', c.code);
  const body = field('sys_id', c.identity_mismatch ? 'f'.repeat(32) : id) + field('sys_scope', 'global')
    + field('active', String(c.active ?? true)) + (c.when === undefined ? '' : field('when', c.when))
    + (c.omit_script ? '' : script) + (c.duplicate_script ? script : '');
  const family = c.release === undefined ? 'Australia' : c.release;
  return { name: `${table}_${id}`, update_set_id: '2'.repeat(32), update_xml_sys_id: sha256(`xml:${c.id}`).slice(0, 32),
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE">${body}</${table}></record_update>`,
    retrieved_at: '2026-10-17T05:00:00Z', record_updated_at: null,
    instance_release: { family, raw_buildname: family, source: 'sys_cluster_state.build_name',
      retrieved_at: family === null ? null : '2026-10-17T04:59:00Z',
      resolution_status: family === null ? 'unknown' : 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: [c.rule_id] };
}
const outputSchema = z.discriminatedUnion('status', [
  z.strictObject({ poc_only: z.literal(true), status: z.literal('reviewed'), result: reviewResultSchema }),
  z.strictObject({ poc_only: z.literal(true), status: z.literal('rejected'), reason: z.enum([
    'invalid_input', 'invalid_xml', 'forbidden_dtd', 'forbidden_instruction', 'unsupported_xml_version', 'element_limit',
    'depth_limit', 'forbidden_namespace', 'unsupported_envelope', 'ambiguous_record', 'deleted_asset', 'unsupported_action',
    'duplicate_field', 'nested_field', 'text_limit', 'code_limit', 'unexpected_text', 'payload_limit', 'missing_script',
    'identity_mismatch', 'invalid_scope', 'rule_asset_mismatch', 'javascript_parse_failed', 'analysis_limit', 'analysis_failed', 'finding_limit', 'invalid_result_context',
  ]) }),
]);
type Counts = { tp: number; fp: number; tn: number; fn: number; negative_abstentions: number; assessed: number; total: number };
const newCounts = (): Counts => ({ tp: 0, fp: 0, tn: 0, fn: 0, negative_abstentions: 0, assessed: 0, total: 0 });
export function wilsonSummary(successes: number, total: number) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || successes < 0 || total < successes) throw new Error('Invalid counts');
  if (!total) return { successes, total, rate: null, wilson_95: null };
  const z = 1.959963984540054, p = successes / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return { successes, total, rate: p, wilson_95: { lower: Math.max(0, center - half), upper: Math.min(1, center + half) } };
}
const metrics = (c: Counts) => ({ ...c, precision: wilsonSummary(c.tp, c.tp + c.fp),
  recall: wilsonSummary(c.tp, c.tp + c.fn), assessment_coverage: wilsonSummary(c.assessed, c.total) });

export function evaluateBestPracticeV2(raw: unknown, review: (input: unknown) => unknown = reviewUpdateSetPayload) {
  const set = evaluationV2SetSchema.parse(raw);
  const overall = newCounts();
  const byRule = Object.fromEntries(rules.map(r => [r, newCounts()]));
  let invalidOutputs = 0, confirmedFindings = 0, infoTotal = 0, infoCorrect = 0;
  let followupTotal = 0, followupCorrect = 0, followupDetected = 0, followupDetectedCorrect = 0;
  let decisionTotal = 0, exactCorrect = 0, contractCorrect = 0;
  const confusion: Record<string, Record<string, number>> = Object.fromEntries(
    ['candidate', 'clear', 'candidate_with_followup'].map(e => [e, { candidate: 0, clear: 0, candidate_with_followup: 0, abstain: 0 }]));
  const rows = set.cases.map(c => {
    const input = buildInput(c);
    let validated: ReturnType<typeof outputSchema.safeParse>;
    try { validated = outputSchema.safeParse(review(input)); }
    catch { validated = outputSchema.safeParse(null); }
    let output = validated.success ? validated.data : null;
    if (output?.status === 'reviewed') {
      const r = output.result, t = r.target;
      const id = input.name.slice(-32);
      const maxLine = c.code.split(/\r\n|[\r\n\u2028\u2029]/).length;
      if (t.target_version !== 'update_set_payload' || t.asset_sys_id !== id || t.update_xml_sys_id !== input.update_xml_sys_id
        || t.update_set_id !== input.update_set_id || `${t.asset_table}_${id}` !== input.name
        || t.field !== 'script' || t.sys_scope !== 'global' || t.retrieved_at !== input.retrieved_at || t.record_updated_at !== null
        || JSON.stringify(r.instance_release) !== JSON.stringify(input.instance_release)
        || t.code_hash !== sha256(c.code) || t.payload_hash !== sha256(input.payload)
        || r.coverage.requested_rule_ids.length !== 1 || r.coverage.requested_rule_ids[0] !== c.rule_id
        || r.findings.some(f => f.line_end > maxLine)) output = null;
    }
    if (!output) invalidOutputs++;
    const result = output?.status === 'reviewed' ? output.result : null;
    const findings = result?.findings.filter(f => f.rule_id === c.rule_id) ?? [];
    confirmedFindings += result?.findings.filter(f => f.verification_status !== 'candidate').length ?? 0;
    const assessed = result?.coverage.evaluated_rule_ids.includes(c.rule_id) ?? false;
    const hasSpecificFollowup = findings.length > 0 && findings.every(f => f.required_follow_up.includes(specificFollowup[c.rule_id])
      || result!.limitations.includes('inactive_asset'));
    // This classification does not read the gold expectation or its requirements.
    const actual = findings.length ? hasSpecificFollowup ? 'candidate_with_followup' : 'candidate' : assessed ? 'clear' : 'abstain';
    const reasons = !output ? ['invalid_output'] : output.status === 'rejected' ? [output.reason]
      : output.result.coverage.skipped_rules.map(s => s.reason);
    const expected = c.expectation;
    const safeCase = output !== null && (!result || result.findings.every(f => f.verification_status === 'candidate'));
    let satisfied = false;
    const missingFollowup = expected.mode === 'decision' && expected.outcome === 'candidate_with_followup'
      ? expected.required_follow_up.filter(token => !findings.length || findings.some(f => !f.required_follow_up.includes(token))) : [];
    const missingLimitations = expected.mode === 'decision' && expected.outcome === 'candidate_with_followup'
      ? expected.required_limitations.filter(token => !result?.limitations.includes(token)) : [];
    if (expected.mode === 'abstain') {
      infoTotal++;
      satisfied = actual === 'abstain' && reasons.length === 1 && reasons[0] === expected.reason
        && (!result || (result.findings.length === 0 && result.review_status !== 'completed')) && safeCase;
      if (satisfied) infoCorrect++;
    } else {
      decisionTotal++;
      confusion[expected.outcome][actual]++;
      satisfied = expected.outcome === 'clear' ? actual === 'clear'
        : expected.outcome === 'candidate' ? findings.length > 0
          : findings.length > 0 && !missingFollowup.length && !missingLimitations.length;
      satisfied &&= safeCase;
      if (satisfied) contractCorrect++;
      if (satisfied && actual === expected.outcome) exactCorrect++;
      if (expected.outcome === 'candidate_with_followup') {
        followupTotal++;
        if (satisfied) followupCorrect++;
        if (findings.length) { followupDetected++; if (satisfied) followupDetectedCorrect++; }
      }
      for (const counts of [overall, byRule[c.rule_id]]) {
        counts.total++;
        if (assessed) counts.assessed++;
        if (expected.outcome === 'clear') {
          if (findings.length) counts.fp++;
          else if (assessed) counts.tn++;
          else counts.negative_abstentions++;
        } else if (findings.length) counts.tp++;
        else counts.fn++;
      }
    }
    return { case_id: c.id, category: c.category, rule_id: c.rule_id,
      expected: expected.mode === 'abstain' ? 'abstain' : expected.outcome, actual,
      contract_satisfied: satisfied, finding_count: findings.length, reasons,
      missing_follow_up: missingFollowup, missing_limitations: missingLimitations };
  });
  const safetyPassed = invalidOutputs === 0 && confirmedFindings === 0 && infoCorrect === infoTotal;
  return { evaluation_version: set.version, poc_only: true, dataset_hash: sha256(JSON.stringify(set)),
    evaluation_unit: 'case_x_requested_rule', finding_threshold: 'candidate_or_higher', total_cases: rows.length,
    overall: metrics(overall), by_rule: Object.fromEntries(rules.map(r => [r, metrics(byRule[r])])),
    decision_contract: wilsonSummary(contractCorrect, decisionTotal), exact_three_way_match: wilsonSummary(exactCorrect, decisionTotal),
    confusion_matrix: confusion, followup: { all_expected: wilsonSummary(followupCorrect, followupTotal),
      detected_only: wilsonSummary(followupDetectedCorrect, followupDetected) },
    insufficient: wilsonSummary(infoCorrect, infoTotal), safety: { invalid_outputs: invalidOutputs, confirmed_findings: confirmedFindings, passed: safetyPassed },
    contract_suite_passed: safetyPassed && contractCorrect === decisionTotal,
    release_quality_gate: { status: 'not_assessed', approved: false, reason: 'exploratory_synthetic_unadjudicated_sample' },
    limitations: ['synthetic_only', 'author_not_blind', 'related_cases_not_iid', 'human_adjudication_pending',
      'wilson_intervals_descriptive_only', 'three_rules_only', 'no_engine_tuning'], cases: rows };
}
