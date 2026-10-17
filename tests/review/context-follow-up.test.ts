import { describe, expect, it } from 'vitest';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';
import { COMMON_FOLLOW_UP_CODES } from '../../src/review/follow-up-catalog.js';
import { followUpCodeSchema, isFollowUpApplicable } from '../../src/review/follow-up-catalog.js';

function review(code: string, rule = 'AU-BR-001', when = 'async_always', extra = '') {
  const table = rule === 'AU-CL-004' ? 'sys_script_client' : 'sys_script';
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const output = reviewUpdateSetPayload({
    name: `${table}_${'1'.repeat(32)}`, update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${'1'.repeat(32)}</sys_id><sys_scope>global</sys_scope><when>${escape(when)}</when><filter_condition><item field="active" value="true"/></filter_condition>${extra}<script>${escape(code)}</script></${table}><sys_translated_text action="delete_multiple"/><sys_es_latest_script><script>ignored();</script></sys_es_latest_script></record_update>`,
    retrieved_at: '2026-10-17T05:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-17T04:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: [rule],
  });
  if (output.status !== 'reviewed') throw new Error(output.reason);
  return output.result;
}

describe('context-specific followup output', () => {
  it('attaches workflow review only to the related current-update candidate', () => {
    const result = review('current.update(); current.setWorkflow(false); current.update();');
    expect(result.findings.map(f => f.required_follow_up)).toEqual([
      [...COMMON_FOLLOW_UP_CODES], [...COMMON_FOLLOW_UP_CODES, 'workflow_suppression_review'],
    ]);
    expect(result.limitations).toContain('workflow_suppression_relation_not_verified');
  });
  it('requests async dependency review for guarded and unguarded actual async candidates', () => {
    for (const when of ['async_always', 'async']) {
      const result = review('if (previous) previous.getValue("state"); current.state.changes();', 'AU-BR-002', when);
      expect(result.findings).toHaveLength(2);
      for (const f of result.findings) expect(f.required_follow_up).toEqual([...COMMON_FOLLOW_UP_CODES, 'async_dependency_review']);
    }
  });
  it('requests synchronous Ajax review while marking an unresolved receiver separately', () => {
    const result = review('var ajax = new GlideAjax("Lookup"); ajax.getXMLWait(); unknownClient.getXMLWait();', 'AU-CL-004');
    expect(result.findings).toHaveLength(2);
    for (const f of result.findings) expect(f.required_follow_up).toEqual([...COMMON_FOLLOW_UP_CODES, 'synchronous_ajax_review']);
    expect(result.limitations).toContain('synchronous_ajax_receiver_unresolved');
    expect(review('new GlideAjax("Lookup").getXMLWait();', 'AU-CL-004').limitations).not.toContain('synchronous_ajax_receiver_unresolved');
  });
  it.each([
    'var record = current; record.setWorkflow(false); record.update();',
    'var holder = [current]; holder[0].setWorkflow(false); holder[0].update();',
    'if (flag) current.setWorkflow(false); current.update();',
    'if (flag) current.setWorkflow(false); else current.update();',
    'current.setWorkflow(false); current.setWorkflow(true); current.update();',
    '(function(current, previous) { current.setWorkflow(false); current.update(); })(current, previous);',
    'X(current, previous); function X(current, previous) { current.setWorkflow(false); current.update(); }',
  ])('records possible same-function workflow context, without asserting it is effective %#', code => {
    const result = review(code);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].required_follow_up).toContain('workflow_suppression_review');
    expect(result.limitations).toContain('workflow_suppression_relation_not_verified');
    expect(result.findings[0]).toMatchObject({ verification_status: 'candidate', confidence: 'low', severity: 'info', verification_evidence: [] });
  });
  it.each([
    'var text = "current.setWorkflow(false)"; current.update();',
    '// current.setWorkflow(false)\ncurrent.update();',
    'var other = { setWorkflow() {} }; other.setWorkflow(false); current.update();',
    'var other = current; other = { setWorkflow() {} }; other.setWorkflow(false); current.update();',
    'current.setWorkflow(true); current.update();',
    'current.setWorkflow("false"); current.update();',
    'current.setWorkflow(0); current.update();',
    'current.setWorkflow(flag); current.update();',
    'current.setWorkflow(false, extra); current.update();',
    'function unused() { current.setWorkflow(false); } current.update();',
    'current.setWorkflow(false); function other() { current.update(); }',
    'current.update(); current.setWorkflow(false);',
    'function X(current) { current.setWorkflow(false); } current.update();',
    'var key = "setWorkflow"; current[key](false); current.update();',
  ])('does not attach workflow context from words, local receivers, other functions or unsupported forms %#', code => {
    const result = review(code);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].required_follow_up).toEqual([...COMMON_FOLLOW_UP_CODES]);
    expect(result.limitations).not.toContain('workflow_suppression_relation_not_verified');
  });
  it.each(['before', 'after', 'before_display', 'future_choice', ''])('does not fabricate async followups for %s', when => {
    const result = review('previous.state; current.state.changes();', 'AU-BR-002', when);
    expect(result.findings).toEqual([]);
  });
  it('does not treat condition metadata, comments or shadowed objects as async body dependencies', () => {
    const result = review('var s = "previous.state"; function X(previous) { previous.state; } var field = { changes() {} }; field.changes();',
      'AU-BR-002', 'async_always', '<condition>current.state.changes()</condition>');
    expect(result.findings).toEqual([]);
  });
  it('does not attach synchronous Ajax followups to local receivers or strings', () => {
    expect(review('var x = { getXMLWait() {} }; x.getXMLWait(); var text = "new GlideAjax().getXMLWait()";', 'AU-CL-004').findings).toEqual([]);
  });
  it('keeps inactive context separate, returns only applicable typed codes, and does not return code', () => {
    for (const [code, rule] of [
      ['current.setWorkflow(false); current.update();', 'AU-BR-001'],
      ['previous.state;', 'AU-BR-002'],
      ['new GlideAjax("Lookup").getXMLWait();', 'AU-CL-004'],
    ]) {
      const result = review(code, rule, 'async_always', '<active>false</active>');
      expect(result.limitations).toContain('inactive_asset');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].required_follow_up).toHaveLength(4);
      for (const token of result.findings[0].required_follow_up) expect(isFollowUpApplicable(followUpCodeSchema.parse(token), rule)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(code);
      expect(result.code_return_mode).toBe('none');
      expect(result.ruleset_version).toBe('bp3-0.3');
    }
  });
});
