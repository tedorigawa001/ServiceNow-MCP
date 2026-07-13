import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeGrcIndicatorToolCall, getGrcIndicatorToolDefinitions } from '../../src/tools/grc-indicator.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const getRec = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const createRec = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;
const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getGrcIndicatorToolDefinitions', () => {
  it('returns the expected tool names', () => {
    const names = getGrcIndicatorToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      [
        'list_grc_indicators', 'get_grc_indicator', 'create_grc_indicator', 'update_grc_indicator',
        'list_indicator_results', 'get_indicator_result', 'get_grc_indicator_dashboard',
      ].sort()
    );
  });

  it('update_grc_indicator does not allow entity/item changes', () => {
    const tool = getGrcIndicatorToolDefinitions().find(t => t.name === 'update_grc_indicator')!;
    const fields = (tool.inputSchema.properties as any).fields;
    expect(fields.additionalProperties).toBe(false);
    expect(fields.properties).not.toHaveProperty('entity');
    expect(fields.properties).not.toHaveProperty('item');
  });

  it('create_grc_indicator requires entity and item', () => {
    const tool = getGrcIndicatorToolDefinitions().find(t => t.name === 'create_grc_indicator')!;
    expect(tool.inputSchema.required).toEqual(['entity', 'item']);
  });
});

describe('executeGrcIndicatorToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeGrcIndicatorToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('list_grc_indicators', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds entity/item/category/last_result_passed filter', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'IND1' }] });
    await executeGrcIndicatorToolCall(mockClient, 'list_grc_indicators', {
      entity: 'e1',
      item: 'i1',
      category: 'Compliance Indicator',
      last_result_passed: false,
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_grc_indicator');
    expect(call.query).toBe('entity=e1^item=i1^category=Compliance Indicator^last_result_passed=false');
  });
});

describe('get_grc_indicator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id when a 32-char hex id is given', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcIndicatorToolCall(mockClient, 'get_grc_indicator', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_grc_indicator', 'a'.repeat(32));
  });

  it('resolves by number', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'IND0020021' }] });
    const result = await executeGrcIndicatorToolCall(mockClient, 'get_grc_indicator', { number_or_sysid: 'IND0020021' });
    expect(result.number).toBe('IND0020021');
  });

  it('throws NOT_FOUND when number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeGrcIndicatorToolCall(mockClient, 'get_grc_indicator', { number_or_sysid: 'INDxxxx' })
    ).rejects.toThrow('GRC Indicator not found');
  });
});

describe('write tools – permission gating', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WRITE_ENABLED;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('create_grc_indicator is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeGrcIndicatorToolCall(mockClient, 'create_grc_indicator', { entity: 'e1', item: 'i1' })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('update_grc_indicator is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeGrcIndicatorToolCall(mockClient, 'update_grc_indicator', { sys_id: 'a'.repeat(32), fields: { category: 'x' } })
    ).rejects.toThrow('Write operations are disabled');
  });
});

describe('write tools – with WRITE_ENABLED', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('create_grc_indicator requires entity and item', async () => {
    await expect(
      executeGrcIndicatorToolCall(mockClient, 'create_grc_indicator', { entity: 'e1' })
    ).rejects.toThrow('entity and item are required');
  });

  it('create_grc_indicator sends only provided fields', async () => {
    createRec().mockResolvedValue({ sys_id: 'ind1', number: 'IND0020999' });
    const result = await executeGrcIndicatorToolCall(mockClient, 'create_grc_indicator', {
      entity: 'e1',
      item: 'i1',
      short_description: 'Access review passes',
      category: 'Compliance Indicator',
    });
    expect(createRec()).toHaveBeenCalledWith('sn_grc_indicator', {
      entity: 'e1',
      item: 'i1',
      short_description: 'Access review passes',
      category: 'Compliance Indicator',
    });
    expect(result.summary).toContain('IND0020999');
  });

  it('update_grc_indicator rejects entity/item as update fields', async () => {
    await expect(
      executeGrcIndicatorToolCall(mockClient, 'update_grc_indicator', { sys_id: 'a'.repeat(32), fields: { entity: 'e2' } })
    ).rejects.toThrow('cannot be updated');
  });

  it('update_grc_indicator patches allowed fields', async () => {
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcIndicatorToolCall(mockClient, 'update_grc_indicator', { sys_id: 'a'.repeat(32), fields: { category: 'Risk Indicator' } });
    expect(updateRec()).toHaveBeenCalledWith('sn_grc_indicator', 'a'.repeat(32), { category: 'Risk Indicator' });
  });
});

describe('list_indicator_results / get_indicator_result', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by indicator and passed', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcIndicatorToolCall(mockClient, 'list_indicator_results', { indicator: 'ind1', passed: true });
    expect(qr().mock.calls[0][0].table).toBe('sn_grc_indicator_result');
    expect(qr().mock.calls[0][0].query).toBe('indicator=ind1^passed=true');
  });

  it('get_indicator_result calls getRecord', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcIndicatorToolCall(mockClient, 'get_indicator_result', { sys_id: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_grc_indicator_result', 'a'.repeat(32));
  });
});

describe('get_grc_indicator_dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates by active, category, and last_result_passed', async () => {
    agg()
      .mockResolvedValueOnce([
        { stats: { count: '119' }, groupby_fields: [{ field: 'active', value: 'true' }] },
      ])
      .mockResolvedValueOnce([
        { stats: { count: '100' }, groupby_fields: [{ field: 'category', value: 'Compliance Indicator' }] },
        { stats: { count: '19' }, groupby_fields: [{ field: 'category', value: 'Risk Indicator' }] },
      ])
      .mockResolvedValueOnce([
        { stats: { count: '110' }, groupby_fields: [{ field: 'last_result_passed', value: 'true' }] },
        { stats: { count: '9' }, groupby_fields: [{ field: 'last_result_passed', value: 'false' }] },
      ]);

    const result = await executeGrcIndicatorToolCall(mockClient, 'get_grc_indicator_dashboard', {});

    expect(agg()).toHaveBeenCalledWith('sn_grc_indicator', 'active', 'COUNT');
    expect(agg()).toHaveBeenCalledWith('sn_grc_indicator', 'category', 'COUNT');
    expect(agg()).toHaveBeenCalledWith('sn_grc_indicator', 'last_result_passed', 'COUNT');
    expect(result.total).toBe(119);
    expect(result.failed_last_result).toBe(9);
  });

  // Regression test for the bug this fix addresses: total must NOT undercount when
  // some Indicators have no `category` set (category is a free-text, non-mandatory
  // field), unlike `active` which always has a value.
  it('total reflects active count even when category coverage is incomplete', async () => {
    agg()
      .mockResolvedValueOnce([
        { stats: { count: '119' }, groupby_fields: [{ field: 'active', value: 'true' }] },
      ])
      .mockResolvedValueOnce([
        // only 100 of 119 have a category set — total must still be 119, not 100
        { stats: { count: '100' }, groupby_fields: [{ field: 'category', value: 'Compliance Indicator' }] },
      ])
      .mockResolvedValueOnce([]);

    const result = await executeGrcIndicatorToolCall(mockClient, 'get_grc_indicator_dashboard', {});
    expect(result.total).toBe(119);
  });
});
