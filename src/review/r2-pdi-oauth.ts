/** Repository-only OAuth boundary. No listener, browser, runner, persistence or registration. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { inspect } from 'node:util';

export const R2_CALLBACK = 'http://127.0.0.1:18765/bp5/oauth/callback';
export type PdiOAuthFailure = 'invalid_oauth_config' | 'authorization_unavailable' | 'authorization_consumer_failed'
  | 'callback_rejected' | 'authorization_denied' | 'authorization_timeout' | 'exchange_outcome_unknown'
  | 'exchange_rejected' | 'invalid_token_response' | 'cancelled' | 'token_expired' | 'consumer_failed';
export type PdiOAuthOutcome = { ok: true } | { ok: false; code: PdiOAuthFailure };
export class PdiOAuthError extends Error {
  constructor(readonly code: PdiOAuthFailure) { super(code); this.name = 'PdiOAuthError'; }
}
export interface PdiOAuthConfig { instanceUrl: string; clientId: string; scopes: readonly string[] }
/** Trusted test boundaries, never tool input. Limits can only be lowered. */
export interface PdiOAuthOptions {
  fetch?: typeof fetch; signal?: AbortSignal; now?: () => number;
  authorizationTimeoutMs?: number; exchangeTimeoutMs?: number; responseBytes?: number;
}
export interface PdiTokenHandoff { bearerToken: string; expiresInSeconds: number; issuedAt: number }
const scopeToken = /^[\x21\x23-\x5b\x5d-\x7e]{1,256}$/;
const tokenPattern = /^[A-Za-z0-9._~+\/-]+=*$/;
function lower(value: number | undefined, ceiling: number) {
  if (value === undefined) return ceiling;
  if (!Number.isInteger(value) || value < 1 || value > ceiling) throw new PdiOAuthError('invalid_oauth_config');
  return value;
}

export class R2PdiOAuthAdapter {
  #origin: string;
  #client: string;
  #scopes: string[];
  #state = randomBytes(32).toString('hex');
  #verifier = randomBytes(32).toString('base64url');
  #phase: 'waiting' | 'exchanging' | 'ready' | 'consuming' | 'closed' = 'waiting';
  #authorized = false;
  #token?: PdiTokenHandoff;
  #expires = 0;
  #reason?: PdiOAuthFailure;
  #abort = new AbortController();
  #fetch: typeof fetch;
  #now: () => number;
  #timeout: number;
  #bytes: number;
  #timer?: ReturnType<typeof setTimeout>;
  #removeExternal: () => void;

  constructor(config: PdiOAuthConfig, options: PdiOAuthOptions = {}) {
    let url: URL;
    try { url = new URL(config.instanceUrl); } catch { throw new PdiOAuthError('invalid_oauth_config'); }
    if (url.protocol !== 'https:' || url.origin !== config.instanceUrl || url.username || url.password
      || typeof config.clientId !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(config.clientId) || !Array.isArray(config.scopes)
      || config.scopes.length < 1 || config.scopes.length > 16 || new Set(config.scopes).size !== config.scopes.length
      || config.scopes.some(s => typeof s !== 'string' || !scopeToken.test(s)) || config.scopes.join(' ').length > 1024) {
      throw new PdiOAuthError('invalid_oauth_config');
    }
    this.#origin = url.origin; this.#client = config.clientId; this.#scopes = [...config.scopes];
    this.#now = options.now ?? (() => performance.now());
    if (!Number.isFinite(this.#now())) throw new PdiOAuthError('invalid_oauth_config');
    this.#timeout = lower(options.exchangeTimeoutMs, 10000);
    this.#bytes = lower(options.responseBytes, 65536);
    const wait = lower(options.authorizationTimeoutMs, 300000);
    this.#fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.#timer = setTimeout(() => this.#dispose('authorization_timeout'), wait); this.#timer.unref();
    const cancel = () => this.#dispose('cancelled');
    options.signal?.addEventListener('abort', cancel, { once: true });
    this.#removeExternal = () => options.signal?.removeEventListener('abort', cancel);
    if (options.signal?.aborted) cancel();
  }
  status() { return { phase: this.#phase, hasCredential: this.#token !== undefined }; }
  toJSON() { return this.status(); }
  [inspect.custom]() { return this.status(); }
  #dispose(reason?: PdiOAuthFailure) {
    if (this.#phase === 'closed') return;
    this.#reason = reason; this.#phase = 'closed'; this.#token = undefined;
    this.#state = ''; this.#verifier = ''; this.#client = ''; this.#scopes = [];
    clearTimeout(this.#timer); this.#removeExternal(); this.#abort.abort();
  }
  close() { this.#dispose('cancelled'); }
  #unavailable(): PdiOAuthOutcome { return { ok: false, code: this.#reason ?? 'authorization_unavailable' }; }
  /** Only a trusted start-page renderer may consume this URL; never return/log it. */
  async withAuthorizationRequest(consumer: (url: string) => Promise<void>): Promise<PdiOAuthOutcome> {
    if (this.#phase !== 'waiting' || this.#authorized) return this.#unavailable();
    this.#authorized = true;
    const url = new URL('/oauth_auth.do', this.#origin);
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.#client,
      scope: this.#scopes.join(' '), redirect_uri: R2_CALLBACK, state: this.#state,
      code_challenge: createHash('sha256').update(this.#verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    try {
      await this.#guard(Promise.resolve().then(() => { this.#check(); return consumer(url.href); }));
      return this.#abort.signal.aborted ? this.#unavailable() : { ok: true };
    } catch { this.#dispose('authorization_consumer_failed'); return this.#unavailable(); }
  }
  /** Validated GET request-target only. Host/method/body/header checks belong to the future listener. */
  async exchangeCallback(target: string): Promise<PdiOAuthOutcome> {
    if (this.#phase !== 'waiting' || !this.#authorized) return this.#unavailable();
    const rejected: PdiOAuthOutcome = { ok: false, code: 'callback_rejected' };
    if (typeof target !== 'string' || Buffer.byteLength(target) > 8192 || !target.startsWith('/bp5/oauth/callback?')
      || /[\x00-\x20\x7f\\#]/.test(target) || /%(?![a-f\d]{2})/i.test(target)) return rejected;
    const url = new URL(target, R2_CALLBACK);
    if (url.origin !== new URL(R2_CALLBACK).origin || url.pathname !== '/bp5/oauth/callback') return rejected;
    const p = url.searchParams;
    for (const key of p.keys()) {
      if (!['state', 'code', 'error', 'error_description', 'error_uri'].includes(key) || p.getAll(key).length !== 1) return rejected;
    }
    const state = p.get('state') ?? '';
    if (!/^[a-f0-9]{64}$/.test(state) || !timingSafeEqual(Buffer.from(state), Buffer.from(this.#state))
      || p.has('code') === p.has('error')) return rejected;
    if (p.has('error')) {
      if (!p.get('error')) return rejected;
      this.#dispose('authorization_denied'); return this.#unavailable();
    }
    let code = p.get('code')!;
    if (!/^[\x21-\x7e]{1,2048}$/.test(code) || p.has('error_description') || p.has('error_uri')) return rejected;
    this.#phase = 'exchanging'; this.#state = ''; clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#dispose('exchange_outcome_unknown'), this.#timeout);
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const chunks: Uint8Array[] = [];
    try {
      const issuedAt = this.#now();
      if (!Number.isFinite(issuedAt)) throw new PdiOAuthError('invalid_token_response');
      const body = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: this.#client,
        redirect_uri: R2_CALLBACK, code_verifier: this.#verifier });
      const pending = this.#fetch(new URL('/oauth_token.do', this.#origin), { method: 'POST',
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: this.#abort.signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body });
      code = ''; this.#verifier = '';
      void pending.then(late => { if (this.#abort.signal.aborted) void late.body?.cancel().catch(() => {}); }, () => {});
      response = await this.#guard(pending);
      if (response.redirected || response.status !== 200) throw new PdiOAuthError('exchange_rejected');
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
        throw new PdiOAuthError('invalid_token_response');
      }
      const length = response.headers.get('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > this.#bytes)) throw new PdiOAuthError('invalid_token_response');
      reader = response.body.getReader();
      let bytes = 0;
      for (;;) {
        const chunk = await this.#guard(reader.read());
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > this.#bytes) throw new PdiOAuthError('invalid_token_response');
        chunks.push(chunk.value);
      }
      this.#check();
      let text: string;
      let value: unknown;
      const buffer = Buffer.concat(chunks);
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
        value = JSON.parse(text) as unknown;
      } catch { throw new PdiOAuthError('invalid_token_response'); }
      finally { buffer.fill(0); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PdiOAuthError('invalid_token_response');
      const v = value as Record<string, unknown>;
      // All permitted values are scalars. Decode key escapes before checking uniqueness.
      const keys = [...text.matchAll(/"(?:[^"\\]|\\.)*"\s*:/g)]
        .map(m => JSON.parse(m[0].replace(/\s*:$/, '')) as string);
      if (new Set(keys).size !== keys.length || keys.length !== Object.keys(v).length
        || Object.keys(v).some(k => !['access_token', 'token_type', 'expires_in', 'scope', 'refresh_token'].includes(k))
        || typeof v.access_token !== 'string' || !tokenPattern.test(v.access_token) || v.access_token.length > 8192
        || typeof v.token_type !== 'string' || !/^bearer$/i.test(v.token_type)
        || !Number.isInteger(v.expires_in) || (v.expires_in as number) < 1 || (v.expires_in as number) > 900
        || typeof v.scope !== 'string' || v.scope.length > 1024
        || ('refresh_token' in v && (typeof v.refresh_token !== 'string' || !tokenPattern.test(v.refresh_token) || v.refresh_token.length > 8192))) {
        throw new PdiOAuthError('invalid_token_response');
      }
      const scopes = v.scope.split(' ');
      if (scopes.some(s => !scopeToken.test(s)) || new Set(scopes).size !== scopes.length
        || scopes.length !== this.#scopes.length || scopes.some(s => !this.#scopes.includes(s))) throw new PdiOAuthError('invalid_token_response');
      const now = this.#now();
      this.#expires = issuedAt + (v.expires_in as number) * 1000 - 5000;
      if (!Number.isFinite(now) || now < issuedAt || this.#expires <= now) throw new PdiOAuthError('token_expired');
      this.#check();
      this.#token = { bearerToken: v.access_token, expiresInSeconds: v.expires_in as number, issuedAt };
      this.#phase = 'ready'; clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.#dispose('token_expired'), Math.ceil(this.#expires - now)); this.#timer.unref();
      return { ok: true };
    } catch (error) {
      const reason = this.#reason ?? (error instanceof PdiOAuthError ? error.code : 'exchange_outcome_unknown');
      this.#dispose(reason); return this.#unavailable();
    } finally {
      code = ''; this.#verifier = '';
      for (const chunk of chunks) chunk.fill(0);
      if (reader) void reader.cancel().catch(() => {});
      else void response?.body?.cancel().catch(() => {});
    }
  }
  #check() { if (this.#abort.signal.aborted) throw new PdiOAuthError(this.#reason ?? 'cancelled'); }
  async #guard<T>(pending: Promise<T>): Promise<T> {
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new PdiOAuthError(this.#reason ?? 'cancelled'));
      this.#abort.signal.addEventListener('abort', abort, { once: true });
      if (this.#abort.signal.aborted) abort();
    });
    try { return await Promise.race([pending, cancelled]); }
    finally { this.#abort.signal.removeEventListener('abort', abort); }
  }
  /** One trusted in-process handoff. Never returns callback values or diagnostics. */
  async consumeToken(consumer: (value: Readonly<PdiTokenHandoff>) => Promise<void>): Promise<PdiOAuthOutcome> {
    if (this.#phase !== 'ready' || !this.#token) return this.#unavailable();
    if (this.#now() >= this.#expires) { this.#dispose('token_expired'); return this.#unavailable(); }
    this.#phase = 'consuming';
    const value = this.#token; this.#token = undefined;
    try {
      await this.#guard(Promise.resolve().then(() => { this.#check(); return consumer(Object.freeze(value)); }));
      this.#check(); this.#dispose(); return { ok: true };
    } catch { this.#dispose(this.#reason ?? 'consumer_failed'); return this.#unavailable(); }
  }
}
