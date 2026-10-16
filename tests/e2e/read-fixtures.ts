import type { ServiceNowClient } from '../../src/servicenow/client.js';
import { randomUUID } from 'node:crypto';
import { instanceManager } from '../../src/servicenow/instances.js';

export type ReadFixtureKind = 'discovery' | 'security_incident' | 'engagement' | 'risk' | 'indicator';
export interface ReadFixture { sysId: string; query: string; mark: string }
interface FixtureOptions { enabled: boolean; writeEnabled: boolean; instanceUrl: string }

export async function withReadFixture<T>(
  client: ServiceNowClient,
  kind: ReadFixtureKind,
  verify: (fixture: ReadFixture | undefined) => Promise<T>,
  options: FixtureOptions = {
    enabled: process.env.E2E_READ_FIXTURES === 'true',
    writeEnabled: process.env.WRITE_ENABLED === 'true',
    instanceUrl: instanceManager.getCurrentUrl() ?? '',
  },
): Promise<T> {
  if (!options.enabled) return verify(undefined);
  if (options.enabled && (!options.writeEnabled || !/^https:\/\/dev\d+\.service-now\.com\/?$/.test(options.instanceUrl))) {
    throw new Error('Read fixtures requires WRITE_ENABLED=true and a dev<number>.service-now.com PDI');
  }
  const mark = `mcp_read_e2e_${randomUUID().replace(/-/g, '')}`;
  const owned: Array<{ table: string; id: string }> = [];
  const raw = (value: unknown): string => String(value && typeof value === 'object' && 'value' in value ? value.value : value ?? '');
  async function create(
    table: string,
    fields: Record<string, unknown>,
    expectedStored: Record<string, unknown> = {},
    deactivateBeforeRead = false,
  ) {
    const row = await client.createRecord(table, fields);
    const id = raw(row.sys_id);
    if (!/^[a-f0-9]{32}$/i.test(id)) throw new Error(`No valid fixture sys_id from ${table}`);
    owned.push({ table, id });
    // Register ownership first so a failed/ambiguous PATCH is also cleaned up.
    if (deactivateBeforeRead) await client.updateRecord(table, id, { active: false });
    const stored = await client.getRecord(table, id);
    const expected = { ...fields, ...expectedStored };
    for (const field of ['active', 'state', 'profile', 'statement', 'profile_class', 'owned_by', 'entity', 'item', 'locked_out', 'type']) {
      if (expected[field] !== undefined && raw(stored[field]) !== String(expected[field])) {
        throw new Error(`Fixture safety field not retained: ${table}.${field} (expected ${String(expected[field])}, got ${raw(stored[field])})`);
      }
    }
    return id;
  }
  async function createRisk() {
    const user = await create('sys_user', { user_name: mark, first_name: 'MCP E2E', active: false, locked_out: true });
    const profileClass = await create('sn_grc_profile_class', { name: mark });
    const profile = await create('sn_grc_profile', {
      name: mark, profile_class: profileClass, owned_by: user, owner_field_in_source_table: 'owned_by', active: true,
    });
    const statement = await create('sn_risk_definition', { name: `${mark}_statement`, active: false });
    const risk = await create('sn_risk_risk', { name: mark, statement, profile, state: 'draft', active: false });
    return { profile, risk };
  }
  let result!: T;
  let failed = false;
  let failure: unknown;
  try {
    let sysId: string;
    if (kind === 'discovery') {
      sysId = await create('discovery_status', { description: mark, state: 'Completed', source: 'MCP E2E fixture' });
    } else if (kind === 'security_incident') {
      sysId = await create('sn_si_incident', { short_description: mark, active: false });
    } else if (kind === 'engagement') {
      const day = new Date().toISOString().slice(0, 10);
      const nextDay = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const previousDay = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
      sysId = await create('sn_audit_engagement', {
        // Let task closer normalize the inactive insert to its close state.
        // Sending state=3 explicitly invokes the reopener on this PDI.
        name: mark, short_description: mark, active: false, state: '-5', engagement_type: '4',
        audit_period_start: day, audit_period_end: nextDay,
        start_date: `${day} 00:00:00`, end_date: `${nextDay} 00:00:00`,
        work_start: `${twoDaysAgo} 00:00:00`, work_end: `${previousDay} 00:00:00`,
      }, { state: '3' });
    } else if (kind === 'risk') {
      sysId = (await createRisk()).risk;
    } else if (kind === 'indicator') {
      const { profile, risk } = await createRisk();
      const item = await client.getRecord('sn_grc_item', risk, 'profile,sys_class_name');
      if (raw(item.profile) !== profile) throw new Error('Indicator fixture risk does not expose its entity through sn_grc_item');
      sysId = await create('sn_grc_indicator', {
        // The Table API write ACL requires an active insert for reference fields.
        // Manual type: never invoke collection/evaluation; deactivate immediately.
        name: mark, active: true, type: 'manual', category: 'Risk Indicator', entity: profile, item: risk, next_run_time: '2099-01-01',
      }, { active: false }, true);
    } else {
      throw new Error(`Unsupported read fixture: ${kind}`);
    }
    result = await verify({ sysId, query: `sys_id=${sysId}`, mark });
  } catch (error) {
    failed = true;
    failure = error;
  }
  const cleanupErrors: Error[] = [];
  for (const { table, id } of owned.reverse()) {
    try {
      await client.deleteRecord(table, id);
      const remaining = await client.queryRecords({ table, query: `sys_id=${id}`, fields: 'sys_id', limit: 1 });
      if (remaining.records.length) throw new Error('record still exists after delete');
    } catch (cause) {
      cleanupErrors.push(new Error(`Read fixture cleanup failed: ${table}/${id}`, { cause }));
    }
  }
  if (cleanupErrors.length) throw new AggregateError([...(failed ? [failure] : []), ...cleanupErrors], 'Read fixture cleanup failed');
  if (failed) throw failure;
  return result;
}
