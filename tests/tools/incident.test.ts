import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeIncidentToolCall, getIncidentToolDefinitions } from '../../src/tools/incident.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getIncidentToolDefinitions', () => {
  it('returns 7 incident tool definitions', () => {
    expect(getIncidentToolDefinitions().length).toBe(7);
  });
});

describe('executeIncidentToolCall – create_incident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('creates an incident and returns summary', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'inc1', number: 'INC0001' });
    const result = await executeIncidentToolCall(mockClient, 'create_incident', { short_description: 'Test incident' });
    expect(result.summary).toContain('INC0001');
  });

  it('throws when short_description is missing', async () => {
    await expect(executeIncidentToolCall(mockClient, 'create_incident', {})).rejects.toThrow('short_description is required');
  });

  it('blocks writes when WRITE_ENABLED=false', async () => {
    process.env.WRITE_ENABLED = 'false';
    await expect(executeIncidentToolCall(mockClient, 'create_incident', { short_description: 'x' })).rejects.toThrow();
  });
});

describe('executeIncidentToolCall – get_incident', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches incident by sys_id (32 hex chars)', async () => {
    const sysId = 'a'.repeat(32);
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: sysId, number: 'INC0001' });
    const result = await executeIncidentToolCall(mockClient, 'get_incident', { number_or_sysid: sysId });
    expect(result.sys_id).toBe(sysId);
  });

  it('fetches incident by number using queryRecords', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'inc1', number: 'INC0042' }] });
    const result = await executeIncidentToolCall(mockClient, 'get_incident', { number_or_sysid: 'INC0042' });
    expect(result.number).toBe('INC0042');
  });

  it('throws NOT_FOUND when incident does not exist', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(executeIncidentToolCall(mockClient, 'get_incident', { number_or_sysid: 'INC9999' })).rejects.toThrow('Incident not found');
  });
});

describe('executeIncidentToolCall – update_incident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('allows documented operational incident fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'inc1' });
    await executeIncidentToolCall(mockClient, 'update_incident', {
      sys_id: 'inc1', fields: { state: '2', urgency: '1', work_notes: 'Investigating' },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('incident', 'inc1', {
      state: '2', urgency: '1', work_notes: 'Investigating',
    });
  });

  it('rejects undeclared fields before they reach the Table API', async () => {
    await expect(executeIncidentToolCall(mockClient, 'update_incident', {
      sys_id: 'inc1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Incident fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('executeIncidentToolCall – resolve_incident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('sets state to 6 with resolution fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'inc1', state: '6' });
    const result = await executeIncidentToolCall(mockClient, 'resolve_incident', {
      sys_id: 'inc1',
      resolution_code: 'Solved (Permanently)',
      resolution_notes: 'Fixed the root cause',
    });
    expect(result.summary).toContain('Resolved incident');
    const call = (mockClient.updateRecord as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2].state).toBe('6');
  });
});

describe('executeIncidentToolCall – add_work_note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('updates the work_notes field', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'inc1' });
    await executeIncidentToolCall(mockClient, 'add_work_note', { table: 'incident', sys_id: 'inc1', note: 'Working on it' });
    const call = (mockClient.updateRecord as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toEqual({ work_notes: 'Working on it' });
  });
});

describe('executeIncidentToolCall – close_incident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    process.env.WRITE_ENABLED = 'false';
    await expect(executeIncidentToolCall(mockClient, 'close_incident', { sys_id: 'inc1' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires sys_id', async () => {
    await expect(executeIncidentToolCall(mockClient, 'close_incident', {})).rejects.toThrow('sys_id is required');
  });

  it('sets state to 7', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'inc1' });
    const result = await executeIncidentToolCall(mockClient, 'close_incident', { sys_id: 'inc1' });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('incident', 'inc1', { state: '7' });
    expect(result.summary).toContain('Closed incident');
  });
});

describe('executeIncidentToolCall – add_comment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    process.env.WRITE_ENABLED = 'false';
    await expect(executeIncidentToolCall(mockClient, 'add_comment', { table: 'incident', sys_id: 'inc1', comment: 'x' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires table, sys_id, and comment', async () => {
    await expect(executeIncidentToolCall(mockClient, 'add_comment', {})).rejects.toThrow('table, sys_id, and comment are required');
  });

  it('updates the comments field', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'inc1' });
    await executeIncidentToolCall(mockClient, 'add_comment', { table: 'incident', sys_id: 'inc1', comment: 'Customer update' });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('incident', 'inc1', { comments: 'Customer update' });
  });
});
