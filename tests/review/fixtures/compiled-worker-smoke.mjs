// Run after npm run build. Synthetic HTTP only; no configuration or real credentials.
import assert from 'node:assert/strict';
import { ServiceNowClient } from '../../../dist/servicenow/client.js';
import { reviewBoundedUpdateSet } from '../../../dist/review/update-set-adapter.js';

const parent = 'a'.repeat(32), id = '1'.repeat(32);
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = { sys_id: id, update_set: parent, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
let abortMode = false;
let displayMode = false;
let uiPolicyMode = false;
let onLoadMode = false;
const fetcher = async url => {
  const u = new URL(String(url));
  const table = uiPolicyMode ? 'sys_script_client' : 'sys_script';
  const selectedRow = { ...row, name: `${table}_${id}` };
  const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
    : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: 'Australia' }]
      : u.searchParams.get('sysparm_fields').includes('payload') ? [{ ...selectedRow,
        payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><type>${onLoadMode ? 'onLoad' : 'onChange'}</type><when>${displayMode ? 'before_display' : abortMode ? 'before' : 'after'}</when><collection>global</collection><script>${onLoadMode ? 'function onLoad(){var gr=new GlideRecord("PACK_PRIVATE_PRELOAD_TABLE");gr.get("PACK_PRIVATE_PRELOAD_ID");}' : uiPolicyMode ? 'function onChange(c,o,n,isLoading) { g_form.setMandatory("PACK_PRIVATE_UI", true); g_form.getReference("PACK_PRIVATE_LOOKUP", callback); document.querySelector("#PACK_PRIVATE_DOM");document.createElement("div").querySelector(".PACK_PRIVATE_CHILD"); }' : displayMode ? 'current.short_description = "PACK_PRIVATE_DISPLAY";' : abortMode ? 'current.setAbortAction(true); gs.addErrorMessage("PACK_PRIVATE_ABORT");' : "current.update(); var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'PACK_PRIVATE_QUERY');"}</script></${table}></record_update>` }]
        : [{ ...selectedRow, type: 'Business Rule' }];
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
const binding = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-BR-004'] }, { fetch: fetcher });
assert.equal(binding.isError, false);
assert.equal(binding.result.counts.findings, 1);
assert.equal(binding.result.versions.ruleset, 'bp3-0.6');
assert(binding.result.assets[0].result.findings[0].required_follow_up.includes('shared_binding_intent_review'));
assert(binding.result.assets[0].result.limitations.includes('br_global_table_shared_context'));
abortMode = true;
const abort = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-BR-005'] }, { fetch: fetcher });
assert.equal(abort.isError, false);
assert.equal(abort.result.counts.findings, 1);
assert.equal(abort.result.versions.ruleset, 'bp3-0.7');
assert(abort.result.assets[0].result.findings[0].required_follow_up.includes('post_abort_processing_review'));
assert(!JSON.stringify(abort).includes('PACK_PRIVATE_ABORT'));
displayMode = true;
const display = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-BR-007'] }, { fetch: fetcher });
assert.equal(display.isError, false);
assert.equal(display.result.counts.findings, 1);
assert.equal(display.result.versions.ruleset, 'bp3-0.8');
assert(display.result.assets[0].result.findings[0].required_follow_up.includes('display_persistence_intent_review'));
assert(!JSON.stringify(display).includes('PACK_PRIVATE_DISPLAY'));
uiPolicyMode = true;
const uiPolicy = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-CL-006'] }, { fetch: fetcher });
assert.equal(uiPolicy.isError, false);
assert.equal(uiPolicy.result.counts.findings, 1);
assert.equal(uiPolicy.result.versions.ruleset, 'bp3-0.9');
assert(uiPolicy.result.assets[0].result.findings[0].required_follow_up.includes('ui_policy_suitability_review'));
assert(!JSON.stringify(uiPolicy).includes('PACK_PRIVATE_UI'));
const lookup = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-CL-002'] }, { fetch: fetcher });
assert.equal(lookup.isError, false);
assert.equal(lookup.result.counts.findings, 1);
assert.equal(lookup.result.versions.ruleset, 'bp3-0.10');
assert(lookup.result.assets[0].result.findings[0].required_follow_up.includes('client_lookup_necessity_review'));
assert(!JSON.stringify(lookup).includes('PACK_PRIVATE_LOOKUP'));
const change = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-CL-008'] }, { fetch: fetcher });
assert.equal(change.isError, false);
assert.equal(change.result.counts.findings, 1);
assert.equal(change.result.versions.ruleset, 'bp3-0.11');
assert(change.result.assets[0].result.findings[0].required_follow_up.includes('onchange_loading_intent_review'));
assert(!JSON.stringify(change).includes('PACK_PRIVATE_LOOKUP'));
onLoadMode = true;
const load = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-CL-003'] }, { fetch: fetcher });
assert.equal(load.isError, false);
assert.equal(load.result.counts.findings, 1);
assert.equal(load.result.versions.ruleset, 'bp3-0.12');
assert(load.result.assets[0].result.findings[0].required_follow_up.includes('onload_static_inputs_review'));
assert(!JSON.stringify(load).includes('PACK_PRIVATE_PRELOAD'));
onLoadMode = false;
const dom = await reviewBoundedUpdateSet(selected, { update_set_sys_id: parent, selection_mode: 'review_targets',
  requested_rule_ids: ['AU-CL-007'] }, { fetch: fetcher });
assert.equal(dom.isError, false);
assert.equal(dom.result.counts.findings, 2);
assert.equal(dom.result.versions.ruleset, 'bp3-0.13');
assert(dom.result.assets[0].result.findings[0].required_follow_up.includes('dom_document_scope_review'));
assert(dom.result.assets[0].result.findings[1].required_follow_up.includes('dom_created_subtree_review'));
assert(!JSON.stringify(dom).includes('PACK_PRIVATE_DOM'));
assert(!JSON.stringify(dom).includes('PACK_PRIVATE_CHILD'));
console.log('Compiled worker default entry: analysis + aggregation PASS');
