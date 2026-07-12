/**
 * GRC — Risk Management tools. Covers Risks and the Risk Statement library.
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 *
 * Tables verified against a live PDI (dev400464, 2026-07-12) — see
 * docs/GRC_DESIGN.md. Key findings:
 *   - sn_risk_risk       — number prefix RK, string state choices
 *       (draft/assess/review/respond/monitor/retired). `impact`/
 *       `likelihood`/`residual_impact`/`residual_likelihood`/`score`/
 *       `residual_score` are references into `sn_risk_criteria` (filtered by
 *       that table's own `type` field: impact/likelihood/score), BUT are
 *       calculated fields — a business rule unconditionally overwrites
 *       `impact` (and presumably `likelihood`) on both insert and update,
 *       confirmed live: explicitly POSTing/PATCHing a specific
 *       sn_risk_criteria sys_id was silently reset to the lowest-order
 *       value ("1 - Very Low") on the very next read, both with and without
 *       a `statement` set. These fields are therefore READ-ONLY for this
 *       phase (not exposed as writable) — a future phase would need to
 *       reverse-engineer the actual assessment-input mechanism (likely via
 *       `calculated_risk_factor`/`indicator_failure_factor`/
 *       `control_failure_factor`, populated through a risk assessment
 *       workflow rather than direct field writes). `statement` references
 *       sn_risk_definition (the reusable risk-statement library). This is a
 *       quantitative (FAIR-style) risk model — inherent/residual ALE/SLE/ARO
 *       fields also exist but are left read-only for this phase.
 *   - sn_risk_definition — Risk Statement library, 63 seeded rows (not just
 *       the 3-row CIA-triad sample first seen).
 *   - sn_risk_criteria   — the Impact/Likelihood/Score scale table, 15 rows.
 *       `display_value` gives the human label (e.g. "4 - Likely"), `type`
 *       distinguishes impact/likelihood/score rows, `order` sorts them.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { sanitizeLikeValue } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;
const queryValue = (value: unknown): string => sanitizeLikeValue(String(value));

const RISK_STATE_SCHEMA = {
  type: 'string',
  description: 'State filter: draft, assess, review, respond, monitor, retired',
};

// Only fields CONFIRMED to persist via a live create/update round trip on
// dev400464 (2026-07-12) are listed. Excluded, with the confirmed reason:
//   - impact/likelihood/residual_impact/residual_likelihood/score/residual_score:
//     unconditionally recalculated by a business rule, ignoring client input.
//   - justification, response, classification: silently ignored (POST/PATCH
//     accepted 200 but the value never persisted on re-read).
//   - owner: auto-synced from the related Entity's owner (see the
//     `sync_with_entity_owner` field) rather than settable directly.
const RISK_FIELDS = new Set(['statement', 'profile', 'category', 'owning_group', 'apply_reason']);
const RISK_LIST_FIELDS = 'number,statement,state,score,residual_score,profile,owner,category,sys_id';

/** Build a `state=` / `stateIN` clause from a single value or comma list. */
function stateClause(state: unknown): string | undefined {
  if (state === undefined || state === null || state === '') return undefined;
  const values = String(state).split(',').map(s => s.trim()).filter(Boolean);
  if (values.length === 0) return undefined;
  return values.length === 1 ? `state=${queryValue(values[0])}` : `stateIN${values.map(queryValue).join(',')}`;
}

function summarizeByState(stats: any, labels: Record<string, string> = {}): Array<{ state: string; label: string; count: number }> {
  const rows = Array.isArray(stats) ? stats : [];
  return rows
    .map(row => {
      const value = String(row?.groupby_fields?.[0]?.value ?? '');
      const count = parseInt(String(row?.stats?.count ?? '0'), 10);
      return { state: value, label: labels[value] ?? value, count: Number.isFinite(count) ? count : 0 };
    })
    .sort((a, b) => b.count - a.count);
}

export function getGrcRiskToolDefinitions() {
  return [
    {
      name: 'list_risks',
      description:
        'List Risks (sn_risk_risk) — the quantitative risk register entry. Filter by state, related ' +
        'Entity, or category. Ordered by most recently updated.',
      inputSchema: {
        type: 'object',
        properties: {
          state: RISK_STATE_SCHEMA,
          profile: { type: 'string', description: 'Filter by related Entity sys_id (sn_grc_profile)' },
          category: { type: 'string', description: 'Filter by risk category' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_risk',
      description: 'Get full details of a single Risk by sys_id or number (e.g. "RK0020310").',
      inputSchema: {
        type: 'object',
        properties: { number_or_sysid: { type: 'string', description: 'Risk number (RKxxxxxxx) or 32-char sys_id' } },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'create_risk',
      description:
        'Create a Risk (sn_risk_risk). NOTE: `impact`/`likelihood`/`score` are NOT settable here — ' +
        'confirmed live that a business rule always overwrites them regardless of client input (see ' +
        'list_risk_criteria to inspect the scale; scoring appears to require the platform\'s risk ' +
        'assessment workflow, not direct field writes). **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          statement: { type: 'string', description: 'sys_id of the Risk Statement (sn_risk_definition)' },
          profile: { type: 'string', description: 'sys_id of the related Entity (sn_grc_profile); also drives the auto-synced `owner`' },
          category: { type: 'string' },
          owning_group: { type: 'string', description: 'sys_id of the owning group' },
        },
        required: ['statement'],
      },
    },
    {
      name: 'update_risk',
      description:
        'Update a Risk by sys_id. NOTE: `impact`/`likelihood`/`score` are not in the allowed field set — ' +
        'confirmed live that they are unconditionally recalculated by a business rule on write. ' +
        '**[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Risk' },
          fields: {
            type: 'object',
            description: `Allowed fields: ${[...RISK_FIELDS].join(', ')}`,
            properties: Object.fromEntries([...RISK_FIELDS].map(field => [field, {}])),
            additionalProperties: false,
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_risk_statements',
      description: 'List the Risk Statement library (sn_risk_definition) — reusable risk descriptions referenced by Risk records.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Filter by name (LIKE match)' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
        },
      },
    },
    {
      name: 'get_risk_statement',
      description: 'Get full details of a single Risk Statement by sys_id.',
      inputSchema: {
        type: 'object',
        properties: { sys_id: { type: 'string', description: '32-char sys_id of the Risk Statement' } },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_risk_criteria',
      description:
        'List the Impact/Likelihood/Score scale (sn_risk_criteria) used by Risk records — 5 rows per ' +
        'type, ordered. Reference only: impact/likelihood/score are NOT settable via create_risk/' +
        'update_risk (confirmed to be recalculated by a business rule regardless of client input) — use ' +
        'this tool to understand the scale a Risk\'s calculated values fall on, not to prepare a write.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['impact', 'likelihood', 'score'], description: 'Filter to one scale type' },
        },
      },
    },
    {
      name: 'get_grc_risk_dashboard',
      description: 'Summarize the Risk posture: Risk counts by state, and the highest-scored open risks.',
      inputSchema: {
        type: 'object',
        properties: { top: { type: 'number', description: 'How many top risks to include (default: 5, max: 50)' } },
      },
    },
  ];
}

export async function executeGrcRiskToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_risks': {
      const parts: string[] = [];
      const sc = stateClause(args.state);
      if (sc) parts.push(sc);
      if (args.profile) parts.push(`profile=${queryValue(args.profile)}`);
      if (args.category) parts.push(`category=${queryValue(args.category)}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_risk_risk',
        query: parts.join('^'),
        fields: RISK_LIST_FIELDS,
        orderBy: '-sys_updated_on',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} risk(s)` };
    }

    case 'get_risk': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) return await client.getRecord('sn_risk_risk', args.number_or_sysid);
      const resp = await client.queryRecords({ table: 'sn_risk_risk', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Risk not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'create_risk': {
      requireWrite();
      if (!args.statement) throw new ServiceNowError('statement is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { statement: args.statement };
      for (const f of ['profile', 'category', 'owning_group']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_risk_risk', data);
      return { ...result, summary: `Created Risk ${result.number || result.sys_id}` };
    }

    case 'update_risk': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const unsafeFields = Object.keys(args.fields).filter(f => !RISK_FIELDS.has(f));
      if (unsafeFields.length) {
        throw new ServiceNowError(
          `Risk fields cannot be updated: ${unsafeFields.join(', ')}. Allowed fields: ${[...RISK_FIELDS].join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      const result = await client.updateRecord('sn_risk_risk', args.sys_id, args.fields);
      return { ...result, summary: `Updated Risk ${args.sys_id}` };
    }

    case 'list_risk_statements': {
      const parts: string[] = [];
      if (args.name) parts.push(`nameLIKE${queryValue(args.name)}`);
      const resp = await client.queryRecords({
        table: 'sn_risk_definition',
        query: parts.join('^'),
        fields: 'name,description,impact,likelihood,sys_id',
        limit: args.limit ?? 25,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} risk statement(s)` };
    }

    case 'get_risk_statement': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sn_risk_definition', args.sys_id);
    }

    case 'list_risk_criteria': {
      const query = args.type ? `type=${queryValue(args.type)}` : '';
      const resp = await client.queryRecords({
        table: 'sn_risk_criteria',
        query,
        fields: 'type,display_value,order,maximum_value',
        orderBy: 'order',
        limit: 100,
        display_value: 'all',
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} risk criteria row(s)` };
    }

    case 'get_grc_risk_dashboard': {
      const top = Math.min(Math.max(Math.trunc(Number(args.top) || 5), 1), 50);

      const [riskStats, topRisks] = await Promise.all([
        client.runAggregateQuery('sn_risk_risk', 'state', 'COUNT'),
        client.queryRecords({
          table: 'sn_risk_risk',
          query: 'stateINdraft,assess,review,respond,monitor',
          fields: 'number,statement,state,score,profile,owning_group',
          orderBy: '-score',
          limit: top,
          display_value: 'all',
        }),
      ]);

      const risksByState = summarizeByState(riskStats);
      const total = (rows: Array<{ count: number }>) => rows.reduce((s, r) => s + r.count, 0);
      const openRisks = risksByState.filter(r => r.state !== 'retired').reduce((s, r) => s + r.count, 0);

      return {
        risks: { total: total(risksByState), open: openRisks, by_state: risksByState },
        top_risks_by_score: topRisks.records,
        summary: `Risks: ${total(risksByState)} total (${openRisks} open) · top ${topRisks.count} by score listed`,
      };
    }

    default:
      return null;
  }
}
