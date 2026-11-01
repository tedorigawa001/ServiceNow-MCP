/** RC-01 value contracts only. No comparison, admission or Permit issuance. */
import {z} from 'zod';
import {types} from 'node:util';
import {RELEASE_FAMILIES} from './release-family.js';
import type {ReleaseEvidence} from '../../review/result-schema-v2.js';

export const RELEASE_COMPARISON_MODEL = 'release-comparison-v1' as const;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.iso.datetime().refine(value => Number.isFinite(Date.parse(value)));
const assertion = z.object({
  source: z.literal('operator_config'), resolution_status: z.literal('asserted'),
  visibility_scope: z.literal('operator_configured'),
  family: z.enum(RELEASE_FAMILIES),
  instance_binding: hex, config_version: hex,
  // Deliberately no new length cap: approval for config timestamps is pending.
  asserted_at: date, expires_at: date,
}).strict();
const schema = z.object({
  model_id: z.literal(RELEASE_COMPARISON_MODEL),
  timing: z.object({started_at: date.max(40), deadline_ms: z.number().int().min(1).max(60000), observed_at: date.max(40).optional()}).strict(),
  policy: z.object({instanceBinding: hex, assertion: assertion.optional(), issue: z.enum(['config_binding_mismatch', 'config_expired', 'config_validity_insufficient']).optional()}).strict(),
  observation: z.discriminatedUnion('kind', [
    z.object({kind: z.literal('complete_200'), rows: z.array(z.object({build_name: z.string().max(40).nullable()}).strict()).max(21)}).strict(),
    z.object({kind: z.literal('invalid_observation')}).strict(),
    z.object({kind: z.literal('not_requested')}).strict(),
  ]),
}).strict().superRefine((value, context) => {
  const complete = value.observation.kind === 'complete_200';
  const notRequested = value.observation.kind === 'not_requested';
  if (complete !== (value.timing.observed_at !== undefined)
    || !Number.isSafeInteger(Date.parse(value.timing.started_at) + value.timing.deadline_ms)
    || (notRequested && (value.policy.issue !== 'config_binding_mismatch' || !value.policy.assertion
      || value.policy.assertion.instance_binding === value.policy.instanceBinding))
    || (!value.policy.assertion && value.policy.issue !== undefined)) {
    context.addIssue({code: 'custom', message: 'invalid_input'});
  }
});

type ReadonlyValue<T> = T extends readonly (infer E)[] ? readonly ReadonlyValue<E>[] : T extends object ? {readonly [K in keyof T]: ReadonlyValue<T[K]>} : T;
export type ReleaseComparisonInput = ReadonlyValue<z.infer<typeof schema>>;
export interface ReleaseComparisonDraft {
  readonly ok: true;
  readonly kind: 'release_comparison_draft';
  readonly model_id: typeof RELEASE_COMPARISON_MODEL;
  readonly decision: {
    readonly release_match: 'matched' | 'mismatched' | 'unknown';
    readonly instance_release: ReadonlyValue<ReleaseEvidence>;
    readonly limitations: readonly string[];
  };
  readonly permissions: {readonly formal_issuance: false; readonly release_permit: false; readonly dispatch: false; readonly fallback_activation: false};
}
export type ReleaseComparisonResult = ReleaseComparisonDraft | {readonly ok: false; readonly code: 'invalid_input'};

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Inspect only own data descriptors; never invoke input accessors or proxy traps. */
function copyData(value: unknown, depth = 0, count = {nodes: 0}): unknown {
  if (++count.nodes > 128 || depth > 4) throw new Error('invalid_input');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw new Error('invalid_input');
  const array = Array.isArray(value);
  const proto = Object.getPrototypeOf(value);
  if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) throw new Error('invalid_input');
  const keys = Reflect.ownKeys(value);
  if (keys.length > (array ? 22 : 10)) throw new Error('invalid_input');
  if (array) {
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (!length || !('value' in length) || !Number.isInteger(length.value) || length.value < 0 || length.value > 21 || keys.length !== length.value + 1) throw new Error('invalid_input');
    const result: unknown[] = [];
    for (let i = 0; i < length.value; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('invalid_input');
      result.push(copyData(descriptor.value, depth + 1, count));
    }
    return result;
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string') throw new Error('invalid_input');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) throw new Error('invalid_input');
    result[key] = copyData(descriptor.value, depth + 1, count);
  }
  return result;
}

/**
 * RC-01 structure only: policy expiry/issue consistency and release decisions
 * remain RC-02. Success conveys no source/session authority or admission.
 */
export function parseReleaseComparisonInput(value: unknown): {readonly ok: true; readonly input: ReleaseComparisonInput} | {readonly ok: false; readonly code: 'invalid_input'} {
  try {
    const parsed = schema.safeParse(copyData(value));
    if (parsed.success) return freeze({ok: true as const, input: parsed.data});
  } catch { /* fixed rejection, never return caller values or exceptions */ }
  return Object.freeze({ok: false, code: 'invalid_input'});
}
