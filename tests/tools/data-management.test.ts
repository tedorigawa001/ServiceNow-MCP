import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeDataManagementToolCall, getDataManagementToolDefinitions } from '../../src/tools/data-management.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const policyId = 'a'.repeat(32);
const archiveId = 'b'.repeat(32);
const destroyId = 'c'.repeat(32);
const logId = 'd'.repeat(32);

describe('data management tool definitions', () => {
  it('exposes archive, destroy, and restore operations with closed schemas', () => {
    const tools = getDataManagementToolDefinitions();
    for (const name of ['create_archive_rule', 'create_destroy_rule', 'create_cleanup_rule', 'restore_archived_record']) {
      const tool = tools.find(t => t.name === name);
      expect(tool).toBeDefined();
      expect(tool!.inputSchema.additionalProperties).toBe(false);
    }
  });
});

describe('data management execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('lists policies by exact table', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ name: 'incident policy' }] });
    const result = await executeDataManagementToolCall(mockClient, 'list_data_management_policies', { table: 'incident' });
    expect(result.count).toBe(1);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_dm_policy', query: 'tablename=incident' }));
  });

  it('rejects duplicate policies for the same table', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: policyId }] });
    await expect(executeDataManagementToolCall(mockClient, 'create_data_management_policy', { name: 'Incident policy', table: 'incident' }))
      .rejects.toThrow('already exists');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });

  it('creates an archive rule inactive and sets retain references only at creation', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: policyId, tablename: 'incident' });
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: archiveId });
    const result = await executeDataManagementToolCall(mockClient, 'create_archive_rule', {
      policy_sys_id: policyId, name: 'Archive closed incidents', condition: 'active=false', retain_references: true,
    });
    expect(result.action).toBe('created_inactive');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_archive', expect.objectContaining({
      table: 'incident', active: false, retain_references: true,
    }));
  });

  it('creates a destroy rule inactive with a positive duration and links it', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: archiveId, table: 'incident' });
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: destroyId });
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: archiveId });
    const result = await executeDataManagementToolCall(mockClient, 'create_destroy_rule', {
      archive_rule_sys_id: archiveId, name: 'Destroy after 30 days', retention_days: 30,
    });
    expect(result.action).toBe('created_inactive');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_archive_destroy', expect.objectContaining({
      archive: archiveId, table: 'incident', archive_duration: '1970-01-31 00:00:00', active: false,
    }));
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_archive', archiveId, { destroy_rule: destroyId });
  });

  it('rejects a zero-day destroy rule', async () => {
    await expect(executeDataManagementToolCall(mockClient, 'create_destroy_rule', {
      archive_rule_sys_id: archiveId, name: 'Unsafe', retention_days: 0,
    })).rejects.toThrow('retention_days');
  });

  it('creates an inactive cleanup rule for the policy table', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: policyId, tablename: 'incident' });
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'f'.repeat(32) });
    const result = await executeDataManagementToolCall(mockClient, 'create_cleanup_rule', {
      policy_sys_id: policyId, condition: 'active=false', age_seconds: 86400,
    });
    expect(result.action).toBe('created_inactive');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_auto_flush', expect.objectContaining({
      tablename: 'incident', conditions: 'active=false', age: 86400, matchfield: 'sys_created_on', active: false,
    }));
  });

  it('requires explicit confirmation before activation', async () => {
    await expect(executeDataManagementToolCall(mockClient, 'set_archive_rule_active', { sys_id: archiveId, active: true }))
      .rejects.toThrow('confirmation');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  it('requires an active policy before archive-rule activation', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: archiveId, table: 'incident' });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(executeDataManagementToolCall(mockClient, 'set_archive_rule_active', {
      sys_id: archiveId, active: true, confirmation: 'I_UNDERSTAND',
    })).rejects.toThrow('active Data Management Policy');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  it('requires an active policy before destroy-rule activation', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ sys_id: destroyId, archive: archiveId })
      .mockResolvedValueOnce({ sys_id: archiveId, table: 'incident' });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(executeDataManagementToolCall(mockClient, 'set_destroy_rule_active', {
      sys_id: destroyId, active: true, confirmation: 'I_UNDERSTAND',
    })).rejects.toThrow('active Data Management Policy');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  it('requires scripting and confirmation before scheduling a restore', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: logId, restored: '' });
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'e'.repeat(32) });
    await expect(executeDataManagementToolCall(mockClient, 'restore_archived_record', { archive_log_sys_id: logId, confirmation: 'wrong' }))
      .rejects.toThrow('confirmation');
    const result = await executeDataManagementToolCall(mockClient, 'restore_archived_record', { archive_log_sys_id: logId, confirmation: 'I_UNDERSTAND' });
    expect(result.action).toBe('restore_scheduled');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sysauto_script', expect.objectContaining({ run_type: 'once', active: true }));
  });
});
