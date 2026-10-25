/** Synthetic issuer ONLY. No production authority, comparison, I/O, worker IPC or permits. */
declare const brand: unique symbol;
type Handle<K extends string> = { readonly [brand]: K };
export type SyntheticScopeSession = Handle<'session'>;
export type SyntheticScopeWorker = Handle<'worker'>;
export type SyntheticScopeJob = Handle<'job'>;
export type SyntheticScopeOwner = Handle<'owner'>;
export type SyntheticScopeUse = Handle<'use'>;
export type SyntheticScopeReceipt = Handle<'receipt'>;
export type SyntheticScopePhase = Handle<'phase'>;
type Phase = 'prepare' | 'initial' | 'final';
type JobState = 'reserved' | 'preparing' | 'prepared' | 'initial_pending' | 'initial_received'
  | 'final_pending' | 'ready_to_consume';
type Reason = 'invalid_session' | 'session_claimed' | 'binding_mismatch' | 'invalid_state' | 'limit' | 'cancelled' | 'worker_exited'
  | 'closed' | 'phase_failed';
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
    reason?: Reason; assets: Set<string> };
  type Use = { owner: SyntheticScopeOwner; job: SyntheticScopeJob; used: boolean; state: JobState };
  type PhaseData = { owner: SyntheticScopeOwner; use: SyntheticScopeUse; job: SyntheticScopeJob; phase: Phase; used: boolean };
  const sessions = new WeakMap<SyntheticScopeSession, Session>();
  const workers = new WeakMap<SyntheticScopeWorker, Worker>();
  const jobs = new WeakMap<SyntheticScopeJob, Job>();
  const owners = new WeakMap<SyntheticScopeOwner, Owner>();
  const uses = new WeakMap<SyntheticScopeUse, Use>();
  const phases = new WeakMap<SyntheticScopePhase, PhaseData>();
  const receipts = new WeakMap<SyntheticScopeReceipt, { owner: SyntheticScopeOwner; used: boolean }>();
  // A session close or worker exit that happened before the owner noticed is still the first cause.
  function pending(owner: Owner): Reason | undefined {
    if (sessions.get(owner.session)?.state !== 'active') return 'invalid_state';
    return workers.get(owner.worker)?.active ? undefined : 'worker_exited';
  }
  // The primary reason is fixed by the first terminal event; later stops and closes never rewrite it.
  function stop(owner: Owner, reason: Reason): Result<never> {
    if (owner.state === 'active') { owner.reason ??= pending(owner) ?? reason; owner.state = 'failed'; }
    return no(owner.reason ?? 'invalid_state');
  }
  function close(owner: Owner): void {
    if (owner.state === 'active') owner.reason ??= pending(owner) ?? 'closed';
    owner.state = 'closed'; owner.assets.clear();
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
      const owner: Owner = { session, worker, state: 'active', assets: new Set() };
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
      const value = handle<SyntheticScopeUse>(); uses.set(value, { owner, job, used: false, state: 'reserved' }); return ok(value);
    },
    beginPrepare: (owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob) => begin(owner, use, job, 'prepare'),
    finishPrepare: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob) => finish(owner, ticket, job, 'prepare', true),
    beginInitial: (owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob) => begin(owner, use, job, 'initial'),
    finishInitial: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob) => finish(owner, ticket, job, 'initial', true),
    beginFinal: (owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob) => begin(owner, use, job, 'final'),
    finishFinal: (owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob) => finish(owner, ticket, job, 'final', true),
    failPhase(owner: SyntheticScopeOwner, ticket: SyntheticScopePhase, job: SyntheticScopeJob): Result<never> {
      const p = phases.get(ticket);
      const result = finish(owner, ticket, job, p?.phase ?? 'prepare', false);
      return result.ok ? no('invalid_state') : result;
    },
    consume(owner: SyntheticScopeOwner, use: SyntheticScopeUse, job: SyntheticScopeJob): Result<SyntheticScopeReceipt> {
      const o = owners.get(owner);
      if (!o) return no('binding_mismatch');
      const active = check(o); if (!active.ok) return active;
      const u = uses.get(use);
      if (!u || u.owner !== owner) return stop(o, 'binding_mismatch');
      if (u.used) return stop(o, 'invalid_state');
      u.used = true; // Claim before remaining binding checks, never reset.
      if (u.job !== job) return stop(o, 'binding_mismatch');
      if (u.state !== 'ready_to_consume') return stop(o, 'invalid_state');
      const value = handle<SyntheticScopeReceipt>(); receipts.set(value, { owner, used: false }); return ok(value);
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
