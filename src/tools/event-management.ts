/**
 * ITOM Event Management — Alerts (em_alert).
 *
 * Alerts are the operational unit of Event Management: events (em_event) are
 * de-duplicated into alerts, which operators acknowledge, assign, close and
 * promote to incidents. The write tools do exactly what the product's own
 * list actions do: "Acknowledge" sets acknowledged=true; "Close" sets
 * state=Closed and, when evt_mgmt.alert_ack_on_close is true, acknowledges as
 * well. Nothing here re-implements alert correlation or incident promotion.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { sanitizeLikeValue } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;

const ALERT_LIST_FIELDS = [
  'sys_id', 'number', 'severity', 'state', 'acknowledged', 'maintenance',
  'short_description', 'source', 'node', 'resource', 'metric_name', 'type', 'event_class',
  'cmdb_ci', 'assignment_group', 'assigned_to', 'incident', 'parent', 'is_group_alert',
  'event_count', 'initial_remote_time', 'last_remote_time', 'sys_created_on', 'sys_updated_on',
].join(',');

const ALERT_GET_FIELDS = `${ALERT_LIST_FIELDS},description,additional_info,message_key,classification,correlation_group,group_source,flap_count,kb,sn_priority,sn_priority_group,priority_breakdown,remote_task_id,sn_source_event_id`;

/** Fields an operator may change on an alert. State and acknowledgement go through the dedicated tools. */
const ALERT_UPDATE_FIELDS = new Set(['assigned_to', 'assignment_group', 'work_notes', 'maintenance', 'short_description', 'description', 'kb']);

const SEVERITY_LABELS: Record<string, string> = { '0': 'Clear', '1': 'Critical', '2': 'Major', '3': 'Minor', '4': 'Warning', '5': 'OK' };
const ALERT_STATES = new Set(['Open', 'Reopen', 'Flapping', 'Closed']);

export function getEventManagementToolDefinitions() {
  return [
    {
      name: 'list_alerts',
      description: 'List Event Management alerts (em_alert) with operational filters. Defaults to alerts that are not Closed, most severe first.',
      inputSchema: {
        type: 'object',
        properties: {
          severity: { type: 'string', description: 'Severity value or comma-separated list: 1 Critical, 2 Major, 3 Minor, 4 Warning, 5 OK, 0 Clear' },
          state: { type: 'string', description: 'Open | Reopen | Flapping | Closed. Default: everything except Closed. Use "all" for no state filter.' },
          acknowledged: { type: 'boolean', description: 'Only acknowledged (true) or unacknowledged (false) alerts' },
          cmdb_ci: { type: 'string', description: 'Filter by CI sys_id' },
          source: { type: 'string', description: 'Filter by event source (exact match)' },
          assignment_group: { type: 'string', description: 'Filter by assignment group sys_id' },
          unassigned: { type: 'boolean', description: 'true: only alerts with no assignment group and no assignee' },
          without_incident: { type: 'boolean', description: 'true: only alerts not yet linked to an incident' },
          query: { type: 'string', description: 'Additional encoded query appended with ^ (e.g. "short_descriptionLIKEdisk")' },
          limit: { type: 'number', description: 'Max results (default 25, max 200)' },
        },
        required: [],
      },
    },
    {
      name: 'get_alert',
      description: 'Get one alert by number or sys_id, with its recent history (em_alert_history) and related tasks (incident/change/problem links).',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Alert number (e.g. Alert0010005) or sys_id' },
          history_limit: { type: 'number', description: 'How many history entries to include (default 10, max 50)' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'get_alert_summary',
      description: 'Operational overview of open alerts: counts by severity, by state, acknowledged vs not, and the top sources. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          include_closed: { type: 'boolean', description: 'Include Closed alerts in the counts (default false)' },
          top_sources: { type: 'number', description: 'How many sources to list (default 5, max 20)' },
        },
        required: [],
      },
    },
    {
      name: 'acknowledge_alert',
      description: 'Acknowledge an alert (sets acknowledged=true, exactly like the "Acknowledge" list action), optionally with a work note. Already-acknowledged alerts are reported, not re-written. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Alert number or sys_id' },
          work_notes: { type: 'string', description: 'Optional work note to add' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'close_alert',
      description: 'Close an alert (state=Closed, like the "Close" action; also acknowledges it when evt_mgmt.alert_ack_on_close is true), optionally with a work note. Refuses alerts that are already Closed. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Alert number or sys_id' },
          work_notes: { type: 'string', description: 'Optional closing note' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_alert',
      description: 'Assign or annotate an alert. Allowed fields: assigned_to, assignment_group, work_notes, maintenance, short_description, description, kb. Use acknowledge_alert / close_alert for state changes. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Alert number or sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to set',
            properties: Object.fromEntries([...ALERT_UPDATE_FIELDS].map((f) => [f, {}])),
            additionalProperties: false,
          },
        },
        required: ['number_or_sysid', 'fields'],
      },
    },
  ];
}

async function resolveAlert(client: ServiceNowClient, ref: unknown, fields: string): Promise<Record<string, unknown>> {
  const value = String(ref ?? '').trim();
  if (!value) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
  const query = SYS_ID_RE.test(value) ? `sys_id=${value}` : `number=${sanitizeLikeValue(value)}`;
  const resp = await client.queryRecords({ table: 'em_alert', query, fields, limit: 1 });
  const alert = resp.records[0] as Record<string, unknown> | undefined;
  if (!alert) throw new ServiceNowError(`Alert "${value}" not found`, 'NOT_FOUND');
  return alert;
}

const withSeverityLabel = (r: Record<string, unknown>) => ({ ...r, severity_label: SEVERITY_LABELS[String(r.severity)] ?? String(r.severity) });

async function aggregateCounts(client: ServiceNowClient, groupBy: string, query: string): Promise<Record<string, number>> {
  const resp = await client.runAggregateQuery('em_alert', groupBy, 'COUNT', query);
  const out: Record<string, number> = {};
  for (const row of (Array.isArray(resp) ? resp : []) as Array<{ stats?: { count?: string }; groupby_fields?: Array<{ field: string; value: string }> }>) {
    const key = row.groupby_fields?.find((g) => g.field === groupBy)?.value ?? '';
    out[key] = parseInt(String(row.stats?.count ?? '0'), 10) || 0;
  }
  return out;
}

export async function executeEventManagementToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>,
): Promise<any> {
  switch (name) {
    case 'list_alerts': {
      const clauses: string[] = [];
      const state = args.state === undefined ? undefined : String(args.state);
      if (state === undefined) clauses.push('state!=Closed');
      else if (state !== 'all') {
        if (!ALERT_STATES.has(state)) throw new ServiceNowError(`state must be one of ${[...ALERT_STATES].join(', ')} or "all"`, 'VALIDATION_ERROR');
        clauses.push(`state=${state}`);
      }
      if (args.severity !== undefined) {
        const values = String(args.severity).split(',').map((v) => v.trim()).filter(Boolean);
        if (values.some((v) => !(v in SEVERITY_LABELS))) throw new ServiceNowError('severity values must be 0-5', 'VALIDATION_ERROR');
        clauses.push(values.length === 1 ? `severity=${values[0]}` : `severityIN${values.join(',')}`);
      }
      if (args.acknowledged !== undefined) clauses.push(`acknowledged=${args.acknowledged ? 'true' : 'false'}`);
      if (args.cmdb_ci) clauses.push(`cmdb_ci=${sanitizeLikeValue(String(args.cmdb_ci))}`);
      if (args.source) clauses.push(`source=${sanitizeLikeValue(String(args.source))}`);
      if (args.assignment_group) clauses.push(`assignment_group=${sanitizeLikeValue(String(args.assignment_group))}`);
      if (args.unassigned) clauses.push('assignment_groupISEMPTY^assigned_toISEMPTY');
      if (args.without_incident) clauses.push('incidentISEMPTY');
      if (args.query) clauses.push(String(args.query));
      clauses.push('ORDERBYseverity^ORDERBYDESClast_remote_time');
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 200);
      const resp = await client.queryRecords({ table: 'em_alert', query: clauses.join('^'), fields: ALERT_LIST_FIELDS, limit });
      return { count: resp.count, alerts: (resp.records as Record<string, unknown>[]).map(withSeverityLabel) };
    }

    case 'get_alert': {
      const alert = await resolveAlert(client, args.number_or_sysid, ALERT_GET_FIELDS);
      const historyLimit = Math.min(Math.max(Number(args.history_limit) || 10, 1), 50);
      const [history, relatedTasks, children] = await Promise.all([
        client.queryRecords({ table: 'em_alert_history', query: `alert_sys_id=${alert.sys_id}^ORDERBYDESCsys_created_on`, fields: 'sys_id,severity,state,acknowledged,event_count,last_remote_time,short_description,sys_created_on', limit: historyLimit }).catch(() => ({ count: 0, records: [] })),
        client.queryRecords({ table: 'em_alert_related_task', query: `alert=${alert.sys_id}`, fields: 'sys_id,task_type,incident,change_request,problem,affiliation_type,score,sys_created_on', limit: 20 }).catch(() => ({ count: 0, records: [] })),
        client.queryRecords({ table: 'em_alert', query: `parent=${alert.sys_id}`, fields: 'sys_id,number,severity,state,short_description', limit: 50 }).catch(() => ({ count: 0, records: [] })),
      ]);
      return {
        ...withSeverityLabel(alert),
        history: history.records,
        related_tasks: relatedTasks.records,
        child_alerts: children.records,
      };
    }

    case 'get_alert_summary': {
      const base = args.include_closed ? '' : 'state!=Closed';
      const topSources = Math.min(Math.max(Number(args.top_sources) || 5, 1), 20);
      const [bySeverity, byState, byAck, bySource] = await Promise.all([
        aggregateCounts(client, 'severity', base),
        aggregateCounts(client, 'state', base),
        aggregateCounts(client, 'acknowledged', base),
        aggregateCounts(client, 'source', base),
      ]);
      const total = Object.values(byState).reduce((a, b) => a + b, 0);
      return {
        scope: args.include_closed ? 'all alerts' : 'alerts not Closed',
        total,
        by_severity: Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [`${k} ${SEVERITY_LABELS[k] ?? ''}`.trim(), v])),
        by_state: byState,
        acknowledged: byAck.true ?? 0,
        unacknowledged: byAck.false ?? 0,
        top_sources: Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, topSources).map(([source, count]) => ({ source, count })),
      };
    }

    case 'acknowledge_alert': {
      requireWrite();
      const alert = await resolveAlert(client, args.number_or_sysid, 'sys_id,number,state,acknowledged');
      if (String(alert.acknowledged) === 'true') {
        return { action: 'already_acknowledged', sys_id: alert.sys_id, number: alert.number, state: alert.state };
      }
      const data: Record<string, unknown> = { acknowledged: true };
      if (args.work_notes) data.work_notes = String(args.work_notes);
      const updated = await client.updateRecord('em_alert', String(alert.sys_id), data);
      return { action: 'acknowledged', sys_id: alert.sys_id, number: updated.number ?? alert.number, state: updated.state, acknowledged: updated.acknowledged };
    }

    case 'close_alert': {
      requireWrite();
      const alert = await resolveAlert(client, args.number_or_sysid, 'sys_id,number,state,acknowledged');
      if (String(alert.state) === 'Closed') {
        throw new ServiceNowError(`Alert ${String(alert.number)} is already Closed`, 'CONFLICT');
      }
      const data: Record<string, unknown> = { state: 'Closed' };
      if (args.work_notes) data.work_notes = String(args.work_notes);
      const updated = await client.updateRecord('em_alert', String(alert.sys_id), data);
      return { action: 'closed', sys_id: alert.sys_id, number: updated.number ?? alert.number, state: updated.state, acknowledged: updated.acknowledged };
    }

    case 'update_alert': {
      requireWrite();
      const fields = args.fields;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length === 0) {
        throw new ServiceNowError('fields must be a non-empty object', 'INVALID_REQUEST');
      }
      const disallowed = Object.keys(fields).filter((f) => !ALERT_UPDATE_FIELDS.has(f));
      if (disallowed.length) {
        throw new ServiceNowError(`Alert fields cannot be updated here: ${disallowed.join(', ')}. Use acknowledge_alert / close_alert for state changes.`, 'VALIDATION_ERROR');
      }
      const alert = await resolveAlert(client, args.number_or_sysid, 'sys_id,number');
      const updated = await client.updateRecord('em_alert', String(alert.sys_id), fields);
      return { action: 'updated', sys_id: alert.sys_id, number: updated.number ?? alert.number, updated_fields: Object.keys(fields), ...Object.fromEntries(Object.keys(fields).filter((f) => f !== 'work_notes').map((f) => [f, updated[f]])) };
    }

    default:
      return null;
  }
}
