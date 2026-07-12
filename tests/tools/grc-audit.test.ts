import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGrcAuditToolCall, getGrcAuditToolDefinitions } from '../../src/tools/grc-audit.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const getRec = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getGrcAuditToolDefinitions', () => {
  it('returns the expected tool names', () => {
    const names = getGrcAuditToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      [
        'list_audit_engagements',
        'get_audit_engagement',
        'list_audit_control_tests',
        'get_audit_control_test',
        'get_grc_audit_dashboard',
      ].sort()
    );
  });

  it('all tools have name, description and inputSchema', () => {
    getGrcAuditToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeGrcAuditToolCall – unknown tool', () => {
  it('returns null so the router can fall through', async () => {
    expect(await executeGrcAuditToolCall(mockClient, 'not_a_grc_audit_tool', {})).toBeNull();
  });
});

describe('list_audit_engagements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a stateIN clause for comma-separated states', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcAuditToolCall(mockClient, 'list_audit_engagements', { state: '-5,1,2' });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_audit_engagement');
    expect(call.query).toBe('stateIN-5,1,2');
  });

  it('filters by single state and engagement_type', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ number: 'ENG1' }, { number: 'ENG2' }] });
    const result = await executeGrcAuditToolCall(mockClient, 'list_audit_engagements', { state: '3', engagement_type: '4' });
    expect(qr().mock.calls[0][0].query).toBe('state=3^engagement_type=4');
    expect(result.count).toBe(2);
    expect(result.summary).toContain('2 audit engagement');
  });

  it('sanitizes query-breaking characters in filter values', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcAuditToolCall(mockClient, 'list_audit_engagements', { engagement_type: '4^ORactive=false' });
    expect(qr().mock.calls[0][0].query).not.toContain('^OR');
  });
});

describe('get_audit_engagement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id when a 32-char hex id is given', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcAuditToolCall(mockClient, 'get_audit_engagement', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_audit_engagement', 'a'.repeat(32));
  });

  it('resolves by number when not a sys_id', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'ENG0000104' }] });
    const result = await executeGrcAuditToolCall(mockClient, 'get_audit_engagement', { number_or_sysid: 'ENG0000104' });
    expect(qr().mock.calls[0][0].query).toBe('number=ENG0000104');
    expect(result.number).toBe('ENG0000104');
  });

  it('throws NOT_FOUND when number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeGrcAuditToolCall(mockClient, 'get_audit_engagement', { number_or_sysid: 'ENGxxxx' })
    ).rejects.toThrow('Audit Engagement not found');
  });

  it('throws when identifier missing', async () => {
    await expect(executeGrcAuditToolCall(mockClient, 'get_audit_engagement', {})).rejects.toThrow('number_or_sysid is required');
  });
});

describe('list_audit_control_tests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by control, test_plan, and effectiveness', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'CTR1' }] });
    await executeGrcAuditToolCall(mockClient, 'list_audit_control_tests', {
      control: 'c1',
      test_plan: 'tp1',
      design_effectiveness: 'ineffective',
    });
    expect(qr().mock.calls[0][0].table).toBe('sn_audit_control_test');
    expect(qr().mock.calls[0][0].query).toBe('control=c1^test_plan=tp1^design_effectiveness=ineffective');
  });
});

describe('get_audit_control_test', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves by number', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'CTR0000153' }] });
    const result = await executeGrcAuditToolCall(mockClient, 'get_audit_control_test', { number_or_sysid: 'CTR0000153' });
    expect(qr().mock.calls[0][0].query).toBe('number=CTR0000153');
    expect(result.number).toBe('CTR0000153');
  });

  it('throws NOT_FOUND when not found', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeGrcAuditToolCall(mockClient, 'get_audit_control_test', { number_or_sysid: 'CTRxxxx' })
    ).rejects.toThrow('Control Test not found');
  });
});

describe('get_grc_audit_dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates engagement/control-test counts and lists top open engagements', async () => {
    agg()
      .mockResolvedValueOnce([
        { stats: { count: '13' }, groupby_fields: [{ field: 'state', value: '3' }] },
        { stats: { count: '5' }, groupby_fields: [{ field: 'state', value: '-5' }] },
      ])
      .mockResolvedValueOnce([
        { stats: { count: '10' }, groupby_fields: [{ field: 'design_effectiveness', value: 'effective' }] },
      ]);
    qr().mockResolvedValue({ count: 2, records: [{ number: 'ENG1' }, { number: 'ENG2' }] });

    const result = await executeGrcAuditToolCall(mockClient, 'get_grc_audit_dashboard', { top: 2 });

    expect(agg()).toHaveBeenCalledWith('sn_audit_engagement', 'state', 'COUNT');
    expect(agg()).toHaveBeenCalledWith('sn_audit_control_test', 'design_effectiveness', 'COUNT');
    expect(result.engagements.total).toBe(18);
    expect(result.engagements.open).toBe(5); // state 3 (Closed Complete) excluded
    expect(result.control_tests.total).toBe(10);
    expect(result.top_open_engagements_by_priority_issues).toHaveLength(2);
    expect(qr().mock.calls[0][0].limit).toBe(2);
    expect(qr().mock.calls[0][0].orderBy).toBe('-high_priority_issues');
  });

  it('clamps top to >=1', async () => {
    agg().mockResolvedValue([]);
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcAuditToolCall(mockClient, 'get_grc_audit_dashboard', { top: 0 });
    expect(qr().mock.calls[0][0].limit).toBe(5);
  });
});
