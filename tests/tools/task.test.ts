import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTaskToolCall, getTaskToolDefinitions } from '../../src/tools/task.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  deleteRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getTaskToolDefinitions', () => {
  it('returns 4 task tool definitions', () => {
    expect(getTaskToolDefinitions().length).toBe(4);
  });
});

describe('executeTaskToolCall – update_task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('updates task fields from the allowlist', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'task1' });

    const result = await executeTaskToolCall(mockClient, 'update_task', {
      sys_id: 'task1',
      fields: {
        short_description: 'Follow up with requester',
        priority: '2',
        work_notes: 'Investigating',
      },
    });

    expect(result.summary).toContain('task1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('task', 'task1', {
      short_description: 'Follow up with requester',
      priority: '2',
      work_notes: 'Investigating',
    });
  });

  it('rejects undeclared task update fields', async () => {
    await expect(
      executeTaskToolCall(mockClient, 'update_task', {
        sys_id: 'task1',
        fields: {
          short_description: 'Follow up with requester',
          sys_domain: 'global',
          u_unreviewed: 'value',
        },
      })
    ).rejects.toThrow('Task fields cannot be updated: sys_domain, u_unreviewed');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('executeTaskToolCall – complete_task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('only sends completion fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'task1' });

    const result = await executeTaskToolCall(mockClient, 'complete_task', {
      sys_id: 'task1',
      close_notes: 'Resolved',
      sys_domain: 'global',
    });

    expect(result.summary).toContain('task1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('task', 'task1', {
      state: '3',
      close_notes: 'Resolved',
    });
  });
});

describe('get_task', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires number_or_sysid', async () => {
    await expect(executeTaskToolCall(mockClient, 'get_task', {})).rejects.toThrow('number_or_sysid is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'a'.repeat(32), number: 'TASK0001' });
    const result = await executeTaskToolCall(mockClient, 'get_task', { number_or_sysid: 'a'.repeat(32) });
    expect(mockClient.getRecord).toHaveBeenCalledWith('task', 'a'.repeat(32));
    expect(result.number).toBe('TASK0001');
  });

  it('resolves by number and throws NOT_FOUND when missing', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(executeTaskToolCall(mockClient, 'get_task', { number_or_sysid: 'TASK0001' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the number so it cannot inject extra encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 't1', number: 'TASK0001' }] });
    await executeTaskToolCall(mockClient, 'get_task', { number_or_sysid: 'TASK0001^ORstate=closed' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'number=TASK0001ORstate=closed^ORsys_id=TASK0001ORstate=closed' }));
  });
});

describe('list_my_tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters to active, non-closed tasks', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeTaskToolCall(mockClient, 'list_my_tasks', {});
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'task',
      query: expect.stringContaining('active=true^state!=3'),
    }));
  });
});
