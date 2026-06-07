import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeUserToolCall, getUserToolDefinitions } from '../../src/tools/user.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  deleteRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getUserToolDefinitions', () => {
  it('returns 8 user/group tool definitions', () => {
    expect(getUserToolDefinitions().length).toBe(8);
  });
});

describe('executeUserToolCall – list_users', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns active users by default', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 10, records: [] });
    const result = await executeUserToolCall(mockClient, 'list_users', {});
    expect(result.count).toBe(10);
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.table).toBe('sys_user');
    expect(call.query).toContain('active=true');
  });

  it('accepts custom query filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2, records: [] });
    await executeUserToolCall(mockClient, 'list_users', { query: 'departmentLIKEIT' });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.query).toBe('departmentLIKEIT');
  });
});

describe('executeUserToolCall – create_user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('throws when required fields are missing', async () => {
    await expect(
      executeUserToolCall(mockClient, 'create_user', { user_name: 'jsmith' })
    ).rejects.toThrow('user_name, email, first_name, and last_name are required');
  });

  it('creates user and returns summary', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'usr1', user_name: 'jsmith' });
    const result = await executeUserToolCall(mockClient, 'create_user', {
      user_name: 'jsmith',
      email: 'j.smith@company.com',
      first_name: 'John',
      last_name: 'Smith',
    });
    expect(result.summary).toContain('jsmith');
  });

  it('blocks create when WRITE_ENABLED=false', async () => {
    process.env.WRITE_ENABLED = 'false';
    await expect(
      executeUserToolCall(mockClient, 'create_user', {
        user_name: 'x', email: 'x@x.com', first_name: 'X', last_name: 'X',
      })
    ).rejects.toThrow();
  });
});

describe('executeUserToolCall – update_user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('throws when sys_id or fields is missing', async () => {
    await expect(
      executeUserToolCall(mockClient, 'update_user', { sys_id: 'usr1' })
    ).rejects.toThrow('sys_id and fields are required');
  });

  it('updates user fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'usr1' });
    const result = await executeUserToolCall(mockClient, 'update_user', {
      sys_id: 'usr1',
      fields: { title: 'Senior Engineer' },
    });
    expect(result.summary).toContain('usr1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_user', 'usr1', { title: 'Senior Engineer' });
  });
});

describe('executeUserToolCall – list_groups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns active groups by default', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 5, records: [] });
    const result = await executeUserToolCall(mockClient, 'list_groups', {});
    expect(result.count).toBe(5);
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.table).toBe('sys_user_group');
    expect(call.query).toContain('active=true');
  });
});

describe('executeUserToolCall – create_group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('throws when name is missing', async () => {
    await expect(
      executeUserToolCall(mockClient, 'create_group', {})
    ).rejects.toThrow('name is required');
  });

  it('creates group and returns summary', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'grp1', name: 'Network Ops' });
    const result = await executeUserToolCall(mockClient, 'create_group', { name: 'Network Ops' });
    expect(result.summary).toContain('Network Ops');
  });
});

describe('executeUserToolCall – add_user_to_group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('throws when user_sys_id or group_sys_id is missing', async () => {
    await expect(
      executeUserToolCall(mockClient, 'add_user_to_group', { user_sys_id: 'usr1' })
    ).rejects.toThrow('user_sys_id and group_sys_id are required');
  });

  it('creates sys_user_grmember record', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'mem1' });
    const result = await executeUserToolCall(mockClient, 'add_user_to_group', {
      user_sys_id: 'usr1',
      group_sys_id: 'grp1',
    });
    expect(result.summary).toContain('usr1');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_user_grmember', { user: 'usr1', group: 'grp1' });
  });
});

describe('executeUserToolCall – remove_user_from_group', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('throws when member_sys_id is missing', async () => {
    await expect(
      executeUserToolCall(mockClient, 'remove_user_from_group', {})
    ).rejects.toThrow('member_sys_id is required');
  });

  it('deletes the membership record', async () => {
    (mockClient.deleteRecord as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const result = await executeUserToolCall(mockClient, 'remove_user_from_group', { member_sys_id: 'mem1' });
    expect(result.summary).toContain('mem1');
    expect(mockClient.deleteRecord).toHaveBeenCalledWith('sys_user_grmember', 'mem1');
  });
});

describe('executeUserToolCall – unknown tool', () => {
  it('returns null for unrecognised tool', async () => {
    const result = await executeUserToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
