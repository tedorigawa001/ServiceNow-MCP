import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { InstanceContext } from '../../src/servicenow/instances.js';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { aggregateReviewSchema } from '../../src/review/aggregate-schema.js';
import { logger } from '../../src/utils/logging.js';

// Configuration/instance selection boundary only; router, adapters, HTTP reader,
// XML/AST analysis, schemas and the worker are real. No private config is read.
const { context } = vi.hoisted(() => ({ context: { getClient: vi.fn(), listNames: () => ['blue', 'red'] } }));
vi.mock('../../src/servicenow/instances.js', () => ({ instanceManager: { createContext: () => context, listNames: () => [] } }));
import { handleCallTool, handleListTools } from '../../src/server.js';
import { createServer } from '../../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

const name = 'review_update_set_best_practices', parent = 'a'.repeat(32), id = '1'.repeat(32);
const input = { update_set_sys_id: parent };
const version = { sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = { sys_id: id, update_set: parent, name: `sys_script_${id}`, action: 'INSERT_OR_UPDATE', ...version };
const client = (color = 'blue') => new ServiceNowClient({ instanceUrl: `https://${color}.service-now.com`, authMode: 'per-user',
  perUserBearerToken: `SYNTHETIC_PRIVATE_${color}`, oauth: { clientId: '', clientSecret: '' } });
function fixture(release = 'Australia') {
  return vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.method).toBe('GET');
    const u = new URL(String(url));
    const result = u.pathname.includes('/sys_update_set/') ? { sys_id: parent, state: 'in progress', application: 'global', ...version }
      : u.pathname.endsWith('/sys_cluster_state') ? [{ build_name: release }]
        : u.searchParams.get('sysparm_fields')?.includes('payload') ? [{ ...row,
          payload: `<record_update table="sys_script"><sys_script action="INSERT_OR_UPDATE"><sys_id>${id}</sys_id><sys_scope>global</sys_scope><when>after</when><script><![CDATA[/* SYNTHETIC_PRIVATE_BODY */ current.update();]]></script></sys_script></record_update>` }]
          : [{ ...row, type: 'Business Rule' }];
    return new Response(JSON.stringify({ result }));
  });
}
beforeEach(() => {
  vi.stubEnv('MCP_TOOL_PACKAGE', 'full'); vi.stubEnv('WRITE_ENABLED', 'false'); vi.stubEnv('SCRIPTING_ENABLED', 'false');
  context.getClient.mockReset().mockReturnValue(client());
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('lists and calls the registered tool through real server dispatch without write/scripting permissions', async () => {
  const fetcher = fixture(); vi.stubGlobal('fetch', fetcher);
  expect((await handleListTools()).tools.filter(tool => tool.name === name)).toHaveLength(1);
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(false);
  const result = JSON.parse(response.content[0].text);
  expect(aggregateReviewSchema.safeParse(result).success).toBe(true);
  expect(result).toMatchObject({ status: 'partial', counts: { reviewed: 1, findings: 1 }, poc_only: true, code_return_mode: 'none' });
  expect(JSON.stringify(response)).not.toMatch(/SYNTHETIC_PRIVATE|blue\.service-now\.com/);
  expect(logger.error).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(6);
});
it('sets MCP isError and returns only fixed JSON on invalid input before selecting a client', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const response = await handleCallTool({ params: { name, arguments: { ...input, release: 'Australia' } } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(true);
  expect(JSON.parse(response.content[0].text)).toEqual({ status: 'failed', error: { stage: 'input', code: 'invalid_input' } });
  expect(context.getClient).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  expect(logger.error).not.toHaveBeenCalled();
});
it('consumes the instance selector and pins that client for every HTTP request in the call', async () => {
  let active = 'blue'; const selected = { blue: client('blue'), red: client('red') };
  context.getClient.mockImplementation((instance?: 'blue' | 'red') => selected[instance ?? active as 'blue' | 'red']);
  const base = fixture(); const observed: string[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    active = 'blue'; observed.push(new URL(url).hostname);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer SYNTHETIC_PRIVATE_red');
    return base(url, init);
  });
  const response = await handleCallTool({ params: { name, arguments: { ...input, instance: 'red' } } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(false);
  expect(context.getClient).toHaveBeenCalledExactlyOnceWith('red');
  expect(observed).toHaveLength(6); expect(new Set(observed)).toEqual(new Set(['red.service-now.com']));
});
it('sanitizes instance configuration exceptions without logging names, credentials or stack', async () => {
  context.getClient.mockImplementation(() => { throw Error('SYNTHETIC_PRIVATE_CONFIG /private/config.json'); });
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(true);
  expect(JSON.parse(response.content[0].text)).toEqual({ status: 'failed', error: { stage: 'input', code: 'config_invalid' } });
  expect(logger.error).not.toHaveBeenCalled();
});
it('does not bypass per-user authentication with a service account', async () => {
  context.getClient.mockReturnValue(new ServiceNowClient({ instanceUrl: 'https://blue.service-now.com', authMode: 'per-user',
    oauth: { clientId: 'SYNTHETIC_PRIVATE_SERVICE', clientSecret: 'SYNTHETIC_PRIVATE_SECRET' } }));
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(true);
  expect(JSON.parse(response.content[0].text).error.code).toBe('authentication_failed');
  expect(fetcher).not.toHaveBeenCalled(); expect(logger.error).not.toHaveBeenCalled();
});
it.each(['Zurich', 'unknown-family'])('returns partial without payload acquisition for %s', async release => {
  const fetcher = fixture(release); vi.stubGlobal('fetch', fetcher);
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(false);
  const result = JSON.parse(response.content[0].text);
  expect(result).toMatchObject({ status: 'partial', counts: { findings: 0, reviewed: 0 }, collection: { status: 'not_started' } });
  expect(result.coverage.skipped_rules).toHaveLength(3);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('returns fixed authentication failure instead of upstream body or exception text', async () => {
  vi.stubGlobal('fetch', async () => new Response('SYNTHETIC_PRIVATE_UPSTREAM', { status: 401 }));
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(true);
  expect(JSON.parse(response.content[0].text)).toEqual({ status: 'failed', error: { stage: 'parent', code: 'authentication_failed' } });
  expect(logger.error).not.toHaveBeenCalled();
});
it('keeps a failed metadata aggregate distinct from a successful empty list at the MCP boundary', async () => {
  const base = fixture();
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => new URL(url).pathname.endsWith('/sys_update_xml')
    ? new Response(JSON.stringify({ result: { error: 'SYNTHETIC_PRIVATE_METADATA' } })) : base(url, init));
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(true);
  const parsed = JSON.parse(response.content[0].text);
  expect(parsed).toMatchObject({ status: 'failed', error: { stage: 'metadata', code: 'metadata_unavailable' },
    result: { collection: { status: 'failed' }, status: 'failed' } });
  expect(aggregateReviewSchema.safeParse(parsed.result).success).toBe(true);
  expect(JSON.stringify(response)).not.toContain('SYNTHETIC_PRIVATE');
  expect(logger.error).not.toHaveBeenCalled();
});
it('separates concurrent session clients, credentials and release bindings', async () => {
  const base = fixture(), hosts: string[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const host = new URL(url).hostname, color = host.split('.')[0]; hosts.push(host);
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer SYNTHETIC_PRIVATE_${color}`);
    return base(url, init);
  });
  const outcomes = await Promise.all(['blue', 'red'].map(color => handleCallTool({ params: { name, arguments: input } },
    { getClient: () => client(color) } as unknown as InstanceContext)));
  expect(outcomes.every(response => response.isError === false)).toBe(true);
  const results = outcomes.map(response => JSON.parse(response.content[0].text));
  expect(results[0].target.instance_binding).not.toBe(results[1].target.instance_binding);
  expect(hosts.filter(host => host.startsWith('blue.'))).toHaveLength(6);
  expect(hosts.filter(host => host.startsWith('red.'))).toHaveLength(6);
});
it('cannot call the tool through a package that does not expose it', async () => {
  vi.stubEnv('MCP_TOOL_PACKAGE', 'service_desk');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(true);
  expect(context.getClient).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});
it('returns soft-cutoff partial as a successful MCP call with explicit unprocessed reasons', async () => {
  const now = performance.now.bind(performance); let spent = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now() + spent);
  const base = fixture();
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    if (new URL(url).searchParams.get('sysparm_fields')?.includes('payload')) spent = 51000;
    return base(url, init);
  });
  const response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
  expect(response.isError).toBe(false);
  const result = JSON.parse(response.content[0].text);
  expect(result).toMatchObject({ status: 'partial', counts: { reviewed: 0, not_processed: 1 }, coverage: { analysis_complete: false } });
  expect(result.assets[0]).toEqual({ state: 'not_processed', update_xml_sys_id: id, reason: 'deadline_exceeded' });
});
it('wires real MCP cancellation notifications to the bounded request through the registered SDK handler', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(), mcpClient = new Client({ name: 'synthetic-bp5', version: '0.0.0' });
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; });
  let aborted!: () => void; const stopped = new Promise<void>(resolve => { aborted = resolve; });
  const stalled = async (_url: URL, init: RequestInit) => {
    init.signal!.addEventListener('abort', aborted, { once: true }); started();
    return new Promise<Response>(() => {});
  };
  try {
    vi.stubGlobal('fetch', fixture());
    await server.connect(serverTransport); await mcpClient.connect(clientTransport);
    expect((await mcpClient.listTools()).tools.filter(tool => tool.name === name)).toHaveLength(1);
    const success = await mcpClient.callTool({ name, arguments: input });
    expect(success.isError).toBe(false);
    expect(success.content[0].type).toBe('text');
    if (success.content[0].type !== 'text') throw Error('Expected JSON text');
    expect(JSON.parse(success.content[0].text).counts.findings).toBe(1);
    vi.stubGlobal('fetch', stalled);
    const controller = new AbortController();
    const job = mcpClient.callTool({ name, arguments: input }, CallToolResultSchema, { signal: controller.signal });
    const rejected = expect(job).rejects.toBeDefined();
    await ready; controller.abort(); await rejected; await stopped;
  } finally { await mcpClient.close(); await server.close(); }
  vi.stubGlobal('fetch', fixture());
  // The cancelled call must release admission before the next review can run.
  let response;
  for (let i = 0; i < 20; i++) {
    response = await handleCallTool({ params: { name, arguments: input } }, context as unknown as InstanceContext);
    if (!response.isError) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  expect(response?.isError).toBe(false);
});
