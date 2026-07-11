import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCatalogToolCall } from '../../src/tools/catalog.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = { updateRecord: vi.fn() } as unknown as ServiceNowClient;

describe('executeCatalogToolCall – update_catalog_item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('allows documented catalog item fields', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'item1' });
    await executeCatalogToolCall(mockClient, 'update_catalog_item', {
      sys_id: 'item1', fields: { short_description: 'Updated', active: false },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sc_cat_item', 'item1', {
      short_description: 'Updated', active: false,
    });
  });

  it('rejects undeclared fields before they reach the Table API', async () => {
    await expect(executeCatalogToolCall(mockClient, 'update_catalog_item', {
      sys_id: 'item1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Catalog item fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });
});
