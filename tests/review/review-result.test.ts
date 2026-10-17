import { describe, expect, it } from 'vitest';
import { reviewResultSchema, reviewResultJsonSchema } from '../../src/review/result-schema.js';
import { readFileSync } from 'node:fs';

const hash = 'a'.repeat(64);
export function candidateResult() {
  return {
    schema_version: 'bp-review-0.1', poc_only: true,
    knowledge_base_version: 'au-register-0.1', ruleset_version: 'bp2-0.1',
    reviewed_at: '2026-10-17T05:00:00Z', review_status: 'completed', code_return_mode: 'none',
    target: { target_version: 'update_set_payload', asset_type: 'business_rule', asset_table: 'sys_script',
      asset_sys_id: '1'.repeat(32), sys_scope: 'global', field: 'script', code_hash: hash,
      retrieved_at: '2026-10-17T04:59:00Z', record_updated_at: null,
      update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), payload_hash: 'b'.repeat(64) },
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-17T04:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    release_match: 'matched', coverage: { requested_rule_ids: ['AU-BR-001'], evaluated_rule_ids: ['AU-BR-001'], skipped_rules: [] },
    limitations: ['source_approval_pending'],
    findings: [{ rule_id: 'AU-BR-001', category: 'performance', severity: 'low', confidence: 'low',
      verification_status: 'candidate', field: 'script', line_start: 1, line_end: 1,
      issue: '再帰更新の候補', impact: '要確認', applicability: 'BRの実行条件を確認する',
      recommendation: '再更新が必要か確認', required_follow_up: ['関連BRの確認'],
      sources: [{ source_id: 'AU-SRC-001',
        url: 'https://www.servicenow.com/docs/r/australia/api-reference/business-rules-classic/c_BusinessRules.html',
        section: 'How business rules work → Prevent recursive business rules', title: 'Classic Business rules', release: 'Australia',
        verified_on: '2026-10-17', retrieved_at: null, content_hash: null, snapshot_id: null,
        catalog_version: 'au-register-0.1', summary: 'BRの現在レコード再更新についての推奨と例外' }], verification_evidence: [] }],
  };
}

describe('best-practice review result contract', () => {
  it('keeps source date/release out of structural constants and checks them against the catalog', () => {
    const schema = JSON.stringify(reviewResultJsonSchema);
    expect(schema).not.toContain('"const":"2026-10-17"');
    expect(schema).not.toContain('"const":"Australia"');
    const result = candidateResult();
    for (const source of [
      { ...result.findings[0].sources[0], verified_on: '2026-10-18' },
      { ...result.findings[0].sources[0], release: 'Zurich' },
      { ...result.findings[0].sources[0], verified_on: 'not-a-date' },
    ]) {
      expect(reviewResultSchema.safeParse({ ...result, findings: [{ ...result.findings[0], sources: [source] }] }).success).toBe(false);
    }
  });
  it.each(['mismatched', 'unknown'] as const)('requires %s releases to skip every rule with no findings', (releaseMatch) => {
    const result = candidateResult();
    const instance_release = releaseMatch === 'unknown'
      ? { ...result.instance_release, family: null, raw_buildname: null, resolution_status: 'unknown' }
      : { ...result.instance_release, family: 'Zurich', raw_buildname: 'Zurich' };
    const limits = [...result.limitations, releaseMatch === 'unknown' ? 'release_unknown' : 'release_mismatch'];
    const input = { ...result, release_match: releaseMatch, instance_release, limitations: limits };
    expect(reviewResultSchema.safeParse(input).success).toBe(false);
    const reason = releaseMatch === 'unknown' ? 'release_unknown' : 'release_mismatch';
    const skipped = { ...input, findings: [], review_status: 'partial', coverage: {
      requested_rule_ids: ['AU-BR-001', 'AU-BR-002'], evaluated_rule_ids: [],
      skipped_rules: ['AU-BR-001', 'AU-BR-002'].map(rule_id => ({ rule_id, reason })),
    } };
    expect(reviewResultSchema.safeParse(skipped).success).toBe(true);
    expect(reviewResultSchema.safeParse({ ...skipped, review_status: 'completed' }).success).toBe(false);
    expect(reviewResultSchema.safeParse({ ...skipped, coverage: { ...skipped.coverage,
      skipped_rules: skipped.coverage.skipped_rules.map(skip => ({ ...skip, reason: 'missing_context' })) } }).success).toBe(false);
    expect(reviewResultSchema.safeParse({ ...skipped, findings: result.findings }).success).toBe(false);
  });
  it('accepts Global, scoped and unknown scope values but rejects malformed scope identifiers', () => {
    const result = candidateResult();
    for (const sys_scope of ['global', 'a'.repeat(32), null]) {
      expect(reviewResultSchema.safeParse({ ...result, target: { ...result.target, sys_scope } }).success).toBe(true);
    }
    for (const sys_scope of ['Global', '', 'x_my_app', 'a'.repeat(31)]) {
      expect(reviewResultSchema.safeParse({ ...result, target: { ...result.target, sys_scope } }).success).toBe(false);
    }
  });
  it('keeps the portable JSON artifact and synthetic example synchronized with the validator', () => {
    const schema = JSON.parse(readFileSync(new URL('../../schemas/best-practice-review-result.schema.json', import.meta.url), 'utf8'));
    expect(schema).toEqual(reviewResultJsonSchema);
    const example = JSON.parse(readFileSync(new URL('../../examples/bp2-review-result.json', import.meta.url), 'utf8'));
    expect(example).toEqual(candidateResult());
    expect(reviewResultSchema.safeParse(example).success).toBe(true);
    const checkObjects = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) return value.forEach(checkObjects);
      const node = value as Record<string, unknown>;
      if (node.type === 'object') expect(node.additionalProperties).toBe(false);
      Object.values(node).forEach(checkObjects);
    };
    checkObjects(schema);
  });
  it('requires the full ordered chain for runtime confirmation of this exact code version', () => {
    const result = candidateResult();
    result.findings[0].verification_status = 'runtime_confirmed';
    const evidence = [
      ['evidence_matched', 'static_analysis'], ['path_confirmed', 'path_analysis'], ['runtime_confirmed', 'pdi_test'],
    ].map(([stage, method]) => ({ stage, method, code_hash: hash, reference: 'synthetic-fixture-only', verified_at: '2026-10-17T04:59:30Z' }));
    const finding = { ...result.findings[0], verification_evidence: evidence };
    expect(reviewResultSchema.safeParse({ ...result, findings: [finding] }).success).toBe(true);
    evidence[2].code_hash = 'c'.repeat(64);
    expect(reviewResultSchema.safeParse({ ...result, findings: [finding] }).success).toBe(false);
  });
  it('accepts explicit partial coverage and rejects code disclosure, unknown nested keys and invalid enums', () => {
    const result = candidateResult();
    const partial = { ...result, review_status: 'partial', findings: [],
      coverage: { requested_rule_ids: ['AU-BR-001'], evaluated_rule_ids: [], skipped_rules: [{ rule_id: 'AU-BR-001', reason: 'missing_context' }] } };
    expect(reviewResultSchema.safeParse(partial).success).toBe(true);
    expect(reviewResultSchema.safeParse({ ...result, code_return_mode: 'full' }).success).toBe(false);
    expect(reviewResultSchema.safeParse({ ...result, code: 'secret script' }).success).toBe(false);
    expect(reviewResultSchema.safeParse({ ...result, target: { ...result.target, script: 'secret script' } }).success).toBe(false);
    expect(reviewResultSchema.safeParse({ ...result, findings: [{ ...result.findings[0], confidence: 'certain' }] }).success).toBe(false);
    expect(reviewResultSchema.safeParse({ ...result, target: { ...result.target, target_version: 'current_record' } }).success).toBe(false);
    const target = Object.fromEntries(Object.entries(result.target).filter(([key]) => !['update_xml_sys_id', 'update_set_id', 'payload_hash'].includes(key)));
    expect(reviewResultSchema.safeParse({ ...result, target: { ...target, target_version: 'current_record' } }).success).toBe(true);
  });
  it.each([
    ['forged source URL', (r: ReturnType<typeof candidateResult>) => { r.findings[0].sources[0].url = 'https://example.com/'; }],
    ['wrong section', (r: ReturnType<typeof candidateResult>) => { r.findings[0].sources[0].section = 'Unrelated section'; }],
    ['backward line range', (r: ReturnType<typeof candidateResult>) => { r.findings[0].line_start = 3; }],
    ['unaccounted coverage', (r: ReturnType<typeof candidateResult>) => { r.coverage.evaluated_rule_ids = []; }],
    ['duplicate coverage', (r: ReturnType<typeof candidateResult>) => { r.coverage.evaluated_rule_ids.push('AU-BR-001'); }],
    ['wrong asset table', (r: ReturnType<typeof candidateResult>) => { r.target.asset_table = 'sys_user'; }],
    ['missing approval warning', (r: ReturnType<typeof candidateResult>) => { r.limitations = []; }],
    ['unproven stage', (r: ReturnType<typeof candidateResult>) => { r.findings[0].verification_status = 'runtime_confirmed'; }],
    ['contradictory release', (r: ReturnType<typeof candidateResult>) => { r.instance_release.family = 'Zurich'; }],
  ])('rejects %s', (_label, mutate) => {
    const result = candidateResult();
    mutate(result);
    expect(reviewResultSchema.safeParse(result).success).toBe(false);
  });
  it('accepts a source-linked candidate without returning source code and exports a strict JSON Schema', () => {
    expect(reviewResultSchema.safeParse(candidateResult()).success).toBe(true);
    expect(reviewResultJsonSchema.$schema).toContain('json-schema');
    expect(reviewResultJsonSchema.additionalProperties).toBe(false);
  });
});
