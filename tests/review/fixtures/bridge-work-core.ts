/** Synthetic fixed recipes only. No parser, core, runtime budget or native resources. */
import { types } from 'node:util';
export const BRIDGE_WORK_MODEL = 'wfb-bridge-finite-work-1' as const;
export const BRIDGE_UNIT_KINDS = Object.freeze(['read', 'check', 'write', 'arithmetic', 'copy', 'container', 'freeze', 'control'] as const);
type Unit = (typeof BRIDGE_UNIT_KINDS)[number];
export type BridgePhase = 'seed' | 'admit' | 'tail';
export type BridgeUnits = Readonly<Record<Unit, number>>;
const zero = (): Record<Unit, number> => ({ read: 0, check: 0, write: 0, arithmetic: 0, copy: 0, container: 0, freeze: 0, control: 0 });
const slots = Object.freeze(['invocation', 'plan', 'meter', 'byteIdentity', 'rootBorrow', 'inputLength', 'valueNodes', 'claim',
  'firstReason', 'secondaryReason', 'coreState', 'coreWork', 'admissionProjection', 'coreResult', 'candidate', 'returnPending',
  'reservationSeed', 'reservationAdmit', 'reservationTail'] as const);
const recipes = {
  seed_guard: { read: 4, check: 8, control: 1 }, seed_allocate: { container: 3, write: 19 },
  seed_gate: { read: 3, check: 4, arithmetic: 3, write: 3, control: 1 },
  admit_gate: { read: 3, check: 4, arithmetic: 3, write: 3, control: 1 },
  tail_gate: { read: 3, check: 4, arithmetic: 3, write: 3, control: 1 },
  seed_diagnostic: { read: 4, check: 2, write: 4 }, seed_clear: { write: 15 },
  bind: { read: 8, check: 8, control: 1 }, admission: { read: 5, check: 5, arithmetic: 3 },
  projection: { read: 7, copy: 7, write: 7, container: 1, freeze: 1 }, admit_state: { read: 1, check: 1, write: 1 }, admit_clear: { write: 1 },
  pre_claim: { read: 9, check: 9, write: 2, control: 2 }, dispatch_marker: { control: 1 },
  core_limits_recipe: { read: 9, check: 25, write: 7, container: 1, freeze: 1, control: 8 },
  core_metadata_recipe: { read: 8, copy: 12, write: 12, container: 5, freeze: 4, control: 2 },
  accept: { read: 4, check: 4, write: 2 }, work_guard: { read: 6, check: 8, arithmetic: 5 },
  work_snapshot: { copy: 6, container: 1, freeze: 1 }, identity_guard: { read: 4, check: 4 }, width_guard: { read: 6, check: 6 },
  pending_move: { read: 1, write: 2, control: 1 }, return_prepare: { read: 10, copy: 10, container: 2, freeze: 2 },
  return_totals: { read: 3, check: 2, arithmetic: 2 }, return_seal: { container: 1, freeze: 1, control: 1 },
  failure_metadata: { read: 6, check: 6, copy: 6, container: 1, freeze: 1 }, tail_clear: { write: 3 },
  tail_retire: { read: 1, check: 1, write: 1, control: 1 },
} as const satisfies Record<string, Partial<BridgeUnits>>;
type Step = keyof typeof recipes;
interface Path { readonly id: string; readonly phase: BridgePhase; readonly steps: readonly Step[]; readonly units: BridgeUnits; readonly total: number }
const sum = (units: BridgeUnits) => BRIDGE_UNIT_KINDS.reduce((n, kind) => n + units[kind], 0);
function path(id: string, phase: BridgePhase, steps: readonly Step[]): Path {
  const units = zero();
  for (const step of steps) for (const kind of BRIDGE_UNIT_KINDS) units[kind] += (recipes[step] as Partial<BridgeUnits>)[kind] ?? 0;
  return Object.freeze({ id, phase, steps: Object.freeze([...steps]), units: Object.freeze(units), total: sum(units) });
}
function paths(): readonly Path[] {
  const out: Path[] = [];
  const seed: Step[] = ['seed_guard', 'seed_allocate', 'seed_gate'];
  for (let gates = 0; gates <= 2; gates++) out.push(path('seed/' + gates, 'seed', [...seed,
    ...(['admit_gate', 'tail_gate'] as Step[]).slice(0, gates), 'seed_diagnostic', 'seed_clear']));
  const admission: Step[] = ['bind', 'admission', 'projection', 'admit_state'];
  for (let k = 0; k <= admission.length; k++) out.push(path('admit/' + k, 'admit', [...admission.slice(0, k), 'admit_clear']));
  const head: Step[] = ['pre_claim', 'dispatch_marker', 'core_limits_recipe', 'core_metadata_recipe'];
  const post: Step[] = ['accept', 'work_guard', 'work_snapshot', 'identity_guard', 'width_guard'];
  const returning: Step[] = ['return_prepare', 'return_totals', 'return_seal'];
  const end: Step[] = ['tail_clear', 'tail_retire'];
  out.push(path('pre_refused', 'tail', ['pre_claim', 'failure_metadata', ...end]));
  for (let k = 2; k <= head.length; k++) out.push(path('core_throw/' + k, 'tail', [...head.slice(0, k), 'failure_metadata', ...end]));
  out.push(path('core_refused', 'tail', [...head, 'failure_metadata', ...end]));
  out.push(path('result_invalid', 'tail', [...head, 'failure_metadata', ...end]));
  for (let k = 0; k <= post.length; k++) out.push(path('post_refused/' + k, 'tail', [...head, ...post.slice(0, k), 'failure_metadata', ...end]));
  for (let k = 0; k <= returning.length; k++) out.push(path('return_refused/' + k, 'tail', [...head, ...post, 'pending_move', ...returning.slice(0, k), 'failure_metadata', ...end]));
  const full: Step[] = [...head, ...post, 'pending_move', ...returning];
  out.push(path('success', 'tail', [...full, ...end]));
  // Diagnostic/cleanup faults stop, never restart a failure-metadata builder or refund a reservation.
  out.push(path('diagnostic_fault', 'tail', [...full, 'failure_metadata', ...end]));
  for (let k = 0; k <= end.length; k++) out.push(path('cleanup_fault/' + k, 'tail', [...full, 'failure_metadata', ...end.slice(0, k)]));
  return Object.freeze(out);
}
export function calculateBridgeWorkBounds() {
  const all = paths();
  const reservations = { seed: 0, admit: 0, tail: 0, full: 0 };
  for (const p of all) reservations[p.phase] = Math.max(reservations[p.phase], p.total);
  reservations.full = reservations.seed + reservations.admit + reservations.tail;
  const steps = Object.freeze(Object.fromEntries(Object.entries(recipes).map(([id, recipe]) => {
    const units = Object.freeze({ ...zero(), ...recipe }); return [id, Object.freeze({ units, total: sum(units) })];
  }))) as Readonly<Record<Step, { readonly units: BridgeUnits; readonly total: number }>>;
  return Object.freeze({ kind: 'non_executable_bridge_work' as const, model: BRIDGE_WORK_MODEL,
    slots: slots.length, slotNames: slots, steps, paths: all, reservations: Object.freeze(reservations),
    runtimeCoverage: 'unknown' as const, ready: false as const, coreInvocation: 'not_called' as const });
}
type ReservationFailure = 'raw_limits' | 'raw_overflow' | 'raw_work';
export type BridgeReservationResult = ({ readonly ok: true; readonly kind: 'non_executable_bridge_reservation'; readonly required: number;
  readonly value: { readonly bridgeChargedAfter: number; readonly chargedAfter: number; readonly remaining: number } }
  | { readonly ok: false; readonly reason: ReservationFailure }) & {
    readonly model: typeof BRIDGE_WORK_MODEL; readonly ready: false; readonly runtimeCoverage: 'unknown'; readonly coreInvocation: 'not_called';
  };
export function inspectBridgeReservation(phase: unknown, input: unknown): BridgeReservationResult {
  const closed = { model: BRIDGE_WORK_MODEL, ready: false as const, runtimeCoverage: 'unknown' as const, coreInvocation: 'not_called' as const };
  const fail = (reason: ReservationFailure): BridgeReservationResult => Object.freeze({ ok: false, reason, ...closed });
  if (phase !== 'seed' && phase !== 'admit' && phase !== 'tail') return fail('raw_limits');
  if (!input || typeof input !== 'object' || types.isProxy(input)) return fail('raw_limits');
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return fail('raw_limits');
  const names = Reflect.ownKeys(input), expected = ['max_parse_work', 'parser_charged', 'bridge_charged'];
  if (names.length !== expected.length) return fail('raw_limits');
  const numbers: number[] = [];
  for (let i = 0; i < expected.length; i++) {
    const d = Object.getOwnPropertyDescriptor(input, expected[i]);
    if (names[i] !== expected[i] || !d || !d.enumerable || !('value' in d)) return fail('raw_limits');
    const v: unknown = d.value;
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || Object.is(v, -0) || (i === 0 && v === 0)) return fail('raw_limits');
    numbers.push(v);
  }
  const [cap, parser, bridge] = numbers;
  if (bridge > Number.MAX_SAFE_INTEGER - parser) return fail('raw_overflow');
  const charged = parser + bridge, required = calculateBridgeWorkBounds().reservations[phase];
  if (charged > cap || required > cap - charged) return fail('raw_work');
  return Object.freeze({ ok: true, kind: 'non_executable_bridge_reservation', required,
    value: Object.freeze({ bridgeChargedAfter: bridge + required, chargedAfter: charged + required, remaining: cap - charged - required }), ...closed });
}
