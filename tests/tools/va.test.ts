import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeVaToolCall, getVaToolDefinitions } from '../../src/tools/va.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;
const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;

describe('getVaToolDefinitions', () => {
  it('returns exactly 7 VA tool definitions', () => {
    expect(getVaToolDefinitions().length).toBe(7);
  });

  it('all tools have name, description and inputSchema', () => {
    getVaToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeVaToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeVaToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('create_va_topic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeVaToolCall(mockClient, 'create_va_topic', { name: 'Password Reset' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name', async () => {
    await expect(executeVaToolCall(mockClient, 'create_va_topic', {})).rejects.toThrow('name is required');
  });

  it('creates the topic active by default', async () => {
    cr().mockResolvedValue({ sys_id: 't1' });
    const result = await executeVaToolCall(mockClient, 'create_va_topic', { name: 'Password Reset' });
    expect(cr()).toHaveBeenCalledWith('sys_cs_topic', expect.objectContaining({ name: 'Password Reset', active: true }));
    expect(result.action).toBe('created');
  });
});

describe('get_va_topic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id', async () => {
    await expect(executeVaToolCall(mockClient, 'get_va_topic', {})).rejects.toThrow('sys_id is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 't1', name: 'Password Reset' });
    const result = await executeVaToolCall(mockClient, 'get_va_topic', { sys_id: 't1' });
    expect(gr()).toHaveBeenCalledWith('sys_cs_topic', 't1');
    expect(result.name).toBe('Password Reset');
  });
});

describe('list_va_topics_full', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and filters by category', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeVaToolCall(mockClient, 'list_va_topics_full', { category: 'IT Support' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_cs_topic', query: 'active=true^category.title=IT Support' }));
  });

  it('strips ^ from category so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeVaToolCall(mockClient, 'list_va_topics_full', { category: 'IT^ORactive=false' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'active=true^category.title=ITORactive=false' }));
  });
});

describe('get_va_conversation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires conversation_id', async () => {
    await expect(executeVaToolCall(mockClient, 'get_va_conversation', {})).rejects.toThrow('conversation_id is required');
  });

  it('queries messages by conversation', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ message: 'hi' }, { message: 'hello' }] });
    const result = await executeVaToolCall(mockClient, 'get_va_conversation', { conversation_id: 'c1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_cs_conversation_message', query: 'conversation=c1' }));
    expect(result.message_count).toBe(2);
  });

  it('strips ^ from conversation_id so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeVaToolCall(mockClient, 'get_va_conversation', { conversation_id: 'c1^ORsys_idISNOTEMPTY' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'conversation=c1ORsys_idISNOTEMPTY' }));
  });
});

describe('list_va_conversations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines topic_sys_id and user_sys_id filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeVaToolCall(mockClient, 'list_va_conversations', { topic_sys_id: 't1', user_sys_id: 'u1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_cs_conversation', query: 'topic=t1^user=u1' }));
  });
});

describe('list_va_categories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries sys_cs_category', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeVaToolCall(mockClient, 'list_va_categories', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_cs_category' }));
  });
});

describe('executeVaToolCall – update_va_topic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
  });

  it('updates VA topic fields from the allowlist', async () => {
    updateRec().mockResolvedValue({ sys_id: 'topic1' });

    const result = await executeVaToolCall(mockClient, 'update_va_topic', {
      sys_id: 'topic1',
      fields: {
        name: 'Password reset',
        description: 'Handle password reset',
        active: true,
      },
    });

    expect(result.action).toBe('updated');
    expect(updateRec()).toHaveBeenCalledWith('sys_cs_topic', 'topic1', {
      name: 'Password reset',
      description: 'Handle password reset',
      active: true,
    });
  });

  it('rejects undeclared VA topic update fields', async () => {
    await expect(
      executeVaToolCall(mockClient, 'update_va_topic', {
        sys_id: 'topic1',
        fields: { name: 'Password reset', sys_id: 'other', sys_domain: 'global' },
      })
    ).rejects.toThrow('VA topic fields cannot be updated: sys_id, sys_domain');
    expect(updateRec()).not.toHaveBeenCalled();
  });
});
