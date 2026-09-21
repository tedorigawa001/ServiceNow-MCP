/**
 * Security Operations (SecOps) tools — security incidents, vulnerabilities, threat
 * intelligence, and playbooks. GRC tools live in grc-audit.ts / grc-compliance.ts /
 * grc-risk.ts (see docs/GRC_DESIGN.md) — the GRC tools formerly here pointed at
 * tables that don't exist (`sn_compliance_assessment`, `sn_audit_result`) or used
 * a field set that didn't match the real schema (`create_grc_risk`).
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import { sanitizeLikeValue, type ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireScripting, requireWrite } from '../utils/permissions.js';
import { SEVERITY } from './schema-helpers.js';

const SECURITY_INCIDENT_FIELDS = new Set([
  'short_description', 'category', 'subcategory', 'severity', 'description', 'affected_cis',
  'assignment_group', 'state', 'containment_status',
]);
const VULNERABILITY_UPDATE_FIELDS = new Set([
  'state', 'risk_acceptance_notes', 'remediation_date',
]);
const queryValue = (value: unknown) => sanitizeLikeValue(String(value));
const SYS_ID_RE = /^[0-9a-f]{32}$/i;

export function getSecurityToolDefinitions() {
  return [
    {
      name: 'create_security_incident',
      description: 'Create a Security Operations incident (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string', description: 'Brief description of the security event' },
          category: { type: 'string', description: 'Incident category (e.g., "Malware", "Phishing", "Data Breach", "Unauthorized Access")' },
          subcategory: { type: 'string', description: 'Incident subcategory' },
          severity: SEVERITY,
          description: { type: 'string', description: 'Detailed description of the security incident' },
          affected_cis: { type: 'array', items: { type: 'string' }, description: 'List of affected CI sys_ids' },
          assignment_group: { type: 'string', description: 'SOC team or assignment group' },
        },
        required: ['short_description', 'category'],
      },
    },
    {
      name: 'get_security_incident',
      description: 'Get full details of a security incident by number or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Security incident number (SIR...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_security_incident',
      description: 'Update a security incident record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the security incident' },
          fields: {
            type: 'object',
            description: 'Fields to update (state, severity, containment_status, etc.)',
            properties: Object.fromEntries([...SECURITY_INCIDENT_FIELDS].map(field => [field, {}])),
            additionalProperties: false,
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_security_incidents',
      description: 'List security incidents with filters (severity, state, category)',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', enum: ['open', 'analysis', 'contain', 'eradicate', 'recover', 'review', 'closed'], description: 'Filter by security incident state' },
          severity: { ...SEVERITY, description: 'Filter by severity. ' + SEVERITY.description },
          category: { type: 'string', description: 'Filter by incident category' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'list_vulnerabilities',
      description: 'List vulnerability entries from the Vulnerability Response module',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state (open, in_review, risk_accepted, closed)' },
          severity: { type: 'string', description: 'Filter by CVSS severity (critical, high, medium, low)' },
          ci_sysid: { type: 'string', description: 'Filter by affected CI sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
          query: { type: 'string', description: 'Additional encoded query string' },
        },
        required: [],
      },
    },
    {
      name: 'get_vulnerability',
      description: 'Get details of a specific vulnerability entry including CVSS score and affected CIs',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Vulnerability number (VIT...) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_vulnerability',
      description: 'Update a vulnerability entry (state, risk acceptance notes, remediation date) (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the vulnerability entry' },
          fields: {
            type: 'object',
            description: 'Fields to update (state, risk_acceptance_notes, remediation_date)',
            properties: Object.fromEntries([...VULNERABILITY_UPDATE_FIELDS].map(field => [field, {}])),
            additionalProperties: false,
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'get_threat_intelligence',
      description: 'Query threat intelligence data — IOCs, threat actors, and campaigns',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (IP, domain, hash, actor name)' },
          type: { type: 'string', description: 'Filter by IOC type: ip_address, domain, file_hash, url, email' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['query'],
      },
    },
    // ─── Security Playbooks ───────────────────────────────────────────
    {
      name: 'list_security_playbooks',
      description: 'List Security Incident Response playbooks. These are Process Automation Designer definitions (sys_pd_process_definition) shipped in the sn_si_aw scope, e.g. the Malware / Phishing / Failed Login templates.',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter active only (default true)' },
          query: { type: 'string', description: 'Search by playbook label or name' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'run_security_playbook',
      description: 'Start a Security Incident Response playbook (a Process Automation Designer definition in the sn_si_aw scope) against a security incident, the same way the SIR Analyst Workspace does: sn_playbook.PlaybookExperience.triggerPlaybook(). Schedules a one-time server script, so it requires SCRIPTING_ENABLED=true. Skips if that playbook is already queued or in progress on the incident. Set wait_seconds to poll for the resulting execution (sys_pd_context). **[Scripting]**',
      inputSchema: {
        type: 'object',
        properties: {
          playbook: { type: 'string', description: 'Playbook sys_id or scoped name (sys_pd_process_definition.name, e.g. "security_incident_malware_manual_template_v1"). See list_security_playbooks.' },
          playbook_sys_id: { type: 'string', description: 'Alias of playbook (accepted for compatibility).' },
          incident_sys_id: { type: 'string', description: 'Security incident (sn_si_incident) sys_id to run against' },
          wait_seconds: { type: 'number', description: 'Poll sys_pd_context for the new execution for up to this many seconds (0-180, default 0 = return right after scheduling).' },
        },
        required: ['incident_sys_id'],
      },
    },
    // ─── Security Dashboard & Posture ─────────────────────────────────
    {
      name: 'get_security_dashboard',
      description: 'Get security posture dashboard — open incidents by severity, vulnerability counts, mean time to resolve',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look-back period in days (default 30)' },
        },
        required: [],
      },
    },
    {
      name: 'scan_vulnerabilities',
      description: 'Trigger a vulnerability scan for specified CIs or groups. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_ids: { type: 'array', items: { type: 'string' }, description: 'CI sys_ids to scan' },
          group: { type: 'string', description: 'CI group to scan (alternative to ci_sys_ids)' },
          scan_type: { type: 'string', description: 'Scan type: full, quick, compliance (default full)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeSecurityToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'create_security_incident': {
      requireWrite();
      if (!args.short_description || !args.category) throw new ServiceNowError('short_description and category are required', 'INVALID_REQUEST');
      // args is the record payload itself here (unlike update, which nests fields
      // under args.fields) — every key is checked against the allowlist below.
      const unsafeFields = Object.keys(args).filter(field => !SECURITY_INCIDENT_FIELDS.has(field));
      if (unsafeFields.length) {
        throw new ServiceNowError(
          `Security incident fields cannot be set: ${unsafeFields.join(', ')}. Allowed fields: ${[...SECURITY_INCIDENT_FIELDS].join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      const result = await client.createRecord('sn_si_incident', args);
      return { ...result, summary: `Created security incident ${result.number || result.sys_id}` };
    }
    case 'get_security_incident': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_si_incident', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_si_incident', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Security incident not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_security_incident': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const unsafeFields = Object.keys(args.fields).filter(field => !SECURITY_INCIDENT_FIELDS.has(field));
      if (unsafeFields.length) {
        throw new ServiceNowError(
          `Security incident fields cannot be updated: ${unsafeFields.join(', ')}. Allowed fields: ${[...SECURITY_INCIDENT_FIELDS].join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      const result = await client.updateRecord('sn_si_incident', args.sys_id, args.fields);
      return { ...result, summary: `Updated security incident ${args.sys_id}` };
    }
    case 'list_security_incidents': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${queryValue(args.state)}`);
      if (args.severity) parts.push(`severity=${queryValue(args.severity)}`);
      if (args.category) parts.push(`category=${queryValue(args.category)}`);
      if (args.query) parts.push(args.query);
      return await client.queryRecords({ table: 'sn_si_incident', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'list_vulnerabilities': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${queryValue(args.state)}`);
      if (args.severity) parts.push(`severity=${queryValue(args.severity)}`);
      if (args.ci_sysid) parts.push(`cmdb_ci=${queryValue(args.ci_sysid)}`);
      if (args.query) parts.push(args.query);
      return await client.queryRecords({ table: 'sn_vul_entry', query: parts.join('^') || '', limit: args.limit ?? 25 });
    }
    case 'get_vulnerability': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('sn_vul_entry', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'sn_vul_entry', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Vulnerability not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_vulnerability': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const unsafeFields = Object.keys(args.fields).filter(field => !VULNERABILITY_UPDATE_FIELDS.has(field));
      if (unsafeFields.length) {
        throw new ServiceNowError(
          `Vulnerability fields cannot be updated: ${unsafeFields.join(', ')}. Allowed fields: ${[...VULNERABILITY_UPDATE_FIELDS].join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      const result = await client.updateRecord('sn_vul_entry', args.sys_id, args.fields);
      return { ...result, summary: `Updated vulnerability ${args.sys_id}` };
    }
    case 'get_threat_intelligence': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const q = args.type
        ? `type=${queryValue(args.type)}^valueCONTAINS${queryValue(args.query)}`
        : `valueCONTAINS${queryValue(args.query)}`;
      return await client.queryRecords({ table: 'sn_ti_observable', query: q, limit: args.limit ?? 25 });
    }
    case 'list_security_playbooks': {
      // SIR playbooks are Process Automation Designer definitions in the
      // sn_si_aw (Security Incident Analyst Workspace) scope. There is no
      // sn_si_playbook table.
      const parts: string[] = ['sys_scope.scope=sn_si_aw'];
      if (args.active !== false) parts.push('active=true');
      if (args.query) {
        const value = queryValue(args.query);
        parts.push(`labelLIKE${value}^ORnameLIKE${value}`);
      }
      return await client.queryRecords({
        table: 'sys_pd_process_definition',
        query: parts.join('^'),
        limit: args.limit ?? 25,
        fields: 'sys_id,label,name,description,active,process_type,sys_updated_on',
      });
    }
    case 'run_security_playbook': {
      // There is no sn_si_playbook_execution table. SIR playbooks are PAD
      // definitions and the product starts them from server script via
      // sn_playbook.PlaybookExperience.triggerPlaybook(scopedName, parentGr),
      // guarding against a duplicate active execution on the same record
      // (mirrors sn_si_aw.AnalystWorkspaceSIRUtil.startPlaybooks).
      requireWrite();
      requireScripting();
      const playbookRef = String(args.playbook ?? args.playbook_sys_id ?? '').trim();
      if (!playbookRef) throw new ServiceNowError('playbook (sys_id or scoped name) is required', 'INVALID_REQUEST');
      const incidentSysId = String(args.incident_sys_id ?? '').trim();
      if (!SYS_ID_RE.test(incidentSysId)) throw new ServiceNowError('incident_sys_id must be a 32-char hex sys_id', 'INVALID_REQUEST');
      const waitSeconds = args.wait_seconds === undefined ? 0 : Number(args.wait_seconds);
      if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 180) {
        throw new ServiceNowError('wait_seconds must be between 0 and 180', 'VALIDATION_ERROR');
      }

      // The scoped name is interpolated into a server script below, so it is
      // resolved from the instance and shape-checked; free text never reaches it.
      const playbookQuery = SYS_ID_RE.test(playbookRef)
        ? `sys_id=${playbookRef}`
        : `name=${playbookRef.replace(/[\^\0]/g, '')}`;
      const definitions = await client.queryRecords({
        table: 'sys_pd_process_definition',
        query: `${playbookQuery}^sys_scope.scope=sn_si_aw`,
        fields: 'sys_id,name,label,active,status,sys_package.source',
        limit: 1,
      });
      const definition = definitions.records[0] as Record<string, unknown> | undefined;
      if (!definition) throw new ServiceNowError(`No Security Incident Response playbook matches "${playbookRef}" (looked for a sys_pd_process_definition in the sn_si_aw scope)`, 'NOT_FOUND');
      // triggerPlaybook() and sys_pd_context.name both use the fully qualified
      // "<package source>.<name>" form, e.g. sn_si_aw.security_incident_malware_manual_template_v1
      // (the bare name is rejected as "missing or inactive").
      const packageSource = String(definition['sys_package.source'] ?? '');
      const scopedName = `${packageSource}.${String(definition.name)}`;
      if (!/^[a-z0-9_]+\.[a-z0-9_]+$/i.test(scopedName)) throw new ServiceNowError('Unexpected playbook scoped name format', 'API_ERROR');
      const label = String(definition.label ?? definition.name);
      if (String(definition.active) !== 'true' || String(definition.status ?? '') === 'draft') {
        throw new ServiceNowError(`Playbook "${label}" is inactive or still a draft`, 'CONFLICT');
      }

      await client.getRecord('sn_si_incident', incidentSysId); // NOT_FOUND if the incident does not exist

      // Mirrors the product's own duplicate guard: an execution on this record
      // for this playbook that is not finished blocks a second start.
      const activeContextQuery = `input_table=sn_si_incident^input_record=${incidentSysId}^name=${scopedName}^stateNOT INCANCELLED,COMPLETE,ERROR`;
      const contextFields = 'sys_id,name,state,process_definition,input_table,input_record,sys_created_on';
      const existing = await client.queryRecords({ table: 'sys_pd_context', query: activeContextQuery, fields: contextFields, limit: 1 });
      if (existing.records.length) {
        return {
          action: 'already_running',
          playbook: { sys_id: definition.sys_id, name: scopedName, label },
          incident_sys_id: incidentSysId,
          execution: existing.records[0],
          note: 'This playbook already has a queued or in-progress execution on the incident; nothing was started.',
        };
      }

      const runStart = new Date(Date.now() + 70_000).toISOString().slice(0, 19).replace('T', ' ');
      const script = [
        `var parent = new GlideRecord('sn_si_incident');`,
        `if (parent.get('${incidentSysId}')) { sn_playbook.PlaybookExperience.triggerPlaybook('${scopedName}', parent); }`,
      ].join('\n');
      const job = await client.createRecord('sysauto_script', {
        name: `[MCP playbook ${scopedName} on ${incidentSysId}]`,
        active: true,
        run_type: 'once',
        run_start: runStart,
        script,
      });

      // No active execution existed before scheduling (checked above), so any
      // active match that appears now is the one this call started. Not
      // filtering on sys_created_on keeps this independent of the instance's
      // time zone handling of encoded-query date literals.
      let execution: Record<string, unknown> | null = null;
      if (waitSeconds > 0) {
        const deadline = Date.now() + waitSeconds * 1000;
        while (Date.now() < deadline) {
          const found = await client.queryRecords({ table: 'sys_pd_context', query: activeContextQuery, fields: contextFields, limit: 1 });
          if (found.records.length) { execution = found.records[0] as Record<string, unknown>; break; }
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      return {
        action: execution ? 'playbook_started' : 'playbook_scheduled',
        playbook: { sys_id: definition.sys_id, name: scopedName, label },
        incident_sys_id: incidentSysId,
        scheduled_job: { sys_id: (job as any).sys_id, run_start_utc: runStart },
        execution,
        note: execution
          ? 'Execution found in sys_pd_context.'
          : 'The scheduler starts the playbook at run_start_utc. Query sys_pd_context (input_record = incident, name = playbook scoped name) to confirm, or call again with wait_seconds.',
      };
    }
    case 'get_security_dashboard': {
      const days = args.days || 30;
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
      // Ungrouped aggregate queries for exact counts — queryRecords(limit:1).count is
      // always 0 or 1 (records.length capped at the page size), never the real count.
      // This previously made every field in this dashboard always 0 or 1.
      const aggCount = async (table: string, query: string): Promise<number> => {
        const resp = await client.runAggregateQuery(table, undefined, 'COUNT', query);
        return parseInt(String(resp?.stats?.count ?? '0'), 10) || 0;
      };
      const [openHigh, openMed, openLow, vulns, resolved] = await Promise.all([
        aggCount('sn_si_incident', `state!=closed^severity=1`),
        aggCount('sn_si_incident', `state!=closed^severity=2`),
        aggCount('sn_si_incident', `state!=closed^severity=3`),
        aggCount('sn_vul_entry', `state=open`),
        aggCount('sn_si_incident', `state=closed^sys_updated_on>=${since}`),
      ]);
      return { period_days: days, open_incidents: { high: openHigh, medium: openMed, low: openLow }, open_vulnerabilities: vulns, resolved_incidents_period: resolved };
    }
    case 'scan_vulnerabilities': {
      requireWrite();
      if (!args.ci_sys_ids?.length && !args.group) throw new ServiceNowError('ci_sys_ids or group is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sn_vul_scan_request', { ci_list: args.ci_sys_ids?.join(',') || '', group: args.group || '', scan_type: args.scan_type || 'full' });
      return { action: 'scan_requested', ...result };
    }
    default:
      return null;
  }
}
