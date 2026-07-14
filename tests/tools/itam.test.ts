import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeItamToolCall } from '../../src/tools/itam.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  updateRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
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

  describe('get_license_optimization', () => {
    // Regression test: total_licenses previously came from the capped
    // queryRecords(limit:100) page, so any table with more than 100 licenses
    // reported a total that was silently stuck at 100. Fixed to source the
    // true total from an ungrouped aggregate query while still sampling
    // records for the per-license recommendations.
    it('reports a true total from the aggregate query, not the capped sample size', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 100,
        records: [
          { sys_id: 'l1', display_name: 'Adobe', product: 'Acrobat', license_count: 50, license_inuse: 10, license_available: 40 },
        ],
      });
      (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ stats: { count: '350' } });

      const result = await executeItamToolCall(mockClient, 'get_license_optimization', {});

      expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('alm_license', undefined, 'COUNT', undefined);
      expect(result.total_licenses).toBe(350);
      expect(result.analyzed_licenses).toBe(100);
      expect(result.note).toContain('sample of 100 of 350');
    });
  });
});
