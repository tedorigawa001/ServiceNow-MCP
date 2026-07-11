import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCsmToolCall } from '../../src/tools/csm.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('executeCsmToolCall – write field allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('preserves documented create fields', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'case1' });
    await executeCsmToolCall(mockClient, 'create_csm_case', {
      short_description: 'Customer cannot sign in', priority: '1',
    });
    expect(mockClient.createRecord).toHaveBeenCalledWith('sn_customerservice_case', {
      short_description: 'Customer cannot sign in', priority: '1',
    });
  });

  it('rejects undeclared create fields before they reach the Table API', async () => {
    await expect(executeCsmToolCall(mockClient, 'create_csm_case', {
      short_description: 'Customer cannot sign in', sys_domain: 'global', u_unlisted: 'yes',
    })).rejects.toThrow('CSM case fields cannot be set: sys_domain, u_unlisted');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });

  it('allows documented update fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'case1' });
    await executeCsmToolCall(mockClient, 'update_csm_case', {
      sys_id: 'case1', fields: { state: 'resolved', close_notes: 'Fixed' },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sn_customerservice_case', 'case1', {
      state: 'resolved', close_notes: 'Fixed',
    });
  });

  it('rejects undeclared update fields before they reach the Table API', async () => {
    await expect(executeCsmToolCall(mockClient, 'update_csm_case', {
      sys_id: 'case1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('CSM case fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});
