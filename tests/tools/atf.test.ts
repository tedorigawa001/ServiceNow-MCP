import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeAtfToolCall, getAtfToolDefinitions } from '../../src/tools/atf.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  callNowAssist: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cna = () => mockClient.callNowAssist as ReturnType<typeof vi.fn>;

describe('getAtfToolDefinitions', () => {
  it('returns exactly 9 ATF tool definitions', () => {
    expect(getAtfToolDefinitions().length).toBe(9);
  });

  it('all tools have name, description and inputSchema', () => {
    getAtfToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeAtfToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeAtfToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('list_atf_suites', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and combines with an extra query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeAtfToolCall(mockClient, 'list_atf_suites', { query: 'nameLIKESmoke' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_atf_test_suite', query: 'active=true^nameLIKESmoke' }));
  });
});

describe('get_atf_suite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id_or_name', async () => {
    await expect(executeAtfToolCall(mockClient, 'get_atf_suite', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Smoke Suite' });
    const result = await executeAtfToolCall(mockClient, 'get_atf_suite', { sys_id_or_name: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('sys_atf_test_suite', 'a'.repeat(32));
    expect(result.name).toBe('Smoke Suite');
  });

  it('resolves by name and throws NOT_FOUND when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeAtfToolCall(mockClient, 'get_atf_suite', { sys_id_or_name: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the name so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 's1', name: 'Smoke Suite' }] });
    await executeAtfToolCall(mockClient, 'get_atf_suite', { sys_id_or_name: 'Smoke Suite^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'name=Smoke SuiteORactive=true' }));
  });
});

describe('run_atf_suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ATF_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.ATF_ENABLED; });

  it('is blocked without ATF_ENABLED', async () => {
    delete process.env.ATF_ENABLED;
    await expect(executeAtfToolCall(mockClient, 'run_atf_suite', { sys_id: 's1' })).rejects.toThrow();
  });

  it('requires sys_id', async () => {
    await expect(executeAtfToolCall(mockClient, 'run_atf_suite', {})).rejects.toThrow('sys_id is required');
  });

  it('triggers the suite run', async () => {
    cna().mockResolvedValue({ execution_id: 'run1' });
    const result = await executeAtfToolCall(mockClient, 'run_atf_suite', { sys_id: 's1' });
    expect(cna()).toHaveBeenCalledWith('/api/now/atf/runner/run_suite', { sys_id: 's1' });
    expect(result.summary).toContain('s1');
  });
});

describe('list_atf_tests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and filters by suite_sys_id', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeAtfToolCall(mockClient, 'list_atf_tests', { suite_sys_id: 's1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_atf_test', query: 'active=true^test_suite=s1' }));
  });
});

describe('get_atf_test', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id', async () => {
    await expect(executeAtfToolCall(mockClient, 'get_atf_test', {})).rejects.toThrow('sys_id is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 't1', name: 'Login Test' });
    const result = await executeAtfToolCall(mockClient, 'get_atf_test', { sys_id: 't1' });
    expect(gr()).toHaveBeenCalledWith('sys_atf_test', 't1');
    expect(result.name).toBe('Login Test');
  });
});

describe('run_atf_test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ATF_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.ATF_ENABLED; });

  it('is blocked without ATF_ENABLED', async () => {
    delete process.env.ATF_ENABLED;
    await expect(executeAtfToolCall(mockClient, 'run_atf_test', { sys_id: 't1' })).rejects.toThrow();
  });

  it('requires sys_id', async () => {
    await expect(executeAtfToolCall(mockClient, 'run_atf_test', {})).rejects.toThrow('sys_id is required');
  });

  it('triggers the test run', async () => {
    cna().mockResolvedValue({ execution_id: 'run1' });
    const result = await executeAtfToolCall(mockClient, 'run_atf_test', { sys_id: 't1' });
    expect(cna()).toHaveBeenCalledWith('/api/now/atf/runner/run_test', { sys_id: 't1' });
    expect(result.summary).toContain('t1');
  });
});

describe('get_atf_suite_result', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires result_sys_id', async () => {
    await expect(executeAtfToolCall(mockClient, 'get_atf_suite_result', {})).rejects.toThrow('result_sys_id is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 'r1', status: 'success' });
    const result = await executeAtfToolCall(mockClient, 'get_atf_suite_result', { result_sys_id: 'r1' });
    expect(gr()).toHaveBeenCalledWith('sys_atf_test_suite_result', 'r1');
    expect(result.status).toBe('success');
  });
});

describe('list_atf_test_results', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by suite_result_sys_id', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeAtfToolCall(mockClient, 'list_atf_test_results', { suite_result_sys_id: 'r1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_atf_result', query: 'test_suite_result=r1' }));
  });
});

describe('get_atf_failure_insight', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires result_sys_id', async () => {
    await expect(executeAtfToolCall(mockClient, 'get_atf_failure_insight', {})).rejects.toThrow('result_sys_id is required');
  });

  it('queries sys_atf_failure_insight and summarizes the change count', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ field: 'active' }, { field: 'role' }] });
    const result = await executeAtfToolCall(mockClient, 'get_atf_failure_insight', { result_sys_id: 'r1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_atf_failure_insight', query: 'test_suite_result=r1' }));
    expect(result.summary).toContain('2 metadata change(s)');
    expect(result.failure_insight).toHaveLength(2);
  });
});
