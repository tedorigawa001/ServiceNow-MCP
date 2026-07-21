import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeScriptToolCall, getScriptToolDefinitions } from '../../src/tools/script.js';
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

describe('getScriptToolDefinitions', () => {
  it('returns exactly 27 scripting tool definitions', () => {
    // Pinning the count catches accidental deletions/duplicate registrations
    // that `length > 0` would silently miss.
    expect(getScriptToolDefinitions().length).toBe(27);
  });

  it('all tools have name, description and inputSchema', () => {
    getScriptToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeScriptToolCall – update boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('updates business rules with allowed fields', async () => {
    updateRec().mockResolvedValue({ sys_id: 'br1' });
    await executeScriptToolCall(mockClient, 'update_business_rule', {
      sys_id: 'br1',
      fields: { script: 'answer = true;', active: true, order: 200 },
    });
    expect(updateRec()).toHaveBeenCalledWith('sys_script', 'br1', {
      script: 'answer = true;',
      active: true,
      order: 200,
    });
  });

  it('rejects undeclared business rule update fields', async () => {
    await expect(
      executeScriptToolCall(mockClient, 'update_business_rule', {
        sys_id: 'br1',
        fields: { script: 'answer = true;', sys_scope: 'global', sys_domain: 'global' },
      })
    ).rejects.toThrow('Business rule fields cannot be updated: sys_scope, sys_domain');
    expect(updateRec()).not.toHaveBeenCalled();
  });

  it('rejects undeclared script include update fields', async () => {
    await expect(
      executeScriptToolCall(mockClient, 'update_script_include', {
        sys_id: 'si1',
        fields: { script: 'var x = 1;', sys_scope: 'global' },
      })
    ).rejects.toThrow('Script include fields cannot be updated: sys_scope');
    expect(updateRec()).not.toHaveBeenCalled();
  });

  it('rejects undeclared client script update fields', async () => {
    await expect(
      executeScriptToolCall(mockClient, 'update_client_script', {
        sys_id: 'cs1',
        fields: { script: 'console.log(1);', sys_domain: 'global' },
      })
    ).rejects.toThrow('Client script fields cannot be updated: sys_domain');
    expect(updateRec()).not.toHaveBeenCalled();
  });

  it('rejects undeclared UI action update fields', async () => {
    await expect(
      executeScriptToolCall(mockClient, 'update_ui_action', {
        sys_id: 'uia1',
        fields: { script: 'action.setRedirectURL(current);', roles: 'admin' },
      })
    ).rejects.toThrow('UI action fields cannot be updated: roles');
    expect(updateRec()).not.toHaveBeenCalled();
  });
});

describe('executeScriptToolCall – requires SCRIPTING_ENABLED for every tool, including reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks a read tool (list_business_rules) without WRITE_ENABLED/SCRIPTING_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
    await expect(executeScriptToolCall(mockClient, 'list_business_rules', {})).rejects.toThrow('Write operations are disabled');
  });

  it('blocks when WRITE_ENABLED is set but SCRIPTING_ENABLED is not', async () => {
    process.env.WRITE_ENABLED = 'true';
    delete process.env.SCRIPTING_ENABLED;
    await expect(executeScriptToolCall(mockClient, 'list_business_rules', {})).rejects.toThrow('Scripting operations are disabled');
    delete process.env.WRITE_ENABLED;
  });
});

describe('executeScriptToolCall – Business Rules / Script Includes / Client Scripts / Changesets / UI Policies / UI Actions / ACLs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('unknown tool returns null', async () => {
    expect(await executeScriptToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });

  it('get_business_rule requires sys_id and delegates to getRecord', async () => {
    await expect(executeScriptToolCall(mockClient, 'get_business_rule', {})).rejects.toThrow('sys_id is required');
    gr().mockResolvedValue({ sys_id: 'br1' });
    const result = await executeScriptToolCall(mockClient, 'get_business_rule', { sys_id: 'br1' });
    expect(gr()).toHaveBeenCalledWith('sys_script', 'br1');
    expect(result.sys_id).toBe('br1');
  });

  describe('list_script_includes / get_script_include / create_script_include', () => {
    it('list_script_includes queries sys_script_include', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executeScriptToolCall(mockClient, 'list_script_includes', { active: true });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_script_include', query: 'active=true' }));
    });

    it('get_script_include requires sys_id_or_name', async () => {
      await expect(executeScriptToolCall(mockClient, 'get_script_include', {})).rejects.toThrow('sys_id_or_name is required');
    });

    it('get_script_include fetches by sys_id when hex', async () => {
      gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Util' });
      const result = await executeScriptToolCall(mockClient, 'get_script_include', { sys_id_or_name: 'a'.repeat(32) });
      expect(gr()).toHaveBeenCalledWith('sys_script_include', 'a'.repeat(32));
      expect(result.name).toBe('Util');
    });

    it('get_script_include throws NOT_FOUND when name lookup misses', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await expect(executeScriptToolCall(mockClient, 'get_script_include', { sys_id_or_name: 'Nope' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('get_script_include strips ^ from sys_id_or_name (encoded-query injection)', async () => {
      qr().mockResolvedValue({ count: 1, records: [{ name: 'Util' }] });
      await executeScriptToolCall(mockClient, 'get_script_include', { sys_id_or_name: 'Util^ORactive=true' });
      expect(qr().mock.calls[0][0].query).toBe('api_name=UtilORactive=true^ORname=UtilORactive=true');
    });

    it('create_script_include requires name and script', async () => {
      await expect(executeScriptToolCall(mockClient, 'create_script_include', {})).rejects.toThrow('name and script are required');
    });

    it('create_script_include defaults api_name to name and access to public', async () => {
      cr().mockResolvedValue({ sys_id: 'si1' });
      await executeScriptToolCall(mockClient, 'create_script_include', { name: 'Util', script: 'var Util = Class.create();' });
      expect(cr()).toHaveBeenCalledWith('sys_script_include', expect.objectContaining({ name: 'Util', api_name: 'Util', access: 'public' }));
    });
  });

  describe('list_client_scripts / get_client_script / create_client_script', () => {
    it('list_client_scripts combines table and type filters', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executeScriptToolCall(mockClient, 'list_client_scripts', { table: 'incident', type: 'onLoad' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_script_client', query: 'table=incident^type=onLoad' }));
    });

    it('get_client_script requires sys_id', async () => {
      await expect(executeScriptToolCall(mockClient, 'get_client_script', {})).rejects.toThrow('sys_id is required');
    });

    it('create_client_script requires name, table, type, and script', async () => {
      await expect(executeScriptToolCall(mockClient, 'create_client_script', {})).rejects.toThrow(
        'name, table, type, and script are required'
      );
    });

    it('create_client_script creates the record', async () => {
      cr().mockResolvedValue({ sys_id: 'cs1' });
      const result = await executeScriptToolCall(mockClient, 'create_client_script', {
        name: 'Validate priority', table: 'incident', type: 'onChange', script: 'function onChange() {}', field_name: 'priority',
      });
      expect(cr()).toHaveBeenCalledWith('sys_script_client', expect.objectContaining({ field_name: 'priority', type: 'onChange' }));
      expect(result.summary).toContain('Validate priority');
    });
  });

  describe('Changesets', () => {
    it('list_changesets filters by state', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executeScriptToolCall(mockClient, 'list_changesets', { state: 'in progress' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_update_set', query: 'state=in progress' }));
    });

    it('get_changeset requires sys_id_or_name', async () => {
      await expect(executeScriptToolCall(mockClient, 'get_changeset', {})).rejects.toThrow('sys_id_or_name is required');
    });

    it('get_changeset throws NOT_FOUND when name lookup misses', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await expect(executeScriptToolCall(mockClient, 'get_changeset', { sys_id_or_name: 'Nope' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('get_changeset strips ^ from sys_id_or_name (encoded-query injection)', async () => {
      qr().mockResolvedValue({ count: 1, records: [{ name: 'Set1' }] });
      await executeScriptToolCall(mockClient, 'get_changeset', { sys_id_or_name: 'Set1^ORactive=true' });
      expect(qr().mock.calls[0][0].query).toBe('name=Set1ORactive=true^ORsys_id=Set1ORactive=true');
    });

    it('commit_changeset requires sys_id and sets state to complete', async () => {
      await expect(executeScriptToolCall(mockClient, 'commit_changeset', {})).rejects.toThrow('sys_id is required');
      updateRec().mockResolvedValue({ sys_id: 'us1' });
      await executeScriptToolCall(mockClient, 'commit_changeset', { sys_id: 'us1' });
      expect(updateRec()).toHaveBeenCalledWith('sys_update_set', 'us1', { state: 'complete' });
    });

    it('publish_changeset requires sys_id and sets state to complete', async () => {
      await expect(executeScriptToolCall(mockClient, 'publish_changeset', {})).rejects.toThrow('sys_id is required');
      updateRec().mockResolvedValue({ sys_id: 'us1' });
      await executeScriptToolCall(mockClient, 'publish_changeset', { sys_id: 'us1' });
      expect(updateRec()).toHaveBeenCalledWith('sys_update_set', 'us1', { state: 'complete' });
    });
  });

  describe('UI Policies', () => {
    it('list_ui_policies filters by table', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executeScriptToolCall(mockClient, 'list_ui_policies', { table: 'incident' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_ui_policy', query: 'model_table=incident' }));
    });

    it('get_ui_policy requires sys_id', async () => {
      await expect(executeScriptToolCall(mockClient, 'get_ui_policy', {})).rejects.toThrow('sys_id is required');
    });

    it('create_ui_policy requires short_description and table', async () => {
      await expect(executeScriptToolCall(mockClient, 'create_ui_policy', {})).rejects.toThrow(
        'short_description and table are required'
      );
    });

    it('create_ui_policy creates the record', async () => {
      cr().mockResolvedValue({ sys_id: 'pol1' });
      const result = await executeScriptToolCall(mockClient, 'create_ui_policy', { short_description: 'Hide field', table: 'incident' });
      expect(cr()).toHaveBeenCalledWith('sys_ui_policy', expect.objectContaining({ model_table: 'incident' }));
      expect(result.summary).toContain('Hide field');
    });
  });

  describe('UI Actions', () => {
    it('list_ui_actions filters by table and type', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executeScriptToolCall(mockClient, 'list_ui_actions', { table: 'incident', type: 'button' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_ui_action', query: 'table=incident^action_type=button' }));
    });

    it('get_ui_action requires sys_id', async () => {
      await expect(executeScriptToolCall(mockClient, 'get_ui_action', {})).rejects.toThrow('sys_id is required');
    });

    it('create_ui_action requires name, table, and action_name', async () => {
      await expect(executeScriptToolCall(mockClient, 'create_ui_action', {})).rejects.toThrow(
        'name, table, and action_name are required'
      );
    });

    it('create_ui_action creates the record', async () => {
      cr().mockResolvedValue({ sys_id: 'uia1' });
      const result = await executeScriptToolCall(mockClient, 'create_ui_action', { name: 'Escalate', table: 'incident', action_name: 'escalate' });
      expect(cr()).toHaveBeenCalledWith('sys_ui_action', expect.objectContaining({ name: 'Escalate', action_name: 'escalate' }));
      expect(result.summary).toContain('Escalate');
    });
  });

  describe('ACLs', () => {
    it('list_acls combines table and operation filters', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await executeScriptToolCall(mockClient, 'list_acls', { table: 'incident', operation: 'write' });
      expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sys_security_acl',
        query: 'nameLIKEincident^operation=write',
      }));
    });

    it('get_acl requires sys_id', async () => {
      await expect(executeScriptToolCall(mockClient, 'get_acl', {})).rejects.toThrow('sys_id is required');
    });

    it('create_acl requires name, operation, and at least one role', async () => {
      await expect(executeScriptToolCall(mockClient, 'create_acl', { name: 'incident.state', operation: 'write' })).rejects.toThrow(
        'name, operation, and at least one role are required'
      );
    });

    it('create_acl resolves role names to sys_ids and links them', async () => {
      qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'role1', name: 'itil' }] });
      cr().mockResolvedValueOnce({ sys_id: 'acl1' }).mockResolvedValueOnce({ sys_id: 'link1' });
      const result = await executeScriptToolCall(mockClient, 'create_acl', { name: 'incident.state', operation: 'write', roles: 'itil' });
      expect(cr()).toHaveBeenNthCalledWith(1, 'sys_security_acl', expect.objectContaining({ name: 'incident.state', operation: 'write' }));
      expect(cr()).toHaveBeenNthCalledWith(2, 'sys_security_acl_role', { sys_security_acl: 'acl1', sys_user_role: 'role1' });
      expect(result.summary).toContain('incident.state');
    });

    it('create_acl throws when a role name is not found or is ambiguous', async () => {
      qr().mockResolvedValue({ count: 0, records: [] });
      await expect(executeScriptToolCall(mockClient, 'create_acl', { name: 'incident.state', operation: 'write', roles: 'nope' }))
        .rejects.toThrow('ACL role not found or ambiguous: nope');
    });

    it('update_acl only allows the description field', async () => {
      await expect(executeScriptToolCall(mockClient, 'update_acl', { sys_id: 'acl1', fields: { active: false } }))
        .rejects.toThrow('ACL fields are protected and cannot be updated: active');
      updateRec().mockResolvedValue({ sys_id: 'acl1' });
      await executeScriptToolCall(mockClient, 'update_acl', { sys_id: 'acl1', fields: { description: 'updated' } });
      expect(updateRec()).toHaveBeenCalledWith('sys_security_acl', 'acl1', { description: 'updated' });
    });
  });
});
