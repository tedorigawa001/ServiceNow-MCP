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

describe('executeCoreToolCall – get_table_schema', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires table', async () => {
    await expect(executeCoreToolCall(mockClient, 'get_table_schema', {})).rejects.toThrow('Table name is required');
  });

  it('delegates to client.getTableSchema', async () => {
    (mockClient.getTableSchema as ReturnType<typeof vi.fn>).mockResolvedValue({ fields: [] });
    const result = await executeCoreToolCall(mockClient, 'get_table_schema', { table: 'incident' });
    expect(mockClient.getTableSchema).toHaveBeenCalledWith('incident');
    expect(result).toEqual({ fields: [] });
  });
});

describe('executeCoreToolCall – get_user', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires user_identifier', async () => {
    await expect(executeCoreToolCall(mockClient, 'get_user', {})).rejects.toThrow('user_identifier is required');
  });

  it('delegates to client.getUser', async () => {
    (mockClient.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ user_name: 'jdoe' });
    const result = await executeCoreToolCall(mockClient, 'get_user', { user_identifier: 'jdoe@example.com' });
    expect(mockClient.getUser).toHaveBeenCalledWith('jdoe@example.com');
    expect(result.user_name).toBe('jdoe');
  });
});

describe('executeCoreToolCall – get_group', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires group_identifier', async () => {
    await expect(executeCoreToolCall(mockClient, 'get_group', {})).rejects.toThrow('group_identifier is required');
  });

  it('delegates to client.getGroup', async () => {
    (mockClient.getGroup as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'IT Ops' });
    const result = await executeCoreToolCall(mockClient, 'get_group', { group_identifier: 'IT Ops' });
    expect(mockClient.getGroup).toHaveBeenCalledWith('IT Ops');
    expect(result.name).toBe('IT Ops');
  });
});

describe('executeCoreToolCall – search_cmdb_ci', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to client.searchCmdbCi with query and limit', async () => {
    (mockClient.searchCmdbCi as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [] });
    await executeCoreToolCall(mockClient, 'search_cmdb_ci', { query: 'sys_class_name=cmdb_ci_server', limit: 5 });
    expect(mockClient.searchCmdbCi).toHaveBeenCalledWith('sys_class_name=cmdb_ci_server', 5);
  });
});

describe('executeCoreToolCall – get_cmdb_ci', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires ci_sys_id', async () => {
    await expect(executeCoreToolCall(mockClient, 'get_cmdb_ci', {})).rejects.toThrow('ci_sys_id is required');
  });

  it('delegates to client.getCmdbCi', async () => {
    (mockClient.getCmdbCi as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'ci1', name: 'srv01' });
    const result = await executeCoreToolCall(mockClient, 'get_cmdb_ci', { ci_sys_id: 'ci1' });
    expect(mockClient.getCmdbCi).toHaveBeenCalledWith('ci1', undefined);
    expect(result.name).toBe('srv01');
  });
});

describe('executeCoreToolCall – list_relationships', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires ci_sys_id', async () => {
    await expect(executeCoreToolCall(mockClient, 'list_relationships', {})).rejects.toThrow('ci_sys_id is required');
  });

  it('delegates to client.listRelationships', async () => {
    (mockClient.listRelationships as ReturnType<typeof vi.fn>).mockResolvedValue({ parents: [], children: [] });
    const result = await executeCoreToolCall(mockClient, 'list_relationships', { ci_sys_id: 'ci1' });
    expect(mockClient.listRelationships).toHaveBeenCalledWith('ci1');
    expect(result).toEqual({ parents: [], children: [] });
  });
});

describe('executeCoreToolCall – list_discovery_schedules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to client.listDiscoverySchedules with active_only', async () => {
    (mockClient.listDiscoverySchedules as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await executeCoreToolCall(mockClient, 'list_discovery_schedules', { active_only: true });
    expect(mockClient.listDiscoverySchedules).toHaveBeenCalledWith(true);
  });
});

describe('executeCoreToolCall – list_mid_servers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to client.listMidServers with active_only', async () => {
    (mockClient.listMidServers as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await executeCoreToolCall(mockClient, 'list_mid_servers', { active_only: false });
    expect(mockClient.listMidServers).toHaveBeenCalledWith(false);
  });
});

describe('executeCoreToolCall – list_active_events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to client.listActiveEvents with query and limit', async () => {
    (mockClient.listActiveEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await executeCoreToolCall(mockClient, 'list_active_events', { query: 'severity=1', limit: 20 });
    expect(mockClient.listActiveEvents).toHaveBeenCalledWith('severity=1', 20);
  });
});

describe('executeCoreToolCall – cmdb_health_dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to client.cmdbHealthDashboard', async () => {
    (mockClient.cmdbHealthDashboard as ReturnType<typeof vi.fn>).mockResolvedValue({ completeness_pct: 87 });
    const result = await executeCoreToolCall(mockClient, 'cmdb_health_dashboard', {});
    expect(result.completeness_pct).toBe(87);
  });
});

describe('executeCoreToolCall – service_mapping_summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires service_sys_id', async () => {
    await expect(executeCoreToolCall(mockClient, 'service_mapping_summary', {})).rejects.toThrow('service_sys_id is required');
  });

  it('delegates to client.serviceMappingSummary', async () => {
    (mockClient.serviceMappingSummary as ReturnType<typeof vi.fn>).mockResolvedValue({ dependencies: [] });
    const result = await executeCoreToolCall(mockClient, 'service_mapping_summary', { service_sys_id: 'svc1' });
    expect(mockClient.serviceMappingSummary).toHaveBeenCalledWith('svc1');
    expect(result).toEqual({ dependencies: [] });
  });
});

describe('executeCoreToolCall – natural_language_search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to client.naturalLanguageSearch', async () => {
    (mockClient.naturalLanguageSearch as ReturnType<typeof vi.fn>).mockResolvedValue({ results: [] });
    await executeCoreToolCall(mockClient, 'natural_language_search', { query: 'open incidents assigned to me', limit: 10 });
    expect(mockClient.naturalLanguageSearch).toHaveBeenCalledWith('open incidents assigned to me', 10);
  });
});

describe('executeCoreToolCall – natural_language_update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(
      executeCoreToolCall(mockClient, 'natural_language_update', { instruction: 'close it', table: 'incident' })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('delegates to client.naturalLanguageUpdate when write is enabled', async () => {
    (mockClient.naturalLanguageUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({ action: 'updated' });
    const result = await executeCoreToolCall(mockClient, 'natural_language_update', { instruction: 'close it', table: 'incident' });
    expect(mockClient.naturalLanguageUpdate).toHaveBeenCalledWith('close it', 'incident');
    expect(result.action).toBe('updated');
  });
});

describe('executeCoreToolCall – cmdb_impact_analysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires ci_sys_id', async () => {
    await expect(executeCoreToolCall(mockClient, 'cmdb_impact_analysis', {})).rejects.toThrow('ci_sys_id is required');
  });

  it('rejects a ci_sys_id that is not a 32-character hex string', async () => {
    await expect(
      executeCoreToolCall(mockClient, 'cmdb_impact_analysis', { ci_sys_id: 'not-a-real-sys-id' })
    ).rejects.toThrow('must be a 32-character hex string');
  });

  it('traverses downstream relationships up to the given depth', async () => {
    const rootId = 'a'.repeat(32);
    const childId = 'b'.repeat(32);
    const qr = mockClient.queryRecords as ReturnType<typeof vi.fn>;
    qr.mockImplementation(async ({ query }: { query: string }) => {
      if (query === `parent=${rootId}`) {
        return { count: 1, records: [{ sys_id: 'rel1', child: childId, type: 'Runs on::Runs', parent: rootId }] };
      }
      return { count: 0, records: [] };
    });

    const result = await executeCoreToolCall(mockClient, 'cmdb_impact_analysis', { ci_sys_id: rootId, depth: 2 });

    expect(result.total_impacted).toBe(1);
    expect(result.impact_analysis[0].ci_sys_id).toBe(rootId);
    expect(result.impact_analysis[0].downstream).toHaveLength(1);
  });

  it('does not revisit an already-visited CI (cycle guard)', async () => {
    const rootId = 'a'.repeat(32);
    const qr = mockClient.queryRecords as ReturnType<typeof vi.fn>;
    // root points back to itself
    qr.mockResolvedValue({ count: 1, records: [{ sys_id: 'rel1', child: rootId, type: 'Runs on::Runs', parent: rootId }] });

    const result = await executeCoreToolCall(mockClient, 'cmdb_impact_analysis', { ci_sys_id: rootId, depth: 3 });

    expect(result.total_impacted).toBe(0);
  });
});

describe('executeCoreToolCall – unknown tool', () => {
  it('returns null for unknown tool names', async () => {
    const result = await executeCoreToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
