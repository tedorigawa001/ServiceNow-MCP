/**
 * E2E smoke tests for scripting-tier tables: business rules, script
 * includes, client scripts, UI policies, UI actions, ACLs, changesets.
 *
 * These are read-only list/get calls, but the scripting module gates every
 * tool behind SCRIPTING_ENABLED=true (Tier 3), so this file runs only under
 * scriptingE2eDescribe — RUN_E2E, WRITE_ENABLED and SCRIPTING_ENABLED all
 * set to true. Nothing here writes. See tests/e2e/helpers.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { scriptingE2eDescribe, getE2EClient } from './helpers.js';
import { executeScriptToolCall } from '../../src/tools/script.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

scriptingE2eDescribe('E2E – scripting tables (read-only, scripting tier)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('sys_script (business rules)', () => {
    it('lists business rules', async () => {
      const result = await executeScriptToolCall(client, 'list_business_rules', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.business_rules)).toBe(true);
    });

    it('fetches a single business rule when one exists', async (ctx) => {
      const list = await executeScriptToolCall(client, 'list_business_rules', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_business_rules returned no records');
      const rule = await executeScriptToolCall(client, 'get_business_rule', { sys_id: list.business_rules[0].sys_id });
      expect(rule.sys_id).toBe(list.business_rules[0].sys_id);
    });
  });

  describe('sys_script_include', () => {
    it('lists script includes', async () => {
      const result = await executeScriptToolCall(client, 'list_script_includes', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.script_includes)).toBe(true);
    });

    it('fetches a single script include when one exists', async (ctx) => {
      const list = await executeScriptToolCall(client, 'list_script_includes', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_script_includes returned no records');
      const include = await executeScriptToolCall(client, 'get_script_include', { sys_id_or_name: list.script_includes[0].sys_id });
      expect(include.sys_id).toBe(list.script_includes[0].sys_id);
    });
  });

  describe('sys_script_client', () => {
    it('lists client scripts', async () => {
      const result = await executeScriptToolCall(client, 'list_client_scripts', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.client_scripts)).toBe(true);
    });

    it('fetches a single client script when one exists', async (ctx) => {
      const list = await executeScriptToolCall(client, 'list_client_scripts', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_client_scripts returned no records');
      const script = await executeScriptToolCall(client, 'get_client_script', { sys_id: list.client_scripts[0].sys_id });
      expect(script.sys_id).toBe(list.client_scripts[0].sys_id);
    });
  });

  describe('sys_ui_policy / sys_ui_action', () => {
    it('lists UI policies and UI actions', async () => {
      const policies = await executeScriptToolCall(client, 'list_ui_policies', { limit: 5 });
      expect(policies.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(policies.ui_policies)).toBe(true);
      const actions = await executeScriptToolCall(client, 'list_ui_actions', { limit: 5 });
      expect(actions.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(actions.ui_actions)).toBe(true);
    });

    it('fetches get_ui_policy details when data exists', async (ctx) => {
      const policies = await executeScriptToolCall(client, 'list_ui_policies', { limit: 1 });
      ctx.skip(policies.count === 0, 'data missing: list_ui_policies returned no records');
      const policy = await executeScriptToolCall(client, 'get_ui_policy', { sys_id: policies.ui_policies[0].sys_id });
      expect(policy.sys_id).toBe(policies.ui_policies[0].sys_id);
    });

    it('fetches get_ui_action details when data exists', async (ctx) => {
      const actions = await executeScriptToolCall(client, 'list_ui_actions', { limit: 1 });
      ctx.skip(actions.count === 0, 'data missing: list_ui_actions returned no records');
      const action = await executeScriptToolCall(client, 'get_ui_action', { sys_id: actions.ui_actions[0].sys_id });
      expect(action.sys_id).toBe(actions.ui_actions[0].sys_id);
    });
  });

  describe('sys_security_acl', () => {
    it('lists ACLs', async () => {
      const result = await executeScriptToolCall(client, 'list_acls', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.acls)).toBe(true);
    });

    it('fetches a single ACL when one exists', async (ctx) => {
      const list = await executeScriptToolCall(client, 'list_acls', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_acls returned no records');
      const acl = await executeScriptToolCall(client, 'get_acl', { sys_id: list.acls[0].sys_id });
      expect(acl.sys_id).toBe(list.acls[0].sys_id);
    });
  });

  describe('sys_update_set (changesets)', () => {
    it('lists changesets', async () => {
      const result = await executeScriptToolCall(client, 'list_changesets', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.changesets)).toBe(true);
    });

    it('fetches a single changeset when one exists', async (ctx) => {
      const list = await executeScriptToolCall(client, 'list_changesets', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_changesets returned no records');
      const changeset = await executeScriptToolCall(client, 'get_changeset', { sys_id_or_name: list.changesets[0].sys_id });
      expect(changeset.sys_id).toBe(list.changesets[0].sys_id);
    });
  });
});
