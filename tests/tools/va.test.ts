import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeVaToolCall, getVaToolDefinitions } from '../../src/tools/va.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('getVaToolDefinitions', () => {
  it('returns VA tool definitions', () => {
    expect(getVaToolDefinitions().length).toBeGreaterThan(0);
  });
});

describe('executeVaToolCall – update_va_topic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
  });

  it('updates VA topic fields from the allowlist', async () => {
    updateRec().mockResolvedValue({ sys_id: 'topic1' });

    const result = await executeVaToolCall(mockClient, 'update_va_topic', {
      sys_id: 'topic1',
      fields: {
        name: 'Password reset',
        description: 'Handle password reset',
        active: true,
      },
    });

    expect(result.action).toBe('updated');
    expect(updateRec()).toHaveBeenCalledWith('sys_cs_topic', 'topic1', {
      name: 'Password reset',
      description: 'Handle password reset',
      active: true,
    });
  });

  it('rejects undeclared VA topic update fields', async () => {
    await expect(
      executeVaToolCall(mockClient, 'update_va_topic', {
        sys_id: 'topic1',
        fields: { name: 'Password reset', sys_id: 'other', sys_domain: 'global' },
      })
    ).rejects.toThrow('VA topic fields cannot be updated: sys_id, sys_domain');
    expect(updateRec()).not.toHaveBeenCalled();
  });
});
