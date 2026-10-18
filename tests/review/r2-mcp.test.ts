import { expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { createR2ReviewBridge } from '../../src/review/r2-mcp-bridge.js';
import { R2ReviewSession } from '../../src/review/r2-session.js';
import { aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { BoundedReadSession } from '../../src/servicenow/bounded-read.js';
import type { R2Permit } from '../../src/review/r2-session.js';
import { Worker } from 'node:worker_threads';

const origin = 'https://r2-fixture.service-now.com', user = '1'.repeat(32), parent = 'a'.repeat(32);
const token = 'R2_PRIVATE_ACCESS_TOKEN';
const config = () => ({ instanceUrl: origin, clientId: 'R2_PRIVATE_CLIENT', expectedUserSysId: user,
  updateSetSysId: parent, bearerToken: token, expiresInSeconds: 900, issuedAt: performance.now(),
  reviewReleaseConfig: { instance_id: 'r2', assertion: { family: 'Australia',
    instance_binding: createReviewInstanceBinding('r2', origin), asserted_at: new Date(Date.now() - 1000).toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(), evidence_reference: 'R2_PRIVATE_REFERENCE' } } });
const row = { sys_id: 'b'.repeat(32), update_set: parent, name: `sys_script_${'c'.repeat(32)}`,
  type: 'Business Rule', action: 'INSERT_OR_UPDATE', sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
function boundary() {
  const paths: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url)); paths.push(u.pathname);
    if (u.origin !== origin || init?.method !== 'GET' || new Headers(init.headers).get('authorization') !== `Bearer ${token}`) {
      throw Error('R2_PRIVATE_BAD_REQUEST');
    }
    if (u.pathname === '/api/now/table/sys_user') return Response.json({ result: [{ sys_id: user }] });
    if (u.pathname === '/api/now/table/sys_cluster_state') return new Response('R2_PRIVATE_ERROR', { status: 403 });
    if (u.pathname === `/api/now/table/sys_update_set/${parent}`) return Response.json({ result: { sys_id: parent,
      state: 'in progress', application: 'global', sys_updated_on: row.sys_updated_on, sys_mod_count: '0' } });
    if (u.pathname === '/api/now/table/sys_update_xml') {
      if (u.searchParams.get('sysparm_fields')?.includes('payload')) {
        const detail: Record<string, unknown> = { ...row }; delete detail.type;
        return Response.json({ result: [{ ...detail, payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${'c'.repeat(32)}</sys_id><sys_scope>global</sys_scope><when>after</when><script><![CDATA[/* R2_PRIVATE_BODY */ current.update();]]></script></sys_script></record_update>` }] });
      }
      return Response.json({ result: [row] });
    }
    throw Error('R2_PRIVATE_UNEXPECTED_PATH');
  });
  return { paths, fetcher };
}

it('passes a verified token internally through SDK list/call, real dispatch and worker, then discards it', async () => {
  const { paths, fetcher } = boundary();
  const session = new R2ReviewSession(config(), { fetch: fetcher });
  const verified = await session.verify();
  if (!verified.ok) throw Error('IDENTITY_SETUP_FAILED');
  const bridge = await createR2ReviewBridge(session, verified.permit);
  try {
    const listed = await bridge.client.listTools();
    expect(listed.tools.map(t => t.name)).toEqual(['review_update_set_best_practices']);
    expect(listed.tools[0].annotations?.readOnlyHint).toBe(true);
    const response = await bridge.client.callTool({ name: 'review_update_set_best_practices',
      arguments: { update_set_sys_id: parent, selection_mode: 'review_targets' } });
    expect(response.isError).toBe(false);
    const text = (response.content as Array<{ type: string; text?: string }>)[0];
    const parsed = aggregateReviewV3Schema.safeParse(JSON.parse(text.text!));
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw Error('INVALID_CONTRACT');
    expect(parsed.data).toMatchObject({ status: 'partial', principal: { auth_mode: 'per-user' },
      instance_release: { source: 'operator_config', resolution_status: 'asserted' }, counts: { reviewed: 1, findings: 1 } });
    expect(new Set(paths)).toEqual(new Set(['/api/now/table/sys_user', '/api/now/table/sys_cluster_state',
      `/api/now/table/sys_update_set/${parent}`, '/api/now/table/sys_update_xml']));
    expect((JSON.stringify(response) + JSON.stringify(session) + inspect(session)).includes('R2_PRIVATE')).toBe(false);
    expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
    const count = paths.length;
    const again = await bridge.client.callTool({ name: 'review_update_set_best_practices', arguments: { update_set_sys_id: parent } });
    expect(again.isError).toBe(true); expect(paths).toHaveLength(count);
  } finally { await bridge.close(); }
}, 15000);

it('cancels an actual MCP call while payload I/O is pending, closes snapshots and rejects reuse', async () => {
  const base = boundary();
  let began!: () => void, aborted = false;
  const started = new Promise<void>(resolve => { began = resolve; });
  const fetcher: typeof fetch = async (url, init) => {
    if (new URL(String(url)).searchParams.get('sysparm_fields')?.includes('payload')) {
      began();
      return new Promise<Response>((_, reject) => {
        init!.signal!.addEventListener('abort', () => { aborted = true; reject(Error('R2_PRIVATE_ABORT')); }, { once: true });
      });
    }
    return base.fetcher(url, init);
  };
  const session = new R2ReviewSession(config(), { fetch: fetcher });
  const verified = await session.verify(); if (!verified.ok) throw Error('IDENTITY_SETUP_FAILED');
  const bridge = await createR2ReviewBridge(session, verified.permit);
  const control = new AbortController();
  try {
    const pending = bridge.client.callTool({ name: 'review_update_set_best_practices',
      arguments: { update_set_sys_id: parent } }, CallToolResultSchema, { signal: control.signal });
    const stopped = pending.then(() => false, () => true);
    await started;
    expect(await session.review(verified.permit, { update_set_sys_id: parent })).toEqual({ ok: false, code: 'review_busy' });
    control.abort(); expect(await stopped).toBe(true);
    await session.close();
    expect(aborted).toBe(true);
    expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
    expect(await session.review(verified.permit, { update_set_sys_id: parent })).toEqual({ ok: false, code: 'cancelled' });
    // Existing per-principal admission slots must also have been released.
    const next = new BoundedReadSession({ instanceUrl: origin, authMode: 'per-user', perUserBearerToken: token,
      oauth: { clientId: '', clientSecret: '' } });
    next.close(); expect(inspect(next).includes(token)).toBe(false);
  } finally { await bridge.close(); }
}, 10000);

it('closes an idle verified session when the SDK connection disconnects', async () => {
  const session = new R2ReviewSession(config(), { fetch: async () => Response.json({ result: [{ sys_id: user }] }) });
  const verified = await session.verify(); if (!verified.ok) throw Error('IDENTITY_SETUP_FAILED');
  const bridge = await createR2ReviewBridge(session, verified.permit);
  await bridge.client.close();
  expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
  await bridge.close();
});

it('a bridge made with an unverified capability never reaches ServiceNow', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const session = new R2ReviewSession(config(), { fetch: fetcher });
  const bridge = await createR2ReviewBridge(session, {} as R2Permit);
  try {
    const response = await bridge.client.callTool({ name: 'review_update_set_best_practices', arguments: { update_set_sys_id: parent } });
    expect(response.isError).toBe(true);
    expect(JSON.stringify(response).includes('invalid_session')).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { await bridge.close(); }
});

it('sanitizes SDK responses and stdout/stderr for invalid caller input and upstream failures', async () => {
  const outputs: string[] = [];
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { outputs.push(String(chunk)); return true; });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => { outputs.push(String(chunk)); return true; });
  let safe = false;
  try {
    for (const kind of ['invalid', 'upstream'] as const) {
      const base = boundary();
      const session = new R2ReviewSession(config(), { fetch: async (url, init) => {
        if (new URL(String(url)).pathname.includes('/sys_update_set/')) return new Response('R2_PRIVATE_UPSTREAM', { status: 403 });
        return base.fetcher(url, init);
      } });
      const verified = await session.verify(); if (!verified.ok) throw Error('IDENTITY_SETUP_FAILED');
      const bridge = await createR2ReviewBridge(session, verified.permit);
      try {
        const response = await bridge.client.callTool({ name: 'review_update_set_best_practices', arguments: {
          update_set_sys_id: parent, ...(kind === 'invalid' ? { bearerToken: token } : {}) } });
        outputs.push(JSON.stringify(response));
        expect(response.isError).toBe(true);
        expect(session.status().hasCredential).toBe(false);
      } finally { await bridge.close(); }
    }
    safe = !outputs.join('').includes('R2_PRIVATE');
  } finally { out.mockRestore(); err.mockRestore(); }
  expect(safe).toBe(true);
});

it.each(['analyze', 'finish'] as const)('close terminates a blocked %s worker without passing it credentials', async blockKind => {
  const started = new SharedArrayBuffer(4), sent: unknown[] = [], workers: Worker[] = [];
  const base = boundary();
  const session = new R2ReviewSession(config(), { fetch: base.fetcher, workerFactory: (_url, options) => {
    expect(options.env).toEqual({}); expect(options.workerData).toBeUndefined();
    const worker = new Worker(new URL('./fixtures/review-worker-bootstrap.mjs', import.meta.url),
      { ...options, workerData: { started, blockKind } });
    workers.push(worker);
    const post = worker.postMessage.bind(worker);
    worker.postMessage = value => { sent.push(value); post(value); };
    return worker;
  } });
  try {
    const verified = await session.verify(); if (!verified.ok) throw Error('IDENTITY_SETUP_FAILED');
    const pending = session.review(verified.permit, { update_set_sys_id: parent });
    const until = performance.now() + 2500;
    while (!Atomics.load(new Int32Array(started), 0) && performance.now() < until) await new Promise(r => setTimeout(r, 5));
    expect(Atomics.load(new Int32Array(started), 0)).toBe(1);
    await session.close();
    expect(await pending).toEqual({ ok: false, code: 'invalid_session' });
    expect(workers).toHaveLength(1);
    expect(workers[0].threadId).toBe(-1);
    expect(workers[0].listenerCount('message')).toBe(0);
    expect(JSON.stringify(sent).includes(token)).toBe(false);
    expect(JSON.stringify(sent).includes(user)).toBe(false);
    expect(session.status()).toEqual({ state: 'closed', hasCredential: false });
  } finally { await session.close(); for (const worker of workers) await worker.terminate(); }
}, 10000);
