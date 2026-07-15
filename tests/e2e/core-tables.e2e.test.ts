/**
 * E2E smoke tests against a real PDI. Opt-in only — see tests/e2e/helpers.ts
 * and CONTRIBUTING.md for how to configure and run these.
 *
 * Scope: read-only coverage of the major ITSM/CMDB tables (incident,
 * change_request, problem, sys_user, cmdb_ci) through the same tool
 * executors the MCP server dispatches to, so this also validates that the
 * query-building/sanitization logic produces syntactically valid encoded
 * queries against a live instance (not just the mocked unit tests).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeIncidentToolCall } from '../../src/tools/incident.js';
import { executeChangeToolCall } from '../../src/tools/change.js';
import { executeProblemToolCall } from '../../src/tools/problem.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – core tables (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('incident', () => {
    it('lists incidents via query_records', async () => {
      const result = await executeCoreToolCall(client, 'query_records', { table: 'incident', limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single incident by number or sys_id when one exists', async () => {
      const list = await executeCoreToolCall(client, 'query_records', { table: 'incident', limit: 1, fields: 'number,sys_id' });
      if (list.count === 0) return; // PDI has no incidents yet — nothing to fetch
      const incident = await executeIncidentToolCall(client, 'get_incident', { number_or_sysid: list.records[0].number });
      expect(incident.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('change_request', () => {
    it('lists change requests', async () => {
      const result = await executeChangeToolCall(client, 'list_change_requests', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single change request when one exists', async () => {
      const list = await executeChangeToolCall(client, 'list_change_requests', { limit: 1 });
      if (list.count === 0) return;
      const change = await executeChangeToolCall(client, 'get_change_request', { number_or_sysid: list.records[0].number });
      expect(change.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('problem', () => {
    it('lists problems via query_records', async () => {
      const result = await executeCoreToolCall(client, 'query_records', { table: 'problem', limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single problem when one exists', async () => {
      const list = await executeCoreToolCall(client, 'query_records', { table: 'problem', limit: 1, fields: 'number,sys_id' });
      if (list.count === 0) return;
      const problem = await executeProblemToolCall(client, 'get_problem', { number_or_sysid: list.records[0].number });
      expect(problem.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sys_user', () => {
    it('resolves a known user by identifier when one exists', async () => {
      const list = await executeCoreToolCall(client, 'query_records', { table: 'sys_user', limit: 1, fields: 'user_name,sys_id' });
      if (list.count === 0) return;
      const user = await executeCoreToolCall(client, 'get_user', { user_identifier: list.records[0].user_name });
      expect(user.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('cmdb_ci', () => {
    it('searches CIs', async () => {
      const result = await executeCoreToolCall(client, 'search_cmdb_ci', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single CI when one exists', async () => {
      const list = await executeCoreToolCall(client, 'search_cmdb_ci', { limit: 1 });
      if (list.count === 0) return;
      const ci = await executeCoreToolCall(client, 'get_cmdb_ci', { ci_sys_id: list.records[0].sys_id });
      expect(ci.sys_id).toBe(list.records[0].sys_id);
    });
  });
});
