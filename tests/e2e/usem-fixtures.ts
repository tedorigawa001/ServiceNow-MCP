import { randomUUID } from 'node:crypto';
import type { ServiceNowClient } from '../../src/servicenow/client.js';
import { instanceManager } from '../../src/servicenow/instances.js';
import { executeUsemConfigToolCall } from '../../src/tools/usem-config.js';

const raw = (v: unknown): string => String(v && typeof v === 'object' && 'value' in v ? v.value : v ?? '');

/** Opt-in disposable PDI data for the four otherwise fixture-dependent reads. */
export async function createUsemFixtures(client: ServiceNowClient) {
  if (process.env.WRITE_ENABLED !== 'true') throw new Error('USEM_E2E_FIXTURES requires WRITE_ENABLED=true');
  if (!/^https:\/\/dev\d+\.service-now\.com\/?$/.test(instanceManager.getCurrentUrl() ?? '')) {
    throw new Error('USEM fixtures require a dev<number>.service-now.com PDI');
  }
  const mark = `mcp_e2e_${randomUUID().replace(/-/g, '')}`;
  const owned: Array<{ table: string; id: string }> = [];
  async function track(table: string, record: Record<string, unknown>) {
    const id = raw(record.sys_id);
    if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error(`No valid fixture sys_id returned by ${table}`);
    owned.push({ table, id });
    return id;
  }
  async function create(table: string, fields: Record<string, unknown>) {
    return track(table, await client.createRecord(table, fields));
  }
  async function cleanup() {
    const errors: string[] = [];
    for (const { table, id } of [...owned].reverse()) {
      try {
        await client.deleteRecord(table, id);
        const remaining = await client.queryRecords({ table, query: `sys_id=${id}`, fields: 'sys_id', limit: 1 });
        if (remaining.records.length) throw new Error('record still exists after delete');
      } catch { errors.push(`${table}/${id}`); }
    }
    if (errors.length) throw new Error(`USEM fixture cleanup failed: ${errors.join(', ')}`);
  }
  try {
    const rules: Record<string, string> = {};
    for (const rule_type of ['classification_rule', 'exclusion']) {
      const fields = { name: mark, active: false, order: 999999,
        table: 'sn_vul_vulnerable_item', condition: 'sys_id=00000000000000000000000000000000' };
      // Register the created row before verification, so a verification failure is also cleaned up.
      const table = rule_type === 'classification_rule' ? 'sn_sec_wf_classification_rule' : 'sn_vul_cmn_auto_exclusion_rule';
      const id = await create(table, fields);
      rules[rule_type] = id;
      const stored = await executeUsemConfigToolCall(client, 'get_usem_rule', { rule_type, sys_id: id });
      if (raw(stored.active) !== 'false') throw new Error(`${rule_type} fixture was not stored inactive`);
    }
    const integration = await create('sn_sec_int_integration', { name: mark, id: mark, configurable: false });
    const implementation = await create('sn_sec_int_impl', { name: mark, integration, active: false, is_default: false });
    const impl = await client.getRecord('sn_sec_int_impl', implementation, 'active');
    if (raw(impl.active) !== 'false') throw new Error('Integration fixture was not stored inactive');

    const definitions: string[] = [];
    const values: string[] = [];
    const samples = [
      { name: 'api_token', label: 'Dummy token', elem_type: 'string', secret: true },
      { name: 'endpoint_hint', label: 'API Key', elem_type: 'string', secret: true },
      { name: 'opaque_value', label: 'Opaque value', elem_type: 'password', secret: true },
      { name: 'ordinary_value', label: 'Ordinary value', elem_type: 'string', secret: false },
    ];
    const expected: Record<string, string> = {};
    for (const sample of samples) {
      const dummy = `DUMMY-NOT-A-CREDENTIAL-${sample.name}-${mark}`;
      const definition = await create('sn_sec_int_config', {
        integration, name: sample.name, label: sample.label, elem_type: sample.elem_type,
        mandatory: false, default_value: dummy,
      });
      definitions.push(definition);
      expected[definition] = sample.secret ? '***MASKED***' : dummy;
      const value = await create('sn_sec_int_impl_config', { implementation, configuration: definition, value: dummy });
      values.push(value);
      expected[value] = sample.secret ? '***MASKED***' : dummy;
      // Read only these dummy rows to prove a nonempty value was stored before testing its mask.
      const def = await client.getRecord('sn_sec_int_config', definition, 'default_value,elem_type');
      const val = await client.getRecord('sn_sec_int_impl_config', value, 'value');
      if (raw(def.default_value) !== dummy || raw(val.value) !== dummy || raw(def.elem_type) !== sample.elem_type) {
        throw new Error('Dummy fixture value was not stored as requested');
      }
    }
    return { rules, definitions, values, expected, cleanup, count: owned.length };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
