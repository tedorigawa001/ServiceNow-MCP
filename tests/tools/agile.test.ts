import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgileToolCall, getAgileToolDefinitions } from '../../src/tools/agile.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  deleteRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getAgileToolDefinitions', () => {
  it('returns 9 agile tool definitions', () => {
    expect(getAgileToolDefinitions().length).toBe(9);
  });
});

describe('executeAgileToolCall – create_story', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('creates a story with allowed fields', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'story1', number: 'STRY0001' });

    const result = await executeAgileToolCall(mockClient, 'create_story', {
      short_description: 'Add onboarding checklist',
      description: 'Acceptance criteria',
      story_points: 3,
      sprint: 'sprint1',
      epic: 'epic1',
      assigned_to: 'user1',
    });

    expect(result.summary).toContain('STRY0001');
    expect(mockClient.createRecord).toHaveBeenCalledWith('rm_story', {
      short_description: 'Add onboarding checklist',
      description: 'Acceptance criteria',
      story_points: 3,
      sprint: 'sprint1',
      epic: 'epic1',
      assigned_to: 'user1',
    });
  });

  it('rejects undeclared story create fields', async () => {
    await expect(
      executeAgileToolCall(mockClient, 'create_story', {
        short_description: 'Escalate privileges',
        sys_domain: 'global',
        u_unreviewed: 'value',
      })
    ).rejects.toThrow('Story fields cannot be set: sys_domain, u_unreviewed');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });
});

describe('executeAgileToolCall – update_story', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('updates story fields from the allowlist', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'story1' });

    await executeAgileToolCall(mockClient, 'update_story', {
      sys_id: 'story1',
      fields: { story_points: 5, assigned_to: 'user1' },
    });

    expect(mockClient.updateRecord).toHaveBeenCalledWith('rm_story', 'story1', {
      story_points: 5,
      assigned_to: 'user1',
    });
  });

  it('rejects undeclared story update fields', async () => {
    await expect(
      executeAgileToolCall(mockClient, 'update_story', {
        sys_id: 'story1',
        fields: { story_points: 5, sys_domain: 'global' },
      })
    ).rejects.toThrow('Story fields cannot be updated: sys_domain');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('executeAgileToolCall – create_epic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('rejects undeclared epic create fields', async () => {
    await expect(
      executeAgileToolCall(mockClient, 'create_epic', {
        short_description: 'Program increment',
        project: 'project1',
        sys_domain: 'global',
      })
    ).rejects.toThrow('Epic fields cannot be set: sys_domain');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });
});

describe('executeAgileToolCall – update_epic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('rejects undeclared epic update fields', async () => {
    await expect(
      executeAgileToolCall(mockClient, 'update_epic', {
        sys_id: 'epic1',
        fields: { description: 'Updated', sys_domain: 'global' },
      })
    ).rejects.toThrow('Epic fields cannot be updated: sys_domain');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('executeAgileToolCall – update_scrum_task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('updates scrum task fields from the allowlist', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'task1' });

    await executeAgileToolCall(mockClient, 'update_scrum_task', {
      sys_id: 'task1',
      fields: { short_description: 'Implement checklist', assigned_to: 'user1' },
    });

    expect(mockClient.updateRecord).toHaveBeenCalledWith('rm_scrum_task', 'task1', {
      short_description: 'Implement checklist',
      assigned_to: 'user1',
    });
  });

  it('rejects undeclared scrum task update fields', async () => {
    await expect(
      executeAgileToolCall(mockClient, 'update_scrum_task', {
        sys_id: 'task1',
        fields: { short_description: 'Implement checklist', sys_domain: 'global' },
      })
    ).rejects.toThrow('Scrum task fields cannot be updated: sys_domain');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});
