import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeItamToolCall } from '../../src/tools/itam.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('executeItamToolCall – asset scope and update fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('queries a documented asset table', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeItamToolCall(mockClient, 'list_assets', { asset_class: 'alm_hardware' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'alm_hardware' }));
  });

  it('rejects a non-asset table before it reaches queryRecords', async () => {
    await expect(executeItamToolCall(mockClient, 'list_assets', { asset_class: 'sys_user' }))
      .rejects.toThrow('Unsupported asset class: sys_user');
    expect(mockClient.queryRecords).not.toHaveBeenCalled();
  });

  it('allows documented asset lifecycle updates', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'asset1' });
    await executeItamToolCall(mockClient, 'update_asset', {
      sys_id: 'asset1', fields: { assigned_to: 'user1', install_status: '1', work_notes: 'Issued' },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('alm_asset', 'asset1', {
      assigned_to: 'user1', install_status: '1', work_notes: 'Issued',
    });
  });

  it('rejects undeclared asset fields before they reach the Table API', async () => {
    await expect(executeItamToolCall(mockClient, 'update_asset', {
      sys_id: 'asset1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Asset fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});
