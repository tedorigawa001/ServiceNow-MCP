import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped,
  reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';

function review(code: string, engine = reviewUpdateSetPayload, table = 'sys_script_client') {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    name: `${table}_${id}`, payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-24T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-23T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: ['AU-CL-006'] });
}
function result(code: string) {
  const out = review(code);
  expect(out.status).toBe('reviewed');
  if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('returns a resolved g_form control as a UI Policy consideration, not a violation', () => {
  const out = result('function onLoad() { g_form.setMandatory("PRIVATE_FORM_FIELD", true); }');
  expect(out.coverage.evaluated_rule_ids).toEqual(['AU-CL-006']);
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ rule_id: 'AU-CL-006', category: 'maintainability', severity: 'info', confidence: 'low',
    verification_status: 'candidate', required_follow_up: expect.arrayContaining(['ui_policy_suitability_review']) });
  expect(JSON.stringify(out)).not.toContain('PRIVATE_FORM_FIELD');
});
it('includes visibility/display/read-only controls and preserves complex dynamic conditions as candidates', () => {
  const out = result('function onChange(control, oldValue, newValue) { g_form.setVisible("x", false); g_form.setDisplay(fieldName, newValue !== ""); g_form.setReadOnly("x", isRestricted()); }');
  expect(out.findings).toHaveLength(3);
  expect(out.limitations).toEqual(expect.arrayContaining(['ui_policy_visibility_control', 'ui_policy_readonly_control',
    'ui_policy_dynamic_arguments', 'ui_policy_suitability_not_verified', 'ui_policy_ui_compatibility_not_verified']));
});
it('keeps unknown receivers, dynamic methods, malformed calls and overwritten controls unresolved', () => {
  for (const code of [
    'function f(form) { form.setMandatory("x", true); }',
    'g_form[method]("x", true);', 'g_form.setMandatory("x");',
    'g_form.setReadOnly(...args);', 'g_form.setVisible("x", "true");',
    'g_form.setMandatory = function() {}; g_form.setMandatory("x", true);',
  ]) {
    const out = result(code);
    expect(out.findings).toEqual([]);
    expect(out.limitations).toContain('ui_policy_control_unresolved');
    expect(out.review_status).toBe('partial');
  }
});
it('rejects definitely non-string fields and non-boolean literal flags', () => {
  for (const code of ['g_form.setVisible(null, true);', 'g_form.setReadOnly("x", null);', 'g_form.setMandatory(42, true);']) {
    const out = result(code);
    expect(out.findings).toEqual([]);
    expect(out.limitations).toContain('ui_policy_control_unresolved');
  }
});
it.each([
  ['g_form.setMandatory("x", false);', 1],
  ['g_form.setVisible("x", true); g_form.setDisplay("y", false);', 2],
  ['g_form.setReadOnly("x", false);', 1],
  ['var form = g_form; form.setReadOnly("x", true);', 1],
  ['var box = {form: g_form}; box.form.setDisplay("x", true);', 1],
  ['var forms = [g_form]; forms[0].setVisible("x", false);', 1],
  ['const method = "set" + "Mandatory"; g_form[method]("x", true);', 1],
  ['const field = "x"; const flag = !false; g_form.setMandatory(field, flag);', 1],
  ['function onLoad(g_form) { g_form.setMandatory("x", true); }', 0],
  ['var g_form = {setMandatory: function() {}}; g_form.setMandatory("x", true);', 0],
  ['var form = new GlideRecord("incident"); form.setReadOnly("x", true);', 0],
  ['var g_form; g_form.setMandatory("x", true);', 0],
  ['var form = flag ? g_form : {}; form.setMandatory("x", true);', 0],
  ['var call = g_form.setMandatory; call("x", true);', 0],
  ['g_form.setValue("x", 1); g_form.isMandatory("x"); g_form.setDisabled("x", true);', 0],
  ['// g_form.setMandatory("x", true);\n"g_form.setVisible()"; /setReadOnly/;', 0],
])('distinguishes control calls and receiver bindings: %s', (code, count) => {
  expect(result(code).findings).toHaveLength(count);
});
it('does not treat complex logic or a comment claiming an exception as approved or prohibited', () => {
  const out = result('// approved complex UI constraint\nfunction onSubmit() { if (isRestricted()) g_form.setReadOnly(fieldName, isLocked()); return validate(); }');
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0].verification_status).toBe('candidate');
  expect(out.findings[0].required_follow_up).toContain('ui_policy_suitability_review');
  expect(out.limitations).toContain('ui_policy_dynamic_arguments');
});
it.each([
  'eval(text); g_form.setMandatory("x", true);',
  'Object.assign(g_form, methods); g_form.setMandatory("x", true);',
  'const method = "setMandatory"; g_form[method] = function() {}; g_form.setMandatory("x", true);',
  'g_form.setMandatory("x", true); delete g_form.setMandatory;',
])('does not certify control methods after unsafe mutation: %s', code => {
  const out = result(code);
  expect(out.findings).toEqual([]);
  expect(out.limitations).toContain('ui_policy_control_unresolved');
});
it.each(['sys_script', 'sys_script_include', 'sys_ws_operation', 'sysauto_script'])('rejects non-Client Script targets: %s', table => {
  expect(review('g_form.setMandatory("x", true);', reviewUpdateSetPayload, table))
    .toMatchObject({ status: 'rejected', reason: 'rule_asset_mismatch' });
});
it.each([reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual])
  ('keeps historical profiles unsupported %#', engine => {
    const out = review('g_form.setMandatory("x", true);', engine);
    expect(out.status).toBe('reviewed');
    if (out.status !== 'reviewed') throw Error(out.reason);
    expect(out.result.findings).toEqual([]);
    expect(out.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-CL-006', reason: 'unsupported' }]);
  });
it('keeps same-line sites separate and preserves the finding cap', () => {
  expect(result('g_form.setMandatory("x", true);'.repeat(2)).findings).toHaveLength(2);
  expect(review('g_form.setMandatory("x", true);'.repeat(101)))
    .toEqual({ poc_only: true, status: 'rejected', reason: 'finding_limit' });
});
it('preserves the shared AST visit cap', () => {
  expect(review('0;'.repeat(50000))).toEqual({ poc_only: true, status: 'rejected', reason: 'analysis_limit' });
});
