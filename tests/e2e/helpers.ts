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

export function getE2EClient(): ServiceNowClient {
  return instanceManager.getClient();
}
