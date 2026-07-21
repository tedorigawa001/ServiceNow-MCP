import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeCatalogToolCall, getCatalogToolDefinitions } from '../../src/tools/catalog.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  callNowAssist: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const ur = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('getCatalogToolDefinitions', () => {
  it('all tools have name, description and inputSchema', () => {
    getCatalogToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeCatalogToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeCatalogToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('list_catalog_items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters to active items by default', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'list_catalog_items', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sc_cat_item', query: 'active=true' }));
  });

  it('adds a category filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'list_catalog_items', { category: 'Hardware' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'active=true^category.title=Hardware^ORcategory=Hardware' }));
  });
});

describe('search_catalog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires query', async () => {
    await expect(executeCatalogToolCall(mockClient, 'search_catalog', {})).rejects.toThrow('query is required');
  });

  it('searches by name/short_description', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'search_catalog', { query: 'laptop' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sc_cat_item', query: 'nameLIKElaptop^ORshort_descriptionLIKElaptop^active=true' }));
  });
});

describe('get_catalog_item', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id_or_name', async () => {
    await expect(executeCatalogToolCall(mockClient, 'get_catalog_item', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Laptop' });
    const result = await executeCatalogToolCall(mockClient, 'get_catalog_item', { sys_id_or_name: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('sc_cat_item', 'a'.repeat(32));
    expect(result.name).toBe('Laptop');
  });

  it('throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeCatalogToolCall(mockClient, 'get_catalog_item', { sys_id_or_name: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from sys_id_or_name before building the lookup query (encoded-query injection)', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'Laptop' }] });
    await executeCatalogToolCall(mockClient, 'get_catalog_item', { sys_id_or_name: 'Laptop^ORactive=true' });
    expect(qr().mock.calls[0][0].query).toBe('name=LaptopORactive=true^ORsys_id=LaptopORactive=true');
  });
});

describe('create_catalog_item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeCatalogToolCall(mockClient, 'create_catalog_item', { name: 'X', short_description: 'Y' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires name and short_description', async () => {
    await expect(executeCatalogToolCall(mockClient, 'create_catalog_item', {})).rejects.toThrow('name and short_description are required');
  });

  it('creates the item', async () => {
    cr().mockResolvedValue({ sys_id: 'ci1' });
    const result = await executeCatalogToolCall(mockClient, 'create_catalog_item', { name: 'Laptop', short_description: 'A laptop' });
    expect(cr()).toHaveBeenCalledWith('sc_cat_item', expect.objectContaining({ name: 'Laptop', short_description: 'A laptop', active: true }));
    expect(result.summary).toContain('Laptop');
  });
});

describe('order_catalog_item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeCatalogToolCall(mockClient, 'order_catalog_item', { sys_id: 'ci1' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires sys_id', async () => {
    await expect(executeCatalogToolCall(mockClient, 'order_catalog_item', {})).rejects.toThrow('sys_id is required');
  });

  it('orders the item via the servicecatalog order_now API', async () => {
    (mockClient.callNowAssist as ReturnType<typeof vi.fn>).mockResolvedValue({ request_number: 'REQ0001' });
    const result = await executeCatalogToolCall(mockClient, 'order_catalog_item', { sys_id: 'ci1', quantity: 2, variables: { color: 'black' } });
    expect(mockClient.callNowAssist).toHaveBeenCalledWith('/api/now/v1/servicecatalog/items/ci1/order_now', {
      sysparm_quantity: 2, variables: { color: 'black' },
    });
    expect(result.summary).toContain('ci1');
  });
});

describe('create_approval_rule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeCatalogToolCall(mockClient, 'create_approval_rule', {
      name: 'X', table: 'sc_request', approver_type: 'user', approver: 'u1',
    })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name, table, approver_type, and approver', async () => {
    await expect(executeCatalogToolCall(mockClient, 'create_approval_rule', {})).rejects.toThrow(
      'name, table, approver_type, and approver are required'
    );
  });

  it('creates a user-approver rule', async () => {
    cr().mockResolvedValue({ sys_id: 'rule1' });
    await executeCatalogToolCall(mockClient, 'create_approval_rule', {
      name: 'Manager approval', table: 'sc_request', approver_type: 'user', approver: 'u1',
    });
    expect(cr()).toHaveBeenCalledWith('sysapproval_rule', expect.objectContaining({ approver: 'u1' }));
  });

  it('creates a group-approver rule using approver_group', async () => {
    cr().mockResolvedValue({ sys_id: 'rule1' });
    await executeCatalogToolCall(mockClient, 'create_approval_rule', {
      name: 'Team approval', table: 'sc_request', approver_type: 'group', approver: 'g1',
    });
    expect(cr()).toHaveBeenCalledWith('sysapproval_rule', expect.objectContaining({ approver_group: 'g1' }));
  });
});

describe('get_my_approvals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to state=requested', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'get_my_approvals', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sysapproval_approver', query: expect.stringContaining('state=requested') }));
  });
});

describe('list_approvals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines query and state filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'list_approvals', { query: 'sysapproval=r1', state: 'requested' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sysapproval_approver', query: 'sysapproval=r1^state=requested' }));
  });
});

describe('approve_request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires sys_id', async () => {
    await expect(executeCatalogToolCall(mockClient, 'approve_request', {})).rejects.toThrow('sys_id is required');
  });

  it('approves and sets comments', async () => {
    ur().mockResolvedValue({ sys_id: 'ap1' });
    await executeCatalogToolCall(mockClient, 'approve_request', { sys_id: 'ap1', comments: 'LGTM' });
    expect(ur()).toHaveBeenCalledWith('sysapproval_approver', 'ap1', { state: 'approved', comments: 'LGTM' });
  });
});

describe('reject_request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires sys_id and comments', async () => {
    await expect(executeCatalogToolCall(mockClient, 'reject_request', { sys_id: 'ap1' })).rejects.toThrow('sys_id and comments are required');
  });

  it('rejects with comments', async () => {
    ur().mockResolvedValue({ sys_id: 'ap1' });
    await executeCatalogToolCall(mockClient, 'reject_request', { sys_id: 'ap1', comments: 'Not needed' });
    expect(ur()).toHaveBeenCalledWith('sysapproval_approver', 'ap1', { state: 'rejected', comments: 'Not needed' });
  });
});

describe('get_sla_details', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires task_sys_id', async () => {
    await expect(executeCatalogToolCall(mockClient, 'get_sla_details', {})).rejects.toThrow('task_sys_id is required');
  });

  it('queries task_sla by task', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'get_sla_details', { task_sys_id: 't1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'task_sla', query: 'task=t1' }));
  });
});

describe('list_active_slas', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters to incomplete, unbreached SLAs', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'list_active_slas', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'task_sla', query: 'stage!=complete^has_breached=false' }));
  });
});

describe('create_catalog_variable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires cat_item_id, name, question_text, and type', async () => {
    await expect(executeCatalogToolCall(mockClient, 'create_catalog_variable', {})).rejects.toThrow(
      'cat_item_id, name, question_text, and type are required'
    );
  });

  it('maps known variable types to internal type codes', async () => {
    cr().mockResolvedValue({ sys_id: 'var1' });
    await executeCatalogToolCall(mockClient, 'create_catalog_variable', {
      cat_item_id: 'ci1', name: 'color', question_text: 'Pick a color', type: 'select_box',
    });
    expect(cr()).toHaveBeenCalledWith('item_option_new', expect.objectContaining({ type: '1' }));
  });
});

describe('create_catalog_ui_policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires cat_item_id and short_description', async () => {
    await expect(executeCatalogToolCall(mockClient, 'create_catalog_ui_policy', {})).rejects.toThrow(
      'cat_item_id and short_description are required'
    );
  });

  it('creates the UI policy', async () => {
    cr().mockResolvedValue({ sys_id: 'pol1' });
    await executeCatalogToolCall(mockClient, 'create_catalog_ui_policy', { cat_item_id: 'ci1', short_description: 'Hide color unless laptop' });
    expect(cr()).toHaveBeenCalledWith('catalog_ui_policy', expect.objectContaining({ catalog_item: 'ci1', applies_to: 'catalog_item' }));
  });
});

describe('list_requests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps a named state to its numeric code', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'list_requests', { state: 'open' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sc_request', query: 'state=1' }));
  });

  it('rejects an invalid state', async () => {
    await expect(executeCatalogToolCall(mockClient, 'list_requests', { state: 'bogus' })).rejects.toThrow('Invalid state');
  });

  it('rejects a malformed requested_for', async () => {
    await expect(executeCatalogToolCall(mockClient, 'list_requests', { requested_for: '***' })).rejects.toThrow(
      'requested_for must be a 32-char sys_id or a valid username'
    );
  });
});

describe('get_request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires number_or_sysid', async () => {
    await expect(executeCatalogToolCall(mockClient, 'get_request', {})).rejects.toThrow('number_or_sysid is required');
  });

  it('rejects a malformed identifier', async () => {
    await expect(executeCatalogToolCall(mockClient, 'get_request', { number_or_sysid: 'bogus' })).rejects.toThrow(
      'number_or_sysid must be a 32-char sys_id or REQ number'
    );
  });

  it('resolves by REQ number and includes items', async () => {
    qr()
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'a'.repeat(32), number: 'REQ0001234' }] })
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'ritm1' }] });
    const result = await executeCatalogToolCall(mockClient, 'get_request', { number_or_sysid: 'REQ0001234' });
    expect(result.request.number).toBe('REQ0001234');
    expect(result.item_count).toBe(1);
  });

  it('throws NOT_FOUND when the REQ number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeCatalogToolCall(mockClient, 'get_request', { number_or_sysid: 'REQ9999999' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('list_request_items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a malformed request_sysid', async () => {
    await expect(executeCatalogToolCall(mockClient, 'list_request_items', { request_sysid: 'not-hex' })).rejects.toThrow(
      'request_sysid must be a 32-char hex sys_id'
    );
  });

  it('rejects an invalid stage', async () => {
    await expect(executeCatalogToolCall(mockClient, 'list_request_items', { stage: 'bogus' })).rejects.toThrow('Invalid stage');
  });

  it('lists items filtered by request_sysid', async () => {
    const id = 'a'.repeat(32);
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeCatalogToolCall(mockClient, 'list_request_items', { request_sysid: id });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sc_req_item', query: `request=${id}` }));
  });
});

describe('get_request_item', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires number_or_sysid', async () => {
    await expect(executeCatalogToolCall(mockClient, 'get_request_item', {})).rejects.toThrow('number_or_sysid is required');
  });

  it('resolves by RITM number and includes tasks', async () => {
    qr()
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'a'.repeat(32), number: 'RITM0001234' }] })
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'task1' }] });
    const result = await executeCatalogToolCall(mockClient, 'get_request_item', { number_or_sysid: 'RITM0001234' });
    expect(result.request_item.number).toBe('RITM0001234');
    expect(result.task_count).toBe(1);
  });
});

describe('cancel_request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires sys_id', async () => {
    await expect(executeCatalogToolCall(mockClient, 'cancel_request', {})).rejects.toThrow('sys_id is required');
  });

  it('sets state to closed_cancelled (4)', async () => {
    ur().mockResolvedValue({ sys_id: 'r1' });
    await executeCatalogToolCall(mockClient, 'cancel_request', { sys_id: 'r1', comments: 'no longer needed' });
    expect(ur()).toHaveBeenCalledWith('sc_request', 'r1', { state: '4', comments: 'no longer needed' });
  });
});

describe('update_request_item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires sys_id', async () => {
    await expect(executeCatalogToolCall(mockClient, 'update_request_item', {})).rejects.toThrow('sys_id is required');
  });

  it('requires at least one field to update', async () => {
    await expect(executeCatalogToolCall(mockClient, 'update_request_item', { sys_id: 'ritm1' })).rejects.toThrow(
      'At least one field to update is required'
    );
  });

  it('rejects an invalid stage', async () => {
    await expect(executeCatalogToolCall(mockClient, 'update_request_item', { sys_id: 'ritm1', stage: 'bogus' })).rejects.toThrow('Invalid stage');
  });

  it('rejects an invalid state', async () => {
    await expect(executeCatalogToolCall(mockClient, 'update_request_item', { sys_id: 'ritm1', state: '9' })).rejects.toThrow('Invalid state');
  });

  it('updates stage and work_notes', async () => {
    ur().mockResolvedValue({ sys_id: 'ritm1' });
    await executeCatalogToolCall(mockClient, 'update_request_item', { sys_id: 'ritm1', stage: 'fulfillment', work_notes: 'started' });
    expect(ur()).toHaveBeenCalledWith('sc_req_item', 'ritm1', { stage: 'fulfillment', work_notes: 'started' });
  });
});

describe('executeCatalogToolCall – update_catalog_item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('allows documented catalog item fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'item1' });
    await executeCatalogToolCall(mockClient, 'update_catalog_item', {
      sys_id: 'item1', fields: { short_description: 'Updated', active: false },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sc_cat_item', 'item1', {
      short_description: 'Updated', active: false,
    });
  });

  it('rejects undeclared fields before they reach the Table API', async () => {
    await expect(executeCatalogToolCall(mockClient, 'update_catalog_item', {
      sys_id: 'item1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Catalog item fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});
