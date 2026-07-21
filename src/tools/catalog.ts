/**
 * Service Catalog and Approval tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { sanitizeLikeValue } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';
import { REQUEST_STATE, RITM_STAGE, RITM_STATE, APPROVAL_STATE } from './schema-helpers.js';

// ─── Input validation helpers ────────────────────────────────────────────────

const VALID_SYS_ID = /^[0-9a-f]{32}$/i;
const VALID_REQUEST_NUMBER = /^REQ\d{1,12}$/i;
const VALID_RITM_NUMBER = /^RITM\d{1,12}$/i;
const VALID_USERNAME = /^[a-zA-Z0-9._@\-]{1,100}$/;
const VALID_STAGES = new Set(['request', 'approval', 'fulfillment', 'delivery', 'closed']);
const VALID_RITM_STATES = new Set(['1', '2', '3', '4']);
const CATALOG_ITEM_FIELDS = new Set([
  'name', 'short_description', 'description', 'category', 'price', 'delivery_time', 'active', 'roles',
]);


export function getCatalogToolDefinitions() {
  return [
    {
      name: 'list_catalog_items',
      description: 'List available service catalog items',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category name or sys_id' },
          limit: { type: 'number', description: 'Max items (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'search_catalog',
      description: 'Search the service catalog for items matching a keyword',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_catalog_item',
      description: 'Get full details of a catalog item including its variables',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Catalog item sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'create_catalog_item',
      description: 'Create a new service catalog item (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Catalog item display name' },
          short_description: { type: 'string', description: 'One-line summary shown in search results' },
          description: { type: 'string', description: 'Full HTML description of the item' },
          category: { type: 'string', description: 'sys_id of the catalog category (sc_category)' },
          price: { type: 'string', description: 'Price (e.g. "0", "99.99")' },
          delivery_time: {
            type: 'string',
            description: 'Estimated delivery time ISO 8601 duration (e.g. "1 08:00:00" for 1 day 8 hours)',
          },
          active: { type: 'boolean', description: 'Make the item available in the catalog (default: true)' },
          roles: { type: 'string', description: 'Comma-separated roles that can see the item' },
        },
        required: ['name', 'short_description'],
      },
    },
    {
      name: 'update_catalog_item',
      description: 'Update an existing catalog item (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Catalog item sys_id' },
          fields: {
            type: 'object',
            description: 'Fields to update (name, short_description, price, active, category, etc.)',
            properties: Object.fromEntries([...CATALOG_ITEM_FIELDS].map(field => [field, {}])),
            additionalProperties: false,
          },
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'order_catalog_item',
      description: 'Order a service catalog item (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the catalog item' },
          quantity: { type: 'number', description: 'Quantity to order (default: 1)' },
          variables: { type: 'object', description: 'Catalog item variables as key-value pairs' },
        },
        required: ['sys_id'],
      },
    },
    // Approval tools
    {
      name: 'create_approval_rule',
      description:
        'Create an approval rule that automatically generates approval requests when a record matches given conditions (requires WRITE_ENABLED=true). ' +
        'Uses the sysapproval_rule table.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Rule name' },
          table: {
            type: 'string',
            description: 'Table this rule applies to (e.g. "sc_request", "change_request")',
          },
          approver_type: {
            type: 'string',
            description: '"user" | "group" — whether the approver is a user or a group',
          },
          approver: {
            type: 'string',
            description: 'sys_id of the approving user or group',
          },
          condition: {
            type: 'string',
            description: 'Encoded query that determines when the rule fires (leave blank for always)',
          },
          active: { type: 'boolean', description: 'Activate the rule immediately (default: true)' },
          order: { type: 'number', description: 'Execution order relative to other rules (default: 100)' },
        },
        required: ['name', 'table', 'approver_type', 'approver'],
      },
    },
    {
      name: 'get_my_approvals',
      description: 'List approvals pending for the currently configured user',
      inputSchema: {
        type: 'object',
        properties: {
          state: { ...APPROVAL_STATE, description: 'Filter by approval state (default: requested)' },
        },
        required: [],
      },
    },
    {
      name: 'list_approvals',
      description: 'List approval requests with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter' },
          state: { ...APPROVAL_STATE, description: 'Filter by approval state' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'approve_request',
      description: 'Approve a pending approval request (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the approval record' },
          comments: { type: 'string', description: 'Optional approval comments' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'reject_request',
      description: 'Reject a pending approval request (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the approval record' },
          comments: { type: 'string', description: 'Reason for rejection (required)' },
        },
        required: ['sys_id', 'comments'],
      },
    },
    // SLA tools
    {
      name: 'get_sla_details',
      description: 'Get SLA breach status for a specific task or incident',
      inputSchema: {
        type: 'object',
        properties: {
          task_sys_id: { type: 'string', description: 'System ID of the task/incident' },
        },
        required: ['task_sys_id'],
      },
    },
    {
      name: 'list_active_slas',
      description: 'List active SLA records with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Encoded query filter' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'create_catalog_variable',
      description: '[Write] Add a form variable to a service catalog item',
      inputSchema: {
        type: 'object',
        properties: {
          cat_item_id: { type: 'string', description: 'Catalog item sys_id' },
          name: { type: 'string', description: 'Variable name' },
          question_text: { type: 'string', description: 'Label shown to user' },
          type: { type: 'string', description: 'Variable type: string/reference/select_box/checkbox/date/date_time/integer/multi_line_text/email' },
          order: { type: 'number', description: 'Display order (default: 100)' },
          mandatory: { type: 'boolean', description: 'Required field' },
        },
        required: ['cat_item_id', 'name', 'question_text', 'type'],
      },
    },
    {
      name: 'create_catalog_ui_policy',
      description: '[Write] Create a UI policy for a catalog item form',
      inputSchema: {
        type: 'object',
        properties: {
          cat_item_id: { type: 'string', description: 'Catalog item sys_id' },
          short_description: { type: 'string', description: 'UI policy description' },
          conditions: { type: 'string', description: 'Encoded condition query' },
          reverse_if_false: { type: 'boolean', description: 'Reverse actions when condition is false' },
        },
        required: ['cat_item_id', 'short_description'],
      },
    },
    // ── Request lifecycle ────────────────────────────────────────────────────
    {
      name: 'list_requests',
      description: 'List service catalog requests (sc_request). Supports filtering by state and requested_for user.',
      inputSchema: {
        type: 'object',
        properties: {
          state: { ...REQUEST_STATE, description: 'Filter by request state. ' + REQUEST_STATE.description },
          requested_for: { type: 'string', description: 'sys_id or user_name of the user the request was made for' },
          query: { type: 'string', description: 'Additional encoded query filter' },
          limit: { type: 'number', description: 'Max records (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_request',
      description: 'Get a service catalog request (sc_request) by number or sys_id, including its requested items',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Request number (e.g. REQ0001234) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'list_request_items',
      description: 'List requested items (sc_req_item) for a given request or catalog item',
      inputSchema: {
        type: 'object',
        properties: {
          request_sysid: { type: 'string', description: 'Parent sc_request sys_id — list items for this request' },
          cat_item_sysid: { type: 'string', description: 'Catalog item sys_id — list all requests for this item' },
          stage: { ...RITM_STAGE, description: 'Filter by stage. ' + RITM_STAGE.description },
          limit: { type: 'number', description: 'Max records (default: 20)' },
        },
        required: [],
      },
    },
    {
      name: 'get_request_item',
      description: 'Get a requested item (sc_req_item) by number or sys_id, including its fulfillment tasks',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'RITM number (e.g. RITM0001234) or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'cancel_request',
      description: 'Cancel an open service catalog request (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sc_request sys_id' },
          comments: { type: 'string', description: 'Reason for cancellation' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'update_request_item',
      description: 'Update a requested item — stage, assignment, or work notes (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'sc_req_item sys_id' },
          stage: { type: 'string', description: 'New stage: request, approval, fulfillment, delivery, closed' },
          state: { ...RITM_STATE, description: 'New state. ' + RITM_STATE.description },
          assigned_to: { type: 'string', description: 'sys_id of the user to assign to' },
          assignment_group: { type: 'string', description: 'sys_id of the assignment group' },
          work_notes: { type: 'string', description: 'Work note to append' },
        },
        required: ['sys_id'],
      },
    },
  ];
}

export async function executeCatalogToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_catalog_items': {
      let query = 'active=true';
      if (args.category) query += `^category.title=${args.category}^ORcategory=${args.category}`;
      const resp = await client.queryRecords({ table: 'sc_cat_item', query, limit: args.limit || 20, fields: 'sys_id,name,short_description,category,price' });
      return { count: resp.count, catalog_items: resp.records };
    }
    case 'search_catalog': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const resp = await client.queryRecords({ table: 'sc_cat_item', query: `nameLIKE${args.query}^ORshort_descriptionLIKE${args.query}^active=true`, limit: args.limit || 10 });
      return { count: resp.count, catalog_items: resp.records };
    }
    case 'get_catalog_item': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sc_cat_item', args.sys_id_or_name);
      }
      const safeCatItemId = sanitizeLikeValue(args.sys_id_or_name);
      const resp = await client.queryRecords({ table: 'sc_cat_item', query: `name=${safeCatItemId}^ORsys_id=${safeCatItemId}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Catalog item not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'create_catalog_item': {
      requireWrite();
      if (!args.name || !args.short_description)
        throw new ServiceNowError('name and short_description are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        short_description: args.short_description,
        active: args.active !== false,
      };
      if (args.description) data.description = args.description;
      if (args.category) data.category = args.category;
      if (args.price !== undefined) data.price = args.price;
      if (args.delivery_time) data.delivery_time = args.delivery_time;
      if (args.roles) data.roles = args.roles;
      const result = await client.createRecord('sc_cat_item', data);
      return { ...result, summary: `Created catalog item "${args.name}"` };
    }
    case 'update_catalog_item': {
      requireWrite();
      if (!args.sys_id || !args.fields)
        throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      const unsafeFields = Object.keys(args.fields).filter(field => !CATALOG_ITEM_FIELDS.has(field));
      if (unsafeFields.length) {
        throw new ServiceNowError(
          `Catalog item fields cannot be updated: ${unsafeFields.join(', ')}. Allowed fields: ${[...CATALOG_ITEM_FIELDS].join(', ')}`,
          'VALIDATION_ERROR'
        );
      }
      const result = await client.updateRecord('sc_cat_item', args.sys_id, args.fields);
      return { ...result, summary: `Updated catalog item ${args.sys_id}` };
    }
    case 'order_catalog_item': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      // Use Service Catalog API: POST /api/now/v1/servicecatalog/items/{sys_id}/order_now
      const result = await client.callNowAssist(`/api/now/v1/servicecatalog/items/${args.sys_id}/order_now`, {
        sysparm_quantity: args.quantity || 1,
        variables: args.variables || {},
      });
      return { ...result, summary: `Ordered catalog item ${args.sys_id}` };
    }
    case 'create_approval_rule': {
      requireWrite();
      if (!args.name || !args.table || !args.approver_type || !args.approver)
        throw new ServiceNowError('name, table, approver_type, and approver are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        table: args.table,
        approver_type: args.approver_type,
        active: args.active !== false,
        order: args.order ?? 100,
      };
      if (args.approver_type === 'group') {
        data.approver_group = args.approver;
      } else {
        data.approver = args.approver;
      }
      if (args.condition) data.condition = args.condition;
      const result = await client.createRecord('sysapproval_rule', data);
      return {
        ...result,
        summary: `Created approval rule "${args.name}" for table "${args.table}" with ${args.approver_type} approver`,
      };
    }
    case 'get_my_approvals': {
      const username = process.env.SERVICENOW_OAUTH_USERNAME || process.env.SERVICENOW_USERNAME || '';
      const state = args.state || 'requested';
      let query = `state=${state}`;
      if (username) query += `^approver.user_name=${username}`;
      const resp = await client.queryRecords({ table: 'sysapproval_approver', query, limit: 20, fields: 'sys_id,state,approver,sysapproval,comments,sys_updated_on' });
      return { count: resp.count, approvals: resp.records };
    }
    case 'list_approvals': {
      let query = args.query || '';
      if (args.state) query = query ? `${query}^state=${args.state}` : `state=${args.state}`;
      const resp = await client.queryRecords({ table: 'sysapproval_approver', query: query || undefined, limit: args.limit || 10 });
      return { count: resp.count, approvals: resp.records };
    }
    case 'approve_request': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const data: Record<string, string> = { state: 'approved' };
      if (args.comments) data.comments = args.comments;
      const result = await client.updateRecord('sysapproval_approver', args.sys_id, data);
      return { ...result, summary: `Approved request ${args.sys_id}` };
    }
    case 'reject_request': {
      requireWrite();
      if (!args.sys_id || !args.comments) throw new ServiceNowError('sys_id and comments are required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sysapproval_approver', args.sys_id, { state: 'rejected', comments: args.comments });
      return { ...result, summary: `Rejected request ${args.sys_id}` };
    }
    case 'get_sla_details': {
      if (!args.task_sys_id) throw new ServiceNowError('task_sys_id is required', 'INVALID_REQUEST');
      const resp = await client.queryRecords({ table: 'task_sla', query: `task=${args.task_sys_id}`, fields: 'sys_id,sla,stage,has_breached,percentage,pause_time,business_time_left,sys_updated_on' });
      return { count: resp.count, slas: resp.records };
    }
    case 'list_active_slas': {
      let query = 'stage!=complete^has_breached=false';
      if (args.query) query = `${args.query}^${query}`;
      const resp = await client.queryRecords({ table: 'task_sla', query, limit: args.limit || 10 });
      return { count: resp.count, slas: resp.records };
    }
    case 'create_catalog_variable': {
      requireWrite();
      if (!args.cat_item_id || !args.name || !args.question_text || !args.type)
        throw new ServiceNowError('cat_item_id, name, question_text, and type are required', 'INVALID_REQUEST');
      const typeMap: Record<string, string> = {
        string: '6', reference: '8', select_box: '1', checkbox: '7', date: '10',
        date_time: '15', integer: '2', multi_line_text: '2', email: '32',
      };
      const result = await client.createRecord('item_option_new', {
        cat_item: args.cat_item_id,
        name: args.name,
        question_text: args.question_text,
        type: typeMap[args.type] || args.type,
        order: args.order || 100,
        mandatory: args.mandatory ? 'true' : 'false',
      });
      return { ...result, summary: `Created catalog variable "${args.name}" on item ${args.cat_item_id}` };
    }
    case 'create_catalog_ui_policy': {
      requireWrite();
      if (!args.cat_item_id || !args.short_description)
        throw new ServiceNowError('cat_item_id and short_description are required', 'INVALID_REQUEST');
      const result = await client.createRecord('catalog_ui_policy', {
        catalog_item: args.cat_item_id,
        short_description: args.short_description,
        applies_to: 'catalog_item',
        catalog_conditions: args.conditions || '',
        reverse_if_false: args.reverse_if_false ? 'true' : 'false',
        active: 'true',
      });
      return { ...result, summary: `Created catalog UI policy "${args.short_description}" on item ${args.cat_item_id}` };
    }
    case 'list_requests': {
      const stateMap: Record<string, string> = {
        open: '1', closed_complete: '2', closed_incomplete: '3', closed_cancelled: '4',
      };
      const parts: string[] = [];
      if (args.state) {
        const code = stateMap[args.state] ?? args.state;
        if (!['1', '2', '3', '4'].includes(code))
          throw new ServiceNowError(`Invalid state "${args.state}". Use: open, closed_complete, closed_incomplete, closed_cancelled`, 'INVALID_REQUEST');
        parts.push(`state=${code}`);
      }
      if (args.requested_for) {
        if (VALID_SYS_ID.test(args.requested_for)) {
          parts.push(`requested_for=${args.requested_for}`);
        } else if (VALID_USERNAME.test(args.requested_for)) {
          parts.push(`requested_for.user_name=${args.requested_for}`);
        } else {
          throw new ServiceNowError('requested_for must be a 32-char sys_id or a valid username', 'INVALID_REQUEST');
        }
      }
      // args.query is passed through client.queryRecords → validateQuery() which blocks javascript: injection
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sc_request',
        query: parts.join('^') || undefined,
        limit: args.limit || 20,
        fields: 'sys_id,number,state,short_description,requested_for,requested_by,price,sys_created_on,sys_updated_on',
      });
      return { count: resp.count, requests: resp.records };
    }
    case 'get_request': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      let request: any;
      if (VALID_SYS_ID.test(args.number_or_sysid)) {
        request = await client.getRecord('sc_request', args.number_or_sysid);
      } else if (VALID_REQUEST_NUMBER.test(args.number_or_sysid)) {
        const resp = await client.queryRecords({ table: 'sc_request', query: `number=${args.number_or_sysid.toUpperCase()}`, limit: 1 });
        if (resp.count === 0) throw new ServiceNowError(`Request not found: ${args.number_or_sysid}`, 'NOT_FOUND');
        request = resp.records[0];
      } else {
        throw new ServiceNowError('number_or_sysid must be a 32-char sys_id or REQ number (e.g. REQ0001234)', 'INVALID_REQUEST');
      }
      const reqId = (request as any).sys_id?.value ?? (request as any).sys_id;
      if (!VALID_SYS_ID.test(String(reqId))) throw new ServiceNowError('Unexpected sys_id format in response', 'API_ERROR');
      const items = await client.queryRecords({
        table: 'sc_req_item',
        query: `request=${reqId}`,
        limit: 50,
        fields: 'sys_id,number,state,stage,short_description,cat_item,quantity,price,assigned_to,sys_updated_on',
      });
      return { request, items: items.records, item_count: items.count };
    }
    case 'list_request_items': {
      const parts: string[] = [];
      if (args.request_sysid) {
        if (!VALID_SYS_ID.test(args.request_sysid))
          throw new ServiceNowError('request_sysid must be a 32-char hex sys_id', 'INVALID_REQUEST');
        parts.push(`request=${args.request_sysid}`);
      }
      if (args.cat_item_sysid) {
        if (!VALID_SYS_ID.test(args.cat_item_sysid))
          throw new ServiceNowError('cat_item_sysid must be a 32-char hex sys_id', 'INVALID_REQUEST');
        parts.push(`cat_item=${args.cat_item_sysid}`);
      }
      if (args.stage) {
        if (!VALID_STAGES.has(args.stage))
          throw new ServiceNowError(`Invalid stage "${args.stage}". Use: request, approval, fulfillment, delivery, closed`, 'INVALID_REQUEST');
        parts.push(`stage=${args.stage}`);
      }
      if (args.query) parts.push(args.query);
      const resp = await client.queryRecords({
        table: 'sc_req_item',
        query: parts.join('^') || undefined,
        limit: args.limit || 20,
        fields: 'sys_id,number,state,stage,short_description,cat_item,request,quantity,price,assigned_to,assignment_group,sys_created_on,sys_updated_on',
      });
      return { count: resp.count, request_items: resp.records };
    }
    case 'get_request_item': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      let item: any;
      if (VALID_SYS_ID.test(args.number_or_sysid)) {
        item = await client.getRecord('sc_req_item', args.number_or_sysid);
      } else if (VALID_RITM_NUMBER.test(args.number_or_sysid)) {
        const resp = await client.queryRecords({ table: 'sc_req_item', query: `number=${args.number_or_sysid.toUpperCase()}`, limit: 1 });
        if (resp.count === 0) throw new ServiceNowError(`Request item not found: ${args.number_or_sysid}`, 'NOT_FOUND');
        item = resp.records[0];
      } else {
        throw new ServiceNowError('number_or_sysid must be a 32-char sys_id or RITM number (e.g. RITM0001234)', 'INVALID_REQUEST');
      }
      const itemId = (item as any).sys_id?.value ?? (item as any).sys_id;
      if (!VALID_SYS_ID.test(String(itemId))) throw new ServiceNowError('Unexpected sys_id format in response', 'API_ERROR');
      const tasks = await client.queryRecords({
        table: 'sc_task',
        query: `request_item=${itemId}`,
        limit: 20,
        fields: 'sys_id,number,state,short_description,assigned_to,sys_updated_on',
      });
      return { request_item: item, tasks: tasks.records, task_count: tasks.count };
    }
    case 'cancel_request': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const data: Record<string, string> = { state: '4' }; // closed_cancelled
      if (args.comments) data.comments = args.comments;
      const result = await client.updateRecord('sc_request', args.sys_id, data);
      return { ...result, summary: `Cancelled request ${args.sys_id}` };
    }
    case 'update_request_item': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const data: Record<string, string> = {};
      if (args.stage !== undefined) {
        if (!VALID_STAGES.has(args.stage))
          throw new ServiceNowError(`Invalid stage "${args.stage}". Use: request, approval, fulfillment, delivery, closed`, 'INVALID_REQUEST');
        data.stage = args.stage;
      }
      if (args.state !== undefined) {
        if (!VALID_RITM_STATES.has(String(args.state)))
          throw new ServiceNowError(`Invalid state "${args.state}". Use: 1 (pending), 2 (approved), 3 (cancelled), 4 (delivered)`, 'INVALID_REQUEST');
        data.state = String(args.state);
      }
      if (args.assigned_to) {
        if (!VALID_SYS_ID.test(args.assigned_to))
          throw new ServiceNowError('assigned_to must be a 32-char sys_id', 'INVALID_REQUEST');
        data.assigned_to = args.assigned_to;
      }
      if (args.assignment_group) {
        if (!VALID_SYS_ID.test(args.assignment_group))
          throw new ServiceNowError('assignment_group must be a 32-char sys_id', 'INVALID_REQUEST');
        data.assignment_group = args.assignment_group;
      }
      if (args.work_notes) data.work_notes = args.work_notes;
      if (Object.keys(data).length === 0) throw new ServiceNowError('At least one field to update is required', 'INVALID_REQUEST');
      const result = await client.updateRecord('sc_req_item', args.sys_id, data);
      return { ...result, summary: `Updated request item ${args.sys_id}` };
    }
    default:
      return null;
  }
}
