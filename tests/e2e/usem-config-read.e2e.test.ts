import { it, expect, beforeAll, afterAll } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { executeUsemConfigToolCall } from '../../src/tools/usem-config.js';
import { executeUsemIntegrationToolCall, isSecretParameter } from '../../src/tools/usem-integration.js';
import { createUsemFixtures } from './usem-fixtures.js';

type Row = Record<string, unknown>;
const raw = (v: unknown): string => String(v && typeof v === 'object' && 'value' in v ? v.value : v ?? '');
const ids = (rows: Row[]) => rows.map(r => raw(r.sys_id)).sort();
const RULE_TABLES = [
  ['assignment', 'sn_sec_wf_assign_rule'], ['remediation_task', 'sn_sec_rem_task_rule'],
  ['remediation_target', 'sn_sec_wf_ttr_rule'], ['risk_calculator', 'sn_sec_calculator_group'],
  ['calculator_rule', 'sn_sec_calculator_rule'], ['classification', 'sn_sec_wf_classification_group'],
  ['classification_rule', 'sn_sec_wf_classification_rule'], ['exception_rule', 'sn_sec_exception_rule'],
  ['rollup', 'sn_sec_wf_rollup_config'], ['exception_config', 'sn_sec_exception_config'],
  ['calculator_config', 'sn_sec_calculator_config'], ['risk_field', 'sn_sec_calculator_risk_field'],
  ['risk_score_weight', 'sn_sec_calculator_risk_score_weight'], ['approval', 'sn_vul_cmn_approval_rule'],
  ['auto_close', 'sn_vul_cmn_auto_close_rule'], ['exclusion', 'sn_vul_cmn_auto_exclusion_rule'],
] as const;

e2eDescribe('E2E – USEM configuration and parameter reads', () => {
  let fixtures: Awaited<ReturnType<typeof createUsemFixtures>> | undefined;
  beforeAll(async () => {
    if (process.env.USEM_E2E_FIXTURES === 'true') fixtures = await createUsemFixtures(getE2EClient());
  }, 120_000);
  afterAll(async () => { await fixtures?.cleanup(); }, 120_000);

  for (const [rule_type, table] of RULE_TABLES) {
    it(`lists ${rule_type} with bounded results from the correct table`, async ctx => {
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const result = await executeUsemConfigToolCall(client, 'list_usem_rules', { rule_type, limit: 3 });
      expect(result.table).toBe(table);
      expect(Array.isArray(result.records)).toBe(true);
      expect(result.records.length).toBeLessThanOrEqual(3);
      expect(result.count).toBeGreaterThanOrEqual(result.records.length);
      expect(result.records.every((r: Row) => /^[a-f0-9]{32}$/i.test(raw(r.sys_id)))).toBe(true);
    });

    it(`resolves a listed ${rule_type} by id and an exact id filter`, async ctx => {
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const fixtureId = fixtures?.rules[rule_type];
      const list = await executeUsemConfigToolCall(client, 'list_usem_rules', {
        rule_type, limit: 1, ...(fixtureId ? { query: `sys_id=${fixtureId}` } : {}),
      });
      if (fixtureId) expect(list.records.length).toBe(1);
      ctx.skip(list.records.length === 0, `no visible ${rule_type} record for detail verification`);
      const row: Row = list.records[0];
      const sys_id = raw(row.sys_id);
      const detail = await executeUsemConfigToolCall(client, 'get_usem_rule', { rule_type, sys_id });
      expect(raw(detail.sys_id)).toBe(sys_id);
      // Only compare boolean results to avoid printing configuration contents on failure.
      expect(Object.keys(row).every(k => raw(detail[k]) === raw(row[k]))).toBe(true);
      const filtered = await executeUsemConfigToolCall(client, 'list_usem_rules', {
        rule_type, query: `sys_id=${sys_id}`, limit: 3,
        ...('active' in row ? { active: raw(row.active) === 'true' } : {}),
      });
      expect(ids(filtered.records)).toEqual([sys_id]);
    });
  }

  it('risk calculator details link rules/fields/weights and agree for id and exact name', async ctx => {
    const client = getE2EClient();
    await skipUnlessTables(ctx, client, 'sn_sec_calculator_group', 'sn_sec_calculator_rule',
      'sn_sec_calculator_risk_field', 'sn_sec_calculator_risk_score_weight');
    const list = await executeUsemConfigToolCall(client, 'list_usem_rules', { rule_type: 'risk_calculator', limit: 1 });
    ctx.skip(list.records.length === 0, 'no visible risk calculator');
    const row: Row = list.records[0];
    const result = await executeUsemConfigToolCall(client, 'get_risk_calculator_details', { calculator: raw(row.sys_id) });
    expect(raw(result.calculator.sys_id)).toBe(raw(row.sys_id));
    for (const key of ['rules', 'risk_fields', 'score_weights']) expect(Array.isArray(result[key])).toBe(true);
    expect(result.rules.every((r: Row) => raw(r.calculator_group) === raw(row.sys_id))).toBe(true);
    const ruleIds = new Set(ids(result.rules));
    expect(result.risk_fields.every((r: Row) => ruleIds.has(raw(r.risk_calculator)))).toBe(true);
    expect(result.score_weights.every((r: Row) => raw(r.table) === raw(row.table))).toBe(true);
    const name = raw(row.name);
    ctx.skip(!name, 'calculator has no visible name');
    const matches = await executeUsemConfigToolCall(client, 'list_usem_rules', {
      rule_type: 'risk_calculator', query: `name=${name.replace(/\^/g, '')}`, limit: 2,
    });
    ctx.skip(matches.records.length !== 1, 'calculator name is not unique');
    const byName = await executeUsemConfigToolCall(client, 'get_risk_calculator_details', { calculator: name });
    expect(raw(byName.calculator.sys_id)).toBe(raw(row.sys_id));
    for (const key of ['rules', 'risk_fields', 'score_weights']) expect(ids(byName[key])).toEqual(ids(result[key]));
  });

  for (const [scope, table, metadata, filter] of [
    ['definition', 'sn_sec_int_config', '', 'integration'],
    ['instance', 'sn_sec_int_impl_config', 'configuration.', 'implementation'],
  ] as const) {
    it(`lists ${scope} parameters and filters by the selected parent`, async ctx => {
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const result = await executeUsemIntegrationToolCall(client, 'list_integration_parameters', { scope, limit: 3 });
      expect(result.scope).toBe(scope);
      expect(Array.isArray(result.records)).toBe(true);
      expect(result.records.length).toBeLessThanOrEqual(3);
      expect(result.records.every((r: Row) => !('password_value' in r))).toBe(true);
      const row = result.records.find((r: Row) => /^[a-f0-9]{32}$/i.test(raw(r[filter]))) as Row | undefined;
      ctx.skip(!row, `no ${scope} parameter with a visible parent`);
      const parent = raw(row![filter]);
      const filtered = await executeUsemIntegrationToolCall(client, 'list_integration_parameters', { scope, [filter]: parent, limit: 3 });
      expect(filtered.records.length).toBeGreaterThan(0);
      expect(filtered.records.every((r: Row) => raw(r[filter]) === parent)).toBe(true);
    });

    it(`masks nonempty secret-like ${scope} parameter values`, async ctx => {
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const fixtureIds = fixtures && (scope === 'definition' ? fixtures.definitions : fixtures.values);
      const result = await executeUsemIntegrationToolCall(client, 'list_integration_parameters', {
        scope, limit: 100, ...(fixtureIds ? { query: `sys_idIN${fixtureIds.join(',')}` } : {}),
      });
      const valueField = scope === 'definition' ? 'default_value' : 'value';
      if (fixtures && fixtureIds) {
        expect(ids(result.records)).toEqual([...fixtureIds].sort());
        expect(result.records.every((r: Row) => raw(r[valueField]) === fixtures!.expected[raw(r.sys_id)])).toBe(true);
      }
      // Same decision the tool makes, so the E2E cannot drift from the implementation.
      const secrets = (result.records as Row[]).filter(r =>
        isSecretParameter(raw(r[`${metadata}name`]), raw(r[`${metadata}label`]), raw(r[`${metadata}elem_type`])));
      const nonempty = secrets.filter(r => raw(r[valueField]) !== '');
      // Never pass a record/value to expect: a broken mask must not leak a secret in the test log.
      expect(nonempty.every(r => raw(r[valueField]) === '***MASKED***')).toBe(true);
      expect(result.records.every((r: Row) => !('password_value' in r))).toBe(true);
      ctx.skip(nonempty.length === 0, `no nonempty secret-like ${scope} fixture; masking not exercised`);
    });
  }
});
