import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeFlowToolCall, getFlowToolDefinitions } from '../../src/tools/flow.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const ur = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('getFlowToolDefinitions', () => {
  it('returns exactly 16 flow tool definitions', () => {
    expect(getFlowToolDefinitions().length).toBe(16);
  });

  it('all tools have name, description and inputSchema', () => {
    getFlowToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeFlowToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeFlowToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('list_flows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and combines category/query filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'list_flows', { category: 'ITSM', query: 'approval' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_hub_flow',
      query: 'active=true^category=ITSM^nameCONTAINSapproval^ORdescriptionCONTAINSapproval',
    }));
  });

  it('strips ^ from category and query so they cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'list_flows', { category: 'ITSM^active=false', query: 'x^ORactive=false' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: 'active=true^category=ITSMactive=false^nameCONTAINSxORactive=false^ORdescriptionCONTAINSxORactive=false',
    }));
  });

  it('omits active=true when active is explicitly false', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'list_flows', { active: false });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: '' }));
  });
});

describe('get_flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name_or_sysid', async () => {
    await expect(executeFlowToolCall(mockClient, 'get_flow', {})).rejects.toThrow('name_or_sysid is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Approve Change' });
    const result = await executeFlowToolCall(mockClient, 'get_flow', { name_or_sysid: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('sys_hub_flow', 'a'.repeat(32));
    expect(result.name).toBe('Approve Change');
  });

  it('resolves by name and throws NOT_FOUND when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeFlowToolCall(mockClient, 'get_flow', { name_or_sysid: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the name so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'f1', name: 'Approve Change' }] });
    await executeFlowToolCall(mockClient, 'get_flow', { name_or_sysid: 'Approve Change^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'nameCONTAINSApprove ChangeORactive=true' }));
  });
});

describe('trigger_flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeFlowToolCall(mockClient, 'trigger_flow', { flow_sys_id: 'f1' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires flow_sys_id', async () => {
    await expect(executeFlowToolCall(mockClient, 'trigger_flow', {})).rejects.toThrow('flow_sys_id is required');
  });

  it('triggers the flow with inputs', async () => {
    cr().mockResolvedValue({ sys_id: 'trig1' });
    const result = await executeFlowToolCall(mockClient, 'trigger_flow', { flow_sys_id: 'f1', inputs: { record_id: 'r1' } });
    expect(cr()).toHaveBeenCalledWith('sys_hub_flow_trigger', { sys_id: 'f1', inputs: { record_id: 'r1' } });
    expect(result.summary).toContain('f1');
  });
});

describe('get_flow_execution', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires execution_sysid', async () => {
    await expect(executeFlowToolCall(mockClient, 'get_flow_execution', {})).rejects.toThrow('execution_sysid is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 'ex1', status: 'complete' });
    const result = await executeFlowToolCall(mockClient, 'get_flow_execution', { execution_sysid: 'ex1' });
    expect(gr()).toHaveBeenCalledWith('sys_flow_context', 'ex1');
    expect(result.status).toBe('complete');
  });
});

describe('list_flow_executions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires flow_sys_id', async () => {
    await expect(executeFlowToolCall(mockClient, 'list_flow_executions', {})).rejects.toThrow('flow_sys_id is required');
  });

  it('filters by flow and status', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'list_flow_executions', { flow_sys_id: 'f1', status: 'error' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_flow_context', query: 'flow=f1^status=error' }));
  });
});

describe('list_subflows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and applies query filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'list_subflows', { query: 'notify' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_hub_subflow', query: 'active=true^nameCONTAINSnotify' }));
  });
});

describe('get_subflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name_or_sysid', async () => {
    await expect(executeFlowToolCall(mockClient, 'get_subflow', {})).rejects.toThrow('name_or_sysid is required');
  });

  it('throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeFlowToolCall(mockClient, 'get_subflow', { name_or_sysid: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('list_action_instances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines category and query filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'list_action_instances', { category: 'Integrations', query: 'REST' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_hub_action_instance',
      query: 'category=Integrations^nameCONTAINSREST',
    }));
  });
});

describe('get_process_automation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires name_or_sysid', async () => {
    await expect(executeFlowToolCall(mockClient, 'get_process_automation', {})).rejects.toThrow('name_or_sysid is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Onboarding' });
    const result = await executeFlowToolCall(mockClient, 'get_process_automation', { name_or_sysid: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('pa_process', 'a'.repeat(32));
    expect(result.name).toBe('Onboarding');
  });

  it('throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeFlowToolCall(mockClient, 'get_process_automation', { name_or_sysid: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('list_process_automations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and applies query filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'list_process_automations', { query: 'onboarding' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'pa_process',
      query: 'active=true^nameCONTAINSonboarding^ORdescriptionCONTAINSonboarding',
    }));
  });
});

describe('create_flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeFlowToolCall(mockClient, 'create_flow', { name: 'New Flow' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires name', async () => {
    await expect(executeFlowToolCall(mockClient, 'create_flow', {})).rejects.toThrow('name is required');
  });

  it('creates the flow inactive by default', async () => {
    cr().mockResolvedValue({ sys_id: 'f1' });
    const result = await executeFlowToolCall(mockClient, 'create_flow', { name: 'New Flow', trigger_type: 'record', trigger_table: 'incident' });
    expect(cr()).toHaveBeenCalledWith('sys_hub_flow', expect.objectContaining({ name: 'New Flow', active: 'false', trigger_type: 'record', trigger_table: 'incident' }));
    expect(result.action).toBe('created');
  });
});

describe('create_subflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires name', async () => {
    await expect(executeFlowToolCall(mockClient, 'create_subflow', {})).rejects.toThrow('name is required');
  });

  it('creates the subflow inactive by default', async () => {
    cr().mockResolvedValue({ sys_id: 'sf1' });
    const result = await executeFlowToolCall(mockClient, 'create_subflow', { name: 'Reusable Notify' });
    expect(cr()).toHaveBeenCalledWith('sys_hub_subflow', expect.objectContaining({ name: 'Reusable Notify', active: 'false' }));
    expect(result.action).toBe('created');
  });
});

describe('create_flow_action', () => {
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
    await expect(executeFlowToolCall(mockClient, 'create_flow_action', { name: 'Custom Action' })).rejects.toThrow('Scripting operations are disabled');
  });

  it('requires name', async () => {
    await expect(executeFlowToolCall(mockClient, 'create_flow_action', {})).rejects.toThrow('name is required');
  });

  it('creates the action', async () => {
    cr().mockResolvedValue({ sys_id: 'act1' });
    const result = await executeFlowToolCall(mockClient, 'create_flow_action', { name: 'Custom Action', script: '(function() {})();' });
    expect(cr()).toHaveBeenCalledWith('sys_hub_action_type_definition', expect.objectContaining({ name: 'Custom Action', script: '(function() {})();' }));
    expect(result.action).toBe('created');
  });
});

describe('publish_flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires flow_sys_id', async () => {
    await expect(executeFlowToolCall(mockClient, 'publish_flow', {})).rejects.toThrow('flow_sys_id is required');
  });

  it('publishes a flow by default', async () => {
    ur().mockResolvedValue({ sys_id: 'f1' });
    const result = await executeFlowToolCall(mockClient, 'publish_flow', { flow_sys_id: 'f1' });
    expect(ur()).toHaveBeenCalledWith('sys_hub_flow', 'f1', { active: 'true' });
    expect(result.action).toBe('published');
  });

  it('publishes a subflow when type=subflow', async () => {
    ur().mockResolvedValue({ sys_id: 'sf1' });
    await executeFlowToolCall(mockClient, 'publish_flow', { flow_sys_id: 'sf1', type: 'subflow' });
    expect(ur()).toHaveBeenCalledWith('sys_hub_subflow', 'sf1', { active: 'true' });
  });
});

describe('test_flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('requires flow_sys_id', async () => {
    await expect(executeFlowToolCall(mockClient, 'test_flow', {})).rejects.toThrow('flow_sys_id is required');
  });

  it('triggers a test-mode execution', async () => {
    cr().mockResolvedValue({ sys_id: 'trig1' });
    const result = await executeFlowToolCall(mockClient, 'test_flow', { flow_sys_id: 'f1', test_inputs: { x: 1 } });
    expect(cr()).toHaveBeenCalledWith('sys_hub_flow_trigger', { sys_id: 'f1', inputs: { x: 1 }, test_mode: 'true' });
    expect(result.action).toBe('test_triggered');
  });
});

describe('get_flow_error_log', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires flow_sys_id', async () => {
    await expect(executeFlowToolCall(mockClient, 'get_flow_error_log', {})).rejects.toThrow('flow_sys_id is required');
  });

  it('queries errored executions within the look-back window', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeFlowToolCall(mockClient, 'get_flow_error_log', { flow_sys_id: 'f1', days: 3 });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_flow_context',
      query: expect.stringMatching(/^flow=f1\^status=error\^sys_created_on>=/),
    }));
  });
});
