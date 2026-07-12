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

describe('getScriptToolDefinitions', () => {
  it('returns scripting tool definitions', () => {
    expect(getScriptToolDefinitions().length).toBeGreaterThan(0);
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
