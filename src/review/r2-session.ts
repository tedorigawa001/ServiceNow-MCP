/** Internal, opt-in R-2 PoC. No OAuth exchange, CLI registration or persistence. */
import { inspect } from 'node:util';
import { z } from 'zod';
import { ServiceNowClient } from '../servicenow/client.js';
import { BoundedReadSession, type BoundedReadOptions } from '../servicenow/bounded-read.js';
import { executeBestPracticeToolCall, REVIEW_TOOL_NAME } from '../tools/best-practice.js';
import { reviewUpdateSetInputSchema, type BoundedReviewOutcome } from './update-set-adapter.js';
import type { ReviewWorkerFactory } from './worker-supervisor.js';

export type R2Failure = 'invalid_session' | 'identity_access_denied' | 'identity_unconfirmed' | 'identity_mismatch'
  | 'identity_request_failed' | 'identity_budget_exceeded' | 'cancelled' | 'token_expired' | 'review_busy' | 'review_failed';
export class R2SessionError extends Error {
  constructor(readonly code: R2Failure) { super(code); this.name = 'R2SessionError'; }
}
declare const verifiedBrand: unique symbol;
export type R2Permit = { readonly [verifiedBrand]: true };
export type R2Verification = { ok: true; permit: R2Permit } | { ok: false; code: R2Failure };
export type R2ReviewResult = { ok: true; outcome: BoundedReviewOutcome } | { ok: false; code: R2Failure };
export interface R2SessionConfig {
  instanceUrl: string; clientId: string; expectedUserSysId: string; updateSetSysId: string;
  bearerToken: string; expiresInSeconds: number;
  /** Monotonic timestamp of the start of the exchange, not its completion. */
  issuedAt: number;
  reviewReleaseConfig?: unknown;
}
/** Trusted transport/clock injection, never MCP arguments. Ceilings can only be lowered. */
export interface R2SessionOptions {
  fetch?: typeof fetch; signal?: AbortSignal; now?: () => number;
  identityTimeoutMs?: number; identityBytes?: number;
  workerFactory?: ReviewWorkerFactory;
}
const sysId = /^[a-f0-9]{32}$/;
const identitySchema = z.strictObject({ result: z.array(z.strictObject({ sys_id: z.string().regex(sysId) })).length(1) });
const lower = (value: number | undefined, ceiling: number) => {
  if (value === undefined) return ceiling;
  if (!Number.isInteger(value) || value < 1 || value > ceiling) throw new R2SessionError('invalid_session');
  return value;
};

export class R2ReviewSession {
  #token?: string;
  #origin: string;
  #expected: string;
  #state: 'new' | 'verifying' | 'verified' | 'reviewing' | 'closed' = 'new';
  #permit?: R2Permit;
  #reason?: R2Failure;
  #controller = new AbortController();
  #fetch: typeof fetch;
  #now: () => number;
  #expires: number;
  #timer: ReturnType<typeof setTimeout>;
  #timeout: number;
  #bytes: number;
  #removeExternal: () => void;
  #target: string;
  #release?: unknown;
  #reads = new Set<BoundedReadSession>();
  #pending?: Promise<unknown>;
  #workerFactory?: ReviewWorkerFactory;

  constructor(config: R2SessionConfig, options: R2SessionOptions = {}) {
    this.#now = options.now ?? (() => performance.now());
    let origin: URL;
    try { origin = new URL(config.instanceUrl); } catch { throw new R2SessionError('invalid_session'); }
    const now = this.#now();
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
      || !['', '/'].includes(origin.pathname) || !sysId.test(config.expectedUserSysId) || !sysId.test(config.updateSetSysId)
      || typeof config.clientId !== 'string' || !config.clientId || config.clientId.length > 256
      || typeof config.bearerToken !== 'string' || !/^[A-Za-z0-9._~+\/-]+=*$/.test(config.bearerToken)
      || config.bearerToken.length > 8192 || !Number.isInteger(config.expiresInSeconds)
      || config.expiresInSeconds < 1 || config.expiresInSeconds > 900 || !Number.isFinite(now)
      || !Number.isFinite(config.issuedAt) || config.issuedAt > now) throw new R2SessionError('invalid_session');
    this.#timeout = lower(options.identityTimeoutMs, 10000);
    this.#bytes = lower(options.identityBytes, 65536);
    this.#expires = config.issuedAt + config.expiresInSeconds * 1000 - 5000;
    if (this.#expires <= now) throw new R2SessionError('token_expired');
    this.#origin = origin.origin;
    this.#expected = config.expectedUserSysId;
    this.#target = config.updateSetSysId;
    try { this.#release = structuredClone(config.reviewReleaseConfig); }
    catch { throw new R2SessionError('invalid_session'); }
    this.#token = config.bearerToken;
    this.#fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.#workerFactory = options.workerFactory;
    this.#timer = setTimeout(() => this.#revoke('token_expired'), Math.ceil(this.#expires - now));
    this.#timer.unref();
    const cancel = () => this.#revoke('cancelled');
    options.signal?.addEventListener('abort', cancel, { once: true });
    this.#removeExternal = () => options.signal?.removeEventListener('abort', cancel);
    if (options.signal?.aborted) this.#revoke('cancelled');
  }
  status() { return { state: this.#state, hasCredential: this.#token !== undefined }; }
  toJSON() { return this.status(); }
  [inspect.custom]() { return this.status(); }
  #check() {
    if (this.#now() >= this.#expires) this.#revoke('token_expired');
    if (this.#state === 'closed') throw new R2SessionError(this.#reason ?? 'invalid_session');
  }
  #revoke(reason?: R2Failure) {
    if (this.#state === 'closed') return;
    this.#reason = reason;
    this.#state = 'closed'; this.#permit = undefined; this.#token = undefined;
    this.#expected = ''; this.#release = undefined;
    clearTimeout(this.#timer); this.#removeExternal(); this.#controller.abort();
    // The adapter retains admission until its CPU worker has actually exited.
    // Its finally closes snapshots; do not release them early during abort.
  }
  async close() {
    this.#revoke();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([this.#pending?.catch(() => {}), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new R2SessionError('review_failed')), 2000);
    })]); }
    finally { clearTimeout(timer); }
  }
  verify(): Promise<R2Verification> {
    const work = this.#verify(); this.#pending = work;
    return work.finally(() => { if (this.#pending === work) this.#pending = undefined; });
  }
  async #verify(): Promise<R2Verification> {
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const request = new AbortController();
    try {
      this.#check();
      if (this.#state !== 'new') throw new R2SessionError('invalid_session');
      this.#state = 'verifying';
      onAbort = () => request.abort();
      this.#controller.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => { this.#revoke('identity_budget_exceeded'); request.abort(); }, this.#timeout);
      const guard = async <T>(pending: Promise<T>): Promise<T> => {
        let abort!: () => void;
        const cancelled = new Promise<never>((_, reject) => {
          abort = () => reject(new R2SessionError(this.#reason ?? 'invalid_session'));
          request.signal.addEventListener('abort', abort, { once: true });
          if (request.signal.aborted) abort();
        });
        try { return await Promise.race([pending, cancelled]); }
        finally { request.signal.removeEventListener('abort', abort); }
      };
      const url = new URL('/api/now/table/sys_user', this.#origin);
      url.search = new URLSearchParams({ sysparm_query: 'sys_id=javascript:gs.getUserID()', sysparm_fields: 'sys_id',
        sysparm_limit: '2', sysparm_display_value: 'false', sysparm_exclude_reference_link: 'true',
        sysparm_suppress_pagination_header: 'true' }).toString();
      const pending = this.#fetch(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        signal: request.signal, headers: { Authorization: `Bearer ${this.#token!}`, Accept: 'application/json' } });
      void pending.then(late => { if (request.signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
      response = await guard(pending);
      this.#check();
      if (response.status === 401 || response.status === 403) throw new R2SessionError('identity_access_denied');
      if (response.status === 404) throw new R2SessionError('identity_unconfirmed');
      if (response.status !== 200 || response.redirected) throw new R2SessionError('identity_request_failed');
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
        throw new R2SessionError('identity_unconfirmed');
      }
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await guard(reader.read()); this.#check();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > this.#bytes) throw new R2SessionError('identity_budget_exceeded');
        chunks.push(chunk.value);
      }
      let actual: string;
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        const value = identitySchema.parse(JSON.parse(text));
        // Schema admits only these two keys and a hex value. Count decoded key
        // tokens as well: JSON.parse alone would silently accept duplicate keys.
        const keys = [...text.matchAll(/"(?:[^"\\]|\\.)*"\s*:/g)]
          .map(match => JSON.parse(match[0].replace(/\s*:$/, '')) as string);
        if (keys.length !== 2 || new Set(keys).size !== 2) throw Error();
        actual = value.result[0].sys_id;
      } catch { throw new R2SessionError('identity_unconfirmed'); }
      this.#check();
      if (actual !== this.#expected) throw new R2SessionError('identity_mismatch');
      this.#check(); this.#state = 'verified';
      this.#permit = Object.freeze({}) as R2Permit;
      return { ok: true, permit: this.#permit };
    } catch (error) {
      const code = this.#reason ?? (error instanceof R2SessionError ? error.code : 'identity_request_failed');
      this.#revoke(code); return { ok: false, code };
    } finally {
      clearTimeout(timer);
      if (onAbort) this.#controller.signal.removeEventListener('abort', onAbort);
      request.abort();
      if (reader) void reader.cancel().catch(() => {});
      else void response?.body?.cancel().catch(() => {});
    }
  }
  review(permit: R2Permit, raw: unknown, signal?: AbortSignal): Promise<R2ReviewResult> {
    if (this.#state === 'reviewing') return Promise.resolve({ ok: false, code: 'review_busy' });
    const work = this.#review(permit, raw, signal); this.#pending = work;
    return work.finally(() => { if (this.#pending === work) this.#pending = undefined; });
  }
  async #review(permit: R2Permit, raw: unknown, signal?: AbortSignal): Promise<R2ReviewResult> {
    const cancel = () => this.#revoke('cancelled');
    try {
      this.#check();
      if (this.#state !== 'verified' || !this.#permit || permit !== this.#permit) throw new R2SessionError('invalid_session');
      const parsed = reviewUpdateSetInputSchema.safeParse(raw);
      if (!parsed.success || parsed.data.update_set_sys_id !== this.#target) throw new R2SessionError('invalid_session');
      if (this.#expires - this.#now() <= 60000) throw new R2SessionError('token_expired');
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      this.#check(); this.#state = 'reviewing'; this.#permit = undefined;
      // No token is copied into a shared client or registry. Only the bounded
      // read snapshot receives it, and all owned snapshots close on revocation.
      const createRead = (options?: BoundedReadOptions) => {
        this.#check();
        const read = new BoundedReadSession({ instanceUrl: this.#origin, authMode: 'per-user',
          perUserBearerToken: this.#token, oauth: { clientId: '', clientSecret: '' }, reviewReleaseConfig: this.#release },
        { ...options, fetch: this.#fetch, signal: this.#controller.signal });
        this.#reads.add(read); return read;
      };
      const client = new class extends ServiceNowClient {
        override createBoundedReadSession(options?: BoundedReadOptions) {
          return createRead(options);
        }
      }({ instanceUrl: this.#origin, authMode: 'per-user', oauth: { clientId: '', clientSecret: '' } });
      const outcome = await executeBestPracticeToolCall(client, REVIEW_TOOL_NAME, parsed.data,
        { signal: this.#controller.signal, workerFactory: this.#workerFactory });
      this.#check();
      if (!outcome) throw new R2SessionError('review_failed');
      return { ok: true, outcome };
    } catch (error) {
      return { ok: false, code: this.#reason ?? (error instanceof R2SessionError ? error.code : 'review_failed') };
    } finally {
      signal?.removeEventListener('abort', cancel); this.#revoke();
      for (const read of this.#reads) read.close();
      this.#reads.clear();
    }
  }
}
