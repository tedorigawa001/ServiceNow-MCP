/** Versioned BP-5 data contracts only. No fetching, release resolution or engine invocation. */
import { z } from 'zod';
import { reviewResultStructure } from './result-schema.js';
import { matchCatalogRelease, RULES, SOURCES } from './catalog.js';
import { followUpCodeSchema, isFollowUpApplicable, ONLOAD_INPUT_FOLLOW_UP, DOM_SCOPE_FOLLOW_UP, FULLTEXT_METHOD_FOLLOW_UP } from './follow-up-catalog.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const bp5RuleIdSchema = z.enum(['AU-BR-001', 'AU-BR-002', 'AU-CL-004', 'AU-QRY-001', 'AU-BR-004', 'AU-BR-005', 'AU-BR-007', 'AU-CL-006', 'AU-CL-002', 'AU-CL-008', 'AU-CL-003', 'AU-CL-007', 'AU-CL-005', 'AU-QRY-002']);
export const bp5RuleIdsSchema = z.array(bp5RuleIdSchema).min(1).max(14);
export const bp5RulesetFor = (rules: readonly string[]) => rules.includes('AU-QRY-002') ? 'bp3-0.15' as const
  : rules.includes('AU-CL-005') ? 'bp3-0.14' as const
  : rules.includes('AU-CL-007') ? 'bp3-0.13' as const
  : rules.includes('AU-CL-003') ? 'bp3-0.12' as const
  : rules.includes('AU-CL-008') ? 'bp3-0.11' as const
  : rules.includes('AU-CL-002') ? 'bp3-0.10' as const
  : rules.includes('AU-CL-006') ? 'bp3-0.9' as const
  : rules.includes('AU-BR-007') ? 'bp3-0.8' as const
  : rules.includes('AU-BR-005') ? 'bp3-0.7' as const
  : rules.includes('AU-BR-004') ? 'bp3-0.6' as const
  : rules.includes('AU-QRY-001') ? 'bp3-0.5' as const : 'bp3-0.4' as const;
const family = z.enum(['Australia', 'Brazil', 'Zurich', 'Yokohama', 'Xanadu']);
const asserted = z.strictObject({
  source: z.literal('operator_config'), resolution_status: z.literal('asserted'),
  family, visibility_scope: z.literal('operator_configured'),
  instance_binding: hash, config_version: hash,
  asserted_at: z.iso.datetime(), expires_at: z.iso.datetime(),
});
export const releaseEvidenceStructure = z.discriminatedUnion('source', [
  asserted,
  z.strictObject({ source: z.literal('sys_cluster_state.build_name'), resolution_status: z.literal('resolved'),
    family, raw_buildname: z.string().min(1).max(40), observed_at: z.iso.datetime(), visibility_scope: z.literal('caller_acl') }),
  z.strictObject({ source: z.literal('conflict'), resolution_status: z.literal('unknown'), family: z.null(),
    observed_families: z.array(family).min(1).max(20), configured_family: family.nullable(),
    observed_at: z.iso.datetime(), visibility_scope: z.literal('caller_acl') }),
  z.strictObject({ source: z.literal('none'), resolution_status: z.literal('unknown'), family: z.null(),
    visibility_scope: z.literal('unavailable'), reason: z.enum(['not_configured', 'observation_unavailable',
      'config_expired', 'config_validity_insufficient', 'config_binding_mismatch', 'observation_incomplete', 'observation_inconsistent', 'observation_limit']) }),
]);
export type ReleaseEvidence = z.infer<typeof releaseEvidenceStructure>;

/** Uses the result timestamp, never wall-clock time, so archived results remain reproducible. */
export function checkReleaseEvidence(e: ReleaseEvidence, at: string, binding: string, limits: string[]): string[] {
  const errors: string[] = [];
  if (e.source === 'operator_config') {
    if (e.instance_binding !== binding) errors.push('Release evidence belongs to another instance');
    if (Date.parse(e.asserted_at) > Date.parse(at) || Date.parse(e.expires_at) <= Date.parse(at)) {
      errors.push('Operator assertion must be current at review time');
    }
    for (const warning of ['release_operator_asserted', 'release_not_observed', 'release_config_may_be_stale',
      'release_observation_unavailable']) if (!limits.includes(warning)) errors.push('Missing required assertion warning');
  } else if (e.source === 'sys_cluster_state.build_name') {
    if (e.family.toLowerCase() !== e.raw_buildname.trim().toLowerCase()
      || Date.parse(e.observed_at) > Date.parse(at)) errors.push('Invalid observation');
    if (!limits.includes('release_visible_nodes_only')) errors.push('Visible-node observation needs a scope limitation');
  } else if (e.source === 'conflict') {
    const families = new Set([...e.observed_families, ...(e.configured_family ? [e.configured_family] : [])]);
    if (families.size < 2 || new Set(e.observed_families).size !== e.observed_families.length
      || Date.parse(e.observed_at) > Date.parse(at)) errors.push('Conflict requires distinct, dated evidence');
    if (!limits.includes('release_evidence_conflict')) errors.push('Missing conflict limitation');
  } else if (!limits.includes(e.reason)) errors.push('Missing unavailable-evidence reason');
  return errors;
}
export const releaseMatchForEvidence = (e: ReleaseEvidence) => e.resolution_status === 'unknown' ? 'unknown' : matchCatalogRelease(e.family);
export const reviewResultV2Structure = reviewResultStructure.extend({
  schema_version: z.literal('bp-review-0.2'),
  ruleset_version: z.enum(['bp3-0.4', 'bp3-0.5', 'bp3-0.6', 'bp3-0.7', 'bp3-0.8', 'bp3-0.9', 'bp3-0.10', 'bp3-0.11', 'bp3-0.12', 'bp3-0.13', 'bp3-0.14', 'bp3-0.15']),
  instance_binding: hash,
  target: reviewResultStructure.shape.target.options[0].extend({
    asset_type: z.enum(['business_rule', 'client_script']), asset_table: z.enum(['sys_script', 'sys_script_client']),
    field: z.literal('script'),
  }),
  instance_release: releaseEvidenceStructure,
  coverage: reviewResultStructure.shape.coverage.extend({
    requested_rule_ids: bp5RuleIdsSchema,
    evaluated_rule_ids: z.array(bp5RuleIdSchema).max(14),
    skipped_rules: z.array(reviewResultStructure.shape.coverage.shape.skipped_rules.element.extend({
      rule_id: bp5RuleIdSchema,
    })).max(14),
  }),
  findings: z.array(reviewResultStructure.shape.findings.element.extend({
    rule_id: bp5RuleIdSchema, severity: z.literal('info'), confidence: z.literal('low'),
    verification_status: z.literal('candidate'), verification_evidence: z.array(z.never()).max(0),
    required_follow_up: z.array(followUpCodeSchema).min(1).max(20),
  })).max(100),
});
export const reviewResultV2Schema = reviewResultV2Structure.superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const release = r.instance_release;
  checkReleaseEvidence(release, r.reviewed_at, r.instance_binding, r.limitations).forEach(fail);
  if (!r.limitations.includes('source_approval_pending')) fail('Source approval is pending');
  if (r.review_status === 'completed') fail('Unapproved PoC reviews cannot complete');
  const match = releaseMatchForEvidence(release);
  if (r.release_match !== match) fail('Release match contradicts evidence');
  if (match !== 'matched') {
    const reason = match === 'unknown' ? 'release_unknown' : 'release_mismatch';
    if (r.findings.length || r.coverage.evaluated_rule_ids.length
      || r.coverage.skipped_rules.length !== r.coverage.requested_rule_ids.length
      || r.coverage.skipped_rules.some(s => s.reason !== reason)
      || !r.limitations.includes(reason)) fail('Unmatched release must skip all rules without findings');
  }
  if (release.source === 'operator_config' && r.review_status !== 'partial') fail('Asserted review must remain partial');
  const { requested_rule_ids: requested, evaluated_rule_ids: evaluated, skipped_rules: skipped } = r.coverage;
  if (r.ruleset_version !== bp5RulesetFor(requested)) fail('Ruleset version contradicts requested rules');
  if (r.findings.some(f => f.rule_id === 'AU-BR-004')) {
    const contexts = ['br_global_table_shared_context', 'br_non_global_table_context', 'br_table_context_unknown'];
    if (contexts.filter(x => r.limitations.includes(x)).length !== 1 || !r.limitations.includes('br_declared_variables_only')
      || !r.limitations.includes('br_cross_asset_collisions_not_verified')) fail('BR binding findings need bounded context');
  }
  const accounted = [...evaluated, ...skipped.map(s => s.rule_id)];
  if (evaluated.includes('AU-CL-008') && !r.limitations.includes('onchange_event_payload_onchange')) fail('onChange rules need payload event evidence');
  if (evaluated.includes('AU-CL-003') && !r.limitations.includes('onload_event_payload_onload')) fail('onLoad rules need payload event evidence');
  if (new Set(requested).size !== requested.length || new Set(accounted).size !== accounted.length
    || accounted.length !== requested.length || requested.some(id => !accounted.includes(id))) fail('Coverage must account for every rule exactly once');
  if (requested.some(id => !RULES.find(rule => rule.rule_id === id)!.asset_types.includes(r.target.asset_type))) fail('Rule is not applicable to target');
  if (r.target.asset_table !== (r.target.asset_type === 'business_rule' ? 'sys_script' : 'sys_script_client')) fail('Asset type/table mismatch');
  if (Date.parse(r.target.retrieved_at) > Date.parse(r.reviewed_at)) fail('Retrieval cannot follow review');
  if (r.review_status === 'failed' && r.findings.length) fail('Failed reviews cannot assert findings');
  for (const f of r.findings) {
    if (f.rule_id === 'AU-QRY-002') {
      const methods = Object.entries(FULLTEXT_METHOD_FOLLOW_UP).filter(([, code]) => f.required_follow_up.includes(code));
      if (methods.length !== 1 || !r.limitations.includes(`fulltext_${methods[0]?.[0]}`)
        || !f.required_follow_up.includes('fulltext_index_configuration_review')
        || !['fulltext_br_only', 'fulltext_query_subset', 'fulltext_index_configuration_not_verified', 'fulltext_encoded_syntax_not_verified'].every(x => r.limitations.includes(x))) fail('Text query candidates need method and unverified index evidence');
    }
    if (f.rule_id === 'AU-CL-005' && (!f.required_follow_up.includes('reference_display_value_review')
      || !['setvalue_client_script_only', 'setvalue_two_argument_subset', 'setvalue_reference_type_not_verified', 'setvalue_display_value_availability_not_verified', 'setvalue_ui_compatibility_not_verified'].every(x => r.limitations.includes(x)))) fail('Form setter candidates need bounded context and type/display-value review');
    if (f.rule_id === 'AU-CL-007') {
      const states = Object.entries(DOM_SCOPE_FOLLOW_UP).filter(([, code]) => f.required_follow_up.includes(code));
      if (states.length !== 1 || !r.limitations.includes(`dom_${states[0]?.[0]}`)
        || !f.required_follow_up.includes('dom_dependency_review')
        || !['dom_client_script_only', 'dom_api_subset', 'dom_standard_ui_ownership_not_verified', 'dom_ui_compatibility_not_verified'].every(x => r.limitations.includes(x))) fail('DOM candidates need provenance and ownership review');
    }
    if (f.rule_id === 'AU-CL-003') {
      const states = Object.entries(ONLOAD_INPUT_FOLLOW_UP).filter(([, code]) => f.required_follow_up.includes(code));
      if (states.length !== 1 || !r.limitations.includes(`onload_input_${states[0]?.[0]}`)
        || !f.required_follow_up.includes('onload_data_timing_review')
        || !['onload_client_script_only', 'onload_event_payload_onload', 'onload_data_availability_not_verified', 'onload_data_exposure_not_verified', 'onload_input_analysis_subset'].every(x => r.limitations.includes(x))
        || !['onload_lookup_glide_ajax', 'onload_lookup_client_record_or_reference'].some(x => r.limitations.includes(x))) fail('onLoad candidates need event, input classification and timing/exposure review');
    }
    if (f.rule_id === 'AU-CL-008' && (!f.required_follow_up.includes('onchange_loading_intent_review')
      || !['onchange_client_script_only', 'onchange_event_payload_onchange', 'onchange_loading_intent_not_verified', 'onchange_guard_subset', 'onchange_ui_compatibility_not_verified'].every(x => r.limitations.includes(x))
      || !['onchange_lookup_loading_possible', 'onchange_loading_flow_unresolved'].some(x => r.limitations.includes(x))
      || !['onchange_lookup_glide_ajax', 'onchange_lookup_client_record_or_reference'].some(x => r.limitations.includes(x)))) fail('onChange candidates need event, bounded guard context and intent review');
    if (f.rule_id === 'AU-CL-002' && (!f.required_follow_up.includes('client_lookup_necessity_review')
      || !['client_lookup_client_script_only', 'client_lookup_necessity_not_verified', 'client_lookup_ui_compatibility_not_verified', 'client_lookup_api_subset'].every(x => r.limitations.includes(x))
      || !['client_lookup_get_reference', 'client_lookup_record_get', 'client_lookup_record_query'].some(x => r.limitations.includes(x)))) fail('Client lookup candidates need bounded context and necessity review');
    if (f.rule_id === 'AU-CL-006' && (!f.required_follow_up.includes('ui_policy_suitability_review')
      || !['ui_policy_client_script_only', 'ui_policy_suitability_not_verified', 'ui_policy_ui_compatibility_not_verified', 'ui_policy_api_subset'].every(x => r.limitations.includes(x))
      || !['ui_policy_mandatory_control', 'ui_policy_visibility_control', 'ui_policy_readonly_control'].some(x => r.limitations.includes(x)))) fail('UI Policy candidates need bounded context and suitability review');
    if (f.rule_id === 'AU-BR-007' && (!f.required_follow_up.includes('display_persistence_intent_review')
      || !['display_before_display_only', 'display_field_metadata_not_verified', 'display_persistence_not_verified'].every(x => r.limitations.includes(x))
      || !['display_direct_assignment', 'display_update_expression', 'display_delete_property', 'display_field_setter'].some(x => r.limitations.includes(x)))) fail('Display candidates need bounded context and intent review');
    if (f.rule_id === 'AU-BR-005' && (!f.required_follow_up.includes('post_abort_processing_review')
      || !['abort_before_br_only', 'abort_bounded_order_analysis', 'abort_other_business_rules_not_analyzed'].every(x => r.limitations.includes(x))
      || !['abort_following_call_effect_unverified', 'abort_following_property_write'].some(x => r.limitations.includes(x)))) fail('Abort candidates need bounded context and intent review');
    if (f.rule_id === 'AU-BR-004' && !f.required_follow_up.includes('shared_binding_intent_review')) fail('BR binding candidates need intent review');
    if (!evaluated.includes(f.rule_id) || f.field !== r.target.field || f.line_end < f.line_start) fail('Invalid finding coverage/location');
    const rule = RULES.find(rule => rule.rule_id === f.rule_id)!;
    const source = SOURCES[rule.source_id as keyof typeof SOURCES];
    if (f.sources.length !== 1 || f.sources.some(s => s.source_id !== rule.source_id || s.section !== rule.section
      || s.url !== source.url || s.title !== source.title || s.release !== source.release
      || s.verified_on !== source.verified_on)) fail('Finding source must match the catalog');
    if (!f.required_follow_up.includes('source_approval') || new Set(f.required_follow_up).size !== f.required_follow_up.length
      || f.required_follow_up.some(code => !isFollowUpApplicable(code, f.rule_id))) fail('Invalid follow-up vocabulary/applicability');
  }
  if (r.findings.some(f => f.verification_status !== 'candidate' || f.verification_evidence.length
    || f.severity !== 'info' || f.confidence !== 'low')) fail('BP-5 findings must remain unverified candidates');
});
export type ReviewResultV2 = z.infer<typeof reviewResultV2Schema>;
export const reviewResultV2JsonSchema = {
  ...z.toJSONSchema(reviewResultV2Structure, { target: 'draft-7' }),
  $id: 'urn:servicenow-mcp:best-practice-review-result:0.2',
  $comment: 'PoC only. Structural schema; also run reviewResultV2Schema for evidence time/binding, coverage, source and candidate checks. Does not establish truth or resolve releases.',
};
