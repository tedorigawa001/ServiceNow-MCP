/** Pure test-only accounting contract. No AST supplier, callback, runtime ledger or I/O. */
export interface ValueLimits {
  readonly max_scopes: number; readonly max_workers: number; readonly max_nodes: number; readonly max_work: number;
  readonly max_snapshot_bytes: number; readonly max_control_bytes: number; readonly max_file_bytes: number;
}
export type ValueFailure = 'schema' | 'relation' | 'limit' | 'overflow' | 'invalid_value';
export interface ValueWork { readonly structural: number; readonly relation: number; readonly arithmetic: number; readonly number_formatting: number; readonly copies: number; readonly total: number }
export type ValueResult<T> = { readonly ok: true; readonly value: T; readonly work: ValueWork }
  | { readonly ok: false; readonly reason: ValueFailure };
export const VALUE_WORK_MODEL = 'wfb-value-core-work-1' as const;
/** Future bridge labels only: no raw entry imports or activation. */
export const VALUE_FAILURE_STAGE_REASONS = Object.freeze({ schema: 'value_schema', relation: 'value_relation',
  limit: 'value_limit', overflow: 'value_overflow', invalid_value: 'value_invalid' } as const);
export type ObservedValueWork = { readonly state: 'observed'; readonly work: ValueWork };
export type ValueWorkSnapshot = ObservedValueWork | { readonly state: 'unavailable' };
export type DetailedValueResult<T> = ({ readonly ok: true; readonly value: T; readonly accounting: ObservedValueWork }
  | { readonly ok: false; readonly reason: ValueFailure; readonly accounting: ValueWorkSnapshot }) & { readonly model: typeof VALUE_WORK_MODEL };
export class ValueRejected extends Error { constructor(readonly reason: ValueFailure) { super('snapshot_value_rejected'); } }
export function refuse(reason: ValueFailure): never { throw new ValueRejected(reason); }
export function valueFailureOf(error: unknown): ValueFailure { return error instanceof ValueRejected ? error.reason : 'invalid_value'; }
const MAX = Number.MAX_SAFE_INTEGER;
const unavailable = Object.freeze({ state: 'unavailable' } as const);
export class ValueCost {
  readonly #usage = { structural: 0, relation: 0, arithmetic: 0, number_formatting: 0, copies: 0, total: 0 };
  constructor(readonly limits: ValueLimits) {}
  spend(kind: Exclude<keyof ValueWork, 'total'>, n = 1): void {
    if (!Number.isSafeInteger(n) || n < 0 || Object.is(n, -0) || n > this.limits.max_work - this.#usage.total) refuse('limit');
    if (kind === 'structural' && n > this.limits.max_nodes - this.#usage.structural) refuse('limit');
    this.#usage[kind] += n; this.#usage.total += n;
  }
  add(a: number, b: number): number { this.spend('arithmetic'); if (b > MAX - a) refuse('overflow'); return a + b; }
  mul(a: number, b: number): number { this.spend('arithmetic'); if (a && b > Math.floor(MAX / a)) refuse('overflow'); return a * b; }
  snapshot(): ValueWork { return Object.freeze({ ...this.#usage }); }
}
/** Installed before the first fallible charge; terminal diagnostics are never overwritten. */
export class ValueAccountingOwner<T> {
  #cost: ValueCost | undefined;
  #terminal: DetailedValueResult<T> | undefined;
  install(cost: ValueCost): void {
    if (this.#cost || this.#terminal) refuse('invalid_value'); this.#cost = cost;
  }
  private snapshot(): ValueWorkSnapshot {
    if (!this.#cost) return unavailable;
    try { return Object.freeze({ state: 'observed', work: this.#cost.snapshot() }); } catch { return unavailable; }
  }
  success(value: T): DetailedValueResult<T> {
    if (this.#terminal) return this.#terminal;
    const accounting = this.snapshot();
    this.#terminal = accounting.state === 'observed'
      ? Object.freeze({ ok: true, value, model: VALUE_WORK_MODEL, accounting })
      : Object.freeze({ ok: false, reason: 'invalid_value', model: VALUE_WORK_MODEL, accounting });
    this.#cost = undefined; return this.#terminal;
  }
  failure(error: unknown): DetailedValueResult<T> {
    if (this.#terminal) return this.#terminal;
    const reason = valueFailureOf(error);
    this.#terminal = Object.freeze({ ok: false, reason, model: VALUE_WORK_MODEL, accounting: this.snapshot() });
    this.#cost = undefined; return this.#terminal;
  }
}
export function projectLegacyValueResult<T>(result: DetailedValueResult<T>): ValueResult<T> {
  return result.ok ? Object.freeze({ ok: true, value: result.value, work: result.accounting.work })
    : Object.freeze({ ok: false, reason: result.reason });
}
