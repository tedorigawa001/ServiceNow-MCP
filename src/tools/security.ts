/**
 * Security Operations (SecOps) tools — security incidents, vulnerabilities, threat
 * intelligence, and playbooks. GRC tools live in grc-audit.ts / grc-compliance.ts /
 * grc-risk.ts (see docs/GRC_DESIGN.md) — the GRC tools formerly here pointed at
 * tables that don't exist (`sn_compliance_assessment`, `sn_audit_result`) or used
 * a field set that didn't match the real schema (`create_grc_risk`).
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import { randomBytes } from 'node:crypto';
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
      description: 'Create a Vulnerability Response scan (sn_vul_scan) for a set of CIs or Vulnerable Items and hand it to the active scanner integration, the same way the "Initiate Scan" / "Rescan" actions do. Needs an active scanner (sn_vul_scanner, e.g. Qualys/Tenable/Rapid7) unless initiate=false, which leaves a Draft scan to launch from the UI. Runs as a server script in a run-once job (SCRIPTING_ENABLED) because the scan state and target links are not writable through the Table API. **[Write]**',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_ids: { type: 'array', items: { type: 'string' }, description: 'cmdb_ci sys_ids to scan (max 200). Use this or vulnerable_item_sys_ids, not both.' },
          vulnerable_item_sys_ids: { type: 'array', items: { type: 'string' }, description: 'sn_vul_vulnerable_item sys_ids to rescan (max 200)' },
          scanner_sys_id: { type: 'string', description: 'sn_vul_scanner sys_id. Defaults to the active scanner flagged as default.' },
          initiate: { type: 'boolean', description: 'true (default): set the scan to Processing so the scanner integration picks it up. false: leave it in Draft.' },
          wait_seconds: { type: 'number', description: 'How long to wait for the run-once job that creates the scan (0-120, default 30). If it has not run by then the job is left scheduled and scan_scheduled is returned.' },
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

      // The context only appears once the scheduler has run the job. Until then
      // a second call would queue a second job, so also treat a pending job for
      // this incident + playbook as "already scheduled".
      // sysauto_script.name is capped at 100 characters (and the table has no
      // free-text column besides the script), so key the job on the two
      // sys_ids (80 chars) rather than the scoped name; the script itself names
      // the playbook and incident.
      const jobName = `[MCP playbook ${definition.sys_id}:${incidentSysId}]`;
      const pendingJobs = await client.queryRecords({ table: 'sysauto_script', query: `name=${jobName}`, fields: 'sys_id,run_start', limit: 1 });
      if (pendingJobs.records.length) {
        const pending = pendingJobs.records[0] as { sys_id: string; run_start: string };
        return {
          action: 'already_scheduled',
          playbook: { sys_id: definition.sys_id, name: scopedName, label },
          incident_sys_id: incidentSysId,
          scheduled_job: { sys_id: pending.sys_id, run_start_utc: pending.run_start },
          execution: null,
          note: 'A start for this playbook on this incident is already scheduled and has not run yet; nothing new was queued.',
        };
      }

      const runStart = new Date(Date.now() + 70_000).toISOString().slice(0, 19).replace('T', ' ');
      const script = [
        `var parent = new GlideRecord('sn_si_incident');`,
        `if (parent.get('${incidentSysId}')) { sn_playbook.PlaybookExperience.triggerPlaybook('${scopedName}', parent); }`,
      ].join('\n');
      const job = await client.createRecord('sysauto_script', {
        name: jobName,
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
          if (found.records.length) {
            execution = found.records[0] as Record<string, unknown>;
            // The one-time job has done its work; remove it so a later call is
            // judged on sys_pd_context alone rather than a stale pending job.
            await client.deleteRecord('sysauto_script', String((job as any).sys_id)).catch(() => undefined);
            break;
          }
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
      // An on-demand VR scan is not one row: the product (sn_vul.VulnerabilityScanUtil
      // .createScanFromTask) inserts an sn_vul_scan, links its targets through an
      // m2m table (sn_vul_m2m_scan_configuration_item for CIs, sn_vul_m2m_scan_source
      // for Vulnerable Items) and then moves the scan to "processing", which the
      // async "Process scan request" rule hands to the scanner's integration.
      // None of that is reachable through the Table API: sn_sec_cmn_scan.state is
      // dictionary read-only (REST silently keeps "draft") and the m2m write ACL
      // needs sn_vul_scan.state=new, so REST inserts land with blank references.
      // So, like run_security_playbook, the work runs as a server script in a
      // run-once job and reports back through syslog.
      requireWrite();
      requireScripting();
      const parseIds = (value: unknown, label: string): string[] => {
        if (value === undefined || value === null) return [];
        if (!Array.isArray(value)) throw new ServiceNowError(`${label} must be an array of sys_ids`, 'INVALID_REQUEST');
        const ids = [...new Set(value.map((v) => String(v).trim()))];
        if (ids.some((id) => !SYS_ID_RE.test(id))) throw new ServiceNowError(`${label} must contain 32-char hex sys_ids`, 'INVALID_REQUEST');
        if (ids.length > 200) throw new ServiceNowError(`${label} is limited to 200 sys_ids per scan`, 'VALIDATION_ERROR');
        return ids;
      };
      const ciIds = parseIds(args.ci_sys_ids, 'ci_sys_ids');
      const viIds = parseIds(args.vulnerable_item_sys_ids, 'vulnerable_item_sys_ids');
      if (!ciIds.length && !viIds.length) throw new ServiceNowError('ci_sys_ids or vulnerable_item_sys_ids is required', 'INVALID_REQUEST');
      if (ciIds.length && viIds.length) throw new ServiceNowError('Pass either ci_sys_ids or vulnerable_item_sys_ids, not both (a scan has one source table)', 'INVALID_REQUEST');
      const initiate = args.initiate !== false;
      const waitSeconds = args.wait_seconds === undefined ? 30 : Number(args.wait_seconds);
      if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 120) {
        throw new ServiceNowError('wait_seconds must be between 0 and 120', 'VALIDATION_ERROR');
      }

      // Target shape, mirroring the product's per-source-table m2m choice.
      const target = ciIds.length
        ? { table: 'cmdb_ci', ids: ciIds, m2mTable: 'sn_vul_m2m_scan_configuration_item', m2mField: 'cmdb_ci', label: 'CI' }
        : { table: 'sn_vul_vulnerable_item', ids: viIds, m2mTable: 'sn_vul_m2m_scan_source', m2mField: 'source', label: 'Vulnerable Item' };

      // Scanner: explicit sys_id, else the active default. processScanRequest()
      // errors the scan out without one, so refuse to initiate rather than
      // create a scan that immediately lands in "error".
      let scanner: Record<string, unknown> | undefined;
      const scannerFields = 'sys_id,name,active,default,integration,integration.name';
      if (args.scanner_sys_id !== undefined) {
        const scannerSysId = String(args.scanner_sys_id).trim();
        if (!SYS_ID_RE.test(scannerSysId)) throw new ServiceNowError('scanner_sys_id must be a 32-char hex sys_id', 'INVALID_REQUEST');
        const found = await client.queryRecords({ table: 'sn_vul_scanner', query: `sys_id=${scannerSysId}`, fields: scannerFields, limit: 1 });
        scanner = found.records[0] as Record<string, unknown> | undefined;
        if (!scanner) throw new ServiceNowError(`No sn_vul_scanner record with sys_id ${scannerSysId}`, 'NOT_FOUND');
        if (String(scanner.active) !== 'true') throw new ServiceNowError(`Scanner "${String(scanner.name)}" is inactive`, 'CONFLICT');
      } else {
        const found = await client.queryRecords({ table: 'sn_vul_scanner', query: 'active=true^default=true', fields: scannerFields, limit: 1 });
        scanner = found.records[0] as Record<string, unknown> | undefined;
        if (!scanner && initiate) {
          throw new ServiceNowError('No active default scanner is configured (sn_vul_scanner). Vulnerability Response can only launch scans through a scanner integration such as Qualys, Tenable or Rapid7; pass scanner_sys_id, or initiate=false to create a Draft scan.', 'CONFLICT');
        }
      }
      const scannerSysId = scanner ? String(scanner.sys_id) : '';

      // Every target must exist; a silently dropped sys_id would scan less than asked.
      const existing = await client.queryRecords({ table: target.table, query: `sys_idIN${target.ids.join(',')}`, fields: 'sys_id', limit: target.ids.length });
      const existingIds = new Set((existing.records as Array<{ sys_id: string }>).map((r) => r.sys_id));
      const missing = target.ids.filter((id) => !existingIds.has(id));
      if (missing.length) throw new ServiceNowError(`${missing.length} ${target.label} sys_id(s) do not exist on ${target.table}: ${missing.join(', ')}`, 'NOT_FOUND');

      // Product guard (getRunningScanId): a target already in a scan that is
      // queued, processing or scanning is not scanned twice.
      const running = await client.queryRecords({
        table: target.m2mTable,
        query: `${target.m2mField}IN${target.ids.join(',')}^sn_vul_scan.stateINprocessing,scanning,queued`,
        fields: `sn_vul_scan,sn_vul_scan.number,sn_vul_scan.state,${target.m2mField}`,
        limit: 1,
      });
      if (running.records.length) {
        const hit = running.records[0] as Record<string, unknown>;
        const scanRef = hit.sn_vul_scan as { value?: string } | string;
        return {
          action: 'already_running',
          scan: { sys_id: typeof scanRef === 'object' ? scanRef?.value : scanRef, number: hit['sn_vul_scan.number'], state: hit['sn_vul_scan.state'] },
          blocking_target: hit[target.m2mField],
          note: `At least one ${target.label} is already in a scan that has not finished; nothing was created.`,
        };
      }

      // Everything interpolated below is shape-checked: hex sys_ids, a hex
      // token and fixed table/field names. The script reports through syslog
      // because sysauto_script has no free-text column to write back into.
      const token = `mcp-scan-${randomBytes(16).toString('hex')}`;
      const script = [
        `var token = '${token}';`,
        `var out = {};`,
        `try {`,
        `  var scan = new GlideRecord('sn_vul_scan');`,
        `  scan.initialize();`,
        `  scan.setValue('source_table', '${target.table}');`,
        `  scan.setValue('state', 'draft');`,
        scannerSysId ? `  scan.setValue('scanner', '${scannerSysId}');` : `  // no scanner: draft only`,
        `  var scanId = scan.insert();`,
        `  if (!scanId) throw new Error('sn_vul_scan insert was rejected');`,
        `  var ids = '${target.ids.join(',')}'.split(',');`,
        `  var linked = 0;`,
        `  for (var i = 0; i < ids.length; i++) {`,
        `    var link = new GlideRecord('${target.m2mTable}');`,
        `    link.initialize();`,
        `    link.setValue('sn_vul_scan', scanId);`,
        `    link.setValue('${target.m2mField}', ids[i]);`,
        `    if (link.insert()) linked++;`,
        `  }`,
        initiate ? `  scan.setValue('state', 'processing');\n  scan.update();` : `  // initiate=false: leave the scan in draft`,
        `  out = { scan_sys_id: scanId, number: scan.getValue('number'), state: scan.getValue('state'), linked: linked };`,
        `} catch (e) { out = { error: String(e && e.message ? e.message : e) }; }`,
        `gs.info(token + ' RESULT:' + JSON.stringify(out));`,
      ].join('\n');
      const runStart = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' ');
      const job = await client.createRecord('sysauto_script', {
        name: `[MCP scan ${token}]`,
        active: true,
        run_type: 'once',
        run_start: runStart,
        script,
      }) as Record<string, unknown>;
      const jobSysId = String(job.sys_id);

      const scanSummary = { source_table: target.table, target_count: target.ids.length, scanner: scanner ? { sys_id: scanner.sys_id, name: scanner.name, integration: scanner['integration.name'] ?? scanner.integration } : null };
      const deadline = Date.now() + waitSeconds * 1000;
      let result: Record<string, unknown> | undefined;
      for (;;) {
        const logs = await client.queryRecords({ table: 'syslog', query: `messageSTARTSWITH${token} RESULT:`, fields: 'message', limit: 1 });
        const message = String((logs.records[0] as { message?: string } | undefined)?.message ?? '');
        if (message) {
          try { result = JSON.parse(message.slice(message.indexOf('RESULT:') + 'RESULT:'.length)) as Record<string, unknown>; } catch { result = { error: `Unparseable job output: ${message}` }; }
          break;
        }
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(3000, Math.max(250, deadline - Date.now()))));
      }
      if (!result) {
        return {
          action: 'scan_scheduled',
          ...scanSummary,
          scheduled_job: { sys_id: jobSysId, name: `[MCP scan ${token}]`, run_start_utc: runStart },
          scan: null,
          note: `The job that creates the scan had not run within ${waitSeconds}s (the instance scheduler decides when). Its result will appear in syslog as "${token} RESULT:{...}"; the sn_vul_scan will carry these targets in ${target.m2mTable}.`,
        };
      }
      await client.deleteRecord('sysauto_script', jobSysId).catch(() => undefined);
      if (result.error) throw new ServiceNowError(`The scan job failed on the instance: ${String(result.error)}`, 'API_ERROR');
      const scanSysId = String(result.scan_sys_id ?? '');
      const scan = SYS_ID_RE.test(scanSysId)
        ? await client.getRecord('sn_vul_scan', scanSysId, 'sys_id,number,state,status_message,source_table,scanner').catch(() => undefined)
        : undefined;
      return {
        action: initiate ? 'scan_initiated' : 'scan_drafted',
        ...scanSummary,
        linked_targets: Number(result.linked ?? 0),
        scan: scan ?? { sys_id: scanSysId, number: result.number, state: result.state },
        note: initiate
          ? 'The scan is handed to the scanner integration by the async "Process scan request" rule. Poll sn_vul_scan.state: queued/scanning → complete, or error with status_message.'
          : 'Draft scan created with its targets linked. Launch it with "Initiate Scan" on the record, or call again with initiate=true once a scanner is configured.',
      };
    }
    default:
      return null;
  }
}
