/** Explicit write opt-in. Only disposable inactive data; review itself is read-only. */
import { expect, it } from 'vitest';
import { describe } from 'vitest';
import { isE2EConfigured, getE2EClient } from './helpers.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { handleCallTool } from '../../src/server.js';
import { aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';
import { clientReviewFixture } from './bp5-client-fixture.js';

describe.skipIf(!isE2EConfigured() || process.env.BP5_CLIENT_WRITE_FIXTURES !== 'true')('E2E – disposable inactive AU-CL-004 fixture', () => {
  it('creates native inactive Client Script update, reviews AU-CL-004 and removes only owned records', async () => {
    const context = instanceManager.createContext();
    const host = new URL(context.getCurrentUrl()).host;
    if (host !== process.env.BP5_E2E_EXPECTED_HOST) throw Error('PDI_HOST_MISMATCH');
    const fixture = clientReviewFixture(getE2EClient(), host);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fixture.guard;
    let failure: string | undefined;
    try {
      const ids = await fixture.create();
      console.log('BP5_CLIENT_FIXTURE_CREATED ' + JSON.stringify(ids));
      const response = await handleCallTool({ params: { name: 'review_update_set_best_practices', arguments: {
        update_set_sys_id: ids.updateSetId, selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-004'], max_records: 20,
      } } }, context);
      if (response.isError) throw Error('FIXTURE_REVIEW_FAILED');
      const parsed = aggregateReviewV3Schema.safeParse(JSON.parse(response.content[0].text));
      if (!parsed.success) throw Error('FIXTURE_REVIEW_INVALID_CONTRACT');
      const r = parsed.data;
      const asset = r.assets.find(a => a.update_xml_sys_id === ids.updateXmlId);
      if (asset?.state !== 'reviewed') throw Error('FIXTURE_CLIENT_NOT_REVIEWED');
      const matches = asset.result.findings.filter(f => f.rule_id === 'AU-CL-004');
      console.log('BP5_CLIENT_FIXTURE_REVIEW ' + JSON.stringify({ ...ids, schema_version: r.schema_version, status: r.status,
        release_match: r.release_match, collection: r.collection, counts: r.counts, coverage: r.coverage,
        consistency: r.consistency, evaluated_rules: asset.result.coverage.evaluated_rule_ids,
        finding_count: matches.length, required_follow_up: matches.flatMap(f => f.required_follow_up),
        asset_limitations: asset.result.limitations, limitations: r.limitations,
        duration_ms: Date.parse(r.ended_at) - Date.parse(r.started_at), mcp_response_bytes: Buffer.byteLength(JSON.stringify(response)),
        errors: r.errors.map(e => ({ stage: e.stage, code: e.code })) }));
      expect(r.schema_version).toBe('bp-mcp-review-0.3'); expect(r.code_return_mode).toBe('none');
      expect(r.release_match).toBe('matched'); expect(r.counts.reviewed).toBe(1);
      expect(asset.result.target.asset_type).toBe('client_script');
      expect(asset.result.coverage.evaluated_rule_ids).toContain('AU-CL-004');
      expect(matches.length).toBeGreaterThan(0);
      expect(asset.result.limitations).toContain('inactive_asset');
      expect(r.coverage.candidate_inventory_complete).toBe(false); expect(r.coverage.update_set_inventory_complete).toBe(false);
    } catch (error) {
      // Never emit client/server/parser diagnostics or inspected source.
      const safe = ['NATIVE_CLIENT_CAPTURE_UNAVAILABLE', 'FIXTURE_INACTIVE_NOT_RETAINED', 'FIXTURE_LINK_FAILED',
        'FIXTURE_NAME_NOT_RETAINED', 'FIXTURE_SCOPE_NOT_RETAINED',
        'FIXTURE_REVIEW_FAILED', 'FIXTURE_REVIEW_INVALID_CONTRACT', 'FIXTURE_CLIENT_NOT_REVIEWED'];
      failure = error instanceof Error && safe.includes(error.message) ? error.message : 'FIXTURE_E2E_FAILED';
      console.log('BP5_CLIENT_FIXTURE_FAILURE ' + JSON.stringify({ code: failure, source_printed: false }));
    } finally {
      try {
        const cleanup = await fixture.cleanup();
        expect(cleanup.history_policy).toBe('retain');
        expect(cleanup.requests['DELETE sys_update_version'] ?? 0).toBe(0);
      } finally { globalThis.fetch = originalFetch; }
    }
    if (failure) throw Error(failure);
  }, 180000);
});
