/**
 * E2E write-tool tests against a real PDI. Additionally gated on
 * WRITE_ENABLED=true (see tests/e2e/helpers.ts) — only run these against a
 * disposable Personal Developer Instance, never a shared/prod instance.
 *
 * Every record created here is deleted in a `finally` block regardless of
 * assertion outcome, so a failing assertion never leaves test data behind.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { writeE2eDescribe, getE2EClient } from './helpers.js';
import { executeIncidentToolCall } from '../../src/tools/incident.js';
import { executeChangeToolCall } from '../../src/tools/change.js';
import { executeProblemToolCall } from '../../src/tools/problem.js';
import { executeUserToolCall } from '../../src/tools/user.js';
import { executeKnowledgeToolCall } from '../../src/tools/knowledge.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import { executeUsemToolCall } from '../../src/tools/usem.js';
import { executeGrcRiskToolCall } from '../../src/tools/grc-risk.js';
import { executeGrcComplianceToolCall } from '../../src/tools/grc-compliance.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const MARK = `[E2E ${Date.now()}]`;

writeE2eDescribe('E2E – write operations (create/update, self-cleaning)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  describe('incident', () => {
    it('creates then updates an incident', async () => {
      const created = await executeIncidentToolCall(client, 'create_incident', {
        short_description: `${MARK} incident create/update test`,
      });
      expect(created.sys_id).toBeTruthy();

      try {
        // Not `priority` — ServiceNow recalculates it from urgency/impact via a
        // business rule, so a direct write is silently overridden on a real
        // instance (this is what caught that: the mocked unit tests can't).
        const updated = await executeIncidentToolCall(client, 'update_incident', {
          sys_id: created.sys_id,
          fields: { description: `${MARK} updated description` },
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeIncidentToolCall(client, 'get_incident', { number_or_sysid: created.sys_id });
        expect(fetched.description).toBe(`${MARK} updated description`);
      } finally {
        await client.deleteRecord('incident', created.sys_id as string);
      }
    });
  });

  describe('problem', () => {
    it('creates then updates a problem', async () => {
      const created = await executeProblemToolCall(client, 'create_problem', {
        short_description: `${MARK} problem create/update test`,
      });
      expect(created.sys_id).toBeTruthy();

      try {
        // Not `priority` — same auto-calculated-from-urgency/impact business
        // rule as incident, confirmed against the real instance.
        const updated = await executeProblemToolCall(client, 'update_problem', {
          sys_id: created.sys_id,
          fields: { description: `${MARK} updated description` },
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeProblemToolCall(client, 'get_problem', { number_or_sysid: created.sys_id });
        expect(fetched.description).toBe(`${MARK} updated description`);
      } finally {
        await client.deleteRecord('problem', created.sys_id as string);
      }
    });
  });

  describe('change_request', () => {
    it('creates then updates a change request', async () => {
      const created = await executeChangeToolCall(client, 'create_change_request', {
        short_description: `${MARK} change create/update test`,
        type: 'standard',
      });
      expect(created.sys_id).toBeTruthy();

      try {
        const updated = await executeChangeToolCall(client, 'update_change_request', {
          sys_id: created.sys_id,
          fields: { priority: '3' },
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeChangeToolCall(client, 'get_change_request', { number_or_sysid: created.sys_id });
        expect(fetched.priority).toBe('3');
      } finally {
        await client.deleteRecord('change_request', created.sys_id as string);
      }
    });
  });

  describe('sys_user_group', () => {
    it('creates then updates a group', async () => {
      const created = await executeUserToolCall(client, 'create_group', {
        name: `${MARK} group create/update test`,
      });
      expect(created.sys_id).toBeTruthy();

      try {
        const updated = await executeUserToolCall(client, 'update_group', {
          sys_id: created.sys_id,
          fields: { description: 'updated by E2E test' },
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeCoreToolCall(client, 'get_group', { group_identifier: created.sys_id });
        expect(fetched.description).toBe('updated by E2E test');
      } finally {
        await client.deleteRecord('sys_user_group', created.sys_id as string);
      }
    });
  });

  describe('kb_knowledge', () => {
    it('creates then updates a knowledge article', async () => {
      const kbs = await executeKnowledgeToolCall(client, 'list_knowledge_bases', { limit: 1 });
      if (kbs.count === 0) return; // PDI has no knowledge base to attach an article to

      const created = await executeKnowledgeToolCall(client, 'create_knowledge_article', {
        short_description: `${MARK} article create/update test`,
        text: 'E2E test content',
        knowledge_base_sys_id: kbs.knowledge_bases[0].sys_id,
      });
      expect(created.sys_id).toBeTruthy();

      try {
        const updated = await executeKnowledgeToolCall(client, 'update_knowledge_article', {
          sys_id: created.sys_id,
          fields: { short_description: `${MARK} article updated` },
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeKnowledgeToolCall(client, 'get_knowledge_article', { number_or_sysid: created.sys_id });
        expect(fetched.short_description).toBe(`${MARK} article updated`);
      } finally {
        await client.deleteRecord('kb_knowledge', created.sys_id as string);
      }
    });
  });

  describe('sn_vul_vulnerability (Vulnerability Group)', () => {
    it('creates then updates a vulnerability group', async () => {
      const created = await executeUsemToolCall(client, 'create_vulnerability_group', {
        short_description: `${MARK} vulnerability group create/update test`,
      });
      expect(created.sys_id).toBeTruthy();

      try {
        const updated = await executeUsemToolCall(client, 'update_vulnerability_group', {
          sys_id: created.sys_id,
          short_description: `${MARK} vulnerability group updated`,
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeUsemToolCall(client, 'get_vulnerability_group', { number_or_sysid: created.sys_id });
        expect(fetched.short_description).toBe(`${MARK} vulnerability group updated`);
      } finally {
        await client.deleteRecord('sn_vul_vulnerability', created.sys_id as string);
      }
    });
  });

  // create_remediation_task (sn_vul_remediation_task) is intentionally not
  // covered here: on a real instance the table's ACL rejected a bare insert
  // with only short_description (VR remediation tasks are normally produced
  // by the rule engine from a Vulnerability Group, not created directly via
  // the API). Read coverage for this table lives in vr-tables.e2e.test.ts.

  describe('sn_risk_risk', () => {
    it('creates then updates a risk', async () => {
      const created = await executeGrcRiskToolCall(client, 'create_risk', {
        statement: `${MARK} risk create/update test`,
      });
      expect(created.sys_id).toBeTruthy();

      try {
        const updated = await executeGrcRiskToolCall(client, 'update_risk', {
          sys_id: created.sys_id,
          fields: { apply_reason: `${MARK} updated apply_reason` },
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeGrcRiskToolCall(client, 'get_risk', { number_or_sysid: created.sys_id });
        expect(fetched.apply_reason).toBe(`${MARK} updated apply_reason`);
      } finally {
        await client.deleteRecord('sn_risk_risk', created.sys_id as string);
      }
    });
  });

  describe('sn_grc_profile (GRC Entity)', () => {
    it('creates then updates a GRC entity when a profile class exists', async () => {
      const classes = await executeCoreToolCall(client, 'query_records', { table: 'sn_grc_profile_class', limit: 1 });
      if (classes.count === 0) return; // PDI has no seeded Entity class to attach an entity to

      const created = await executeGrcComplianceToolCall(client, 'create_grc_entity', {
        name: `${MARK} entity create/update test`,
        profile_class: classes.records[0].sys_id,
      });
      expect(created.sys_id).toBeTruthy();

      try {
        const updated = await executeGrcComplianceToolCall(client, 'update_grc_entity', {
          sys_id: created.sys_id,
          fields: { description: `${MARK} updated description` },
        });
        expect(updated.summary).toContain(created.sys_id);

        const fetched = await executeGrcComplianceToolCall(client, 'get_grc_entity', { sys_id: created.sys_id });
        expect(fetched.description).toBe(`${MARK} updated description`);
      } finally {
        await client.deleteRecord('sn_grc_profile', created.sys_id as string);
      }
    });
  });
});
