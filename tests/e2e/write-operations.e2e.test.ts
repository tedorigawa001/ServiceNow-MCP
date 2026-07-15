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
});
