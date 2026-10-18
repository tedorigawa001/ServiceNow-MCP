/** Dedicated main-process lifecycle only. Never import from the MCP server. */
import { isMainThread } from 'node:worker_threads';
import { loadR2ApprovalManifest } from './r2-approval-manifest.js';
import { runR2ApprovalManifest, R2_RUNNER_TOTAL_MS, R2_RUNNER_CLEANUP_MS, type R2RunnerOptions } from './r2-runner.js';

/** Trusted in-process test boundaries, not IPC/manifest/CLI options. */
export interface R2HostOptions extends R2RunnerOptions { requireApprovedDigest?: boolean }
export async function startR2Host(path: string, options: R2HostOptions = {}): Promise<void> {
  options = { ...options };
  if (!isMainThread || process.platform === 'win32' || !process.send || !process.connected) process.exit(10);
  if (options.requireApprovedDigest !== undefined && typeof options.requireApprovedDigest !== 'boolean') process.exit(10);
  const bound = options.requireApprovedDigest === true;
  let prepared = false, preparedDigest: string | undefined;
  let grantedDigest: string | undefined;
  const total = options.totalTimeoutMs ?? R2_RUNNER_TOTAL_MS;
  const cleanup = options.cleanupTimeoutMs ?? R2_RUNNER_CLEANUP_MS;
  if (!Number.isInteger(total) || total > R2_RUNNER_TOTAL_MS || total <= cleanup ||
      !Number.isInteger(cleanup) || cleanup < 1 || cleanup > R2_RUNNER_CLEANUP_MS) process.exit(10);
  const root = new AbortController();
  const preflightEnd = performance.now() + 5000;
  let phase: 'prepared' | 'running' | 'draining' | 'finished' | 'closing' = 'prepared';
  let end = Infinity, cleanupEnd = Infinity, timer: ReturnType<typeof setTimeout>;
  let stopCode: number | undefined, sentBytes = 0;
  const force = (code: number): never => process.exit(code);
  const arm = (until: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => force(71), Math.max(0, Math.ceil(until - performance.now())));
  };
  const send = (message: object, finished = false) => {
    const bytes = Buffer.byteLength(JSON.stringify(message));
    sentBytes += bytes;
    if (bytes > (finished ? 256 * 1024 : 1024) || sentBytes > 512 * 1024) force(10);
    if (!process.connected) force(10);
    process.send!(message, error => { if (error) force(10); });
  };
  const draining = (remaining = cleanup) => {
    if (cleanupEnd !== Infinity) return;
    cleanupEnd = Math.min(end, performance.now() + Math.min(cleanup, remaining));
    phase = 'draining'; arm(cleanupEnd); send({ type: 'stopping' });
  };
  const stop = (code: number) => {
    if (stopCode !== undefined) force(72);
    if (phase === 'closing') return;
    if (phase === 'finished') force(code);
    stopCode = code; draining(); root.abort();
    // A stop before grant must not start runner loading, binding or OAuth.
    if (end === Infinity) force(code);
  };
  const sigint = () => stop(130), sigterm = () => stop(143);
  const disconnect = () => { if (phase !== 'closing') force(10); };
  let resolveGrant!: () => void;
  const granted = new Promise<void>(resolve => { resolveGrant = resolve; });
  let resolveAck!: () => void;
  const acknowledged = new Promise<void>(resolve => { resolveAck = resolve; });
  let inboundBytes = 0;
  const message = (raw: unknown, handle: unknown) => {
    if (phase === 'prepared' && performance.now() >= preflightEnd) force(10);
    if (phase !== 'prepared' && performance.now() >= Math.min(end, cleanupEnd)) force(71);
    if (handle || !raw || typeof raw !== 'object' || Array.isArray(raw)) force(10);
    const value = raw as Record<string, unknown>;
    const size = Buffer.byteLength(JSON.stringify(value)); inboundBytes += size;
    if (size > 1024 || inboundBytes > 512 * 1024) force(10);
    const keys = Object.keys(value).sort().join(',');
    const grant = bound ? value.type === 'run_grant_v2' && keys === 'digest,remaining_ms,type' && value.digest === preparedDigest
      : value.type === 'run_grant' && keys === 'remaining_ms,type';
    if (grant && prepared && phase === 'prepared' &&
        typeof value.remaining_ms === 'number' && Number.isInteger(value.remaining_ms) &&
        value.remaining_ms > cleanup && value.remaining_ms <= total) {
      grantedDigest = bound ? preparedDigest : undefined;
      end = performance.now() + value.remaining_ms; phase = 'running'; arm(end); resolveGrant();
    } else if (value.type === 'finished_ack' && phase === 'finished' && keys === 'type') {
      phase = 'closing'; resolveAck();
    } else if (value.type === 'stop' && keys === 'type') stop(130);
    else if (value.type === 'force' && keys === 'type') force(72);
    else force(10);
  };
  process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
  process.on('disconnect', disconnect); process.on('message', message);
  // Only offline preflight before grant; no runner, bind or network. Not a human approval proof.
  timer = setTimeout(() => force(10), 5000);
  let preflight: ReturnType<typeof loadR2ApprovalManifest> | undefined;
  try {
    preflight = loadR2ApprovalManifest(path);
    const checked = await preflight.consume((_context, digest) => { preparedDigest = digest; });
    if (!checked.ok) force(10);
  } catch { force(10); }
  finally { preflight?.close(); }
  if (performance.now() >= preflightEnd) force(10);
  prepared = true;
  send(bound ? { type: 'prepared_v2', digest: preparedDigest } : { type: 'prepared' });
  try {
    await granted;
    const outcome = await runR2ApprovalManifest(path, { ...options, expectedManifestDigest: grantedDigest, signal: root.signal, signalOwner: 'host',
      hostRemainingMs: () => Math.max(0, Math.min(end, cleanupEnd) - performance.now()),
      onCleanupStart: notice => draining(notice.remainingMs),
      onReady: () => { send({ type: 'ready' }); },
    });
    if (outcome.cleanup !== 'complete') force(71);
    draining();
    if (performance.now() >= cleanupEnd) force(71);
    phase = 'finished';
    send({ type: 'finished', receipt: outcome }, true);
    await acknowledged;
    process.exitCode = stopCode ?? (outcome.ok ? (outcome.result.isError ? 10 : 0) :
      outcome.code === 'deadline_exceeded' ? 124 : 10);
    process.off('SIGINT', sigint); process.off('SIGTERM', sigterm);
    process.off('message', message); process.off('disconnect', disconnect);
    // Timer remains armed until natural exit: lingering resources must not extend cleanup.
    timer.unref(); process.disconnect!();
  } catch { force(70); }
}
