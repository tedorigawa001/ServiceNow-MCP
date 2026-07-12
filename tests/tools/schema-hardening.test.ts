import { describe, expect, it } from 'vitest';
import { getAgileToolDefinitions } from '../../src/tools/agile.js';
import { getScriptToolDefinitions } from '../../src/tools/script.js';
import { getTaskToolDefinitions } from '../../src/tools/task.js';
import { getUsemConfigToolDefinitions } from '../../src/tools/usem-config.js';
import { getUserToolDefinitions } from '../../src/tools/user.js';

type ToolDefinition = {
  name: string;
  inputSchema: {
    properties?: Record<string, any>;
  };
};

function tool(defs: ToolDefinition[], name: string): ToolDefinition {
  const found = defs.find(def => def.name === name);
  if (!found) throw new Error(`Missing tool definition: ${name}`);
  return found;
}

function fieldNames(def: ToolDefinition): string[] {
  const fields = def.inputSchema.properties?.fields;
  return Object.keys(fields?.properties ?? {}).sort();
}

describe('write fields schemas', () => {
  it.each([
    {
      defs: getUserToolDefinitions(),
      name: 'update_user',
      allowed: ['department', 'email', 'first_name', 'last_name', 'title', 'user_name'],
    },
    {
      defs: getUserToolDefinitions(),
      name: 'update_group',
      allowed: ['description', 'manager', 'name'],
    },
    {
      defs: getAgileToolDefinitions(),
      name: 'update_story',
      allowed: ['assigned_to', 'description', 'epic', 'short_description', 'sprint', 'story_points'],
    },
    {
      defs: getAgileToolDefinitions(),
      name: 'update_epic',
      allowed: ['description', 'project', 'short_description'],
    },
    {
      defs: getAgileToolDefinitions(),
      name: 'update_scrum_task',
      allowed: ['assigned_to', 'short_description', 'story'],
    },
    {
      defs: getTaskToolDefinitions(),
      name: 'update_task',
      allowed: [
        'active',
        'assigned_to',
        'assignment_group',
        'close_notes',
        'comments',
        'description',
        'due_date',
        'priority',
        'short_description',
        'state',
        'work_notes',
      ],
    },
    {
      defs: getScriptToolDefinitions(),
      name: 'update_business_rule',
      allowed: ['active', 'collection', 'condition', 'name', 'order', 'script', 'when'],
    },
    {
      defs: getScriptToolDefinitions(),
      name: 'update_script_include',
      allowed: ['access', 'active', 'api_name', 'name', 'script'],
    },
    {
      defs: getScriptToolDefinitions(),
      name: 'update_client_script',
      allowed: ['active', 'field_name', 'global', 'name', 'script', 'table', 'type'],
    },
    {
      defs: getScriptToolDefinitions(),
      name: 'update_ui_action',
      allowed: ['action_name', 'action_type', 'active', 'condition', 'form_button', 'list_button', 'name', 'script', 'table'],
    },
  ])('$name rejects undeclared fields at schema level', ({ defs, name, allowed }) => {
    const fields = tool(defs, name).inputSchema.properties?.fields;
    expect(fields?.type).toBe('object');
    expect(fields?.additionalProperties).toBe(false);
    expect(fieldNames(tool(defs, name))).toEqual([...allowed].sort());
  });

  it.each(['create_usem_rule', 'update_usem_rule'])('%s uses a closed union schema for rule fields', name => {
    const fields = tool(getUsemConfigToolDefinitions(), name).inputSchema.properties?.fields;
    expect(fields?.type).toBe('object');
    expect(fields?.additionalProperties).toBe(false);
    expect(Object.keys(fields?.properties ?? {})).toEqual(
      expect.arrayContaining(['active', 'condition', 'name', 'rule_name', 'table'])
    );
    expect(Object.keys(fields?.properties ?? {})).not.toContain('sys_id');
    expect(Object.keys(fields?.properties ?? {})).not.toContain('sys_domain');
  });
});
