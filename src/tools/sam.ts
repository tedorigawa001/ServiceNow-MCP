/**
 * Software Asset Management (SAM Pro) tools — discovered installs, product
 * catalog, and license-position compliance.
 *
 * Tier 0 (Read): list_software_installs, get_software_install, list_software_products,
 *                 list_license_positions, get_license_position_summary,
 *                 list_software_discovery_models
 *
 * ServiceNow tables: cmdb_sam_sw_install, samp_sw_product, samp_license_position_report,
 *                     cmdb_sam_sw_discovery_model
 *
 * Note: license-position figures are computed by the SAM Pro reconciliation job,
 * not user-editable — this module is read-only by design.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

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
      if (args.publisher) query = `norm_publisherLIKE${args.publisher}`;
      if (args.product) query = query ? `${query}^norm_productLIKE${args.product}` : `norm_productLIKE${args.product}`;
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
      if (args.publisher) query = `publisherLIKE${args.publisher}`;
      if (args.name) query = query ? `${query}^prod_nameLIKE${args.name}` : `prod_nameLIKE${args.name}`;
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
      if (args.publisher) query = `publisherLIKE${args.publisher}`;
      if (args.product) query = query ? `${query}^productLIKE${args.product}` : `productLIKE${args.product}`;
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
      const query = args.publisher ? `publisherLIKE${args.publisher}` : undefined;
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
      if (args.publisher) query = `norm_publisherLIKE${args.publisher}`;
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

    default:
      return null;
  }
}
