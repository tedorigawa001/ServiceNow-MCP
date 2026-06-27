/**
 * USEM (Unified Security Exposure Management) tools — the modern successor to
 * Vulnerability Response. Covers Vulnerable Items (VI), Remediation Tasks (RT),
 * and NVD entries under the `sn_vul_` table family.
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Required roles: `sn_vul.read` (read), `sn_vul.write` (write).
 *
 * Tables and fields were verified against a live PDI (dev400464):
 *   - sn_vul_vulnerable_item   (VI)  — human key: `number` (VITxxxxxxx)
 *   - sn_vul_remediation_task  (RT)  — human key: `task_number`
 *   - sn_vul_nvd_entry         (NVD) — CVE key: `id` (CVE-YYYY-NNNN)
 *   - sn_vul_m2m_vul_group_item ("Remediation Task Item") — VI ↔ group/RT m2m
 *       columns: `sn_vul_vulnerability` (group), `sn_vul_vulnerable_item` (VI)
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

/**
 * Shared state model for VI and RT (sys_choice on both tables, verified on PDI).
 */
const VUL_STATE_LABELS: Record<string, string> = {
  '1': 'Open',
  '2': 'Under Investigation',
  '10': 'Awaiting Implementation',
  '11': 'In Review',
  '12': 'Deferred',
  '101': 'Resolved',
  '3': 'Closed',
};

const VUL_STATE_SCHEMA = {
  type: 'string',
  description:
    'State filter. Single value or comma-separated list. 1=Open, 2=Under Investigation, ' +
    '10=Awaiting Implementation, 11=In Review, 12=Deferred, 101=Resolved, 3=Closed',
};

const SYS_ID_RE = /^[0-9a-f]{32}$/i;

const VI_FIELDS =
  'number,short_description,state,substate,risk_score,risk_rating,cmdb_ci,' +
  'assignment_group,assigned_to,vulnerability,source,first_found,last_found,sys_id';

const RT_FIELDS =
  'task_number,short_description,state,assignment_group,assigned_to,risk_score,' +
  'risk_rating,cmdb_ci,sn_vul_entry,ttr_status,ttr_target_date,sys_id';

const NVD_FIELDS =
  'id,summary,v3_base_score,v3_base_severity,v2_base_severity,epss_score,' +
  'exploit,patch_available,date_published,last_modified,sys_id';

const VG_FIELDS =
  'number,short_description,state,assignment_group,assigned_to,risk_score,risk_rating,' +
  'ttr_status,ttr_target_date,total_vulnerabilities,sys_id';

export function getUsemToolDefinitions() {
  return [
    {
      name: 'list_vulnerable_items',
      description:
        'List USEM Vulnerable Items (sn_vul_vulnerable_item). Filter by state, minimum risk score, ' +
        'CMDB CI, or assignment group. Returns curated fields ordered by descending risk score.',
      inputSchema: {
        type: 'object',
        properties: {
          state: VUL_STATE_SCHEMA,
          risk_score_min: { type: 'number', description: 'Only return VIs with risk_score >= this value' },
          cmdb_ci: { type: 'string', description: 'Filter by affected CI sys_id' },
          assignment_group: { type: 'string', description: 'Filter by assignment group sys_id' },
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
      name: 'get_vulnerable_item',
      description:
        'Get full details of a single Vulnerable Item by sys_id or VI number (e.g. "VIT0010003").',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'VI number (VITxxxxxxx) or 32-char sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_remediation_tasks',
      description:
        'List USEM Remediation Tasks (sn_vul_remediation_task). Filter by state or assignment group. ' +
        'Returns curated fields ordered by descending risk score.',
      inputSchema: {
        type: 'object',
        properties: {
          state: VUL_STATE_SCHEMA,
          assignment_group: { type: 'string', description: 'Filter by assignment group sys_id' },
          assigned_to: { type: 'string', description: 'Filter by assignee sys_id' },
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
      name: 'get_remediation_task',
      description:
        'Get full details of a single Remediation Task by sys_id or task number.',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'RT task_number or 32-char sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_vulnerability_groups',
      description:
        'List Vulnerability Groups (sn_vul_vulnerability) — the task-based remediation entity ' +
        '(sys_class label "Remediation Task", number prefix VUL). Filter by state, minimum risk score, ' +
        'or assignment group. Ordered by descending risk score. Use add_vi_to_remediation_task to add ' +
        'members and the SLA tools (record_type=vg) for TTR status.',
      inputSchema: {
        type: 'object',
        properties: {
          state: VUL_STATE_SCHEMA,
          risk_score_min: { type: 'number', description: 'Only return groups with risk_score >= this value' },
          assignment_group: { type: 'string', description: 'Filter by assignment group sys_id' },
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
      name: 'get_vulnerability_group',
      description:
        'Get full details of a single Vulnerability Group by sys_id or VUL number (e.g. "VUL0000103").',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Group number (VULxxxxxxx) or 32-char sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_nvd_entries',
      description:
        'List NVD entries (sn_vul_nvd_entry). Filter by CVE id substring or minimum CVSS v3 base score.',
      inputSchema: {
        type: 'object',
        properties: {
          cve: { type: 'string', description: 'CVE id or substring (matched with LIKE), e.g. "CVE-2018" or "2018-1002203"' },
          score_min: { type: 'number', description: 'Only return entries with v3_base_score >= this value' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
        },
      },
    },
    {
      name: 'get_nvd_entry_by_cve',
      description:
        'Look up a single NVD entry by exact CVE id (e.g. "CVE-2018-1002203").',
      inputSchema: {
        type: 'object',
        properties: {
          cve: { type: 'string', description: 'Exact CVE id, e.g. "CVE-2018-1002203"' },
        },
        required: ['cve'],
      },
    },
    {
      name: 'get_usem_dashboard',
      description:
        'Summarize the USEM posture: Vulnerable Item counts by state, Remediation Task counts by state, ' +
        'and the highest-risk open Vulnerable Items. Uses the aggregate (stats) API for exact counts.',
      inputSchema: {
        type: 'object',
        properties: {
          top: { type: 'number', description: 'How many top-risk VIs to include (default: 5, max: 50)' },
        },
      },
    },
    {
      name: 'create_remediation_task',
      description:
        'Create a Remediation Task (sn_vul_remediation_task). **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Short description / title of the task' },
          description: { type: 'string', description: 'Detailed description' },
          assignment_group: { type: 'string', description: 'Assignment group sys_id' },
          assigned_to: { type: 'string', description: 'Assignee sys_id' },
          cmdb_ci: { type: 'string', description: 'Affected CI sys_id' },
          sn_vul_entry: { type: 'string', description: 'Related vulnerability entry sys_id' },
          state: VUL_STATE_SCHEMA,
          ttr_target_date: { type: 'string', description: 'Target remediation date (YYYY-MM-DD HH:MM:SS)' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'update_remediation_task',
      description:
        'Update a Remediation Task by sys_id (state, assignee, group, target date, etc.). ' +
        '**[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Remediation Task' },
          state: VUL_STATE_SCHEMA,
          assignment_group: { type: 'string', description: 'Assignment group sys_id' },
          assigned_to: { type: 'string', description: 'Assignee sys_id' },
          short_description: { type: 'string', description: 'Updated short description' },
          ttr_target_date: { type: 'string', description: 'Target remediation date (YYYY-MM-DD HH:MM:SS)' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'add_vi_to_remediation_task',
      description:
        'Associate a Vulnerable Item with a remediation group via the "Remediation Task Item" m2m ' +
        '(sn_vul_m2m_vul_group_item). The group is an sn_vul_vulnerability record that backs the ' +
        'remediation task. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          remediation_group: {
            type: 'string',
            description: 'sys_id of the sn_vul_vulnerability group backing the remediation task',
          },
          vulnerable_item: { type: 'string', description: 'sys_id of the Vulnerable Item to add' },
        },
        required: ['remediation_group', 'vulnerable_item'],
      },
    },
  ];
}

/** Build a `state=` / `stateIN` clause from a single value or comma list. */
function stateClause(state: unknown): string | undefined {
  if (state === undefined || state === null || state === '') return undefined;
  const values = String(state)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (values.length === 0) return undefined;
  return values.length === 1 ? `state=${values[0]}` : `stateIN${values.join(',')}`;
}

/** Normalize the stats API result into [{ state, label, count }]. */
function summarizeByState(stats: any): Array<{ state: string; label: string; count: number }> {
  const rows = Array.isArray(stats) ? stats : [];
  return rows
    .map(row => {
      const value = String(row?.groupby_fields?.[0]?.value ?? '');
      const count = parseInt(String(row?.stats?.count ?? '0'), 10);
      return {
        state: value,
        label: VUL_STATE_LABELS[value] ?? value,
        count: Number.isFinite(count) ? count : 0,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export async function executeUsemToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_vulnerable_items': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.risk_score_min !== undefined) parts.push(`risk_score>=${Number(args.risk_score_min)}`);
      if (args.cmdb_ci) parts.push(`cmdb_ci=${args.cmdb_ci}`);
      if (args.assignment_group) parts.push(`assignment_group=${args.assignment_group}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_vul_vulnerable_item',
        query: parts.join('^'),
        fields: VI_FIELDS,
        orderBy: '-risk_score',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} vulnerable item(s)` };
    }

    case 'get_vulnerable_item': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        return await client.getRecord('sn_vul_vulnerable_item', args.number_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sn_vul_vulnerable_item',
        query: `number=${args.number_or_sysid}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Vulnerable Item not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'list_remediation_tasks': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.assignment_group) parts.push(`assignment_group=${args.assignment_group}`);
      if (args.assigned_to) parts.push(`assigned_to=${args.assigned_to}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_vul_remediation_task',
        query: parts.join('^'),
        fields: RT_FIELDS,
        orderBy: '-risk_score',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} remediation task(s)` };
    }

    case 'get_remediation_task': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        return await client.getRecord('sn_vul_remediation_task', args.number_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sn_vul_remediation_task',
        query: `task_number=${args.number_or_sysid}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Remediation Task not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'list_vulnerability_groups': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.risk_score_min !== undefined) parts.push(`risk_score>=${Number(args.risk_score_min)}`);
      if (args.assignment_group) parts.push(`assignment_group=${args.assignment_group}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_vul_vulnerability',
        query: parts.join('^'),
        fields: VG_FIELDS,
        orderBy: '-risk_score',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} vulnerability group(s)` };
    }

    case 'get_vulnerability_group': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        return await client.getRecord('sn_vul_vulnerability', args.number_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sn_vul_vulnerability',
        query: `number=${args.number_or_sysid}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Vulnerability Group not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'list_nvd_entries': {
      const parts: string[] = [];
      if (args.cve) parts.push(`idLIKE${args.cve}`);
      if (args.score_min !== undefined) parts.push(`v3_base_score>=${Number(args.score_min)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_vul_nvd_entry',
        query: parts.join('^'),
        fields: NVD_FIELDS,
        orderBy: '-v3_base_score',
        limit: args.limit ?? 25,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} NVD entry/entries` };
    }

    case 'get_nvd_entry_by_cve': {
      if (!args.cve) throw new ServiceNowError('cve is required', 'INVALID_REQUEST');
      const resp = await client.queryRecords({
        table: 'sn_vul_nvd_entry',
        query: `id=${args.cve}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`NVD entry not found for CVE: ${args.cve}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'get_usem_dashboard': {
      const top = Math.min(Math.max(Math.trunc(Number(args.top) || 5), 1), 50);

      const [viStats, rtStats, topRisk] = await Promise.all([
        client.runAggregateQuery('sn_vul_vulnerable_item', 'state', 'COUNT'),
        client.runAggregateQuery('sn_vul_remediation_task', 'state', 'COUNT'),
        client.queryRecords({
          table: 'sn_vul_vulnerable_item',
          query: 'state!=3',
          fields: 'number,short_description,risk_score,state,cmdb_ci,assignment_group',
          orderBy: '-risk_score',
          limit: top,
          display_value: 'all',
        }),
      ]);

      const viByState = summarizeByState(viStats);
      const rtByState = summarizeByState(rtStats);
      const total = (rows: Array<{ count: number }>) => rows.reduce((s, r) => s + r.count, 0);
      const openLike = (rows: Array<{ state: string; count: number }>) =>
        rows.filter(r => r.state !== '3' && r.state !== '101').reduce((s, r) => s + r.count, 0);

      return {
        vulnerable_items: { total: total(viByState), open: openLike(viByState), by_state: viByState },
        remediation_tasks: { total: total(rtByState), open: openLike(rtByState), by_state: rtByState },
        top_risk_vulnerable_items: topRisk.records,
        summary:
          `VI: ${total(viByState)} total (${openLike(viByState)} open) · ` +
          `RT: ${total(rtByState)} total (${openLike(rtByState)} open) · ` +
          `top ${topRisk.count} risk VI listed`,
      };
    }

    case 'create_remediation_task': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { short_description: args.short_description };
      for (const f of ['description', 'assignment_group', 'assigned_to', 'cmdb_ci', 'sn_vul_entry', 'state', 'ttr_target_date']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_vul_remediation_task', data);
      return { ...result, summary: `Created Remediation Task: ${args.short_description}` };
    }

    case 'update_remediation_task': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const data: Record<string, any> = {};
      for (const f of ['state', 'assignment_group', 'assigned_to', 'short_description', 'ttr_target_date']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      if (Object.keys(data).length === 0) {
        throw new ServiceNowError('At least one field to update is required', 'INVALID_REQUEST');
      }
      const result = await client.updateRecord('sn_vul_remediation_task', args.sys_id, data);
      return { ...result, summary: `Updated Remediation Task ${args.sys_id}` };
    }

    case 'add_vi_to_remediation_task': {
      requireWrite();
      if (!args.remediation_group || !args.vulnerable_item) {
        throw new ServiceNowError('remediation_group and vulnerable_item are required', 'INVALID_REQUEST');
      }
      const result = await client.createRecord('sn_vul_m2m_vul_group_item', {
        sn_vul_vulnerability: args.remediation_group,
        sn_vul_vulnerable_item: args.vulnerable_item,
      });
      return {
        ...result,
        summary: `Linked VI ${args.vulnerable_item} to remediation group ${args.remediation_group}`,
      };
    }

    default:
      return null;
  }
}
