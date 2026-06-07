import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeChangeToolCall, getChangeToolDefinitions } from '../../src/tools/change.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getChangeToolDefinitions', () => {
  it('returns 7 change tool definitions', () => {
    expect(getChangeToolDefinitions().length).toBe(7);
  });

  it('every tool has name, description, and inputSchema', () => {
    getChangeToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeChangeToolCall – create_change_request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('throws when short_description is missing', async () => {
    await expect(
      executeChangeToolCall(mockClient, 'create_change_request', { type: 'normal' })
    ).rejects.toThrow('short_description and type are required');
  });

  it('throws when type is missing', async () => {
    await expect(
      executeChangeToolCall(mockClient, 'create_change_request', { short_description: 'Deploy app' })
    ).rejects.toThrow('short_description and type are required');
  });

  it('creates change request and returns summary', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'chg1', number: 'CHG0001' });
    const result = await executeChangeToolCall(mockClient, 'create_change_request', {
      short_description: 'Deploy new service',
      type: 'normal',
      risk: '3',
    });
    expect(result.summary).toContain('CHG0001');
    expect(mockClient.createRecord).toHaveBeenCalledWith('change_request', expect.objectContaining({
      short_description: 'Deploy new service',
      type: 'normal',
      risk: '3',
    }));
  });

  it('blocks create when WRITE_ENABLED=false', async () => {
    process.env.WRITE_ENABLED = 'false';
    await expect(
      executeChangeToolCall(mockClient, 'create_change_request', { short_description: 'x', type: 'normal' })
    ).rejects.toThrow();
  });
});

describe('executeChangeToolCall – get_change_request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id directly', async () => {
    const sysId = 'a'.repeat(32);
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: sysId, number: 'CHG0001' });
    const result = await executeChangeToolCall(mockClient, 'get_change_request', { number_or_sysid: sysId });
    expect(result.number).toBe('CHG0001');
    expect(mockClient.getRecord).toHaveBeenCalledWith('change_request', sysId);
  });

  it('fetches by change number', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ number: 'CHG0042' }] });
    const result = await executeChangeToolCall(mockClient, 'get_change_request', { number_or_sysid: 'CHG0042' });
    expect(result.number).toBe('CHG0042');
  });

  it('throws NOT_FOUND when change does not exist', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeChangeToolCall(mockClient, 'get_change_request', { number_or_sysid: 'CHG9999' })
    ).rejects.toThrow('Change request not found: CHG9999');
  });

  it('throws when number_or_sysid is missing', async () => {
    await expect(
      executeChangeToolCall(mockClient, 'get_change_request', {})
    ).rejects.toThrow('number_or_sysid is required');
  });
});

describe('executeChangeToolCall – list_change_requests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all change requests with no filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3, records: [{}, {}, {}] });
    const result = await executeChangeToolCall(mockClient, 'list_change_requests', {});
    expect(result.count).toBe(3);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'change_request' }));
  });

  it('applies state filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{}] });
    await executeChangeToolCall(mockClient, 'list_change_requests', { state: '-5' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'state=-5' }));
  });
});

describe('executeChangeToolCall – submit_change_for_approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('sets state to -5 (Requested)', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'chg1', state: '-5' });
    const result = await executeChangeToolCall(mockClient, 'submit_change_for_approval', { sys_id: 'chg1' });
    expect(result.summary).toContain('chg1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('change_request', 'chg1', { state: '-5' });
  });

  it('throws when sys_id is missing', async () => {
    await expect(
      executeChangeToolCall(mockClient, 'submit_change_for_approval', {})
    ).rejects.toThrow('sys_id is required');
  });
});

describe('executeChangeToolCall – close_change_request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('closes with code and notes', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'chg1', state: '3' });
    const result = await executeChangeToolCall(mockClient, 'close_change_request', {
      sys_id: 'chg1',
      close_code: 'successful',
      close_notes: 'Change deployed without issues',
    });
    expect(result.summary).toContain('chg1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('change_request', 'chg1', expect.objectContaining({
      state: '3',
      close_code: 'successful',
    }));
  });

  it('throws when close_notes is missing', async () => {
    await expect(
      executeChangeToolCall(mockClient, 'close_change_request', { sys_id: 'chg1', close_code: 'successful' })
    ).rejects.toThrow('sys_id, close_code, and close_notes are required');
  });
});

describe('executeChangeToolCall – schedule_cab_meeting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('schedules CAB meeting by change number (lookup then update)', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'chg-sys1' }] });
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'chg-sys1' });
    const result = await executeChangeToolCall(mockClient, 'schedule_cab_meeting', {
      change_id: 'CHG0001',
      date: '2025-09-15',
      duration_minutes: 60,
      attendees: 'CAB,Network Ops',
    });
    expect(result.summary).toContain('CAB');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('change_request', 'chg-sys1', expect.objectContaining({ cab_date: '2025-09-15' }));
  });

  it('throws when change is not found', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeChangeToolCall(mockClient, 'schedule_cab_meeting', { change_id: 'CHG9999', date: '2025-09-15' })
    ).rejects.toThrow('Change request not found');
  });
});

describe('executeChangeToolCall – unknown tool', () => {
  it('returns null for unrecognised tool', async () => {
    const result = await executeChangeToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
