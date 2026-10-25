import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';
function review(code: string, table = 'sys_script_client', engine = reviewUpdateSetPayload) {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), name: `${table}_${id}`,
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-25T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-24T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: ['AU-CL-007'] });
}
function result(code: string) {
  const out = review(code); expect(out.status).toBe('reviewed'); if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('reports document-wide lookup without asserting standard UI ownership or returning selectors', () => {
  const out = result('function onLoad(){document.getElementById("PRIVATE_SELECTOR");}');
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ category: 'maintainability', severity: 'info', confidence: 'low', verification_status: 'candidate',
    required_follow_up: expect.arrayContaining(['dom_dependency_review', 'dom_document_scope_review']) });
  expect(out.limitations).toContain('dom_standard_ui_ownership_not_verified');
  expect(JSON.stringify(out)).not.toContain('PRIVATE_SELECTOR');
});
it.each([
  'document.querySelector("#x");', 'window.document.querySelectorAll(".x");',
  'const key="query"+"Selector";document[key]("#x");',
  'var d=document;d.getElementById("x");',
  'document.body.querySelector(".x");', 'document.documentElement.querySelector(".x");',
  'var el=document.querySelector("#x");el.querySelector(".y");',
])('keeps document-derived lookups as ownership questions: %s', body => {
  const out=result(`function onLoad(){${body}}`);
  expect(out.findings.length).toBeGreaterThan(0);
  for(const f of out.findings) expect(f.required_follow_up).toContain('dom_document_scope_review');
});
it.each([
  'var el=document.createElement("div");el.querySelector(".x");',
  'var el=window.document.createElement("div");var alias=el;alias.querySelectorAll(".x");',
  'document.createElement("div").querySelector(".x").querySelector(".y");',
])('separates locally created subtrees without labeling them standard UI violations: %s', body => {
  const out=result(`function onLoad(){${body}}`);
  expect(out.findings.length).toBeGreaterThan(0);
  for(const f of out.findings) {
    expect(f.required_follow_up).toContain('dom_created_subtree_review');
    expect(f.required_follow_up).not.toContain('dom_document_scope_review');
  }
});
it('does not infer ownership from custom-looking IDs or standard-looking selectors', () => {
  for(const selector of ['u_custom_panel','incident.number']) {
    expect(result(`document.getElementById("${selector}");`).findings[0].required_follow_up).toContain('dom_document_scope_review');
  }
});
it.each([
  'function onLoad(document){document.querySelector("x");}',
  'function onLoad(){var document={querySelector:function(){}};document.querySelector("x");}',
  'function onLoad(){let window={document:{getElementById:function(){}}};window.document.getElementById("x");}',
  'function onLoad(){var x={querySelector:function(){}};x.querySelector("x");}',
  'function onLoad(){class Custom {querySelector(){}} var el=new Custom();el.querySelector("x");}',
  'function onLoad(){try{}catch(document){document.querySelector("x");}}',
  'function onLoad(){document.createElement("div");}',
  '// document.querySelector("x");\nvar s="document.getElementById";',
])('does not confuse local same-name receivers or non-search sites: %s', code => {
  expect(result(code).findings).toEqual([]);
});
it.each([
  'function onLoad(el){el.querySelector("x");}',
  'function onLoad(){document[method]("x");}',
  'function onLoad(){var d=document;if(flag)d=other;d.querySelector("x");}',
  'function onLoad(){var d=document;function mutate(){d=other;} d.querySelector("x");}',
  'function onLoad(){document.querySelector=function(){};document.querySelector("x");}',
  'function onLoad(){var d=document;mutate(d);d.querySelector("x");}',
  'function onLoad(){var fn=document.querySelector;fn("x");}',
  'function onLoad(){var el=document.createElement("div");document.body.appendChild(el);el.querySelector("x");}',
  'function onLoad(){eval(code);document.querySelector("x");}',
  'function onLoad(){document.querySelector(...args);}',
  'function onLoad(){document.querySelector();}',
  'function onLoad(){document.querySelector(42);}',
  'function onLoad(){document?.querySelector("x");}',
  'function onLoad(){document.querySelectorAll("x")[0].querySelector("y");}',
])('keeps unsupported provenance/mutation/shape incomplete: %s', code => {
  const out=result(code);
  expect(out.limitations).toContain('dom_receiver_unresolved');expect(out.review_status).toBe('partial');
});
it('preserves per-site provenance and source line numbers', () => {
  const out=result('function onLoad(){\n document.querySelector("x");\n document.createElement("div").querySelector("y");\n}');
  expect(out.findings).toHaveLength(2);
  expect(out.findings.map(f=>f.line_start)).toEqual([2,3]);
  expect(out.findings[0].required_follow_up).toContain('dom_document_scope_review');
  expect(out.findings[1].required_follow_up).toContain('dom_created_subtree_review');
});
it.each(['sys_script','sys_script_include','sys_ws_operation','sysauto_script'])('rejects other asset types: %s', table => {
  expect(review('document.querySelector("x");',table)).toMatchObject({status:'rejected',reason:'rule_asset_mismatch'});
});
it.each([reviewUpdateSetPayloadLegacy,reviewUpdateSetPayloadScoped,reviewUpdateSetPayloadContextual])('keeps historical profiles unsupported %#', engine => {
  const out=review('document.querySelector("x");','sys_script_client',engine);
  expect(out.status).toBe('reviewed');if(out.status!=='reviewed')throw Error(out.reason);
  expect(out.result.coverage.skipped_rules).toEqual([{rule_id:'AU-CL-007',reason:'unsupported'}]);
});
it('retains bounded findings and AST work', () => {
  expect(review('document.querySelector("x");'.repeat(101))).toMatchObject({status:'rejected',reason:'finding_limit'});
  expect(review('0;'.repeat(50000))).toMatchObject({status:'rejected',reason:'analysis_limit'});
});
