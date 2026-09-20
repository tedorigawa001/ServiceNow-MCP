import { describe } from 'vitest';
import { instanceManager } from '../../src/servicenow/instances.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

/**
 * E2E tests hit a real PDI and are opt-in: they only run when RUN_E2E=true
 * AND an instance is actually configured (via SN_INSTANCES_CONFIG or
 * SERVICENOW_INSTANCE_URL + OAuth env vars — same resolution `instanceManager`
 * uses for the live server). Everything else (npm test, CI) stays mock-only.
 */
export function isE2EConfigured(): boolean {
  if (process.env.RUN_E2E !== 'true') return false;
  return instanceManager.listNames().length > 0 && !!instanceManager.getCurrentUrl();
}

export const e2eDescribe = describe.skipIf(!isE2EConfigured());

/**
 * Write-tool E2E tests create/update real records on the configured
 * instance (cleaned up via client.deleteRecord in each test), so they need
 * WRITE_ENABLED=true in addition to the read-only gate. Use a PDI, never
 * a shared/prod instance, for these.
 */
export function isWriteE2EConfigured(): boolean {
  return isE2EConfigured() && process.env.WRITE_ENABLED === 'true';
}

export const writeE2eDescribe = describe.skipIf(!isWriteE2EConfigured());

/**
 * Scripting-tier tools (business rules, script includes, ACLs, ...) are
 * gated behind SCRIPTING_ENABLED=true even for their read-only list/get
 * variants, so their E2E coverage needs that flag as well as the write gate.
 */
export function isScriptingE2EConfigured(): boolean {
  return isWriteE2EConfigured() && process.env.SCRIPTING_ENABLED === 'true';
}

export const scriptingE2eDescribe = describe.skipIf(!isScriptingE2EConfigured());

export function getE2EClient(): ServiceNowClient {
  return instanceManager.getClient();
}

/**
 * Many modules target tables that only exist once an optional plugin is
 * installed (GRC, HRSD, CSM, DevOps, Mobile, SecOps, ...). A PDI can lose
 * those plugins when it is reclaimed and re-provisioned, so a test that
 * assumes the table is there turns into a hard failure that says nothing
 * about the tool. Gate such tests on the table instead: an absent table is a
 * skip (with the reason recorded), while an existing table that the tool
 * still cannot read surfaces as a real failure.
 */
const tableExistenceCache = new Map<string, Promise<boolean>>();

export function tableExists(client: ServiceNowClient, table: string): Promise<boolean> {
  let pending = tableExistenceCache.get(table);
  if (!pending) {
    pending = client
      .queryRecords({ table: 'sys_db_object', query: `name=${table}`, fields: 'name', limit: 1 })
      .then((result) => result.records.length > 0);
    tableExistenceCache.set(table, pending);
  }
  return pending;
}

type SkippableContext = { skip: (condition: boolean, note?: string) => void };

/** Skip the current test unless every listed table exists on the instance. */
export async function skipUnlessTables(ctx: SkippableContext, client: ServiceNowClient, ...tables: string[]): Promise<void> {
  const missing: string[] = [];
  for (const table of tables) {
    if (!(await tableExists(client, table))) missing.push(table);
  }
  ctx.skip(missing.length > 0, `table not on this instance: ${missing.join(', ')}`);
}
