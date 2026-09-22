import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeEventManagementToolCall, getEventManagementToolDefinitions } from '../../src/tools/event-management.js';

const mockClient: any = {
  queryRecords: vi.fn(),
  updateRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
};

const ALERT = 'a'.repeat(32);
const alertRow = (extra: Record<string, unknown> = {}) => ({ sys_id: ALERT, number: 'Alert0010006', state: 'Open', acknowledged: 'false', severity: '2', ...extra });
const records = (rows: Record<string, unknown>[]) => ({ count: rows.length, records: rows });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WRITE_ENABLED;
});

describe('event-management tool definitions', () => {
  it('exposes the six alert tools with the write ones marked', () => {
    const defs = getEventManagementToolDefinitions();
    expect(defs.map((d) => d.name)).toEqual(['list_alerts', 'get_alert', 'get_alert_summary', 'acknowledge_alert', 'close_alert', 'update_alert']);
    for (const name of ['acknowledge_alert', 'close_alert', 'update_alert']) {
      expect(defs.find((d) => d.name === name)?.description).toContain('[Write]');
    }
    const update = defs.find((d) => d.name === 'update_alert')!;
    expect(Object.keys(update.inputSchema.properties.fields.properties).sort()).toEqual(['assigned_to', 'assignment_group', 'description', 'kb', 'maintenance', 'short_description', 'work_notes']);
  });
});

describe('list_alerts', () => {
  it('defaults to not-Closed, most severe first, with the operational columns', async () => {
    mockClient.queryRecords.mockResolvedValue(records([alertRow({ severity: '1' })]));
    const result = await executeEventManagementToolCall(mockClient, 'list_alerts', {});
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'em_alert', query: 'state!=Closed^ORDERBYseverity^ORDERBYDESClast_remote_time', limit: 25,
      fields: expect.stringContaining('acknowledged'),
    }));
    expect(result.alerts[0].severity_label).toBe('Critical');
  });

  it('builds every filter on real em_alert columns', async () => {
    mockClient.queryRecords.mockResolvedValue(records([]));
    await executeEventManagementToolCall(mockClient, 'list_alerts', {
      severity: '1,2', state: 'Open', acknowledged: false, cmdb_ci: 'ci1', source: 'Netcool', assignment_group: 'g1', unassigned: true, without_incident: true, query: 'short_descriptionLIKEdisk', limit: 500,
    });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      query: 'state=Open^severityIN1,2^acknowledged=false^cmdb_ci=ci1^source=Netcool^assignment_group=g1^assignment_groupISEMPTY^assigned_toISEMPTY^incidentISEMPTY^short_descriptionLIKEdisk^ORDERBYseverity^ORDERBYDESClast_remote_time',
      limit: 200,
    }));
  });

  it('accepts "all" to drop the state filter and rejects unknown states and severities', async () => {
    mockClient.queryRecords.mockResolvedValue(records([]));
    await executeEventManagementToolCall(mockClient, 'list_alerts', { state: 'all' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'ORDERBYseverity^ORDERBYDESClast_remote_time' }));
    await expect(executeEventManagementToolCall(mockClient, 'list_alerts', { state: 'Bogus' })).rejects.toThrow('state must be one of');
    await expect(executeEventManagementToolCall(mockClient, 'list_alerts', { severity: '9' })).rejects.toThrow('severity values must be 0-5');
  });
});

describe('get_alert', () => {
  it('resolves by number, then attaches history, related tasks and child alerts', async () => {
    mockClient.queryRecords
      .mockResolvedValueOnce(records([alertRow()]))
      .mockResolvedValueOnce(records([{ sys_id: 'h1', state: 'Open' }]))
      .mockResolvedValueOnce(records([{ sys_id: 'r1', incident: 'inc1' }]))
      .mockResolvedValueOnce(records([{ sys_id: 'c1', number: 'Alert0010007' }]));
    const result = await executeEventManagementToolCall(mockClient, 'get_alert', { number_or_sysid: 'Alert0010006', history_limit: 5 });
    expect(mockClient.queryRecords.mock.calls[0][0]).toMatchObject({ table: 'em_alert', query: 'number=Alert0010006' });
    expect(mockClient.queryRecords.mock.calls[1][0]).toMatchObject({ table: 'em_alert_history', query: `alert_sys_id=${ALERT}^ORDERBYDESCsys_created_on`, limit: 5 });
    expect(mockClient.queryRecords.mock.calls[2][0]).toMatchObject({ table: 'em_alert_related_task', query: `alert=${ALERT}` });
    expect(mockClient.queryRecords.mock.calls[3][0]).toMatchObject({ table: 'em_alert', query: `parent=${ALERT}` });
    expect(result.severity_label).toBe('Major');
    expect(result.history).toHaveLength(1);
    expect(result.related_tasks).toHaveLength(1);
    expect(result.child_alerts).toHaveLength(1);
  });

  it('resolves a sys_id directly and reports NOT_FOUND', async () => {
    mockClient.queryRecords.mockResolvedValueOnce(records([]));
    await expect(executeEventManagementToolCall(mockClient, 'get_alert', { number_or_sysid: ALERT })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockClient.queryRecords.mock.calls[0][0]).toMatchObject({ query: `sys_id=${ALERT}` });
  });
});

describe('get_alert_summary', () => {
  it('aggregates open alerts by severity, state, acknowledgement and source', async () => {
    const agg = (field: string, rows: Array<[string, number]>) => rows.map(([value, count]) => ({ stats: { count: String(count) }, groupby_fields: [{ field, value }] }));
    mockClient.runAggregateQuery
      .mockResolvedValueOnce(agg('severity', [['1', 8], ['2', 10]]))
      .mockResolvedValueOnce(agg('state', [['Open', 18]]))
      .mockResolvedValueOnce(agg('acknowledged', [['true', 2], ['false', 16]]))
      .mockResolvedValueOnce(agg('source', [['Netcool', 9], ['DEMO', 4], ['SNMP', 5]]));
    const result = await executeEventManagementToolCall(mockClient, 'get_alert_summary', { top_sources: 2 });
    expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('em_alert', 'severity', 'COUNT', 'state!=Closed');
    expect(result).toEqual({
      scope: 'alerts not Closed', total: 18,
      by_severity: { '1 Critical': 8, '2 Major': 10 }, by_state: { Open: 18 },
      acknowledged: 2, unacknowledged: 16,
      top_sources: [{ source: 'Netcool', count: 9 }, { source: 'SNMP', count: 5 }],
    });
  });

  it('includes Closed alerts on request', async () => {
    mockClient.runAggregateQuery.mockResolvedValue([]);
    const result = await executeEventManagementToolCall(mockClient, 'get_alert_summary', { include_closed: true });
    expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('em_alert', 'state', 'COUNT', '');
    expect(result.scope).toBe('all alerts');
  });
});

describe('acknowledge_alert', () => {
  it('is blocked without WRITE_ENABLED', async () => {
    await expect(executeEventManagementToolCall(mockClient, 'acknowledge_alert', { number_or_sysid: 'Alert0010006' })).rejects.toThrow('Write operations are disabled');
  });

  it('sets acknowledged=true like the product action, with an optional work note', async () => {
    process.env.WRITE_ENABLED = 'true';
    mockClient.queryRecords.mockResolvedValueOnce(records([alertRow()]));
    mockClient.updateRecord.mockResolvedValue(alertRow({ acknowledged: 'true' }));
    const result = await executeEventManagementToolCall(mockClient, 'acknowledge_alert', { number_or_sysid: 'Alert0010006', work_notes: 'on it' });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('em_alert', ALERT, { acknowledged: true, work_notes: 'on it' });
    expect(result.action).toBe('acknowledged');
  });

  it('does not re-write an already acknowledged alert', async () => {
    process.env.WRITE_ENABLED = 'true';
    mockClient.queryRecords.mockResolvedValueOnce(records([alertRow({ acknowledged: 'true' })]));
    const result = await executeEventManagementToolCall(mockClient, 'acknowledge_alert', { number_or_sysid: ALERT });
    expect(result.action).toBe('already_acknowledged');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('close_alert', () => {
  it('sets state=Closed and refuses an alert that is already Closed', async () => {
    process.env.WRITE_ENABLED = 'true';
    mockClient.queryRecords.mockResolvedValueOnce(records([alertRow()]));
    mockClient.updateRecord.mockResolvedValue(alertRow({ state: 'Closed', acknowledged: 'true' }));
    const result = await executeEventManagementToolCall(mockClient, 'close_alert', { number_or_sysid: 'Alert0010006', work_notes: 'resolved' });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('em_alert', ALERT, { state: 'Closed', work_notes: 'resolved' });
    expect(result).toMatchObject({ action: 'closed', state: 'Closed' });

    mockClient.queryRecords.mockResolvedValueOnce(records([alertRow({ state: 'Closed' })]));
    await expect(executeEventManagementToolCall(mockClient, 'close_alert', { number_or_sysid: 'Alert0010006' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('update_alert', () => {
  it('updates only the allowed operator fields and rejects state changes', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(executeEventManagementToolCall(mockClient, 'update_alert', { number_or_sysid: ALERT, fields: { state: 'Closed' } })).rejects.toThrow('cannot be updated here: state');
    await expect(executeEventManagementToolCall(mockClient, 'update_alert', { number_or_sysid: ALERT, fields: {} })).rejects.toThrow('non-empty object');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();

    mockClient.queryRecords.mockResolvedValueOnce(records([alertRow()]));
    mockClient.updateRecord.mockResolvedValue(alertRow({ assignment_group: 'g1', maintenance: 'true' }));
    const result = await executeEventManagementToolCall(mockClient, 'update_alert', { number_or_sysid: ALERT, fields: { assignment_group: 'g1', maintenance: true, work_notes: 'note' } });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('em_alert', ALERT, { assignment_group: 'g1', maintenance: true, work_notes: 'note' });
    expect(result).toMatchObject({ action: 'updated', updated_fields: ['assignment_group', 'maintenance', 'work_notes'], assignment_group: 'g1', maintenance: 'true' });
    expect(result).not.toHaveProperty('work_notes');
  });
});
