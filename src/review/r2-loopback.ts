/** Repository-only loopback boundary; no browser automation, CLI, storage or runner. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { inspect } from 'node:util';
import { createHash } from 'node:crypto';
import type { Socket } from 'node:net';
import { R2OAuthSessionConnection, type R2OAuthPlan, type R2OAuthConnectionOptions,
  type R2ConnectionFailure } from './r2-oauth-session.js';

export const R2_START_URL = 'http://127.0.0.1:18765/bp5/start';
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
const callbackScript = 'history.replaceState(null,"","/bp5/oauth/callback")';
const callbackPage = `<!doctype html><meta charset="utf-8"><title>Authorization response</title><script>${callbackScript}</script>Request processed. Close this window.`;
export type R2LoopbackOutcome = { ok: true } | { ok: false;
  code: R2ConnectionFailure | 'callback_unavailable' | 'start_page_reused' | 'listener_failed' };

export class R2LoopbackListener {
  #server: Server;
  #connection: R2OAuthSessionConnection;
  #root = new AbortController();
  #closing?: Promise<void>;
  #listenerClosing?: Promise<void>;
  #listening = false;
  #startUsed = false;
  #processing = false;
  #settled = false;
  #failure?: Extract<R2LoopbackOutcome, { ok: false }>;
  #removeExternal: () => void = () => {};
  #waitTimer?: ReturnType<typeof setTimeout>;
  #sockets = new Set<Socket>();
  #resolve!: (outcome: R2LoopbackOutcome) => void;
  readonly completion = new Promise<R2LoopbackOutcome>(resolve => { this.#resolve = resolve; });

  private constructor(plan: R2OAuthPlan, options: R2OAuthConnectionOptions) {
    this.#connection = new R2OAuthSessionConnection(plan, { ...options, signal: this.#root.signal });
    this.#server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
      void this.#route(req, res).catch(() => { res.destroy(); void this.close().catch(() => {}); });
    });
    this.#server.maxConnections = 16;
    this.#server.maxRequestsPerSocket = 1;
    this.#server.headersTimeout = 2000; this.#server.requestTimeout = 2000;
    this.#server.setTimeout(2000, socket => socket.destroy());
    this.#server.on('connection', socket => {
      this.#sockets.add(socket); socket.once('close', () => this.#sockets.delete(socket));
      socket.on('error', () => { socket.destroy(); });
    });
    this.#server.on('connect', (_req, socket) => socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
    this.#server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
    this.#server.on('error', () => { void this.#finish({ ok: false, code: this.#listening ? 'listener_failed' : 'callback_unavailable' }); });
    const expectation = (req: IncomingMessage, res: ServerResponse) => {
      req.resume(); this.#respond(res, 417, 'Request rejected.');
    };
    this.#server.on('checkContinue', expectation); this.#server.on('checkExpectation', expectation);
    const cancel = () => { void this.#finish({ ok: false, code: 'cancelled' }); };
    options.signal?.addEventListener('abort', cancel, { once: true });
    this.#removeExternal = () => options.signal?.removeEventListener('abort', cancel);
    this.#waitTimer = setTimeout(() => { void this.#finish({ ok: false, code: 'authorization_timeout' }); },
      options.authorizationTimeoutMs ?? 300000);
    this.#waitTimer.unref();
    if (options.signal?.aborted) cancel();
  }
  static async start(plan: R2OAuthPlan, options: R2OAuthConnectionOptions = {}) {
    if (options.signal?.aborted) throw Error('cancelled');
    const listener = new R2LoopbackListener(plan, options);
    try {
      await new Promise<void>((resolve, reject) => {
        listener.#server.once('error', () => reject(Error('callback_unavailable')));
        const cancelled = () => reject(Error('cancelled'));
        listener.#root.signal.addEventListener('abort', cancelled, { once: true });
        listener.#server.listen({ port: 18765, host: '127.0.0.1', signal: listener.#root.signal }, () => {
          listener.#root.signal.removeEventListener('abort', cancelled);
          listener.#listening = true; resolve();
        });
      });
      return listener;
    } catch {
      const code = options.signal?.aborted ? 'cancelled' : 'callback_unavailable';
      await listener.#finish({ ok: false, code }); throw Error(code);
    }
  }
  status() { return { listening: this.#listening, connection: this.#connection.status() }; }
  toJSON() { return this.status(); }
  [inspect.custom]() { return this.status(); }
  #respond(res: ServerResponse, status: number, body: string, callback = false) {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
      'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', connection: 'close',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        + (callback ? `; script-src 'sha256-${createHash('sha256').update(callbackScript).digest('base64')}'` : '') }).end(body);
  }
  async #route(req: IncomingMessage, res: ServerResponse) {
    const reject = (status = 400) => { req.resume(); this.#respond(res, status, 'Request rejected.'); };
    if (req.method !== 'GET') { reject(405); return; }
    if (req.headers.host !== '127.0.0.1:18765'
      || req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'host').length !== 1) {
      reject(); return;
    }
    const target = req.url ?? '';
    const isCallback = target.startsWith('/bp5/oauth/callback?') && Buffer.byteLength(target) <= 8192;
    if ((target !== '/bp5/start' && !isCallback) || req.headers['transfer-encoding'] !== undefined
      || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')) { reject(); return; }
    if (!isCallback && ((req.headers.origin !== undefined && req.headers.origin !== 'http://127.0.0.1:18765')
      || req.headers['sec-fetch-site'] === 'cross-site')) { reject(403); return; }
    if ([req.headers.purpose, req.headers['sec-purpose']].some(v => typeof v === 'string' && /prefetch|prerender/i.test(v))) { reject(); return; }
    let hasBody = false;
    await new Promise<void>((resolve, fail) => {
      req.on('data', () => { hasBody = true; }); req.once('end', resolve); req.once('error', fail);
    });
    if (hasBody) { reject(); return; }
    if (isCallback) {
      if (!this.#startUsed) { reject(); return; }
      if (this.#processing) { reject(409); return; }
      let accepted = false;
      let replied: Promise<void> | undefined;
      const result = await this.#connection.exchangeAndVerify(target, () => {
        accepted = true; this.#processing = true;
        clearTimeout(this.#waitTimer);
        replied = new Promise<void>(resolve => { res.once('finish', resolve); res.once('close', resolve); });
        void replied.then(() => this.#closeListener());
        this.#respond(res, 200, callbackPage, true);
      });
      if (!accepted) { reject(); return; }
      await replied;
      await this.#finish(result); return;
    }
    if (this.#startUsed) {
      res.once('finish', () => { void this.#finish({ ok: false, code: 'start_page_reused' }); });
      this.#respond(res, 409, 'Request rejected.'); return;
    }
    this.#startUsed = true;
    const rendered = await this.#connection.withAuthorizationRequest(async url => {
      this.#respond(res, 200, `<!doctype html><meta charset="utf-8"><title>Review authorization</title><a href="${escapeAttribute(url)}" rel="noreferrer noopener">Continue to authorization</a>`);
    });
    if (!rendered.ok) { reject(503); await this.#finish(rendered); }
  }
  close(): Promise<void> {
    return this.#finish({ ok: false, code: 'cancelled' });
  }
  #closeListener(): Promise<void> {
    return this.#listenerClosing ??= new Promise<void>(resolve => {
      this.#server.close(() => { this.#listening = false; resolve(); }); this.#server.closeAllConnections();
      for (const socket of this.#sockets) socket.destroy();
    });
  }
  #dispose(failure: Extract<R2LoopbackOutcome, { ok: false }>): Promise<void> {
    this.#failure ??= failure;
    return this.#closing ??= (async () => {
      this.#removeExternal();
      clearTimeout(this.#waitTimer);
      this.#root.abort();
      try { await Promise.all([this.#closeListener(), this.#connection.close()]); }
      catch { this.#failure = { ok: false, code: 'cleanup_incomplete' }; }
    })();
  }
  async #finish(outcome: R2LoopbackOutcome): Promise<void> {
    if (outcome.ok) await this.#closeListener();
    else await this.#dispose(outcome);
    if (!this.#settled) { this.#settled = true; this.#resolve(this.#failure ?? outcome); }
  }
}
