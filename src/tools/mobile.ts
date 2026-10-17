/**
 * ServiceNow Mobile native metadata tools. Historical tool names are retained;
 * screens and screen/UI-element mappings are not standalone applet/layout tables.
 * Offline configuration, push delivery and usage analytics are explicitly unsupported.
 *
 * Tables: sys_sg_mobile_application, sys_sg_screen, sys_sg_screen_m2m_ui_element.
 */
import { sanitizeLikeValue, type ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

function assertNativeArgs(args: Record<string, unknown>, allowed: string[]): void {
  const unsupported = Object.keys(args).filter(key => !allowed.includes(key));
  if (unsupported.length) throw new ServiceNowError(`Unsupported native Mobile arguments: ${unsupported.join(', ')}`, 'INVALID_REQUEST');
  for (const [key, value] of Object.entries(args)) {
    if (key === 'limit') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1000) throw new ServiceNowError('limit must be an integer between 1 and 1000', 'INVALID_REQUEST');
    } else if (typeof value !== 'string' || !value.trim()) {
      throw new ServiceNowError(`${key} must be a non-empty string`, 'INVALID_REQUEST');
    }
  }
}

export function getMobileToolDefinitions() {
  return [
    {
      name: 'list_mobile_app_configs',
      description: 'List sys_sg_mobile_application definitions, not installed client usage. This model has no active column.',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 1000 } }, required: [], additionalProperties: false },
    },
    {
      name: 'get_mobile_app_config',
      description: 'Get details of a specific mobile app configuration',
      inputSchema: { type: 'object', properties: { sys_id: { type: 'string', description: 'sys_sg_mobile_application sys_id' } }, required: ['sys_id'], additionalProperties: false },
    },
    {
      name: 'create_mobile_app_config',
      description: 'Create a name-only sys_sg_mobile_application metadata record. Does not provision an installable mobile app, branding, navigation or screens. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1 } }, required: ['name'], additionalProperties: false },
    },
    {
      name: 'list_mobile_applets',
      description: 'List native sys_sg_screen metadata. Historical applet name retained; scope is an application scope, not a mobile application ID.',
      inputSchema: { type: 'object', properties: { scope: { type: 'string', description: 'Application scope sys_id' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, required: [], additionalProperties: false },
    },
    {
      name: 'create_mobile_applet',
      description: 'Create base sys_sg_screen metadata only. Does not configure a screen subtype, data item, navigation or app association. **[Write]**',
      inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1 }, description: { type: 'string' } }, required: ['name'], additionalProperties: false },
    },
    {
      name: 'list_mobile_layouts',
      description: 'List sys_sg_screen_m2m_ui_element mappings, not complete mobile layout definitions. Historical tool name retained.',
      inputSchema: { type: 'object', properties: { screen_sys_id: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 1000 } }, required: [], additionalProperties: false },
    },
    {
      name: 'create_mobile_layout',
      description: 'Link an existing screen to an existing UI element. Creates only an M2M mapping, not a full layout or screen. **[Write]**',
      inputSchema: { type: 'object', properties: { screen_sys_id: { type: 'string' }, ui_element_sys_id: { type: 'string' } }, required: ['screen_sys_id', 'ui_element_sys_id'], additionalProperties: false },
    },
    {
      name: 'configure_offline_sync',
      description: 'UNSUPPORTED: offline configuration requires a validated Mobile App Builder workflow. No state-table writes are performed. **[Write]**',
      inputSchema: { type: 'object', properties: { table: { type: 'string', description: 'Table to sync offline' }, query: { type: 'string', description: 'Filter query for sync scope' }, max_records: { type: 'number', description: 'Max offline records (default 500)' } }, required: ['table'] },
    },
    {
      name: 'send_push_notification',
      description: 'UNSUPPORTED: push delivery requires a validated notification workflow. No queue insert or delivery is performed. **[Write]**',
      inputSchema: { type: 'object', properties: { user: { type: 'string', description: 'Target user sys_id' }, group: { type: 'string', description: 'Target group sys_id (alternative to user)' }, title: { type: 'string', description: 'Notification title' }, body: { type: 'string', description: 'Notification body text' }, action_url: { type: 'string', description: 'Deep link URL on tap' } }, required: ['title', 'body'] },
    },
    {
      name: 'get_mobile_analytics',
      description: 'UNSUPPORTED: no validated mobile session telemetry source is configured. Returns an error rather than invented usage counts.',
      inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Analysis period in days (default 30)' } }, required: [] },
    },
  ];
}

export async function executeMobileToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'list_mobile_app_configs': {
      assertNativeArgs(args, ['limit']);
      const resp = await client.queryRecords({ table: 'sys_sg_mobile_application', query: undefined, limit: args.limit || 25, fields: 'sys_id,name,ios_bundle_id,android_package_name,client_type_header,sys_updated_on' });
      return { count: resp.count, configs: resp.records };
    }
    case 'get_mobile_app_config': {
      assertNativeArgs(args, ['sys_id']);
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_sg_mobile_application', args.sys_id);
    }
    case 'create_mobile_app_config': {
      requireWrite();
      assertNativeArgs(args, ['name']);
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_sg_mobile_application', { name: args.name });
      return { action: 'created', ...result };
    }
    case 'list_mobile_applets': {
      assertNativeArgs(args, ['scope', 'limit']);
      const resp = await client.queryRecords({ table: 'sys_sg_screen', query: args.scope ? `sys_scope=${sanitizeLikeValue(args.scope)}` : undefined, limit: args.limit || 25, fields: 'sys_id,name,description,icon,available_offline,sys_scope,sys_updated_on' });
      return { count: resp.count, applets: resp.records, source_table: 'sys_sg_screen', data_kind: 'screen_metadata' };
    }
    case 'create_mobile_applet': {
      requireWrite();
      assertNativeArgs(args, ['name', 'description']);
      if (!args.name) throw new ServiceNowError('name is required', 'INVALID_REQUEST');
      const result = await client.createRecord('sys_sg_screen', { name: args.name, ...(args.description ? { description: args.description } : {}) });
      return { action: 'created', ...result };
    }
    case 'list_mobile_layouts': {
      assertNativeArgs(args, ['screen_sys_id', 'limit']);
      const resp = await client.queryRecords({ table: 'sys_sg_screen_m2m_ui_element', query: args.screen_sys_id ? `screen=${sanitizeLikeValue(args.screen_sys_id)}` : undefined, limit: args.limit || 25, fields: 'sys_id,screen,ui_element,sys_updated_on' });
      return { count: resp.count, layouts: resp.records, source_table: 'sys_sg_screen_m2m_ui_element', data_kind: 'screen_ui_element_mappings' };
    }
    case 'create_mobile_layout': {
      requireWrite();
      assertNativeArgs(args, ['screen_sys_id', 'ui_element_sys_id']);
      if (!args.screen_sys_id || !args.ui_element_sys_id) throw new ServiceNowError('screen_sys_id and ui_element_sys_id are required', 'INVALID_REQUEST');
      await client.getRecord('sys_sg_screen', args.screen_sys_id);
      await client.getRecord('sys_sg_ui_element', args.ui_element_sys_id);
      const result = await client.createRecord('sys_sg_screen_m2m_ui_element', { screen: args.screen_sys_id, ui_element: args.ui_element_sys_id });
      return { action: 'created', ...result };
    }
    case 'configure_offline_sync': {
      requireWrite();
      throw new ServiceNowError('Offline configuration is not implemented. sys_sg_offline_sync stores synchronization state, not table/query/max_records configuration. Use Mobile App Builder.', 'UNSUPPORTED_OPERATION');
    }
    case 'send_push_notification': {
      requireWrite();
      throw new ServiceNowError('Push delivery is not implemented. Inserting title/body/user into sys_push_notification is not a supported delivery workflow. Configure a ServiceNow notification and its supported delivery mechanism.', 'UNSUPPORTED_OPERATION');
    }
    case 'get_mobile_analytics': {
      throw new ServiceNowError('Mobile usage analytics is not implemented. No validated session telemetry source is configured; application definitions cannot be counted as active users or sessions.', 'UNSUPPORTED_OPERATION');
    }
    default:
      return null;
  }
}
