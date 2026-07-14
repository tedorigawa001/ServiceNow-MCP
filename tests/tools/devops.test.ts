import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeDevopsToolCall, getDevopsToolDefinitions } from '../../src/tools/devops.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getDevopsToolDefinitions', () => {
  it('all tools have name, description and inputSchema', () => {
    getDevopsToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeDevopsToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeDevopsToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('get_devops_insights', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: total/successful/failed previously came from a
  // queryRecords(limit:1000) fetch filtered client-side, silently undercounting
  // for any period with more than 1000 matching deploy tasks. Fixed to use a
  // status-grouped aggregate query so every status is summed exactly.
  it('derives total/successful/failed from a status-grouped aggregate query, not a capped fetch', async () => {
    agg().mockResolvedValue([
      { groupby_fields: [{ value: 'success' }], stats: { count: '1200' } },
      { groupby_fields: [{ value: 'failed' }], stats: { count: '300' } },
      { groupby_fields: [{ value: 'in_progress' }], stats: { count: '10' } },
    ]);

    const result = await executeDevopsToolCall(mockClient, 'get_devops_insights', { days: 30 });

    expect(qr()).not.toHaveBeenCalled();
    expect(agg()).toHaveBeenCalledWith('sn_devops_deploy_task', 'status', 'COUNT', expect.stringContaining('sys_created_on>='));
    expect(result.total_deployments).toBe(1510);
    expect(result.successful).toBe(1200);
    expect(result.failed).toBe(300);
    expect(result.success_rate).toBe('79%');
  });

  it('scopes the query to pipeline_sys_id when provided', async () => {
    agg().mockResolvedValue([]);
    await executeDevopsToolCall(mockClient, 'get_devops_insights', { pipeline_sys_id: 'p1' });
    expect(agg().mock.calls[0][3]).toContain('pipeline=p1');
  });

  it('reports N/A rates when there are no matching deployments', async () => {
    agg().mockResolvedValue([]);
    const result = await executeDevopsToolCall(mockClient, 'get_devops_insights', {});
    expect(result.total_deployments).toBe(0);
    expect(result.success_rate).toBe('N/A');
    expect(result.deployment_frequency).toBe('N/A');
  });
});

describe('list_devops_pipelines', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters to active pipelines by default', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDevopsToolCall(mockClient, 'list_devops_pipelines', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sn_devops_pipeline', query: 'active=true' }));
  });
});

describe('track_deployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('requires environment, artifact_name, and status', async () => {
    await expect(executeDevopsToolCall(mockClient, 'track_deployment', {})).rejects.toThrow(
      'environment, artifact_name, and status are required'
    );
  });

  it('tracks a deployment when write is enabled', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'dep1' });
    const result = await executeDevopsToolCall(mockClient, 'track_deployment', {
      environment: 'prod', artifact_name: 'myapp', status: 'success',
    });
    expect(result.action).toBe('tracked');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sn_devops_deploy_task', expect.objectContaining({
      stage: 'prod', artifact_name: 'myapp', status: 'success',
    }));
  });
});
