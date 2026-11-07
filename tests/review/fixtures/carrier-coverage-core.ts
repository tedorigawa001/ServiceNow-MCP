/** Value-only development contract. No issuer, pool, budget, identity or runtime imports. */
import { types } from 'node:util';

type Reason = 'raw_limits' | 'raw_work' | 'raw_overflow' | 'raw_internal';
type CarrierFacts =
  | { readonly variant: 'C0'; readonly entry: 'not_acquired'; readonly seed: 'not_acquired'; readonly credit: 'none' }
  | { readonly variant: 'C1'; readonly entry: 'acquired'; readonly seed: 'not_acquired'; readonly credit: 'none' }
  | { readonly variant: 'C4'; readonly entry: 'acquired'; readonly seed: 'acquired'; readonly credit: 'logically_retired' }
  | { readonly variant: 'C5'; readonly entry: 'acquired'; readonly seed: 'acquired'; readonly credit: 'unconfirmed' }
  | { readonly variant: 'C6'; readonly entry: 'acquired'; readonly seed: 'not_acquired'; readonly credit: 'entry_unconfirmed' };
type Carrier = CarrierFacts & { readonly model: 'wfb-carrier-values-1'; readonly reason: Reason;
  readonly usage: 'unavailable'; readonly ready: false; readonly runtimeCoverage: 'unknown';
  readonly nativeCost: 'unknown'; readonly coreInvocation: 'not_called' };
type Result<T> = ({ readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: 'invalid_value' }) & {
  readonly authority: 'none'; readonly ready: false; readonly runtimeCoverage: 'unknown';
};
const closed = { authority: 'none', ready: false, runtimeCoverage: 'unknown' } as const;
function invalid(): never { throw new Error('invalid_value'); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value)) invalid();
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) invalid();
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length) invalid();
  const out = Object.create(null) as Record<string, unknown>;
  keys.forEach((key, i) => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (names[i] !== key || !d || !d.enumerable || !('value' in d)) invalid();
    out[key] = d.value;
  });
  return out;
}
function one(value: unknown, choices: readonly string[]): string {
  if (typeof value !== 'string' || !choices.includes(value)) invalid();
  return value;
}
function run<T>(inspect: () => T): Result<T> {
  try { return Object.freeze({ ok: true, value: inspect(), ...closed }); }
  catch { return Object.freeze({ ok: false, reason: 'invalid_value', ...closed }); }
}
const carrierKeys = ['model', 'variant', 'reason', 'entry', 'seed', 'credit', 'usage', 'ready', 'runtimeCoverage', 'nativeCost', 'coreInvocation'];
const states = [
  ['not_acquired', 'not_acquired', 'none'], ['acquired', 'not_acquired', 'none'],
  ['acquired', 'acquired', 'entry_pending'], ['acquired', 'acquired', 'target_active'],
  ['acquired', 'acquired', 'logically_retired'], ['acquired', 'acquired', 'unconfirmed'],
  ['acquired', 'not_acquired', 'entry_unconfirmed'],
] as const;
export function inspectCarrier(input: unknown): Result<Carrier> {
  return run(() => {
    const v = record(input, carrierKeys);
    const variant = one(v.variant, ['C0', 'C1', 'C4', 'C5', 'C6']);
    const s = states[Number(variant[1])];
    if (v.model !== 'wfb-carrier-values-1' || v.entry !== s[0] || v.seed !== s[1] || v.credit !== s[2]
      || v.usage !== 'unavailable' || v.ready !== false || v.runtimeCoverage !== 'unknown'
      || v.nativeCost !== 'unknown' || v.coreInvocation !== 'not_called') invalid();
    const reason = one(v.reason, ['raw_limits', 'raw_work', 'raw_overflow', 'raw_internal']) as Reason;
    return Object.freeze({ ...v, reason }) as Carrier;
  });
}

function list(input: unknown, max: number): unknown[] {
  if (!input || typeof input !== 'object' || types.isProxy(input) || !Array.isArray(input)
    || Object.getPrototypeOf(input) !== Array.prototype) invalid();
  const length = Object.getOwnPropertyDescriptor(input, 'length')?.value as unknown;
  if (typeof length !== 'number' || length > max) invalid();
  if (Reflect.ownKeys(input).length !== length + 1) invalid();
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, String(i));
    if (!d || !d.enumerable || !('value' in d)) invalid();
    out.push(d.value);
  }
  return out;
}
function subset(input: unknown, choices: readonly string[]): readonly string[] {
  let previous = -1;
  const out = list(input, choices.length).map(v => {
    const s = one(v, choices), position = choices.indexOf(s);
    if (position <= previous) invalid();
    previous = position;
    return s;
  });
  return Object.freeze(out);
}
type Phase = 'before_entry' | 'entry_prepare' | 'entry_terminal' | 'seed' | 'handoff';
type Producer = 'plan' | 'anchor' | 'entry' | 'carrier' | 'seed' | 'recipient' | 'credit';
type CostOwner = 'base_unknown' | 'k0_excluded' | 'entry_prepare' | 'entry_terminal' | 'seed' | 'split_unknown';
type CoverageRow = { readonly id: `SC${string}`; readonly slots: readonly string[];
  readonly paths: readonly string[]; readonly gaps: readonly string[] } & (
  { readonly status: 'unknown'; readonly sourceRevision: null; readonly symbol: null; readonly phase: 'unknown';
    readonly producer: 'unknown'; readonly costOwner: 'unknown'; readonly maxRepetitions: null;
    readonly diagnostic: 'unknown'; readonly verification: 'none' } |
  { readonly status: 'synthetic_only'; readonly sourceRevision: string; readonly symbol: string; readonly phase: Phase;
    readonly producer: Producer; readonly costOwner: CostOwner; readonly maxRepetitions: number;
    readonly diagnostic: 'synthetic_only'; readonly verification: 'synthetic_only' });
interface CoverageLedger { readonly model: 'wfb-coverage-values-1'; readonly rows: readonly CoverageRow[];
  readonly ready: false; readonly runtimeCoverage: 'unknown'; readonly nativeCost: 'unknown';
  readonly entryRequirement: 'unknown'; readonly seedRequirement: 'unknown' }
const rowKeys = ['id', 'status', 'sourceRevision', 'symbol', 'phase', 'producer', 'costOwner',
  'maxRepetitions', 'slots', 'paths', 'diagnostic', 'verification', 'gaps'];
const slotNames = Array.from({ length: 64 }, (_, i) => `slot${String(i).padStart(2, '0')}`);
const gapNames = ['runtime_coverage', 'native_cost', 'source_mapping', 'ownership', 'cost_bound'];
/** An untrusted correspondence record. Source strings and synthetic labels are not verified evidence. */
export function inspectCoverageLedger(input: unknown): Result<CoverageLedger> {
  return run(() => {
    const v = record(input, ['model', 'rows', 'ready', 'runtimeCoverage', 'nativeCost', 'entryRequirement', 'seedRequirement']);
    if (v.model !== 'wfb-coverage-values-1' || v.ready !== false || v.runtimeCoverage !== 'unknown'
      || v.nativeCost !== 'unknown' || v.entryRequirement !== 'unknown' || v.seedRequirement !== 'unknown') invalid();
    const rawRows = list(v.rows, 12);
    if (rawRows.length !== 12) invalid();
    const rows = rawRows.map((raw, index): CoverageRow => {
      const r = record(raw, rowKeys);
      if (r.id !== `SC${String(index + 1).padStart(2, '0')}`) invalid();
      one(r.status, ['unknown', 'synthetic_only']);
      const slots = subset(r.slots, slotNames);
      const paths = subset(r.paths, ['normal', 'refused', 'partial']);
      const gaps = subset(r.gaps, gapNames);
      if (gaps.length !== gapNames.length) invalid();
      if (r.status === 'unknown') {
        if (r.sourceRevision !== null || r.symbol !== null || r.phase !== 'unknown' || r.producer !== 'unknown'
          || r.costOwner !== 'unknown' || r.maxRepetitions !== null || slots.length || paths.length
          || r.diagnostic !== 'unknown' || r.verification !== 'none') invalid();
      } else {
        if (typeof r.sourceRevision !== 'string' || r.sourceRevision.length !== 64 || !/^[0-9a-f]{64}$/.test(r.sourceRevision)
          || typeof r.symbol !== 'string' || r.symbol.length > 128 || !/^[A-Za-z_][A-Za-z0-9_.:]*$/.test(r.symbol)
          || typeof r.maxRepetitions !== 'number' || !Number.isSafeInteger(r.maxRepetitions)
          || r.maxRepetitions < 1 || r.maxRepetitions > 1_000_000 || !paths.length
          || r.diagnostic !== 'synthetic_only' || r.verification !== 'synthetic_only') invalid();
        one(r.phase, ['before_entry', 'entry_prepare', 'entry_terminal', 'seed', 'handoff']);
        one(r.producer, ['plan', 'anchor', 'entry', 'carrier', 'seed', 'recipient', 'credit']);
        one(r.costOwner, ['base_unknown', 'k0_excluded', 'entry_prepare', 'entry_terminal', 'seed', 'split_unknown']);
      }
      return Object.freeze({ ...r, slots, paths, gaps }) as CoverageRow;
    });
    return Object.freeze({ ...v, rows: Object.freeze(rows), entryRequirement: 'unknown' }) as CoverageLedger;
  });
}
