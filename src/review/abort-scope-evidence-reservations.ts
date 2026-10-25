/** Pure synthetic reservation ledger. No transport, bytes, clock, worker or production permits. */
import { z } from 'zod';
declare const brand: unique symbol;
type Handle<K extends string> = { readonly [brand]: K };
export type ScopeBudgetRead = Handle<'read'>;
export type ScopeBudgetTable = Handle<'table'>;
export type ScopeBudgetSlot = Handle<'slot'>;
export type ScopeBudgetAttempt = Handle<'attempt'>;
export type ScopeAttemptLane = 'oauth' | 'ordinary' | 'initial' | 'final';
/** Logical counts only; neither received bytes nor wall-clock duration is derived here. */
export type ScopeReservationDimensions = Readonly<{ requests: number; reserved: number; tables: number }>;
export type ScopeReservationCost = Readonly<{ dimension: 'http_attempt'; lane: ScopeAttemptLane;
  attempt: 1 | 2; slot: number | null }>;
export type ScopeReservationFailure = 'invalid_input' | 'invalid_state' | 'evidence_binding_mismatch'
  | 'scope_evidence_limit' | 'request_budget_exceeded' | 'cancelled' | 'deadline_exceeded'
  | 'authentication_failed' | 'access_denied' | 'closed' | 'receive_budget_exceeded' | 'internal_review_error';
type Result<T> = Readonly<{ ok: true; value: T } | { ok: false; code: ScopeReservationFailure; terminal: boolean }>;
const configSchema = z.strictObject({ requests: z.number().int().min(4).max(210), consumed: z.number().int().min(0).max(206) })
  .refine(x => x.consumed + 4 <= x.requests);
const handle = <T>() => Object.freeze(Object.create(null)) as T;
const ok = <T>(value: T): Result<T> => Object.freeze({ ok: true, value });

/** Imports consumed attempts as fixture data only, never an actual session receipt. */
export function createSyntheticScopeReservationLedger(raw: unknown) {
  const parsed = (() => { try { return configSchema.safeParse(raw); } catch { return null; } })();
  if (!parsed?.success) return Object.freeze({ ok: false as const, code: 'invalid_input' as const, terminal: true });
  type Read = { lane: ScopeAttemptLane; state: 'ready' | 'inflight' | 'retry' | 'done'; attempts: number;
    table?: Table; slot?: Slot };
  type Table = { read: ScopeBudgetRead; slot: ScopeBudgetSlot; initial: 'pending' | 'available' | 'unavailable' };
  type Slot = { handle: ScopeBudgetSlot; ordinal: number; kind: 'parent' | 'metadata' | 'table'; remaining: number;
    attempts: number; state: 'idle' | 'inflight' | 'retry' | 'done' | 'skipped' | 'invalidated'; table?: ScopeBudgetTable; read?: ScopeBudgetRead };
  const reads = new WeakMap<ScopeBudgetRead, Read>(), tables = new WeakMap<ScopeBudgetTable, Table>();
  const slotMap = new WeakMap<ScopeBudgetSlot, Slot>(), attempts = new WeakMap<ScopeBudgetAttempt, { read: ScopeBudgetRead; used: boolean }>();
  const names = new Map<string, ScopeBudgetTable>(), order: Slot[] = [];
  let count = parsed.data.consumed, phase: 'normal' | 'final' | 'stopped' = 'normal', cursor = 0;
  let current: ScopeBudgetRead | undefined, active: ScopeBudgetAttempt | undefined;
  let primary: ScopeReservationFailure | undefined, ordinaryClosed = false, evidenceClosed = false, ordinaryReads = 0;
  const limit = parsed.data.requests;
  const reserved = () => order.reduce((n, s) => n + s.remaining, 0);
  function failure(code: ScopeReservationFailure, terminal = true): Result<never> {
    if (primary) return Object.freeze({ ok: false, code: primary, terminal: true });
    if (terminal) {
      primary = code; phase = 'stopped'; current = undefined; active = undefined;
      for (const s of order) { s.remaining = 0; if (s.state !== 'done' && s.state !== 'skipped') s.state = 'invalidated'; }
    }
    return Object.freeze({ ok: false, code, terminal });
  }
  function makeSlot(kind: Slot['kind'], table?: ScopeBudgetTable): ScopeBudgetSlot {
    const value = handle<ScopeBudgetSlot>();
    const slot: Slot = { handle: value, ordinal: order.length, kind, table, remaining: 2, attempts: 0, state: 'idle' };
    slotMap.set(value, slot); order.push(slot); return value;
  }
  const parent = makeSlot('parent'), metadata = makeSlot('metadata');
  function newRead(lane: ScopeAttemptLane, table?: Table, slot?: Slot): ScopeBudgetRead {
    const value = handle<ScopeBudgetRead>(); reads.set(value, { lane, table, slot, state: 'ready', attempts: 0 });
    current = value; return value;
  }
  function start(value: ScopeBudgetRead): Result<Readonly<{ attempt: ScopeBudgetAttempt; cost: ScopeReservationCost }>> {
    if (primary) return failure(primary);
    const read = reads.get(value);
    if (!read) return failure('evidence_binding_mismatch');
    if (value !== current || active || !['ready', 'retry'].includes(read.state) || read.attempts >= 2)
      return failure('invalid_state');
    if (read.lane === 'final') {
      const s = read.slot!;
      if (phase !== 'final' || s !== order[cursor] || s.remaining < 1 || count >= limit) return failure('invalid_state');
      s.remaining--; s.attempts++; s.state = 'inflight';
    } else {
      if (phase !== 'normal') return failure('invalid_state');
      if (ordinaryClosed || count + 1 + reserved() > limit) {
        ordinaryClosed = true; read.state = 'done'; current = undefined;
        if (read.table) read.table.initial = 'unavailable';
        return failure('request_budget_exceeded', false);
      }
    }
    count++; read.attempts++; read.state = 'inflight';
    const attempt = handle<ScopeBudgetAttempt>(); attempts.set(attempt, { read: value, used: false }); active = attempt;
    return ok(Object.freeze({ attempt, cost: Object.freeze({ dimension: 'http_attempt', lane: read.lane,
      attempt: read.attempts as 1 | 2, slot: read.slot?.ordinal ?? null }) }));
  }
  function finalTarget(slot: Slot, target: 'parent' | 'metadata' | ScopeBudgetTable) {
    return typeof target === 'string' ? slot.kind === target : slot.kind === 'table' && slot.table === target && tables.has(target);
  }
  return ok(Object.freeze({
    parent, metadata,
    openOrdinary(lane: 'oauth' | 'ordinary'): Result<ScopeBudgetRead> {
      if (primary) return failure(primary);
      if (phase !== 'normal' || current || lane !== 'oauth' && lane !== 'ordinary') return failure('invalid_state');
      if (ordinaryClosed || ordinaryReads >= 210) return failure('request_budget_exceeded', false);
      ordinaryReads++; return ok(newRead(lane));
    },
    admitTable(name: unknown): Result<ScopeBudgetTable> {
      if (primary) return failure(primary);
      if (phase !== 'normal') return failure('invalid_state');
      if (typeof name !== 'string' || !/^[a-z][a-z0-9_]{0,79}$/.test(name) || name === 'global') return failure('invalid_input');
      const cached = names.get(name); if (cached) return ok(cached);
      if (current) return failure('invalid_state');
      if (evidenceClosed || ordinaryClosed || names.size >= 8 || count + reserved() + 4 > limit) {
        evidenceClosed = true; return failure('scope_evidence_limit', false);
      }
      const value = handle<ScopeBudgetTable>(), slot = makeSlot('table', value), read = newRead('initial');
      const table: Table = { read, slot, initial: 'pending' };
      reads.get(read)!.table = table; tables.set(value, table); names.set(name, value); return ok(value);
    },
    tableSlot(table: ScopeBudgetTable): Result<ScopeBudgetSlot> {
      if (primary) return failure(primary);
      const t = tables.get(table); return t ? ok(t.slot) : failure('evidence_binding_mismatch');
    },
    markInitialUnavailable(table: ScopeBudgetTable): Result<true> {
      if (primary) return failure(primary);
      const t = tables.get(table);
      if (!t) return failure('evidence_binding_mismatch');
      if (phase !== 'normal' || active || current || t.initial !== 'available') return failure('invalid_state');
      t.initial = 'unavailable'; return ok(true);
    },
    startOrdinary(read: ScopeBudgetRead) { return start(read); },
    startInitial(table: ScopeBudgetTable) {
      if (primary) return failure(primary);
      const t = tables.get(table); return t ? start(t.read) : failure('evidence_binding_mismatch');
    },
    settle(attempt: ScopeBudgetAttempt, outcome: 'success' | 'unavailable' | 'retryable'): Result<true> {
      if (primary) return failure(primary);
      const a = attempts.get(attempt);
      if (!a) return failure('evidence_binding_mismatch');
      if (a.used || active !== attempt) return failure('invalid_state');
      a.used = true;
      if (!['success', 'unavailable', 'retryable'].includes(outcome)) return failure('invalid_input');
      const read = reads.get(a.read)!; active = undefined;
      if (outcome === 'retryable' && read.attempts < 2) {
        read.state = 'retry'; if (read.slot) read.slot.state = 'retry'; return ok(true);
      }
      read.state = 'done'; current = undefined;
      if (read.table) read.table.initial = outcome === 'success' ? 'available' : 'unavailable';
      if (read.slot) { read.slot.remaining = 0; read.slot.state = 'done'; cursor++; }
      return ok(true);
    },
    enterFinal(): Result<true> {
      if (primary) return failure(primary);
      if (phase !== 'normal' || active) return failure('invalid_state');
      // The normal phase can end while a read waits to start or to retry. End it unattempted (C is not
      // refunded) so the final reservations survive; a table initial left this way is unavailable.
      if (current) {
        const read = reads.get(current)!; read.state = 'done'; current = undefined;
        if (read.table) read.table.initial = 'unavailable';
      }
      phase = 'final'; return ok(true);
    },
    startFinal(slot: ScopeBudgetSlot, target: 'parent' | 'metadata' | ScopeBudgetTable) {
      if (primary) return failure(primary);
      const s = slotMap.get(slot);
      if (!s || !finalTarget(s, target)) return failure('evidence_binding_mismatch');
      if (phase !== 'final' || s !== order[cursor] || current && s.read !== current || active
        || s.state !== 'idle' && s.state !== 'retry') return failure('invalid_state');
      if (s.table && tables.get(s.table)!.initial !== 'available') return failure('invalid_state');
      s.read ??= newRead('final', undefined, s);
      return start(s.read);
    },
    skipTableFinal(table: ScopeBudgetTable, slot: ScopeBudgetSlot): Result<true> {
      if (primary) return failure(primary);
      const t = tables.get(table), s = slotMap.get(slot);
      if (!t || !s || t.slot !== slot || s.table !== table) return failure('evidence_binding_mismatch');
      if (phase !== 'final' || current || s !== order[cursor] || s.state !== 'idle'
        || t.initial !== 'unavailable' && !evidenceClosed) return failure('invalid_state');
      s.remaining = 0; s.state = 'skipped'; cursor++; return ok(true);
    },
    disableEvidence(): Result<true> {
      if (primary) return failure(primary);
      if (active) return failure('invalid_state');
      evidenceClosed = true;
      if (current) {
        const read = reads.get(current)!;
        if (read.table) { read.table.initial = 'unavailable'; read.state = 'done'; current = undefined; }
      }
      return ok(true);
    },
    stop(code: 'cancelled' | 'deadline_exceeded' | 'authentication_failed' | 'access_denied' | 'receive_budget_exceeded' | 'internal_review_error') {
      if (!['cancelled', 'deadline_exceeded', 'authentication_failed', 'access_denied', 'receive_budget_exceeded', 'internal_review_error'].includes(code)) return failure('invalid_input');
      return failure(code);
    },
    close() { return failure('closed'); },
    stats() {
      return Object.freeze({ phase, requests: count, reserved: reserved(), tables: names.size,
        ordinary_closed: ordinaryClosed, evidence_closed: evidenceClosed, primary: primary ?? null,
        slots: Object.freeze(order.map(s => Object.freeze({ ordinal: s.ordinal, kind: s.kind,
          remaining: s.remaining, attempts: s.attempts, state: s.state }))) });
    },
  }));
}
