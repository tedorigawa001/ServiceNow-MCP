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

    it('fetches get_request details when data exists', async (ctx) => {
      const requests = await executeCatalogToolCall(client, 'list_requests', { limit: 1 });
      ctx.skip(requests.count === 0, 'data missing: list_requests returned no records');
      const request = await executeCatalogToolCall(client, 'get_request', { number_or_sysid: requests.requests[0].sys_id });
      expect(request.request.sys_id).toBe(requests.requests[0].sys_id);
    });

    it('fetches get_request_item details when data exists', async (ctx) => {
      const items = await executeCatalogToolCall(client, 'list_request_items', { limit: 1 });
      ctx.skip(items.count === 0, 'data missing: list_request_items returned no records');
      const item = await executeCatalogToolCall(client, 'get_request_item', { number_or_sysid: items.request_items[0].sys_id });
      expect(item.request_item.sys_id).toBe(items.request_items[0].sys_id);
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

    it('reads SLA details for a task that has one when any exist', async (ctx) => {
      const slas = await executeCatalogToolCall(client, 'list_active_slas', { limit: 1 });
      ctx.skip(slas.count === 0, 'data missing: list_active_slas returned no records');
      const taskSysId = slas.slas[0].task?.value ?? slas.slas[0].task;
      ctx.skip(!taskSysId, 'data missing: first active SLA has no task reference');
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

    it('fetches get_portal details when data exists', async (ctx) => {
      const portals = await executePortalToolCall(client, 'list_portals', { limit: 1 });
      ctx.skip(portals.count === 0, 'data missing: list_portals returned no records');
      const portal = await executePortalToolCall(client, 'get_portal', { id: portals.records[0].sys_id });
      expect(portal.sys_id).toBe(portals.records[0].sys_id);
    });

    it('fetches get_portal_widget details when data exists', async (ctx) => {
      const widgets = await executePortalToolCall(client, 'list_portal_widgets', { limit: 1 });
      ctx.skip(widgets.count === 0, 'data missing: list_portal_widgets returned no records');
      const widget = await executePortalToolCall(client, 'get_portal_widget', { id_or_sysid: widgets.records[0].sys_id });
      expect(widget.sys_id).toBe(widgets.records[0].sys_id);
    });

    it('fetches get_portal_theme details when data exists', async (ctx) => {
      const themes = await executePortalToolCall(client, 'list_portal_themes', { limit: 1 });
      ctx.skip(themes.count === 0, 'data missing: list_portal_themes returned no records');
      const theme = await executePortalToolCall(client, 'get_portal_theme', { sys_id: themes.records[0].sys_id });
      expect(theme.sys_id).toBe(themes.records[0].sys_id);
    });
  });

  describe('sys_ux_app (UX apps)', () => {
    it('lists UX apps', async () => {
      const result = await executePortalToolCall(client, 'list_ux_apps', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single UX app when one exists', async (ctx) => {
      const list = await executePortalToolCall(client, 'list_ux_apps', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_ux_apps returned no records');
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

    it('fetches a single UI Builder page when one exists', async (ctx) => {
      const list = await executeWorkspaceToolCall(client, 'list_uib_pages', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_uib_pages returned no records');
      const page = await executeWorkspaceToolCall(client, 'get_uib_page', { sys_id: list.pages[0].sys_id });
      expect(page.sys_id).toBe(list.pages[0].sys_id);
    });

  });

  describe('Legacy Workspace metadata', () => {
    it('lists workspaces when the legacy table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_aw_master_config');
      const result = await executeWorkspaceToolCall(client, 'list_workspaces', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.workspaces)).toBe(true);
      for (const workspace of result.workspaces) {
        expect(workspace.active).toBe('true');
        expect(workspace).toHaveProperty('name');
        expect(workspace).toHaveProperty('workspace_url');
      }
    });

    it('includes inactive legacy workspaces on request', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_aw_master_config');
      const result = await executeWorkspaceToolCall(client, 'list_workspaces', { active: false, limit: 5 });
      expect(Array.isArray(result.workspaces)).toBe(true);
      expect(result.count).toBe(result.workspaces.length);
      for (const workspace of result.workspaces) {
        expect(workspace.sys_id).toMatch(/^[0-9a-f]{32}$/);
        expect(workspace).toHaveProperty('workspace_url');
      }
    });

    it('gets a legacy workspace and its correctly linked list configurations', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_aw_master_config', 'sys_aw_list');
      const list = await executeWorkspaceToolCall(client, 'list_workspaces', { active: false, limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_workspaces returned no records');
      const result = await executeWorkspaceToolCall(client, 'get_workspace', { sys_id: list.workspaces[0].sys_id });
      expect(result.sys_id).toBe(list.workspaces[0].sys_id);
      expect(result.name).toBe(list.workspaces[0].name);
      expect(Array.isArray(result.lists)).toBe(true);
      for (const record of result.lists) {
        expect(record.workspace?.value ?? record.workspace).toBe(result.sys_id);
        expect(record).toHaveProperty('condition');
        expect(record).toHaveProperty('columns');
      }
    });

    it('verifies the legacy list condition and workspace-reference schema', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_aw_master_config', 'sys_aw_list');
      const dictionary = await client.queryRecords({
        table: 'sys_dictionary', query: 'name=sys_aw_list^elementINworkspace,condition,columns,title,table,active',
        fields: 'element,reference', limit: 10,
      });
      expect(dictionary.records.map(record => record.element).sort())
        .toEqual(['active', 'columns', 'condition', 'table', 'title', 'workspace']);
      const reference = dictionary.records.find(record => record.element === 'workspace')?.reference;
      expect(reference?.value ?? reference).toBe('sys_aw_master_config');
    });

    it('does not treat an arbitrary UX application as a legacy workspace', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_aw_master_config', 'sys_ux_page_registry');
      const apps = await client.queryRecords({ table: 'sys_ux_page_registry', fields: 'sys_id', limit: 1 });
      ctx.skip(apps.count === 0, 'data missing: sys_ux_page_registry returned no records');
      await expect(executeWorkspaceToolCall(client, 'get_workspace', { sys_id: apps.records[0].sys_id }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
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

    it('fetches a single VA topic when one exists', async (ctx) => {
      const list = await executeVaToolCall(client, 'list_va_topics_full', { limit: 1 });
      ctx.skip(list.count === 0, 'data missing: list_va_topics_full returned no records');
      const topic = await executeVaToolCall(client, 'get_va_topic', { sys_id: list.topics[0].sys_id });
      expect(topic.sys_id).toBe(list.topics[0].sys_id);
    });

    it('lists VA categories when the category table exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sys_cb_topic_category');
      const result = await executeVaToolCall(client, 'list_va_categories', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.categories)).toBe(true);
      for (const category of result.categories) {
        expect(category.sys_id).toMatch(/^[0-9a-f]{32}$/);
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('visible');
      }
    });
  });
});
