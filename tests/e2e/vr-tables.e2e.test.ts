/**
 * E2E smoke tests for Vulnerability Response (VR/USEM) tables:
 * sn_vul_vulnerable_item, sn_vul_remediation_task / sn_vul_vulnerability
 * (remediation tasks span both — see list_remediation_tasks), and
 * sn_vul_nvd_entry. See tests/e2e/helpers.ts and CONTRIBUTING.md for setup.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeUsemToolCall } from '../../src/tools/usem.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – Vulnerability Response tables (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('sn_vul_vulnerable_item', () => {
    it('lists vulnerable items', async () => {
      const result = await executeUsemToolCall(client, 'list_vulnerable_items', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single vulnerable item when one exists', async () => {
      const list = await executeUsemToolCall(client, 'list_vulnerable_items', { limit: 1 });
      if (list.count === 0) return;
      const item = await executeUsemToolCall(client, 'get_vulnerable_item', { number_or_sysid: list.records[0].sys_id });
      expect(item.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('remediation tasks (sn_vul_remediation_task + sn_vul_vulnerability)', () => {
    it('lists remediation tasks across both source tables', async () => {
      const result = await executeUsemToolCall(client, 'list_remediation_tasks', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
      expect(result.by_table).toHaveProperty('sn_vul_remediation_task');
      expect(result.by_table).toHaveProperty('sn_vul_vulnerability');
    });

    it('fetches a single remediation task when one exists', async () => {
      const list = await executeUsemToolCall(client, 'list_remediation_tasks', { limit: 1 });
      if (list.count === 0) return;
      const task = await executeUsemToolCall(client, 'get_remediation_task', { number_or_sysid: list.records[0].sys_id });
      expect(task.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_vul_vulnerability (groups)', () => {
    it('lists vulnerability groups', async () => {
      const result = await executeUsemToolCall(client, 'list_vulnerability_groups', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single vulnerability group when one exists', async () => {
      const list = await executeUsemToolCall(client, 'list_vulnerability_groups', { limit: 1 });
      if (list.count === 0) return;
      const group = await executeUsemToolCall(client, 'get_vulnerability_group', { number_or_sysid: list.records[0].sys_id });
      expect(group.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_vul_nvd_entry', () => {
    it('lists NVD entries', async () => {
      const result = await executeUsemToolCall(client, 'list_nvd_entries', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });
  });
});
