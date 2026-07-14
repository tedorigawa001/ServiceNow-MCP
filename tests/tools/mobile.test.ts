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
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getMobileToolDefinitions', () => {
  it('returns exactly 10 mobile tool definitions', () => {
    expect(getMobileToolDefinitions().length).toBe(10);
  });

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

describe('get_mobile_app_config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id', async () => {
    await expect(executeMobileToolCall(mockClient, 'get_mobile_app_config', {})).rejects.toThrow('sys_id is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 'app1', name: 'My App' });
    const result = await executeMobileToolCall(mockClient, 'get_mobile_app_config', { sys_id: 'app1' });
    expect(gr()).toHaveBeenCalledWith('sys_sg_mobile_app_config', 'app1');
    expect(result.name).toBe('My App');
  });
});

describe('list_mobile_applets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by app_config', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeMobileToolCall(mockClient, 'list_mobile_applets', { app_config: 'app1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_sg_mobile_applet', query: 'app_config=app1' }));
  });
});

describe('create_mobile_applet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeMobileToolCall(mockClient, 'create_mobile_applet', { name: 'X', table: 'incident' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name and table', async () => {
    await expect(executeMobileToolCall(mockClient, 'create_mobile_applet', {})).rejects.toThrow('name and table are required');
  });

  it('creates the applet', async () => {
    cr().mockResolvedValue({ sys_id: 'ap1' });
    const result = await executeMobileToolCall(mockClient, 'create_mobile_applet', { name: 'My Applet', table: 'incident', app_config: 'app1' });
    expect(cr()).toHaveBeenCalledWith('sys_sg_mobile_applet', expect.objectContaining({ name: 'My Applet', table: 'incident', app_config: 'app1' }));
    expect(result.action).toBe('created');
  });
});

describe('list_mobile_layouts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries sys_sg_mobile_layout', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeMobileToolCall(mockClient, 'list_mobile_layouts', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_sg_mobile_layout' }));
  });
});

describe('create_mobile_layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeMobileToolCall(mockClient, 'create_mobile_layout', { name: 'X', table: 'incident' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name and table', async () => {
    await expect(executeMobileToolCall(mockClient, 'create_mobile_layout', {})).rejects.toThrow('name and table are required');
  });

  it('creates the layout', async () => {
    cr().mockResolvedValue({ sys_id: 'l1' });
    const result = await executeMobileToolCall(mockClient, 'create_mobile_layout', { name: 'Incident Detail', table: 'incident', type: 'detail' });
    expect(cr()).toHaveBeenCalledWith('sys_sg_mobile_layout', expect.objectContaining({ name: 'Incident Detail', table: 'incident', type: 'detail' }));
    expect(result.action).toBe('created');
  });
});

describe('configure_offline_sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeMobileToolCall(mockClient, 'configure_offline_sync', { table: 'incident' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires table', async () => {
    await expect(executeMobileToolCall(mockClient, 'configure_offline_sync', {})).rejects.toThrow('table is required');
  });

  it('configures offline sync with a default max_records', async () => {
    cr().mockResolvedValue({ sys_id: 'os1' });
    const result = await executeMobileToolCall(mockClient, 'configure_offline_sync', { table: 'incident', query: 'active=true' });
    expect(cr()).toHaveBeenCalledWith('sys_sg_offline_sync', expect.objectContaining({ table: 'incident', max_records: '500', query: 'active=true' }));
    expect(result.action).toBe('configured');
  });
});

describe('send_push_notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeMobileToolCall(mockClient, 'send_push_notification', { title: 'X', body: 'Y' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires title and body', async () => {
    await expect(executeMobileToolCall(mockClient, 'send_push_notification', {})).rejects.toThrow('title and body are required');
  });

  it('sends the notification to a user', async () => {
    cr().mockResolvedValue({ sys_id: 'n1' });
    const result = await executeMobileToolCall(mockClient, 'send_push_notification', { title: 'Alert', body: 'Something happened', user: 'u1' });
    expect(cr()).toHaveBeenCalledWith('sys_push_notification', expect.objectContaining({ title: 'Alert', body: 'Something happened', user: 'u1' }));
    expect(result.action).toBe('sent');
  });
});
