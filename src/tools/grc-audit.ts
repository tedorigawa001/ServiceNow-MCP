/**
 * GRC — Audit Management tools. Covers Engagements (audit projects) and
 * Control Tests (the actual "audit result" record — `sn_audit_result` does
 * not exist; see docs/GRC_DESIGN.md).
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 *
 * Tables verified against a live PDI (dev400464, 2026-07-12):
 *   - sn_audit_engagement    (Engagement)   — number prefix ENG, extends planned_task
 *   - sn_audit_control_test  (Control Test) — number prefix CTR, subclass of sn_audit_task
 *       sn_audit_task itself has 0 direct records — always query the subclass
 *       (sn_audit_control_test / sn_audit_activity / sn_audit_interview /
 *       sn_audit_walkthrough), never sn_audit_task alone.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { sanitizeLikeValue } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;
const queryValue = (value: unknown): string => sanitizeLikeValue(String(value));

const ENGAGEMENT_STATE_LABELS: Record<string, string> = {
  '-5': 'Scope',
  '1': 'Validate',
  '2': 'Fieldwork',
  '3': 'Closed Complete',
  '4': 'Closed Incomplete',
  '5': 'Follow Up',
  '6': 'Awaiting Approval',
};

const ENGAGEMENT_STATE_SCHEMA = {
  type: 'string',
  description:
    'State filter. Single value or comma-separated list. -5=Scope, 1=Validate, 2=Fieldwork, ' +
    '3=Closed Complete, 4=Closed Incomplete, 5=Follow Up, 6=Awaiting Approval',
};

const ENGAGEMENT_FIELDS =
  'number,name,short_description,state,engagement_type,audit_period_start,audit_period_end,' +
  'auditors,approvers,opinion,result,task_percent_complete,high_priority_issues,sys_id';

const CONTROL_TEST_FIELDS =
  'number,short_description,state,control,test_plan,issue,design_effectiveness,' +
  'operation_effectiveness,opinion,performed_on,sys_id';

/** Build a `state=` / `stateIN` clause from a single value or comma list. */
function stateClause(state: unknown): string | undefined {
  if (state === undefined || state === null || state === '') return undefined;
  const values = String(state)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  return values.length === 1 ? `state=${queryValue(values[0])}` : `stateIN${values.map(queryValue).join(',')}`;
}

/** Normalize the stats API result into [{ state, label, count }]. */
function summarizeByState(stats: any, labels: Record<string, string>): Array<{ state: string; label: string; count: number }> {
  const rows = Array.isArray(stats) ? stats : [];
  return rows
    .map(row => {
      const value = String(row?.groupby_fields?.[0]?.value ?? '');
      const count = parseInt(String(row?.stats?.count ?? '0'), 10);
      return { state: value, label: labels[value] ?? value, count: Number.isFinite(count) ? count : 0 };
    })
    .sort((a, b) => b.count - a.count);
}

export function getGrcAuditToolDefinitions() {
  return [
    {
      name: 'list_audit_engagements',
      description:
        'List Audit Engagements (sn_audit_engagement) — the top-level audit project record. ' +
        'Filter by state or engagement type. Ordered by most recently updated.',
      inputSchema: {
        type: 'object',
        properties: {
          state: ENGAGEMENT_STATE_SCHEMA,
          engagement_type: { type: 'string', description: 'Engagement type choice value, e.g. "4" (IT Audit), "6" (Compliance Audit), "11" (Vendor Audit)' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: {
            description: 'Return human-readable reference/choice values (true) or both raw and display ("all")',
            oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }],
          },
        },
      },
    },
    {
      name: 'get_audit_engagement',
      description: 'Get full details of a single Audit Engagement by sys_id or number (e.g. "ENG0000104").',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Engagement number (ENGxxxxxxx) or 32-char sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_audit_control_tests',
      description:
        'List Control Tests (sn_audit_control_test) — the record of testing a Control within an audit ' +
        'engagement; this is the real "audit result" (there is no sn_audit_result table). Filter by ' +
        'control, test plan, or design/operation effectiveness.',
      inputSchema: {
        type: 'object',
        properties: {
          state: ENGAGEMENT_STATE_SCHEMA,
          control: { type: 'string', description: 'Filter by related Control sys_id' },
          test_plan: { type: 'string', description: 'Filter by related Test Plan sys_id' },
          design_effectiveness: { type: 'string', enum: ['none', 'effective', 'ineffective'], description: 'Filter by design effectiveness result' },
          operation_effectiveness: { type: 'string', enum: ['none', 'effective', 'ineffective'], description: 'Filter by operating effectiveness result' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: {
            description: 'Return human-readable reference/choice values (true) or both raw and display ("all")',
            oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }],
          },
        },
      },
    },
    {
      name: 'get_audit_control_test',
      description: 'Get full details of a single Control Test by sys_id or number (e.g. "CTR0000153").',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Control Test number (CTRxxxxxxx) or 32-char sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'get_grc_audit_dashboard',
      description:
        'Summarize the Audit Management posture: Engagement counts by state, Control Test counts by ' +
        'design/operation effectiveness, and the highest-priority-issue open engagements.',
      inputSchema: {
        type: 'object',
        properties: {
          top: { type: 'number', description: 'How many top open engagements to include (default: 5, max: 50)' },
        },
      },
    },
  ];
}

export async function executeGrcAuditToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_audit_engagements': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.engagement_type) parts.push(`engagement_type=${queryValue(args.engagement_type)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_audit_engagement',
        query: parts.join('^'),
        fields: ENGAGEMENT_FIELDS,
        orderBy: '-sys_updated_on',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} audit engagement(s)` };
    }

    case 'get_audit_engagement': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        return await client.getRecord('sn_audit_engagement', args.number_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sn_audit_engagement',
        query: `number=${queryValue(args.number_or_sysid)}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Audit Engagement not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'list_audit_control_tests': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.control) parts.push(`control=${queryValue(args.control)}`);
      if (args.test_plan) parts.push(`test_plan=${queryValue(args.test_plan)}`);
      if (args.design_effectiveness) parts.push(`design_effectiveness=${queryValue(args.design_effectiveness)}`);
      if (args.operation_effectiveness) parts.push(`operation_effectiveness=${queryValue(args.operation_effectiveness)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_audit_control_test',
        query: parts.join('^'),
        fields: CONTROL_TEST_FIELDS,
        orderBy: '-sys_updated_on',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} control test(s)` };
    }

    case 'get_audit_control_test': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        return await client.getRecord('sn_audit_control_test', args.number_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sn_audit_control_test',
        query: `number=${queryValue(args.number_or_sysid)}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Control Test not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'get_grc_audit_dashboard': {
      const top = Math.min(Math.max(Math.trunc(Number(args.top) || 5), 1), 50);

      const [engagementStats, testStats, topOpen] = await Promise.all([
        client.runAggregateQuery('sn_audit_engagement', 'state', 'COUNT'),
        client.runAggregateQuery('sn_audit_control_test', 'design_effectiveness', 'COUNT'),
        client.queryRecords({
          table: 'sn_audit_engagement',
          query: 'stateIN-5,1,2,5,6',
          fields: 'number,name,state,engagement_type,high_priority_issues',
          orderBy: '-high_priority_issues',
          limit: top,
          display_value: 'all',
        }),
      ]);

      const engagementsByState = summarizeByState(engagementStats, ENGAGEMENT_STATE_LABELS);
      const testsByEffectiveness = summarizeByState(testStats, { none: 'None', effective: 'Effective', ineffective: 'Ineffective' });
      const total = (rows: Array<{ count: number }>) => rows.reduce((s, r) => s + r.count, 0);
      const openEngagements = engagementsByState
        .filter(r => !['3', '4'].includes(r.state))
        .reduce((s, r) => s + r.count, 0);

      return {
        engagements: { total: total(engagementsByState), open: openEngagements, by_state: engagementsByState },
        control_tests: { total: total(testsByEffectiveness), by_effectiveness: testsByEffectiveness },
        top_open_engagements_by_priority_issues: topOpen.records,
        summary:
          `Engagements: ${total(engagementsByState)} total (${openEngagements} open) · ` +
          `Control Tests: ${total(testsByEffectiveness)} total · ` +
          `top ${topOpen.count} open engagement(s) by high-priority issues listed`,
      };
    }

    default:
      return null;
  }
}
