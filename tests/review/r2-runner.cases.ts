import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:net';
import { getEventListeners } from 'node:events';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { aggregateReviewSchema, aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';
import { runR2ApprovalManifest, R2_RUNNER_TOTAL_MS, R2_RUNNER_CLEANUP_MS } from '../../src/review/r2-runner.js';

// Imported by r2-loopback.test.ts: all tests using the fixed port share one sequential file.
describe('manifest runner integration', () => {
const origin = 'https://runner-fixture.service-now.com', user = '1'.repeat(32), parent = 'a'.repeat(32);
const token = 'RUNNER_PRIVATE_TOKEN', slot = 'r2-runner';
let dir: string, file: string;
let secretNeedles: string[];
beforeEach(() => {
  secretNeedles = [token, 'RUNNER_PRIVATE_CLIENT', user, 'RUNNER_PRIVATE_BODY'];
  dir = mkdtempSync(join(realpathSync(process.platform === 'linux' ? process.cwd() : tmpdir()), 'r2-runner-'));
  chmodSync(dir, 0o700); file = join(dir, 'manifest.json');
  const now = Date.now();
  writeFileSync(file, JSON.stringify({ schema_version: 'bp5-r2-approval-0.1',
    approval: { reference: 'RUNNER_PRIVATE_APPROVAL', approved_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3600000).toISOString() },
    instance_id: slot, instance_binding: createReviewInstanceBinding(slot, origin),
    callback_uri: 'http://127.0.0.1:18765/bp5/oauth/callback',
    plan: { instanceUrl: origin, clientId: 'RUNNER_PRIVATE_CLIENT', scopes: ['review_read'], expectedUserSysId: user, updateSetSysId: parent,
      reviewReleaseConfig: { instance_id: slot, assertion: { family: 'Australia', instance_binding: createReviewInstanceBinding(slot, origin),
        asserted_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 3600000).toISOString() } } },
    review: { update_set_sys_id: parent, selection_mode: 'review_targets', max_records: 10,
      requested_rule_ids: ['AU-BR-001', 'AU-BR-002', 'AU-CL-004'] } }), { mode: 0o600 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });
function get(path = '/bp5/start') {
  return new Promise<string>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: 18765, path, agent: false }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', v => { body += v; }); res.once('end', () => resolve(body));
    }); req.on('error', reject); req.setTimeout(2000, () => req.destroy(Error('TEST_HTTP_TIMEOUT'))); req.end();
  });
}
async function authorize() {
  const page = await get(); const auth = new URL(page.match(/href="([^"]+)"/)![1].replace(/&amp;/g, '&'));
  expect(auth.origin).toBe(origin);
  secretNeedles.push(auth.href, auth.searchParams.get('state')!, 'RUNNER_PRIVATE_CODE');
  await get('/bp5/oauth/callback?' + new URLSearchParams({ state: auth.searchParams.get('state')!, code: 'RUNNER_PRIVATE_CODE' }));
}
function boundary(issued = token) {
  const paths: string[] = [];
  const row = { sys_id: 'b'.repeat(32), update_set: parent, name: `sys_script_${'c'.repeat(32)}`, type: 'Business Rule',
    action: 'INSERT_OR_UPDATE', sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const u = new URL(String(url)); paths.push(u.pathname); expect(u.origin).toBe(origin);
    if (u.pathname === '/oauth_token.do') {
      expect(init?.method).toBe('POST');
      secretNeedles.push(new URLSearchParams(String(init?.body)).get('code_verifier')!);
      return Response.json({ access_token: issued, token_type: 'Bearer', scope: 'review_read', expires_in: 900 });
    }
    expect(init?.method).toBe('GET'); expect(new Headers(init?.headers).get('authorization') === `Bearer ${issued}`).toBe(true);
    if (u.pathname === '/api/now/table/sys_user') return Response.json({ result: [{ sys_id: user }] });
    if (u.pathname === '/api/now/table/sys_cluster_state') return new Response('RUNNER_PRIVATE_DENIED', { status: 403 });
    if (u.pathname === `/api/now/table/sys_update_set/${parent}`) return Response.json({ result: { sys_id: parent,
      state: 'in progress', application: 'global', sys_updated_on: row.sys_updated_on, sys_mod_count: '0' } });
    if (u.pathname === '/api/now/table/sys_update_xml') {
      if (u.searchParams.get('sysparm_fields')?.includes('payload')) {
        const detail: Record<string, unknown> = { ...row }; delete detail.type;
        return Response.json({ result: [{ ...detail, payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${'c'.repeat(32)}</sys_id><sys_scope>global</sys_scope><when>after</when><script><![CDATA[/* RUNNER_PRIVATE_BODY */ current.update();]]></script></sys_script></record_update>` }] });
      }
      return Response.json({ result: [row] });
    }
    throw Error('RUNNER_PRIVATE_PATH');
  }); return { fetcher, paths };
}
it('rejects an untrusted manifest offline without binding or contacting an issuer', async () => {
  const fetcher = vi.fn<typeof fetch>(); const ready = vi.fn();
  const result = await runR2ApprovalManifest('/not-present-r2-approval.json', { fetch: fetcher, onReady: ready });
  expect(result).toMatchObject({ ok: false, code: 'manifest_untrusted', cleanup: 'complete',
    tokenMayHaveBeenIssued: false, otherAccountTokenPossible: false });
  expect(fetcher).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalled();
});
it('connects the trusted manifest through callback, identity, SDK list/call and real worker once', async () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true), stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const { fetcher, paths } = boundary();
  const result = await runR2ApprovalManifest(file, { fetch: fetcher, onReady: async url => {
    expect(url).toBe('http://127.0.0.1:18765/bp5/start'); await authorize();
  } });
  expect(result.ok).toBe(true); if (!result.ok) throw Error('RUNNER_EXPECTED_SUCCESS');
  expect(result.cleanup).toBe('complete'); expect(result.mcpListed).toBe(true);
  expect(result.tokenMayHaveBeenIssued).toBe(true);
  const parsed = aggregateReviewV3Schema.safeParse(JSON.parse(result.result.content[0].text));
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.counts).toMatchObject({ reviewed: 1, findings: 1 });
  expect(paths.slice(0, 2)).toEqual(['/oauth_token.do', '/api/now/table/sys_user']);
  expect(JSON.stringify(result).includes('RUNNER_PRIVATE')).toBe(false);
  for (const needle of secretNeedles) expect(JSON.stringify(result).includes(needle)).toBe(false);
  expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
}, 15000);

it('preserves bounded_all 0.2 results through the same fixed SDK path', async () => {
  const value = JSON.parse(readFileSync(file, 'utf8')); value.review.selection_mode = 'bounded_all';
  writeFileSync(file, JSON.stringify(value));
  const result = await runR2ApprovalManifest(file, { fetch: boundary().fetcher, onReady: authorize });
  expect(result.ok).toBe(true); if (!result.ok) throw Error('EXPECTED_COMPATIBILITY');
  expect(aggregateReviewSchema.safeParse(JSON.parse(result.result.content[0].text)).success).toBe(true);
});

it('stops a non-cooperative ready consumer at the internal deadline and releases the port/subscriptions', async () => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>();
  const started = performance.now();
  const result = await runR2ApprovalManifest(file, { signal: root.signal, fetch: fetcher,
    totalTimeoutMs: 100, cleanupTimeoutMs: 40, onReady: () => new Promise(() => {}) });
  expect(result).toMatchObject({ ok: false, code: 'deadline_exceeded', cleanup: 'complete', tokenMayHaveBeenIssued: false });
  expect(performance.now() - started).toBeLessThan(1000);
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0); expect(fetcher).not.toHaveBeenCalled();
  const second = new AbortController();
  expect(await runR2ApprovalManifest(file, { signal: second.signal, fetch: fetcher, onReady: () => { second.abort(); } }))
    .toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete' });
});

it('enforces the default 385-second budget with three seconds reserved for cleanup', async () => {
  expect(R2_RUNNER_TOTAL_MS).toBe(385000); expect(R2_RUNNER_CLEANUP_MS).toBe(3000);
  vi.useFakeTimers();
  let ready!: () => void; const began = new Promise<void>(r => { ready = r; });
  let settled = false;
  const task = runR2ApprovalManifest(file, { fetch: vi.fn<typeof fetch>(), onReady: () => { ready(); return new Promise(() => {}); } });
  void task.then(() => { settled = true; }); await began;
  await vi.advanceTimersByTimeAsync(381999); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await task).toMatchObject({ ok: false, code: 'deadline_exceeded', cleanup: 'complete' });
  expect(vi.getTimerCount()).toBe(0);
});

it('checks monotonic elapsed time before advancing even if a timer callback was delayed', async () => {
  let now = 100;
  const fetcher = vi.fn<typeof fetch>();
  const result = await runR2ApprovalManifest(file, { now: () => now, fetch: fetcher,
    onReady: () => { now += 382000; } });
  expect(result).toMatchObject({ ok: false, code: 'deadline_exceeded', cleanup: 'complete' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['exchange', 'identity', 'payload'] as const)('cancels non-cooperative %s I/O, destroys credentials and does not advance', async stage => {
  const base = boundary(), root = new AbortController(); let entered!: () => void, late!: (r: Response) => void;
  let requestSignal: AbortSignal | null | undefined, discarded = false;
  const began = new Promise<void>(r => { entered = r; });
  const fetcher: typeof fetch = async (url, init) => {
    const u = new URL(String(url));
    if ((stage === 'exchange' && u.pathname === '/oauth_token.do')
      || (stage === 'identity' && u.pathname === '/api/now/table/sys_user')
      || (stage === 'payload' && u.searchParams.get('sysparm_fields')?.includes('payload'))) {
      requestSignal = init?.signal; entered(); return new Promise<Response>(r => { late = r; });
    }
    return base.fetcher(url, init);
  };
  const task = runR2ApprovalManifest(file, { fetch: fetcher, signal: root.signal, onReady: authorize });
  await began; root.abort(Error('RUNNER_PRIVATE_ABORT'));
  const result = await task;
  expect(result).toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete', tokenMayHaveBeenIssued: true });
  expect(result.mcpListed).toBe(stage === 'payload');
  expect(requestSignal?.aborted).toBe(true); expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  late(new Response(new ReadableStream({ cancel() { discarded = true; } })));
  await new Promise(r => setTimeout(r, 0)); expect(discarded).toBe(true);
  expect(base.paths.filter(v => v === '/oauth_token.do').length).toBe(stage === 'exchange' ? 0 : 1);
}, 10000);

it('stops on identity mismatch and reports possible other-account issuance without reaching metadata', async () => {
  const base = boundary();
  const result = await runR2ApprovalManifest(file, { onReady: authorize, fetch: async (url, init) =>
    new URL(String(url)).pathname === '/api/now/table/sys_user' ? Response.json({ result: [{ sys_id: '2'.repeat(32) }] }) : base.fetcher(url, init) });
  expect(result).toMatchObject({ ok: false, code: 'identity_mismatch', cleanup: 'complete',
    tokenMayHaveBeenIssued: true, otherAccountTokenPossible: true, mcpListed: false });
  expect(base.paths).toEqual(['/oauth_token.do']);
});

it('never emits credentials, code, identity or arbitrary errors through stdout/stderr or failure receipts', async () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true), stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const result = await runR2ApprovalManifest(file, { onReady: authorize, fetch: async () => { throw Error('RUNNER_PRIVATE_UPSTREAM'); } });
  expect(result).toMatchObject({ ok: false, code: 'exchange_outcome_unknown', cleanup: 'complete', tokenMayHaveBeenIssued: true });
  const visible = JSON.stringify(result);
  for (const marker of ['RUNNER_PRIVATE', origin, user, 'state=', 'code=', 'code_verifier', '/manifest.json']) expect(visible.includes(marker)).toBe(false);
  expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
});

it('rejects a result containing the actual bearer even when it is reflected through valid metadata', async () => {
  const base = boundary('c'.repeat(32));
  const result = await runR2ApprovalManifest(file, { onReady: authorize, fetch: base.fetcher });
  expect(result).toMatchObject({ ok: false, code: 'secret_output_detected', cleanup: 'complete', mcpListed: true });
  expect(result).not.toHaveProperty('result');
});

it('terminates an actual non-cooperative CPU worker on root cancellation before returning', async () => {
  const base = boundary(), root = new AbortController(); let exited = false;
  const result = await runR2ApprovalManifest(file, { signal: root.signal, fetch: base.fetcher, onReady: authorize,
    workerFactory: (_url, options) => {
      const worker = new Worker(`const {parentPort}=require('node:worker_threads');
        parentPort.postMessage({type:'review_worker_ready'}); parentPort.on('message',()=>{while(true){}});`, { ...options, eval: true });
      worker.once('message', () => { setTimeout(() => root.abort(), 20); });
      worker.once('exit', () => { exited = true; }); return worker;
    } });
  expect(result).toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete', mcpListed: true });
  expect(exited).toBe(true);
}, 10000);

it('returns cleanup_incomplete instead of a success/result if OS worker termination does not settle', async () => {
  const base = boundary(), root = new AbortController(); let terminate: (() => Promise<number>) | undefined;
  try {
    const result = await runR2ApprovalManifest(file, { signal: root.signal, fetch: base.fetcher, onReady: authorize,
      totalTimeoutMs: 2000, cleanupTimeoutMs: 100,
      workerFactory: (_url, options) => {
        const worker = new Worker(`const {parentPort}=require('node:worker_threads');
          parentPort.postMessage({type:'review_worker_ready'}); parentPort.on('message',()=>{while(true){}});`, { ...options, eval: true });
        terminate = worker.terminate.bind(worker);
        vi.spyOn(worker, 'terminate').mockImplementation(() => new Promise(() => {}));
        worker.once('message', () => { setTimeout(() => root.abort(), 20); }); return worker;
      } });
    expect(result).toMatchObject({ ok: false, code: 'cleanup_incomplete', cleanup: 'incomplete' });
    expect(result).not.toHaveProperty('result');
  } finally { await terminate?.(); }
}, 10000);

it.each([0, -1, 385001, NaN, 1.5])('rejects total timeout %s before bind or network', async totalTimeoutMs => {
  const ready = vi.fn(), fetcher = vi.fn<typeof fetch>();
  expect(await runR2ApprovalManifest(file, { totalTimeoutMs, onReady: ready, fetch: fetcher }))
    .toMatchObject({ ok: false, code: 'invalid_runner_options', tokenMayHaveBeenIssued: false });
  expect(ready).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it('does not bind on pre-cancellation and restores process subscriptions after renderer failure', async () => {
  const int = process.listenerCount('SIGINT'), term = process.listenerCount('SIGTERM');
  const root = new AbortController(); root.abort(); const fetcher = vi.fn<typeof fetch>(), ready = vi.fn();
  expect(await runR2ApprovalManifest(file, { signal: root.signal, fetch: fetcher, onReady: ready }))
    .toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete' });
  expect(ready).not.toHaveBeenCalled();
  expect(await runR2ApprovalManifest(file, { fetch: fetcher, onReady: () => { throw Error('RUNNER_PRIVATE_RENDER'); } }))
    .toMatchObject({ ok: false, code: 'runner_failed', cleanup: 'complete' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(process.listenerCount('SIGINT')).toBe(int); expect(process.listenerCount('SIGTERM')).toBe(term);
});

it('does not fall back to another port or disturb a pre-existing listener', async () => {
  const occupied = createServer(socket => socket.end());
  await new Promise<void>(r => occupied.listen(18765, '127.0.0.1', r));
  try {
    const fetcher = vi.fn<typeof fetch>(), ready = vi.fn();
    expect(await runR2ApprovalManifest(file, { fetch: fetcher, onReady: ready }))
      .toMatchObject({ ok: false, code: 'callback_unavailable', cleanup: 'complete' });
    expect(occupied.listening).toBe(true); expect(fetcher).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalled();
  } finally { await new Promise<void>(r => occupied.close(() => r())); }
});

it.each(['SIGINT', 'SIGTERM'] as const)('handles actual %s in a dedicated synthetic child and exits without credentials or open handles', async signal => {
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./fixtures/r2-runner-signal.mjs', import.meta.url).pathname, file],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: {} });
  let stdout = '', stderr = ''; child.stdout!.on('data', v => { stdout += v; }); child.stderr!.on('data', v => { stderr += v; });
  const messages: unknown[] = [];
  const exit = new Promise<number | null>(resolve => { child.once('exit', resolve); });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(Error('TEST_CHILD_TIMEOUT')), 8000);
      child.on('message', value => {
        messages.push(value);
        if ((value as { ready?: boolean }).ready) { child.kill(signal); }
        if ((value as { done?: boolean }).done) resolve();
      });
      child.once('error', reject); child.once('exit', () => reject(Error('TEST_CHILD_EARLY_EXIT')));
    });
    expect(await exit).toBe(0);
    expect(messages).toEqual([{ ready: true }, { done: true, result: expect.objectContaining({
      ok: false, code: 'interrupted', cleanup: 'complete', tokenMayHaveBeenIssued: false }) }]);
    expect(stdout).toBe(''); expect(stderr).toBe(''); expect(JSON.stringify(messages).includes('RUNNER_PRIVATE')).toBe(false);
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
}, 12000);
});
