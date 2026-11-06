import { describe, expect, it } from 'vitest';
import { inspectCheckpointSyntax } from './fixtures/raw-json-boundary.js';
import { readFileSync } from 'node:fs';

const limits = () => ({ max_input_bytes: 1000000, max_input_buffer_bytes: 1000000, max_input_live_bytes: 2000000,
  max_depth: 5, max_tokens: 200000, max_value_nodes: 100000, max_array_items: 30000,
  max_parse_work: 10000000, max_value_work: 20000, max_total_work: 10020000,
  max_token_scratch_bytes: 66, max_ast_nodes: 100000, max_live_value_nodes: 200000,
  max_scopes: 10, max_workers: 20, max_nodes: 10000, max_snapshot_bytes: 1000000,
  max_control_bytes: 500, max_file_bytes: 1000000 });
const bytes = (text: string) => new TextEncoder().encode(text);
const inspect = (text: string, cap = limits()) => inspectCheckpointSyntax(bytes(text), cap);

describe('RP-B finite syntax, never value/evidence acceptance', () => {
  it('rejects a missing colon instead of accepting an object-shaped shell', () => {
    expect(inspect('{"a"1}\n')).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_syntax' });
  });
  it('rejects a duplicate key before its malformed value is parsed', () => {
    expect(inspect('{"a":0,"a":not_a_value}\n')).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_duplicate_key',
      counts: { valueNodes: 2, retiredNodes: 2 } });
  });
  it('rejects a valid JSON number with a noncanonical spelling', () => {
    expect(inspect('{"a":1.0}\n')).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_number' });
  });
  it('refuses the next token and next node before consuming their reserved capacity', () => {
    expect(inspect('{}\n', { ...limits(), max_tokens: 1 })).toMatchObject({ ok: false, reason: 'raw_limit', counts: { tokens: 1 } });
    expect(inspect('{"a":0}\n', { ...limits(), max_value_nodes: 1 })).toMatchObject({ ok: false, reason: 'raw_limit', counts: { valueNodes: 1 } });
  });
  it('refuses the next known-path or unknown-path array item before parsing it', () => {
    expect(inspect('{"snapshot":{"scopes":[0,not_json]}}\n', { ...limits(), max_scopes: 1 })).toMatchObject({ ok: false, reason: 'raw_limit', counts: { arrayItems: 1 } });
    expect(inspect('{"a":[0,not_json]}\n', { ...limits(), max_array_items: 1 })).toMatchObject({ ok: false, reason: 'raw_limit', counts: { arrayItems: 1 } });
  });
});

describe('bounded JSON grammar and earliest rejection', () => {
  it.each([
    ['{not_json}\n', 'raw_syntax'], ['{a:1}\n', 'raw_syntax'], ['{"a"1}\n', 'raw_syntax'], ['{"a":}\n', 'raw_syntax'],
    ['{"a":1,}\n', 'raw_syntax'], ['{"a":[1,]}\n', 'raw_syntax'], ['{"a":[,1]}\n', 'raw_syntax'], ['{"a":[1,,2]}\n', 'raw_syntax'],
    ['{"a":[1 2]}\n', 'raw_profile'], ['{"a":truefalse}\n', 'raw_syntax'], ['{"a":nul}\n', 'raw_syntax'],
    ['{"a":False}\n', 'raw_syntax'], ['{"a":undefined}\n', 'raw_syntax'], ['{"a":NaN}\n', 'raw_syntax'], ['{"a":Infinity}\n', 'raw_syntax'],
    ['{"a":/x/}\n', 'raw_syntax'], ['{"a":1/*x*/}\n', 'raw_syntax'], ['{"a":1 "b":2}\n', 'raw_profile'],
    ['{"a":[]]\n', 'raw_syntax'], ['{"a":{]}\n', 'raw_syntax'], ['{"a":[}', 'raw_syntax'], ['{"a":', 'raw_syntax'],
    ['{"a";1}\n', 'raw_syntax'], ['{"a":1;"b":2}\n', 'raw_syntax'], ['{"a":[1;2]}\n', 'raw_syntax'],
    ['{"a":nuXl}\n', 'raw_syntax'], ['{"a":fxlse}\n', 'raw_syntax'], ['{"a":trux}\n', 'raw_syntax'],
    ['{"a":[1}}\n', 'raw_syntax'], ['{"a":{"b":0]}\n', 'raw_syntax'],
    ['{', 'raw_syntax'], ['{"a', 'raw_syntax'], ['{"a":"x', 'raw_syntax'], ['{"a":tr', 'raw_syntax'], ['{"a":1', 'raw_syntax'],
    ['{"\u007f":0}\n', 'raw_profile'], ['{"a":"\u007f"}\n', 'raw_profile'], ['{\u007f}\n', 'raw_profile'],
  ])('rejects grammar case %s with the fixed reason %s', (text, reason) => {
    const r = inspect(text); expect(r).toMatchObject({ ok: false, stage: 'parse', reason });
    expect(r.operations.copyAttempts).toBe(1); expect(r.operations.copiesRetired).toBe(1);
    expect(r.treeReferences).toBe(0); expect(r.counts.retiredNodes).toBe(r.counts.valueNodes);
  });
  it.each(['[]\n', 'null\n', '1\n', '"x"\n'])('rejects nonobject root %s before allocating tree nodes', text => {
    expect(inspect(text)).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_syntax', counts: { valueNodes: 0, tokens: 0 } });
  });
  it.each([[' {}\n', 'parse', 'raw_profile'], ['\ufeff{}\n', 'parse', 'raw_profile'], ['{ }\n', 'parse', 'raw_profile'],
    ['{"a":"\\u0061"}\n', 'parse', 'raw_profile'], ['{"a":"\\\\"}\n', 'parse', 'raw_profile'], ['{"a":"é"}\n', 'parse', 'raw_profile'],
    ['{"a":"\t"}\n', 'parse', 'raw_profile'], ['{"a":1}\t\n', 'frame', 'raw_frame']])('rejects disallowed wire profile or suffix %s at %s with %s', (text, stage, reason) => {
    expect(inspect(text)).toMatchObject({ ok: false, stage, reason });
  });
  it('keeps byte class ahead of a token cap when no token starts, and a node reservation ahead of value classification', () => {
    expect(inspect('{ }\n', { ...limits(), max_tokens: 1 })).toMatchObject({ ok: false, reason: 'raw_profile', counts: { tokens: 1, valueNodes: 1 } });
    expect(inspect('{"a": 1}\n', { ...limits(), max_value_nodes: 1 })).toMatchObject({ ok: false, reason: 'raw_profile', counts: { tokens: 3, valueNodes: 1 } });
    expect(inspect('{"a":x}\n', { ...limits(), max_value_nodes: 1 })).toMatchObject({ ok: false, reason: 'raw_limit', counts: { tokens: 3, valueNodes: 1 } });
    expect(inspect('{"a":x}\n', { ...limits(), max_tokens: 3 })).toMatchObject({ ok: false, reason: 'raw_syntax', counts: { tokens: 3, valueNodes: 2 } });
  });
  it.each(['{}', '{}\r\n', '{}\n\n', '{} \n', '{}{}\n', '{}\n{}\n'])('rejects framing after valid root %s', text => {
    expect(inspect(text)).toMatchObject({ ok: false, stage: 'frame', reason: 'raw_frame' });
  });
  it('does not let suffix framing replace an earlier syntax or duplicate-key error', () => {
    expect(inspect('{"a":}\r\n')).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_syntax' });
    expect(inspect('{"a":0,"a":}\r\n')).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_duplicate_key' });
  });
  it('preserves UTF-8 priority and never begins syntax work on invalid bytes', () => {
    expect(inspectCheckpointSyntax(new Uint8Array([123, 97, 125, 10, 255]), limits())).toMatchObject({ ok: false, stage: 'utf8', reason: 'raw_utf8',
      counts: { tokens: 0, valueNodes: 0 }, work: { lexical: 0 } });
  });
  it.each(['{"a":0,"a":1}\n', '{"a":{"b":0,"b":1}}\n', '{"a":[{"b":0,"b":1}]}\n',
    '{"a":{"b":{"c":{"d":0,"d":1}}}}\n'])('refuses duplicate keys at each supported depth %s', text => {
    expect(inspect(text)).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_duplicate_key' });
  });
  it('allows the same key in separate objects and handles prototype-like keys as data', () => {
    expect(inspect('{"a":{"a":0},"b":[{"a":1},{"a":2}]}\n').ok).toBe(true);
    expect(inspect('{"__proto__":{"__rpb_canary":true},"constructor":0,"toString":1}\n').ok).toBe(true);
    expect(Object.prototype).not.toHaveProperty('__rpb_canary');
    expect(inspect('{"__proto__":0,"__proto__":1}\n')).toMatchObject({ ok: false, reason: 'raw_duplicate_key' });
  });
  it('refuses escaped aliases as profile rather than decoding them into keys', () => {
    expect(inspect('{"a":0,"\\u0061":1}\n')).toMatchObject({ ok: false, reason: 'raw_profile' });
  });
});

describe('canonical numeric tokens without value-core connection', () => {
  it.each(['-0', '-1', '-0.25', '+1', '01', '00', '1.', '1e', '1e+', '1e-', '1.0', '1e0', '1E-7', '1e-07',
    '1e+0', '0.0', '1e309', '1e-999', '9007199254740992', '9007199254740993', '0.10000000000000001', '1.2345678901234567e-7'])('rejects numeric candidate %s as raw_number', token => {
    const r = inspect('{"n":' + token + '}\n');
    expect(r).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_number' });
    expect(r.counts.numericTokens).toBe(0);
  });
  it('treats a leading dot as a value-start syntax error, not as a numeric candidate', () => {
    expect(inspect('{"n":.1}\n')).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_syntax', counts: { numericTokens: 0 }, work: { numeric: 0 } });
  });
  it.each(['0', '1', '0.25', '0.000001', '1e-7', '5e-324', '1.2345678901234566e-7', '9007199254740991'])('accepts canonical primitive %s but returns no value', token => {
    expect(Number(token).toString()).toBe(token);
    const r = inspect('{"n":' + token + '}\n');
    expect(r).toMatchObject({ ok: true, kind: 'non_executable_json_syntax', syntax: 'checked', valueStatus: 'unchecked', counts: { numericTokens: 1, valueNodes: 2 } });
    expect(r).not.toHaveProperty('value');
  });
  it('rejects a 33rd numeric byte before conversion, not by rounding a prefix', () => {
    const word32 = '0.' + '0'.repeat(29) + '1'; expect(word32.length).toBe(32);
    expect(inspect('{"n":' + word32 + '}\n')).toMatchObject({ ok: false, reason: 'raw_number' });
    expect(inspect('{"n":' + word32 + '1}\n')).toMatchObject({ ok: false, reason: 'raw_limit', work: { numeric: 0 } });
  });
  it('enforces an explicitly smaller numeric scratch cap before conversion', () => {
    expect(inspect('{"n":1234}\n', { ...limits(), max_token_scratch_bytes: 3 })).toMatchObject({ ok: false, reason: 'raw_limit', work: { numeric: 0 } });
  });
});

describe('structural caps and schema-path limits', () => {
  it('checks node/AST and token exact boundaries independently', () => {
    // { "a" : [ true , false , null ] } => V=5, T=11; keys are tokens, not nodes.
    const text = '{"a":[true,false,null]}\n';
    expect(inspect(text, { ...limits(), max_value_nodes: 5, max_ast_nodes: 5, max_tokens: 11 })).toMatchObject({ ok: true, counts: { valueNodes: 5, tokens: 11 } });
    for (const cap of [{ max_value_nodes: 4 }, { max_ast_nodes: 4 }, { max_tokens: 10 }])
      expect(inspect(text, { ...limits(), ...cap })).toMatchObject({ ok: false, reason: 'raw_limit' });
  });
  it('keeps field hard cap at 10 and refuses an 11th key before its value', () => {
    const ten = Array.from({ length: 10 }, (_, i) => '"k' + i + '":0').join(',');
    expect(inspect('{' + ten + '}\n').ok).toBe(true);
    expect(inspect('{' + ten + ',"extra":not_json}\n')).toMatchObject({ ok: false, reason: 'raw_limit', counts: { objectFields: 10, valueNodes: 11 } });
  });
  it('checks maximum depth 5 even when a larger declared depth is supplied', () => {
    expect(inspect('{"a":[[[[]]]]}\n').ok).toBe(true);
    expect(inspect('{"a":[[[[[]]]]]}\n', { ...limits(), max_depth: 100 })).toMatchObject({ ok: false, reason: 'raw_limit' });
    expect(inspect('{"a":[]}\n', { ...limits(), max_depth: 1 })).toMatchObject({ ok: false, reason: 'raw_limit' });
  });
  it('checks 64/65 bytes for keys and strings including quote scratch', () => {
    for (const text of ['{"' + 'x'.repeat(64) + '":0}\n', '{"a":"' + 'x'.repeat(64) + '"}\n']) expect(inspect(text).ok).toBe(true);
    for (const text of ['{"' + 'x'.repeat(65) + '":0}\n', '{"a":"' + 'x'.repeat(65) + '"}\n']) expect(inspect(text)).toMatchObject({ ok: false, reason: 'raw_limit' });
    expect(inspect('{"a":0}\n', { ...limits(), max_token_scratch_bytes: 2 })).toMatchObject({ ok: false, reason: 'raw_limit' });
  });
  const paths = [
    ['modules', 1000], ['cases', 20000], ['events', 20000], ['samples', 600], ['scopes', 10], ['workers', 20], ['scope_tails', 10],
  ] as const;
  it.each(paths)('checks %s at its fixed path, including equality and next-item refusal', (key, cap) => {
    const prefix = key === 'scope_tails' ? '{"snapshot":{"cutoff":{"scope_tails":[' : '{"snapshot":{"' + key + '":[';
    const suffix = key === 'scope_tails' ? ']}}}\n' : ']}}\n';
    const values = Array.from({ length: cap }, () => '0').join(',');
    expect(inspect(prefix + values + suffix).ok).toBe(true);
    const r = inspect(prefix + values + ',not_json' + suffix);
    expect(r).toMatchObject({ ok: false, reason: 'raw_limit', counts: { arrayItems: cap } });
  });
  it('does not confuse a matching suffix with the fixed root path or reset the unknown-array cap', () => {
    const cap = { ...limits(), max_scopes: 1, max_array_items: 2 };
    expect(inspect('{"a":{"snapshot":{"scopes":[0,1]}}}\n', cap).ok).toBe(true);
    expect(inspect('{"snapshot":{"scopes":[0,1]}}\n', cap)).toMatchObject({ ok: false, reason: 'raw_limit' });
    expect(inspect('{"unknown":[[],[],not_json]}\n', cap)).toMatchObject({ ok: false, reason: 'raw_limit', counts: { arrayItems: 2 } });
  });
  it('keeps the 64-byte string and 32-byte number ceilings when the declared scratch is larger', () => {
    const wide = { ...limits(), max_token_scratch_bytes: 1000 };
    for (const text of ['{"' + 'x'.repeat(64) + '":0}\n', '{"a":"' + 'x'.repeat(64) + '"}\n']) expect(inspect(text, wide).ok).toBe(true);
    for (const text of ['{"' + 'x'.repeat(65) + '":0}\n', '{"a":"' + 'x'.repeat(65) + '"}\n']) expect(inspect(text, wide)).toMatchObject({ ok: false, reason: 'raw_limit' });
    expect(inspect('{"n":' + '1'.repeat(33) + '}\n', wide)).toMatchObject({ ok: false, reason: 'raw_limit', work: { numeric: 0 } });
  });
  it('charges both quotes of an empty string against the scratch', () => {
    expect(inspect('{"":0}\n', { ...limits(), max_token_scratch_bytes: 2 }).ok).toBe(true);
    expect(inspect('{"":0}\n', { ...limits(), max_token_scratch_bytes: 1 })).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_limit', counts: { tokens: 2 } });
  });
  it.each(paths)('applies a smaller global array cap at the fixed %s path', key => {
    const text = key === 'scope_tails' ? '{"snapshot":{"cutoff":{"scope_tails":[0,1]}}}\n' : '{"snapshot":{"' + key + '":[0,1]}}\n';
    expect(inspect(text, { ...limits(), max_array_items: 2 }).ok).toBe(true);
    expect(inspect(text, { ...limits(), max_array_items: 1 })).toMatchObject({ ok: false, reason: 'raw_limit', counts: { arrayItems: 1 } });
  });
  it.each(['{"a":{"scope_tails":[0,1]}}\n', '{"cutoff":{"scope_tails":[0,1]}}\n', '{"snapshot":{"scope_tails":[0,1]}}\n', '{"scopes":[0,1]}\n'])('does not apply the scope cap to the off-path array in %s', text => {
    expect(inspect(text, { ...limits(), max_scopes: 1, max_array_items: 2 }).ok).toBe(true);
  });
  it('returns the children of a known array to the unknown path', () => {
    const cap = { ...limits(), max_scopes: 1, max_array_items: 2 };
    expect(inspect('{"snapshot":{"scopes":[[0,1]]}}\n', cap).ok).toBe(true);
    expect(inspect('{"snapshot":{"scopes":[[0,1,2]]}}\n', cap)).toMatchObject({ ok: false, reason: 'raw_limit' });
  });
  it('does not activate core max_nodes, live-copy or value limits in the syntax-only stage', () => {
    expect(inspect('{"not_a_checkpoint":[0,1]}\n', { ...limits(), max_nodes: 1, max_live_value_nodes: 1, max_value_work: 1 })).toMatchObject({ ok: true, valueStatus: 'unchecked' });
  });
});

interface Oracle { valueNodes: number; tokens: number; objectFields: number; arrayItems: number; containers: number; maxDepth: number; numericTokens: number }
function oracle(v: unknown, depth = 1): Oracle {
  const isContainer = v !== null && typeof v === 'object';
  const out: Oracle = { valueNodes: 1, tokens: isContainer ? 2 : 1, objectFields: 0, arrayItems: 0, containers: isContainer ? 1 : 0, maxDepth: isContainer ? depth : 0, numericTokens: typeof v === 'number' ? 1 : 0 };
  if (isContainer) {
    const rows = Object.values(v); out.tokens += Math.max(0, rows.length - 1);
    if (Array.isArray(v)) out.arrayItems += rows.length;
    else { out.objectFields += rows.length; out.tokens += rows.length * 2; }
    for (const row of rows) {
      const sub = oracle(row, depth + 1);
      for (const k of ['valueNodes', 'tokens', 'objectFields', 'arrayItems', 'containers', 'numericTokens'] as const) out[k] += sub[k];
      out.maxDepth = Math.max(out.maxDepth, sub.maxDepth);
    }
  }
  return out;
}
describe('independent structure oracle, work and closed ownership', () => {
  it('matches a separate 110-unit oracle for the empty syntax tree without changing RP-A', () => {
    expect(inspect('{}\n')).toMatchObject({ ok: true, work: { plan: 64, input: 20, arithmetic: 2, copy: 4, utf8: 3,
      lexical: 5, tokenStarts: 2, nodeReservations: 1, nodeCleanup: 1, path: 1, states: 2, stack: 2, frame: 2, cleanup: 1, total: 110 },
      counts: { tokens: 2, valueNodes: 1, containers: 1, maxDepth: 1, retiredNodes: 1 } });
    expect(inspect('{}\n', { ...limits(), max_parse_work: 110 }).ok).toBe(true);
    expect(inspect('{}\n', { ...limits(), max_parse_work: 109 })).toMatchObject({ ok: false, stage: 'frame', reason: 'raw_work' });
  });
  it('matches a hand-counted 312-unit breakdown for a non-empty tree', () => {
    // N=33. keys ab, ac, e; numbers 0.5, 1; string x; literal null; one nested array. Every unit below was counted by hand.
    const text = '{"ab":0.5,"ac":[1,"x"],"e":null}\n';
    const work = { plan: 64, input: 20, arithmetic: 2, copy: 34, utf8: 33, cleanup: 1,
      lexical: 57, tokenStarts: 17, nodeReservations: 6, nodeCleanup: 6, fields: 3, items: 2, insertion: 5,
      keyComparison: 5, tokenCopy: 10, numeric: 16, path: 8, states: 17, stack: 4, frame: 2 };
    expect(Object.values(work).reduce((sum, n) => sum + n, 0)).toBe(312);
    expect(inspect(text)).toMatchObject({ ok: true, work: { ...work, total: 312 },
      counts: { tokens: 17, valueNodes: 6, objectFields: 3, arrayItems: 2, containers: 2, maxDepth: 2, numericTokens: 2, retiredNodes: 6 } });
    expect(inspect(text, { ...limits(), max_parse_work: 312 }).ok).toBe(true);
    expect(inspect(text, { ...limits(), max_parse_work: 311 })).toMatchObject({ ok: false, stage: 'frame', reason: 'raw_work' });
  });
  it('accepts ten manually assembled wire variants as syntax only', () => {
    const binding = '"binding":{"source_digest":"' + 'a'.repeat(64) + '","inventory_digest":"' + 'b'.repeat(64) + '"}';
    const body = '{"version":"wfb-observation-snapshot-1","generation":1,"cutoff":{"source_event_ordinal":0,"scope_tails":[],"sample_count":0},"coverage":{"prefix":"complete","run":"incomplete","first_reason":"none"},"modules":[],"cases":[],"scopes":[],"events":[],"workers":[],"samples":[]}';
    const details = [
      ['conditions_ready', '{"conditions_digest":"' + 'c'.repeat(64) + '","approval_revision":1,"gates":{"offline_checked":true,"approval_bound":true,"scope_locked":true}}'],
      ['child_started', '{"lease_ordinal":1,"startup":"ready_wait"}'],
      ['first_anomaly', '{"kind":"collector","case_ordinal":null,"module_ordinal":null,"scope_ordinal":null,"reason":"collector_failure"}'],
      ['slow_hint', '{"threshold_ms":120000,"elapsed_ms":120001}'],
      ['test_terminal', '{"test_result":"incomplete","measurement":"incomplete"}'],
      ['stop_requested', '{"cause":"outer_deadline","stop_reason":"deadline","cleanup_state":"requested"}'],
    ];
    let variants = 0;
    for (const [trigger, detail] of details) {
      const common = '{"version":"wfb-checkpoint-2","sequence":1,"trigger":"' + trigger + '","at":0,' + binding + ',"detail":' + detail;
      const suffixes = ['conditions_ready', 'child_started'].includes(trigger) ? ['}\n']
        : [',"snapshot_status":"captured","snapshot":' + body + '}\n', ',"snapshot_status":"unavailable","snapshot":null,"snapshot_reason":"source_unavailable"}\n'];
      for (const suffix of suffixes) {
        variants++; const text = common + suffix, expected = oracle(JSON.parse(text)), r = inspect(text);
        expect(r).toMatchObject({ ok: true, valueStatus: 'unchecked', counts: expected });
        if (trigger === 'first_anomaly' && suffix.includes('"captured"')) expect(r.counts.valueNodes).toBe(32);
      }
    }
    expect(variants).toBe(10);
  });
  it('counts normal golden syntax without using parser output to construct its oracle', () => {
    const golden = '{"a":[true,false,null],"b":{"c":"x y","d":0.25}}\n';
    const expected = oracle(JSON.parse(golden)); const r = inspect(golden);
    expect(r).toMatchObject({ ok: true, counts: { ...expected, retiredNodes: expected.valueNodes } });
    expect(expected.tokens).toBeLessThanOrEqual(5 * expected.valueNodes);
  });
  it('matches deterministic bounded generated values against a separate tree-count oracle', () => {
    for (let i = 0; i < 80; i++) {
      const tree = { a: Array.from({ length: i % 7 }, (_, k) => ({ n: i + k / 4, s: 'a'.repeat(k), b: k % 2 === 0 })), b: { x: null, y: [true, false] } };
      const text = JSON.stringify(tree) + '\n', expected = oracle(tree), r = inspect(text);
      expect(r).toMatchObject({ ok: true, counts: { ...expected, retiredNodes: expected.valueNodes } });
      expect(r.counts.tokens).toBeLessThanOrEqual(5 * r.counts.valueNodes);
    }
  });
  it('accounts for all work, never borrows the value reserve, and retires every partial tree', () => {
    const text = '{"a":0,"bb":[1,true],"c":{"bb":null}}\n', success = inspect(text); if (!success.ok) throw Error('fixture');
    expect(success.work.total).toBe(Object.entries(success.work).reduce((sum, [k, v]) => sum + (k === 'total' ? 0 : v), 0));
    expect(inspect(text, { ...limits(), max_parse_work: success.work.total }).ok).toBe(true);
    for (let cap = 1; cap < success.work.total; cap++) {
      const r = inspect(text, { ...limits(), max_parse_work: cap });
      expect(r).toMatchObject({ ok: false, reason: 'raw_work', treeReferences: 0, operations: { ownedReferences: 0 } });
      expect(r.work.total).toBeLessThanOrEqual(cap); expect(r.counts.retiredNodes).toBe(r.counts.valueNodes);
      expect(r.operations.copiesRetired).toBe(r.operations.copyCompleted);
    }
  });
  it('retains no bytes, AST, scalar values, canary keys or executable continuation on either outcome', () => {
    for (const text of ['{"PRIVATE_CANARY":[0,1]}\n', '{"PRIVATE_CANARY":0,"PRIVATE_CANARY":not_json}\n']) {
      const input = bytes(text), r = inspectCheckpointSyntax(input, limits()); input.fill(255);
      expect(JSON.stringify(r)).not.toContain('PRIVATE_CANARY'); expect(r).not.toHaveProperty('value'); expect(r).not.toHaveProperty('bytes');
      expect(r).not.toHaveProperty('root'); expect(r).not.toHaveProperty('continuation');
      expect(Object.isFrozen(r)).toBe(true); expect(Object.isFrozen(r.work)).toBe(true); expect(Object.isFrozen(r.counts)).toBe(true);
      expect(r.counts.retiredNodes).toBe(r.counts.valueNodes); expect(r.treeReferences).toBe(0);
    }
  });
  it('reuses intrinsic hook-free one-copy admission in the syntax route', () => {
    const buffer = new ArrayBuffer(30), view = new Uint8Array(buffer, 4, 8); view.set(bytes('{"a":0}\n'));
    let calls = 0;
    for (const object of [buffer, view]) for (const key of ['constructor', 'length', 'byteLength', 'buffer', 'slice', 'set', Symbol.iterator]) Object.defineProperty(object, key, { get() { calls++; throw Error('PRIVATE'); } });
    expect(inspectCheckpointSyntax(view, limits())).toMatchObject({ ok: true, operations: { copyAttempts: 1, copyCompleted: 1, copiesRetired: 1 } });
    expect(calls).toBe(0);
  });
  it('keeps the value core, runtime and distribution disconnected', () => {
    const read = (p: string) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
    const core = read('tests/review/fixtures/raw-json-boundary.ts');
    expect(core.match(/^import .*$/gm)).toEqual(["import { types } from 'node:util';"]);
    expect(core).not.toMatch(/\b(?:JSON\.parse|TextDecoder|validateCheckpointValue|fetch|writeFile|setTimeout|issueReceipt|saveAttempt)\s*\(/);
    expect(JSON.parse(read('tsconfig.json')).exclude).toContain('tests');
    expect(JSON.parse(read('package.json')).files).not.toContain('tests/');
  });
});
