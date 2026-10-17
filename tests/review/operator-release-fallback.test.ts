import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { withBoundedUpdateSetSource } from '../../src/review/bounded-source.js';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { reviewResultV2Schema } from '../../src/review/result-schema-v2.js';
import { result } from './fixtures/bp5-results.js';

const url = 'https://example.service-now.com';
const parent = 'a'.repeat(32);
const json = (result: unknown) => new Response(JSON.stringify({ result }));
const parentRow = { sys_id: parent, state: 'in progress', application: 'global', sys_updated_on: '2026-10-17', sys_mod_count: '0' };
const config = () => ({ instance_id: 'dev', assertion: { family: 'Australia',
  instance_binding: createReviewInstanceBinding('dev', url),
  asserted_at: '2026-10-16T00:00:00Z', expires_at: '2026-10-18T00:00:00Z' } });
const client = (release: unknown) => new ServiceNowClient({ instanceUrl: url, authMode: 'per-user',
  perUserBearerToken: 'one', oauth: { clientId: '', clientSecret: '' }, reviewReleaseConfig: release });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const clock = () => vi.useFakeTimers({ now: new Date('2026-10-17T05:00:00Z') });
const observed = (rows: unknown) => vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(rows));
const unavailable = () => vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(new Response('', { status: 403 }));
describe('trusted operator release fallback', () => {
  it('admits an asserted match only when observation is unavailable and binding/lifetime are valid', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-17T05:00:00Z') });
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow))
      .mockResolvedValueOnce(new Response('private error', { status: 403 })).mockResolvedValueOnce(json([]));
    await withBoundedUpdateSetSource(client(config()), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.instance_release).toMatchObject({ source: 'operator_config', resolution_status: 'asserted', family: 'Australia' });
      expect(d.release_match).toBe('matched');
      if (d.release_match !== 'matched') throw Error('Expected asserted match');
      expect(d.limitations).toEqual(expect.arrayContaining(['release_operator_asserted', 'release_not_observed',
        'release_config_may_be_stale', 'release_observation_unavailable']));
      expect(s.instanceBinding).toBe(config().assertion.instance_binding);
      const single = { ...result(), instance_release: d.instance_release, instance_binding: s.instanceBinding,
        limitations: ['source_approval_pending', ...d.limitations], reviewed_at: s.startedAt };
      expect(reviewResultV2Schema.safeParse(single).success).toBe(true);
      await expect(s.listMetadata(d.permit)).resolves.toMatchObject({ rows: [] });
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['expired', '2026-10-17T04:59:59Z', 'unknown', 'config_expired'],
    ['expires at start', '2026-10-17T05:00:00Z', 'unknown', 'config_expired'],
    ['expires during budget', '2026-10-17T05:00:30Z', 'unknown', 'config_validity_insufficient'],
    ['expires at deadline', '2026-10-17T05:01:00Z', 'unknown', 'config_validity_insufficient'],
    ['valid beyond deadline', '2026-10-17T05:01:00.001Z', 'matched', undefined],
  ])('checks %s against the fixed run-start budget', async (_name, expiry, expected, reason) => {
    clock(); const c = config(); c.assertion.expires_at = expiry!;
    const fetcher = unavailable();
    await withBoundedUpdateSetSource(client(c), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.release_match).toBe(expected);
      if (reason) {
        expect(d.instance_release).toMatchObject({ source: 'none', reason });
        expect(d).not.toHaveProperty('permit');
        await expect(s.listMetadata(undefined as never)).rejects.toMatchObject({ code: 'release_not_admitted' });
      }
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not treat structurally invalid rows as an unavailable field eligible for fallback', async () => {
    clock();
    await withBoundedUpdateSetSource(client(config()), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.release_match).toBe('unknown');
      expect(d.instance_release).toMatchObject({ reason: 'observation_incomplete' });
      expect(d).not.toHaveProperty('permit');
    }, { fetch: observed([null]) });
  });
  it('binds settings to both the server slot ID and canonical destination', async () => {
    clock();
    expect(createReviewInstanceBinding('dev', 'https://EXAMPLE.service-now.com:443/')).toBe(config().assertion.instance_binding);
    expect(createReviewInstanceBinding('prod', url)).not.toBe(config().assertion.instance_binding);
    expect(createReviewInstanceBinding('dev', 'https://other.service-now.com')).not.toBe(config().assertion.instance_binding);
    for (const binding of [createReviewInstanceBinding('prod', url), createReviewInstanceBinding('dev', 'https://other.service-now.com')]) {
      const c = config(); c.assertion.instance_binding = binding;
      const fetcher = observed([{ build_name: 'Australia' }]);
      await withBoundedUpdateSetSource(client(c), { update_set_sys_id: parent }, async s => {
        await s.readParent(); const d = await s.resolveRelease();
        expect(d.instance_release).toMatchObject({ source: 'none', reason: 'config_binding_mismatch' });
        expect(d).not.toHaveProperty('permit');
      }, { fetch: fetcher });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it.each([false, true])('preserves actual observation when same-family config is expired=%s', async expired => {
    clock(); const c = config();
    if (expired) c.assertion.expires_at = '2026-10-17T04:59:00Z';
    await withBoundedUpdateSetSource(client(c), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.release_match).toBe('matched');
      expect(d.instance_release).toMatchObject({ source: 'sys_cluster_state.build_name', resolution_status: 'resolved' });
      expect(d.limitations.includes('config_expired')).toBe(expired);
      expect(d.limitations).not.toContain('release_operator_asserted');
    }, { fetch: observed([{ build_name: 'Australia' }]) });
  });
  it.each([false, true])('never overrides a conflicting observation even with expired=%s configuration', async expired => {
    clock(); const c = config(); c.assertion.family = 'Zurich';
    if (expired) c.assertion.expires_at = '2026-10-17T04:59:00Z';
    const fetcher = observed([{ build_name: 'Australia' }]);
    await withBoundedUpdateSetSource(client(c), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.release_match).toBe('unknown');
      expect(d.instance_release).toMatchObject({ source: 'conflict', observed_families: ['Australia'], configured_family: 'Zurich' });
      expect(d.limitations).toContain('release_evidence_conflict');
      await expect(s.listMetadata(undefined as never)).rejects.toMatchObject({ code: 'release_not_admitted' });
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    [[], 'matched'], [[{ build_name: null }, {}], 'matched'],
    [[{ build_name: 'Australia' }, {}], 'unknown'],
    [[{ build_name: 'Australia' }, { build_name: 'Zurich' }], 'unknown'],
    [[{ build_name: 'Unknown' }], 'unknown'],
    [Array.from({ length: 21 }, () => ({ build_name: 'Australia' })), 'unknown'],
    [[{ build_name: {} }], 'unknown'],
  ])('falls back only for missing observation, not contradictory/incomplete rows (%j)', async (rows, match) => {
    clock(); const fetcher = observed(rows);
    await withBoundedUpdateSetSource(client(config()), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.release_match).toBe(match);
      if (match === 'matched') expect(d.instance_release.source).toBe('operator_config');
      else expect(d).not.toHaveProperty('permit');
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['future', 'reversed', 'missing_expiry', 'extra_key', 'unknown_family', 'bad_hash', 'null_config'])('rejects %s settings before network I/O', async kind => {
    clock(); const valid = config();
    let raw: unknown = valid;
    if (kind === 'future') valid.assertion.asserted_at = '2026-10-17T05:00:01Z';
    if (kind === 'reversed') valid.assertion.expires_at = '2026-10-15T00:00:00Z';
    if (kind === 'missing_expiry') raw = { ...valid, assertion: { family: 'Australia', asserted_at: valid.assertion.asserted_at, instance_binding: valid.assertion.instance_binding } };
    if (kind === 'extra_key') raw = { ...valid, private_path: '/private/not-returned' };
    if (kind === 'unknown_family') valid.assertion.family = 'TypoRelease';
    if (kind === 'bad_hash') valid.assertion.instance_binding = 'raw-URL-not-hash';
    if (kind === 'null_config') raw = null;
    const fetcher = vi.fn();
    await expect(withBoundedUpdateSetSource(client(raw), { update_set_sys_id: parent }, s => s.readParent(), { fetch: fetcher }))
      .rejects.toMatchObject({ code: 'config_invalid', message: 'config_invalid' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('pins settings before awaits, hashes their revision and never returns private references', async () => {
    clock(); const c = { ...config(), assertion: { ...config().assertion, evidence_reference: 'private-upgrade-record' } };
    const fetcher = unavailable();
    const run = withBoundedUpdateSetSource(client(c), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.instance_release).toMatchObject({ source: 'operator_config', family: 'Australia' });
      expect(d.instance_release).toHaveProperty('config_version', expect.stringMatching(/^[a-f0-9]{64}$/));
      expect(JSON.stringify(d)).not.toContain('private-upgrade-record');
      return d.instance_release;
    }, { fetch: fetcher });
    c.assertion.family = 'Zurich'; c.assertion.expires_at = '2026-10-16T00:00:00Z';
    const first = await run;
    const next = config(); next.assertion.expires_at = '2026-10-19T00:00:00Z';
    const second = await withBoundedUpdateSetSource(client(next), { update_set_sys_id: parent }, async s => {
      await s.readParent(); return (await s.resolveRelease()).instance_release;
    }, { fetch: unavailable() });
    if (first.source !== 'operator_config' || second.source !== 'operator_config') throw Error('Expected assertions');
    expect(first.config_version).not.toBe(second.config_version);
  });
  it.each([401, 404, 500])('handles observation HTTP %i without bypassing fatal authentication', async status => {
    clock(); const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow))
      .mockImplementation(async () => new Response('private failure', { status }));
    const run = withBoundedUpdateSetSource(client(config()), { update_set_sys_id: parent }, async s => {
      await s.readParent(); const d = await s.resolveRelease();
      expect(d.release_match).toBe('matched'); expect(d.instance_release.source).toBe('operator_config');
    }, { fetch: fetcher, limits: { retryDelayMs: 1 } });
    if (status === 401) await expect(run).rejects.toMatchObject({ code: 'authentication_failed' });
    else { const asserted = expect(run).resolves.toBeUndefined(); await vi.runAllTimersAsync(); await asserted; }
  });
  it('does not rescue a mismatched observed family or mismatched configured family', async () => {
    clock(); const c = config(); c.assertion.family = 'Zurich';
    for (const fetcher of [unavailable(), observed([{ build_name: 'Zurich' }])]) {
      await withBoundedUpdateSetSource(client(c), { update_set_sys_id: parent }, async s => {
        await s.readParent(); const d = await s.resolveRelease();
        expect(d.release_match).toBe('mismatched'); expect(d).not.toHaveProperty('permit');
      }, { fetch: fetcher });
    }
  });
  it.each(['parent_denied', 'receive_budget', 'whole_deadline'])('does not use settings to bypass %s', async kind => {
    clock();
    let fetcher: ReturnType<typeof vi.fn>;
    if (kind === 'parent_denied') fetcher = vi.fn(async () => new Response('', { status: 403 }));
    else if (kind === 'receive_budget') fetcher = vi.fn().mockResolvedValueOnce(json(parentRow))
      .mockResolvedValueOnce(new Response('x'.repeat(512), { status: 500 }));
    else fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockImplementation(() => new Promise<Response>(() => {}));
    const run = withBoundedUpdateSetSource(client(config()), { update_set_sys_id: parent }, async s => {
      await s.readParent(); await s.resolveRelease();
    }, { fetch: fetcher, limits: kind === 'receive_budget' ? { responseBytes: 256 } : { deadlineMs: 100 } });
    const assertion = expect(run).rejects.toMatchObject({ code: kind === 'parent_denied' ? 'access_denied'
      : kind === 'receive_budget' ? 'receive_budget_exceeded' : 'deadline_exceeded' });
    if (kind === 'whole_deadline') await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetcher.mock.calls.every(([request]) => !String(request).includes('sys_update_xml'))).toBe(true);
  });
  it('rejects operator-setting input injection and ignores an assertion smuggled into transport options', async () => {
    clock(); const fetcher = unavailable();
    await expect(withBoundedUpdateSetSource(client(undefined), { update_set_sys_id: parent, reviewReleaseConfig: config() },
      s => s.readParent(), { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fetcher).not.toHaveBeenCalled();
    await withBoundedUpdateSetSource(client(undefined), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      expect((await s.resolveRelease()).release_match).toBe('unknown');
    }, { fetch: fetcher, ...{ reviewReleaseConfig: config() } });
  });
});
