import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { executeReportingToolCall, getReportingToolDefinitions } from '../../src/tools/reporting.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
  callApiGet: vi.fn(),
} as unknown as ServiceNowClient;

describe('getReportingToolDefinitions', () => {
  it('returns definitions for all reporting tools', () => {
    expect(getReportingToolDefinitions().length).toBeGreaterThanOrEqual(10);
  });
});

describe('executeReportingToolCall – list_reports', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all reports with no filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 5, records: [{}, {}, {}, {}, {}] });
    const result = await executeReportingToolCall(mockClient, 'list_reports', {});
    expect(result.count).toBe(5);
    expect(result.reports).toHaveLength(5);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_report' }));
  });

  it('applies search filter to query', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{}] });
    await executeReportingToolCall(mockClient, 'list_reports', { search: 'Incident' });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.query).toContain('Incident');
  });
});

describe('executeReportingToolCall – get_report', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when sys_id_or_name is missing', async () => {
    await expect(
      executeReportingToolCall(mockClient, 'get_report', {})
    ).rejects.toThrow('sys_id_or_name is required');
  });

  it('fetches by sys_id directly', async () => {
    const sysId = 'd'.repeat(32);
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: sysId, title: 'P1 Incidents' });
    const result = await executeReportingToolCall(mockClient, 'get_report', { sys_id_or_name: sysId });
    expect(result.title).toBe('P1 Incidents');
  });

  it('throws NOT_FOUND when report is missing', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeReportingToolCall(mockClient, 'get_report', { sys_id_or_name: 'Nonexistent Report' })
    ).rejects.toThrow('Report not found');
  });
});

describe('executeReportingToolCall – run_aggregate_query', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when table or group_by is missing', async () => {
    await expect(
      executeReportingToolCall(mockClient, 'run_aggregate_query', { table: 'incident' })
    ).rejects.toThrow('table and group_by are required');
  });

  it('runs COUNT aggregate by default', async () => {
    (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockResolvedValue([{ priority: '1', count: 5 }]);
    const result = await executeReportingToolCall(mockClient, 'run_aggregate_query', {
      table: 'incident',
      group_by: 'priority',
    });
    expect(result.aggregate).toBe('COUNT');
    expect(result.results).toHaveLength(1);
    expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('incident', 'priority', 'COUNT', undefined);
  });

  it('passes custom aggregate and query', async () => {
    (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await executeReportingToolCall(mockClient, 'run_aggregate_query', {
      table: 'incident',
      group_by: 'assignment_group',
      aggregate: 'SUM',
      query: 'state=1',
    });
    expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('incident', 'assignment_group', 'SUM', 'state=1');
  });
});

describe('executeReportingToolCall – get_performance_analytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when widget_sys_id is missing', async () => {
    await expect(
      executeReportingToolCall(mockClient, 'get_performance_analytics', {})
    ).rejects.toThrow('widget_sys_id is required');
  });

  it('calls callApiGet (GET) — not callNowAssist (POST)', async () => {
    const widgetId = 'widget123';
    (mockClient.callApiGet as ReturnType<typeof vi.fn>).mockResolvedValue({ result: { value: 42 } });
    const result = await executeReportingToolCall(mockClient, 'get_performance_analytics', {
      widget_sys_id: widgetId,
    });
    expect(result.widget_sys_id).toBe(widgetId);
    expect(result.data).toEqual({ result: { value: 42 } });
    expect(mockClient.callApiGet).toHaveBeenCalledWith(`/api/now/pa/widget/${widgetId}`);
  });
});

describe('executeReportingToolCall – export_report_data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when table is missing', async () => {
    await expect(
      executeReportingToolCall(mockClient, 'export_report_data', {})
    ).rejects.toThrow('table is required');
  });

  it('caps limit at 1000', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1000, records: [] });
    await executeReportingToolCall(mockClient, 'export_report_data', { table: 'incident', limit: 5000 });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.limit).toBe(1000);
  });

  it('returns exported_at timestamp', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2, records: [{}, {}] });
    const result = await executeReportingToolCall(mockClient, 'export_report_data', { table: 'incident' });
    expect(result.exported_at).toBeTruthy();
    expect(result.count).toBe(2);
  });
});

describe('executeReportingToolCall – get_sys_log', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries syslog table', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 10, records: [] });
    const result = await executeReportingToolCall(mockClient, 'get_sys_log', {});
    expect(result.count).toBe(10);
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'syslog' }));
  });
});

describe('executeReportingToolCall – list_scheduled_jobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries sysauto with active=true by default', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 4, records: [] });
    const result = await executeReportingToolCall(mockClient, 'list_scheduled_jobs', {});
    expect(result.count).toBe(4);
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.table).toBe('sysauto');
    expect(call.query).toContain('active=true');
  });
});

describe('executeReportingToolCall – scheduled script writes', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('requires SCRIPTING_ENABLED for scheduled script creation', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(executeReportingToolCall(mockClient, 'create_scheduled_job', {
      name: 'job', script: 'gs.info(\"x\")', run_type: 'daily',
    })).rejects.toMatchObject({ code: 'SCRIPTING_NOT_ENABLED' });
  });

  it('updates scheduled job fields from the allowlist', async () => {
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'job1' });

    const result = await executeReportingToolCall(mockClient, 'update_scheduled_job', {
      sys_id: 'job1',
      fields: { name: 'Daily cleanup', script: 'gs.info("cleanup")', active: true },
    });

    expect(result.summary).toContain('job1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sysauto', 'job1', {
      name: 'Daily cleanup',
      script: 'gs.info("cleanup")',
      active: true,
    });
  });

  it('rejects undeclared scheduled job update fields', async () => {
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';

    await expect(
      executeReportingToolCall(mockClient, 'update_scheduled_job', {
        sys_id: 'job1',
        fields: { name: 'Daily cleanup', sys_scope: 'global', sys_domain: 'global' },
      })
    ).rejects.toThrow('Scheduled job fields cannot be updated: sys_scope, sys_domain');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('executeReportingToolCall – create_report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('throws when required fields are missing', async () => {
    await expect(
      executeReportingToolCall(mockClient, 'create_report', { title: 'My Report' })
    ).rejects.toThrow('title, table, and type are required');
  });

  it('creates report successfully', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'rpt1' });
    const result = await executeReportingToolCall(mockClient, 'create_report', {
      title: 'Open P1 Incidents',
      table: 'incident',
      type: 'bar',
    });
    expect(result.summary).toContain('Open P1 Incidents');
  });

  it('maps query and updates report fields from the allowlist', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'rpt1' });

    const result = await executeReportingToolCall(mockClient, 'update_report', {
      sys_id: 'rpt1',
      fields: { title: 'Open P1 Incidents', query: 'priority=1', type: 'bar' },
    });

    expect(result.summary).toContain('rpt1');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_report', 'rpt1', {
      title: 'Open P1 Incidents',
      filter_fields: 'priority=1',
      type: 'bar',
    });
  });

  it('rejects undeclared report update fields', async () => {
    await expect(
      executeReportingToolCall(mockClient, 'update_report', {
        sys_id: 'rpt1',
        fields: { title: 'Open P1 Incidents', sys_scope: 'global', sys_domain: 'global' },
      })
    ).rejects.toThrow('Report fields cannot be updated: sys_scope, sys_domain');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('executeReportingToolCall – unknown tool', () => {
  it('returns null for unrecognised tool', async () => {
    const result = await executeReportingToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
