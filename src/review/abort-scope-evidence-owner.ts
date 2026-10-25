/** Synthetic issuer ONLY. No production authority, I/O, worker IPC or permits. */
import { createScopeEvidenceContext, createPayloadScopeEvidence, createTableScopeObservation, compareScopeEvidence,
  type ScopeEvidenceContext, type PayloadScopeEvidence, type TableScopeObservation,
  type ScopeEvidenceComparison } from './abort-scope-evidence.js';
declare const brand: unique symbol;
type Handle<K extends string> = { readonly [brand]: K };
export type SyntheticScopeSession = Handle<'session'>;
export type SyntheticScopeWorker = Handle<'worker'>;
export type SyntheticScopeJob = Handle<'job'>;
export type SyntheticScopeOwner = Handle<'owner'>;
export type SyntheticScopeUse = Handle<'use'>;
export type SyntheticScopeReceipt = Handle<'receipt'>;
export type SyntheticScopePhase = Handle<'phase'>;
export type SyntheticScopeComparisonReceipt = Handle<'comparison_receipt'>;
type Phase = 'prepare' | 'initial' | 'final';
type JobState = 'reserved' | 'preparing' | 'prepared' | 'initial_pending' | 'initial_received'
  | 'final_pending' | 'ready_to_consume';
type Reason = 'invalid_session' | 'session_claimed' | 'binding_mismatch' | 'invalid_state' | 'limit' | 'cancelled' | 'worker_exited'
  | 'closed' | 'phase_failed' | 'evidence_invalid' | 'evidence_missing'
  | NonNullable<ScopeEvidenceComparison['reason']>;
type Result<T> = Readonly<{ ok: true; value: T } | { ok: false; reason: Reason }>;
type State = 'active' | 'failed' | 'closed';
const handle = <T>() => Object.freeze(Object.create(null)) as T;
const ok = <T>(value: T): Result<T> => Object.freeze({ ok: true, value });
const no = (reason: Reason): Result<never> => Object.freeze({ ok: false, reason });

/** Each invocation is an isolated synthetic issuer realm; handles cannot cross issuers. */
export function createSyntheticScopeOwnerIssuer() {
  type Session = { state: State; claimed: boolean; owner?: Owner; jobs: number };
  type Worker = { session: SyntheticScopeSession; active: boolean };
  type Job = { session: SyntheticScopeSession; worker: SyntheticScopeWorker; asset: string };
  type Owner = { session: SyntheticScopeSession; worker: SyntheticScopeWorker; state: State;
    reason?: Reason; assets: Set<string>; uses: Set<SyntheticScopeUse> };
  type Use = { owner: SyntheticScopeOwner; job: SyntheticScopeJob; used: boolean; state: JobState };
  type PhaseData = { owner: SyntheticScopeOwner; use: SyntheticScopeUse; job: SyntheticScopeJob; phase: Phase; used: boolean };
  type Evidence = { context: ScopeEvidenceContext; payload: PayloadScopeEvidence;
    initial?: TableScopeObservation; final?: TableScopeObservation };
  const sessions = new WeakMap<SyntheticScopeSession, Session>();
  const workers = new WeakMap<SyntheticScopeWorker, Worker>();
  const jobs = new WeakMap<SyntheticScopeJob, Job>();
  const owners = new WeakMap<SyntheticScopeOwner, Owner>();
  const uses = new WeakMap<SyntheticScopeUse, Use>();
  const phases = new WeakMap<SyntheticScopePhase, PhaseData>();
  const evidence = new WeakMap<SyntheticScopeUse, Evidence>();
  const comparisons = new WeakMap<SyntheticScopeComparisonReceipt,
    { owner: SyntheticScopeOwner; used: boolean; result: ScopeEvidenceComparison }>();
  const receipts = new WeakMap<SyntheticScopeReceipt, { owner: SyntheticScopeOwner; used: boolean }>();
  // A session close or worker exit that happened before the owner noticed is still the first cause.
  function pending(owner: Owner): Reason | undefined {
    if (sessions.get(owner.session)?.state !== 'active') return 'invalid_state';
    return workers.get(owner.worker)?.active ? undefined : 'worker_exited';
  }
  // The primary reason is fixed by the first terminal event; later stops and closes never rewrite it.
  function stop(owner: Owner, reason: Reason): Result<never> {
    if (owner.state === 'active') { owner.reason ??= pending(owner) ?? reason; owner.state = 'failed'; }
    for (const use of owner.uses) evidence.delete(use);
    owner.uses.clear();
    return no(owner.reason ?? 'invalid_state');
  }
  function close(owner: Owner): void {
    if (owner.state === 'active') owner.reason ??= pending(owner) ?? 'closed';
    owner.state = 'closed'; owner.assets.clear();
    for (const use of owner.uses) evidence.delete(use);
    owner.uses.clear();
  }
  function check(owner: Owner): Result<true> {
    if (owner.state !== 'active') return no(owner.reason ?? 'invalid_state');
    const reason = pending(owner);
    return reason ? stop(owner, reason) : ok(true);
  }
  const transitions = Object.freeze({
    prepare: { before: 'reserved', pending: 'preparing', after: 'prepared' },
    initial: { before: 'prepared', pending: 'initial_pending', after: 'initial_received' },
    final: { before: 'initial_received', pending: 'final_pending', after: 'ready_to_consume' },
  } as const);
  function begin(owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob,
    phase: Phase): Result<SyntheticScopePhase> {
    const o = owners.get(owner);
    if (!o) return no('binding_mismatch');
    const active = check(o); if (!active.ok) return active;
    const u = uses.get(use);
    if (!u || u.owner !== owner || u.job !== job) return stop(o, 'binding_mismatch');
    if (u.used || u.state !== transitions[phase].before) return stop(o, 'invalid_state');
    u.state = transitions[phase].pending; // Start is sticky before any asynchronous caller work.
    const value = handle<SyntheticScopePhase>();
    phases.set(value, { owner, use, job, phase, used: false }); return ok(value);
  }
  function finish(owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob,
    phase: Phase, success: boolean): Result<true> {
    const o = owners.get(owner);
    if (!o) return no('binding_mismatch');
    const active = check(o); if (!active.ok) return active;
    const p = phases.get(ticket);
    if (!p || p.owner !== owner) return stop(o, 'binding_mismatch');
    if (p.used) return stop(o, 'invalid_state');
    p.used = true; // Failed binding/phase checks cannot make this ticket reusable.
    if (p.job !== job || p.phase !== phase) return stop(o, 'binding_mismatch');
    const u = uses.get(p.use);
    if (!u || u.used || u.state !== transitions[phase].pending) return stop(o, 'invalid_state');
    if (!success) return stop(o, 'phase_failed');
    u.state = transitions[phase].after; return ok(true);
  }
  function claim(owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob): Result<true> {
    const o = owners.get(owner);
    if (!o) return no('binding_mismatch');
    const active = check(o); if (!active.ok) return active;
    const u = uses.get(use);
    if (!u || u.owner !== owner) return stop(o, 'binding_mismatch');
    if (u.used) return stop(o, 'invalid_state');
    u.used = true;
    if (u.job !== job) return stop(o, 'binding_mismatch');
    if (u.state !== 'ready_to_consume') return stop(o, 'invalid_state');
    return ok(true);
  }
  function finishObservation(owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob,
    phase: 'initial' | 'final', raw: unknown): Result<true> {
    const done = finish(owner, ticket, job, phase, true); if (!done.ok) return done;
    const o = owners.get(owner)!, p = phases.get(ticket)!, e = evidence.get(p.use);
    if (!e) return stop(o, 'evidence_missing');
    try {
      // One snapshot for both checks: a getter must not show the phase check and the factory different values.
      const snapshot: unknown = structuredClone(raw);
      // Do not accept the wrong observation phase even if its timestamp looks plausible.
      if (!snapshot || typeof snapshot !== 'object' || !('phase' in snapshot) || snapshot.phase !== phase)
        return stop(o, 'invalid_phase_order');
      const obs = createTableScopeObservation(e.context, snapshot);
      if (!obs.ok) return stop(o, 'evidence_invalid');
      const active = check(o); if (!active.ok) return active;
      e[phase] = obs.value; return ok(true);
    } catch { return stop(o, 'evidence_invalid'); }
  }
  return Object.freeze({
    issueSession(): SyntheticScopeSession {
      const value = handle<SyntheticScopeSession>();
      sessions.set(value, { state: 'active', claimed: false, jobs: 0 }); return value;
    },
    issueWorker(session: SyntheticScopeSession): Result<SyntheticScopeWorker> {
      if (sessions.get(session)?.state !== 'active') return no('invalid_session');
      const value = handle<SyntheticScopeWorker>(); workers.set(value, { session, active: true }); return ok(value);
    },
    issueJob(session: SyntheticScopeSession, worker: SyntheticScopeWorker, asset: string): Result<SyntheticScopeJob> {
      const s = sessions.get(session), w = workers.get(worker);
      if (!s || s.state !== 'active') return no('invalid_session');
      if (!w?.active || w.session !== session || !/^[a-f0-9]{32}$/.test(asset)) return no('binding_mismatch');
      if (s.jobs >= 100) return no('limit');
      s.jobs++;
      const value = handle<SyntheticScopeJob>(); jobs.set(value, { session, worker, asset }); return ok(value);
    },
    createOwner(session: SyntheticScopeSession, worker: SyntheticScopeWorker): Result<SyntheticScopeOwner> {
      const s = sessions.get(session);
      if (!s || s.state !== 'active') return no('invalid_session');
      if (s.claimed) return no('session_claimed');
      s.claimed = true; // Sticky before worker validation. Failure cannot reopen this session.
      const w = workers.get(worker);
      if (!w?.active || w.session !== session) return no('binding_mismatch');
      const value = handle<SyntheticScopeOwner>();
      const owner: Owner = { session, worker, state: 'active', assets: new Set(), uses: new Set() };
      owners.set(value, owner); s.owner = owner; return ok(value);
    },
    reserve(owner: SyntheticScopeOwner, job: SyntheticScopeJob): Result<SyntheticScopeUse> {
      const o = owners.get(owner);
      if (!o) return no('binding_mismatch');
      const active = check(o); if (!active.ok) return active;
      const j = jobs.get(job);
      if (!j || j.session !== o.session || j.worker !== o.worker) return stop(o, 'binding_mismatch');
      if (o.assets.has(j.asset)) return stop(o, 'invalid_state');
      if (o.assets.size >= 100) return stop(o, 'limit');
      o.assets.add(j.asset);
      const value = handle<SyntheticScopeUse>(); uses.set(value, { owner, job, used: false, state: 'reserved' });
      o.uses.add(value); return ok(value);
    },
    beginPrepare: (owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob) => begin(owner, use, job, 'prepare'),
    finishPrepare: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob) => finish(owner, ticket, job, 'prepare', true),
    beginInitial: (owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob) => begin(owner, use, job, 'initial'),
    finishInitial: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob) => finish(owner, ticket, job, 'initial', true),
    beginFinal: (owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob) => begin(owner, use, job, 'final'),
    finishFinal: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob) => finish(owner, ticket, job, 'final', true),
    finishPrepareEvidence(owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob,
      rawContext: unknown, rawPayload: unknown): Result<true> {
      const done = finish(owner, ticket, job, 'prepare', true); if (!done.ok) return done;
      const o = owners.get(owner)!, p = phases.get(ticket)!;
      try {
        // One snapshot for both checks: a getter must not bind the context to one asset and pass the job check with another.
        const snapshot: unknown = structuredClone(rawContext);
        const c = createScopeEvidenceContext(snapshot);
        if (!c.ok) return stop(o, 'evidence_invalid');
        if (!snapshot || typeof snapshot !== 'object' || !('asset_sys_id' in snapshot)
          || snapshot.asset_sys_id !== jobs.get(job)?.asset) return stop(o, 'evidence_binding_mismatch');
        const payload = createPayloadScopeEvidence(c.value, rawPayload);
        if (!payload.ok) return stop(o, payload.reason === 'evidence_binding_mismatch' ? payload.reason : 'evidence_invalid');
        const active = check(o); if (!active.ok) return active;
        evidence.set(p.use, { context: c.value, payload: payload.value }); return ok(true);
      } catch { return stop(o, 'evidence_invalid'); }
    },
    finishInitialEvidence: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob, raw: unknown) =>
      finishObservation(owner, ticket, job, 'initial', raw),
    finishFinalEvidence: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob, raw: unknown) =>
      finishObservation(owner, ticket, job, 'final', raw),
    failPhase(owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob): Result<never> {
      const p = phases.get(ticket);
      const result = finish(owner, ticket, job, p?.phase ?? 'prepare', false);
      return result.ok ? no('invalid_state') : result;
    },
    consume(owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob): Result<SyntheticScopeReceipt> {
      const claimed = claim(owner, use, job); if (!claimed.ok) return claimed;
      evidence.delete(use);
      const value = handle<SyntheticScopeReceipt>(); receipts.set(value, { owner, used: false }); return ok(value);
    },
    compareAndConsume(owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob,
      comparedAt: unknown): Result<SyntheticScopeComparisonReceipt> {
      const claimed = claim(owner, use, job); if (!claimed.ok) return claimed;
      const o = owners.get(owner)!, e = evidence.get(use);
      evidence.delete(use); // No retry or correction after any comparison attempt.
      if (!e?.initial || !e.final) return stop(o, 'evidence_missing');
      try {
        const result = compareScopeEvidence(e.context, e.payload, e.initial, e.final, comparedAt);
        if (result.status === 'rejected') return stop(o, result.reason ?? 'evidence_invalid');
        const active = check(o); if (!active.ok) return active;
        const value = handle<SyntheticScopeComparisonReceipt>();
        comparisons.set(value, { owner, used: false, result }); return ok(value);
      } catch { return stop(o, 'evidence_invalid'); }
    },
    acceptComparison(owner: SyntheticScopeOwner, receipt: SyntheticScopeComparisonReceipt): Result<ScopeEvidenceComparison> {
      const o = owners.get(owner);
      if (!o) return no('binding_mismatch');
      const active = check(o); if (!active.ok) return active;
      const r = comparisons.get(receipt);
      if (!r || r.owner !== owner) return stop(o, 'binding_mismatch');
      if (r.used) return stop(o, 'invalid_state');
      r.used = true; return ok(r.result);
    },
    accept(owner: SyntheticScopeOwner, receipt: SyntheticScopeReceipt): Result<true> {
      const o = owners.get(owner);
      if (!o) return no('binding_mismatch');
      const active = check(o); if (!active.ok) return active;
      const r = receipts.get(receipt);
      if (!r || r.owner !== owner) return stop(o, 'binding_mismatch');
      if (r.used) return stop(o, 'invalid_state');
      r.used = true; return ok(true);
    },
    cancel(owner: SyntheticScopeOwner): void { const o = owners.get(owner); if (o) stop(o, 'cancelled'); },
    closeOwner(owner: SyntheticScopeOwner): void { const o = owners.get(owner); if (o) close(o); },
    closeSession(session: SyntheticScopeSession): void {
      const s = sessions.get(session); if (!s) return;
      if (s.owner) close(s.owner); // Before the session state changes, so the owner records its own cause.
      s.state = 'closed';
    },
    exitWorker(worker: SyntheticScopeWorker): void { const w = workers.get(worker); if (w) w.active = false; },
  });
}
