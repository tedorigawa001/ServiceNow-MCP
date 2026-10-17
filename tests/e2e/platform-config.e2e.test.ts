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

    it('fetches a single property by name when one exists', async (ctx) => {
      const list = await executeSysPropertiesToolCall(client, 'list_system_properties', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_system_properties returned no records');
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

    it('fetches a single notification when one exists', async (ctx) => {
      const list = await executeNotificationToolCall(client, 'list_notifications', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_notifications returned no records');
      const notification = await executeNotificationToolCall(client, 'get_notification', { sys_id_or_name: list.records[0].sys_id });
      expect(notification.sys_id).toBe(list.records[0].sys_id);
    });

    it('lists email logs and templates', async () => {
      const logs = await executeNotificationToolCall(client, 'list_email_logs', { limit: 5 });
      expect(logs.count).toBeGreaterThanOrEqual(0);
      const templates = await executeNotificationToolCall(client, 'list_email_templates', { limit: 5 });
      expect(templates.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single email log entry when one exists', async (ctx) => {
      const list = await executeNotificationToolCall(client, 'list_email_logs', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_email_logs returned no records');
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

    it('fetches a single report when one exists', async (ctx) => {
      const list = await executeReportingToolCall(client, 'list_reports', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_reports returned no records');
      const report = await executeReportingToolCall(client, 'get_report', { sys_id_or_name: list.reports[0].sys_id });
      expect(report.sys_id).toBe(list.reports[0].sys_id);
    });

    it('lists scheduled jobs', async () => {
      const result = await executeReportingToolCall(client, 'list_scheduled_jobs', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.jobs)).toBe(true);
    });

    it('fetches a single scheduled job when one exists', async (ctx) => {
      const list = await executeReportingToolCall(client, 'list_scheduled_jobs', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_scheduled_jobs returned no records');
      const job = await executeReportingToolCall(client, 'get_scheduled_job', { sys_id_or_name: list.jobs[0].sys_id });
      expect(job.sys_id).toBe(list.jobs[0].sys_id);
    });

    it('reads the system log', async () => {
      const result = await executeReportingToolCall(client, 'get_sys_log', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

  });

  describe('Scheduler aggregate history', () => {
    it('lists scheduler history as aggregate rows, not individual run outcomes', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_scheduler_job_history');
      const result = await executeReportingToolCall(client, 'list_job_run_history', { limit: 5 });
      expect(result.source_table).toBe('sys_scheduler_job_history');
      expect(result.data_kind).toBe('scheduler_aggregate');
      expect(Array.isArray(result.history)).toBe(true);
      expect(result.count).toBe(result.history.length);
      expect(result.count).toBeLessThanOrEqual(5);
      const ends: string[] = [];
      for (const record of result.history) {
        expect(record).toHaveProperty('job_classification');
        expect(record).toHaveProperty('time_range_start');
        expect(record).toHaveProperty('time_range_end');
        expect(record).toHaveProperty('average');
        expect(record).toHaveProperty('total');
        expect(record).toHaveProperty('max_duration');
        expect(record.count).toMatch(/^\d+$/);
        expect(record).not.toHaveProperty('status');
        ends.push(record.time_range_end);
      }
      expect(ends).toEqual([...ends].sort().reverse());
    });

    it('filters existing aggregate history by exact job classification', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_scheduler_job_history');
      const list = await executeReportingToolCall(client, 'list_job_run_history', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_job_run_history returned no aggregate rows');
      const classification = list.history[0].job_classification;
      const result = await executeReportingToolCall(client, 'list_job_run_history', { job_classification: classification, limit: 3 });
      expect(result.count).toBeGreaterThan(0);
      for (const record of result.history) expect(record.job_classification).toBe(classification);
    });

    it('does not expand a classification literal into additional query clauses', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_scheduler_job_history');
      const result = await executeReportingToolCall(client, 'list_job_run_history', {
        job_classification: 'MCP_E2E_NO_MATCH_20261017^ORcount>0', limit: 3,
      });
      expect(result.count).toBe(0);
      expect(result.history).toEqual([]);
      expect(result.data_kind).toBe('scheduler_aggregate');
    });

    it.each([{ job_sys_id: '00000000000000000000000000000000' }, { status: 'error' }])('rejects unsupported individual-run filters %j', async (args) => {
      await expect(executeReportingToolCall(client, 'list_job_run_history', args))
        .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    });

    it('verifies the real aggregate schema rather than relying on an empty response', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_scheduler_job_history');
      const fields = ['average', 'count', 'job_classification', 'max_duration', 'priority', 'time_range_end', 'time_range_start', 'total'];
      const result = await client.queryRecords({
        table: 'sys_dictionary', query: `name=sys_scheduler_job_history^elementIN${fields.join(',')}`,
        fields: 'element', limit: 20,
      });
      expect(result.records.map(record => record.element).sort()).toEqual(fields);
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

    it('fetches a single policy when one exists', async (ctx) => {
      const list = await executeDataManagementToolCall(client, 'list_data_management_policies', { limit: 1 });
      const first = list.records?.[0] ?? list.policies?.[0];
      ctx.skip(!first, 'data missing: list_data_management_policies returned no records');
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

    it('fetches get_atf_suite details when data exists', async (ctx) => {
      const suites = await executeAtfToolCall(client, 'list_atf_suites', { limit: 1 });
      ctx.skip(suites.count === 0, 'data missing: list_atf_suites returned no records');
      const suite = await executeAtfToolCall(client, 'get_atf_suite', { sys_id_or_name: suites.suites[0].sys_id });
      expect(suite.sys_id).toBe(suites.suites[0].sys_id);
    });

    it('fetches get_atf_test details when data exists', async (ctx) => {
      const tests = await executeAtfToolCall(client, 'list_atf_tests', { limit: 1 });
      ctx.skip(tests.count === 0, 'data missing: list_atf_tests returned no records');
      const test = await executeAtfToolCall(client, 'get_atf_test', { sys_id: tests.tests[0].sys_id });
      expect(test.sys_id).toBe(tests.tests[0].sys_id);
    });

    it('lists ATF results when the result table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_atf_test_result');
      const result = await executeAtfToolCall(client, 'list_atf_test_results', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.results)).toBe(true);
      for (const record of result.results) {
        expect(record.sys_id).toMatch(/^[0-9a-f]{32}$/);
        expect(record).toHaveProperty('test');
        expect(record).toHaveProperty('parent');
        expect(record).toHaveProperty('output');
      }
    });

    it('filters ATF results through the suite-result parent reference', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_atf_test_result');
      // Results may legitimately be empty. Check the real dictionary as well,
      // because ServiceNow can silently ignore filters on unknown columns.
      const dictionary = await client.queryRecords({
        table: 'sys_dictionary',
        query: 'name=sys_atf_test_result^elementINparent,test,status,output,message_reference',
        fields: 'element,reference', limit: 10,
      });
      expect(dictionary.records.map(record => record.element).sort())
        .toEqual(['message_reference', 'output', 'parent', 'status', 'test']);
      const parentReference = dictionary.records.find(record => record.element === 'parent')?.reference;
      expect(typeof parentReference === 'object' ? parentReference?.value : parentReference)
        .toBe('sys_atf_test_suite_result');
      const result = await executeAtfToolCall(client, 'list_atf_test_results', {
        suite_result_sys_id: '00000000000000000000000000000000', limit: 5,
      });
      expect(result).toEqual({ count: 0, results: [] });
    });
  });

  describe('sys_hub_flow / sys_hub_action_instance (Flow Designer)', () => {
    it('lists flows and action instances', async () => {
      const flows = await executeFlowToolCall(client, 'list_flows', { limit: 5 });
      expect(flows.count).toBeGreaterThanOrEqual(0);
      const actions = await executeFlowToolCall(client, 'list_action_instances', { limit: 5 });
      expect(actions.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single flow when one exists', async (ctx) => {
      const list = await executeFlowToolCall(client, 'list_flows', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_flows returned no records');
      const flow = await executeFlowToolCall(client, 'get_flow', { name_or_sysid: list.records[0].sys_id });
      expect(flow.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sys_app (scoped apps)', () => {
    it('lists scoped apps', async () => {
      const result = await executeAppStudioToolCall(client, 'list_scoped_apps', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single scoped app when one exists', async (ctx) => {
      const list = await executeAppStudioToolCall(client, 'list_scoped_apps', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_scoped_apps returned no records');
      const app = await executeAppStudioToolCall(client, 'get_scoped_app', { id: list.records[0].sys_id });
      expect(app.sys_id).toBe(list.records[0].sys_id);
    });
  });
});
