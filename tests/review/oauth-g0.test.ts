import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { SyntheticOAuthHarness } from '../helpers/bp5-oauth-harness.js';

const cleanups: Array<() => Promise<void>> = [];
async function issuer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('test_setup');
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${address.port}`;
}
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

async function authorization(harness: SyntheticOAuthHarness) {
  let url!: URL;
  await harness.withAuthorizationRequest(async request => { url = new URL(request); });
  return url;
}
function callback(auth: URL) {
  const url = new URL(auth.searchParams.get('redirect_uri')!);
  url.search = new URLSearchParams({ state: auth.searchParams.get('state')!, code: 'synthetic-code' }).toString();
  return url;
}
async function raw(url: URL, options: { method?: string; host?: string; path?: string } = {}) {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: url.port,
      path: options.path ?? `${url.pathname}${url.search}`, method: options.method ?? 'GET',
      headers: { host: options.host ?? url.host } }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode!));
    });
    request.on('error', reject);
    request.end();
  });
}

it('does not extend token availability past its local retention deadline', async () => {
  const origin = await issuer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 120, scope: 'bp5_review_read' })));
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0, tokenRetentionMs: 30 });
  cleanups.push(() => harness.dispose());
  await fetch(callback(await authorization(harness)));
  expect(await harness.completion).toEqual({ status: 'ready' });
  await new Promise<void>(resolve => setTimeout(resolve, 45));
  let used = false;
  expect(await harness.useToken(async () => { used = true; })).toEqual({ status: 'unavailable' });
  expect(used).toBe(false);
});

it.each([
  { scope: undefined }, { scope: 'useraccount' }, { scope: 'bp5_review_read write' },
  { token_type: 'MAC' }, { expires_in: 901 }, { expires_in: 0 }, { expires_in: '120' },
  { access_token: '' }, { access_token: 'bad\r\ntoken' },
])('rejects invalid or expanded token metadata %#', async overrides => {
  const origin = await issuer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 120,
      scope: 'bp5_review_read', ...overrides })));
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => harness.dispose());
  await fetch(callback(await authorization(harness)));
  expect(await harness.completion).toEqual({ status: 'failed', reason: 'invalid_token_response' });
  expect(await harness.useToken(async () => { throw Error('must_not_run'); })).toEqual({ status: 'unavailable' });
});

it.each(['length', 'stream', 'redirect', 'invalid_json', 'error_body'])('bounds and sanitizes issuer response %s', async mode => {
  let redirected = 0;
  const destination = await issuer((_req, res) => { redirected++; res.end('must_not_reach'); });
  const origin = await issuer((_req, res) => {
    if (mode === 'redirect') { res.writeHead(302, { location: `${destination}/secret` }).end(); return; }
    if (mode === 'length') res.writeHead(200, { 'content-type': 'application/json', 'content-length': '70000' }).end('x');
    else if (mode === 'stream') { res.writeHead(200, { 'content-type': 'application/json' }); res.write('x'.repeat(40000)); res.end('x'.repeat(40000)); }
    else if (mode === 'error_body') res.writeHead(400, { 'content-type': 'application/json' }).end('{"error_description":"SERVER_SECRET"}');
    else res.writeHead(200, { 'content-type': 'application/json' }).end('SERVER_SECRET');
  });
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => harness.dispose());
  await fetch(callback(await authorization(harness)));
  const reason = mode === 'length' || mode === 'stream' ? 'response_too_large' :
    mode === 'invalid_json' ? 'invalid_token_response' : 'exchange_rejected';
  expect(await harness.completion).toEqual({ status: 'failed', reason });
  expect(redirected).toBe(0);
});

it('terminates on state-matched OAuth denial without reflecting descriptions or exchanging', async () => {
  let exchanges = 0;
  const origin = await issuer((_req, res) => { exchanges++; res.end('{}'); });
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => harness.dispose());
  const url = callback(await authorization(harness));
  url.searchParams.delete('code');
  url.searchParams.set('error', 'denied');
  url.searchParams.set('error_description', 'PRIVATE_ERROR');
  const response = await fetch(url);
  expect((await response.text()).includes('PRIVATE_ERROR')).toBe(false);
  expect(await harness.completion).toEqual({ status: 'failed', reason: 'authorization_denied' });
  expect(exchanges).toBe(0);
});

it('expires authorization waiting and does not hand out another authorization URL', async () => {
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: 'http://127.0.0.1:19281',
    callbackPort: 0, authorizationTimeoutMs: 30 });
  cleanups.push(() => harness.dispose());
  await authorization(harness);
  await expect(authorization(harness)).rejects.toThrow('authorization_unavailable');
  expect(await harness.completion).toEqual({ status: 'failed', reason: 'authorization_timeout' });
});

it.each(['timeout', 'cancel'])('aborts the in-flight exchange on %s without retries or late token adoption', async mode => {
  let exchanges = 0;
  let closed!: () => void;
  let started!: () => void;
  const upstreamStarted = new Promise<void>(resolve => { started = resolve; });
  const upstreamClosed = new Promise<void>(resolve => { closed = resolve; });
  const origin = await issuer((req, res) => {
    exchanges++;
    started();
    req.resume();
    res.on('close', closed);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
    res.write('{');
  });
  const controller = new AbortController();
  // Only the harness deadlines are virtual: the exchange times out exactly when advanced below,
  // never before the replay and never ahead of the cancellation, however slow the machine is.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0,
    exchangeTimeoutMs: mode === 'timeout' ? 40 : 1000, signal: controller.signal });
  cleanups.push(() => harness.dispose());
  const url = callback(await authorization(harness));
  await fetch(url);
  await upstreamStarted;
  expect(await raw(url)).toBe(400); // Replay while the first exchange is still running.
  if (mode === 'cancel') controller.abort();
  else await vi.advanceTimersByTimeAsync(40);
  expect(await harness.completion).toEqual(mode === 'cancel' ? { status: 'cancelled' } : { status: 'failed', reason: 'exchange_timeout' });
  await harness.dispose();
  await upstreamClosed;
  expect(exchanges).toBe(1);
  expect(await harness.useToken(async () => { throw Error('must_not_run'); })).toEqual({ status: 'unavailable' });
});

it('does not fall back to another callback port when the requested one is occupied', async () => {
  const occupied = await issuer((_req, res) => res.end());
  await expect(SyntheticOAuthHarness.start({ authorizationOrigin: occupied, callbackPort: Number(new URL(occupied).port) }))
    .rejects.toThrow('callback_unavailable');
});

it('cancels an active trusted token consumer and sanitizes callback-consumer exceptions', async () => {
  const origin = await issuer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 120, scope: 'bp5_review_read' })));
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => harness.dispose());
  await fetch(callback(await authorization(harness)));
  await harness.completion;
  const use = harness.useToken(async (_token, signal) => {
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
  });
  expect(await harness.useToken(async () => { throw Error('concurrent'); })).toEqual({ status: 'unavailable' });
  await harness.dispose();
  expect(await use).toEqual({ status: 'unavailable' });

  const other = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => other.dispose());
  await expect(other.withAuthorizationRequest(async () => { throw Error('URL_SECRET'); }))
    .rejects.toThrow('authorization_consumer_failed');
  expect(await other.completion).toEqual({ status: 'cancelled' });
});

it('reports unavailable after expiry even if a consumer blocks delivery of the expiry timer', async () => {
  const origin = await issuer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 120, scope: 'bp5_review_read' })));
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0, tokenRetentionMs: 1000 });
  cleanups.push(() => harness.dispose());
  await fetch(callback(await authorization(harness)));
  await harness.completion;
  const current = performance.now();
  expect(await harness.useToken(async () => { vi.spyOn(performance, 'now').mockReturnValue(current + 1100); }))
    .toEqual({ status: 'unavailable' });
});

it('emits only a fixed summary on real child-process stdout and nothing on stderr', async () => {
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/oauth-g0-smoke.ts', import.meta.url))], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, TSX_DISABLE_CACHE: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
  try {
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 8192) child.kill('SIGKILL'); });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 8192) child.kill('SIGKILL'); });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    expect(code).toBe(0);
    expect(stdout).toBe('{"status":"passed"}\n');
    expect(stderr).toBe('');
  } finally { clearTimeout(timer); child.kill('SIGKILL'); }
});

it.each(['state', 'duplicate_state', 'duplicate_code', 'both_code_error', 'method', 'path', 'normalized_path', 'host', 'absolute', 'oversize'])
('rejects invalid callback %s without consuming the pending authorization', async mutation => {
  let exchanges = 0;
  const origin = await issuer((_req, res) => { exchanges++; res.writeHead(400).end('{}'); });
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => harness.dispose());
  const auth = await authorization(harness);
  const url = callback(auth);
  const opts: { method?: string; host?: string; path?: string } = {};
  if (mutation === 'state') url.searchParams.set('state', 'x'.repeat(64));
  if (mutation === 'duplicate_state') url.searchParams.append('state', auth.searchParams.get('state')!);
  if (mutation === 'duplicate_code') url.searchParams.append('code', 'other');
  if (mutation === 'both_code_error') url.searchParams.set('error', 'denied');
  if (mutation === 'method') opts.method = 'POST';
  if (mutation === 'path') url.pathname += '-other';
  if (mutation === 'normalized_path') opts.path = '/bp5/x/../oauth/callback' + url.search;
  if (mutation === 'host') opts.host = 'localhost:' + url.port;
  if (mutation === 'absolute') opts.path = url.href;
  if (mutation === 'oversize') url.searchParams.set('code', 'x'.repeat(9000));
  expect([400, 405, 431].includes(await raw(url, opts))).toBe(true);
  expect(exchanges).toBe(0);
  const valid = await fetch(callback(auth));
  expect(valid.status).toBe(200);
  expect(valid.headers.get('cache-control')).toBe('no-store');
  expect(valid.headers.get('referrer-policy')).toBe('no-referrer');
  expect((await harness.completion).status).toBe('failed');
  expect(exchanges).toBe(1);
});

it.each(['https://pdi.service-now.com', 'http://localhost:1234', 'http://127.0.0.2:1234',
  'http://127.0.0.1:1234/path', 'http://user:secret@127.0.0.1:1234', 'not-a-url'])
('refuses non-synthetic origins without network activity: %s', async authorizationOrigin => {
  await expect(SyntheticOAuthHarness.start({ authorizationOrigin, callbackPort: 0 }))
    .rejects.toThrow('synthetic_origin_required');
});

it('does not expose state, verifier, token or server/consumer error through diagnostics', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const origin = await issuer((_req, res) => res.writeHead(200, { 'content-type': 'application/json' })
    .end(JSON.stringify({ access_token: 'TOKEN_CANARY', refresh_token: 'REFRESH_CANARY',
      token_type: 'Bearer', expires_in: 120, scope: 'bp5_review_read' })));
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => harness.dispose());
  const auth = await authorization(harness);
  const response = await fetch(callback(auth));
  const page = await response.text();
  await harness.completion;
  expect(await harness.useToken(async () => { throw Error('CONSUMER_SECRET'); })).toEqual({ status: 'consumer_failed' });
  const output = JSON.stringify(harness) + inspect(harness) + page + JSON.stringify(await harness.completion);
  for (const secret of ['TOKEN_CANARY', 'REFRESH_CANARY', 'CONSUMER_SECRET', auth.searchParams.get('state')!, 'synthetic-code']) {
    expect(output.includes(secret)).toBe(false);
  }
  expect(log).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

it('completes one S256 exchange, pins redirect and scope, and only lends the token in memory', async () => {
  let challenge = '';
  let redirect = '';
  let exchanges = 0;
  const origin = await issuer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const form = new URLSearchParams(body);
      exchanges++;
      const matches = req.method === 'POST' && req.url === '/oauth_token.do' &&
        form.get('grant_type') === 'authorization_code' && form.get('code') === 'synthetic-code' &&
        form.get('client_id') === 'synthetic-g0-client' && form.get('redirect_uri') === redirect &&
        !form.has('client_secret') &&
        createHash('sha256').update(form.get('code_verifier')!).digest('base64url') === challenge;
      res.writeHead(matches ? 200 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(matches ? {
        access_token: 'synthetic-access-token', token_type: 'Bearer', expires_in: 120,
        scope: 'bp5_review_read', refresh_token: 'synthetic-refresh-token',
      } : { error: 'invalid_grant' }));
    });
  });
  const harness = await SyntheticOAuthHarness.start({ authorizationOrigin: origin, callbackPort: 0 });
  cleanups.push(() => harness.dispose());
  await harness.withAuthorizationRequest(async request => {
    const params = new URL(request).searchParams;
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('state')).toMatch(/^[a-f0-9]{64}$/);
    challenge = params.get('code_challenge')!;
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    redirect = params.get('redirect_uri')!;
    const callback = new URL(redirect);
    callback.search = new URLSearchParams({ state: params.get('state')!, code: 'synthetic-code' }).toString();
    expect((await fetch(callback)).status).toBe(200);
  });
  expect(await harness.completion).toEqual({ status: 'ready' });
  let observed = false;
  expect(await harness.useToken(async (token, signal) => {
    observed = token === 'synthetic-access-token' && !signal.aborted;
  })).toEqual({ status: 'consumed' });
  expect(observed).toBe(true);
  expect(exchanges).toBe(1);
  await harness.dispose();
  expect(await harness.useToken(async () => { throw Error('must_not_run'); })).toEqual({ status: 'unavailable' });
});

it('binds loopback before authorization and frees the callback port on cancellation', async () => {
  const harness = await SyntheticOAuthHarness.start({
    authorizationOrigin: 'http://127.0.0.1:19281', callbackPort: 0,
  });
  cleanups.push(() => harness.dispose());
  let port = 0;
  await harness.withAuthorizationRequest(async request => {
    const redirect = new URL(new URL(request).searchParams.get('redirect_uri')!);
    expect(redirect.hostname).toBe('127.0.0.1');
    port = Number(redirect.port);
    expect((await fetch(redirect)).status).toBe(400);
  });
  await harness.dispose();
  expect(await harness.completion).toEqual({ status: 'cancelled' });
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', resolve);
  });
  await new Promise<void>(resolve => probe.close(() => resolve()));
});
