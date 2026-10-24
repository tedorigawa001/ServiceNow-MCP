import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped,
  reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';

function review(code: string, engine = reviewUpdateSetPayload, table = 'sys_script_client') {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), name: `${table}_${id}`,
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-25T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-24T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: ['AU-CL-002'] });
}
function result(code: string) {
  const out = review(code); expect(out.status).toBe('reviewed');
  if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('returns a resolved reference lookup as a performance consideration, not an unnecessary-query verdict', () => {
  const out = result('function onLoad() { g_form.getReference("PRIVATE_REFERENCE_FIELD", function(ref) {}); }');
  expect(out.coverage.evaluated_rule_ids).toEqual(['AU-CL-002']);
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ rule_id: 'AU-CL-002', category: 'performance', severity: 'info', confidence: 'low',
    verification_status: 'candidate', required_follow_up: expect.arrayContaining(['client_lookup_necessity_review']) });
  expect(out.limitations).toContain('client_lookup_get_reference');
  expect(JSON.stringify(out)).not.toContain('PRIVATE_REFERENCE_FIELD');
});
it('counts executed lookup APIs, not construction, filters or result traversal', () => {
  const out = result('var gr = new GlideRecord("PRIVATE_TABLE"); gr.addQuery("active", true); gr.addEncodedQuery("active=true"); gr.query(function(rows) {}); gr.next(); gr.get("PRIVATE_RECORD"); gr.getValue("name");');
  expect(out.findings).toHaveLength(2);
  expect(out.limitations).toEqual(expect.arrayContaining(['client_lookup_record_query', 'client_lookup_record_get']));
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_TABLE|PRIVATE_RECORD/);
});
it.each([
  ['g_form.getReference("x");', 1],
  ['var form = g_form; form.getReference("x", handle);', 1],
  ['var box = { form: g_form }; box.form.getReference("x");', 1],
  ['var refs = [g_form]; refs[0].getReference("x");', 1],
  ['const name = "get" + "Reference"; g_form[name](field, callback);', 1],
  ['var gr = new GlideRecord(table); var other = gr; other.query(); other.get(id);', 2],
  ['var ctor = GlideRecord; var records = [new ctor("task")]; records[0].query(callback);', 1],
  ['var gr = new GlideRecord("task"); gr.addQuery("x", "y"); gr.next();', 0],
  ['var gr = new GlideRecord("task");', 0],
  ['g_form.getValue("caller_id"); g_form.setValue("x", 1);', 0],
  ['new GlideAjax("X").getXML(callback);', 0],
  ['var form = {getReference: function(){}}; form.getReference("x");', 0],
  ['class Store { query() {} get() {} } var gr = new Store(); gr.query(); gr.get("x");', 0],
  ['function GlideRecord() {} var gr = new GlideRecord("task"); gr.query();', 0],
  ['// g_form.getReference("x");\n"gr.query()"; /getReference/;', 0],
])('distinguishes receiver and lookup sites: %s', (code, count) => {
  expect(result(code).findings).toHaveLength(count);
});
it.each([
  'function f(form) { form.getReference("x"); }',
  'function f(gr) { gr.query(); }',
  'function f(g_form) { g_form.getReference("x"); }',
  'var g_form; g_form.getReference("x");',
  'var form = flag ? g_form : {}; form.getReference("x");',
  'var gr = flag ? new GlideRecord("task") : {}; gr.query();',
  'var Ctor = flag ? GlideRecord : function() {}; var gr = new Ctor("task"); gr.query();',
  'var gr = new GlideRecordSecure("task"); gr.query();',
  'g_form[method]("x");', 'var gr = new GlideRecord("task"); gr[method]();',
  'g_form.getReference();', 'g_form.getReference(null);', 'g_form.getReference(42);',
  'g_form.getReference("x", true);', 'g_form.getReference(...args);',
  'var gr = new GlideRecord(); gr.query();', 'var gr = new GlideRecord(null); gr.query();',
  'var gr = new GlideRecord("task"); gr.get();', 'var gr = new GlideRecord("task"); gr.get(null);',
  'var gr = new GlideRecord("task"); gr.query("field", callback, "value");',
  'var gr = new GlideRecord("task"); gr.query(...args);',
  'var lookup = g_form.getReference; lookup("x");',
  'g_form.getReference.call(g_form, "x");',
  'var form = g_form; function f() { form.getReference("x"); }',
])('keeps uncertain receiver/API shapes unresolved rather than clear: %s', code => {
  const out = result(code);
  expect(out.findings).toEqual([]); expect(out.limitations).toContain('client_lookup_unresolved');
  expect(out.review_status).toBe('partial');
});
it.each([
  'eval(text); g_form.getReference("x");',
  'with (obj) { g_form.getReference("x"); }',
  'g_form.getReference("x"); g_form.getReference = fn;',
  'var gr = new GlideRecord("task"); gr.query(); delete gr.query;',
  'const k = "get" + "Reference"; g_form[k] = fn; g_form.getReference("x");',
  'Object.assign(g_form, methods); g_form.getReference("x");',
  'var gr = new GlideRecord("task"); mutate(gr); gr.query();',
  'var gr = new GlideRecord("task"); mutate({gr: gr}); gr.query();',
])('does not certify receivers after escape or method mutation: %s', code => {
  const out = result(code);
  expect(out.findings).toEqual([]); expect(out.limitations).toContain('client_lookup_unresolved');
});
it('does not remove a candidate because it is async, guarded or claims an exception', () => {
  const out = result('// approved lookup\nfunction onChange(c, o, n, isLoading) { if (isLoading) return; g_form.getReference(n, function(ref) {}); }');
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0].recommendation).toContain('不要と断定せず');
  expect(out.limitations).toEqual(expect.arrayContaining(['client_lookup_necessity_not_verified', 'client_lookup_ui_compatibility_not_verified']));
});
it.each(['sys_script', 'sys_script_include', 'sys_ws_operation', 'sysauto_script'])('rejects other asset types: %s', table => {
  expect(review('g_form.getReference("x");', reviewUpdateSetPayload, table)).toMatchObject({ status: 'rejected', reason: 'rule_asset_mismatch' });
});
it.each([reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual])('keeps frozen profiles unsupported %#', engine => {
  const out = review('g_form.getReference("x");', engine);
  expect(out.status).toBe('reviewed');
  if (out.status !== 'reviewed') throw Error(out.reason);
  expect(out.result.findings).toEqual([]);
  expect(out.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-CL-002', reason: 'unsupported' }]);
});
it('retains site and shared AST limits', () => {
  expect(result('g_form.getReference("x");'.repeat(2)).findings).toHaveLength(2);
  expect(review('g_form.getReference("x");'.repeat(101))).toMatchObject({ status: 'rejected', reason: 'finding_limit' });
  expect(review('0;'.repeat(50000))).toMatchObject({ status: 'rejected', reason: 'analysis_limit' });
});
