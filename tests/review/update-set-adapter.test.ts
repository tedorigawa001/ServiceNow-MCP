import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { reviewBoundedUpdateSet as reviewWithWorker } from '../../src/review/update-set-adapter.js';
import { aggregateReviewSchema } from '../../src/review/aggregate-schema.js';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { sourceWorkerFactory } from './fixtures/worker-factory.js';
const reviewBoundedUpdateSet: typeof reviewWithWorker = (client, input, options) =>
  reviewWithWorker(client, input, { ...options, workerFactory: sourceWorkerFactory });

const parent = 'a'.repeat(32);
const id = (n: number) => n.toString(16).padStart(32, '0');
const json = (result: unknown) => new Response(JSON.stringify({ result }));
const parentRow = { sys_id: parent, state: 'in progress', application: 'global', sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = (n: number, table = 'sys_script', action = 'INSERT_OR_UPDATE') => ({ sys_id: id(n), update_set: parent,
  name: `${table}_${id(n + 100)}`, type: 'Untrusted display type', action, sys_updated_on: parentRow.sys_updated_on, sys_mod_count: '0' });
type Row = ReturnType<typeof row>;
const xml = (r: Row, script = '/* SYNTHETIC_PRIVATE_BODY */ current.update();') => {
  const table = r.name.slice(0, -33);
  return `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${r.name.slice(-32)}</sys_id><sys_scope>global</sys_scope><when>async_always</when><script><![CDATA[${script}]]></script><filter_condition><item field="active"/></filter_condition></${table}><sys_translated_text action="delete_multiple"/><sys_es_latest_script/></record_update>`;
};
const client = () => new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'synthetic-private-token', oauth: { clientId: '', clientSecret: '' } });
const input = { update_set_sys_id: parent, requested_rule_ids: ['AU-BR-001', 'AU-BR-002', 'AU-CL-004'] };
function fixture(rows: Row[]) {
  const details = new Map<string, unknown>(rows.map(r => { const detail: Record<string, unknown> = { ...r }; delete detail.type;
    return [r.sys_id, { ...detail, payload: xml(r) }]; }));
  const fetcher = vi.fn<typeof fetch>(async url => {
    const u = new URL(String(url));
    if (u.pathname.includes('/sys_update_set/')) return json(parentRow);
    if (u.pathname.endsWith('/sys_cluster_state')) return json([{ build_name: 'Australia' }]);
    if (u.searchParams.get('sysparm_fields')?.includes('payload')) {
      const selected = u.searchParams.get('sysparm_query')!.match(/^sys_id=([a-f0-9]{32})/)![1];
      return json(details.has(selected) ? [details.get(selected)] : []);
    }
    return json(rows);
  });
  return { details, fetcher };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('BP-5 bounded update-set adapter', () => {
  it.each(['sys_script_', 'sys_script_bad_id', 'sys_script_client_', 'sys_script_client_bad_id',
    `sys_script_${'a'.repeat(31)}`, `sys_script_client_${'A'.repeat(32)}`])('still rejects malformed target name %s without fetching its payload', async name => {
    const { fetcher } = fixture([{ ...row(1), name }]);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected rejected target');
    expect(outcome.result.assets[0]).toMatchObject({ state: 'rejected', reason: 'identity_mismatch' });
    expect(outcome.result.coverage.analysis_complete).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it.each([`sys_script_include_${id(101)}`, 'sys_scripted_custom_composite', 'other_composite_update'])('does not confuse unsupported name %s with a malformed BR', async name => {
    const { fetcher } = fixture([{ ...row(1), name }]);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected non-target');
    expect(outcome.result.assets[0]).toMatchObject({ state: 'not_applicable', asset_type: 'other', reason: 'asset_type_unsupported' });
    expect(outcome.result.coverage.analysis_complete).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('completes visible analysis of a BR mixed with normal Dictionary and Choice updates', async () => {
    const rows = [row(1), { ...row(2), name: 'sys_dictionary_incident_u_review_demo' },
      { ...row(3), name: 'sys_choice_incident_u_review_demo' }];
    const { fetcher } = fixture(rows);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected mixed aggregate');
    expect(outcome.result).toMatchObject({ counts: { reviewed: 1, findings: 1, not_applicable: 2, rejected: 0 },
      consistency: 'stable_observation', coverage: { analysis_complete: true } });
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => new URL(String(url)).searchParams.get('sysparm_fields')?.includes('payload'))).toHaveLength(1);
  });
  it.each(['sys_dictionary_incident_u_review_demo', 'sys_choice_incident_u_review_demo'])('treats normal non-sys_id update name %s as unsupported, not rejected', async name => {
    const r = { ...row(1), name };
    const { fetcher } = fixture([r]);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected aggregate');
    expect(outcome.result.assets).toEqual([{ state: 'not_applicable', update_xml_sys_id: r.sys_id,
      asset_type: 'other', reason: 'asset_type_unsupported' }]);
    expect(outcome.result).toMatchObject({ counts: { rejected: 0, not_applicable: 1 },
      consistency: 'stable_observation', coverage: { analysis_complete: true } });
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(5);
    for (const [url] of fetcher.mock.calls) expect(new URL(String(url)).searchParams.get('sysparm_fields')).not.toContain('payload');
  });
  it('distinguishes all-rejected records from successful clear analysis', async () => {
    const { fetcher, details } = fixture([row(1)]);
    details.set(id(1), { ...(details.get(id(1)) as object), payload: '<broken>' });
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) expect(outcome.result).toMatchObject({ status: 'partial', counts: { reviewed: 0, rejected: 1, findings: 0 },
      coverage: { analysis_complete: false } });
  });
  it('fails without findings if authentication stops before any asset is analyzed', async () => {
    const base = fixture([row(1), row(2)]);
    const fetcher: typeof fetch = async (url, init) => new URL(String(url)).searchParams.get('sysparm_fields')?.includes('payload')
      ? new Response('SYNTHETIC_PRIVATE_ERROR', { status: 401 }) : base.fetcher(url, init);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(true);
    expect(outcome.result).toMatchObject({ status: 'failed', counts: { reviewed: 0, not_processed: 2, findings: 0 }, consistency: 'unverified' });
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
  });
  it('dispatches Client Script rules from identity, and exposes only the real applicable coverage', async () => {
    const r = row(1, 'sys_script_client');
    const { fetcher, details } = fixture([r]);
    details.set(r.sys_id, { ...(details.get(r.sys_id) as object), payload: xml(r, "var ajax = new GlideAjax('SYNTHETIC_PRIVATE_BODY'); ajax.getXMLWait();") });
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) {
      const a = outcome.result.assets[0];
      if (a.state !== 'reviewed') throw Error('Expected Client Script');
      expect(a.applicable_rule_ids).toEqual(['AU-CL-004']);
      expect(a.result.findings[0].required_follow_up).toContain('synchronous_ajax_review');
      expect(a.result.target.asset_table).toBe('sys_script_client');
      expect(JSON.stringify(outcome)).not.toContain('SYNTHETIC_PRIVATE_BODY');
    }
  });
  it.each(['identity', 'detail_version', 'missing_context'])('accounts for %s without claiming a clear result', async kind => {
    const r = row(1);
    const { fetcher, details } = fixture([r]);
    const detail = details.get(r.sys_id) as { payload: string; sys_mod_count: string };
    if (kind === 'identity') detail.payload = detail.payload.replace(`<sys_id>${id(101)}</sys_id>`, `<sys_id>${id(102)}</sys_id>`);
    if (kind === 'detail_version') detail.sys_mod_count = '1';
    if (kind === 'missing_context') detail.payload = detail.payload.replace('<when>async_always</when>', '');
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) {
      const a = outcome.result.assets[0];
      if (kind === 'identity') expect(a).toMatchObject({ state: 'rejected', reason: 'identity_mismatch' });
      if (kind === 'detail_version') expect(a).toMatchObject({ state: 'retrieval_failed', reason: 'changed_during_review' });
      if (kind === 'missing_context' && a.state === 'reviewed') expect(a.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-002', reason: 'missing_context' }]);
      expect(outcome.result.coverage.analysis_complete).toBe(false);
    }
  });
  it.each(['deadline', 'cancel'] as const)('returns only a fixed error on whole-run %s, without late work or secrets', async kind => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel })));
    const pending = reviewBoundedUpdateSet(client(), input, { fetch: fetcher, signal: controller.signal,
      limits: { deadlineMs: 50, requestTimeoutMs: 1000 } });
    if (kind === 'cancel') controller.abort(new Error('SYNTHETIC_PRIVATE_ERROR'));
    await vi.advanceTimersByTimeAsync(50);
    const outcome = await pending;
    expect(outcome).toEqual({ isError: true, error: { stage: 'parent', code: kind === 'deadline' ? 'deadline_exceeded' : 'cancelled' } });
    expect(vi.getTimerCount()).toBe(0);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it('discards all candidates if final result validation fails after a wall-clock rollback', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    vi.setSystemTime(now + 60000);
    const base = fixture([row(1)]);
    let parents = 0;
    const fetcher: typeof fetch = async (url, init) => {
      if (new URL(String(url)).pathname.includes('/sys_update_set/') && ++parents === 2) vi.setSystemTime(now - 1000);
      return base.fetcher(url, init);
    };
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome).toEqual({ isError: true, error: { stage: 'output', code: 'internal_review_error' } });
    expect(JSON.stringify(outcome)).not.toMatch(/SYNTHETIC_PRIVATE|findings|stack/);
  });
  it.each([401, 403, 404])('returns a fixed parent failure for HTTP %i without reading release or payload', async status => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('SYNTHETIC_PRIVATE_ERROR', { status }));
    expect(await reviewBoundedUpdateSet(client(), input, { fetch: fetcher })).toEqual({ isError: true,
      error: { stage: 'parent', code: status === 401 ? 'authentication_failed' : status === 403 ? 'access_denied' : 'not_found_or_not_visible' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['receive', 'payload'] as const)('stops on the cumulative %s budget and accounts for remaining rows', async kind => {
    const { fetcher } = fixture([row(1), row(2), row(3)]);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher,
      limits: kind === 'payload' ? { totalPayloadBytes: 700 } : { totalBytes: 2300 } });
    const result = outcome.result;
    expect(result).toBeDefined();
    if (!result) throw Error('Expected stop accounting');
    expect(result.coverage.analysis_complete).toBe(false);
    expect(result.counts.not_processed).toBeGreaterThan(0);
    expect(result.limitations).toContain(kind === 'payload' ? 'payload_budget_exceeded' : 'receive_budget_exceeded');
    expect(aggregateReviewSchema.safeParse(result).success).toBe(true);
  });
  it('continues after a single oversized payload without refunding its byte charge', async () => {
    const rows = [row(1), row(2)];
    const { fetcher, details } = fixture(rows);
    details.set(id(1), { ...(details.get(id(1)) as object), payload: 'x'.repeat(1000) });
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, limits: { payloadBytes: 700 } });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) {
      expect(outcome.result.assets[0]).toMatchObject({ state: 'rejected', reason: 'payload_limit' });
      expect(outcome.result.assets[1].state).toBe('reviewed');
    }
  });
  it.each(['changed', 'missing_metadata', 'denied'])('retains provisional findings when final verification is %s', async kind => {
    const base = fixture([row(1)]);
    let parents = 0;
    const fetcher: typeof fetch = async (url, init) => {
      const u = new URL(String(url));
      if (u.pathname.includes('/sys_update_set/')) {
        if (++parents === 2) {
          if (kind === 'changed') return json({ ...parentRow, sys_mod_count: '1' });
          if (kind === 'denied') return new Response('SYNTHETIC_PRIVATE_ERROR', { status: 403 });
        }
      }
      if (kind === 'missing_metadata' && parents === 2 && u.pathname.endsWith('/sys_update_xml')) return json([{ sys_id: id(1) }]);
      return base.fetcher(url, init);
    };
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) {
      expect(outcome.result.consistency).toBe(kind === 'changed' ? 'changed' : 'unverified');
      expect(outcome.result.limitations).toContain('provisional_results');
      expect(outcome.result.counts.findings).toBe(1);
      expect(outcome.result.coverage.analysis_complete).toBe(false);
      expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    }
  });
  it.each(['unknown', 'mismatched', 'conflict'] as const)('does not collect metadata or code for %s releases', async kind => {
    const base = fixture([row(1)]);
    const fetcher = vi.fn<typeof fetch>(async (url, init) => new URL(String(url)).pathname.endsWith('/sys_cluster_state')
      ? json(kind === 'unknown' ? [] : kind === 'conflict' ? [{ build_name: 'Australia' }, { build_name: 'Zurich' }] : [{ build_name: 'Zurich' }])
      : base.fetcher(url, init));
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) {
      expect(outcome.result.collection.status).toBe('not_started');
      expect(outcome.result.assets).toEqual([]);
      expect(outcome.result.coverage.skipped_rules).toHaveLength(3);
      expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('carries operator fallback through every nested result with the same binding and warnings', async () => {
    const selected = new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
      perUserBearerToken: 'synthetic-private-token', oauth: { clientId: '', clientSecret: '' },
      reviewReleaseConfig: { instance_id: 'dev', assertion: { family: 'Australia',
        instance_binding: createReviewInstanceBinding('dev', 'https://example.service-now.com'),
        asserted_at: new Date(Date.now() - 1000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
        evidence_reference: 'SYNTHETIC_PRIVATE_EVIDENCE' } } });
    const base = fixture([row(1)]);
    const fetcher: typeof fetch = async (url, init) => new URL(String(url)).pathname.endsWith('/sys_cluster_state')
      ? new Response('SYNTHETIC_PRIVATE_ERROR', { status: 403 }) : base.fetcher(url, init);
    const outcome = await reviewBoundedUpdateSet(selected, input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) {
      expect(outcome.result.instance_release.resolution_status).toBe('asserted');
      const a = outcome.result.assets[0];
      if (a.state !== 'reviewed') throw Error('Expected reviewed asset');
      expect(a.result.instance_release).toEqual(outcome.result.instance_release);
      expect(a.result.limitations).toContain('release_not_observed');
      expect(a.result.review_status).toBe('partial');
      expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    }
    expect(JSON.stringify(outcome)).not.toMatch(/SYNTHETIC_PRIVATE|synthetic-private-token/);
  });
  it.each([
    { ...input, update_set_sys_id: parent + '^ORactive=true' },
    { ...input, max_records: 101 }, { ...input, requested_rule_ids: ['AU-NOT-A-RULE'] },
    { ...input, requested_rule_ids: ['AU-BR-001', 'AU-BR-001'] }, { ...input, instance_release: 'Australia' },
    { ...input, code_return_mode: 'full' }, { ...input, requested_rule_ids: [] },
  ])('rejects unsupported input before I/O', async invalid => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await reviewBoundedUpdateSet(client(), invalid, { fetch: fetcher })).toEqual({ isError: true,
      error: { stage: 'input', code: 'invalid_input' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('caps selection at max_records without fetching sentinel, unsupported or deleted payloads', async () => {
    const { fetcher } = fixture([row(1, 'sys_script_include'), row(2, 'sys_script', 'DELETE'), row(3)]);
    const outcome = await reviewBoundedUpdateSet(client(), { ...input, max_records: 2 }, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) {
      expect(outcome.result).toMatchObject({ collection: { metadata_seen: 3, selected: 2, truncated: true },
        counts: { reviewed: 0, not_applicable: 1, skipped_deleted: 1 } });
      expect(outcome.result.limitations).toContain('metadata_truncated');
    }
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('marks a supported type with no requested rules as not applicable, not clear', async () => {
    const { fetcher } = fixture([row(1, 'sys_script_client')]);
    const outcome = await reviewBoundedUpdateSet(client(), { ...input, requested_rule_ids: ['AU-BR-001'] }, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (!outcome.isError) expect(outcome.result.assets[0]).toMatchObject({ state: 'not_applicable', reason: 'no_requested_rules' });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it.each(['2026-10-17T00:00:00Z', 'not-a-timestamp'])('handles record timestamps without inventing values: %s', async timestamp => {
    const r = { ...row(1), sys_updated_on: timestamp };
    const { fetcher } = fixture([r]);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected timestamp accounting');
    if (timestamp.startsWith('2026')) {
      expect(outcome.result.assets[0].state).toBe('reviewed');
    } else expect(outcome.result.assets[0]).toMatchObject({ state: 'retrieval_failed', reason: 'missing_required_field' });
  });
  it('continues independent assets after bounded retry exhaustion for one payload', async () => {
    const base = fixture([row(1), row(2)]);
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      return u.searchParams.get('sysparm_fields')?.includes('payload') && u.searchParams.get('sysparm_query')?.startsWith(`sys_id=${id(1)}`)
        ? new Response('SYNTHETIC_PRIVATE_ERROR', { status: 503 }) : base.fetcher(url, init);
    });
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, limits: { retryDelayMs: 1 } });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected independent continuation');
    expect(outcome.result).toMatchObject({ consistency: 'stable_observation', counts: { reviewed: 1, not_processed: 1 },
      coverage: { analysis_complete: false } });
    expect(outcome.result.assets[0]).toMatchObject({ reason: 'upstream_unavailable' });
    expect(fetcher).toHaveBeenCalledTimes(8);
  });
  it.each([40, 60])('bounds aggregate bytes and findings by omitting whole %i-finding results', async count => {
    const rows = [row(1), row(2), row(3)];
    const { fetcher, details } = fixture(rows);
    for (const r of rows) details.set(r.sys_id, { ...(details.get(r.sys_id) as object), payload: xml(r, 'current.update();\n'.repeat(count)) });
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected bounded output');
    expect(outcome.result.counts.result_omitted).toBeGreaterThan(0);
    expect(outcome.result.counts.findings).toBeLessThanOrEqual(100);
    expect(Buffer.byteLength(JSON.stringify(outcome.result))).toBeLessThanOrEqual(262144);
    expect(Buffer.byteLength(JSON.stringify(outcome))).toBeLessThanOrEqual(262144);
    expect(outcome.result.limitations).toContain('response_truncated');
    for (const asset of outcome.result.assets) if (asset.state === 'reviewed') expect(asset.result.findings).toHaveLength(count);
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    expect(outcome.result.coverage.analysis_complete).toBe(false);
  });
  it('uses reserved requests for final verification after exhausting the payload request budget', async () => {
    const { fetcher } = fixture([row(1), row(2)]);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, limits: { requests: 8 } });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected bounded partial result');
    expect(outcome.result).toMatchObject({ consistency: 'stable_observation', counts: { reviewed: 1, not_processed: 1 },
      coverage: { analysis_complete: false } });
    expect(outcome.result.assets[1]).toMatchObject({ reason: 'request_budget_exceeded' });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it.each([401, 403])('stops all fetching on payload HTTP %i and retains only provisional earlier results', async status => {
    const base = fixture([row(1), row(2), row(3)]);
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (u.searchParams.get('sysparm_fields')?.includes('payload') && u.searchParams.get('sysparm_query')?.startsWith(`sys_id=${id(2)}`)) {
        return new Response('SYNTHETIC_PRIVATE_ERROR', { status });
      }
      return base.fetcher(url, init);
    });
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected provisional results');
    const code = status === 401 ? 'authentication_failed' : 'access_denied';
    expect(outcome.result).toMatchObject({ status: 'partial', consistency: 'unverified',
      coverage: { analysis_complete: false }, counts: { reviewed: 1, not_processed: 2, findings: 1 } });
    expect(outcome.result.assets.slice(1)).toEqual([2, 3].map(n => ({ state: 'not_processed', update_xml_sys_id: id(n), reason: code })));
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('distinguishes a failed metadata collection from a successful empty visible list', async () => {
    const base = fixture([]);
    const empty = await reviewBoundedUpdateSet(client(), input, { fetch: base.fetcher });
    expect(empty.isError).toBe(false);
    if (!empty.isError) expect(empty.result).toMatchObject({ collection: { status: 'complete', selected: 0 },
      consistency: 'stable_observation', coverage: { analysis_complete: true } });
    const fetcher: typeof fetch = async (url, init) => new URL(String(url)).pathname.endsWith('/sys_update_xml')
      ? new Response('SYNTHETIC_PRIVATE_ERROR', { status: 500 }) : base.fetcher(url, init);
    const failed = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher, limits: { retryDelayMs: 1 } });
    expect(failed.isError).toBe(true);
    if (failed.isError) {
      expect(failed.result).toMatchObject({ status: 'failed', collection: { status: 'failed' }, assets: [],
        errors: [{ stage: 'metadata', code: 'upstream_unavailable' }] });
      expect(aggregateReviewSchema.safeParse(failed.result).success).toBe(true);
    }
    expect(JSON.stringify(failed)).not.toContain('SYNTHETIC_PRIVATE_ERROR');
  });
  it('accounts for unsupported, deleted, rejected and unreadable rows without stopping independent assets', async () => {
    const rows = [row(1), row(2, 'sys_script_include'), row(3, 'sys_script', 'DELETE'), row(4), row(5), row(6)];
    const { fetcher, details } = fixture(rows);
    details.set(id(4), { ...(details.get(id(4)) as object), payload: '<broken>' });
    details.set(id(5), { sys_id: id(5), payload: 'SYNTHETIC_PRIVATE_BODY' });
    details.delete(id(6));
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected per-row accounting');
    expect(outcome.result.assets.map(a => a.state)).toEqual(['reviewed', 'not_applicable', 'skipped_deleted', 'rejected', 'retrieval_failed', 'retrieval_failed']);
    expect(outcome.result.assets[4]).toMatchObject({ reason: 'missing_required_field' });
    expect(outcome.result.assets[5]).toMatchObject({ reason: 'payload_unavailable' });
    expect(outcome.result.coverage.analysis_complete).toBe(false);
    expect(outcome.result.consistency).toBe('stable_observation');
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    expect(JSON.stringify(outcome)).not.toContain('SYNTHETIC_PRIVATE_BODY');
  });
  it('connects pinned acquisition, real XML/AST analysis, V2 validation and final consistency', async () => {
    const { fetcher } = fixture([row(1)]);
    const outcome = await reviewBoundedUpdateSet(client(), input, { fetch: fetcher });
    expect(outcome.isError).toBe(false);
    if (outcome.isError) throw Error('Expected aggregate');
    expect(aggregateReviewSchema.safeParse(outcome.result).success).toBe(true);
    expect(outcome.result).toMatchObject({ status: 'partial', consistency: 'stable_observation',
      counts: { reviewed: 1, findings: 1 }, coverage: { analysis_complete: true } });
    const asset = outcome.result.assets[0];
    expect(asset.state).toBe('reviewed');
    if (asset.state === 'reviewed') expect(asset.applicable_rule_ids).toEqual(['AU-BR-001', 'AU-BR-002']);
    expect(JSON.stringify(outcome)).not.toMatch(/SYNTHETIC_PRIVATE_BODY|synthetic-private-token|Untrusted display type/);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
});
