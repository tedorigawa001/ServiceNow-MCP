/**
 * USEM / Vulnerability Response SLA (TTR) + notification operations for
 * Vulnerable Items (VI) and Remediation Tasks (RT).
 *
 * VI/RT do NOT extend the platform `task` table, so the generic task_sla tools
 * (get_sla_details/list_active_slas) do not apply. Their SLA is the built-in
 * Time-To-Remediate (TTR) mechanism stored on the records themselves:
 *   ttr_status        — no_target | in_flight | approaching | past_due | target_met
 *   ttr_target_date   — the remediation deadline
 *   ttr_applied_rule  — which sn_sec_wf_ttr_rule produced the target
 * VI additionally carries remediation_commitment_dt_tm (a manual commitment).
 *
 * VR notification *definitions* live in the standard sysevent_email_action
 * table, so create/update use the existing notification tools; this module adds
 * a VR-scoped discovery convenience (list_vr_notifications).
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Verified against a live PDI (dev400464).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { sanitizeLikeValue } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;

const TTR_STATUS_LABELS: Record<string, string> = {
  no_target: 'No Target',
  in_flight: 'In-flight',
  approaching: 'Approaching Target',
  past_due: 'Target Missed',
  target_met: 'Target Met',
};

interface RecordType {
  table: string;
  label: string;
  numberField: string;
  /** Field used by set_remediation_commitment. */
  commitmentField: string;
}

const RECORD_TYPES: Record<string, RecordType> = {
  vi: {
    table: 'sn_vul_vulnerable_item',
    label: 'Vulnerable Item',
    numberField: 'number',
    commitmentField: 'remediation_commitment_dt_tm',
  },
  rt: {
    table: 'sn_vul_remediation_task',
    label: 'Remediation Task',
    numberField: 'task_number',
    commitmentField: 'ttr_target_date',
  },
  // The task-based Vulnerability Group (sys_class label "Remediation Task",
  // number prefix VUL). Being a task it also supports task_sla — see
  // get_sla_details — but its TTR fields are handled the same way as VI/RT here.
  vg: {
    table: 'sn_vul_vulnerability',
    label: 'Vulnerability Group',
    numberField: 'number',
    commitmentField: 'remediation_commitment_dt_tm',
  },
};

const RECORD_TYPE_SCHEMA = {
  type: 'string',
  enum: ['vi', 'rt', 'vg'],
  description:
    'Record family: vi (Vulnerable Item), rt (Remediation Task, sn_vul_remediation_task), ' +
    'or vg (Vulnerability Group / task-based Remediation Task, sn_vul_vulnerability)',
};

const SLA_FIELDS = 'ttr_status,ttr_target_date,ttr_applied_rule,assignment_group,assigned_to,risk_score,state';

function resolveRecordType(rt: unknown): RecordType {
  if (typeof rt !== 'string' || !RECORD_TYPES[rt]) {
    throw new ServiceNowError('record_type must be one of: vi, rt, vg', 'INVALID_REQUEST');
  }
  return RECORD_TYPES[rt];
}

const strVal = (v: unknown): string =>
  v && typeof v === 'object' ? ((v as any).value ?? '') : ((v as string) ?? '');

/** Derive a friendly SLA assessment from ttr_status + target date. */
function assess(ttrStatus: string, targetDateRaw: string): { breached: boolean; assessment: string; days_to_target: number | null } {
  let daysToTarget: number | null = null;
  if (targetDateRaw) {
    const target = Date.parse(targetDateRaw.replace(' ', 'T') + 'Z');
    if (Number.isFinite(target)) {
      daysToTarget = Math.round((target - Date.now()) / 86_400_000);
    }
  }
  const map: Record<string, string> = {
    past_due: 'Breached — remediation target missed',
    approaching: 'At risk — target approaching',
    in_flight: 'On track — within target',
    target_met: 'Met — remediated within target',
    no_target: 'No SLA target applied',
  };
  return {
    breached: ttrStatus === 'past_due',
    assessment: map[ttrStatus] ?? ttrStatus ?? 'Unknown',
    days_to_target: daysToTarget,
  };
}

export function getUsemSlaToolDefinitions() {
  return [
    {
      name: 'list_remediation_sla',
      description:
        'List the SLA (Time-To-Remediate) status of Vulnerable Items, Remediation Tasks, or ' +
        'Vulnerability Groups. Filter by ttr_status (no_target/in_flight/approaching/past_due/' +
        'target_met), breaches only, an upcoming-due window, or assignment group. Ordered by ' +
        'soonest target date.',
      inputSchema: {
        type: 'object',
        properties: {
          record_type: RECORD_TYPE_SCHEMA,
          ttr_status: {
            type: 'string',
            description: 'Filter by TTR status — single value or comma list (no_target,in_flight,approaching,past_due,target_met)',
          },
          breached_only: { type: 'boolean', description: 'Shortcut for ttr_status=past_due' },
          due_within_days: { type: 'number', description: 'Only items whose target date falls within the next N days (1-365)' },
          assignment_group: { type: 'string', description: 'Filter by assignment group sys_id' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: {
            description: 'Return human-readable reference/choice values (true) or both raw and display ("all")',
            oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }],
          },
        },
        required: ['record_type'],
      },
    },
    {
      name: 'get_remediation_sla',
      description:
        'Get the SLA (TTR) detail for a single Vulnerable Item, Remediation Task, or Vulnerability ' +
        'Group by number or sys_id: status, target date, applied rule, breach flag and days ' +
        'remaining/overdue. For task-based Vulnerability Groups, task_sla instances are also ' +
        'available via get_sla_details.',
      inputSchema: {
        type: 'object',
        properties: {
          record_type: RECORD_TYPE_SCHEMA,
          number_or_sysid: { type: 'string', description: 'VI number / RT task_number, or 32-char sys_id' },
        },
        required: ['record_type', 'number_or_sysid'],
      },
    },
    {
      name: 'get_group_sla',
      description:
        'Get both SLA views for a task-based Vulnerability Group (sn_vul_vulnerability) by VUL number ' +
        'or sys_id: the built-in TTR status (target date, breach, days remaining) AND any attached ' +
        'task_sla instances (definition, stage, breached, percentage, time left). Use this for groups; ' +
        'VI/RT (which are not task-based) use get_remediation_sla.',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Group number (VULxxxxxxx) or 32-char sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'set_remediation_commitment',
      description:
        'Set the remediation commitment / target date on a Vulnerable Item (remediation_commitment_dt_tm) ' +
        'or Remediation Task (ttr_target_date). **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          record_type: RECORD_TYPE_SCHEMA,
          sys_id: { type: 'string', description: '32-char sys_id of the VI or RT' },
          commitment_date: { type: 'string', description: 'Target date/time (YYYY-MM-DD HH:MM:SS)' },
        },
        required: ['record_type', 'sys_id', 'commitment_date'],
      },
    },
    {
      name: 'list_vr_notifications',
      description:
        'List Vulnerability Response notification definitions (sysevent_email_action) scoped to the VR ' +
        'table family (sn_vul_* / sn_sec_*). Use the generic create_notification/update_notification ' +
        'tools to modify them.',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active state' },
          table: { type: 'string', description: 'Restrict to a single collection/table, e.g. "sn_vul_vulnerable_item"' },
          name_contains: { type: 'string', description: 'Filter where the notification name contains this text' },
          limit: { type: 'number', description: 'Max records (default: 50, max: 1000)' },
        },
      },
    },
  ];
}

export async function executeUsemSlaToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_remediation_sla': {
      const rt = resolveRecordType(args.record_type);
      const parts: string[] = [];
      if (args.breached_only === true) {
        parts.push('ttr_status=past_due');
      } else if (args.ttr_status) {
        const vals = String(args.ttr_status).split(',').map((s: string) => s.trim()).filter(Boolean);
        if (vals.length === 1) parts.push(`ttr_status=${vals[0]}`);
        else if (vals.length > 1) parts.push(`ttr_statusIN${vals.join(',')}`);
      }
      if (args.due_within_days !== undefined) {
        const n = Math.min(Math.max(Math.trunc(Number(args.due_within_days)), 1), 365);
        if (Number.isFinite(n)) {
          parts.push(`ttr_target_date>=javascript:gs.daysAgo(0)`);
          parts.push(`ttr_target_date<=javascript:gs.daysAgo(-${n})`);
        }
      }
      if (args.assignment_group) parts.push(`assignment_group=${args.assignment_group}`);
      if (args.query) parts.push(args.query);

      const resp = await client.queryRecords({
        table: rt.table,
        query: parts.join('^'),
        fields: `${rt.numberField},${SLA_FIELDS}`,
        orderBy: 'ttr_target_date',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return {
        record_type: args.record_type,
        table: rt.table,
        count: resp.count,
        records: resp.records,
        summary: `Found ${resp.count} ${rt.label}(s) by SLA status`,
      };
    }

    case 'get_remediation_sla': {
      const rt = resolveRecordType(args.record_type);
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      let record: any;
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        record = await client.getRecord(rt.table, args.number_or_sysid);
      } else {
        const resp = await client.queryRecords({
          table: rt.table,
          query: `${rt.numberField}=${sanitizeLikeValue(args.number_or_sysid)}`,
          limit: 1,
        });
        if (resp.count === 0) throw new ServiceNowError(`${rt.label} not found: ${args.number_or_sysid}`, 'NOT_FOUND');
        record = resp.records[0];
      }
      const ttrStatus = strVal(record.ttr_status);
      const targetDate = strVal(record.ttr_target_date);
      const a = assess(ttrStatus, targetDate);
      return {
        record_type: args.record_type,
        number: strVal(record[rt.numberField]),
        sys_id: strVal(record.sys_id),
        ttr_status: ttrStatus,
        ttr_status_label: TTR_STATUS_LABELS[ttrStatus] ?? ttrStatus,
        ttr_target_date: targetDate,
        ttr_applied_rule: strVal(record.ttr_applied_rule) || null,
        breached: a.breached,
        days_to_target: a.days_to_target,
        assessment: a.assessment,
      };
    }

    case 'get_group_sla': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      let record: any;
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        record = await client.getRecord('sn_vul_vulnerability', args.number_or_sysid);
      } else {
        const resp = await client.queryRecords({
          table: 'sn_vul_vulnerability',
          query: `number=${sanitizeLikeValue(args.number_or_sysid)}`,
          limit: 1,
        });
        if (resp.count === 0) throw new ServiceNowError(`Vulnerability Group not found: ${args.number_or_sysid}`, 'NOT_FOUND');
        record = resp.records[0];
      }
      const sysId = strVal(record.sys_id);
      const ttrStatus = strVal(record.ttr_status);
      const targetDate = strVal(record.ttr_target_date);
      const a = assess(ttrStatus, targetDate);

      const slaResp = await client.queryRecords({
        table: 'task_sla',
        query: `task=${sysId}`,
        fields: 'sla,stage,has_breached,percentage,business_time_left,start_time,end_time,sys_id',
        orderBy: '-sys_updated_on',
        limit: 50,
        display_value: 'all',
      });

      return {
        number: strVal(record.number),
        sys_id: sysId,
        ttr: {
          ttr_status: ttrStatus,
          ttr_status_label: TTR_STATUS_LABELS[ttrStatus] ?? ttrStatus,
          ttr_target_date: targetDate,
          breached: a.breached,
          days_to_target: a.days_to_target,
          assessment: a.assessment,
        },
        task_sla: { count: slaResp.count, records: slaResp.records },
        summary:
          `Group ${strVal(record.number)}: TTR ${TTR_STATUS_LABELS[ttrStatus] ?? ttrStatus}` +
          `${a.breached ? ' (breached)' : ''}, ${slaResp.count} task_sla instance(s)`,
      };
    }

    case 'set_remediation_commitment': {
      requireWrite();
      const rt = resolveRecordType(args.record_type);
      if (!args.sys_id || !SYS_ID_RE.test(args.sys_id)) {
        throw new ServiceNowError('sys_id must be a 32-character hex string', 'INVALID_REQUEST');
      }
      if (!args.commitment_date) throw new ServiceNowError('commitment_date is required', 'INVALID_REQUEST');
      const result = await client.updateRecord(rt.table, args.sys_id, {
        [rt.commitmentField]: args.commitment_date,
      });
      return {
        ...result,
        record_type: args.record_type,
        summary: `Set ${rt.label} ${rt.commitmentField} to ${args.commitment_date}`,
      };
    }

    case 'list_vr_notifications': {
      const parts: string[] = [];
      if (args.table) {
        parts.push(`collection=${args.table}`);
      } else {
        parts.push('collectionSTARTSWITHsn_vul^ORcollectionSTARTSWITHsn_sec');
      }
      if (args.active !== undefined) parts.push(`active=${args.active === true}`);
      if (args.name_contains) parts.push(`nameCONTAINS${args.name_contains}`);
      const resp = await client.queryRecords({
        table: 'sysevent_email_action',
        query: parts.join('^'),
        fields: 'name,collection,active,event_name,sys_id',
        orderBy: 'collection',
        limit: args.limit ?? 50,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} VR notification(s)` };
    }

    default:
      return null;
  }
}
