import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCoreToolCall, getCoreToolDefinitions } from '../../src/tools/core.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';
import { ServiceNowError } from '../../src/utils/errors.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  getTableSchema: vi.fn(),
  getUser: vi.fn(),
  getGroup: vi.fn(),
  searchCmdbCi: vi.fn(),
  getCmdbCi: vi.fn(),
  listRelationships: vi.fn(),
  listDiscoverySchedules: vi.fn(),
  listMidServers: vi.fn(),
  listActiveEvents: vi.fn(),
  cmdbHealthDashboard: vi.fn(),
  serviceMappingSummary: vi.fn(),
  createChangeRequest: vi.fn(),
  naturalLanguageSearch: vi.fn(),
  naturalLanguageUpdate: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getCoreToolDefinitions', () => {
  it('returns 23 core tool definitions', () => {
    const tools = getCoreToolDefinitions();
    expect(tools.length).toBe(23);
  });

  it('all tools have name, description and inputSchema', () => {
    getCoreToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeCoreToolCall – query_records', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns records with summary', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2, records: [{ sys_id: 'a' }, { sys_id: 'b' }] });
    const result = await executeCoreToolCall(mockClient, 'query_records', { table: 'incident' });
    expect(result.count).toBe(2);
    expect(result.summary).toContain('2 record');
  });

  it('throws when table is missing', async () => {
    await expect(executeCoreToolCall(mockClient, 'query_records', {})).rejects.toThrow('Table name is required');
  });
});

describe('executeCoreToolCall – get_record', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns record from client', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'abc', number: 'INC001' });
    const result = await executeCoreToolCall(mockClient, 'get_record', { table: 'incident', sys_id: 'abc' });
    expect(result.sys_id).toBe('abc');
  });

  it('throws when sys_id is missing', async () => {
    await expect(executeCoreToolCall(mockClient, 'get_record', { table: 'incident' })).rejects.toThrow();
  });
});

describe('executeCoreToolCall – create_change_request (moved to change module)', () => {
  it('returns null because create_change_request is now in the change module', async () => {
    const result = await executeCoreToolCall(mockClient, 'create_change_request', { short_description: 'Test change', assignment_group: 'IT Ops' });
    expect(result).toBeNull();
  });
});

describe('executeCoreToolCall – describe_table', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns table schema with sorted fields', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        count: 1,
        // super_class is {value: sys_id, link: ...} in real API; parent_table is not resolved without include_inherited
        records: [{ name: 'incident', label: 'Incident', super_class: { value: 'abc123', link: 'https://example.service-now.com/api/now/table/sys_db_object/abc123' } }],
      })
      .mockResolvedValueOnce({
        count: 2,
        records: [
          { element: 'state', column_label: 'State', internal_type: 'integer', reference: '', mandatory: 'false', unique: 'false', name: 'incident' },
          { element: 'number', column_label: 'Number', internal_type: 'string', reference: '', mandatory: 'false', unique: 'true', name: 'incident' },
        ],
      });

    const result = await executeCoreToolCall(mockClient, 'describe_table', { table: 'incident' });

    expect(result.table).toBe('incident');
    expect(result.label).toBe('Incident');
    // parent_table is NOT resolved when include_inherited is omitted (defaults false)
    expect(result.parent_table).toBeUndefined();
    expect(result.field_count).toBe(2);
    expect(result.fields).toHaveLength(2);
    expect(result.summary).toContain('2 field');
    // Alphabetically sorted: number < state
    expect(result.fields[0].element).toBe('number');
    expect(result.fields[0].unique).toBe(true);
    expect(result.fields[1].element).toBe('state');
  });

  it('throws when table arg is missing', async () => {
    await expect(executeCoreToolCall(mockClient, 'describe_table', {})).rejects.toThrow('table is required');
  });

  it('throws when table not found in sys_db_object', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ count: 0, records: [] });
    await expect(
      executeCoreToolCall(mockClient, 'describe_table', { table: 'nonexistent_table' })
    ).rejects.toThrow('not found in sys_db_object');
  });

  it('resolves reference table name from object reference (value field holds table name)', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        count: 1,
        records: [{ name: 'incident', label: 'Incident', super_class: null }],
      })
      .mockResolvedValueOnce({
        count: 1,
        records: [
          {
            element: 'caller_id',
            column_label: 'Caller',
            // ServiceNow Table API returns {value: 'table_name', link: '...'} for reference fields
            internal_type: { value: 'reference', link: 'https://example.service-now.com/api/now/table/sys_glide_object?name=reference' },
            reference: { value: 'sys_user', link: 'https://example.service-now.com/api/now/table/sys_db_object?name=sys_user' },
            mandatory: 'true',
            unique: 'false',
            name: 'incident',
          },
        ],
      });

    const result = await executeCoreToolCall(mockClient, 'describe_table', { table: 'incident' });

    expect(result.fields[0].reference).toBe('sys_user');
    expect(result.fields[0].mandatory).toBe(true);
    expect(result.parent_table).toBeUndefined();
  });

  it('omits reference key when field has no reference', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 1, records: [{ name: 'incident', label: 'Incident', super_class: null }] })
      .mockResolvedValueOnce({
        count: 1,
        records: [{ element: 'short_description', column_label: 'Short description', internal_type: 'string', reference: '', mandatory: 'false', unique: 'false', name: 'incident' }],
      });

    const result = await executeCoreToolCall(mockClient, 'describe_table', { table: 'incident' });

    expect('reference' in result.fields[0]).toBe(false);
  });

  it('resolves parent table name from super_class sys_id when include_inherited is true', async () => {
    // Bug fix regression test: real API returns {value: sys_id, link: ...}, NOT display_value
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        count: 1,
        records: [{ name: 'incident', label: 'Incident', super_class: { value: 'task-sys-id-001', link: 'https://example.service-now.com/api/now/table/sys_db_object/task-sys-id-001' } }],
      })
      // Second call: resolve sys_id → parent table name
      .mockResolvedValueOnce({ count: 1, records: [{ name: 'task' }] })
      .mockResolvedValueOnce({
        count: 1,
        records: [{ element: 'state', column_label: 'State', internal_type: 'integer', reference: '', mandatory: 'false', unique: 'false', name: 'incident' }],
      })
      .mockResolvedValueOnce({
        count: 1,
        records: [{ element: 'sys_id', column_label: 'Sys ID', internal_type: 'GUID', reference: '', mandatory: 'false', unique: 'false', name: 'task' }],
      });

    const result = await executeCoreToolCall(mockClient, 'describe_table', { table: 'incident', include_inherited: true });

    expect(result.parent_table).toBe('task');
    expect(result.fields).toHaveLength(2);
    expect(result.fields.some((f: any) => f.defined_in === 'task')).toBe(true);
    expect(result.fields.some((f: any) => f.defined_in === 'incident')).toBe(true);
    expect(result.summary).toContain('task');
    // queryRecords called 4 times: sys_db_object(incident) + sys_db_object(parent resolve) + incident dict + task dict
    expect(mockClient.queryRecords).toHaveBeenCalledTimes(4);
  });

  it('does not fetch parent table when include_inherited is false (default)', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 1, records: [{ name: 'incident', label: 'Incident', super_class: { value: 'task-sys-id-001', link: 'https://example.service-now.com/api/now/table/sys_db_object/task-sys-id-001' } }] })
      .mockResolvedValueOnce({ count: 0, records: [] });

    await executeCoreToolCall(mockClient, 'describe_table', { table: 'incident' });

    // queryRecords called 2 times only: sys_db_object + incident dict (no parent resolution)
    expect(mockClient.queryRecords).toHaveBeenCalledTimes(2);
  });
});

describe('executeCoreToolCall – check_table_access', () => {
  beforeEach(() => vi.clearAllMocks());

  // Helper: route queryRecords by table — sys_user / sys_user_has_role for the
  // identity lookup, everything else is a per-table read probe.
  function routeIdentity(readResult: (table: string) => any) {
    (mockClient.queryRecords as any).mockImplementation(async (p: any) => {
      if (p.table === 'sys_user') return { count: 1, records: [{ user_name: 'svc.account' }] };
      if (p.table === 'sys_user_has_role') {
        return { count: 2, records: [{ 'role.name': 'itil' }, { 'role.name': 'sn_vul.read' }] };
      }
      return readResult(p.table);
    });
  }

  it('reports readable + writable for an accessible table', async () => {
    routeIdentity(() => ({ count: 1, records: [{ sys_id: 'x' }] }));
    (mockClient.updateRecord as any).mockRejectedValue(new ServiceNowError('No Record found', 'NOT_FOUND'));

    const r = await executeCoreToolCall(mockClient, 'check_table_access', { tables: ['incident'] });
    expect(r.current_user).toBe('svc.account');
    expect(r.current_roles).toEqual(['itil', 'sn_vul.read']);
    expect(r.results[0]).toMatchObject({ table: 'incident', readable: true, writable: true });
    expect(r.summary).toContain('1 readable');
  });

  it('marks a table writable=false when the write probe is denied (403)', async () => {
    routeIdentity(() => ({ count: 1, records: [{ sys_id: 'x' }] }));
    (mockClient.updateRecord as any).mockRejectedValue(new ServiceNowError('not authorized', 'INSUFFICIENT_PRIVILEGES'));

    const r = await executeCoreToolCall(mockClient, 'check_table_access', { tables: ['sys_audit'] });
    expect(r.results[0]).toMatchObject({ readable: true, writable: false });
  });

  it('marks readable=false when the read probe is denied (403)', async () => {
    routeIdentity(() => { throw new ServiceNowError('not authorized', 'INSUFFICIENT_PRIVILEGES'); });
    (mockClient.updateRecord as any).mockRejectedValue(new ServiceNowError('not authorized', 'INSUFFICIENT_PRIVILEGES'));

    const r = await executeCoreToolCall(mockClient, 'check_table_access', { tables: ['sys_user_password'] });
    expect(r.results[0]).toMatchObject({ readable: false, writable: false });
  });

  it('flags an invalid table and skips the write probe', async () => {
    routeIdentity(() => { throw new ServiceNowError('Invalid table nope', 'INVALID_REQUEST'); });

    const r = await executeCoreToolCall(mockClient, 'check_table_access', { tables: ['nope'] });
    expect(r.results[0].readable).toBe(false);
    expect(r.results[0].writable).toBeNull();
    expect(r.results[0].error).toContain('Invalid table');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  it('skips write probing entirely when check_write is false', async () => {
    routeIdentity(() => ({ count: 1, records: [{ sys_id: 'x' }] }));

    const r = await executeCoreToolCall(mockClient, 'check_table_access', { tables: ['incident'], check_write: false });
    expect(r.results[0].writable).toBeNull();
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  it('still returns results when role resolution fails', async () => {
    (mockClient.queryRecords as any).mockImplementation(async (p: any) => {
      if (p.table === 'sys_user') throw new ServiceNowError('denied', 'INSUFFICIENT_PRIVILEGES');
      return { count: 1, records: [{ sys_id: 'x' }] };
    });
    (mockClient.updateRecord as any).mockRejectedValue(new ServiceNowError('No Record found', 'NOT_FOUND'));

    const r = await executeCoreToolCall(mockClient, 'check_table_access', { tables: ['incident'] });
    expect(r.roles_error).toBeTruthy();
    expect(r.current_roles).toEqual([]);
    expect(r.results[0].readable).toBe(true);
  });

  it('rejects an empty or oversized tables list', async () => {
    await expect(executeCoreToolCall(mockClient, 'check_table_access', { tables: [] }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(executeCoreToolCall(mockClient, 'check_table_access', { tables: Array(21).fill('incident') }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});

describe('executeCoreToolCall – unknown tool', () => {
  it('returns null for unknown tool names', async () => {
    const result = await executeCoreToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
