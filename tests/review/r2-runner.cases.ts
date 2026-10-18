import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request, Server as HttpServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:net';
import { getEventListeners } from 'node:events';
import { createReviewInstanceBinding } from '../../src/servicenow/review-release-config.js';
import { aggregateReviewSchema, aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';
import { runR2ApprovalManifest, R2_RUNNER_TOTAL_MS, R2_RUNNER_CLEANUP_MS, type R2RunnerOptions } from '../../src/review/r2-runner.js';
import { superviseR2Host } from '../../src/review/r2-supervisor.js';
import { checkR2PlanOffline } from '../../src/review/r2-plan-check.js';
import { approveAndRunR2Plan } from '../../src/review/r2-approved-launch.js';
import { PassThrough, Writable } from 'node:stream';

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

it('rejects a snapshot that differs from the approved digest before bind or issuer contact', async () => {
  const fetcher = vi.fn<typeof fetch>(), ready = vi.fn();
  const result = await runR2ApprovalManifest(file, { expectedManifestDigest: 'f'.repeat(64), fetch: fetcher, onReady: ready });
  expect(result).toMatchObject({ ok: false, code: 'manifest_changed', cleanup: 'complete', tokenMayHaveBeenIssued: false });
  expect(fetcher).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalled();
});

it('binds a matching approved snapshot through the actual fixed bound host and cancels before any authorization', async () => {
  const checked = await checkR2PlanOffline(file);
  if (checked.status !== 'offline_valid') throw Error('SYNTHETIC_CHECK_FAILED');
  const root = new AbortController(); let ready = 0;
  const result = await superviseR2Host(file, { approvedDigest: checked.digest, signal: root.signal,
    onReady: () => { ready++; root.abort(); } });
  expect(ready).toBe(1);
  expect(result).toMatchObject({ terminal_reason: 'cancelled', process_termination: 'confirmed', cleanup: 'complete',
    token_issuance: 'not_attempted', runner_receipt: { ok: false, code: 'cancelled', tokenMayHaveBeenIssued: false } });
});

it('shows the fixed ready URL and a limited summary through the actual approved host without opening the authorization page', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false });
  let visible = '';
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    const line = String(chunk); visible += line; done();
    if (line.includes('Type APPROVE')) setImmediate(() => input.write('APPROVE\n'));
  } }), { isTTY: true });
  const root = new AbortController();
  const result = await approveAndRunR2Plan(file, { tty: { input, output }, signal: root.signal,
    supervisor: { onReady: () => root.abort() } });
  expect(result).toMatchObject({ stage: 'execution', summary: { terminal_reason: 'cancelled', cleanup: 'complete', token_issuance: 'not_attempted' } });
  expect(visible.split('http://127.0.0.1:18765/bp5/start').length - 1).toBe(1);
  expect(visible).toContain('bp5-r2-exit-summary-0.1');
  for (const secret of secretNeedles) expect(visible.includes(secret)).toBe(false);
  expect(visible).not.toContain('/oauth_auth.do');
});

it('leaves process signal handlers exclusively owned by the host while obeying its AbortSignal', async () => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>();
  const hostHandler = () => { root.abort(); };
  process.on('SIGINT', hostHandler); process.on('SIGTERM', hostHandler);
  const beforeInt = process.listeners('SIGINT'), beforeTerm = process.listeners('SIGTERM');
  let unchanged = false;
  try {
    const result = await runR2ApprovalManifest(file, { signalOwner: 'host', signal: root.signal, fetch: fetcher,
      onReady: () => {
        unchanged = process.listeners('SIGINT').length === beforeInt.length && process.listeners('SIGTERM').length === beforeTerm.length;
        hostHandler();
      } });
    expect(unchanged).toBe(true);
    expect(result).toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete' });
    expect(process.listeners('SIGINT')).toEqual(beforeInt); expect(process.listeners('SIGTERM')).toEqual(beforeTerm);
    expect(fetcher).not.toHaveBeenCalled(); expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
  } finally { process.removeListener('SIGINT', hostHandler); process.removeListener('SIGTERM', hostHandler); }
});

it('notifies cleanup synchronously once at the first cancellation without exposing execution context', async () => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>();
  const notices: Array<{ reason: string; remainingMs: number }> = [];
  const task = runR2ApprovalManifest(file, { signalOwner: 'host', signal: root.signal, fetch: fetcher,
    onCleanupStart: notice => {
      expect(Object.isFrozen(notice)).toBe(true); expect(Object.keys(notice).sort()).toEqual(['reason', 'remainingMs']);
      notices.push(notice);
    } });
  root.abort(Error('RUNNER_PRIVATE_STOP')); root.abort();
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ reason: 'cancelled' });
  expect(notices[0].remainingMs).toBeGreaterThan(0); expect(notices[0].remainingMs).toBeLessThanOrEqual(3000);
  expect(await task).toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete' });
  expect(notices).toHaveLength(1); expect(JSON.stringify(notices).includes('RUNNER_PRIVATE')).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});

it('pins the host remaining budget before bind and reserves cleanup inside that same budget', async () => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>();
  let clock = 100, ready!: () => void, settled = false;
  const notices: Array<{ reason: string; remainingMs: number }> = [];
  const began = new Promise<void>(r => { ready = r; });
  const task = runR2ApprovalManifest(file, { signalOwner: 'host', signal: root.signal, fetch: fetcher,
    now: () => clock, hostRemainingMs: () => 1300 - clock, cleanupTimeoutMs: 40,
    onCleanupStart: notice => { notices.push(notice); }, onReady: () => { clock = 1260; ready(); } });
  void task.then(() => { settled = true; });
  try {
    await began; await new Promise<void>(r => setImmediate(r));
    expect(settled).toBe(true);
    expect(await task).toMatchObject({ ok: false, code: 'deadline_exceeded', cleanup: 'complete' });
    expect(notices).toEqual([{ reason: 'deadline_exceeded', remainingMs: 40 }]);
    expect(fetcher).not.toHaveBeenCalled();
  } finally { root.abort(); await task; }
});

it('does not extend a previously observed host deadline when later observations increase', async () => {
  const root = new AbortController(); let clock = 100, reads = 0;
  const result = await runR2ApprovalManifest(file, { signalOwner: 'host', signal: root.signal, now: () => clock,
    hostRemainingMs: () => ++reads === 1 ? 1200 : 999999, cleanupTimeoutMs: 40, fetch: vi.fn<typeof fetch>(),
    onReady: () => { clock = 1260; } });
  expect(result).toMatchObject({ ok: false, code: 'deadline_exceeded', cleanup: 'complete' });
});

it('arms the waiting timer from the host budget rather than the runner default', async () => {
  vi.useFakeTimers(); const root = new AbortController();
  let ready!: () => void, settled = false;
  const began = new Promise<void>(r => { ready = r; });
  const task = runR2ApprovalManifest(file, { signalOwner: 'host', signal: root.signal, fetch: vi.fn<typeof fetch>(),
    hostRemainingMs: () => 1200, cleanupTimeoutMs: 40,
    onReady: () => { ready(); return new Promise<void>(() => {}); } });
  void task.then(() => { settled = true; });
  try {
    await began; await vi.advanceTimersByTimeAsync(1159); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await task).toMatchObject({ ok: false, code: 'deadline_exceeded', cleanup: 'complete' });
    expect(vi.getTimerCount()).toBe(0);
  } finally { root.abort(); await task; }
});

it('propagates the shrinking host budget and charges synchronous notification time to the same cleanup deadline', async () => {
  vi.useFakeTimers();
  const root = new AbortController(); let clock = 100, hostEnd = 10100, settled = false;
  let release!: () => void, closing!: () => void;
  const gate = new Promise<void>(r => { release = r; }), began = new Promise<void>(r => { closing = r; });
  const notices: Array<{ reason: string; remainingMs: number }> = [];
  const nativeClose = HttpServer.prototype.close;
  vi.spyOn(HttpServer.prototype, 'close').mockImplementation(function (this: HttpServer, callback?: (error?: Error) => void) {
    nativeClose.call(this, error => { closing(); void gate.then(() => callback?.(error)); }); return this;
  });
  const task = runR2ApprovalManifest(file, { signalOwner: 'host', signal: root.signal, now: () => clock,
    hostRemainingMs: () => hostEnd - clock, cleanupTimeoutMs: 40, fetch: vi.fn<typeof fetch>(),
    onCleanupStart: notice => { notices.push(notice); clock += 20; } });
  void task.then(() => { settled = true; });
  hostEnd = 130; root.abort();
  try {
    expect(notices).toEqual([{ reason: 'cancelled', remainingMs: 30 }]);
    await began; clock = 129; await vi.advanceTimersByTimeAsync(9); expect(settled).toBe(false);
    clock = 130; await vi.advanceTimersByTimeAsync(1);
    expect(await task).toMatchObject({ ok: false, code: 'cleanup_incomplete', cleanup: 'incomplete' });
    expect(notices).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  } finally { release(); await vi.advanceTimersByTimeAsync(0); await task; }
});

it.each(['throw', 'promise_reject', 'promise_pending'] as const)('keeps cleanup bounded and diagnostics fixed when the notification returns %s', async kind => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>(); let notified = 0;
  const result = await runR2ApprovalManifest(file, { signalOwner: 'host', signal: root.signal, fetch: fetcher,
    onReady: () => { root.abort(); }, onCleanupStart: () => {
      notified++;
      if (kind === 'throw') throw Error('RUNNER_PRIVATE_NOTIFICATION');
      if (kind === 'promise_reject') return Promise.reject(Error('RUNNER_PRIVATE_REJECTION'));
      return new Promise<void>(() => {});
    } });
  expect(result).toMatchObject({ ok: false, code: 'cleanup_notification_failed', cleanup: 'complete' });
  expect(result).not.toHaveProperty('result'); expect(JSON.stringify(result).includes('RUNNER_PRIVATE')).toBe(false);
  expect(notified).toBe(1); expect(fetcher).not.toHaveBeenCalled();
});

it('rejects an asynchronous host budget reader without an unhandled rejection or raw diagnostics', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const reader = (() => Promise.reject(Error('RUNNER_PRIVATE_BUDGET'))) as unknown as () => number;
  expect(await runR2ApprovalManifest(file, { hostRemainingMs: reader, fetch: fetcher }))
    .toMatchObject({ ok: false, code: 'invalid_runner_options', cleanup: 'complete' });
  await new Promise<void>(r => setImmediate(r));
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([NaN, Infinity, -Infinity])('rejects invalid initial host remaining %s before binding', async remaining => {
  const ready = vi.fn(), fetcher = vi.fn<typeof fetch>();
  expect(await runR2ApprovalManifest(file, { hostRemainingMs: () => remaining, onReady: ready, fetch: fetcher }))
    .toMatchObject({ ok: false, code: 'invalid_runner_options', cleanup: 'complete' });
  expect(ready).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it.each([0, -100, 3000])('rejects exhausted host budget %s including the cleanup reserve before binding', async remaining => {
  const ready = vi.fn(), fetcher = vi.fn<typeof fetch>();
  expect(await runR2ApprovalManifest(file, { hostRemainingMs: () => remaining, onReady: ready, fetch: fetcher }))
    .toMatchObject({ ok: false, code: 'deadline_exceeded', cleanup: 'complete' });
  expect(ready).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it('requires an external signal in host mode and rejects unknown ownership before binding', async () => {
  for (const signalOwner of ['host', 'other'] as const) {
    const ready = vi.fn(), fetcher = vi.fn<typeof fetch>();
    expect(await runR2ApprovalManifest(file, { signalOwner: signalOwner as R2RunnerOptions['signalOwner'], onReady: ready, fetch: fetcher }))
      .toMatchObject({ ok: false, code: 'invalid_runner_options', cleanup: 'complete' });
    expect(ready).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  }
});

it('pins host ownership, signal and notification against caller mutation of the options object', async () => {
  const root = new AbortController(), other = new AbortController();
  const beforeInt = process.listeners('SIGINT'), beforeTerm = process.listeners('SIGTERM');
  const original = vi.fn(), replacement = vi.fn();
  const options: R2RunnerOptions = { signalOwner: 'host', signal: root.signal, fetch: vi.fn<typeof fetch>(), onCleanupStart: original,
    onReady: () => { options.signalOwner = 'runner'; options.signal = other.signal; options.onCleanupStart = replacement; root.abort(); } };
  expect(await runR2ApprovalManifest(file, options)).toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete' });
  expect(original).toHaveBeenCalledTimes(1); expect(replacement).not.toHaveBeenCalled();
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0); expect(getEventListeners(other.signal, 'abort')).toHaveLength(0);
  expect(process.listeners('SIGINT')).toEqual(beforeInt); expect(process.listeners('SIGTERM')).toEqual(beforeTerm);
});

it('stops on a host budget observation failure without exposing the error or contacting the issuer', async () => {
  let fail = false;
  const fetcher = vi.fn<typeof fetch>(); const notices: Array<{ reason: string; remainingMs: number }> = [];
  const result = await runR2ApprovalManifest(file, { hostRemainingMs: () => {
    if (fail) { fail = false; throw Error('RUNNER_PRIVATE_BUDGET'); } return 10000;
  }, fetch: fetcher, onReady: () => { fail = true; }, onCleanupStart: notice => { notices.push(notice); } });
  expect(result).toMatchObject({ ok: false, code: 'host_budget_invalid', cleanup: 'complete' });
  expect(notices).toHaveLength(1); expect(notices[0].reason).toBe('failed');
  expect(fetcher).not.toHaveBeenCalled(); expect(JSON.stringify(result).includes('RUNNER_PRIVATE')).toBe(false);
});

it('discards a completed MCP result if the cleanup notification fails', async () => {
  const result = await runR2ApprovalManifest(file, { fetch: boundary().fetcher, onReady: authorize,
    onCleanupStart: () => { throw Error('RUNNER_PRIVATE_NOTIFICATION'); } });
  expect(result).toMatchObject({ ok: false, code: 'cleanup_notification_failed', cleanup: 'complete', mcpListed: true });
  expect(result).not.toHaveProperty('result'); expect(JSON.stringify(result).includes('RUNNER_PRIVATE')).toBe(false);
});

it('waits for cancelled startup and its delayed OS close confirmation before reporting cleanup complete', async () => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>(), ready = vi.fn();
  let release!: () => void, closing!: () => void, settled = false;
  const gate = new Promise<void>(r => { release = r; }), began = new Promise<void>(r => { closing = r; });
  const nativeClose = HttpServer.prototype.close;
  vi.spyOn(HttpServer.prototype, 'close').mockImplementation(function (this: HttpServer, callback?: (error?: Error) => void) {
    nativeClose.call(this, error => { closing(); void gate.then(() => callback?.(error)); }); return this;
  });
  const task = runR2ApprovalManifest(file, { signal: root.signal, fetch: fetcher, onReady: ready });
  void task.then(() => { settled = true; }); root.abort();
  try {
    await began; await new Promise<void>(r => setImmediate(r));
    expect(settled).toBe(false);
    release();
    expect(await task).toMatchObject({ ok: false, code: 'cancelled', cleanup: 'complete' });
    expect(ready).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
    const port = createServer(); await new Promise<void>(r => port.listen(18765, '127.0.0.1', r));
    await new Promise<void>(r => port.close(() => r()));
  } finally { release(); await task; }
});

it('reports cleanup_incomplete when cancelled startup cannot finish inside the shared cleanup budget', async () => {
  const root = new AbortController(), fetcher = vi.fn<typeof fetch>(), ready = vi.fn();
  let release!: () => void, closing!: () => void;
  const gate = new Promise<void>(r => { release = r; }), began = new Promise<void>(r => { closing = r; });
  const nativeClose = HttpServer.prototype.close;
  vi.spyOn(HttpServer.prototype, 'close').mockImplementation(function (this: HttpServer, callback?: (error?: Error) => void) {
    nativeClose.call(this, error => { closing(); void gate.then(() => callback?.(error)); }); return this;
  });
  const started = performance.now();
  const task = runR2ApprovalManifest(file, { signal: root.signal, fetch: fetcher, onReady: ready, cleanupTimeoutMs: 40 });
  root.abort(Error('RUNNER_PRIVATE_ABORT'));
  try {
    await began;
    const result = await task, snapshot = JSON.stringify(result);
    expect(result).toMatchObject({ ok: false, code: 'cleanup_incomplete', cleanup: 'incomplete', tokenMayHaveBeenIssued: false });
    expect(result).not.toHaveProperty('result'); expect(performance.now() - started).toBeLessThan(1000);
    expect(ready).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
    release(); await new Promise<void>(r => setImmediate(r));
    expect(JSON.stringify(result)).toBe(snapshot);
    const port = createServer(); await new Promise<void>(r => port.listen(18765, '127.0.0.1', r));
    await new Promise<void>(r => port.close(() => r()));
  } finally { release(); await task; }
});
it.each(['runner', 'host'] as const)('connects manifest, callback, identity, SDK and worker once with %s signal ownership', async signalOwner => {
  const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true), stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const root = new AbortController(); const notices: Array<{ reason: string; remainingMs: number }> = [];
  const { fetcher, paths } = boundary();
  const started = performance.now();
  const result = await runR2ApprovalManifest(file, { signalOwner, signal: root.signal, fetch: fetcher,
    hostRemainingMs: () => 385000 - (performance.now() - started), onCleanupStart: notice => { notices.push(notice); }, onReady: async url => {
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
  expect(notices).toHaveLength(1); expect(notices[0].reason).toBe('completed');
  expect(notices[0].remainingMs).toBeGreaterThan(0); expect(notices[0].remainingMs).toBeLessThanOrEqual(3000);
  expect(getEventListeners(root.signal, 'abort')).toHaveLength(0);
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

it.each([
  ['normal', 'SIGINT', 130], ['normal', 'SIGTERM', 143],
  ['slow-close', 'SIGINT', 71], ['fail-close', 'SIGINT', 71], ['repeat', 'SIGINT', 72],
] as const)('dedicated host %s / %s exits %s without secret output', async (mode, signal, expected) => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/review/fixtures/r2-host.mjs',
    mode === 'repeat' ? 'slow-close' : mode, file], { env: {}, serialization: 'json', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = ''; const messages: Array<{ type: string; receipt?: unknown }> = [];
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  child.on('message', (message: { type: string }) => {
    messages.push(message);
    if (message.type === 'prepared') child.send({ type: 'run_grant', remaining_ms: 4000 });
    if (message.type === 'ready') child.kill(signal);
    if (message.type === 'stopping' && mode === 'repeat') child.kill('SIGINT');
    if (message.type === 'finished') child.send({ type: 'finished_ack' });
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 6000);
  try {
    expect(await new Promise(resolve => child.on('close', resolve))).toBe(expected);
    expect(output).toBe('');
    expect(JSON.stringify(messages)).not.toContain('RUNNER_PRIVATE');
    expect(messages.some(m => m.type === 'ready')).toBe(true);
    if (expected === 70 || expected === 71 || expected === 72) expect(messages.some(m => m.type === 'finished')).toBe(false);
    else expect(messages.find(m => m.type === 'finished')?.receipt).toMatchObject({ cleanup: 'complete', ok: false });
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
}, 8000);

it.each(['no-grant', 'duplicate-grant', 'unknown-message', 'oversize', 'disconnect', 'no-ack', 'force'] as const)(
  'dedicated host fails closed on %s', async mode => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'tests/review/fixtures/r2-host.mjs', 'normal', file],
    { env: {}, serialization: 'json', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let output = ''; const messages: Array<{ type: string }> = [];
  const exited = new Promise(resolve => child.once('exit', resolve));
  const outputClosed = Promise.all([child.stdout, child.stderr].map(stream =>
    new Promise<void>(resolve => stream.once('close', resolve))));
  child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  child.on('message', (message: { type: string }) => {
    messages.push(message);
    if (message.type === 'prepared') {
      if (mode === 'no-grant') { child.send({ type: 'stop' }); return; }
      if (mode === 'unknown-message') { child.send({ type: 'arbitrary', secret: 'PRIVATE_IPC_BODY' }); return; }
      if (mode === 'oversize') { child.send({ type: 'stop', padding: 'X'.repeat(2048) }); return; }
      child.send({ type: 'run_grant', remaining_ms: 4000 });
      if (mode === 'duplicate-grant') child.send({ type: 'run_grant', remaining_ms: 4000 });
    }
    if (message.type === 'ready') {
      if (mode === 'disconnect') child.disconnect();
      else child.send({ type: mode === 'force' ? 'force' : 'stop' });
    }
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 6000);
  try {
    expect(await exited).toBe(
      mode === 'no-grant' ? 130 : mode === 'no-ack' ? 71 : mode === 'force' ? 72 : 10);
    await outputClosed;
    expect(output).toBe(''); expect(JSON.stringify(messages)).not.toContain('PRIVATE');
    if (['no-grant', 'unknown-message', 'oversize'].includes(mode)) expect(messages.some(m => m.type === 'ready')).toBe(false);
    if (mode === 'no-ack') expect(messages.some(m => m.type === 'finished')).toBe(true);
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); }
}, 8000);

it.each(['normal', 'slow-close'] as const)('supervises the actual runner host with %s cleanup', async mode => {
  const root = new AbortController();
  const result = await superviseR2Host(file, { signal: root.signal, totalTimeoutMs: 4000, cleanupTimeoutMs: 500,
    onReady: () => { root.abort(); },
    spawnHost: (command, args, options) => {
      expect(options.env).toEqual({}); expect(options.stdio).toEqual(['ignore', 'ignore', 'ignore', 'ipc']);
      expect(options.detached).toBe(true); expect(options.serialization).toBe('json'); expect(options.shell).toBe(false);
      expect(args.at(-2)).toMatch(/r2-host-entry\.ts$/);
      return spawn(command, [...args.slice(0, -2), 'tests/review/fixtures/r2-host.mjs', mode, file], options);
    } });
  expect(result.process_termination).toBe('confirmed');
  expect(JSON.stringify(result)).not.toContain('RUNNER_PRIVATE');
  if (mode === 'normal') expect(result).toMatchObject({ terminal_reason: 'cancelled', cleanup: 'complete',
    token_issuance: 'not_attempted', runner_receipt: { ok: false, code: 'cancelled' } });
  else { expect(result.token_issuance).toBe('unknown'); expect(result).not.toHaveProperty('runner_receipt'); }
}, 10000);
});
