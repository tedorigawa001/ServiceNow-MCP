/** Synthetic stream harness only: no fetch, timers, worker, real source or public result integration. */
import { z } from 'zod';
import { createSyntheticScopeReservationLedger, type ScopeBudgetTable, type ScopeBudgetSlot,
  type ScopeReservationFailure } from './abort-scope-evidence-reservations.js';
export interface SyntheticScopeReader {
  read(): Promise<{ done: true } | { done: false; value: Uint8Array }>;
  cancel(): Promise<void>;
}
export interface SyntheticScopeResponse { status: number; reader?: SyntheticScopeReader }
export type SyntheticScopeSource = (attempt: 1 | 2, signal: AbortSignal) => Promise<SyntheticScopeResponse>;
declare const bodyBrand: unique symbol;
export type SyntheticScopeBodyReceipt = { readonly [bodyBrand]: true };
type Code = ScopeReservationFailure | 'upstream_unavailable' | 'invalid_response' | 'not_found_or_not_visible';
type Result = Readonly<{ ok: true; value: Readonly<{ state: 'accepted'; response_bytes: number; cleanup: 'not_started' | 'confirmed' | 'unconfirmed' }> }
  | { ok: false; code: Code; terminal: boolean }>;
const limitsSchema = z.strictObject({ requests: z.number().int().min(4).max(210), consumed: z.number().int().min(0).max(206),
  responseBytes: z.number().int().min(1).max(4194304), totalBytes: z.number().int().min(1).max(16777216),
  evidenceResponseBytes: z.number().int().min(1).max(16384), evidenceBytes: z.number().int().min(1).max(262144) });
class StreamStop extends Error {
  constructor(readonly code: Code, readonly terminal: boolean) { super(code); }
}

export function createSyntheticScopeStreamHarness(raw: unknown) {
  const parsed = (() => { try { return limitsSchema.safeParse(raw); } catch { return null; } })();
  if (!parsed?.success) return { ok: false as const, code: 'invalid_input' as const, terminal: true };
  const limits = parsed.data, created = createSyntheticScopeReservationLedger({ requests: limits.requests, consumed: limits.consumed });
  if (!created.ok) return created;
  const ledger = created.value;
  type Target = ScopeBudgetTable | 'parent' | 'metadata';
  type BodyPhase = 'initial' | 'final' | 'ordinary';
  const bodies = new Map<SyntheticScopeBodyReceipt, { body: string; table: Target; phase: BodyPhase }>();
  let acceptedBody: string | undefined;
  let globalBytes = 0, evidenceBytes = 0, responseBytes = 0, busy = false;
  let primary: Code | undefined, controller: AbortController | undefined;
  let cancelCalls = 0, cleanup: 'not_started' | 'confirmed' | 'unconfirmed' = 'not_started';
  const cancelled = new WeakSet<SyntheticScopeReader>(), seen = new WeakSet<SyntheticScopeReader>();
  function failure(code: Code, terminal: boolean): Extract<Result, { ok: false }> {
    primary ??= ledger.stats().primary ?? (terminal ? code : undefined);
    if(primary){bodies.clear();acceptedBody=undefined;}
    return Object.freeze({ ok: false, code: primary ?? code, terminal: primary !== undefined || terminal });
  }
  function relay<T>(result: Readonly<{ ok: true; value: T } | { ok: false; code: ScopeReservationFailure; terminal: boolean }>) {
    if (!result.ok && result.terminal) { primary ??= ledger.stats().primary ?? result.code; bodies.clear();acceptedBody=undefined;controller?.abort(); }
    return result;
  }
  function stop(code: 'cancelled' | 'deadline_exceeded' | 'authentication_failed' | 'access_denied' | 'receive_budget_exceeded' | 'internal_review_error') {
    bodies.clear(); acceptedBody = undefined;
    primary ??= ledger.stats().primary ?? code; ledger.stop(code); controller?.abort(); return failure(primary, true);
  }
  async function cancel(reader?: SyntheticScopeReader) {
    if (!reader || cancelled.has(reader)) return;
    if (typeof reader !== 'object' && typeof reader !== 'function') { cleanup = 'unconfirmed'; return; }
    cancelled.add(reader); cancelCalls++;
    // A bounded microtask observation, not an OS cleanup deadline/proof. Never await an uncooperative cancel.
    let confirmed = false;
    try { void Promise.resolve(reader.cancel()).then(() => { confirmed = true; }, () => {}); } catch { /* fixed cleanup status only */ }
    await Promise.resolve();
    if (!confirmed) cleanup = 'unconfirmed';
    else if (cleanup !== 'unconfirmed') cleanup = 'confirmed';
  }
  function check() { primary ??= ledger.stats().primary ?? undefined; if (primary) { controller?.abort(); throw new StreamStop(primary, true); } }
  async function guard<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
    check();
    if (signal.aborted) throw new StreamStop(primary ?? 'cancelled', true);
    let abort!: () => void;
    const stopped = new Promise<never>((_, reject) => { abort = () => reject(new StreamStop(primary ?? 'cancelled', true)); signal.addEventListener('abort', abort, { once: true }); });
    try { const result = await Promise.race([work, stopped]); check(); return result; }
    finally { signal.removeEventListener('abort', abort); }
  }
  async function attempt(source: SyntheticScopeSource, ordinal: 1 | 2, evidence: boolean, capture: boolean): Promise<'success' | 'retryable' | 'unavailable'> {
    const local = new AbortController(); controller = local;
    let reader: SyntheticScopeReader | undefined, settled = false;
    try {
      const pending = Promise.resolve(source(ordinal, local.signal));
      void pending.then(late => {
        if (local.signal.aborted) {
          cleanup = 'unconfirmed';
          try { void cancel(late?.reader).catch(() => { cleanup = 'unconfirmed'; }); } catch { cleanup = 'unconfirmed'; }
        }
      }, () => {});
      const response = await guard(pending, local.signal); settled = true;
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw new StreamStop('invalid_response', false);
      reader = response.reader;
      if (reader && (typeof reader.read !== 'function' || typeof reader.cancel !== 'function' || seen.has(reader))) throw new StreamStop('invalid_response', false);
      if (reader) seen.add(reader);
      if (response.status === 401 || response.status === 403) {
        stop(response.status === 401 ? 'authentication_failed' : 'access_denied'); check();
      }
      if (response.status < 200 || response.status >= 300) {
        if (response.status !== 429 && response.status < 500) throw new StreamStop(response.status === 404 ? 'not_found_or_not_visible' : 'invalid_response', false);
      }
      if (!reader) throw new StreamStop('invalid_response', false);
      const success = response.status >= 200 && response.status < 300, chunks: Uint8Array[] = [];
      while (true) {
        const chunk = await guard(Promise.resolve().then(() => { check(); return reader!.read(); }), local.signal);
        if (!chunk || typeof chunk.done !== 'boolean') { stop('internal_review_error'); check(); }
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array) || !Number.isSafeInteger(chunk.value.byteLength)) { stop('internal_review_error'); check(); }
        const n = chunk.value.byteLength, g = globalBytes + n, e = evidenceBytes + (evidence ? n : 0), s = responseBytes + n;
        if (![g, e, s].every(Number.isSafeInteger)) { stop('internal_review_error'); check(); }
        globalBytes = g; evidenceBytes = e; responseBytes = s;
        if (g > limits.totalBytes || s > limits.responseBytes) { stop('receive_budget_exceeded'); check(); }
        if (evidence && (e > limits.evidenceBytes || s > limits.evidenceResponseBytes)) throw new StreamStop('scope_evidence_limit', false);
        if (success) chunks.push(new Uint8Array(chunk.value));
      }
      if (!success) return 'retryable';
      try { const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); JSON.parse(body); if (capture) acceptedBody = body; }
      catch { throw new StreamStop('invalid_response', false); }
      return 'success';
    } catch (error) {
      if (primary) throw new StreamStop(primary, true);
      if (error instanceof StreamStop) throw error;
      return 'retryable'; // Synthetic source/read failure only, never raw exception output.
    } finally {
      local.abort(); if (!settled && primary) cleanup = 'unconfirmed';
      await cancel(reader); if (controller === local) controller = undefined;
    }
  }
  type Start = () => ReturnType<typeof ledger.startInitial>;
  async function run(start: Start, source: SyntheticScopeSource, evidence: boolean, signal?: AbortSignal, capture = false): Promise<Result> {
    if (primary) return failure(primary, true);
    if (busy) return stop('internal_review_error');
    busy = true;
    acceptedBody = undefined;
    const abort = () => { stop('cancelled'); };
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    try {
      for (let n = 0; n < 2; n++) {
        check();
        if (globalBytes >= limits.totalBytes) return stop('receive_budget_exceeded');
        if (evidence && evidenceBytes >= limits.evidenceBytes) { ledger.disableEvidence(); return failure('scope_evidence_limit', false); }
        const started = start();
        if (!started.ok) { if (started.terminal) primary ??= started.code; return failure(started.code, started.terminal); }
        responseBytes = 0;
        let outcome: 'success' | 'retryable' | 'unavailable';
        try { outcome = await attempt(source, started.value.cost.attempt, evidence, capture); }
        catch (error) {
          if (primary) return failure(primary, true);
          const code = error instanceof StreamStop ? error.code : 'internal_review_error';
          const ended = ledger.settle(started.value.attempt, 'unavailable');
          if (!ended.ok) { primary ??= ended.code; return failure(ended.code, true); }
          if (evidenceBytes >= limits.evidenceBytes) ledger.disableEvidence();
          return failure(code, false);
        }
        check();
        const canRetry = outcome === 'retryable' && n === 0 && globalBytes < limits.totalBytes
          && (!evidence || evidenceBytes < limits.evidenceBytes);
        const ended = ledger.settle(started.value.attempt, canRetry ? 'retryable' : outcome === 'success' ? 'success' : 'unavailable');
        if (!ended.ok) { primary ??= ended.code; return failure(ended.code, true); }
        if (evidenceBytes >= limits.evidenceBytes) ledger.disableEvidence();
        if (outcome === 'success') return Object.freeze({ ok: true, value: Object.freeze({ state: 'accepted', response_bytes: responseBytes, cleanup }) });
        if (!canRetry) {
          if (globalBytes >= limits.totalBytes) return stop('receive_budget_exceeded');
          return failure(outcome === 'retryable' ? evidence && evidenceBytes >= limits.evidenceBytes ? 'scope_evidence_limit' : 'upstream_unavailable' : 'invalid_response', false);
        }
      }
      return failure('upstream_unavailable', false);
    } catch (error) { return primary ? failure(primary, true) : stop(error instanceof StreamStop && error.code === 'cancelled' ? 'cancelled' : 'internal_review_error'); }
    finally { busy = false; signal?.removeEventListener('abort', abort); }
  }
  async function receive(start: Start, target: Target, phase: BodyPhase, source: SyntheticScopeSource, evidence: boolean, signal?: AbortSignal) {
    if (busy || bodies.size) return stop('internal_review_error');
    const result = await run(start, source, evidence, signal, true);
    if (!result.ok) { acceptedBody = undefined; return result; }
    if (primary || result.value.cleanup !== 'confirmed' || acceptedBody === undefined) return stop('internal_review_error');
    const receipt = Object.freeze(Object.create(null)) as SyntheticScopeBodyReceipt;
    bodies.set(receipt, { body: acceptedBody, table: target, phase }); acceptedBody = undefined;
    return Object.freeze({ ok: true as const, value: receipt });
  }
  return { ok: true as const, value: Object.freeze({
    parent: ledger.parent, metadata: ledger.metadata,
    admitTable(name: unknown) {
      if (primary) return { ok: false as const, code: primary, terminal: true };
      if (evidenceBytes >= limits.evidenceBytes) return { ok: false as const, code: 'scope_evidence_limit' as const, terminal: false };
      return relay(ledger.admitTable(name));
    },
    tableSlot(table: ScopeBudgetTable) { return relay(ledger.tableSlot(table)); },
    markInitialUnavailable(table: ScopeBudgetTable) { return relay(ledger.markInitialUnavailable(table)); },
    skipFinal(table: ScopeBudgetTable, slot: ScopeBudgetSlot) { return relay(ledger.skipTableFinal(table, slot)); },
    enterFinal() { return relay(ledger.enterFinal()); },
    runInitial(table: ScopeBudgetTable, source: SyntheticScopeSource, signal?: AbortSignal) { return run(() => ledger.startInitial(table), source, true, signal); },
    /** Synthetic composition boundary. Receipts never cross into the real source/worker. */
    async receiveInitial(table: ScopeBudgetTable, source: SyntheticScopeSource, signal?: AbortSignal) {
      return receive(() => ledger.startInitial(table), table, 'initial', source, true, signal);
    },
    receiveOrdinary(target: 'parent' | 'metadata', source: SyntheticScopeSource, signal?: AbortSignal) {
      if (busy || bodies.size) return Promise.resolve(stop('internal_review_error'));
      const read = ledger.openOrdinary('ordinary');
      return read.ok ? receive(() => ledger.startOrdinary(read.value), target, 'ordinary', source, false, signal)
        : Promise.resolve(failure(read.code, read.terminal));
    },
    async receiveFinal(slot: ScopeBudgetSlot, target: Target, source: SyntheticScopeSource, signal?: AbortSignal) {
      if (busy || bodies.size) return stop('internal_review_error');
      if (typeof target !== 'string' && evidenceBytes >= limits.evidenceBytes && !primary) {
        ledger.disableEvidence(); const skipped = ledger.skipTableFinal(target, slot);
        return skipped.ok ? failure('scope_evidence_limit', false) : failure(skipped.code, skipped.terminal);
      }
      return receive(() => ledger.startFinal(slot, target), target, 'final', source, typeof target !== 'string', signal);
    },
    consumeBody(receipt: SyntheticScopeBodyReceipt, table: Target, phase: BodyPhase = 'initial') {
      if (primary) return failure(primary, true);
      const stored = bodies.get(receipt);
      if (!stored || stored.table !== table || stored.phase !== phase) return stop('internal_review_error');
      bodies.delete(receipt);
      return Object.freeze({ ok: true as const, value: stored.body });
    },
    runOrdinary(lane: 'oauth' | 'ordinary', source: SyntheticScopeSource, signal?: AbortSignal) {
      if (busy) return Promise.resolve(stop('internal_review_error'));
      const read = ledger.openOrdinary(lane);
      return read.ok ? run(() => ledger.startOrdinary(read.value), source, false, signal) : Promise.resolve(failure(read.code, read.terminal));
    },
    async runFinal(slot: ScopeBudgetSlot, target: 'parent' | 'metadata' | ScopeBudgetTable, source: SyntheticScopeSource, signal?: AbortSignal): Promise<Result> {
      if (typeof target !== 'string' && evidenceBytes >= limits.evidenceBytes && !primary) {
        if (busy) return stop('internal_review_error');
        ledger.disableEvidence(); const skipped = ledger.skipTableFinal(target, slot);
        return skipped.ok ? failure('scope_evidence_limit', false) : failure(skipped.code, skipped.terminal);
      }
      return run(() => ledger.startFinal(slot, target), source, typeof target !== 'string', signal);
    },
    stop, close() { bodies.clear(); acceptedBody = undefined; primary ??= ledger.stats().primary ?? 'closed'; ledger.close(); controller?.abort(); return failure(primary, true); },
    stats() { return Object.freeze({ ...ledger.stats(), global_bytes: globalBytes, evidence_bytes: evidenceBytes,
      response_bytes: responseBytes, primary: primary ?? ledger.stats().primary, cancel_calls: cancelCalls, cleanup }); },
  }) };
}
