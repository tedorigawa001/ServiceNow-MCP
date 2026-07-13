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
