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
let abortMode = false;
let displayMode = false;
globalThis.fetch = async (url, init) => {
  assert.equal(init.method, 'GET');
  const u = new URL(String(url));
  assert.equal(u.origin, 'https://example.service-now.com');
  const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
    : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
      : u.searchParams.get('sysparm_fields').includes('payload') ? [{ ...row,
        payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><when>${displayMode ? 'before_display' : abortMode ? 'before' : 'after'}</when><collection>global</collection><script>${displayMode ? 'current.short_description = "PACK_PRIVATE_DISPLAY";' : abortMode ? 'current.setAbortAction(true); gs.addErrorMessage("PACK_PRIVATE_ABORT");' : "current.update(); var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'PACK_PRIVATE_QUERY');"}</script></sys_script></record_update>` }]
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
const queryResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-QRY-001'] } } });
assert.equal(queryResponse.isError, false);
const query = JSON.parse(queryResponse.content[0].text);
assert.equal(query.counts.findings, 1);
assert.equal(query.versions.ruleset, 'bp3-0.5');
assert.equal(query.assets[0].result.findings[0].rule_id, 'AU-QRY-001');
assert(!JSON.stringify(queryResponse).includes('PACK_PRIVATE_QUERY'));
const bindingResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-BR-004'] } } });
assert.equal(bindingResponse.isError, false);
const binding = JSON.parse(bindingResponse.content[0].text);
assert.equal(binding.versions.ruleset, 'bp3-0.6');
assert.equal(binding.counts.findings, 1);
assert(binding.assets[0].result.findings[0].required_follow_up.includes('shared_binding_intent_review'));
assert(!JSON.stringify(bindingResponse).includes('PACK_PRIVATE_QUERY'));
abortMode = true;
const abortResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-BR-005'] } } });
assert.equal(abortResponse.isError, false);
const abort = JSON.parse(abortResponse.content[0].text);
assert.equal(abort.versions.ruleset, 'bp3-0.7');
assert.equal(abort.counts.findings, 1);
assert(abort.assets[0].result.findings[0].required_follow_up.includes('post_abort_processing_review'));
assert(!JSON.stringify(abortResponse).includes('PACK_PRIVATE_ABORT'));
displayMode = true;
const displayResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-BR-007'] } } });
assert.equal(displayResponse.isError, false);
const display = JSON.parse(displayResponse.content[0].text);
assert.equal(display.versions.ruleset, 'bp3-0.8');
assert.equal(display.counts.findings, 1);
assert(display.assets[0].result.findings[0].required_follow_up.includes('display_persistence_intent_review'));
assert(!JSON.stringify(displayResponse).includes('PACK_PRIVATE_DISPLAY'));
console.log('Packaged MCP review: registration + dispatch + worker PASS');
