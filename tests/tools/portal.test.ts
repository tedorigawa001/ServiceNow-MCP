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

describe('getPortalToolDefinitions', () => {
  it('returns portal tool definitions', () => {
    expect(getPortalToolDefinitions().length).toBeGreaterThan(0);
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
