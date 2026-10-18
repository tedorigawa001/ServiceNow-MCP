// Packaging-only process: invoke with env={} and cwd set to the extracted package.
import assert from 'node:assert/strict';
process.env.HOME = process.cwd();
process.env.SERVICENOW_INSTANCE_URL = 'https://example.service-now.com';
process.env.SERVICENOW_AUTH_MODE = 'per-user';
process.env.SERVICENOW_PER_USER_BEARER_TOKEN = 'synthetic-package-token';
process.env.MCP_TOOL_PACKAGE = 'platform_developer';
const { handleListTools, handleCallTool } = await import('../../../dist/server.js');
const name = 'review_update_set_best_practices', parent = 'a'.repeat(32), id = '1'.repeat(32);
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = { sys_id: id, update_set: parent, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
globalThis.fetch = async (url, init) => {
  assert.equal(init.method, 'GET');
  const u = new URL(String(url));
  assert.equal(u.origin, 'https://example.service-now.com');
  const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
    : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
      : u.searchParams.get('sysparm_fields').includes('payload') ? [{ ...row,
        payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><when>after</when><script>current.update();</script></sys_script></record_update>` }]
        : [{ ...row, type: 'Business Rule' }];
  return new Response(JSON.stringify({ result }));
};
assert.equal((await handleListTools()).tools.filter(tool => tool.name === name).length, 1);
const response = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent } } });
assert.equal(response.isError, false);
const result = JSON.parse(response.content[0].text);
assert.equal(result.counts.findings, 1);
assert.equal(result.code_return_mode, 'none');
assert.equal(result.status, 'partial');
assert.equal(result.schema_version, 'bp-mcp-review-0.2');
const optInResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent, selection_mode: 'review_targets' } } });
assert.equal(optInResponse.isError, false);
const optInResult = JSON.parse(optInResponse.content[0].text);
assert.equal(optInResult.schema_version, 'bp-mcp-review-0.3');
assert.equal(optInResult.counts.findings, 1);
assert.equal(optInResult.selection.mode, 'review_targets');
console.log('Packaged MCP review: registration + dispatch + worker PASS');
