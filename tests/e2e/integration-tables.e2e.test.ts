/**
 * E2E smoke tests for integration plumbing that exists on every instance:
 * REST/SOAP messages, transform maps, import sets, data sources, event
 * registry/log, OAuth apps, credential aliases, plus the integration-health
 * summary. Read-only. See tests/e2e/helpers.ts and CONTRIBUTING.md.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeIntegrationToolCall } from '../../src/tools/integration.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – integration tables (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('sys_rest_message / sys_soap_message', () => {
    it('lists REST messages', async () => {
      const result = await executeIntegrationToolCall(client, 'list_rest_messages', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single REST message when one exists', async () => {
      const list = await executeIntegrationToolCall(client, 'list_rest_messages', { limit: 1 });
      if (list.count === 0) return;
      const message = await executeIntegrationToolCall(client, 'get_rest_message', { sys_id_or_name: list.records[0].sys_id });
      expect(message.sys_id).toBe(list.records[0].sys_id);
    });

    it('lists SOAP messages', async () => {
      const result = await executeIntegrationToolCall(client, 'list_soap_messages', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single SOAP message when one exists', async () => {
      const list = await executeIntegrationToolCall(client, 'list_soap_messages', { limit: 1 });
      if (list.count === 0) return;
      const message = await executeIntegrationToolCall(client, 'get_soap_message', { sys_id_or_name: list.records[0].sys_id });
      expect(message.soap_message.sys_id).toBe(list.records[0].sys_id);
      expect(Array.isArray(message.functions)).toBe(true);
    });
  });

  describe('sys_transform_map / sys_import_set / sys_data_source', () => {
    it('lists transform maps', async () => {
      const result = await executeIntegrationToolCall(client, 'list_transform_maps', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single transform map when one exists', async () => {
      const list = await executeIntegrationToolCall(client, 'list_transform_maps', { limit: 1 });
      if (list.count === 0) return;
      const map = await executeIntegrationToolCall(client, 'get_transform_map', { sys_id_or_name: list.records[0].sys_id });
      expect(map.sys_id).toBe(list.records[0].sys_id);
    });

    it('lists import sets', async () => {
      const result = await executeIntegrationToolCall(client, 'list_import_sets', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single import set when one exists', async () => {
      const list = await executeIntegrationToolCall(client, 'list_import_sets', { limit: 1 });
      if (list.count === 0) return;
      const importSet = await executeIntegrationToolCall(client, 'get_import_set', { sys_id: list.records[0].sys_id });
      expect(importSet.sys_id).toBe(list.records[0].sys_id);
    });

    it('lists data sources', async () => {
      const result = await executeIntegrationToolCall(client, 'list_data_sources', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sysevent_register / sysevent', () => {
    it('lists the event registry and event log', async () => {
      const registry = await executeIntegrationToolCall(client, 'list_event_registry', { limit: 5 });
      expect(registry.count).toBeGreaterThanOrEqual(0);
      const log = await executeIntegrationToolCall(client, 'list_event_log', { limit: 5 });
      expect(log.count).toBeGreaterThanOrEqual(0);
    });

    it('fetches a single event registry entry when one exists', async () => {
      const list = await executeIntegrationToolCall(client, 'list_event_registry', { limit: 1 });
      if (list.count === 0) return;
      const entry = await executeIntegrationToolCall(client, 'get_event_registry_entry', { name_or_sysid: list.records[0].sys_id });
      expect(entry.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('oauth_entity / sys_alias', () => {
    it('lists OAuth applications and credential aliases', async () => {
      const apps = await executeIntegrationToolCall(client, 'list_oauth_applications', { limit: 5 });
      expect(apps.count).toBeGreaterThanOrEqual(0);
      const aliases = await executeIntegrationToolCall(client, 'list_credential_aliases', { limit: 5 });
      expect(aliases.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('sn_vul_integration_run (integration health)', () => {
    it('summarises integration run health', async () => {
      const result = await executeCoreToolCall(client, 'get_integration_health', { days: 7 });
      expect(result).toBeTruthy();
      expect(result.summary).toBeTruthy();
    });
  });
});
