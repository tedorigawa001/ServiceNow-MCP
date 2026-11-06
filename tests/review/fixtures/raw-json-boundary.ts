/** Development-only RP-A/RP-B. No value-core acceptance, issuer, recorder or Store connection. */
import { types } from 'node:util';

const limitKeys = ['max_input_bytes', 'max_input_buffer_bytes', 'max_input_live_bytes', 'max_depth',
  'max_tokens', 'max_value_nodes', 'max_array_items', 'max_parse_work', 'max_value_work', 'max_total_work',
  'max_token_scratch_bytes', 'max_ast_nodes', 'max_live_value_nodes', 'max_scopes', 'max_workers',
  'max_nodes', 'max_snapshot_bytes', 'max_control_bytes', 'max_file_bytes'] as const;
export type RawLimits = Readonly<Record<(typeof limitKeys)[number], number>>;
export type RawStage = 'plan' | 'input' | 'copy' | 'utf8' | 'parse' | 'frame';
export type RawReason = 'raw_limits' | 'raw_input' | 'raw_limit' | 'raw_work' | 'raw_overflow'
  | 'raw_utf8' | 'raw_profile' | 'raw_syntax' | 'raw_frame' | 'raw_internal' | 'raw_duplicate_key' | 'raw_number';
export interface RawWork {
  readonly plan: number; readonly input: number; readonly arithmetic: number; readonly copy: number;
  readonly utf8: number; readonly frame: number; readonly stack: number; readonly cleanup: number; readonly total: number;
}
export interface RawOperations {
  readonly copyAttempts: number; readonly copyCompleted: number; readonly copiesRetired: number; readonly ownedReferences: 0;
}
export type RawBoundaryResult = ({ readonly ok: true; readonly kind: 'non_executable_raw_boundary'; readonly syntax: 'unchecked' }
  | { readonly ok: false; readonly stage: RawStage; readonly reason: RawReason }) & {
    readonly model: 'wfb-raw-boundary-rpa-1'; readonly work: RawWork; readonly operations: RawOperations;
  };
export interface SyntaxWork extends RawWork {
  readonly lexical: number; readonly tokenStarts: number; readonly nodeReservations: number;
  readonly fields: number; readonly items: number; readonly insertion: number; readonly keyComparison: number;
  readonly tokenCopy: number; readonly numeric: number; readonly path: number; readonly states: number; readonly nodeCleanup: number;
}
export interface SyntaxCounts {
  readonly tokens: number; readonly valueNodes: number; readonly objectFields: number; readonly arrayItems: number;
  readonly containers: number; readonly maxDepth: number; readonly numericTokens: number; readonly retiredNodes: number;
}
export type RawSyntaxResult = ({ readonly ok: true; readonly kind: 'non_executable_json_syntax'; readonly syntax: 'checked'; readonly valueStatus: 'unchecked' }
  | { readonly ok: false; readonly stage: RawStage; readonly reason: RawReason }) & {
    readonly model: 'wfb-raw-syntax-rpb-1'; readonly work: SyntaxWork; readonly operations: RawOperations;
    readonly counts: SyntaxCounts; readonly treeReferences: 0;
  };
const MAX = Number.MAX_SAFE_INTEGER;
const ByteArray = Uint8Array;
const arrayBufferPrototype = ArrayBuffer.prototype;
const typedPrototype = Object.getPrototypeOf(ByteArray.prototype) as object;
const bufferOf = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const lengthOf = Object.getOwnPropertyDescriptor(typedPrototype, 'byteLength')!.get!;
const offsetOf = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset')!.get!;
const bufferLengthOf = Object.getOwnPropertyDescriptor(arrayBufferPrototype, 'byteLength')!.get!;
const resizableOf = Object.getOwnPropertyDescriptor(arrayBufferPrototype, 'resizable')?.get;
const copyInto = ByteArray.prototype.set;
class Rejected extends Error { constructor(readonly reason: RawReason, readonly stage?: RawStage) { super('raw_boundary_rejected'); } }
function reject(reason: RawReason, stage?: RawStage): never { throw new Rejected(reason, stage); }
function positive(v: unknown): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v > 0; }
function readLimits(input: unknown): RawLimits {
  if (!input || typeof input !== 'object' || types.isProxy(input)) reject('raw_limits');
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) reject('raw_limits');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== limitKeys.length) reject('raw_limits');
  const out = Object.create(null) as Record<string, number>;
  for (let i = 0; i < limitKeys.length; i++) {
    const key = limitKeys[i], descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (keys[i] !== key || !descriptor || !descriptor.enumerable || !('value' in descriptor) || !positive(descriptor.value)) reject('raw_limits');
    out[key] = descriptor.value;
  }
  return Object.freeze(out) as RawLimits;
}
class Meter {
  readonly work = { plan: 0, input: 0, arithmetic: 0, copy: 0, utf8: 0, frame: 0, stack: 0, cleanup: 0, total: 0 };
  constructor(readonly limits: RawLimits) {}
  charge(kind: Exclude<keyof RawWork, 'total'>, n = 1): void {
    this.spend(n); this.work[kind] += n;
  }
  protected spend(n: number): void {
    if (!Number.isSafeInteger(n) || n < 0 || n > this.limits.max_parse_work - this.work.total) reject('raw_work');
    this.work.total += n;
  }
  add(a: number, b: number): number { this.charge('arithmetic'); if (b > MAX - a) reject('raw_overflow'); return a + b; }
}
const emptySyntaxWork = () => ({ lexical: 0, tokenStarts: 0, nodeReservations: 0, fields: 0, items: 0, insertion: 0,
  keyComparison: 0, tokenCopy: 0, numeric: 0, path: 0, states: 0, nodeCleanup: 0 });
const emptySyntaxCounts = () => ({ tokens: 0, valueNodes: 0, objectFields: 0, arrayItems: 0, containers: 0, maxDepth: 0, numericTokens: 0, retiredNodes: 0 });
class SyntaxMeter extends Meter {
  readonly extra = emptySyntaxWork();
  count(kind: keyof ReturnType<typeof emptySyntaxWork>, n = 1): void { this.spend(n); this.extra[kind] += n; }
}
function metadata(value: unknown, meter: Meter) {
  meter.charge('input', 10);
  if (!value || typeof value !== 'object' || types.isProxy(value) || Object.getPrototypeOf(value) !== ByteArray.prototype) reject('raw_input');
  try {
    const buffer: unknown = bufferOf.call(value);
    if (!buffer || Object.getPrototypeOf(buffer) !== arrayBufferPrototype || !resizableOf || resizableOf.call(buffer) !== false) reject('raw_input');
    const length = lengthOf.call(value) as number, offset = offsetOf.call(value) as number, backing = bufferLengthOf.call(buffer) as number;
    if (!positive(length) || !Number.isSafeInteger(offset) || offset < 0 || length > backing - offset) reject('raw_input');
    return { view: value as Uint8Array, buffer, length, offset, backing };
  } catch (error) { if (error instanceof Rejected) throw error; reject('raw_input'); }
}
function utf8Prepass(owned: Uint8Array, meter: Meter): void {
  let position = 0;
  const take = () => { meter.charge('utf8'); if (position >= owned.length) reject('raw_utf8'); return owned[position++]; };
  const continuation = (low = 0x80, high = 0xbf) => { const b = take(); if (b < low || b > high) reject('raw_utf8'); };
  while (position < owned.length) {
    const b = take();
    if (b <= 0x7f) continue;
    if (b >= 0xc2 && b <= 0xdf) continuation();
    else if (b >= 0xe0 && b <= 0xef) { continuation(b === 0xe0 ? 0xa0 : 0x80, b === 0xed ? 0x9f : 0xbf); continuation(); }
    else if (b >= 0xf0 && b <= 0xf4) { continuation(b === 0xf0 ? 0x90 : 0x80, b === 0xf4 ? 0x8f : 0xbf); continuation(); continuation(); }
    else reject('raw_utf8');
  }
}
/** Only balances containers/quotes and checks the wire shell; never validates JSON tokens/fields. */
function frameBoundary(owned: Uint8Array, meter: Meter): void {
  const stack: number[] = [];
  let quoted = false, stringBytes = 0;
  const probe = (index: number, stage: RawStage) => {
    try { meter.charge('frame'); } catch (error) { if (error instanceof Rejected) reject(error.reason, stage); throw error; }
    return index < owned.length ? owned[index] : undefined;
  };
  for (let i = 0; i < owned.length; i++) {
    const b = probe(i, 'parse')!;
    if (b < 0x20 || b >= 0x7f || (!quoted && b === 0x20)) reject('raw_profile');
    if (i === 0 && b !== 0x7b) reject('raw_syntax');
    if (quoted) {
      if (b === 0x5c) reject('raw_profile');
      if (b === 0x22) quoted = false;
      else { if (stringBytes >= Math.min(64, meter.limits.max_token_scratch_bytes - 2)) reject('raw_limit'); stringBytes++; }
      continue;
    }
    if (b === 0x22) { if (meter.limits.max_token_scratch_bytes < 2) reject('raw_limit'); quoted = true; stringBytes = 0; continue; }
    if (b === 0x7b || b === 0x5b) {
      if (stack.length >= Math.min(5, meter.limits.max_depth)) reject('raw_limit');
      meter.charge('stack'); stack.push(b === 0x7b ? 0x7d : 0x5d);
    } else if (b === 0x7d || b === 0x5d) {
      meter.charge('stack'); if (stack.pop() !== b) reject('raw_syntax');
      if (stack.length === 0) {
        if (probe(i + 1, 'frame') !== 10 || probe(i + 2, 'frame') !== undefined) reject('raw_frame', 'frame');
        return;
      }
    }
  }
  probe(owned.length, 'parse'); reject('raw_syntax');
}
type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
interface JsonObject { [key: string]: JsonValue }
type Path = 'root' | 'snapshot' | 'cutoff' | 'modules' | 'cases' | 'events' | 'scopes' | 'workers' | 'samples' | 'tails' | 'unknown';
type ParseFrame = { kind: 'object'; node: JsonObject; keys: string[]; key: string; state: 0 | 1 | 2 | 3 | 4; path: Path }
  | { kind: 'array'; node: JsonValue[]; state: 0 | 1 | 4; path: Path };
const asciiChar = String.fromCharCode;
const numericValue = Number;
const numericText = Number.prototype.toString;
/** RP-B owns and drops the AST internally. No tree or continuation is supplied by a caller. */
class SyntaxParser {
  private position = 0;
  private readonly stack: ParseFrame[] = [];
  private root: JsonValue | undefined;
  constructor(private readonly owned: Uint8Array, private readonly meter: SyntaxMeter, private readonly counts: ReturnType<typeof emptySyntaxCounts>) {}
  private peek(space = false): number | undefined {
    this.meter.count('lexical'); const b = this.owned[this.position];
    if (b !== undefined && (b < 32 || b >= 127 || (!space && b === 32))) reject('raw_profile');
    return b;
  }
  private take(space = false): number {
    const b = this.peek(space); if (b === undefined) reject('raw_syntax'); this.position++; return b;
  }
  private token(): void {
    if (this.counts.tokens >= this.meter.limits.max_tokens) reject('raw_limit');
    this.meter.count('tokenStarts'); this.counts.tokens++;
  }
  private mark(expected: number): void { this.token(); if (this.take() !== expected) reject('raw_syntax'); }
  private string(): string {
    this.token(); if (this.meter.limits.max_token_scratch_bytes < 2) reject('raw_limit');
    if (this.take() !== 34) reject('raw_syntax');
    let text = '';
    for (;;) {
      const b = this.take(true); if (b === 34) return text;
      if (b === 92) reject('raw_profile');
      if (text.length >= Math.min(64, this.meter.limits.max_token_scratch_bytes - 2)) reject('raw_limit');
      this.meter.count('tokenCopy'); text += asciiChar(b);
    }
  }
  private number(): number {
    this.token(); let text = '';
    for (;;) {
      const b = this.peek();
      if (b === undefined || !((b >= 48 && b <= 57) || b === 101 || b === 69 || b === 43 || b === 45 || b === 46)) break;
      if (text.length >= Math.min(32, this.meter.limits.max_token_scratch_bytes)) reject('raw_limit');
      this.meter.count('tokenCopy'); text += asciiChar(b); this.position++;
    }
    this.meter.count('numeric', text.length + 1);
    if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(text)) reject('raw_number');
    this.meter.count('numeric'); const value = numericValue(text);
    if (!Number.isFinite(value) || value < 0 || Object.is(value, -0) || value > MAX) reject('raw_number');
    this.meter.count('numeric'); const canonical = numericText.call(value);
    this.meter.count('numeric'); if (text.length !== canonical.length) reject('raw_number');
    for (let i = 0; i < text.length; i++) { this.meter.count('numeric'); if (text.charCodeAt(i) !== canonical.charCodeAt(i)) reject('raw_number'); }
    this.counts.numericTokens++; return value;
  }
  private literal(word: string, value: null | boolean): null | boolean {
    this.token(); for (let i = 0; i < word.length; i++) if (this.take() !== word.charCodeAt(i)) reject('raw_syntax');
    return value;
  }
  private sameKey(a: string, b: string): boolean {
    this.meter.count('keyComparison'); if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { this.meter.count('keyComparison'); if (a.charCodeAt(i) !== b.charCodeAt(i)) return false; }
    return true;
  }
  private path(parent: ParseFrame | undefined): Path {
    this.meter.count('path');
    if (!parent) return 'root';
    if (parent.kind === 'array') return 'unknown';
    if (parent.path === 'root' && parent.key === 'snapshot') return 'snapshot';
    if (parent.path === 'snapshot') {
      switch (parent.key) {
        case 'cutoff': return 'cutoff'; case 'modules': return 'modules'; case 'cases': return 'cases'; case 'events': return 'events';
        case 'scopes': return 'scopes'; case 'workers': return 'workers'; case 'samples': return 'samples';
      }
    }
    if (parent.path === 'cutoff' && parent.key === 'scope_tails') return 'tails';
    return 'unknown';
  }
  private value(parent?: ParseFrame): void {
    const b = this.peek();
    if (this.counts.valueNodes >= Math.min(this.meter.limits.max_value_nodes, this.meter.limits.max_ast_nodes)) reject('raw_limit');
    this.meter.count('nodeReservations'); this.meter.count('nodeCleanup'); this.counts.valueNodes++;
    const path = this.path(parent);
    let value: JsonValue;
    let opened: ParseFrame | undefined;
    if (b === 123 || b === 91) {
      if (this.stack.length >= Math.min(5, this.meter.limits.max_depth)) reject('raw_limit');
      this.mark(b);
      if (b === 123) { value = Object.create(null) as JsonObject; opened = { kind: 'object', node: value, keys: [], key: '', state: 0, path }; }
      else { value = []; opened = { kind: 'array', node: value, state: 0, path }; }
      this.counts.containers++;
    } else if (b === 34) value = this.string();
    else if (b === 116) value = this.literal('true', true);
    else if (b === 102) value = this.literal('false', false);
    else if (b === 110) value = this.literal('null', null);
    else if (b !== undefined && ((b >= 48 && b <= 57) || b === 43 || b === 45)) value = this.number();
    else reject('raw_syntax');
    if (!parent) this.root = value;
    else {
      this.meter.count('insertion');
      if (parent.kind === 'array') parent.node.push(value);
      else Object.defineProperty(parent.node, parent.key, { value, enumerable: true, writable: true, configurable: true });
      parent.state = 4;
    }
    if (opened) {
      this.meter.charge('stack'); this.stack.push(opened);
      this.counts.maxDepth = Math.max(this.counts.maxDepth, this.stack.length);
    }
  }
  private close(expected: number): void { this.mark(expected); this.meter.charge('stack'); this.stack.pop(); }
  private arrayCap(path: Path): number {
    this.meter.count('path'); let cap = this.meter.limits.max_array_items;
    switch (path) {
      case 'modules': cap = Math.min(cap, 1000); break;
      case 'cases': case 'events': cap = Math.min(cap, 20000); break;
      case 'samples': cap = Math.min(cap, 600); break;
      case 'scopes': case 'tails': cap = Math.min(cap, this.meter.limits.max_scopes); break;
      case 'workers': cap = Math.min(cap, this.meter.limits.max_workers); break;
    }
    return cap;
  }
  private frame(): void {
    const probe = () => {
      try { this.meter.charge('frame'); } catch (error) { if (error instanceof Rejected) reject(error.reason, 'frame'); throw error; }
      return this.owned[this.position++];
    };
    if (probe() !== 10 || probe() !== undefined) reject('raw_frame', 'frame');
  }
  run(): void {
    try {
      if (this.peek() !== 123) reject('raw_syntax'); this.value();
      while (this.stack.length) {
        this.meter.count('states'); const f = this.stack[this.stack.length - 1], b = this.peek();
        if (f.kind === 'object') {
          if (f.state === 0 && b === 125) this.close(125);
          else if (f.state === 0 || f.state === 1) {
            if (b !== 34) reject('raw_syntax');
            if (f.keys.length >= 10) reject('raw_limit');
            f.key = this.string();
            for (const key of f.keys) if (this.sameKey(key, f.key)) reject('raw_duplicate_key');
            this.meter.count('fields'); f.keys.push(f.key); this.counts.objectFields++; f.state = 2;
          } else if (f.state === 2) { this.mark(58); f.state = 3; }
          else if (f.state === 3) this.value(f);
          else if (b === 125) this.close(125);
          else { this.mark(44); f.state = 1; }
        } else {
          if (f.state === 0 && b === 93) this.close(93);
          else if (f.state === 0 || f.state === 1) {
            if (f.node.length >= this.arrayCap(f.path)) reject('raw_limit');
            this.meter.count('items'); this.counts.arrayItems++; this.value(f);
          }
          else if (b === 93) this.close(93);
          else { this.mark(44); f.state = 1; }
        }
      }
      this.meter.count('states');
      if (!this.root || typeof this.root !== 'object' || Object.getPrototypeOf(this.root) !== null) reject('raw_internal');
      this.frame();
    } finally { this.root = undefined; this.stack.length = 0; this.counts.retiredNodes = this.counts.valueNodes; }
  }
}
function runBoundary(bytes: unknown, limits: unknown, syntax: boolean): RawBoundaryResult | RawSyntaxResult {
  let meter: Meter | undefined, stage: RawStage = 'plan';
  let owned: Uint8Array | undefined;
  const counts = emptySyntaxCounts();
  const operations = { copyAttempts: 0, copyCompleted: 0, copiesRetired: 0, ownedReferences: 0 as const };
  let outcome: { ok: true; kind: 'non_executable_raw_boundary'; syntax: 'unchecked' }
    | { ok: true; kind: 'non_executable_json_syntax'; syntax: 'checked'; valueStatus: 'unchecked' }
    | { ok: false; stage: RawStage; reason: RawReason };
  try {
    const plan = readLimits(limits); meter = syntax ? new SyntaxMeter(plan) : new Meter(plan); meter.charge('plan', 64);
    if (meter.add(plan.max_parse_work, plan.max_value_work) > plan.max_total_work) reject('raw_limits');
    stage = 'input'; const input = metadata(bytes, meter);
    const live = meter.add(input.backing, input.length);
    if (input.length > plan.max_input_bytes || input.backing > plan.max_input_buffer_bytes || live > plan.max_input_live_bytes) reject('raw_limit');
    stage = 'copy'; meter.charge('cleanup'); meter.charge('copy', input.length); meter.charge('copy');
    operations.copyAttempts++;
    try { owned = new ByteArray(input.length); copyInto.call(owned, input.view); operations.copyCompleted++; }
    catch { reject('raw_input'); }
    const after = metadata(bytes, meter);
    if (after.buffer !== input.buffer || after.offset !== input.offset || after.length !== input.length || after.backing !== input.backing) reject('raw_input');
    stage = 'utf8'; utf8Prepass(owned, meter);
    stage = 'parse';
    if (meter instanceof SyntaxMeter) {
      new SyntaxParser(owned, meter, counts).run();
      outcome = { ok: true, kind: 'non_executable_json_syntax', syntax: 'checked', valueStatus: 'unchecked' };
    } else { frameBoundary(owned, meter); outcome = { ok: true, kind: 'non_executable_raw_boundary', syntax: 'unchecked' }; }
  } catch (error) { outcome = { ok: false, stage: error instanceof Rejected ? error.stage ?? stage : stage,
    reason: error instanceof Rejected ? error.reason : 'raw_internal' }; }
  finally { if (owned !== undefined) { owned = undefined; operations.copiesRetired++; } }
  const work = meter ? { ...meter.work } : { plan: 0, input: 0, arithmetic: 0, copy: 0, utf8: 0, frame: 0, stack: 0, cleanup: 0, total: 0 };
  if (syntax) return Object.freeze({ ...outcome, model: 'wfb-raw-syntax-rpb-1',
    work: Object.freeze({ ...work, ...(meter instanceof SyntaxMeter ? meter.extra : emptySyntaxWork()) }),
    counts: Object.freeze(counts), treeReferences: 0, operations: Object.freeze(operations) }) as RawSyntaxResult;
  return Object.freeze({ ...outcome, model: 'wfb-raw-boundary-rpa-1', work: Object.freeze(work), operations: Object.freeze(operations) }) as RawBoundaryResult;
}
export function inspectCheckpointBoundary(bytes: unknown, limits: unknown): RawBoundaryResult { return runBoundary(bytes, limits, false) as RawBoundaryResult; }
export function inspectCheckpointSyntax(bytes: unknown, limits: unknown): RawSyntaxResult { return runBoundary(bytes, limits, true) as RawSyntaxResult; }
