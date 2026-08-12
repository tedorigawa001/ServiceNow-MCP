/**
 * ServiceNow Data Management tools.
 *
 * Archive rules always start inactive. Retaining references is immutable after
 * creation, so it is deliberately exposed only by create_archive_rule.
 * Destroy rules likewise start inactive and require a positive retention period.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting, requireWrite } from '../utils/permissions.js';

const SYS_ID = /^[a-f0-9]{32}$/i;
const TABLE_NAME = /^[a-z][a-z0-9_]*$/i;
const ACTIVATION_CONFIRMATION = 'I_UNDERSTAND';

function requireSysId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SYS_ID.test(value)) {
    throw new ServiceNowError(`${field} must be a 32-character sys_id`, 'INVALID_REQUEST');
  }
  return value;
}

function requireTableName(value: unknown, field = 'table'): string {
  if (typeof value !== 'string' || !TABLE_NAME.test(value)) {
    throw new ServiceNowError(`${field} must be a valid ServiceNow table name`, 'INVALID_REQUEST');
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServiceNowError(`${field} is required`, 'INVALID_REQUEST');
  }
  return value.trim();
}

function durationFromDays(value: unknown): string {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 36500) {
    throw new ServiceNowError('retention_days must be an integer between 1 and 36500', 'INVALID_REQUEST');
  }
  return new Date(Date.UTC(1970, 0, 1) + (value as number) * 86_400_000)
    .toISOString().slice(0, 19).replace('T', ' ');
}

function extractSysId(record: Record<string, unknown>): string {
  const sysId = record.sys_id as unknown;
  if (typeof sysId === 'string') return sysId;
  if (sysId && typeof sysId === 'object' && 'value' in sysId) return String((sysId as { value: unknown }).value);
  return '';
}

function referenceSysId(value: unknown, field: string): string {
  if (typeof value === 'string') return requireSysId(value, field);
  if (value && typeof value === 'object' && 'value' in value) {
    return requireSysId((value as { value: unknown }).value, field);
  }
  throw new ServiceNowError(`${field} must contain a 32-character sys_id`, 'INVALID_REQUEST');
}

async function assertActivePolicyForTable(client: ServiceNowClient, table: string): Promise<void> {
  const policies = await client.queryRecords({ table: 'sys_dm_policy', query: `tablename=${table}^active=true`, limit: 1, fields: 'sys_id,name,active' });
  if (!policies.records.length) {
    throw new ServiceNowError(`An active Data Management Policy is required before activating a rule for ${table}.`, 'CONFLICT');
  }
}

export function getDataManagementToolDefinitions() {
  return [
    {
      name: 'list_data_management_policies',
      description: 'List Data Management Policies, optionally for one exact table.',
      inputSchema: { type: 'object', properties: { table: { type: 'string' }, limit: { type: 'number' } }, required: [], additionalProperties: false },
    },
    {
      name: 'get_data_management_policy',
      description: 'Get a Data Management Policy and the archive rules for its table.',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string' } }, required: ['sys_id'], additionalProperties: false },
    },
    {
      name: 'create_data_management_policy',
      description: 'Create an inactive Data Management Policy. Existing policies for the table are rejected. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string' }, table: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'table'], additionalProperties: false },
    },
    {
      name: 'list_archive_rules',
      description: 'List archive rules, optionally for one exact table.',
      inputSchema: { type: 'object', properties: { table: { type: 'string' }, limit: { type: 'number' } }, required: [], additionalProperties: false },
    },
    {
      name: 'create_archive_rule',
      description: 'Create an inactive archive rule under an existing Data Management Policy. retain_references can only be chosen at creation. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          policy_sys_id: { type: 'string' }, name: { type: 'string' }, condition: { type: 'string' }, description: { type: 'string' },
          retain_references: { type: 'boolean', description: 'Immutable after creation; preserves reference sys_ids in future archive rows.' },
          auto_rearchive: { type: 'boolean' },
        }, required: ['policy_sys_id', 'name', 'condition'], additionalProperties: false,
      },
    },
    {
      name: 'create_destroy_rule',
      description: 'Create an inactive destroy rule for archived data. retention_days must be at least one day. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          archive_rule_sys_id: { type: 'string' }, name: { type: 'string' }, retention_days: { type: 'integer', minimum: 1, maximum: 36500 },
          description: { type: 'string' }, destroy_related: { type: 'boolean' },
        }, required: ['archive_rule_sys_id', 'name', 'retention_days'], additionalProperties: false,
      },
    },
    {
      name: 'list_cleanup_rules',
      description: 'List Table Cleanup Rules (Auto Flush), optionally for one exact table.',
      inputSchema: { type: 'object', properties: { table: { type: 'string' }, limit: { type: 'number' } }, required: [], additionalProperties: false },
    },
    {
      name: 'create_cleanup_rule',
      description: 'Create an inactive Table Cleanup Rule for a Data Management Policy. It deletes live records only after explicit activation. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          policy_sys_id: { type: 'string' }, condition: { type: 'string' }, age_seconds: { type: 'integer', minimum: 86400, maximum: 3153600000 },
          match_field: { type: 'string', description: 'Date/time field used for age calculation; defaults to sys_created_on.' },
          clean_journals: { type: 'boolean' }, clean_audit: { type: 'boolean' }, cascade_delete: { type: 'boolean' },
        }, required: ['policy_sys_id', 'condition', 'age_seconds'], additionalProperties: false,
      },
    },
    {
      name: 'set_archive_rule_active',
      description: 'Activate or deactivate an archive rule. Activation requires confirmation and an active Data Management Policy. **[Write]**',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string' }, active: { type: 'boolean' }, confirmation: { type: 'string', description: `Required when activating: ${ACTIVATION_CONFIRMATION}` } }, required: ['sys_id', 'active'], additionalProperties: false },
    },
    {
      name: 'set_destroy_rule_active',
      description: 'Activate or deactivate a destroy rule. Activation requires confirmation; it permanently deletes eligible archived records. **[Destructive]**',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string' }, active: { type: 'boolean' }, confirmation: { type: 'string', description: `Required when activating: ${ACTIVATION_CONFIRMATION}` } }, required: ['sys_id', 'active'], additionalProperties: false },
    },
    {
      name: 'set_cleanup_rule_active',
      description: 'Activate or deactivate a Table Cleanup Rule. Activation requires confirmation; matching live records are permanently deleted. **[Destructive]**',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string' }, active: { type: 'boolean' }, confirmation: { type: 'string', description: `Required when activating: ${ACTIVATION_CONFIRMATION}` } }, required: ['sys_id', 'active'], additionalProperties: false },
    },
    {
      name: 'get_archive_restore_status',
      description: 'Get the restore status of one archive log entry, including whether its primary record is live or archived.',
      inputSchema: { type: 'object', properties: { archive_log_sys_id: { type: 'string' } }, required: ['archive_log_sys_id'], additionalProperties: false },
    },
    {
      name: 'restore_archived_record',
      description: 'Schedule a one-time standard ServiceNow restore for one archive log entry. The archive row is removed after successful restore. **[Destructive]**',
      inputSchema: { type: 'object', properties: { archive_log_sys_id: { type: 'string' }, confirmation: { type: 'string', description: `Required: ${ACTIVATION_CONFIRMATION}` } }, required: ['archive_log_sys_id', 'confirmation'], additionalProperties: false },
    },
  ];
}

export async function executeDataManagementToolCall(client: ServiceNowClient, name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case 'list_data_management_policies': {
      const query = args.table ? `tablename=${requireTableName(args.table)}` : undefined;
      const response = await client.queryRecords({ table: 'sys_dm_policy', query, limit: args.limit || 100, fields: 'sys_id,name,tablename,active,description,sys_updated_on' });
      return { count: response.count, policies: response.records };
    }
    case 'get_data_management_policy': {
      const sysId = requireSysId(args.sys_id, 'sys_id');
      const policy = await client.getRecord('sys_dm_policy', sysId) as Record<string, unknown>;
      const table = requireTableName(policy.tablename);
      const rules = await client.queryRecords({ table: 'sys_archive', query: `table=${table}`, limit: 100, fields: 'sys_id,name,active,condition,retain_references,auto_rearchive,destroy_rule,record_estimate,estimate_date' });
      return { policy, archive_rule_count: rules.count, archive_rules: rules.records };
    }
    case 'create_data_management_policy': {
      requireWrite();
      const table = requireTableName(args.table);
      const nameValue = requireNonEmptyString(args.name, 'name');
      const existing = await client.queryRecords({ table: 'sys_dm_policy', query: `tablename=${table}`, limit: 1, fields: 'sys_id,name,active' });
      if (existing.records.length) throw new ServiceNowError(`A Data Management Policy already exists for ${table}; use it instead of creating a duplicate.`, 'CONFLICT');
      const created = await client.createRecord('sys_dm_policy', { name: nameValue, tablename: table, description: args.description || '', active: false });
      return { action: 'created_inactive', policy: created };
    }
    case 'list_archive_rules': {
      const query = args.table ? `table=${requireTableName(args.table)}` : undefined;
      const response = await client.queryRecords({ table: 'sys_archive', query, limit: args.limit || 100, fields: 'sys_id,name,table,active,condition,retain_references,auto_rearchive,destroy_rule,record_estimate,estimate_date' });
      return { count: response.count, archive_rules: response.records };
    }
    case 'create_archive_rule': {
      requireWrite();
      const policySysId = requireSysId(args.policy_sys_id, 'policy_sys_id');
      const policy = await client.getRecord('sys_dm_policy', policySysId) as Record<string, unknown>;
      const table = requireTableName(policy.tablename, 'policy.tablename');
      const created = await client.createRecord('sys_archive', {
        name: requireNonEmptyString(args.name, 'name'), table, condition: requireNonEmptyString(args.condition, 'condition'),
        description: args.description || '', active: false, retain_references: args.retain_references === true,
        auto_rearchive: args.auto_rearchive === true,
      });
      return { action: 'created_inactive', policy_sys_id: policySysId, archive_rule: created, safety: 'Rule is inactive. Retain references cannot be changed after creation.' };
    }
    case 'create_destroy_rule': {
      requireWrite();
      const archiveSysId = requireSysId(args.archive_rule_sys_id, 'archive_rule_sys_id');
      const archive = await client.getRecord('sys_archive', archiveSysId) as Record<string, unknown>;
      const created = await client.createRecord('sys_archive_destroy', {
        name: requireNonEmptyString(args.name, 'name'), archive: archiveSysId, table: requireTableName(archive.table, 'archive rule table'),
        archive_duration: durationFromDays(args.retention_days), description: args.description || '', destroy_related: args.destroy_related === true, active: false,
      });
      const destroySysId = extractSysId(created as Record<string, unknown>);
      if (destroySysId) await client.updateRecord('sys_archive', archiveSysId, { destroy_rule: destroySysId });
      return { action: 'created_inactive', destroy_rule: created, safety: 'Rule is inactive and will not delete records until explicitly activated.' };
    }
    case 'list_cleanup_rules': {
      const query = args.table ? `tablename=${requireTableName(args.table)}` : undefined;
      const response = await client.queryRecords({ table: 'sys_auto_flush', query, limit: args.limit || 100, fields: 'sys_id,tablename,active,matchfield,age,conditions,clean_peripheral,clean_audit,cascade_delete' });
      return { count: response.count, cleanup_rules: response.records };
    }
    case 'create_cleanup_rule': {
      requireWrite();
      const policySysId = requireSysId(args.policy_sys_id, 'policy_sys_id');
      const policy = await client.getRecord('sys_dm_policy', policySysId) as Record<string, unknown>;
      const age = args.age_seconds;
      if (!Number.isInteger(age) || age < 86400 || age > 3_153_600_000) {
        throw new ServiceNowError('age_seconds must be an integer between 86400 (one day) and 3153600000 (100 years)', 'INVALID_REQUEST');
      }
      const matchField = args.match_field === undefined ? 'sys_created_on' : requireNonEmptyString(args.match_field, 'match_field');
      if (!/^[a-z][a-z0-9_]*$/i.test(matchField)) throw new ServiceNowError('match_field must be a field name', 'INVALID_REQUEST');
      const created = await client.createRecord('sys_auto_flush', {
        tablename: requireTableName(policy.tablename, 'policy.tablename'), conditions: requireNonEmptyString(args.condition, 'condition'),
        age, matchfield: matchField, active: false, clean_peripheral: args.clean_journals === true,
        clean_audit: args.clean_audit === true, cascade_delete: args.cascade_delete === true,
      });
      return { action: 'created_inactive', policy_sys_id: policySysId, cleanup_rule: created, safety: 'Rule is inactive and will not delete live records until explicitly activated.' };
    }
    case 'set_archive_rule_active': {
      requireWrite();
      const sysId = requireSysId(args.sys_id, 'sys_id');
      if (args.active === true && args.confirmation !== ACTIVATION_CONFIRMATION) throw new ServiceNowError(`confirmation must equal ${ACTIVATION_CONFIRMATION} to activate an archive rule`, 'CONFIRMATION_REQUIRED');
      if (args.active === true) {
        const rule = await client.getRecord('sys_archive', sysId) as Record<string, unknown>;
        await assertActivePolicyForTable(client, requireTableName(rule.table, 'archive rule table'));
      }
      const updated = await client.updateRecord('sys_archive', sysId, { active: args.active === true });
      return { action: args.active ? 'activated' : 'deactivated', archive_rule: updated };
    }
    case 'set_destroy_rule_active': {
      requireWrite();
      const sysId = requireSysId(args.sys_id, 'sys_id');
      if (args.active === true && args.confirmation !== ACTIVATION_CONFIRMATION) throw new ServiceNowError(`confirmation must equal ${ACTIVATION_CONFIRMATION} to activate a destroy rule`, 'CONFIRMATION_REQUIRED');
      if (args.active === true) {
        const destroyRule = await client.getRecord('sys_archive_destroy', sysId) as Record<string, unknown>;
        const archiveRule = await client.getRecord('sys_archive', referenceSysId(destroyRule.archive, 'destroy rule archive')) as Record<string, unknown>;
        await assertActivePolicyForTable(client, requireTableName(archiveRule.table, 'archive rule table'));
      }
      const updated = await client.updateRecord('sys_archive_destroy', sysId, { active: args.active === true });
      return { action: args.active ? 'activated' : 'deactivated', destroy_rule: updated };
    }
    case 'set_cleanup_rule_active': {
      requireWrite();
      const sysId = requireSysId(args.sys_id, 'sys_id');
      if (args.active === true && args.confirmation !== ACTIVATION_CONFIRMATION) throw new ServiceNowError(`confirmation must equal ${ACTIVATION_CONFIRMATION} to activate a cleanup rule`, 'CONFIRMATION_REQUIRED');
      if (args.active === true) {
        const rule = await client.getRecord('sys_auto_flush', sysId) as Record<string, unknown>;
        await assertActivePolicyForTable(client, requireTableName(rule.tablename, 'cleanup rule tablename'));
      }
      const updated = await client.updateRecord('sys_auto_flush', sysId, { active: args.active === true });
      return { action: args.active ? 'activated' : 'deactivated', cleanup_rule: updated };
    }
    case 'get_archive_restore_status': {
      const logSysId = requireSysId(args.archive_log_sys_id, 'archive_log_sys_id');
      const log = await client.getRecord('sys_archive_log', logSysId) as Record<string, any>;
      const primarySysId = typeof log.id === 'object' ? log.id.value : log.id;
      const fromTable = requireTableName(log.from_table, 'archive log from_table');
      const toTable = requireTableName(log.to_table, 'archive log to_table');
      const [live, archived] = await Promise.all([
        client.queryRecords({ table: fromTable, query: `sys_id=${primarySysId}`, limit: 1, fields: 'sys_id,number,sys_updated_on' }),
        client.queryRecords({ table: toTable, query: `sys_id=${primarySysId}`, limit: 1, fields: 'sys_id,number,sys_updated_on' }),
      ]);
      return { archive_log: log, live_count: live.count, archived_count: archived.count, live_records: live.records, archived_records: archived.records };
    }
    case 'restore_archived_record': {
      requireWrite();
      requireScripting();
      const logSysId = requireSysId(args.archive_log_sys_id, 'archive_log_sys_id');
      if (args.confirmation !== ACTIVATION_CONFIRMATION) throw new ServiceNowError(`confirmation must equal ${ACTIVATION_CONFIRMATION} to restore an archived record`, 'CONFIRMATION_REQUIRED');
      const log = await client.getRecord('sys_archive_log', logSysId) as Record<string, any>;
      if (log.restored) throw new ServiceNowError('Archive log entry is already restored.', 'CONFLICT');
      const runStart = new Date(Date.now() + 70_000).toISOString().slice(0, 19).replace('T', ' ');
      const marker = `[MCP restore ${logSysId}]`;
      const job = await client.createRecord('sysauto_script', { name: marker, active: true, run_type: 'once', run_start: runStart, script: `new GlideArchiveRestore().restore('${logSysId}');` });
      return { action: 'restore_scheduled', archive_log_sys_id: logSysId, scheduled_job: job, run_start_utc: runStart, warning: 'The archive table record is removed when the restore succeeds. Use get_archive_restore_status to verify completion.' };
    }
    default:
      return null;
  }
}
