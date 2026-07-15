/**
 * E2E smoke tests for tables shared across modules rather than owned by one
 * ITSM process: groups/users (sys_user_group), the generic task table
 * (task), the knowledge base (kb_knowledge), and the service catalog
 * (sc_cat_item). See tests/e2e/helpers.ts and CONTRIBUTING.md for setup.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import { executeUserToolCall } from '../../src/tools/user.js';
import { executeTaskToolCall } from '../../src/tools/task.js';
import { executeKnowledgeToolCall } from '../../src/tools/knowledge.js';
import { executeCatalogToolCall } from '../../src/tools/catalog.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – common/shared tables (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('sys_user_group', () => {
    it('lists groups', async () => {
      const result = await executeUserToolCall(client, 'list_groups', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.groups)).toBe(true);
    });

    it('fetches a single group by name when one exists', async () => {
      const list = await executeUserToolCall(client, 'list_groups', { limit: 1 });
      if (list.count === 0) return;
      const group = await executeCoreToolCall(client, 'get_group', { group_identifier: list.groups[0].name });
      expect(group.sys_id).toBe(list.groups[0].sys_id);
    });
  });

  describe('sys_user (list)', () => {
    it('lists users', async () => {
      const result = await executeUserToolCall(client, 'list_users', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.users)).toBe(true);
    });
  });

  describe('task (generic)', () => {
    it('lists task records via query_records', async () => {
      const result = await executeCoreToolCall(client, 'query_records', { table: 'task', limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single task by number when one exists', async () => {
      const list = await executeCoreToolCall(client, 'query_records', { table: 'task', limit: 1, fields: 'number,sys_id' });
      if (list.count === 0) return;
      const task = await executeTaskToolCall(client, 'get_task', { number_or_sysid: list.records[0].number });
      expect(task.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('kb_knowledge', () => {
    it('lists knowledge bases', async () => {
      const result = await executeKnowledgeToolCall(client, 'list_knowledge_bases', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.knowledge_bases)).toBe(true);
    });

    it('fetches a single article by number when one exists', async () => {
      const list = await executeCoreToolCall(client, 'query_records', { table: 'kb_knowledge', limit: 1, fields: 'number,sys_id' });
      if (list.count === 0) return;
      const article = await executeKnowledgeToolCall(client, 'get_knowledge_article', { number_or_sysid: list.records[0].number });
      expect(article.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sc_cat_item', () => {
    it('lists catalog items', async () => {
      const result = await executeCatalogToolCall(client, 'list_catalog_items', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.catalog_items)).toBe(true);
    });

    it('fetches a single catalog item when one exists', async () => {
      const list = await executeCatalogToolCall(client, 'list_catalog_items', { limit: 1 });
      if (list.count === 0) return;
      const item = await executeCatalogToolCall(client, 'get_catalog_item', { sys_id_or_name: list.catalog_items[0].sys_id });
      expect(item.sys_id).toBe(list.catalog_items[0].sys_id);
    });
  });
});
