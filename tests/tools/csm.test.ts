import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCsmToolCall, getCsmToolDefinitions } from '../../src/tools/csm.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  getRecord: vi.fn(),
  queryRecords: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;

describe('getCsmToolDefinitions', () => {
  it('returns exactly 11 CSM tool definitions', () => {
    expect(getCsmToolDefinitions().length).toBe(11);
  });

  it('all tools have name, description and inputSchema', () => {
    getCsmToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeCsmToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeCsmToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('get_csm_case', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires number_or_sysid', async () => {
    await expect(executeCsmToolCall(mockClient, 'get_csm_case', {})).rejects.toThrow('number_or_sysid is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), number: 'CS0001234' });
    const result = await executeCsmToolCall(mockClient, 'get_csm_case', { number_or_sysid: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('sn_customerservice_case', 'a'.repeat(32));
    expect(result.number).toBe('CS0001234');
  });

  it('resolves by number and throws NOT_FOUND when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeCsmToolCall(mockClient, 'get_csm_case', { number_or_sysid: 'CS0001234' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the number so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'c1', number: 'CS0001234' }] });
    await executeCsmToolCall(mockClient, 'get_csm_case', { number_or_sysid: 'CS0001234^ORstate=closed' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'number=CS0001234ORstate=closed' }));
  });
});

describe('list_csm_cases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines account/contact/state/priority filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCsmToolCall(mockClient, 'list_csm_cases', { account: 'Acme', contact: 'Jane Doe', state: 'open', priority: '1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sn_customerservice_case',
      query: 'account.name=Acme^contact.name=Jane Doe^state=open^priority=1',
    }));
  });

  it('strips ^ from account and state so they cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCsmToolCall(mockClient, 'list_csm_cases', { account: 'Acme^ORstate=closed', state: 'open^ORpriority=1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: 'account.name=AcmeORstate=closed^state=openORpriority=1',
    }));
  });
});

describe('close_csm_case', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeCsmToolCall(mockClient, 'close_csm_case', { sys_id: 'c1', resolution_notes: 'Fixed' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires sys_id and resolution_notes', async () => {
    await expect(executeCsmToolCall(mockClient, 'close_csm_case', {})).rejects.toThrow('sys_id and resolution_notes are required');
  });

  it('closes the case with state closed', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'c1' });
    const result = await executeCsmToolCall(mockClient, 'close_csm_case', { sys_id: 'c1', resolution_notes: 'Fixed', resolution_code: 'Solved' });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sn_customerservice_case', 'c1', {
      state: 'closed', close_notes: 'Fixed', close_code: 'Solved',
    });
    expect(result.summary).toContain('c1');
  });
});

describe('get_csm_account', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name_or_sysid', async () => {
    await expect(executeCsmToolCall(mockClient, 'get_csm_account', {})).rejects.toThrow('name_or_sysid is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Acme Corp' });
    const result = await executeCsmToolCall(mockClient, 'get_csm_account', { name_or_sysid: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('customer_account', 'a'.repeat(32));
    expect(result.name).toBe('Acme Corp');
  });

  it('throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeCsmToolCall(mockClient, 'get_csm_account', { name_or_sysid: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the name so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'a1', name: 'Acme Corp' }] });
    await executeCsmToolCall(mockClient, 'get_csm_account', { name_or_sysid: 'Acme Corp^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'name=Acme CorpORactive=true' }));
  });
});

describe('list_csm_accounts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and applies a query filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCsmToolCall(mockClient, 'list_csm_accounts', { query: 'Acme' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'customer_account', query: 'active=true^nameCONTAINSAcme' }));
  });
});

describe('get_csm_contact', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name_or_sysid', async () => {
    await expect(executeCsmToolCall(mockClient, 'get_csm_contact', {})).rejects.toThrow('name_or_sysid is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Jane Doe' });
    const result = await executeCsmToolCall(mockClient, 'get_csm_contact', { name_or_sysid: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('customer_contact', 'a'.repeat(32));
    expect(result.name).toBe('Jane Doe');
  });

  it('searches by name/email and throws NOT_FOUND when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeCsmToolCall(mockClient, 'get_csm_contact', { name_or_sysid: 'jane@example.com' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the identifier so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'c1', name: 'Jane Doe' }] });
    await executeCsmToolCall(mockClient, 'get_csm_contact', { name_or_sysid: 'Jane^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'nameCONTAINSJaneORactive=true^ORemail=JaneORactive=true' }));
  });
});

describe('list_csm_contacts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by account_sysid and query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCsmToolCall(mockClient, 'list_csm_contacts', { account_sysid: 'a1', query: 'jane' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'customer_contact',
      query: 'account=a1^nameCONTAINSjane^ORemail=jane',
    }));
  });
});

describe('get_csm_case_sla', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires case_sysid', async () => {
    await expect(executeCsmToolCall(mockClient, 'get_csm_case_sla', {})).rejects.toThrow('case_sysid is required');
  });

  it('queries task_sla by task', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCsmToolCall(mockClient, 'get_csm_case_sla', { case_sysid: 'c1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'task_sla', query: 'task=c1' }));
  });
});

describe('list_csm_products', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches by name', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCsmToolCall(mockClient, 'list_csm_products', { query: 'Widget' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'cmdb_ci_service', query: 'nameCONTAINSWidget' }));
  });
});

describe('executeCsmToolCall – write field allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('preserves documented create fields', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'case1' });
    await executeCsmToolCall(mockClient, 'create_csm_case', {
      short_description: 'Customer cannot sign in', priority: '1',
    });
    expect(mockClient.createRecord).toHaveBeenCalledWith('sn_customerservice_case', {
      short_description: 'Customer cannot sign in', priority: '1',
    });
  });

  it('rejects undeclared create fields before they reach the Table API', async () => {
    await expect(executeCsmToolCall(mockClient, 'create_csm_case', {
      short_description: 'Customer cannot sign in', sys_domain: 'global', u_unlisted: 'yes',
    })).rejects.toThrow('CSM case fields cannot be set: sys_domain, u_unlisted');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });

  it('allows documented update fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'case1' });
    await executeCsmToolCall(mockClient, 'update_csm_case', {
      sys_id: 'case1', fields: { state: 'resolved', close_notes: 'Fixed' },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sn_customerservice_case', 'case1', {
      state: 'resolved', close_notes: 'Fixed',
    });
  });

  it('rejects undeclared update fields before they reach the Table API', async () => {
    await expect(executeCsmToolCall(mockClient, 'update_csm_case', {
      sys_id: 'case1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('CSM case fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});
