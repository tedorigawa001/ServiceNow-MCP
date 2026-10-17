// Source-mode equivalent of the compiled smoke. All HTTP remains synthetic.
import assert from 'node:assert/strict';
import { ServiceNowClient } from '../../../src/servicenow/client.ts';
import { reviewBoundedUpdateSet } from '../../../src/review/update-set-adapter.ts';

const parent = 'a'.repeat(32), id = '1'.repeat(32);
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = { sys_id: id, update_set: parent, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
const fetcher = async url => {
  const u = new URL(String(url));
  const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
    : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
      : u.searchParams.get('sysparm_fields').includes('payload') ? [{ ...row,
        payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><when>after</when><script>current.update();</script></sys_script></record_update>` }]
        : [{ ...row, type: 'Business Rule' }];
  return new Response(JSON.stringify({ result }));
};
const selected = new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'synthetic-offline', oauth: { clientId: '', clientSecret: '' } });
const outcome = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent }, { fetch: fetcher });
assert.equal(outcome.isError, false);
assert.equal(outcome.result.counts.findings, 1);
assert.equal(outcome.result.consistency, 'stable_observation');
console.log('Development worker default entry: analysis + aggregation PASS');
