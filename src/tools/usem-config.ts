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
 *   assignment         → sn_sec_wf_assign_rule        (USEM; key: name, has active)
 *   remediation_task   → sn_sec_rem_task_rule         (key: rule_name)
 *   remediation_target → sn_sec_wf_ttr_rule           (key: name; TTR max/remind)
 *   risk_calculator    → sn_sec_calculator_group      (key: name; no order field)
 *   calculator_rule    → sn_sec_calculator_rule       (key: name; per-calculator rule)
 *   classification     → sn_sec_wf_classification_group (extends calculator_group; no order)
 *   classification_rule→ sn_sec_wf_classification_rule  (extends calculator_rule)
 *   exception_rule     → sn_sec_exception_rule        (key: name; state via rule_state/stage, no active)
 *   rollup             → sn_sec_wf_rollup_config      (key: name; score rollup weights)
 *   exception_config   → sn_sec_exception_config      (per-app exception mgmt settings, no active/order)
 *   calculator_config  → sn_sec_calculator_config     (key/value calculator settings, no active/order)
 *   risk_field         → sn_sec_calculator_risk_field (weighted score inputs; parent ref
 *                        `risk_calculator` points at sn_sec_calculator_rule, NOT the group)
 *   risk_score_weight  → sn_sec_calculator_risk_score_weight (score→weight bands per table)
 *   approval           → sn_vul_cmn_approval_rule     (key: name)
 *   auto_close         → sn_vul_cmn_auto_close_rule   (key: name)
 *   exclusion          → sn_vul_cmn_auto_exclusion_rule (key: name)
 *
 * Migration note (KB2556844): USEM moved assignment/calculator/classification/
 * exception config from the deprecated sn_vul_ and sn_vulc_ tables to sn_sec_.
 * The legacy sn_vul_assignment_rule table no longer exists post-migration, and
 * sn_vul_vgr_assignment_rule holds no records — the live assignment rules are in
 * sn_sec_wf_assign_rule, which is what `assignment` now targets.
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
  /** Field to order list results by (default 'order'; some tables lack it). */
  orderField?: string;
  /** Curated comma-separated fields returned by list_usem_rules. */
  listFields: string;
}

const RULE_REGISTRY: Record<string, RuleType> = {
  assignment: {
    table: 'sn_sec_wf_assign_rule',
    label: 'Assignment Rule',
    nameField: 'name',
    hasActive: true,
    listFields: 'name,active,order,table,assignment_group,condition,type,sys_id',
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
  risk_calculator: {
    table: 'sn_sec_calculator_group',
    label: 'Risk Calculator',
    nameField: 'name',
    hasActive: true,
    orderField: 'name', // no order column on this table
    listFields: 'name,active,table,target_field,description,sys_id',
  },
  calculator_rule: {
    table: 'sn_sec_calculator_rule',
    label: 'Risk Calculator Rule',
    nameField: 'name',
    hasActive: true,
    listFields: 'name,active,order,calculator_group,table,condition,value_type,sys_id',
  },
  classification: {
    table: 'sn_sec_wf_classification_group',
    label: 'Classification Group',
    nameField: 'name',
    hasActive: true,
    orderField: 'name', // extends sn_sec_calculator_group, which has no order column
    listFields: 'name,active,table,target_field,sys_id',
  },
  classification_rule: {
    table: 'sn_sec_wf_classification_rule',
    label: 'Classification Rule',
    nameField: 'name',
    hasActive: true,
    listFields: 'name,active,order,classification,classification_type,table,condition,sys_id',
  },
  exception_rule: {
    table: 'sn_sec_exception_rule',
    label: 'Exception Rule',
    nameField: 'name',
    hasActive: false, // lifecycle is rule_state/stage, not an active flag
    listFields: 'name,order,table,rule_state,stage,condition,applies_to,sys_id',
  },
  rollup: {
    table: 'sn_sec_wf_rollup_config',
    label: 'Rollup Config',
    nameField: 'name',
    hasActive: true,
    listFields:
      'name,active,order,table,target_field,applies_to,item_condition,' +
      'average_score_weight,max_score_weight,item_count_weight,description,sys_id',
  },
  exception_config: {
    table: 'sn_sec_exception_config',
    label: 'Exception Management Configuration',
    nameField: 'exception_config',
    hasActive: false,
    orderField: 'table', // no order column; one config per application/table
    listFields: 'exception_config,select_exception,table,request_exception_beyond,role,policy_installed,sys_id',
  },
  calculator_config: {
    table: 'sn_sec_calculator_config',
    label: 'Calculator Configuration',
    nameField: 'key',
    hasActive: false,
    orderField: 'key', // key/value settings, no order column
    listFields: 'key,value,table,description,sys_id',
  },
  risk_field: {
    table: 'sn_sec_calculator_risk_field',
    label: 'Risk Rule Field',
    nameField: 'field_label',
    hasActive: false,
    orderField: 'field_label', // no order column
    listFields: 'field_label,field,table,weight,aggregation,computed_weight,risk_calculator,sys_id',
  },
  risk_score_weight: {
    table: 'sn_sec_calculator_risk_score_weight',
    label: 'Risk Score Weight',
    hasActive: false,
    orderField: 'value', // bands keyed by score value, no name/order columns
    listFields: 'table,value,weight,sys_id',
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
    'assignment (sn_sec_wf_assign_rule), remediation_task, remediation_target (TTR/SLA targets), ' +
    'risk_calculator + calculator_rule + risk_field + risk_score_weight + calculator_config (risk scoring), ' +
    'classification + classification_rule, exception_rule + exception_config, rollup (score rollup), ' +
    'approval, auto_close, exclusion',
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
        'List USEM/Vulnerability Response automation rules and configs of a given type (assignment, ' +
        'remediation_task, remediation_target, risk_calculator, calculator_rule, risk_field, ' +
        'risk_score_weight, calculator_config, classification, classification_rule, exception_rule, ' +
        'exception_config, rollup, approval, auto_close, exclusion). Ordered by execution order. ' +
        'Optionally filter by active state or an extra encoded query.',
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
    {
      name: 'get_risk_calculator_details',
      description:
        'Explain how a USEM Risk Calculator computes its score: returns the calculator group ' +
        '(sn_sec_calculator_group), its calculator rules, each rule’s weighted risk fields ' +
        '(sn_sec_calculator_risk_field), and the score→weight bands for the target table ' +
        '(sn_sec_calculator_risk_score_weight) in one call. Use this to answer "why is the risk ' +
        'score N?". Accepts a sys_id or exact calculator name.',
      inputSchema: {
        type: 'object',
        properties: {
          calculator: {
            type: 'string',
            description: 'sys_id or exact name of the risk calculator (sn_sec_calculator_group)',
          },
        },
        required: ['calculator'],
      },
    },
  ];
}

/** Table API records may be raw strings or {value, display_value} objects. */
function fieldValue(v: unknown): string {
  if (v && typeof v === 'object') return String((v as { value?: unknown }).value ?? '');
  return v == null ? '' : String(v);
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
        orderBy: rt.orderField ?? 'order',
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

    case 'get_risk_calculator_details': {
      const key = args.calculator;
      if (!key || typeof key !== 'string') {
        throw new ServiceNowError('calculator (sys_id or exact name) is required', 'INVALID_REQUEST');
      }
      let group: Record<string, any>;
      if (SYS_ID_RE.test(key)) {
        group = await client.getRecord('sn_sec_calculator_group', key);
      } else {
        const resp = await client.queryRecords({
          table: 'sn_sec_calculator_group',
          query: `name=${key.replace(/[\^]/g, '')}`,
          limit: 1,
        });
        if (resp.count === 0) {
          throw new ServiceNowError(`Risk calculator not found: ${key}`, 'NOT_FOUND');
        }
        group = resp.records[0];
      }
      const groupId = fieldValue(group.sys_id);
      const targetTable = fieldValue(group.table);
      const rulesResp = await client.queryRecords({
        table: 'sn_sec_calculator_rule',
        query: `calculator_group=${groupId}`,
        fields: RULE_REGISTRY.calculator_rule.listFields,
        orderBy: 'order',
        limit: 200,
      });
      // risk_field.risk_calculator references sn_sec_calculator_rule (the rule, not the group)
      const ruleIds = rulesResp.records.map((r: Record<string, any>) => fieldValue(r.sys_id)).filter(Boolean);
      const [fieldsResp, weightsResp] = await Promise.all([
        ruleIds.length > 0
          ? client.queryRecords({
              table: 'sn_sec_calculator_risk_field',
              query: `risk_calculatorIN${ruleIds.join(',')}`,
              fields: RULE_REGISTRY.risk_field.listFields + ',weight_breakdown',
              orderBy: 'field_label',
              limit: 400,
            })
          : Promise.resolve({ count: 0, records: [] as Record<string, any>[] }),
        targetTable
          ? client.queryRecords({
              table: 'sn_sec_calculator_risk_score_weight',
              query: `table=${targetTable}`,
              fields: RULE_REGISTRY.risk_score_weight.listFields,
              orderBy: 'value',
              limit: 200,
            })
          : Promise.resolve({ count: 0, records: [] as Record<string, any>[] }),
      ]);
      return {
        calculator: group,
        rules: rulesResp.records,
        risk_fields: fieldsResp.records,
        score_weights: weightsResp.records,
        summary:
          `Risk calculator "${fieldValue(group.name) || groupId}" (table: ${targetTable || 'n/a'}) has ` +
          `${rulesResp.count} rule(s), ${fieldsResp.count} weighted risk field(s), and ` +
          `${weightsResp.count} score weight band(s)`,
      };
    }

    default:
      return null;
  }
}
