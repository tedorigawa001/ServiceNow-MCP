import { describe, expect, it } from 'vitest';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';

function review(code: string, rule = 'AU-CL-004') {
  const table = rule === 'AU-CL-004' ? 'sys_script_client' : 'sys_script';
  const xml = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out = reviewUpdateSetPayload({ name: `${table}_${'1'.repeat(32)}`, update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${'1'.repeat(32)}</sys_id><sys_scope>global</sys_scope><when>async_always</when><script>${xml}</script></${table}></record_update>`,
    retrieved_at: '2026-10-17T05:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-17T04:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: [rule] });
  if (out.status !== 'reviewed') throw new Error(out.reason);
  return out.result;
}

describe('bounded constant analysis through the review pipeline', () => {
  it('detects a synchronous method named by pure string concatenation', () => {
    expect(review('new GlideAjax("ConstantReader")["getXML" + "Wait"]();').findings).toHaveLength(1);
  });
  it('resolves initialized const bindings and boolean expressions for workflow context', () => {
    const result = review('const off = !true; const useOff = off && true; current.setWorkflow(useOff); current.update();', 'AU-BR-001');
    expect(result.findings[0].required_follow_up).toContain('workflow_suppression_review');
    expect(review('const prefix = "getXML"; const key = prefix + "Wait"; new GlideAjax("C")[key]();').findings).toHaveLength(1);
  });
  it.each([
    'current.setWorkflow(true ? false : true); current.update();',
    'current.setWorkflow(false || false); current.update();',
    'current.setWorkflow(true && false); current.update();',
    'const stop = "a" !== "b"; current.setWorkflow(stop ? false : true); current.update();',
    'const stop = "a" === "b"; current.setWorkflow(stop); current.update();',
    'current.setWorkflow(false && unknownCall()); current.update();',
    'current.setWorkflow(true ? false : unknownCall()); current.update();',
  ])('uses only a bounded known false value, without asserting effective suppression %#', code => {
    const result = review(code, 'AU-BR-001');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].required_follow_up).toContain('workflow_suppression_review');
    expect(result.limitations).toContain('workflow_suppression_relation_not_verified');
    expect(result.findings[0].verification_status).toBe('candidate');
  });
  it.each([
    'current.setWorkflow(!0); current.update();',
    'current.setWorkflow(!""); current.update();',
    'current.setWorkflow(0 === 0 ? false : true); current.update();',
    'const off = Boolean(false); current.setWorkflow(off); current.update();',
    'const off = settings.off; current.setWorkflow(off); current.update();',
    'const off = unknownCondition ? false : false; current.setWorkflow(off); current.update();',
    'let off = false; current.setWorkflow(off); current.update();',
    'var off = false; current.setWorkflow(off); current.update();',
    'const off = false; { const off = true; current.setWorkflow(off); } current.update();',
    'const off = false; off = true; current.setWorkflow(off); current.update();',
    'const off = false; function change() { off = true; } current.setWorkflow(off); current.update();',
    'function helper(off) { current.setWorkflow(off); current.update(); } helper(false);',
  ])('does not invent false through unknown values, coercion, mutable bindings or calls %#', code => {
    const result = review(code, 'AU-BR-001');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].required_follow_up).not.toContain('workflow_suppression_review');
  });
  it.each([
    'const k = true ? "getXMLWait" : "getXML"; new GlideAjax("K")[k]();',
    'const first = "get"; const second = first + "XML"; const third = second + "Wait"; new GlideAjax("K")[third]();',
    '{ const k = "getXML" + "Wait"; new GlideAjax("K")[k](); }',
  ])('resolves string const names in lexical source order %#', code => {
    expect(review(code).findings).toHaveLength(1);
  });
  it.each([
    'new GlideAjax("K")[k](); const k = "getXMLWait";',
    'const k = "getXMLWait"; { new GlideAjax("K")[k](); const k = "getXML"; }',
    'let k = "getXMLWait"; new GlideAjax("K")[k]();',
    'const k = "getXMLWait"; k = "getXML"; new GlideAjax("K")[k]();',
    'const k = "getXMLWait"; ({ k } = other); new GlideAjax("K")[k]();',
    'const k = "getXMLWait"; [k] = other; new GlideAjax("K")[k]();',
    'const k = "getXMLWait"; for (k of items) {} new GlideAjax("K")[k]();',
    'const k = "getXMLWait"; k++; new GlideAjax("K")[k]();',
    'const k = "getXMLWait"; function later() { new GlideAjax("K")[k](); }',
    'const k = "getXMLWait"; with (other) { new GlideAjax("K")[k](); }',
    'const k = "getXMLWait"; eval(dynamicCode); new GlideAjax("K")[k]();',
    'const parts = ["getXML", "Wait"]; new GlideAjax("K")[parts.join("")]();',
    'const k = String("getXMLWait"); new GlideAjax("K")[k]();',
    'new GlideAjax("K")[unknown ? "getXMLWait" : "getXMLWait"]();',
  ])('keeps TDZ, write, function, eval/with and unresolved method names unknown %#', code => {
    expect(review(code).findings).toHaveLength(0);
  });
  it('keeps field/receiver origins and fixed property stores consistent with evaluated keys', () => {
    expect(review('const k = "changes" + "To"; current.state[k]("1");', 'AU-BR-002').findings).toHaveLength(1);
    expect(review('const k = "row"; const box = {}; box[k] = current; box[k].update();', 'AU-BR-001').findings).toHaveLength(1);
    expect(review('const k = "row"; const box = { [k]: current }; box[k].update();', 'AU-BR-001').findings).toHaveLength(1);
    expect(review('const k = "getXML" + "Wait"; const local = { [k]() {} }; local[k]();').findings).toHaveLength(0);
    expect(review('const box = { row: new GlideAjax("K") }; box[unknownKey].getXMLWait();').findings).toHaveLength(1);
  });
  it('bounds computed strings and depth without executing source or pruning candidates', () => {
    expect(review('new GlideAjax("K")["x".repeat(2000)]();').findings).toHaveLength(0);
    const long = JSON.stringify('x'.repeat(1024));
    expect(review(`const k = ${long} + "Wait"; new GlideAjax("K")[k]();`).findings).toHaveLength(0);
    const deep = '!'.repeat(70) + 'true';
    expect(review(`current.setWorkflow(${deep}); current.update();`, 'AU-BR-001').findings[0].required_follow_up).not.toContain('workflow_suppression_review');
    expect(review('if (false) new GlideAjax("K")["getXML" + "Wait"]();').findings).toHaveLength(1);
    expect(review('globalThis.CONSTANT_SENTINEL = "executed"; const k = "getXMLWait"; new GlideAjax("K")[k]();').findings).toHaveLength(1);
    expect((globalThis as Record<string, unknown>).CONSTANT_SENTINEL).toBeUndefined();
  });
  it.each([
    'const key = "row"; const box = { [unknownKey]: new GlideAjax("K") }; box[key].getXMLWait();',
    'const key = "row"; const box = { ...unknownBox }; box[key].getXMLWait();',
    'const key = "row"; const box = {}; box[unknownKey] = new GlideAjax("K"); box[key].getXMLWait();',
    'const key = "row"; const box = { row: { getXMLWait() {} }, ...unknownBox }; box[key].getXMLWait();',
    'const key = "1"; const box = [...unknownItems]; box[key].getXMLWait();',
  ])('never uses a resolved constant key to hide an unresolved container value %#', code => {
    const result = review(code);
    expect(result.findings).toHaveLength(1);
    expect(result.limitations).toContain('synchronous_ajax_receiver_unresolved');
  });
});
