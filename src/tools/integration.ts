/**
 * Integration tools — REST Messages, Transform Maps, Import Sets, and Event Registry.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by snow-flow's "Automation/Integration" category.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';

export function getIntegrationToolDefinitions() {
  return [
    // ── Outbound REST Messages ───────────────────────────────────────────────
    {
      name: 'list_rest_messages',
      description: 'List outbound REST Message configurations (integrations with external APIs)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or description' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_rest_message',
      description: 'Get full configuration of an outbound REST Message including its endpoints',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'REST Message sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'list_rest_message_functions',
      description: 'List HTTP methods (functions) defined within a REST Message',
      inputSchema: {
        type: 'object',
        properties: {
          rest_message_sys_id: { type: 'string', description: 'Parent REST Message sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['rest_message_sys_id'],
      },
    },
    {
      name: 'create_rest_message',
      description: 'Create a new outbound REST Message definition (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique REST Message name' },
          endpoint: { type: 'string', description: 'Base URL endpoint (e.g. "https://api.example.com/v1")' },
          description: { type: 'string', description: 'Purpose/description of this integration' },
          use_mutual_auth: { type: 'boolean', description: 'Whether to use mutual TLS authentication' },
          authentication_type: {
            type: 'string',
            description: 'Auth type: "no_authentication", "basic", "oauth2"',
          },
        },
        required: ['name', 'endpoint'],
      },
    },
    // ── Transform Maps ──────────────────────────────────────────────────────
    {
      name: 'list_transform_maps',
      description: 'List Transform Maps used for importing data into ServiceNow tables',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or target table' },
          target_table: { type: 'string', description: 'Filter by target table name (e.g. "incident")' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_transform_map',
      description: 'Get details of a Transform Map including its field mappings',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Transform Map sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'run_transform_map',
      description: 'Execute a Transform Map on an Import Set to load data (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          transform_map_sys_id: { type: 'string', description: 'sys_id of the Transform Map to run' },
          import_set_sys_id: { type: 'string', description: 'sys_id of the Import Set containing source data' },
        },
        required: ['transform_map_sys_id', 'import_set_sys_id'],
      },
    },
    {
      name: 'list_transform_field_maps',
      description: 'List field-level mappings within a Transform Map',
      inputSchema: {
        type: 'object',
        properties: {
          transform_map_sys_id: { type: 'string', description: 'Parent Transform Map sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: ['transform_map_sys_id'],
      },
    },
    // ── Import Sets ─────────────────────────────────────────────────────────
    {
      name: 'list_import_sets',
      description: 'List Import Sets with optional filter by state or staging table',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: loaded, partial, transform_failed, complete' },
          query: { type: 'string', description: 'Additional encoded query string' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_import_set',
      description: 'Get details of a specific Import Set including row count and transform status',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Import Set sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_import_set_row',
      description: 'Insert a row into an Import Set staging table for later transformation (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          staging_table: {
            type: 'string',
            description: 'Staging table name (e.g. "u_import_incident"). Must already exist.',
          },
          data: { type: 'object', description: 'Key-value pairs for the staging table row' },
        },
        required: ['staging_table', 'data'],
      },
    },
    {
      name: 'list_data_sources',
      description: 'List Import Set data source definitions (file/JDBC/REST loaders)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name' },
          type: { type: 'string', description: 'Filter by type: file, jdbc, ldap, rest' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── Event Registry & Management ─────────────────────────────────────────
    {
      name: 'list_event_registry',
      description: 'List registered event definitions in the ServiceNow event registry',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search events by name or description' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_event_registry_entry',
      description: 'Get details of a specific registered event definition',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Event name (e.g. "incident.created") or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'register_event',
      description: 'Register a new custom event in the event registry (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique event name (e.g. "my_app.record_created")' },
          description: { type: 'string', description: 'Description of when this event fires' },
          table: { type: 'string', description: 'Table that fires this event (e.g. "incident")' },
        },
        required: ['name', 'table'],
      },
    },
    {
      name: 'fire_event',
      description: 'Fire a custom ServiceNow event for a specific record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          event_name: { type: 'string', description: 'Event name to fire (must be registered)' },
          table: { type: 'string', description: 'Table name of the target record' },
          record_sys_id: { type: 'string', description: 'sys_id of the record to fire the event on' },
          parm1: { type: 'string', description: 'Optional first parameter passed to event handlers' },
          parm2: { type: 'string', description: 'Optional second parameter passed to event handlers' },
        },
        required: ['event_name', 'table', 'record_sys_id'],
      },
    },
    {
      name: 'list_event_log',
      description: 'List recent event log entries (fired events and their processing status)',
      inputSchema: {
        type: 'object',
        properties: {
          event_name: { type: 'string', description: 'Filter by event name' },
          state: {
            type: 'string',
            description: 'Filter by state: ready, processing, processed, error, transferred',
          },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    // ── OAuth & Credentials ─────────────────────────────────────────────────
    {
      name: 'list_oauth_applications',
      description: 'List OAuth application registry entries (client applications that can authenticate)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or client ID' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_credential_aliases',
      description: 'List connection and credential aliases used by integrations',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name' },
          type: { type: 'string', description: 'Filter by type: basic, oauth2, api_key, certificate' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── Outbound SOAP Messages ───────────────────────────────────────────────
    {
      name: 'list_soap_messages',
      description: 'List outbound SOAP Message configurations (sys_web_service)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or endpoint' },
          active: { type: 'boolean', description: 'Filter by active status' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_soap_message',
      description: 'Get full configuration of a SOAP Message including its functions/operations',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'SOAP Message sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'list_soap_message_functions',
      description: 'List SOAP Message Functions (operations) for a given SOAP Message',
      inputSchema: {
        type: 'object',
        properties: {
          soap_message_sys_id: { type: 'string', description: 'Parent SOAP Message sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['soap_message_sys_id'],
      },
    },
    {
      name: 'create_soap_message',
      description: 'Create a new outbound SOAP Message definition (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique SOAP Message name' },
          endpoint: { type: 'string', description: 'SOAP service endpoint URL' },
          wsdl: { type: 'string', description: 'WSDL URL for the service (used for schema introspection)' },
          namespace: { type: 'string', description: 'XML namespace for SOAP body elements' },
          soap_action_prefix: { type: 'string', description: 'Prefix prepended to all SOAP action headers' },
          authentication_type: {
            type: 'string',
            description: 'Auth type: "no_authentication" (default), "basic", "mutual_authentication"',
          },
          description: { type: 'string', description: 'Purpose/description of this integration' },
          active: { type: 'boolean', description: 'Make active immediately (default: true)' },
        },
        required: ['name', 'endpoint'],
      },
    },
    {
      name: 'create_soap_message_function',
      description: 'Add a SOAP function (operation) to an existing SOAP Message (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          soap_message_sys_id: { type: 'string', description: 'Parent SOAP Message sys_id' },
          name: { type: 'string', description: 'Function name (used in scripts to call this operation)' },
          function_name: { type: 'string', description: 'WSDL operation name (matches the SOAP operation)' },
          soap_action: { type: 'string', description: 'Full SOAP Action header value' },
          soap_message_template: { type: 'string', description: 'SOAP XML request body template with ${variable} placeholders' },
          active: { type: 'boolean', description: 'Make active immediately (default: true)' },
        },
        required: ['soap_message_sys_id', 'name', 'function_name'],
      },
    },
  ];
}

export async function executeIntegrationToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // ── Outbound REST Messages ───────────────────────────────────────────────
    case 'list_rest_messages': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_rest_message',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,endpoint,description,authentication_type,sys_updated_on',
      });
    }
    case 'get_rest_message': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_rest_message', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'sys_rest_message',
        query: `name=${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`REST Message not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_rest_message_functions': {
      if (!args.rest_message_sys_id) throw new ServiceNowError('rest_message_sys_id is required', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sys_rest_message_fn',
        query: `rest_message=${args.rest_message_sys_id}`,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,http_method,relative_path,rest_message,sys_updated_on',
      });
    }
    case 'create_rest_message': {
      requireWrite();
      if (!args.name || !args.endpoint) throw new ServiceNowError('name and endpoint are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        endpoint: args.endpoint,
        description: args.description || '',
        authentication_type: args.authentication_type || 'no_authentication',
      };
      if (args.use_mutual_auth !== undefined) data.use_mutual_auth = args.use_mutual_auth;
      const result = await client.createRecord('sys_rest_message', data);
      return { ...result, summary: `Created REST Message "${args.name}"` };
    }
    // ── Transform Maps ──────────────────────────────────────────────────────
    case 'list_transform_maps': {
      const parts: string[] = [];
      if (args.target_table) parts.push(`target_table=${args.target_table}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORtarget_tableCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_transform_map',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,target_table,source_table,active,sys_updated_on',
      });
    }
    case 'get_transform_map': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_transform_map', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'sys_transform_map',
        query: `name=${args.sys_id_or_name}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Transform Map not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'run_transform_map': {
      requireWrite();
      if (!args.transform_map_sys_id || !args.import_set_sys_id) {
        throw new ServiceNowError('transform_map_sys_id and import_set_sys_id are required', 'INVALID_REQUEST');
      }
      // Trigger transform via Scripted REST — create a sys_import_set_run record
      const data = {
        import_set: args.import_set_sys_id,
        transform_map: args.transform_map_sys_id,
      };
      const result = await client.createRecord('sys_import_set_run', data);
      return {
        ...result,
        summary: `Triggered Transform Map ${args.transform_map_sys_id} on Import Set ${args.import_set_sys_id}`,
      };
    }
    case 'list_transform_field_maps': {
      if (!args.transform_map_sys_id) throw new ServiceNowError('transform_map_sys_id is required', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sys_transform_entry',
        query: `map=${args.transform_map_sys_id}`,
        limit: args.limit ?? 50,
        fields: 'sys_id,map,source_field,target_field,coalesce,use_source_script,sys_updated_on',
      });
    }
    // ── Import Sets ─────────────────────────────────────────────────────────
    case 'list_import_sets': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${args.state}`);
      if (args.query) parts.push(args.query);
      return await client.queryRecords({
        table: 'sys_import_set',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,label,state,table_name,import_count,error_count,sys_created_on',
      });
    }
    case 'get_import_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_import_set', args.sys_id);
    }
    case 'create_import_set_row': {
      requireWrite();
      if (!args.staging_table || !args.data) {
        throw new ServiceNowError('staging_table and data are required', 'INVALID_REQUEST');
      }
      const result = await client.createRecord(args.staging_table, args.data);
      return { ...result, summary: `Inserted row into staging table "${args.staging_table}"` };
    }
    case 'list_data_sources': {
      const parts: string[] = [];
      if (args.type) parts.push(`type=${args.type}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_data_source',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,type,format,import_set_table_name,sys_updated_on',
      });
    }
    // ── Event Registry ──────────────────────────────────────────────────────
    case 'list_event_registry': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORdescriptionCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sysevent_register',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 50,
        fields: 'sys_id,name,table,description,sys_updated_on',
      });
    }
    case 'get_event_registry_entry': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('sysevent_register', args.name_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sysevent_register',
        query: `name=${args.name_or_sysid}`,
        limit: 1,
      });
      if (resp.count === 0) {
        throw new ServiceNowError(`Event registry entry not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      }
      return resp.records[0];
    }
    case 'register_event': {
      requireScripting();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      const data = {
        name: args.name,
        table: args.table,
        description: args.description || '',
      };
      const result = await client.createRecord('sysevent_register', data);
      return { ...result, summary: `Registered event "${args.name}" for table "${args.table}"` };
    }
    case 'fire_event': {
      requireWrite();
      if (!args.event_name || !args.table || !args.record_sys_id) {
        throw new ServiceNowError('event_name, table, and record_sys_id are required', 'INVALID_REQUEST');
      }
      // Fire via sys_event table insert
      const data: Record<string, any> = {
        name: args.event_name,
        table: args.table,
        instance: args.record_sys_id,
      };
      if (args.parm1) data.parm1 = args.parm1;
      if (args.parm2) data.parm2 = args.parm2;
      const result = await client.createRecord('sysevent', data);
      return {
        ...result,
        summary: `Fired event "${args.event_name}" on ${args.table}:${args.record_sys_id}`,
      };
    }
    case 'list_event_log': {
      const parts: string[] = [];
      if (args.event_name) parts.push(`nameCONTAINS${args.event_name}`);
      if (args.state) parts.push(`state=${args.state}`);
      return await client.queryRecords({
        table: 'sysevent',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 50,
        orderBy: '-sys_created_on',
        fields: 'sys_id,name,table,instance,state,parm1,parm2,sys_created_on',
      });
    }
    // ── Outbound SOAP Messages ───────────────────────────────────────────────
    case 'list_soap_messages': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      if (args.query) {
        // Strip encoded-query control characters from free-text search value
        const safe = args.query.replace(/[\^]/g, '').replace(/\0/g, '');
        parts.push(`nameCONTAINS${safe}^ORendpointCONTAINS${safe}`);
      }
      return await client.queryRecords({
        table: 'sys_web_service',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,endpoint,wsdl,namespace,authentication_type,active,description,sys_updated_on',
      });
    }
    case 'get_soap_message': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      let msg: any;
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        msg = await client.getRecord('sys_web_service', args.sys_id_or_name);
      } else {
        // Sanitize name: strip encoded-query control chars before using in CONTAINS clause
        const safeName = args.sys_id_or_name.replace(/[\^=]/g, '').replace(/\0/g, '');
        if (!safeName) throw new ServiceNowError('sys_id_or_name must not be empty after sanitization', 'INVALID_REQUEST');
        const resp = await client.queryRecords({
          table: 'sys_web_service',
          query: `nameCONTAINS${safeName}`,
          limit: 1,
        });
        if (resp.count === 0) throw new ServiceNowError(`SOAP Message not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
        msg = resp.records[0];
      }
      const msgId = (msg as any).sys_id?.value ?? (msg as any).sys_id;
      if (!/^[0-9a-f]{32}$/i.test(String(msgId))) throw new ServiceNowError('Unexpected sys_id format in response', 'API_ERROR');
      const fns = await client.queryRecords({
        table: 'sys_web_service_function',
        query: `web_service=${msgId}`,
        limit: 50,
        fields: 'sys_id,name,function_name,soap_action,active',
      });
      return { soap_message: msg, functions: fns.records, function_count: fns.count };
    }
    case 'list_soap_message_functions': {
      if (!args.soap_message_sys_id) throw new ServiceNowError('soap_message_sys_id is required', 'INVALID_REQUEST');
      if (!/^[0-9a-f]{32}$/i.test(args.soap_message_sys_id))
        throw new ServiceNowError('soap_message_sys_id must be a 32-char hex sys_id', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sys_web_service_function',
        query: `web_service=${args.soap_message_sys_id}`,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,function_name,soap_action,active,sys_updated_on',
      });
    }
    case 'create_soap_message': {
      requireWrite();
      if (!args.name || !args.endpoint) throw new ServiceNowError('name and endpoint are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        endpoint: args.endpoint,
        authentication_type: args.authentication_type || 'no_authentication',
        active: args.active !== false,
      };
      if (args.wsdl) data.wsdl = args.wsdl;
      if (args.namespace) data.namespace = args.namespace;
      if (args.soap_action_prefix) data.soap_action_prefix = args.soap_action_prefix;
      if (args.description) data.description = args.description;
      const result = await client.createRecord('sys_web_service', data);
      return { ...result, summary: `Created SOAP Message "${args.name}" at ${args.endpoint}` };
    }
    case 'create_soap_message_function': {
      requireWrite();
      if (!args.soap_message_sys_id || !args.name || !args.function_name)
        throw new ServiceNowError('soap_message_sys_id, name, and function_name are required', 'INVALID_REQUEST');
      if (!/^[0-9a-f]{32}$/i.test(args.soap_message_sys_id))
        throw new ServiceNowError('soap_message_sys_id must be a 32-char hex sys_id', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        web_service: args.soap_message_sys_id,
        name: args.name,
        function_name: args.function_name,
        active: args.active !== false,
      };
      if (args.soap_action) data.soap_action = args.soap_action;
      if (args.soap_message_template) data.soap_message = args.soap_message_template;
      const result = await client.createRecord('sys_web_service_function', data);
      return { ...result, summary: `Created SOAP function "${args.name}" on message ${args.soap_message_sys_id}` };
    }
    // ── OAuth ────────────────────────────────────────────────────────────────
    case 'list_oauth_applications': {
      const parts: string[] = [];
      if (args.query) parts.push(`nameCONTAINS${args.query}^ORclient_idCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'oauth_entity',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,client_id,type,active,sys_updated_on',
      });
    }
    case 'list_credential_aliases': {
      const parts: string[] = [];
      if (args.type) parts.push(`type=${args.type}`);
      if (args.query) parts.push(`nameCONTAINS${args.query}`);
      return await client.queryRecords({
        table: 'sys_alias',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,type,description,sys_updated_on',
      });
    }
    default:
      return null;
  }
}
