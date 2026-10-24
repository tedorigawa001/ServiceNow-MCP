import { expect, it } from 'vitest';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped,
  reviewUpdateSetPayloadContextual } from '../../src/review/payload-review.js';

function review(code: string, when: string | null = 'before', engine = reviewUpdateSetPayload) {
  const id = '1'.repeat(32);
  return engine({ update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    name: `sys_script_${id}`, payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope>${when === null ? '' : `<when>${when}</when>`}<script><![CDATA[${code}]]></script></sys_script></record_update>`,
    retrieved_at: '2026-10-24T00:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-23T23:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: ['AU-BR-005'] });
}
function result(code: string, when: string | null = 'before') {
  const out = review(code, when);
  expect(out.status).toBe('reviewed');
  if (out.status !== 'reviewed') throw Error(out.reason);
  return out.result;
}
it('reports possible processing after a current abort without declaring necessary cleanup a violation', () => {
  const out = result('(function executeRule(current, previous) { current.setAbortAction(true); gs.addErrorMessage("PRIVATE_ABORT_BODY"); })(current, previous);');
  expect(out.coverage.evaluated_rule_ids).toEqual(['AU-BR-005']);
  expect(out.findings).toHaveLength(1);
  expect(out.findings[0]).toMatchObject({ rule_id: 'AU-BR-005', severity: 'info', confidence: 'low',
    verification_status: 'candidate', required_follow_up: expect.arrayContaining(['post_abort_processing_review']) });
  expect(out.limitations).toContain('abort_following_call_effect_unverified');
  expect(JSON.stringify(out)).not.toContain('PRIVATE_ABORT_BODY');
});
it('does not report statements after an unconditional early return', () => {
  const out = result('(function executeRule(current, previous) { current.setAbortAction(true); return; gs.eventQueue("x"); })(current, previous);');
  expect(out.findings).toEqual([]);
});
it('does not mix mutually exclusive branches or an aborting branch that returns', () => {
  for (const code of [
    'if (flag) { current.setAbortAction(true); return; } gs.eventQueue("x");',
    'if (flag) current.setAbortAction(true); else gs.eventQueue("x");',
  ]) expect(result(`(function executeRule(current, previous) { ${code} })(current, previous);`).findings).toEqual([]);
});
it('distinguishes a property write from pure local processing after the abort', () => {
  const out = result('current.setAbortAction(true); current.short_description = "PRIVATE_WRITE";');
  expect(out.findings).toHaveLength(1);
  expect(out.limitations).toContain('abort_following_property_write');
  expect(result('current.setAbortAction(true); var local = 1 + 2;').findings).toEqual([]);
});
it('retains unresolved receiver, argument and control-flow evidence instead of reporting clear', () => {
  for (const code of [
    'function f(record) { record.setAbortAction(true); gs.info("x"); }',
    'current.setAbortAction(flag); gs.info("x");',
    'current.setAbortAction(true); while (flag) { gs.info("x"); }',
  ]) {
    const out = result(code);
    expect(out.limitations).toContain('abort_flow_unresolved');
    expect(out.review_status).toBe('partial');
  }
});
it.each([
  ['gs.info("before"); current.setAbortAction(true);', 0],
  ['current.setAbortAction(false); gs.info("x");', 0],
  ['var other = new GlideRecord("incident"); other.setAbortAction(true); gs.info("x");', 0],
  ['var current = { setAbortAction: function() {} }; current.setAbortAction(true); gs.info("x");', 0],
  ['var same = current; same.setAbortAction(true); current.state = 2;', 1],
  ['if (flag) current.setAbortAction(true); gs.info("x");', 1],
  ['if (false) current.setAbortAction(true); gs.info("x");', 0],
  ['false && current.setAbortAction(true); gs.info("x");', 0],
  ['flag && current.setAbortAction(true); gs.info("x");', 1],
  ['current.setAbortAction(true); if (flag) return; gs.info("x");', 1],
  ['current.setAbortAction(true); if (flag) return; else return; gs.info("x");', 0],
  ['current.setAbortAction(true); return gs.addErrorMessage("necessary");', 1],
  ['current.setAbortAction(true); throw new Error("x");', 1],
  ['current.setAbortAction(true); throw "x"; gs.info("x");', 0],
  ['function unused() { gs.info("x"); } current.setAbortAction(true);', 0],
  ['current.setAbortAction(true); function later() { gs.info("x"); }', 0],
  ['current.setAbortAction(true); current.count++;', 1],
  ['current.setAbortAction(true); delete current.x;', 1],
])('preserves intra-body order and receiver boundaries: %s', (code, count) => {
  expect(result(`(function executeRule(current, previous) { ${code} })(current, previous);`).findings).toHaveLength(count);
});
it.each(['after', 'async_always', 'async', 'before_display', 'display', null])('skips non-before or missing when: %s', when => {
  const out = result('current.setAbortAction(true); gs.info("x");', when);
  expect(out.findings).toEqual([]);
  expect(out.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-005', reason: 'missing_context' }]);
});
it('counts distinct abort sites even when they share a line, keeping the existing finding limit', () => {
  expect(result('current.setAbortAction(true); current.setAbortAction(true); gs.info("x");').findings).toHaveLength(2);
  expect(review('current.setAbortAction(true);'.repeat(101) + 'gs.info("x");'))
    .toEqual({ poc_only: true, status: 'rejected', reason: 'finding_limit' });
});
it('does not certify a platform abort after method replacement', () => {
  const out = result('current.setAbortAction = function() {}; current.setAbortAction(true); gs.info("x");');
  expect(out.findings).toEqual([]);
  expect(out.limitations).toContain('abort_flow_unresolved');
});
it.each([
  'current.setAbortAction(true); current.setAbortAction(false); gs.info("x");',
  'current.setAbortAction(true, false); gs.info("x");',
  'while (flag) { current.setAbortAction(true); gs.info("x"); }',
  'current.setAbortAction(true); try { return; } finally { gs.info("x"); }',
  'eval(text); current.setAbortAction(true); gs.info("x");',
])('keeps reversal and unsupported paths unresolved: %s', code => {
  const out = result(`(function executeRule(current, previous) { ${code} })(current, previous);`);
  expect(out.limitations).toContain('abort_flow_unresolved');
  expect(out.review_status).toBe('partial');
});
it('accepts only the existing bounded constant/alias evidence', () => {
  expect(result('const enabled = true; var same = current; same.setAbortAction(enabled); gs.info("x");').findings).toHaveLength(1);
  expect(result('var enabled = true; current.setAbortAction(enabled); gs.info("x");').limitations).toContain('abort_flow_unresolved');
});
it.each([reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped, reviewUpdateSetPayloadContextual])
  ('preserves unsupported behavior for historical profiles %#', engine => {
    const out = review('current.setAbortAction(true); gs.info("x");', 'before', engine);
    expect(out.status).toBe('reviewed');
    if (out.status !== 'reviewed') throw Error(out.reason);
    expect(out.result.findings).toEqual([]);
    expect(out.result.coverage.skipped_rules).toEqual([{ rule_id: 'AU-BR-005', reason: 'unsupported' }]);
  });
it('shares the AST visit budget across receiver and flow analysis', () => {
  expect(review('0;'.repeat(20000))).toEqual({ poc_only: true, status: 'rejected', reason: 'analysis_limit' });
});
