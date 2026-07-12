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
