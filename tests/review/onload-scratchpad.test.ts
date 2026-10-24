import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped,
  reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';
function review(code: string, type: string | null = 'onLoad', engine = reviewUpdateSetPayload, table = 'sys_script_client') {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), name: `${table}_${id}`,
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope>${type === null ? '' : `<type>${type}</type>`}<script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-25T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-24T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: ['AU-CL-003'] });
}
function result(code: string) {
  const out = review(code); expect(out.status).toBe('reviewed'); if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('returns constant-input onLoad data as a timing review, not proof that scratchpad migration is appropriate', () => {
  const out = result('function onLoad(){var gr = new GlideRecord("PRIVATE_TABLE"); gr.get("PRIVATE_ID");}');
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ category: 'performance', severity: 'info', confidence: 'low', verification_status: 'candidate',
    required_follow_up: expect.arrayContaining(['onload_data_timing_review', 'onload_static_inputs_review']) });
  expect(out.limitations).toContain('onload_data_availability_not_verified');
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_TABLE|PRIVATE_ID/);
});
it.each([
  ['var gr=new GlideRecord("task"); const id="fixed"; gr.get(id);', 'static'],
  ['var gr=new GlideRecord("task"); gr.addQuery("active",true); gr.query();', 'static'],
  ['var ga=new GlideAjax("X"); ga.addParam("sysparm_name","fetch"); ga.addParam("sysparm_fixed","a"); ga.getXML(cb);', 'static'],
  ['var ga=new GlideAjax("X"); ga.addParam("sysparm_name","fetch"); ga.getXMLAnswer(cb);', 'static'],
  ['var ga=new GlideAjax("X"); ga.addParam("sysparm_name","fetch"); ga.getXMLWait();', 'static'],
  ['g_form.getReference("caller_id",cb);', 'runtime'],
  ['var gr=new GlideRecord("task"); gr.get(g_form.getValue("caller_id"));', 'runtime'],
  ['var id=g_form.getValue("caller_id"); var gr=new GlideRecord("task"); gr.get(id);', 'runtime'],
  ['var gr=new GlideRecord("task"); gr.addQuery("assigned_to",g_form.getValue("x")); gr.query();', 'runtime'],
  ['var ga=new GlideAjax("X"); ga.addParam("sysparm_name","fetch"); ga.addParam("sysparm_id",g_form.getValue("x")); ga.getXML(cb);', 'runtime'],
  ['var gr=new GlideRecord("task"); var id="fixed"; gr.get(id);', 'unknown'],
  ['var gr=new GlideRecord(tableName); gr.get("fixed");', 'unknown'],
  ['var ga=new GlideAjax("X"); ga.getXML(cb);', 'unknown'],
  ['var ga=new GlideAjax("X"); ga.addParam("sysparm_name",chooseMethod()); ga.getXML(cb);', 'unknown'],
  ['var gr=new GlideRecord("task"); gr.addEncodedQuery("active=true"); gr.query();', 'unknown'],
  ['var gr=new GlideRecord("task"); if(ready) gr.get("fixed");', 'unknown'],
])('keeps input evidence distinct without proving availability: %s', (body, timing) => {
  const out = result(`function onLoad(){${body}}`);
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0].required_follow_up).toContain(`onload_${timing}_inputs_review`);
  expect(out.limitations).toContain(`onload_input_${timing}`);
  if (timing === 'unknown') expect(out.review_status).toBe('partial');
});
it('retains per-site classes in a mixed script and never treats fixed inputs as fixed results', () => {
  const out = result('function onLoad(){var a=new GlideRecord("task");a.get("fixed");g_form.getReference("x");var b=new GlideRecord("task");b.get(compute());}');
  expect(out.findings).toHaveLength(3);
  for (const [i, type] of ['static','runtime','unknown'].entries()) expect(out.findings[i].required_follow_up).toContain(`onload_${type}_inputs_review`);
  expect(out.limitations).toContain('onload_data_exposure_not_verified');
});
it.each(['onChange','onSubmit','onCellEdit','onload','',null])('requires stored onLoad metadata: %s', type => {
  const out = review('function onLoad(){g_form.getReference("x");}', type);
  expect(out.status).toBe('reviewed'); if(out.status !== 'reviewed') throw Error(out.reason);
  expect(out.result.findings).toEqual([]);
  expect(out.result.coverage.skipped_rules).toEqual([{rule_id:'AU-CL-003',reason:'missing_context'}]);
});
it.each([
  'function onLoad(){var form={getReference:function(){}};form.getReference("x");}',
  'function onLoad(){var gr={get:function(){},query:function(){}};gr.get("x");gr.query();}',
  'function onLoad(){function GlideAjax(){} var ga=new GlideAjax();ga.getXML(cb);}',
  'function onLoad(){var gr=new GlideRecord("task");gr.addQuery("active",true);g_form.getValue("x");}',
  '// g_form.getReference("x");\nfunction onLoad(){"ga.getXML(cb)"; /query/;}',
])('distinguishes non-lookup sites and custom receivers: %s', code => {
  expect(result(code).findings).toEqual([]);
});
it.each([
  'function onChange(){g_form.getReference("x");}',
  'var onLoad=function(){g_form.getReference("x");};',
  'function onLoad(x){g_form.getReference("x");}',
  'function onLoad(){} function onLoad(){g_form.getReference("x");}',
  'function onLoad(){helper();} function helper(){g_form.getReference("x");}',
  'function onLoad(){function cb(){g_form.getReference("x");} cb();}',
  'function onLoad(){var ga=new GlideAjax("X");mutate(ga);ga.getXML(cb);}',
  'function onLoad(){var ga=new GlideAjax("X");var call=ga.getXML;call(cb);}',
  'function onLoad(){g_form[method]("x");}',
  'function onLoad(){var gr=new GlideRecord("task");gr.get(...args);}',
  'function onLoad(){var gr=new GlideRecord("task");gr.query=function(){};gr.query();}',
  'function onLoad(){eval(code);g_form.getReference("x");}',
])('keeps unknown entry/receiver/escape evidence incomplete: %s', code => {
  const out=result(code);expect(out.findings).toEqual([]);
  expect(out.limitations).toContain('onload_data_flow_unresolved');expect(out.review_status).toBe('partial');
});
it('does not reuse request evidence after a lookup or unmodeled request mutation', () => {
  const out=result('function onLoad(){var gr=new GlideRecord("task");gr.get("a");gr.get("b");}');
  expect(out.findings[0].required_follow_up).toContain('onload_static_inputs_review');
  expect(out.findings[1].required_follow_up).toContain('onload_unknown_inputs_review');
});
it.each(['sys_script','sys_script_include','sys_ws_operation','sysauto_script'])('rejects other asset types: %s', table => {
  expect(review('function onLoad(){}','onLoad',reviewUpdateSetPayload,table)).toMatchObject({status:'rejected',reason:'rule_asset_mismatch'});
});
it.each([reviewUpdateSetPayloadLegacy,reviewUpdateSetPayloadScoped,reviewUpdateSetPayloadContextual])('keeps frozen profiles unsupported %#', engine => {
  const out=review('function onLoad(){g_form.getReference("x");}','onLoad',engine);
  expect(out.status).toBe('reviewed');if(out.status!=='reviewed')throw Error(out.reason);
  expect(out.result.coverage.skipped_rules).toEqual([{rule_id:'AU-CL-003',reason:'unsupported'}]);
});
it('retains finding and shared AST limits', () => {
  expect(review(`function onLoad(){${'g_form.getReference("x");'.repeat(101)}}`)).toMatchObject({status:'rejected',reason:'finding_limit'});
  expect(review(`function onLoad(){${'0;'.repeat(50000)}}`)).toMatchObject({status:'rejected',reason:'analysis_limit'});
});
