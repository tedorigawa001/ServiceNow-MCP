/** Read-only audit of the previous fixture. Version history is deliberately retained. */
import { describe, expect, it } from 'vitest';
import { getE2EClient, isE2EConfigured } from './helpers.js';
import { instanceManager } from '../../src/servicenow/instances.js';

const sourceId = '548e2d7c8300971880355160ceaad311';
const ids = ['548e2d7c8300971880355160ceaad34f', 'b08e2d7c8300971880355160ceaad3e8'];
const primary = [['sys_script_client', sourceId], ['sys_update_set', '808ee97c8300971880355160ceaad3e6'],
  ['sys_update_xml', 'd88e2d7c8300971880355160ceaad34e']];
describe.skipIf(!isE2EConfigured() || process.env.BP5_FIXTURE_RECOVERY !== 'inspect')('E2E – retained fixture history audit', () => {
  it('retains previous versions and confirms primary records absent without reading payload', async () => {
    const client = getE2EClient(), host = new URL(instanceManager.getCurrentUrl()).host;
    if (host !== 'dev441827.service-now.com') throw Error('PDI_HOST_MISMATCH');
    const original = globalThis.fetch;
    const outcomes: { method: string; status: number }[] = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url)), method = init.method ?? 'GET';
      const allowed = method === 'POST' && u.pathname === '/oauth_token.do'
        || method === 'GET' && [...primary, ...ids.map(id => ['sys_update_version', id])].some(([table, id]) =>
          u.pathname === `/api/now/table/${table}` && u.searchParams.get('sysparm_query') === `sys_id=${id}`);
      if (u.protocol !== 'https:' || u.host !== host || !allowed) throw Error('RECOVERY_GUARD');
      const response = await original(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
      outcomes.push({ method, status: response.status }); return response;
    };
    try {
      for (const id of ids) {
        const found = await client.queryRecords({ table: 'sys_update_version', query: `sys_id=${id}`, fields: 'sys_id,name,state', limit: 1 });
        if (found.records.length !== 1 || found.records[0].name !== `sys_script_client_${sourceId}`) throw Error('RETAINED_HISTORY_MISMATCH');
      }
      for (const [table, id] of primary) {
        const found = await client.queryRecords({ table, query: `sys_id=${id}`, fields: 'sys_id', limit: 1 });
        expect(found.records.length).toBe(0);
      }
      console.log('BP5_FIXTURE_RETAINED_HISTORY ' + JSON.stringify({ source_id: sourceId, retained_versions: ids,
        primary_remaining: 0, outcomes, history_policy: 'retain', source_printed: false }));
    } catch {
      throw Error('RETAINED_HISTORY_AUDIT_FAILED');
    } finally { globalThis.fetch = original; }
  }, 60000);
});
