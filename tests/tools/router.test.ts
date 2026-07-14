import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTools, executeTool } from '../../src/tools/index.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';
import type { InstanceContext } from '../../src/servicenow/instances.js';

describe('getTools – package system', () => {
  beforeEach(() => {
    delete process.env.MCP_TOOL_PACKAGE;
  });

  it('returns all 80+ tools when MCP_TOOL_PACKAGE is not set (full default)', () => {
    const tools = getTools();
    expect(tools.length).toBeGreaterThanOrEqual(80);
  });

  it('returns a subset for service_desk package', () => {
    process.env.MCP_TOOL_PACKAGE = 'service_desk';
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('create_incident');
    expect(names).toContain('get_incident');
    expect(names).toContain('approve_request');
    expect(names).not.toContain('create_business_rule');
    expect(names).not.toContain('commit_changeset');
  });

  it('platform_developer package includes scripting and ATF tools', () => {
    process.env.MCP_TOOL_PACKAGE = 'platform_developer';
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('list_business_rules');
    expect(names).toContain('run_atf_suite');
    expect(names).toContain('get_atf_failure_insight');
    expect(names).not.toContain('create_incident');
  });

  it('ai_developer package includes Now Assist tools', () => {
    process.env.MCP_TOOL_PACKAGE = 'ai_developer';
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('nlq_query');
    expect(names).toContain('generate_summary');
    expect(names).toContain('trigger_agentic_playbook');
    expect(names).toContain('get_ms_copilot_topics');
  });

  it('secops_analyst package includes security + USEM tools', () => {
    process.env.MCP_TOOL_PACKAGE = 'secops_analyst';
    const tools = getTools();
    const names = tools.map(t => t.name);
    expect(names).toContain('list_vulnerable_items');
    expect(names).toContain('get_usem_dashboard');
    expect(names).toContain('create_remediation_task');
    expect(names).toContain('list_vulnerability_groups');
    expect(names).toContain('list_usem_rules');
    expect(names).toContain('get_risk_calculator_details');
    expect(names).toContain('list_integration_runs');
    expect(names).toContain('list_integration_parameters');
    expect(names).toContain('set_integration_active');
    expect(names).toContain('list_remediation_sla');
    expect(names).toContain('set_remediation_commitment');
    expect(names).toContain('list_vr_notifications');
    expect(names).toContain('list_vr_approvals');
    expect(names).toContain('list_vr_exception_requests');
    expect(names).toContain('act_on_vr_approval');
    expect(names).toContain('get_integration_health');
    expect(names).toContain('list_security_incidents');
    // a non-secops tool should be excluded
    expect(names).not.toContain('create_incident');
  });

  it('returns full set for unknown package name', () => {
    process.env.MCP_TOOL_PACKAGE = 'nonexistent_package';
    const tools = getTools();
    expect(tools.length).toBeGreaterThanOrEqual(80);
  });

  it('no duplicate tool names in full package', () => {
    const tools = getTools();
    const names = tools.map(t => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every tool has required MCP fields', () => {
    getTools().forEach(tool => {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    });
  });
});

describe('executeTool – name→executor dispatch', () => {
  // executeTool only resolves the executor and (for read tools) calls the client.
  // A stub client lets us assert routing without hitting the network.
  const stubClient = {} as ServiceNowClient;

  it('throws UNKNOWN_TOOL for an unregistered tool name', async () => {
    await expect(executeTool(stubClient, 'definitely_not_a_real_tool', {}))
      .rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
  });

  it('every registered tool name resolves to an executor (no orphan definitions)', async () => {
    // A tool whose name is in ALL_TOOLS but missing from the executor map would
    // throw UNKNOWN_TOOL before any handler runs. Every real tool must instead
    // reach its module and fail later (auth/validation/network), never UNKNOWN_TOOL.
    delete process.env.MCP_TOOL_PACKAGE;
    for (const tool of getTools()) {
      let routedToModule = true;
      try {
        await executeTool(stubClient, tool.name, {});
      } catch (err) {
        if ((err as { code?: string }).code === 'UNKNOWN_TOOL') {
          routedToModule = false;
        }
      }
      expect(routedToModule, `tool "${tool.name}" is not wired to an executor`).toBe(true);
    }
  });
});

describe('executeTool – instance selection (switch_instance/list_instances/get_current_instance)', () => {
  // These three tools bypass domain-module dispatch entirely and are handled
  // directly in executeTool against the per-connection InstanceContext.
  const stubClient = {} as ServiceNowClient;

  const makeInstanceContext = () => ({
    switch: vi.fn(),
    getCurrentName: vi.fn().mockReturnValue('default'),
    getCurrentUrl: vi.fn().mockReturnValue('https://default.service-now.com'),
    listNames: vi.fn().mockReturnValue(['default', 'prod']),
    listAll: vi.fn().mockReturnValue([
      { name: 'default', url: 'https://default.service-now.com', active: true, group: 'Default', environment: '' },
      { name: 'prod', url: 'https://prod.service-now.com', active: false, group: 'Default', environment: 'production' },
    ]),
  }) as unknown as InstanceContext;

  it('throws when no instanceContext is supplied', async () => {
    await expect(executeTool(stubClient, 'list_instances', {}))
      .rejects.toThrow('Instance selection requires an MCP session context.');
  });

  it('list_instances returns the current instance and full list', async () => {
    const ctx = makeInstanceContext();
    const result = await executeTool(stubClient, 'list_instances', {}, ctx);
    expect(result.current).toBe('default');
    expect(result.total).toBe(2);
    expect(result.instances).toHaveLength(2);
  });

  it('get_current_instance returns the active instance name, url, and known names', async () => {
    const ctx = makeInstanceContext();
    const result = await executeTool(stubClient, 'get_current_instance', {}, ctx);
    expect(result.name).toBe('default');
    expect(result.url).toBe('https://default.service-now.com');
    expect(result.all_instances).toEqual(['default', 'prod']);
  });

  it('switch_instance requires name', async () => {
    const ctx = makeInstanceContext();
    await expect(executeTool(stubClient, 'switch_instance', {}, ctx)).rejects.toThrow('name is required');
    expect((ctx as any).switch).not.toHaveBeenCalled();
  });

  it('switch_instance switches and reports the new active instance', async () => {
    const ctx = makeInstanceContext();
    (ctx as any).getCurrentName.mockReturnValue('prod');
    (ctx as any).getCurrentUrl.mockReturnValue('https://prod.service-now.com');
    const result = await executeTool(stubClient, 'switch_instance', { name: 'prod' }, ctx);
    expect((ctx as any).switch).toHaveBeenCalledWith('prod');
    expect(result).toEqual({ action: 'switched', active_instance: 'prod', url: 'https://prod.service-now.com' });
  });
});
