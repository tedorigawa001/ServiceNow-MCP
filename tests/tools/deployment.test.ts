import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeDeploymentToolCall, getDeploymentToolDefinitions } from '../../src/tools/deployment.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getDeploymentToolDefinitions', () => {
  it('all tools have name, description and inputSchema', () => {
    getDeploymentToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeDeploymentToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeDeploymentToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('analyze_data_quality', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires table', async () => {
    await expect(executeDeploymentToolCall(mockClient, 'analyze_data_quality', {})).rejects.toThrow('table is required');
  });

  // Regression test: total_records/stale_records/quality_score previously came from
  // queryRecords(limit:1).count -- always 0 or 1 (records.length), never the real
  // count, making quality_score meaningless for any table with more than 1 record.
  // Fixed to use ungrouped aggregate queries.
  it('computes total_records/stale_records/quality_score from aggregate counts, not limit:1 page length', async () => {
    agg()
      .mockResolvedValueOnce({ stats: { count: '1000' } }) // total
      .mockResolvedValueOnce({ stats: { count: '250' } }); // stale

    const result = await executeDeploymentToolCall(mockClient, 'analyze_data_quality', { table: 'incident', days_stale: 90 });

    expect(agg()).toHaveBeenNthCalledWith(1, 'incident', undefined, 'COUNT', undefined);
    expect(agg()).toHaveBeenNthCalledWith(2, 'incident', undefined, 'COUNT', expect.stringContaining('sys_updated_on<'));
    expect(result.total_records).toBe(1000);
    expect(result.stale_records).toBe(250);
    expect(result.quality_score).toBe('75%');
  });

  it('reports N/A quality_score when the table is empty', async () => {
    agg().mockResolvedValue({ stats: { count: '0' } });
    const result = await executeDeploymentToolCall(mockClient, 'analyze_data_quality', { table: 'incident' });
    expect(result.quality_score).toBe('N/A');
  });

  it('reports the real empty-field count for required_fields, not a 0/1 flag', async () => {
    agg()
      .mockResolvedValueOnce({ stats: { count: '100' } }) // total
      .mockResolvedValueOnce({ stats: { count: '10' } }) // stale
      .mockResolvedValueOnce({ stats: { count: '37' } }); // short_description empty

    const result = await executeDeploymentToolCall(mockClient, 'analyze_data_quality', {
      table: 'incident',
      required_fields: 'short_description',
    });

    expect(agg()).toHaveBeenNthCalledWith(3, 'incident', undefined, 'COUNT', 'short_descriptionISEMPTY');
    expect(result.completeness_issues).toEqual(['short_description: 37 empty records']);
  });

  it('reports no issues when a required field has no empty records', async () => {
    agg()
      .mockResolvedValueOnce({ stats: { count: '100' } })
      .mockResolvedValueOnce({ stats: { count: '0' } })
      .mockResolvedValueOnce({ stats: { count: '0' } });
    const result = await executeDeploymentToolCall(mockClient, 'analyze_data_quality', {
      table: 'incident',
      required_fields: 'short_description',
    });
    expect(result.completeness_issues).toEqual([]);
  });
});
