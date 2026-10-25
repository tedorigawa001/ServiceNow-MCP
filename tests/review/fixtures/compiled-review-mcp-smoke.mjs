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
let uiPolicyMode = false;
let onLoadMode = false;
globalThis.fetch = async (url, init) => {
  assert.equal(init.method, 'GET');
  const u = new URL(String(url));
  assert.equal(u.origin, 'https://example.service-now.com');
  const table = uiPolicyMode ? 'sys_script_client' : 'sys_script';
  const selectedRow = { ...row, name: `${table}_${id}` };
  const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
    : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
      : u.searchParams.get('sysparm_fields').includes('payload') ? [{ ...selectedRow,
        payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><type>${onLoadMode ? 'onLoad' : 'onChange'}</type><when>${displayMode ? 'before_display' : abortMode ? 'before' : 'after'}</when><collection>global</collection><script>${onLoadMode ? 'function onLoad(){var gr=new GlideRecord("PACK_PRIVATE_PRELOAD_TABLE");gr.get("PACK_PRIVATE_PRELOAD_ID");}' : uiPolicyMode ? 'function onChange(c,o,n,isLoading) { g_form.setMandatory("PACK_PRIVATE_UI", true);g_form.setValue("PACK_PRIVATE_SET_FIELD","PACK_PRIVATE_SET_ID");g_form.setValue("x",id,display); g_form.getReference("PACK_PRIVATE_LOOKUP", callback); document.querySelector("#PACK_PRIVATE_DOM");document.createElement("div").querySelector(".PACK_PRIVATE_CHILD"); }' : displayMode ? 'current.short_description = "PACK_PRIVATE_DISPLAY";' : abortMode ? 'current.setAbortAction(true); gs.addErrorMessage("PACK_PRIVATE_ABORT");' : "current.update(); var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'PACK_PRIVATE_QUERY');gr.addQuery('123TEXTQUERY321', 'PACK_PRIVATE_TEXT_A');gr.addEncodedQuery('123TEXTQUERY321=PACK_PRIVATE_TEXT_B');"}</script></${table}></record_update>` }]
        : [{ ...selectedRow, type: 'Business Rule' }];
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
uiPolicyMode = true;
const uiPolicyResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-006'] } } });
assert.equal(uiPolicyResponse.isError, false);
const uiPolicy = JSON.parse(uiPolicyResponse.content[0].text);
assert.equal(uiPolicy.versions.ruleset, 'bp3-0.9');
assert.equal(uiPolicy.counts.findings, 1);
assert(uiPolicy.assets[0].result.findings[0].required_follow_up.includes('ui_policy_suitability_review'));
assert(!JSON.stringify(uiPolicyResponse).includes('PACK_PRIVATE_UI'));
const lookupResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-002'] } } });
assert.equal(lookupResponse.isError, false);
const lookup = JSON.parse(lookupResponse.content[0].text);
assert.equal(lookup.versions.ruleset, 'bp3-0.10');
assert.equal(lookup.counts.findings, 1);
assert(lookup.assets[0].result.findings[0].required_follow_up.includes('client_lookup_necessity_review'));
assert(!JSON.stringify(lookupResponse).includes('PACK_PRIVATE_LOOKUP'));
const changeResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-008'] } } });
assert.equal(changeResponse.isError, false);
const change = JSON.parse(changeResponse.content[0].text);
assert.equal(change.versions.ruleset, 'bp3-0.11');
assert.equal(change.counts.findings, 1);
assert(change.assets[0].result.findings[0].required_follow_up.includes('onchange_loading_intent_review'));
assert(!JSON.stringify(changeResponse).includes('PACK_PRIVATE_LOOKUP'));
onLoadMode = true;
const loadResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-003'] } } });
assert.equal(loadResponse.isError, false);
const load = JSON.parse(loadResponse.content[0].text);
assert.equal(load.versions.ruleset, 'bp3-0.12');
assert.equal(load.counts.findings, 1);
assert(load.assets[0].result.findings[0].required_follow_up.includes('onload_static_inputs_review'));
assert(!JSON.stringify(loadResponse).includes('PACK_PRIVATE_PRELOAD'));
onLoadMode = false;
const domResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-007'] } } });
assert.equal(domResponse.isError, false);
const dom = JSON.parse(domResponse.content[0].text);
assert.equal(dom.versions.ruleset, 'bp3-0.13');
assert.equal(dom.counts.findings, 2);
assert(dom.assets[0].result.findings[0].required_follow_up.includes('dom_document_scope_review'));
assert(dom.assets[0].result.findings[1].required_follow_up.includes('dom_created_subtree_review'));
assert(!JSON.stringify(domResponse).includes('PACK_PRIVATE_DOM'));
assert(!JSON.stringify(domResponse).includes('PACK_PRIVATE_CHILD'));
const setterResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-CL-005'] } } });
assert.equal(setterResponse.isError, false);
const setter = JSON.parse(setterResponse.content[0].text);
assert.equal(setter.versions.ruleset, 'bp3-0.14');
assert.equal(setter.counts.findings, 1);
assert(setter.assets[0].result.findings[0].required_follow_up.includes('reference_display_value_review'));
assert(setter.assets[0].result.limitations.includes('setvalue_reference_type_not_verified'));
assert(setter.assets[0].result.limitations.includes('setvalue_display_value_availability_not_verified'));
assert(!JSON.stringify(setterResponse).includes('PACK_PRIVATE_SET'));
abortMode = false; displayMode = false; uiPolicyMode = false; onLoadMode = false;
const textResponse = await handleCallTool({ params: { name, arguments: { update_set_sys_id: parent,
  selection_mode: 'review_targets', requested_rule_ids: ['AU-QRY-002'] } } });
assert.equal(textResponse.isError, false);
const textQuery = JSON.parse(textResponse.content[0].text);
assert.equal(textQuery.versions.ruleset, 'bp3-0.15');
assert.equal(textQuery.counts.findings, 2);
assert(textQuery.assets[0].result.findings[0].required_follow_up.includes('fulltext_add_query_review'));
assert(textQuery.assets[0].result.findings[1].required_follow_up.includes('fulltext_encoded_query_review'));
assert(textQuery.assets[0].result.limitations.includes('fulltext_index_configuration_not_verified'));
assert(!JSON.stringify(textResponse).includes('PACK_PRIVATE_TEXT'));
console.log('Packaged MCP review: registration + dispatch + worker PASS');
