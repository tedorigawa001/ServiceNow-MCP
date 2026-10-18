/** Read-only Client Script discovery + AU-CL-004 review; never print source. */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { handleCallTool } from '../../src/server.js';
import { aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';

const id = z.string().regex(/^[a-f0-9]{32}$/);
const tally = (values: string[]) => values.reduce<Record<string, number>>((counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1; return counts;
}, {});
e2eDescribe('E2E – AU-CL-004 with an existing Client Script Update Set (read-only)', () => {
  const originalFetch = globalThis.fetch;
  const context = instanceManager.createContext();
  const requests: Record<string, number> = {};
  let host: string, selected: string | undefined, blocked = 0;
  let discovery: Record<string, unknown> = {};
  beforeAll(async () => {
    host = new URL(context.getCurrentUrl()).host;
    if (!/^dev\d+\.service-now\.com$/.test(host)) throw Error('PDI_REQUIRED');
    if (process.env.BP5_E2E_EXPECTED_HOST && host !== process.env.BP5_E2E_EXPECTED_HOST) throw Error('PDI_HOST_MISMATCH');
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url)), method = init.method ?? 'GET';
      const read = method === 'GET' && /^\/api\/now\/table\/(sys_update_set|sys_update_xml|sys_cluster_state)(\/|\?)/.test(u.pathname + u.search);
      const oauth = method === 'POST' && u.pathname === '/oauth_token.do';
      if (u.protocol !== 'https:' || u.host !== host || !(read || oauth)) { blocked++; throw Error('READ_ONLY_GUARD'); }
      const key = oauth ? 'POST oauth_token' : `GET ${u.pathname.split('/')[4]}${u.searchParams.get('sysparm_fields')?.includes('payload') ? '_payload' : ''}`;
      requests[key] = (requests[key] ?? 0) + 1;
      return originalFetch(url, init);
    };
    if (process.env.BP5_CLIENT_E2E_UPDATE_SET_SYS_ID) {
      selected = id.parse(process.env.BP5_CLIENT_E2E_UPDATE_SET_SYS_ID);
      discovery = { source: 'explicit_existing_id' }; return;
    }
    const session = getE2EClient().createBoundedReadSession({ limits: { deadlineMs: 15000, requestTimeoutMs: 5000 } });
    try {
      const params = new URLSearchParams({ sysparm_fields: 'sys_id,update_set,name,action,type', sysparm_display_value: 'false',
        sysparm_exclude_reference_link: 'true', sysparm_limit: '101', sysparm_offset: '0', sysparm_no_count: 'true',
        sysparm_query: 'action=INSERT_OR_UPDATE^nameSTARTSWITHsys_script_client_^ORDERBYDESCsys_updated_on^ORDERBYsys_id' });
      const metadataSchema = z.strictObject({ result: z.array(z.strictObject({ sys_id: id, update_set: z.string(),
        name: z.string().min(1).max(200), action: z.string().max(40), type: z.string().max(200).optional() })).max(101) });
      const read = async () => {
        const parsed = metadataSchema.safeParse(await session.get(`/api/now/table/sys_update_xml?${params}`));
        if (!parsed.success) throw Error('INVALID_DISCOVERY_RESPONSE');
        return parsed.data.result;
      };
      const rows = await read();
      if (new Set(rows.map(r => r.sys_id)).size !== rows.length || rows.some(r => r.action !== 'INSERT_OR_UPDATE'
        || !r.name.startsWith('sys_script_client_'))) throw Error('DISCOVERY_FILTER_VIOLATION');
      const eligible = (r: typeof rows[number]) => r.action === 'INSERT_OR_UPDATE'
        && /^sys_script_client_[a-f0-9]{32}$/.test(r.name) && id.safeParse(r.update_set).success;
      const candidates = rows.slice(0, 100).filter(eligible);
      const supplementary: { kind: string; metadata_seen: number; by_action: Record<string, number>; eligible_rows: number }[] = [];
      if (!candidates.length) {
        // Bounded diagnostics only, not fallback queries inside the MCP tool.
        // Display type is a discovery hint, never an identity proof.
        for (const [kind, query] of [
          ['client_prefix_all_actions', 'nameSTARTSWITHsys_script_client_^ORDERBYDESCsys_updated_on^ORDERBYsys_id'],
          ['client_display_type_hint', 'type=Client Script^action=INSERT_OR_UPDATE^ORDERBYDESCsys_updated_on^ORDERBYsys_id'],
        ]) {
          params.set('sysparm_query', query);
          const extra = await read();
          if (extra.some(r => kind === 'client_prefix_all_actions' ? !r.name.startsWith('sys_script_client_')
            : r.type !== 'Client Script' || r.action !== 'INSERT_OR_UPDATE')) throw Error('DISCOVERY_FILTER_VIOLATION');
          const found = extra.slice(0, 100).filter(eligible);
          supplementary.push({ kind, metadata_seen: extra.length, by_action: tally(extra.map(r => r.action)), eligible_rows: found.length });
          for (const r of found) if (!candidates.some(c => c.sys_id === r.sys_id)) candidates.push(r);
          if (candidates.length) break;
        }
      }
      const byParent = tally(candidates.map(r => r.update_set));
      selected = Object.keys(byParent).sort((a, b) => byParent[b] - byParent[a] || a.localeCompare(b))[0];
      discovery = { source: 'bounded_client_update_metadata', metadata_seen: rows.length, inspected: Math.min(rows.length, 100),
        lookahead_observed: rows.length > 100, supplementary, eligible_rows: candidates.length, candidate_update_sets: Object.keys(byParent).length,
        selected_update_set_sys_id: selected ?? null, inventory_complete: false, ...session.stats() };
    } catch { throw Error('BOUNDED_CLIENT_DISCOVERY_FAILED'); }
    finally { session.close(); }
  }, 20000);
  afterAll(() => {
    globalThis.fetch = originalFetch;
    console.log('BP5_CLIENT_DISCOVERY ' + JSON.stringify(discovery));
    console.log('BP5_CLIENT_REQUESTS ' + JSON.stringify({ host, requests, blocked, source_printed: false, writes_performed: false }));
  });
  it('evaluates AU-CL-004 through opt-in 0.3 on existing Client Script payloads', async ctx => {
    ctx.skip(!selected, 'data missing in bounded discovery: no visible Client Script INSERT_OR_UPDATE linked to an existing Update Set; no records created');
    const response = await handleCallTool({ params: { name: 'review_update_set_best_practices', arguments: {
      update_set_sys_id: selected!, selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-004'], max_records: 100,
    } } }, context);
    const raw: unknown = JSON.parse(response.content[0].text);
    if (response.isError) {
      const failure = z.object({ error: z.object({ stage: z.string(), code: z.string() }) }).safeParse(raw);
      console.log('BP5_CLIENT_FAILURE ' + JSON.stringify(failure.success ? failure.data.error : { code: 'INVALID_TOOL_FAILURE' }));
      throw Error('READ_ONLY_CLIENT_REVIEW_FAILED');
    }
    const parsed = aggregateReviewV3Schema.safeParse(raw);
    expect(parsed.success, '0.3 runtime contract must pass; raw response is never displayed').toBe(true);
    if (!parsed.success) throw Error('INVALID_CLIENT_REVIEW_CONTRACT');
    const r = parsed.data;
    const reviewed = r.assets.flatMap(a => a.state === 'reviewed' ? [a.result] : []);
    const evaluated = reviewed.filter(a => a.target.asset_type === 'client_script' && a.coverage.evaluated_rule_ids.includes('AU-CL-004'));
    console.log('BP5_CLIENT_SUMMARY ' + JSON.stringify({ update_set_sys_id: selected, schema_version: r.schema_version,
      status: r.status, release: { source: r.instance_release.source, family: r.instance_release.family, resolution_status: r.instance_release.resolution_status },
      release_match: r.release_match, principal: r.principal, selection: r.selection, collection: r.collection,
      coverage: r.coverage, consistency: r.consistency, counts: r.counts, evaluated_client_assets: evaluated.length,
      reviewed_by_asset_type: tally(reviewed.map(a => a.target.asset_type)),
      findings_by_rule: tally(reviewed.flatMap(a => a.findings.map(f => f.rule_id))),
      skipped_rules_by_reason: tally(reviewed.flatMap(a => a.coverage.skipped_rules.map(s => `${s.rule_id}:${s.reason}`))),
      rejected_by_reason: tally(r.assets.flatMap(a => a.state === 'rejected' ? [a.reason] : [])),
      duration_ms: Date.parse(r.ended_at) - Date.parse(r.started_at), mcp_response_bytes: Buffer.byteLength(JSON.stringify(response)),
      limitations: r.limitations, errors: r.errors.map(e => ({ stage: e.stage, code: e.code })) }));
    expect(r.release_match).toBe('matched'); expect(r.code_return_mode).toBe('none'); expect(r.status).toBe('partial');
    expect(r.selection.requested_asset_types).toEqual(['client_script']);
    expect(evaluated.length, 'a real Client Script must be evaluated, not merely collected or skipped').toBeGreaterThan(0);
    expect(r.collection.selected).toBeLessThanOrEqual(100); expect(r.collection.metadata_seen).toBeLessThanOrEqual(101);
    expect(Date.parse(r.ended_at) - Date.parse(r.started_at)).toBeLessThanOrEqual(60000);
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThanOrEqual(262144);
    expect(blocked).toBe(0);
  }, 75000);
});
