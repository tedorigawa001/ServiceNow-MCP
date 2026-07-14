import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeProblemToolCall } from '../../src/tools/problem.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('executeProblemToolCall – write field allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('preserves documented problem create fields', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'prb1' });
    await executeProblemToolCall(mockClient, 'create_problem', {
      short_description: 'Recurring outage', assignment_group: 'Network', priority: '2',
    });
    expect(mockClient.createRecord).toHaveBeenCalledWith('problem', {
      short_description: 'Recurring outage', assignment_group: 'Network', priority: '2',
    });
  });

  it('rejects undeclared create fields before they reach the Table API', async () => {
    await expect(executeProblemToolCall(mockClient, 'create_problem', {
      short_description: 'Recurring outage', sys_domain: 'global', u_unlisted: 'yes',
    })).rejects.toThrow('Problem fields cannot be set: sys_domain, u_unlisted');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });

  it('allows operational lifecycle updates', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'prb1' });
    await executeProblemToolCall(mockClient, 'update_problem', {
      sys_id: 'prb1', fields: { state: '107', cause_notes: 'Root cause found', work_notes: 'Investigating' },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('problem', 'prb1', {
      state: '107', cause_notes: 'Root cause found', work_notes: 'Investigating',
    });
  });

  it('rejects undeclared update fields before they reach the Table API', async () => {
    await expect(executeProblemToolCall(mockClient, 'update_problem', {
      sys_id: 'prb1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Problem fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('get_problem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires number_or_sysid', async () => {
    await expect(executeProblemToolCall(mockClient, 'get_problem', {})).rejects.toThrow('number_or_sysid is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'a'.repeat(32), number: 'PRB0001' });
    const result = await executeProblemToolCall(mockClient, 'get_problem', { number_or_sysid: 'a'.repeat(32) });
    expect(mockClient.getRecord).toHaveBeenCalledWith('problem', 'a'.repeat(32));
    expect(result.number).toBe('PRB0001');
  });

  it('resolves by number and throws NOT_FOUND when missing', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(executeProblemToolCall(mockClient, 'get_problem', { number_or_sysid: 'PRB0001' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the number so it cannot inject extra encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'p1', number: 'PRB0001' }] });
    await executeProblemToolCall(mockClient, 'get_problem', { number_or_sysid: 'PRB0001^ORstate=closed' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'number=PRB0001ORstate=closed^ORsys_id=PRB0001ORstate=closed' }));
  });
});

describe('resolve_problem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('requires sys_id, root_cause, and resolution_notes', async () => {
    await expect(executeProblemToolCall(mockClient, 'resolve_problem', {})).rejects.toThrow(
      'sys_id, root_cause, and resolution_notes are required'
    );
  });

  it('sets state to 107 with cause/fix notes', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'p1' });
    const result = await executeProblemToolCall(mockClient, 'resolve_problem', {
      sys_id: 'p1', root_cause: 'Memory leak', resolution_notes: 'Patched the leak',
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('problem', 'p1', expect.objectContaining({
      state: '107', cause_notes: 'Memory leak', fix_notes: 'Patched the leak',
    }));
    expect(result.summary).toContain('Resolved problem');
  });
});
