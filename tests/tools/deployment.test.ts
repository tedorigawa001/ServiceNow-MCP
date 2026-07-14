import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeDeploymentToolCall, getDeploymentToolDefinitions } from '../../src/tools/deployment.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
  callNowAssist: vi.fn(),
} as unknown as ServiceNowClient;

const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;
const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const cna = () => mockClient.callNowAssist as ReturnType<typeof vi.fn>;

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

describe('validate_deployment', () => {
  beforeEach(() => vi.clearAllMocks());

  // Regression test: total_changes previously came from queryRecords(limit:500).count,
  // undercounting any Update Set with more than 500 changes. Fixed to use an
  // ungrouped aggregate query while still sampling records for changes_summary.
  it('reports total_changes from the aggregate query, not the capped sample size', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'US1', state: 'complete' });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 500,
      records: [{ sys_id: 'x1', name: 'Change 1', type: 'Table', action: 'INSERT_OR_UPDATE' }],
    });
    agg().mockResolvedValue({ stats: { count: '812' } });

    const result = await executeDeploymentToolCall(mockClient, 'validate_deployment', { update_set_sys_id: 'us1' });

    expect(agg()).toHaveBeenCalledWith('sys_update_xml', undefined, 'COUNT', 'update_set=us1');
    expect(result.total_changes).toBe(812);
    expect(result.changes_summary).toHaveLength(1);
    expect(result.validation).toBe('READY');
  });
});

describe('find_artifact', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name', async () => {
    await expect(executeDeploymentToolCall(mockClient, 'find_artifact', {})).rejects.toThrow('name is required');
  });

  it('maps a known type to its table and applies scope', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDeploymentToolCall(mockClient, 'find_artifact', { name: 'MyRule', type: 'business_rule', scope: 'x_app' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_script',
      query: 'nameLIKEMyRule^sys_scope.name=x_app',
    }));
  });

  it('strips ^ from name and scope so they cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDeploymentToolCall(mockClient, 'find_artifact', { name: 'X^ORactive=true', scope: 'x_app^ORsys_idISNOTEMPTY' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: 'nameLIKEXORactive=true^sys_scope.name=x_appORsys_idISNOTEMPTY',
    }));
  });
});

describe('validate_artifact', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires table and sys_id', async () => {
    await expect(executeDeploymentToolCall(mockClient, 'validate_artifact', {})).rejects.toThrow('table and sys_id are required');
  });

  it('flags known risky script patterns', async () => {
    gr().mockResolvedValue({ name: 'Risky Rule', script: 'eval(x); current.update(); gs.sleep(1000);', active: 'true' });
    const result = await executeDeploymentToolCall(mockClient, 'validate_artifact', { table: 'sys_script', sys_id: 'r1' });
    expect(result.status).toBe('REVIEW');
    expect(result.issues.some((i: string) => i.includes('eval('))).toBe(true);
    expect(result.issues.some((i: string) => i.includes('current.update()'))).toBe(true);
    expect(result.issues.some((i: string) => i.includes('gs.sleep'))).toBe(true);
  });

  it('reports PASS with no issues for a clean, active artifact', async () => {
    gr().mockResolvedValue({ name: 'Clean Rule', script: 'var x = 1;', active: 'true' });
    const result = await executeDeploymentToolCall(mockClient, 'validate_artifact', { table: 'sys_script', sys_id: 'r1' });
    expect(result.status).toBe('PASS');
    expect(result.issues).toEqual([]);
  });
});

describe('clone_artifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('is blocked without SCRIPTING_ENABLED', async () => {
    delete process.env.SCRIPTING_ENABLED;
    await expect(executeDeploymentToolCall(mockClient, 'clone_artifact', { table: 'sys_script', sys_id: 'r1', new_name: 'Copy' }))
      .rejects.toThrow('Scripting operations are disabled');
  });

  it('requires table, sys_id, and new_name', async () => {
    await expect(executeDeploymentToolCall(mockClient, 'clone_artifact', {})).rejects.toThrow('table, sys_id, and new_name are required');
  });

  it('clones the record, stripping sys_ fields and applying the new name', async () => {
    gr().mockResolvedValue({ sys_id: 'r1', sys_created_on: 'x', sys_updated_on: 'x', sys_created_by: 'x', sys_updated_by: 'x', name: 'Original', script: 'var x=1;' });
    cr().mockResolvedValue({ sys_id: 'r2' });
    const result = await executeDeploymentToolCall(mockClient, 'clone_artifact', { table: 'sys_script', sys_id: 'r1', new_name: 'Copy', target_scope: 'x_app' });
    expect(cr()).toHaveBeenCalledWith('sys_script', expect.objectContaining({ name: 'Copy', script: 'var x=1;', sys_scope: 'x_app' }));
    expect(cr()).toHaveBeenCalledWith('sys_script', expect.not.objectContaining({ sys_id: expect.anything() }));
    expect(result.action).toBe('cloned');
  });
});

describe('rollback_deployment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeDeploymentToolCall(mockClient, 'rollback_deployment', { update_set_sys_id: 'us1' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires update_set_sys_id', async () => {
    await expect(executeDeploymentToolCall(mockClient, 'rollback_deployment', {})).rejects.toThrow('update_set_sys_id is required');
  });

  it('requests rollback and surfaces the update set state', async () => {
    gr().mockResolvedValue({ name: 'US1', state: 'complete' });
    const result = await executeDeploymentToolCall(mockClient, 'rollback_deployment', { update_set_sys_id: 'us1', reason: 'bad deploy' });
    expect(result.action).toBe('rollback_requested');
    expect(result.reason).toBe('bad deploy');
  });
});

describe('list_deployment_history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries committed update sets within the look-back window', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDeploymentToolCall(mockClient, 'list_deployment_history', { days: 7 });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_update_set',
      query: expect.stringMatching(/^state=complete\^sys_updated_on>=/),
    }));
  });
});

describe('create_solution_package', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeDeploymentToolCall(mockClient, 'create_solution_package', { name: 'X', update_sets: ['us1'] }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires name and a non-empty update_sets array', async () => {
    await expect(executeDeploymentToolCall(mockClient, 'create_solution_package', { name: 'X' })).rejects.toThrow(
      'name and update_sets are required'
    );
  });

  it('reports the package creation without a real Store app integration', async () => {
    const result = await executeDeploymentToolCall(mockClient, 'create_solution_package', { name: 'Q1 Release', update_sets: ['us1', 'us2'] });
    expect(result.action).toBe('package_created');
    expect(result.update_set_count).toBe(2);
  });
});

describe('execute_background_script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });
  afterEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('is blocked without SCRIPTING_ENABLED', async () => {
    delete process.env.SCRIPTING_ENABLED;
    await expect(executeDeploymentToolCall(mockClient, 'execute_background_script', { script: 'gs.info("hi");' }))
      .rejects.toThrow('Scripting operations are disabled');
  });

  it('requires script', async () => {
    await expect(executeDeploymentToolCall(mockClient, 'execute_background_script', {})).rejects.toThrow('script is required');
  });

  it('executes the script and returns the output', async () => {
    cna().mockResolvedValue({ log: 'hi' });
    const result = await executeDeploymentToolCall(mockClient, 'execute_background_script', { script: 'gs.info("hi");' });
    expect(cna()).toHaveBeenCalledWith('/api/now/sp/background_script', { script: 'gs.info("hi");', scope: 'global' });
    expect(result.action).toBe('executed');
  });

  it('reports failed instead of throwing when the API call rejects', async () => {
    cna().mockRejectedValue(new Error('script error'));
    const result = await executeDeploymentToolCall(mockClient, 'execute_background_script', { script: 'bad script' });
    expect(result.action).toBe('failed');
    expect(result.error).toBe('script error');
  });
});
