/** Repository-only explicit runner. No CLI, browser launch, token storage or configuration mutation. */
import { loadR2ApprovalManifest, R2ManifestError, R2_APPROVAL_RUN_MS } from './r2-approval-manifest.js';
import type { R2OAuthConnectionOptions, R2McpReview } from './r2-oauth-session.js';
import { R2LoopbackListener, R2_START_URL } from './r2-loopback.js';

export const R2_RUNNER_TOTAL_MS = R2_APPROVAL_RUN_MS;
export const R2_RUNNER_CLEANUP_MS = 3000;
export type R2CleanupReason = 'completed' | 'cancelled' | 'interrupted' | 'deadline_exceeded' | 'failed';
export interface R2CleanupNotice { readonly reason: R2CleanupReason; readonly remainingMs: number }
/** Trusted test/host boundaries only. Not CLI, manifest or MCP arguments. */
export interface R2RunnerOptions extends R2OAuthConnectionOptions {
  /** Trusted approval binding; checked against the consumed immutable snapshot before bind. */
  expectedManifestDigest?: string;
  onReady?: (url: string) => void | Promise<void>;
  totalTimeoutMs?: number; cleanupTimeoutMs?: number;
  signalOwner?: 'runner' | 'host';
  /** Synchronous notification only; no context, promise or result handoff. */
  onCleanupStart?: (notice: R2CleanupNotice) => void;
  /** Same-process monotonic remaining budget; observations may shorten, never extend a deadline. */
  hostRemainingMs?: () => number;
}
type McpResult = Extract<R2McpReview, { ok: true }>['result'];
interface Receipt { cleanup: 'complete' | 'incomplete'; mcpListed: boolean;
  tokenMayHaveBeenIssued: boolean; otherAccountTokenPossible: boolean }
export type R2RunnerOutcome = Receipt & ({ ok: true; result: McpResult } | { ok: false; code: string });
class Stopped extends Error {}
class HostBudgetError extends Error {}
const limit = (value: number | undefined, ceiling: number) => {
  const n = value ?? ceiling;
  if (!Number.isInteger(n) || n < 1 || n > ceiling) throw new Stopped();
  return n;
};

export async function runR2ApprovalManifest(path: string, options: R2RunnerOptions = {}): Promise<R2RunnerOutcome> {
  options = { ...options };
  let listener: R2LoopbackListener | undefined;
  let starting: Promise<R2LoopbackListener> | undefined;
  let manifest: ReturnType<typeof loadR2ApprovalManifest> | undefined;
  let result: McpResult | undefined, code: string | undefined;
  let workTimer: ReturnType<typeof setTimeout> | undefined;
  const root = new AbortController();
  const receipt: Receipt = { cleanup: 'complete', mcpListed: false, tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false };
  let cleanupMs = R2_RUNNER_CLEANUP_MS, end = Infinity, workEnd = Infinity;
  let cleanupStarted = false, cleanupEnd = Infinity;
  let hostEnd = Infinity;
  const now = options.now ?? (() => performance.now());
  const observeHostBudget = () => {
    const at = now();
    if (!Number.isFinite(at)) throw new HostBudgetError();
    if (options.hostRemainingMs !== undefined) {
      let remaining: unknown;
      try { remaining = options.hostRemainingMs(); } catch { throw new HostBudgetError(); }
      if (typeof remaining !== 'number' || !Number.isFinite(remaining)) {
        // Never await an invalid async reader, but consume a possible rejection.
        void Promise.resolve(remaining).catch(() => {});
        throw new HostBudgetError();
      }
      hostEnd = Math.min(hostEnd, at + Math.max(0, Math.min(remaining, R2_RUNNER_TOTAL_MS)));
    }
    return at;
  };
  const beginCleanup = (reason: R2CleanupReason) => {
    if (cleanupStarted) return;
    cleanupStarted = true;
    let remainingMs = 0;
    try {
      const at = observeHostBudget();
      cleanupEnd = Math.min(end, hostEnd, at + cleanupMs);
      remainingMs = Math.max(0, Math.floor(cleanupEnd - at));
    } catch { cleanupEnd = 0; }
    try {
      const returned: unknown = typeof options.onCleanupStart === 'function'
        ? options.onCleanupStart(Object.freeze({ reason, remainingMs })) : undefined;
      if (returned !== undefined) {
        void Promise.resolve(returned).catch(() => {});
        throw new Stopped();
      }
    } catch { code = 'cleanup_notification_failed'; result = undefined; }
  };
  const stop = (reason: 'cancelled' | 'interrupted' | 'deadline_exceeded') => { code ??= reason; beginCleanup(reason); root.abort(); };
  const external = () => stop('cancelled');
  const interrupted = () => stop('interrupted');
  const check = () => {
    let at: number;
    try { at = observeHostBudget(); }
    catch { code ??= 'host_budget_invalid'; beginCleanup('failed'); root.abort(); throw new Stopped(); }
    end = Math.min(end, hostEnd);
    const nextWorkEnd = Math.min(workEnd, hostEnd - cleanupMs);
    if (nextWorkEnd < workEnd) {
      workEnd = nextWorkEnd; clearTimeout(workTimer);
      workTimer = setTimeout(() => stop('deadline_exceeded'), Math.max(0, Math.ceil(workEnd - at)));
    }
    if (at >= workEnd) stop('deadline_exceeded');
    if (root.signal.aborted) throw new Stopped();
  };
  const guard = async <T>(pending: Promise<T>): Promise<T> => {
    let abort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      abort = () => reject(new Stopped());
      root.signal.addEventListener('abort', abort, { once: true });
      if (root.signal.aborted) abort();
    });
    try { const value = await Promise.race([pending, aborted]); check(); return value; }
    finally { root.signal.removeEventListener('abort', abort); }
  };
  try {
    const total = limit(options.totalTimeoutMs, R2_RUNNER_TOTAL_MS);
    cleanupMs = limit(options.cleanupTimeoutMs, R2_RUNNER_CLEANUP_MS);
    if ((options.signalOwner !== undefined && options.signalOwner !== 'runner' && options.signalOwner !== 'host')
      || (options.signalOwner === 'host' && !options.signal)) throw new Stopped();
    if ((options.hostRemainingMs !== undefined && typeof options.hostRemainingMs !== 'function')
      || (options.onCleanupStart !== undefined && typeof options.onCleanupStart !== 'function')) throw new Stopped();
    if (total <= cleanupMs) { code = 'invalid_runner_options'; throw new Stopped(); }
    if (options.expectedManifestDigest !== undefined && (typeof options.expectedManifestDigest !== 'string'
      || !/^[a-f0-9]{64}$/.test(options.expectedManifestDigest))) throw new Stopped();
    if (options.signal?.aborted) { stop('cancelled'); throw new Stopped(); }
    const hostObservedAt = observeHostBudget();
    if (hostEnd - hostObservedAt <= cleanupMs) { stop('deadline_exceeded'); throw new Stopped(); }
    manifest = loadR2ApprovalManifest(path);
    options.signal?.addEventListener('abort', external, { once: true });
    if (options.signal?.aborted) external();
    if (options.signalOwner !== 'host') { process.on('SIGINT', interrupted); process.on('SIGTERM', interrupted); }
    const consumed = await manifest.consume(async (context, digest) => {
      if (options.expectedManifestDigest !== undefined && digest !== options.expectedManifestDigest) { code = 'manifest_changed'; return; }
      try {
        const started = observeHostBudget();
        end = Math.min(started + total, hostEnd); workEnd = end - cleanupMs;
        workTimer = setTimeout(() => stop('deadline_exceeded'), Math.max(0, Math.ceil(workEnd - started)));
        check();
        starting = R2LoopbackListener.start({ ...context.plan, scopes: [...context.plan.scopes] }, { ...options, signal: root.signal });
        // Retain late bind ownership even when cancellation wins the race.
        void starting.then(value => { listener = value; if (root.signal.aborted) void value.close().catch(() => {}); }, () => {});
        listener = await guard(starting);
        await guard(Promise.resolve().then(() => { check(); return options.onReady?.(R2_START_URL); }));
        const auth = await guard(listener.completion);
        if (!auth.ok) { code = auth.code; return; }
        const reviewed = await guard(listener.reviewViaMcp(context.review, root.signal));
        if (!reviewed.ok) { code = reviewed.code; return; }
        result = reviewed.result; receipt.mcpListed = reviewed.mcpListed;
      } catch (error) {
        if (!code) code = error instanceof HostBudgetError ? 'host_budget_invalid'
          : error instanceof Error && ['callback_unavailable', 'cancelled'].includes(error.message)
          ? error.message : 'runner_failed';
      }
    });
    if (!consumed.ok) code ??= consumed.code;
  } catch (error) {
    code ??= error instanceof R2ManifestError ? error.code : 'invalid_runner_options';
  } finally {
    beginCleanup(result && !code ? 'completed' : code === 'cancelled' || code === 'interrupted' || code === 'deadline_exceeded' ? code : 'failed');
    clearTimeout(workTimer); manifest?.close(); root.abort();
    options.signal?.removeEventListener('abort', external);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (starting) {
        const at = observeHostBudget(); cleanupEnd = Math.min(cleanupEnd, hostEnd);
        const remaining = Math.max(0, cleanupEnd - at);
        const pendingStart = starting;
        const cleanup = async () => {
          // The async start failure path waits for its own cleanup. Cancellation must not
          // turn an unresolved startup into an unearned cleanup-complete receipt.
          const owned = await pendingStart.catch(() => undefined);
          if (!owned) return;
          listener = owned;
          await owned.close();
          const status = owned.status();
          if (status.listening || status.connection.hasCredential || !owned.runnerStatus().cleanupComplete) throw new Stopped();
        };
        await Promise.race([cleanup(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Stopped()), remaining);
        })]);
      }
    } catch { receipt.cleanup = 'incomplete'; code = 'cleanup_incomplete'; result = undefined; }
    finally {
      clearTimeout(timer);
      if (options.signalOwner !== 'host') { process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted); }
      const status = listener?.status().connection;
      receipt.mcpListed = listener?.runnerStatus().listed ?? false;
      receipt.tokenMayHaveBeenIssued = status?.tokenMayHaveBeenIssued ?? false;
      receipt.otherAccountTokenPossible = status?.otherAccountTokenPossible ?? false;
    }
  }
  return result && !code ? { ok: true, result, ...receipt } : { ok: false, code: code ?? 'runner_failed', ...receipt };
}
