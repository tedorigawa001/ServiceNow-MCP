/**
 * Every tool that resolves a record by its human-readable number must refuse a
 * number that more than one record shares, instead of acting on whichever row
 * the instance returns first. Record numbers are not unique in practice: a
 * reset counter or loaded demo data issues numbers that already exist (seen on
 * a PDI, where three Vulnerable Items were numbered VIT0010001).
 *
 * The USEM / VR / security tools are covered in their own test files; this
 * file covers the remaining modules switched to findOneByNumber.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ServiceNowClient } from '../../src/servicenow/client.js';
import { executeIncidentToolCall } from '../../src/tools/incident.js';
import { executeProblemToolCall } from '../../src/tools/problem.js';
import { executeChangeToolCall } from '../../src/tools/change.js';
import { executeTaskToolCall } from '../../src/tools/task.js';
import { executeKnowledgeToolCall } from '../../src/tools/knowledge.js';
import { executeCatalogToolCall } from '../../src/tools/catalog.js';
import { executeHrsdToolCall } from '../../src/tools/hrsd.js';
import { executeCsmToolCall } from '../../src/tools/csm.js';
import { executeDiscoveryToolCall } from '../../src/tools/discovery.js';
import { executeEventManagementToolCall } from '../../src/tools/event-management.js';
import { executeGrcAuditToolCall } from '../../src/tools/grc-audit.js';
import { executeGrcComplianceToolCall } from '../../src/tools/grc-compliance.js';
import { executeGrcRiskToolCall } from '../../src/tools/grc-risk.js';
import { executeGrcIndicatorToolCall } from '../../src/tools/grc-indicator.js';

type Exec = (client: ServiceNowClient, name: string, args: Record<string, any>) => Promise<any>;

const queryRecords = vi.fn();
const updateRecord = vi.fn();
const getRecord = vi.fn();
const client = { queryRecords, updateRecord, getRecord } as unknown as ServiceNowClient;

const OLD = 'b'.repeat(32);
const NEW = 'a'.repeat(32);

/** Two records share the number; the second query lists them for the error. */
function duplicateNumber() {
  queryRecords
    .mockResolvedValueOnce({ count: 2, records: [{ sys_id: OLD }, { sys_id: NEW }] })
    .mockResolvedValueOnce({ count: 2, records: [
      { sys_id: NEW, sys_created_on: '2026-10-14 11:44:42', short_description: 'new' },
      { sys_id: OLD, sys_created_on: '2022-06-19 06:05:47', short_description: 'demo' },
    ] });
}

// [module, executor, tool, args, table, number column, label]
const CASES: Array<[string, Exec, string, Record<string, any>, string, string]> = [
  ['incident', executeIncidentToolCall, 'get_incident', { number_or_sysid: 'INC0010001' }, 'incident', 'Incident'],
  ['problem', executeProblemToolCall, 'get_problem', { number_or_sysid: 'PRB0010001' }, 'problem', 'Problem'],
  ['change', executeChangeToolCall, 'get_change_request', { number_or_sysid: 'CHG0010001' }, 'change_request', 'Change request'],
  ['task', executeTaskToolCall, 'get_task', { number_or_sysid: 'TASK0010001' }, 'task', 'Task'],
  ['knowledge', executeKnowledgeToolCall, 'get_knowledge_article', { number_or_sysid: 'KB0010001' }, 'kb_knowledge', 'Knowledge article'],
  ['catalog', executeCatalogToolCall, 'get_request', { number_or_sysid: 'REQ0010001' }, 'sc_request', 'Request'],
  ['catalog', executeCatalogToolCall, 'get_request_item', { number_or_sysid: 'RITM0010001' }, 'sc_req_item', 'Request item'],
  ['hrsd', executeHrsdToolCall, 'get_hr_case', { number_or_sysid: 'HRC0010001' }, 'sn_hr_core_case', 'HR case'],
  ['csm', executeCsmToolCall, 'get_csm_case', { number_or_sysid: 'CS0010001' }, 'sn_customerservice_case', 'CSM case'],
  ['discovery', executeDiscoveryToolCall, 'get_discovery_run', { run_id: 'DIS0010001' }, 'discovery_status', 'Discovery run'],
  ['event-management', executeEventManagementToolCall, 'get_alert', { number_or_sysid: 'Alert0010001' }, 'em_alert', 'Alert'],
  ['grc-audit', executeGrcAuditToolCall, 'get_audit_engagement', { number_or_sysid: 'AENG0010001' }, 'sn_audit_engagement', 'Audit Engagement'],
  ['grc-audit', executeGrcAuditToolCall, 'get_audit_control_test', { number_or_sysid: 'CTRLTST0010001' }, 'sn_audit_control_test', 'Control Test'],
  ['grc-risk', executeGrcRiskToolCall, 'get_risk', { number_or_sysid: 'RSK0010001' }, 'sn_risk_risk', 'Risk'],
  ['grc-indicator', executeGrcIndicatorToolCall, 'get_grc_indicator', { number_or_sysid: 'IND0010001' }, 'sn_grc_indicator', 'GRC Indicator'],
  ['grc-compliance', executeGrcComplianceToolCall, 'get_compliance_policy', { number_or_sysid: 'POL0010001' }, 'sn_compliance_policy', 'Compliance Policy'],
  ['grc-compliance', executeGrcComplianceToolCall, 'get_compliance_control', { number_or_sysid: 'CTRL0010001' }, 'sn_compliance_control', 'Compliance Control'],
  ['grc-compliance', executeGrcComplianceToolCall, 'get_policy_exception', { number_or_sysid: 'PEX0010001' }, 'sn_compliance_policy_exception', 'Policy Exception'],
  ['grc-compliance', executeGrcComplianceToolCall, 'get_grc_issue', { number_or_sysid: 'ISS0010001' }, 'sn_grc_issue', 'GRC Issue'],
];

beforeEach(() => {
  queryRecords.mockReset();
  updateRecord.mockReset();
  getRecord.mockReset();
});

const NAMED = CASES.map(([module, exec, tool, args, table, label]) => ({ module, exec, tool, args, table, label }));

describe('number lookups refuse a number shared by several records', () => {
  it.each(NAMED)('$module $tool', async ({ exec, tool, args, table, label }) => {
    duplicateNumber();
    const error = await exec(client, tool, args).catch((e) => e);
    expect(error).toMatchObject({ code: 'AMBIGUOUS_NUMBER' });
    expect(error.message).toContain(`${label} number`);
    expect(error.message).toContain(NEW);
    expect(error.message).toContain(OLD);
    expect(queryRecords.mock.calls[0][0]).toMatchObject({ table, limit: 2 });
  });

  it.each(NAMED)('$module $tool still returns the record when the number is unique', async ({ exec, tool, args }) => {
    // Some tools load related rows after resolving the record; answer those with nothing.
    queryRecords.mockResolvedValue({ count: 0, records: [] });
    queryRecords.mockResolvedValueOnce({ count: 1, records: [{ sys_id: NEW, number: 'X' }] });
    const result = await exec(client, tool, args);
    expect(JSON.stringify(result)).toContain(NEW);
  });
});

describe('write tools do not act on an ambiguous number', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('schedule_cab_meeting does not update either change request', async () => {
    duplicateNumber();
    await expect(executeChangeToolCall(client, 'schedule_cab_meeting', { change_id: 'CHG0010001', date: '2026-10-20' }))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_NUMBER' });
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it('retire_knowledge_article does not retire either article', async () => {
    duplicateNumber();
    await expect(executeKnowledgeToolCall(client, 'retire_knowledge_article', { article_id: 'KB0010001' }))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_NUMBER' });
    expect(updateRecord).not.toHaveBeenCalled();
  });

  it('acknowledge_alert does not acknowledge either alert', async () => {
    duplicateNumber();
    await expect(executeEventManagementToolCall(client, 'acknowledge_alert', { number_or_sysid: 'Alert0010001' }))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_NUMBER' });
    expect(updateRecord).not.toHaveBeenCalled();
  });
});

describe('get_discovery_run', () => {
  it('no longer interpolates run_id unsanitised into the encoded query', async () => {
    queryRecords.mockResolvedValueOnce({ count: 1, records: [{ sys_id: NEW }] });
    await executeDiscoveryToolCall(client, 'get_discovery_run', { run_id: 'DIS0010001^ORsys_idISNOTEMPTY' });
    const { query, display_value } = queryRecords.mock.calls[0][0];
    expect(query).toBe('number=DIS0010001ORsys_idISNOTEMPTY');
    expect(display_value).toBe(true);
  });
});
