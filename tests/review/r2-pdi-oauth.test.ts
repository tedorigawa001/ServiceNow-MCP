import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { inspect } from 'node:util';
import { R2_CALLBACK, R2PdiOAuthAdapter } from '../../src/review/r2-pdi-oauth.js';
import type { PdiOAuthOptions, PdiTokenHandoff } from '../../src/review/r2-pdi-oauth.js';

const origin = 'https://oauth-fixture.service-now.com';
const secret = 'PDI_PRIVATE_ACCESS';
const config = () => ({ instanceUrl: origin, clientId: 'PDI_PRIVATE_CLIENT', scopes: ['read_one', 'read_two'] });
const payload = () => ({ access_token: secret, token_type: 'Bearer', expires_in: 900, scope: 'read_two read_one' });
const adapters: R2PdiOAuthAdapter[] = [];
const create = (options: PdiOAuthOptions = {}) => {
  const adapter = new R2PdiOAuthAdapter(config(), { fetch: async () => Response.json(payload()), ...options });
  adapters.push(adapter); return adapter;
};
async function authorize(adapter: R2PdiOAuthAdapter) {
  let auth!: URL;
  expect(await adapter.withAuthorizationRequest(async url => { auth = new URL(url); })).toEqual({ ok: true });
  return auth;
}
const callback = (auth: URL) => '/bp5/oauth/callback?' + new URLSearchParams({
  state: auth.searchParams.get('state')!, code: 'PDI_PRIVATE_CODE',
});
afterEach(() => { for (const a of adapters.splice(0)) a.close(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('pins HTTPS endpoints, callback and S256, exchanges once and hands off only in memory', async () => {
  let auth!: URL;
  let now = 100;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe(origin + '/oauth_token.do');
    expect(init?.method).toBe('POST'); expect(init?.redirect).toBe('error');
    expect(init?.credentials).toBe('omit'); expect(init?.cache).toBe('no-store');
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(headers.has('authorization') || headers.has('cookie')).toBe(false);
    const form = new URLSearchParams(String(init?.body));
    expect([...form.keys()].sort()).toEqual(['client_id', 'code', 'code_verifier', 'grant_type', 'redirect_uri']);
    expect(form.get('grant_type')).toBe('authorization_code'); expect(form.get('redirect_uri')).toBe(R2_CALLBACK);
    expect(form.get('client_id') === config().clientId && form.get('code') === 'PDI_PRIVATE_CODE').toBe(true);
    const verifier = form.get('code_verifier')!;
    expect(/^[A-Za-z0-9_-]{43}$/.test(verifier)).toBe(true);
    expect(createHash('sha256').update(verifier).digest('base64url') === auth.searchParams.get('code_challenge')).toBe(true);
    now = 300; return Response.json({ ...payload(), refresh_token: 'PDI_PRIVATE_REFRESH' });
  });
  const adapter = create({ fetch: fetcher, now: () => now }); auth = await authorize(adapter);
  expect(auth.origin + auth.pathname).toBe(origin + '/oauth_auth.do');
  expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
  expect(auth.searchParams.get('response_type')).toBe('code');
  expect(auth.searchParams.get('redirect_uri')).toBe(R2_CALLBACK);
  expect(/^[a-f0-9]{64}$/.test(auth.searchParams.get('state')!)).toBe(true);
  expect(await adapter.exchangeCallback(callback(auth))).toEqual({ ok: true });
  expect(await adapter.exchangeCallback(callback(auth))).toEqual({ ok: false, code: 'authorization_unavailable' });
  let consumed = 0;
  expect(await adapter.consumeToken(async value => {
    consumed++;
    expect(value.bearerToken === secret).toBe(true);
    expect(value.issuedAt).toBe(100); expect(value.expiresInSeconds).toBe(900);
    expect(Object.keys(value).sort()).toEqual(['bearerToken', 'expiresInSeconds', 'issuedAt']);
    expect(Object.isFrozen(value)).toBe(true);
  })).toEqual({ ok: true });
  expect(await adapter.consumeToken(async () => { consumed++; })).toEqual({ ok: false, code: 'authorization_unavailable' });
  expect(consumed).toBe(1); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(adapter.status()).toEqual({ phase: 'closed', hasCredential: false });
});

it.each(['http://oauth-fixture.service-now.com', origin + '/', origin + '/x', origin + '?x=1', origin + '#x',
  'https://user:password@oauth-fixture.service-now.com', 'not-a-url'])('rejects non-canonical origin (case %#)', instanceUrl => {
  expect(() => new R2PdiOAuthAdapter({ ...config(), instanceUrl })).toThrow('invalid_oauth_config');
});
it.each([[], [''], ['a', 'a'], ['a b'], ['a\tb'], ['a"b'], ['a\\b'], ['x'.repeat(257)], Array(17).fill('s')])(
  'rejects invalid approved scope sets (case %#)', scopes => {
    expect(() => new R2PdiOAuthAdapter({ ...config(), scopes })).toThrow('invalid_oauth_config');
  });
it.each([{ responseBytes: 65537 }, { exchangeTimeoutMs: 10001 }, { authorizationTimeoutMs: 300001 },
  { responseBytes: 0 }, { exchangeTimeoutMs: 1.5 }])('cannot raise or corrupt limits (case %#)', options => {
    expect(() => new R2PdiOAuthAdapter(config(), options)).toThrow('invalid_oauth_config');
  });

it('generates independent state/challenges and makes the authorization URL one-use', async () => {
  const a = create(), b = create(); const x = await authorize(a), y = await authorize(b);
  expect(x.searchParams.get('state') !== y.searchParams.get('state')).toBe(true);
  expect(x.searchParams.get('code_challenge') !== y.searchParams.get('code_challenge')).toBe(true);
  const consumer = vi.fn(async () => {});
  expect(await a.withAuthorizationRequest(consumer)).toEqual({ ok: false, code: 'authorization_unavailable' });
  expect(consumer).not.toHaveBeenCalled();
});
it('does not exchange before authorization is presented', async () => {
  const fetcher = vi.fn<typeof fetch>(); const a = create({ fetch: fetcher });
  expect(await a.exchangeCallback('/bp5/oauth/callback?state=x&code=x')).toEqual({ ok: false, code: 'authorization_unavailable' });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(['wrong-state', 'duplicate-state', 'duplicate-code', 'unknown', 'code-and-error', 'empty-code', 'path', 'absolute',
  'fragment', 'malformed-escape', 'error-details-with-code', 'too-long'])('rejects callback %s without consuming valid state', async kind => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(payload()));
    const a = create({ fetch: fetcher }), auth = await authorize(a); let target = callback(auth);
    if (kind === 'wrong-state') target = target.replace(auth.searchParams.get('state')!, '0'.repeat(64));
    if (kind === 'duplicate-state') target += '&state=x';
    if (kind === 'duplicate-code') target += '&code=x';
    if (kind === 'unknown') target += '&issuer=x';
    if (kind === 'code-and-error') target += '&error=access_denied';
    if (kind === 'empty-code') target = target.replace('PDI_PRIVATE_CODE', '');
    if (kind === 'path') target = target.replace('/callback?', '/other?');
    if (kind === 'absolute') target = 'http://127.0.0.1:18765' + target;
    if (kind === 'fragment') target += '#secret';
    if (kind === 'malformed-escape') target += '&x=%zz';
    if (kind === 'error-details-with-code') target += '&error_description=PDI_PRIVATE_ERROR';
    if (kind === 'too-long') target += '&x=' + 'x'.repeat(8192);
    expect(await a.exchangeCallback(target)).toEqual({ ok: false, code: 'callback_rejected' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await a.exchangeCallback(callback(auth))).toEqual({ ok: true });
  });
it('stops on a state-matched OAuth denial without exposing descriptions or exchanging', async () => {
  const fetcher = vi.fn<typeof fetch>(); const a = create({ fetch: fetcher }), auth = await authorize(a);
  const target = '/bp5/oauth/callback?' + new URLSearchParams({ state: auth.searchParams.get('state')!,
    error: 'access_denied', error_description: 'PDI_PRIVATE_DENIAL', error_uri: 'https://secret.invalid' });
  expect(await a.exchangeCallback(target)).toEqual({ ok: false, code: 'authorization_denied' });
  expect(fetcher).not.toHaveBeenCalled(); expect(a.status().hasCredential).toBe(false);
});

it.each(['Bearer', 'bearer', 'BEARER', 'bEaReR'])('accepts token_type case %s without modifying token or scope', async token_type => {
  const a = create({ fetch: async () => Response.json({ ...payload(), token_type }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: true });
});
it.each([
  { token_type: ' Bearer' }, { token_type: 'Bearer ' }, { token_type: 'MAC' }, { token_type: null },
  { scope: undefined }, { scope: '' }, { scope: 'read_one' }, { scope: 'read_one read_two admin' },
  { scope: 'read_one read_one' }, { scope: 'read_one  read_two' }, { scope: 'READ_one read_two' },
  { scope: 'read_one\tread_two' }, { expires_in: '900' }, { expires_in: 901 }, { expires_in: 0 },
  { expires_in: 1.5 }, { expires_in: null }, { access_token: '' }, { access_token: 'bad token' },
  { access_token: 'x'.repeat(8193) }, { access_token: {} }, { refresh_token: {} },
  { error: 'PDI_PRIVATE_ERROR' }, { other: 'PDI_PRIVATE_UNKNOWN' },
])('rejects invalid token response (case %#)', async patch => {
  const a = create({ fetch: async () => Response.json({ ...payload(), ...patch }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'invalid_token_response' });
  const consume = vi.fn(async () => {}); await a.consumeToken(consume);
  expect(consume).not.toHaveBeenCalled(); expect(a.status()).toEqual({ phase: 'closed', hasCredential: false });
});
it.each(['null', '[]', '<html>PDI_PRIVATE</html>', '{',
  JSON.stringify(payload()).replace('"token_type":"Bearer"', '"token_type":"Bearer","token_\\u0074ype":"Bearer"'),
])('rejects invalid JSON or escaped duplicate keys (case %#)', async body => {
  const a = create({ fetch: async () => new Response(body, { headers: { 'content-type': 'application/json' } }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'invalid_token_response' });
});
it.each([302, 400, 401, 403, 429, 500])('does not retry or follow HTTP %s', async status => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('PDI_PRIVATE_RESPONSE', { status }));
  const a = create({ fetch: fetcher }), auth = await authorize(a);
  expect(await a.exchangeCallback(callback(auth))).toEqual({ ok: false, code: 'exchange_rejected' });
  await a.exchangeCallback(callback(auth)); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects redirected success and incorrect content type', async () => {
  for (const response of [new Response('{}', { headers: { 'content-type': 'text/html' } }),
    Object.defineProperty(Response.json(payload()), 'redirected', { value: true })]) {
    const a = create({ fetch: async () => response });
    expect((await a.exchangeCallback(callback(await authorize(a)))).ok).toBe(false);
  }
});
it('rejects invalid UTF-8', async () => {
  const a = create({ fetch: async () => new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'invalid_token_response' });
});
it('bounds decoded chunks and cancels the body without waiting on cancellation', async () => {
  let cancelled = false;
  const a = create({ responseBytes: 32, fetch: async () => new Response(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array(33)); }, cancel() { cancelled = true; return new Promise(() => {}); },
  }), { headers: { 'content-type': 'application/json' } }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'invalid_token_response' });
  expect(cancelled).toBe(true);
});
it.each(['65537', 'invalid'])('rejects content-length %s before consuming the body', async length => {
  let cancelled = false;
  const a = create({ fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }),
    { headers: { 'content-type': 'application/json', 'content-length': length } }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'invalid_token_response' });
  expect(cancelled).toBe(true);
});

it('times out non-cooperative fetch, cancels late response, and never retries', async () => {
  let resolve!: (r: Response) => void; let cancelled = false;
  const fetcher = vi.fn<typeof fetch>(async () => new Promise<Response>(r => { resolve = r; }));
  const a = create({ exchangeTimeoutMs: 5, fetch: fetcher }), auth = await authorize(a);
  expect(await a.exchangeCallback(callback(auth))).toEqual({ ok: false, code: 'exchange_outcome_unknown' });
  resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(r => setTimeout(r, 0));
  expect(cancelled).toBe(true); await a.exchangeCallback(callback(auth));
  expect(fetcher).toHaveBeenCalledTimes(1); expect(a.status().hasCredential).toBe(false);
});
it('times out a non-cooperative response reader and cancels its body', async () => {
  let cancelled = false;
  const a = create({ exchangeTimeoutMs: 5, fetch: async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'application/json' } }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'exchange_outcome_unknown' });
  expect(cancelled).toBe(true);
});
it('cancels pending exchange, removes external listeners and suppresses secret errors', async () => {
  const root = new AbortController(); let entered!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const a = create({ signal: root.signal, fetch: async () => { entered(); return new Promise(() => {}); } });
  const task = a.exchangeCallback(callback(await authorize(a))); await started;
  root.abort(new Error('PDI_PRIVATE_ABORT'));
  expect(await task).toEqual({ ok: false, code: 'cancelled' });
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  expect(a.status()).toEqual({ phase: 'closed', hasCredential: false });
});
it('never calls fetch when already cancelled, and expires authorization waiting', async () => {
  const root = new AbortController(); root.abort(); const fetcher = vi.fn<typeof fetch>();
  const a = create({ signal: root.signal, fetch: fetcher });
  expect(await a.withAuthorizationRequest(async () => { throw Error(); })).toEqual({ ok: false, code: 'cancelled' });
  const b = create({ authorizationTimeoutMs: 5, fetch: fetcher });
  await new Promise(r => setTimeout(r, 10));
  expect(await b.withAuthorizationRequest(async () => {})).toEqual({ ok: false, code: 'authorization_timeout' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('discards ready credentials on close and token expiry', async () => {
  let now = 100;
  const a = create({ now: () => now }); await a.exchangeCallback(callback(await authorize(a)));
  now = 900100;
  expect(await a.consumeToken(async () => { throw Error('must not run'); })).toEqual({ ok: false, code: 'token_expired' });
  const b = create(); await b.exchangeCallback(callback(await authorize(b))); b.close();
  expect(b.status()).toEqual({ phase: 'closed', hasCredential: false });
});
it('rejects token life already consumed by exchange, without resetting issuedAt', async () => {
  let now = 100;
  const a = create({ now: () => now, fetch: async () => { now = 1100; return Response.json({ ...payload(), expires_in: 6 }); } });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'token_expired' });
});
it('only one consumer runs; close interrupts a non-cooperative consumer without exposing return values', async () => {
  const a = create(); await a.exchangeCallback(callback(await authorize(a)));
  let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
  const task = a.consumeToken(async () => { entered(); return new Promise(() => {}); }); await started;
  const other = vi.fn(async () => {});
  expect(await a.consumeToken(other)).toEqual({ ok: false, code: 'authorization_unavailable' });
  a.close(); expect(await task).toEqual({ ok: false, code: 'cancelled' }); expect(other).not.toHaveBeenCalled();
});
it('never serializes secret state, callback/transport/consumer diagnostics or logs', async () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const output: unknown[] = [];
  const a = create({ fetch: async () => { throw Error('PDI_PRIVATE_TRANSPORT'); } });
  const auth = await authorize(a); output.push(JSON.stringify(a), inspect(a), await a.exchangeCallback(callback(auth)));
  const b = create(); await b.exchangeCallback(callback(await authorize(b)));
  output.push(JSON.stringify(b), inspect(b), await b.consumeToken(async () => { throw Error('PDI_PRIVATE_CONSUMER'); }));
  const c = create(); output.push(await c.withAuthorizationRequest(async () => { throw Error('PDI_PRIVATE_RENDERER'); }));
  expect(JSON.stringify(output).includes('PDI_PRIVATE')).toBe(false);
  expect(JSON.stringify(output).includes(auth.searchParams.get('state')!)).toBe(false);
  expect(JSON.stringify(output).includes(auth.searchParams.get('code_challenge')!)).toBe(false);
  expect(JSON.stringify(output).includes(auth.href)).toBe(false);
  expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
});
it('does not expose refresh credentials through the handoff type', async () => {
  const a = create(); await a.exchangeCallback(callback(await authorize(a)));
  let keys: string[] = [];
  await a.consumeToken(async (handoff: Readonly<PdiTokenHandoff>) => { keys = Object.keys(handoff); });
  expect(keys.includes('refresh_token')).toBe(false);
});

it('settles authorization rendering even when its trusted consumer ignores cancellation', async () => {
  const a = create();
  const task = a.withAuthorizationRequest(async () => new Promise(() => {}));
  a.close();
  expect(await Promise.race([task, new Promise(resolve => setTimeout(() => resolve('still_pending'), 15))]))
    .toEqual({ ok: false, code: 'cancelled' });
});

it('classifies a failed body transport as an unknown exchange outcome, not a validation failure', async () => {
  const a = create({ fetch: async () => new Response(new ReadableStream({
    start(c) { c.error(new Error('PDI_PRIVATE_READ_ERROR')); },
  }), { headers: { 'content-type': 'application/json' } }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: false, code: 'exchange_outcome_unknown' });
});

it('rejects a missing client ID at the runtime boundary without coercing undefined to a string', () => {
  expect(() => new R2PdiOAuthAdapter({ ...config(), clientId: undefined as unknown as string }))
    .toThrow('invalid_oauth_config');
});

it('accepts exactly 64KiB but rejects one decoded byte more, even with a misleading header', async () => {
  for (const bytes of [65536, 65537]) {
    const body = JSON.stringify(payload()).padEnd(bytes, ' ');
    const a = create({ fetch: async () => new Response(body,
      { headers: { 'content-type': 'application/json; charset=utf-8', 'content-length': '1' } }) });
    expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual(bytes === 65536
      ? { ok: true } : { ok: false, code: 'invalid_token_response' });
  }
});

it('preserves the first stop reason if cancellation races a timeout or late success', async () => {
  const root = new AbortController(); let resolve!: (r: Response) => void;
  let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
  const a = create({ signal: root.signal, exchangeTimeoutMs: 5, fetch: async () => {
    entered(); return new Promise<Response>(r => { resolve = r; });
  } });
  const task = a.exchangeCallback(callback(await authorize(a))); await started; root.abort();
  expect(await task).toEqual({ ok: false, code: 'cancelled' });
  resolve(Response.json(payload())); await new Promise(r => setTimeout(r, 10));
  const consumer = vi.fn(async () => {});
  expect(await a.consumeToken(consumer)).toEqual({ ok: false, code: 'cancelled' });
  expect(consumer).not.toHaveBeenCalled(); expect(a.status().hasCredential).toBe(false);
});

it('does not start a second exchange while the first is pending', async () => {
  let resolve!: (r: Response) => void;
  const fetcher = vi.fn<typeof fetch>(async () => new Promise<Response>(r => { resolve = r; }));
  const a = create({ fetch: fetcher }), auth = await authorize(a);
  const task = a.exchangeCallback(callback(auth));
  expect(await a.exchangeCallback(callback(auth))).toEqual({ ok: false, code: 'authorization_unavailable' });
  resolve(Response.json(payload())); expect(await task).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('fires token retention expiry and removes the signal subscription without requiring consumption', async () => {
  vi.useFakeTimers(); const root = new AbortController();
  const a = create({ signal: root.signal, fetch: async () => Response.json({ ...payload(), expires_in: 6 }) });
  expect(await a.exchangeCallback(callback(await authorize(a)))).toEqual({ ok: true });
  await vi.advanceTimersByTimeAsync(1100);
  expect(a.status()).toEqual({ phase: 'closed', hasCredential: false });
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps handoff cleanup distinct from the runner root signal', async () => {
  const root = new AbortController(); const a = create({ signal: root.signal });
  await a.exchangeCallback(callback(await authorize(a)));
  expect(await a.consumeToken(async () => {})).toEqual({ ok: true });
  a.close();
  expect(root.signal.aborted).toBe(false);
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
});

it('does not use global network fetch, open a listener, or read credentials during construction', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
  const a = new R2PdiOAuthAdapter(config()); adapters.push(a);
  await authorize(a); a.close(); expect(fetcher).not.toHaveBeenCalled();
});

it('does not dispatch an exchange if the trusted acceptance hook cancels the authorization', async () => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>(async () => Response.json(payload()));
  const a = create({ signal: root.signal, fetch: fetcher });
  expect(await a.exchangeCallback(callback(await authorize(a)), () => root.abort()))
    .toEqual({ ok: false, code: 'cancelled' });
  expect(fetcher).not.toHaveBeenCalled(); expect(a.status().hasCredential).toBe(false);
});
