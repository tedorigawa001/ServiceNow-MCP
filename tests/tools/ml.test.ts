import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeMlToolCall, getMlToolDefinitions } from '../../src/tools/ml.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getMlToolDefinitions', () => {
  it('all tools have name, description and inputSchema', () => {
    getMlToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeMlToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeMlToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('ml_virtual_agent_nlu', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: this previously fetched queryRecords(limit:500) and derived
  // total/completed from records.length/filter — silently truncating (undercounting)
  // both figures for any period with more than 500 matching conversations. Fixed to
  // use ungrouped aggregate queries instead.
  it('derives total and completed from aggregate counts, not a capped record fetch', async () => {
    agg()
      .mockResolvedValueOnce({ stats: { count: '842' } })
      .mockResolvedValueOnce({ stats: { count: '600' } });
    const result = await executeMlToolCall(mockClient, 'ml_virtual_agent_nlu', { days: 30 });
    expect(qr()).not.toHaveBeenCalled();
    expect(agg()).toHaveBeenNthCalledWith(1, 'sys_cs_conversation', undefined, 'COUNT', expect.stringContaining('sys_created_on>='));
    expect(agg()).toHaveBeenNthCalledWith(2, 'sys_cs_conversation', undefined, 'COUNT', expect.stringContaining('stateINcompleted,resolved'));
    expect(result.total_conversations).toBe(842);
    expect(result.completed).toBe(600);
    expect(result.completion_rate).toBe('71%');
  });

  it('scopes the query to topic_sys_id when provided', async () => {
    agg().mockResolvedValue({ stats: { count: '0' } });
    await executeMlToolCall(mockClient, 'ml_virtual_agent_nlu', { topic_sys_id: 't1' });
    expect(agg().mock.calls[0][3]).toContain('topic=t1');
  });

  it('reports N/A completion_rate when total is 0', async () => {
    agg().mockResolvedValue({ stats: { count: '0' } });
    const result = await executeMlToolCall(mockClient, 'ml_virtual_agent_nlu', {});
    expect(result.completion_rate).toBe('N/A');
  });
});

describe('ml_process_optimization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires table', async () => {
    await expect(executeMlToolCall(mockClient, 'ml_process_optimization', {})).rejects.toThrow('table is required');
  });

  // Regression test: resolved_records previously reported resp.count (the sample
  // fetch's records.length, capped at limit:1000) instead of the real total match
  // count -- silently wrong for any table with more than 1000 matching records in
  // the period.
  it('reports the real total via aggregate, not the capped sample size', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [
        { reassignment_count: '1', sys_created_on: '2026-01-01 00:00:00', resolved_at: '2026-01-01 02:00:00' },
        { reassignment_count: '3', sys_created_on: '2026-01-02 00:00:00', resolved_at: '2026-01-02 04:00:00' },
      ],
    });
    agg().mockResolvedValue({ stats: { count: '1500' } });

    const result = await executeMlToolCall(mockClient, 'ml_process_optimization', { table: 'incident', days: 90 });

    expect(result.resolved_records).toBe(1500);
    expect(result.sampled_records).toBe(2);
    expect(result.note).toContain('sample of 2 of 1500');
    expect(result.avg_resolution_hours).toBeCloseTo(3, 1);
    expect(result.avg_reassignments).toBeCloseTo(2, 1);
  });

  it('omits the sampling note when the sample covers the full match set', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ reassignment_count: '0', sys_created_on: '2026-01-01 00:00:00', resolved_at: '2026-01-01 01:00:00' }] });
    agg().mockResolvedValue({ stats: { count: '1' } });
    const result = await executeMlToolCall(mockClient, 'ml_process_optimization', { table: 'incident' });
    expect(result.note).toBeUndefined();
    expect(result.resolved_records).toBe(1);
  });
});

describe('ml_forecast_incidents', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: previously fetched queryRecords(limit:5000) and used only
  // .count, silently undercounting for any lookback period with more than 5000
  // matching incidents. Fixed to use an ungrouped aggregate query directly.
  it('derives total_incidents from an aggregate query, not a capped record fetch', async () => {
    agg().mockResolvedValue({ stats: { count: '6000' } });
    const result = await executeMlToolCall(mockClient, 'ml_forecast_incidents', { days_ahead: 7 });
    expect(qr()).not.toHaveBeenCalled();
    expect(agg()).toHaveBeenCalledWith('incident', undefined, 'COUNT', expect.stringContaining('sys_created_on>='));
    expect(result.total_incidents).toBe(6000);
    expect(result.avg_daily_rate).toBe(100);
    expect(result.forecast_total).toBe(700);
  });
});

describe('ml_predict_change_risk', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: total_similar_changes previously wasn't reported at all and
  // the rate denominator used resp.count (the capped sample), silently wrong for
  // any period with more than 100 matching changes. Fixed to report the true
  // total via aggregate while keeping the bounded sample for the per-record rate.
  it('reports total_similar_changes from aggregate and labels the sampled rate', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [{ risk: 'high' }, { risk: 'low' }],
    });
    agg().mockResolvedValue({ stats: { count: '400' } });

    const result = await executeMlToolCall(mockClient, 'ml_predict_change_risk', { type: 'normal' });

    expect(agg()).toHaveBeenCalledWith('change_request', undefined, 'COUNT', expect.stringContaining('type=normal'));
    expect(result.total_similar_changes).toBe(400);
    expect(result.sampled_changes).toBe(2);
    expect(result.note).toContain('sample of 2 of 400');
    expect(result.high_risk_rate).toBe('50%');
  });

  it('returns the change record directly when change_sys_id is given', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ risk: 'high', risk_value: 80, impact: '1', conflict_status: 'none' });
    const result = await executeMlToolCall(mockClient, 'ml_predict_change_risk', { change_sys_id: 'c1' });
    expect(agg()).not.toHaveBeenCalled();
    expect(result.risk).toBe('high');
  });
});

describe('ml_detect_anomalies', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires table and field', async () => {
    await expect(executeMlToolCall(mockClient, 'ml_detect_anomalies', {})).rejects.toThrow('table and field are required');
  });

  // Regression test: total_records previously came from the capped
  // queryRecords(limit:1000) sample's records.length, silently wrong for any
  // period with more than 1000 matching records. Fixed to report the true total
  // via aggregate while keeping the bounded sample for mean/std_dev.
  it('reports total_records from aggregate, not the capped sample size', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [
        { value: '10', sys_created_on: '2026-01-01' },
        { value: '12', sys_created_on: '2026-01-02' },
      ],
    });
    agg().mockResolvedValue({ stats: { count: '5000' } });

    const result = await executeMlToolCall(mockClient, 'ml_detect_anomalies', { table: 'incident', field: 'value' });

    expect(agg()).toHaveBeenCalledWith('incident', undefined, 'COUNT', expect.stringContaining('sys_created_on>='));
    expect(result.total_records).toBe(5000);
    expect(result.sampled_records).toBe(2);
    expect(result.note).toContain('sample of 2 of 5000');
  });
});
