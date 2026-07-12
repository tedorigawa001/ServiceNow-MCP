/**
 * GRC — Policy and Compliance Management tools. Covers Entities (Profiles),
 * Policies, Controls, Control Objectives (Policy Statements), Policy
 * Exceptions, and Issues.
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 *
 * Tables verified against a live PDI (dev400464, 2026-07-12) — see
 * docs/GRC_DESIGN.md for the full investigation. Key findings baked into
 * this file:
 *   - sn_grc_profile   (Entity)   — NO number/state field; identify by sys_id
 *       or name. `profile_class` references sn_grc_profile_class (18 seeded
 *       classes e.g. "Business Unit", "Vendor", "Application") — NOT
 *       sn_grc_profile_type, a separate unrelated table.
 *   - sn_compliance_policy            — number prefix POL, string state
 *       choices (draft/review/awaiting_approval/published/retired).
 *   - sn_compliance_control           — number prefix CTRL, string state
 *       choices (draft/attest/review/monitor/retired). `profile` ref links
 *       a control to the Entity it protects.
 *   - sn_compliance_policy_statement  (Control Objective) — NO number field,
 *       string state choices (draft/review/approved/published/retired).
 *   - sn_compliance_policy_exception  — number prefix PER, NUMERIC state
 *       choices (1=New … 8=Approved, 7=Rejected) — different shape from the
 *       three tables above.
 *   - sn_grc_issue                    — number prefix IPT (subclass of
 *       planned_task), numeric state choices (0=Review, 1=New, 2=Analyze,
 *       3=Closed Complete, 4=Closed Incomplete, 5=Respond). `issue_source`
 *       is a glide_list against sn_grc_choice (populated), NOT the empty
 *       sn_grc_issue_source table.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { sanitizeLikeValue } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;
const queryValue = (value: unknown): string => sanitizeLikeValue(String(value));

// ── Entity (sn_grc_profile) ─────────────────────────────────────────────
const ENTITY_FIELDS = new Set(['name', 'description', 'profile_class', 'owned_by', 'cmdb_ci', 'framework', 'functional_domain']);
const ENTITY_LIST_FIELDS = 'name,description,profile_class,owned_by,compliance_score,cmdb_ci,sys_id';

// ── Policy (sn_compliance_policy) ───────────────────────────────────────
const POLICY_STATE_SCHEMA = {
  type: 'string',
  description: 'State filter: draft, review, awaiting_approval, published, retired',
};
const POLICY_FIELDS = new Set(['name', 'description', 'state', 'policy_category', 'category', 'classification', 'owner', 'owning_group', 'kb_knowledge_base', 'approval_method', 'audience', 'valid_from', 'valid_to']);
const POLICY_LIST_FIELDS = 'number,name,description,state,policy_category,owner,compliance_score,sys_id';

// ── Control (sn_compliance_control) ─────────────────────────────────────
const CONTROL_STATE_SCHEMA = {
  type: 'string',
  description: 'State filter: draft, attest, review, monitor, retired',
};
const CONTROL_FIELDS = new Set(['name', 'description', 'state', 'category', 'classification', 'key_control', 'frequency', 'assessment_method', 'enforcement', 'owner', 'owning_group', 'profile', 'supplemental_guidance', 'discussion', 'implementation_statement']);
const CONTROL_LIST_FIELDS = 'number,name,description,state,category,key_control,profile,owner,failed_indicators,passed_indicators,sys_id';

// ── Control Objective (sn_compliance_policy_statement) — read-only for now ──
const CONTROL_OBJECTIVE_STATE_SCHEMA = {
  type: 'string',
  description: 'State filter: draft, review, approved, published, retired',
};
const CONTROL_OBJECTIVE_LIST_FIELDS = 'name,description,state,category,authority_section,compliance_score,sys_id';

// ── Policy Exception (sn_compliance_policy_exception) — read-only for now ──
const EXCEPTION_STATE_LABELS: Record<string, string> = {
  '1': 'New', '2': 'Analyze', '10': 'Risk Assessment', '12': 'Review',
  '6': 'Awaiting Approval', '8': 'Approved', '7': 'Rejected', '3': 'Closed',
};
const EXCEPTION_STATE_SCHEMA = {
  type: 'string',
  description: 'State filter. Single value or comma-separated list: 1=New, 2=Analyze, 10=Risk Assessment, 12=Review, 6=Awaiting Approval, 8=Approved, 7=Rejected, 3=Closed',
};
const EXCEPTION_LIST_FIELDS = 'number,short_description,state,policy,policy_statement,risk_rating,requested_valid_to,valid_to,sys_id';

// ── Issue (sn_grc_issue) ─────────────────────────────────────────────────
const ISSUE_STATE_LABELS: Record<string, string> = {
  '0': 'Review', '1': 'New', '2': 'Analyze', '5': 'Respond', '3': 'Closed Complete', '4': 'Closed Incomplete',
};
const ISSUE_STATE_SCHEMA = {
  type: 'string',
  description: 'State filter. Single value or comma-separated list: 0=Review, 1=New, 2=Analyze, 5=Respond, 3=Closed Complete, 4=Closed Incomplete',
};
const ISSUE_FIELDS = new Set(['short_description', 'description', 'state', 'profile', 'issue_type', 'issue_source', 'classification', 'impact', 'urgency', 'assignment_group', 'assigned_to', 'due_date', 'action_plan', 'recommendation', 'close_notes']);
const ISSUE_LIST_FIELDS = 'number,short_description,state,profile,issue_type,classification,impact,urgency,assignment_group,sys_id';

/** Build a `state=` / `stateIN` clause from a single value or comma list. */
function stateClause(state: unknown): string | undefined {
  if (state === undefined || state === null || state === '') return undefined;
  const values = String(state).split(',').map(s => s.trim()).filter(Boolean);
  if (values.length === 0) return undefined;
  return values.length === 1 ? `state=${queryValue(values[0])}` : `stateIN${values.map(queryValue).join(',')}`;
}

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

function allowedFieldsSchema(allowedFields: Set<string>, description: string): Record<string, any> {
  return {
    type: 'object',
    description,
    properties: Object.fromEntries([...allowedFields].map(field => [field, {}])),
    additionalProperties: false,
  };
}

function assertAllowedFields(label: string, fields: Record<string, any>, allowedFields: Set<string>): void {
  const unsafeFields = Object.keys(fields).filter(field => !allowedFields.has(field));
  if (unsafeFields.length) {
    throw new ServiceNowError(
      `${label} fields cannot be set: ${unsafeFields.join(', ')}. Allowed fields: ${[...allowedFields].join(', ')}`,
      'VALIDATION_ERROR'
    );
  }
}

export function getGrcComplianceToolDefinitions() {
  return [
    // ── Entity ──────────────────────────────────────────────────────────
    {
      name: 'list_grc_entities',
      description:
        'List GRC Entities (sn_grc_profile) — the "thing being assessed" (business unit, vendor, ' +
        'application, process, etc.). No number/state field on this table; filter by class or CI.',
      inputSchema: {
        type: 'object',
        properties: {
          profile_class: { type: 'string', description: 'Filter by Entity class sys_id (sn_grc_profile_class)' },
          cmdb_ci: { type: 'string', description: 'Filter by linked CMDB CI sys_id' },
          name: { type: 'string', description: 'Filter by name (LIKE match)' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_grc_entity',
      description: 'Get full details of a single GRC Entity by sys_id.',
      inputSchema: {
        type: 'object',
        properties: { sys_id: { type: 'string', description: '32-char sys_id of the Entity' } },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_grc_entity',
      description:
        'Create a GRC Entity (sn_grc_profile). `profile_class` must be a valid sys_id from ' +
        'sn_grc_profile_class (e.g. Business Unit, Vendor, Application — use list_grc_entities with no ' +
        'filter or query_records on sn_grc_profile_class to discover valid classes). ' +
        '**[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Entity name' },
          profile_class: { type: 'string', description: '32-char sys_id of the Entity class (sn_grc_profile_class)' },
          owned_by: { type: 'string', description: 'sys_id of the owning user' },
          description: { type: 'string' },
          cmdb_ci: { type: 'string', description: 'sys_id of the linked CMDB CI, if any' },
          framework: { type: 'string' },
          functional_domain: { type: 'string' },
        },
        required: ['name', 'profile_class'],
      },
    },
    {
      name: 'update_grc_entity',
      description: 'Update a GRC Entity by sys_id. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Entity' },
          fields: allowedFieldsSchema(ENTITY_FIELDS, `Allowed fields: ${[...ENTITY_FIELDS].join(', ')}`),
        },
        required: ['sys_id', 'fields'],
      },
    },

    // ── Policy ──────────────────────────────────────────────────────────
    {
      name: 'list_compliance_policies',
      description: 'List Compliance Policies (sn_compliance_policy). Filter by state or category.',
      inputSchema: {
        type: 'object',
        properties: {
          state: POLICY_STATE_SCHEMA,
          category: { type: 'string' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_compliance_policy',
      description: 'Get full details of a single Compliance Policy by sys_id or number (e.g. "POL0010200").',
      inputSchema: {
        type: 'object',
        properties: { number_or_sysid: { type: 'string', description: 'Policy number (POLxxxxxxx) or 32-char sys_id' } },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'create_compliance_policy',
      description: 'Create a Compliance Policy (sn_compliance_policy). **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          policy_category: { type: 'string' },
          category: { type: 'string' },
          owner: { type: 'string', description: 'sys_id of the policy owner' },
          owning_group: { type: 'string', description: 'sys_id of the owning group' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_compliance_policy',
      description: 'Update a Compliance Policy by sys_id. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Policy' },
          fields: allowedFieldsSchema(POLICY_FIELDS, `Allowed fields: ${[...POLICY_FIELDS].join(', ')}`),
        },
        required: ['sys_id', 'fields'],
      },
    },

    // ── Control ─────────────────────────────────────────────────────────
    {
      name: 'list_compliance_controls',
      description: 'List Compliance Controls (sn_compliance_control). Filter by state, category, or the Entity (profile) it protects.',
      inputSchema: {
        type: 'object',
        properties: {
          state: CONTROL_STATE_SCHEMA,
          category: { type: 'string' },
          profile: { type: 'string', description: 'Filter by protected Entity sys_id (sn_grc_profile)' },
          key_control: { type: 'boolean', description: 'Filter to key controls only' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_compliance_control',
      description: 'Get full details of a single Compliance Control by sys_id or number (e.g. "CTRL0020012").',
      inputSchema: {
        type: 'object',
        properties: { number_or_sysid: { type: 'string', description: 'Control number (CTRLxxxxxxx) or 32-char sys_id' } },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'create_compliance_control',
      description: 'Create a Compliance Control (sn_compliance_control). **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          key_control: { type: 'boolean' },
          frequency: { type: 'string' },
          profile: { type: 'string', description: 'sys_id of the Entity this control protects' },
          owner: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_compliance_control',
      description: 'Update a Compliance Control by sys_id. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Control' },
          fields: allowedFieldsSchema(CONTROL_FIELDS, `Allowed fields: ${[...CONTROL_FIELDS].join(', ')}`),
        },
        required: ['sys_id', 'fields'],
      },
    },

    // ── Control Objective (read-only) ──────────────────────────────────
    {
      name: 'list_control_objectives',
      description:
        'List Control Objectives (sn_compliance_policy_statement) — sits between Policy and Control. ' +
        'No number field on this table; filter by state or category.',
      inputSchema: {
        type: 'object',
        properties: {
          state: CONTROL_OBJECTIVE_STATE_SCHEMA,
          category: { type: 'string' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_control_objective',
      description: 'Get full details of a single Control Objective by sys_id.',
      inputSchema: {
        type: 'object',
        properties: { sys_id: { type: 'string', description: '32-char sys_id of the Control Objective' } },
        required: ['sys_id'],
      },
    },

    // ── Policy Exception (read-only) ───────────────────────────────────
    {
      name: 'list_policy_exceptions',
      description: 'List Policy Exceptions (sn_compliance_policy_exception). Filter by state.',
      inputSchema: {
        type: 'object',
        properties: {
          state: EXCEPTION_STATE_SCHEMA,
          policy: { type: 'string', description: 'Filter by related Policy sys_id' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_policy_exception',
      description: 'Get full details of a single Policy Exception by sys_id or number (e.g. "PER0000106").',
      inputSchema: {
        type: 'object',
        properties: { number_or_sysid: { type: 'string', description: 'Exception number (PERxxxxxxx) or 32-char sys_id' } },
        required: ['number_or_sysid'],
      },
    },

    // ── Issue ───────────────────────────────────────────────────────────
    {
      name: 'list_grc_issues',
      description:
        'List GRC Issues (sn_grc_issue) — the generic finding/gap record used for compliance gaps and ' +
        'audit findings. Filter by state, Entity, or classification.',
      inputSchema: {
        type: 'object',
        properties: {
          state: ISSUE_STATE_SCHEMA,
          profile: { type: 'string', description: 'Filter by related Entity sys_id' },
          classification: { type: 'string' },
          assignment_group: { type: 'string' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_grc_issue',
      description: 'Get full details of a single GRC Issue by sys_id or number (e.g. "IPT0011010").',
      inputSchema: {
        type: 'object',
        properties: { number_or_sysid: { type: 'string', description: 'Issue number (IPTxxxxxxx) or 32-char sys_id' } },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'create_grc_issue',
      description: 'Create a GRC Issue (sn_grc_issue). **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string' },
          description: { type: 'string' },
          profile: { type: 'string', description: 'sys_id of the related Entity' },
          issue_type: { type: 'string' },
          classification: { type: 'string' },
          impact: { type: 'number' },
          urgency: { type: 'number' },
          assignment_group: { type: 'string' },
        },
        required: ['short_description'],
      },
    },
    {
      name: 'update_grc_issue',
      description: 'Update a GRC Issue by sys_id. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Issue' },
          fields: allowedFieldsSchema(ISSUE_FIELDS, `Allowed fields: ${[...ISSUE_FIELDS].join(', ')}`),
        },
        required: ['sys_id', 'fields'],
      },
    },

    // ── Dashboard ───────────────────────────────────────────────────────
    {
      name: 'get_grc_compliance_dashboard',
      description:
        'Summarize the Compliance posture: Policy/Control/Issue counts by state, and the highest-risk ' +
        'open Policy Exceptions.',
      inputSchema: {
        type: 'object',
        properties: { top: { type: 'number', description: 'How many top exceptions to include (default: 5, max: 50)' } },
      },
    },
  ];
}

export async function executeGrcComplianceToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // ── Entity ────────────────────────────────────────────────────────
    case 'list_grc_entities': {
      const parts: string[] = [];
      if (args.profile_class) parts.push(`profile_class=${queryValue(args.profile_class)}`);
      if (args.cmdb_ci) parts.push(`cmdb_ci=${queryValue(args.cmdb_ci)}`);
      if (args.name) parts.push(`nameLIKE${queryValue(args.name)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_grc_profile',
        query: parts.join('^'),
        fields: ENTITY_LIST_FIELDS,
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} GRC entity/entities` };
    }
    case 'get_grc_entity': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sn_grc_profile', args.sys_id);
    }
    case 'create_grc_entity': {
      requireWrite();
      if (!args.name || !args.profile_class) throw new ServiceNowError('name and profile_class are required', 'INVALID_REQUEST');
      const data: Record<string, any> = { name: args.name, profile_class: args.profile_class };
      for (const f of ['owned_by', 'description', 'cmdb_ci', 'framework', 'functional_domain']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_grc_profile', data);
      return { ...result, summary: `Created GRC Entity: ${args.name}` };
    }
    case 'update_grc_entity': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      assertAllowedFields('Entity', args.fields, ENTITY_FIELDS);
      const result = await client.updateRecord('sn_grc_profile', args.sys_id, args.fields);
      return { ...result, summary: `Updated GRC Entity ${args.sys_id}` };
    }

    // ── Policy ────────────────────────────────────────────────────────
    case 'list_compliance_policies': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.category) parts.push(`category=${queryValue(args.category)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_compliance_policy',
        query: parts.join('^'),
        fields: POLICY_LIST_FIELDS,
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} compliance polic${resp.count === 1 ? 'y' : 'ies'}` };
    }
    case 'get_compliance_policy': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) return await client.getRecord('sn_compliance_policy', args.number_or_sysid);
      const resp = await client.queryRecords({ table: 'sn_compliance_policy', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Compliance Policy not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_compliance_policy': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { name: args.name };
      for (const f of ['description', 'policy_category', 'category', 'owner', 'owning_group']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_compliance_policy', data);
      return { ...result, summary: `Created Compliance Policy: ${args.name}` };
    }
    case 'update_compliance_policy': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      assertAllowedFields('Policy', args.fields, POLICY_FIELDS);
      const result = await client.updateRecord('sn_compliance_policy', args.sys_id, args.fields);
      return { ...result, summary: `Updated Compliance Policy ${args.sys_id}` };
    }

    // ── Control ───────────────────────────────────────────────────────
    case 'list_compliance_controls': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.category) parts.push(`category=${queryValue(args.category)}`);
      if (args.profile) parts.push(`profile=${queryValue(args.profile)}`);
      if (args.key_control !== undefined) parts.push(`key_control=${args.key_control ? 'true' : 'false'}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_compliance_control',
        query: parts.join('^'),
        fields: CONTROL_LIST_FIELDS,
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} compliance control(s)` };
    }
    case 'get_compliance_control': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) return await client.getRecord('sn_compliance_control', args.number_or_sysid);
      const resp = await client.queryRecords({ table: 'sn_compliance_control', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Compliance Control not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_compliance_control': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { name: args.name };
      for (const f of ['description', 'category', 'key_control', 'frequency', 'profile', 'owner']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_compliance_control', data);
      return { ...result, summary: `Created Compliance Control: ${args.name}` };
    }
    case 'update_compliance_control': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      assertAllowedFields('Control', args.fields, CONTROL_FIELDS);
      const result = await client.updateRecord('sn_compliance_control', args.sys_id, args.fields);
      return { ...result, summary: `Updated Compliance Control ${args.sys_id}` };
    }

    // ── Control Objective (read-only) ───────────────────────────────────
    case 'list_control_objectives': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.category) parts.push(`category=${queryValue(args.category)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_compliance_policy_statement',
        query: parts.join('^'),
        fields: CONTROL_OBJECTIVE_LIST_FIELDS,
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} control objective(s)` };
    }
    case 'get_control_objective': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sn_compliance_policy_statement', args.sys_id);
    }

    // ── Policy Exception (read-only) ─────────────────────────────────────
    case 'list_policy_exceptions': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.policy) parts.push(`policy=${queryValue(args.policy)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_compliance_policy_exception',
        query: parts.join('^'),
        fields: EXCEPTION_LIST_FIELDS,
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} policy exception(s)` };
    }
    case 'get_policy_exception': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) return await client.getRecord('sn_compliance_policy_exception', args.number_or_sysid);
      const resp = await client.queryRecords({ table: 'sn_compliance_policy_exception', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Policy Exception not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    // ── Issue ─────────────────────────────────────────────────────────
    case 'list_grc_issues': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.profile) parts.push(`profile=${queryValue(args.profile)}`);
      if (args.classification) parts.push(`classification=${queryValue(args.classification)}`);
      if (args.assignment_group) parts.push(`assignment_group=${queryValue(args.assignment_group)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_grc_issue',
        query: parts.join('^'),
        fields: ISSUE_LIST_FIELDS,
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} GRC issue(s)` };
    }
    case 'get_grc_issue': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) return await client.getRecord('sn_grc_issue', args.number_or_sysid);
      const resp = await client.queryRecords({ table: 'sn_grc_issue', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`GRC Issue not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_grc_issue': {
      requireWrite();
      if (!args.short_description) throw new ServiceNowError('short_description is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { short_description: args.short_description };
      for (const f of ['description', 'profile', 'issue_type', 'classification', 'impact', 'urgency', 'assignment_group']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_grc_issue', data);
      return { ...result, summary: `Created GRC Issue: ${args.short_description}` };
    }
    case 'update_grc_issue': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      assertAllowedFields('Issue', args.fields, ISSUE_FIELDS);
      const result = await client.updateRecord('sn_grc_issue', args.sys_id, args.fields);
      return { ...result, summary: `Updated GRC Issue ${args.sys_id}` };
    }

    // ── Dashboard ─────────────────────────────────────────────────────
    case 'get_grc_compliance_dashboard': {
      const top = Math.min(Math.max(Math.trunc(Number(args.top) || 5), 1), 50);

      const [policyStats, controlStats, issueStats, topExceptions] = await Promise.all([
        client.runAggregateQuery('sn_compliance_policy', 'state', 'COUNT'),
        client.runAggregateQuery('sn_compliance_control', 'state', 'COUNT'),
        client.runAggregateQuery('sn_grc_issue', 'state', 'COUNT'),
        client.queryRecords({
          table: 'sn_compliance_policy_exception',
          query: 'stateIN1,2,10,12,6',
          fields: 'number,short_description,state,risk_rating,requested_valid_to',
          orderBy: '-sys_updated_on',
          limit: top,
          display_value: 'all',
        }),
      ]);

      const policiesByState = summarizeByState(policyStats, {});
      const controlsByState = summarizeByState(controlStats, {});
      const issuesByState = summarizeByState(issueStats, ISSUE_STATE_LABELS);
      const total = (rows: Array<{ count: number }>) => rows.reduce((s, r) => s + r.count, 0);
      const openIssues = issuesByState.filter(r => !['3', '4'].includes(r.state)).reduce((s, r) => s + r.count, 0);
      const exceptionsWithLabels = topExceptions.records.map((r: any) => ({
        ...r,
        state_label: EXCEPTION_STATE_LABELS[String(r.state?.value ?? r.state ?? '')] ?? undefined,
      }));

      return {
        policies: { total: total(policiesByState), by_state: policiesByState },
        controls: { total: total(controlsByState), by_state: controlsByState },
        issues: { total: total(issuesByState), open: openIssues, by_state: issuesByState },
        open_policy_exceptions: exceptionsWithLabels,
        summary:
          `Policies: ${total(policiesByState)} · Controls: ${total(controlsByState)} · ` +
          `Issues: ${total(issuesByState)} (${openIssues} open) · ${topExceptions.count} open exception(s) listed`,
      };
    }

    default:
      return null;
  }
}
