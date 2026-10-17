import { describe, expect, it } from 'vitest';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';

function review(code: string, rule = 'AU-BR-001') {
  const table = rule === 'AU-CL-004' ? 'sys_script_client' : 'sys_script';
  const xml = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const output = reviewUpdateSetPayload({ name: `${table}_${'1'.repeat(32)}`, update_set_id: '2'.repeat(32), update_xml_sys_id: '3'.repeat(32),
    payload: `<record_update table="${table}"><${table} action="INSERT_OR_UPDATE"><sys_id>${'1'.repeat(32)}</sys_id><sys_scope>global</sys_scope><when>async</when><script>${xml}</script></${table}></record_update>`,
    retrieved_at: '2026-10-17T05:00:00Z', record_updated_at: null,
    instance_release: { family: 'Australia', raw_buildname: 'Australia', source: 'sys_cluster_state.build_name',
      retrieved_at: '2026-10-17T04:59:00Z', resolution_status: 'resolved', visibility_scope: 'caller_acl' }, requested_rule_ids: [rule] });
  if (output.status !== 'reviewed') throw new Error(output.reason);
  return output.result;
}

describe('bounded lexical and receiver analysis', () => {
  it('does not confuse a block-local current object with the platform record', () => {
    const result = review('{ let current = { update() { return 1; } }; current.update(); }');
    expect(result.findings).toHaveLength(0);
  });
  it.each([
    'function demo(current) { current.update(); }',
    'function demo({ current }) { current.update(); }',
    'function demo(...current) { current.update(); }',
    'function demo() { current.update(); var current = { update() {} }; }',
    'try { throw {}; } catch (current) { current.update(); }',
    'for (let current of [{ update() {} }]) { current.update(); }',
    '{ current.update(); let current = {}; }',
    'var view = class current { static render() { current.update(); } };',
  ])('resolves lexical shadowing instead of treating an identifier spelling as provenance %#', code => {
    expect(review(code).findings).toHaveLength(0);
  });
  it.each([
    'var holder = { nested: { ticket: current } }; holder.nested.ticket.update();',
    'var holder = [current]; holder[0].update();',
    'var holder = {}; holder.ticket = current; holder.ticket.update();',
    'var ticket = current; var holder = [ticket]; holder["0"].update();',
    'var holder = { ticket: current }; var alias = holder; alias.ticket.update();',
  ])('tracks bounded fixed-property and literal-index aliases in one function %#', code => {
    expect(review(code).findings.map(f => f.rule_id)).toEqual(['AU-BR-001']);
  });
  it('retains platform bindings outside blocks, class expressions, static blocks and switch case scopes', () => {
    for (const code of [
      '{ let current = {}; } current.update();',
      'var view = class current {}; current.update();',
      'class View { static { var current = {}; } } current.update();',
      'switch (current.update()) { case 1: let current = {}; break; }',
    ]) expect(review(code).findings).toHaveLength(1);
  });
  it('distinguishes field changes from methods on local receivers', () => {
    expect(review('var field = current.priority; field.changesTo("1");', 'AU-BR-002').findings).toHaveLength(1);
    expect(review('var old = previous; var holder = { old }; holder.old.getValue("state");', 'AU-BR-002').findings).toHaveLength(1);
    expect(review('var state = { changes() { return true; } }; state.changes();', 'AU-BR-002').findings).toHaveLength(0);
    expect(review('function show(previous) { return previous.state; }', 'AU-BR-002').findings).toHaveLength(0);
  });
  it.each([
    'function onLoad() { var cache = { getXMLWait() { return "cache"; } }; cache.getXMLWait(); }',
    'function onLoad() { class Cache { getXMLWait() { return "cache"; } } new Cache().getXMLWait(); }',
    'function GlideAjax() {} function onLoad() { new GlideAjax().getXMLWait(); }',
  ])('does not call known local receivers platform Ajax %#', code => {
    expect(review(code, 'AU-CL-004').findings).toHaveLength(0);
  });
  it('keeps genuine and unresolved Ajax candidates, rather than treating unknown as safe', () => {
    expect(review('function onLoad() { var Constructor = GlideAjax; var rpc = new Constructor("Lookup"); rpc.getXMLWait(); }', 'AU-CL-004').findings).toHaveLength(1);
    expect(review('function onLoad() { unknownClient.getXMLWait(); }', 'AU-CL-004').findings).toHaveLength(1);
    expect(review('class Derived extends UnknownBase {} new Derived().getXMLWait();', 'AU-CL-004').findings).toHaveLength(1);
  });
  it('updates known aliases after reassignment and preserves possible origins across branches', () => {
    expect(review('var ticket = current; ticket = { update() {} }; ticket.update();').findings).toHaveLength(0);
    expect(review('var ticket = current; if (flag) ticket = { update() {} }; ticket.update();').findings).toHaveLength(1);
    expect(review('var holder = { ticket: current }; var alias = holder; alias.ticket = { update() {} }; holder.ticket.update();').findings).toHaveLength(0);
    expect(review('current = { update() {} }; current.update();').findings).toHaveLength(0);
    expect(review('var holder = { ticket: current }; holder[key] = {}; holder.ticket.update();').findings).toHaveLength(1);
  });
  it('does not lose a record alias when a container is assigned conditionally', () => {
    expect(review('var holder; if (flag) { holder = { ticket: current }; } holder.ticket.update();').findings).toHaveLength(1);
    expect(review('var holder; if (flag) { holder = { nested: [current] }; } holder.nested[0].update();').findings).toHaveLength(1);
  });
  it('bounds merges of cyclic local containers without executing or recursively expanding them forever', () => {
    const code = 'var a = { ticket: current }; a.self = a; var b = { ticket: { update() {} } }; b.self = b; if (flag) a = b; a.self.ticket.update();';
    expect(review(code).findings).toHaveLength(1);
  });
  it('recognizes only the declared ServiceNow entry wrapper, not general function calls', () => {
    const result = review('(function executeRule(current, previous) { current.update(); previous.state; })(current, previous);', 'AU-BR-001');
    expect(result.findings).toHaveLength(1);
    expect(review('(function executeRule(current, previous) { previous.state; })(current, previous);', 'AU-BR-002').findings).toHaveLength(1);
    for (const code of [
      '(function (ticket) { ticket.update(); })(current);',
      'function persist(ticket) { ticket.update(); } persist(current);',
      'function selected() { return current; } selected().update();',
      'var key = "ticket"; var holder = { ticket: current }; holder[key].update();',
      'var method = "update"; current[method]();',
      'var holder = { ticket: current }; function later() { holder.ticket.update(); } later();',
      'var { ticket } = { ticket: current }; ticket.update();',
    ]) expect(review(code).findings).toHaveLength(0);
  });
  it('keeps the canonical entry record visible to nested lexical callbacks, without propagating aliases', () => {
    expect(review('(function(current, previous) { function callback() { current.update(); } callback(); })(current, previous);').findings).toHaveLength(1);
    expect(review('(function(current, previous) { var ticket = current; function callback() { ticket.update(); } callback(); })(current, previous);').findings).toHaveLength(0);
  });
  it('keeps reachability and workflow review outside this change, with no fabricated confirmation', () => {
    const result = review('function unused() { if (false) { current.setWorkflow(false); current.update(); } }');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ verification_status: 'candidate', confidence: 'low', severity: 'info', verification_evidence: [] });
    expect(result.findings[0].required_follow_up).toEqual(['source_approval', 'binding_and_reachability', 'exceptions_and_business_intent']);
    expect(result.limitations).toContain('interprocedural_analysis_not_performed');
  });
  it('rejects an excessive analysis depth without silently falling back to name matching', () => {
    expect(() => review('{'.repeat(300) + 'current.update();' + '}'.repeat(300))).toThrow('analysis_limit');
  });
});
