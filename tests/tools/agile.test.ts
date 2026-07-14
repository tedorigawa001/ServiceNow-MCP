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

describe('list_stories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines sprint and state filters', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeAgileToolCall(mockClient, 'list_stories', { sprint: 's1', state: '1' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'rm_story', query: 'sprint=s1^state=1' }));
  });

  it('strips ^ from sprint and state so they cannot inject extra encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeAgileToolCall(mockClient, 'list_stories', { sprint: 's1^ORstate=3', state: '1^ORactive=false' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'sprint=s1ORstate=3^state=1ORactive=false' }));
  });
});

describe('list_epics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines project and state filters', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeAgileToolCall(mockClient, 'list_epics', { project: 'p1', state: 'open' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'rm_epic', query: 'project=p1^state=open' }));
  });
});

describe('create_scrum_task', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeAgileToolCall(mockClient, 'create_scrum_task', { short_description: 'X' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires short_description', async () => {
    await expect(executeAgileToolCall(mockClient, 'create_scrum_task', {})).rejects.toThrow('short_description is required');
  });

  it('creates the task with story and assignee', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 't1', number: 'STSK001' });
    const result = await executeAgileToolCall(mockClient, 'create_scrum_task', { short_description: 'Write tests', story_sys_id: 's1', assigned_to: 'u1' });
    expect(mockClient.createRecord).toHaveBeenCalledWith('rm_scrum_task', { short_description: 'Write tests', story: 's1', assigned_to: 'u1' });
    expect(result.summary).toContain('STSK001');
  });
});

describe('list_scrum_tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines story_sys_id and assigned_to filters', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeAgileToolCall(mockClient, 'list_scrum_tasks', { story_sys_id: 's1', assigned_to: 'jdoe' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'rm_scrum_task',
      query: 'story=s1^assigned_to.user_name=jdoe',
    }));
  });

  it('strips ^ from assigned_to so it cannot inject extra encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeAgileToolCall(mockClient, 'list_scrum_tasks', { assigned_to: 'jdoe^ORactive=true' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'assigned_to.user_name=jdoeORactive=true' }));
  });
});
