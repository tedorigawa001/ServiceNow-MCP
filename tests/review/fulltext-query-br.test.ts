import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';
function review(code: string, table = 'sys_script', engine = reviewUpdateSetPayload) {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32), name: `${table}_${id}`,
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><when>after</when><script><![CDATA[${code}]]></script></${table}></record_update>`,
    retrieved_at: '2026-10-25T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-24T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: ['AU-QRY-002'] });
}
function result(code: string) {
  const out=review(code);expect(out.status).toBe('reviewed');if(out.status!=='reviewed')throw Error(out.reason);
  return out.result;
}
it('reports text query preconditions without revealing search or certifying index settings', () => {
  const out=result('var gr=new GlideRecord("PRIVATE_TABLE");gr.addQuery("123TEXTQUERY321","PRIVATE_SEARCH");');
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({severity:'info',confidence:'low',verification_status:'candidate',
    required_follow_up:expect.arrayContaining(['fulltext_index_configuration_review'])});
  expect(out.limitations).toContain('fulltext_index_configuration_not_verified');
  expect(JSON.stringify(out)).not.toMatch(/PRIVATE_TABLE|PRIVATE_SEARCH/);
});
it.each([
  'var gr=new GlideRecord("task");gr.addQuery("123TEXTQUERY321",term);',
  'var gr=new GlideRecordSecure("task");gr.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");var alias=gr;alias.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");const field="123TEXT"+"QUERY321";gr.addQuery(field,"word");',
  'var gr=new GlideRecord(tableName);gr.addQuery("123TEXTQUERY321","word");',
])('identifies the reserved-name two-argument API: %s', code => {
  const out=result(code);expect(out.findings).toHaveLength(1);
  expect(out.findings[0].required_follow_up).toContain('fulltext_add_query_review');
  expect(out.findings[0].required_follow_up).not.toContain('fulltext_encoded_query_review');
});
it.each([
  'gr.addEncodedQuery("123TEXTQUERY321=word");',
  'gr.addEncodedQuery("active=true^123TEXTQUERY321=word^EQ");',
  'gr.addEncodedQuery("active=true^OR123TEXTQUERY321=word");',
  'gr.addEncodedQuery("active=true^NQ123TEXTQUERY321=word");',
  'const q="active=true^"+"123TEXTQUERY321=word";gr.addEncodedQuery(q);',
])('recognizes fixed encoded term boundaries, not a free substring: %s', body => {
  const out=result(`var gr=new GlideRecord("task");${body}`);expect(out.findings).toHaveLength(1);
  expect(out.findings[0].required_follow_up).toContain('fulltext_encoded_query_review');
  expect(out.findings[0].required_follow_up).not.toContain('fulltext_add_query_review');
});
it.each([
  'gr.addQuery("short_description","CONTAINS","123TEXTQUERY321");',
  'gr.addQuery("123TEXTINDEXGROUP321","portal");',
  'gr.addEncodedQuery("short_description=123TEXTQUERY321=word");',
  'gr.addEncodedQuery("short_descriptionLIKE123TEXTQUERY321");',
  'gr.addEncodedQuery("u_123TEXTQUERY321=word");',
  'gr.addEncodedQuery("ORDERBY123TEXTQUERY321");',
])('does not turn normal fields, values or ordering into text query candidates: %s', body => {
  const out=result(`var gr=new GlideRecord("task");${body}`);
  expect(out.findings).toEqual([]);expect(out.limitations).not.toContain('fulltext_query_unresolved');
});
it.each([
  'var gr={addQuery:function(){},addEncodedQuery:function(){}};gr.addQuery("123TEXTQUERY321","word");gr.addEncodedQuery("123TEXTQUERY321=word");',
  'function f(){function GlideRecord(){}var gr=new GlideRecord();gr.addQuery("123TEXTQUERY321","word");}',
  '// gr.addQuery("123TEXTQUERY321","word");\nvar x="gr.addEncodedQuery";',
])('excludes custom same-name APIs and non-code text: %s', code => {
  expect(result(code).findings).toEqual([]);
});
it.each([
  'function f(gr){gr.addQuery("123TEXTQUERY321","word");}',
  'var gr=new GlideRecord("task");gr.addEncodedQuery(input);',
  'var gr=new GlideRecord("task");var q="123TEXTQUERY321=word";gr.addEncodedQuery(q);',
  'var gr=new GlideRecord("task");gr.addQuery(field,"word");',
  'var gr=new GlideRecord("task");gr.addQuery("123TEXTQUERY321","=","word");',
  'var gr=new GlideRecord("task");gr.addQuery("123TEXTQUERY321");',
  'var gr=new GlideRecord("task");gr.addEncodedQuery("123TEXTQUERY321=word",true);',
  'var gr=new GlideRecord("task");gr[method]("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");var fn=gr.addQuery;fn("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");gr.addQuery.call(gr,"123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");escape(gr);gr.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");gr.addEncodedQuery=function(){};gr.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");gr.addQuery("123TEXTQUERY321","word");gr.addQuery=function(){};',
  'var gr=new GlideRecord("task");if(flag)gr=other;gr.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");gr.addQuery(...args);',
  'var gr=new GlideRecord();gr.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord(12);gr.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");gr?.addQuery("123TEXTQUERY321","word");',
  'var gr=new GlideRecord("task");eval(code);gr.addQuery("123TEXTQUERY321","word");',
  'current.addQuery("123TEXTQUERY321","word");',
])('keeps unsupported call/receiver evidence incomplete: %s', code => {
  const out=result(code);expect(out.findings).toEqual([]);
  expect(out.review_status).toBe('partial');expect(out.limitations).toContain('fulltext_query_unresolved');
});
it.each(['123TEXTQUERY321=', '123TEXTQUERY321LIKEword', 'active=true^^123TEXTQUERY321=word', '123TEXTQUERY321=word^OR',
  '123TEXTQUERY321=javascript:compute()', '123TEXTQUERY321=word^', '123TEXTQUERY321=word\\^x'])('rejects unsupported encoded interpretation: %s', query => {
  const out=result(`var gr=new GlideRecord("task");gr.addEncodedQuery(${JSON.stringify(query)});`);
  expect(out.findings).toEqual([]);expect(out.limitations).toContain('fulltext_query_unresolved');
});
it('keeps individual construction types and source positions', () => {
  const out=result('var gr=new GlideRecord("task");\ngr.addQuery("123TEXTQUERY321","a");\ngr.addEncodedQuery("123TEXTQUERY321=b");');
  expect(out.findings.map(f=>f.line_start)).toEqual([2,3]);
  expect(out.findings[0].required_follow_up).toContain('fulltext_add_query_review');
  expect(out.findings[1].required_follow_up).toContain('fulltext_encoded_query_review');
});
it.each(['sys_script_client','sys_script_include','sys_ws_operation','sysauto_script'])('does not generalize beyond BR: %s', table => {
  const out=review('var gr=new GlideRecord("task");gr.addQuery("123TEXTQUERY321","word");',table);
  if(table==='sys_script_client') expect(out).toMatchObject({status:'rejected',reason:'rule_asset_mismatch'});
  else {
    expect(out.status).toBe('reviewed');if(out.status!=='reviewed')throw Error(out.reason);
    expect(out.result.findings).toEqual([]);
    expect(out.result.coverage.skipped_rules).toEqual([{rule_id:'AU-QRY-002',reason:'unsupported'}]);
  }
});
it.each([reviewUpdateSetPayloadLegacy,reviewUpdateSetPayloadScoped,reviewUpdateSetPayloadContextual])('preserves historical unsupported profile %#', engine => {
  const out=review('var gr=new GlideRecord("task");gr.addQuery("123TEXTQUERY321","word");','sys_script',engine);
  expect(out.status).toBe('reviewed');if(out.status!=='reviewed')throw Error(out.reason);
  expect(out.result.coverage.skipped_rules).toEqual([{rule_id:'AU-QRY-002',reason:'unsupported'}]);
});
it('retains constant-string, finding and AST limits', () => {
  expect(result(`var gr=new GlideRecord("task");gr.addEncodedQuery(${JSON.stringify('123TEXTQUERY321='+'x'.repeat(1024))});`).limitations).toContain('fulltext_query_unresolved');
  expect(review('var gr=new GlideRecord("task");'+'gr.addQuery("123TEXTQUERY321","x");'.repeat(101))).toMatchObject({status:'rejected',reason:'finding_limit'});
  expect(review('0;'.repeat(50000))).toMatchObject({status:'rejected',reason:'analysis_limit'});
});
