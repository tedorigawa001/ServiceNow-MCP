import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeKnowledgeToolCall, getKnowledgeToolDefinitions } from '../../src/tools/knowledge.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getKnowledgeToolDefinitions', () => {
  it('returns 7 knowledge tool definitions', () => {
    expect(getKnowledgeToolDefinitions().length).toBe(7);
  });
});

describe('executeKnowledgeToolCall – list_knowledge_bases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries active knowledge bases', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2, records: [{}, {}] });
    const result = await executeKnowledgeToolCall(mockClient, 'list_knowledge_bases', {});
    expect(result.count).toBe(2);
    expect(result.knowledge_bases).toHaveLength(2);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'kb_knowledge_base',
      query: 'active=true',
    }));
  });
});

describe('executeKnowledgeToolCall – search_knowledge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when query is missing', async () => {
    await expect(
      executeKnowledgeToolCall(mockClient, 'search_knowledge', {})
    ).rejects.toThrow('query is required');
  });

  it('searches articles by keyword', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3, records: [{}, {}, {}] });
    const result = await executeKnowledgeToolCall(mockClient, 'search_knowledge', { query: 'VPN setup' });
    expect(result.count).toBe(3);
    expect(result.articles).toHaveLength(3);
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.table).toBe('kb_knowledge');
    expect(call.query).toContain('VPN setup');
    expect(call.query).toContain('published');
  });

  it('applies knowledge_base filter when provided', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{}] });
    await executeKnowledgeToolCall(mockClient, 'search_knowledge', { query: 'password', knowledge_base: 'IT Support' });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.query).toContain('IT Support');
  });
});

describe('executeKnowledgeToolCall – get_knowledge_article', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when number_or_sysid is missing', async () => {
    await expect(
      executeKnowledgeToolCall(mockClient, 'get_knowledge_article', {})
    ).rejects.toThrow('number_or_sysid is required');
  });

  it('fetches by sys_id directly', async () => {
    const sysId = 'b'.repeat(32);
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: sysId, number: 'KB0001' });
    const result = await executeKnowledgeToolCall(mockClient, 'get_knowledge_article', { number_or_sysid: sysId });
    expect(result.number).toBe('KB0001');
    expect(mockClient.getRecord).toHaveBeenCalledWith('kb_knowledge', sysId);
  });

  it('fetches by article number', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ number: 'KB0042' }] });
    const result = await executeKnowledgeToolCall(mockClient, 'get_knowledge_article', { number_or_sysid: 'KB0042' });
    expect(result.number).toBe('KB0042');
  });

  it('throws NOT_FOUND when article does not exist', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeKnowledgeToolCall(mockClient, 'get_knowledge_article', { number_or_sysid: 'KB9999' })
    ).rejects.toThrow('Article not found: KB9999');
  });

  it('strips ^ from number_or_sysid before building the lookup query (encoded-query injection)', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ number: 'KB0042' }] });
    await executeKnowledgeToolCall(mockClient, 'get_knowledge_article', { number_or_sysid: 'KB0042^ORactive=true' });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.query).toBe('number=KB0042ORactive=true^ORsys_id=KB0042ORactive=true');
  });
});

describe('executeKnowledgeToolCall – create_knowledge_article', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('creates article with draft state', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'kb1', number: 'KB0001' });
    const result = await executeKnowledgeToolCall(mockClient, 'create_knowledge_article', {
      short_description: 'How to reset password',
      text: '<p>Steps to reset...</p>',
      knowledge_base_sys_id: 'kb-base-001',
    });
    expect(result.summary).toContain('KB0001');
    expect(mockClient.createRecord).toHaveBeenCalledWith('kb_knowledge', expect.objectContaining({
      workflow_state: 'draft',
      kb_knowledge_base: 'kb-base-001',
    }));
  });

  it('throws when required fields are missing', async () => {
    await expect(
      executeKnowledgeToolCall(mockClient, 'create_knowledge_article', { short_description: 'Title only' })
    ).rejects.toThrow('short_description, text, and knowledge_base_sys_id are required');
  });

  it('blocks create when WRITE_ENABLED=false', async () => {
    process.env.WRITE_ENABLED = 'false';
    await expect(
      executeKnowledgeToolCall(mockClient, 'create_knowledge_article', {
        short_description: 'x', text: 'y', knowledge_base_sys_id: 'z',
      })
    ).rejects.toThrow();
  });
});

describe('executeKnowledgeToolCall – update_knowledge_article', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('allows documented article editing fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'kb1' });
    await executeKnowledgeToolCall(mockClient, 'update_knowledge_article', {
      sys_id: 'kb1', fields: { short_description: 'Updated title', text: '<p>Updated content</p>' },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('kb_knowledge', 'kb1', {
      short_description: 'Updated title', text: '<p>Updated content</p>',
    });
  });

  it('rejects state and undeclared fields before they reach the Table API', async () => {
    await expect(executeKnowledgeToolCall(mockClient, 'update_knowledge_article', {
      sys_id: 'kb1', fields: { workflow_state: 'published', sys_domain: 'global' },
    })).rejects.toThrow('Knowledge article fields cannot be updated: workflow_state, sys_domain');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('executeKnowledgeToolCall – publish_knowledge_article', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('sets workflow_state to published', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'kb1', workflow_state: 'published' });
    const result = await executeKnowledgeToolCall(mockClient, 'publish_knowledge_article', { sys_id: 'kb1' });
    expect(result.summary).toContain('kb1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('kb_knowledge', 'kb1', { workflow_state: 'published' });
  });

  it('throws when sys_id is missing', async () => {
    await expect(
      executeKnowledgeToolCall(mockClient, 'publish_knowledge_article', {})
    ).rejects.toThrow('sys_id is required');
  });
});

describe('executeKnowledgeToolCall – retire_knowledge_article', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('retires by sys_id directly', async () => {
    const sysId = 'c'.repeat(32);
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: sysId });
    await executeKnowledgeToolCall(mockClient, 'retire_knowledge_article', { article_id: sysId });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('kb_knowledge', sysId, { workflow_state: 'retired' });
  });

  it('retires by article number (lookup first)', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'kb-sys1' }] });
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'kb-sys1' });
    await executeKnowledgeToolCall(mockClient, 'retire_knowledge_article', { article_id: 'KB0001' });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('kb_knowledge', 'kb-sys1', { workflow_state: 'retired' });
  });

  it('strips ^ from article_id before building the lookup query (encoded-query injection)', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'kb-sys1' }] });
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'kb-sys1' });
    await executeKnowledgeToolCall(mockClient, 'retire_knowledge_article', {
      article_id: 'KB0001^ORactive=true',
    });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.query).toBe('number=KB0001ORactive=true^ORsys_id=KB0001ORactive=true');
  });
});

describe('executeKnowledgeToolCall – unknown tool', () => {
  it('returns null for unrecognised tool', async () => {
    const result = await executeKnowledgeToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
