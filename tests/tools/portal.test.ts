import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executePortalToolCall, getPortalToolDefinitions } from '../../src/tools/portal.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;
const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;

describe('getPortalToolDefinitions', () => {
  it('returns exactly 16 portal tool definitions', () => {
    expect(getPortalToolDefinitions().length).toBe(16);
  });

  it('all tools have name, description and inputSchema', () => {
    getPortalToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executePortalToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executePortalToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('Service Portal', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('create_portal', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executePortalToolCall(mockClient, 'create_portal', { title: 'X', url_suffix: 'x' })).rejects.toThrow('Write operations are disabled');
    });

    it('requires title and url_suffix', async () => {
      await expect(executePortalToolCall(mockClient, 'create_portal', {})).rejects.toThrow('title and url_suffix are required');
    });

    it('creates the portal', async () => {
      cr().mockResolvedValue({ sys_id: 'p1' });
      const result = await executePortalToolCall(mockClient, 'create_portal', { title: 'My Portal', url_suffix: 'myportal', theme: 't1' });
      expect(cr()).toHaveBeenCalledWith('sp_portal', expect.objectContaining({ title: 'My Portal', url_suffix: 'myportal', theme: 't1' }));
      expect(result.summary).toContain('myportal');
    });
  });

  describe('create_portal_page', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires title, id, and portal_sys_id', async () => {
      await expect(executePortalToolCall(mockClient, 'create_portal_page', {})).rejects.toThrow(
        'title, id, and portal_sys_id are required'
      );
    });

    it('creates the page', async () => {
      cr().mockResolvedValue({ sys_id: 'pg1' });
      const result = await executePortalToolCall(mockClient, 'create_portal_page', { title: 'Home', id: 'home', portal_sys_id: 'p1' });
      expect(cr()).toHaveBeenCalledWith('sp_page', expect.objectContaining({ title: 'Home', id: 'home', sp_portal: 'p1' }));
      expect(result.summary).toContain('home');
    });
  });

  it('list_portals searches title/url_suffix and strips ^ from the query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePortalToolCall(mockClient, 'list_portals', { query: 'itsm^ORactive=false' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sp_portal',
      query: 'titleCONTAINSitsmORactive=false^ORurl_suffixCONTAINSitsmORactive=false',
    }));
  });

  describe('get_portal', () => {
    it('requires id', async () => {
      await expect(executePortalToolCall(mockClient, 'get_portal', {})).rejects.toThrow('id is required');
    });

    it('fetches directly by sys_id when hex', async () => {
      gr().mockResolvedValue({ sys_id: 'a'.repeat(32), title: 'ITSM' });
      const result = await executePortalToolCall(mockClient, 'get_portal', { id: 'a'.repeat(32) });
      expect(gr()).toHaveBeenCalledWith('sp_portal', 'a'.repeat(32));
      expect(result.title).toBe('ITSM');
    });

    it('resolves by url_suffix/title and throws NOT_FOUND when missing', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await expect(executePortalToolCall(mockClient, 'get_portal', { id: 'sp' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('list_portal_pages', () => {
    it('requires portal_sys_id', async () => {
      await expect(executePortalToolCall(mockClient, 'list_portal_pages', {})).rejects.toThrow('portal_sys_id is required');
    });

    it('filters by portal and query', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executePortalToolCall(mockClient, 'list_portal_pages', { portal_sys_id: 'p1', query: 'home' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sp_page',
        query: 'sp_portal=p1^titleCONTAINShome^ORidCONTAINShome',
      }));
    });
  });

  describe('get_portal_page', () => {
    it('requires sys_id', async () => {
      await expect(executePortalToolCall(mockClient, 'get_portal_page', {})).rejects.toThrow('sys_id is required');
    });

    it('delegates to getRecord', async () => {
      gr().mockResolvedValue({ sys_id: 'pg1' });
      const result = await executePortalToolCall(mockClient, 'get_portal_page', { sys_id: 'pg1' });
      expect(gr()).toHaveBeenCalledWith('sp_page', 'pg1');
      expect(result.sys_id).toBe('pg1');
    });
  });
});

describe('Widgets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_portal_widgets searches name/description', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePortalToolCall(mockClient, 'list_portal_widgets', { query: 'clock' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sp_widget',
      query: 'nameCONTAINSclock^ORdescriptionCONTAINSclock',
    }));
  });

  describe('get_portal_widget', () => {
    it('requires id_or_sysid', async () => {
      await expect(executePortalToolCall(mockClient, 'get_portal_widget', {})).rejects.toThrow('id_or_sysid is required');
    });

    it('fetches directly by sys_id when hex', async () => {
      gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Clock' });
      const result = await executePortalToolCall(mockClient, 'get_portal_widget', { id_or_sysid: 'a'.repeat(32) });
      expect(gr()).toHaveBeenCalledWith('sp_widget', 'a'.repeat(32));
      expect(result.name).toBe('Clock');
    });

    it('resolves by id/name and throws NOT_FOUND when missing', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await expect(executePortalToolCall(mockClient, 'get_portal_widget', { id_or_sysid: 'widget-clock' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('create_portal_widget', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('requires name and id', async () => {
      await expect(executePortalToolCall(mockClient, 'create_portal_widget', {})).rejects.toThrow('name and id are required');
    });

    it('creates the widget, mapping server_script to script', async () => {
      cr().mockResolvedValue({ sys_id: 'w1' });
      const result = await executePortalToolCall(mockClient, 'create_portal_widget', {
        name: 'Clock', id: 'widget-clock', server_script: 'data.now = new Date();',
      });
      expect(cr()).toHaveBeenCalledWith('sp_widget', expect.objectContaining({ name: 'Clock', id: 'widget-clock', script: 'data.now = new Date();' }));
      expect(result.summary).toContain('widget-clock');
    });
  });

  describe('list_widget_instances', () => {
    it('requires widget_sys_id', async () => {
      await expect(executePortalToolCall(mockClient, 'list_widget_instances', {})).rejects.toThrow('widget_sys_id is required');
    });

    it('queries sp_instance by widget', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executePortalToolCall(mockClient, 'list_widget_instances', { widget_sys_id: 'w1' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sp_instance', query: 'sp_widget=w1' }));
    });
  });
});

describe('UI Builder (Next Experience)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_ux_apps searches by name', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePortalToolCall(mockClient, 'list_ux_apps', { query: 'agent' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_ux_app_config', query: 'nameCONTAINSagent' }));
  });

  describe('get_ux_app', () => {
    it('requires sys_id_or_name', async () => {
      await expect(executePortalToolCall(mockClient, 'get_ux_app', {})).rejects.toThrow('sys_id_or_name is required');
    });

    it('resolves by name and throws NOT_FOUND when missing', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await expect(executePortalToolCall(mockClient, 'get_ux_app', { sys_id_or_name: 'Agent Workspace' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('list_ux_pages', () => {
    it('requires app_sys_id', async () => {
      await expect(executePortalToolCall(mockClient, 'list_ux_pages', {})).rejects.toThrow('app_sys_id is required');
    });

    it('filters by app and query', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executePortalToolCall(mockClient, 'list_ux_pages', { app_sys_id: 'app1', query: 'home' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sys_ux_page',
        query: 'ux_app_config=app1^nameCONTAINShome',
      }));
    });
  });
});

describe('Themes & Branding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_portal_themes queries sp_theme', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePortalToolCall(mockClient, 'list_portal_themes', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sp_theme' }));
  });

  describe('get_portal_theme', () => {
    it('requires sys_id', async () => {
      await expect(executePortalToolCall(mockClient, 'get_portal_theme', {})).rejects.toThrow('sys_id is required');
    });

    it('delegates to getRecord', async () => {
      gr().mockResolvedValue({ sys_id: 'th1', name: 'Dark' });
      const result = await executePortalToolCall(mockClient, 'get_portal_theme', { sys_id: 'th1' });
      expect(gr()).toHaveBeenCalledWith('sp_theme', 'th1');
      expect(result.name).toBe('Dark');
    });
  });
});

describe('executePortalToolCall – update_portal_widget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
  });

  it('maps server_script and updates widget fields from the allowlist', async () => {
    updateRec().mockResolvedValue({ sys_id: 'widget1' });

    const result = await executePortalToolCall(mockClient, 'update_portal_widget', {
      sys_id: 'widget1',
      fields: {
        name: 'Status Widget',
        server_script: 'data.ok = true;',
        client_script: 'function($scope) {}',
      },
    });

    expect(result.summary).toContain('widget1');
    expect(updateRec()).toHaveBeenCalledWith('sp_widget', 'widget1', {
      name: 'Status Widget',
      script: 'data.ok = true;',
      client_script: 'function($scope) {}',
    });
  });

  it('rejects undeclared widget update fields', async () => {
    await expect(
      executePortalToolCall(mockClient, 'update_portal_widget', {
        sys_id: 'widget1',
        fields: { name: 'Status Widget', sys_scope: 'global', sys_domain: 'global' },
      })
    ).rejects.toThrow('Portal widget fields cannot be updated: sys_scope, sys_domain');
    expect(updateRec()).not.toHaveBeenCalled();
  });
});
