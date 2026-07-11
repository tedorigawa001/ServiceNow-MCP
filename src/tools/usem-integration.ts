/**
 * USEM / Vulnerability Response integration operations — manage the security
 * data feeds (NVD, Qualys, Tenable, Red Hat, etc.): their catalog, the enabled
 * implementations, run history, run detail, and troubleshooting logs.
 *
 * Complements `get_integration_health` (a rollup summary) with detailed listing,
 * per-run drill-down, log diagnostics, and an enable/disable toggle.
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 *
 * Tables / fields verified against a live PDI (dev400464):
 *   sn_sec_int_integration  — integration catalog (name, id, source, type)
 *   sn_sec_int_impl         — implementations/instances (active, is_default, ...)
 *   sn_vul_integration_run  — run history (number VINTRUNxxxx, perf metrics,
 *                             fatal_error_message; source e.g. "NVD")
 *   sn_vul_integration_log  — logs linked to a run (type, message_value)
 *   sn_sec_int_config       — parameter definitions per integration (label, elem_type,
 *                             mandatory, default_value; encrypted password_value never returned)
 *   sn_sec_int_impl_config  — parameter values per implementation (configuration → sn_sec_int_config)
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;

/** Strip encoded-query operators so a value can't break out of its clause. */
function sanitize(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[^a-zA-Z0-9 _.-]/g, '').trim() : '';
}

function clampDays(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 365) : undefined;
}

const RUN_FIELDS =
  'number,source,state,substate,start_datetime,end_datetime,vi_created,vi_updated,' +
  'vi_new_findings,det_created,fatal_error_message,notes,implementation,integration,sys_id';

const LOG_FIELDS =
  'type,category,message_value,suggested_recommendations,integration_run,sys_created_on,sys_id';

/** Parameter names/labels that indicate a secret; their values are masked in output. */
const SECRET_PARAM_RE = /secret|password|token|api_?key|credential|private/i;

/**
 * Mask secret-like parameter values. The encrypted password_value column is never
 * requested; this additionally masks plain `value`/`default_value` when the parameter
 * is a password type or its name/label looks secret-bearing.
 */
function maskParameterRecord(rec: Record<string, any>): Record<string, any> {
  const name = String(rec.name ?? rec['configuration.name'] ?? '');
  const label = String(rec.label ?? rec['configuration.label'] ?? '');
  const elemType = String(rec.elem_type ?? rec['configuration.elem_type'] ?? '');
  const isSecret = elemType === 'password' || elemType === 'password2' || SECRET_PARAM_RE.test(`${name} ${label}`);
  if (!isSecret) return rec;
  const masked = { ...rec };
  for (const field of ['value', 'default_value']) {
    if (typeof masked[field] === 'string' && masked[field] !== '') masked[field] = '***MASKED***';
  }
  return masked;
}

export function getUsemIntegrationToolDefinitions() {
  return [
    {
      name: 'list_integrations',
      description:
        'List the USEM/VR integration catalog (sn_sec_int_integration) — the available security ' +
        'data feeds such as NVD, Qualys, Tenable, Red Hat. Returns name, id, source and type.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 50, max: 1000)' },
        },
      },
    },
    {
      name: 'list_integration_implementations',
      description:
        'List configured integration implementations/instances (sn_sec_int_impl) — the operational ' +
        'units that carry the active flag, default flag and validation status. Use this to see which ' +
        'feeds are actually enabled.',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active state' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 50, max: 1000)' },
          display_value: {
            description: 'Return human-readable reference/choice values (true) or both raw and display ("all")',
            oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }],
          },
        },
      },
    },
    {
      name: 'list_integration_runs',
      description:
        'List Vulnerability Integration Runs (sn_vul_integration_run) with detail. Filter by source ' +
        '(e.g. "NVD"), state, substate ("success"/"failed"), or a recent day window. Ordered newest ' +
        'first. For a quick health rollup use get_integration_health instead.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Integration source filter, e.g. "NVD", "Qualys"' },
          state: { type: 'string', description: 'Run state filter, e.g. "complete"' },
          substate: { type: 'string', description: 'Run substate filter, e.g. "success" or "failed"' },
          days: { type: 'number', description: 'Only runs started within the last N days (1-365)' },
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
      name: 'get_integration_run',
      description:
        'Get full detail of a single Vulnerability Integration Run by run number (VINTRUNxxxx) or ' +
        'sys_id, including performance metrics and any fatal_error_message.',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Run number (VINTRUNxxxx) or 32-char sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_integration_logs',
      description:
        'List integration log entries (sn_vul_integration_log) for troubleshooting — error and ' +
        'recommendation messages, optionally scoped to a single run. Ordered newest first.',
      inputSchema: {
        type: 'object',
        properties: {
          integration_run: { type: 'string', description: 'Filter to a single run (sys_id of sn_vul_integration_run)' },
          type: { type: 'string', description: 'Log type filter, e.g. "error", "warning", "info"' },
          category: { type: 'string', description: 'Log category filter' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 50, max: 1000)' },
        },
      },
    },
    {
      name: 'list_integration_parameters',
      description:
        'List USEM/VR integration parameters. scope="definition" returns the parameter catalog ' +
        '(sn_sec_int_config: label, type, mandatory, default) optionally filtered by integration; ' +
        'scope="instance" returns the configured values per implementation (sn_sec_int_impl_config). ' +
        'Secret-like values (passwords, tokens, API keys) are masked and encrypted password_value ' +
        'columns are never returned.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['definition', 'instance'],
            description: 'definition = parameter catalog per integration; instance = configured values per implementation',
          },
          integration: { type: 'string', description: 'Filter definitions by integration sys_id (scope=definition)' },
          implementation: { type: 'string', description: 'Filter values by implementation sys_id (scope=instance)' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 100, max: 1000)' },
        },
        required: ['scope'],
      },
    },
    {
      name: 'set_integration_active',
      description:
        'Enable or disable an integration implementation (sn_sec_int_impl) by sys_id. This turns a ' +
        'security data feed on or off. **[Write — requires WRITE_ENABLED=true; admin-level change]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the sn_sec_int_impl implementation' },
          active: { type: 'boolean', description: 'true to enable, false to disable' },
        },
        required: ['sys_id', 'active'],
      },
    },
  ];
}

export async function executeUsemIntegrationToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_integrations': {
      const resp = await client.queryRecords({
        table: 'sn_sec_int_integration',
        query: args.query ?? '',
        fields: 'name,id,source,integration_type,short_description,configurable,order,sys_id',
        orderBy: 'order',
        limit: args.limit ?? 50,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} integration(s)` };
    }

    case 'list_integration_implementations': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active === true}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_sec_int_impl',
        query: parts.join('^'),
        fields: 'name,active,integration,is_default,validation_status,sys_id',
        orderBy: 'name',
        limit: args.limit ?? 50,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} implementation(s)` };
    }

    case 'list_integration_runs': {
      const parts: string[] = [];
      const days = clampDays(args.days);
      if (days !== undefined) parts.push(`start_datetime>=javascript:gs.daysAgo(${days})`);
      const source = sanitize(args.source);
      if (args.source && source) parts.push(`source=${source}`);
      const state = sanitize(args.state);
      if (args.state && state) parts.push(`state=${state}`);
      const substate = sanitize(args.substate);
      if (args.substate && substate) parts.push(`substate=${substate}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_vul_integration_run',
        query: parts.join('^'),
        fields: RUN_FIELDS,
        orderBy: '-start_datetime',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} integration run(s)` };
    }

    case 'get_integration_run': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) {
        return await client.getRecord('sn_vul_integration_run', args.number_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sn_vul_integration_run',
        query: `number=${sanitize(args.number_or_sysid)}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Integration run not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'list_integration_logs': {
      const parts: string[] = [];
      if (args.integration_run) {
        if (!SYS_ID_RE.test(args.integration_run)) {
          throw new ServiceNowError('integration_run must be a 32-character sys_id', 'INVALID_REQUEST');
        }
        parts.push(`integration_run=${args.integration_run}`);
      }
      const type = sanitize(args.type);
      if (args.type && type) parts.push(`type=${type}`);
      const category = sanitize(args.category);
      if (args.category && category) parts.push(`category=${category}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_vul_integration_log',
        query: parts.join('^'),
        fields: LOG_FIELDS,
        orderBy: '-sys_created_on',
        limit: args.limit ?? 50,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} integration log entry/entries` };
    }

    case 'list_integration_parameters': {
      const scope = args.scope;
      if (scope !== 'definition' && scope !== 'instance') {
        throw new ServiceNowError('scope must be "definition" or "instance"', 'INVALID_REQUEST');
      }
      const parts: string[] = [];
      if (scope === 'definition') {
        if (args.integration) {
          if (!SYS_ID_RE.test(args.integration)) {
            throw new ServiceNowError('integration must be a 32-character sys_id', 'INVALID_REQUEST');
          }
          parts.push(`integration=${args.integration}`);
        }
        if (args.query) parts.push(args.query);
        const resp = await client.queryRecords({
          table: 'sn_sec_int_config',
          query: parts.join('^'),
          fields: 'name,label,display_name,elem_type,mandatory,default_value,order,integration,sys_id',
          orderBy: 'order',
          limit: args.limit ?? 100,
        });
        return {
          scope,
          count: resp.count,
          records: resp.records.map(maskParameterRecord),
          summary: `Found ${resp.count} parameter definition(s)`,
        };
      }
      if (args.implementation) {
        if (!SYS_ID_RE.test(args.implementation)) {
          throw new ServiceNowError('implementation must be a 32-character sys_id', 'INVALID_REQUEST');
        }
        parts.push(`implementation=${args.implementation}`);
      }
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_sec_int_impl_config',
        query: parts.join('^'),
        fields: 'configuration.name,configuration.label,configuration.elem_type,implementation,value,sys_id',
        orderBy: 'configuration.name',
        limit: args.limit ?? 100,
      });
      return {
        scope,
        count: resp.count,
        records: resp.records.map(maskParameterRecord),
        summary: `Found ${resp.count} configured parameter value(s)`,
      };
    }

    case 'set_integration_active': {
      requireWrite();
      if (!args.sys_id || !SYS_ID_RE.test(args.sys_id)) {
        throw new ServiceNowError('sys_id must be a 32-character hex string', 'INVALID_REQUEST');
      }
      if (typeof args.active !== 'boolean') throw new ServiceNowError('active (boolean) is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sn_sec_int_impl', args.sys_id, { active: args.active });
      return {
        ...result,
        summary: `${args.active ? 'Enabled' : 'Disabled'} integration implementation ${args.sys_id}`,
      };
    }

    default:
      return null;
  }
}
