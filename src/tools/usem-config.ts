/**
 * USEM / Vulnerability Response configuration tools — operate the rule tables
 * that drive automation (assignment, remediation task grouping, TTR targets,
 * approval, auto-close, exclusion).
 *
 * A single rule-type registry maps a friendly `rule_type` to its backing table
 * so one small set of generic tools (list/get/create/update/set_active) covers
 * every rule family without per-table boilerplate.
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true) — these mutate
 * platform automation config, so treat them as admin-level changes.
 *
 * Tables, key fields and schemas verified against a live PDI (dev400464):
 *   assignment         → sn_vul_vgr_assignment_rule   (no name/active fields)
 *   remediation_task   → sn_sec_rem_task_rule         (key: rule_name)
 *   remediation_target → sn_sec_wf_ttr_rule           (key: name; TTR max/remind)
 *   approval           → sn_vul_cmn_approval_rule     (key: name)
 *   auto_close         → sn_vul_cmn_auto_close_rule   (key: name)
 *   exclusion          → sn_vul_cmn_auto_exclusion_rule (key: name)
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

interface RuleType {
  table: string;
  /** Human-readable label for messages. */
  label: string;
  /** Field that holds the rule's display name, if any. */
  nameField?: string;
  /** Whether the table has an `active` boolean (controls filtering + set_active). */
  hasActive: boolean;
  /** Curated comma-separated fields returned by list_usem_rules. */
  listFields: string;
}

const RULE_REGISTRY: Record<string, RuleType> = {
  assignment: {
    table: 'sn_vul_vgr_assignment_rule',
    label: 'Assignment Rule',
    hasActive: false,
    listFields: 'assignment_group,filter_vi,order,table_name,vgr,sys_id',
  },
  remediation_task: {
    table: 'sn_sec_rem_task_rule',
    label: 'Remediation Task Rule',
    nameField: 'rule_name',
    hasActive: true,
    listFields: 'rule_name,active,order,assignment_group,table,condition,sys_id',
  },
  remediation_target: {
    table: 'sn_sec_wf_ttr_rule',
    label: 'Remediation Target Rule',
    nameField: 'name',
    hasActive: true,
    listFields: 'name,active,order,table,ttr_max,ttr_remind,target_from,sys_id',
  },
  approval: {
    table: 'sn_vul_cmn_approval_rule',
    label: 'Approval Rule',
    nameField: 'name',
    hasActive: true,
    listFields: 'name,active,order,table,type,condition,sys_id',
  },
  auto_close: {
    table: 'sn_vul_cmn_auto_close_rule',
    label: 'Auto-Close Rule',
    nameField: 'name',
    hasActive: true,
    listFields: 'name,active,order,table,condition,sys_id',
  },
  exclusion: {
    table: 'sn_vul_cmn_auto_exclusion_rule',
    label: 'Exclusion Rule',
    nameField: 'name',
    hasActive: true,
    listFields: 'name,active,order,table,condition,sys_id',
  },
};

const RULE_TYPES = Object.keys(RULE_REGISTRY);
const SYS_ID_RE = /^[0-9a-f]{32}$/i;

const RULE_TYPE_SCHEMA = {
  type: 'string',
  enum: RULE_TYPES,
  description:
    'Which rule family to operate on: ' +
    'assignment (VR group assignment), remediation_task (sn_sec_rem_task_rule), ' +
    'remediation_target (TTR/SLA targets), approval, auto_close, exclusion',
};

function resolveType(ruleType: unknown): RuleType {
  if (typeof ruleType !== 'string' || !RULE_REGISTRY[ruleType]) {
    throw new ServiceNowError(
      `rule_type must be one of: ${RULE_TYPES.join(', ')}`,
      'INVALID_REQUEST'
    );
  }
  return RULE_REGISTRY[ruleType];
}

export function getUsemConfigToolDefinitions() {
  return [
    {
      name: 'list_usem_rules',
      description:
        'List USEM/Vulnerability Response automation rules of a given type (assignment, ' +
        'remediation_task, remediation_target, approval, auto_close, exclusion). Ordered by ' +
        'execution order. Optionally filter by active state or an extra encoded query.',
      inputSchema: {
        type: 'object',
        properties: {
          rule_type: RULE_TYPE_SCHEMA,
          active: { type: 'boolean', description: 'Filter by active state (ignored for rule types without an active field)' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 50, max: 1000)' },
          display_value: {
            description: 'Return human-readable reference/choice values (true) or both raw and display ("all")',
            oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }],
          },
        },
        required: ['rule_type'],
      },
    },
    {
      name: 'get_usem_rule',
      description: 'Get the full definition of a single USEM/VR rule by sys_id.',
      inputSchema: {
        type: 'object',
        properties: {
          rule_type: RULE_TYPE_SCHEMA,
          sys_id: { type: 'string', description: '32-char sys_id of the rule' },
        },
        required: ['rule_type', 'sys_id'],
      },
    },
    {
      name: 'create_usem_rule',
      description:
        'Create a USEM/VR automation rule. Provide the rule_type and a fields object matching ' +
        'that table (e.g. name/rule_name, active, order, condition, assignment_group, ttr_max). ' +
        '**[Write — requires WRITE_ENABLED=true; admin-level config change]**',
      inputSchema: {
        type: 'object',
        properties: {
          rule_type: RULE_TYPE_SCHEMA,
          fields: { type: 'object', description: 'Column/value map for the new rule record' },
        },
        required: ['rule_type', 'fields'],
      },
    },
    {
      name: 'update_usem_rule',
      description:
        'Update a USEM/VR automation rule by sys_id with a fields object. ' +
        '**[Write — requires WRITE_ENABLED=true; admin-level config change]**',
      inputSchema: {
        type: 'object',
        properties: {
          rule_type: RULE_TYPE_SCHEMA,
          sys_id: { type: 'string', description: '32-char sys_id of the rule' },
          fields: { type: 'object', description: 'Column/value map of changes' },
        },
        required: ['rule_type', 'sys_id', 'fields'],
      },
    },
    {
      name: 'set_usem_rule_active',
      description:
        'Enable or disable a USEM/VR rule (convenience toggle of the active flag). ' +
        'Not supported for the assignment rule type, which has no active field. ' +
        '**[Write — requires WRITE_ENABLED=true; admin-level config change]**',
      inputSchema: {
        type: 'object',
        properties: {
          rule_type: RULE_TYPE_SCHEMA,
          sys_id: { type: 'string', description: '32-char sys_id of the rule' },
          active: { type: 'boolean', description: 'true to enable, false to disable' },
        },
        required: ['rule_type', 'sys_id', 'active'],
      },
    },
  ];
}

export async function executeUsemConfigToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_usem_rules': {
      const rt = resolveType(args.rule_type);
      const parts: string[] = [];
      if (args.active !== undefined && rt.hasActive) parts.push(`active=${args.active === true}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: rt.table,
        query: parts.join('^'),
        fields: rt.listFields,
        orderBy: 'order',
        limit: args.limit ?? 50,
        display_value: args.display_value,
      });
      return {
        rule_type: args.rule_type,
        table: rt.table,
        count: resp.count,
        records: resp.records,
        summary: `Found ${resp.count} ${rt.label}(s)`,
      };
    }

    case 'get_usem_rule': {
      const rt = resolveType(args.rule_type);
      if (!args.sys_id || !SYS_ID_RE.test(args.sys_id)) {
        throw new ServiceNowError('sys_id must be a 32-character hex string', 'INVALID_REQUEST');
      }
      return await client.getRecord(rt.table, args.sys_id);
    }

    case 'create_usem_rule': {
      requireWrite();
      const rt = resolveType(args.rule_type);
      if (!args.fields || typeof args.fields !== 'object' || Object.keys(args.fields).length === 0) {
        throw new ServiceNowError('fields object with at least one column is required', 'INVALID_REQUEST');
      }
      const result = await client.createRecord(rt.table, args.fields);
      const label = rt.nameField ? args.fields[rt.nameField] ?? result.sys_id : result.sys_id;
      return { ...result, rule_type: args.rule_type, summary: `Created ${rt.label}: ${label}` };
    }

    case 'update_usem_rule': {
      requireWrite();
      const rt = resolveType(args.rule_type);
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      if (!args.fields || typeof args.fields !== 'object' || Object.keys(args.fields).length === 0) {
        throw new ServiceNowError('fields object with at least one column is required', 'INVALID_REQUEST');
      }
      const result = await client.updateRecord(rt.table, args.sys_id, args.fields);
      return { ...result, rule_type: args.rule_type, summary: `Updated ${rt.label} ${args.sys_id}` };
    }

    case 'set_usem_rule_active': {
      requireWrite();
      const rt = resolveType(args.rule_type);
      if (!rt.hasActive) {
        throw new ServiceNowError(
          `${rt.label} has no active field; use update_usem_rule instead`,
          'INVALID_REQUEST'
        );
      }
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      if (typeof args.active !== 'boolean') throw new ServiceNowError('active (boolean) is required', 'INVALID_REQUEST');
      const result = await client.updateRecord(rt.table, args.sys_id, { active: args.active });
      return {
        ...result,
        rule_type: args.rule_type,
        summary: `${args.active ? 'Enabled' : 'Disabled'} ${rt.label} ${args.sys_id}`,
      };
    }

    default:
      return null;
  }
}
