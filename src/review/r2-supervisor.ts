/** Repository-only supervisor. No OAuth, manifest-body access, token storage or public CLI. */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute } from 'node:path';
import { parseR2HostReceipt } from './r2-host-protocol.js';
import type { R2RunnerOutcome } from './r2-runner.js';

export const R2_SUPERVISOR_TOTAL_MS = 385000;
export const R2_SUPERVISOR_CLEANUP_MS = 3000;
type Reason = 'host_failed' | 'deadline_exceeded' | 'preflight_timeout' | 'protocol_error' | 'cancelled'
  | 'forced_stop' | 'cleanup_incomplete' | 'fatal' | 'termination_unconfirmed' | 'spawn_failed'
  | 'invalid_options' | 'unsupported_platform' | 'completed' | 'review_failed';
export interface R2SupervisorReport {
  schema_version: 'bp5-r2-host-exit-0.1'; terminal_reason: Reason;
  process_termination: 'not_started' | 'confirmed' | 'unconfirmed';
  exit_observed: boolean; close_observed: boolean;
  cleanup: 'complete' | 'incomplete' | 'unknown'; token_issuance: 'not_attempted' | 'possible' | 'unknown';
  other_account_token: 'possible' | 'not_reported' | 'unknown';
  kill_request: 'not_requested' | 'sent' | 'failed';
  host_exit: { code: number | null; signal: NodeJS.Signals | null };
  runner_receipt?: R2RunnerOutcome;
}

export interface R2SupervisorOptions {
  /** Trusted OS boundary only. Never accepted via manifest, IPC, argv or environment. */
  spawnHost?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  totalTimeoutMs?: number; cleanupTimeoutMs?: number; preflightTimeoutMs?: number; observationTimeoutMs?: number;
  signal?: AbortSignal;
  /** Only a fixed ready notification, never an authorization URL. */
  onReady?: () => void;
}
export async function superviseR2Host(path: string, options: R2SupervisorOptions = {}): Promise<R2SupervisorReport> {
  options = { ...options };
  const report: R2SupervisorReport = { schema_version: 'bp5-r2-host-exit-0.1', terminal_reason: 'host_failed',
    process_termination: 'not_started', exit_observed: false, close_observed: false, cleanup: 'unknown',
    token_issuance: 'unknown', other_account_token: 'unknown', kill_request: 'not_requested', host_exit: { code: null, signal: null } };
  const total = options.totalTimeoutMs ?? R2_SUPERVISOR_TOTAL_MS, cleanup = options.cleanupTimeoutMs ?? R2_SUPERVISOR_CLEANUP_MS;
  const preflight = options.preflightTimeoutMs ?? 5000, observation = options.observationTimeoutMs ?? 1000;
  const valid = (n: number, max: number) => Number.isInteger(n) && n > 0 && n <= max;
  if (!valid(total, R2_SUPERVISOR_TOTAL_MS) || !valid(cleanup, R2_SUPERVISOR_CLEANUP_MS) || total <= cleanup ||
      !valid(preflight, 5000) || !valid(observation, 1000) || typeof path !== 'string' || !isAbsolute(path) ||
      path.length > 4096 || path.includes('\0')) { report.terminal_reason = 'invalid_options'; return report; }
  if (process.platform === 'win32') { report.terminal_reason = 'unsupported_platform'; return report; }
  if (options.signal?.aborted) { report.terminal_reason = 'cancelled'; return report; }
  const source = import.meta.url.endsWith('.ts');
  const entry = fileURLToPath(new URL(source ? './r2-host-entry.ts' : './r2-host-entry.js', import.meta.url));
  let args: string[];
  try { args = [...(source ? ['--import', fileURLToPath(import.meta.resolve('tsx'))] : []), entry, path]; }
  catch { report.terminal_reason = 'spawn_failed'; return report; }
  const preflightEnd = performance.now() + preflight;
  let child: ChildProcess;
  try { child = (options.spawnHost ?? spawn)(process.execPath, args,
    { env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], shell: false, detached: true, serialization: 'json' }); }
  catch { report.terminal_reason = 'spawn_failed'; return report; }
  return await new Promise<R2SupervisorReport>(resolve => {
    let phase: 'preflight' | 'running' | 'draining' | 'finished' = 'preflight';
    let end = Infinity, drainEnd = Infinity, received = 0, ready = false, stopping = false, settled = false;
    let stopCount = 0, spawnFailed = false;
    let candidate: R2RunnerOutcome | undefined, ackSent = false, forced = false;
    let hardTimer: ReturnType<typeof setTimeout>, workTimer: ReturnType<typeof setTimeout> | undefined;
    let observationTimer: ReturnType<typeof setTimeout> | undefined;
    const live = () => !report.exit_observed && child.exitCode === null && child.signalCode === null;
    const finish = () => {
      if (settled) return; settled = true;
      if (candidate && performance.now() >= Math.min(end, drainEnd)) {
        forced = true; candidate = undefined; report.terminal_reason = 'deadline_exceeded';
      }
      clearTimeout(hardTimer); clearTimeout(workTimer); clearTimeout(observationTimer);
      process.off('SIGINT', sigint); process.off('SIGTERM', sigterm); options.signal?.removeEventListener('abort', cancelled);
      child.off('message', message); child.off('disconnect', disconnected); child.off('exit', exited); child.off('close', closed);
      // Keep the fixed error sink for any late OS error; never retain/format the Error.
      if (report.exit_observed && report.close_observed) {
        report.process_termination = 'confirmed';
        const expected = stopCount || report.terminal_reason === 'deadline_exceeded' ? 130 : candidate?.ok
          ? candidate.result.isError ? 10 : 0 : candidate?.code === 'deadline_exceeded' ? 124 : 10;
        if (candidate && ackSent && !forced && report.host_exit.signal === null && report.host_exit.code === expected) {
          report.runner_receipt = candidate; report.cleanup = 'complete';
          report.token_issuance = candidate.tokenMayHaveBeenIssued ? 'possible' : 'not_attempted';
          report.other_account_token = candidate.otherAccountTokenPossible ? 'possible' : 'not_reported';
          if (report.terminal_reason === 'host_failed') report.terminal_reason = candidate.ok && !candidate.result.isError ? 'completed' : 'review_failed';
        }
      }
      else if (spawnFailed && report.close_observed) report.process_termination = 'not_started';
      else {
        report.process_termination = 'unconfirmed'; report.terminal_reason = 'termination_unconfirmed';
        try { if (child.connected) child.disconnect(); } catch { /* fixed report only */ }
        child.unref(); // Only abandon our handle after the bounded observation window.
      }
      candidate = undefined;
      resolve(report);
    };
    const observe = () => { observationTimer ??= setTimeout(finish, observation); };
    const force = (reason: Reason) => {
      if (settled || forced) return;
      forced = true; candidate = undefined;
      report.terminal_reason = reason; clearTimeout(hardTimer); clearTimeout(workTimer);
      if (live() && report.kill_request === 'not_requested') {
        try { report.kill_request = child.kill('SIGKILL') ? 'sent' : 'failed'; }
        catch { report.kill_request = 'failed'; }
      }
      observe();
    };
    const send = (value: object, acknowledged?: () => void) => {
      if (settled || !live() || !child.connected) { force('protocol_error'); return; }
      try { child.send(value, error => { if (error && !settled) force('protocol_error'); else if (!settled) acknowledged?.(); }); }
      catch { force('protocol_error'); }
    };
    const drain = () => {
      if (drainEnd !== Infinity) return;
      drainEnd = Math.min(end, performance.now() + cleanup); phase = 'draining';
      clearTimeout(hardTimer); clearTimeout(workTimer);
      hardTimer = setTimeout(() => force(report.terminal_reason === 'host_failed' ? 'cleanup_incomplete' : report.terminal_reason),
        Math.max(0, Math.ceil(drainEnd - performance.now())));
    };
    const stop = (reason: 'cancelled' | 'deadline_exceeded', user: boolean) => {
      if (settled || forced || report.exit_observed) return;
      if (user && ++stopCount > 1) { send({ type: 'force' }); force('forced_stop'); return; }
      if (phase === 'preflight') { force(reason); return; }
      candidate = undefined; // A receipt is provisional until exit+close; cancellation invalidates it.
      report.terminal_reason = reason; drain(); send({ type: 'stop' });
    };
    const sigint = () => stop('cancelled', true), sigterm = () => stop('cancelled', true);
    const cancelled = () => stop('cancelled', true);
    const message = (raw: unknown, handle: unknown) => {
      if (settled || forced || report.exit_observed) return;
      if (phase === 'preflight' && performance.now() >= preflightEnd) { force('preflight_timeout'); return; }
      if (performance.now() >= Math.min(end, drainEnd)) { force('deadline_exceeded'); return; }
      if (handle || !raw || typeof raw !== 'object' || Array.isArray(raw)) { force('protocol_error'); return; }
      const value = raw as Record<string, unknown>;
      const bytes = Buffer.byteLength(JSON.stringify(value)); received += bytes;
      const finished = value.type === 'finished';
      if (bytes > (finished ? 256 * 1024 : 1024) || received > 512 * 1024) { force('protocol_error'); return; }
      if (finished) {
        if (phase !== 'draining' || !stopping || candidate || Object.keys(value).sort().join(',') !== 'receipt,type') {
          force('protocol_error'); return;
        }
        candidate = parseR2HostReceipt(value.receipt);
        if (!candidate) { force('protocol_error'); return; }
        if (candidate.ok && (stopCount > 0 || report.terminal_reason === 'deadline_exceeded')) { force('protocol_error'); return; }
        if (performance.now() >= Math.min(end, drainEnd)) { force('deadline_exceeded'); return; }
        phase = 'finished'; send({ type: 'finished_ack' }, () => { ackSent = true; }); return;
      }
      if (Object.keys(value).join(',') !== 'type') { force('protocol_error'); return; }
      if (value.type === 'prepared' && phase === 'preflight') {
        end = performance.now() + total; phase = 'running';
        // Arm both independent timers BEFORE authorizing host work.
        clearTimeout(hardTimer); hardTimer = setTimeout(() => force('deadline_exceeded'), total);
        workTimer = setTimeout(() => stop('deadline_exceeded', false), total - cleanup);
        send({ type: 'run_grant', remaining_ms: Math.max(0, Math.floor(end - performance.now())) });
      } else if (value.type === 'ready' && phase === 'running' && !ready) {
        ready = true;
        try {
          const returned: unknown = options.onReady?.();
          if (returned !== undefined) { void Promise.resolve(returned).catch(() => {}); force('protocol_error'); }
        } catch { force('protocol_error'); }
      } else if (value.type === 'stopping' && phase !== 'preflight' && !stopping) { stopping = true; drain(); }
      else force('protocol_error');
    };
    const exited = (code: number | null, signal: NodeJS.Signals | null) => {
      report.exit_observed = true; report.host_exit = { code, signal };
      clearTimeout(hardTimer); clearTimeout(workTimer);
      if (report.terminal_reason === 'host_failed') {
        if (code === 70) report.terminal_reason = 'fatal';
        if (code === 71) report.terminal_reason = 'cleanup_incomplete';
        if (code === 72) report.terminal_reason = 'forced_stop';
      }
      if (code === 71) report.cleanup = 'incomplete';
      if (report.close_observed) finish(); else observe();
    };
    const closed = () => { report.close_observed = true; if (report.exit_observed || spawnFailed) finish(); else force('protocol_error'); };
    const disconnected = () => { if (!report.exit_observed && !(phase === 'finished' && ackSent)) force('protocol_error'); };
    child.on('message', message); child.on('exit', exited); child.on('close', closed); child.on('disconnect', disconnected);
    child.on('error', () => { if (!settled) {
      spawnFailed = child.pid === undefined;
      force(spawnFailed ? 'spawn_failed' : 'protocol_error');
    } });
    process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
    options.signal?.addEventListener('abort', cancelled, { once: true });
    hardTimer = setTimeout(() => force('preflight_timeout'), Math.max(0, Math.ceil(preflightEnd - performance.now())));
    if (options.signal?.aborted) cancelled();
  });
}
