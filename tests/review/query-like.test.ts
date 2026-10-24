import { expect, it } from 'vitest';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';
import { reviewResultSchema } from '../../src/review/result-schema.js';

function review(code: string, table = 'sys_script') {
  const id = '1'.repeat(32);
  return reviewUpdateSetPayload({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    name: `${table}_${id}`, payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><when>after</when><script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-24T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-23T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: ['AU-QRY-001'] });
}
function result(code: string) {
  const value = review(code);
  expect(value.status).toBe('reviewed');
  if (value.status !== 'reviewed') throw Error(value.reason);
  expect(reviewResultSchema.safeParse(value.result).success).toBe(true);
  return value.result;
}
it('returns a source-linked BR candidate for a GlideRecord three-argument LIKE query without source text', () => {
  const value = result("var gr = new GlideRecord('incident');\ngr.addQuery('short_description', 'LIKE', 'PRIVATE_QUERY_BODY');");
  expect(value.findings).toHaveLength(1);
  expect(value.findings[0]).toMatchObject({ rule_id: 'AU-QRY-001', line_start: 2, confidence: 'low',
    verification_status: 'candidate', sources: [{ source_id: 'AU-SRC-005' }] });
  expect(value.coverage.evaluated_rule_ids).toEqual(['AU-QRY-001']);
  expect(JSON.stringify(value)).not.toContain('PRIVATE_QUERY_BODY');
});
it('does not certify an overwritten addQuery implementation as a GlideRecord query', () => {
  const value = result("var gr = new GlideRecord('incident'); gr.addQuery = function() {}; gr.addQuery('x', 'LIKE', 'y');");
  expect(value.findings).toEqual([]);
  expect(value.limitations).toContain('query_like_unresolved');
});
it.each([
  "var gr = new GlideRecordSecure('incident'); gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); var alias = gr; alias['addQuery']('x', 'LIKE', 'y');",
  "(function executeRule(current, previous) { var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y'); })(current, previous);",
])('recognizes a bounded, locally constructed record receiver: %s', code => {
  expect(result(code).findings.map(f => f.rule_id)).toEqual(['AU-QRY-001']);
});
it.each([
  "var gr = new GlideRecord('incident'); gr.addEncodedQuery('short_descriptionLIKEhello');",
  "var gr = new GlideRecord('incident'); gr.addQuery('short_descriptionLIKEhello');",
  "var gr = new GlideRecord('incident'); gr.addQuery('short_description', 'LIKEhello');",
  "var gr = new GlideRecord('incident'); gr.addQuery('x', 'CONTAINS', 'y');",
  "var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y', 'extra');",
  "// gr.addQuery('x', 'LIKE', 'y');\nvar x = \"gr.addQuery('x', 'LIKE', 'y')\";",
  "var gr = { addQuery: function() {} }; gr.addQuery('x', 'LIKE', 'y');",
  "function GlideRecord() {} var gr = new GlideRecord(); gr.addQuery('x', 'LIKE', 'y');",
  "function f(GlideRecord) { var gr = new GlideRecord(); gr.addQuery('x', 'LIKE', 'y'); }",
])('does not confuse encoded/other calls, arity, text or local constructors: %s', code => {
  expect(result(code).findings).toEqual([]);
});
it.each([
  "function f(gr) { gr.addQuery('x', 'LIKE', 'y'); }",
  "current.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); gr.addQuery('x', operator, 'y');",
  "var gr = new GlideRecord('incident'); gr[method]('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', ...values);",
  "var gr = new GlideRecord('incident'); gr.addQuery(...values);",
  "var gr = new GlideRecord('incident'); gr = custom; gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); function mutate() { gr = custom; } gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y'); consume(gr);",
  "var gr = new GlideRecord('incident'); new Consumer(gr); gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); var alias = gr; consume({alias: alias}); gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); gr[key] = custom; gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); Object.defineProperty(gr, 'addQuery', {value: custom}); gr.addQuery('x', 'LIKE', 'y');",
  "globalThis.GlideRecord = custom; var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y');",
  "consume(GlideRecord); var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y');",
  "var Ctor = GlideRecord; function mutate() { Ctor = custom; } var gr = new Ctor('incident'); gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); eval(text); gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident'); consume(...[gr]); gr.addQuery('x', 'LIKE', 'y');",
  "var gr = flag ? new GlideRecord('incident') : custom; gr.addQuery('x', 'LIKE', 'y');",
])('keeps unresolved receivers/operators and escapes explicit: %s', code => {
  const value = result(code);
  expect(value.findings).toEqual([]);
  expect(value.limitations).toContain('query_like_unresolved');
});
it.each(['sys_script_client', 'sys_script_include', 'sys_ws_operation', 'sysauto_script'])
  ('does not enable QRY-001 outside BR: %s', table => {
    const value = review("var gr = new GlideRecord('incident'); gr.addQuery('x', 'LIKE', 'y');", table);
    if (table === 'sys_script_client') expect(value).toMatchObject({ status: 'rejected', reason: 'rule_asset_mismatch' });
    else {
      expect(value.status).toBe('reviewed');
      if (value.status !== 'reviewed') throw Error(value.reason);
      expect(value.result.findings).toEqual([]);
      expect(value.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-QRY-001', reason: 'unsupported' }]);
    }
  });
it('retains the fixed finding cap for query candidates', () => {
  expect(review("var gr = new GlideRecord('incident');" + "gr.addQuery('x', 'LIKE', 'y');".repeat(101)))
    .toEqual({ poc_only: true, status: 'rejected', reason: 'finding_limit' });
});
it.each([
  "var gr = cond ? new GlideRecord('incident') : {}; gr.addQuery('x', 'LIKE', 'y');",
  "var gr = cond ? {} : new GlideRecordSecure('incident'); gr.addQuery('x', 'LIKE', 'y');",
  "var gr = new GlideRecord('incident') || other; gr.addQuery('x', 'LIKE', 'y');",
])('never completes silently when the receiver is only partly a local record: %s', code => {
  const value = result(code);
  expect(value.findings).toEqual([]);
  expect(value.limitations).toContain('query_like_unresolved');
  expect(value.review_status).not.toBe('completed');
});
