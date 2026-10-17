import { describe, expect, it } from 'vitest';
import { aggregateReviewSchema } from '../../src/review/aggregate-schema.js';
import { aggregate } from './fixtures/bp5-results.js';

describe('BP-5 aggregate result contract', () => {
  it('accepts partial candidate output with an explicitly operator-asserted release', () => {
    const parsed = aggregateReviewSchema.parse(aggregate());
    expect(parsed.instance_release.resolution_status).toBe('asserted');
    expect(parsed.assets).toHaveLength(1);
  });
  it.each([
    ['less than the full deadline', '2026-10-17T04:59:30Z', false],
    ['exactly the deadline', '2026-10-17T05:00:00Z', false],
    ['one millisecond beyond the deadline', '2026-10-17T05:00:00.001Z', true],
  ])('requires an assertion valid beyond the entire run budget: %s', (_name, expiresAt, valid) => {
    const r = aggregate();
    // Finish early: checking ended_at alone would incorrectly accept the first two cases.
    r.ended_at = '2026-10-17T04:59:20Z';
    r.assets[0].result.reviewed_at = r.ended_at;
    r.assets[0].result.target.retrieved_at = '2026-10-17T04:59:10Z';
    r.instance_release.expires_at = expiresAt;
    r.assets[0].result.instance_release.expires_at = expiresAt;
    expect(aggregateReviewSchema.safeParse(r).success).toBe(valid);
  });
  it.each(['unknown', 'mismatched'] as const)('stops before collection for %s releases', match => {
    const r = aggregate();
    const reason = match === 'unknown' ? 'release_unknown' : 'release_mismatch';
    const stopped = { ...r, instance_release: match === 'unknown'
      ? { source: 'none', resolution_status: 'unknown', family: null, visibility_scope: 'unavailable', reason: 'not_configured' }
      : { ...r.instance_release, family: 'Zurich' }, release_match: match,
      collection: { ...r.collection, status: 'not_started', metadata_seen: 0, selected: 0 }, consistency: 'unverified',
      assets: [], counts: { ...r.counts, reviewed: 0, findings: 0 },
      coverage: { ...r.coverage, analysis_complete: false, skipped_rules: [{ rule_id: 'AU-BR-001', reason }] },
      limitations: [...r.limitations, reason, 'not_configured'] };
    expect(aggregateReviewSchema.safeParse(stopped).success).toBe(true);
    expect(aggregateReviewSchema.safeParse({ ...stopped, assets: r.assets }).success).toBe(false);
    expect(aggregateReviewSchema.safeParse({ ...stopped, coverage: { ...stopped.coverage, skipped_rules: [] } }).success).toBe(false);
  });
  it.each([
    ['2026-10-17T04:59:59.999Z', true],
    ['2026-10-17T05:00:00Z', true],
    ['2026-10-17T05:00:00.001Z', false],
  ])('checks the recorded run duration at %s', (endedAt, valid) => {
    const r = aggregate();
    r.ended_at = endedAt;
    r.assets[0].result.reviewed_at = '2026-10-17T04:59:20Z';
    r.assets[0].result.target.retrieved_at = '2026-10-17T04:59:10Z';
    expect(aggregateReviewSchema.safeParse(r).success).toBe(valid);
  });
  it('requires operator evidence to exist at admission, not merely before review completion', () => {
    const r = aggregate();
    r.instance_release.asserted_at = '2026-10-17T04:59:10Z';
    r.assets[0].result.instance_release.asserted_at = r.instance_release.asserted_at;
    expect(aggregateReviewSchema.safeParse(r).success).toBe(false);
  });
  it('can report insufficient assertion lifetime without collecting or discarding results later', () => {
    const r = aggregate();
    const stopped = { ...r,
      instance_release: { source: 'none', resolution_status: 'unknown', family: null,
        visibility_scope: 'unavailable', reason: 'config_validity_insufficient' }, release_match: 'unknown',
      collection: { ...r.collection, status: 'not_started', metadata_seen: 0, selected: 0 }, consistency: 'unverified',
      assets: [], counts: { ...r.counts, reviewed: 0, findings: 0 },
      coverage: { ...r.coverage, analysis_complete: false,
        skipped_rules: [{ rule_id: 'AU-BR-001', reason: 'release_unknown' }] },
      limitations: ['source_approval_pending', 'release_unknown', 'config_validity_insufficient'] };
    expect(aggregateReviewSchema.safeParse(stopped).success).toBe(true);
  });
  it('allows a genuinely empty visible set, but rejects raw errors and oversized JSON', () => {
    const r = aggregate();
    const empty = { ...r, assets: [], collection: { ...r.collection, metadata_seen: 0, selected: 0 },
      counts: { ...r.counts, reviewed: 0, findings: 0 } };
    expect(aggregateReviewSchema.safeParse(empty).success).toBe(true);
    expect(aggregateReviewSchema.safeParse({ ...empty, errors: [{ stage: 'metadata', code: 'access_denied', message: 'secret' }] }).success).toBe(false);
    const large = aggregate();
    large.assets[0].result.findings = Array.from({ length: 100 }, () => structuredClone(large.assets[0].result.findings[0]));
    large.counts.findings = 100;
    large.assets[0].result.limitations = Array.from({ length: 100 }, () => 'x'.repeat(2000));
    large.limitations = [...large.limitations, ...Array.from({ length: 90 }, () => 'x'.repeat(2000))];
    expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(262144);
    expect(aggregateReviewSchema.safeParse(large).success).toBe(false);
  });
  it('represents max+1 metadata truncation without claiming complete analysis', () => {
    const r = aggregate();
    const truncated = { ...r, limits: { ...r.limits, max_records: 1 },
      collection: { ...r.collection, metadata_seen: 2, truncated: true },
      coverage: { ...r.coverage, analysis_complete: false }, limitations: [...r.limitations, 'metadata_truncated'] };
    expect(aggregateReviewSchema.safeParse(truncated).success).toBe(true);
    expect(aggregateReviewSchema.safeParse({ ...truncated, coverage: r.coverage }).success).toBe(false);
    expect(aggregateReviewSchema.safeParse({ ...truncated, limitations: r.limitations }).success).toBe(false);
  });
  it('distinguishes metadata failure from a successful empty list', () => {
    const r = aggregate();
    const failed = { ...r, status: 'failed', assets: [], consistency: 'unverified',
      collection: { ...r.collection, status: 'failed', metadata_seen: 0, selected: 0 },
      counts: { ...r.counts, reviewed: 0, findings: 0 }, coverage: { ...r.coverage, analysis_complete: false },
      errors: [{ stage: 'metadata', code: 'metadata_unavailable' }] };
    expect(aggregateReviewSchema.safeParse(failed).success).toBe(true);
    expect(aggregateReviewSchema.safeParse({ ...failed, status: 'partial' }).success).toBe(false);
    expect(aggregateReviewSchema.safeParse({ ...failed, errors: [] }).success).toBe(false);
  });
  it.each([
    ['wrong parent', (r: ReturnType<typeof aggregate>) => { r.assets[0].result.target.update_set_id = 'f'.repeat(32); }],
    ['wrong XML id', (r: ReturnType<typeof aggregate>) => { r.assets[0].update_xml_sys_id = 'f'.repeat(32); }],
    ['different instance', (r: ReturnType<typeof aggregate>) => { r.target.instance_binding = 'f'.repeat(64); }],
    ['different release', (r: ReturnType<typeof aggregate>) => { r.assets[0].result.instance_release.config_version = 'f'.repeat(64); }],
    ['mismatched applicability', (r: ReturnType<typeof aggregate>) => { r.assets[0].applicable_rule_ids = ['AU-BR-002']; }],
    ['wrong count', (r: ReturnType<typeof aggregate>) => { r.counts.reviewed = 0; }],
    ['wrong finding count', (r: ReturnType<typeof aggregate>) => { r.counts.findings = 0; }],
    ['unaccounted selected row', (r: ReturnType<typeof aggregate>) => { r.collection.selected = 2; }],
    ['duplicate row', (r: ReturnType<typeof aggregate>) => { r.assets.push(r.assets[0]); }],
    ['unrequested rule', (r: ReturnType<typeof aggregate>) => { r.coverage.requested_rule_ids = ['AU-CL-004']; }],
    ['forged completion', (r: ReturnType<typeof aggregate>) => { r.status = 'completed'; }],
    ['false stability', (r: ReturnType<typeof aggregate>) => { r.consistency = 'changed'; }],
    ['future nested review', (r: ReturnType<typeof aggregate>) => { r.assets[0].result.reviewed_at = '2026-10-18T00:00:00Z'; }],
    ['reverse time', (r: ReturnType<typeof aggregate>) => { r.started_at = '2026-10-18T00:00:00Z'; }],
    ['failed with candidates', (r: ReturnType<typeof aggregate>) => { r.status = 'failed'; }],
  ])('rejects %s', (_name, mutate) => {
    const r = aggregate(); mutate(r);
    expect(aggregateReviewSchema.safeParse(r).success).toBe(false);
  });
  it('accounts for mixed asset outcomes and never hides omitted results or unprocessed records', () => {
    const r = aggregate();
    const mixed = { ...r, assets: [r.assets[0],
      { state: 'not_applicable', update_xml_sys_id: '4'.repeat(32), asset_type: 'client_script', reason: 'no_requested_rules' },
      { state: 'skipped_deleted', update_xml_sys_id: '5'.repeat(32), reason: 'deleted_asset' },
      { state: 'rejected', update_xml_sys_id: '6'.repeat(32), reason: 'invalid_xml' },
      { state: 'retrieval_failed', update_xml_sys_id: '7'.repeat(32), reason: 'missing_required_field' },
      { state: 'not_processed', update_xml_sys_id: '8'.repeat(32), reason: 'deadline_exceeded' },
      { state: 'result_omitted', update_xml_sys_id: '9'.repeat(32), reason: 'response_limit' }],
      collection: { ...r.collection, metadata_seen: 7, selected: 7 },
      counts: { reviewed: 1, not_applicable: 1, skipped_deleted: 1, rejected: 1, retrieval_failed: 1,
        not_processed: 1, result_omitted: 1, findings: 1 },
      coverage: { ...r.coverage, analysis_complete: false },
      limitations: [...r.limitations, 'deadline_exceeded', 'response_truncated'],
      errors: [{ stage: 'analysis', code: 'deadline_exceeded' }] };
    expect(aggregateReviewSchema.safeParse(mixed).success).toBe(true);
    expect(aggregateReviewSchema.safeParse({ ...mixed, coverage: { ...mixed.coverage, analysis_complete: true } }).success).toBe(false);
    expect(aggregateReviewSchema.safeParse({ ...mixed, limitations: r.limitations }).success).toBe(false);
  });
});
