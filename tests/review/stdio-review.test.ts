import { beforeAll, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { aggregateReviewSchema, aggregateReviewV3Schema } from '../../src/review/aggregate-schema.js';

const root = resolve('.');
const tool = 'review_update_set_best_practices';
beforeAll(() => {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc')], { cwd: root, timeout: 60000, stdio: 'pipe' });
}, 60000);

it('lists, calls, cancels and recovers over real stdio without exposing inspected code', async () => {
  const home = await mkdtemp(join(tmpdir(), 'bp5-stdio-'));
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', join(root, 'tests/review/fixtures/stdio-review-boundary.mjs'), join(root, 'dist/server.js')],
    cwd: home, stderr: 'pipe', maxBufferSize: 1048576, env: { HOME: home, USERPROFILE: home, MCP_TRANSPORT: 'stdio',
      SERVICENOW_INSTANCE_URL: 'https://stdio-fixture.service-now.com', SERVICENOW_AUTH_MODE: 'per-user',
      SERVICENOW_PER_USER_BEARER_TOKEN: 'STDIO_PRIVATE_TOKEN', MCP_TOOL_PACKAGE: 'platform_developer',
      WRITE_ENABLED: 'false', SCRIPTING_ENABLED: 'false' } });
  const client = new Client({ name: 'bp5-stdio-e2e', version: '0.0.0' });
  // Diagnostics remain in memory; never print child output or inspected code.
  let stderr = '';
  let stage = 'connect';
  let received = '', protocolErrors = 0, cancellationSent = false;
  let pid: number | null = null;
  transport.stderr!.on('data', chunk => { stderr += String(chunk); });
  try {
    await client.connect(transport);
    pid = transport.pid;
    expect(typeof pid).toBe('number');
    const onmessage = transport.onmessage!, onerror = transport.onerror;
    transport.onmessage = message => { received += JSON.stringify(message); onmessage(message); };
    transport.onerror = error => { protocolErrors++; onerror?.(error); };
    const send = transport.send.bind(transport);
    transport.send = async message => {
      if ('method' in message && message.method === 'notifications/cancelled') cancellationSent = true;
      await send(message);
    };
    stage = 'list';
    const listed = (await client.listTools()).tools.filter(t => t.name === tool);
    expect(listed.length).toBe(1);
    expect(listed[0].annotations?.readOnlyHint).toBe(true);
    for (const selection of [undefined, 'review_targets'] as const) {
      stage = selection ? 'call_v3' : 'call_v2';
      const response = await client.callTool({ name: tool, arguments: { update_set_sys_id: 'a'.repeat(32),
        ...(selection ? { selection_mode: selection } : {}) } });
      if (response.isError && response.content[0].type === 'text') {
        const code = JSON.parse(response.content[0].text).error?.code;
        stage += typeof code === 'string' && /^[a-z_]+$/.test(code) ? '_' + code : '_failed';
      }
      expect(response.isError).toBe(false);
      stage += '_json';
      const text = response.content[0];
      if (text.type !== 'text') throw Error('EXPECTED_JSON');
      const schema = selection ? aggregateReviewV3Schema : aggregateReviewSchema;
      const parsed = schema.safeParse(JSON.parse(text.text));
      expect(parsed.success).toBe(true);
      if (!parsed.success) throw Error('INVALID_CONTRACT');
      stage += '_reviewed_' + parsed.data.counts.reviewed;
      expect(parsed.data.counts.reviewed).toBe(1);
      stage += '_findings_' + parsed.data.counts.findings;
      expect(parsed.data.counts.findings).toBe(1);
      stage += '_none';
      expect(parsed.data.code_return_mode).toBe('none');
      stage += '_non_exposure';
      expect(/STDIO_PRIVATE|<record_update|<!\[CDATA\[/.test(JSON.stringify(response))).toBe(false);
    }
    stage = 'cancel';
    const controller = new AbortController();
    const pending = client.callTool({ name: tool, arguments: { update_set_sys_id: 'b'.repeat(32),
      selection_mode: 'review_targets' } }, CallToolResultSchema, { signal: controller.signal });
    const rejected = pending.then(() => false, () => true);
    const waitFor = async (predicate: () => boolean) => {
      const deadline = Date.now() + 5000;
      while (!predicate()) {
        if (Date.now() >= deadline) throw Error('STDIO_EVENT_TIMEOUT');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    await waitFor(() => stderr.includes('BP5_STDIO_PAYLOAD_STARTED'));
    controller.abort(); expect(await rejected).toBe(true);
    await waitFor(() => stderr.includes('BP5_STDIO_PAYLOAD_ABORTED'));
    expect(cancellationSent).toBe(true);
    stage = 'recovery';
    let recovered = false;
    for (let i = 0; i < 50 && !recovered; i++) {
      const response = await client.callTool({ name: tool, arguments: { update_set_sys_id: 'a'.repeat(32) } });
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
    const invalid = await client.callTool({ name: tool, arguments: { update_set_sys_id: 'a'.repeat(32), payload: 'STDIO_PRIVATE_INPUT' } });
    expect(invalid.isError).toBe(true);
    expect(invalid.content[0].type === 'text' && JSON.parse(invalid.content[0].text).error?.code === 'invalid_input').toBe(true);
    stage = 'upstream_error';
    const denied = await client.callTool({ name: tool, arguments: { update_set_sys_id: 'c'.repeat(32) } });
    expect(denied.isError).toBe(true);
    expect(denied.content[0].type === 'text' && JSON.parse(denied.content[0].text).error?.code === 'access_denied').toBe(true);
    stage = 'non_exposure';
    expect(/STDIO_PRIVATE|<record_update|<!\[CDATA\[/.test(received + stderr)).toBe(false);
    expect(protocolErrors).toBe(0);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'number' ? error.code : null;
    throw Error('STDIO_REVIEW_E2E_FAILED_' + stage + '_rpc_' + code);
  } finally {
    await client.close(); await transport.close(); await rm(home, { recursive: true, force: true });
    if (pid !== null) {
      let exited = false;
      try { process.kill(pid, 0); } catch (error) { exited = (error as NodeJS.ErrnoException).code === 'ESRCH'; }
      expect(exited).toBe(true);
    }
  }
}, 30000);
