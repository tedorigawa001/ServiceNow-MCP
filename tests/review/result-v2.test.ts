import { describe, expect, it } from 'vitest';
import { reviewResultV2Schema } from '../../src/review/result-schema-v2.js';

import { result, observedResult, time } from './fixtures/bp5-results.js';

describe('BP-5 single-result v0.2 contract', () => {
  it('accepts a distinct operator-asserted candidate without pretending it was observed', () => {
    const parsed = reviewResultV2Schema.parse(result());
    expect(parsed.instance_release.source).toBe('operator_config');
    expect(parsed.instance_release.resolution_status).toBe('asserted');
  });
  it.each([
    ['expired', { expires_at: time }],
    ['future assertion', { asserted_at: '2026-10-18T00:00:00Z' }],
    ['reversed lifetime', { expires_at: '2026-10-15T00:00:00Z' }],
    ['different instance', { instance_binding: 'e'.repeat(64) }],
    ['fake observation', { resolution_status: 'resolved' }],
    ['raw build claim', { raw_buildname: 'Australia' }],
  ])('rejects %s operator evidence', (_name, change) => {
    const r = result();
    expect(reviewResultV2Schema.safeParse({ ...r, instance_release: { ...r.instance_release, ...change } }).success).toBe(false);
  });
  it('requires asserted warnings and observation failure reason, partial status and candidate-only findings', () => {
    const r = result();
    for (const warning of r.limitations) {
      expect(reviewResultV2Schema.safeParse({ ...r, limitations: r.limitations.filter(x => x !== warning) }).success).toBe(false);
    }
    expect(reviewResultV2Schema.safeParse({ ...r, review_status: 'completed' }).success).toBe(false);
    expect(reviewResultV2Schema.safeParse({ ...r, findings: r.findings.map((f: Record<string, unknown>) => ({ ...f,
      verification_status: 'evidence_matched' })) }).success).toBe(false);
  });
  it('accepts visible-node observation but rejects contradictory family, future observation and forged warnings', () => {
    const r = observedResult();
    expect(reviewResultV2Schema.safeParse(r).success).toBe(true);
    for (const change of [{ raw_buildname: 'Zurich' }, { observed_at: '2026-10-18T00:00:00Z' },
      { visibility_scope: 'operator_configured' }, { config_version: 'd'.repeat(64) }]) {
      expect(reviewResultV2Schema.safeParse({ ...r, instance_release: { ...r.instance_release, ...change } }).success).toBe(false);
    }
    expect(reviewResultV2Schema.safeParse({ ...r, limitations: ['source_approval_pending'] }).success).toBe(false);
  });
  it.each([
    { source: 'none', resolution_status: 'unknown', family: null, visibility_scope: 'unavailable', reason: 'config_expired' },
    { source: 'conflict', resolution_status: 'unknown', family: null, visibility_scope: 'caller_acl',
      observed_families: ['Australia'], configured_family: 'Zurich', observed_at: '2026-10-17T04:59:00Z' },
  ])('requires unknown evidence to skip all rules without findings ($source)', (evidence) => {
    const r = { ...result(), instance_release: evidence, release_match: 'unknown', findings: [],
      limitations: ['source_approval_pending', 'release_unknown',
        evidence.source === 'conflict' ? 'release_evidence_conflict' : 'config_expired'],
      coverage: { requested_rule_ids: ['AU-BR-001'], evaluated_rule_ids: [],
        skipped_rules: [{ rule_id: 'AU-BR-001', reason: 'release_unknown' }] } };
    expect(reviewResultV2Schema.safeParse(r).success).toBe(true);
    expect(reviewResultV2Schema.safeParse({ ...r, findings: result().findings }).success).toBe(false);
    expect(reviewResultV2Schema.safeParse({ ...r, coverage: result().coverage }).success).toBe(false);
  });
  it('preserves provenance, applicability and coverage checks rather than only validating release shape', () => {
    const r = result();
    const f = r.findings[0];
    for (const invalid of [
      { ...r, coverage: { ...r.coverage, evaluated_rule_ids: [] } },
      { ...r, coverage: { ...r.coverage, requested_rule_ids: ['AU-BR-001', 'AU-BR-001'] } },
      { ...r, coverage: { ...r.coverage, evaluated_rule_ids: ['AU-BR-001', 'AU-BR-001'] } },
      { ...r, target: { ...r.target, asset_table: 'sys_user' } },
      { ...r, target: { ...r.target, target_version: 'current_record' } },
      { ...r, findings: [{ ...f, rule_id: 'AU-CL-004' }] },
      { ...r, findings: [{ ...f, line_end: 0 }] },
      { ...r, findings: [{ ...f, field: 'condition' }] },
      { ...r, findings: [{ ...f, sources: [{ ...f.sources[0], url: 'https://example.invalid/' }] }] },
      { ...r, findings: [{ ...f, required_follow_up: ['synchronous_ajax_review'] }] },
      { ...r, script: 'secret' },
      { ...r, findings: [{ ...f, script: 'secret' }] },
      { ...r, review_status: 'failed' },
    ]) expect(reviewResultV2Schema.safeParse(invalid).success).toBe(false);
  });
});
