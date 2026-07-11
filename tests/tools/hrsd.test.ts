import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeHrsdToolCall } from '../../src/tools/hrsd.js';

const mockClient: any = {
  createRecord: vi.fn(),
  getRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WRITE_ENABLED;
});

describe('HRSD tools', () => {
  describe('create_hr_case', () => {
    it('throws when WRITE_ENABLED is not set', async () => {
      await expect(
        executeHrsdToolCall(mockClient, 'create_hr_case', { short_description: 'Onboarding', hr_service: 'Onboarding' })
      ).rejects.toThrow('Write operations are disabled');
    });

    it('throws when short_description is missing', async () => {
      process.env.WRITE_ENABLED = 'true';
      await expect(
        executeHrsdToolCall(mockClient, 'create_hr_case', { hr_service: 'Onboarding' })
      ).rejects.toThrow('short_description and hr_service are required');
    });

    it('creates HR case when write is enabled', async () => {
      process.env.WRITE_ENABLED = 'true';
      mockClient.createRecord.mockResolvedValue({ sys_id: 'abc123', number: 'HRCS0001' });
      const result = await executeHrsdToolCall(mockClient, 'create_hr_case', {
        short_description: 'New employee onboarding',
        hr_service: 'Onboarding',
      });
      expect(result.number).toBe('HRCS0001');
      expect(result.summary).toContain('HRCS0001');
      expect(mockClient.createRecord).toHaveBeenCalledWith('sn_hr_core_case', expect.objectContaining({
        short_description: 'New employee onboarding',
      }));
    });

    it('rejects undeclared fields before they reach the sensitive HR table', async () => {
      process.env.WRITE_ENABLED = 'true';
      await expect(executeHrsdToolCall(mockClient, 'create_hr_case', {
        short_description: 'Onboarding', hr_service: 'Onboarding', sys_domain: 'global', u_unlisted: 'yes',
      })).rejects.toThrow('HR case fields cannot be set: sys_domain, u_unlisted');
      expect(mockClient.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('update_hr_case', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });

    it('allows documented HR case lifecycle fields', async () => {
      mockClient.updateRecord.mockResolvedValue({ sys_id: 'hrcase1' });
      await executeHrsdToolCall(mockClient, 'update_hr_case', {
        sys_id: 'hrcase1', fields: { state: 'work_in_progress', assigned_to: 'hr-agent', work_notes: 'Reviewed' },
      });
      expect(mockClient.updateRecord).toHaveBeenCalledWith('sn_hr_core_case', 'hrcase1', {
        state: 'work_in_progress', assigned_to: 'hr-agent', work_notes: 'Reviewed',
      });
    });

    it('rejects undeclared fields before they reach the sensitive HR table', async () => {
      await expect(executeHrsdToolCall(mockClient, 'update_hr_case', {
        sys_id: 'hrcase1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
      })).rejects.toThrow('HR case fields cannot be updated: sys_domain, u_unlisted');
      expect(mockClient.updateRecord).not.toHaveBeenCalled();
    });
  });

  describe('get_hr_case', () => {
    it('throws when number_or_sysid is missing', async () => {
      await expect(
        executeHrsdToolCall(mockClient, 'get_hr_case', {})
      ).rejects.toThrow('number_or_sysid is required');
    });

    it('fetches by sys_id directly', async () => {
      mockClient.getRecord.mockResolvedValue({ sys_id: 'abc123def456abc123def456abc12345', number: 'HRCS0001' });
      const result = await executeHrsdToolCall(mockClient, 'get_hr_case', { number_or_sysid: 'abc123def456abc123def456abc12345' });
      expect(mockClient.getRecord).toHaveBeenCalledWith('sn_hr_core_case', 'abc123def456abc123def456abc12345');
      expect(result.number).toBe('HRCS0001');
    });

    it('queries by case number', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 1, records: [{ sys_id: 'abc123', number: 'HRCS0001' }] });
      const result = await executeHrsdToolCall(mockClient, 'get_hr_case', { number_or_sysid: 'HRCS0001' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'number=HRCS0001' }));
      expect(result.number).toBe('HRCS0001');
    });

    it('throws NOT_FOUND when case does not exist', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 0, records: [] });
      await expect(
        executeHrsdToolCall(mockClient, 'get_hr_case', { number_or_sysid: 'HRCS9999' })
      ).rejects.toThrow('HR case not found');
    });
  });

  describe('list_hr_cases', () => {
    it('returns all cases with no filters', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 2, records: [{}, {}] });
      const result = await executeHrsdToolCall(mockClient, 'list_hr_cases', {});
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sn_hr_core_case' }));
      expect(result.count).toBe(2);
    });

    it('applies state filter', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 1, records: [{}] });
      await executeHrsdToolCall(mockClient, 'list_hr_cases', { state: 'open' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'state=open' }));
    });
  });

  describe('list_hr_services', () => {
    it('returns active services by default', async () => {
      mockClient.queryRecords.mockResolvedValue({ count: 5, records: [] });
      await executeHrsdToolCall(mockClient, 'list_hr_services', {});
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
        table: 'sn_hr_core_service',
        query: expect.stringContaining('active=true'),
      }));
    });
  });

  describe('returns null for unknown tool', () => {
    it('returns null for unrecognised tool name', async () => {
      const result = await executeHrsdToolCall(mockClient, 'nonexistent_hrsd_tool', {});
      expect(result).toBeNull();
    });
  });
});
