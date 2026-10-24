import { describe, expect, it } from 'vitest';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';

// New synthetic compatibility set; the frozen v0.2 cases and artifacts are not edited.
function review(code: string, rule: string, when = 'async_always', table = 'sys_script') {
  const xml = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const output = reviewUpdateSetPayload({
    name: `${table}_${'1'.repeat(32)}`, update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${'1'.repeat(32)}</sys_id><sys_scope>global</sys_scope><when>${when}</when><filter_condition><item field="active" value="true"/></filter_condition><script>${xml}</script></${table}><sys_translated_text action="delete_multiple"><documentkey>${'1'.repeat(32)}</documentkey></sys_translated_text><sys_es_latest_script><script>ignored();</script></sys_es_latest_script></record_update>`,
    retrieved_at: '2026-10-17T05:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-17T04:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' },
    requested_rule_ids: [rule],
  });
  if (output.status !== 'reviewed') throw new Error(output.reason);
  return output.result;
}

describe('Australia choices and old BR entry compatibility: new synthetic envelopes', () => {
  it.each(['async_always', 'async'])('detects async previous and field changes in %s', when => {
    for (const code of [
      'previous.state;',
      'current.state.changes();',
      'current.state.changesTo("1");',
      'current.state.changesFrom("2");',
      '(function executeRule(current, previous) { previous.state; })(current, previous);',
      'onAfter(current, previous); function onAfter(current, previous) { previous.state; }',
    ]) {
      const result = review(code, 'AU-BR-002', when);
      expect(result.coverage.skipped_rules).toEqual([]);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].verification_status).toBe('candidate');
    }
  });
  it('does not treat before_display as async, and separates display field writes from update calls', () => {
    expect(review('previous.state;', 'AU-BR-002', 'before_display').coverage.evaluated_rule_ids).toEqual(['AU-BR-002']);
    expect(review('previous.state;', 'AU-BR-002', 'before_display').findings).toEqual([]);
    const display = review('current.update();', 'AU-BR-007', 'before_display');
    expect(display.coverage.evaluated_rule_ids).toEqual(['AU-BR-007']);
    expect(display.findings).toEqual([]);
    expect(review('current.state = 2;', 'AU-BR-007', 'before_display').findings).toHaveLength(1);
  });
  it.each([
    'onBefore(current, previous); function onBefore(current, previous) { current.update(); }',
    'function onAfter(current, previous) { current.update(); } onAfter(current, previous);',
    '"use strict"; onBefore(current, previous); function onBefore(current, previous) { var holder = [current]; holder[0].update(); }',
    'onBefore(current, previous); function onBefore(current, previous) { function callback() { current.update(); } callback(); }',
  ])('recognizes only the fixed declared entry shape, independent of its name or order %#', code => {
    expect(review(code, 'AU-BR-001').findings).toHaveLength(1);
  });
  it.each([
    'function X(current, previous) { current.update(); }',
    'X({}, previous); function X(current, previous) { current.update(); }',
    'X(current); function X(current, previous) { current.update(); }',
    'X(current, previous); function X(current) { current.update(); }',
    'if (flag) X(current, previous); function X(current, previous) { current.update(); }',
    'X(current, previous); { function X(current, previous) { current.update(); } }',
    'var X = function(current, previous) { current.update(); }; X(current, previous);',
    'X.call(null, current, previous); function X(current, previous) { current.update(); }',
    'X?.(current, previous); function X(current, previous) { current.update(); }',
    'X(current, previous); function X(current, previous) { current.update(); } X = replacement;',
    'X = replacement; X(current, previous); function X(current, previous) { current.update(); }',
    'X(current, previous); function X(current, previous) { current.update(); } ({ X } = replacement);',
    'X(current, previous); function X(current, previous) { current.update(); } [X] = replacement;',
    'X(current, previous); function X(current, previous) { current.update(); } X++;',
    'X(current, previous); function X(current, previous) { current.update(); } for (X of items) {}',
    'X(current, previous); function X(current, previous) { current.update(); } var X;',
    'X(current, previous); function X(current, previous) { current.update(); } function X(current, previous) {}',
    'var current = {}; X(current, previous); function X(current, previous) { current.update(); }',
    'var previous = {}; X(current, previous); function X(current, previous) { current.update(); }',
    'current = {}; X(current, previous); function X(current, previous) { current.update(); }',
    'previous = {}; X(current, previous); function X(current, previous) { current.update(); }',
    'X(current, previous); function X(current, previous) { current.update(); } function other() { X = replacement; }',
    'X(current, previous); async function X(current, previous) { current.update(); }',
    'X(current, previous); function* X(current, previous) { current.update(); }',
    'persist(current, previous); function persist(ticket, old) { ticket.update(); }',
    'X(current, previous); function X(current, previous) { var ticket = current; function callback() { ticket.update(); } callback(); }',
    'X(current, previous); function X(current, previous) { current = {}; current.update(); }',
  ])('does not infer platform parameters through ambiguous or out-of-scope entry shapes %#', code => {
    expect(review(code, 'AU-BR-001').findings).toEqual([]);
  });
  it('does not enable declared BR entries on client assets', () => {
    // Client parameters remain unresolved receivers, not platform BR entry records.
    const result = review('X(current, previous); function X(current, previous) { current.getXMLWait(); }', 'AU-CL-004', 'async_always', 'sys_script_client');
    expect(result.findings).toHaveLength(1);
  });
});
