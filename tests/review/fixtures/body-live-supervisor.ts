/** Package-excluded event kernel. Commands are values, never native operations. No timers or I/O. */
import { inspectBodyLiveProtocol, isIncompleteBodyLiveControl, STREAM_BYTES, type BodyLiveMode } from './body-live-supervisor-protocol.js';

const MODES = ['reference', 'js', 'js', 'reference'] as const;
const REASONS = ['clock', 'origin', 'event_limit', 'event_conflict', 'prepare', 'spawn', 'stream', 'output_limit',
  'counter_overflow', 'stderr', 'protocol', 'comparison', 'cancelled', 'group', 'signal', 'remove', 'report',
  'parent_lost', 'escaped', 'deadline', 'child', 'none'] as const;
type Reason = typeof REASONS[number];
type Verdict = 'pending' | 'passed' | 'failed' | 'inconclusive';
type StreamName = 'stdout' | 'stderr';
type SignalName = 'SIGTERM' | 'SIGKILL';
type Phase = 'preparing' | 'spawning' | 'running' | 'cleanup' | 'removing' | 'reporting' | 'done';
export type SupervisorEvent =
  | { type: 'prepared'; ok: boolean }
  | { type: 'spawned'; pid: number }
  | { type: 'spawn_error'; noneCreated: boolean }
  | { type: 'attach' | 'end' | 'stream_error'; stream: StreamName }
  | { type: 'data'; stream: StreamName; bytes: Uint8Array }
  | { type: 'exit' | 'close'; code: number | null; signal: string | null }
  | { type: 'group'; state: 'alive' | 'absent' | 'unknown' }
  | { type: 'signal'; name: SignalName; result: 'ok' | 'ESRCH' | 'error' }
  | { type: 'removed' | 'reported'; ok: boolean }
  | { type: 'fault'; point: 'clock' | 'prepare' | 'report' | 'parent_lost' | 'escaped' }
  | { type: 'tick' | 'cancel' };
export type SupervisorCommand = Readonly<{ kind: 'prepare' | 'spawn' | 'listen' | 'probe' | 'signal' | 'remove' | 'report';
  ordinal: number; mode: BodyLiveMode; at: number; stream?: StreamName; signal?: SignalName }>;
interface Stream {
  attached: boolean; ended: boolean; error: boolean; seen: number; retained: number; truncated: boolean;
  overflow: boolean; bytes: Uint8Array;
}
interface End { code: number | null; signal: string | null; at: number }
interface Run {
  token: object; ordinal: number; mode: BodyLiveMode; phase: Phase; t0: number; last: number;
  deadline: number; cleanupDeadline?: number; stopAt?: number; first: Reason; flags: Set<Reason>;
  pid?: number; neverSpawned: boolean; exit?: End; close?: End; stdout: Stream; stderr: Stream;
  group: 'unknown' | 'alive' | 'absent'; groupAt?: number; absent: number; absentAt?: number; nextProbe: number; probing: boolean;
  signals: Map<SignalName, 'pending' | 'ok' | 'ESRCH' | 'error'>;
  signalAt: Map<SignalName, number>;
  events: number; verdict: Verdict; reason: string; cleanupConfirmed: boolean; timeKnown: boolean;
  protocol: 'pending' | 'valid' | 'incomplete' | 'invalid'; fingerprint?: string;
  removed: boolean; reportDelivered: boolean;
}
const stream = (): Stream => ({ attached: false, ended: false, error: false, seen: 0, retained: 0,
  truncated: false, overflow: false, bytes: new Uint8Array(STREAM_BYTES) });

/** Saturating checked arithmetic, shared by the actual stream counting path. */
export function addSupervisorBytes(seen: number, addition: number) {
  if (!Number.isSafeInteger(seen) || seen < 0 || !Number.isSafeInteger(addition) || addition < 0
    || addition > Number.MAX_SAFE_INTEGER - seen) return { seen: Number.MAX_SAFE_INTEGER, overflow: true };
  return { seen: seen + addition, overflow: false };
}

export function createBodyLiveSupervisor() {
  let active: Run | undefined, starts = 0, first: Reason = 'none', baseline: string | undefined;
  let initialVerdict: Verdict = 'pending';
  const commands: SupervisorCommand[] = [];
  const completed: ReturnType<typeof snapshot>[] = [];
  function command(r: Run, kind: SupervisorCommand['kind'], extra: Partial<SupervisorCommand> = {}) {
    if (commands.length >= 32) { flag(r, 'event_limit'); return; }
    commands.push(Object.freeze({ kind, ordinal: r.ordinal, mode: r.mode, at: r.last, ...extra }));
  }
  function flag(r: Run, reason: Reason) {
    if (r.first === 'none') r.first = reason;
    if (first === 'none') first = reason;
    r.flags.add(reason);
  }
  function cleanup(r: Run) {
    if (r.cleanupDeadline === undefined) r.cleanupDeadline = Math.min(r.last + 3_000, r.t0 + 63_000);
    r.phase = 'cleanup';
  }
  function signal(r: Run, name: SignalName) {
    if (!r.pid || r.signals.has(name) || r.group === 'absent') return;
    r.signals.set(name, 'pending'); r.signalAt.set(name, r.last); command(r, 'signal', { signal: name });
  }
  function stop(r: Run, reason: Reason) {
    flag(r, reason);
    if (r.stopAt === undefined) r.stopAt = r.last;
    if (r.phase === 'removing' || r.phase === 'reporting' || r.phase === 'done') { classify(r); return; }
    cleanup(r); signal(r, 'SIGTERM');
  }
  function probe(r: Run) {
    if (r.pid && !r.probing && r.absent < 2 && r.last >= r.nextProbe) {
      r.probing = true; command(r, 'probe');
    }
  }
  function sample(r: Run, now: number) {
    if (!Number.isFinite(now) || now < 0 || now < r.last) {
      r.timeKnown = false; stop(r, 'clock'); return false;
    }
    r.last = now;
    if (r.phase !== 'done' && !r.close && now >= r.deadline) stop(r, 'deadline');
    return true;
  }
  function validate(r: Run) {
    if (!r.stdout.ended || r.protocol !== 'pending') return;
    const raw = r.stdout.bytes.subarray(0, r.stdout.retained);
    const result = inspectBodyLiveProtocol(raw, r.mode);
    if (!result.ok && r.flags.has('deadline') && isIncompleteBodyLiveControl(raw)) { r.protocol = 'incomplete'; return; }
    if (!result.ok) { r.protocol = 'invalid'; stop(r, 'protocol'); return; }
    r.protocol = 'valid'; r.fingerprint = result.fingerprint;
    if (baseline !== undefined && baseline !== r.fingerprint) stop(r, 'comparison');
  }
  function classify(r: Run) {
    r.cleanupConfirmed = r.neverSpawned || Boolean(r.pid && r.exit && r.close && r.stdout.attached
      && r.stderr.attached && r.stdout.ended && r.stderr.ended && r.absent === 2
      && !r.flags.has('group') && !r.flags.has('signal') && [...r.signals.values()].every(x => x !== 'pending')
      && r.timeKnown && !r.flags.has('escaped'));
    const anomalies = REASONS.filter(x => x !== 'none' && x !== 'deadline' && x !== 'child' && r.flags.has(x));
    if (anomalies.length) { r.verdict = 'failed'; r.reason = anomalies[0]; }
    else if (!r.cleanupConfirmed) { r.verdict = 'failed'; r.reason = 'cleanup_unconfirmed'; }
    else if (r.flags.has('deadline')) {
      r.verdict = r.mode === 'reference' ? 'inconclusive' : 'failed';
      r.reason = r.mode === 'reference' ? 'control_deadline' : 'child_deadline';
    } else if (r.flags.has('child') || r.protocol !== 'valid') { r.verdict = 'failed'; r.reason = 'child'; }
    else { r.verdict = 'passed'; r.reason = 'none'; }
  }
  function report(r: Run) { r.phase = 'reporting'; command(r, 'report'); }
  function settle(r: Run, ceiling = false) {
    if (r.phase !== 'cleanup') return;
    probe(r);
    const collected = r.neverSpawned || Boolean(r.exit && r.close && r.stdout.ended && r.stderr.ended && r.absent === 2
      && [...r.signals.values()].every(x => x !== 'pending'));
    if (!collected && !ceiling) return;
    validate(r); classify(r);
    r.stdout.bytes = new Uint8Array(0); r.stderr.bytes = new Uint8Array(0);
    if (r.cleanupConfirmed) { r.phase = 'removing'; command(r, 'remove'); } else report(r);
  }
  function snapshot(r: Run) {
    const view = (s: Stream) => Object.freeze({ attached: s.attached, ended: s.ended, error: s.error,
      seen: s.seen, retained: s.retained, truncated: s.truncated, overflow: s.overflow });
    return Object.freeze({ ordinal: r.ordinal, mode: r.mode, phase: r.phase, first: r.first,
      verdict: r.verdict, reason: r.reason, startedAt: r.t0, deadline: r.deadline, cleanupDeadline: r.cleanupDeadline,
      execution: Object.freeze({ stopped: r.stopAt !== undefined, stopAt: r.stopAt, timeKnown: r.timeKnown,
        flags: Object.freeze(REASONS.filter(x => r.flags.has(x))) }),
      process: Object.freeze({ spawned: r.pid !== undefined, neverSpawned: r.neverSpawned,
        exit: r.exit && Object.freeze({ ...r.exit }), close: r.close && Object.freeze({ ...r.close }) }),
      streams: Object.freeze({ stdout: view(r.stdout), stderr: view(r.stderr), protocol: r.protocol }),
      group: Object.freeze({ state: r.group, at: r.groupAt, absent: r.absent, absentAt: r.absentAt,
        signals: Object.freeze([...r.signals].map(([name, result]) => Object.freeze({ name, result, at: r.signalAt.get(name) }))) }),
      cleanupConfirmed: r.cleanupConfirmed, removed: r.removed, reportDelivered: r.reportDelivered,
      retainedDuty: !r.cleanupConfirmed || !r.removed, events: r.events });
  }
  function send(token: object, now: number, e: SupervisorEvent) {
    const r = active;
    if (!r) return false;
    if (r.phase === 'done') return false;
    if (token !== r.token) { stop(r, 'origin'); return false; }
    // Two 64-KiB streams delivered one byte per event, plus 128 control events.
    if (r.events < 131_200) r.events++; else stop(r, 'event_limit');
    if (!sample(r, now)) {
      settle(r, true); classify(r); r.phase = 'done'; completed.push(snapshot(r)); return false;
    }
    if ((r.phase === 'removing' || r.phase === 'reporting') && now >= r.cleanupDeadline!) {
      flag(r, r.phase === 'removing' ? 'remove' : 'report'); classify(r);
      r.phase = 'done'; completed.push(snapshot(r)); return false;
    }
    if ((r.phase === 'removing' || r.phase === 'reporting') && e.type !== 'tick' && e.type !== 'cancel'
      && e.type !== 'fault' && e.type !== (r.phase === 'removing' ? 'removed' : 'reported')) {
      stop(r, 'event_conflict'); return false;
    }
    if (e.type === 'fault') {
      if (e.point === 'clock') r.timeKnown = false;
      stop(r, e.point); settle(r, true);
      if (e.point === 'clock') { classify(r); r.phase = 'done'; completed.push(snapshot(r)); }
      return true;
    }
    switch (e.type) {
      case 'prepared':
        if (r.phase !== 'preparing') { stop(r, 'event_conflict'); break; }
        if (!e.ok) { r.neverSpawned = true; stop(r, 'prepare'); }
        else { r.phase = 'spawning'; command(r, 'spawn'); }
        break;
      case 'spawned':
        if (r.phase !== 'spawning' || !Number.isSafeInteger(e.pid) || e.pid <= 1) { stop(r, 'event_conflict'); break; }
        r.pid = e.pid; r.phase = 'running';
        command(r, 'listen', { stream: 'stdout' }); command(r, 'listen', { stream: 'stderr' }); break;
      case 'spawn_error':
        if (r.phase !== 'spawning') { stop(r, 'event_conflict'); break; }
        r.neverSpawned = e.noneCreated; stop(r, 'spawn'); break;
      case 'attach':
        if (!r.pid || r.phase !== 'running' || r[e.stream].attached || r[e.stream].ended) stop(r, 'event_conflict');
        else r[e.stream].attached = true;
        break;
      case 'data': {
        const s = r[e.stream];
        if (!s.attached || s.ended || r.phase === 'removing' || r.phase === 'reporting') { stop(r, 'stream'); break; }
        const counted = addSupervisorBytes(s.seen, e.bytes.byteLength);
        s.seen = counted.seen; s.overflow ||= counted.overflow;
        const n = Math.min(e.bytes.byteLength, STREAM_BYTES - s.retained);
        if (n) { s.bytes.set(e.bytes.subarray(0, n), s.retained); s.retained += n; }
        s.truncated ||= s.seen > STREAM_BYTES;
        if (s.overflow) stop(r, 'counter_overflow');
        if (s.truncated) stop(r, 'output_limit');
        if (e.stream === 'stderr' && s.seen) stop(r, 'stderr');
        break;
      }
      case 'end':
        if (!r[e.stream].attached) stop(r, 'stream');
        r[e.stream].ended = true; validate(r); break;
      case 'stream_error': r[e.stream].error = true; stop(r, 'stream'); break;
      case 'exit': case 'close': {
        const old = r[e.type];
        if (old) { if (old.code !== e.code || old.signal !== e.signal) stop(r, 'event_conflict'); break; }
        r[e.type] = { code: e.code, signal: e.signal, at: now };
        const other = e.type === 'exit' ? r.close : r.exit;
        if (other && (other.code !== e.code || other.signal !== e.signal)) stop(r, 'event_conflict');
        if (e.code !== 0 || e.signal !== null) stop(r, 'child');
        if (e.type === 'close') { if (now >= r.deadline) stop(r, 'deadline'); cleanup(r); }
        break;
      }
      case 'group':
        if (!r.probing) { stop(r, 'event_conflict'); break; }
        r.probing = false; r.group = e.state; r.groupAt = now;
        if (e.state === 'absent') {
          if (r.absent === 0) { r.absent = 1; r.absentAt = now; }
          else if (now - r.absentAt! >= 100) r.absent = 2;
        } else {
          r.absent = 0; r.absentAt = undefined;
          if (e.state === 'unknown') stop(r, 'group');
          else if (r.close) stop(r, 'group');
        }
        r.nextProbe = now + 100; break;
      case 'signal':
        if (r.signals.get(e.name) !== 'pending') { stop(r, 'event_conflict'); break; }
        r.signals.set(e.name, e.result);
        if (e.result === 'error') stop(r, 'signal'); break;
      case 'removed':
        if (r.phase !== 'removing') { stop(r, 'event_conflict'); break; }
        r.removed = e.ok; if (!e.ok) { flag(r, 'remove'); classify(r); } report(r); break;
      case 'reported':
        if (r.phase !== 'reporting') { stop(r, 'event_conflict'); break; }
        r.reportDelivered = e.ok;
        if (!e.ok) flag(r, 'report');
        classify(r);
        r.phase = 'done';
        if (r.verdict === 'passed' && baseline === undefined) baseline = r.fingerprint;
        completed.push(snapshot(r)); break;
      case 'cancel': stop(r, 'cancelled'); break;
      case 'tick': break;
    }
    if (r.phase === 'cleanup') {
      if (r.stopAt !== undefined && now >= r.stopAt + 1_000 && r.group === 'alive'
        && r.groupAt !== undefined && r.groupAt >= r.stopAt + 1_000) signal(r, 'SIGKILL');
      settle(r, r.cleanupDeadline !== undefined && now >= r.cleanupDeadline);
    }
    return true;
  }
  return Object.freeze({
    start(now: number): object | undefined {
      if (first !== 'none' || starts === 4 || (active && (active.phase !== 'done' || active.verdict !== 'passed' || !active.reportDelivered))) return undefined;
      if (!Number.isFinite(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - 63_000 || (active && now < active.last)) {
        first = 'clock'; initialVerdict = 'failed'; return undefined;
      }
      const r: Run = { token: Object.freeze({}), ordinal: ++starts, mode: MODES[starts - 1], phase: 'preparing',
        t0: now, last: now, deadline: now + 60_000, first: 'none', flags: new Set(), neverSpawned: false,
        stdout: stream(), stderr: stream(), group: 'unknown', absent: 0, nextProbe: now, probing: false,
        signals: new Map(), signalAt: new Map(), events: 0, verdict: 'pending', reason: 'none', cleanupConfirmed: false,
        timeKnown: true, protocol: 'pending', removed: false, reportDelivered: false };
      active = r; command(r, 'prepare'); return r.token;
    },
    send,
    cancel(now: number) {
      if (active && active.phase !== 'done') send(active.token, now, { type: 'cancel' });
      else if (starts < 4) { if (first === 'none') first = 'cancelled'; initialVerdict = 'failed'; }
    },
    drain(): readonly SupervisorCommand[] { return Object.freeze(commands.splice(0)); },
    inspect() { return Object.freeze({ first, starts, verdict: initialVerdict === 'failed' ? initialVerdict : active?.verdict ?? initialVerdict,
      complete: first === 'none' && starts === 4 && active?.phase === 'done' && active.verdict === 'passed',
      run: active && snapshot(active), completed: Object.freeze([...completed]), normalRoute: 'unchanged',
      formalIssuance: 'closed', wholeRunAdmission: false }); },
  });
}
