import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeItamToolCall, getItamToolDefinitions } from '../../src/tools/itam.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const ur = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('executeItamToolCall – asset scope and update fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('queries a documented asset table', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    await executeItamToolCall(mockClient, 'list_assets', { asset_class: 'alm_hardware' });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'alm_hardware' }));
  });

  it('rejects a non-asset table before it reaches queryRecords', async () => {
    await expect(executeItamToolCall(mockClient, 'list_assets', { asset_class: 'sys_user' }))
      .rejects.toThrow('Unsupported asset class: sys_user');
    expect(mockClient.queryRecords).not.toHaveBeenCalled();
  });

  it('allows documented asset lifecycle updates', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'asset1' });
    await executeItamToolCall(mockClient, 'update_asset', {
      sys_id: 'asset1', fields: { assigned_to: 'user1', install_status: '1', work_notes: 'Issued' },
    });
    expect(mockClient.updateRecord).toHaveBeenCalledWith('alm_asset', 'asset1', {
      assigned_to: 'user1', install_status: '1', work_notes: 'Issued',
    });
  });

  it('rejects undeclared asset fields before they reach the Table API', async () => {
    await expect(executeItamToolCall(mockClient, 'update_asset', {
      sys_id: 'asset1', fields: { sys_domain: 'global', u_unlisted: 'yes' },
    })).rejects.toThrow('Asset fields cannot be updated: sys_domain, u_unlisted');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  describe('get_license_optimization', () => {
    // Regression test: total_licenses previously came from the capped
    // queryRecords(limit:100) page, so any table with more than 100 licenses
    // reported a total that was silently stuck at 100. Fixed to source the
    // true total from an ungrouped aggregate query while still sampling
    // records for the per-license recommendations.
    it('reports a true total from the aggregate query, not the capped sample size', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 100,
        records: [
          { sys_id: 'l1', display_name: 'Adobe', product: 'Acrobat', license_count: 50, license_inuse: 10, license_available: 40 },
        ],
      });
      (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ stats: { count: '350' } });

      const result = await executeItamToolCall(mockClient, 'get_license_optimization', {});

      expect(mockClient.runAggregateQuery).toHaveBeenCalledWith('alm_license', undefined, 'COUNT', undefined);
      expect(result.total_licenses).toBe(350);
      expect(result.analyzed_licenses).toBe(100);
      expect(result.note).toContain('sample of 100 of 350');
    });

    it('strips ^ from software_name so it cannot inject extra encoded-query clauses', async () => {
      (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
      (mockClient.runAggregateQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ stats: { count: '0' } });
      await executeItamToolCall(mockClient, 'get_license_optimization', { software_name: 'Adobe^ORactive=true' });
      expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ query: 'display_nameLIKEAdobeORactive=true' }));
    });
  });
});

describe('getItamToolDefinitions', () => {
  it('returns exactly 10 ITAM tool definitions', () => {
    expect(getItamToolDefinitions().length).toBe(10);
  });

  it('all tools have name, description and inputSchema', () => {
    getItamToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeItamToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeItamToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('get_asset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sys_id', async () => {
    await expect(executeItamToolCall(mockClient, 'get_asset', {})).rejects.toThrow('sys_id is required');
  });

  it('delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 'a1', display_name: 'Laptop A' });
    const result = await executeItamToolCall(mockClient, 'get_asset', { sys_id: 'a1' });
    expect(gr()).toHaveBeenCalledWith('alm_asset', 'a1');
    expect(result.display_name).toBe('Laptop A');
  });
});

describe('create_asset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeItamToolCall(mockClient, 'create_asset', { display_name: 'Laptop' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires display_name', async () => {
    await expect(executeItamToolCall(mockClient, 'create_asset', {})).rejects.toThrow('display_name is required');
  });

  it('creates the asset', async () => {
    cr().mockResolvedValue({ sys_id: 'a1' });
    const result = await executeItamToolCall(mockClient, 'create_asset', { display_name: 'Laptop A', serial_number: 'SN1' });
    expect(cr()).toHaveBeenCalledWith('alm_asset', expect.objectContaining({ display_name: 'Laptop A', serial_number: 'SN1' }));
    expect(result.action).toBe('created');
  });
});

describe('retire_asset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeItamToolCall(mockClient, 'retire_asset', { sys_id: 'a1' })).rejects.toThrow('Write operations are disabled');
  });

  it('requires sys_id', async () => {
    await expect(executeItamToolCall(mockClient, 'retire_asset', {})).rejects.toThrow('sys_id is required');
  });

  it('sets install_status to retired', async () => {
    ur().mockResolvedValue({ sys_id: 'a1' });
    const result = await executeItamToolCall(mockClient, 'retire_asset', { sys_id: 'a1', disposal_reason: 'EOL' });
    expect(ur()).toHaveBeenCalledWith('alm_asset', 'a1', { install_status: 'retired', disposal_reason: 'EOL' });
    expect(result.action).toBe('retired');
  });
});

describe('list_software_licenses', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries alm_license', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeItamToolCall(mockClient, 'list_software_licenses', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'alm_license' }));
  });
});

describe('get_license_compliance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports compliant vs over-licensed status per license', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [
        { display_name: 'Adobe', product: 'Acrobat', license_count: '10', license_inuse: '5', license_available: '5' },
        { display_name: 'Zoom', product: 'Zoom Pro', license_count: '5', license_inuse: '8', license_available: '0' },
      ],
    });
    const result = await executeItamToolCall(mockClient, 'get_license_compliance', {});
    expect(result.compliance_report[0].compliance).toBe('compliant');
    expect(result.compliance_report[1].compliance).toBe('over-licensed');
  });

  it('scopes to a single license when license_sys_id is given', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ display_name: 'Adobe', license_count: '10', license_inuse: '5' }] });
    await executeItamToolCall(mockClient, 'get_license_compliance', { license_sys_id: 'l1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'sys_id=l1', limit: 1 }));
  });
});

describe('list_asset_contracts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to active=true and filters by asset_sys_id', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeItamToolCall(mockClient, 'list_asset_contracts', { asset_sys_id: 'a1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'ast_contract', query: 'active=true^asset=a1' }));
  });
});

describe('track_asset_lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(executeItamToolCall(mockClient, 'track_asset_lifecycle', { asset_id: 'a1', new_stage: 'retired' }))
      .rejects.toThrow('Write operations are disabled');
  });

  it('requires asset_id and new_stage', async () => {
    await expect(executeItamToolCall(mockClient, 'track_asset_lifecycle', {})).rejects.toThrow('asset_id and new_stage are required');
  });

  it('resolves a non-sys_id asset_id by tag before updating', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'a1' }] });
    ur().mockResolvedValue({ sys_id: 'a1' });
    const result = await executeItamToolCall(mockClient, 'track_asset_lifecycle', { asset_id: 'TAG-001', new_stage: 'retired' });
    expect(ur()).toHaveBeenCalledWith('alm_asset', 'a1', { install_status: '8', work_notes: '' });
    expect(result.action).toBe('lifecycle_updated');
  });

  it('throws NOT_FOUND when the tag does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeItamToolCall(mockClient, 'track_asset_lifecycle', { asset_id: 'TAG-999', new_stage: 'retired' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('strips ^ from a non-hex asset_id so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'a1' }] });
    ur().mockResolvedValue({ sys_id: 'a1' });
    await executeItamToolCall(mockClient, 'track_asset_lifecycle', { asset_id: 'TAG-001^ORactive=true', new_stage: 'in_use' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'asset_tag=TAG-001ORactive=true^ORsys_id=TAG-001ORactive=true' }));
  });
});
