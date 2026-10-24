import { z } from 'zod';
import { CATALOG_VERSION, RULES, SOURCES, matchCatalogRelease } from './catalog.js';
// Typed codes for new consumers; bp-review-0.1 keeps its legacy free-text wire contract.
export { followUpCodeSchema, type FollowUpCode } from './follow-up-catalog.js';

const ruleId = z.enum(RULES.map(rule => rule.rule_id) as [string, ...string[]]);
const sourceId = z.enum(Object.keys(SOURCES) as [string, ...string[]]);
const text = z.string().min(1).max(2000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sysId = z.string().regex(/^[a-f0-9]{32}$/);
const timestamp = z.iso.datetime();
const field = z.string().regex(/^[a-z][a-z0-9_]*$/).max(80);
const assetType = z.enum(['business_rule', 'client_script', 'script_include', 'scripted_rest_resource', 'server_script']);
const targetFields = {
  asset_type: assetType, asset_table: field, asset_sys_id: sysId, sys_scope: z.union([sysId, z.literal('global')]).nullable(), field,
  code_hash: hash, retrieved_at: timestamp, record_updated_at: timestamp.nullable(),
};
const target = z.discriminatedUnion('target_version', [
  z.strictObject({ ...targetFields, target_version: z.literal('update_set_payload'),
    update_set_id: sysId, update_xml_sys_id: sysId, payload_hash: hash }),
  z.strictObject({ ...targetFields, target_version: z.literal('current_record') }),
]);
const evidenceStage = z.enum(['evidence_matched', 'path_confirmed', 'runtime_confirmed']);

export const reviewResultStructure = z.strictObject({
  schema_version: z.literal('bp-review-0.1'), poc_only: z.literal(true),
  knowledge_base_version: z.literal(CATALOG_VERSION), ruleset_version: z.enum(['bp2-0.1', 'bp3-0.1', 'bp3-0.2', 'bp3-0.3', 'bp3-0.4', 'bp3-0.5', 'bp3-0.6']),
  reviewed_at: timestamp,
  review_status: z.enum(['completed', 'partial', 'failed']),
  // Excerpts/full need a separately approved disclosure contract; not enabled in BP-2.
  code_return_mode: z.literal('none'), target,
  instance_release: z.strictObject({
    family: z.string().min(1).max(40).nullable(), raw_buildname: z.string().min(1).max(40).nullable(),
    source: z.literal('sys_cluster_state.build_name'), retrieved_at: timestamp.nullable(),
    resolution_status: z.enum(['resolved', 'unknown']), visibility_scope: z.literal('caller_acl'),
  }),
  release_match: z.enum(['matched', 'mismatched', 'unknown']),
  coverage: z.strictObject({
    requested_rule_ids: z.array(ruleId).min(1).max(27), evaluated_rule_ids: z.array(ruleId).max(27),
    skipped_rules: z.array(z.strictObject({ rule_id: ruleId,
      reason: z.enum(['missing_context', 'release_mismatch', 'release_unknown', 'source_unapproved', 'unsupported', 'retrieval_failed']) })).max(27),
  }),
  limitations: z.array(text).max(100),
  findings: z.array(z.strictObject({
    rule_id: ruleId, category: z.enum(['security', 'performance', 'maintainability', 'correctness']),
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    confidence: z.enum(['high', 'medium', 'low']),
    verification_status: z.enum(['candidate', 'evidence_matched', 'path_confirmed', 'runtime_confirmed']),
    field, line_start: z.number().int().min(1), line_end: z.number().int().min(1),
    issue: text, impact: text, applicability: text, recommendation: text,
    required_follow_up: z.array(text).max(20),
    sources: z.array(z.strictObject({ source_id: sourceId, url: z.url().max(2048), section: text,
      title: text, release: z.string().min(1).max(40), verified_on: z.iso.date(),
      retrieved_at: z.null(), content_hash: z.null(), snapshot_id: z.null(),
      catalog_version: z.literal(CATALOG_VERSION), summary: text })).min(1).max(5),
    verification_evidence: z.array(z.strictObject({
      stage: evidenceStage, method: z.enum(['static_analysis', 'path_analysis', 'pdi_test']),
      code_hash: hash, reference: text, verified_at: timestamp,
    })).max(3),
  })).max(100),
});

/** Portable structural contract. Cross-field checks must also run via reviewResultSchema. */
export const reviewResultJsonSchema = {
  ...z.toJSONSchema(reviewResultStructure, { target: 'draft-7' }),
  $id: 'urn:servicenow-mcp:best-practice-review-result:0.1',
  $comment: 'PoC only. Also validate cross-field provenance, release and coverage using reviewResultSchema; JSON Schema alone does not verify truth of findings.',
};
export const reviewResultSchema = reviewResultStructure.superRefine((result, ctx) => {
  const fail = (message: string, path: (string | number)[] = []) => ctx.addIssue({ code: 'custom', message, path });
  const tableByAsset = { business_rule: 'sys_script', client_script: 'sys_script_client', script_include: 'sys_script_include',
    scripted_rest_resource: 'sys_ws_operation', server_script: 'sysauto_script' };
  if (result.target.asset_table !== tableByAsset[result.target.asset_type]) fail('Asset type/table mismatch', ['target']);
  const release = result.instance_release;
  if (release.resolution_status === 'resolved') {
    if (!release.family || !release.raw_buildname || !release.retrieved_at
      || matchCatalogRelease(release.family) === 'unknown'
      || release.family.trim().toLowerCase() !== release.raw_buildname.trim().toLowerCase()) fail('Resolved release needs consistent family/build evidence', ['instance_release']);
  } else if (release.family !== null || release.raw_buildname !== null) fail('Unknown release must not assert a family', ['instance_release']);
  const expectedRelease = release.resolution_status === 'unknown' ? 'unknown'
    : matchCatalogRelease(release.family);
  if (result.release_match !== expectedRelease) fail('Release match contradicts provenance', ['release_match']);
  if (!result.limitations.includes('source_approval_pending')) fail('Candidate sources require approval warning', ['limitations']);

  const { requested_rule_ids: requested, evaluated_rule_ids: evaluated, skipped_rules: skipped } = result.coverage;
  if (expectedRelease !== 'matched') {
    const reason = expectedRelease === 'unknown' ? 'release_unknown' : 'release_mismatch';
    if (evaluated.length || result.findings.length || skipped.length !== requested.length
      || skipped.some(skip => skip.reason !== reason)) fail('Unmatched release must skip every requested rule with the release reason and no findings', ['coverage']);
    if (result.review_status === 'completed') fail('Unmatched release cannot complete a review', ['review_status']);
    if (!result.limitations.includes(reason)) fail('Unmatched release needs an explicit limitation', ['limitations']);
  }
  const accounted = [...evaluated, ...skipped.map(skip => skip.rule_id)];
  if (new Set(requested).size !== requested.length || new Set(accounted).size !== accounted.length
    || requested.length !== accounted.length || requested.some(id => !accounted.includes(id))) fail('Coverage must account for each requested rule exactly once', ['coverage']);
  for (const id of requested) {
    if (!RULES.find(rule => rule.rule_id === id)!.asset_types.includes(result.target.asset_type)) fail('Rule does not apply to asset type', ['coverage']);
  }
  if (result.review_status === 'completed' && skipped.length) fail('Completed review cannot hide skipped rules', ['review_status']);
  if (result.review_status === 'partial' && !skipped.length && result.limitations.length < 2) fail('Partial review needs a specific limitation', ['review_status']);
  if (result.review_status === 'failed' && result.findings.length) fail('Failed review cannot assert findings', ['findings']);

  const stages = ['evidence_matched', 'path_confirmed', 'runtime_confirmed'];
  const methods = ['static_analysis', 'path_analysis', 'pdi_test'];
  result.findings.forEach((finding, index) => {
    const path = ['findings', index];
    const rule = RULES.find(entry => entry.rule_id === finding.rule_id)!;
    if (!evaluated.includes(finding.rule_id)) fail('Finding rule was not evaluated', path);
    if (finding.field !== result.target.field || finding.line_end < finding.line_start) fail('Invalid code location', path);
    if (finding.sources.length !== 1 || finding.sources.some(source => source.source_id !== rule.source_id
      || source.section !== rule.section || source.url !== SOURCES[rule.source_id as keyof typeof SOURCES].url
      || source.title !== SOURCES[rule.source_id as keyof typeof SOURCES].title
      || source.release !== SOURCES[rule.source_id as keyof typeof SOURCES].release
      || source.verified_on !== SOURCES[rule.source_id as keyof typeof SOURCES].verified_on)) fail('Finding source must match registered URL, title, section, release and date', path);
    const depth = stages.indexOf(finding.verification_status) + 1;
    if (depth > 0 && result.release_match !== 'matched') fail('Unmatched release cannot support confirmed finding', path);
    if (finding.verification_evidence.length !== depth) fail('Verification requires evidence for every preceding stage', path);
    finding.verification_evidence.forEach((evidence, n) => {
      if (evidence.stage !== stages[n] || evidence.method !== methods[n] || evidence.code_hash !== result.target.code_hash
        || Date.parse(evidence.verified_at) > Date.parse(result.reviewed_at)) fail('Verification evidence stage/method/version/time mismatch', path);
    });
  });
});
export type ReviewResult = z.infer<typeof reviewResultSchema>;
