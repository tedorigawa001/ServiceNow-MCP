/**
 * GRC — Indicator (KRI/KPI) tools. Phase 2 of the GRC buildout (see
 * docs/GRC_DESIGN.md) — Compliance/Audit/Risk (Phase 1) shipped first
 * because sn_grc_indicator had 0 records at design time; it now has
 * real demo data (119 records) and was verified against a live PDI
 * (dev400464, 2026-07-12).
 *
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 *
 * Key findings:
 *   - sn_grc_indicator     — number prefix IND, extends sn_grc_base_indicator.
 *       `entity` (sn_grc_profile) and `item` are both mandatory references.
 *       `item` looked like it pointed at a separate "sn_grc_item" table, but
 *       that table turned out to be an ABSTRACT BASE that sn_compliance_control
 *       and sn_risk_risk themselves extend — `item` is simply the sys_id of an
 *       existing Control or Risk record (their own sys_id works directly).
 *   - CONFIRMED (live insert test): a before/validation business rule
 *       ("Verify entity change") REJECTS the create with HTTP 403 if `entity`
 *       is not the specific Entity actually associated with `item` — e.g. the
 *       Control's own `profile` field, or the Risk's own `profile` field.
 *       An arbitrary unrelated entity+item pair fails; the pairing taken from
 *       an existing indicator succeeded. Tools must document this — pass the
 *       item's own `profile` value as `entity`, don't guess.
 *   - `status` string field is unused in sampled data (always blank);
 *       `last_result_passed` (boolean) is the actual current pass/fail state,
 *       set by whatever last populated an sn_grc_indicator_result row.
 *   - sn_grc_indicator_result (the individual collection results) had 0
 *       records at verification time — list/get tools are included for when
 *       it is populated, but cannot be live-round-trip verified yet.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { sanitizeLikeValue } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const SYS_ID_RE = /^[0-9a-f]{32}$/i;
const queryValue = (value: unknown): string => sanitizeLikeValue(String(value));

const INDICATOR_FIELDS = new Set(['short_description', 'category', 'collection_frequency', 'active', 'owner', 'owning_group', 'instructions']);
const INDICATOR_LIST_FIELDS = 'number,short_description,category,entity,item,last_result_passed,active,collection_frequency,sys_id';

function allowedFieldsSchema(allowedFields: Set<string>, description: string): Record<string, any> {
  return {
    type: 'object',
    description,
    properties: Object.fromEntries([...allowedFields].map(field => [field, {}])),
    additionalProperties: false,
  };
}

export function getGrcIndicatorToolDefinitions() {
  return [
    {
      name: 'list_grc_indicators',
      description:
        'List GRC Indicators (sn_grc_indicator, KRI/KPI) — periodic pass/fail metrics measuring a ' +
        'Control or Risk (`item`) for a given Entity. Filter by entity, category, or last result.',
      inputSchema: {
        type: 'object',
        properties: {
          entity: { type: 'string', description: 'Filter by related Entity sys_id (sn_grc_profile)' },
          item: { type: 'string', description: 'Filter by the measured Control/Risk sys_id' },
          category: { type: 'string' },
          last_result_passed: { type: 'boolean', description: 'Filter by whether the last collection passed' },
          active: { type: 'boolean' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_grc_indicator',
      description: 'Get full details of a single GRC Indicator by sys_id or number (e.g. "IND0020021").',
      inputSchema: {
        type: 'object',
        properties: { number_or_sysid: { type: 'string', description: 'Indicator number (INDxxxxxxx) or 32-char sys_id' } },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'create_grc_indicator',
      description:
        'Create a GRC Indicator (sn_grc_indicator). `item` is the sys_id of an EXISTING Compliance ' +
        'Control (sn_compliance_control) or Risk (sn_risk_risk) record — both extend the same base ' +
        'table, so their own sys_id is used directly, no separate lookup needed. `entity` MUST be the ' +
        'specific Entity already associated with that item (e.g. the Control/Risk\'s own `profile` ' +
        'field) — confirmed live that a validation business rule rejects (HTTP 403) any entity that ' +
        'isn\'t the one the item is actually scoped to. **[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          short_description: { type: 'string' },
          entity: { type: 'string', description: 'sys_id of the Entity — must match the item\'s own `profile`' },
          item: { type: 'string', description: 'sys_id of an existing sn_compliance_control or sn_risk_risk record' },
          category: { type: 'string' },
          collection_frequency: { type: 'string' },
          owner: { type: 'string' },
          owning_group: { type: 'string' },
        },
        required: ['entity', 'item'],
      },
    },
    {
      name: 'update_grc_indicator',
      description:
        'Update a GRC Indicator by sys_id. `entity`/`item` are intentionally not updatable here — ' +
        'changing either risks the same entity/item validation failure confirmed on create; recreate ' +
        'the Indicator instead if it needs to measure a different Control/Risk or Entity. ' +
        '**[Write — requires WRITE_ENABLED=true]**',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: '32-char sys_id of the Indicator' },
          fields: allowedFieldsSchema(INDICATOR_FIELDS, `Allowed fields: ${[...INDICATOR_FIELDS].join(', ')}`),
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_indicator_results',
      description:
        'List Indicator Results (sn_grc_indicator_result) — individual pass/fail collection events for ' +
        'an Indicator. Empty on dev400464 at verification time (2026-07-12); included for instances ' +
        'where indicator collection has run.',
      inputSchema: {
        type: 'object',
        properties: {
          indicator: { type: 'string', description: 'Filter by related Indicator sys_id' },
          passed: { type: 'boolean', description: 'Filter by pass/fail result' },
          query: { type: 'string', description: 'Additional raw encoded query appended with ^' },
          limit: { type: 'number', description: 'Max records (default: 25, max: 1000)' },
          display_value: { description: 'Return human-readable reference values (true) or both ("all")', oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['all'] }] },
        },
      },
    },
    {
      name: 'get_indicator_result',
      description: 'Get full details of a single Indicator Result by sys_id.',
      inputSchema: {
        type: 'object',
        properties: { sys_id: { type: 'string', description: '32-char sys_id of the Indicator Result' } },
        required: ['sys_id'],
      },
    },
    {
      name: 'get_grc_indicator_dashboard',
      description: 'Summarize Indicator posture: counts by category and by last-result pass/fail.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

export async function executeGrcIndicatorToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_grc_indicators': {
      const parts: string[] = [];
      if (args.entity) parts.push(`entity=${queryValue(args.entity)}`);
      if (args.item) parts.push(`item=${queryValue(args.item)}`);
      if (args.category) parts.push(`category=${queryValue(args.category)}`);
      if (args.last_result_passed !== undefined) parts.push(`last_result_passed=${args.last_result_passed ? 'true' : 'false'}`);
      if (args.active !== undefined) parts.push(`active=${args.active ? 'true' : 'false'}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_grc_indicator',
        query: parts.join('^'),
        fields: INDICATOR_LIST_FIELDS,
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} GRC indicator(s)` };
    }

    case 'get_grc_indicator': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (SYS_ID_RE.test(args.number_or_sysid)) return await client.getRecord('sn_grc_indicator', args.number_or_sysid);
      const resp = await client.queryRecords({ table: 'sn_grc_indicator', query: `number=${queryValue(args.number_or_sysid)}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`GRC Indicator not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }

    case 'create_grc_indicator': {
      requireWrite();
      if (!args.entity || !args.item) throw new ServiceNowError('entity and item are required', 'INVALID_REQUEST');
      const data: Record<string, any> = { entity: args.entity, item: args.item };
      for (const f of ['short_description', 'category', 'collection_frequency', 'owner', 'owning_group']) {
        if (args[f] !== undefined) data[f] = args[f];
      }
      const result = await client.createRecord('sn_grc_indicator', data);
      return { ...result, summary: `Created GRC Indicator ${result.number || result.sys_id}` };
    }

    case 'update_grc_indicator': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const unsafeFields = Object.keys(args.fields).filter(f => !INDICATOR_FIELDS.has(f));
      if (unsafeFields.length) {
        throw new ServiceNowError(
          `Indicator fields cannot be updated: ${unsafeFields.join(', ')}. Allowed fields: ${[...INDICATOR_FIELDS].join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      const result = await client.updateRecord('sn_grc_indicator', args.sys_id, args.fields);
      return { ...result, summary: `Updated GRC Indicator ${args.sys_id}` };
    }

    case 'list_indicator_results': {
      const parts: string[] = [];
      if (args.indicator) parts.push(`indicator=${queryValue(args.indicator)}`);
      if (args.passed !== undefined) parts.push(`passed=${args.passed ? 'true' : 'false'}`);
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sn_grc_indicator_result',
        query: parts.join('^'),
        fields: 'indicator,passed,value,collection_date,target,sys_id',
        orderBy: '-collection_date',
        limit: args.limit ?? 25,
        display_value: args.display_value,
      });
      return { count: resp.count, records: resp.records, summary: `Found ${resp.count} indicator result(s)` };
    }

    case 'get_indicator_result': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sn_grc_indicator_result', args.sys_id);
    }

    case 'get_grc_indicator_dashboard': {
      // `total` is derived from an `active` groupby, not `category` — `category` is a
      // free-text, non-mandatory field, so any Indicator without one set would silently
      // drop out of a category-based sum (0 such rows on dev400464 today, but that's a
      // data fact, not a schema guarantee). `active` is a boolean with a platform
      // default, matching the "always-populated field" pattern used for totals in the
      // other GRC dashboards (which key off `state`).
      const [byActive, byCategory, byResult] = await Promise.all([
        client.runAggregateQuery('sn_grc_indicator', 'active', 'COUNT'),
        client.runAggregateQuery('sn_grc_indicator', 'category', 'COUNT'),
        client.runAggregateQuery('sn_grc_indicator', 'last_result_passed', 'COUNT'),
      ]);

      const summarize = (stats: any) => {
        const rows = Array.isArray(stats) ? stats : [];
        return rows
          .map((row: any) => ({
            value: String(row?.groupby_fields?.[0]?.value ?? ''),
            count: parseInt(String(row?.stats?.count ?? '0'), 10) || 0,
          }))
          .sort((a, b) => b.count - a.count);
      };

      const activeCounts = summarize(byActive);
      const categoryCounts = summarize(byCategory);
      const resultCounts = summarize(byResult);
      const total = activeCounts.reduce((s, r) => s + r.count, 0);
      const failed = resultCounts.filter(r => r.value === 'false').reduce((s, r) => s + r.count, 0);

      return {
        total,
        failed_last_result: failed,
        by_category: categoryCounts,
        by_last_result: resultCounts,
        summary: `Indicators: ${total} total, ${failed} with a failing last result`,
      };
    }

    default:
      return null;
  }
}
