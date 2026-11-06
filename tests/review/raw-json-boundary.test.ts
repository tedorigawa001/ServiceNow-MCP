import { describe, expect, it } from 'vitest';
import { inspectCheckpointBoundary } from './fixtures/raw-json-boundary.js';
import { readFileSync } from 'node:fs';

const limits = () => ({ max_input_bytes: 4096, max_input_buffer_bytes: 8192, max_input_live_bytes: 12288,
  max_depth: 5, max_tokens: 2000, max_value_nodes: 1000, max_array_items: 1000,
  max_parse_work: 100000, max_value_work: 20000, max_total_work: 120000,
  max_token_scratch_bytes: 66, max_ast_nodes: 1000, max_live_value_nodes: 2000,
  max_scopes: 100, max_workers: 1000, max_nodes: 10000, max_snapshot_bytes: 4096,
  max_control_bytes: 500, max_file_bytes: 4096 });
const bytes = (text: string) => new TextEncoder().encode(text);

describe('RP-A raw byte boundary, never parsed-value authority', () => {
  it('refuses the byte cap before any private copy', () => {
    expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), max_input_bytes: 2 })).toMatchObject({
      ok: false, stage: 'input', reason: 'raw_limit', operations: { copyAttempts: 0, copyCompleted: 0, copiesRetired: 0, ownedReferences: 0 },
    });
  });
  it('copies the visible range once without input hooks, then drops the owned reference', () => {
    const buffer = new ArrayBuffer(8), input = new Uint8Array(buffer, 2, 3); input.set(bytes('{}\n'));
    let calls = 0;
    for (const object of [input, buffer]) for (const key of ['constructor', 'length', 'byteLength', 'byteOffset', 'buffer', 'slice', 'set', Symbol.iterator])
      Object.defineProperty(object, key, { get() { calls++; throw Error('PRIVATE'); } });
    const result = inspectCheckpointBoundary(input, limits());
    expect(result).toMatchObject({ ok: true, kind: 'non_executable_raw_boundary', syntax: 'unchecked',
      operations: { copyAttempts: 1, copyCompleted: 1, copiesRetired: 1, ownedReferences: 0 } });
    expect(calls).toBe(0);
    expect(result).not.toHaveProperty('bytes'); expect(result).not.toHaveProperty('value');
  });
  it('rejects overlong UTF-8 before framing and retires the failed copy', () => {
    expect(inspectCheckpointBoundary(new Uint8Array([123, 0xc0, 0xaf, 125, 10]), limits())).toMatchObject({
      ok: false, stage: 'utf8', reason: 'raw_utf8', operations: { copyAttempts: 1, copyCompleted: 1, copiesRetired: 1, ownedReferences: 0 },
    });
  });
  it('rejects a second frame at the first root closure, not by suffix matching', () => {
    expect(inspectCheckpointBoundary(bytes('{}\n{}\n'), limits())).toMatchObject({ ok: false, stage: 'frame', reason: 'raw_frame',
      operations: { copyCompleted: 1, copiesRetired: 1, ownedReferences: 0 } });
  });
  it('includes both quotes in token scratch admission', () => {
    const input = bytes('{"a":0}\n');
    expect(inspectCheckpointBoundary(input, { ...limits(), max_token_scratch_bytes: 3 }).ok).toBe(true);
    expect(inspectCheckpointBoundary(input, { ...limits(), max_token_scratch_bytes: 2 })).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_limit' });
  });
});

describe('copy-before-admission limits and hook-free metadata', () => {
  it.each(Object.keys(limits()))('requires positive explicit %s', key => {
    for (const invalid of [0, -1, -0, NaN, Infinity, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
      expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), [key]: invalid })).toMatchObject({ ok: false, stage: 'plan', reason: 'raw_limits', operations: { copyAttempts: 0 } });
    const config = { ...limits() } as Record<string, unknown>; delete config[key];
    expect(inspectCheckpointBoundary(bytes('{}\n'), config)).toMatchObject({ ok: false, reason: 'raw_limits' });
  });
  it('rejects allocation sum overflow and inconsistent work before input/copy', () => {
    expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), max_parse_work: Number.MAX_SAFE_INTEGER, max_total_work: Number.MAX_SAFE_INTEGER })).toMatchObject({ ok: false, stage: 'plan', reason: 'raw_overflow', operations: { copyAttempts: 0 } });
    expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), max_total_work: 119999 })).toMatchObject({ ok: false, stage: 'plan', reason: 'raw_limits' });
  });
  it('rejects malicious limit records without executing getters or proxy traps', () => {
    let calls = 0;
    const getter = limits(); Object.defineProperty(getter, 'max_parse_work', { enumerable: true, get() { calls++; throw Error('PRIVATE'); } });
    const proxy = new Proxy(limits(), { ownKeys() { calls++; throw Error('PRIVATE'); }, getPrototypeOf() { calls++; throw Error('PRIVATE'); } });
    for (const config of [getter, proxy, { ...limits(), extra: 1 }, Object.assign(Object.create({ inherited: 1 }), limits()), null])
      expect(inspectCheckpointBoundary(bytes('{}\n'), config)).toMatchObject({ ok: false, stage: 'plan', reason: 'raw_limits', operations: { copyAttempts: 0 } });
    expect(calls).toBe(0);
  });
  it.each(['max_input_bytes', 'max_input_buffer_bytes', 'max_input_live_bytes'] as const)('enforces %s at equality and one below before copy', key => {
    const at = key === 'max_input_live_bytes' ? 6 : 3;
    expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), [key]: at }).ok).toBe(true);
    expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), [key]: at - 1 })).toMatchObject({ ok: false, stage: 'input', reason: 'raw_limit', operations: { copyAttempts: 0 } });
  });
  it('charges the whole backing buffer, not just the visible view', () => {
    const backing = new ArrayBuffer(100), view = new Uint8Array(backing, 40, 3); view.set(bytes('{}\n'));
    expect(inspectCheckpointBoundary(view, { ...limits(), max_input_buffer_bytes: 100, max_input_live_bytes: 103 }).ok).toBe(true);
    expect(inspectCheckpointBoundary(view, { ...limits(), max_input_live_bytes: 102 })).toMatchObject({ ok: false, reason: 'raw_limit', operations: { copyAttempts: 0 } });
  });
  it('rejects wrong brands, custom prototypes and revoked proxies without coercion', () => {
    let calls = 0;
    const hostile = { get byteLength() { calls++; throw Error('PRIVATE'); }, [Symbol.iterator]() { calls++; throw Error('PRIVATE'); }, toString() { calls++; throw Error('PRIVATE'); } };
    const revocable = Proxy.revocable(bytes('{}\n'), {}); revocable.revoke();
    class Subarray extends Uint8Array {}
    const inputs = [undefined, null, '{}\n', [123, 125, 10], hostile, revocable.proxy, Buffer.from('{}\n'),
      new Subarray(3), new Uint16Array(3), new DataView(new ArrayBuffer(3)), Object.create(Uint8Array.prototype),
      Object.setPrototypeOf(bytes('{}\n'), null), new Uint8Array(new SharedArrayBuffer(3))];
    for (const input of inputs) expect(inspectCheckpointBoundary(input, limits())).toMatchObject({ ok: false, stage: 'input', reason: 'raw_input', operations: { copyAttempts: 0 } });
    expect(calls).toBe(0);
  });
  it('rejects zero/detached and resizable fixed/tracking/out-of-bounds views', () => {
    const detached = bytes('{}\n'); structuredClone(detached.buffer, { transfer: [detached.buffer] });
    const Resizable = ArrayBuffer as unknown as { new(size: number, options: { maxByteLength: number }): ArrayBuffer & { resize(size: number): void } };
    const resizable = new Resizable(8, { maxByteLength: 16 });
    const fixed = new Uint8Array(resizable, 1, 3), tracking = new Uint8Array(resizable);
    for (const input of [new Uint8Array(0), detached, fixed, tracking])
      expect(inspectCheckpointBoundary(input, limits())).toMatchObject({ ok: false, stage: 'input', reason: 'raw_input', operations: { copyAttempts: 0 } });
    resizable.resize(0);
    expect(inspectCheckpointBoundary(fixed, limits())).toMatchObject({ ok: false, reason: 'raw_input', operations: { copyAttempts: 0 } });
  });
});

describe('independent UTF-8 and wire shell controls', () => {
  const malformed = [[0x80], [0xbf], [0xc0, 0x80], [0xc1, 0xbf], [0xc2], [0xc2, 0x7f], [0xdf, 0xc0],
    [0xe0, 0x9f, 0x80], [0xe0, 0xa0], [0xed, 0xa0, 0x80], [0xef, 0xbf], [0xf0, 0x8f, 0xbf, 0xbf],
    [0xf0, 0x90, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xf5, 0x80, 0x80, 0x80], [0xff], [0xfe]];
  it.each(malformed.map((row, i) => [i, row] as const))('rejects malformed sequence %s before parse, independently checked with fatal decoder', (_i, row) => {
    const input = new Uint8Array([123, 34, ...row, 34, 125, 10]);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(input)).toThrow();
    expect(inspectCheckpointBoundary(input, limits())).toMatchObject({ ok: false, stage: 'utf8', reason: 'raw_utf8', work: { frame: 0 }, operations: { copyCompleted: 1, copiesRetired: 1 } });
  });
  it.each([[0xc2], [0xe0], [0xe0, 0xa0], [0xef, 0xbf], [0xf0], [0xf0, 0x90], [0xf0, 0x90, 0x80], [0xf4, 0x8f, 0xbf]]
    .map((row, i) => [i, row] as const))('rejects actual EOF truncation %s with one bounded EOF probe', (_i, row) => {
    const input = new Uint8Array([123, 34, ...row]);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(input)).toThrow();
    expect(inspectCheckpointBoundary(input, limits())).toMatchObject({ ok: false, stage: 'utf8', reason: 'raw_utf8',
      work: { utf8: input.length + 1, frame: 0 }, operations: { copiesRetired: 1, ownedReferences: 0 } });
  });
  it.each([0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10ffff])('distinguishes valid UTF-8 U+%s from forbidden non-ASCII profile', code => {
    const input = bytes('{"a":"' + String.fromCodePoint(code) + '"}\n');
    expect(new TextDecoder('utf-8', { fatal: true }).decode(input)).toContain(String.fromCodePoint(code));
    expect(inspectCheckpointBoundary(input, limits())).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_profile', work: { utf8: input.length }, operations: { copiesRetired: 1 } });
  });
  it('classifies all 256 isolated byte values with an independent fatal decoder', () => {
    for (let b = 0; b < 256; b++) {
      const input = new Uint8Array([123, b, 125, 10]);
      let valid = true; try { new TextDecoder('utf-8', { fatal: true }).decode(input); } catch { valid = false; }
      const result = inspectCheckpointBoundary(input, limits());
      if (!valid) expect(result).toMatchObject({ ok: false, stage: 'utf8', reason: 'raw_utf8' });
      else expect(result.ok || result.stage !== 'utf8').toBe(true);
    }
  });
  const shellFailures: [string, string, string][] = [
    ['\ufeff{}\n', 'parse', 'raw_profile'], [' {}\n', 'parse', 'raw_profile'], ['\n', 'parse', 'raw_profile'],
    ['\r{}\n', 'parse', 'raw_profile'], ['{ }\n', 'parse', 'raw_profile'], ['{\n}\n', 'parse', 'raw_profile'],
    ['{\u0000}\n', 'parse', 'raw_profile'], ['{\u007f}\n', 'parse', 'raw_profile'],
    ['{"a":"\\u0061"}\n', 'parse', 'raw_profile'], ['{"a":"\t"}\n', 'parse', 'raw_profile'],
    ['[]\n', 'parse', 'raw_syntax'], ['1\n', 'parse', 'raw_syntax'], ['"a"\n', 'parse', 'raw_syntax'],
    ['null\n', 'parse', 'raw_syntax'], ['x\n', 'parse', 'raw_syntax'], ['{', 'parse', 'raw_syntax'],
    ['{"x":"unterminated', 'parse', 'raw_syntax'], ['{[}\n', 'parse', 'raw_syntax'],
    ['{}', 'frame', 'raw_frame'], ['{}\r\n', 'frame', 'raw_frame'], ['{} \n', 'frame', 'raw_frame'],
    ['{}\n\n', 'frame', 'raw_frame'], ['{}{}\n', 'frame', 'raw_frame'], ['{}\n1', 'frame', 'raw_frame'],
  ];
  it.each(shellFailures.map((x, i) => [i, ...x] as const))('rejects shell case %s with fixed stage/reason', (_i, text, stage, reason) => {
    expect(inspectCheckpointBoundary(bytes(text), limits())).toMatchObject({ ok: false, stage, reason, operations: { copiesRetired: 1, ownedReferences: 0 } });
  });
  it('balances only unquoted containers and never mistakes string braces for the root closure', () => {
    expect(inspectCheckpointBoundary(bytes('{"a":"}][{","b":[{}]}\n'), limits()).ok).toBe(true);
  });
  it('keeps UTF-8 precedence over earlier JSON/profile errors', () => {
    expect(inspectCheckpointBoundary(new Uint8Array([32, 123, 125, 10, 0xff]), limits())).toMatchObject({ ok: false, stage: 'utf8', reason: 'raw_utf8', work: { frame: 0 } });
  });
  it('does not claim JSON syntax, version, duplicate-key or value acceptance', () => {
    for (const text of ['{not_json}\n', '{"a":01}\n', '{"a":1,"a":2}\n', '{"version":"wfb-checkpoint-1"}\n'])
      expect(inspectCheckpointBoundary(bytes(text), { ...limits(), max_tokens: 1, max_value_nodes: 1, max_ast_nodes: 1 })).toMatchObject({ ok: true, kind: 'non_executable_raw_boundary', syntax: 'unchecked' });
  });
});

describe('bounded work and fixed reference discard', () => {
  it('matches an independent cost oracle for the smallest complete shell', () => {
    const r = inspectCheckpointBoundary(bytes('{}\n'), limits());
    expect(r).toMatchObject({ ok: true, work: { plan: 64, input: 20, arithmetic: 2, copy: 4, utf8: 3, frame: 4, stack: 2, cleanup: 1, total: 100 } });
    if (!r.ok) throw Error('fixture');
    expect(BigInt(r.work.total)).toBe(64n + 20n + 2n + 4n + 3n + 4n + 2n + 1n);
    expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), max_parse_work: 100 }).ok).toBe(true);
    expect(inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), max_parse_work: 99 })).toMatchObject({ ok: false, stage: 'frame', reason: 'raw_work', operations: { copiesRetired: 1 } });
  });
  it.each([1, 64, 65, 75, 76, 77, 80, 81, 90, 91, 93, 94, 95, 96, 97, 98, 99])('stops at parse budget %s without borrowing the value reserve', max_parse_work => {
    const r = inspectCheckpointBoundary(bytes('{}\n'), { ...limits(), max_parse_work });
    expect(r).toMatchObject({ ok: false, reason: 'raw_work', operations: { ownedReferences: 0 } });
    expect(r.work.total).toBeLessThanOrEqual(max_parse_work);
    expect(r.operations.copyAttempts).toBe(max_parse_work >= 81 ? 1 : 0);
    expect(r.operations.copiesRetired).toBe(r.operations.copyCompleted);
  });
  it('checks depth 5/6 and a smaller explicit depth', () => {
    expect(inspectCheckpointBoundary(bytes('{"a":[[[[]]]]}\n'), limits()).ok).toBe(true);
    expect(inspectCheckpointBoundary(bytes('{"a":[[[[[]]]]]}\n'), limits())).toMatchObject({ ok: false, stage: 'parse', reason: 'raw_limit' });
    expect(inspectCheckpointBoundary(bytes('{"a":[]}\n'), { ...limits(), max_depth: 1 })).toMatchObject({ ok: false, reason: 'raw_limit' });
  });
  it('checks 64/65-byte strings and counts quotes even for an empty string', () => {
    expect(inspectCheckpointBoundary(bytes('{"a":"' + 'a'.repeat(64) + '"}\n'), limits()).ok).toBe(true);
    expect(inspectCheckpointBoundary(bytes('{"a":"' + 'a'.repeat(65) + '"}\n'), limits())).toMatchObject({ ok: false, reason: 'raw_limit' });
    expect(inspectCheckpointBoundary(bytes('{"":0}\n'), { ...limits(), max_token_scratch_bytes: 1 })).toMatchObject({ ok: false, reason: 'raw_limit' });
  });
  it('retains no raw input on either outcome and freezes the returned finite metadata', () => {
    for (const input of [bytes('{}\n'), bytes('{"PRIVATE":\n}\n')]) {
      const r = inspectCheckpointBoundary(input, limits()); input.fill(255);
      expect(Object.isFrozen(r)).toBe(true); expect(Object.isFrozen(r.work)).toBe(true); expect(Object.isFrozen(r.operations)).toBe(true);
      expect(Object.keys(r)).not.toContain('bytes'); expect(Object.keys(r)).not.toContain('value');
      expect(JSON.stringify(r)).not.toContain('PRIVATE'); expect(r.operations.ownedReferences).toBe(0);
      expect(r.operations.copiesRetired).toBe(1);
    }
  });
  it('keeps the development boundary out of runtime dependencies and distribution roots', () => {
    const read = (p: string) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
    const config = JSON.parse(read('tsconfig.json')) as { include: string[]; exclude: string[] };
    const pkg = JSON.parse(read('package.json')) as { files: string[] };
    expect(config.include).toEqual(['src/**/*']); expect(config.exclude).toContain('tests'); expect(pkg.files).not.toContain('tests/');
    const core = read('tests/review/fixtures/raw-json-boundary.ts');
    expect(core.match(/^import .*$/gm)).toEqual(["import { types } from 'node:util';"]);
    expect(core).not.toMatch(/\b(?:JSON\.parse|TextDecoder|fetch|setTimeout|writeFile|issueReceipt|saveAttempt|validateCheckpointValue)\s*\(/);
  });
});
