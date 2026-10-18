import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { createConnection } from 'node:net';
import { getEventListeners } from 'node:events';
import { inspect } from 'node:util';
import { createHash } from 'node:crypto';
import { R2LoopbackListener, R2_START_URL } from '../../src/review/r2-loopback.js';

const origin = 'https://loopback-fixture.service-now.com';
const plan = () => ({ instanceUrl: origin, clientId: 'LOOP_PRIVATE_CLIENT', scopes: ['review_read'],
  expectedUserSysId: '1'.repeat(32), updateSetSysId: 'a'.repeat(32) });
const listeners: R2LoopbackListener[] = [];
afterEach(async () => { for (const listener of listeners.splice(0)) await listener.close(); vi.restoreAllMocks(); });
function get(path = '/bp5/start', headers: Record<string, string> = {}, method = 'GET', body?: string) {
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: 18765, path, method, agent: false,
      headers: { Host: '127.0.0.1:18765', ...headers } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject); req.setTimeout(2000, () => req.destroy(Error('TEST_HTTP_TIMEOUT'))); req.end(body);
  });
}

it('binds only the fixed loopback endpoint and renders an escaped, non-cached authorization link', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => { throw Error('NETWORK_FORBIDDEN'); });
  const listener = await R2LoopbackListener.start(plan(), { fetch: fetcher }); listeners.push(listener);
  expect(R2_START_URL).toBe('http://127.0.0.1:18765/bp5/start');
  const page = await get();
  expect(page.status).toBe(200);
  expect(page.headers['cache-control']).toBe('no-store');
  expect(page.headers['referrer-policy']).toBe('no-referrer');
  expect(page.headers['content-security-policy']).toContain("default-src 'none'");
  expect(page.body.includes(`${origin}/oauth_auth.do?`)).toBe(true);
  expect(page.body.includes('&amp;')).toBe(true);
  expect(page.body.includes('code_challenge_method=S256')).toBe(true);
  expect(page.body.includes('<script')).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

it('rejects a foreign Host without consuming the start page', async () => {
  const listener = await R2LoopbackListener.start(plan(), { fetch: async () => { throw Error('NETWORK_FORBIDDEN'); } }); listeners.push(listener);
  const rejected = await get('/bp5/start', { Host: 'attacker.invalid' });
  expect(rejected.status).toBe(400); expect(rejected.body.includes('oauth_auth.do')).toBe(false);
  expect((await get()).status).toBe(200);
});

it.each([
  ['POST', '/bp5/start', {}, undefined, 405], ['HEAD', '/bp5/start', {}, undefined, 405],
  ['OPTIONS', '/bp5/start', {}, undefined, 405], ['GET', '/bp5/start?x=1', {}, undefined, 400],
  ['GET', '/bp5/start#fragment', {}, undefined, 400], ['GET', 'http://127.0.0.1:18765/bp5/start', {}, undefined, 400],
  ['GET', '/other', {}, undefined, 400], ['GET', '/bp5/start', { 'Content-Length': '1' }, 'x', 400],
  ['GET', '/bp5/start', { 'Transfer-Encoding': 'chunked' }, 'x', 400],
] as const)('rejects method/path/body before disclosing the link (case %#)', async (method, path, headers, body, status) => {
  const fetcher = vi.fn<typeof fetch>(); const listener = await R2LoopbackListener.start(plan(), { fetch: fetcher }); listeners.push(listener);
  const rejected = await get(path, headers, method, body);
  expect(rejected.status).toBe(status); expect(rejected.body.includes('oauth_auth.do')).toBe(false);
  expect((await get()).status).toBe(200); expect(fetcher).not.toHaveBeenCalled();
});

it('returns the authorization link only once and stops on a second start-page request', async () => {
  const fetcher = vi.fn<typeof fetch>(); const listener = await R2LoopbackListener.start(plan(), { fetch: fetcher }); listeners.push(listener);
  expect((await get()).status).toBe(200);
  const second = await get(); expect(second.status).toBe(409); expect(second.body.includes('oauth_auth.do')).toBe(false);
  expect(await listener.completion).toEqual({ ok: false, code: 'start_page_reused' });
  expect(listener.status().listening).toBe(false); expect(fetcher).not.toHaveBeenCalled();
});

function callback(page: string) {
  const auth = new URL(page.match(/href="([^"]+)"/)![1].replace(/&amp;/g, '&'));
  expect(auth.origin).toBe(origin);
  return '/bp5/oauth/callback?' + new URLSearchParams({ state: auth.searchParams.get('state')!, code: 'LOOP_PRIVATE_CODE' });
}
it('accepts the fixed callback, closes HTTP only, and verifies the token without exposing results to the browser', async () => {
  const paths: string[] = [];
  const listener = await R2LoopbackListener.start(plan(), { fetch: async url => {
    const path = new URL(String(url)).pathname; paths.push(path);
    if (path === '/oauth_token.do') return Response.json({ access_token: 'LOOP_PRIVATE_TOKEN', token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    expect(path).toBe('/api/now/table/sys_user'); return Response.json({ result: [{ sys_id: plan().expectedUserSysId }] });
  } }); listeners.push(listener);
  const response = await get(callback((await get()).body));
  expect(response.status).toBe(200); expect(response.body.includes('LOOP_PRIVATE')).toBe(false);
  expect(response.body.includes('history.replaceState')).toBe(true);
  expect(await listener.completion).toEqual({ ok: true });
  expect(listener.status()).toMatchObject({ listening: false, connection: { phase: 'verified', hasCredential: true } });
  expect(paths).toEqual(['/oauth_token.do', '/api/now/table/sys_user']);
});

it('rejects an occupied fixed port without fallback or disturbing the first listener', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const first = await R2LoopbackListener.start(plan(), { fetch: fetcher }); listeners.push(first);
  await expect(R2LoopbackListener.start(plan(), { fetch: fetcher })).rejects.toThrow('callback_unavailable');
  expect((await get()).status).toBe(200); expect(first.status().listening).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});

it('releases the fixed port and abort subscription on external cancellation', async () => {
  const control = new AbortController();
  const listener = await R2LoopbackListener.start(plan(), { signal: control.signal, fetch: async () => { throw Error('NETWORK_FORBIDDEN'); } }); listeners.push(listener);
  control.abort(new Error('LOOP_PRIVATE_ABORT'));
  expect(await Promise.race([listener.completion, new Promise(resolve => setTimeout(() => resolve('still_pending'), 100))]))
    .toEqual({ ok: false, code: 'cancelled' });
  expect(listener.status().listening).toBe(false);
  expect(getEventListeners(control.signal, 'abort')).toHaveLength(0);
  const next = await R2LoopbackListener.start(plan(), { fetch: async () => { throw Error('NETWORK_FORBIDDEN'); } }); listeners.push(next);
  expect((await get()).status).toBe(200);
});

it.each([
  ['POST', { Host: '127.0.0.1:18765' }, undefined], ['GET', { Host: 'attacker.invalid' }, undefined],
  ['GET', { 'Content-Length': '1' }, 'x'], ['GET', { 'Transfer-Encoding': 'chunked' }, 'x'],
] as const)('rejects invalid callback transport without consuming its state (case %#)', async (method, headers, body) => {
  let exchanges = 0;
  const listener = await R2LoopbackListener.start(plan(), { fetch: async url => {
    if (new URL(String(url)).pathname === '/oauth_token.do') { exchanges++; return Response.json({ access_token: 'LOOP_PRIVATE_TOKEN', token_type: 'Bearer', scope: 'review_read', expires_in: 900 }); }
    return Response.json({ result: [{ sys_id: plan().expectedUserSysId }] });
  } }); listeners.push(listener);
  const target = callback((await get()).body), invalid = await get(target, headers, method, body);
  expect([400, 405]).toContain(invalid.status); expect(exchanges).toBe(0);
  expect((await get(target, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(200);
  expect(await listener.completion).toEqual({ ok: true }); expect(exchanges).toBe(1);
});

it.each(['state', 'duplicate', 'unknown', 'error_mix'] as const)('rejects callback query %s without consuming the valid code', async kind => {
  let exchanges = 0;
  const listener = await R2LoopbackListener.start(plan(), { fetch: async url => {
    if (new URL(String(url)).pathname === '/oauth_token.do') { exchanges++; return Response.json({ access_token: 'LOOP_PRIVATE_TOKEN', token_type: 'Bearer', scope: 'review_read', expires_in: 900 }); }
    return Response.json({ result: [{ sys_id: plan().expectedUserSysId }] });
  } }); listeners.push(listener);
  const target = callback((await get()).body);
  const invalid = kind === 'state' ? target.replace(/state=[^&]+/, 'state=' + '0'.repeat(64))
    : target + ({ duplicate: '&code=x', unknown: '&issuer=x', error_mix: '&error=denied' }[kind]);
  expect((await get(invalid)).status).toBe(400); expect(exchanges).toBe(0);
  expect((await get(target)).status).toBe(200); expect(await listener.completion).toEqual({ ok: true });
  expect(exchanges).toBe(1);
});

it('processes OAuth denial without reflecting errors and uses only the fixed callback script hash', async () => {
  const fetcher = vi.fn<typeof fetch>(); const listener = await R2LoopbackListener.start(plan(), { fetch: fetcher }); listeners.push(listener);
  const target = new URL(callback((await get()).body), R2_START_URL);
  target.searchParams.delete('code'); target.searchParams.set('error', 'access_denied');
  target.searchParams.set('error_description', 'LOOP_PRIVATE_ERROR');
  const response = await get(target.pathname + target.search);
  expect(response.status).toBe(200); expect(response.body.includes('LOOP_PRIVATE')).toBe(false);
  const script = response.body.match(/<script>([^<]+)<\/script>/)![1];
  expect(response.headers['content-security-policy']).toContain(`script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'`);
  expect(await listener.completion).toEqual({ ok: false, code: 'authorization_denied' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps the callback generic when a valid code belongs to another account', async () => {
  const paths: string[] = [];
  const listener = await R2LoopbackListener.start(plan(), { fetch: async url => {
    const path = new URL(String(url)).pathname; paths.push(path);
    return path === '/oauth_token.do'
      ? Response.json({ access_token: 'LOOP_PRIVATE_OTHER_TOKEN', token_type: 'Bearer', scope: 'review_read', expires_in: 900 })
      : Response.json({ result: [{ sys_id: '2'.repeat(32) }] });
  } }); listeners.push(listener);
  const response = await get(callback((await get()).body)); expect(response.status).toBe(200);
  expect(response.body.includes('identity_mismatch') || response.body.includes('LOOP_PRIVATE')).toBe(false);
  expect(await listener.completion).toEqual({ ok: false, code: 'identity_mismatch' });
  expect(listener.status().connection).toMatchObject({ hasCredential: false, tokenMayHaveBeenIssued: true, otherAccountTokenPossible: true });
  expect(paths).toEqual(['/oauth_token.do', '/api/now/table/sys_user']);
});

it('cancels in-flight exchange after HTTP release without closing a newly bound listener', async () => {
  const root = new AbortController(); let resolve!: (r: Response) => void, cancelled = false;
  const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(r => { resolve = r; }));
  const listener = await R2LoopbackListener.start(plan(), { signal: root.signal, fetch: fetcher }); listeners.push(listener);
  expect((await get(callback((await get()).body))).status).toBe(200);
  const next = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(next);
  root.abort(); expect(await listener.completion).toEqual({ ok: false, code: 'cancelled' });
  resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(r => setTimeout(r, 0));
  expect(cancelled).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1); expect((await get()).status).toBe(200);
});

it('does not print or serialize authorization URLs, code, token or original exceptions', async () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true), stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const listener = await R2LoopbackListener.start(plan(), { fetch: async () => { throw Error('LOOP_PRIVATE_UPSTREAM'); } }); listeners.push(listener);
  const first = await get(), target = callback(first.body);
  const state = new URL(target, R2_START_URL).searchParams.get('state')!;
  const reply = await get(target), result = await listener.completion;
  const text = JSON.stringify([reply, result, listener.status(), listener]) + inspect(listener);
  for (const forbidden of ['LOOP_PRIVATE', state, target, origin]) expect(text.includes(forbidden)).toBe(false);
  expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
});

it('cancels before or during bind without leaking the port', async () => {
  for (const already of [true, false]) {
    const root = new AbortController(); if (already) root.abort();
    const pending = R2LoopbackListener.start(plan(), { signal: root.signal, fetch: vi.fn<typeof fetch>() });
    if (!already) root.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  }
  const listener = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  expect((await get()).status).toBe(200);
});

it.each([
  ['CONNECT 127.0.0.1:18765 HTTP/1.1\r\nHost: 127.0.0.1:18765\r\n\r\n', 405],
  ['GET /bp5/start HTTP/1.1\r\nHost: 127.0.0.1:18765\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n', 400],
] as const)('rejects alternate HTTP protocol entry points (case %#)', async (input, code) => {
  const listener = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  const response = await rawHttp(input);
  expect(response.startsWith('HTTP/1.1 ' + code)).toBe(true); expect(response.includes('oauth_auth.do')).toBe(false);
  expect((await get()).status).toBe(200);
});

it('releases a partial client connection on cancellation and supports immediate fixed-port reuse', async () => {
  const root = new AbortController();
  const listener = await R2LoopbackListener.start(plan(), { signal: root.signal, fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  const socket = createConnection({ host: '127.0.0.1', port: 18765 });
  socket.on('error', () => {}); // Intentional abort may reset this synthetic client's socket.
  await new Promise<void>(r => socket.once('connect', r));
  const closed = new Promise<void>(r => socket.once('close', () => r()));
  socket.write('GET /bp5/start HTTP/1.1\r\nHost:'); root.abort();
  expect(await listener.completion).toEqual({ ok: false, code: 'cancelled' }); await closed;
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  const next = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(next);
  expect((await get()).status).toBe(200);
});

it('escapes hostile client identifiers and never embeds executable external resources', async () => {
  const listener = await R2LoopbackListener.start({ ...plan(), clientId: 'LOOP_PRIVATE_"><script>bad()</script>' },
    { fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  const page = await get();
  expect(page.status).toBe(200); expect(page.body.includes('<script') || page.body.includes('<iframe')).toBe(false);
  expect(page.body.includes('http-equiv') || page.body.includes('onload=')).toBe(false);
  expect(page.headers['content-security-policy']).toContain("form-action 'none'");
  expect(page.headers['access-control-allow-origin']).toBeUndefined();
});

it('acknowledges a consumed callback even if the trusted transport throws synchronously', async () => {
  const listener = await R2LoopbackListener.start(plan(), { fetch: () => { throw Error('LOOP_PRIVATE_SYNC'); } }); listeners.push(listener);
  const response = await get(callback((await get()).body));
  expect(response.status).toBe(200); expect(response.body.includes('LOOP_PRIVATE')).toBe(false);
  expect(await listener.completion).toEqual({ ok: false, code: 'exchange_outcome_unknown' });
  expect(listener.status().listening).toBe(false);
});

it('releases the listener automatically when authorization waiting expires', async () => {
  const listener = await R2LoopbackListener.start(plan(), { authorizationTimeoutMs: 10, fetch: async () => { throw Error('NETWORK_FORBIDDEN'); } }); listeners.push(listener);
  expect(await Promise.race([listener.completion, new Promise(resolve => setTimeout(() => resolve('still_pending'), 100))]))
    .toEqual({ ok: false, code: 'authorization_timeout' });
  expect(listener.status().listening).toBe(false);
});

function rawHttp(input: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: 18765 }, () => socket.write(input));
    let text = ''; socket.setEncoding('utf8'); socket.on('data', chunk => { text += chunk; });
    socket.on('end', () => resolve(text)); socket.on('error', reject);
    socket.setTimeout(2000, () => { socket.destroy(); reject(Error('TEST_RAW_TIMEOUT')); });
  });
}
it.each([
  'Host: 127.0.0.1:18765\r\nHost: 127.0.0.1:18765', 'Host: localhost:18765',
  'Host: 127.0.0.1', 'Host: 127.0.0.1:18765,attacker.invalid',
  'Host: 127.0.0.1:18765\r\nContent-Length: 0\r\nContent-Length: 0',
])('rejects ambiguous or non-canonical raw HTTP headers (case %#)', async headers => {
  const listener = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  const response = await rawHttp(`GET /bp5/start HTTP/1.1\r\n${headers}\r\nConnection: close\r\n\r\n`);
  expect(response.startsWith('HTTP/1.1 400')).toBe(true); expect(response.includes('oauth_auth.do')).toBe(false);
  expect((await get()).status).toBe(200);
});

it('bounds an incomplete HTTP header connection without consuming the start page', async () => {
  const listener = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  const socket = createConnection({ host: '127.0.0.1', port: 18765 });
  await new Promise<void>(resolve => socket.once('connect', resolve));
  const closed = new Promise<boolean>(resolve => socket.once('close', () => resolve(true)));
  socket.write('GET /bp5/start HTTP/1.1\r\nHost:');
  try {
    expect(await Promise.race([closed, new Promise(resolve => setTimeout(() => resolve(false), 2500))])).toBe(true);
    expect((await get()).status).toBe(200);
  } finally { socket.destroy(); }
}, 5000);

it('rejects a callback before the start page without consuming the authorization', async () => {
  const listener = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  expect((await get('/bp5/oauth/callback?state=x&code=LOOP_PRIVATE_BAD')).status).toBe(400);
  expect((await get()).status).toBe(200);
});

it.each([
  [{ Origin: 'https://attacker.invalid' }, 403], [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
  [{ Purpose: 'prefetch' }, 400], [{ 'Sec-Purpose': 'prefetch;prerender' }, 400],
  [{ Expect: '100-continue' }, 417],
] as const)('rejects cross-site, prefetch or Expect requests without consuming the link (case %#)', async (headers, status) => {
  const listener = await R2LoopbackListener.start(plan(), { fetch: vi.fn<typeof fetch>() }); listeners.push(listener);
  const response = await get('/bp5/start', headers);
  expect(response.status).toBe(status); expect(response.body.includes('oauth_auth.do')).toBe(false);
  expect((await get()).status).toBe(200);
});
