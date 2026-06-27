import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeUsemSlaToolCall, getUsemSlaToolDefinitions } from '../../src/tools/usem-sla.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const getRec = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('getUsemSlaToolDefinitions', () => {
  it('returns 5 tool definitions', () => {
    expect(getUsemSlaToolDefinitions().length).toBe(5);
  });

  it('exposes the expected tool names', () => {
    const names = getUsemSlaToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      ['get_group_sla', 'get_remediation_sla', 'list_remediation_sla', 'list_vr_notifications', 'set_remediation_commitment'].sort()
    );
  });
});

describe('executeUsemSlaToolCall – unknown tool', () => {
  it('returns null to let the router fall through', async () => {
    expect(await executeUsemSlaToolCall(mockClient, 'nope', { record_type: 'vi' })).toBeNull();
  });
});

describe('list_remediation_sla', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps vi to the VI table ordered by target date', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ number: 'VIT1' }] });
    const result = await executeUsemSlaToolCall(mockClient, 'list_remediation_sla', { record_type: 'vi' });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_vulnerable_item');
    expect(call.orderBy).toBe('ttr_target_date');
    expect(call.fields).toContain('number');
    expect(result.record_type).toBe('vi');
  });

  it('maps rt to the RT table and uses task_number', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemSlaToolCall(mockClient, 'list_remediation_sla', { record_type: 'rt' });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_remediation_task');
    expect(call.fields).toContain('task_number');
  });

  it('breached_only overrides ttr_status', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemSlaToolCall(mockClient, 'list_remediation_sla', {
      record_type: 'vi',
      breached_only: true,
      ttr_status: 'in_flight',
    });
    expect(qr().mock.calls[0][0].query).toBe('ttr_status=past_due');
  });

  it('uses ttr_statusIN for multiple statuses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemSlaToolCall(mockClient, 'list_remediation_sla', {
      record_type: 'vi',
      ttr_status: 'approaching,past_due',
    });
    expect(qr().mock.calls[0][0].query).toBe('ttr_statusINapproaching,past_due');
  });

  it('builds an upcoming-due window with gs.daysAgo bounds', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemSlaToolCall(mockClient, 'list_remediation_sla', {
      record_type: 'rt',
      due_within_days: 30,
      assignment_group: 'g1',
    });
    expect(qr().mock.calls[0][0].query).toBe(
      'ttr_target_date>=javascript:gs.daysAgo(0)^ttr_target_date<=javascript:gs.daysAgo(-30)^assignment_group=g1'
    );
  });

  it('maps vg to the task-based Vulnerability Group table', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemSlaToolCall(mockClient, 'list_remediation_sla', { record_type: 'vg', breached_only: true });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_vulnerability');
    expect(call.fields).toContain('number');
    expect(call.query).toBe('ttr_status=past_due');
  });

  it('rejects an unknown record_type', async () => {
    await expect(
      executeUsemSlaToolCall(mockClient, 'list_remediation_sla', { record_type: 'foo' })
    ).rejects.toThrow('record_type must be one of: vi, rt, vg');
  });
});

describe('get_remediation_sla', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes a breached assessment for past_due with an overdue date', async () => {
    const past = '2000-01-01 00:00:00';
    getRec().mockResolvedValue({
      sys_id: 'a'.repeat(32),
      number: 'VIT1',
      ttr_status: 'past_due',
      ttr_target_date: past,
      ttr_applied_rule: 'rule1',
    });
    const result = await executeUsemSlaToolCall(mockClient, 'get_remediation_sla', {
      record_type: 'vi',
      number_or_sysid: 'a'.repeat(32),
    });
    expect(getRec()).toHaveBeenCalledWith('sn_vul_vulnerable_item', 'a'.repeat(32));
    expect(result.breached).toBe(true);
    expect(result.ttr_status_label).toBe('Target Missed');
    expect(result.assessment).toContain('Breached');
    expect(result.days_to_target).toBeLessThan(0); // overdue
  });

  it('resolves by number and reports no-target cleanly', async () => {
    qr().mockResolvedValue({
      count: 1,
      records: [{ sys_id: 's1', number: 'VIT0010003', ttr_status: 'no_target', ttr_target_date: '' }],
    });
    const result = await executeUsemSlaToolCall(mockClient, 'get_remediation_sla', {
      record_type: 'vi',
      number_or_sysid: 'VIT0010003',
    });
    expect(qr().mock.calls[0][0].query).toBe('number=VIT0010003');
    expect(result.breached).toBe(false);
    expect(result.days_to_target).toBeNull();
    expect(result.assessment).toContain('No SLA target');
  });

  it('uses task_number for rt lookups', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 's2', task_number: 'RTASK1', ttr_status: 'in_flight' }] });
    await executeUsemSlaToolCall(mockClient, 'get_remediation_sla', {
      record_type: 'rt',
      number_or_sysid: 'RTASK1',
    });
    expect(qr().mock.calls[0][0].query).toBe('task_number=RTASK1');
  });

  it('resolves a vg group by VUL number and flags an overdue breach', async () => {
    qr().mockResolvedValue({
      count: 1,
      records: [{ sys_id: 's3', number: 'VUL0000103', ttr_status: 'past_due', ttr_target_date: '2021-03-25 08:00:00' }],
    });
    const result = await executeUsemSlaToolCall(mockClient, 'get_remediation_sla', {
      record_type: 'vg',
      number_or_sysid: 'VUL0000103',
    });
    expect(qr().mock.calls[0][0].table).toBe('sn_vul_vulnerability');
    expect(qr().mock.calls[0][0].query).toBe('number=VUL0000103');
    expect(result.breached).toBe(true);
    expect(result.days_to_target).toBeLessThan(0);
  });

  it('throws NOT_FOUND when number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemSlaToolCall(mockClient, 'get_remediation_sla', { record_type: 'vi', number_or_sysid: 'VITxxx' })
    ).rejects.toThrow('Vulnerable Item not found');
  });
});

describe('get_group_sla', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns both TTR and task_sla views for a group', async () => {
    qr()
      .mockResolvedValueOnce({
        count: 1,
        records: [{ sys_id: 's1', number: 'VUL0000103', ttr_status: 'past_due', ttr_target_date: '2021-03-25 08:00:00' }],
      })
      .mockResolvedValueOnce({ count: 1, records: [{ sla: 'Critical 30d', stage: 'in_progress', has_breached: 'true' }] });

    const result = await executeUsemSlaToolCall(mockClient, 'get_group_sla', { number_or_sysid: 'VUL0000103' });

    // first query resolves the group, second pulls task_sla keyed by the resolved sys_id
    expect(qr().mock.calls[0][0].table).toBe('sn_vul_vulnerability');
    expect(qr().mock.calls[0][0].query).toBe('number=VUL0000103');
    expect(qr().mock.calls[1][0].table).toBe('task_sla');
    expect(qr().mock.calls[1][0].query).toBe('task=s1');
    expect(result.ttr.breached).toBe(true);
    expect(result.task_sla.count).toBe(1);
    expect(result.summary).toContain('task_sla instance');
  });

  it('fetches by sys_id directly', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32), number: 'VUL1', ttr_status: 'in_flight' });
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemSlaToolCall(mockClient, 'get_group_sla', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_vul_vulnerability', 'a'.repeat(32));
    expect(qr().mock.calls[0][0].query).toBe(`task=${'a'.repeat(32)}`);
  });

  it('throws NOT_FOUND when the group number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemSlaToolCall(mockClient, 'get_group_sla', { number_or_sysid: 'VULxxxx' })
    ).rejects.toThrow('Vulnerability Group not found');
  });
});

describe('set_remediation_commitment', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(
      executeUsemSlaToolCall(mockClient, 'set_remediation_commitment', {
        record_type: 'vi',
        sys_id: 'a'.repeat(32),
        commitment_date: '2026-07-01 00:00:00',
      })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('writes remediation_commitment_dt_tm for vi', async () => {
    process.env.WRITE_ENABLED = 'true';
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemSlaToolCall(mockClient, 'set_remediation_commitment', {
      record_type: 'vi',
      sys_id: 'a'.repeat(32),
      commitment_date: '2026-07-01 00:00:00',
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_vul_vulnerable_item', 'a'.repeat(32), {
      remediation_commitment_dt_tm: '2026-07-01 00:00:00',
    });
  });

  it('writes ttr_target_date for rt', async () => {
    process.env.WRITE_ENABLED = 'true';
    updateRec().mockResolvedValue({ sys_id: 'b'.repeat(32) });
    await executeUsemSlaToolCall(mockClient, 'set_remediation_commitment', {
      record_type: 'rt',
      sys_id: 'b'.repeat(32),
      commitment_date: '2026-07-15 12:00:00',
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_vul_remediation_task', 'b'.repeat(32), {
      ttr_target_date: '2026-07-15 12:00:00',
    });
  });

  it('rejects a malformed sys_id', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(
      executeUsemSlaToolCall(mockClient, 'set_remediation_commitment', {
        record_type: 'vi',
        sys_id: 'short',
        commitment_date: 'x',
      })
    ).rejects.toThrow('sys_id must be a 32-character hex string');
  });
});

describe('list_vr_notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scopes to the VR table family by default', async () => {
    qr().mockResolvedValue({ count: 5, records: [] });
    await executeUsemSlaToolCall(mockClient, 'list_vr_notifications', { active: true });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sysevent_email_action');
    expect(call.query).toBe('collectionSTARTSWITHsn_vul^ORcollectionSTARTSWITHsn_sec^active=true');
  });

  it('restricts to a single collection when table is given', async () => {
    qr().mockResolvedValue({ count: 5, records: [] });
    await executeUsemSlaToolCall(mockClient, 'list_vr_notifications', {
      table: 'sn_vul_vulnerable_item',
      name_contains: 'False positive',
    });
    expect(qr().mock.calls[0][0].query).toBe('collection=sn_vul_vulnerable_item^nameCONTAINSFalse positive');
  });
});
