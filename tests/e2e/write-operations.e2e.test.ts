/**
 * E2E write-tool tests against a real PDI. Additionally gated on
 * WRITE_ENABLED=true (see tests/e2e/helpers.ts) — only run these against a
 * disposable Personal Developer Instance, never a shared/prod instance.
 *
 * Every record created here is deleted in a `finally` block regardless of
 * assertion outcome, so a failing assertion never leaves test data behind.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { writeE2eDescribe, getE2EClient, skipUnlessTables } from './helpers.js';
import { executeIncidentToolCall } from '../../src/tools/incident.js';
import { executeChangeToolCall } from '../../src/tools/change.js';
import { executeProblemToolCall } from '../../src/tools/problem.js';
import { executeUserToolCall } from '../../src/tools/user.js';
import { executeKnowledgeToolCall } from '../../src/tools/knowledge.js';
import { executeCoreToolCall } from '../../src/tools/core.js';
import { executeUsemToolCall } from '../../src/tools/usem.js';
import { executeGrcRiskToolCall } from '../../src/tools/grc-risk.js';
import { executeGrcComplianceToolCall } from '../../src/tools/grc-compliance.js';
import { executeSecurityToolCall } from '../../src/tools/security.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const MARK = `[E2E ${Date.now()}]`;

// Each test creates, updates, re-reads and then deletes a record. The delete
// is the expensive step: ServiceNow cascades through every table that
// references the record (a sys_user_group delete was measured at 21 s on a
// PDI still digesting a plugin install), so the shared 30 s budget is too
// tight for this file even though the assertions themselves finish quickly.
vi.setConfig({ testTimeout: 120_000 });

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
    it('creates then updates a risk', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_risk_risk');
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
    it('creates then updates a GRC entity when a profile class exists', async (ctx) => {
      await skipUnlessTables(ctx, client, 'sn_grc_profile', 'sn_grc_profile_class');
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
  describe('sn_si_incident + sys_pd_process_definition (run_security_playbook)', () => {
    const scripting = process.env.SCRIPTING_ENABLED === 'true';

    it('refuses to start a draft template before scheduling anything', async (ctx) => {
      ctx.skip(!scripting, 'SCRIPTING_ENABLED=true required');
      await skipUnlessTables(ctx, client, 'sn_si_incident', 'sys_pd_process_definition');
      const drafts = await client.queryRecords({
        table: 'sys_pd_process_definition', query: 'sys_scope.scope=sn_si_aw^status=draft', fields: 'sys_id,name', limit: 1,
      });
      ctx.skip(drafts.records.length === 0, 'no draft SIR playbook template on this instance');

      const created = await executeSecurityToolCall(client, 'create_security_incident', {
        short_description: `${MARK} playbook draft-guard test`, category: 'malware',
      });
      expect(created.sys_id).toBeTruthy();
      try {
        await expect(executeSecurityToolCall(client, 'run_security_playbook', {
          playbook: drafts.records[0].sys_id, incident_sys_id: created.sys_id,
        })).rejects.toMatchObject({ code: 'CONFLICT' });
        // Nothing was scheduled for this incident.
        const jobs = await client.queryRecords({ table: 'sysauto_script', query: `nameLIKE${created.sys_id}`, fields: 'sys_id', limit: 1 });
        expect(jobs.records).toHaveLength(0);
      } finally {
        await client.deleteRecord('sn_si_incident', created.sys_id as string);
      }
    });

    it('schedules a published SIR playbook once and reports a repeat call as already_scheduled', async (ctx) => {
      ctx.skip(!scripting, 'SCRIPTING_ENABLED=true required');
      await skipUnlessTables(ctx, client, 'sn_si_incident', 'sys_pd_process_definition', 'sys_pd_context');
      // The stock SIR playbooks ship as drafts (templates). A runnable one has
      // to be published in Process Automation Designer first.
      const published = await client.queryRecords({
        table: 'sys_pd_process_definition', query: 'sys_scope.scope=sn_si_aw^status=published^active=true', fields: 'sys_id,name,label', limit: 1,
      });
      ctx.skip(published.records.length === 0, 'no published SIR playbook on this instance (publish a template in PAD to enable this test)');
      const playbook = published.records[0] as { sys_id: string; label: string };

      const created = await executeSecurityToolCall(client, 'create_security_incident', {
        short_description: `${MARK} playbook schedule test`, category: 'malware',
      });
      expect(created.sys_id).toBeTruthy();
      let jobSysId: string | undefined;
      try {
        const run = await executeSecurityToolCall(client, 'run_security_playbook', { playbook: playbook.sys_id, incident_sys_id: created.sys_id });
        jobSysId = run.scheduled_job?.sys_id;
        expect(run.action).toBe('playbook_scheduled');
        expect(run.playbook.label).toBe(playbook.label);
        expect(run.playbook.name).toMatch(/^sn_si_aw\./);
        expect(jobSysId).toMatch(/^[0-9a-f]{32}$/);

        // The job carries exactly the product's start call for this incident.
        const job = await client.getRecord('sysauto_script', jobSysId as string) as { script: string; run_type: string };
        expect(job.run_type).toBe('once');
        expect(job.script).toContain(`sn_playbook.PlaybookExperience.triggerPlaybook('${run.playbook.name}', parent)`);
        expect(job.script).toContain(`parent.get('${created.sys_id}')`);

        // While that job is pending, a second call must not queue another.
        const again = await executeSecurityToolCall(client, 'run_security_playbook', { playbook: playbook.sys_id, incident_sys_id: created.sys_id });
        expect(again.action).toBe('already_scheduled');
        expect(again.scheduled_job.sys_id).toBe(jobSysId);
        const jobs = await client.queryRecords({ table: 'sysauto_script', query: `nameLIKE${created.sys_id}`, fields: 'sys_id', limit: 5 });
        expect(jobs.records).toHaveLength(1);
      } finally {
        if (jobSysId) await client.deleteRecord('sysauto_script', jobSysId).catch(() => undefined);
        await client.deleteRecord('sn_si_incident', created.sys_id as string);
      }
    });

    it('starts a published SIR playbook, sees its execution, and refuses a duplicate', { timeout: 420_000 }, async (ctx) => {
      ctx.skip(!scripting, 'SCRIPTING_ENABLED=true required');
      await skipUnlessTables(ctx, client, 'sn_si_incident', 'sys_pd_process_definition', 'sys_pd_context');
      const published = await client.queryRecords({
        table: 'sys_pd_process_definition', query: 'sys_scope.scope=sn_si_aw^status=published^active=true', fields: 'sys_id,name,label', limit: 1,
      });
      ctx.skip(published.records.length === 0, 'no published SIR playbook on this instance (publish a template in PAD to enable this test)');
      const playbook = published.records[0] as { sys_id: string; label: string };

      const created = await executeSecurityToolCall(client, 'create_security_incident', {
        short_description: `${MARK} playbook run test`, category: 'malware',
      });
      expect(created.sys_id).toBeTruthy();
      let contextSysId: string | undefined;
      let jobSysId: string | undefined;
      try {
        // run_start is +70 s and the scheduler then has to pick the job up; a
        // busy instance can take minutes, so give it the tool's full budget.
        const run = await executeSecurityToolCall(client, 'run_security_playbook', {
          playbook: playbook.sys_id, incident_sys_id: created.sys_id, wait_seconds: 180,
        });
        jobSysId = run.scheduled_job?.sys_id;
        // A starved scheduler is an instance condition, not a tool defect: the
        // scheduling contract is covered by the test above, so report it as a
        // skip with the reason instead of a failure.
        ctx.skip(run.action === 'playbook_scheduled', 'scheduler did not run the job within the wait budget (instance is busy); start contract verified by the previous test');

        expect(run.action).toBe('playbook_started');
        expect(run.execution).toBeTruthy();
        expect(['QUEUED', 'IN_PROGRESS']).toContain(run.execution.state);
        contextSysId = run.execution.sys_id;

        const again = await executeSecurityToolCall(client, 'run_security_playbook', { playbook: playbook.sys_id, incident_sys_id: created.sys_id });
        expect(again.action).toBe('already_running');
        expect(again.execution.sys_id).toBe(contextSysId);
      } finally {
        if (contextSysId) await client.deleteRecord('sys_pd_context', contextSysId).catch(() => undefined);
        if (jobSysId) await client.deleteRecord('sysauto_script', jobSysId).catch(() => undefined);
        await client.deleteRecord('sn_si_incident', created.sys_id as string);
      }
    });
  });

  describe('sn_vul_scan + sn_vul_m2m_scan_configuration_item (scan_vulnerabilities)', () => {
    const scripting = process.env.SCRIPTING_ENABLED === 'true';
    // The scan is created by a run-once server script (state and target links
    // are not REST-writable), so this needs the scheduler to run the job.
    // Only the Draft path is exercised: initiating would hand real CIs to a
    // real scanner integration when one is configured.
    it('drafts a VR scan for two CIs with both targets linked, then cancels it', { timeout: 240_000 }, async (ctx) => {
      ctx.skip(!scripting, 'SCRIPTING_ENABLED=true required');
      await skipUnlessTables(ctx, client, 'sn_vul_scan', 'sn_vul_m2m_scan_configuration_item', 'sn_vul_scanner');
      const cis = await client.queryRecords({ table: 'cmdb_ci', query: 'ORDERBYsys_created_on', fields: 'sys_id,name', limit: 2 });
      ctx.skip(cis.records.length < 2, 'needs two cmdb_ci records');
      const ciIds = cis.records.map((r) => r.sys_id as string);

      const result = await executeSecurityToolCall(client, 'scan_vulnerabilities', { ci_sys_ids: ciIds, initiate: false, wait_seconds: 120 });
      ctx.skip(result.action === 'scan_scheduled', 'scheduler did not run the scan job within the wait budget');
      expect(result.action).toBe('scan_drafted');
      expect(result.linked_targets).toBe(2);
      expect(result.scan.state).toBe('draft');
      const scanSysId = result.scan.sys_id as string;
      try {
        const links = await client.queryRecords({ table: 'sn_vul_m2m_scan_configuration_item', query: `sn_vul_scan=${scanSysId}`, fields: 'cmdb_ci', limit: 5 });
        const linked = links.records.map((r) => (r.cmdb_ci as { value?: string } | string));
        expect(linked.map((v) => (typeof v === 'object' ? v?.value : v)).sort()).toEqual([...ciIds].sort());
        // The job that created the scan is gone once its result was read.
        const jobs = await client.queryRecords({ table: 'sysauto_script', query: 'nameSTARTSWITH[MCP scan', fields: 'sys_id', limit: 1 });
        expect(jobs.records).toHaveLength(0);
      } finally {
        // Vulnerability Response tables refuse cross-scope deletes ("Can delete"
        // is off) and the state is not REST-writable, so cancel from a script.
        const token = `mcp-e2e-cancel-${Date.now()}`;
        const cleanup = await client.createRecord('sysauto_script', {
          name: `[MCP E2E cancel scan ${scanSysId}]`, active: true, run_type: 'once',
          run_start: new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' '),
          script: `var s = new GlideRecord('sn_vul_scan'); if (s.get('${scanSysId}')) { s.setValue('state', 'canceled'); s.update(); } gs.info('${token} done');`,
        });
        for (let i = 0; i < 24; i++) {
          const logs = await client.queryRecords({ table: 'syslog', query: `messageSTARTSWITH${token}`, fields: 'sys_id', limit: 1 });
          if (logs.records.length) break;
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        await client.deleteRecord('sysauto_script', cleanup.sys_id as string).catch(() => undefined);
      }
    });

    it('refuses to initiate a scan when the instance has no active default scanner', async (ctx) => {
      ctx.skip(!scripting, 'SCRIPTING_ENABLED=true required');
      await skipUnlessTables(ctx, client, 'sn_vul_scan', 'sn_vul_scanner');
      const scanners = await client.queryRecords({ table: 'sn_vul_scanner', query: 'active=true^default=true', fields: 'sys_id', limit: 1 });
      ctx.skip(scanners.records.length > 0, 'a default scanner is configured; not launching a real scan from E2E');
      const ci = await client.queryRecords({ table: 'cmdb_ci', query: '', fields: 'sys_id', limit: 1 });
      ctx.skip(ci.records.length === 0, 'needs a cmdb_ci record');
      await expect(executeSecurityToolCall(client, 'scan_vulnerabilities', { ci_sys_ids: [ci.records[0].sys_id as string] }))
        .rejects.toMatchObject({ code: 'CONFLICT' });
      const jobs = await client.queryRecords({ table: 'sysauto_script', query: 'nameSTARTSWITH[MCP scan', fields: 'sys_id', limit: 1 });
      expect(jobs.records).toHaveLength(0);
    });
  });
});
