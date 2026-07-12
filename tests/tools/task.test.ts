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
