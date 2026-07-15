/**
 * E2E smoke tests for GRC tables: sn_audit_engagement, sn_risk_risk,
 * sn_grc_profile (entities), sn_grc_indicator. See tests/e2e/helpers.ts and
 * CONTRIBUTING.md for setup.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeGrcAuditToolCall } from '../../src/tools/grc-audit.js';
import { executeGrcRiskToolCall } from '../../src/tools/grc-risk.js';
import { executeGrcComplianceToolCall } from '../../src/tools/grc-compliance.js';
import { executeGrcIndicatorToolCall } from '../../src/tools/grc-indicator.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – GRC tables (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('sn_audit_engagement', () => {
    it('lists audit engagements', async () => {
      const result = await executeGrcAuditToolCall(client, 'list_audit_engagements', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single engagement when one exists', async () => {
      const list = await executeGrcAuditToolCall(client, 'list_audit_engagements', { limit: 1 });
      if (list.count === 0) return;
      const engagement = await executeGrcAuditToolCall(client, 'get_audit_engagement', { number_or_sysid: list.records[0].sys_id });
      expect(engagement.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_risk_risk', () => {
    it('lists risks', async () => {
      const result = await executeGrcRiskToolCall(client, 'list_risks', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single risk when one exists', async () => {
      const list = await executeGrcRiskToolCall(client, 'list_risks', { limit: 1 });
      if (list.count === 0) return;
      const risk = await executeGrcRiskToolCall(client, 'get_risk', { number_or_sysid: list.records[0].sys_id });
      expect(risk.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_grc_profile (entities)', () => {
    it('lists GRC entities', async () => {
      const result = await executeGrcComplianceToolCall(client, 'list_grc_entities', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single entity when one exists', async () => {
      const list = await executeGrcComplianceToolCall(client, 'list_grc_entities', { limit: 1 });
      if (list.count === 0) return;
      const entity = await executeGrcComplianceToolCall(client, 'get_grc_entity', { sys_id: list.records[0].sys_id });
      expect(entity.sys_id).toBe(list.records[0].sys_id);
    });
  });

  describe('sn_grc_indicator', () => {
    it('lists GRC indicators', async () => {
      const result = await executeGrcIndicatorToolCall(client, 'list_grc_indicators', { limit: 5 });
      expect(result.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.records)).toBe(true);
    });

    it('fetches a single indicator when one exists', async () => {
      const list = await executeGrcIndicatorToolCall(client, 'list_grc_indicators', { limit: 1 });
      if (list.count === 0) return;
      const indicator = await executeGrcIndicatorToolCall(client, 'get_grc_indicator', { number_or_sysid: list.records[0].sys_id });
      expect(indicator.sys_id).toBe(list.records[0].sys_id);
    });
  });
});
