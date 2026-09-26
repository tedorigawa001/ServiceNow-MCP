import { it, expect } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { executeUsemSlaToolCall } from '../../src/tools/usem-sla.js';
import { executeUsemApprovalToolCall } from '../../src/tools/usem-approval.js';
import { executeUsemIntegrationToolCall } from '../../src/tools/usem-integration.js';
import { executeUsemConfigToolCall } from '../../src/tools/usem-config.js';

const raw = (v: unknown): string => String(v && typeof v === 'object' && 'value' in v ? v.value : v ?? '');
function checkList(result: { records: Array<{ sys_id: unknown }>; count: number }) {
  expect(Array.isArray(result.records)).toBe(true);
  expect(result.count).toBeGreaterThanOrEqual(result.records.length);
  expect(result.records.length).toBeLessThanOrEqual(3);
  // Assert booleans rather than records to keep live data out of failure logs.
  expect(result.records.every(r => /^[a-f0-9]{32}$/i.test(raw(r.sys_id)))).toBe(true);
}

e2eDescribe('E2E – USEM read-only (no rule activation or integration execution)', () => {
  for (const [record_type, table] of [
    ['vi', 'sn_vul_vulnerable_item'], ['rt', 'sn_vul_remediation_task'], ['vg', 'sn_vul_vulnerability'],
  ]) {
    it(`list_remediation_sla reads ${record_type}`, async ctx => {
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const result = await executeUsemSlaToolCall(client, 'list_remediation_sla', { record_type, limit: 3 });
      checkList(result);
      expect(result.table).toBe(table);
    });
    it(`get_remediation_sla agrees with the ${record_type} list`, async ctx => {
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const list = await executeUsemSlaToolCall(client, 'list_remediation_sla', { record_type, limit: 1 });
      ctx.skip(list.records.length === 0, `no visible ${record_type} for detail verification`);
      const record = list.records[0];
      const detail = await executeUsemSlaToolCall(client, 'get_remediation_sla', {
        record_type, number_or_sysid: raw(record.sys_id),
      });
      expect(detail.sys_id).toBe(raw(record.sys_id));
      expect(detail.ttr_status).toBe(raw(record.ttr_status));
      expect(detail.ttr_target_date).toBe(raw(record.ttr_target_date));
      expect(typeof detail.breached).toBe('boolean');
    });
  }

  it('get_group_sla returns the selected group and its task SLA collection', async ctx => {
    const client = getE2EClient();
    await skipUnlessTables(ctx, client, 'sn_vul_vulnerability', 'task_sla');
    const list = await executeUsemSlaToolCall(client, 'list_remediation_sla', { record_type: 'vg', limit: 1 });
    ctx.skip(list.records.length === 0, 'no visible vulnerability group');
    const detail = await executeUsemSlaToolCall(client, 'get_group_sla', { number_or_sysid: raw(list.records[0].sys_id) });
    expect(detail.sys_id).toBe(raw(list.records[0].sys_id));
    expect(Array.isArray(detail.task_sla.records)).toBe(true);
    expect(typeof detail.ttr.breached).toBe('boolean');
  });

  for (const [tool, table, execute, args] of [
    ['list_vr_notifications', 'sysevent_email_action', executeUsemSlaToolCall, { active: true }],
    ['list_vr_approvals', 'sysapproval_approver', executeUsemApprovalToolCall, {}],
    ['list_vr_exception_requests', 'sn_sec_exception_change_approval', executeUsemApprovalToolCall, {}],
    ['list_integrations', 'sn_sec_int_integration', executeUsemIntegrationToolCall, {}],
    ['list_integration_implementations', 'sn_sec_int_impl', executeUsemIntegrationToolCall, { active: true }],
    ['list_integration_runs', 'sn_vul_integration_run', executeUsemIntegrationToolCall, {}],
    ['list_integration_logs', 'sn_vul_integration_log', executeUsemIntegrationToolCall, {}],
  ] as const) {
    it(`${tool} returns a bounded collection with record identities`, async ctx => {
      const client = getE2EClient();
      await skipUnlessTables(ctx, client, table);
      const result = await execute(client, tool, { ...args, limit: 3 });
      checkList(result);
      if (tool === 'list_vr_approvals') {
        expect(result.records.every((r: { state: unknown }) => raw(r.state) === 'requested')).toBe(true);
      }
      if ('active' in args) {
        expect(result.records.every((r: { active: unknown }) => raw(r.active) === 'true')).toBe(true);
      }
    });
  }

  it('get_integration_run resolves the same run by id and number', async ctx => {
    const client = getE2EClient();
    await skipUnlessTables(ctx, client, 'sn_vul_integration_run');
    const list = await executeUsemIntegrationToolCall(client, 'list_integration_runs', { limit: 1 });
    ctx.skip(list.records.length === 0, 'no integration run available');
    const record = list.records[0];
    expect(raw(record.number).length > 0).toBe(true);
    for (const identifier of [raw(record.sys_id), raw(record.number)]) {
      const detail = await executeUsemIntegrationToolCall(client, 'get_integration_run', { number_or_sysid: identifier });
      expect(raw(detail.sys_id)).toBe(raw(record.sys_id));
    }
  });

  it('lists remediation rules without updating or activating them', async ctx => {
    const client = getE2EClient();
    await skipUnlessTables(ctx, client, 'sn_sec_rem_task_rule');
    checkList(await executeUsemConfigToolCall(client, 'list_usem_rules', { rule_type: 'remediation_task', limit: 3 }));
  });

  it('get_usem_rule preserves the listed rule identity and active state', async ctx => {
    const client = getE2EClient();
    await skipUnlessTables(ctx, client, 'sn_sec_rem_task_rule');
    const list = await executeUsemConfigToolCall(client, 'list_usem_rules', { rule_type: 'remediation_task', limit: 1 });
    ctx.skip(list.records.length === 0, 'no remediation rule available');
    const detail = await executeUsemConfigToolCall(client, 'get_usem_rule', {
      rule_type: 'remediation_task', sys_id: raw(list.records[0].sys_id),
    });
    expect(raw(detail.sys_id)).toBe(raw(list.records[0].sys_id));
    expect(raw(detail.active)).toBe(raw(list.records[0].active));
  });
});
