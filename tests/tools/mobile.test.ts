import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeMobileToolCall, getMobileToolDefinitions } from '../../src/tools/mobile.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getMobileToolDefinitions', () => {
  it('all tools have name, description and inputSchema', () => {
    getMobileToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeMobileToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeMobileToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('get_mobile_analytics', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: total_sessions and active_apps previously came from
  // queryRecords(limit:1).count -- always 0 or 1 (records.length), never the real
  // count. Fixed to use ungrouped aggregate queries.
  it('reports total_sessions and active_apps from aggregate counts, not a limit:1 page length', async () => {
    agg()
      .mockResolvedValueOnce({ stats: { count: '4321' } }) // sessions
      .mockResolvedValueOnce({ stats: { count: '17' } });  // active apps
    qr().mockResolvedValue({ count: 2, records: [{ sys_id: 'a1', name: 'App1' }, { sys_id: 'a2', name: 'App2' }] });

    const result = await executeMobileToolCall(mockClient, 'get_mobile_analytics', { days: 30 });

    expect(agg()).toHaveBeenNthCalledWith(1, 'sys_sg_mobile_session', undefined, 'COUNT', expect.stringContaining('sys_created_on>='));
    expect(agg()).toHaveBeenNthCalledWith(2, 'sys_sg_mobile_app_config', undefined, 'COUNT', 'active=true');
    expect(result.total_sessions).toBe(4321);
    expect(result.active_apps).toBe(17);
    expect(result.apps).toHaveLength(2);
  });
});

describe('list_mobile_app_configs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active configs by default', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeMobileToolCall(mockClient, 'list_mobile_app_configs', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_sg_mobile_app_config', query: 'active=true' }));
  });
});

describe('create_mobile_app_config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('requires name', async () => {
    await expect(executeMobileToolCall(mockClient, 'create_mobile_app_config', {})).rejects.toThrow('name is required');
  });

  it('creates a config when write is enabled', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'app1' });
    const result = await executeMobileToolCall(mockClient, 'create_mobile_app_config', { name: 'My App' });
    expect(result.action).toBe('created');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_sg_mobile_app_config', expect.objectContaining({ name: 'My App' }));
  });
});
