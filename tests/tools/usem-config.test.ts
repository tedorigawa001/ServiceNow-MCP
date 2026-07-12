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
  it('returns 6 tool definitions', () => {
    expect(getUsemConfigToolDefinitions().length).toBe(6);
  });

  it('rule tools require rule_type and expose the full rule-type set', () => {
    const defs = getUsemConfigToolDefinitions().filter(t => t.name !== 'get_risk_calculator_details');
    expect(defs.length).toBe(5);
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
        'rollup',
        'exception_config',
        'calculator_config',
        'risk_field',
        'risk_score_weight',
        'approval',
        'auto_close',
        'exclusion',
      ]);
    });
  });

  it('get_risk_calculator_details requires only calculator', () => {
    const def = getUsemConfigToolDefinitions().find(t => t.name === 'get_risk_calculator_details')!;
    expect(def.inputSchema.required).toEqual(['calculator']);
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

  it('maps the calculator/config rule families added for full sn_sec_* coverage', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    for (const [rt, table, orderBy] of [
      ['rollup', 'sn_sec_wf_rollup_config', 'order'],
      ['exception_config', 'sn_sec_exception_config', 'table'],
      ['calculator_config', 'sn_sec_calculator_config', 'key'],
      ['risk_field', 'sn_sec_calculator_risk_field', 'field_label'],
      ['risk_score_weight', 'sn_sec_calculator_risk_score_weight', 'value'],
    ] as const) {
      qr().mockClear();
      await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: rt });
      expect(qr().mock.calls[0][0].table).toBe(table);
      expect(qr().mock.calls[0][0].orderBy).toBe(orderBy);
    }
  });

  it('ignores active filter for config tables without an active flag (exception_config)', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'exception_config', active: true });
    expect(qr().mock.calls[0][0].query).toBe('');
  });

  it('honors active filter for rollup (has active flag)', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'rollup', active: true });
    expect(qr().mock.calls[0][0].query).toBe('active=true');
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

describe('get_risk_calculator_details', () => {
  beforeEach(() => vi.clearAllMocks());

  const GROUP_ID = 'a'.repeat(32);
  const group = { sys_id: GROUP_ID, name: 'VIT Calculator', table: 'sn_vul_vulnerable_item' };

  it('resolves by sys_id and aggregates rules, risk fields (via rule ids) and score weights', async () => {
    getRec().mockResolvedValue(group);
    qr()
      .mockResolvedValueOnce({ count: 2, records: [{ sys_id: 'r1' }, { sys_id: 'r2' }] }) // rules
      .mockResolvedValueOnce({ count: 3, records: [{ field: 'cvss' }, {}, {}] }) // risk fields
      .mockResolvedValueOnce({ count: 1, records: [{ value: '4', weight: '39' }] }); // weights
    const result = await executeUsemConfigToolCall(mockClient, 'get_risk_calculator_details', {
      calculator: GROUP_ID,
    });
    expect(getRec()).toHaveBeenCalledWith('sn_sec_calculator_group', GROUP_ID);
    expect(qr().mock.calls[0][0].table).toBe('sn_sec_calculator_rule');
    expect(qr().mock.calls[0][0].query).toBe(`calculator_group=${GROUP_ID}`);
    // risk_field parent reference is the calculator RULE, not the group
    expect(qr().mock.calls[1][0].table).toBe('sn_sec_calculator_risk_field');
    expect(qr().mock.calls[1][0].query).toBe('risk_calculatorINr1,r2');
    expect(qr().mock.calls[2][0].table).toBe('sn_sec_calculator_risk_score_weight');
    expect(qr().mock.calls[2][0].query).toBe('table=sn_vul_vulnerable_item');
    expect(result.rules.length).toBe(2);
    expect(result.risk_fields.length).toBe(3);
    expect(result.score_weights.length).toBe(1);
    expect(result.summary).toContain('VIT Calculator');
  });

  it('resolves by exact name, stripping encoded-query operators', async () => {
    qr()
      .mockResolvedValueOnce({ count: 1, records: [group] }) // group lookup
      .mockResolvedValueOnce({ count: 0, records: [] }) // rules
      .mockResolvedValueOnce({ count: 0, records: [] }); // weights (no risk-field query without rules)
    await executeUsemConfigToolCall(mockClient, 'get_risk_calculator_details', {
      calculator: 'VIT^Calculator',
    });
    expect(qr().mock.calls[0][0].table).toBe('sn_sec_calculator_group');
    expect(qr().mock.calls[0][0].query).toBe('name=VITCalculator');
  });

  it('skips the risk-field query when the calculator has no rules', async () => {
    getRec().mockResolvedValue(group);
    qr()
      .mockResolvedValueOnce({ count: 0, records: [] }) // rules
      .mockResolvedValueOnce({ count: 1, records: [{}] }); // weights
    const result = await executeUsemConfigToolCall(mockClient, 'get_risk_calculator_details', {
      calculator: GROUP_ID,
    });
    expect(result.risk_fields).toEqual([]);
    const tables = qr().mock.calls.map(c => c[0].table);
    expect(tables).not.toContain('sn_sec_calculator_risk_field');
  });

  it('throws NOT_FOUND for an unknown name', async () => {
    qr().mockResolvedValueOnce({ count: 0, records: [] });
    await expect(
      executeUsemConfigToolCall(mockClient, 'get_risk_calculator_details', { calculator: 'Nope' })
    ).rejects.toThrow('Risk calculator not found');
  });

  it('requires the calculator argument', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'get_risk_calculator_details', {})
    ).rejects.toThrow('calculator (sys_id or exact name) is required');
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

  it('create_usem_rule rejects fields outside the rule type allowlist', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'create_usem_rule', {
        rule_type: 'remediation_task',
        fields: {
          rule_name: 'Critical to SecOps',
          active: true,
          sys_domain: 'global',
          u_unlisted: 'x',
        },
      })
    ).rejects.toThrow('Remediation Task Rule fields cannot be set: sys_domain, u_unlisted');
    expect(createRec()).not.toHaveBeenCalled();
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

  it('update_usem_rule rejects fields outside the rule type allowlist', async () => {
    await expect(
      executeUsemConfigToolCall(mockClient, 'update_usem_rule', {
        rule_type: 'remediation_target',
        sys_id: 'a'.repeat(32),
        fields: { ttr_max: 7, sys_id: 'b'.repeat(32), sys_domain: 'global' },
      })
    ).rejects.toThrow('Remediation Target Rule fields cannot be updated: sys_id, sys_domain');
    expect(updateRec()).not.toHaveBeenCalled();
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
