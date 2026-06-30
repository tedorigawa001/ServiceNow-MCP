import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeUsemConfigToolCall, getUsemConfigToolDefinitions } from '../../src/tools/usem-config.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const getRec = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const createRec = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;

describe('getUsemConfigToolDefinitions', () => {
  it('returns 5 tool definitions', () => {
    expect(getUsemConfigToolDefinitions().length).toBe(5);
  });

  it('all tools require rule_type and expose the full rule-type set', () => {
    const defs = getUsemConfigToolDefinitions();
    defs.forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.inputSchema.required).toContain('rule_type');
      const enumVals = (t.inputSchema.properties as any).rule_type.enum;
      expect(enumVals).toEqual([
        'assignment',
        'remediation_task',
        'remediation_target',
        'risk_calculator',
        'calculator_rule',
        'classification',
        'classification_rule',
        'exception_rule',
        'approval',
        'auto_close',
        'exclusion',
      ]);
    });
  });
});

describe('executeUsemConfigToolCall – unknown tool', () => {
  it('returns null to let the router fall through', async () => {
    expect(await executeUsemConfigToolCall(mockClient, 'nope', { rule_type: 'approval' })).toBeNull();
  });
});

describe('list_usem_rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps rule_type to the right table and orders by order', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ name: 'a' }, { name: 'b' }] });
    const result = await executeUsemConfigToolCall(mockClient, 'list_usem_rules', {
      rule_type: 'remediation_target',
      active: true,
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_sec_wf_ttr_rule');
    expect(call.orderBy).toBe('order');
    expect(call.query).toBe('active=true');
    expect(result.table).toBe('sn_sec_wf_ttr_rule');
    expect(result.summary).toContain('Remediation Target Rule');
  });

  it('maps remediation_task to sn_sec_rem_task_rule', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'remediation_task' });
    expect(qr().mock.calls[0][0].table).toBe('sn_sec_rem_task_rule');
  });

  it('maps assignment to the USEM sn_sec_wf_assign_rule table with active filtering', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'assignment', active: true });
    expect(qr().mock.calls[0][0].table).toBe('sn_sec_wf_assign_rule');
    expect(qr().mock.calls[0][0].query).toBe('active=true');
    expect(qr().mock.calls[0][0].orderBy).toBe('order');
  });

  it('orders no-order tables (risk_calculator, classification) by name', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'risk_calculator' });
    expect(qr().mock.calls[0][0].table).toBe('sn_sec_calculator_group');
    expect(qr().mock.calls[0][0].orderBy).toBe('name');

    qr().mockClear();
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'classification' });
    expect(qr().mock.calls[0][0].table).toBe('sn_sec_wf_classification_group');
    expect(qr().mock.calls[0][0].orderBy).toBe('name');
  });

  it('maps the new USEM rule families to their sn_sec_* tables', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    for (const [rt, table] of [
      ['calculator_rule', 'sn_sec_calculator_rule'],
      ['classification_rule', 'sn_sec_wf_classification_rule'],
      ['exception_rule', 'sn_sec_exception_rule'],
    ] as const) {
      qr().mockClear();
      await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: rt });
      expect(qr().mock.calls[0][0].table).toBe(table);
    }
  });

  it('ignores active filter for exception_rule (state-driven, no active field)', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'exception_rule', active: true });
    expect(qr().mock.calls[0][0].table).toBe('sn_sec_exception_rule');
    expect(qr().mock.calls[0][0].query).toBe('');
    expect(qr().mock.calls[0][0].orderBy).toBe('order');
  });

  it('appends an extra query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', {
      rule_type: 'auto_close',
      active: false,
      query: 'table=sn_vul_detection',
    });
    expect(qr().mock.calls[0][0].query).toBe('active=false^table=sn_vul_detection');
  });

  it('rejects an unknown rule_type', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'bogus' })
    ).rejects.toThrow('rule_type must be one of');
  });
});

describe('get_usem_rule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id from the mapped table', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemConfigToolCall(mockClient, 'get_usem_rule', {
      rule_type: 'approval',
      sys_id: 'a'.repeat(32),
    });
    expect(getRec()).toHaveBeenCalledWith('sn_vul_cmn_approval_rule', 'a'.repeat(32));
  });

  it('rejects a malformed sys_id', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'get_usem_rule', { rule_type: 'approval', sys_id: 'short' })
    ).rejects.toThrow('sys_id must be a 32-character hex string');
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

  it('create_usem_rule blocked without WRITE_ENABLED', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'create_usem_rule', { rule_type: 'approval', fields: { name: 'x' } })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('set_usem_rule_active blocked without WRITE_ENABLED', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'set_usem_rule_active', {
        rule_type: 'approval',
        sys_id: 'a'.repeat(32),
        active: false,
      })
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

  it('create_usem_rule creates a record and labels it via nameField', async () => {
    createRec().mockResolvedValue({ sys_id: 'new1' });
    const result = await executeUsemConfigToolCall(mockClient, 'create_usem_rule', {
      rule_type: 'remediation_task',
      fields: { rule_name: 'Critical to SecOps', active: true, order: 100 },
    });
    expect(createRec()).toHaveBeenCalledWith('sn_sec_rem_task_rule', {
      rule_name: 'Critical to SecOps',
      active: true,
      order: 100,
    });
    expect(result.summary).toContain('Critical to SecOps');
  });

  it('create_usem_rule requires a non-empty fields object', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'create_usem_rule', { rule_type: 'approval', fields: {} })
    ).rejects.toThrow('fields object with at least one column is required');
  });

  it('update_usem_rule patches the mapped table', async () => {
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemConfigToolCall(mockClient, 'update_usem_rule', {
      rule_type: 'remediation_target',
      sys_id: 'a'.repeat(32),
      fields: { ttr_max: 7 },
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_sec_wf_ttr_rule', 'a'.repeat(32), { ttr_max: 7 });
  });

  it('update_usem_rule requires fields', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'update_usem_rule', {
        rule_type: 'approval',
        sys_id: 'a'.repeat(32),
        fields: {},
      })
    ).rejects.toThrow('fields object with at least one column is required');
  });

  it('set_usem_rule_active toggles the active flag', async () => {
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    const result = await executeUsemConfigToolCall(mockClient, 'set_usem_rule_active', {
      rule_type: 'auto_close',
      sys_id: 'a'.repeat(32),
      active: false,
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_vul_cmn_auto_close_rule', 'a'.repeat(32), { active: false });
    expect(result.summary).toContain('Disabled');
  });

  it('set_usem_rule_active is rejected for exception_rule (state-driven, no active field)', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'set_usem_rule_active', {
        rule_type: 'exception_rule',
        sys_id: 'a'.repeat(32),
        active: true,
      })
    ).rejects.toThrow('has no active field');
  });

  it('set_usem_rule_active works for the USEM assignment rule (now has active)', async () => {
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    const result = await executeUsemConfigToolCall(mockClient, 'set_usem_rule_active', {
      rule_type: 'assignment',
      sys_id: 'a'.repeat(32),
      active: true,
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_sec_wf_assign_rule', 'a'.repeat(32), { active: true });
    expect(result.summary).toContain('Enabled');
  });

  it('set_usem_rule_active requires a boolean active', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'set_usem_rule_active', {
        rule_type: 'approval',
        sys_id: 'a'.repeat(32),
        active: 'yes' as any,
      })
    ).rejects.toThrow('active (boolean) is required');
  });
});
