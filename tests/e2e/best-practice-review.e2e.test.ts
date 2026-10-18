/** Opt-in PDI reads only. Never prints source, raw API responses or credentials. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { handleCallTool, handleListTools } from '../../src/server.js';
import { aggregateReviewSchema, type AggregateReview } from '../../src/review/aggregate-schema.js';

const name = 'review_update_set_best_practices';
const id = z.string().regex(/^[a-f0-9]{32}$/);
const tally = (values: string[]) => values.reduce<Record<string, number>>((counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1; return counts;
}, {});
e2eDescribe('E2E – Best-practice MCP review (PDI read-only, no source output)', () => {
  const originalFetch = globalThis.fetch;
  const requests: Record<string, number> = {};
  let selected: string | undefined, blocked = 0, host: string;
  const context = instanceManager.createContext();
  const results: AggregateReview[] = [];
  beforeAll(async () => {
    host = new URL(context.getCurrentUrl()).host;
    if (!/^dev\d+\.service-now\.com$/.test(host)) throw Error('PDI_REQUIRED');
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url)), method = init.method ?? 'GET';
      const table = u.pathname.split('/')[4];
      const read = method === 'GET' && /^\/api\/now\/table\/(sys_update_set|sys_update_xml|sys_cluster_state)(\/|\?)/.test(u.pathname + u.search);
      const oauth = method === 'POST' && u.pathname === '/oauth_token.do';
      if (u.protocol !== 'https:' || u.host !== host || !(read || oauth)) { blocked++; throw Error('READ_ONLY_GUARD'); }
      const key = oauth ? 'POST oauth_token' : `GET ${table}${u.searchParams.get('sysparm_fields')?.includes('payload') ? '_payload' : ''}`;
      requests[key] = (requests[key] ?? 0) + 1;
      return originalFetch(url, init);
    };
    if (process.env.BP5_E2E_UPDATE_SET_SYS_ID) {
      selected = id.parse(process.env.BP5_E2E_UPDATE_SET_SYS_ID); return;
    }
    // Discovery is metadata only, bounded independently, without legacy retries/logging.
    const session = getE2EClient().createBoundedReadSession({ limits: { deadlineMs: 15000, requestTimeoutMs: 5000 } });
    try {
      const params = new URLSearchParams({ sysparm_fields: 'update_set,name,action', sysparm_display_value: 'false',
        sysparm_exclude_reference_link: 'true', sysparm_limit: '100',
        sysparm_query: 'nameSTARTSWITHsys_script_^ORnameSTARTSWITHsys_script_client_^ORDERBYDESCsys_updated_on' });
      const raw = await session.get(`/api/now/table/sys_update_xml?${params}`);
      const metadata = z.object({ result: z.array(z.object({ update_set: z.string(), name: z.string(), action: z.string() })).max(100) }).parse(raw);
      const candidates = metadata.result.filter(row => row.action === 'INSERT_OR_UPDATE'
        && /^(sys_script|sys_script_client)_[a-f0-9]{32}$/.test(row.name) && id.safeParse(row.update_set).success);
      const counts = tally(candidates.map(row => row.update_set));
      selected = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    } catch { throw Error('BOUNDED_METADATA_DISCOVERY_FAILED'); }
    finally { session.close(); }
  }, 20000);
  afterAll(() => {
    globalThis.fetch = originalFetch;
    console.log('BP5_E2E_REQUESTS ' + JSON.stringify({ host, requests, blocked, source_printed: false, writes_performed: false }));
  });
  for (const mode of ['default20', 'max100'] as const) it(`checks bounded collection of an existing Update Set with ${mode} and returns source-free validated JSON`, async ctx => {
    ctx.skip(!selected, 'data missing: no existing Update Set with visible BR/Client Script updates in the bounded sample');
    expect((await handleListTools()).tools.filter(tool => tool.name === name)).toHaveLength(1);
    const response = await handleCallTool({ params: { name, arguments: {
      update_set_sys_id: selected!, ...(mode === 'max100' ? { max_records: 100 } : {}),
    } } }, context);
    const parsed: unknown = JSON.parse(response.content[0].text);
    if (response.isError) {
      // Only the tool's sanitized failure code is recorded; never dump the response/body.
      const error = z.object({ error: z.object({ stage: z.string(), code: z.string() }) }).safeParse(parsed);
      console.log('BP5_E2E_FAILURE ' + JSON.stringify({ mode, error: error.success ? error.data.error : { code: 'INVALID_TOOL_FAILURE' } }));
      throw Error('READ_ONLY_REVIEW_FAILED');
    }
    const validated = aggregateReviewSchema.safeParse(parsed);
    expect(validated.success, 'aggregate JSON contract must pass without displaying the response').toBe(true);
    if (!validated.success) throw Error('INVALID_REVIEW_CONTRACT');
    const result = validated.data;
    const findings = result.assets.flatMap(asset => asset.state === 'reviewed' ? asset.result.findings : []);
    console.log('BP5_E2E_SUMMARY ' + JSON.stringify({ mode, update_set_sys_id: selected, status: result.status,
      release: { source: result.instance_release.source, resolution_status: result.instance_release.resolution_status, family: result.instance_release.family },
      release_match: result.release_match, principal: result.principal, collection: result.collection, counts: result.counts,
      consistency: result.consistency, coverage: result.coverage,
      findings_by_rule: tally(findings.map(finding => finding.rule_id)),
      not_applicable_by_reason: tally(result.assets.filter(asset => asset.state === 'not_applicable').map(asset => asset.reason)),
      skipped_deleted_by_reason: tally(result.assets.filter(asset => asset.state === 'skipped_deleted').map(asset => asset.reason)),
      rejected_by_reason: tally(result.assets.filter(asset => asset.state === 'rejected').map(asset => asset.reason)),
      unprocessed_by_reason: tally(result.assets.filter(asset => asset.state === 'not_processed').map(asset => asset.reason)),
      limitations: result.limitations, errors: result.errors.map(error => ({ stage: error.stage, code: error.code })) }));
    expect(result.code_return_mode).toBe('none'); expect(result.poc_only).toBe(true);
    expect(result.status).toBe('partial'); expect(result.release_match, 'this PDI should have supported release evidence').toBe('matched');
    expect(result.limitations).toContain('source_approval_pending');
    expect(result.collection.selected, 'this collection check requires existing visible metadata, not an empty success').toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThanOrEqual(262144);
    expect(blocked).toBe(0);
    if (results.length) {
      expect(result.target.instance_binding).toBe(results[0].target.instance_binding);
      expect(result.collection.selected).toBeGreaterThanOrEqual(results[0].collection.selected);
    }
    results.push(result);
  }, 75000);
  it('exercises payload analysis only if the bounded selected slice contains eligible existing assets', ctx => {
    ctx.skip(!selected, 'data missing: no candidate Update Set in the bounded discovery');
    ctx.skip(!requests['GET sys_update_xml_payload'],
      'data outside bounded selection: no payload-eligible BR/Client Script in the first 100 metadata rows; payload analysis not exercised');
    expect(results.some(result => result.counts.reviewed > 0), 'attempted payloads must not all fail unnoticed').toBe(true);
  });
});
