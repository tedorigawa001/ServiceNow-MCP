import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeGrcRiskToolCall, getGrcRiskToolDefinitions } from '../../src/tools/grc-risk.js';
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

describe('getGrcRiskToolDefinitions', () => {
  it('returns the expected tool names', () => {
    const names = getGrcRiskToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      [
        'list_risks', 'get_risk', 'create_risk', 'update_risk',
        'list_risk_statements', 'get_risk_statement', 'list_risk_criteria',
        'get_grc_risk_dashboard',
      ].sort()
    );
  });

  it('update_risk does not allow impact/likelihood/score (confirmed non-writable)', () => {
    const tool = getGrcRiskToolDefinitions().find(t => t.name === 'update_risk')!;
    const fields = (tool.inputSchema.properties as any).fields;
    expect(fields.additionalProperties).toBe(false);
    for (const forbidden of ['impact', 'likelihood', 'residual_impact', 'residual_likelihood', 'score', 'residual_score', 'justification', 'response', 'classification', 'owner']) {
      expect(fields.properties).not.toHaveProperty(forbidden);
    }
  });

  it('create_risk does not expose impact/likelihood as parameters', () => {
    const tool = getGrcRiskToolDefinitions().find(t => t.name === 'create_risk')!;
    expect(tool.inputSchema.properties).not.toHaveProperty('impact');
    expect(tool.inputSchema.properties).not.toHaveProperty('likelihood');
  });
});

describe('executeGrcRiskToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeGrcRiskToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('list_risks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a state + profile + category filter', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'RK1' }] });
    await executeGrcRiskToolCall(mockClient, 'list_risks', { state: 'assess', profile: 'p1', category: 'Operational' });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_risk_risk');
    expect(call.query).toBe('state=assess^profile=p1^category=Operational');
  });

  it('uses stateIN for comma-separated states', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcRiskToolCall(mockClient, 'list_risks', { state: 'draft,assess' });
    expect(qr().mock.calls[0][0].query).toBe('stateINdraft,assess');
  });
});

describe('get_risk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id when a 32-char hex id is given', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcRiskToolCall(mockClient, 'get_risk', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_risk_risk', 'a'.repeat(32));
  });

  it('resolves by number', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'RK0020310' }] });
    const result = await executeGrcRiskToolCall(mockClient, 'get_risk', { number_or_sysid: 'RK0020310' });
    expect(qr().mock.calls[0][0].query).toBe('number=RK0020310');
    expect(result.number).toBe('RK0020310');
  });

  it('throws NOT_FOUND when number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeGrcRiskToolCall(mockClient, 'get_risk', { number_or_sysid: 'RKxxxx' })
    ).rejects.toThrow('Risk not found');
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

  it('create_risk is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeGrcRiskToolCall(mockClient, 'create_risk', { statement: 's1' })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('update_risk is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeGrcRiskToolCall(mockClient, 'update_risk', { sys_id: 'a'.repeat(32), fields: { category: 'x' } })
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

  it('create_risk requires statement', async () => {
    await expect(executeGrcRiskToolCall(mockClient, 'create_risk', {})).rejects.toThrow('statement is required');
  });

  it('create_risk sends only the confirmed-writable fields', async () => {
    createRec().mockResolvedValue({ sys_id: 'r1', number: 'RK0020999' });
    const result = await executeGrcRiskToolCall(mockClient, 'create_risk', {
      statement: 'stmt1',
      profile: 'p1',
      category: 'Operational',
      owning_group: 'g1',
    });
    expect(createRec()).toHaveBeenCalledWith('sn_risk_risk', {
      statement: 'stmt1',
      profile: 'p1',
      category: 'Operational',
      owning_group: 'g1',
    });
    expect(result.summary).toContain('RK0020999');
  });

  it('update_risk rejects fields confirmed non-persistent on this instance', async () => {
    await expect(
      executeGrcRiskToolCall(mockClient, 'update_risk', { sys_id: 'a'.repeat(32), fields: { impact: 'x' } })
    ).rejects.toThrow('cannot be updated');
    await expect(
      executeGrcRiskToolCall(mockClient, 'update_risk', { sys_id: 'a'.repeat(32), fields: { justification: 'x' } })
    ).rejects.toThrow('cannot be updated');
  });

  it('update_risk patches allowed fields', async () => {
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcRiskToolCall(mockClient, 'update_risk', { sys_id: 'a'.repeat(32), fields: { category: 'Financial' } });
    expect(updateRec()).toHaveBeenCalledWith('sn_risk_risk', 'a'.repeat(32), { category: 'Financial' });
  });
});

describe('list_risk_statements / get_risk_statement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by name', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'Loss of Availability' }] });
    await executeGrcRiskToolCall(mockClient, 'list_risk_statements', { name: 'Loss' });
    expect(qr().mock.calls[0][0].table).toBe('sn_risk_definition');
    expect(qr().mock.calls[0][0].query).toBe('nameLIKELoss');
  });

  it('get_risk_statement calls getRecord', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcRiskToolCall(mockClient, 'get_risk_statement', { sys_id: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_risk_definition', 'a'.repeat(32));
  });
});

describe('list_risk_criteria', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by type when provided', async () => {
    qr().mockResolvedValue({ count: 5, records: [] });
    await executeGrcRiskToolCall(mockClient, 'list_risk_criteria', { type: 'impact' });
    expect(qr().mock.calls[0][0].table).toBe('sn_risk_criteria');
    expect(qr().mock.calls[0][0].query).toBe('type=impact');
  });

  it('lists all criteria with no filter', async () => {
    qr().mockResolvedValue({ count: 15, records: [] });
    await executeGrcRiskToolCall(mockClient, 'list_risk_criteria', {});
    expect(qr().mock.calls[0][0].query).toBe('');
  });
});

describe('get_grc_risk_dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates risk counts by state and lists top risks by score', async () => {
    agg().mockResolvedValue([
      { stats: { count: '287' }, groupby_fields: [{ field: 'state', value: 'monitor' }] },
      { stats: { count: '17' }, groupby_fields: [{ field: 'state', value: 'retired' }] },
    ]);
    qr().mockResolvedValue({ count: 2, records: [{ number: 'RK1' }, { number: 'RK2' }] });

    const result = await executeGrcRiskToolCall(mockClient, 'get_grc_risk_dashboard', { top: 2 });

    expect(agg()).toHaveBeenCalledWith('sn_risk_risk', 'state', 'COUNT');
    expect(result.risks.total).toBe(304);
    expect(result.risks.open).toBe(287); // retired excluded
    expect(result.top_risks_by_score).toHaveLength(2);
    expect(qr().mock.calls[0][0].orderBy).toBe('-score');
  });
});
