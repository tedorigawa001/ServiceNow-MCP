import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePerformanceToolCall, getPerformanceToolDefinitions } from '../../src/tools/performance.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  getXmlStats: vi.fn(),
} as unknown as ServiceNowClient;

const SAMPLE_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<xmlstats created="Sat Jul 04 19:45:03 PDT 2026" includes="memory,semaphores" version="2">' +
  '<system.memory.max>1820.0</system.memory.max>' +
  '<system.memory.total>856.0</system.memory.total>' +
  '<system.memory.in.use>697.0</system.memory.in.use>' +
  '<system.memory.pct.free>19.0</system.memory.pct.free>' +
  '<semaphores available="15" borrowed="0" loaned="0" max_queue_depth="5" maximum_concurrency="16" name="Default" queue_age="0" queue_depth="0" queue_depth_limit="150" rejected_executions="0">' +
  '<semaphore age="25" processor="Default-thread-35" started="Sat Jul 04 19:45:03 PDT 2026">ABC #1 /xmlstats.do</semaphore>' +
  '</semaphores>' +
  '<semaphores available="4" borrowed="0" loaned="0" max_queue_depth="2" maximum_concurrency="4" name="API_INT" queue_age="0" queue_depth="0" queue_depth_limit="50" rejected_executions="3"/>' +
  '</xmlstats>';

describe('get_instance_diagnostics tool definition', () => {
  it('is registered in the performance tool definitions', () => {
    const names = getPerformanceToolDefinitions().map((d) => d.name);
    expect(names).toContain('get_instance_diagnostics');
  });
});

describe('executePerformanceToolCall – get_instance_diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockClient.getXmlStats as ReturnType<typeof vi.fn>).mockResolvedValue(SAMPLE_XML);
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ system_id: 'app1:node1', status: 'online', participation: 'primary' }],
    });
  });

  it('defaults include to memory + semaphores', async () => {
    await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(mockClient.getXmlStats).toHaveBeenCalledWith(['memory', 'semaphores']);
  });

  it('parses memory scalars from the xmlstats payload', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.memory_mb['system.memory.max']).toBe(1820);
    expect(result.memory_mb['system.memory.pct.free']).toBe(19);
  });

  it('parses semaphore pools including self-closing elements', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.semaphores).toHaveLength(2);
    const def = result.semaphores.find((s: any) => s.name === 'Default');
    expect(def.max_concurrency).toBe(16);
    expect(def.in_use).toBe(1);
    const api = result.semaphores.find((s: any) => s.name === 'API_INT');
    expect(api.in_use).toBe(0);
    expect(api.rejected_executions).toBe(3);
  });

  it('includes cluster node status from sys_cluster_state', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.cluster_nodes).toHaveLength(1);
    expect(result.cluster_nodes[0].status).toBe('online');
  });

  it('still returns diagnostics when sys_cluster_state is ACL-restricted', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('403'));
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', {});
    expect(result.semaphores).toHaveLength(2);
    expect(result.cluster_nodes).toEqual([]);
  });

  it('returns raw XML when raw_xml=true', async () => {
    const result = await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', { raw_xml: true });
    expect(result.raw_xml).toBe(SAMPLE_XML);
    expect(result.memory_mb).toBeUndefined();
  });

  it('passes custom include sections through to the client', async () => {
    await executePerformanceToolCall(mockClient, 'get_instance_diagnostics', { include: ['transactions'] });
    expect(mockClient.getXmlStats).toHaveBeenCalledWith(['transactions']);
  });
});
