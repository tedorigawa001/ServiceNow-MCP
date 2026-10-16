import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeUsemIntegrationToolCall,
  isSecretParameter,
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
  it('returns 7 tool definitions', () => {
    expect(getUsemIntegrationToolDefinitions().length).toBe(7);
  });

  it('exposes the expected tool names', () => {
    const names = getUsemIntegrationToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      [
        'get_integration_run',
        'list_integration_implementations',
        'list_integration_logs',
        'list_integration_parameters',
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

describe('list_integration_parameters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('definition scope queries sn_sec_int_config, optionally filtered by integration', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'csaf_import_type', elem_type: 'string', default_value: 'x' }] });
    const result = await executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', {
      scope: 'definition',
      integration: 'b'.repeat(32),
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_sec_int_config');
    expect(call.query).toBe(`integration=${'b'.repeat(32)}`);
    expect(call.fields).not.toContain('password_value');
    expect(result.records[0].default_value).toBe('x');
    expect(result.summary).toContain('parameter definition');
  });

  it('instance scope queries sn_sec_int_impl_config with dot-walked definition fields', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ 'configuration.name': 'proxy_host', value: 'proxy.local' }] });
    const result = await executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', {
      scope: 'instance',
      implementation: 'c'.repeat(32),
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_sec_int_impl_config');
    expect(call.query).toBe(`implementation=${'c'.repeat(32)}`);
    expect(call.fields).toContain('configuration.elem_type');
    expect(call.fields).not.toContain('password_value');
    expect(result.records[0].value).toBe('proxy.local');
  });

  it('masks values of password-typed parameters', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [
        { 'configuration.name': 'client_id', 'configuration.elem_type': 'string', value: 'abc' },
        { 'configuration.name': 'client_secret_field', 'configuration.elem_type': 'password2', value: 's3cr3t' },
      ],
    });
    const result = await executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope: 'instance' });
    expect(result.records[0].value).toBe('abc');
    expect(result.records[1].value).toBe('***MASKED***');
  });

  it('masks by secret-looking name/label even when elem_type is plain string', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [
        { name: 'api_key', label: 'API Key', elem_type: 'string', default_value: 'k-123' },
        { name: 'import_type', label: 'Import Type', elem_type: 'string', default_value: 'full' },
      ],
    });
    const result = await executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope: 'definition' });
    expect(result.records[0].default_value).toBe('***MASKED***');
    expect(result.records[1].default_value).toBe('full');
  });

  it.each([
    'Access Key', 'Secret Access Key', 'Client Key', 'client_key', 'Passphrase', 'Pass code', 'Auth Token',
    'Authorization', 'Bearer', 'Signing Key', 'Subscription Key', 'Shared Key', 'Private key',
    'Key Secret', 'PIN', 'Certificate Key', 'Session cookie', 'APIKey', 'API-Key', 'passwd',
  ])('treats "%s" as a secret label', label => {
    expect(isSecretParameter('neutral_name', label, 'string')).toBe(true);
  });

  it.each([
    'Authentication type', 'Primary key field', 'Key', 'Page size for only CVEs', 'URL', 'Import Starttime Buffer',
    'Pinned version', 'Spinner delay', 'Keyword filter', 'days_chunk',
  ])('does not hide the ordinary setting "%s"', label => {
    expect(isSecretParameter('neutral_name', label, 'string')).toBe(false);
  });

  // \bpin\b missed user_pin / pin_code because \b treats "_" as part of the word.
  it.each([
    ['user_pin', 'Ordinary value'], ['pin_code', 'Ordinary value'], ['admin-pin', 'Ordinary value'],
    ['userPin', 'Ordinary value'], ['pinCode', 'Ordinary value'], ['PINCode', 'Ordinary value'],
    ['pin', 'Ordinary value'], ['neutral_name', 'User PIN'], ['neutral_name', 'pin'],
  ])('treats the PIN-bearing name/label "%s" / "%s" as secret', (name, label) => {
    expect(isSecretParameter(name, label, 'string')).toBe(true);
  });

  it.each([
    ['pinned_version', 'Pinned version'], ['spinner_delay', 'Spinner delay'], ['pinpoint_region', 'Pinpoint region'],
    ['shipping_option', 'Shipping option'], ['opinion_score', 'Opinion score'], ['pinned', 'Pinned'],
    ['mapping_rule', 'Mapping rule'], ['pingInterval', 'Ping interval'],
  ])('keeps the ordinary setting "%s" / "%s" visible', (name, label) => {
    expect(isSecretParameter(name, label, 'string')).toBe(false);
  });

  it.each(['definition', 'instance'])('masks a user_pin value in %s scope even when the label has no PIN', async scope => {
    const prefix = scope === 'instance' ? 'configuration.' : '';
    const field = scope === 'instance' ? 'value' : 'default_value';
    qr().mockResolvedValue({ count: 2, records: [
      { [`${prefix}name`]: 'user_pin', [`${prefix}label`]: 'Ordinary value', [`${prefix}elem_type`]: 'string', [field]: 'DUMMY-NOT-A-CREDENTIAL' },
      { [`${prefix}name`]: 'pinned_version', [`${prefix}label`]: 'Pinned version', [`${prefix}elem_type`]: 'string', [field]: '2.4.0' },
    ] });
    const result = await executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope });
    expect(result.records[0][field]).toBe('***MASKED***');
    expect(result.records[1][field]).toBe('2.4.0');
  });

  it('always masks password-typed parameters, whatever their label', () => {
    expect(isSecretParameter('x', 'Ordinary value', 'password')).toBe(true);
    expect(isSecretParameter('x', 'Ordinary value', 'password2')).toBe(true);
  });

  it.each([
    'valueSTARTSWITHa', 'default_valueLIKEabc', 'nameLIKEkey^ORvalue=secret', 'configuration.default_valueSTARTSWITHx',
    'ORDERBYvalue', 'ORDERBYDESCdefault_value', 'password_valueISNOTEMPTY', 'nameLIKEa^NQvalueLIKEb',
  ])('rejects a query that filters or sorts on a value column: %s', async query => {
    for (const scope of ['definition', 'instance']) {
      await expect(executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope, query }))
        .rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringContaining('would reveal the value') });
    }
    expect(qr()).not.toHaveBeenCalled();
  });

  it.each(['nameLIKEkey', 'elem_type=password', 'labelSTARTSWITHAPI^ORDERBYname', 'mandatory=true'])('allows a query on metadata columns: %s', async query => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope: 'definition', query })).resolves.toBeTruthy();
  });

  it.each(['definition', 'instance'])('masks a label-only API Key in %s scope', async scope => {
    const prefix = scope === 'instance' ? 'configuration.' : '';
    const field = scope === 'instance' ? 'value' : 'default_value';
    qr().mockResolvedValue({ count: 1, records: [{
      [`${prefix}name`]: 'endpoint_hint', [`${prefix}label`]: 'API Key',
      [`${prefix}elem_type`]: 'string', [field]: 'DUMMY-NOT-A-CREDENTIAL',
    }] });
    const result = await executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope });
    expect(result.records[0][field]).toBe('***MASKED***');
  });

  it('rejects an invalid scope', async () => {
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope: 'both' })
    ).rejects.toThrow('scope must be "definition" or "instance"');
  });

  it('rejects malformed integration/implementation sys_ids', async () => {
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope: 'definition', integration: 'short' })
    ).rejects.toThrow('integration must be a 32-character sys_id');
    await expect(
      executeUsemIntegrationToolCall(mockClient, 'list_integration_parameters', { scope: 'instance', implementation: 'short' })
    ).rejects.toThrow('implementation must be a 32-character sys_id');
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
