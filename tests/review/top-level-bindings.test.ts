import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped,
  reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';
import { reviewResultSchema } from '../../src/review/result-schema.js';

function input(code: string, collection: string | null = 'incident', table = 'sys_script') {
  const id = '1'.repeat(32);
  return { update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    name: `${table}_${id}`, payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><when>after</when>${collection === null ? '' : `<collection>${collection}</collection>`}<script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-24T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-23T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: ['AU-BR-004'] };
}
const review = (code: string, collection: string | null = 'incident', table = 'sys_script') => reviewUpdateSetPayload(input(code, collection, table));
function result(code: string, collection: string | null = 'incident') {
  const out = review(code, collection);
  expect(out.status).toBe('reviewed');
  if (out.status !== 'reviewed') throw Error(out.reason);
  expect(reviewResultSchema.safeParse(out.result).success).toBe(true);
  return out.result;
}
it('reports top-level BR variables without returning identifiers or source', () => {
  const out = result("var PRIVATE_BINDING_NAME = new GlideRecord('incident');");
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ rule_id: 'AU-BR-004', line_start: 1,
    severity: 'info', verification_status: 'candidate', sources: [{ source_id: 'AU-SRC-001' }] });
  expect(out.coverage.evaluated_rule_ids).toEqual(['AU-BR-004']);
  expect(JSON.stringify(out)).not.toContain('PRIVATE_BINDING_NAME');
});
it('keeps a global-table shared-context candidate with explicit intent review, not an approved exemption', () => {
  const out = result('var shared = 1;', 'global');
  expect(out.findings).toHaveLength(1);
  expect(out.limitations).toContain('br_global_table_shared_context');
  expect(out.findings[0].required_follow_up).toContain('shared_binding_intent_review');
  expect(result('var shared = 1;', 'incident').limitations).not.toContain('br_global_table_shared_context');
});
it.each([
  ['function f() { var local = 1; }', 0],
  ['(function executeRule(current, previous) { var local = 1; })(current, previous);', 0],
  ['onBefore(current, previous); function onBefore(current, previous) { var local = 1; }', 0],
  ['var handler = function() { var local = 1; };', 1],
  ['let top = 1; const other = 2;', 2],
  ['{ let local = 1; const other = 2; }', 0],
  ['if (ok) { var leaked = 1; }', 1],
  ['for (var i = 0; i < 1; i++) {}', 1],
  ['for (let i = 0; i < 1; i++) {}', 0],
  ['switch (x) { case 1: let local = 1; break; }', 0],
  ['switch (x) { case 1: var leaked = 1; break; }', 1],
  ['class Local { static { var local = 1; } method() { var local = 2; } }', 0],
  ['var {a, b: alias} = value; var [first, second] = value;', 2],
  ['// var fake = 1;\n"var fake = 1"; /var fake/;', 0],
])('distinguishes declared script bindings from function/block locals: %s', (code, count) => {
  expect(result(code).findings).toHaveLength(count);
});
it('does not trust comments or naming conventions as approval of intentional sharing', () => {
  const out = result('// approved intentional shared global\nvar u_shared = 1;', 'global');
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0].required_follow_up).toContain('shared_binding_intent_review');
  expect(out.findings[0].verification_status).toBe('candidate');
});
it('keeps missing table context unknown, not global or clear', () => {
  const out = result('var shared = 1;', null);
  expect(out.findings).toHaveLength(1);
  expect(out.limitations).toContain('br_table_context_unknown');
  expect(out.review_status).toBe('partial');
});
it.each(['', 'Global', 'bad^ORname=x'])('keeps invalid or empty collection metadata unknown: %s', collection => {
  expect(result('var shared = 1;', collection).limitations).toContain('br_table_context_unknown');
});
it('marks dynamic scope as unresolved even when no variable declaration was visible', () => {
  const out = result('function f() { eval(text); }');
  expect(out.findings).toEqual([]);
  expect(out.limitations).toContain('br_dynamic_scope_unresolved');
  expect(out.review_status).toBe('partial');
});
it('does not treat implicit assignments or top-level function declarations as declared variables', () => {
  const out = result('shared = 1; function exported() { var local = 1; }');
  expect(out.findings).toEqual([]);
  expect(out.limitations).toContain('br_declared_variables_only');
});
it('retains the fixed finding cap for script declarations', () => {
  expect(review('var ' + Array.from({ length: 101 }, (_, i) => `name${i}=1`).join(',') + ';'))
    .toEqual({ poc_only: true, status: 'rejected', reason: 'finding_limit' });
});
it.each(['sys_script_client', 'sys_script_include', 'sys_ws_operation', 'sysauto_script'])('does not enable the BR rule on %s', table => {
  expect(review('var top = 1;', 'incident', table)).toMatchObject({ status: 'rejected', reason: 'rule_asset_mismatch' });
});
it.each([reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual])
  ('preserves unsupported BR-004 behavior on historical profiles %#', engine => {
    const out = engine(input('var top = 1;'));
    expect(out.status).toBe('reviewed');
    if (out.status !== 'reviewed') throw Error(out.reason);
    expect(out.result.findings).toEqual([]);
    expect(out.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-004', reason: 'unsupported' }]);
  });
