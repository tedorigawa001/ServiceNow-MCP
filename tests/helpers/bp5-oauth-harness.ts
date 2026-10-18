/** Development-only G0 boundary: loopback synthetic issuer, never a PDI client. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { inspect } from 'node:util';

type Failure = 'authorization_denied' | 'authorization_timeout' | 'exchange_timeout' |
  'exchange_rejected' | 'invalid_token_response' | 'response_too_large';
type Outcome = { status: 'cancelled' } | { status: 'ready' } | { status: 'failed'; reason: Failure };
interface Options {
  authorizationOrigin: string;
  /** Port zero is exclusively for parallel local synthetic tests. */
  callbackPort?: number;
  authorizationTimeoutMs?: number;
  exchangeTimeoutMs?: number;
  tokenRetentionMs?: number;
  signal?: AbortSignal;
}
const PATH = '/bp5/oauth/callback';
const SCRIPT = `history.replaceState(null,"","${PATH}")`;
const PAGE = `<!doctype html><meta charset="utf-8"><title>OAuth test</title><script>${SCRIPT}</script>Request processed. Close this window.`;
const SCOPE = 'bp5_review_read';
const CLIENT = 'synthetic-g0-client';

function bounded(value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw Error('invalid_limits');
  return value;
}

export class SyntheticOAuthHarness {
  #server: Server;
  #origin: string;
  #redirect = '';
  #state = randomBytes(32).toString('hex');
  #verifier = randomBytes(32).toString('base64url');
  #token = '';
  #expiresAt = 0;
  #phase: 'waiting' | 'exchanging' | 'ready' | 'disposed' = 'waiting';
  #abort = new AbortController();
  #settled = false;
  #issued = false;
  #busy = false;
  #exchangeTask?: Promise<void>;
  #closePromise?: Promise<void>;
  #waitTimer?: ReturnType<typeof setTimeout>;
  #tokenTimer?: ReturnType<typeof setTimeout>;
  #externalSignal?: AbortSignal;
  #onAbort = () => { void this.dispose(); };
  #exchangeTimeout: number;
  #retention: number;
  #resolve!: (result: Outcome) => void;
  readonly completion = new Promise<Outcome>(resolve => { this.#resolve = resolve; });

  private constructor(origin: string, exchangeTimeout: number, retention: number) {
    this.#origin = origin;
    this.#exchangeTimeout = exchangeTimeout;
    this.#retention = retention;
    this.#server = createServer({ maxHeaderSize: 8192 }, (req, res) => this.#callback(req, res));
    this.#server.maxConnections = 16;
    this.#server.headersTimeout = 2000;
    this.#server.requestTimeout = 2000;
    this.#server.setTimeout(2000, socket => socket.destroy());
  }

  static async start(options: Options): Promise<SyntheticOAuthHarness> {
    let origin: URL;
    try { origin = new URL(options.authorizationOrigin); } catch { throw Error('synthetic_origin_required'); }
    if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.origin !== options.authorizationOrigin) {
      throw Error('synthetic_origin_required');
    }
    const port = options.callbackPort ?? 18765;
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('invalid_limits');
    const wait = bounded(options.authorizationTimeoutMs, 300_000);
    const exchange = bounded(options.exchangeTimeoutMs, 10_000);
    const retention = bounded(options.tokenRetentionMs, 900_000);
    if (options.signal?.aborted) throw Error('cancelled');
    const harness = new SyntheticOAuthHarness(origin.origin, exchange, retention);
    try {
      await new Promise<void>((resolve, reject) => {
        harness.#server.once('error', () => reject(Error('callback_unavailable')));
        harness.#server.listen(port, '127.0.0.1', resolve);
      });
    } catch {
      harness.#state = '';
      harness.#verifier = '';
      throw Error('callback_unavailable');
    }
    const address = harness.#server.address();
    if (!address || typeof address === 'string') { await harness.dispose(); throw Error('callback_unavailable'); }
    harness.#redirect = `http://127.0.0.1:${address.port}${PATH}`;
    harness.#waitTimer = setTimeout(() => {
      void harness.#finish({ status: 'failed', reason: 'authorization_timeout' });
    }, wait);
    harness.#externalSignal = options.signal;
    options.signal?.addEventListener('abort', harness.#onAbort, { once: true });
    if (options.signal?.aborted) await harness.dispose();
    return harness;
  }

  /** Capability for a synthetic browser only. Do not log/retain the supplied URL. */
  async withAuthorizationRequest(consumer: (request: string) => Promise<void>): Promise<void> {
    if (this.#phase !== 'waiting' || this.#issued) throw Error('authorization_unavailable');
    this.#issued = true;
    const request = new URL('/oauth_auth.do', this.#origin);
    request.search = new URLSearchParams({
      response_type: 'code', client_id: CLIENT, scope: SCOPE, redirect_uri: this.#redirect, state: this.#state,
      code_challenge: createHash('sha256').update(this.#verifier).digest('base64url'), code_challenge_method: 'S256',
    }).toString();
    try { await consumer(request.href); } catch {
      await this.dispose();
      throw Error('authorization_consumer_failed');
    }
  }

  #respond(res: ServerResponse, status: number): void {
    res.writeHead(status, {
      'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff', connection: 'close',
      'content-security-policy': `default-src 'none'; script-src 'sha256-${createHash('sha256').update(SCRIPT).digest('base64')}'; frame-ancestors 'none'; base-uri 'none'`,
    }).end(PAGE);
  }

  #callback(req: IncomingMessage, res: ServerResponse): void {
    const reject = (status = 400) => { req.resume(); this.#respond(res, status); };
    if (req.method !== 'GET') return reject(405);
    const target = req.url ?? '';
    if (this.#phase !== 'waiting' || !this.#issued || !target.startsWith('/') || target.startsWith('//') ||
        target.split('?')[0] !== PATH || req.rawHeaders.filter((header, i) => i % 2 === 0 && header.toLowerCase() === 'host').length !== 1 ||
        Buffer.byteLength(target) > 8192 || req.headers.host !== new URL(this.#redirect).host ||
        req.headers['transfer-encoding'] || (req.headers['content-length'] && req.headers['content-length'] !== '0')) return reject();
    let callback: URL;
    try { callback = new URL(target, this.#redirect); } catch { return reject(); }
    if (callback.origin !== new URL(this.#redirect).origin || callback.pathname !== PATH || callback.hash) return reject();
    const params = callback.searchParams;
    const allowed = ['state', 'code', 'error', 'error_description', 'error_uri'];
    for (const key of params.keys()) {
      if (!allowed.includes(key) || params.getAll(key).length !== 1) return reject();
    }
    const state = params.get('state') ?? '';
    if (!/^[a-f0-9]{64}$/.test(state) || !timingSafeEqual(Buffer.from(state), Buffer.from(this.#state))) return reject();
    if (params.has('code') === params.has('error')) return reject();
    if (params.has('error')) {
      this.#respond(res, 200);
      void this.#finish({ status: 'failed', reason: 'authorization_denied' });
      return;
    }
    const code = params.get('code')!;
    if (!/^[\x21-\x7e]{1,2048}$/.test(code) || params.has('error_description') || params.has('error_uri')) return reject();
    // Consume the state before any asynchronous exchange; replay never starts another request.
    this.#phase = 'exchanging';
    this.#state = '';
    this.#respond(res, 200);
    this.#exchangeTask = this.#exchange(code);
  }

  async #exchange(code: string): Promise<void> {
    const exchangeStartedAt = performance.now();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; this.#abort.abort(); }, this.#exchangeTimeout);
    let failure: Failure = 'exchange_rejected';
    try {
      const response = await fetch(`${this.#origin}/oauth_token.do`, {
        method: 'POST', redirect: 'manual', signal: this.#abort.signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: CLIENT,
          redirect_uri: this.#redirect, code_verifier: this.#verifier }),
      });
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        await response.body?.cancel();
        throw Error();
      }
      failure = 'response_too_large';
      const length = response.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > 65536)) { await response.body?.cancel(); throw Error(); }
      const reader = response.body?.getReader();
      if (!reader) throw Error();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 65536) { await reader.cancel(); throw Error(); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
      failure = 'invalid_token_response';
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error();
      const value = body as Record<string, unknown>;
      if (typeof value.access_token !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(value.access_token) ||
          value.token_type !== 'Bearer' || !Number.isInteger(value.expires_in) ||
          (value.expires_in as number) < 1 || (value.expires_in as number) > 900 || value.scope !== SCOPE) throw Error();
      if (this.#phase !== 'exchanging' || this.#abort.signal.aborted) return;
      const expiresAt = Math.min(exchangeStartedAt + (value.expires_in as number) * 1000 - 1000,
        performance.now() + this.#retention);
      if (expiresAt <= performance.now()) throw Error();
      this.#token = value.access_token;
      this.#expiresAt = expiresAt;
      this.#tokenTimer = setTimeout(() => { void this.dispose(); }, this.#expiresAt - performance.now());
      await this.#finish({ status: 'ready' });
    } catch {
      await this.#finish({ status: 'failed', reason: timedOut ? 'exchange_timeout' : failure });
    } finally { clearTimeout(timer); this.#verifier = ''; }
  }

  /** Trusted in-process consumer; cannot prevent it from retaining a copied string. */
  async useToken(consumer: (token: string, signal: AbortSignal) => Promise<void>) {
    if (this.#phase !== 'ready' || performance.now() >= this.#expiresAt || this.#busy) return { status: 'unavailable' };
    this.#busy = true;
    try {
      await consumer(this.#token, this.#abort.signal);
      return { status: this.#phase === 'ready' && !this.#abort.signal.aborted && performance.now() < this.#expiresAt ? 'consumed' : 'unavailable' };
    } catch { return { status: 'consumer_failed' }; }
    finally { this.#busy = false; }
  }

  toJSON() { return { kind: 'synthetic_oauth_harness', status: this.#phase }; }
  [inspect.custom]() { return this.toJSON(); }

  #close(): Promise<void> {
    this.#closePromise ??= new Promise<void>(resolve => {
      this.#server.close(() => resolve());
      this.#server.closeAllConnections();
    });
    return this.#closePromise;
  }

  async #finish(result: Outcome): Promise<void> {
    if (this.#settled) return;
    this.#settled = true;
    clearTimeout(this.#waitTimer);
    this.#state = '';
    this.#verifier = '';
    this.#phase = result.status === 'ready' ? 'ready' : 'disposed';
    if (result.status !== 'ready') this.#clear();
    await this.#close();
    this.#resolve(result);
  }

  #clear(): void {
    this.#phase = 'disposed';
    this.#state = '';
    this.#verifier = '';
    this.#token = '';
    this.#expiresAt = 0;
    clearTimeout(this.#waitTimer);
    clearTimeout(this.#tokenTimer);
    this.#abort.abort();
    this.#externalSignal?.removeEventListener('abort', this.#onAbort);
  }

  async dispose(): Promise<void> {
    this.#clear();
    await this.#finish({ status: 'cancelled' });
    await this.#close();
    await this.#exchangeTask;
  }
}
