import { afterEach, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { getEventListeners } from 'node:events';
import { R2ReviewSession } from '../../src/review/r2-session.js';
import type { R2Permit } from '../../src/review/r2-session.js';

const origin = 'https://r2-fixture.service-now.com';
const user = '1'.repeat(32), parent = 'a'.repeat(32);
const token = 'R2_PRIVATE_ACCESS_TOKEN';
const options = () => ({ instanceUrl: origin, clientId: 'R2_PRIVATE_CLIENT', expectedUserSysId: user,
  updateSetSysId: parent, bearerToken: token, expiresInSeconds: 900, issuedAt: performance.now() });
const identity = () => new Response(JSON.stringify({ result: [{ sys_id: user }] }),
  { headers: { 'content-type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('verifies only the fixed current-user GET and returns an opaque, secret-free permit', async () => {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url));
    expect(u.origin + u.pathname).toBe(origin + '/api/now/table/sys_user');
    expect(Object.fromEntries(u.searchParams)).toEqual({ sysparm_query: 'sys_id=javascript:gs.getUserID()',
      sysparm_fields: 'sys_id', sysparm_limit: '2', sysparm_display_value: 'false',
      sysparm_exclude_reference_link: 'true', sysparm_suppress_pagination_header: 'true' });
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization') === `Bearer ${token}`).toBe(true);
    expect(new Headers(init?.headers).has('cookie')).toBe(false);
    return identity();
  });
  const session = new R2ReviewSession(options(), { fetch: fetcher });
  try {
    const verified = await session.verify();
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw Error('EXPECTED_IDENTITY');
    expect(Object.keys(verified.permit)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((JSON.stringify(session) + inspect(session) + JSON.stringify(verified)).includes('R2_PRIVATE')).toBe(false);
  } finally { await session.close(); }
  expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
});

it('does not start a review with a forged or unverified permit, and drops the token', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => { throw Error('R2_PRIVATE_UPSTREAM'); });
  const session = new R2ReviewSession(options(), { fetch: fetcher });
  const result = await session.review({} as R2Permit, { update_set_sys_id: parent });
  expect(result).toEqual({ ok: false, code: 'invalid_session' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
});

it.each([
  [401, 'identity_access_denied'], [403, 'identity_access_denied'], [404, 'identity_unconfirmed'],
  [302, 'identity_request_failed'], [429, 'identity_request_failed'], [500, 'identity_request_failed'],
] as const)('stops on HTTP %s without exposing or retrying the upstream body', async (status, code) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('R2_PRIVATE_UPSTREAM', { status }));
  const session = new R2ReviewSession(options(), { fetch: fetcher });
  expect(await session.verify()).toEqual({ ok: false, code });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
  expect(await session.review({} as R2Permit, { update_set_sys_id: parent })).toEqual({ ok: false, code });
});

it.each([
  '{"result":[]}', '{"result":[{"sys_id":"' + user + '"},{"sys_id":"' + user + '"}]}',
  '{"result":[{"sys_id":{"value":"' + user + '"}}]}',
  '{"result":[{"sys_id":"' + user + '","name":"R2_PRIVATE_IDENTITY"}]}',
  '{"result":[],"result":[{"sys_id":"' + user + '"}]}',
  '{"result":[{"sys_id":"' + user + '","sys_\\u0069d":"' + user + '"}]}',
  '{"result":[{"sys_id":"' + user + '"}],"extra":"R2_PRIVATE_IDENTITY"}', '<html>R2_PRIVATE_IDENTITY</html>',
])('rejects malformed, ambiguous or over-disclosing identity data (case %#)', async body => {
  const session = new R2ReviewSession(options(), { fetch: async () => new Response(body,
    { headers: { 'content-type': 'application/json' } }) });
  expect(await session.verify()).toEqual({ ok: false, code: 'identity_unconfirmed' });
  expect(session.status().hasCredential).toBe(false);
});

it('compares the authenticated result against a separately pinned expected ID', async () => {
  const session = new R2ReviewSession(options(), { fetch: async () => Response.json({ result: [{ sys_id: '2'.repeat(32) }] }) });
  expect(await session.verify()).toEqual({ ok: false, code: 'identity_mismatch' });
  expect(session.status().hasCredential).toBe(false);
});

it('enforces the decoded byte cap while reading, then cancels the stream', async () => {
  let cancelled = false;
  const session = new R2ReviewSession(options(), { identityBytes: 32, fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(33)); }, cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'application/json' } }) });
  expect(await session.verify()).toEqual({ ok: false, code: 'identity_budget_exceeded' });
  expect(cancelled).toBe(true);
  expect(session.status().hasCredential).toBe(false);
});

it('times out even a non-cooperative fetch and cancels its late response', async () => {
  let resolve!: (response: Response) => void;
  let cancelled = false;
  const session = new R2ReviewSession(options(), { identityTimeoutMs: 5,
    fetch: async () => new Promise<Response>(r => { resolve = r; }) });
  expect(await session.verify()).toEqual({ ok: false, code: 'identity_budget_exceeded' });
  resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(r => setTimeout(r, 0));
  expect(cancelled).toBe(true);
  expect(session.status().hasCredential).toBe(false);
});

it('close aborts an in-flight identity body and waits for the operation to stop', async () => {
  let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  let cancelled = false;
  const session = new R2ReviewSession(options(), { fetch: async () => new Response(new ReadableStream({
    start() { began(); }, cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'application/json' } }) });
  const pending = session.verify(); await started; await session.close();
  expect(await pending).toEqual({ ok: false, code: 'invalid_session' });
  expect(cancelled).toBe(true);
  expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
  await session.close();
});

it('uses an external cancellation signal without leaking thrown diagnostics', async () => {
  const abort = new AbortController();
  const session = new R2ReviewSession(options(), { signal: abort.signal, fetch: async () => {
    abort.abort(); throw Error('R2_PRIVATE_THROWN_DIAGNOSTIC');
  } });
  expect(await session.verify()).toEqual({ ok: false, code: 'cancelled' });
  expect(session.status().hasCredential).toBe(false);
});

it('does not replace the identity deadline after a successful check, or start with insufficient token life', async () => {
  let now = 1000;
  const session = new R2ReviewSession({ ...options(), issuedAt: now, expiresInSeconds: 90 },
    { now: () => now, fetch: async () => identity() });
  const verified = await session.verify(); if (!verified.ok) throw Error('IDENTITY_SETUP_FAILED');
  now += 25000; // Only 60s remain after the 5s safety margin: strict >60s required.
  expect(await session.review(verified.permit, { update_set_sys_id: parent })).toEqual({ ok: false, code: 'token_expired' });
  expect(session.status().hasCredential).toBe(false);
});

it('invalidates an unused permit at token expiry without additional network I/O', async () => {
  let now = 1000;
  const fetcher = vi.fn<typeof fetch>(async () => identity());
  const session = new R2ReviewSession({ ...options(), issuedAt: now, expiresInSeconds: 90 }, { now: () => now, fetch: fetcher });
  const verified = await session.verify(); if (!verified.ok) throw Error('IDENTITY_SETUP_FAILED');
  now += 85000;
  expect(await session.review(verified.permit, { update_set_sys_id: parent })).toEqual({ ok: false, code: 'token_expired' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['foreign', 'cloned', 'target', 'instance', 'extra'] as const)('rejects %s admission before BP-5 fetch', async kind => {
  const fetcher = vi.fn<typeof fetch>(async () => identity());
  const session = new R2ReviewSession(options(), { fetch: fetcher });
  const other = new R2ReviewSession(options(), { fetch: async () => identity() });
  try {
    const verified = await session.verify(), foreign = await other.verify();
    if (!verified.ok || !foreign.ok) throw Error('IDENTITY_SETUP_FAILED');
    const permit = kind === 'foreign' ? foreign.permit : kind === 'cloned' ? { ...verified.permit } : verified.permit;
    const input = { update_set_sys_id: kind === 'target' ? 'b'.repeat(32) : parent,
      ...(kind === 'instance' ? { instance: 'R2_PRIVATE_INSTANCE' } : {}), ...(kind === 'extra' ? { bearerToken: token } : {}) };
    expect(await session.review(permit, input)).toEqual({ ok: false, code: 'invalid_session' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(session.status().hasCredential).toBe(false);
  } finally { await session.close(); await other.close(); }
});

it('rejects bad session configuration without exposing its values', () => {
  for (const value of [ { ...options(), instanceUrl: 'http://R2_PRIVATE_HOST' },
    { ...options(), instanceUrl: origin + '/R2_PRIVATE_PATH' }, { ...options(), bearerToken: 'R2_PRIVATE\r\nSECRET' },
    { ...options(), expectedUserSysId: 'R2_PRIVATE_ID' }, { ...options(), expiresInSeconds: 901 } ]) {
    let caught: unknown;
    try { new R2ReviewSession(value, { fetch: async () => { throw Error('NO_IO'); } }); } catch (error) { caught = error; }
    expect(caught instanceof Error).toBe(true);
    expect(String(caught)).toBe('R2SessionError: invalid_session');
  }
});

it('expires an idle verified session and releases its timers and external listener', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const session = new R2ReviewSession({ ...options(), issuedAt: 1000, expiresInSeconds: 90 },
    { now: () => 1000, signal: abort.signal, fetch: async () => identity() });
  expect((await session.verify()).ok).toBe(true);
  expect(getEventListeners(abort.signal, 'abort')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(85000);
  expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
  expect(getEventListeners(abort.signal, 'abort')).toHaveLength(0);
  await session.close();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['content_type', 'invalid_utf8', 'fetch_exception'] as const)('rejects %s without retaining raw errors', async kind => {
  const session = new R2ReviewSession(options(), { fetch: async () => {
    if (kind === 'fetch_exception') throw Error('R2_PRIVATE_CERTIFICATE_OR_NETWORK_ERROR');
    if (kind === 'invalid_utf8') return new Response(new Uint8Array([0xc3, 0x28]), { headers: { 'content-type': 'application/json' } });
    return new Response('{"result":[{"sys_id":"' + user + '"}]}', { headers: { 'content-type': 'text/html' } });
  } });
  expect(await session.verify()).toEqual({ ok: false, code: kind === 'fetch_exception' ? 'identity_request_failed' : 'identity_unconfirmed' });
  expect(session.status().hasCredential).toBe(false);
});
