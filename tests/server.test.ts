import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the heavy dependencies so handler tests stay hermetic (no network, no
// real instance config). vi.hoisted lets the mock fns exist before the hoisted
// vi.mock factories reference them.
const { mockGetClient, mockListNames, mockExecuteTool, mockReadResource, mockCreateContext } = vi.hoisted(() => {
  const mockGetClient = vi.fn(() => ({}) as any);
  const mockListNames = vi.fn(() => [] as string[]);
  return {
    mockGetClient,
    mockListNames,
    mockExecuteTool: vi.fn(),
    mockReadResource: vi.fn(),
    mockCreateContext: vi.fn(() => ({
      getClient: mockGetClient,
      getCurrentName: () => 'default',
      getCurrentUrl: () => '',
      listNames: mockListNames,
      listAll: () => [],
      switch: vi.fn(),
    })),
  };
});

vi.mock('../src/servicenow/instances.js', () => ({
  instanceManager: { createContext: mockCreateContext, listNames: mockListNames },
}));
vi.mock('../src/tools/index.js', () => ({
  getTools: () => [
    { name: 'get_incident', description: 'd', inputSchema: { type: 'object' } },
    { name: 'create_incident', description: 'd', inputSchema: { type: 'object' } },
  ],
  executeTool: mockExecuteTool,
}));
vi.mock('../src/resources/index.js', () => ({
  getResources: () => [{ uri: 'servicenow://incident', name: 'Incidents' }],
  readResource: mockReadResource,
}));
vi.mock('../src/prompts/index.js', () => ({
  getPrompts: () => [{ name: 'triage', description: 'd' }],
  resolvePrompt: (name: string) =>
    name === 'triage' ? { messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }] } : null,
}));

import {
  handleListTools,
  handleCallTool,
  handleListResources,
  handleReadResource,
  handleListPrompts,
  handleGetPrompt,
  createServer,
  isInstanceConfigured,
  SERVER_VERSION,
} from '../src/server.js';

beforeEach(() => {
  mockGetClient.mockReset().mockReturnValue({} as any);
  mockListNames.mockReset().mockReturnValue([]);
  mockCreateContext.mockReset().mockImplementation(() => ({
    getClient: mockGetClient,
    getCurrentName: () => 'default',
    getCurrentUrl: () => '',
    listNames: mockListNames,
    listAll: () => [],
    switch: vi.fn(),
  }));
  mockExecuteTool.mockReset();
  mockReadResource.mockReset();
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (/^(SN_|SERVICENOW_)/.test(k)) delete process.env[k];
  }
});

describe('isInstanceConfigured', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) if (/^(SN_|SERVICENOW_)/.test(k)) delete process.env[k];
  });

  it('returns false when nothing is configured', () => {
    expect(isInstanceConfigured()).toBe(false);
  });
  it('returns true when InstanceManager loaded an instance from the wizard config', () => {
    mockListNames.mockReturnValue(['dev']);
    expect(isInstanceConfigured()).toBe(true);
  });
});

describe('handleListTools / Resources / Prompts', () => {
  it('lists tools', async () => {
    const { tools } = await handleListTools();
    expect(tools.map(t => t.name)).toContain('get_incident');
  });
  it('lists resources', async () => {
    const { resources } = await handleListResources();
    expect(resources[0].uri).toBe('servicenow://incident');
  });
  it('lists prompts', async () => {
    const { prompts } = await handleListPrompts();
    expect(prompts[0].name).toBe('triage');
  });
});

describe('handleCallTool', () => {
  it('executes a known tool and returns text content', async () => {
    mockExecuteTool.mockResolvedValue({ number: 'INC0001' });
    const res = await handleCallTool({ params: { name: 'get_incident', arguments: { number_or_sysid: 'INC0001' } } });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toContain('INC0001');
    expect(mockExecuteTool).toHaveBeenCalledWith({}, 'get_incident', { number_or_sysid: 'INC0001' }, expect.anything());
  });

  it('returns a string result verbatim (not JSON-stringified)', async () => {
    mockExecuteTool.mockResolvedValue('plain summary');
    const res = await handleCallTool({ params: { name: 'get_incident', arguments: {} } });
    expect(res.content[0].text).toBe('plain summary');
  });

  it('routes the "instance" argument to getClient', async () => {
    mockExecuteTool.mockResolvedValue({ ok: true });
    await handleCallTool({ params: { name: 'get_incident', arguments: { instance: 'prod' } } });
    expect(mockGetClient).toHaveBeenCalledWith('prod');
  });

  it('returns isError for an unknown tool', async () => {
    const res = await handleCallTool({ params: { name: 'no_such_tool', arguments: {} } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/UNKNOWN_TOOL/);
    expect(mockExecuteTool).not.toHaveBeenCalled();
  });

  it('formats ServiceNowError with its code', async () => {
    // The handler's `instanceof ServiceNowError` branch needs the real class.
    const { ServiceNowError } = await import('../src/utils/errors.js');
    mockExecuteTool.mockRejectedValue(new ServiceNowError('Write disabled', 'WRITE_NOT_ENABLED'));
    const res = await handleCallTool({ params: { name: 'create_incident', arguments: {} } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('WRITE_NOT_ENABLED');
  });

  it('formats a generic error', async () => {
    mockExecuteTool.mockRejectedValue(new Error('boom'));
    const res = await handleCallTool({ params: { name: 'get_incident', arguments: {} } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('boom');
  });
});

describe('handleReadResource', () => {
  it('returns JSON content for a resource', async () => {
    mockReadResource.mockResolvedValue({ records: [1, 2] });
    const res = await handleReadResource({ params: { uri: 'servicenow://incident' } });
    expect(res.contents[0].mimeType).toBe('application/json');
    expect(JSON.parse(res.contents[0].text)).toEqual({ records: [1, 2] });
  });

  it('propagates read errors', async () => {
    mockReadResource.mockRejectedValue(new Error('nope'));
    await expect(handleReadResource({ params: { uri: 'bad://uri' } })).rejects.toThrow('nope');
  });
});

describe('handleGetPrompt', () => {
  it('resolves a known prompt', async () => {
    const res = await handleGetPrompt({ params: { name: 'triage' } });
    expect(res.messages).toBeTruthy();
  });
  it('throws for an unknown prompt', async () => {
    await expect(handleGetPrompt({ params: { name: 'ghost' } })).rejects.toThrow(/Unknown prompt/);
  });
});

describe('createServer', () => {
  it('builds a server advertising the package version', () => {
    expect(createServer()).toBeTruthy();
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
