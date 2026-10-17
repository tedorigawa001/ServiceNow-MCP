import { readFileSync } from 'node:fs';
export const time = '2026-10-17T05:00:00Z';
export const binding = 'c'.repeat(64);
export function result() {
  const legacy = JSON.parse(readFileSync(new URL('../../../examples/bp2-review-result.json', import.meta.url), 'utf8'));
  return {
    ...legacy, schema_version: 'bp-review-0.2', ruleset_version: 'bp3-0.4', review_status: 'partial',
    instance_binding: binding,
    instance_release: { source: 'operator_config', resolution_status: 'asserted', family: 'Australia',
      visibility_scope: 'operator_configured', instance_binding: binding, config_version: 'd'.repeat(64),
      asserted_at: '2026-10-16T00:00:00Z', expires_at: '2026-10-20T00:00:00Z' },
    limitations: ['source_approval_pending', 'release_operator_asserted', 'release_not_observed',
      'release_config_may_be_stale', 'release_observation_unavailable'],
    findings: legacy.findings.map((f: Record<string, unknown>) => ({ ...f, severity: 'info', confidence: 'low',
      required_follow_up: ['source_approval', 'binding_and_reachability', 'exceptions_and_business_intent'] })),
    reviewed_at: time,
  };
}
export function observedResult() {
  return { ...result(), instance_release: { source: 'sys_cluster_state.build_name', resolution_status: 'resolved',
    family: 'Australia', raw_buildname: 'Australia', observed_at: '2026-10-17T04:59:00Z', visibility_scope: 'caller_acl' },
    limitations: ['source_approval_pending', 'release_visible_nodes_only'] };
}

export function aggregate() {
  const r = result();
  return {
    schema_version: 'bp-mcp-review-0.2', poc_only: true, code_return_mode: 'none', status: 'partial',
    target: { update_set_sys_id: r.target.update_set_id, target_version: 'update_set_payload', instance_binding: binding },
    versions: { knowledge_base: 'au-register-0.1', ruleset: 'bp3-0.4', asset_schema: 'bp-review-0.2' },
    started_at: '2026-10-17T04:59:00Z', ended_at: time,
    instance_release: structuredClone(r.instance_release), release_match: 'matched', principal: { auth_mode: 'per-user' },
    collection: { scope: 'caller_acl_visible', status: 'complete', metadata_seen: 1, selected: 1, truncated: false },
    consistency: 'stable_observation',
    coverage: { requested_rule_ids: ['AU-BR-001'], skipped_rules: [], analysis_complete: true },
    assets: [{ state: 'reviewed', update_xml_sys_id: r.target.update_xml_sys_id,
      applicable_rule_ids: ['AU-BR-001'], result: r }],
    counts: { reviewed: 1, not_applicable: 0, skipped_deleted: 0, rejected: 0, retrieval_failed: 0,
      not_processed: 0, result_omitted: 0, findings: 1 },
    limits: { max_records: 20, max_findings: 100, max_response_bytes: 262144, deadline_ms: 60000 },
    limitations: r.limitations, errors: [],
  };
}
