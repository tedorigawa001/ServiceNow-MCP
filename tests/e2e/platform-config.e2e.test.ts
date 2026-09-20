/**
 * E2E smoke tests for platform configuration tables that exist on every
 * instance: system properties, notifications, reports / scheduled jobs /
 * syslog, Update Sets, Data Management, ATF, Flow Designer, scoped apps.
 * Read-only. See tests/e2e/helpers.ts and CONTRIBUTING.md for setup.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { executeSysPropertiesToolCall } from '../../src/tools/sys-properties.js';
import { executeNotificationToolCall } from '../../src/tools/notification.js';
import { executeReportingToolCall } from '../../src/tools/reporting.js';
import { executeUpdateSetToolCall } from '../../src/tools/updateset.js';
import { executeDataManagementToolCall } from '../../src/tools/data-management.js';
import { executeAtfToolCall } from '../../src/tools/atf.js';
import { executeFlowToolCall } from '../../src/tools/flow.js';
import { executeAppStudioToolCall } from '../../src/tools/app-studio.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – platform configuration (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('sys_properties', () => {
    it('lists system properties', async () => {
      const result = await executeSysPropertiesToolCall(client, 'list_system_properties', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.properties)).toBe(true);
    });

    it('lists property categories', async () => {
      const result = await executeSysPropertiesToolCall(client, 'list_property_categories', {});
      expect(result).toBeTruthy();
    });

    it('fetches a single property by name when one exists', async () => {
      const list = await executeSysPropertiesToolCall(client, 'list_system_properties', { limit: 1 });
      if (list.count === 0) return;
      const property = await executeSysPropertiesToolCall(client, 'get_system_property', { name: list.properties[0].name });
      expect(property.name).toBe(list.properties[0].name);
    });
  });

  describe('sysevent_email_action (notifications)', () => {
    it('lists notifications', async () => {
      const result = await executeNotificationToolCall(client, 'list_notifications', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single notification when one exists', async () => {
      const list = await executeNotificationToolCall(client, 'list_notifications', { limit: 1 });
      if (list.count === 0) return;
      const notification = await executeNotificationToolCall(client, 'get_notification', { sys_id_or_name: list.records[0].sys_id });
      expect(notification.sys_id).toBe(list.records[0].sys_id);
    });

    it('lists email logs and templates', async () => {
      const logs = await executeNotificationToolCall(client, 'list_email_logs', { limit: 5 });
      expect(logs.count).toBeGreaterThanOrEqual(0);
      const templates = await executeNotificationToolCall(client, 'list_email_templates', { limit: 5 });
      expect(templates.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single email log entry when one exists', async () => {
      const list = await executeNotificationToolCall(client, 'list_email_logs', { limit: 1 });
      if (list.count === 0) return;
      const entry = await executeNotificationToolCall(client, 'get_email_log', { sys_id: list.records[0].sys_id });
      expect(entry.sys_id).toBe(list.records[0].sys_id);
    });

    it('lists notification subscriptions', async () => {
      const result = await executeNotificationToolCall(client, 'list_notification_subscriptions', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sys_report / sysauto_script / syslog', () => {
    it('lists reports', async () => {
      const result = await executeReportingToolCall(client, 'list_reports', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.reports)).toBe(true);
    });

    it('fetches a single report when one exists', async () => {
      const list = await executeReportingToolCall(client, 'list_reports', { limit: 1 });
      if (list.count === 0) return;
      const report = await executeReportingToolCall(client, 'get_report', { sys_id_or_name: list.reports[0].sys_id });
      expect(report.sys_id).toBe(list.reports[0].sys_id);
    });

    it('lists scheduled jobs', async () => {
      const result = await executeReportingToolCall(client, 'list_scheduled_jobs', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.jobs)).toBe(true);
    });

    it('fetches a single scheduled job when one exists', async () => {
      const list = await executeReportingToolCall(client, 'list_scheduled_jobs', { limit: 1 });
      if (list.count === 0) return;
      const job = await executeReportingToolCall(client, 'get_scheduled_job', { sys_id_or_name: list.jobs[0].sys_id });
      expect(job.sys_id).toBe(list.jobs[0].sys_id);
    });

    it('reads the system log', async () => {
      const result = await executeReportingToolCall(client, 'get_sys_log', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('lists scheduled job run history when the log table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sysauto_trigger_log');
      const result = await executeReportingToolCall(client, 'list_job_run_history', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sys_update_set', () => {
    it('reports the current update set', async () => {
      const result = await executeUpdateSetToolCall(client, 'get_current_update_set', {});
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.active_update_sets)).toBe(true);
    });

    it('lists update sets', async () => {
      const result = await executeUpdateSetToolCall(client, 'list_update_sets', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.update_sets)).toBe(true);
    });
  });

  describe('sys_dm_policy / sys_archive / sys_auto_flush (Data Management)', () => {
    it('lists data management policies', async () => {
      const result = await executeDataManagementToolCall(client, 'list_data_management_policies', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single policy when one exists', async () => {
      const list = await executeDataManagementToolCall(client, 'list_data_management_policies', { limit: 1 });
      const first = list.records?.[0] ?? list.policies?.[0];
      if (!first) return;
      const policy = await executeDataManagementToolCall(client, 'get_data_management_policy', { sys_id: first.sys_id });
      expect(policy.sys_id ?? policy.policy?.sys_id).toBe(first.sys_id);
    });

    it('lists archive rules and cleanup rules', async () => {
      const archive = await executeDataManagementToolCall(client, 'list_archive_rules', { limit: 5 });
      expect(archive.count).toBeGreaterThanOrEqual(0);
      const cleanup = await executeDataManagementToolCall(client, 'list_cleanup_rules', { limit: 5 });
      expect(cleanup.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sys_atf_test_suite / sys_atf_test (ATF)', () => {
    it('lists ATF suites and tests', async () => {
      const suites = await executeAtfToolCall(client, 'list_atf_suites', { limit: 5 });
      expect(suites.count).toBeGreaterThanOrEqual(0);
      const tests = await executeAtfToolCall(client, 'list_atf_tests', { limit: 5 });
      expect(tests.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single ATF suite and test when they exist', async () => {
      const suites = await executeAtfToolCall(client, 'list_atf_suites', { limit: 1 });
      if (suites.count > 0) {
        const suite = await executeAtfToolCall(client, 'get_atf_suite', { sys_id_or_name: suites.suites[0].sys_id });
        expect(suite.sys_id).toBe(suites.suites[0].sys_id);
      }
      const tests = await executeAtfToolCall(client, 'list_atf_tests', { limit: 1 });
      if (tests.count > 0) {
        const test = await executeAtfToolCall(client, 'get_atf_test', { sys_id: tests.tests[0].sys_id });
        expect(test.sys_id).toBe(tests.tests[0].sys_id);
      }
    });

    it('lists ATF results when the result table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_atf_result');
      const result = await executeAtfToolCall(client, 'list_atf_test_results', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sys_hub_flow / sys_hub_action_instance (Flow Designer)', () => {
    it('lists flows and action instances', async () => {
      const flows = await executeFlowToolCall(client, 'list_flows', { limit: 5 });
      expect(flows.count).toBeGreaterThanOrEqual(0);
      const actions = await executeFlowToolCall(client, 'list_action_instances', { limit: 5 });
      expect(actions.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single flow when one exists', async () => {
      const list = await executeFlowToolCall(client, 'list_flows', { limit: 1 });
      if (list.count === 0) return;
      const flow = await executeFlowToolCall(client, 'get_flow', { name_or_sysid: list.records[0].sys_id });
      expect(flow.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sys_app (scoped apps)', () => {
    it('lists scoped apps', async () => {
      const result = await executeAppStudioToolCall(client, 'list_scoped_apps', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single scoped app when one exists', async () => {
      const list = await executeAppStudioToolCall(client, 'list_scoped_apps', { limit: 1 });
      if (list.count === 0) return;
      const app = await executeAppStudioToolCall(client, 'get_scoped_app', { id: list.records[0].sys_id });
      expect(app.sys_id).toBe(list.records[0].sys_id);
    });
  });
});
