import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAppStudioToolCall, getAppStudioToolDefinitions } from '../../src/tools/app-studio.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('getAppStudioToolDefinitions', () => {
  it('returns app studio tool definitions', () => {
    expect(getAppStudioToolDefinitions().length).toBeGreaterThan(0);
  });
});

describe('executeAppStudioToolCall – update_scoped_app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
  });

  it('updates scoped app fields from the allowlist', async () => {
    updateRec().mockResolvedValue({ sys_id: 'app1' });

    const result = await executeAppStudioToolCall(mockClient, 'update_scoped_app', {
      sys_id: 'app1',
      fields: { name: 'My App', version: '1.2.0', active: true },
    });

    expect(result.summary).toContain('app1');
    expect(updateRec()).toHaveBeenCalledWith('sys_app', 'app1', {
      name: 'My App',
      version: '1.2.0',
      active: true,
    });
  });

  it('rejects undeclared scoped app update fields', async () => {
    await expect(
      executeAppStudioToolCall(mockClient, 'update_scoped_app', {
        sys_id: 'app1',
        fields: { name: 'My App', scope: 'x_other_scope', sys_domain: 'global' },
      })
    ).rejects.toThrow('Scoped app fields cannot be updated: scope, sys_domain');
    expect(updateRec()).not.toHaveBeenCalled();
  });
});

describe('list_scoped_apps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches name/scope and strips ^ from the query', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeAppStudioToolCall(mockClient, 'list_scoped_apps', { query: 'myapp^ORactive=false' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_app',
      query: 'nameCONTAINSmyappORactive=false^ORscopeCONTAINSmyappORactive=false',
    }));
  });
});

describe('get_scoped_app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires id', async () => {
    await expect(executeAppStudioToolCall(mockClient, 'get_scoped_app', {})).rejects.toThrow('id is required');
  });

  it('fetches directly by sys_id when hex', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'My App' });
    const result = await executeAppStudioToolCall(mockClient, 'get_scoped_app', { id: 'a'.repeat(32) });
    expect(mockClient.getRecord).toHaveBeenCalledWith('sys_app', 'a'.repeat(32));
    expect(result.name).toBe('My App');
  });

  it('throws NOT_FOUND when scope/name lookup misses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await expect(executeAppStudioToolCall(mockClient, 'get_scoped_app', { id: 'x_myco_myapp' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from the id so it cannot inject extra encoded-query clauses', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'a1', name: 'My App' }] });
    await executeAppStudioToolCall(mockClient, 'get_scoped_app', { id: 'x_myco_myapp^ORactive=true' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'scope=x_myco_myappORactive=true^ORname=x_myco_myappORactive=true' }));
  });
});

describe('create_scoped_app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => { delete process.env.WRITE_ENABLED; });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeAppStudioToolCall(mockClient, 'create_scoped_app', { name: 'My App', scope: 'x_myco_myapp' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires name and scope', async () => {
    await expect(executeAppStudioToolCall(mockClient, 'create_scoped_app', {})).rejects.toThrow('name and scope are required');
  });

  it('requires the scope to start with x_', async () => {
    await expect(executeAppStudioToolCall(mockClient, 'create_scoped_app', { name: 'My App', scope: 'myapp' }))
      .rejects.toThrow('scope must start with "x_"');
  });

  it('creates the app with a default version', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'app1' });
    const result = await executeAppStudioToolCall(mockClient, 'create_scoped_app', { name: 'My App', scope: 'x_myco_myapp' });
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_app', expect.objectContaining({ name: 'My App', scope: 'x_myco_myapp', version: '1.0.0' }));
    expect(result.summary).toContain('x_myco_myapp');
  });
});
