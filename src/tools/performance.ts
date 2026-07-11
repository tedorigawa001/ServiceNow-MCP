/**
 * Performance Analytics & Dashboards tools — PA indicators, scorecards, KPIs, and dashboards.
 * All read-only tools: Tier 0.
 * Inspired by snow-flow's "Analysis" category: KPI management, Performance Analytics, dashboards.
 */
import { sanitizeLikeValue, type ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const DASHBOARD_UPDATE_FIELDS = new Set(['name', 'description', 'roles', 'active']);

export function getPerformanceToolDefinitions() {
  return [
    // ── PA Indicators ────────────────────────────────────────────────────────
    {
      name: 'list_pa_indicators',
      description: 'List Performance Analytics (PA) indicators (KPIs) available in the instance',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search indicators by name or description' },
          category: { type: 'string', description: 'Filter by indicator category' },
          active: { type: 'boolean', description: 'Filter to active indicators only (default true)' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pa_indicator',
      description: 'Get details of a specific Performance Analytics indicator including its formula',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Indicator sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'get_pa_scorecard',
      description:
        'Get current scorecard data for a PA indicator — returns current value, target, trend direction',
      inputSchema: {
        type: 'object',
        properties: {
          indicator_sys_id: { type: 'string', description: 'PA indicator sys_id' },
          breakdown_sys_id: {
            type: 'string',
            description: 'Optional breakdown (dimension) sys_id to segment data by group',
          },
          period: {
            type: 'string',
            description: 'Time period: last_7_days, last_30_days, last_quarter, last_year (default: last_30_days)',
          },
          include_scores: { type: 'boolean', description: 'Include individual score records (default false)' },
        },
        required: ['indicator_sys_id'],
      },
    },
    {
      name: 'get_pa_time_series',
      description: 'Get historical time-series data for a PA indicator to identify trends',
      inputSchema: {
        type: 'object',
        properties: {
          indicator_sys_id: { type: 'string', description: 'PA indicator sys_id' },
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format (default: 30 days ago)',
          },
          end_date: { type: 'string', description: 'End date in YYYY-MM-DD format (default: today)' },
          limit: { type: 'number', description: 'Max data points to return (default 100)' },
        },
        required: ['indicator_sys_id'],
      },
    },
    {
      name: 'list_pa_breakdowns',
      description: 'List PA breakdowns (dimensions) available for segmenting indicator data',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search breakdowns by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── Dashboards ───────────────────────────────────────────────────────────
    {
      name: 'list_pa_dashboards',
      description: 'List Performance Analytics dashboards',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search dashboards by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pa_dashboard',
      description: 'Get details of a PA dashboard including its widgets/tabs',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Dashboard sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'list_homepages',
      description: 'List homepage dashboards (CMS content pages used as homepages)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by title' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── PA Jobs ──────────────────────────────────────────────────────────────
    {
      name: 'list_pa_jobs',
      description: 'List Performance Analytics data collection jobs and their schedules',
      inputSchema: {
        type: 'object',
        properties: {
          active: { type: 'boolean', description: 'Filter to active jobs only (default true)' },
          query: { type: 'string', description: 'Search by name' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_pa_job',
      description: 'Get details of a Performance Analytics collection job',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'PA job sys_id' },
        },
        required: ['sys_id'],
      },
    },
    // ── Dashboard Management ─────────────────────────────────────────────────
    {
      name: 'create_dashboard',
      description:
        'Create a new Performance Analytics dashboard (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Dashboard name' },
          description: { type: 'string', description: 'Brief description of the dashboard' },
          roles: {
            type: 'string',
            description: 'Comma-separated roles that can view this dashboard (leave blank for all)',
          },
          active: { type: 'boolean', description: 'Activate the dashboard immediately (default: true)' },
        },
        required: ['name'],
      },
    },
    {
      name: 'update_dashboard',
      description: 'Update an existing PA dashboard (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Dashboard sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (name, description, roles, active, etc.)',
            properties: Object.fromEntries([...DASHBOARD_UPDATE_FIELDS].map(field => [field, {}])),
            additionalProperties: false,
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    // ── Data Quality ─────────────────────────────────────────────────────────
    {
      name: 'check_table_completeness',
      description:
        'Analyze data quality and field completeness for a ServiceNow table — ' +
        'returns percentage of non-empty values per field',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name to analyze (e.g. "incident", "cmdb_ci_server")' },
          fields: {
            type: 'string',
            description: 'Comma-separated field names to check (e.g. "assigned_to,priority,category")',
          },
          query: {
            type: 'string',
            description: 'Optional encoded query to scope the analysis (e.g. "active=true")',
          },
          sample_size: {
            type: 'number',
            description: 'Number of records to sample (default 100, max 500)',
          },
        },
        required: ['table', 'fields'],
      },
    },
    {
      name: 'get_table_record_count',
      description: 'Get total record count for a ServiceNow table with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name' },
          query: { type: 'string', description: 'Optional encoded query to count a subset' },
        },
        required: ['table'],
      },
    },
    {
      name: 'compare_record_counts',
      description:
        'Compare record counts across multiple ServiceNow tables or time periods — useful for capacity planning',
      inputSchema: {
        type: 'object',
        properties: {
          tables: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of table names to compare (e.g. ["incident", "change_request", "problem"])',
          },
          query: { type: 'string', description: 'Optional query to apply to all tables' },
        },
        required: ['tables'],
      },
    },
    // ── Instance Diagnostics ─────────────────────────────────────────────────
    {
      name: 'get_instance_diagnostics',
      description:
        'Get live instance performance diagnostics: JVM memory, semaphore pools (concurrency/queue depth), and cluster node status — the data behind the Performance homepage (/stats.do)',
      inputSchema: {
        type: 'object',
        properties: {
          include: {
            type: 'array',
            items: { type: 'string' },
            description:
              "xmlstats.do sections to fetch (default ['memory','semaphores']). Other useful values: 'transactions', 'connections', 'dbpool', 'servlet'",
          },
          raw_xml: {
            type: 'boolean',
            description: 'Return the raw xmlstats.do XML instead of the parsed summary (default false)',
          },
          all_nodes: {
            type: 'boolean',
            description:
              'Fetch diagnostics for every cluster node via sys_cluster_node_stats instead of only the node serving this request — use on multi-node production instances (default false)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_performance_history',
      description:
        'Get historical transaction performance as a time series (transaction count, avg/max response time, SQL time, business rule time per bucket) from the transaction log — chartable data for instance performance trends, replacing the legacy Performance dashboard graphs',
      inputSchema: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Look-back window in hours (default 24, max 168)' },
          buckets: { type: 'number', description: 'Number of time buckets (default 24, max 48)' },
          query: {
            type: 'string',
            description:
              'Extra encoded query to filter transactions, e.g. "urlLIKE/api/" for REST only or "sys_created_by=admin"',
          },
          group_by_node: {
            type: 'boolean',
            description:
              'Break each bucket down per cluster node (system_id) — use to spot a slow node on multi-node production instances (default false)',
          },
        },
        required: [],
      },
    },
  ];
}

/** Parse the memory scalars and semaphore pools out of an xmlstats payload */
function parseXmlStatsPayload(xml: string): {
  created?: string;
  memory_mb: Record<string, number>;
  semaphores: Array<Record<string, unknown>>;
} {
  const memory: Record<string, number> = {};
  for (const m of xml.matchAll(/<(system\.[\w.]+)>([\d.]+)<\/\1>/g)) {
    memory[m[1]] = parseFloat(m[2]);
  }
  const semaphores: Array<Record<string, unknown>> = [];
  for (const m of xml.matchAll(/<semaphores\b([^>]*?)(?:\/>|>([\s\S]*?)<\/semaphores>)/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const executing = m[2] ? (m[2].match(/<semaphore\b/g) ?? []).length : 0;
    semaphores.push({
      name: attrs.name,
      max_concurrency: Number(attrs.maximum_concurrency),
      available: Number(attrs.available),
      in_use: executing,
      queue_depth: Number(attrs.queue_depth),
      max_queue_depth: Number(attrs.max_queue_depth),
      queue_age_ms: Number(attrs.queue_age),
      queue_depth_limit: Number(attrs.queue_depth_limit),
      rejected_executions: Number(attrs.rejected_executions),
    });
  }
  return { created: /created="([^"]*)"/.exec(xml)?.[1], memory_mb: memory, semaphores };
}

/** Extract count/avg/max transaction metrics from an Aggregate API stats object */
function extractTransactionStats(stats: any): Record<string, number | null> {
  return {
    count: Number(stats?.count ?? 0),
    avg_response_ms: stats?.avg?.response_time != null ? Math.round(Number(stats.avg.response_time)) : null,
    max_response_ms: stats?.max?.response_time != null ? Math.round(Number(stats.max.response_time)) : null,
    avg_sql_ms: stats?.avg?.sql_time != null ? Math.round(Number(stats.avg.sql_time)) : null,
    avg_business_rule_ms:
      stats?.avg?.business_rule_time != null ? Math.round(Number(stats.avg.business_rule_time)) : null,
  };
}

export async function executePerformanceToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // ── PA Indicators ────────────────────────────────────────────────────────
    case 'list_pa_indicators': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.category) parts.push(`category=${sanitizeLikeValue(args.category)}`);
      if (args.query) {
        const query = sanitizeLikeValue(args.query);
        parts.push(`nameCONTAINS${query}^ORdescriptionCONTAINS${query}`);
      }
      return await client.queryRecords({
        table: 'pa_indicators',
        query: parts.join('^') || '',
        limit: args.limit ?? 50,
        fields: 'sys_id,name,description,unit,direction,active,category,sys_updated_on',
      });
    }
    case 'get_pa_indicator': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('pa_indicators', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'pa_indicators',
        query: `nameCONTAINS${sanitizeLikeValue(args.sys_id_or_name)}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`PA indicator not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'get_pa_scorecard': {
      if (!args.indicator_sys_id) throw new ServiceNowError('indicator_sys_id is required', 'INVALID_REQUEST');
      // Query pa_scores for the indicator's latest data
      const scoreParts = [`indicator=${sanitizeLikeValue(args.indicator_sys_id)}`];
      if (args.breakdown_sys_id) scoreParts.push(`breakdown_element=${sanitizeLikeValue(args.breakdown_sys_id)}`);
      const scores = await client.queryRecords({
        table: 'pa_scores',
        query: scoreParts.join('^'),
        limit: args.include_scores ? 50 : 5,
        orderBy: '-sys_created_on',
        fields: 'sys_id,indicator,value,date,breakdown_element,sys_created_on',
      });

      // Get indicator metadata
      const indicator = await client.getRecord('pa_indicators', args.indicator_sys_id);

      const latestScore = scores.records[0];
      const prevScore = scores.records[1];
      const trend = latestScore && prevScore
        ? (parseFloat(String(latestScore.value)) > parseFloat(String(prevScore.value)) ? 'up' : 'down')
        : 'stable';

      return {
        indicator: {
          sys_id: indicator.sys_id,
          name: indicator.name,
          unit: indicator.unit,
          direction: indicator.direction,
        },
        current_value: latestScore?.value ?? 'N/A',
        previous_value: prevScore?.value ?? 'N/A',
        trend,
        last_collected: latestScore?.date ?? latestScore?.sys_created_on ?? 'unknown',
        scores: args.include_scores ? scores.records : undefined,
      };
    }
    case 'get_pa_time_series': {
      if (!args.indicator_sys_id) throw new ServiceNowError('indicator_sys_id is required', 'INVALID_REQUEST');
      const parts = [`indicator=${sanitizeLikeValue(args.indicator_sys_id)}`];
      if (args.start_date) parts.push(`date>=${sanitizeLikeValue(args.start_date)}`);
      if (args.end_date) parts.push(`date<=${sanitizeLikeValue(args.end_date)}`);
      return await client.queryRecords({
        table: 'pa_scores',
        query: parts.join('^'),
        limit: args.limit ?? 100,
        orderBy: 'date',
        fields: 'sys_id,indicator,value,date,sys_created_on',
      });
    }
    case 'list_pa_breakdowns': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${sanitizeLikeValue(args.query)}`);
      return await client.queryRecords({
        table: 'pa_breakdowns',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,type,table,field,sys_updated_on',
      });
    }
    // ── Dashboards ───────────────────────────────────────────────────────────
    case 'list_pa_dashboards': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${sanitizeLikeValue(args.query)}`);
      return await client.queryRecords({
        table: 'pa_dashboards',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,description,sys_updated_on',
      });
    }
    case 'get_pa_dashboard': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('pa_dashboards', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'pa_dashboards',
        query: `nameCONTAINS${sanitizeLikeValue(args.sys_id_or_name)}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`PA dashboard not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_homepages': {
      const parts: string[] = [];
      if (args.query) parts.push(`titleCONTAINS${sanitizeLikeValue(args.query)}`);
      return await client.queryRecords({
        table: 'sys_ui_hp',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,title,roles,sys_updated_on',
      });
    }
    // ── PA Jobs ──────────────────────────────────────────────────────────────
    case 'list_pa_jobs': {
      const parts: string[] = [];
      if (args.active !== false) parts.push('active=true');
      if (args.query) parts.push(`nameCONTAINS${sanitizeLikeValue(args.query)}`);
      return await client.queryRecords({
        table: 'pa_job',
        query: parts.join('^') || '',
        limit: args.limit ?? 25,
        fields: 'sys_id,name,active,schedule,sys_updated_on',
      });
    }
    case 'get_pa_job': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('pa_job', args.sys_id);
    }
    // ── Data Quality ─────────────────────────────────────────────────────────
    case 'check_table_completeness': {
      if (!args.table || !args.fields) throw new ServiceNowError('table and fields are required', 'INVALID_REQUEST');
      const fieldList = args.fields.split(',').map((f: string) => f.trim()).filter(Boolean);
      const sampleSize = Math.min(args.sample_size ?? 100, 500);

      const resp = await client.queryRecords({
        table: args.table,
        query: args.query,
        limit: sampleSize,
        fields: fieldList.join(','),
      });

      const totalRecords = resp.count;
      const completeness: Record<string, any> = {};

      for (const field of fieldList) {
        const nonEmpty = resp.records.filter((r: any) => {
          const val = r[field];
          return val !== null && val !== undefined && val !== '' && val !== '0' && val !== false;
        }).length;
        completeness[field] = {
          non_empty: nonEmpty,
          total: totalRecords,
          completeness_pct: totalRecords > 0 ? ((nonEmpty / totalRecords) * 100).toFixed(1) + '%' : '0%',
        };
      }

      return {
        table: args.table,
        sample_size: totalRecords,
        query: args.query || 'all records',
        field_completeness: completeness,
        note: totalRecords < sampleSize
          ? `Only ${totalRecords} records found (less than requested sample of ${sampleSize})`
          : undefined,
      };
    }
    case 'get_table_record_count': {
      if (!args.table) throw new ServiceNowError('table is required', 'INVALID_REQUEST');
      // Use aggregate query for accurate count
      try {
        const resp = await client.runAggregateQuery(args.table, '', 'COUNT', args.query);
        const count = resp?.stats?.count ?? resp?.count ?? 'unknown';
        return { table: args.table, query: args.query || 'all records', record_count: count };
      } catch {
        // Fallback: query with limit=1 to at least confirm table exists
        const resp = await client.queryRecords({ table: args.table, query: args.query, limit: 1 });
        return { table: args.table, query: args.query || 'all records', record_count: resp.count, note: 'Count may be approximate (aggregate API unavailable)' };
      }
    }
    case 'create_dashboard': {
      requireWrite();
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        active: args.active !== false,
      };
      if (args.description) data.description = args.description;
      if (args.roles) data.roles = args.roles;
      const result = await client.createRecord('pa_dashboards', data);
      return { ...result, summary: `Created dashboard "${args.name}"` };
    }
    case 'update_dashboard': {
      requireWrite();
      if (!args.sys_id || !args.fields)
        throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const unsafeFields = Object.keys(args.fields).filter(field => !DASHBOARD_UPDATE_FIELDS.has(field));
      if (unsafeFields.length) {
        throw new ServiceNowError(
          `Dashboard fields cannot be updated: ${unsafeFields.join(', ')}. Allowed fields: ${[...DASHBOARD_UPDATE_FIELDS].join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      const result = await client.updateRecord('pa_dashboards', args.sys_id, args.fields);
      return { ...result, summary: `Updated dashboard ${args.sys_id}` };
    }
    case 'compare_record_counts': {
      if (!args.tables || !Array.isArray(args.tables) || args.tables.length === 0) {
        throw new ServiceNowError('tables must be a non-empty array', 'INVALID_REQUEST');
      }
      const results: Record<string, any> = {};
      for (const table of args.tables) {
        try {
          const resp = await client.queryRecords({ table, query: args.query, limit: 1 });
          results[table] = { accessible: true, record_count: resp.count };
        } catch (err) {
          results[table] = { accessible: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
      }
      return { query: args.query || 'all records', table_counts: results };
    }
    case 'get_instance_diagnostics': {
      let clusterNodes: Record<string, any>[] = [];
      try {
        const nodes = await client.queryRecords({
          table: 'sys_cluster_state',
          query: '',
          limit: 50,
          fields: 'system_id,status,participation,most_recent_message,sys_updated_on',
        });
        clusterNodes = nodes.records as Record<string, any>[];
      } catch {
        // sys_cluster_state may be ACL-restricted; diagnostics from xmlstats are still useful alone
      }

      if (args.all_nodes) {
        // Each node periodically writes its full xmlstats payload to
        // sys_cluster_node_stats — the only way to see nodes other than the
        // one the load balancer routed this request to
        const statsRecords = await client.queryRecords({
          table: 'sys_cluster_node_stats',
          query: '',
          limit: 50,
          fields: 'stats,sys_updated_on',
        });
        const nodes = statsRecords.records.map((rec: Record<string, any>) => {
          const xml = String(rec.stats ?? '');
          const parsed = parseXmlStatsPayload(xml);
          // Records from decommissioned nodes linger in this table; flag
          // anything not refreshed recently so consumers don't read a ghost
          const updatedMs = Date.parse(`${String(rec.sys_updated_on).replace(' ', 'T')}Z`);
          const stale = !Number.isFinite(updatedMs) || Date.now() - updatedMs > 30 * 60 * 1000;
          return {
            system_id: /<scheduler\.system_id>([^<]*)<\/scheduler\.system_id>/.exec(xml)?.[1] ?? null,
            stats_updated_on: rec.sys_updated_on,
            stale,
            ...parsed,
          };
        });
        return { all_nodes: true, nodes, cluster_nodes: clusterNodes };
      }

      const include: string[] =
        Array.isArray(args.include) && args.include.length > 0
          ? args.include
          : ['memory', 'semaphores'];
      const xml = await client.getXmlStats(include);
      if (args.raw_xml) return { include, raw_xml: xml };

      return {
        include,
        ...parseXmlStatsPayload(xml),
        cluster_nodes: clusterNodes,
      };
    }
    case 'get_performance_history': {
      const hours = Math.min(Math.max(Number(args.hours) || 24, 1), 168);
      const buckets = Math.min(Math.max(Number(args.buckets) || 24, 2), 48);
      const spanMs = hours * 3600 * 1000;
      const bucketMs = spanMs / buckets;
      const startMs = Date.now() - spanMs;
      // syslog_transaction stores sys_created_on in UTC; literal datetimes in
      // encoded queries are compared as UTC (verified against gs.minutesAgoStart)
      const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

      const fetchBucket = async (i: number) => {
        const from = fmt(startMs + i * bucketMs);
        const to = fmt(startMs + (i + 1) * bucketMs);
        let q = `sys_created_on>=${from}^sys_created_on<${to}`;
        if (args.query) q += `^${args.query}`;
        const endpoint =
          `/api/now/stats/syslog_transaction?sysparm_query=${encodeURIComponent(q)}` +
          `&sysparm_count=true` +
          `&sysparm_avg_fields=${encodeURIComponent('response_time,sql_time,business_rule_time')}` +
          `&sysparm_max_fields=response_time` +
          (args.group_by_node ? '&sysparm_group_by=system_id' : '');
        const resp = await client.callApiGet(endpoint);
        if (args.group_by_node) {
          // Grouped responses return one stats object per system_id
          const groups: any[] = Array.isArray(resp?.result) ? resp.result : [];
          return {
            start_utc: from,
            end_utc: to,
            nodes: groups.map((g) => ({
              node: g.groupby_fields?.find((f: any) => f.field === 'system_id')?.value ?? null,
              ...extractTransactionStats(g.stats),
            })),
          };
        }
        return {
          start_utc: from,
          end_utc: to,
          ...extractTransactionStats(resp?.result?.stats),
        };
      };

      // Limited concurrency so 48 buckets don't hammer the instance
      const series: Awaited<ReturnType<typeof fetchBucket>>[] = [];
      const concurrency = 6;
      for (let i = 0; i < buckets; i += concurrency) {
        const chunk = await Promise.all(
          Array.from({ length: Math.min(concurrency, buckets - i) }, (_, j) => fetchBucket(i + j))
        );
        series.push(...chunk);
      }

      return {
        table: 'syslog_transaction',
        from_utc: fmt(startMs),
        to_utc: fmt(startMs + spanMs),
        bucket_minutes: Math.round(bucketMs / 60000),
        filter: args.query || null,
        series,
      };
    }
    default:
      return null;
  }
}
