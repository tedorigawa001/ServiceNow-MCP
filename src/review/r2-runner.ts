/** Repository-only explicit runner. No CLI, browser launch, token storage or configuration mutation. */
import { loadR2ApprovalManifest, R2ManifestError, R2_APPROVAL_RUN_MS } from './r2-approval-manifest.js';
import type { R2OAuthConnectionOptions, R2McpReview } from './r2-oauth-session.js';
import { R2LoopbackListener, R2_START_URL } from './r2-loopback.js';

export const R2_RUNNER_TOTAL_MS = R2_APPROVAL_RUN_MS;
export const R2_RUNNER_CLEANUP_MS = 3000;
/** Trusted test/host boundaries only. Not CLI, manifest or MCP arguments. */
export interface R2RunnerOptions extends R2OAuthConnectionOptions {
  onReady?: (url: string) => void | Promise<void>;
  totalTimeoutMs?: number; cleanupTimeoutMs?: number;
}
type McpResult = Extract<R2McpReview, { ok: true }>['result'];
interface Receipt { cleanup: 'complete' | 'incomplete'; mcpListed: boolean;
  tokenMayHaveBeenIssued: boolean; otherAccountTokenPossible: boolean }
export type R2RunnerOutcome = Receipt & ({ ok: true; result: McpResult } | { ok: false; code: string });
class Stopped extends Error {}
const limit = (value: number | undefined, ceiling: number) => {
  const n = value ?? ceiling;
  if (!Number.isInteger(n) || n < 1 || n > ceiling) throw new Stopped();
  return n;
};

export async function runR2ApprovalManifest(path: string, options: R2RunnerOptions = {}): Promise<R2RunnerOutcome> {
  let listener: R2LoopbackListener | undefined;
  let manifest: ReturnType<typeof loadR2ApprovalManifest> | undefined;
  let result: McpResult | undefined, code: string | undefined;
  let workTimer: ReturnType<typeof setTimeout> | undefined;
  const root = new AbortController();
  const receipt: Receipt = { cleanup: 'complete', mcpListed: false, tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false };
  let cleanupMs = R2_RUNNER_CLEANUP_MS, end = Infinity, workEnd = Infinity;
  const now = options.now ?? (() => performance.now());
  const stop = (reason: string) => { code ??= reason; root.abort(); };
  const external = () => stop('cancelled');
  const interrupted = () => stop('interrupted');
  const check = () => {
    const at = now();
    if (!Number.isFinite(at) || at >= workEnd) stop('deadline_exceeded');
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
    if (total <= cleanupMs) { code = 'invalid_runner_options'; throw new Stopped(); }
    if (options.signal?.aborted) { stop('cancelled'); throw new Stopped(); }
    manifest = loadR2ApprovalManifest(path);
    options.signal?.addEventListener('abort', external, { once: true });
    process.on('SIGINT', interrupted); process.on('SIGTERM', interrupted);
    const consumed = await manifest.consume(async context => {
      try {
        const started = now(); if (!Number.isFinite(started)) { stop('deadline_exceeded'); throw new Stopped(); }
        end = started + total; workEnd = end - cleanupMs;
        workTimer = setTimeout(() => stop('deadline_exceeded'), total - cleanupMs);
        check();
        const starting = R2LoopbackListener.start({ ...context.plan, scopes: [...context.plan.scopes] }, { ...options, signal: root.signal });
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
        if (!code) code = error instanceof Error && ['callback_unavailable', 'cancelled'].includes(error.message)
          ? error.message : 'runner_failed';
      }
    });
    if (!consumed.ok) code ??= consumed.code;
  } catch (error) {
    code ??= error instanceof R2ManifestError ? error.code : 'invalid_runner_options';
  } finally {
    clearTimeout(workTimer); manifest?.close(); root.abort();
    options.signal?.removeEventListener('abort', external);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const remaining = Math.min(cleanupMs, Math.max(0, end - now()));
      if (listener) {
        await Promise.race([listener.close(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Stopped()), remaining);
        })]);
        const status = listener.status();
        if (status.listening || status.connection.hasCredential || !listener.runnerStatus().cleanupComplete) throw new Stopped();
      }
    } catch { receipt.cleanup = 'incomplete'; code = 'cleanup_incomplete'; result = undefined; }
    finally {
      clearTimeout(timer);
      process.removeListener('SIGINT', interrupted); process.removeListener('SIGTERM', interrupted);
      const status = listener?.status().connection;
      receipt.mcpListed = listener?.runnerStatus().listed ?? false;
      receipt.tokenMayHaveBeenIssued = status?.tokenMayHaveBeenIssued ?? false;
      receipt.otherAccountTokenPossible = status?.otherAccountTokenPossible ?? false;
    }
  }
  return result && !code ? { ok: true, result, ...receipt } : { ok: false, code: code ?? 'runner_failed', ...receipt };
}
