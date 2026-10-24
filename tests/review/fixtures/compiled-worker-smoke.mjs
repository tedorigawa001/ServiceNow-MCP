// Run after npm run build. Synthetic HTTP only; no configuration or real credentials.
import assert from 'node:assert/strict';
import { ServiceNowClient } from '../../../dist/servicenow/client.js';
import { reviewBoundedUpdateSet } from '../../../dist/review/update-set-adapter.js';

const parent = 'a'.repeat(32), id = '1'.repeat(32);
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = { sys_id: id, update_set: parent, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
const fetcher = async url => {
  const u = new URL(String(url));
  const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
    : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
      : u.searchParams.get('sysparm_fields').includes('payload') ? [{ ...row,
        payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><when>after</when><script>current.update(); var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'PACK_PRIVATE_QUERY');</script></sys_script></record_update>` }]
        : [{ ...row, type: 'Business Rule' }];
  return new Response(JSON.stringify({ result }));
};
const selected = new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
  perUserBearerToken: 'synthetic-offline', oauth: { clientId: '', clientSecret: '' } });
const outcome = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent }, { fetch: fetcher });
assert.equal(outcome.isError, false);
assert.equal(outcome.result.counts.findings, 1);
assert.equal(outcome.result.consistency, 'stable_observation');
assert.equal(outcome.result.schema_version, 'bp-mcp-review-0.2');
const optIn = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets' }, { fetch: fetcher });
assert.equal(optIn.isError, false);
assert.equal(optIn.result.schema_version, 'bp-mcp-review-0.3');
assert.equal(optIn.result.counts.findings, 1);
assert.equal(optIn.result.selection.filter_version, 'target-prefix-0.1');
assert.equal(optIn.result.coverage.candidate_inventory_complete, false);
const query = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-QRY-001'] }, { fetch: fetcher });
assert.equal(query.isError, false);
assert.equal(query.result.counts.findings, 1);
assert.equal(query.result.versions.ruleset, 'bp3-0.5');
assert.equal(query.result.assets[0].result.findings[0].rule_id, 'AU-QRY-001');
assert(!JSON.stringify(query).includes('PACK_PRIVATE_QUERY'));
console.log('Compiled worker default entry: analysis + aggregation PASS');
