import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeSysPropertiesToolCall, getSysPropertiesToolDefinitions } from '../../src/tools/sys-properties.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const ur = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;
const dr = () => mockClient.deleteRecord as ReturnType<typeof vi.fn>;

describe('getSysPropertiesToolDefinitions', () => {
  it('returns exactly 12 tool definitions', () => {
    expect(getSysPropertiesToolDefinitions().length).toBe(12);
  });

  it('all tools have name, description and inputSchema', () => {
    getSysPropertiesToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeSysPropertiesToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeSysPropertiesToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('get_system_property', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'get_system_property', {})).rejects.toThrow('name is required');
  });

  it('returns found:false when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    const result = await executeSysPropertiesToolCall(mockClient, 'get_system_property', { name: 'glide.smtp.host' });
    expect(result).toEqual({ found: false, name: 'glide.smtp.host' });
  });

  it('returns the property when found', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'glide.smtp.host', value: 'smtp.example.com', type: 'string' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'get_system_property', { name: 'glide.smtp.host' });
    expect(result.found).toBe(true);
    expect(result.value).toBe('smtp.example.com');
  });

  it('masks a sensitive property value', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'glide.email.smtp.password', value: 'secretpw', type: 'password2' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'get_system_property', { name: 'glide.email.smtp.password' });
    expect(result.value).toBe('[MASKED]');
  });

  it('strips unsafe characters from the property name before querying', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSysPropertiesToolCall(mockClient, 'get_system_property', { name: 'glide.smtp.host^active=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'name=glide.smtp.hostactivetrue' }));
  });
});

describe('set_system_property', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeSysPropertiesToolCall(mockClient, 'set_system_property', { name: 'x', value: 'y' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name and value', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'set_system_property', {})).rejects.toThrow('name and value are required');
  });

  it('updates when the property already exists', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'p1', name: 'x', value: 'old' }] });
    ur().mockResolvedValue({ sys_id: 'p1' });
    const result = await executeSysPropertiesToolCall(mockClient, 'set_system_property', { name: 'x', value: 'new' });
    expect(ur()).toHaveBeenCalledWith('sys_properties', 'p1', { value: 'new' });
    expect(result.action).toBe('updated');
    expect(result.previous_value).toBe('old');
  });

  it('creates when the property does not exist', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    cr().mockResolvedValue({ sys_id: 'p1' });
    const result = await executeSysPropertiesToolCall(mockClient, 'set_system_property', { name: 'x', value: 'new' });
    expect(cr()).toHaveBeenCalledWith('sys_properties', { name: 'x', value: 'new' });
    expect(result.action).toBe('created');
  });
});

describe('list_system_properties', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines category and type filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSysPropertiesToolCall(mockClient, 'list_system_properties', { category: 'email', type: 'string' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_properties', query: 'category=email^type=string' }));
  });

  it('strips unsafe characters from category and type', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSysPropertiesToolCall(mockClient, 'list_system_properties', { category: 'email^active=true', type: 'string^ORactive=false' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'category=emailactivetrue^type=stringORactivefalse' }));
  });

  it('masks sensitive properties in the result list', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'glide.some.secret_key', value: 'topsecret' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'list_system_properties', {});
    expect(result.properties[0].value).toBe('[MASKED]');
  });
});

describe('delete_system_property', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeSysPropertiesToolCall(mockClient, 'delete_system_property', { name: 'x' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'delete_system_property', {})).rejects.toThrow('name is required');
  });

  it('reports not found when the property does not exist', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    const result = await executeSysPropertiesToolCall(mockClient, 'delete_system_property', { name: 'x' });
    expect(result).toEqual({ deleted: false, name: 'x', message: 'Property not found' });
    expect(dr()).not.toHaveBeenCalled();
  });

  it('deletes the property when found', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'p1', name: 'x', value: 'old' }] });
    dr().mockResolvedValue(undefined);
    const result = await executeSysPropertiesToolCall(mockClient, 'delete_system_property', { name: 'x' });
    expect(dr()).toHaveBeenCalledWith('sys_properties', 'p1');
    expect(result).toEqual({ deleted: true, name: 'x', previous_value: 'old' });
  });
});

describe('search_system_properties', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires search', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'search_system_properties', {})).rejects.toThrow('search is required');
  });

  it('searches name/value/description', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSysPropertiesToolCall(mockClient, 'search_system_properties', { search: 'smtp' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_properties',
      query: 'nameLIKEsmtp^ORvalueLIKEsmtp^ORdescriptionLIKEsmtp',
    }));
  });

  it('strips ^ from the search term', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSysPropertiesToolCall(mockClient, 'search_system_properties', { search: 'smtp^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'nameLIKEsmtpORactive=true^ORvalueLIKEsmtpORactive=true^ORdescriptionLIKEsmtpORactive=true' }));
  });
});

describe('bulk_get_properties', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires a non-empty names array', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'bulk_get_properties', {})).rejects.toThrow('names array is required');
    await expect(executeSysPropertiesToolCall(mockClient, 'bulk_get_properties', { names: [] })).rejects.toThrow('names array is required');
  });

  it('returns found properties and reports not_found', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'a', value: '1' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'bulk_get_properties', { names: ['a', 'b'] });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'nameINa,b' }));
    expect(result.properties).toEqual({ a: '1' });
    expect(result.not_found).toEqual(['b']);
  });
});

describe('bulk_set_properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeSysPropertiesToolCall(mockClient, 'bulk_set_properties', { properties: [{ name: 'a', value: '1' }] }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires a properties array', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'bulk_set_properties', {})).rejects.toThrow('properties array is required');
  });

  it('creates and updates as appropriate per entry', async () => {
    qr()
      .mockResolvedValueOnce({ count: 0, records: [] })
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'p2', name: 'b', value: 'old' }] });
    cr().mockResolvedValue({ sys_id: 'new1' });
    ur().mockResolvedValue({ sys_id: 'p2' });
    const result = await executeSysPropertiesToolCall(mockClient, 'bulk_set_properties', {
      properties: [{ name: 'a', value: '1' }, { name: 'b', value: '2' }],
    });
    expect(cr()).toHaveBeenCalledWith('sys_properties', { name: 'a', value: '1' });
    expect(ur()).toHaveBeenCalledWith('sys_properties', 'p2', { value: '2' });
    expect(result.processed).toBe(2);
  });
});

describe('export_properties', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by category and masks sensitive values', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'glide.some.secret', value: 'shh' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'export_properties', { category: 'security' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'category=security' }));
    expect(result.properties['glide.some.secret']).toBe('[MASKED]');
  });

  it('strips unsafe characters from category', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSysPropertiesToolCall(mockClient, 'export_properties', { category: 'security^active=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'category=securityactivetrue' }));
  });
});

describe('import_properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires a properties object', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'import_properties', {})).rejects.toThrow('properties object is required');
  });

  it('is blocked without WRITE_ENABLED unless dry_run', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeSysPropertiesToolCall(mockClient, 'import_properties', { properties: { a: '1' } }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('dry_run does not require WRITE_ENABLED and makes no writes', async () => {
    delete process.env.WRITE_ENABLED;
    qr().mockResolvedValue({ count: 0, records: [] });
    const result = await executeSysPropertiesToolCall(mockClient, 'import_properties', { properties: { a: '1' }, dry_run: true });
    expect(cr()).not.toHaveBeenCalled();
    expect(result.dry_run).toBe(true);
    expect(result.changes[0]).toEqual({ name: 'a', action: 'create', value: '1' });
  });

  it('creates and updates per key when not dry_run', async () => {
    qr()
      .mockResolvedValueOnce({ count: 0, records: [] })
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: 'p2', name: 'b', value: 'old' }] });
    cr().mockResolvedValue({ sys_id: 'new1' });
    ur().mockResolvedValue({ sys_id: 'p2' });
    const result = await executeSysPropertiesToolCall(mockClient, 'import_properties', { properties: { a: '1', b: '2' } });
    expect(cr()).toHaveBeenCalledWith('sys_properties', { name: 'a', value: '1' });
    expect(ur()).toHaveBeenCalledWith('sys_properties', 'p2', { value: '2' });
    expect(result.count).toBe(2);
  });
});

describe('validate_property', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name and value', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'validate_property', {})).rejects.toThrow('name and value are required');
  });

  it('reports exists:false when the property is unknown', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    const result = await executeSysPropertiesToolCall(mockClient, 'validate_property', { name: 'x', value: '1' });
    expect(result.exists).toBe(false);
  });

  it('flags an invalid integer value', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'x', type: 'integer', value: '5' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'validate_property', { name: 'x', value: 'not-a-number' });
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Expected integer');
  });

  it('flags an invalid boolean value', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'x', type: 'boolean', value: 'true' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'validate_property', { name: 'x', value: 'maybe' });
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Expected boolean');
  });

  it('accepts a valid value', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'x', type: 'string', value: 'old' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'validate_property', { name: 'x', value: 'new' });
    expect(result.valid).toBe(true);
  });
});

describe('list_property_categories', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates and sorts categories by count', async () => {
    qr().mockResolvedValue({
      count: 4,
      records: [{ category: 'email' }, { category: 'email' }, { category: 'security' }, { category: '' }],
    });
    const result = await executeSysPropertiesToolCall(mockClient, 'list_property_categories', {});
    expect(result.total_categories).toBe(3);
    expect(result.categories[0]).toEqual({ category: 'email', count: 2 });
  });
});

describe('get_property_history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name', async () => {
    await expect(executeSysPropertiesToolCall(mockClient, 'get_property_history', {})).rejects.toThrow('name is required');
  });

  it('returns audit history for a non-sensitive property', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_created_on: '2026-01-01', oldvalue: 'a', newvalue: 'b' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'get_property_history', { name: 'glide.smtp.host' });
    expect(result.history[0].oldvalue).toBe('a');
  });

  it('masks old/new values for a sensitive property name', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_created_on: '2026-01-01', oldvalue: 'a', newvalue: 'b' }] });
    const result = await executeSysPropertiesToolCall(mockClient, 'get_property_history', { name: 'glide.email.smtp.password' });
    expect(result.history[0].oldvalue).toBe('[MASKED]');
    expect(result.history[0].newvalue).toBe('[MASKED]');
  });

  it('strips unsafe characters from the property name before querying', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSysPropertiesToolCall(mockClient, 'get_property_history', { name: 'glide.smtp.host^active=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: 'tablename=sys_properties^fieldname=value^documentkey.name=glide.smtp.hostactivetrue',
    }));
  });
});
