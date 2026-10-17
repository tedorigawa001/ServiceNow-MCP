/**
 * E2E smoke tests for modules that depend on optional plugins: Agile, HRSD,
 * CSM, Security Incident Response, DevOps, Mobile, Event Management, plus the
 * ML/prediction helpers and deployment history that run on any instance.
 *
 * Every plugin-backed test gates on its table with skipUnlessTables, so an
 * instance without the plugin reports "skipped" with the table named, while
 * an instance that has the plugin exercises the tool for real. Read-only.
 * See tests/e2e/helpers.ts and CONTRIBUTING.md for setup.
 * E2E_READ_FIXTURES=true optionally creates a disposable Security Incident.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { withReadFixture } from './read-fixtures.js';
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
      ctx.skip(list.count === 0, 'data missing: list_hr_cases returned no records');
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
      ctx.skip(list.count === 0, 'data missing: list_csm_cases returned no records');
      const csmCase = await executeCsmToolCall(client, 'get_csm_case', { number_or_sysid: list.records[0].sys_id });
      expect(csmCase.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_si_incident / sys_pd_process_definition (Security Incident Response)', () => {
    it('lists legacy vulnerabilities (sn_vul, always present with VR)', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_vul_vulnerability');
      const result = await executeSecurityToolCall(client, 'list_vulnerabilities', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('lists security incidents and builds the dashboard', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_si_incident');
      const incidents = await executeSecurityToolCall(client, 'list_security_incidents', { limit: 5 });
      expect(incidents.count).toBeGreaterThanOrEqual(0);
      const dashboard = await executeSecurityToolCall(client, 'get_security_dashboard', { days: 30 });
      expect(dashboard).toBeTruthy();
      expect(dashboard.open_incidents).toBeTruthy();
    });

    it('lists the SIR playbooks shipped as PAD definitions in the sn_si_aw scope', async (ctx) => {
      // The playbooks are Process Automation Designer definitions, not an
      // sn_si_* table; sn_si_aw is the Security Incident Analyst Workspace scope.
      await skipUnlessTables(ctx, client, 'sys_pd_process_definition');
      const playbooks = await executeSecurityToolCall(client, 'list_security_playbooks', { limit: 25 });
      expect(Array.isArray(playbooks.records)).toBe(true);
      // Every returned definition must be from the SIR scope; when SIR is
      // installed the stock Malware/Phishing templates are present.
      const labels = playbooks.records.map((r: { label?: string; name?: string }) => r.label ?? r.name ?? '');
      ctx.skip(playbooks.count === 0, 'data missing: list_security_playbooks returned no SIR playbooks');
      expect(labels.some((l: string) => /malware|phishing|failed login/i.test(l))).toBe(true);
      const search = await executeSecurityToolCall(client, 'list_security_playbooks', { query: 'Malware', limit: 5 });
      for (const r of search.records as Array<{ label?: string; name?: string }>) {
        expect(`${r.label ?? ''} ${r.name ?? ''}`).toMatch(/malware/i);
      }
    });

    it('fetches a single security incident when one exists', { timeout: 120_000 }, async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_si_incident');
      await withReadFixture(client, 'security_incident', async fixture => {
        const list = await executeSecurityToolCall(client, 'list_security_incidents', { limit: 1, query: fixture?.query });
        ctx.skip(!fixture && list.count === 0, 'data missing: list_security_incidents returned no records');
        expect(list.count).toBe(1);
        if (fixture) expect(list.records[0].sys_id).toBe(fixture.sysId);
        const incident = await executeSecurityToolCall(client, 'get_security_incident', { number_or_sysid: list.records[0].sys_id });
        expect(incident.sys_id).toBe(list.records[0].sys_id);
        if (fixture) expect(incident.short_description).toBe(fixture.mark);
      });
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
      // Default: unprocessed only (Ready / Error).
      const result = await executeCoreToolCall(client, 'list_active_events', { limit: 20 });
      for (const e of result.records as Array<{ state: string }>) expect(['Ready', 'Error']).toContain(e.state);
      const all = await executeCoreToolCall(client, 'list_active_events', { state: 'all', limit: 20 });
      expect(all.count).toBeGreaterThanOrEqual(result.count);
      const created = (all.records as Array<{ sys_created_on: string }>).map((e) => e.sys_created_on);
      expect([...created].sort().reverse()).toEqual(created);
    });
  });

  describe('sys_hub_flow / sys_pd_process_definition (Flow Designer extras)', () => {
    it('lists subflows when the subflow table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_hub_flow');
      const result = await executeFlowToolCall(client, 'list_subflows', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
      for (const record of result.records) {
        expect(record.type).toBe('subflow');
        expect(record.active).toBe('true');
      }
    });

    it('gets a subflow by sys_id', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_hub_flow');
      const list = await executeFlowToolCall(client, 'list_subflows', { active: false, limit: 1 });
      ctx.skip(list.records.length === 0, 'data missing: list_subflows returned no records');
      const result = await executeFlowToolCall(client, 'get_subflow', { name_or_sysid: list.records[0].sys_id });
      expect(result.sys_id).toBe(list.records[0].sys_id);
      expect(result.type).toBe('subflow');
    });

    it('gets a subflow by name with the subflow discriminator', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_hub_flow');
      const list = await executeFlowToolCall(client, 'list_subflows', { active: false, limit: 1 });
      ctx.skip(list.records.length === 0, 'data missing: list_subflows returned no records');
      const result = await executeFlowToolCall(client, 'get_subflow', { name_or_sysid: list.records[0].name });
      expect(result.type).toBe('subflow');
      expect(result.name).toContain(list.records[0].name);
    });

    it('rejects an ordinary flow passed to get_subflow', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_hub_flow');
      const list = await executeFlowToolCall(client, 'list_flows', { active: false, limit: 1 });
      ctx.skip(list.records.length === 0, 'data missing: list_flows returned no records');
      expect(list.records[0].type).toBe('flow');
      const result = await executeFlowToolCall(client, 'get_flow', { name_or_sysid: list.records[0].sys_id });
      expect(result.type).toBe('flow');
      await expect(executeFlowToolCall(client, 'get_subflow', { name_or_sysid: result.sys_id }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects a subflow passed to get_flow', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_hub_flow');
      const list = await executeFlowToolCall(client, 'list_subflows', { active: false, limit: 1 });
      ctx.skip(list.records.length === 0, 'data missing: list_subflows returned no records');
      await expect(executeFlowToolCall(client, 'get_flow', { name_or_sysid: list.records[0].sys_id }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('lists process automations when the definition table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_pd_process_definition');
      const result = await executeFlowToolCall(client, 'list_process_automations', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
      for (const record of result.records) {
        expect(record).toHaveProperty('label');
        expect(record).toHaveProperty('name');
        expect(record.active).toBe('true');
      }
    });

    it('gets a process automation definition by sys_id', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_pd_process_definition');
      const list = await executeFlowToolCall(client, 'list_process_automations', { active: false, limit: 1 });
      ctx.skip(list.records.length === 0, 'data missing: list_process_automations returned no records');
      const result = await executeFlowToolCall(client, 'get_process_automation', { name_or_sysid: list.records[0].sys_id });
      expect(result.sys_id).toBe(list.records[0].sys_id);
      expect(result.label).toBe(list.records[0].label);
    });

    it('gets a process automation definition by internal name', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_pd_process_definition');
      const list = await executeFlowToolCall(client, 'list_process_automations', { active: false, limit: 1 });
      ctx.skip(list.records.length === 0, 'data missing: list_process_automations returned no records');
      const result = await executeFlowToolCall(client, 'get_process_automation', { name_or_sysid: list.records[0].name });
      expect(result.name).toContain(list.records[0].name);
    });

    it('searches process automation definitions by display label', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_pd_process_definition');
      const list = await executeFlowToolCall(client, 'list_process_automations', { active: false, limit: 1 });
      ctx.skip(list.records.length === 0, 'data missing: list_process_automations returned no records');
      const label = list.records[0].label;
      ctx.skip(!label, 'data missing: process automation definition has no label');
      const result = await executeFlowToolCall(client, 'get_process_automation', { name_or_sysid: label });
      expect(result.label).toContain(label);
      const matches = await executeFlowToolCall(client, 'list_process_automations', { active: false, query: label, limit: 5 });
      expect(matches.records.length).toBeGreaterThan(0);
      expect(matches.records.some((record: { label: string }) => record.label.includes(label))).toBe(true);
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
