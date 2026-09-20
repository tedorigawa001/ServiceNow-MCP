/**
 * E2E smoke tests for service catalog / request / approval / SLA tables and
 * the front-end configuration surfaces: Service Portal, UI Builder, UX apps,
 * Virtual Agent topics, and the "my tasks" view. Read-only.
 * See tests/e2e/helpers.ts and CONTRIBUTING.md for setup.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { executeCatalogToolCall } from '../../src/tools/catalog.js';
import { executePortalToolCall } from '../../src/tools/portal.js';
import { executeWorkspaceToolCall } from '../../src/tools/workspace.js';
import { executeVaToolCall } from '../../src/tools/va.js';
import { executeTaskToolCall } from '../../src/tools/task.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – catalog, portal and UI surfaces (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('sc_request / sc_req_item', () => {
    it('lists requests and request items', async () => {
      const requests = await executeCatalogToolCall(client, 'list_requests', { limit: 5 });
      expect(requests.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(requests.requests)).toBe(true);
      const items = await executeCatalogToolCall(client, 'list_request_items', { limit: 5 });
      expect(items.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(items.request_items)).toBe(true);
    });

    it('fetches a single request and request item when they exist', async () => {
      const requests = await executeCatalogToolCall(client, 'list_requests', { limit: 1 });
      if (requests.count > 0) {
        const request = await executeCatalogToolCall(client, 'get_request', { number_or_sysid: requests.requests[0].sys_id });
        expect(request.request.sys_id).toBe(requests.requests[0].sys_id);
      }
      const items = await executeCatalogToolCall(client, 'list_request_items', { limit: 1 });
      if (items.count > 0) {
        const item = await executeCatalogToolCall(client, 'get_request_item', { number_or_sysid: items.request_items[0].sys_id });
        expect(item.request_item.sys_id).toBe(items.request_items[0].sys_id);
      }
    });
  });

  describe('sysapproval_approver / task_sla', () => {
    it('lists approvals and my approvals', async () => {
      const approvals = await executeCatalogToolCall(client, 'list_approvals', { limit: 5 });
      expect(approvals.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(approvals.approvals)).toBe(true);
      const mine = await executeCatalogToolCall(client, 'get_my_approvals', {});
      expect(mine.count).toBeGreaterThanOrEqual(0);
    });

    it('lists active SLAs', async () => {
      const result = await executeCatalogToolCall(client, 'list_active_slas', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.slas)).toBe(true);
    });

    it('reads SLA details for a task that has one when any exist', async () => {
      const slas = await executeCatalogToolCall(client, 'list_active_slas', { limit: 1 });
      if (slas.count === 0) return;
      const taskSysId = slas.slas[0].task?.value ?? slas.slas[0].task;
      if (!taskSysId) return;
      const details = await executeCatalogToolCall(client, 'get_sla_details', { task_sys_id: taskSysId });
      expect(details).toBeTruthy();
    });
  });

  describe('task (my tasks)', () => {
    it('lists my tasks', async () => {
      const result = await executeTaskToolCall(client, 'list_my_tasks', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.tasks)).toBe(true);
    });
  });

  describe('sp_portal / sp_widget / sp_theme', () => {
    it('lists portals, widgets and themes', async () => {
      const portals = await executePortalToolCall(client, 'list_portals', { limit: 5 });
      expect(portals.count).toBeGreaterThanOrEqual(0);
      const widgets = await executePortalToolCall(client, 'list_portal_widgets', { limit: 5 });
      expect(widgets.count).toBeGreaterThanOrEqual(0);
      const themes = await executePortalToolCall(client, 'list_portal_themes', { limit: 5 });
      expect(themes.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single portal, widget and theme when they exist', async () => {
      const portals = await executePortalToolCall(client, 'list_portals', { limit: 1 });
      if (portals.count > 0) {
        const portal = await executePortalToolCall(client, 'get_portal', { id: portals.records[0].sys_id });
        expect(portal.sys_id).toBe(portals.records[0].sys_id);
      }
      const widgets = await executePortalToolCall(client, 'list_portal_widgets', { limit: 1 });
      if (widgets.count > 0) {
        const widget = await executePortalToolCall(client, 'get_portal_widget', { id_or_sysid: widgets.records[0].sys_id });
        expect(widget.sys_id).toBe(widgets.records[0].sys_id);
      }
      const themes = await executePortalToolCall(client, 'list_portal_themes', { limit: 1 });
      if (themes.count > 0) {
        const theme = await executePortalToolCall(client, 'get_portal_theme', { sys_id: themes.records[0].sys_id });
        expect(theme.sys_id).toBe(themes.records[0].sys_id);
      }
    });
  });

  describe('sys_ux_app (UX apps)', () => {
    it('lists UX apps', async () => {
      const result = await executePortalToolCall(client, 'list_ux_apps', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single UX app when one exists', async () => {
      const list = await executePortalToolCall(client, 'list_ux_apps', { limit: 1 });
      if (list.count === 0) return;
      const app = await executePortalToolCall(client, 'get_ux_app', { sys_id_or_name: list.records[0].sys_id });
      expect(app.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sys_ux_page / sys_ux_macroponent / sys_ux_data_broker (UI Builder)', () => {
    it('lists UI Builder pages, components and data brokers', async () => {
      const pages = await executeWorkspaceToolCall(client, 'list_uib_pages', { limit: 5 });
      expect(pages.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(pages.pages)).toBe(true);
      const components = await executeWorkspaceToolCall(client, 'list_uib_components', { limit: 5 });
      expect(components.count).toBeGreaterThanOrEqual(0);
      const brokers = await executeWorkspaceToolCall(client, 'list_uib_data_brokers', { limit: 5 });
      expect(brokers.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single UI Builder page when one exists', async () => {
      const list = await executeWorkspaceToolCall(client, 'list_uib_pages', { limit: 1 });
      if (list.count === 0) return;
      const page = await executeWorkspaceToolCall(client, 'get_uib_page', { sys_id: list.pages[0].sys_id });
      expect(page.sys_id).toBe(list.pages[0].sys_id);
    });

    it('lists workspaces when the workspace table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_aw_workspace');
      const result = await executeWorkspaceToolCall(client, 'list_workspaces', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sys_cs_topic (Virtual Agent)', () => {
    it('lists VA topics and conversations', async () => {
      const topics = await executeVaToolCall(client, 'list_va_topics_full', { limit: 5 });
      expect(topics.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(topics.topics)).toBe(true);
      const conversations = await executeVaToolCall(client, 'list_va_conversations', { limit: 5 });
      expect(conversations.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single VA topic when one exists', async () => {
      const list = await executeVaToolCall(client, 'list_va_topics_full', { limit: 1 });
      if (list.count === 0) return;
      const topic = await executeVaToolCall(client, 'get_va_topic', { sys_id: list.topics[0].sys_id });
      expect(topic.sys_id).toBe(list.topics[0].sys_id);
    });

    it('lists VA categories when the category table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_cs_category');
      const result = await executeVaToolCall(client, 'list_va_categories', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });
});
