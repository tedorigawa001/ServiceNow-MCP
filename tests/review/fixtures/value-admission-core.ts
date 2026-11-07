/** Pure RC-B arithmetic only. No parser, value engine, callbacks or runtime state. */
import { types } from 'node:util';
import { VALUE_WORK_MODEL } from './value-core-accounting.js';
import type { ValueLimits } from './value-core-accounting.js';
import type { RawLimits } from './raw-json-boundary.js';

export const VALUE_ADMISSION_MODEL = 'wfb-value-admission-rcb-1' as const;
export const VALUE_STRUCTURAL_MODEL = 'wfb-value-structural-3v10-1' as const;
const keys = ['max_input_bytes', 'max_input_buffer_bytes', 'max_input_live_bytes', 'max_depth',
  'max_tokens', 'max_value_nodes', 'max_array_items', 'max_parse_work', 'max_value_work', 'max_total_work',
  'max_token_scratch_bytes', 'max_ast_nodes', 'max_live_value_nodes', 'max_scopes', 'max_workers',
  'max_nodes', 'max_snapshot_bytes', 'max_control_bytes', 'max_file_bytes'] as const satisfies readonly (keyof RawLimits)[];
type Reason = 'raw_limits' | 'raw_limit' | 'raw_overflow';
interface Projection { readonly valueNodes: number; readonly liveValueNodes: number; readonly structural: number; readonly valueLimits: ValueLimits }
export type ValueAdmissionResult = ({ readonly ok: true; readonly kind: 'non_executable_value_admission'; readonly value: Projection }
  | { readonly ok: false; readonly reason: Reason }) & {
    readonly model: typeof VALUE_ADMISSION_MODEL; readonly structuralModel: typeof VALUE_STRUCTURAL_MODEL;
    readonly valueModel: typeof VALUE_WORK_MODEL; readonly coreInvocation: 'not_called'; readonly bridgeWork: 'unmodeled';
    readonly arithmetic: { readonly attempted: number; readonly completed: number };
  };
const MAX = Number.MAX_SAFE_INTEGER;
class Rejected extends Error { constructor(readonly reason: Reason) { super('value_admission_rejected'); } }
function reject(reason: Reason): never { throw new Rejected(reason); }
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function pinPlan(input: unknown): RawLimits {
  if (!input || typeof input !== 'object' || types.isProxy(input)) reject('raw_limits');
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) reject('raw_limits');
  const names = Reflect.ownKeys(input);
  if (names.length !== keys.length) reject('raw_limits');
  const out = Object.create(null) as Record<string, number>;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i], d = Object.getOwnPropertyDescriptor(input, key);
    if (names[i] !== key || !d || !d.enumerable || !('value' in d) || !positive(d.value)) reject('raw_limits');
    out[key] = d.value;
  }
  return Object.freeze(out) as RawLimits;
}
/** Caller-supplied V is arithmetic DATA here, never syntax/source evidence. RC-C must supply it privately. */
export function calculateValueAdmission(valueNodes: unknown, input: unknown): ValueAdmissionResult {
  let attempted = 0, completed = 0;
  const add = (a: number, b: number) => { attempted++; if (b > MAX - a) reject('raw_overflow'); completed++; return a + b; };
  const triple = (a: number) => { attempted++; if (a > Math.floor(MAX / 3)) reject('raw_overflow'); completed++; return a * 3; };
  const finish = () => ({ model: VALUE_ADMISSION_MODEL, structuralModel: VALUE_STRUCTURAL_MODEL, valueModel: VALUE_WORK_MODEL,
    coreInvocation: 'not_called' as const, bridgeWork: 'unmodeled' as const, arithmetic: Object.freeze({ attempted, completed }) });
  try {
    const plan = pinPlan(input);
    if (add(plan.max_parse_work, plan.max_value_work) > plan.max_total_work) reject('raw_limits');
    if (!positive(valueNodes)) reject('raw_limits');
    if (valueNodes > plan.max_value_nodes || valueNodes > plan.max_ast_nodes) reject('raw_limit');
    const liveValueNodes = add(valueNodes, valueNodes);
    if (liveValueNodes > plan.max_live_value_nodes) reject('raw_limit');
    const structural = add(triple(valueNodes), 10);
    if (structural > plan.max_nodes) reject('raw_limit');
    const valueLimits = Object.freeze({ max_scopes: plan.max_scopes, max_workers: plan.max_workers, max_nodes: plan.max_nodes,
      max_work: plan.max_value_work, max_snapshot_bytes: plan.max_snapshot_bytes, max_control_bytes: plan.max_control_bytes, max_file_bytes: plan.max_file_bytes });
    return Object.freeze({ ok: true, kind: 'non_executable_value_admission', value: Object.freeze({ valueNodes, liveValueNodes, structural, valueLimits }), ...finish() });
  } catch (error) {
    return Object.freeze({ ok: false, reason: error instanceof Rejected ? error.reason : 'raw_limits', ...finish() });
  }
}
