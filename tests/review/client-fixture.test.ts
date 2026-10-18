import { afterEach, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { clientReviewFixture } from '../e2e/bp5-client-fixture.js';

const host = 'dev123.service-now.com';
function synthetic(options: { capture?: boolean; ambiguous?: boolean; nameMax?: number } = {}) {
  let n = 1;
  const next = () => (n++).toString(16).padStart(32, '0');
  const db = new Map<string, Map<string, Record<string, unknown>>>();
  const table = (name: string) => { if (!db.has(name)) db.set(name, new Map()); return db.get(name)!; };
  const original = { sys_id: 'e'.repeat(32), name: 'Existing Default', is_default: true };
  table('sys_update_set').set(String(original.sys_id), { ...original });
  const native = (scriptId: string, action: string) => {
    const name = `sys_script_client_${scriptId}`;
    for (const t of ['sys_update_xml', 'sys_update_version']) {
      const id = next(); table(t).set(id, { sys_id: id, name, action, update_set: original.sys_id });
    }
  };
  const fetcher = vi.fn<typeof fetch>(async (url, init = {}) => {
    const u = new URL(String(url)), [, t, key] = /\/table\/([^/]+)(?:\/([^/]+))?$/.exec(u.pathname)!;
    const records = table(t), method = init.method ?? 'GET';
    let result: unknown;
    if (method === 'POST') {
      const body = JSON.parse(String(init.body)), sys_id = next();
      if (t === 'sys_script_client' && options.nameMax) body.name = String(body.name).slice(0, options.nameMax);
      const r = { ...body, sys_id }; records.set(sys_id, r); result = r;
      if (t === 'sys_script_client') {
        if (options.capture !== false) native(sys_id, 'INSERT_OR_UPDATE');
        if (options.ambiguous) throw Error('SYNTHETIC_AMBIGUOUS_WRITE');
      }
    } else if (method === 'PATCH') {
      result = { ...records.get(key), ...JSON.parse(String(init.body)) }; records.set(key, result as Record<string, unknown>);
    } else if (method === 'DELETE') {
      records.delete(key);
      if (t === 'sys_script_client' && options.capture !== false) native(key, 'DELETE');
      return new Response(null, { status: 204 });
    } else if (key) result = records.get(key);
    else result = [...records.values()].filter(r => (u.searchParams.get('sysparm_query') ?? '').split('^').every(term => {
      const i = term.indexOf('='); return i < 0 || String(r[term.slice(0, i)]) === term.slice(i + 1);
    }));
    return new Response(JSON.stringify({ result }));
  });
  vi.stubGlobal('fetch', fetcher);
  for (const key of ['BP5_CLIENT_WRITE_FIXTURES', 'WRITE_ENABLED', 'SCRIPTING_ENABLED']) vi.stubEnv(key, 'true');
  vi.stubEnv('BP5_VERSION_HISTORY_POLICY', 'retain');
  const client = new ServiceNowClient({ instanceUrl: `https://${host}`, authMode: 'per-user', perUserBearerToken: 'synthetic-fixture',
    oauth: { clientId: '', clientSecret: '' }, maxRetries: 0 });
  const fixture = clientReviewFixture(client, host);
  vi.stubGlobal('fetch', fixture.guard);
  return { fixture, db, table, original, fetcher };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('fits the observed 40-character Client Script name boundary without losing ownership', async () => {
  const { fixture, db } = synthetic({ nameMax: 40 });
  try { await expect(fixture.create()).resolves.toHaveProperty('scriptId'); }
  finally { await fixture.cleanup(); }
  expect(db.get('sys_script_client')!.size).toBe(0);
});
it('does not admit new writes without the explicit history retention policy', () => {
  synthetic(); vi.stubEnv('BP5_VERSION_HISTORY_POLICY', '');
  const client = new ServiceNowClient({ instanceUrl: `https://${host}`, authMode: 'per-user', perUserBearerToken: 'synthetic-fixture',
    oauth: { clientId: '', clientSecret: '' } });
  expect(() => clientReviewFixture(client, host)).toThrow('VERSION_RETENTION_POLICY_UNCONFIRMED');
});
it('removes only owned source, customer updates and set while retaining all native versions', async () => {
  const { fixture, db, original, fetcher } = synthetic();
  const ids = await fixture.create();
  expect(db.get('sys_script_client')!.get(ids.scriptId)!.active).toBe(false);
  expect(db.get('sys_update_xml')!.get(ids.updateXmlId)!.update_set).toBe(ids.updateSetId);
  const summary = await fixture.cleanup();
  expect([...db.get('sys_update_set')!.values()]).toEqual([original]);
  for (const t of ['sys_script_client', 'sys_update_xml']) expect(db.get(t)?.size ?? 0).toBe(0);
  expect(db.get('sys_update_version')!.size).toBe(2);
  expect(summary).toMatchObject({ cleanup_ok: true, history_policy: 'retain' });
  expect(summary.retained_versions).toHaveLength(2);
  expect(fetcher.mock.calls.filter(([url, init]) => String(url).includes('/sys_update_version') && init?.method === 'DELETE')).toHaveLength(0);
  const calls = fetcher.mock.calls.length;
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const id = method === 'POST' ? '' : '/' + [...db.get('sys_update_version')!.keys()][0];
    await expect(fixture.guard(`https://${host}/api/now/table/sys_update_version${id}`, { method, body: method === 'DELETE' ? undefined : '{}' })).rejects.toThrow('FIXTURE_REQUEST_GUARD');
  }
  expect(fetcher.mock.calls.length).toBe(calls);
});
it('cleans up after an ambiguous POST without retrying or fabricating a snapshot', async () => {
  const { fixture, db } = synthetic({ ambiguous: true });
  await expect(fixture.create()).rejects.toMatchObject({ code: 'OUTCOME_UNKNOWN' });
  await fixture.cleanup();
  expect(db.get('sys_script_client')!.size).toBe(0);
  expect(db.get('sys_update_set')!.size).toBe(1);
  expect(db.get('sys_update_version')!.size).toBe(2);
});
it('fails closed and cleans up when native capture is unavailable', async () => {
  const { fixture, db } = synthetic({ capture: false });
  await expect(fixture.create()).rejects.toThrow('NATIVE_CLIENT_CAPTURE_UNAVAILABLE');
  await fixture.cleanup();
  expect(db.get('sys_script_client')!.size).toBe(0);
  expect(db.get('sys_update_set')!.size).toBe(1);
});
it('refuses writes to unowned IDs and activation of a Client Script', async () => {
  const { fixture, fetcher } = synthetic();
  const ids = await fixture.create(); const calls = fetcher.mock.calls.length;
  await expect(fixture.guard(`https://${host}/api/now/table/sys_update_set/${'e'.repeat(32)}`, { method: 'DELETE' })).rejects.toThrow('FIXTURE_REQUEST_GUARD');
  await expect(fixture.guard(`https://${host}/api/now/table/sys_script_client/${ids.scriptId}`, { method: 'PATCH', body: JSON.stringify({ active: true }) })).rejects.toThrow('FIXTURE_REQUEST_GUARD');
  expect(fetcher.mock.calls.length).toBe(calls);
  await fixture.cleanup();
});
it('does not cascade-delete a foreign update added to the test set', async () => {
  const { fixture, table } = synthetic();
  const ids = await fixture.create(), foreignId = 'f'.repeat(32);
  table('sys_update_xml').set(foreignId, { sys_id: foreignId, name: 'foreign', update_set: ids.updateSetId });
  await expect(fixture.cleanup()).rejects.toThrow('FIXTURE_CLEANUP_FAILED');
  expect(table('sys_update_xml').has(foreignId)).toBe(true);
  expect(table('sys_update_set').has(ids.updateSetId)).toBe(true);
});
