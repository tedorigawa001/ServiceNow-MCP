import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeProblemToolCall } from '../../src/tools/problem.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
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
