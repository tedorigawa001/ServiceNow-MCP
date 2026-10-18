import { afterEach, expect, it, vi } from 'vitest';
import { R2OAuthSessionConnection } from '../../src/review/r2-oauth-session.js';
import { createHash } from 'node:crypto';
import { inspect } from 'node:util';
import { getEventListeners } from 'node:events';
import { aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';

const origin = 'https://r2-connection.service-now.com';
const user = '1'.repeat(32), parent = 'a'.repeat(32), token = 'HANDOFF_PRIVATE_ACCESS';
const plan = () => ({ instanceUrl: origin, clientId: 'HANDOFF_PRIVATE_CLIENT', scopes: ['review_read'],
  expectedUserSysId: user, updateSetSysId: parent });
const connections: R2OAuthSessionConnection[] = [];
afterEach(async () => { for (const c of connections.splice(0)) await c.close(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function authorize(c: R2OAuthSessionConnection, code = 'HANDOFF_PRIVATE_CODE') {
  let auth!: URL;
  expect(await c.withAuthorizationRequest(async url => { auth = new URL(url); })).toEqual({ ok: true });
  return '/bp5/oauth/callback?' + new URLSearchParams({ state: auth.searchParams.get('state')!, code });
}

it('hands the exchanged token to the pinned identity GET, without returning token, session or permit', async () => {
  const paths: string[] = [];
  const c = new R2OAuthSessionConnection(plan(), { fetch: async (url, init) => {
    const u = new URL(String(url)); paths.push(u.pathname); expect(u.origin).toBe(origin);
    if (u.pathname === '/oauth_token.do') {
      expect(init?.method).toBe('POST');
      return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    }
    expect(u.pathname).toBe('/api/now/table/sys_user'); expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization') === `Bearer ${token}`).toBe(true);
    expect(u.searchParams.get('sysparm_query')).toBe('sys_id=javascript:gs.getUserID()');
    return Response.json({ result: [{ sys_id: user }] });
  } }); connections.push(c);
  const result = await c.exchangeAndVerify(await authorize(c));
  expect(result).toEqual({ ok: true });
  expect(paths).toEqual(['/oauth_token.do', '/api/now/table/sys_user']);
  expect(c.status()).toMatchObject({ phase: 'verified', hasCredential: true,
    tokenMayHaveBeenIssued: true, otherAccountTokenPossible: false });
  await c.close(); expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false });
});

it('stops a valid state/S256-bound code from another account before any review retrieval', async () => {
  let auth!: URL;
  const paths: string[] = [];
  const c = new R2OAuthSessionConnection(plan(), { fetch: async (url, init) => {
    const u = new URL(String(url)); paths.push(u.pathname);
    if (u.pathname === '/oauth_token.do') {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('code') === 'HANDOFF_PRIVATE_OTHER_CODE').toBe(true);
      expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url') === auth.searchParams.get('code_challenge')).toBe(true);
      return Response.json({ access_token: 'HANDOFF_PRIVATE_OTHER_TOKEN', token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    }
    expect(u.pathname).toBe('/api/now/table/sys_user');
    expect(new Headers(init?.headers).get('authorization') === 'Bearer HANDOFF_PRIVATE_OTHER_TOKEN').toBe(true);
    return Response.json({ result: [{ sys_id: '2'.repeat(32) }] });
  } }); connections.push(c);
  await c.withAuthorizationRequest(async url => { auth = new URL(url); });
  const target = '/bp5/oauth/callback?' + new URLSearchParams({ state: auth.searchParams.get('state')!, code: 'HANDOFF_PRIVATE_OTHER_CODE' });
  expect(await c.exchangeAndVerify(target)).toEqual({ ok: false, code: 'identity_mismatch' });
  expect(await c.review({ update_set_sys_id: parent })).toEqual({ ok: false, code: 'identity_mismatch' });
  expect(paths).toEqual(['/oauth_token.do', '/api/now/table/sys_user']);
  expect(c.status()).toEqual({ phase: 'closed', hasCredential: false, tokenMayHaveBeenIssued: true, otherAccountTokenPossible: true });
});

it('keeps explicit close terminal and reports cancellation before any exchange', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const c = new R2OAuthSessionConnection(plan(), { fetch: fetcher }); connections.push(c);
  const target = await authorize(c); await c.close();
  expect(await c.exchangeAndVerify(target)).toEqual({ ok: false, code: 'cancelled' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([401, 403, 404, 500, 'empty', 'ambiguous', 'malformed'] as const)(
  'fails closed for identity response %s after exchange, without fetching any review data', async kind => {
    const paths: string[] = [];
    const c = new R2OAuthSessionConnection(plan(), { fetch: async (url) => {
      const u = new URL(String(url)); paths.push(u.pathname);
      if (u.pathname === '/oauth_token.do') return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
      if (typeof kind === 'number') return new Response('HANDOFF_PRIVATE_ERROR', { status: kind });
      if (kind === 'empty') return Response.json({ result: [] });
      if (kind === 'ambiguous') return Response.json({ result: [{ sys_id: user }, { sys_id: user }] });
      return Response.json({ result: [{ sys_id: { value: user } }] });
    } }); connections.push(c);
    const result = await c.exchangeAndVerify(await authorize(c));
    expect(result.ok).toBe(false); expect((await c.review({ update_set_sys_id: parent })).ok).toBe(false);
    expect(paths).toEqual(['/oauth_token.do', '/api/now/table/sys_user']);
    expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false, tokenMayHaveBeenIssued: true, otherAccountTokenPossible: false });
  });

it('reviews with the same token only after identity succeeds, retains the 0.3 contract, and closes once', async () => {
  let identityPassed = false;
  const paths: string[] = [];
  const row = { sys_id: 'b'.repeat(32), update_set: parent, name: `sys_script_${'c'.repeat(32)}`,
    type: 'Business Rule', action: 'INSERT_OR_UPDATE', sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
  const c = new R2OAuthSessionConnection(plan(), { fetch: async (url, init) => {
    const u = new URL(String(url)); paths.push(u.pathname); expect(u.origin).toBe(origin);
    if (u.pathname === '/oauth_token.do') return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization') === `Bearer ${token}`).toBe(true);
    if (u.pathname === '/api/now/table/sys_user') { identityPassed = true; return Response.json({ result: [{ sys_id: user }] }); }
    expect(identityPassed).toBe(true);
    if (u.pathname === '/api/now/table/sys_cluster_state') return Response.json({ result: [{ build_name: 'Australia' }] });
    if (u.pathname === `/api/now/table/sys_update_set/${parent}`) return Response.json({ result: { sys_id: parent,
      state: 'in progress', application: 'global', sys_updated_on: row.sys_updated_on, sys_mod_count: '0' } });
    if (u.pathname === '/api/now/table/sys_update_xml') {
      if (u.searchParams.get('sysparm_fields')?.includes('payload')) {
        const detail: Record<string, unknown> = { ...row }; delete detail.type;
        return Response.json({ result: [{ ...detail, payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${'c'.repeat(32)}</sys_id><sys_scope>global</sys_scope><when>after</when><script><![CDATA[/* HANDOFF_PRIVATE_CODE_BODY */ current.update();]]></script></sys_script></record_update>` }] });
      }
      return Response.json({ result: [row] });
    }
    throw Error('HANDOFF_PRIVATE_UNEXPECTED_PATH');
  } }); connections.push(c);
  expect(await c.review({ update_set_sys_id: parent })).toEqual({ ok: false, code: 'invalid_session' });
  expect(paths).toHaveLength(0);
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: true });
  const result = await c.review({ update_set_sys_id: parent, selection_mode: 'review_targets' });
  expect(result.ok).toBe(true); if (!result.ok) throw Error('REVIEW_EXPECTED');
  expect(result.outcome.isError).toBe(false);
  const parsed = aggregateReviewV3Schema.safeParse(result.outcome.result);
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.counts).toMatchObject({ reviewed: 1, findings: 1 });
  expect(JSON.stringify(result).includes('HANDOFF_PRIVATE')).toBe(false);
  const count = paths.length; expect((await c.review({ update_set_sys_id: parent })).ok).toBe(false);
  expect(paths).toHaveLength(count); expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false });
}, 15000);

it.each(['exchange', 'identity'] as const)('cancels non-cooperative %s I/O and discards a late response without review retrieval', async stage => {
  const root = new AbortController(); let entered!: () => void, resolve!: (r: Response) => void, cancelled = false;
  const started = new Promise<void>(r => { entered = r; }); const paths: string[] = [];
  const c = new R2OAuthSessionConnection(plan(), { signal: root.signal, fetch: async (url) => {
    const path = new URL(String(url)).pathname; paths.push(path);
    if (path === '/oauth_token.do' && stage === 'identity') return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    entered(); return new Promise<Response>(r => { resolve = r; });
  } }); connections.push(c);
  const task = c.exchangeAndVerify(await authorize(c)); await started; root.abort(new Error('HANDOFF_PRIVATE_ABORT'));
  expect(await task).toEqual({ ok: false, code: 'cancelled' });
  resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(r => setTimeout(r, 0));
  expect(cancelled).toBe(true); expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false, tokenMayHaveBeenIssued: true });
  expect(paths).toEqual(stage === 'exchange' ? ['/oauth_token.do'] : ['/oauth_token.do', '/api/now/table/sys_user']);
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  expect(await c.review({ update_set_sys_id: parent })).toEqual({ ok: false, code: 'cancelled' });
});

it('does not let adapter success cleanup cancel the session; root cancellation still destroys a verified token', async () => {
  const root = new AbortController();
  const c = new R2OAuthSessionConnection(plan(), { signal: root.signal, fetch: async url =>
    new URL(String(url)).pathname === '/oauth_token.do'
      ? Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 })
      : Response.json({ result: [{ sys_id: user }] }) }); connections.push(c);
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: true });
  expect(root.signal.aborted).toBe(false); expect(c.status().hasCredential).toBe(true);
  root.abort(); await c.close();
  expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false });
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
});

it('uses exchange-start time for the review lifetime gate, without resetting it at handoff', async () => {
  let now = 100; const paths: string[] = [];
  const c = new R2OAuthSessionConnection(plan(), { now: () => now, fetch: async url => {
    const path = new URL(String(url)).pathname; paths.push(path);
    if (path === '/oauth_token.do') { now = 20000; return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 90 }); }
    now = 25100; return Response.json({ result: [{ sys_id: user }] });
  } }); connections.push(c);
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: true });
  expect(await c.review({ update_set_sys_id: parent })).toEqual({ ok: false, code: 'token_expired' });
  expect(paths).toEqual(['/oauth_token.do', '/api/now/table/sys_user']);
  expect(c.status().hasCredential).toBe(false);
});

it('pins the same origin, client and expected identity against caller mutation after construction', async () => {
  const mutable = plan();
  const c = new R2OAuthSessionConnection(mutable, { fetch: async (url, init) => {
    const u = new URL(String(url)); expect(u.origin).toBe(origin);
    if (u.pathname === '/oauth_token.do') {
      expect(new URLSearchParams(String(init?.body)).get('client_id') === 'HANDOFF_PRIVATE_CLIENT').toBe(true);
      return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    }
    return Response.json({ result: [{ sys_id: user }] });
  } }); connections.push(c);
  mutable.instanceUrl = 'https://other.invalid'; mutable.clientId = 'other'; mutable.expectedUserSysId = '2'.repeat(32);
  mutable.scopes[0] = 'other';
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: true });
});

it('makes pre-exchange cancellation secret-free and records no possible token issuance', async () => {
  const root = new AbortController(); root.abort(); const fetcher = vi.fn<typeof fetch>();
  const c = new R2OAuthSessionConnection(plan(), { signal: root.signal, fetch: fetcher }); connections.push(c);
  expect(await c.withAuthorizationRequest(async () => { throw Error('must not run'); })).toEqual({ ok: false, code: 'cancelled' });
  expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false, tokenMayHaveBeenIssued: false });
  expect(fetcher).not.toHaveBeenCalled();
});

it('does not leak identity, code, token, URL, diagnostics or source text in status, failures or output', async () => {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true), err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const c = new R2OAuthSessionConnection(plan(), { fetch: async url =>
    new URL(String(url)).pathname === '/oauth_token.do'
      ? Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 })
      : Response.json({ result: [{ sys_id: '2'.repeat(32) }] }) }); connections.push(c);
  const target = await authorize(c), state = new URL(target, origin).searchParams.get('state')!;
  const result = await c.exchangeAndVerify(target);
  const visible = JSON.stringify([result, c.status(), c]) + inspect(c);
  for (const forbidden of ['HANDOFF_PRIVATE', user, '2'.repeat(32), state, target, origin]) expect(visible.includes(forbidden)).toBe(false);
  expect(out).not.toHaveBeenCalled(); expect(err).not.toHaveBeenCalled();
});

it.each([{ identityTimeoutMs: 10001 }, { identityBytes: 65537 }, { identityBytes: 0 }])(
  'rejects invalid identity limits before any authorization/exchange (case %#)', options => {
    expect(() => { const c = new R2OAuthSessionConnection(plan(), options); connections.push(c); }).toThrow('invalid_session');
  });

it('discards unused verification permits and external subscriptions when the token expires', async () => {
  vi.useFakeTimers(); const root = new AbortController();
  const c = new R2OAuthSessionConnection(plan(), { signal: root.signal, fetch: async url =>
    new URL(String(url)).pathname === '/oauth_token.do'
      ? Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 6 })
      : Response.json({ result: [{ sys_id: user }] }) }); connections.push(c);
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: true });
  await vi.advanceTimersByTimeAsync(1100);
  expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false });
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['timeout', 'renderer_failure'] as const)('closes the connection on authorization %s without leaving subscriptions', async kind => {
  vi.useFakeTimers(); const root = new AbortController();
  const c = new R2OAuthSessionConnection(plan(), { signal: root.signal, authorizationTimeoutMs: 10,
    fetch: async () => { throw Error('NETWORK_FORBIDDEN'); } }); connections.push(c);
  if (kind === 'renderer_failure') {
    expect(await c.withAuthorizationRequest(async () => { throw Error('HANDOFF_PRIVATE_RENDER'); }))
      .toEqual({ ok: false, code: 'authorization_consumer_failed' });
  } else { await vi.advanceTimersByTimeAsync(11); }
  expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false, tokenMayHaveBeenIssued: false });
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['root', 'review'] as const)('propagates %s cancellation into a pending bounded review and waits for cleanup', async kind => {
  const root = new AbortController(), reviewAbort = new AbortController();
  let entered!: () => void; const started = new Promise<void>(r => { entered = r; });
  const c = new R2OAuthSessionConnection(plan(), { signal: root.signal, fetch: async url => {
    const path = new URL(String(url)).pathname;
    if (path === '/oauth_token.do') return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    if (path === '/api/now/table/sys_user') return Response.json({ result: [{ sys_id: user }] });
    expect(path).toBe(`/api/now/table/sys_update_set/${parent}`); entered(); return new Promise(() => {});
  } }); connections.push(c);
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: true });
  const task = c.review({ update_set_sys_id: parent }, reviewAbort.signal); await started;
  expect(await c.review({ update_set_sys_id: parent })).toEqual({ ok: false, code: 'review_busy' });
  (kind === 'root' ? root : reviewAbort).abort();
  expect(await task).toEqual({ ok: false, code: 'cancelled' });
  expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false });
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
}, 10000);

it.each(['exchange', 'identity'] as const)('closes both owners on %s timeout without moving to review', async stage => {
  const paths: string[] = [];
  const c = new R2OAuthSessionConnection(plan(), { exchangeTimeoutMs: 5, identityTimeoutMs: 5, fetch: async url => {
    const path = new URL(String(url)).pathname; paths.push(path);
    if (stage === 'identity' && path === '/oauth_token.do') return Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    return new Promise(() => {});
  } }); connections.push(c);
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: false,
    code: stage === 'exchange' ? 'exchange_outcome_unknown' : 'identity_budget_exceeded' });
  expect(c.status()).toMatchObject({ phase: 'closed', hasCredential: false });
  expect(paths).toEqual(stage === 'exchange' ? ['/oauth_token.do'] : ['/oauth_token.do', '/api/now/table/sys_user']);
});

it('rejects repeated authorization after verification without invalidating the verified session', async () => {
  const c = new R2OAuthSessionConnection(plan(), { fetch: async url =>
    new URL(String(url)).pathname === '/oauth_token.do'
      ? Response.json({ access_token: token, token_type: 'Bearer', scope: 'review_read', expires_in: 900 })
      : Response.json({ result: [{ sys_id: user }] }) }); connections.push(c);
  expect(await c.exchangeAndVerify(await authorize(c))).toEqual({ ok: true });
  const render = vi.fn(async () => {});
  expect(await c.withAuthorizationRequest(render)).toEqual({ ok: false, code: 'authorization_unavailable' });
  expect(render).not.toHaveBeenCalled(); expect(c.status()).toMatchObject({ phase: 'verified', hasCredential: true });
});
