import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
afterEach(() => { delete process.env.WRITE_ENABLED; });

describe('Mobile native argument contracts', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.WRITE_ENABLED = 'true'; });

  it.each([
    ['list_mobile_app_configs', { active: false }],
    ['create_mobile_app_config', { name: 'App', branding_color: '#fff' }],
    ['list_mobile_applets', { app_config: 'app1' }],
    ['create_mobile_applet', { name: 'Screen', table: 'incident' }],
    ['create_mobile_layout', { name: 'Layout', table: 'incident', type: 'list' }],
  ])('rejects obsolete arguments for %s', async (name, args) => {
    await expect(executeMobileToolCall(mockClient, name as string, args as Record<string, unknown>))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(qr()).not.toHaveBeenCalled();
    expect(cr()).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, '5', null])('rejects invalid read limit %j', async (limit) => {
    await expect(executeMobileToolCall(mockClient, 'list_mobile_app_configs', { limit }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(qr()).not.toHaveBeenCalled();
  });

  it('sanitizes a screen scope literal', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeMobileToolCall(mockClient, 'list_mobile_applets', { scope: 's1^ORnameISNOTEMPTY' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'sys_scope=s1ORnameISNOTEMPTY' }));
  });

  it('does not create a mapping when its screen cannot be read', async () => {
    gr().mockRejectedValueOnce(new Error('Screen not found'));
    await expect(executeMobileToolCall(mockClient, 'create_mobile_layout', { screen_sys_id: 's1', ui_element_sys_id: 'u1' }))
      .rejects.toThrow('Screen not found');
    expect(cr()).not.toHaveBeenCalled();
  });
});

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

  it('reports unsupported usage analytics without inventing zero or querying nonexistent sessions', async () => {
    await expect(executeMobileToolCall(mockClient, 'get_mobile_analytics', { days: 30 }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    expect(mockClient.runAggregateQuery).not.toHaveBeenCalled();
    expect(qr()).not.toHaveBeenCalled();
  });
});

describe('list_mobile_app_configs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists native mobile application definitions without a fictitious active filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeMobileToolCall(mockClient, 'list_mobile_app_configs', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_sg_mobile_application', query: undefined,
      fields: 'sys_id,name,ios_bundle_id,android_package_name,client_type_header,sys_updated_on',
    }));
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
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_sg_mobile_application', { name: 'My App' });
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
    expect(gr()).toHaveBeenCalledWith('sys_sg_mobile_application', 'app1');
    expect(result.name).toBe('My App');
  });
});

describe('list_mobile_applets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists screen metadata filtered by application scope, not mobile app config', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeMobileToolCall(mockClient, 'list_mobile_applets', { scope: 'scope1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_sg_screen', query: 'sys_scope=scope1' }));
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

  it('requires name', async () => {
    await expect(executeMobileToolCall(mockClient, 'create_mobile_applet', {})).rejects.toThrow('name is required');
  });

  it('creates the applet', async () => {
    cr().mockResolvedValue({ sys_id: 'ap1' });
    const result = await executeMobileToolCall(mockClient, 'create_mobile_applet', { name: 'My Screen', description: 'Metadata' });
    expect(cr()).toHaveBeenCalledWith('sys_sg_screen', { name: 'My Screen', description: 'Metadata' });
    expect(result.action).toBe('created');
  });
});

describe('list_mobile_layouts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists native screen-to-UI-element mappings, not a fabricated layout table', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeMobileToolCall(mockClient, 'list_mobile_layouts', { screen_sys_id: 's1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_sg_screen_m2m_ui_element', query: 'screen=s1' }));
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

  it('requires screen and UI element IDs', async () => {
    await expect(executeMobileToolCall(mockClient, 'create_mobile_layout', {})).rejects.toThrow('screen_sys_id and ui_element_sys_id are required');
  });

  it('creates the layout', async () => {
    cr().mockResolvedValue({ sys_id: 'l1' });
    gr().mockResolvedValue({ sys_id: 'parent' });
    const result = await executeMobileToolCall(mockClient, 'create_mobile_layout', { screen_sys_id: 's1', ui_element_sys_id: 'u1' });
    expect(gr()).toHaveBeenCalledWith('sys_sg_screen', 's1');
    expect(gr()).toHaveBeenCalledWith('sys_sg_ui_element', 'u1');
    expect(cr()).toHaveBeenCalledWith('sys_sg_screen_m2m_ui_element', { screen: 's1', ui_element: 'u1' });
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

  it('does not claim offline configuration for incomplete arguments', async () => {
    await expect(executeMobileToolCall(mockClient, 'configure_offline_sync', {})).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
  });

  it('does not write configuration into the offline synchronization state table', async () => {
    await expect(executeMobileToolCall(mockClient, 'configure_offline_sync', { table: 'incident', query: 'active=true' }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    expect(cr()).not.toHaveBeenCalled();
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

  it('does not claim delivery for incomplete arguments', async () => {
    await expect(executeMobileToolCall(mockClient, 'send_push_notification', {})).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
  });

  it('does not insert an invalid queue record or report it as sent', async () => {
    await expect(executeMobileToolCall(mockClient, 'send_push_notification', { title: 'Alert', body: 'Something happened', user: 'u1' }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
    expect(cr()).not.toHaveBeenCalled();
  });
});
