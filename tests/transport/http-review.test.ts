import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { aggregateReviewSchema, aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';

const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error('HTTP_EVENT_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
it('authenticates, lists, calls, cancels and recovers over real HTTP without exposing private data', async () => {
  const probe = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => resolve((probe.address() as { port: number }).port));
  });
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const root = resolve('.'), home = await mkdtemp(join(tmpdir(), 'bp5-http-'));
  const token = 'STDIO_PRIVATE_HTTP_AUTH_' + randomUUID();
  const child = spawn(process.execPath, ['--import', join(root, 'tests/review/fixtures/http-review-boundary.mjs'), join(root, 'dist/server.js')], {
    cwd: home, env: { HOME: home, USERPROFILE: home, MCP_TRANSPORT: 'http', MCP_HTTP_HOST: '127.0.0.1', MCP_HTTP_PORT: String(port),
      MCP_HTTP_AUTH_TOKEN: token, SERVICENOW_INSTANCE_URL: 'https://stdio-fixture.service-now.com',
      SERVICENOW_AUTH_MODE: 'per-user', SERVICENOW_PER_USER_BEARER_TOKEN: 'STDIO_PRIVATE_TOKEN',
      MCP_TOOL_PACKAGE: 'platform_developer', WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '', stage = 'startup', spawnFailed = false;
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  child.on('error', () => { spawnFailed = true; });
  child.stdout.on('data', chunk => { diagnostics += String(chunk); });
  child.stderr.on('data', chunk => { diagnostics += String(chunk); });
  const base = `http://127.0.0.1:${port}`;
  let wire = '', cancellationAccepted = false;
  const client = new Client({ name: 'bp5-http-e2e', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(base + '/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' },
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 10, maxReconnectionDelay: 10, reconnectionDelayGrowFactor: 1 },
    fetch: async (url, init) => {
      if (String(url) !== base + '/mcp') throw Error('HTTP_CLIENT_DESTINATION_DENIED');
      const response = await fetch(url, init);
      if (typeof init?.body === 'string' && JSON.parse(init.body).method === 'notifications/cancelled' && response.status === 202) cancellationAccepted = true;
      const body = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
        wire += Buffer.from(chunk).toString('utf8');
        controller.enqueue(chunk);
      } }));
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    },
  });
  let received = '', cancellationSent = false, protocolErrors = 0, sessionCloseNotifications = 0, terminating = false;
  try {
    await waitFor(() => spawnFailed || child.exitCode !== null || diagnostics.includes('server running on http://'));
    expect(spawnFailed || child.exitCode !== null).toBe(false);
    stage = 'authentication';
    for (const auth of [undefined, 'Bearer STDIO_PRIVATE_WRONG_HTTP_TOKEN']) {
      const response = await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), signal: AbortSignal.timeout(5000) });
      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      wire += await response.text();
    }
    const health = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) });
    expect((await health.json()).sessions).toBe(0);
    stage = 'connect';
    await client.connect(transport);
    expect(typeof transport.sessionId).toBe('string');
    const onmessage = transport.onmessage!, onerror = transport.onerror;
    transport.onmessage = message => { received += JSON.stringify(message); onmessage(message); };
    transport.onerror = error => {
      // SDK schedules GET/SSE reconnection after an explicit DELETE as well.
      // Count only this exact, post-termination notification separately.
      if (terminating && error.message === 'Maximum reconnection attempts (0) exceeded.') sessionCloseNotifications++;
      else protocolErrors++;
      onerror?.(error);
    };
    const send = transport.send.bind(transport);
    transport.send = async message => {
      if ('method' in message && message.method === 'notifications/cancelled') cancellationSent = true;
      await send(message);
    };
    const name = 'review_update_set_best_practices';
    stage = 'list';
    const listed = (await client.listTools()).tools.filter(t => t.name === name);
    expect(listed.length).toBe(1);
    expect(listed[0].annotations?.readOnlyHint).toBe(true);
    for (const mode of [undefined, 'review_targets'] as const) {
      stage = mode ? 'call_v3' : 'call_v2';
      const response = await client.callTool({ name, arguments: { update_set_sys_id: 'a'.repeat(32), ...(mode ? { selection_mode: mode } : {}) } });
      expect(response.isError).toBe(false);
      if (response.content[0].type !== 'text') throw Error('EXPECTED_JSON');
      const parsed = (mode ? aggregateReviewV3Schema : aggregateReviewSchema).safeParse(JSON.parse(response.content[0].text));
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw Error('INVALID_CONTRACT');
      expect(parsed.data.counts.reviewed).toBe(1);
      expect(parsed.data.counts.findings).toBe(1);
      expect(parsed.data.code_return_mode).toBe('none');
    }
    stage = 'session_authentication';
    // Possession of a valid session ID never replaces bearer authentication.
    for (const method of ['POST', 'GET', 'DELETE']) for (const auth of [undefined, 'Bearer STDIO_PRIVATE_WRONG_HTTP_TOKEN']) {
      const response = await fetch(base + '/mcp', { method,
        headers: { 'Mcp-Session-Id': transport.sessionId!, 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
        ...(method === 'POST' ? { body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) } : {}),
        signal: AbortSignal.timeout(5000) });
      expect(response.status).toBe(401);
      received += await response.text();
    }
    stage = 'cancel';
    const controller = new AbortController();
    const pending = client.callTool({ name, arguments: { update_set_sys_id: 'b'.repeat(32), selection_mode: 'review_targets' } },
      CallToolResultSchema, { signal: controller.signal });
    const rejected = pending.then(() => false, () => true);
    await waitFor(() => diagnostics.includes('BP5_STDIO_PAYLOAD_STARTED'));
    controller.abort(); expect(await rejected).toBe(true);
    await waitFor(() => diagnostics.includes('BP5_STDIO_PAYLOAD_ABORTED'));
    await waitFor(() => cancellationAccepted);
    expect(cancellationSent).toBe(true);
    stage = 'recovery';
    let recovered = false;
    for (let i = 0; i < 50 && !recovered; i++) {
      const response = await client.callTool({ name, arguments: { update_set_sys_id: 'a'.repeat(32) } });
      if (!response.isError && response.content[0].type === 'text') {
        const parsed = aggregateReviewSchema.safeParse(JSON.parse(response.content[0].text));
        recovered = parsed.success && parsed.data.counts.reviewed === 1 && parsed.data.counts.findings === 1;
      } else {
        if (response.content[0].type !== 'text' || JSON.parse(response.content[0].text).error?.code !== 'review_busy') throw Error('RECOVERY_FAILED');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    expect(recovered).toBe(true);
    stage = 'invalid_input';
    const invalid = await client.callTool({ name, arguments: { update_set_sys_id: 'a'.repeat(32), payload: 'STDIO_PRIVATE_INPUT' } });
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0].type === 'text' && JSON.parse(invalid.content[0].text).error?.code === 'invalid_input').toBe(true);
    stage = 'upstream_error';
    const denied = await client.callTool({ name, arguments: { update_set_sys_id: 'c'.repeat(32) } });
    expect(denied.isError).toBe(true);
    expect(denied.content[0].type === 'text' && JSON.parse(denied.content[0].text).error?.code === 'access_denied').toBe(true);
    stage = 'terminate_session';
    expect(protocolErrors).toBe(0);
    terminating = true;
    await transport.terminateSession();
    stage = 'session_count';
    const ended = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) });
    expect((await ended.json()).sessions).toBe(0);
    stage = 'protocol_errors_' + protocolErrors;
    expect(protocolErrors).toBe(0);
    expect(sessionCloseNotifications <= 1).toBe(true);
    stage = 'non_exposure';
    expect(/STDIO_PRIVATE|<record_update|<!\[CDATA\[/.test(diagnostics + received + wire)).toBe(false);
  } catch {
    throw Error('HTTP_REVIEW_E2E_FAILED_' + stage);
  } finally {
    try { await client.close(); await transport.close(); }
    finally {
      child.kill('SIGTERM');
      try { await waitFor(() => child.exitCode !== null || child.signalCode !== null); }
      catch { child.kill('SIGKILL'); }
      await closed;
      await rm(home, { recursive: true, force: true });
      expect(child.exitCode).toBe(0);
    }
  }
});
