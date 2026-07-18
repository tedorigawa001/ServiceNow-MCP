/**
 * Core platform tools – the original 15 tools migrated from tools/index.ts.
 * These are always available (Tier 0).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import type {
  QueryRecordsParams,
  GetRecordParams,
  SearchCmdbCiParams,
  GetCmdbCiParams,
  ListRelationshipsParams,
  ListDiscoverySchedulesParams,
  ListMidServersParams,
  ListActiveEventsParams,
  ServiceMappingSummaryParams,
} from '../servicenow/types.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireCmdbWrite, requireWrite } from '../utils/permissions.js';

export function getCoreToolDefinitions() {
  return [
    {
      name: 'query_records',
      description: 'Query ServiceNow records with filtering, field selection, pagination, and sorting',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (e.g., "incident", "change_request")' },
          query: { type: 'string', description: 'Encoded query string (e.g., "active=true^priority=1")' },
          fields: { type: 'string', description: 'Comma-separated fields to return' },
          limit: { type: 'number', description: 'Max records (default: 10, max: 1000)' },
          orderBy: { type: 'string', description: 'Field to sort by. Prefix with "-" for descending' },
          display_value: {
            description: 'Return human-readable values for reference/choice fields. true = display values only ({display_value, link}); "all" = both raw and display ({value, display_value, link}). Omit for raw sys_id/values.',
            oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }],
          },
        },
        required: ['table'],
      },
    },
    {
      name: 'get_table_schema',
      description: 'Get the structure and field information for a ServiceNow table',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to inspect' },
        },
        required: ['table'],
      },
    },
    {
      name: 'get_record',
      description: 'Retrieve complete details of a specific record by sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          sys_id: { type: 'string', description: '32-character system ID' },
          fields: { type: 'string', description: 'Optional comma-separated fields' },
        },
        required: ['table', 'sys_id'],
      },
    },
    {
      name: 'get_user',
      description: 'Look up user details by email or username',
      inputSchema: {
        type: 'object',
        properties: {
          user_identifier: { type: 'string', description: 'Email address or username' },
        },
        required: ['user_identifier'],
      },
    },
    {
      name: 'get_group',
      description: 'Find assignment group details by name or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          group_identifier: { type: 'string', description: 'Group name or sys_id' },
        },
        required: ['group_identifier'],
      },
    },
    {
      name: 'search_cmdb_ci',
      description: 'Search for configuration items (CIs) in the CMDB',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query (e.g., "sys_class_name=cmdb_ci_server")' },
          limit: { type: 'number', description: 'Max CIs (default: 10, max: 100)' },
        },
        required: [],
      },
    },
    {
      name: 'get_cmdb_ci',
      description: 'Get complete information about a specific configuration item',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_id: { type: 'string', description: 'System ID of the CI' },
          fields: { type: 'string', description: 'Optional comma-separated fields' },
        },
        required: ['ci_sys_id'],
      },
    },
    {
      name: 'list_relationships',
      description: 'Show parent and child relationships for a CI',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_id: { type: 'string', description: 'System ID of the CI' },
        },
        required: ['ci_sys_id'],
      },
    },
    {
      name: 'list_discovery_schedules',
      description: 'List discovery schedules and their run status',
      inputSchema: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Only show active schedules' },
        },
        required: [],
      },
    },
    {
      name: 'list_mid_servers',
      description: 'List MID servers and verify they are healthy',
      inputSchema: {
        type: 'object',
        properties: {
          active_only: { type: 'boolean', description: 'Only show servers with status "Up"' },
        },
        required: [],
      },
    },
    {
      name: 'list_active_events',
      description: 'Monitor critical infrastructure events',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Filter events (e.g., "severity=1")' },
          limit: { type: 'number', description: 'Max events (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'cmdb_health_dashboard',
      description: 'Get CMDB data quality metrics (completeness of server and network CI data)',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'service_mapping_summary',
      description: 'View service dependencies and related CIs for impact analysis',
      inputSchema: {
        type: 'object',
        properties: {
          service_sys_id: { type: 'string', description: 'System ID of the business service' },
        },
        required: ['service_sys_id'],
      },
    },
    {
      name: 'natural_language_search',
      description: 'Search ServiceNow using plain English (experimental)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Plain English query' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'natural_language_update',
      description: 'Update a record using natural language (experimental, requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'Natural language update instruction' },
          table: { type: 'string', description: 'Table name' },
        },
        required: ['instruction', 'table'],
      },
    },
    {
      name: 'list_instances',
      description: 'List all configured ServiceNow instances (multi-instance / multi-customer support)',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'switch_instance',
      description: 'Switch the active ServiceNow instance for this session',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Instance name as configured (e.g. "prod", "dev", "customer_a")' },
        },
        required: ['name'],
      },
    },
    {
      name: 'get_current_instance',
      description: 'Get the currently active ServiceNow instance name and URL',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'create_ci_relationship',
      description: '[CMDB Write] Create a relationship between two CMDB Configuration Items',
      inputSchema: {
        type: 'object',
        properties: {
          parent: { type: 'string', description: 'Parent CI sys_id' },
          child: { type: 'string', description: 'Child CI sys_id' },
          type: { type: 'string', description: 'Relationship type (e.g. "Runs on::Runs")' },
        },
        required: ['parent', 'child', 'type'],
      },
    },
    {
      name: 'cmdb_impact_analysis',
      description: 'Analyze the downstream impact of a Configuration Item change or outage',
      inputSchema: {
        type: 'object',
        properties: {
          ci_sys_id: { type: 'string', description: 'CI sys_id to analyze' },
          depth: { type: 'number', description: 'Relationship depth to traverse (default: 2)' },
        },
        required: ['ci_sys_id'],
      },
    },
    {
      name: 'run_discovery_scan',
      description: '[CMDB Write] Trigger a ServiceNow Discovery scan for network/infrastructure',
      inputSchema: {
        type: 'object',
        properties: {
          schedule_id: { type: 'string', description: 'Discovery schedule sys_id to run' },
          mid_server: { type: 'string', description: 'Optional MID server sys_id — pins the schedule to this specific MID' },
        },
        required: ['schedule_id'],
      },
    },
    {
      name: 'describe_table',
      description: 'Return full field schema for a ServiceNow table using sys_dictionary — includes field types, reference targets, mandatory/unique flags, and parent table. More accurate than get_table_schema for empty tables or custom tables.',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to inspect (e.g. "incident", "sn_vul_vulnerable_item")' },
          include_inherited: { type: 'boolean', description: 'Include fields inherited from parent tables (default: false)' },
        },
        required: ['table'],
      },
    },
    {
      name: 'check_table_access',
      description:
        'Diagnose the connected service account\'s effective access to one or more tables BEFORE attempting operations. Returns per-table readable/writable flags plus a status that distinguishes WHY access failed: "not_installed" (Invalid table — the table does not exist, e.g. plugin/app not installed), "no_access" (403 — table exists but ACL denies this account), "empty" (readable but zero rows — truly empty or ACL row filtering), or "accessible". Also returns the account\'s current user and assigned roles. Read is probed with a sysparm_limit=1 GET; write is probed non-destructively with an empty PATCH to a reserved all-zero sys_id (404=writable, 403=denied) — no record is ever created or modified. Useful to check whether a plugin is installed and to avoid "User Not Authorized" retries.',
      inputSchema: {
        type: 'object',
        properties: {
          tables: {
            type: 'array',
            items: { type: 'string' },
            description: 'Table names to check (max 20), e.g. ["incident", "sn_vul_vulnerable_item"]',
          },
          check_write: {
            type: 'boolean',
            description: 'Also probe write access via a non-destructive empty PATCH (default: true)',
          },
        },
        required: ['tables'],
      },
    },
    {
      name: 'get_integration_health',
      description:
        'Report the health of Vulnerability Response data integration runs (sn_vul_integration_run) over a recent window. Surfaces failed runs and — critically — silent stalls where no runs occurred at all (e.g. an NVD/Qualys feed quietly failing with 503/429). Returns success/failure counts, the most recent success and failure timestamps, recent run details, and actionable alerts.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Look back this many days (default: 7, max: 365)' },
          source: { type: 'string', description: 'Filter to a single integration source, e.g. "NVD", "Qualys", "Tenable" (default: all)' },
        },
      },
    },
  ];
}

export async function executeCoreToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'query_records': {
      const params = args as QueryRecordsParams;
      if (!params.table) throw new ServiceNowError('Table name is required', 'INVALID_REQUEST');
      const response = await client.queryRecords(params);
      return { count: response.count, records: response.records, summary: `Found ${response.count} record(s) in "${params.table}"` };
    }
    case 'get_table_schema':
      if (!args.table) throw new ServiceNowError('Table name is required', 'INVALID_REQUEST');
      return await client.getTableSchema(args.table);

    case 'get_record': {
      const p = args as GetRecordParams;
      if (!p.table || !p.sys_id) throw new ServiceNowError('table and sys_id are required', 'INVALID_REQUEST');
      return await client.getRecord(p.table, p.sys_id, p.fields);
    }
    case 'get_user':
      if (!args.user_identifier) throw new ServiceNowError('user_identifier is required', 'INVALID_REQUEST');
      return await client.getUser(args.user_identifier);

    case 'get_group':
      if (!args.group_identifier) throw new ServiceNowError('group_identifier is required', 'INVALID_REQUEST');
      return await client.getGroup(args.group_identifier);

    case 'search_cmdb_ci':
      return await client.searchCmdbCi((args as SearchCmdbCiParams).query, (args as SearchCmdbCiParams).limit);

    case 'get_cmdb_ci': {
      const p = args as GetCmdbCiParams;
      if (!p.ci_sys_id) throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
      return await client.getCmdbCi(p.ci_sys_id, p.fields);
    }
    case 'list_relationships': {
      const p = args as ListRelationshipsParams;
      if (!p.ci_sys_id) throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
      return await client.listRelationships(p.ci_sys_id);
    }
    case 'list_discovery_schedules':
      return await client.listDiscoverySchedules((args as ListDiscoverySchedulesParams).active_only);

    case 'list_mid_servers':
      return await client.listMidServers((args as ListMidServersParams).active_only);

    case 'list_active_events':
      return await client.listActiveEvents((args as ListActiveEventsParams).query, (args as ListActiveEventsParams).limit);

    case 'cmdb_health_dashboard':
      return await client.cmdbHealthDashboard();

    case 'service_mapping_summary': {
      const p = args as ServiceMappingSummaryParams;
      if (!p.service_sys_id) throw new ServiceNowError('service_sys_id is required', 'INVALID_REQUEST');
      return await client.serviceMappingSummary(p.service_sys_id);
    }
    case 'natural_language_search':
      return await client.naturalLanguageSearch(args.query, args.limit);

    case 'natural_language_update':
      requireWrite();
      return await client.naturalLanguageUpdate(args.instruction, args.table);

    case 'create_ci_relationship': {
      requireCmdbWrite();
      if (!args.parent || !args.child || !args.type)
        throw new ServiceNowError('parent, child, and type are required', 'INVALID_REQUEST');
      const result = await client.createRecord('cmdb_rel_ci', {
        parent: args.parent,
        child: args.child,
        type: args.type,
      });
      return { ...result, summary: `Created CI relationship: ${args.parent} -> ${args.child} (${args.type})` };
    }

    case 'cmdb_impact_analysis': {
      if (!args.ci_sys_id) throw new ServiceNowError('ci_sys_id is required', 'INVALID_REQUEST');
      if (!/^[0-9a-f]{32}$/i.test(args.ci_sys_id)) {
        throw new ServiceNowError('ci_sys_id must be a 32-character hex string', 'VALIDATION_ERROR');
      }
      const maxDepth = args.depth || 2;
      const visited = new Set<string>();
      const impactTree: any[] = [];

      async function traverse(ciSysId: string, currentDepth: number): Promise<any[]> {
        if (currentDepth > maxDepth || visited.has(ciSysId)) return [];
        visited.add(ciSysId);
        const resp = await client.queryRecords({
          table: 'cmdb_rel_ci',
          query: `parent=${ciSysId}`,
          fields: 'sys_id,child,type,parent',
          limit: 100,
        });
        const children: any[] = [];
        for (const rel of resp.records) {
          const childId = typeof rel.child === 'object' ? (rel.child as any).value : rel.child;
          const downstream = await traverse(childId, currentDepth + 1);
          children.push({ relationship: rel, downstream });
        }
        return children;
      }

      const downstream = await traverse(args.ci_sys_id, 1);
      impactTree.push({ ci_sys_id: args.ci_sys_id, depth: maxDepth, downstream });
      return { impact_analysis: impactTree, total_impacted: visited.size - 1 };
    }

    case 'run_discovery_scan': {
      if (!args.schedule_id) throw new ServiceNowError('schedule_id is required', 'INVALID_REQUEST');
      requireCmdbWrite();
      // Inserting a discovery_status record directly does NOT launch any probes
      // (verified live: the record sits at state=Active with zero probes and the
      // MID never receives a Shazzam job). The Discovery engine only starts runs
      // created by the scheduler or the Discover Now UI action, so the REST-safe
      // trigger is to flip the schedule itself to run once, a few seconds from now.
      const runStart = new Date(Date.now() + 10_000).toISOString().replace('T', ' ').slice(0, 19);
      const payload: Record<string, any> = { run_type: 'once', run_start: runStart };
      if (args.mid_server) {
        payload.mid_select_method = 'specific_mid';
        payload.mid_server = args.mid_server;
      }
      await client.updateRecord('discovery_schedule', args.schedule_id, payload);
      // Discovery.isValidDiscoverySchedule aborts SILENTLY (no status record, no error)
      // when an IP-based schedule has no active range linked via the `schedule` field
      // on discovery_range_item (NOT `parent`, which links range sets). Surface that
      // trap here instead of leaving the caller waiting for a run that never starts.
      const ranges = await client.queryRecords({
        table: 'discovery_range_item',
        query: `schedule=${args.schedule_id}^active=true`,
        limit: 1,
        fields: 'sys_id',
      });
      const rangeWarning =
        ranges.count === 0
          ? 'Warning: no active discovery_range_item is linked to this schedule via the "schedule" field. ' +
            'IP-based schedules (discover=CIs/IPs) abort silently without one.'
          : undefined;
      return {
        action: 'triggered',
        schedule_id: args.schedule_id,
        run_start_utc: runStart,
        active_range_count: ranges.count,
        ...(rangeWarning ? { warning: rangeWarning } : {}),
        summary:
          `Discovery schedule ${args.schedule_id} set to run once at ${runStart} UTC. ` +
          'The run appears in discovery_status shortly after; note the schedule run_type is now "once".',
      };
    }

    case 'describe_table': {
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      const tableName: string = args.table;
      const includeInherited: boolean = args.include_inherited === true;

      // Fetch table metadata from sys_db_object
      const dbObjResp = await client.queryRecords({
        table: 'sys_db_object',
        query: `name=${tableName}`,
        fields: 'name,label,super_class',
        limit: 1,
      });
      if (dbObjResp.count === 0) {
        throw new ServiceNowError(`Table "${tableName}" not found in sys_db_object`, 'NOT_FOUND');
      }
      const dbObj = dbObjResp.records[0];

      // super_class returns {value: sys_id, link: ...} — resolve to table name via a second query
      let parentTable: string | undefined;
      const superClassSysId =
        dbObj.super_class && typeof dbObj.super_class === 'object'
          ? (dbObj.super_class as any).value || undefined
          : undefined;
      if (includeInherited && superClassSysId) {
        const parentResp = await client.queryRecords({
          table: 'sys_db_object',
          query: `sys_id=${superClassSysId}`,
          fields: 'name',
          limit: 1,
        });
        parentTable = parentResp.records[0]?.name as string | undefined;
      }

      // Determine which tables to fetch fields for
      const tables = [tableName];
      if (includeInherited && parentTable) {
        tables.push(parentTable);
      }

      const allFields: any[] = [];
      for (const t of tables) {
        const dictResp = await client.queryRecords({
          table: 'sys_dictionary',
          query: `name=${t}^internal_type!=collection^element!=NULL`,
          fields: 'element,column_label,internal_type,reference,mandatory,unique,name',
          limit: 500,
        });
        for (const row of dictResp.records) {
          // ServiceNow Table API returns reference/choice fields as {value, link} objects
          const strVal = (v: unknown): string =>
            v && typeof v === 'object' ? ((v as any).value ?? '') : (v as string) ?? '';

          const refValue = strVal(row.reference) || undefined;
          const internalType = strVal(row.internal_type);
          const element = strVal(row.element);
          const columnLabel = strVal(row.column_label) || element;
          const definedIn = strVal(row.name) || t;

          allFields.push({
            element,
            column_label: columnLabel,
            type: internalType,
            ...(refValue ? { reference: refValue } : {}),
            mandatory: row.mandatory === 'true' || row.mandatory === true,
            unique: row.unique === 'true' || row.unique === true,
            ...(includeInherited ? { defined_in: definedIn } : {}),
          });
        }
      }

      allFields.sort((a, b) => a.element.localeCompare(b.element));

      return {
        table: tableName,
        label: dbObj.label || tableName,
        ...(parentTable ? { parent_table: parentTable } : {}),
        field_count: allFields.length,
        fields: allFields,
        summary: `Table "${tableName}" has ${allFields.length} field(s)${includeInherited && parentTable ? ` (includes inherited from "${parentTable}")` : ''}`,
      };
    }

    case 'check_table_access': {
      const tables: unknown = args.tables;
      if (!Array.isArray(tables) || tables.length === 0) {
        throw new ServiceNowError('tables must be a non-empty array of table names', 'INVALID_REQUEST');
      }
      if (tables.length > 20) {
        throw new ServiceNowError('tables is limited to 20 entries per call', 'INVALID_REQUEST');
      }
      const checkWrite: boolean = args.check_write !== false;
      const ZERO_SYS_ID = '0'.repeat(32);

      const strVal = (v: unknown): string =>
        v && typeof v === 'object' ? ((v as any).value ?? '') : ((v as string) ?? '');
      const codeOf = (e: unknown): string =>
        e instanceof ServiceNowError ? e.code : 'UNKNOWN';

      // ── Current user + assigned roles (best-effort) ──
      let currentUser: string | undefined;
      let currentRoles: string[] = [];
      let rolesError: string | undefined;
      try {
        const me = await client.queryRecords({
          table: 'sys_user',
          query: 'sys_id=javascript:gs.getUserID()',
          fields: 'user_name,name',
          limit: 1,
        });
        currentUser = strVal(me.records[0]?.user_name) || strVal(me.records[0]?.name) || undefined;

        const roleResp = await client.queryRecords({
          table: 'sys_user_has_role',
          query: 'user=javascript:gs.getUserID()',
          fields: 'role.name',
          limit: 500,
        });
        currentRoles = [
          ...new Set(roleResp.records.map(r => strVal(r['role.name'])).filter(Boolean)),
        ].sort();
      } catch (e) {
        rolesError = e instanceof Error ? e.message : 'Failed to resolve current roles';
      }

      // ── Per-table read/write probes ──
      const results = [];
      for (const raw of tables) {
        const table = String(raw);
        const entry: {
          table: string;
          readable: boolean;
          writable: boolean | null;
          status: 'accessible' | 'empty' | 'no_access' | 'not_installed' | 'unknown';
          hint?: string;
          error?: string;
        } = { table, readable: false, writable: checkWrite ? false : null, status: 'unknown' };

        // Read probe
        try {
          const probe = await client.queryRecords({ table, fields: 'sys_id', limit: 1 });
          entry.readable = true;
          if (probe.records.length > 0) {
            entry.status = 'accessible';
          } else {
            entry.status = 'empty';
            entry.hint = 'Table exists and is readable but returned no rows — either truly empty or ACL row filtering hides all rows from this account.';
          }
        } catch (e) {
          const code = codeOf(e);
          const msg = e instanceof Error ? e.message : 'Read probe failed';
          if (code === 'INSUFFICIENT_PRIVILEGES') {
            entry.readable = false;
            entry.status = 'no_access';
            entry.hint = 'Table exists (so its plugin/app is installed) but ACL denies read for this account.';
          } else if (code === 'INVALID_REQUEST' && /invalid table/i.test(msg)) {
            // Invalid table — it does not exist at all; no point probing write
            entry.status = 'not_installed';
            entry.hint = 'Table does not exist on this instance — the providing plugin/app is likely not installed.';
            entry.error = msg;
            entry.writable = null;
            results.push(entry);
            continue;
          } else {
            // Unknown validation failure — no point probing write
            entry.error = msg;
            entry.writable = null;
            results.push(entry);
            continue;
          }
        }

        // Write probe (non-destructive empty PATCH to a reserved sys_id)
        if (checkWrite) {
          try {
            await client.updateRecord(table, ZERO_SYS_ID, {});
            entry.writable = true; // 2xx (not expected for a missing record, but counts as access)
          } catch (e) {
            const code = codeOf(e);
            if (code === 'NOT_FOUND') {
              entry.writable = true; // passed the write gate; record simply does not exist
            } else if (code === 'INSUFFICIENT_PRIVILEGES') {
              entry.writable = false;
            } else {
              entry.writable = null;
              entry.error = (entry.error ? entry.error + '; ' : '') +
                `write probe inconclusive (${code})`;
            }
          }
        }

        results.push(entry);
      }

      const readableCount = results.filter(r => r.readable).length;
      const writableCount = results.filter(r => r.writable === true).length;
      const notInstalledCount = results.filter(r => r.status === 'not_installed').length;
      const noAccessCount = results.filter(r => r.status === 'no_access').length;

      return {
        current_user: currentUser,
        current_roles: currentRoles,
        ...(rolesError ? { roles_error: rolesError } : {}),
        results,
        summary:
          `${results.length} table(s) checked: ${readableCount} readable` +
          (checkWrite ? `, ${writableCount} writable` : '') +
          (notInstalledCount ? `, ${notInstalledCount} not installed` : '') +
          (noAccessCount ? `, ${noAccessCount} ACL-denied` : '') +
          (currentUser ? ` (as ${currentUser}, ${currentRoles.length} role(s))` : ''),
      };
    }

    case 'get_integration_health': {
      // Clamp the window to a sane integer; the value is interpolated into a
      // gs.daysAgo() expression so it must be a plain number.
      const rawDays = Number(args.days);
      const days = Number.isFinite(rawDays) ? Math.min(Math.max(Math.trunc(rawDays), 1), 365) : 7;

      // Sanitize the optional source filter (exact match, no encoded-query operators).
      const source: string | undefined =
        typeof args.source === 'string' && args.source.trim()
          ? args.source.replace(/[^a-zA-Z0-9 _.-]/g, '').trim()
          : undefined;

      let query = `start_datetime>=javascript:gs.daysAgo(${days})`;
      if (source) query += `^source=${source}`;

      let records: any[];
      try {
        const resp = await client.queryRecords({
          table: 'sn_vul_integration_run',
          query,
          fields:
            'number,source,substate,state,start_datetime,end_datetime,vi_created,vi_updated,vi_new_findings,notes,fatal_error_message',
          orderBy: '-start_datetime',
          limit: 200,
        });
        records = resp.records;
      } catch (e) {
        if (e instanceof ServiceNowError && (e.code === 'INVALID_REQUEST' || e.code === 'NOT_FOUND')) {
          throw new ServiceNowError(
            'Table sn_vul_integration_run is not available — Vulnerability Response may not be installed on this instance.',
            'NOT_FOUND'
          );
        }
        throw e;
      }

      const num = (v: unknown): number => {
        const n = parseInt(String(v ?? ''), 10);
        return Number.isFinite(n) ? n : 0;
      };
      const isFailed = (r: any): boolean =>
        String(r.substate).toLowerCase() === 'failed' || !!String(r.fatal_error_message ?? '').trim();
      const isSuccess = (r: any): boolean => String(r.substate).toLowerCase() === 'success';

      const failedRuns = records.filter(isFailed);
      const successRuns = records.filter(isSuccess);
      // records are ordered most-recent-first
      const lastSuccess = successRuns[0]?.start_datetime as string | undefined;
      const lastFailure = failedRuns[0]?.start_datetime as string | undefined;

      const recent_runs = records.slice(0, 25).map(r => ({
        source: r.source || '',
        substate: r.substate || '',
        start_datetime: r.start_datetime || '',
        end_datetime: r.end_datetime || '',
        vi_created: num(r.vi_created),
        vi_updated: num(r.vi_updated),
        notes: String(r.fatal_error_message || r.notes || '').trim(),
      }));

      // ── Alerts ──
      const alerts: string[] = [];
      const scope = source ? `source "${source}"` : 'any integration';
      if (records.length === 0) {
        alerts.push(`No integration runs for ${scope} in the last ${days} day(s) — the feed may be stalled (e.g. silent 503/429 failures).`);
      }
      if (failedRuns.length > 0) {
        alerts.push(`${failedRuns.length} failed run(s) in the last ${days} day(s).`);
      }
      if (records.length > 0 && isFailed(records[0])) {
        const top = records[0];
        alerts.push(`Most recent run failed: ${top.source || 'unknown'} at ${top.start_datetime || 'unknown'} — ${String(top.fatal_error_message || top.notes || 'no detail').trim()}`);
      }
      if (successRuns.length > 0 && !lastSuccess) {
        alerts.push('Recent successes found but without timestamps.');
      }

      return {
        window_days: days,
        ...(source ? { source } : {}),
        summary: {
          total_runs: records.length,
          success: successRuns.length,
          failed: failedRuns.length,
          ...(lastSuccess ? { last_success: lastSuccess } : {}),
          ...(lastFailure ? { last_failure: lastFailure } : {}),
        },
        recent_runs,
        alerts,
      };
    }

    default:
      return null; // not handled here
  }
}
