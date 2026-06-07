import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeUpdateSetToolCall, getUpdateSetToolDefinitions } from '../../src/tools/updateset.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getUpdateSetToolDefinitions', () => {
  it('returns update set tool definitions', () => {
    expect(getUpdateSetToolDefinitions().length).toBeGreaterThanOrEqual(7);
  });
});

describe('executeUpdateSetToolCall – get_current_update_set', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries in-progress update sets', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ name: 'Sprint 42' }] });
    const result = await executeUpdateSetToolCall(mockClient, 'get_current_update_set', {});
    expect(result.count).toBe(1);
    expect(result.active_update_sets[0].name).toBe('Sprint 42');
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_update_set',
      query: 'state=in progress',
    }));
  });
});

describe('executeUpdateSetToolCall – list_update_sets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists all update sets with no filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3, records: [{}, {}, {}] });
    const result = await executeUpdateSetToolCall(mockClient, 'list_update_sets', {});
    expect(result.count).toBe(3);
    expect(result.update_sets).toHaveLength(3);
  });

  it('applies state filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{}] });
    await executeUpdateSetToolCall(mockClient, 'list_update_sets', { state: 'complete' });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.query).toContain('state=complete');
  });
});

describe('executeUpdateSetToolCall – create_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('throws when name is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'create_update_set', {})
    ).rejects.toThrow('name is required');
  });

  it('creates and switches to update set by default', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us001' });
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us001' });
    const result = await executeUpdateSetToolCall(mockClient, 'create_update_set', { name: 'Sprint 43 Changes' });
    expect(result.action).toBe('created_and_switched');
    expect(result.name).toBe('Sprint 43 Changes');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_update_set', 'us001', { is_default: true });
  });

  it('creates without switching when switch_to=false', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us002' });
    const result = await executeUpdateSetToolCall(mockClient, 'create_update_set', {
      name: 'Background Update Set',
      switch_to: false,
    });
    expect(result.action).toBe('created');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  it('blocks when SCRIPTING_ENABLED=false', async () => {
    process.env.SCRIPTING_ENABLED = 'false';
    await expect(
      executeUpdateSetToolCall(mockClient, 'create_update_set', { name: 'Test' })
    ).rejects.toThrow();
  });
});

describe('executeUpdateSetToolCall – switch_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('throws when sys_id is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'switch_update_set', {})
    ).rejects.toThrow('sys_id is required');
  });

  it('sets is_default on target update set', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us003' });
    const result = await executeUpdateSetToolCall(mockClient, 'switch_update_set', { sys_id: 'us003' });
    expect(result.action).toBe('switched');
    expect(result.sys_id).toBe('us003');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_update_set', 'us003', { is_default: true });
  });
});

describe('executeUpdateSetToolCall – complete_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('throws when sys_id is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'complete_update_set', {})
    ).rejects.toThrow('sys_id is required');
  });

  it('marks update set as complete', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us004', state: 'complete' });
    const result = await executeUpdateSetToolCall(mockClient, 'complete_update_set', { sys_id: 'us004' });
    expect(result.action).toBe('completed');
    expect(result.sys_id).toBe('us004');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_update_set', 'us004', { state: 'complete' });
  });
});

describe('executeUpdateSetToolCall – preview_update_set', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when sys_id is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'preview_update_set', {})
    ).rejects.toThrow('sys_id is required');
  });

  it('lists sys_update_xml records for the update set', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 5, records: [{}, {}, {}, {}, {}] });
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us005', name: 'Test Set' });
    const result = await executeUpdateSetToolCall(mockClient, 'preview_update_set', { sys_id: 'us005' });
    expect(result.change_count).toBe(5);
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.table).toBe('sys_update_xml');
    expect(call.query).toContain('us005');
  });
});

describe('executeUpdateSetToolCall – ensure_active_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('returns existing update set when one is active', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: 'us006', name: 'Existing Set' }],
    });
    const result = await executeUpdateSetToolCall(mockClient, 'ensure_active_update_set', {});
    expect(result.action).toBe('existing_found');
    expect(result.update_set.name).toBe('Existing Set');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });

  it('creates a new set when none is active', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us007' });
    const result = await executeUpdateSetToolCall(mockClient, 'ensure_active_update_set', {
      default_name: 'Auto AI Session',
    });
    expect(result.action).toBe('auto_created');
    expect(result.name).toBe('Auto AI Session');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_update_set', expect.objectContaining({ name: 'Auto AI Session' }));
  });
});

describe('executeUpdateSetToolCall – unknown tool', () => {
  it('returns null for unrecognised tool', async () => {
    const result = await executeUpdateSetToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
