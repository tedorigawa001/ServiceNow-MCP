import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSamToolDefinitions, executeSamToolCall } from '../../src/tools/sam.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;

describe('getSamToolDefinitions', () => {
  it('returns all eleven SAM Pro read tools', () => {
    const defs = getSamToolDefinitions();
    expect(defs.map(d => d.name)).toEqual([
      'list_software_installs',
      'get_software_install',
      'list_software_products',
      'list_license_positions',
      'get_license_position_summary',
      'list_software_discovery_models',
      'list_software_models',
      'get_software_model',
      'list_software_lifecycle_reports',
      'get_software_lifecycle_report',
      'list_software_lifecycle_entries',
    ]);
    expect(defs.find(d => d.name === 'get_software_install')?.inputSchema.required).toContain('sys_id');
    expect(defs.find(d => d.name === 'get_software_model')?.inputSchema.required).toContain('sys_id');
    expect(defs.find(d => d.name === 'get_software_lifecycle_report')?.inputSchema.required).toContain('sys_id');
  });
});

describe('executeSamToolCall', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null for an unrelated tool name', async () => {
    expect(await executeSamToolCall(mockClient, 'other', {})).toBeNull();
  });

  it('lists software installs filtered to unlicensed only', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'a', display_name: 'Foo' }] });
    const result = await executeSamToolCall(mockClient, 'list_software_installs', { unlicensed_only: true, limit: 5 });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'cmdb_sam_sw_install',
      query: 'unlicensed_install=true',
      limit: 5,
      display_value: true,
    }));
    expect(result.count).toBe(1);
  });

  it('combines publisher and product filters with ^', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_software_installs', { publisher: 'Microsoft', product: 'Office' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: 'norm_publisherLIKEMicrosoft^norm_productLIKEOffice',
    }));
  });

  it('requires sys_id for get_software_install', async () => {
    await expect(executeSamToolCall(mockClient, 'get_software_install', {})).rejects.toThrow('sys_id');
  });

  it('fetches a single software install by sys_id', async () => {
    gr().mockResolvedValue({ sys_id: 'abc', display_name: 'Foo' });
    const result = await executeSamToolCall(mockClient, 'get_software_install', { sys_id: 'abc' });
    expect(gr()).toHaveBeenCalledWith('cmdb_sam_sw_install', 'abc');
    expect(result.sys_id).toBe('abc');
  });

  it('lists software products with publisher/name filters', async () => {
    qr().mockResolvedValue({ count: 2, records: [] });
    await executeSamToolCall(mockClient, 'list_software_products', { publisher: 'Oracle', name: 'DB' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'samp_sw_product',
      query: 'publisherLIKEOracle^prod_nameLIKEDB',
    }));
  });

  it('lists license positions filtered to over-licensed only', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_license_positions', { over_licensed_only: true });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'samp_license_position_report',
      query: 'over_licensed_amount>0',
    }));
  });

  it('aggregates license position summary without display_value (currency-string safe)', async () => {
    qr().mockResolvedValue({
      count: 3,
      records: [
        { over_licensed_amount: '100', potential_savings: '50', true_up_cost: '0' },
        { over_licensed_amount: '0', potential_savings: '0', true_up_cost: '200' },
        { over_licensed_amount: '0', potential_savings: '0', true_up_cost: '0' },
      ],
    });
    const result = await executeSamToolCall(mockClient, 'get_license_position_summary', {});
    const callArgs = qr().mock.calls[0][0];
    expect(callArgs.table).toBe('samp_license_position_report');
    expect(callArgs).not.toHaveProperty('display_value');
    expect(result).toEqual({
      products_evaluated: 3,
      over_licensed_count: 1,
      under_licensed_count: 1,
      total_potential_savings: 50,
      total_true_up_cost: 200,
    });
  });

  it('lists software discovery models filtered by approval status', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_software_discovery_models', { approved: false });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'cmdb_sam_sw_discovery_model',
      query: 'approved=false',
    }));
  });

  it('lists software models with dot-walked publisher/product filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_software_models', { publisher: 'Microsoft', product: 'Windows' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'cmdb_software_product_model',
      query: 'manufacturer.nameLIKEMicrosoft^product.prod_nameLIKEWindows',
    }));
  });

  it('requires sys_id for get_software_model', async () => {
    await expect(executeSamToolCall(mockClient, 'get_software_model', {})).rejects.toThrow('sys_id');
  });

  it('fetches a single software model by sys_id', async () => {
    gr().mockResolvedValue({ sys_id: 'm1' });
    const result = await executeSamToolCall(mockClient, 'get_software_model', { sys_id: 'm1' });
    expect(gr()).toHaveBeenCalledWith('cmdb_software_product_model', 'm1');
    expect(result.sys_id).toBe('m1');
  });

  it('normalizes a display-label current_phase to its internal choice value', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_software_lifecycle_reports', { current_phase: 'End of extended support' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sam_sw_product_lifecycle_report',
      query: 'current_lifecycle_phase=end_of_extended_support',
    }));
  });

  it('requires sys_id for get_software_lifecycle_report', async () => {
    await expect(executeSamToolCall(mockClient, 'get_software_lifecycle_report', {})).rejects.toThrow('sys_id');
  });

  it('fetches a single lifecycle report by sys_id', async () => {
    gr().mockResolvedValue({ sys_id: 'r1' });
    const result = await executeSamToolCall(mockClient, 'get_software_lifecycle_report', { sys_id: 'r1' });
    expect(gr()).toHaveBeenCalledWith('sam_sw_product_lifecycle_report', 'r1');
    expect(result.sys_id).toBe('r1');
  });

  it('lists lifecycle master-data entries defaulting to active=true', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_software_lifecycle_entries', {});
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sam_sw_product_lifecycle',
      query: 'active=true',
    }));
  });

  it('normalizes a display-label risk to its internal choice value (the sys_choice bug fix)', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_software_lifecycle_entries', { risk: 'Very High', lifecycle_phase: 'End of life' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sam_sw_product_lifecycle',
      query: 'active=true^lifecycle_phase=end_of_life^risk=very_high',
    }));
  });

  it('passes through an already-internal choice value unchanged', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeSamToolCall(mockClient, 'list_software_lifecycle_entries', { risk: 'very_high' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: 'active=true^risk=very_high',
    }));
  });
});
