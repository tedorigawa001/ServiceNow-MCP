/** Repository-only ownership boundary. No HTTP listener, storage or public MCP registration. */
import { inspect } from 'node:util';
import { R2PdiOAuthAdapter, PdiOAuthError, type PdiOAuthConfig, type PdiOAuthOptions,
  type PdiOAuthFailure } from './r2-pdi-oauth.js';
import { R2ReviewSession, R2SessionError, type R2Failure, type R2Permit,
  type R2SessionOptions } from './r2-session.js';
import type { BoundedReviewOutcome } from './update-set-adapter.js';
import { createR2ReviewBridge } from './r2-mcp-bridge.js';
import { REVIEW_TOOL_NAME } from '../tools/best-practice.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

export interface R2OAuthPlan extends PdiOAuthConfig {
  expectedUserSysId: string; updateSetSysId: string; reviewReleaseConfig?: unknown;
}
export interface R2OAuthConnectionOptions extends PdiOAuthOptions {
  identityTimeoutMs?: number; identityBytes?: number; workerFactory?: R2SessionOptions['workerFactory'];
}
export type R2ConnectionFailure = PdiOAuthFailure | R2Failure | 'cleanup_incomplete' | 'secret_output_detected';
export type R2ConnectionOutcome = { ok: true } | { ok: false; code: R2ConnectionFailure };
export type R2ConnectionReview = { ok: true; outcome: BoundedReviewOutcome } | { ok: false; code: R2ConnectionFailure };
export type R2McpReview = { ok: true; result: { isError: boolean; content: Array<{ type: 'text'; text: string }> }; mcpListed: true }
  | { ok: false; code: R2ConnectionFailure };

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
  #bridge?: Awaited<ReturnType<typeof createR2ReviewBridge>>;
  #mcpListed = false;
  #sensitive = new Set<string>();

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
      if (new URL(String(url)).pathname === '/oauth_token.do') {
        this.#issued = true;
        const body = new URLSearchParams(String(init?.body));
        this.#remember(body.get('code'), body.get('code_verifier'));
      }
      return fetcher(url, init);
    };
    const now = options.now ?? (() => performance.now());
    this.#options = { fetch: transport, now, signal: this.#root.signal,
      identityTimeoutMs: options.identityTimeoutMs, identityBytes: options.identityBytes, workerFactory: options.workerFactory };
    this.#adapter = new R2PdiOAuthAdapter(this.#plan, { ...options, now, fetch: transport, signal: this.#root.signal });
    this.#remember(this.#plan.clientId, this.#plan.expectedUserSysId);
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
  mcpStatus() { return { listed: this.#mcpListed, cleanupComplete: this.#reason !== 'cleanup_incomplete' }; }
  #remember(...values: Array<string | null | undefined>) {
    for (const value of values) if (value) this.#sensitive.add(value);
  }
  #safeOutput(value: unknown) {
    const text = JSON.stringify(value);
    for (const secret of this.#sensitive) {
      const variants = [secret, encodeURIComponent(secret), new URLSearchParams({ x: secret }).toString().slice(2)];
      for (const variant of variants) {
        let escaped = variant;
        for (let level = 0; level < 3; level++) {
          if (text.includes(escaped)) return false;
          escaped = JSON.stringify(escaped).slice(1, -1);
        }
      }
    }
    return true;
  }
  #failed(): { ok: false; code: R2ConnectionFailure } { return { ok: false, code: this.#reason ?? 'invalid_session' }; }
  async withAuthorizationRequest(consumer: (url: string) => Promise<void>): Promise<R2ConnectionOutcome> {
    if (this.#phase !== 'waiting') return { ok: false, code: this.#reason ?? 'authorization_unavailable' };
    const result = await this.#adapter.withAuthorizationRequest(async url => {
      this.#remember(url, new URL(url).searchParams.get('state')); await consumer(url);
    });
    if (!result.ok && this.#adapter.status().phase === 'closed') {
      this.#reason ??= result.code; await this.#shutdown();
    }
    return result;
  }
  /** Trusted listener hook: called once when a code/error is consumed, never for rejected callbacks. */
  async exchangeAndVerify(target: string, onAccepted?: () => void): Promise<R2ConnectionOutcome> {
    if (this.#phase !== 'waiting') return { ok: false, code: this.#reason ?? 'authorization_unavailable' };
    this.#phase = 'verifying';
    try {
      const pendingExchange = this.#adapter.exchangeCallback(target, () => {
        this.#remember(new URL(target, this.#plan.instanceUrl).searchParams.get('code'));
        clearTimeout(this.#lifetime); onAccepted?.();
      });
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
        this.#remember(token.bearerToken);
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
  /** Same private permit, but through actual SDK list/call. Never exports the session or bridge. */
  async reviewViaMcp(raw: unknown, signal?: AbortSignal): Promise<R2McpReview> {
    if (this.#phase === 'reviewing') return { ok: false, code: 'review_busy' };
    if (this.#phase !== 'verified' || !this.#session || !this.#permit) return this.#failed();
    this.#phase = 'reviewing'; const permit = this.#permit; this.#permit = undefined;
    try {
      const bridge = await createR2ReviewBridge(this.#session, permit);
      if (this.#root.signal.aborted) { await bridge.close(); return this.#failed(); }
      this.#bridge = bridge;
      const combined = signal ? AbortSignal.any([signal, this.#root.signal]) : this.#root.signal;
      const listed = await this.#bridge.client.listTools({}, { signal: combined });
      if (listed.tools.length !== 1 || listed.tools[0].name !== REVIEW_TOOL_NAME || listed.tools[0].annotations?.readOnlyHint !== true) throw Error();
      this.#mcpListed = true;
      const response = await this.#bridge.client.callTool({ name: REVIEW_TOOL_NAME, arguments: raw as Record<string, unknown> },
        CallToolResultSchema, { signal: combined, timeout: 60000 });
      if (this.#root.signal.aborted || combined.aborted) return this.#failed();
      const content = response.content;
      if (!Array.isArray(content) || content.length !== 1 || content[0].type !== 'text' || typeof content[0].text !== 'string') throw Error();
      if (!this.#safeOutput(response)) return { ok: false, code: 'secret_output_detected' };
      return { ok: true, mcpListed: true, result: { isError: response.isError === true, content: [{ type: 'text', text: content[0].text }] } };
    } catch { return { ok: false, code: this.#reason ?? (signal?.aborted ? 'cancelled' : 'review_failed') }; }
    finally { await this.#shutdown(); }
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
      try { await Promise.all([this.#bridge?.close(), this.#session?.close()]); }
      catch { this.#reason = 'cleanup_incomplete'; throw Error('cleanup_incomplete'); }
      finally { this.#session = undefined; this.#bridge = undefined; this.#sensitive.clear(); }
    })();
    return this.#closing;
  }
}
