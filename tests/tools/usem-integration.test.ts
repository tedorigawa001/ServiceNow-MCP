import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeUsemIntegrationToolCall,
  getUsemIntegrationToolDefinitions,
} from '../../src/tools/usem-integration.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const getRec = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('getUsemIntegrationToolDefinitions', () => {
  it('returns 6 tool definitions', () => {
    expect(getUsemIntegrationToolDefinitions().length).toBe(6);
  });

  it('exposes the expected tool names', () => {
    const names = getUsemIntegrationToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      [
        'get_integration_run',
        'list_integration_implementations',
        'list_integration_logs',
        'list_integration_runs',
        'list_integrations',
        'set_integration_active',
      ].sort()
    );
  });
});

describe('executeUsemIntegrationToolCall – unknown tool', () => {
  it('returns null to let the router fall through', async () => {
    expect(await executeUsemIntegrationToolCall(mockClient, 'nope', {})).toBeNull();
  });
});

describe('list_integrations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries the catalog table ordered by order', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ name: 'NVD' }, { name: 'CSAF' }] });
    const result = await executeUsemIntegrationToolCall(mockClient, 'list_integrations', {});
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_sec_int_integration');
    expect(call.orderBy).toBe('order');
    expect(result.summary).toContain('2 integration');
  });
});

describe('list_integration_implementations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by active and extra query', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'Manual Ingestion' }] });
    await executeUsemIntegrationToolCall(mockClient, 'list_integration_implementations', {
      active: true,
      query: 'is_default=true',
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_sec_int_impl');
    expect(call.query).toBe('active=true^is_default=true');
  });

  it('builds active=false correctly', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemIntegrationToolCall(mockClient, 'list_integration_implementations', { active: false });
    expect(qr().mock.calls[0][0].query).toBe('active=false');
  });
});

describe('list_integration_runs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a daysAgo + source + substate query, newest first', async () => {
    qr().mockResolvedValue({ count: 3, records: [] });
    await executeUsemIntegrationToolCall(mockClient, 'list_integration_runs', {
      source: 'NVD',
      substate: 'success',
      days: 30,
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_integration_run');
    expect(call.orderBy).toBe('-start_datetime');
    expect(call.query).toBe('start_datetime>=javascript:gs.daysAgo(30)^source=NVD^substate=success');
  });

  it('clamps days to the 1-365 range', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemIntegrationToolCall(mockClient, 'list_integration_runs', { days: 99999 });
    expect(qr().mock.calls[0][0].query).toBe('start_datetime>=javascript:gs.daysAgo(365)');
  });

  it('sanitizes source to strip query operators', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemIntegrationToolCall(mockClient, 'list_integration_runs', { source: 'NVD^ORDERBYx' });
    expect(qr().mock.calls[0][0].query).toBe('source=NVDORDERBYx');
  });

  it('produces an empty query when no filters given', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemIntegrationToolCall(mockClient, 'list_integration_runs', {});
    expect(qr().mock.calls[0][0].query).toBe('');
  });
});

describe('get_integration_run', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id when given a 32-char hex id', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemIntegrationToolCall(mockClient, 'get_integration_run', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_vul_integration_run', 'a'.repeat(32));
  });

  it('resolves by run number otherwise', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'VINTRUN0001013' }] });
    const result = await executeUsemIntegrationToolCall(mockClient, 'get_integration_run', {
      number_or_sysid: 'VINTRUN0001013',
    });
    expect(qr().mock.calls[0][0].query).toBe('number=VINTRUN0001013');
    expect(result.number).toBe('VINTRUN0001013');
  });

  it('throws NOT_FOUND when number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'get_integration_run', { number_or_sysid: 'VINTRUNxxxx' })
    ).rejects.toThrow('Integration run not found');
  });

  it('throws when identifier missing', async () => {
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'get_integration_run', {})
    ).rejects.toThrow('number_or_sysid is required');
  });
});

describe('list_integration_logs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes to a run and type, newest first', async () => {
    qr().mockResolvedValue({ count: 2, records: [] });
    await executeUsemIntegrationToolCall(mockClient, 'list_integration_logs', {
      integration_run: 'b'.repeat(32),
      type: 'error',
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_integration_log');
    expect(call.orderBy).toBe('-sys_created_on');
    expect(call.query).toBe(`integration_run=${'b'.repeat(32)}^type=error`);
  });

  it('rejects a malformed integration_run sys_id', async () => {
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'list_integration_logs', { integration_run: 'short' })
    ).rejects.toThrow('integration_run must be a 32-character sys_id');
  });
});

describe('set_integration_active', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'set_integration_active', { sys_id: 'a'.repeat(32), active: false })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('toggles active on the implementation table', async () => {
    process.env.WRITE_ENABLED = 'true';
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    const result = await executeUsemIntegrationToolCall(mockClient, 'set_integration_active', {
      sys_id: 'a'.repeat(32),
      active: false,
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_sec_int_impl', 'a'.repeat(32), { active: false });
    expect(result.summary).toContain('Disabled');
  });

  it('rejects a malformed sys_id', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'set_integration_active', { sys_id: 'short', active: true })
    ).rejects.toThrow('sys_id must be a 32-character hex string');
  });

  it('requires a boolean active', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'set_integration_active', { sys_id: 'a'.repeat(32), active: 'no' as any })
    ).rejects.toThrow('active (boolean) is required');
  });
});
