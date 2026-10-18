/** Repository-only ownership boundary. No HTTP listener, runner, storage or public MCP registration. */
import { inspect } from 'node:util';
import { R2PdiOAuthAdapter, PdiOAuthError, type PdiOAuthConfig, type PdiOAuthOptions,
  type PdiOAuthFailure } from './r2-pdi-oauth.js';
import { R2ReviewSession, R2SessionError, type R2Failure, type R2Permit,
  type R2SessionOptions } from './r2-session.js';
import type { BoundedReviewOutcome } from './update-set-adapter.js';

export interface R2OAuthPlan extends PdiOAuthConfig {
  expectedUserSysId: string; updateSetSysId: string; reviewReleaseConfig?: unknown;
}
export interface R2OAuthConnectionOptions extends PdiOAuthOptions {
  identityTimeoutMs?: number; identityBytes?: number; workerFactory?: R2SessionOptions['workerFactory'];
}
export type R2ConnectionFailure = PdiOAuthFailure | R2Failure | 'cleanup_incomplete';
export type R2ConnectionOutcome = { ok: true } | { ok: false; code: R2ConnectionFailure };
export type R2ConnectionReview = { ok: true; outcome: BoundedReviewOutcome } | { ok: false; code: R2ConnectionFailure };

export class R2OAuthSessionConnection {
  #adapter: R2PdiOAuthAdapter;
  #session?: R2ReviewSession;
  #permit?: R2Permit;
  #plan: R2OAuthPlan;
  #options: R2SessionOptions;
  #root = new AbortController();
  #phase: 'waiting' | 'verifying' | 'verified' | 'reviewing' | 'closed' = 'waiting';
  #reason?: R2ConnectionFailure;
  #issued = false;
  #otherAccount = false;
  #closing?: Promise<void>;
  #lifetime?: ReturnType<typeof setTimeout>;
  #removeExternal: () => void;

  constructor(plan: R2OAuthPlan, options: R2OAuthConnectionOptions = {}) {
    if (typeof plan.expectedUserSysId !== 'string' || !/^[a-f0-9]{32}$/.test(plan.expectedUserSysId)
      || typeof plan.updateSetSysId !== 'string' || !/^[a-f0-9]{32}$/.test(plan.updateSetSysId)) throw new R2SessionError('invalid_session');
    for (const [value, maximum] of [[options.identityTimeoutMs, 10000], [options.identityBytes, 65536]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > maximum)) throw new R2SessionError('invalid_session');
    }
    try { this.#plan = structuredClone(plan); } catch { throw new R2SessionError('invalid_session'); }
    const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
    const transport: typeof fetch = (url, init) => {
      // Conservative receipt: starting a token POST may issue a token even if the response is lost.
      if (new URL(String(url)).pathname === '/oauth_token.do') this.#issued = true;
      return fetcher(url, init);
    };
    const now = options.now ?? (() => performance.now());
    this.#options = { fetch: transport, now, signal: this.#root.signal,
      identityTimeoutMs: options.identityTimeoutMs, identityBytes: options.identityBytes, workerFactory: options.workerFactory };
    this.#adapter = new R2PdiOAuthAdapter(this.#plan, { ...options, now, fetch: transport, signal: this.#root.signal });
    const cancel = () => { this.#reason ??= 'cancelled'; void this.close().catch(() => {}); };
    options.signal?.addEventListener('abort', cancel, { once: true });
    this.#removeExternal = () => options.signal?.removeEventListener('abort', cancel);
    this.#lifetime = setTimeout(() => {
      this.#reason ??= 'authorization_timeout'; void this.#shutdown().catch(() => {});
    }, options.authorizationTimeoutMs ?? 300000);
    this.#lifetime.unref();
    if (options.signal?.aborted) cancel();
  }
  status() { return { phase: this.#phase, hasCredential: this.#session?.status().hasCredential ?? false,
    tokenMayHaveBeenIssued: this.#issued, otherAccountTokenPossible: this.#otherAccount }; }
  toJSON() { return this.status(); }
  [inspect.custom]() { return this.status(); }
  #failed(): { ok: false; code: R2ConnectionFailure } { return { ok: false, code: this.#reason ?? 'invalid_session' }; }
  async withAuthorizationRequest(consumer: (url: string) => Promise<void>): Promise<R2ConnectionOutcome> {
    if (this.#phase !== 'waiting') return { ok: false, code: this.#reason ?? 'authorization_unavailable' };
    const result = await this.#adapter.withAuthorizationRequest(consumer);
    if (!result.ok && this.#adapter.status().phase === 'closed') {
      this.#reason ??= result.code; await this.#shutdown();
    }
    return result;
  }
  async exchangeAndVerify(target: string): Promise<R2ConnectionOutcome> {
    if (this.#phase !== 'waiting') return { ok: false, code: this.#reason ?? 'authorization_unavailable' };
    this.#phase = 'verifying';
    try {
      const pendingExchange = this.#adapter.exchangeCallback(target);
      if (this.#adapter.status().phase === 'exchanging') clearTimeout(this.#lifetime);
      const exchange = await pendingExchange;
      if (!exchange.ok) {
        if (exchange.code === 'callback_rejected' && !this.#root.signal.aborted) {
          this.#phase = 'waiting'; return exchange;
        }
        this.#reason ??= exchange.code; await this.#shutdown(); return this.#failed();
      }
      if (this.#root.signal.aborted) { await this.#shutdown(); return this.#failed(); }
      const consumed = await this.#adapter.consumeToken(async token => {
        if (this.#root.signal.aborted) throw new R2SessionError('cancelled');
        this.#session = new R2ReviewSession({ instanceUrl: this.#plan.instanceUrl, clientId: this.#plan.clientId,
          expectedUserSysId: this.#plan.expectedUserSysId, updateSetSysId: this.#plan.updateSetSysId,
          reviewReleaseConfig: this.#plan.reviewReleaseConfig, ...token }, this.#options);
        this.#lifetime = setTimeout(() => {
          this.#reason ??= 'token_expired'; void this.#shutdown().catch(() => {});
        }, Math.ceil(token.issuedAt + token.expiresInSeconds * 1000 - 5000 - this.#options.now!()));
        this.#lifetime.unref();
      });
      if (!consumed.ok || !this.#session || this.#root.signal.aborted) {
        this.#reason ??= consumed.ok ? 'cancelled' : consumed.code;
        await this.#shutdown(); return this.#failed();
      }
      const verified = await this.#session.verify();
      if (!verified.ok || this.#root.signal.aborted) {
        if (!verified.ok && verified.code === 'identity_mismatch') this.#otherAccount = true;
        this.#reason ??= verified.ok ? 'cancelled' : verified.code;
        await this.#shutdown(); return this.#failed();
      }
      this.#permit = verified.permit; this.#phase = 'verified'; return { ok: true };
    } catch (error) {
      this.#reason ??= error instanceof R2SessionError || error instanceof PdiOAuthError ? error.code : 'review_failed';
      try { await this.#shutdown(); } catch { /* fixed cleanup reason is retained */ }
      return this.#failed();
    }
  }
  async review(raw: unknown, signal?: AbortSignal): Promise<R2ConnectionReview> {
    if (this.#phase === 'reviewing') return { ok: false, code: 'review_busy' };
    if (this.#phase !== 'verified' || !this.#session || !this.#permit) return this.#failed();
    this.#phase = 'reviewing';
    const permit = this.#permit; this.#permit = undefined;
    try {
      const result = await this.#session.review(permit, raw, signal);
      if (!result.ok) this.#reason ??= result.code;
      await this.#shutdown();
      return this.#reason ? this.#failed() : result;
    } catch {
      this.#reason ??= 'review_failed';
      try { await this.#shutdown(); } catch { /* fixed cleanup reason is retained */ }
      return this.#failed();
    }
  }
  close(): Promise<void> {
    if (this.#phase !== 'closed') this.#reason ??= 'cancelled';
    return this.#shutdown();
  }
  #shutdown(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#phase = 'closed'; this.#permit = undefined;
    clearTimeout(this.#lifetime);
    this.#removeExternal(); this.#root.abort(); this.#adapter.close();
    this.#closing = (async () => {
      try { await this.#session?.close(); }
      catch { this.#reason = 'cleanup_incomplete'; throw Error('cleanup_incomplete'); }
      finally { this.#session = undefined; }
    })();
    return this.#closing;
  }
}
