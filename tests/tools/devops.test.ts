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

describe('get_devops_pipeline', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id', async () => {
    await expect(executeDevopsToolCall(mockClient, 'get_devops_pipeline', {})).rejects.toThrow('sys_id is required');
  });

  it('delegates to getRecord', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'p1', name: 'Build Pipeline' });
    const result = await executeDevopsToolCall(mockClient, 'get_devops_pipeline', { sys_id: 'p1' });
    expect(mockClient.getRecord).toHaveBeenCalledWith('sn_devops_pipeline', 'p1');
    expect(result.name).toBe('Build Pipeline');
  });
});

describe('list_deployments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines pipeline_sys_id, environment, and state filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDevopsToolCall(mockClient, 'list_deployments', { pipeline_sys_id: 'p1', environment: 'prod', state: 'success' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sn_devops_deploy_task',
      query: 'pipeline=p1^stage=prod^status=success',
    }));
  });

  it('strips ^ from environment and state so they cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDevopsToolCall(mockClient, 'list_deployments', { environment: 'prod^ORstage=dev', state: 'success^ORstatus=failed' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'stage=prodORstage=dev^status=successORstatus=failed' }));
  });
});

describe('get_deployment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delegates to getRecord', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'd1', status: 'success' });
    const result = await executeDevopsToolCall(mockClient, 'get_deployment', { sys_id: 'd1' });
    expect(mockClient.getRecord).toHaveBeenCalledWith('sn_devops_deploy_task', 'd1');
    expect(result.status).toBe('success');
  });
});

describe('create_devops_change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeDevopsToolCall(mockClient, 'create_devops_change', { short_description: 'X', environment: 'prod' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires short_description and environment', async () => {
    await expect(executeDevopsToolCall(mockClient, 'create_devops_change', {})).rejects.toThrow(
      'short_description and environment are required'
    );
  });

  it('creates a standard change linked to the deployment', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'c1' });
    const result = await executeDevopsToolCall(mockClient, 'create_devops_change', { short_description: 'Deploy v2', environment: 'prod', artifact: 'v2.0' });
    expect(mockClient.createRecord).toHaveBeenCalledWith('change_request', expect.objectContaining({
      short_description: 'Deploy v2', type: 'standard', description: expect.stringContaining('prod'),
    }));
    expect(result.action).toBe('created');
  });
});
