/**
 * E2E smoke tests for modules that depend on optional plugins: Agile, HRSD,
 * CSM, Security Incident Response, DevOps, Mobile, Event Management, plus the
 * ML/prediction helpers and deployment history that run on any instance.
 *
 * Every plugin-backed test gates on its table with skipUnlessTables, so an
 * instance without the plugin reports "skipped" with the table named, while
 * an instance that has the plugin exercises the tool for real. Read-only.
 * See tests/e2e/helpers.ts and CONTRIBUTING.md for setup.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { executeAgileToolCall } from '../../src/tools/agile.js';
import { executeHrsdToolCall } from '../../src/tools/hrsd.js';
import { executeCsmToolCall } from '../../src/tools/csm.js';
import { executeSecurityToolCall } from '../../src/tools/security.js';
import { executeDevopsToolCall } from '../../src/tools/devops.js';
import { executeMobileToolCall } from '../../src/tools/mobile.js';
import { executeDeploymentToolCall } from '../../src/tools/deployment.js';
import { executeMlToolCall } from '../../src/tools/ml.js';
import { executeFlowToolCall } from '../../src/tools/flow.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – optional plugins (read-only, gated on plugin tables)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('rm_story / rm_epic / rm_scrum_task (Agile)', () => {
    it('lists stories, epics and scrum tasks', async (ctx) => {
      await skipUnlessTables(ctx, client, 'rm_story', 'rm_epic', 'rm_scrum_task');
      const stories = await executeAgileToolCall(client, 'list_stories', { limit: 5 });
      expect(stories.count).toBeGreaterThanOrEqual(0);
      const epics = await executeAgileToolCall(client, 'list_epics', { limit: 5 });
      expect(epics.count).toBeGreaterThanOrEqual(0);
      const tasks = await executeAgileToolCall(client, 'list_scrum_tasks', { limit: 5 });
      expect(tasks.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sn_hr_core_* (HRSD)', () => {
    it('lists HR cases, services and document templates', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_hr_core_case', 'sn_hr_core_service', 'sn_hr_core_document_template');
      const cases = await executeHrsdToolCall(client, 'list_hr_cases', { limit: 5 });
      expect(cases.count).toBeGreaterThanOrEqual(0);
      const services = await executeHrsdToolCall(client, 'list_hr_services', { limit: 5 });
      expect(services.count).toBeGreaterThanOrEqual(0);
      const templates = await executeHrsdToolCall(client, 'list_hr_document_templates', { limit: 5 });
      expect(templates.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single HR case when one exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_hr_core_case');
      const list = await executeHrsdToolCall(client, 'list_hr_cases', { limit: 1 });
      if (list.count === 0) return;
      const hrCase = await executeHrsdToolCall(client, 'get_hr_case', { number_or_sysid: list.records[0].sys_id });
      expect(hrCase.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_customerservice_case / customer_account / customer_contact (CSM)', () => {
    it('lists CSM products (core table, always present)', async () => {
      const result = await executeCsmToolCall(client, 'list_csm_products', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('lists CSM cases, accounts and contacts', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_customerservice_case', 'customer_account', 'customer_contact');
      const cases = await executeCsmToolCall(client, 'list_csm_cases', { limit: 5 });
      expect(cases.count).toBeGreaterThanOrEqual(0);
      const accounts = await executeCsmToolCall(client, 'list_csm_accounts', { limit: 5 });
      expect(accounts.count).toBeGreaterThanOrEqual(0);
      const contacts = await executeCsmToolCall(client, 'list_csm_contacts', { limit: 5 });
      expect(contacts.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single CSM case when one exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_customerservice_case');
      const list = await executeCsmToolCall(client, 'list_csm_cases', { limit: 1 });
      if (list.count === 0) return;
      const csmCase = await executeCsmToolCall(client, 'get_csm_case', { number_or_sysid: list.records[0].sys_id });
      expect(csmCase.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_si_incident / sn_si_playbook (Security Incident Response)', () => {
    it('lists legacy vulnerabilities (sn_vul, always present with VR)', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_vul_vulnerability');
      const result = await executeSecurityToolCall(client, 'list_vulnerabilities', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('lists security incidents and playbooks, and builds the dashboard', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_si_incident', 'sn_si_playbook');
      const incidents = await executeSecurityToolCall(client, 'list_security_incidents', { limit: 5 });
      expect(incidents.count).toBeGreaterThanOrEqual(0);
      const playbooks = await executeSecurityToolCall(client, 'list_security_playbooks', { limit: 5 });
      expect(playbooks.count).toBeGreaterThanOrEqual(0);
      const dashboard = await executeSecurityToolCall(client, 'get_security_dashboard', { days: 30 });
      expect(dashboard).toBeTruthy();
    });

    it('fetches a single security incident when one exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_si_incident');
      const list = await executeSecurityToolCall(client, 'list_security_incidents', { limit: 1 });
      if (list.count === 0) return;
      const incident = await executeSecurityToolCall(client, 'get_security_incident', { number_or_sysid: list.records[0].sys_id });
      expect(incident.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_devops_pipeline / sn_devops_deploy_task (DevOps)', () => {
    it('lists pipelines, deployments and insights', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_devops_pipeline', 'sn_devops_deploy_task');
      const pipelines = await executeDevopsToolCall(client, 'list_devops_pipelines', { limit: 5 });
      expect(pipelines.count).toBeGreaterThanOrEqual(0);
      const deployments = await executeDevopsToolCall(client, 'list_deployments', { limit: 5 });
      expect(deployments.count).toBeGreaterThanOrEqual(0);
      const insights = await executeDevopsToolCall(client, 'get_devops_insights', {});
      expect(insights).toBeTruthy();
    });
  });

  describe('sys_sg_mobile_* (Mobile)', () => {
    it('lists mobile app configs, applets and layouts, and reads analytics', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_sg_mobile_app_config', 'sys_sg_mobile_applet', 'sys_sg_mobile_layout');
      const configs = await executeMobileToolCall(client, 'list_mobile_app_configs', { limit: 5 });
      expect(configs.count).toBeGreaterThanOrEqual(0);
      const applets = await executeMobileToolCall(client, 'list_mobile_applets', { limit: 5 });
      expect(applets.count).toBeGreaterThanOrEqual(0);
      const layouts = await executeMobileToolCall(client, 'list_mobile_layouts', { limit: 5 });
      expect(layouts.count).toBeGreaterThanOrEqual(0);
      const analytics = await executeMobileToolCall(client, 'get_mobile_analytics', {});
      expect(analytics).toBeTruthy();
    });
  });

  describe('em_event (Event Management)', () => {
    it('lists active events when the event table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'em_event');
      const result = await executeCoreToolCall(client, 'list_active_events', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sys_hub_subflow / pa_process (Flow Designer extras)', () => {
    it('lists subflows when the subflow table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_hub_subflow');
      const result = await executeFlowToolCall(client, 'list_subflows', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('lists process automations when the pa_process table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'pa_process');
      const result = await executeFlowToolCall(client, 'list_process_automations', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('deployment history (core tables)', () => {
    it('lists deployment history', async () => {
      const result = await executeDeploymentToolCall(client, 'list_deployment_history', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.deployments)).toBe(true);
    });
  });

  describe('ML helpers (computed from core tables)', () => {
    it('predicts change risk, forecasts incidents and runs VA NLU', async () => {
      const risk = await executeMlToolCall(client, 'ml_predict_change_risk', {});
      expect(risk).toBeTruthy();
      const forecast = await executeMlToolCall(client, 'ml_forecast_incidents', {});
      expect(forecast).toBeTruthy();
      const nlu = await executeMlToolCall(client, 'ml_virtual_agent_nlu', {});
      expect(nlu).toBeTruthy();
    });
  });
});
