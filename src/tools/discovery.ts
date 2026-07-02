/**
 * Discovery & ACC (Agent Client Collector) tools — run history, per-device
 * results, logs, IP ranges, credential metadata, MID Server health, and
 * ACC agent/policy/check visibility.
 *
 * Tier 0 (Read): list_discovery_runs, get_discovery_run, list_discovered_devices,
 *                 list_discovery_logs, list_discovery_ranges, list_discovery_credentials,
 *                 list_mid_server_issues, get_mid_server_health,
 *                 list_acc_agents, list_acc_policies, list_acc_checks
 *
 * ServiceNow tables: discovery_status, discovery_device_history, discovery_log,
 *                     discovery_range_item, discovery_credentials,
 *                     ecc_agent, ecc_agent_issue, ecc_queue,
 *                     sn_agent_cmdb_ci_agent, sn_agent_policy, sn_agent_check (ACC plugin)
 *
 * Complements core.ts (list_discovery_schedules, list_mid_servers, run_discovery_scan):
 * this module covers what happened AFTER a scan is triggered — results, errors,
 * and infrastructure health.
 *
 * Note: list_discovery_credentials returns metadata only (name/type/order/scope) —
 * secret fields (password, ssh_private_key, ...) are never requested.
 * ACC tools require the Agent Client Collector plugin; without it they raise a
 * clear PLUGIN_NOT_INSTALLED error instead of a generic 400.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;

/** ACC tables only exist when the Agent Client Collector plugin is installed. */
async function queryAccTable(
  client: ServiceNowClient,
  params: Parameters<ServiceNowClient['queryRecords']>[0]
): Promise<any> {
  try {
    return await client.queryRecords(params);
  } catch (e: any) {
    const msg = String(e?.message ?? '');
    if (/invalid table|not authorized|400/i.test(msg)) {
      throw new ServiceNowError(
        `Table "${params.table}" is unavailable — the Agent Client Collector (ACC) plugin ` +
          'does not appear to be installed on this instance.',
        'PLUGIN_NOT_INSTALLED'
      );
    }
    throw e;
  }
}

export function getDiscoveryToolDefinitions() {
  return [
    {
      name: 'list_discovery_runs',
      description: 'List Discovery run history (discovery_status) — state, duration, and progress per scan, newest first',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by run state (e.g. "Active", "Complete", "Cancelled")' },
          query: { type: 'string', description: 'Additional encoded query' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_discovery_run',
      description: 'Get one Discovery run by sys_id or number (DIS...), including full status fields',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'discovery_status sys_id or number (e.g. "DIS0001001")' },
        },
        required: ['run_id'],
      },
    },
    {
      name: 'list_discovered_devices',
      description: 'List per-device Discovery results (discovery_device_history) — classification, resulting CI, and issue count. Use to answer "why was this server not discovered?"',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'Filter by parent discovery_status sys_id or number' },
          with_issues_only: { type: 'boolean', description: 'Only devices that reported issues' },
          source: { type: 'string', description: 'Filter by device IP / source (LIKE match)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_discovery_logs',
      description: 'List Discovery log entries (discovery_log) — sensor/probe messages with result codes, newest first',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'Filter by parent discovery_status sys_id' },
          device_history_id: { type: 'string', description: 'Filter by discovery_device_history sys_id' },
          query: { type: 'string', description: 'Additional encoded query (e.g. "short_messageLIKEcredential")' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_discovery_ranges',
      description: 'List Discovery IP ranges (discovery_range_item) — which IP ranges/networks are scanned',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active flag' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_discovery_credentials',
      description: 'List Discovery credential METADATA (name, type, order, MID scope) — secret fields are never returned',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Filter by credential type (e.g. "Windows", "SSH", "SNMP")' },
          active: { type: 'boolean', description: 'Filter by active flag' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_mid_server_issues',
      description: 'List MID Server issues (ecc_agent_issue) — detected problems with source, occurrence count, and last-detected time',
      inputSchema: {
        type: 'object',
        properties: {
          mid_server: { type: 'string', description: 'Filter by MID Server name or sys_id' },
          state: { type: 'string', description: 'Filter by issue state (e.g. "New", "Resolved")' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_mid_server_health',
      description: 'MID Server health summary — status, version, last refresh, open issues, and output-queue backlog sample',
      inputSchema: {
        type: 'object',
        properties: {
          mid_server: { type: 'string', description: 'MID Server name or sys_id' },
        },
        required: ['mid_server'],
      },
    },
    {
      name: 'list_acc_agents',
      description: 'List ACC (Agent Client Collector) agents and their status. Requires the ACC plugin',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by agent status (e.g. "up", "down")' },
          query: { type: 'string', description: 'Additional encoded query' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_acc_policies',
      description: 'List ACC monitoring/check policies. Requires the ACC plugin',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter by active flag' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_acc_checks',
      description: 'List ACC check definitions. Requires the ACC plugin',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeDiscoveryToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_discovery_runs': {
      let query = '';
      if (args.state) query = `state=${args.state}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      query = query ? `${query}^ORDERBYDESCsys_created_on` : 'ORDERBYDESCsys_created_on';
      const resp = await client.queryRecords({
        table: 'discovery_status',
        query,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,number,state,description,dscheduler,source,started,completed,duration,progress,max_run,sys_created_on',
      });
      return { count: resp.count, runs: resp.records };
    }

    case 'get_discovery_run': {
      if (!args.run_id) throw new ServiceNowError('run_id is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.run_id)) {
        return await client.getRecord('discovery_status', args.run_id);
      }
      const resp = await client.queryRecords({
        table: 'discovery_status',
        query: `number=${args.run_id}`,
        limit: 1,
        display_value: true,
      });
      if (resp.count === 0) throw new ServiceNowError(`Discovery run not found: ${args.run_id}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'list_discovered_devices': {
      let query = '';
      if (args.run_id) {
        const statusRef = SYS_ID_RE.test(args.run_id) ? `status=${args.run_id}` : `status.number=${args.run_id}`;
        query = statusRef;
      }
      if (args.with_issues_only) query = query ? `${query}^issues>0` : 'issues>0';
      if (args.source) query = query ? `${query}^sourceLIKE${args.source}` : `sourceLIKE${args.source}`;
      query = query ? `${query}^ORDERBYDESCsys_created_on` : 'ORDERBYDESCsys_created_on';
      const resp = await client.queryRecords({
        table: 'discovery_device_history',
        query,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,source,dns_name,scan_status,current_state,last_state,classified_as,cmdb_ci,issues,issues_link,started,completed,status',
      });
      return { count: resp.count, devices: resp.records };
    }

    case 'list_discovery_logs': {
      let query = '';
      if (args.run_id) query = `status=${args.run_id}`;
      if (args.device_history_id) query = query ? `${query}^device_history=${args.device_history_id}` : `device_history=${args.device_history_id}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      query = query ? `${query}^ORDERBYDESCcreated_on` : 'ORDERBYDESCcreated_on';
      const resp = await client.queryRecords({
        table: 'discovery_log',
        query,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,created_on,short_message,result_code,sensor,cmdb_ci,device_history,status',
      });
      return { count: resp.count, logs: resp.records };
    }

    case 'list_discovery_ranges': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      const resp = await client.queryRecords({
        table: 'discovery_range_item',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,name,type,active,start_ip_address,end_ip_address,network_ip,netmask,parent,summary',
      });
      return { count: resp.count, ranges: resp.records };
    }

    case 'list_discovery_credentials': {
      let query = '';
      if (args.type) query = `type=${args.type}`;
      if (args.active !== undefined) query = query ? `${query}^active=${args.active}` : `active=${args.active}`;
      const resp = await client.queryRecords({
        table: 'discovery_credentials',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        // Metadata only — never request password / ssh_private_key / authentication_key etc.
        fields: 'sys_id,name,type,sys_class_name,active,order,applies_to,user_name,classification,tag,sys_updated_on',
      });
      return { count: resp.count, credentials: resp.records };
    }

    case 'list_mid_server_issues': {
      let query = '';
      if (args.mid_server) {
        query = SYS_ID_RE.test(args.mid_server)
          ? `mid_server=${args.mid_server}`
          : `mid_server.name=${args.mid_server}`;
      }
      if (args.state) query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
      query = query ? `${query}^ORDERBYDESClast_detected` : 'ORDERBYDESClast_detected';
      const resp = await client.queryRecords({
        table: 'ecc_agent_issue',
        query,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,mid_server,message,source,state,count,last_detected,sys_created_on',
      });
      return { count: resp.count, issues: resp.records };
    }

    case 'get_mid_server_health': {
      if (!args.mid_server) throw new ServiceNowError('mid_server is required', 'INVALID_REQUEST');
      const midQuery = SYS_ID_RE.test(args.mid_server)
        ? `sys_id=${args.mid_server}`
        : `name=${args.mid_server}`;
      const midResp = await client.queryRecords({
        table: 'ecc_agent',
        query: midQuery,
        limit: 1,
        display_value: true,
        fields: 'sys_id,name,status,version,ip_address,host_name,last_refreshed,started,stopped,validated,unresolved_issues,timezone,host_os_distribution,host_os_version',
      });
      if (midResp.count === 0) throw new ServiceNowError(`MID Server not found: ${args.mid_server}`, 'NOT_FOUND');
      const mid = midResp.records[0];

      const issuesResp = await client.queryRecords({
        table: 'ecc_agent_issue',
        query: `mid_server=${mid.sys_id}^state!=Resolved^ORDERBYDESClast_detected`,
        limit: 25,
        display_value: true,
        fields: 'sys_id,message,source,state,count,last_detected',
      });

      // Output-queue backlog: jobs handed to this MID that it has not picked up yet.
      // Sampled (capped at 100) — queryRecords count is page size, not a table count.
      const backlogResp = await client.queryRecords({
        table: 'ecc_queue',
        query: `agent=mid.server.${mid.name}^queue=output^state=ready`,
        limit: 100,
        fields: 'sys_id',
      });

      return {
        mid_server: mid,
        open_issue_count: issuesResp.count,
        open_issues: issuesResp.records,
        output_queue_backlog_sample: backlogResp.count,
        output_queue_backlog_note: backlogResp.count >= 100 ? '100+ (sample capped at 100)' : String(backlogResp.count),
      };
    }

    case 'list_acc_agents': {
      let query = '';
      if (args.status) query = `status=${args.status}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await queryAccTable(client, {
        table: 'sn_agent_cmdb_ci_agent',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
      });
      return { count: resp.count, agents: resp.records };
    }

    case 'list_acc_policies': {
      let query = '';
      if (args.active !== undefined) query = `active=${args.active}`;
      const resp = await queryAccTable(client, {
        table: 'sn_agent_policy',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
      });
      return { count: resp.count, policies: resp.records };
    }

    case 'list_acc_checks': {
      const resp = await queryAccTable(client, {
        table: 'sn_agent_check',
        query: args.query || undefined,
        limit: args.limit || 25,
        display_value: true,
      });
      return { count: resp.count, checks: resp.records };
    }

    default:
      return null;
  }
}
