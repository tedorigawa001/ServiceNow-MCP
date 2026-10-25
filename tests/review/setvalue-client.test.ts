import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';
function review(code: string, table = 'sys_script_client', engine = reviewUpdateSetPayload) {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), name: `${table}_${id}`,
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-25T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-24T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: ['AU-CL-005'] });
}
function result(code: string) {
  const out = review(code); expect(out.status).toBe('reviewed'); if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('reports a two-argument form setter without certifying field type or display value availability', () => {
  const out=result('function onLoad(){g_form.setValue("PRIVATE_FIELD","PRIVATE_VALUE");}');
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({category:'performance',severity:'info',confidence:'low',verification_status:'candidate',
    required_follow_up:expect.arrayContaining(['reference_display_value_review'])});
  expect(out.limitations).toEqual(expect.arrayContaining(['setvalue_reference_type_not_verified','setvalue_display_value_availability_not_verified']));
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_FIELD|PRIVATE_VALUE/);
});
it.each([
  'g_form.setValue("assigned_to",id);',
  'var form=g_form;form.setValue("x",value);',
  'const key="set"+"Value";g_form[key]("x",value);',
  'var box={form:g_form};box.form.setValue("x",value);',
  'g_form.setValue(field,value);',
  'g_form.setValue("short_description","text");',
  'g_form.setValue("assigned_to","");',
  'g_form.setValue("assigned_to",null);',
])('keeps two explicit arguments as questions, not field-type or performance proof: %s', body => {
  const out=result(`function onLoad(){${body}}`);
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0].required_follow_up).toContain('reference_display_value_review');
  expect(out.limitations).toContain('setvalue_reference_type_not_verified');
});
it.each([
  'function onLoad(){g_form.setValue("x",id,display);}',
  'function onLoad(){g_form.setValue("x",id,undefined);}',
  'function onLoad(){var form=g_form;form.setValue("x",id,"");}',
  'function onLoad(){var object={setValue:function(){}};object.setValue("x",id);}',
  'function onLoad(){let g_form={setValue:function(){}};g_form.setValue("x",id);}',
  'function onLoad(){var g_form={setValue:function(){}};g_form.setValue("x",id);}',
  'function onLoad(){class Custom {setValue(){}} new Custom().setValue("x",id);}',
  'function onLoad(){try{}catch(g_form){g_form={setValue:function(){}};g_form.setValue("x",id);}}',
  '// g_form.setValue("x",id);\nvar x="g_form.setValue";',
])('excludes known custom methods, comments and three-argument calls: %s', code => {
  expect(result(code).findings).toEqual([]);
});
it.each([
  'function onLoad(form){form.setValue("x",id);}',
  'function onLoad(){g_form[method]("x",id);}',
  'function onLoad(){var form=g_form;if(flag)form=other;form.setValue("x",id);}',
  'function onLoad(){var form=g_form;function mutate(){form=other;}form.setValue("x",id);}',
  'function onLoad(){g_form.setValue=function(){};g_form.setValue("x",id);}',
  'function onLoad(){g_form.setValue("x",id);g_form.setValue=function(){};}',
  'function onLoad(){Object.assign(g_form,replacement);g_form.setValue("x",id);}',
  'function onLoad(){var form=g_form;pass(form);form.setValue("x",id);}',
  'function onLoad(){var fn=g_form.setValue;fn("x",id);}',
  'function onLoad(){g_form.setValue.call(g_form,"x",id);}',
  'function onLoad(){g_form.setValue(...args);}',
  'function onLoad(){g_form.setValue("x");}',
  'function onLoad(){g_form.setValue("x",id,display,extra);}',
  'function onLoad(){g_form.setValue(12,id);}',
  'function onLoad(){g_form.setValue("",id);}',
  'function onLoad(){g_form?.setValue("x",id);}',
  'function onLoad(){new g_form.setValue("x",id);}',
  'function onLoad(){[g_form]=replacement;g_form.setValue("x",id);}',
  'function onLoad(){eval(code);g_form.setValue("x",id);}',
])('keeps unsupported receiver or call shape incomplete: %s', code => {
  const out=result(code);expect(out.findings).toEqual([]);
  expect(out.review_status).toBe('partial');expect(out.limitations).toContain('setvalue_receiver_unresolved');
});
it('does not mark three arguments as a display-value verification', () => {
  const out=result('g_form.setValue("x",id,undefined);');
  expect(out.findings).toEqual([]);expect(out.limitations).toContain('setvalue_display_value_availability_not_verified');
});
it('retains precise source positions and distinguishes arity in a mixed script', () => {
  const out=result('function onLoad(){\ng_form.setValue("x",id);\ng_form.setValue("y",id,display);\ng_form.setValue("z",id);\n}');
  expect(out.findings.map(f=>f.line_start)).toEqual([2,4]);
});
it.each(['sys_script','sys_script_include','sys_ws_operation','sysauto_script'])('rejects other asset types: %s', table => {
  expect(review('g_form.setValue("x",id);',table)).toMatchObject({status:'rejected',reason:'rule_asset_mismatch'});
});
it.each([reviewUpdateSetPayloadLegacy,reviewUpdateSetPayloadScoped,reviewUpdateSetPayloadContextual])('preserves historical unsupported profiles %#', engine => {
  const out=review('g_form.setValue("x",id);','sys_script_client',engine);
  expect(out.status).toBe('reviewed');if(out.status!=='reviewed')throw Error(out.reason);
  expect(out.result.coverage.skipped_rules).toEqual([{rule_id:'AU-CL-005',reason:'unsupported'}]);
});
it('retains shared finding and AST budgets', () => {
  expect(review('g_form.setValue("x",id);'.repeat(101))).toMatchObject({status:'rejected',reason:'finding_limit'});
  expect(review('0;'.repeat(50000))).toMatchObject({status:'rejected',reason:'analysis_limit'});
});
