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
import { sanitizeLikeValue } from '../servicenow/client.js';
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
        'List USEM Remediation Tasks across BOTH backing tables: sn_vul_remediation_task and ' +
        'sn_vul_vulnerability (the task-based group the rule engine actually creates RTs in — ' +
        'sys_class label "Remediation Task", number prefix VUL). Each record carries a ' +
        '`source_table` marker. Filter by state or assignment group; ordered by descending risk score.',
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
        'Get full details of a single Remediation Task by sys_id or number. Looks in both backing ' +
        'tables: a VUL-prefixed number targets sn_vul_vulnerability (the rule-engine RT), anything ' +
        'else is tried as task_number on sn_vul_remediation_task first, then as number on ' +
        'sn_vul_vulnerability. The result includes a `source_table` marker.',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: {
            type: 'string',
            description: 'RT task_number, VUL number (VULxxxxxxx), or 32-char sys_id',
          },
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
      name: 'create_vulnerability_group',
      description:
        'Create a Vulnerability Group / Remediation Task (sn_vul_vulnerability). Being task-based it ' +
        'accepts assignment_group, assigned_to and state. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Short description / title' },
          description: { type: 'string', description: 'Detailed description' },
          assignment_group: { type: 'string', description: 'Assignment group sys_id' },
          assigned_to: { type: 'string', description: 'Assignee sys_id' },
          state: VUL_STATE_SCHEMA,
          ttr_target_date: { type: 'string', description: 'Remediation target date (YYYY-MM-DD HH:MM:SS)' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'update_vulnerability_group',
      description:
        'Update a Vulnerability Group by sys_id — state transitions, (re)assignment, target date, etc. ' +
        '**[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Vulnerability Group' },
          state: VUL_STATE_SCHEMA,
          assignment_group: { type: 'string', description: 'Assignment group sys_id' },
          assigned_to: { type: 'string', description: 'Assignee sys_id' },
          short_description: { type: 'string', description: 'Updated short description' },
          ttr_target_date: { type: 'string', description: 'Remediation target date (YYYY-MM-DD HH:MM:SS)' },
        },
        required: ['sys_id'],
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
      name: 'create_vulnerable_item',
      description:
        'Create a Vulnerable Item (sn_vul_vulnerable_item) with the vulnerability reference intact. ' +
        'A before business rule clears the `vulnerability` reference on REST inserts, which silently ' +
        'disables the "Link to Remediation Tasks" automation; this tool re-applies the reference via ' +
        'PATCH after insert and verifies it stuck. Requires both `vulnerability` and `cmdb_ci` so the ' +
        'remediation-task rule engine can group the item. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          vulnerability: {
            type: 'string',
            description: '32-char sys_id of the vulnerability entry (sn_vul_entry, e.g. an NVD entry)',
          },
          cmdb_ci: { type: 'string', description: '32-char sys_id of the affected CI' },
          short_description: { type: 'string', description: 'Short description (defaults to a generated one server-side)' },
          description: { type: 'string', description: 'Detailed description' },
          assignment_group: { type: 'string', description: 'Assignment group sys_id' },
          assigned_to: { type: 'string', description: 'Assignee sys_id' },
          state: VUL_STATE_SCHEMA,
          source: { type: 'string', description: 'Detection source label (e.g. scanner name)' },
        },
        required: ['vulnerability', 'cmdb_ci'],
      },
    },
    {
      name: 'list_remediation_task_findings',
      description:
        'List the VI ↔ Remediation Task links in the "Remediation Task Item" m2m ' +
        '(sn_vul_m2m_vul_group_item). Give `remediation_task` (VUL number or sys_id of the ' +
        'sn_vul_vulnerability group) to list its member Vulnerable Items, or `vulnerable_item` ' +
        '(VIT number or sys_id) to list the Remediation Tasks it belongs to. Exactly one of the two.',
      inputSchema: {
        type: 'object',
        properties: {
          remediation_task: {
            type: 'string',
            description: 'Remediation Task / group: VUL number (VULxxxxxxx) or 32-char sys_id (sn_vul_vulnerability)',
          },
          vulnerable_item: {
            type: 'string',
            description: 'Vulnerable Item: VIT number (VITxxxxxxx) or 32-char sys_id',
          },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
        },
      },
    },
    {
      name: 'get_finding_grouping_status',
      description:
        'Diagnose why a Vulnerable Item is (not) grouped into a Remediation Task. Returns the VI\'s ' +
        'grouping preconditions (`vulnerability` and `cmdb_ci` references, `is_in_group`), its m2m ' +
        'links with each task\'s auto_vi_refresh, the active remediation task rules ' +
        '(sn_sec_rem_task_rule), and an ordered diagnosis: empty vulnerability → no active rule → ' +
        'rule/condition mismatch or auto_vi_refresh=false on the existing task.',
      inputSchema: {
        type: 'object',
        properties: {
          vulnerable_item: {
            type: 'string',
            description: 'Vulnerable Item: VIT number (VITxxxxxxx) or 32-char sys_id',
          },
        },
        required: ['vulnerable_item'],
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

/** Unwrap a Table API field value ({ value, link } object or plain string) to its raw value. */
function refValue(value: unknown): string {
  if (value && typeof value === 'object' && 'value' in (value as any)) {
    return String((value as any).value ?? '');
  }
  return value === undefined || value === null ? '' : String(value);
}

/** Resolve a human-readable number (VUL/VIT…) to a sys_id, passing 32-char hex ids through. */
async function resolveSysId(
  client: ServiceNowClient,
  table: string,
  identifier: string,
  label: string
): Promise<string> {
  if (SYS_ID_RE.test(identifier)) return identifier;
  const resp = await client.queryRecords({
    table,
    query: `number=${sanitizeLikeValue(identifier)}`,
    fields: 'sys_id',
    limit: 1,
  });
  if (resp.count === 0) throw new ServiceNowError(`${label} not found: ${identifier}`, 'NOT_FOUND');
  return refValue(resp.records[0].sys_id);
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
      const query = parts.join('^');
      const limit = args.limit ?? 25;
      // The rule engine creates RTs in sn_vul_vulnerability, not sn_vul_remediation_task,
      // so a single-table listing silently hides engine-created tasks — query both.
      const [legacy, groups] = await Promise.all([
        client.queryRecords({
          table: 'sn_vul_remediation_task',
          query,
          fields: RT_FIELDS,
          orderBy: '-risk_score',
          limit,
          display_value: args.display_value,
        }),
        client.queryRecords({
          table: 'sn_vul_vulnerability',
          query,
          fields: VG_FIELDS,
          orderBy: '-risk_score',
          limit,
          display_value: args.display_value,
        }),
      ]);
      const records = [
        ...legacy.records.map(r => ({ ...r, source_table: 'sn_vul_remediation_task' })),
        ...groups.records.map(r => ({ ...r, source_table: 'sn_vul_vulnerability' })),
      ];
      return {
        count: records.length,
        by_table: {
          sn_vul_remediation_task: legacy.count,
          sn_vul_vulnerability: groups.count,
        },
        records,
        summary:
          `Found ${records.length} remediation task(s): ${legacy.count} in sn_vul_remediation_task, ` +
          `${groups.count} in sn_vul_vulnerability (rule-engine created)`,
      };
    }

    case 'get_remediation_task': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      const id = String(args.number_or_sysid);
      if (SYS_ID_RE.test(id)) {
        try {
          const rec = await client.getRecord('sn_vul_remediation_task', id);
          return { ...rec, source_table: 'sn_vul_remediation_task' };
        } catch {
          const rec = await client.getRecord('sn_vul_vulnerability', id);
          return { ...rec, source_table: 'sn_vul_vulnerability' };
        }
      }
      const safeId = sanitizeLikeValue(id);
      const lookups: Array<{ table: string; query: string }> = /^VUL/i.test(id)
        ? [{ table: 'sn_vul_vulnerability', query: `number=${safeId}` }]
        : [
            { table: 'sn_vul_remediation_task', query: `task_number=${safeId}` },
            { table: 'sn_vul_vulnerability', query: `number=${safeId}` },
          ];
      for (const lookup of lookups) {
        const resp = await client.queryRecords({ table: lookup.table, query: lookup.query, limit: 1 });
        if (resp.count > 0) return { ...resp.records[0], source_table: lookup.table };
      }
      throw new ServiceNowError(`Remediation Task not found: ${args.number_or_sysid}`, 'NOT_FOUND');
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

    case 'create_vulnerability_group': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { short_description: args.short_description };
      for (const f of ['description', 'assignment_group', 'assigned_to', 'state', 'ttr_target_date']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_vul_vulnerability', data);
      return { ...result, summary: `Created Vulnerability Group: ${args.short_description}` };
    }

    case 'update_vulnerability_group': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const data: Record<string, any> = {};
      for (const f of ['state', 'assignment_group', 'assigned_to', 'short_description', 'ttr_target_date']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      if (Object.keys(data).length === 0) {
        throw new ServiceNowError('At least one field to update is required', 'INVALID_REQUEST');
      }
      const result = await client.updateRecord('sn_vul_vulnerability', args.sys_id, data);
      return { ...result, summary: `Updated Vulnerability Group ${args.sys_id}` };
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

    case 'create_vulnerable_item': {
      requireWrite();
      if (!args.vulnerability || !args.cmdb_ci) {
        throw new ServiceNowError('vulnerability and cmdb_ci are required', 'INVALID_REQUEST');
      }
      if (!SYS_ID_RE.test(args.vulnerability) || !SYS_ID_RE.test(args.cmdb_ci)) {
        throw new ServiceNowError('vulnerability and cmdb_ci must be 32-char sys_ids', 'INVALID_REQUEST');
      }
      const data: Record<string, any> = { vulnerability: args.vulnerability, cmdb_ci: args.cmdb_ci };
      for (const f of ['short_description', 'description', 'assignment_group', 'assigned_to', 'state', 'source']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const created = await client.createRecord('sn_vul_vulnerable_item', data);
      const sysId = refValue(created.sys_id);

      // A before BR clears `vulnerability` on REST inserts (verified on PDI); without it the
      // "Link to Remediation Tasks" BR never fires. Re-apply via PATCH — PATCHed values persist.
      let record = created;
      let restored = false;
      if (refValue(created.vulnerability) !== args.vulnerability) {
        record = await client.updateRecord('sn_vul_vulnerable_item', sysId, { vulnerability: args.vulnerability });
        restored = refValue(record.vulnerability) === args.vulnerability;
        if (!restored) {
          return {
            ...record,
            vulnerability_set: false,
            warning:
              `VI ${refValue(record.number) || sysId} was created but the vulnerability reference ` +
              'could not be re-applied (cleared again after PATCH). Remediation-task grouping will not ' +
              'trigger for this item — check business rules on sn_vul_vulnerable_item.',
            summary: `Created VI ${refValue(record.number) || sysId} (vulnerability reference NOT set)`,
          };
        }
      }
      return {
        ...record,
        vulnerability_set: true,
        vulnerability_restored_via_patch: restored,
        summary:
          `Created VI ${refValue(record.number) || sysId} with vulnerability reference intact` +
          (restored ? ' (re-applied via PATCH after the insert BR cleared it)' : ''),
      };
    }

    case 'list_remediation_task_findings': {
      const hasRt = !!args.remediation_task;
      const hasVi = !!args.vulnerable_item;
      if (hasRt === hasVi) {
        throw new ServiceNowError(
          'Provide exactly one of remediation_task or vulnerable_item',
          'INVALID_REQUEST'
        );
      }
      if (hasRt) {
        const rtId = await resolveSysId(client, 'sn_vul_vulnerability', args.remediation_task, 'Remediation Task');
        const resp = await client.queryRecords({
          table: 'sn_vul_m2m_vul_group_item',
          query: `sn_vul_vulnerability=${rtId}`,
          fields:
            'sys_id,sn_vul_vulnerable_item,sn_vul_vulnerable_item.number,' +
            'sn_vul_vulnerable_item.short_description,sn_vul_vulnerable_item.state,' +
            'sn_vul_vulnerable_item.risk_score,sn_vul_vulnerable_item.cmdb_ci',
          limit: args.limit ?? 25,
          display_value: 'all',
        });
        return {
          direction: 'remediation_task_to_vulnerable_items',
          remediation_task: rtId,
          count: resp.count,
          records: resp.records,
          summary: `Remediation Task ${args.remediation_task} has ${resp.count} linked vulnerable item(s)`,
        };
      }
      const viId = await resolveSysId(client, 'sn_vul_vulnerable_item', args.vulnerable_item, 'Vulnerable Item');
      const resp = await client.queryRecords({
        table: 'sn_vul_m2m_vul_group_item',
        query: `sn_vul_vulnerable_item=${viId}`,
        fields:
          'sys_id,sn_vul_vulnerability,sn_vul_vulnerability.number,' +
          'sn_vul_vulnerability.short_description,sn_vul_vulnerability.state,' +
          'sn_vul_vulnerability.risk_score,sn_vul_vulnerability.auto_vi_refresh',
        limit: args.limit ?? 25,
        display_value: 'all',
      });
      return {
        direction: 'vulnerable_item_to_remediation_tasks',
        vulnerable_item: viId,
        count: resp.count,
        records: resp.records,
        summary: `Vulnerable Item ${args.vulnerable_item} belongs to ${resp.count} remediation task(s)`,
      };
    }

    case 'get_finding_grouping_status': {
      if (!args.vulnerable_item) throw new ServiceNowError('vulnerable_item is required', 'INVALID_REQUEST');
      const viId = await resolveSysId(client, 'sn_vul_vulnerable_item', args.vulnerable_item, 'Vulnerable Item');

      const [viResp, linksResp, rulesResp] = await Promise.all([
        client.queryRecords({
          table: 'sn_vul_vulnerable_item',
          query: `sys_id=${viId}`,
          fields: 'number,state,substate,vulnerability,cmdb_ci,is_in_group,risk_score,source,sys_id',
          limit: 1,
          display_value: 'all',
        }),
        client.queryRecords({
          table: 'sn_vul_m2m_vul_group_item',
          query: `sn_vul_vulnerable_item=${viId}`,
          fields:
            'sys_id,sn_vul_vulnerability,sn_vul_vulnerability.number,sn_vul_vulnerability.state,' +
            'sn_vul_vulnerability.auto_vi_refresh,sn_vul_vulnerability.short_description',
          limit: 100,
          display_value: 'all',
        }),
        client.queryRecords({
          table: 'sn_sec_rem_task_rule',
          query: 'active=true',
          fields: 'rule_name,active,order,table,condition,field_1,sys_id',
          orderBy: 'order',
          limit: 100,
        }),
      ]);
      if (viResp.count === 0) throw new ServiceNowError(`Vulnerable Item not found: ${args.vulnerable_item}`, 'NOT_FOUND');
      const vi = viResp.records[0];

      const vulnerabilitySet = refValue(vi.vulnerability) !== '';
      const cmdbCiSet = refValue(vi.cmdb_ci) !== '';
      const isInGroup = refValue(vi.is_in_group) === 'true';
      const links = linksResp.records;
      const staleRefreshTasks = links.filter(l => refValue((l as any)['sn_vul_vulnerability.auto_vi_refresh']) !== 'true');

      // Ordered first-failure diagnosis, mirroring how the grouping engine short-circuits.
      const diagnosis: string[] = [];
      let status: string;
      if (links.length > 0) {
        status = 'grouped';
        diagnosis.push(`Grouped: member of ${links.length} remediation task(s).`);
        if (!isInGroup) diagnosis.push('Note: is_in_group=false despite m2m links — the flag may lag or the link was created manually.');
      } else if (!vulnerabilitySet) {
        status = 'blocked_no_vulnerability';
        diagnosis.push(
          'The `vulnerability` reference is empty, so the "Link to Remediation Tasks" automation can never fire ' +
          '(its condition requires both cmdb_ci and vulnerability). REST inserts get this reference cleared by a ' +
          'before business rule — re-apply it with a PATCH or recreate the VI via create_vulnerable_item.'
        );
      } else if (!cmdbCiSet) {
        status = 'blocked_no_cmdb_ci';
        diagnosis.push('The `cmdb_ci` reference is empty; the grouping automation requires both cmdb_ci and vulnerability.');
      } else if (rulesResp.count === 0) {
        status = 'blocked_no_active_rules';
        diagnosis.push('No active remediation task rules (sn_sec_rem_task_rule) exist, so nothing can group this VI.');
      } else {
        status = 'not_grouped_rule_mismatch_or_not_triggered';
        diagnosis.push(
          `Preconditions look fine (vulnerability + cmdb_ci set, ${rulesResp.count} active rule(s)) but the VI is not ` +
          'in any remediation task. Check: (1) whether an active rule\'s condition actually matches this VI, ' +
          '(2) the automation only evaluates on insert/update — REST-origin inserts have not been observed to ' +
          'trigger it on this instance, and (3) joining an EXISTING task additionally requires that task to have ' +
          'auto_vi_refresh=true. A UI-side update of the VI can re-trigger evaluation.'
        );
      }
      if (staleRefreshTasks.length > 0 && links.length > 0) {
        diagnosis.push(
          `${staleRefreshTasks.length} linked task(s) have auto_vi_refresh=false — new VIs with the same group key ` +
          'will NOT auto-join them.'
        );
      }

      return {
        status,
        vulnerable_item: vi,
        checks: {
          vulnerability_set: vulnerabilitySet,
          cmdb_ci_set: cmdbCiSet,
          is_in_group: isInGroup,
        },
        linked_remediation_tasks: links,
        active_remediation_task_rules: rulesResp.records,
        diagnosis,
        summary: `VI ${refValue(vi.number) || args.vulnerable_item}: ${status} — ${diagnosis[0]}`,
      };
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
