import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped,
  reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';

function review(code: string, when: string | null = 'before_display', engine = reviewUpdateSetPayload) {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    name: `sys_script_${id}`, payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope>${when === null ? '' : `<when>${when}</when>`}<script><![CDATA[${code}]]></script></sys_script></record_update>`,
    retrieved_at: '2026-10-24T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-23T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: ['AU-BR-007'] });
}
function result(code: string, when: string | null = 'before_display') {
  const out = review(code, when);
  expect(out.status).toBe('reviewed');
  if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('returns display-only current mutation as an intent-review candidate, never a confirmed violation', () => {
  const out = result('(function executeRule(current, previous) { current.short_description = "PRIVATE_DISPLAY"; })(current, previous);');
  expect(out.coverage.evaluated_rule_ids).toEqual(['AU-BR-007']);
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ rule_id: 'AU-BR-007', severity: 'info', confidence: 'low',
    verification_status: 'candidate', required_follow_up: expect.arrayContaining(['display_persistence_intent_review']) });
  expect(JSON.stringify(out)).not.toContain('PRIVATE_DISPLAY');
});
it('detects direct current field setters without treating reads as writes', () => {
  const out = result('current.setValue("state", 2); current.short_description.setValue("x"); current.short_description.setDisplayValue("x"); current.getValue("state");');
  expect(out.findings).toHaveLength(3);
  expect(out.limitations).toContain('display_field_setter');
});
it('detects compound writes, increments and deletion', () => {
  expect(result('current.count += 1; current.count++; --current.count; delete current.u_temp;').findings).toHaveLength(4);
});
it('excludes scratchpad, previous, local objects and other records from current write candidates', () => {
  for (const code of [
    'g_scratchpad.label = "x";', 'previous.state = 2;',
    'var record = {}; record.state = 2;',
    'var record = new GlideRecord("incident"); record.state = 2; record.setValue("state", 2);',
  ]) {
    const out = result(code);
    expect(out.findings).toEqual([]);
    expect(out.limitations).not.toContain('display_write_unresolved');
  }
});
it('keeps dynamic fields, unbound receivers and replaced setters unresolved', () => {
  for (const code of [
    'current[field] = 2;', 'function f(record) { record.state = 2; }',
    'current.setValue = function() {}; current.setValue("state", 2);',
  ]) {
    const out = result(code);
    expect(out.findings).toEqual([]);
    expect(out.limitations).toContain('display_write_unresolved');
    expect(out.review_status).toBe('partial');
  }
});
it.each([
  ['var same = current; same.state = 2;', 1],
  ['const field = "state"; current[field] = 2;', 1],
  ['const field = "state"; current.setValue(field, 2);', 1],
  ['var element = current.state; element.setValue(2);', 1],
  ['var box = {record: current}; box.record.state = 2;', 1],
  ['var current = {}; current.state = 2;', 0],
  ['(function(current) { current.state = 2; })({});', 0],
  ['var same = flag ? current : {}; same.state = 2;', 0],
  ['current.getValue("state"); var value = current.state;', 0],
  ['current.update(); current.setWorkflow(false);', 0],
  ['g_scratchpad.state = current.state;', 0],
  ['var same = previous; same.state = 2;', 0],
  ['var current = new GlideRecordSecure("incident"); current.setValue("state", 2);', 0],
  ['// current.state = 2;\n"current.state = 2"; /current.state/;', 0],
])('keeps binding/write boundaries: %s', (code, count) => {
  expect(result(code).findings).toHaveLength(count);
});
it.each(['before', 'after', 'async', 'async_always', 'display', null])('does not treat other or missing stored values as before_display: %s', when => {
  const out = result('current.state = 2;', when);
  expect(out.findings).toEqual([]);
  expect(out.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-007', reason: 'missing_context' }]);
});
it('keeps unsupported dynamic/indirect writes incomplete', () => {
  for (const code of ['current.caller_id.name = "x";', 'current.setValue(field, 2);',
    'current.state.setValue(...args);', 'eval(text); current.state = 2;',
    '({state: current.state} = value);']) {
    const out = result(code);
    expect(out.limitations).toContain('display_write_unresolved');
    expect(out.review_status).toBe('partial');
  }
});
it('keeps the existing finding cap and does not merge sites sharing a line', () => {
  expect(result('current.state = 2; current.state = 3;').findings).toHaveLength(2);
  expect(review('current.state = 2;'.repeat(101))).toEqual({ poc_only: true, status: 'rejected', reason: 'finding_limit' });
});
it('does not silently clear iteration targets and bulk mutation helpers', () => {
  for (const code of ['for (current.state of values) {}', 'Object.assign(current, {state: 2});']) {
    const out = result(code);
    expect(out.findings).toEqual([]);
    expect(out.limitations).toContain('display_write_unresolved');
  }
});
it.each([reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual])
  ('keeps historical profiles unsupported %#', engine => {
    const out = review('current.state = 2;', 'before_display', engine);
    expect(out.status).toBe('reviewed');
    if (out.status !== 'reviewed') throw Error(out.reason);
    expect(out.result.findings).toEqual([]);
    expect(out.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-007', reason: 'unsupported' }]);
  });
it('preserves the shared AST visit cap', () => {
  expect(review('0;'.repeat(50000))).toEqual({ poc_only: true, status: 'rejected', reason: 'analysis_limit' });
});
