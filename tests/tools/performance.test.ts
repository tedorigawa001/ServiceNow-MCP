import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executePerformanceToolCall, getPerformanceToolDefinitions } from '../../src/tools/performance.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  getXmlStats: vi.fn(),
  callApiGet: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;

const SAMPLE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<xmlstats created="Sat Jul 04 19:45:03 PDT 2026" includes="memory,semaphores" version="2">' +
  '<system.memory.max>1820.0</system.memory.max>' +
  '<system.memory.total>856.0</system.memory.total>' +
  '<system.memory.in.use>697.0</system.memory.in.use>' +
  '<system.memory.pct.free>19.0</system.memory.pct.free>' +
  '<semaphores available="15" borrowed="0" loaned="0" max_queue_depth="5" maximum_concurrency="16" name="Default" queue_age="0" queue_depth="0" queue_depth_limit="150" rejected_executions="0">' +
  '<semaphore age="25" processor="Default-thread-35" started="Sat Jul 04 19:45:03 PDT 2026">ABC #1 /xmlstats.do</semaphore>' +
  '</semaphores>' +
  '<semaphores available="4" borrowed="0" loaned="0" max_queue_depth="2" maximum_concurrency="4" name="API_INT" queue_age="0" queue_depth="0" queue_depth_limit="50" rejected_executions="3"/>' +
  '</xmlstats>';

describe('get_instance_diagnostics tool definition', () => {
  it('is registered in the performance tool definitions', () => {
    const names = getPerformanceToolDefinitions().map((d) => d.name);
    expect(names).toContain('get_instance_diagnostics');
  });
});

describe('executePerformanceToolCall – get_instance_diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockClient.getXmlStats as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_XML);
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ system_id: 'app1:node1', status: 'online', participation: 'primary' }],
    });
  });

  it('defaults include to memory + semaphores', async () => {
    await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(mockClient.getXmlStats).toHaveBeenCalledWith(['memory', 'semaphores']);
  });

  it('parses memory scalars from the xmlstats payload', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.memory_mb['system.memory.max']).toBe(1820);
    expect(result.memory_mb['system.memory.pct.free']).toBe(19);
  });

  it('parses semaphore pools including self-closing elements', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.semaphores).toHaveLength(2);
    const def = result.semaphores.find((s: any) => s.name === 'Default');
    expect(def.max_concurrency).toBe(16);
    expect(def.in_use).toBe(1);
    const api = result.semaphores.find((s: any) => s.name === 'API_INT');
    expect(api.in_use).toBe(0);
    expect(api.rejected_executions).toBe(3);
  });

  it('includes cluster node status from sys_cluster_state', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.cluster_nodes).toHaveLength(1);
    expect(result.cluster_nodes[0].status).toBe('online');
  });

  it('still returns diagnostics when sys_cluster_state is ACL-restricted', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('403'));
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.semaphores).toHaveLength(2);
    expect(result.cluster_nodes).toEqual([]);
  });

  it('returns raw XML when raw_xml=true', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', { raw_xml: true });
    expect(result.raw_xml).toBe(SAMPLE_XML);
    expect(result.memory_mb).toBeUndefined();
  });

  it('passes custom include sections through to the client', async () => {
    await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', { include: ['transactions'] });
    expect(mockClient.getXmlStats).toHaveBeenCalledWith(['transactions']);
  });

  it('all_nodes=true parses per-node stats from sys_cluster_node_stats', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockImplementation(({ table }: any) => {
      if (table === 'sys_cluster_node_stats') {
        return Promise.resolve({
          count: 2,
          records: [
            {
              sys_updated_on: new Date().toISOString().slice(0, 19).replace('T', ' '),
              stats:
                '<xmlstats created="a"><scheduler.system_id>app1:node1</scheduler.system_id>' +
                '<system.memory.max>2048.0</system.memory.max>' +
                '<semaphores available="16" maximum_concurrency="16" name="Default" queue_depth="0" max_queue_depth="1" queue_age="0" queue_depth_limit="150" rejected_executions="0"/></xmlstats>',
            },
            {
              sys_updated_on: '2026-02-02 21:34:51',
              stats:
                '<xmlstats created="b"><scheduler.system_id>app2:node2</scheduler.system_id>' +
                '<system.memory.max>2048.0</system.memory.max>' +
                '<semaphores available="10" maximum_concurrency="16" name="Default" queue_depth="3" max_queue_depth="9" queue_age="120" queue_depth_limit="150" rejected_executions="1"/></xmlstats>',
            },
          ],
        });
      }
      return Promise.resolve({ count: 2, records: [{ system_id: 'app1:node1', status: 'online' }] });
    });
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', { all_nodes: true });
    expect(mockClient.getXmlStats).not.toHaveBeenCalled();
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].system_id).toBe('app1:node1');
    expect(result.nodes[0].stale).toBe(false);
    expect(result.nodes[1].stale).toBe(true);
    expect(result.nodes[1].semaphores[0].queue_depth).toBe(3);
    expect(result.nodes[1].semaphores[0].rejected_executions).toBe(1);
  });
});

describe('executePerformanceToolCall – get_performance_history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockClient.callApiGet as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: {
        stats: {
          count: '42',
          avg: { response_time: '2518.3636', sql_time: '213.5', business_rule_time: '103.09' },
          max: { response_time: '9000.1' },
        },
      },
    });
  });

  it('fetches one stats query per bucket with UTC range filters', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_performance_history', {
      hours: 6,
      buckets: 12,
    });
    expect(mockClient.callApiGet).toHaveBeenCalledTimes(12);
    expect(result.series).toHaveLength(12);
    expect(result.bucket_minutes).toBe(30);
    const firstUrl = (mockClient.callApiGet as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstUrl).toContain('/api/now/stats/syslog_transaction');
    expect(decodeURIComponent(firstUrl)).toContain('sys_created_on>=');
  });

  it('parses and rounds aggregate values', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_performance_history', { buckets: 2 });
    expect(result.series[0].count).toBe(42);
    expect(result.series[0].avg_response_ms).toBe(2518);
    expect(result.series[0].max_response_ms).toBe(9000);
    expect(result.series[0].avg_sql_ms).toBe(214);
  });

  it('returns null metrics for empty buckets', async () => {
    (mockClient.callApiGet as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: { stats: { count: '0' } },
    });
    const result = await executePerformanceToolCall(mockClient, 'get_performance_history', { buckets: 2 });
    expect(result.series[0].count).toBe(0);
    expect(result.series[0].avg_response_ms).toBeNull();
  });

  it('appends the extra query filter to every bucket', async () => {
    await executePerformanceToolCall(mockClient, 'get_performance_history', {
      buckets: 2,
      query: 'urlLIKE/api/',
    });
    for (const call of (mockClient.callApiGet as ReturnType<typeof vi.fn>).mock.calls) {
      expect(decodeURIComponent(call[0])).toContain('^urlLIKE/api/');
    }
  });

  it('group_by_node=true returns per-node metrics for each bucket', async () => {
    (mockClient.callApiGet as ReturnType<typeof vi.fn>).mockResolvedValue({
      result: [
        {
          stats: { count: '100', avg: { response_time: '1500' } },
          groupby_fields: [{ field: 'system_id', value: 'app1:node1' }],
        },
        {
          stats: { count: '90', avg: { response_time: '8200' } },
          groupby_fields: [{ field: 'system_id', value: 'app2:node2' }],
        },
      ],
    });
    const result = await executePerformanceToolCall(mockClient, 'get_performance_history', {
      buckets: 2,
      group_by_node: true,
    });
    const firstUrl = (mockClient.callApiGet as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstUrl).toContain('sysparm_group_by=system_id');
    expect(result.series[0].nodes).toHaveLength(2);
    expect(result.series[0].nodes[1].node).toBe('app2:node2');
    expect(result.series[0].nodes[1].avg_response_ms).toBe(8200);
  });

  it('clamps hours and buckets to their limits', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_performance_history', {
      hours: 10000,
      buckets: 500,
    });
    expect(mockClient.callApiGet).toHaveBeenCalledTimes(48);
    expect(result.bucket_minutes).toBe(Math.round((168 * 60) / 48));
  });
});

describe('executePerformanceToolCall – scoped filters and dashboard updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('does not allow indicator filters to append encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executePerformanceToolCall(mockClient, 'list_pa_indicators', {
      category: 'Operations^ORactive=false', query: 'Availability^ORsys_idISNOTEMPTY',
    });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      query: 'active=true^category=OperationsORactive=false^nameCONTAINSAvailabilityORsys_idISNOTEMPTY^ORdescriptionCONTAINSAvailabilityORsys_idISNOTEMPTY',
    }));
  });

  it('allows documented dashboard fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'dash1' });
    await executePerformanceToolCall(mockClient, 'update_dashboard', {
      sys_id: 'dash1', fields: { name: 'Operations', active: false },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('pa_dashboards', 'dash1', {
      name: 'Operations', active: false,
    });
  });

  it('rejects undeclared dashboard fields before they reach the Table API', async () => {
    await expect(executePerformanceToolCall(mockClient, 'update_dashboard', {
      sys_id: 'dash1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Dashboard fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});

describe('get_table_record_count', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: this previously called runAggregateQuery(table, '', ...) with an
  // empty groupBy string, which always failed client-side validation and silently fell
  // through to a queryRecords(limit:1) fallback that can only ever report 0 or 1 --
  // never the real count. Fixed by omitting groupBy (undefined) instead of passing ''.
  it('requests an ungrouped aggregate count (groupBy omitted, not empty string)', async () => {
    (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ stats: { count: '119' } });
    const result = await executePerformanceToolCall(mockClient, 'get_table_record_count', { table: 'sn_grc_indicator' });
    expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('sn_grc_indicator', undefined, 'COUNT', undefined);
    expect(result.record_count).toBe('119');
  });

  it('passes the query filter through to the aggregate call', async () => {
    (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ stats: { count: '5' } });
    await executePerformanceToolCall(mockClient, 'get_table_record_count', { table: 'incident', query: 'active=true' });
    expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('incident', undefined, 'COUNT', 'active=true');
  });

  it('falls back to queryRecords with a note when the aggregate call fails', async () => {
    (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{}] });
    const result = await executePerformanceToolCall(mockClient, 'get_table_record_count', { table: 'incident' });
    expect(result.note).toContain('approximate');
    expect(result.record_count).toBe(1);
  });

  it('requires table', async () => {
    await expect(executePerformanceToolCall(mockClient, 'get_table_record_count', {})).rejects.toThrow('table is required');
  });
});

describe('compare_record_counts', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: this previously reported queryRecords({limit:1}).count as the
  // record_count for every table -- always 0 or 1, never the real total.
  it('reports the real aggregate count per table, not a limit:1 page length', async () => {
    (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ stats: { count: '1111' } })
      .mockResolvedValueOnce({ stats: { count: '58' } });
    const result = await executePerformanceToolCall(mockClient, 'compare_record_counts', {
      tables: ['sn_compliance_control', 'incident'],
    });
    expect(mockClient.runAggregateQuery).toHaveBeenNthCalledWith(1, 'sn_compliance_control', undefined, 'COUNT', undefined);
    expect(result.table_counts['sn_compliance_control']).toEqual({ accessible: true, record_count: '1111' });
    expect(result.table_counts['incident']).toEqual({ accessible: true, record_count: '58' });
  });

  it('marks a table inaccessible when the aggregate query throws', async () => {
    (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no access'));
    const result = await executePerformanceToolCall(mockClient, 'compare_record_counts', { tables: ['restricted_table'] });
    expect(result.table_counts['restricted_table']).toEqual({ accessible: false, error: 'no access' });
  });

  it('requires a non-empty tables array', async () => {
    await expect(executePerformanceToolCall(mockClient, 'compare_record_counts', { tables: [] })).rejects.toThrow('tables must be a non-empty array');
  });
});

describe('getPerformanceToolDefinitions', () => {
  it('returns exactly 17 performance tool definitions', () => {
    expect(getPerformanceToolDefinitions().length).toBe(17);
  });

  it('all tools have name, description and inputSchema', () => {
    getPerformanceToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executePerformanceToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executePerformanceToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('get_pa_indicator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id_or_name', async () => {
    await expect(executePerformanceToolCall(mockClient, 'get_pa_indicator', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Open Incidents' });
    const result = await executePerformanceToolCall(mockClient, 'get_pa_indicator', { sys_id_or_name: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('pa_indicators', 'a'.repeat(32));
    expect(result.name).toBe('Open Incidents');
  });

  it('resolves by name and throws NOT_FOUND when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executePerformanceToolCall(mockClient, 'get_pa_indicator', { sys_id_or_name: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the name so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'i1', name: 'Open Incidents' }] });
    await executePerformanceToolCall(mockClient, 'get_pa_indicator', { sys_id_or_name: 'Open Incidents^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'nameCONTAINSOpen IncidentsORactive=true' }));
  });
});

describe('get_pa_scorecard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires indicator_sys_id', async () => {
    await expect(executePerformanceToolCall(mockClient, 'get_pa_scorecard', {})).rejects.toThrow('indicator_sys_id is required');
  });

  it('derives trend from the two most recent scores', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [
        { value: '10', date: '2026-07-14' },
        { value: '5', date: '2026-07-13' },
      ],
    });
    gr().mockResolvedValue({ sys_id: 'i1', name: 'Open Incidents', unit: 'count', direction: 'minimize' });
    const result = await executePerformanceToolCall(mockClient, 'get_pa_scorecard', { indicator_sys_id: 'i1' });
    expect(result.current_value).toBe('10');
    expect(result.previous_value).toBe('5');
    expect(result.trend).toBe('up');
    expect(result.scores).toBeUndefined();
  });

  it('reports stable trend and N/A values with no score history', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    gr().mockResolvedValue({ sys_id: 'i1', name: 'Open Incidents' });
    const result = await executePerformanceToolCall(mockClient, 'get_pa_scorecard', { indicator_sys_id: 'i1' });
    expect(result.trend).toBe('stable');
    expect(result.current_value).toBe('N/A');
  });

  it('includes the raw score records when include_scores is true', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ value: '10', date: '2026-07-14' }] });
    gr().mockResolvedValue({ sys_id: 'i1', name: 'Open Incidents' });
    const result = await executePerformanceToolCall(mockClient, 'get_pa_scorecard', { indicator_sys_id: 'i1', include_scores: true });
    expect(result.scores).toHaveLength(1);
  });
});

describe('get_pa_time_series', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires indicator_sys_id', async () => {
    await expect(executePerformanceToolCall(mockClient, 'get_pa_time_series', {})).rejects.toThrow('indicator_sys_id is required');
  });

  it('filters by date range', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePerformanceToolCall(mockClient, 'get_pa_time_series', { indicator_sys_id: 'i1', start_date: '2026-06-01', end_date: '2026-07-01' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'pa_scores',
      query: 'indicator=i1^date>=2026-06-01^date<=2026-07-01',
    }));
  });
});

describe('list_pa_breakdowns', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches by name', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePerformanceToolCall(mockClient, 'list_pa_breakdowns', { query: 'group' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'pa_breakdowns', query: 'nameCONTAINSgroup' }));
  });
});

describe('list_pa_dashboards', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches by name', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePerformanceToolCall(mockClient, 'list_pa_dashboards', { query: 'ops' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'pa_dashboards', query: 'nameCONTAINSops' }));
  });
});

describe('get_pa_dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id_or_name', async () => {
    await expect(executePerformanceToolCall(mockClient, 'get_pa_dashboard', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Ops Dashboard' });
    const result = await executePerformanceToolCall(mockClient, 'get_pa_dashboard', { sys_id_or_name: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('pa_dashboards', 'a'.repeat(32));
    expect(result.name).toBe('Ops Dashboard');
  });

  it('throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executePerformanceToolCall(mockClient, 'get_pa_dashboard', { sys_id_or_name: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('list_homepages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches by title', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePerformanceToolCall(mockClient, 'list_homepages', { query: 'agent' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_ui_hp', query: 'titleCONTAINSagent' }));
  });
});

describe('list_pa_jobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and applies query filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executePerformanceToolCall(mockClient, 'list_pa_jobs', { query: 'nightly' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'pa_job', query: 'active=true^nameCONTAINSnightly' }));
  });
});

describe('get_pa_job', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id', async () => {
    await expect(executePerformanceToolCall(mockClient, 'get_pa_job', {})).rejects.toThrow('sys_id is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 'j1', name: 'Nightly Collection' });
    const result = await executePerformanceToolCall(mockClient, 'get_pa_job', { sys_id: 'j1' });
    expect(gr()).toHaveBeenCalledWith('pa_job', 'j1');
    expect(result.name).toBe('Nightly Collection');
  });
});

describe('create_dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executePerformanceToolCall(mockClient, 'create_dashboard', { name: 'X' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name', async () => {
    await expect(executePerformanceToolCall(mockClient, 'create_dashboard', {})).rejects.toThrow('name is required');
  });

  it('creates the dashboard active by default', async () => {
    cr().mockResolvedValue({ sys_id: 'd1' });
    const result = await executePerformanceToolCall(mockClient, 'create_dashboard', { name: 'Ops Dashboard', roles: 'itil' });
    expect(cr()).toHaveBeenCalledWith('pa_dashboards', expect.objectContaining({ name: 'Ops Dashboard', active: true, roles: 'itil' }));
    expect(result.summary).toContain('Ops Dashboard');
  });
});

describe('check_table_completeness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires table and fields', async () => {
    await expect(executePerformanceToolCall(mockClient, 'check_table_completeness', {})).rejects.toThrow('table and fields are required');
  });

  it('computes per-field completeness percentages from the sample', async () => {
    qr().mockResolvedValue({
      count: 4,
      records: [
        { priority: '1', assigned_to: 'u1' },
        { priority: '2', assigned_to: '' },
        { priority: '', assigned_to: 'u2' },
        { priority: '3', assigned_to: null },
      ],
    });
    const result = await executePerformanceToolCall(mockClient, 'check_table_completeness', { table: 'incident', fields: 'priority,assigned_to' });
    expect(result.field_completeness.priority).toEqual({ non_empty: 3, total: 4, completeness_pct: '75.0%' });
    expect(result.field_completeness.assigned_to).toEqual({ non_empty: 2, total: 4, completeness_pct: '50.0%' });
  });

  it('notes when the sample is smaller than requested', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ priority: '1' }, { priority: '2' }] });
    const result = await executePerformanceToolCall(mockClient, 'check_table_completeness', { table: 'incident', fields: 'priority', sample_size: 50 });
    expect(result.note).toContain('Only 2 records found');
  });
});
