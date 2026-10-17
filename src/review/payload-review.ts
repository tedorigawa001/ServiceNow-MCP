/** Offline BP-3 candidate validation. No network, execution, code excerpts or current-record lookup. */
import { parse } from 'acorn';
import { z } from 'zod';
import { CATALOG_VERSION, RULES, SOURCES, matchCatalogRelease, type AssetType } from './catalog.js';
import { reviewResultSchema, type ReviewResult } from './result-schema.js';
import { extractReviewXml, ExtractionError, XML_LIMITS } from './update-xml.js';
import { analyzeScopedCandidates, AnalysisLimitError } from './scope-analysis.js';

const id = z.string().regex(/^[a-f0-9]{32}$/);
const inputSchema = z.strictObject({
  update_set_id: id, update_xml_sys_id: id,
  name: z.string().regex(/^[a-z][a-z0-9_]*_[a-f0-9]{32}$/).max(120),
  payload: z.string().max(XML_LIMITS.payload_bytes), retrieved_at: z.iso.datetime(),
  record_updated_at: z.iso.datetime().nullable(),
  instance_release: z.object({ family: z.string().max(40).nullable(), raw_buildname: z.string().max(40).nullable(),
    source: z.literal('sys_cluster_state.build_name'), retrieved_at: z.iso.datetime().nullable(),
    resolution_status: z.enum(['resolved', 'unknown']), visibility_scope: z.literal('caller_acl') }).strict(),
  requested_rule_ids: z.array(z.enum(RULES.map(rule => rule.rule_id) as [string, ...string[]])).min(1).max(27)
    .refine(ids => new Set(ids).size === ids.length),
});
type Ast = { type: string; start: number; end: number; loc: { start: { line: number }; end: { line: number } }; [key: string]: unknown };
const node = (value: unknown): value is Ast => !!value && typeof value === 'object' && 'type' in value;
function memberName(value: unknown): string | null {
  if (!node(value) || value.type !== 'MemberExpression' || !node(value.property)) return null;
  return !value.computed && value.property.type === 'Identifier' ? String(value.property.name)
    : value.computed && value.property.type === 'Literal' && typeof value.property.value === 'string' ? value.property.value : null;
}
const isIdentifier = (value: unknown, name: string) => node(value) && value.type === 'Identifier' && value.name === name;

export function reviewUpdateSetPayload(raw: unknown):
  ReturnType<typeof reviewPayload> { return reviewPayload(raw, 'scoped'); }

/** Frozen syntactic engine for historical BP-4 baselines, not the current default. */
export function reviewUpdateSetPayloadLegacy(raw: unknown):
  ReturnType<typeof reviewPayload> { return reviewPayload(raw, 'legacy'); }

function reviewPayload(raw: unknown, mode: 'legacy' | 'scoped'):
  { poc_only: true; status: 'rejected'; reason: string } | { poc_only: true; status: 'reviewed'; result: ReviewResult } {
  const reject = (reason: string) => ({ poc_only: true as const, status: 'rejected' as const, reason });
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return reject('invalid_input'); // Never expose validation input or code.
  const input = parsed.data;
  let asset: ReturnType<typeof extractReviewXml>;
  try { asset = extractReviewXml(input.payload, input.name); }
  catch (error) { return reject(error instanceof ExtractionError ? error.reason : 'invalid_xml'); }
  const types: Record<string, AssetType> = { sys_script: 'business_rule', sys_script_client: 'client_script',
    sys_script_include: 'script_include', sys_ws_operation: 'scripted_rest_resource', sysauto_script: 'server_script' };
  const assetType = types[asset.table];
  if (input.requested_rule_ids.some(ruleId => !RULES.find(rule => rule.rule_id === ruleId)!.asset_types.includes(assetType))) return reject('rule_asset_mismatch');
  const releaseMatch = input.instance_release.resolution_status === 'unknown' ? 'unknown' : matchCatalogRelease(input.instance_release.family);
  const result: ReviewResult = {
    schema_version: 'bp-review-0.1', poc_only: true, knowledge_base_version: CATALOG_VERSION,
    ruleset_version: mode === 'legacy' ? 'bp3-0.1' : 'bp3-0.2', reviewed_at: input.retrieved_at, review_status: 'partial', code_return_mode: 'none',
    target: { target_version: 'update_set_payload', asset_type: assetType, asset_table: asset.table,
      asset_sys_id: asset.sys_id, sys_scope: asset.sys_scope, field: 'script', code_hash: asset.code_hash,
      retrieved_at: input.retrieved_at, record_updated_at: input.record_updated_at,
      update_set_id: input.update_set_id, update_xml_sys_id: input.update_xml_sys_id, payload_hash: asset.payload_hash },
    instance_release: input.instance_release, release_match: releaseMatch,
    coverage: { requested_rule_ids: input.requested_rule_ids, evaluated_rule_ids: [], skipped_rules: [] },
    limitations: ['source_approval_pending', 'candidate_detection_only', 'execution_path_not_verified', 'release_evidence_caller_supplied'], findings: [],
  };
  if (mode === 'scoped') result.limitations.push('bounded_intra_function_analysis', 'interprocedural_analysis_not_performed', 'dynamic_member_analysis_not_performed');
  if (asset.active === 'false') result.limitations.push('inactive_asset');
  const supported = new Set(['AU-BR-001', 'AU-BR-002', 'AU-CL-004']);
  // Normalize persisted BR choice values only on the current engine path.
  // Keep the historical engine's context contract unchanged for frozen baselines.
  const when = mode === 'legacy' ? asset.when
    : asset.when === 'async_always' || asset.when === 'async' ? 'async'
      : asset.when === 'before_display' ? 'display'
        : asset.when === 'before' || asset.when === 'after' ? asset.when : null;
  for (const rule_id of input.requested_rule_ids) {
    const reason = releaseMatch !== 'matched' ? releaseMatch === 'unknown' ? 'release_unknown' : 'release_mismatch'
      : !supported.has(rule_id) ? 'unsupported'
        : rule_id === 'AU-BR-002' && !['before', 'after', 'async', 'display'].includes(when ?? '') ? 'missing_context' : null;
    if (reason) result.coverage.skipped_rules.push({ rule_id, reason });
    else result.coverage.evaluated_rule_ids.push(rule_id);
  }
  if (releaseMatch !== 'matched') result.limitations.push(releaseMatch === 'unknown' ? 'release_unknown' : 'release_mismatch');
  if (result.coverage.evaluated_rule_ids.length) {
    let ast: Ast;
    try { ast = parse(asset.code, { ecmaVersion: 2022, sourceType: 'script', locations: true }) as unknown as Ast; }
    catch { return reject('javascript_parse_failed'); }
    const appendFinding = (entry: Ast, ruleId: string) => {
      if (!result.coverage.evaluated_rule_ids.includes(ruleId)) return;
      const rule = RULES.find(rule => rule.rule_id === ruleId)!;
      const source = SOURCES[rule.source_id as keyof typeof SOURCES];
      result.findings.push({ rule_id: ruleId, category: 'correctness', severity: 'info', confidence: 'low',
        verification_status: 'candidate', field: 'script', line_start: entry.loc.start.line, line_end: entry.loc.end.line,
        issue: rule.title, impact: '構文上の候補。業務影響・到達可能性は未確認。', applicability: rule.applicability,
        recommendation: '根拠節の適用条件・例外と、実行経路・受信オブジェクト・変数の束縛を確認する。',
        required_follow_up: ['source_approval', 'binding_and_reachability', 'exceptions_and_business_intent'],
        sources: [{ source_id: rule.source_id, title: source.title, url: source.url, section: rule.section,
          release: source.release, verified_on: source.verified_on, retrieved_at: null, content_hash: null,
          snapshot_id: null, catalog_version: CATALOG_VERSION, summary: rule.title }], verification_evidence: [] });
    };
    if (mode === 'scoped') {
      try {
        analyzeScopedCandidates(ast, when, (entry, ruleId) => {
          appendFinding(entry, ruleId);
          if (result.findings.length > 100) throw new ExtractionError('finding_limit');
        }, { allowDeclaredEntry: assetType === 'business_rule' });
      } catch (error) {
        return reject(error instanceof ExtractionError ? error.reason : error instanceof AnalysisLimitError ? 'analysis_limit' : 'analysis_failed');
      }
    } else {
      const pending = [ast];
      let nodes = 0;
      while (pending.length) {
        const entry = pending.pop()!;
        if (++nodes > 100000) return reject('analysis_limit');
        const callName = entry.type === 'CallExpression' ? memberName(entry.callee) : null;
        const matches: string[] = [];
        if (callName === 'update' && node(entry.callee) && isIdentifier(entry.callee.object, 'current')) matches.push('AU-BR-001');
        if (asset.when === 'async' && ((entry.type === 'MemberExpression' && isIdentifier(entry.object, 'previous'))
          || ['changes', 'changesTo', 'changesFrom'].includes(callName ?? ''))) matches.push('AU-BR-002');
        if (callName === 'getXMLWait') matches.push('AU-CL-004');
        for (const ruleId of matches.filter(rule => result.coverage.evaluated_rule_ids.includes(rule))) {
          appendFinding(entry, ruleId);
          if (result.findings.length > 100) return reject('finding_limit');
        }
        for (const value of Object.values(entry)) {
          if (node(value)) pending.push(value);
          else if (Array.isArray(value)) for (const child of value) if (node(child)) pending.push(child);
        }
      }
    }
  }
  result.findings.sort((a, b) => a.line_start - b.line_start || a.rule_id.localeCompare(b.rule_id));
  if (!result.coverage.skipped_rules.length) result.review_status = 'completed';
  const validated = reviewResultSchema.safeParse(result);
  return validated.success ? { poc_only: true, status: 'reviewed', result: validated.data } : reject('invalid_result_context');
}
