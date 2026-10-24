import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped,
  reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';
function review(code: string, type: string | null = 'onChange', engine = reviewUpdateSetPayload, table = 'sys_script_client') {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), name: `${table}_${id}`,
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope>${type === null ? '' : `<type>${type}</type>`}<script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-25T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-24T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: ['AU-CL-008'] });
}
function result(code: string) {
  const out = review(code); expect(out.status).toBe('reviewed');
  if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('returns an onChange lookup as a loading-intent consideration without declaring it unnecessary', () => {
  const out = result('function onChange(c,o,n,isLoading) { g_form.getReference("PRIVATE_LOADING_FIELD", callback); }');
  expect(out.coverage.evaluated_rule_ids).toEqual(['AU-CL-008']);
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ category: 'performance', severity: 'info', confidence: 'low',
    verification_status: 'candidate', required_follow_up: expect.arrayContaining(['onchange_loading_intent_review']) });
  expect(out.limitations).toContain('onchange_lookup_loading_possible');
  expect(JSON.stringify(out)).not.toContain('PRIVATE_LOADING_FIELD');
});
it.each([
  'if (isLoading) return; g_form.getReference("x");',
  'if (isLoading) { return; } else { g_form.getReference("x"); }',
  'if (!isLoading) g_form.getReference("x");',
  'if (isLoading === false) g_form.getReference("x");',
  'if (isLoading !== true) g_form.getReference("x");',
  'if (true === isLoading) return; g_form.getReference("x");',
  'if (isLoading || newValue === "") return; g_form.getReference("x");',
  '!isLoading && g_form.getReference("x");',
  'isLoading || g_form.getReference("x");',
  'isLoading ? null : g_form.getReference("x");',
  'var loading = isLoading; if (loading) return; g_form.getReference("x");',
  'if (isLoading) return; while (ready) { g_form.getReference("x"); }',
])('recognizes a bounded loading exclusion, not a business-intent approval: %s', body => {
  const out = result(`function onChange(c,o,newValue,isLoading) { ${body} }`);
  expect(out.findings).toEqual([]);
  expect(out.limitations).toContain('onchange_lookup_loading_excluded');
});
it.each([
  'g_form.getReference("x"); if (isLoading) return;',
  'if (isLoading) {}; g_form.getReference("x");',
  'if (isLoading) { log(); } g_form.getReference("x");',
  'if (isLoading) g_form.getReference("x");',
  'isLoading && g_form.getReference("x");',
  'if (isLoading && ready) return; g_form.getReference("x");',
  'if (isTemplate) return; g_form.getReference("x");',
  'if (!newValue) return; g_form.getReference("x");',
])('does not mistake a loading mention or unrelated guard for exclusion: %s', body => {
  const out = result(`function onChange(c,o,newValue,isLoading,isTemplate) { ${body} }`);
  expect(out.findings).toHaveLength(1);
  expect(out.limitations).toContain('onchange_lookup_loading_possible');
  expect(out.findings[0].recommendation).toContain('必要な読込時処理を違反と断定せず');
});
it.each(['onLoad', 'onSubmit', 'onCellEdit', 'onchange', '', null])('requires stored onChange metadata, not just a function name: %s', type => {
  const out = review('function onChange(c,o,n,isLoading) { g_form.getReference("x"); }', type);
  expect(out.status).toBe('reviewed'); if (out.status !== 'reviewed') throw Error(out.reason);
  expect(out.result.findings).toEqual([]);
  expect(out.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-CL-008', reason: 'missing_context' }]);
});
it('distinguishes lookup APIs and includes asynchronous GlideAjax, not just CL-002 APIs', () => {
  const out = result('function onChange(c,o,n,isLoading) { var ga = new GlideAjax("PRIVATE_AJAX"); ga.addParam("sysparm_name", "x"); ga.getXML(cb); ga.getXMLAnswer(cb); ga.getXMLWait(); var gr = new GlideRecord("PRIVATE_TABLE"); gr.addQuery("x", "y"); gr.query(); gr.next(); gr.get(n); g_form.getValue("x"); }');
  expect(out.findings).toHaveLength(5);
  expect(out.limitations).toEqual(expect.arrayContaining(['onchange_lookup_glide_ajax', 'onchange_lookup_client_record_or_reference']));
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_AJAX|PRIVATE_TABLE/);
});
it('tracks a renamed fourth parameter and simple receiver aliases', () => {
  const out = result('function onChange(c,o,n,loading) { if (loading) return; var make = GlideAjax; var ajax = new make("X"); ajax.getXMLAnswer(cb); var form = g_form; form.getReference("x"); }');
  expect(out.findings).toEqual([]); expect(out.limitations).toContain('onchange_lookup_loading_excluded');
});
it('keeps per-site loading coverage rather than a script-wide mention heuristic', () => {
  const out = result('function onChange(c,o,n,isLoading) { g_form.getReference("first"); if (isLoading) return; g_form.getReference("second"); }');
  expect(out.findings).toHaveLength(1);
  expect(out.limitations).toEqual(expect.arrayContaining(['onchange_lookup_loading_possible', 'onchange_lookup_loading_excluded']));
});
it.each([
  'function onChange(c,o,n,isLoading) { for (var i=0;i<2;i++) g_form.getReference("x"); }',
  'function onChange(c,o,n,isLoading) { try { g_form.getReference("x"); } catch(e) {} }',
  'function onChange(c,o,n,isLoading) { switch(n) {case 1:g_form.getReference("x");} }',
  'function onChange(c,o,n,isLoading) { isLoading = false; if (isLoading) return; g_form.getReference("x"); }',
  'function onChange(c,o,n,isLoading) { { let isLoading = false; if (isLoading) return; g_form.getReference("x"); } }',
  'function onChange(c,o,n) { if (isLoading) return; g_form.getReference("x"); }',
  'function onLoad() { g_form.getReference("x"); }',
  'var onChange = function(c,o,n,isLoading) { g_form.getReference("x"); };',
  'function onChange(c,o,n,isLoading) {} function onChange(c,o,n,isLoading) {g_form.getReference("x");}',
  'function onChange(c,o,n,isLoading) { if(isLoading)return; helper(); } function helper(){g_form.getReference("x");}',
  'function onChange(c,o,n,isLoading) { if (isLoading) return; function nested(){g_form.getReference("x");} nested(); }',
  'function onChange(c,o,n,isLoading) { function nested(){isLoading=false;} if (isLoading) return; nested(); g_form.getReference("x"); }',
])('does not certify unsupported flow, entry or loading bindings: %s', code => {
  const out = result(code);
  // Local shadowing alone gives a possible loading path, not a proven exclusion.
  expect(out.limitations.some(x => x === 'onchange_loading_flow_unresolved' || x === 'onchange_lookup_loading_possible')).toBe(true);
  expect(out.limitations).not.toContain('onchange_lookup_loading_excluded');
});
it.each([
  'function onChange(c,o,n,isLoading) { var g_form = {getReference: function(){}}; g_form.getReference("x"); }',
  'function onChange(c,o,n,isLoading) { function GlideAjax() {} var ga = new GlideAjax(); ga.getXML(cb); }',
  'function onChange(c,o,n,isLoading) { var gr = {query:function(){},get:function(){}}; gr.query(); gr.get(n); }',
  'function onChange(c,o,n,isLoading) { var ga = new GlideAjax("X"); ga.addParam("x",n); g_form.getValue("x"); }',
  'function onChange(c,o,n,isLoading) { return; g_form.getReference("x"); }',
  '// g_form.getReference("x");\nfunction onChange(c,o,n,isLoading) { "ga.getXML(cb)"; /getReference/; }',
])('does not confuse custom methods, non-lookup APIs or inert text with lookup execution: %s', code => {
  expect(result(code).findings).toEqual([]);
});
it.each([
  'var ga = new GlideAjax("X"); mutate(ga); ga.getXML(cb);',
  'var ga = new GlideAjax("X"); Object.assign(ga, methods); ga.getXML(cb);',
  'var ga = new GlideAjax("X"); ga.getXML = fn; ga.getXML(cb);',
  'var ga = new GlideAjax("X"); var call = ga.getXML; call(cb);',
  'var ga = new GlideAjax("X"); ga[method](cb);',
  'var ga = new GlideAjax("X"); ga.getXML(...args);',
  'var ga = new GlideAjax(null); ga.getXML(cb);',
  'var ga = condition ? new GlideAjax("X") : {}; ga.getXML(cb);',
  'eval(text); g_form.getReference("x");',
  'function f(form) { form.getReference("x"); } f(g_form);',
])('keeps unresolved receiver/API/escape evidence incomplete: %s', body => {
  const out = result(`function onChange(c,o,n,isLoading) { ${body} }`);
  expect(out.findings).toEqual([]); expect(out.limitations).toContain('onchange_loading_flow_unresolved');
  expect(out.review_status).toBe('partial');
});
it.each(['sys_script', 'sys_script_include', 'sys_ws_operation', 'sysauto_script'])('rejects other asset types: %s', table => {
  expect(review('function onChange(c,o,n,isLoading){}', 'onChange', reviewUpdateSetPayload, table))
    .toMatchObject({ status: 'rejected', reason: 'rule_asset_mismatch' });
});
it.each([reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual])('keeps fixed historical profiles unsupported %#', engine => {
  const out = review('function onChange(c,o,n,isLoading){g_form.getReference("x");}', 'onChange', engine);
  expect(out.status).toBe('reviewed'); if (out.status !== 'reviewed') throw Error(out.reason);
  expect(out.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-CL-008', reason: 'unsupported' }]);
});
it('preserves shared AST and finding limits', () => {
  expect(review(`function onChange(c,o,n,isLoading){${'g_form.getReference("x");'.repeat(101)}}`))
    .toMatchObject({ status: 'rejected', reason: 'finding_limit' });
  expect(review(`function onChange(c,o,n,isLoading){${'0;'.repeat(50000)}}`))
    .toMatchObject({ status: 'rejected', reason: 'analysis_limit' });
});
it('does not certify a loading alias changed by a nested function', () => {
  const out = result('function onChange(c,o,n,isLoading){ var loading=isLoading; function mutate(){loading=false;} mutate(); if(loading)return; g_form.getReference("x"); }');
  expect(out.findings).toHaveLength(1);
  expect(out.limitations).not.toContain('onchange_lookup_loading_excluded');
  expect(out.limitations).toContain('onchange_loading_flow_unresolved');
});
