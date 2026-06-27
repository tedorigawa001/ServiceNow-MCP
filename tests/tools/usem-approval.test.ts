import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  executeUsemApprovalToolCall,
  getUsemApprovalToolDefinitions,
} from '../../src/tools/usem-approval.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

const VR_IN =
  'source_tableINsn_sec_exception_change_approval,sn_vul_vulnerability,sn_vul_vulnerable_item,' +
  'sn_vul_remediation_task,sn_vul_app_vulnerability,sn_vul_app_vulnerable_item';

describe('getUsemApprovalToolDefinitions', () => {
  it('returns 3 tool definitions', () => {
    expect(getUsemApprovalToolDefinitions().length).toBe(3);
  });

  it('exposes the expected tool names', () => {
    const names = getUsemApprovalToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(['act_on_vr_approval', 'list_vr_approvals', 'list_vr_exception_requests']);
  });
});

describe('executeUsemApprovalToolCall – unknown tool', () => {
  it('returns null to let the router fall through', async () => {
    expect(await executeUsemApprovalToolCall(mockClient, 'nope', {})).toBeNull();
  });
});

describe('list_vr_approvals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to pending across all VR classes', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemApprovalToolCall(mockClient, 'list_vr_approvals', {});
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sysapproval_approver');
    expect(call.query).toBe(`${VR_IN}^state=requested`);
    expect(call.orderBy).toBe('-sys_created_on');
  });

  it('omits the state clause when state=any', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemApprovalToolCall(mockClient, 'list_vr_approvals', { state: 'any' });
    expect(qr().mock.calls[0][0].query).toBe(VR_IN);
  });

  it('restricts to a single VR source class', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemApprovalToolCall(mockClient, 'list_vr_approvals', {
      source_table: 'sn_vul_vulnerability',
      state: 'approved',
    });
    expect(qr().mock.calls[0][0].query).toBe('source_table=sn_vul_vulnerability^state=approved');
  });

  it('rejects a non-VR source_table', async () => {
    await expect(
      executeUsemApprovalToolCall(mockClient, 'list_vr_approvals', { source_table: 'incident' })
    ).rejects.toThrow('source_table must be one of');
  });

  it('filters by approval_source (e.g. False Positive on a VI)', async () => {
    qr().mockResolvedValue({ count: 3, records: [] });
    await executeUsemApprovalToolCall(mockClient, 'list_vr_approvals', {
      approval_source: 'sn_vul_vulnerable_item',
    });
    expect(qr().mock.calls[0][0].query).toBe(`${VR_IN}^state=requested^approval_source=sn_vul_vulnerable_item`);
  });

  it('rejects a non-VR approval_source', async () => {
    await expect(
      executeUsemApprovalToolCall(mockClient, 'list_vr_approvals', { approval_source: 'incident' })
    ).rejects.toThrow('approval_source must be one of');
  });
});

describe('list_vr_exception_requests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to latest revisions and maps approval_state labels', async () => {
    qr().mockResolvedValue({
      count: 1,
      records: [{ number: { value: 'CA0010002' }, request_type: { value: 'False positive' }, approval_state: { value: '0' } }],
    });
    const result = await executeUsemApprovalToolCall(mockClient, 'list_vr_exception_requests', {});
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_sec_exception_change_approval');
    expect(call.query).toBe('is_latest=true');
    expect(call.orderBy).toBe('-sys_created_on');
    expect(result.records[0].approval_state_label).toBe('In Review');
  });

  it('filters by request_type, approval_state and target table', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemApprovalToolCall(mockClient, 'list_vr_exception_requests', {
      request_type: 'False positive',
      approval_state: '1',
      table: 'sn_vul_vulnerable_item',
    });
    expect(qr().mock.calls[0][0].query).toBe(
      'is_latest=true^request_type=False positive^approval_state=1^table=sn_vul_vulnerable_item'
    );
  });

  it('omits is_latest when latest_only=false', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemApprovalToolCall(mockClient, 'list_vr_exception_requests', { latest_only: false });
    expect(qr().mock.calls[0][0].query).toBe('');
  });

  it('maps a plain-string approval_state and falls back for unknown codes', async () => {
    qr().mockResolvedValue({
      count: 2,
      records: [
        { number: 'CA1', approval_state: '1' }, // raw string value
        { number: 'CA2', approval_state: '9' }, // unknown code -> falls back to the raw value
      ],
    });
    const result = await executeUsemApprovalToolCall(mockClient, 'list_vr_exception_requests', {});
    expect(result.records[0].approval_state_label).toBe('Approved');
    expect(result.records[1].approval_state_label).toBe('9');
  });
});

describe('act_on_vr_approval', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(
      executeUsemApprovalToolCall(mockClient, 'act_on_vr_approval', { sys_id: 'a'.repeat(32), action: 'approve' })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('approves by setting state=approved', async () => {
    process.env.WRITE_ENABLED = 'true';
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    const result = await executeUsemApprovalToolCall(mockClient, 'act_on_vr_approval', {
      sys_id: 'a'.repeat(32),
      action: 'approve',
      comments: 'looks good',
    });
    expect(updateRec()).toHaveBeenCalledWith('sysapproval_approver', 'a'.repeat(32), {
      state: 'approved',
      comments: 'looks good',
    });
    expect(result.summary).toContain('Approved');
  });

  it('rejects by setting state=rejected with the comment', async () => {
    process.env.WRITE_ENABLED = 'true';
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemApprovalToolCall(mockClient, 'act_on_vr_approval', {
      sys_id: 'a'.repeat(32),
      action: 'reject',
      comments: 'not acceptable',
    });
    expect(updateRec()).toHaveBeenCalledWith('sysapproval_approver', 'a'.repeat(32), {
      state: 'rejected',
      comments: 'not acceptable',
    });
  });

  it('requires a comment when rejecting', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(
      executeUsemApprovalToolCall(mockClient, 'act_on_vr_approval', { sys_id: 'a'.repeat(32), action: 'reject' })
    ).rejects.toThrow('comments are required when rejecting');
  });

  it('rejects an invalid action', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(
      executeUsemApprovalToolCall(mockClient, 'act_on_vr_approval', { sys_id: 'a'.repeat(32), action: 'maybe' })
    ).rejects.toThrow('action must be "approve" or "reject"');
  });

  it('rejects a malformed sys_id', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(
      executeUsemApprovalToolCall(mockClient, 'act_on_vr_approval', { sys_id: 'short', action: 'approve' })
    ).rejects.toThrow('sys_id must be a 32-character hex string');
  });
});
