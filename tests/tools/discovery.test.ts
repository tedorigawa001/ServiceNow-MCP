import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDiscoveryToolDefinitions, executeDiscoveryToolCall } from '../../src/tools/discovery.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;

const SYS_ID = 'a'.repeat(32);

describe('getDiscoveryToolDefinitions', () => {
  it('returns all twelve Discovery/ACC read tools', () => {
    const defs = getDiscoveryToolDefinitions();
    expect(defs.map(d => d.name)).toEqual([
      'list_discovery_runs',
      'get_discovery_run',
      'list_discovered_devices',
      'list_discovery_logs',
      'list_discovery_ranges',
      'list_discovery_credentials',
      'list_mid_server_issues',
      'list_mid_extension_contexts',
      'get_mid_server_health',
      'list_acc_agents',
      'list_acc_policies',
      'list_acc_checks',
    ]);
    expect(defs.find(d => d.name === 'get_discovery_run')?.inputSchema.required).toContain('run_id');
    expect(defs.find(d => d.name === 'get_mid_server_health')?.inputSchema.required).toContain('mid_server');
  });
});

describe('executeDiscoveryToolCall', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null for an unrelated tool name', async () => {
    expect(await executeDiscoveryToolCall(mockClient, 'other', {})).toBeNull();
  });

  it('lists discovery runs newest-first with a state filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDiscoveryToolCall(mockClient, 'list_discovery_runs', { state: 'Completed' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'discovery_status',
      query: 'state=Completed^ORDERBYDESCsys_created_on',
    }));
  });

  it('fetches a discovery run by sys_id via getRecord', async () => {
    gr().mockResolvedValue({ sys_id: SYS_ID });
    const result = await executeDiscoveryToolCall(mockClient, 'get_discovery_run', { run_id: SYS_ID });
    expect(gr()).toHaveBeenCalledWith('discovery_status', SYS_ID);
    expect(result.sys_id).toBe(SYS_ID);
  });

  it('fetches a discovery run by DIS number via query', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'DIS0001001' }] });
    const result = await executeDiscoveryToolCall(mockClient, 'get_discovery_run', { run_id: 'DIS0001001' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'discovery_status',
      query: 'number=DIS0001001',
    }));
    expect(result.number).toBe('DIS0001001');
  });

  it('throws NOT_FOUND for a missing run number', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeDiscoveryToolCall(mockClient, 'get_discovery_run', { run_id: 'DIS9999999' })
    ).rejects.toThrow('not found');
  });

  it('filters discovered devices by run number and issue presence', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDiscoveryToolCall(mockClient, 'list_discovered_devices', {
      run_id: 'DIS0001001',
      with_issues_only: true,
    });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'discovery_device_history',
      query: 'status.number=DIS0001001^issues>0^ORDERBYDESCsys_created_on',
    }));
  });

  it('filters discovered devices by run sys_id directly', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDiscoveryToolCall(mockClient, 'list_discovered_devices', { run_id: SYS_ID });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: `status=${SYS_ID}^ORDERBYDESCsys_created_on`,
    }));
  });

  it('lists discovery logs scoped to a device history record', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDiscoveryToolCall(mockClient, 'list_discovery_logs', { device_history_id: SYS_ID });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'discovery_log',
      query: `device_history=${SYS_ID}^ORDERBYDESCcreated_on`,
    }));
  });

  it('never requests secret fields when listing credentials', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDiscoveryToolCall(mockClient, 'list_discovery_credentials', { type: 'SSH' });
    const callArgs = qr().mock.calls[0][0];
    expect(callArgs.table).toBe('discovery_credentials');
    expect(callArgs.query).toBe('type=SSH');
    for (const secret of ['password', 'ssh_private_key', 'authentication_key', 'privacy_key', 'ssh_passphrase']) {
      expect(callArgs.fields).not.toContain(secret);
    }
  });

  it('resolves a MID server name via dot-walk when listing issues', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDiscoveryToolCall(mockClient, 'list_mid_server_issues', { mid_server: 'mid01' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'ecc_agent_issue',
      query: 'mid_server.name=mid01^ORDERBYDESClast_detected',
    }));
  });

  it('lists MID extension contexts filtered by MID name, extension, and status', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'mid_websocket_mid01', status: 'Started' }] });
    const result = await executeDiscoveryToolCall(mockClient, 'list_mid_extension_contexts', {
      mid_server: 'mid01',
      extension: 'Websocket',
      status: 'Started',
    });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'ecc_agent_ext_context',
      query: 'mid_server.name=mid01^extension.nameLIKEWebsocket^status=Started^ORDERBYDESCsys_updated_on',
    }));
    expect(qr().mock.calls[0][0].fields).toContain('error_message');
    expect(result.count).toBe(1);
  });

  it('filters extension contexts by MID sys_id directly and strips ^ from inputs', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeDiscoveryToolCall(mockClient, 'list_mid_extension_contexts', {
      mid_server: SYS_ID,
      status: 'Started^ORinjected=1',
    });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      query: `mid_server=${SYS_ID}^status=StartedORinjected=1^ORDERBYDESCsys_updated_on`,
    }));
  });

  it('builds a MID health summary from agent + issues + queue backlog', async () => {
    qr().mockImplementation(async (params: any) => {
      if (params.table === 'ecc_agent') {
        return { count: 1, records: [{ sys_id: SYS_ID, name: 'mid01', status: 'Up' }] };
      }
      if (params.table === 'ecc_agent_issue') {
        return { count: 2, records: [{ message: 'x' }, { message: 'y' }] };
      }
      if (params.table === 'ecc_queue') {
        return { count: 5, records: [] };
      }
      return { count: 0, records: [] };
    });
    const result = await executeDiscoveryToolCall(mockClient, 'get_mid_server_health', { mid_server: 'mid01' });
    expect(result.mid_server.name).toBe('mid01');
    expect(result.open_issue_count).toBe(2);
    expect(result.output_queue_backlog_sample).toBe(5);
    // Backlog query targets this MID's output queue.
    const backlogCall = qr().mock.calls.find(c => c[0].table === 'ecc_queue');
    expect(backlogCall[0].query).toBe('agent=mid.server.mid01^queue=output^state=ready');
  });

  it('throws NOT_FOUND when the MID server does not exist', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeDiscoveryToolCall(mockClient, 'get_mid_server_health', { mid_server: 'ghost' })
    ).rejects.toThrow('not found');
  });

  it('lists ACC agents when the plugin is present', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'agent1' }] });
    const result = await executeDiscoveryToolCall(mockClient, 'list_acc_agents', { status: 'up' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sn_agent_cmdb_ci_agent',
      query: 'status=up',
    }));
    expect(result.count).toBe(1);
  });

  it('raises PLUGIN_NOT_INSTALLED when an ACC table is missing', async () => {
    qr().mockRejectedValue(new Error('Invalid table sn_agent_policy'));
    await expect(
      executeDiscoveryToolCall(mockClient, 'list_acc_policies', {})
    ).rejects.toThrow('Agent Client Collector');
  });

  it('re-throws non-table ACC errors unchanged', async () => {
    qr().mockRejectedValue(new Error('network timeout'));
    await expect(
      executeDiscoveryToolCall(mockClient, 'list_acc_checks', {})
    ).rejects.toThrow('network timeout');
  });
});
