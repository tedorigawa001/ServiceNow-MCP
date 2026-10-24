/** BP-5 aggregation contract; does not collect records or run the reviewer. */
import { z } from 'zod';
import { CATALOG_VERSION, RULES } from './catalog.js';
import { requestedAssetTypes, TARGET_FILTER_VERSION, TARGET_LIMITATIONS } from './target-selection.js';
import { bp5RuleIdsSchema, bp5RuleIdSchema, releaseEvidenceStructure, reviewResultV2Structure,
  reviewResultV2Schema, checkReleaseEvidence, releaseMatchForEvidence, bp5RulesetFor } from './result-schema-v2.js';

const id = z.string().regex(/^[a-f0-9]{32}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().min(0).max(100);
const base = { update_xml_sys_id: id };
export const assetOutcomeStructure = z.discriminatedUnion('state', [
  z.strictObject({ ...base, state: z.literal('reviewed'), applicable_rule_ids: bp5RuleIdsSchema, result: reviewResultV2Structure }),
  z.strictObject({ ...base, state: z.literal('not_applicable'), asset_type: z.enum(['business_rule', 'client_script', 'other']),
    reason: z.enum(['asset_type_unsupported', 'no_requested_rules']) }),
  z.strictObject({ ...base, state: z.literal('skipped_deleted'), reason: z.literal('deleted_asset') }),
  z.strictObject({ ...base, state: z.literal('rejected'), reason: z.enum(['invalid_input', 'invalid_xml', 'forbidden_dtd',
    'forbidden_instruction', 'unsupported_xml_version', 'forbidden_namespace', 'unsupported_envelope', 'ambiguous_record',
    'deleted_asset', 'unsupported_action', 'duplicate_field', 'nested_field', 'payload_limit', 'element_limit', 'depth_limit',
    'text_limit', 'code_limit', 'unexpected_text', 'missing_script', 'identity_mismatch', 'invalid_scope',
    'javascript_parse_failed', 'analysis_limit', 'finding_limit', 'analysis_failed', 'rule_asset_mismatch']) }),
  z.strictObject({ ...base, state: z.literal('retrieval_failed'), reason: z.enum(['payload_unavailable', 'missing_required_field',
    'changed_during_review', 'unauthorized']) }),
  z.strictObject({ ...base, state: z.literal('not_processed'), reason: z.enum(['deadline_exceeded', 'request_budget_exceeded',
    'receive_budget_exceeded', 'payload_budget_exceeded', 'authentication_failed', 'access_denied', 'upstream_unavailable']) }),
  z.strictObject({ ...base, state: z.literal('result_omitted'), reason: z.literal('response_limit') }),
]);

export const aggregateReviewStructure = z.strictObject({
  schema_version: z.literal('bp-mcp-review-0.2'), poc_only: z.literal(true), code_return_mode: z.literal('none'),
  status: z.enum(['completed', 'partial', 'failed']),
  target: z.strictObject({ update_set_sys_id: id, target_version: z.literal('update_set_payload'), instance_binding: hash }),
  versions: z.strictObject({ knowledge_base: z.literal(CATALOG_VERSION), ruleset: z.enum(['bp3-0.4', 'bp3-0.5', 'bp3-0.6']), asset_schema: z.literal('bp-review-0.2') }),
  started_at: z.iso.datetime(), ended_at: z.iso.datetime(),
  instance_release: releaseEvidenceStructure, release_match: z.enum(['matched', 'mismatched', 'unknown']),
  principal: z.strictObject({ auth_mode: z.enum(['per-user', 'service-account']) }),
  collection: z.strictObject({ scope: z.literal('caller_acl_visible'), status: z.enum(['not_started', 'complete', 'failed']),
    metadata_seen: z.number().int().min(0).max(101), selected: count, truncated: z.boolean() }),
  consistency: z.enum(['stable_observation', 'changed', 'unverified']),
  coverage: z.strictObject({ requested_rule_ids: bp5RuleIdsSchema,
    skipped_rules: z.array(z.strictObject({ rule_id: bp5RuleIdSchema,
      reason: z.enum(['release_unknown', 'release_mismatch']) })).max(5), analysis_complete: z.boolean() }),
  assets: z.array(assetOutcomeStructure).max(100),
  counts: z.strictObject({ reviewed: count, not_applicable: count, skipped_deleted: count, rejected: count,
    retrieval_failed: count, not_processed: count, result_omitted: count, findings: count }),
  limits: z.strictObject({ max_records: z.number().int().min(1).max(100), max_findings: z.literal(100),
    max_response_bytes: z.literal(262144), deadline_ms: z.literal(60000) }),
  limitations: z.array(z.string().min(1).max(2000)).max(100),
  errors: z.array(z.strictObject({ stage: z.enum(['input', 'parent', 'release', 'metadata', 'payload', 'analysis', 'consistency', 'output']),
    update_xml_sys_id: id.optional(), code: z.enum(['invalid_input', 'config_invalid', 'not_found_or_not_visible',
      'authentication_failed', 'access_denied', 'metadata_unavailable', 'release_unknown', 'release_mismatch',
      'rate_limited', 'upstream_unavailable', 'deadline_exceeded', 'request_budget_exceeded', 'receive_budget_exceeded',
      'payload_budget_exceeded', 'changed_during_review', 'response_limit', 'internal_review_error']) })).max(100),
});
export const aggregateReviewV3Structure = aggregateReviewStructure.extend({
  schema_version: z.literal('bp-mcp-review-0.3'),
  selection: z.strictObject({ mode: z.literal('review_targets'), filter_version: z.literal(TARGET_FILTER_VERSION),
    requested_asset_types: z.array(z.enum(['business_rule', 'client_script'])).min(1).max(2),
    action_scope: z.literal('insert_or_update_only'), order: z.literal('sys_id_asc'),
    excluded_counts: z.strictObject({ unsupported_assets: z.null(), deleted_assets: z.null(), other_actions: z.null() }) }),
  coverage: aggregateReviewStructure.shape.coverage.extend({ analysis_scope: z.literal('selected_candidate_window'),
    candidate_inventory_complete: z.literal(false), update_set_inventory_complete: z.literal(false) }),
  errors: z.array(aggregateReviewStructure.shape.errors.element.extend({ code: z.enum([
    ...aggregateReviewStructure.shape.errors.element.shape.code.options, 'candidate_filter_violation',
  ]) })).max(100),
});
export type AggregateReview = z.infer<typeof aggregateReviewStructure>;
export type AggregateReviewV3 = z.infer<typeof aggregateReviewV3Structure>;
export type AnyAggregateReview = AggregateReview | AggregateReviewV3;
function checkAggregate(r: AnyAggregateReview, ctx: z.RefinementCtx) {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (r.schema_version === 'bp-mcp-review-0.3') {
    if (JSON.stringify(r.selection.requested_asset_types) !== JSON.stringify(requestedAssetTypes(r.coverage.requested_rule_ids))) fail('Selection types contradict requested rules');
    if (TARGET_LIMITATIONS.some(s => !r.limitations.includes(s))) fail('Target selection requires inventory limitations');
    if (r.counts.skipped_deleted || r.assets.some(a => a.state === 'skipped_deleted')) fail('Target selection cannot include deleted rows');
    if (r.coverage.analysis_complete && !r.collection.selected) fail('Empty candidate window cannot assert analysis complete');
    if (r.errors.some(e => e.code === 'candidate_filter_violation' && !['metadata', 'consistency'].includes(e.stage))) fail('Invalid candidate filter error stage');
    for (const error of r.errors.filter(e => e.code === 'candidate_filter_violation')) {
      if (error.update_xml_sys_id || r.consistency !== 'unverified'
        || error.stage === 'metadata' && (r.collection.status !== 'failed' || r.status !== 'failed')
        || error.stage === 'consistency' && (r.collection.status !== 'complete' || r.status !== 'partial')) {
        fail('Candidate filter violation contradicts collection/consistency');
      }
    }
  }
  const equalIds = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every(x => b.includes(x));
  const startedAt = Date.parse(r.started_at);
  const endedAt = Date.parse(r.ended_at);
  const release = r.instance_release;
  // Freeze operator evidence at admission, with enough validity for the entire run budget.
  // Observations may be collected during the run, so validate those against ended_at.
  checkReleaseEvidence(release, release.source === 'operator_config' ? r.started_at : r.ended_at,
    r.target.instance_binding, r.limitations).forEach(fail);
  if (release.source === 'operator_config' && Date.parse(release.expires_at) <= startedAt + r.limits.deadline_ms) {
    fail('Operator assertion must remain valid beyond the full run deadline');
  }
  const releaseMatch = releaseMatchForEvidence(r.instance_release);
  if (r.release_match !== releaseMatch) fail('Release match contradicts evidence');
  if (!r.limitations.includes('source_approval_pending') || r.status === 'completed') fail('Current PoC is source-unapproved and cannot complete');
  if (startedAt > endedAt || endedAt - startedAt > r.limits.deadline_ms) fail('Invalid run time interval or deadline exceeded');
  if (new Set(r.coverage.requested_rule_ids).size !== r.coverage.requested_rule_ids.length) fail('Duplicate requested rules');
  if (r.versions.ruleset !== bp5RulesetFor(r.coverage.requested_rule_ids)) fail('Ruleset version contradicts requested rules');
  if (r.collection.selected !== r.assets.length || new Set(r.assets.map(a => a.update_xml_sys_id)).size !== r.assets.length) fail('Selected rows must be accounted for exactly once');
  if (r.collection.status === 'complete') {
    if (r.collection.metadata_seen > r.limits.max_records + 1
      || r.collection.selected !== Math.min(r.collection.metadata_seen, r.limits.max_records)
      || r.collection.truncated !== (r.collection.metadata_seen > r.limits.max_records)) fail('Invalid metadata budget/accounting');
    if (r.collection.truncated && !r.limitations.includes('metadata_truncated')) fail('Metadata truncation requires a warning');
  } else if (r.collection.metadata_seen || r.collection.selected || r.collection.truncated
    || r.consistency !== 'unverified') fail('Uncollected metadata cannot assert records/stability');
  if (r.collection.status === 'failed' && r.status !== 'failed') fail('Initial metadata failure must fail the run');
  if (releaseMatch !== 'matched') {
    const reason = releaseMatch === 'unknown' ? 'release_unknown' : 'release_mismatch';
    if (r.assets.length || r.collection.status !== 'not_started'
      || !equalIds(r.coverage.requested_rule_ids, r.coverage.skipped_rules.map(s => s.rule_id))
      || r.coverage.skipped_rules.some(s => s.reason !== reason) || !r.limitations.includes(reason)) fail('Unmatched release must stop collection and skip all requested rules');
  } else if (r.coverage.skipped_rules.length) fail('Matched release cannot assert global release skips');
  const states = ['reviewed', 'not_applicable', 'skipped_deleted', 'rejected', 'retrieval_failed', 'not_processed', 'result_omitted'] as const;
  for (const state of states) if (r.counts[state] !== r.assets.filter(a => a.state === state).length) fail('Outcome counts contradict assets');
  let findings = 0;
  let incomplete = r.collection.status !== 'complete' || r.collection.truncated || r.consistency !== 'stable_observation'
    || releaseMatch !== 'matched' || r.errors.length > 0;
  for (const asset of r.assets) {
    if (asset.state === 'reviewed') {
      const result = asset.result;
      if (!reviewResultV2Schema.safeParse(result).success) fail('Invalid nested review result');
      const applicable = r.coverage.requested_rule_ids.filter(id => RULES.find(rule => rule.rule_id === id)!.asset_types.includes(result.target.asset_type));
      if (!equalIds(asset.applicable_rule_ids, applicable) || !equalIds(result.coverage.requested_rule_ids, applicable)) fail('Nested rule applicability contradicts request');
      if (result.target.update_set_id !== r.target.update_set_sys_id || result.target.update_xml_sys_id !== asset.update_xml_sys_id
        || result.instance_binding !== r.target.instance_binding || result.ruleset_version !== bp5RulesetFor(result.coverage.requested_rule_ids)
        || result.knowledge_base_version !== r.versions.knowledge_base || result.release_match !== r.release_match
        || JSON.stringify(result.instance_release) !== JSON.stringify(r.instance_release)) fail('Nested provenance contradicts run');
      if (Date.parse(result.reviewed_at) < Date.parse(r.started_at) || Date.parse(result.reviewed_at) > Date.parse(r.ended_at)) fail('Nested review is outside run interval');
      findings += result.findings.length;
      incomplete ||= result.coverage.skipped_rules.length > 0 || result.review_status === 'failed'
        || ['query_like_unresolved', 'br_table_context_unknown', 'br_dynamic_scope_unresolved'].some(x => result.limitations.includes(x));
    } else if (asset.state === 'not_applicable') {
      const assetType = asset.asset_type;
      if (assetType === 'other') {
        if (asset.reason !== 'asset_type_unsupported') fail('Unsupported asset reason mismatch');
      } else if (asset.reason !== 'no_requested_rules'
        || r.coverage.requested_rule_ids.some(id => RULES.find(rule => rule.rule_id === id)!.asset_types.includes(assetType))) fail('Applicable rules cannot be silently skipped');
    } else if (asset.state !== 'skipped_deleted') {
      incomplete = true;
      if (asset.state === 'not_processed' && !r.limitations.includes(asset.reason)) fail('Unprocessed records need their stop reason');
      if (asset.state === 'result_omitted' && !r.limitations.includes('response_truncated')) fail('Omitted results need a response warning');
    }
  }
  if (findings !== r.counts.findings || findings > r.limits.max_findings) fail('Finding count/limit mismatch');
  if (r.coverage.analysis_complete && incomplete) fail('Incomplete review cannot assert full analysis');
  if (r.status === 'failed' && (findings || r.coverage.analysis_complete || !r.errors.length)) fail('Failed run needs an error, no findings and incomplete analysis');
  if (Buffer.byteLength(JSON.stringify(r), 'utf8') > r.limits.max_response_bytes) fail('Aggregate JSON exceeds response budget');
}
export const aggregateReviewSchema = aggregateReviewStructure.superRefine(checkAggregate);
export const aggregateReviewV3Schema = aggregateReviewV3Structure.superRefine(checkAggregate);
export const anyAggregateReviewSchema = z.discriminatedUnion('schema_version', [aggregateReviewSchema, aggregateReviewV3Schema]);
export const aggregateReviewJsonSchema = {
  ...z.toJSONSchema(aggregateReviewStructure, { target: 'draft-7' }),
  $id: 'urn:servicenow-mcp:best-practice-mcp-review-result:0.2',
  $comment: 'PoC only. Structural schema; also run aggregateReviewSchema for nested reviews, provenance, release, accounting, completeness and serialized response budget checks. No fetching or MCP registration.',
};
export const aggregateReviewV3JsonSchema = {
  ...z.toJSONSchema(aggregateReviewV3Structure, { target: 'draft-7' }),
  $id: 'urn:servicenow-mcp:best-practice-mcp-review-result:0.3',
  $comment: 'Structural schema only; also run aggregateReviewV3Schema for provenance, selection, accounting and budgets.',
};
export const anyAggregateReviewJsonSchema = {
  ...z.toJSONSchema(z.discriminatedUnion('schema_version', [aggregateReviewStructure, aggregateReviewV3Structure]), { target: 'draft-7' }),
  $comment: 'Omitted/bounded_all selection uses 0.2; review_targets uses 0.3. Runtime refinements are also required.',
};
