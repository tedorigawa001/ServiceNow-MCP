import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  it('returns 24 core tool definitions', () => {
    const tools = getCoreToolDefinitions();
    expect(tools.length).toBe(24);
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

describe('executeCoreToolCall – get_integration_health', () => {
  beforeEach(() => vi.clearAllMocks());

  const run = (over: Record<string, unknown> = {}) => ({
    number: 'VINTRUN1', source: 'NVD', substate: 'success', state: 'complete',
    start_datetime: '2026-06-22 13:46:00', end_datetime: '2026-06-22 13:47:42',
    vi_created: '77', vi_updated: '76', notes: 'ok', fatal_error_message: '', ...over,
  });

  it('summarizes success/failure counts and last timestamps', async () => {
    (mockClient.queryRecords as any).mockResolvedValue({
      count: 3,
      records: [
        run({ start_datetime: '2026-06-22 10:00:00' }),
        run({ substate: 'failed', fatal_error_message: 'HTTP 503', start_datetime: '2026-06-21 10:00:00' }),
        run({ start_datetime: '2026-06-20 10:00:00' }),
      ],
    });
    const r = await executeCoreToolCall(mockClient, 'get_integration_health', { days: 30 });
    expect(r.summary).toMatchObject({ total_runs: 3, success: 2, failed: 1 });
    expect(r.summary.last_success).toBe('2026-06-22 10:00:00');
    expect(r.summary.last_failure).toBe('2026-06-21 10:00:00');
    expect(r.alerts.some((a: string) => a.includes('1 failed run'))).toBe(true);
    expect(r.recent_runs[0].vi_created).toBe(77); // coerced to number
  });

  it('alerts when the most recent run failed', async () => {
    (mockClient.queryRecords as any).mockResolvedValue({
      count: 1,
      records: [run({ substate: 'failed', fatal_error_message: 'HTTP 429 Too Many Requests' })],
    });
    const r = await executeCoreToolCall(mockClient, 'get_integration_health', {});
    expect(r.alerts.some((a: string) => a.includes('Most recent run failed') && a.includes('429'))).toBe(true);
  });

  it('raises a silent-stall alert when there are no runs in the window', async () => {
    (mockClient.queryRecords as any).mockResolvedValue({ count: 0, records: [] });
    const r = await executeCoreToolCall(mockClient, 'get_integration_health', { days: 14, source: 'Qualys' });
    expect(r.summary.total_runs).toBe(0);
    expect(r.source).toBe('Qualys');
    expect(r.alerts[0]).toMatch(/stalled/);
  });

  it('clamps days to 1..365 and interpolates into the gs.daysAgo() query', async () => {
    (mockClient.queryRecords as any).mockResolvedValue({ count: 0, records: [] });
    await executeCoreToolCall(mockClient, 'get_integration_health', { days: 1000 });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('gs.daysAgo(365)') })
    );

    (mockClient.queryRecords as any).mockClear();
    await executeCoreToolCall(mockClient, 'get_integration_health', {});
    expect(mockClient.queryRecords).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('gs.daysAgo(7)') })
    );
  });

  it('sanitizes the source filter against encoded-query injection', async () => {
    (mockClient.queryRecords as any).mockResolvedValue({ count: 0, records: [] });
    await executeCoreToolCall(mockClient, 'get_integration_health', { source: 'NVD^ORsource=x' });
    const call = (mockClient.queryRecords as any).mock.calls[0][0];
    expect(call.query).toContain('source=NVDORsourcex'); // ^ and = stripped from the value
    expect(call.query).not.toContain('source=NVD^OR');
  });

  it('returns a friendly error when the table is unavailable', async () => {
    (mockClient.queryRecords as any).mockRejectedValue(
      new ServiceNowError('Invalid table sn_vul_integration_run', 'INVALID_REQUEST')
    );
    await expect(executeCoreToolCall(mockClient, 'get_integration_health', {}))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('executeCoreToolCall – run_discovery_scan', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  const ORIGINAL_CMDB = process.env.CMDB_WRITE_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.CMDB_WRITE_ENABLED = 'true';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
    if (ORIGINAL_CMDB === undefined) delete process.env.CMDB_WRITE_ENABLED;
    else process.env.CMDB_WRITE_ENABLED = ORIGINAL_CMDB;
  });

  it('triggers by flipping the schedule to run once (never inserts discovery_status)', async () => {
    const ur = mockClient.updateRecord as ReturnType<typeof vi.fn>;
    const qr = mockClient.queryRecords as ReturnType<typeof vi.fn>;
    ur.mockResolvedValue({ sys_id: 'sched1' });
    qr.mockResolvedValue({ count: 1, records: [{ sys_id: 'r1' }] });
    const result = await executeCoreToolCall(mockClient, 'run_discovery_scan', {
      schedule_id: 'sched1',
      mid_server: 'mid1',
    });
    expect(ur).toHaveBeenCalledWith('discovery_schedule', 'sched1', expect.objectContaining({
      run_type: 'once',
      run_start: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
      mid_select_method: 'specific_mid',
      mid_server: 'mid1',
    }));
    expect(result.action).toBe('triggered');
    expect(result.run_start_utc).toBeTruthy();
    expect(result.active_range_count).toBe(1);
    expect(result.warning).toBeUndefined();
  });

  it('warns when the schedule has no active range linked via the schedule field', async () => {
    const ur = mockClient.updateRecord as ReturnType<typeof vi.fn>;
    const qr = mockClient.queryRecords as ReturnType<typeof vi.fn>;
    ur.mockResolvedValue({ sys_id: 'sched1' });
    qr.mockResolvedValue({ count: 0, records: [] });
    const result = await executeCoreToolCall(mockClient, 'run_discovery_scan', { schedule_id: 'sched1' });
    expect(qr).toHaveBeenCalledWith(expect.objectContaining({
      table: 'discovery_range_item',
      query: 'schedule=sched1^active=true',
    }));
    expect(result.warning).toContain('abort silently');
  });

  it('requires schedule_id', async () => {
    await expect(executeCoreToolCall(mockClient, 'run_discovery_scan', {})).rejects.toThrow('schedule_id');
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(
      executeCoreToolCall(mockClient, 'run_discovery_scan', { schedule_id: 's1' })
    ).rejects.toThrow('Write operations are disabled');
  });
});

describe('executeCoreToolCall – unknown tool', () => {
  it('returns null for unknown tool names', async () => {
    const result = await executeCoreToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
