import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeUsemConfigToolCall, getUsemConfigToolDefinitions } from '../../src/tools/usem-config.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
} as unknown as ServiceNowClient;
const deleteRec = () => (mockClient as unknown as { deleteRecord: ReturnType<typeof vi.fn> }).deleteRecord;

/**
 * A tiny in-memory ServiceNow for the write tests: records written through the
 * mock are returned on readback, and a run-once sysauto_script is "executed"
 * when the tool polls syslog for its result — its setValue lines are applied
 * to the target record. `dropOnRest` lists fields the fake Table API ignores,
 * like the real one does for assignment_group_fields.
 */
function fakeInstance(opts: { dropOnRest?: string[]; jobRuns?: boolean; jobError?: string } = {}) {
  const store = new Map<string, Record<string, any>>();
  const jobs = new Map<string, string>();
  let seq = 0;
  const id = () => (++seq).toString(16).padStart(32, 'a');
  const restWrite = (data: Record<string, any>) =>
    Object.fromEntries(Object.entries(data).filter(([k]) => !(opts.dropOnRest ?? []).includes(k)).map(([k, v]) => [k, String(v)]));
  createRec().mockImplementation(async (table: string, data: Record<string, any>) => {
    const sysId = id();
    if (table === 'sysauto_script') { jobs.set(sysId, String(data.script)); return { sys_id: sysId }; }
    const rec = { sys_id: sysId, ...restWrite(data) };
    store.set(sysId, rec);
    return { ...rec };
  });
  updateRec().mockImplementation(async (_table: string, sysId: string, data: Record<string, any>) => {
    const rec = { ...(store.get(sysId) ?? { sys_id: sysId }), ...restWrite(data) };
    store.set(sysId, rec);
    return { ...rec };
  });
  getRec().mockImplementation(async (_table: string, sysId: string) => ({ ...(store.get(sysId) ?? {}) }));
  deleteRec().mockResolvedValue(undefined);
  qr().mockImplementation(async ({ table, query }: { table: string; query: string }) => {
    if (table !== 'syslog' || opts.jobRuns === false) return { count: 0, records: [] };
    const token = /messageSTARTSWITH(\S+) RESULT:/.exec(query)?.[1];
    const script = [...jobs.values()].find(js => token && js.includes(token));
    if (!script) return { count: 0, records: [] };
    if (opts.jobError) return { count: 1, records: [{ message: `${token} RESULT:${JSON.stringify({ error: opts.jobError })}` }] };
    const target = /gr\.get\('([0-9a-f]{32})'\)/.exec(script)![1];
    for (const [, field, value] of script.matchAll(/gr\.setValue\('([a-z_0-9]+)', '([^']*)'\)/g)) {
      store.set(target, { ...(store.get(target) ?? { sys_id: target }), [field]: value });
    }
    return { count: 1, records: [{ message: `${token} RESULT:${JSON.stringify({ ok: true })}` }] };
  });
  return { store, jobs };
}

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

  it('exposes remediation grouping fields in both write schemas without allowing arbitrary columns', () => {
    for (const name of ['create_usem_rule', 'update_usem_rule']) {
      const def = getUsemConfigToolDefinitions().find(t => t.name === name)!;
      const schema = (def.inputSchema.properties as any).fields;
      expect(schema.additionalProperties).toBe(false);
      for (const field of ['applies_to', 'description', 'assignment_type', 'assignment_group_fields',
        ...Array.from({ length: 6 }, (_, i) => [`field_${i + 1}`, `table_${i + 1}`, `extended_table_${i + 1}`]).flat()]) {
        expect(schema.properties).toHaveProperty(field);
      }
      for (const field of ['sys_id', 'sys_domain', 'marked_for_deletion', 'u_unlisted']) {
        expect(schema.properties).not.toHaveProperty(field);
      }
    }
  });
});

describe('executeUsemConfigToolCall – unknown tool', () => {
  it('returns null to let the router fall through', async () => {
    expect(await executeUsemConfigToolCall(mockClient, 'nope', { rule_type: 'approval' })).toBeNull();
  });
});

describe('list_usem_rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps rule_type to the right table and orders by name (sn_sec_wf_ttr_rule has no order column)', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ name: 'a' }, { name: 'b' }] });
    const result = await executeUsemConfigToolCall(mockClient, 'list_usem_rules', {
      rule_type: 'remediation_target',
      active: true,
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_sec_wf_ttr_rule');
    expect(call.orderBy).toBe('name');
    expect(call.fields).not.toContain('order');
    expect(call.query).toBe('active=true');
    expect(result.table).toBe('sn_sec_wf_ttr_rule');
    expect(result.summary).toContain('Remediation Target Rule');
  });

  it('orders by the order column where the table has one', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemConfigToolCall(mockClient, 'list_usem_rules', { rule_type: 'assignment' });
    expect(qr().mock.calls[0][0].orderBy).toBe('order');
  });

  it('rejects order for remediation_target, which has no such column', async () => {
    process.env.WRITE_ENABLED = 'true';
    try {
      await expect(executeUsemConfigToolCall(mockClient, 'create_usem_rule', { rule_type: 'remediation_target', fields: { name: 'x', order: 1 } }))
        .rejects.toThrow('cannot be set: order');
    } finally { delete process.env.WRITE_ENABLED; }
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
  const ORIGINAL_SCRIPTING = process.env.SCRIPTING_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    delete process.env.SCRIPTING_ENABLED;
    fakeInstance();
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
    if (ORIGINAL_SCRIPTING === undefined) delete process.env.SCRIPTING_ENABLED;
    else process.env.SCRIPTING_ENABLED = ORIGINAL_SCRIPTING;
  });

  const groupingFields = () => ({
    rule_name: 'UI E2E', applies_to: 'b'.repeat(32), table: 'sn_vul_vulnerable_item',
    description: 'Test only', active: false, order: 1000,
    condition: 'short_descriptionSTARTSWITHMCP-UI-E2E-',
    assignment_type: 5, assignment_group_fields: 'assignment_group',
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
      [`field_${i + 1}`, 'assignment_group'],
      [`table_${i + 1}`, 'sn_vul_vulnerable_item'],
      [`extended_table_${i + 1}`, ''],
    ]).flat()),
  });

  it.each(['create_usem_rule', 'update_usem_rule'])('%s writes grouping config over REST and assignment_group_fields through a run-once script', async tool => {
    process.env.SCRIPTING_ENABLED = 'true';
    const { store, jobs } = fakeInstance({ dropOnRest: ['assignment_group_fields'] });
    const existing = 'c'.repeat(32);
    store.set(existing, { sys_id: existing });
    const fields = groupingFields();
    const restFields: Record<string, unknown> = { ...fields };
    delete restFields.assignment_group_fields;
    const result = await executeUsemConfigToolCall(mockClient, tool, { rule_type: 'remediation_task', sys_id: existing, fields });

    if (tool === 'create_usem_rule') expect(createRec()).toHaveBeenCalledWith('sn_sec_rem_task_rule', restFields);
    else expect(updateRec()).toHaveBeenCalledWith('sn_sec_rem_task_rule', existing, restFields);
    const [script] = [...jobs.values()];
    expect(script).toContain("var gr = new GlideRecord('sn_sec_rem_task_rule');");
    expect(script).toContain("gr.setValue('assignment_group_fields', 'assignment_group');");
    expect(result.assignment_group_fields).toBe('assignment_group');
    expect(result.script_written_fields).toEqual(['assignment_group_fields']);
    expect(result.verified_fields).toEqual(Object.keys(fields));
    expect(deleteRec()).toHaveBeenCalledWith('sysauto_script', expect.any(String)); // job removed once its result was read
  });

  it('requires SCRIPTING_ENABLED before writing anything when assignment_group_fields is set', async () => {
    await expect(executeUsemConfigToolCall(mockClient, 'create_usem_rule', { rule_type: 'remediation_task', fields: groupingFields() }))
      .rejects.toThrow('Scripting operations are disabled');
    expect(createRec()).not.toHaveBeenCalled();
  });

  it('rejects an assignment_group_fields value that is not a field path, before writing', async () => {
    process.env.SCRIPTING_ENABLED = 'true';
    for (const bad of ["x'); gs.info('pwned", 'assignment group', 'a..b']) {
      await expect(executeUsemConfigToolCall(mockClient, 'create_usem_rule', {
        rule_type: 'remediation_task', fields: { ...groupingFields(), assignment_group_fields: bad },
      })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect(createRec()).not.toHaveBeenCalled();
  });

  it('update with only assignment_group_fields skips the REST PATCH', async () => {
    process.env.SCRIPTING_ENABLED = 'true';
    const { store } = fakeInstance({ dropOnRest: ['assignment_group_fields'] });
    store.set('c'.repeat(32), { sys_id: 'c'.repeat(32) });
    const result = await executeUsemConfigToolCall(mockClient, 'update_usem_rule', {
      rule_type: 'remediation_task', sys_id: 'c'.repeat(32), fields: { assignment_group_fields: 'cmdb_ci.support_group' },
    });
    expect(updateRec()).not.toHaveBeenCalled();
    expect(result.assignment_group_fields).toBe('cmdb_ci.support_group');
  });

  it('reports which rule was created when the script part fails, so it can be fixed or removed', async () => {
    process.env.SCRIPTING_ENABLED = 'true';
    fakeInstance({ dropOnRest: ['assignment_group_fields'], jobError: 'update was rejected' });
    await expect(executeUsemConfigToolCall(mockClient, 'create_usem_rule', { rule_type: 'remediation_task', fields: groupingFields() }))
      .rejects.toThrow(/Remediation Task Rule [0-9a-f]{32} was created, but assignment_group_fields could not be set: .*update was rejected/);
  });

  it('reports SCRIPT_SCHEDULED when the scheduler does not run the job in time', async () => {
    process.env.SCRIPTING_ENABLED = 'true';
    fakeInstance({ dropOnRest: ['assignment_group_fields'], jobRuns: false });
    await expect(executeUsemConfigToolCall(mockClient, 'update_usem_rule', {
      rule_type: 'remediation_task', sys_id: 'c'.repeat(32), fields: { assignment_group_fields: 'assignment_group' }, wait_seconds: 0,
    })).rejects.toMatchObject({ code: 'SCRIPT_SCHEDULED' });
  });

  it('fails with FIELDS_NOT_SAVED when the Table API drops a value without an error', async () => {
    fakeInstance({ dropOnRest: ['assignment_group'] });
    await expect(executeUsemConfigToolCall(mockClient, 'create_usem_rule', {
      rule_type: 'remediation_task', fields: { rule_name: 'R', assignment_group: 'd'.repeat(32), order: 10 },
    })).rejects.toMatchObject({ code: 'FIELDS_NOT_SAVED', message: expect.stringContaining('did not store assignment_group') });
  });

  it('accepts the forms ServiceNow normalises on readback (booleans, numbers, ^EQ, list order, references)', async () => {
    const { store } = fakeInstance();
    store.set('c'.repeat(32), { sys_id: 'c'.repeat(32) });
    updateRec().mockImplementation(async (_t: string, sysId: string) => {
      const rec = { sys_id: sysId, active: 'false', order: '1000', condition: 'priority=1^EQ', applies_to: 'b,a', assignment_group: { value: 'd'.repeat(32), link: 'x' } };
      store.set(sysId, rec);
      return rec;
    });
    await expect(executeUsemConfigToolCall(mockClient, 'update_usem_rule', {
      rule_type: 'remediation_task', sys_id: 'c'.repeat(32),
      fields: { active: false, order: 1000, condition: 'priority=1', applies_to: 'a,b', assignment_group: 'd'.repeat(32) },
    })).resolves.toMatchObject({ verified_fields: ['active', 'order', 'condition', 'applies_to', 'assignment_group'] });
  });

  it('does not treat reordered comma-separated description text as a saved value', async () => {
    fakeInstance();
    getRec().mockResolvedValue({ sys_id: 'c'.repeat(32), description: 'b,a' });
    await expect(executeUsemConfigToolCall(mockClient, 'update_usem_rule', {
      rule_type: 'remediation_task', sys_id: 'c'.repeat(32), fields: { description: 'a,b' },
    })).rejects.toMatchObject({ code: 'FIELDS_NOT_SAVED' });
  });

  it.each([true, false])('detects an active toggle that was not stored (%s)', async active => {
    fakeInstance({ dropOnRest: ['active'] });
    getRec().mockResolvedValue({ sys_id: 'c'.repeat(32), active: String(!active) });
    await expect(executeUsemConfigToolCall(mockClient, 'set_usem_rule_active', {
      rule_type: 'remediation_task', sys_id: 'c'.repeat(32), active,
    })).rejects.toMatchObject({ code: 'FIELDS_NOT_SAVED' });
  });

  it.each(['create_usem_rule', 'update_usem_rule'])('%s keeps remediation-only fields out of other rule types', async tool => {
    await expect(executeUsemConfigToolCall(mockClient, tool, {
      rule_type: 'assignment', sys_id: 'a'.repeat(32), fields: { field_1: 'assignment_group' },
    })).rejects.toThrow('field_1');
    expect(createRec()).not.toHaveBeenCalled();
    expect(updateRec()).not.toHaveBeenCalled();
  });

  it.each(['create_usem_rule', 'update_usem_rule'])('%s still rejects remediation system and lifecycle columns', async tool => {
    for (const field of ['sys_id', 'sys_domain', 'sys_created_by', 'marked_for_deletion', 'u_unlisted']) {
      await expect(executeUsemConfigToolCall(mockClient, tool, {
        rule_type: 'remediation_task', sys_id: 'a'.repeat(32), fields: { [field]: 'x' },
      })).rejects.toThrow(field);
    }
    expect(createRec()).not.toHaveBeenCalled();
    expect(updateRec()).not.toHaveBeenCalled();
  });

  it('create_usem_rule creates a record and labels it via nameField', async () => {
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
    const result = await executeUsemConfigToolCall(mockClient, 'set_usem_rule_active', {
      rule_type: 'auto_close',
      sys_id: 'a'.repeat(32),
      active: false,
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_vul_cmn_auto_close_rule', 'a'.repeat(32), { active: false });
    expect(result.summary).toContain('Disabled');
    expect(result.verified_fields).toEqual(['active']);
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
