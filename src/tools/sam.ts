/**
 * Software Asset Management (SAM Pro) tools — discovered installs, product
 * catalog, license-position compliance, software models, and EOL/EOS lifecycle.
 *
 * Tier 0 (Read): list_software_installs, get_software_install, list_software_products,
 *                 list_license_positions, get_license_position_summary,
 *                 list_software_discovery_models, list_software_models, get_software_model,
 *                 list_software_lifecycle_reports, get_software_lifecycle_report,
 *                 list_software_lifecycle_entries
 *
 * ServiceNow tables: cmdb_sam_sw_install, samp_sw_product, samp_license_position_report,
 *                     cmdb_sam_sw_discovery_model, cmdb_software_product_model,
 *                     sam_sw_product_lifecycle_report, sam_sw_product_lifecycle
 *
 * Note: license-position and lifecycle-report figures are computed by the SAM Pro
 * reconciliation job, not user-editable — this module is read-only by design.
 */
import { sanitizeLikeValue, type ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

/**
 * `lifecycle_phase` / `current_lifecycle_phase` and `risk` are plain string
 * fields backed by a sys_choice list — the encoded query needs the internal
 * choice value (e.g. "very_high"), not the display label ("Very High").
 * Confirmed live against dev400464's sys_choice records for both tables.
 */
const LIFECYCLE_PHASE_CHOICES: Record<string, string> = {
  'pre release': 'pre_release',
  'general availability': 'availability',
  ga: 'availability',
  availability: 'availability',
  upgrade: 'upgrade',
  'end of support': 'end_of_support',
  eos: 'end_of_support',
  'end of extended support': 'end_of_extended_support',
  eoes: 'end_of_extended_support',
  'end of life': 'end_of_life',
  eol: 'end_of_life',
};
const RISK_CHOICES: Record<string, string> = {
  none: 'none',
  low: 'low',
  moderate: 'moderate',
  medium: 'moderate',
  high: 'high',
  'very high': 'very_high',
};

function normalizeChoice(input: string, map: Record<string, string>): string {
  const key = input.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return map[key] ?? input;
}

export function getSamToolDefinitions() {
  return [
    {
      name: 'list_software_installs',
      description: 'List discovered software installations with publisher, version, and license status',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Filter by normalized publisher name' },
          product: { type: 'string', description: 'Filter by normalized product / display name' },
          unlicensed_only: { type: 'boolean', description: 'Only installs flagged as unlicensed' },
          query: { type: 'string', description: 'Additional encoded query' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_software_install',
      description: 'Get full details of a discovered software installation',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'cmdb_sam_sw_install sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_software_products',
      description: 'List the normalized software product catalog (publisher, product type)',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Filter by publisher name' },
          name: { type: 'string', description: 'Filter by product name (LIKE match)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_license_positions',
      description: 'List SAM Pro effective license position (ELP) records — owned vs. used rights per product',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Filter by publisher name' },
          product: { type: 'string', description: 'Filter by product name' },
          over_licensed_only: { type: 'boolean', description: 'Only positions with unused rights / potential savings > 0' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_license_position_summary',
      description: 'Aggregate license-compliance dashboard: over-licensed vs. under-licensed counts, total potential savings, total true-up cost',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Optional filter by publisher name' },
        },
        required: [],
      },
    },
    {
      name: 'list_software_discovery_models',
      description: 'List normalized software discovery models (raw discovery output before/after normalization)',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Filter by normalized publisher name' },
          approved: { type: 'boolean', description: 'Filter by normalization approval status' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_software_models',
      description: 'List software models — specific version/edition entitlement units of a product (license type, EOL date, install count)',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Filter by manufacturer/publisher name' },
          product: { type: 'string', description: 'Filter by product name' },
          query: { type: 'string', description: 'Additional encoded query' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_software_model',
      description: 'Get full details of a software model (rights, consumption rules, EOL date, lifecycle stage)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'cmdb_software_product_model sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_software_lifecycle_reports',
      description: 'List software lifecycle reports — current/upcoming EOL/EOS phase, install count, and CVE exposure per product',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Filter by manufacturer/publisher name' },
          product: { type: 'string', description: 'Filter by product name' },
          current_phase: { type: 'string', description: 'Filter by current lifecycle phase (e.g. "End of Life", "General Availability")' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_software_lifecycle_report',
      description: 'Get full lifecycle report details for one product (all phase dates, CVE breakdown, owners)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sam_sw_product_lifecycle_report sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'list_software_lifecycle_entries',
      description: 'List software lifecycle master data — publisher-provided phase entries (GA/EOL/EOS/EOES) per product/version, with risk rating',
      inputSchema: {
        type: 'object',
        properties: {
          publisher: { type: 'string', description: 'Filter by publisher name' },
          product: { type: 'string', description: 'Filter by normalized product name' },
          lifecycle_phase: { type: 'string', description: 'Filter by phase (e.g. "End of life", "General availability")' },
          risk: { type: 'string', description: 'Filter by risk level (e.g. "Very High", "High", "Medium", "Low")' },
          active: { type: 'boolean', description: 'Filter by active status (default: only active entries)' },
          limit: { type: 'number', description: 'Max records (default 25)' },
        },
        required: [],
      },
    },
  ];
}

export async function executeSamToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_software_installs': {
      let query = '';
      if (args.publisher) query = `norm_publisherLIKE${sanitizeLikeValue(args.publisher)}`;
      if (args.product) query = query ? `${query}^norm_productLIKE${sanitizeLikeValue(args.product)}` : `norm_productLIKE${sanitizeLikeValue(args.product)}`;
      if (args.unlicensed_only) query = query ? `${query}^unlicensed_install=true` : 'unlicensed_install=true';
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({
        table: 'cmdb_sam_sw_install',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,display_name,norm_publisher,norm_product,version,install_date,unlicensed_install,is_reconciled,last_used,active,installed_on',
      });
      return { count: resp.count, installs: resp.records };
    }

    case 'get_software_install': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('cmdb_sam_sw_install', args.sys_id);
    }

    case 'list_software_products': {
      let query = '';
      if (args.publisher) query = `publisherLIKE${sanitizeLikeValue(args.publisher)}`;
      if (args.name) query = query ? `${query}^prod_nameLIKE${sanitizeLikeValue(args.name)}` : `prod_nameLIKE${sanitizeLikeValue(args.name)}`;
      const resp = await client.queryRecords({
        table: 'samp_sw_product',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,prod_name,publisher,product_type,function_type,active',
      });
      return { count: resp.count, products: resp.records };
    }

    case 'list_license_positions': {
      let query = '';
      if (args.publisher) query = `publisherLIKE${sanitizeLikeValue(args.publisher)}`;
      if (args.product) query = query ? `${query}^productLIKE${sanitizeLikeValue(args.product)}` : `productLIKE${sanitizeLikeValue(args.product)}`;
      if (args.over_licensed_only) query = query ? `${query}^over_licensed_amount>0` : 'over_licensed_amount>0';
      const resp = await client.queryRecords({
        table: 'samp_license_position_report',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,product,publisher,licenses_owned,licenses_required,rights_owned,rights_used,rights_consumed,unused_rights,over_licensed_amount,potential_savings,status,total_spend,true_up_cost',
      });
      return { count: resp.count, positions: resp.records };
    }

    case 'get_license_position_summary': {
      const query = args.publisher ? `publisherLIKE${sanitizeLikeValue(args.publisher)}` : undefined;
      // display_value is omitted here: currency fields (over_licensed_amount,
      // potential_savings, true_up_cost) come back as formatted strings like
      // "$3,855,035.2455" under display_value, which breaks Number() parsing below.
      const resp = await client.queryRecords({
        table: 'samp_license_position_report',
        query,
        limit: 1000,
        fields: 'product,publisher,licenses_owned,licenses_required,over_licensed_amount,potential_savings,true_up_cost,status',
      });
      let overLicensed = 0;
      let underLicensed = 0;
      let totalSavings = 0;
      let totalTrueUpCost = 0;
      for (const r of resp.records) {
        const over = Number(r.over_licensed_amount) || 0;
        const savings = Number(r.potential_savings) || 0;
        const trueUp = Number(r.true_up_cost) || 0;
        if (over > 0) overLicensed++;
        if (trueUp > 0) underLicensed++;
        totalSavings += savings;
        totalTrueUpCost += trueUp;
      }
      return {
        products_evaluated: resp.count,
        over_licensed_count: overLicensed,
        under_licensed_count: underLicensed,
        total_potential_savings: totalSavings,
        total_true_up_cost: totalTrueUpCost,
      };
    }

    case 'list_software_discovery_models': {
      let query = '';
      if (args.publisher) query = `norm_publisherLIKE${sanitizeLikeValue(args.publisher)}`;
      if (args.approved !== undefined) query = query ? `${query}^approved=${args.approved}` : `approved=${args.approved}`;
      const resp = await client.queryRecords({
        table: 'cmdb_sam_sw_discovery_model',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,primary_display_name,norm_publisher,norm_product,norm_version,install_count,approved,status',
      });
      return { count: resp.count, discovery_models: resp.records };
    }

    case 'list_software_models': {
      let query = '';
      if (args.publisher) query = `manufacturer.nameLIKE${sanitizeLikeValue(args.publisher)}`;
      if (args.product) query = query ? `${query}^product.prod_nameLIKE${sanitizeLikeValue(args.product)}` : `product.prod_nameLIKE${sanitizeLikeValue(args.product)}`;
      if (args.query) query = query ? `${query}^${args.query}` : args.query;
      const resp = await client.queryRecords({
        table: 'cmdb_software_product_model',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,title,manufacturer,product,version,edition,sw_product_type,license_type,end_of_life_date,life_cycle_stage,install_count',
      });
      return { count: resp.count, models: resp.records };
    }

    case 'get_software_model': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('cmdb_software_product_model', args.sys_id);
    }

    case 'list_software_lifecycle_reports': {
      let query = '';
      if (args.publisher) query = `manufacturerLIKE${sanitizeLikeValue(args.publisher)}`;
      if (args.product) query = query ? `${query}^norm_productLIKE${sanitizeLikeValue(args.product)}` : `norm_productLIKE${sanitizeLikeValue(args.product)}`;
      if (args.current_phase) {
        const phase = sanitizeLikeValue(normalizeChoice(args.current_phase, LIFECYCLE_PHASE_CHOICES));
        query = query ? `${query}^current_lifecycle_phase=${phase}` : `current_lifecycle_phase=${phase}`;
      }
      const resp = await client.queryRecords({
        table: 'sam_sw_product_lifecycle_report',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,display_name,manufacturer,norm_product,current_lifecycle_phase,upcoming_lifecycle_phase,upcoming_lifecycle_phase_start_date,eol_start_date,eos_start_date,ga_start_date,install_count,cve_count,critical_cve_count,max_cvss_score',
      });
      return { count: resp.count, lifecycle_reports: resp.records };
    }

    case 'get_software_lifecycle_report': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sam_sw_product_lifecycle_report', args.sys_id);
    }

    case 'list_software_lifecycle_entries': {
      let query = args.active !== false ? 'active=true' : '';
      if (args.publisher) query = query ? `${query}^publisherLIKE${sanitizeLikeValue(args.publisher)}` : `publisherLIKE${sanitizeLikeValue(args.publisher)}`;
      if (args.product) query = query ? `${query}^norm_productLIKE${sanitizeLikeValue(args.product)}` : `norm_productLIKE${sanitizeLikeValue(args.product)}`;
      if (args.lifecycle_phase) {
        const phase = sanitizeLikeValue(normalizeChoice(args.lifecycle_phase, LIFECYCLE_PHASE_CHOICES));
        query = query ? `${query}^lifecycle_phase=${phase}` : `lifecycle_phase=${phase}`;
      }
      if (args.risk) {
        const risk = sanitizeLikeValue(normalizeChoice(args.risk, RISK_CHOICES));
        query = query ? `${query}^risk=${risk}` : `risk=${risk}`;
      }
      const resp = await client.queryRecords({
        table: 'sam_sw_product_lifecycle',
        query: query || undefined,
        limit: args.limit || 25,
        display_value: true,
        fields: 'sys_id,norm_product,publisher,norm_version,norm_edition,lifecycle_phase,lifecycle_type,start_date,risk,source,active',
      });
      return { count: resp.count, lifecycle_entries: resp.records };
    }

    default:
      return null;
  }
}
