import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWorkspaceToolCall, getWorkspaceToolDefinitions } from '../../src/tools/workspace.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const ur = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;
const dr = () => mockClient.deleteRecord as ReturnType<typeof vi.fn>;

describe('getWorkspaceToolDefinitions', () => {
  it('returns exactly 16 workspace tool definitions', () => {
    expect(getWorkspaceToolDefinitions().length).toBe(16);
  });

  it('all tools have name, description and inputSchema', () => {
    getWorkspaceToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeWorkspaceToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeWorkspaceToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('UIB Pages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_uib_pages filters by app', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeWorkspaceToolCall(mockClient, 'list_uib_pages', { app: 'app1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_ux_page', query: 'application=app1' }));
  });

  it('get_uib_page requires sys_id', async () => {
    await expect(executeWorkspaceToolCall(mockClient, 'get_uib_page', {})).rejects.toThrow('sys_id is required');
  });

  describe('create_uib_page', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeWorkspaceToolCall(mockClient, 'create_uib_page', { title: 'X', path: '/x' })).rejects.toThrow('Write operations are disabled');
    });

    it('requires title and path', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'create_uib_page', {})).rejects.toThrow('title and path are required');
    });

    it('creates the page', async () => {
      cr().mockResolvedValue({ sys_id: 'p1' });
      const result = await executeWorkspaceToolCall(mockClient, 'create_uib_page', { title: 'Home', path: '/home', app: 'app1' });
      expect(cr()).toHaveBeenCalledWith('sys_ux_page', { title: 'Home', path: '/home', application: 'app1' });
      expect(result.action).toBe('created');
    });
  });

  describe('update_uib_page', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires sys_id', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'update_uib_page', {})).rejects.toThrow('sys_id is required');
    });

    it('updates the page with remaining fields', async () => {
      ur().mockResolvedValue({ sys_id: 'p1' });
      const result = await executeWorkspaceToolCall(mockClient, 'update_uib_page', { sys_id: 'p1', title: 'New Title' });
      expect(ur()).toHaveBeenCalledWith('sys_ux_page', 'p1', { title: 'New Title' });
      expect(result.action).toBe('updated');
    });
  });

  describe('delete_uib_page', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires sys_id', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'delete_uib_page', {})).rejects.toThrow('sys_id is required');
    });

    it('deletes the page', async () => {
      dr().mockResolvedValue(undefined);
      const result = await executeWorkspaceToolCall(mockClient, 'delete_uib_page', { sys_id: 'p1' });
      expect(dr()).toHaveBeenCalledWith('sys_ux_page', 'p1');
      expect(result).toEqual({ action: 'deleted', sys_id: 'p1' });
    });
  });
});

describe('UIB Components', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_uib_components filters by scope', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeWorkspaceToolCall(mockClient, 'list_uib_components', { scope: 'x_app' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_ux_macroponent', query: 'sys_scope=x_app' }));
  });

  describe('create_uib_component', () => {
    beforeEach(() => {
      process.env.WRITE_ENABLED = 'true';
      process.env.SCRIPTING_ENABLED = 'true';
    });
    afterEach(() => {
      delete process.env.WRITE_ENABLED;
      delete process.env.SCRIPTING_ENABLED;
    });

    it('is blocked without SCRIPTING_ENABLED', async () => {
      delete process.env.SCRIPTING_ENABLED;
      await expect(executeWorkspaceToolCall(mockClient, 'create_uib_component', { name: 'x', label: 'X' })).rejects.toThrow('Scripting operations are disabled');
    });

    it('requires name and label', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'create_uib_component', {})).rejects.toThrow('name and label are required');
    });

    it('creates the component', async () => {
      cr().mockResolvedValue({ sys_id: 'c1' });
      const result = await executeWorkspaceToolCall(mockClient, 'create_uib_component', { name: 'x_widget', label: 'Widget', category: 'custom' });
      expect(cr()).toHaveBeenCalledWith('sys_ux_macroponent', expect.objectContaining({ name: 'x_widget', label: 'Widget', category: 'custom' }));
      expect(result.action).toBe('created');
    });
  });

  describe('update_uib_component', () => {
    beforeEach(() => {
      process.env.WRITE_ENABLED = 'true';
      process.env.SCRIPTING_ENABLED = 'true';
    });
    afterEach(() => {
      delete process.env.WRITE_ENABLED;
      delete process.env.SCRIPTING_ENABLED;
    });

    it('requires sys_id', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'update_uib_component', {})).rejects.toThrow('sys_id is required');
    });

    it('updates the component with remaining fields', async () => {
      ur().mockResolvedValue({ sys_id: 'c1' });
      await executeWorkspaceToolCall(mockClient, 'update_uib_component', { sys_id: 'c1', label: 'New Label' });
      expect(ur()).toHaveBeenCalledWith('sys_ux_macroponent', 'c1', { label: 'New Label' });
    });
  });
});

describe('UIB Data Brokers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_uib_data_brokers filters by page_sys_id', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeWorkspaceToolCall(mockClient, 'list_uib_data_brokers', { page_sys_id: 'p1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_ux_data_broker_transform', query: 'page=p1' }));
  });

  describe('create_uib_data_broker', () => {
    beforeEach(() => {
      process.env.WRITE_ENABLED = 'true';
      process.env.SCRIPTING_ENABLED = 'true';
    });
    afterEach(() => {
      delete process.env.WRITE_ENABLED;
      delete process.env.SCRIPTING_ENABLED;
    });

    it('requires name and table', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'create_uib_data_broker', {})).rejects.toThrow('name and table are required');
    });

    it('creates the data broker', async () => {
      cr().mockResolvedValue({ sys_id: 'db1' });
      const result = await executeWorkspaceToolCall(mockClient, 'create_uib_data_broker', { name: 'IncidentBroker', table: 'incident', page: 'p1' });
      expect(cr()).toHaveBeenCalledWith('sys_ux_data_broker_transform', expect.objectContaining({ name: 'IncidentBroker', table: 'incident', page: 'p1' }));
      expect(result.action).toBe('created');
    });
  });
});

describe('Configurable Workspaces', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_workspaces defaults to active=true', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeWorkspaceToolCall(mockClient, 'list_workspaces', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_aw_workspace', query: 'active=true' }));
  });

  describe('get_workspace', () => {
    it('requires sys_id', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'get_workspace', {})).rejects.toThrow('sys_id is required');
    });

    it('returns the workspace with its lists', async () => {
      gr().mockResolvedValue({ sys_id: 'w1', name: 'Agent Workspace' });
      qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'l1', title: 'My Incidents' }] });
      const result = await executeWorkspaceToolCall(mockClient, 'get_workspace', { sys_id: 'w1' });
      expect(gr()).toHaveBeenCalledWith('sys_aw_workspace', 'w1');
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_aw_list', query: 'workspace=w1' }));
      expect(result.lists).toHaveLength(1);
    });
  });

  describe('create_workspace', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires name and table', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'create_workspace', {})).rejects.toThrow('name and table are required');
    });

    it('creates the workspace active by default', async () => {
      cr().mockResolvedValue({ sys_id: 'w1' });
      const result = await executeWorkspaceToolCall(mockClient, 'create_workspace', { name: 'Agent Workspace', table: 'incident' });
      expect(cr()).toHaveBeenCalledWith('sys_aw_workspace', expect.objectContaining({ name: 'Agent Workspace', table: 'incident', active: 'true' }));
      expect(result.action).toBe('created');
    });
  });

  describe('configure_workspace_list', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires workspace_sys_id, table, and title', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'configure_workspace_list', {})).rejects.toThrow(
        'workspace_sys_id, table, and title are required'
      );
    });

    it('creates the list', async () => {
      cr().mockResolvedValue({ sys_id: 'l1' });
      const result = await executeWorkspaceToolCall(mockClient, 'configure_workspace_list', {
        workspace_sys_id: 'w1', table: 'incident', title: 'My Incidents', query: 'active=true',
      });
      expect(cr()).toHaveBeenCalledWith('sys_aw_list', expect.objectContaining({ workspace: 'w1', table: 'incident', title: 'My Incidents', query: 'active=true' }));
      expect(result.action).toBe('created');
    });
  });
});

describe('UX App Configuration', () => {
  describe('create_ux_app_route', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires app_sys_id, path, and page_sys_id', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'create_ux_app_route', {})).rejects.toThrow(
        'app_sys_id, path, and page_sys_id required'
      );
    });

    it('creates the route', async () => {
      cr().mockResolvedValue({ sys_id: 'r1' });
      const result = await executeWorkspaceToolCall(mockClient, 'create_ux_app_route', {
        app_sys_id: 'app1', path: '/home', page_sys_id: 'p1', title: 'Home',
      });
      expect(cr()).toHaveBeenCalledWith('sys_ux_app_route', { application: 'app1', path: '/home', page: 'p1', title: 'Home' });
      expect(result.action).toBe('created');
    });
  });

  describe('create_ux_experience', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires name and app_sys_id', async () => {
      await expect(executeWorkspaceToolCall(mockClient, 'create_ux_experience', {})).rejects.toThrow('name and app_sys_id are required');
    });

    it('creates the experience', async () => {
      cr().mockResolvedValue({ sys_id: 'e1' });
      const result = await executeWorkspaceToolCall(mockClient, 'create_ux_experience', { name: 'My Experience', app_sys_id: 'app1', landing_page: 'p1' });
      expect(cr()).toHaveBeenCalledWith('sys_ux_app_config', { name: 'My Experience', application: 'app1', landing_page: 'p1' });
      expect(result.action).toBe('created');
    });
  });
});
