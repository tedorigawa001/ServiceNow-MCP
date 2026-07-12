/**
 * Task Management tools.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite } from '../utils/permissions.js';

const TASK_UPDATE_FIELDS = new Set([
  'short_description',
  'description',
  'state',
  'priority',
  'assigned_to',
  'assignment_group',
  'work_notes',
  'comments',
  'close_notes',
  'due_date',
  'active',
]);

function allowedFieldsSchema(allowedFields: Set<string>, description: string): Record<string, any> {
  return {
    type: 'object',
    description,
    properties: Object.fromEntries([...allowedFields].map(field => [field, {}])),
    additionalProperties: false,
  };
}

function assertAllowedTaskFields(fields: Record<string, any>): void {
  const unsafeFields = Object.keys(fields).filter(field => !TASK_UPDATE_FIELDS.has(field));
  if (unsafeFields.length) {
    throw new ServiceNowError(
      `Task fields cannot be updated: ${unsafeFields.join(', ')}. Allowed fields: ${[...TASK_UPDATE_FIELDS].join(', ')}`,
      'VALIDATION_ERROR'
    );
  }
}

export function getTaskToolDefinitions() {
  return [
    {
      name: 'get_task',
      description: 'Get details of any task record by number or sys_id',
      inputSchema: {
        type: 'object',
        properties: {
          number_or_sysid: { type: 'string', description: 'Task number or sys_id' },
        },
        required: ['number_or_sysid'],
      },
    },
    {
      name: 'update_task',
      description: 'Update fields on a task record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the task' },
          fields: allowedFieldsSchema(
            TASK_UPDATE_FIELDS,
            'Allowed fields: short_description, description, state, priority, assigned_to, assignment_group, work_notes, comments, close_notes, due_date, active'
          ),
        },
        required: ['sys_id', 'fields'],
      },
    },
    {
      name: 'list_my_tasks',
      description: 'List tasks assigned to the currently configured user',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max tasks to return (default: 10)' },
        },
        required: [],
      },
    },
    {
      name: 'complete_task',
      description: 'Mark a task as complete (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'System ID of the task' },
          close_notes: { type: 'string', description: 'Optional closure notes' },
        },
        required: ['sys_id'],
      },
    },
  ];
}

export async function executeTaskToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'get_task': {
      if (!args.number_or_sysid) throw new ServiceNowError('number_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.number_or_sysid)) {
        return await client.getRecord('task', args.number_or_sysid);
      }
      const resp = await client.queryRecords({ table: 'task', query: `number=${args.number_or_sysid}^ORsys_id=${args.number_or_sysid}`, limit: 1 });
      if (resp.count === 0) throw new ServiceNowError(`Task not found: ${args.number_or_sysid}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'update_task': {
      requireWrite();
      if (!args.sys_id || !args.fields) throw new ServiceNowError('sys_id and fields are required', 'INVALID_REQUEST');
      assertAllowedTaskFields(args.fields);
      const result = await client.updateRecord('task', args.sys_id, args.fields);
      return { ...result, summary: `Updated task ${args.sys_id}` };
    }
    case 'list_my_tasks': {
      // Use the configured username from env vars
      const username = process.env.SERVICENOW_OAUTH_USERNAME || process.env.SERVICENOW_USERNAME || '';
      let query = 'active=true^state!=3';
      if (username) query += `^assigned_to.user_name=${username}`;
      const resp = await client.queryRecords({ table: 'task', query, limit: args.limit || 10, orderBy: '-sys_updated_on' });
      return { count: resp.count, tasks: resp.records };
    }
    case 'complete_task': {
      requireWrite();
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      const data: Record<string, any> = { state: '3' };
      if (args.close_notes) data.close_notes = args.close_notes;
      const result = await client.updateRecord('task', args.sys_id, data);
      return { ...result, summary: `Completed task ${args.sys_id}` };
    }
    default:
      return null;
  }
}
