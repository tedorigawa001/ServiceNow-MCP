/** New, frozen followup evaluation. No engine tuning, execution or network access. */
import { z } from 'zod';
import { reviewUpdateSetPayload } from './payload-review.js';
import { reviewResultSchema } from './result-schema.js';
import { COMMON_FOLLOW_UP_CODES, RULE_SPECIFIC_FOLLOW_UP, CONTEXT_LIMITATIONS,
  followUpCodeSchema, isFollowUpApplicable } from './follow-up-catalog.js';
import { sha256 } from './update-xml.js';
import { wilsonSummary } from './evaluation-v2.js';

const rules = ['AU-BR-001', 'AU-BR-002', 'AU-CL-004'] as const;
export function followupCaseSchema(prefix: 'NEW' | 'NEXT') { return z.strictObject({
  id: z.string().regex(new RegExp(`^${prefix}-[WAJ]\\d{2}$`)), rule_id: z.enum(rules),
  basis: z.enum(['catalog_contract', 'semantic_boundary']), scenario: z.string().min(1).max(80),
  code: z.string().min(1).max(8000), when: z.string().max(40).optional(), condition: z.string().max(1000).optional(),
  expected: z.array(z.strictObject({ line: z.number().int().positive(), followup: z.boolean() })).max(10),
  limitations: z.array(z.enum(Object.keys(CONTEXT_LIMITATIONS) as [keyof typeof CONTEXT_LIMITATIONS, ...Array<keyof typeof CONTEXT_LIMITATIONS>])).max(3),
  rationale: z.string().min(1).max(1000),
}).superRefine((c, ctx) => {
  const rulePrefix = { 'AU-BR-001': `${prefix}-W`, 'AU-BR-002': `${prefix}-A`, 'AU-CL-004': `${prefix}-J` }[c.rule_id];
  if (!c.id.startsWith(rulePrefix) || new Set(c.expected.map(e => e.line)).size !== c.expected.length
    || c.expected.some(e => e.line > c.code.split(/\r\n|[\r\n\u2028\u2029]/).length)
    || new Set(c.limitations).size !== c.limitations.length) ctx.addIssue({ code: 'custom', message: 'Invalid case structure' });
}); }
const caseSchema = followupCaseSchema('NEW');
export const followupEvaluationSetSchema = z.strictObject({ version: z.literal('followups-new-0.1'),
  provenance: z.string().min(1), cases: z.array(caseSchema).length(36),
}).superRefine((set, ctx) => {
  if (new Set(set.cases.map(c => c.id)).size !== 36 || new Set(set.cases.map(c => c.code.trim())).size !== 36)
    ctx.addIssue({ code: 'custom', message: 'Duplicate cases' });
  for (const rule of rules) for (const [basis, count] of [['catalog_contract', 8], ['semantic_boundary', 4]] as const)
    if (set.cases.filter(c => c.rule_id === rule && c.basis === basis).length !== count)
      ctx.addIssue({ code: 'custom', message: 'Unbalanced evaluation cells' });
});
type Case = z.infer<typeof caseSchema>;
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function buildInput(c: Case) {
  const table = c.rule_id === 'AU-CL-004' ? 'sys_script_client' : 'sys_script', id = sha256(c.id).slice(0, 32);
  const field = (name: string, value: string) => `<${name}>${escape(value)}</${name}>`;
  const body = field('sys_id', id) + field('sys_scope', 'global') + field('active', 'true')
    + (c.when === undefined ? '' : field('when', c.when)) + (c.condition === undefined ? '' : field('condition', c.condition))
    + '<filter_condition><item field="active" value="true"/></filter_condition>' + field('script', c.code);
  return { name: `${table}_${id}`, update_set_id: sha256('new-followups-set').slice(0, 32), update_xml_sys_id: sha256(`new-xml:${c.id}`).slice(0, 32),
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE">${body}</${table}><sys_translated_text action="delete_multiple"/><sys_es_latest_script><script>ignoredAuxiliaryScript();</script></sys_es_latest_script></record_update>`,
    retrieved_at: '2026-10-17T08:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-17T07:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: [c.rule_id] };
}
const reviewedSchema = z.strictObject({ poc_only: z.literal(true), status: z.literal('reviewed'), result: reviewResultSchema });
const outputSchema = z.discriminatedUnion('status', [reviewedSchema,
  z.strictObject({ poc_only: z.literal(true), status: z.literal('rejected'), reason: z.enum([
    'invalid_input', 'invalid_xml', 'forbidden_dtd', 'forbidden_instruction', 'unsupported_xml_version', 'element_limit',
    'depth_limit', 'forbidden_namespace', 'unsupported_envelope', 'ambiguous_record', 'deleted_asset', 'unsupported_action',
    'duplicate_field', 'nested_field', 'text_limit', 'code_limit', 'unexpected_text', 'payload_limit', 'missing_script',
    'identity_mismatch', 'invalid_scope', 'rule_asset_mismatch', 'javascript_parse_failed', 'analysis_limit', 'analysis_failed', 'finding_limit', 'invalid_result_context',
  ]) }),
]);
type Counts = { detection_tp: number; detection_fp: number; detection_fn: number; followup_tp: number; followup_fp: number;
  followup_fn: number; followup_tn: number; negative_unassessed: number; missed_candidate_followups: number; missing_attached_followups: number };
const counts = (): Counts => ({ detection_tp: 0, detection_fp: 0, detection_fn: 0, followup_tp: 0, followup_fp: 0,
  followup_fn: 0, followup_tn: 0, negative_unassessed: 0, missed_candidate_followups: 0, missing_attached_followups: 0 });
function summary(c: Counts) { return { ...c, followup_precision: wilsonSummary(c.followup_tp, c.followup_tp + c.followup_fp),
  followup_recall: wilsonSummary(c.followup_tp, c.followup_tp + c.followup_fn) }; }

export function evaluateNewFollowups(raw: unknown, review: (input: unknown) => unknown = reviewUpdateSetPayload) {
  const set = followupEvaluationSetSchema.parse(raw);
  return measureFollowupCases(set, review, 'bp-followups-0.2'); // Frozen report metadata, not current catalog policy.
}

/** Internal measurement shared by versioned, validated case-set wrappers. */
export function measureFollowupCases(set: { version: string; provenance: string; cases: Case[] },
  review: (input: unknown) => unknown, catalogVersion: string) {
  const overall = counts(), byBasis = { catalog_contract: counts(), semantic_boundary: counts() };
  const versions = new Set<string>();
  let invalidOutputs = 0, unsafeFindings = 0, reviewRejections = 0;
  const rows = set.cases.map(c => {
    const input = buildInput(c);
    let output: ReturnType<typeof outputSchema.safeParse>;
    try { output = outputSchema.safeParse(review(input)); } catch { output = outputSchema.safeParse(null); }
    const rejected = output.success && output.data.status === 'rejected' ? output.data.reason : null;
    let result = output.success && output.data.status === 'reviewed' ? output.data.result : null;
    if (result) {
      const t = result.target, id = input.name.slice(-32), maxLine = c.code.split(/\r\n|[\r\n\u2028\u2029]/).length;
      if (t.target_version !== 'update_set_payload' || t.asset_sys_id !== id || `${t.asset_table}_${id}` !== input.name
        || t.update_xml_sys_id !== input.update_xml_sys_id || t.update_set_id !== input.update_set_id || t.sys_scope !== 'global'
        || t.field !== 'script' || t.code_hash !== sha256(c.code) || t.payload_hash !== sha256(input.payload)
        || t.retrieved_at !== input.retrieved_at || t.record_updated_at !== null
        || JSON.stringify(result.instance_release) !== JSON.stringify(input.instance_release)
        || result.coverage.requested_rule_ids.length !== 1 || result.coverage.requested_rule_ids[0] !== c.rule_id
        || result.findings.some(f => f.rule_id !== c.rule_id || f.line_end > maxLine
          || f.required_follow_up.some(token => !followUpCodeSchema.safeParse(token).success))) result = null;
    }
    if (rejected) reviewRejections++;
    else if (!result) invalidOutputs++;
    else { versions.add(result.ruleset_version); unsafeFindings += result.findings.filter(f => f.verification_status !== 'candidate').length; }
    const assessed = result?.coverage.evaluated_rule_ids.includes(c.rule_id) ?? false;
    const remaining = [...(result?.findings ?? [])], ownCode = RULE_SPECIFIC_FOLLOW_UP[c.rule_id];
    const units: Array<{ line: number; expected_followup: boolean; candidate_detected: boolean; actual_followup: boolean }> = [];
    const local = counts();
    for (const expected of c.expected) {
      const index = remaining.findIndex(f => f.line_start === expected.line);
      const f = index < 0 ? undefined : remaining.splice(index, 1)[0];
      const attached = f?.required_follow_up.includes(ownCode) ?? false;
      if (f) local.detection_tp++; else local.detection_fn++;
      if (expected.followup) {
        if (attached) local.followup_tp++;
        else { local.followup_fn++; if (f) local.missing_attached_followups++; else local.missed_candidate_followups++; }
      } else if (attached) local.followup_fp++;
      else if (f) local.followup_tn++; else local.negative_unassessed++;
      units.push({ line: expected.line, expected_followup: expected.followup, candidate_detected: !!f, actual_followup: attached });
    }
    local.detection_fp = remaining.length;
    local.followup_fp += remaining.filter(f => f.required_follow_up.includes(ownCode)).length;
    const wrongCodes = result?.findings.flatMap(f => f.required_follow_up.filter(token => {
      const code = followUpCodeSchema.parse(token);
      return !COMMON_FOLLOW_UP_CODES.includes(code as typeof COMMON_FOLLOW_UP_CODES[number]) && !isFollowUpApplicable(code, c.rule_id);
    })) ?? [];
    local.followup_fp += wrongCodes.length;
    const missingLimitations = c.limitations.filter(l => !result?.limitations.includes(l));
    const extraLimitations = (result?.limitations ?? []).filter(l => l in CONTEXT_LIMITATIONS && !c.limitations.includes(l as keyof typeof CONTEXT_LIMITATIONS));
    const safe = result !== null && result.findings.every(f => f.verification_status === 'candidate');
    const satisfied = safe && assessed && !local.detection_fp && !local.detection_fn && !local.followup_fp && !local.followup_fn
      && !missingLimitations.length && !extraLimitations.length;
    for (const target of [overall, byBasis[c.basis]]) for (const key of Object.keys(local) as Array<keyof Counts>) target[key] += local[key];
    return { case_id: c.id, rule_id: c.rule_id, basis: c.basis, scenario: c.scenario, expectation_satisfied: satisfied,
      invalid_output: result === null && !rejected, rejection_reason: rejected, assessed, ...local, units, extra_candidate_lines: remaining.map(f => f.line_start),
      wrong_rule_codes: wrongCodes, missing_limitations: missingLimitations, extra_limitations: extraLimitations };
  });
  return { evaluation_version: set.version, dataset_hash: sha256(JSON.stringify(set)), poc_only: true,
    follow_up_catalog_version: catalogVersion, engine_ruleset_versions: [...versions].sort(),
    total_cases: rows.length, evaluation_unit: 'finding_line_x_requested_rule_x_specific_code',
    overall: summary(overall), by_basis: Object.fromEntries(Object.entries(byBasis).map(([basis, c]) => [basis, summary(c)])),
    case_expectation: wilsonSummary(rows.filter(r => r.expectation_satisfied).length, rows.length),
    by_rule: Object.fromEntries(rules.map(rule => [rule, { cases: rows.filter(r => r.rule_id === rule).length,
      satisfied: rows.filter(r => r.rule_id === rule && r.expectation_satisfied).length }])),
    safety: { invalid_outputs: invalidOutputs, review_rejections: reviewRejections, confirmed_findings: unsafeFindings, passed: !invalidOutputs && !unsafeFindings },
    suite_passed: rows.every(r => r.expectation_satisfied) && !invalidOutputs && !unsafeFindings,
    release_quality_gate: { approved: false, status: 'not_assessed' },
    limitations: ['new_synthetic_cases_only', 'author_has_seen_engine', 'not_blind_or_iid', 'human_adjudication_pending',
      'no_detector_changes_during_measurement', 'semantic_boundaries_exceed_declared_contract', 'wilson_intervals_descriptive_only'], cases: rows };
}
