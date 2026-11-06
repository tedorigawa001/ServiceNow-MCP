/** Development-only RP-A. No JSON value acceptance, issuer, recorder or Store connection. */
import { types } from 'node:util';

const limitKeys = ['max_input_bytes', 'max_input_buffer_bytes', 'max_input_live_bytes', 'max_depth',
  'max_tokens', 'max_value_nodes', 'max_array_items', 'max_parse_work', 'max_value_work', 'max_total_work',
  'max_token_scratch_bytes', 'max_ast_nodes', 'max_live_value_nodes', 'max_scopes', 'max_workers',
  'max_nodes', 'max_snapshot_bytes', 'max_control_bytes', 'max_file_bytes'] as const;
export type RawLimits = Readonly<Record<(typeof limitKeys)[number], number>>;
export type RawStage = 'plan' | 'input' | 'copy' | 'utf8' | 'parse' | 'frame';
export type RawReason = 'raw_limits' | 'raw_input' | 'raw_limit' | 'raw_work' | 'raw_overflow'
  | 'raw_utf8' | 'raw_profile' | 'raw_syntax' | 'raw_frame' | 'raw_internal';
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
    if (!Number.isSafeInteger(n) || n < 0 || n > this.limits.max_parse_work - this.work.total) reject('raw_work');
    this.work[kind] += n; this.work.total += n;
  }
  add(a: number, b: number): number { this.charge('arithmetic'); if (b > MAX - a) reject('raw_overflow'); return a + b; }
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
export function inspectCheckpointBoundary(bytes: unknown, limits: unknown): RawBoundaryResult {
  let meter: Meter | undefined, stage: RawStage = 'plan';
  let owned: Uint8Array | undefined;
  const operations = { copyAttempts: 0, copyCompleted: 0, copiesRetired: 0, ownedReferences: 0 as const };
  let outcome: { ok: true; kind: 'non_executable_raw_boundary'; syntax: 'unchecked' } | { ok: false; stage: RawStage; reason: RawReason };
  try {
    const plan = readLimits(limits); meter = new Meter(plan); meter.charge('plan', 64);
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
    stage = 'parse'; frameBoundary(owned, meter);
    outcome = { ok: true, kind: 'non_executable_raw_boundary', syntax: 'unchecked' };
  } catch (error) { outcome = { ok: false, stage: error instanceof Rejected ? error.stage ?? stage : stage,
    reason: error instanceof Rejected ? error.reason : 'raw_internal' }; }
  finally { if (owned !== undefined) { owned = undefined; operations.copiesRetired++; } }
  return Object.freeze({ ...outcome, model: 'wfb-raw-boundary-rpa-1',
    work: Object.freeze(meter ? { ...meter.work } : { plan: 0, input: 0, arithmetic: 0, copy: 0, utf8: 0, frame: 0, stack: 0, cleanup: 0, total: 0 }),
    operations: Object.freeze(operations) });
}
