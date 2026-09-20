/**
 * E2E smoke tests for ITOM / asset tables: Discovery, MID Server, ECC Queue,
 * CMDB health, instance diagnostics, Performance Analytics, SAM, ITAM.
 * Read-only. ACC (Agent Client Collector) is an optional plugin whose tools
 * already return a typed PLUGIN_NOT_INSTALLED error when absent, so that
 * behaviour is asserted rather than skipped. See tests/e2e/helpers.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables, tableExists } from './helpers.js';
import { executeDiscoveryToolCall } from '../../src/tools/discovery.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import { executePerformanceToolCall } from '../../src/tools/performance.js';
import { executeSamToolCall } from '../../src/tools/sam.js';
import { executeItamToolCall } from '../../src/tools/itam.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – ITOM and asset tables (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('discovery_status / discovery_device_history / discovery_log', () => {
    it('lists discovery runs, devices and logs', async () => {
      const runs = await executeDiscoveryToolCall(client, 'list_discovery_runs', { limit: 5 });
      expect(runs.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(runs.runs)).toBe(true);
      const devices = await executeDiscoveryToolCall(client, 'list_discovered_devices', { limit: 5 });
      expect(devices.count).toBeGreaterThanOrEqual(0);
      const logs = await executeDiscoveryToolCall(client, 'list_discovery_logs', { limit: 5 });
      expect(logs.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single discovery run when one exists', async () => {
      const list = await executeDiscoveryToolCall(client, 'list_discovery_runs', { limit: 1 });
      if (list.count === 0) return;
      const run = await executeDiscoveryToolCall(client, 'get_discovery_run', { run_id: list.runs[0].sys_id });
      expect(run).toBeTruthy();
    });

    it('lists discovery ranges, credentials and schedules', async () => {
      const ranges = await executeDiscoveryToolCall(client, 'list_discovery_ranges', { limit: 5 });
      expect(ranges.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(ranges.ranges)).toBe(true);
      const credentials = await executeDiscoveryToolCall(client, 'list_discovery_credentials', { limit: 5 });
      expect(credentials.count).toBeGreaterThanOrEqual(0);
      const schedules = await executeCoreToolCall(client, 'list_discovery_schedules', { limit: 5 });
      expect(schedules.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ecc_agent / ecc_queue (MID Server)', () => {
    it('lists MID servers, issues and extension contexts', async () => {
      const servers = await executeCoreToolCall(client, 'list_mid_servers', { limit: 5 });
      expect(servers.count).toBeGreaterThanOrEqual(0);
      const issues = await executeDiscoveryToolCall(client, 'list_mid_server_issues', { limit: 5 });
      expect(issues.count).toBeGreaterThanOrEqual(0);
      const contexts = await executeDiscoveryToolCall(client, 'list_mid_extension_contexts', { limit: 5 });
      expect(contexts.count).toBeGreaterThanOrEqual(0);
    });

    it('lists ECC queue entries', async () => {
      const result = await executeDiscoveryToolCall(client, 'list_ecc_queue', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.entries)).toBe(true);
    });

    it('reports MID server health for the first server when one exists', async () => {
      const servers = await executeCoreToolCall(client, 'list_mid_servers', { limit: 1 });
      if (servers.count === 0) return;
      const health = await executeDiscoveryToolCall(client, 'get_mid_server_health', { mid_server: servers.records[0].sys_id });
      expect(health).toBeTruthy();
    });
  });

  describe('sn_agent_* (ACC, optional plugin)', () => {
    it('either lists ACC agents or reports PLUGIN_NOT_INSTALLED', async () => {
      const installed = await tableExists(client, 'sn_agent_cmdb_ci_agent');
      if (installed) {
        const result = await executeDiscoveryToolCall(client, 'list_acc_agents', { limit: 5 });
        expect(result.count).toBeGreaterThanOrEqual(0);
        return;
      }
      await expect(executeDiscoveryToolCall(client, 'list_acc_agents', { limit: 5 }))
        .rejects.toMatchObject({ code: 'PLUGIN_NOT_INSTALLED' });
    });
  });

  describe('cmdb_ci (health) / xmlstats (instance diagnostics)', () => {
    it('builds the CMDB health dashboard', async () => {
      const result = await executeCoreToolCall(client, 'cmdb_health_dashboard', {});
      expect(result).toBeTruthy();
    });

    it('reads instance diagnostics and performance history', async () => {
      const diagnostics = await executePerformanceToolCall(client, 'get_instance_diagnostics', {});
      expect(diagnostics).toBeTruthy();
      const history = await executePerformanceToolCall(client, 'get_performance_history', { hours: 1 });
      expect(history).toBeTruthy();
    });

    it('counts records in a core table', async () => {
      const result = await executePerformanceToolCall(client, 'get_table_record_count', { table: 'sys_user' });
      // The Aggregate API returns the count as a string; the tool passes it through as-is.
      expect(Number.isFinite(Number(result.record_count))).toBe(true);
    });
  });

  describe('pa_indicators / pa_breakdowns / pa_dashboards', () => {
    it('lists PA indicators, breakdowns and dashboards', async () => {
      const indicators = await executePerformanceToolCall(client, 'list_pa_indicators', { limit: 5 });
      expect(indicators.count).toBeGreaterThanOrEqual(0);
      const breakdowns = await executePerformanceToolCall(client, 'list_pa_breakdowns', { limit: 5 });
      expect(breakdowns.count).toBeGreaterThanOrEqual(0);
      const dashboards = await executePerformanceToolCall(client, 'list_pa_dashboards', { limit: 5 });
      expect(dashboards.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single PA indicator and dashboard when they exist', async () => {
      const indicators = await executePerformanceToolCall(client, 'list_pa_indicators', { limit: 1 });
      if (indicators.count > 0) {
        const indicator = await executePerformanceToolCall(client, 'get_pa_indicator', { sys_id_or_name: indicators.records[0].sys_id });
        expect(indicator.sys_id).toBe(indicators.records[0].sys_id);
      }
      const dashboards = await executePerformanceToolCall(client, 'list_pa_dashboards', { limit: 1 });
      if (dashboards.count > 0) {
        const dashboard = await executePerformanceToolCall(client, 'get_pa_dashboard', { sys_id_or_name: dashboards.records[0].sys_id });
        expect(dashboard.sys_id).toBe(dashboards.records[0].sys_id);
      }
    });

    it('lists PA jobs when the job table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'pa_job');
      const result = await executePerformanceToolCall(client, 'list_pa_jobs', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cmdb_sam_sw_install / samp_* (SAM)', () => {
    it('lists software installs, products, models and discovery models', async () => {
      const installs = await executeSamToolCall(client, 'list_software_installs', { limit: 5 });
      expect(installs.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(installs.installs)).toBe(true);
      const products = await executeSamToolCall(client, 'list_software_products', { limit: 5 });
      expect(products.count).toBeGreaterThanOrEqual(0);
      const models = await executeSamToolCall(client, 'list_software_models', { limit: 5 });
      expect(models.count).toBeGreaterThanOrEqual(0);
      const discoveryModels = await executeSamToolCall(client, 'list_software_discovery_models', { limit: 5 });
      expect(discoveryModels.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single software install and model when they exist', async () => {
      const installs = await executeSamToolCall(client, 'list_software_installs', { limit: 1 });
      if (installs.count > 0) {
        const install = await executeSamToolCall(client, 'get_software_install', { sys_id: installs.installs[0].sys_id });
        expect(install.sys_id).toBe(installs.installs[0].sys_id);
      }
      const models = await executeSamToolCall(client, 'list_software_models', { limit: 1 });
      if (models.count > 0) {
        const model = await executeSamToolCall(client, 'get_software_model', { sys_id: models.models[0].sys_id });
        expect(model.sys_id).toBe(models.models[0].sys_id);
      }
    });

    it('lists license positions and the position summary', async () => {
      const positions = await executeSamToolCall(client, 'list_license_positions', { limit: 5 });
      expect(positions.count).toBeGreaterThanOrEqual(0);
      const summary = await executeSamToolCall(client, 'get_license_position_summary', {});
      expect(summary).toBeTruthy();
    });

    it('lists software lifecycle reports and entries', async () => {
      const reports = await executeSamToolCall(client, 'list_software_lifecycle_reports', { limit: 5 });
      expect(reports.count).toBeGreaterThanOrEqual(0);
      const entries = await executeSamToolCall(client, 'list_software_lifecycle_entries', { limit: 5 });
      expect(entries.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('alm_asset / alm_license / ast_contract (ITAM)', () => {
    it('lists assets, licenses and contracts', async () => {
      const assets = await executeItamToolCall(client, 'list_assets', { limit: 5 });
      expect(assets.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(assets.assets)).toBe(true);
      const licenses = await executeItamToolCall(client, 'list_software_licenses', { limit: 5 });
      expect(licenses.count).toBeGreaterThanOrEqual(0);
      const contracts = await executeItamToolCall(client, 'list_asset_contracts', { limit: 5 });
      expect(contracts.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single asset when one exists', async () => {
      const list = await executeItamToolCall(client, 'list_assets', { limit: 1 });
      if (list.count === 0) return;
      const asset = await executeItamToolCall(client, 'get_asset', { sys_id: list.assets[0].sys_id });
      expect(asset.sys_id).toBe(list.assets[0].sys_id);
    });

    it('reports license compliance and optimisation', async () => {
      const compliance = await executeItamToolCall(client, 'get_license_compliance', {});
      expect(compliance).toBeTruthy();
      const optimisation = await executeItamToolCall(client, 'get_license_optimization', {});
      expect(optimisation).toBeTruthy();
    });
  });
});
