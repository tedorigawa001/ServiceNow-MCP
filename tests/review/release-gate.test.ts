import { describe, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { withBoundedUpdateSetSource, type ReleasePermit } from '../../src/review/bounded-source.js';
import { releaseEvidenceStructure } from '../../src/review/result-schema-v2.js';
const parent = 'a'.repeat(32);
const client = () => new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'one', oauth: { clientId: '', clientSecret: '' } });
const json = (result: unknown) => new Response(JSON.stringify({ result }));
const parentRow = { sys_id: parent, state: 'in progress', application: 'global', sys_updated_on: '2026-10-17', sys_mod_count: '0' };
describe('source-enforced release admission', () => {
  it('refuses metadata before release admission without issuing an XML request', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json([]));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      await expect(s.listMetadata(undefined as never)).rejects.toMatchObject({ code: 'release_not_admitted' });
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('issues a permit only after matching the source observation, not a caller claim', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow))
      .mockResolvedValueOnce(json([{ build_name: 'Australia' }])).mockResolvedValueOnce(json([]));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      const decision = await s.resolveRelease();
      expect(decision.release_match).toBe('matched');
      if (decision.release_match !== 'matched') throw Error('Expected observed match');
      await expect(s.listMetadata(decision.permit)).resolves.toMatchObject({ rows: [] });
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([
    ['different family', [{ build_name: 'Zurich' }], 'mismatched'],
    ['unrecognized family', [{ build_name: 'Unrecognized' }], 'unknown'],
    ['empty list', [], 'unknown'],
    ['all blank', [{ build_name: '' }, { build_name: null }], 'unknown'],
    ['partially missing', [{ build_name: 'Australia' }, {}], 'unknown'],
    ['mixed nodes', [{ build_name: 'Australia' }, { build_name: 'Zurich' }], 'unknown'],
    ['21st node', Array.from({ length: 21 }, () => ({ build_name: 'Australia' })), 'unknown'],
    ['malformed value', [{ build_name: { private: 'not-a-family' } }], 'unknown'],
  ])('issues no permit for %s, even when a caller claims matched', async (_name, rows, expected) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(rows));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      const decision = await s.resolveRelease();
      expect(decision.release_match).toBe(expected);
      expect(decision).not.toHaveProperty('permit');
      expect(releaseEvidenceStructure.safeParse(decision.instance_release).success).toBe(true);
      const forged = { release_match: 'matched', family: 'Australia' } as unknown as ReleasePermit;
      await expect(s.listMetadata(forged)).rejects.toMatchObject({ code: 'release_not_admitted' });
      await expect(s.readPayload('b'.repeat(32), forged)).rejects.toMatchObject({ code: 'release_not_admitted' });
      await expect(s.verify(forged)).rejects.toMatchObject({ code: 'release_not_admitted' });
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('sys_update_xml'))).toBe(true);
  });
  it('rejects forged/copy/other-source permits and reuses one observation per source', async () => {
    let other!: ReleasePermit;
    const fetcher = vi.fn(async (url: URL | RequestInfo) => String(url).includes('sys_cluster_state')
      ? json([{ build_name: ' australia ' }]) : String(url).includes('sys_update_xml') ? json([]) : json(parentRow));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      const d = await s.resolveRelease();
      if (d.release_match !== 'matched') throw Error('Expected match');
      other = d.permit;
      expect((await s.resolveRelease())).toBe(d);
      await expect(s.listMetadata({ ...d.permit })).rejects.toMatchObject({ code: 'release_not_admitted' });
      await expect(s.listMetadata(JSON.parse(JSON.stringify(d.permit)))).rejects.toMatchObject({ code: 'release_not_admitted' });
    }, { fetch: fetcher });
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      const d = await s.resolveRelease();
      if (d.release_match !== 'matched') throw Error('Expected match');
      await expect(s.listMetadata(other)).rejects.toMatchObject({ code: 'release_not_admitted' });
      await expect(s.listMetadata(d.permit)).resolves.toMatchObject({ rows: [] });
    }, { fetch: fetcher });
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('sys_cluster_state'))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('sys_update_xml'))).toHaveLength(1);
  });
  it('cannot reuse a permit after its owning source is closed', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json([{ build_name: 'Australia' }]));
    const retained = await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async source => {
      await source.readParent(); const d = await source.resolveRelease();
      if (d.release_match !== 'matched') throw Error('Expected match');
      return { source, permit: d.permit };
    }, { fetch: fetcher });
    await expect(retained.source.listMetadata(retained.permit)).rejects.toMatchObject({ code: 'closed' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 404, 500])('does not mint a permit after release HTTP %i', async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow))
      .mockImplementation(async () => new Response('private-error', { status }));
    const run = withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      const d = await s.resolveRelease();
      expect(d.release_match).toBe('unknown');
      expect(d).not.toHaveProperty('permit');
      await expect(s.listMetadata(undefined as never)).rejects.toMatchObject({ code: 'release_not_admitted' });
    }, { fetch: fetcher, limits: { retryDelayMs: 1 } });
    if (status === 401) await expect(run).rejects.toMatchObject({ code: 'authentication_failed' });
    else await run;
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('sys_update_xml'))).toBe(true);
  });
});
