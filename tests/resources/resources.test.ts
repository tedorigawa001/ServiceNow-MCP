import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getResources, readResource } from '../../src/resources/index.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const queryRecords = vi.fn();
const mockClient = { queryRecords } as unknown as ServiceNowClient;

beforeEach(() => {
  queryRecords.mockReset().mockResolvedValue({ count: 0, records: [] });
});

describe('getResources', () => {
  it('exposes the six built-in resources with required MCP fields', () => {
    const res = getResources();
    expect(res).toHaveLength(6);
    for (const r of res) {
      expect(r.uri.startsWith('servicenow://')).toBe(true);
      expect(r.name).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.mimeType).toBe('application/json');
    }
    expect(res.map(r => r.name)).toEqual(
      expect.arrayContaining(['my-incidents', 'open-changes', 'sla-breaches', 'instance:info'])
    );
  });
});

describe('readResource — static URIs', () => {
  it('my-incidents queries active incidents', async () => {
    await readResource(mockClient, 'servicenow://my-incidents');
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'incident', query: 'active=true' }));
  });

  it('open-changes queries change_request', async () => {
    await readResource(mockClient, 'servicenow://open-changes');
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'change_request' }));
  });

  it('sla-breaches queries task_sla for breaches', async () => {
    await readResource(mockClient, 'servicenow://sla-breaches');
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'task_sla', query: expect.stringContaining('has_breached=true') }));
  });

  it('instance:info wraps sys_properties under instance_properties', async () => {
    queryRecords.mockResolvedValue({ count: 1, records: [{ name: 'glide.version', value: '1.0' }] });
    const res = await readResource(mockClient, 'servicenow://instance:info') as any;
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_properties' }));
    expect(res.instance_properties).toBeTruthy();
  });
});

describe('readResource — parameterized URIs', () => {
  it('ci:<name> queries cmdb_ci and URL-decodes the name', async () => {
    await readResource(mockClient, 'servicenow://ci:web%20prod%2001');
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'cmdb_ci',
      query: 'nameLIKEweb prod 01',
    }));
  });

  it('kb:<title> queries kb_knowledge', async () => {
    await readResource(mockClient, 'servicenow://kb:VPN-setup');
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'kb_knowledge',
      query: expect.stringContaining('short_descriptionLIKEVPN-setup'),
    }));
  });

  it('returns an error object for an unknown URI', async () => {
    const res = await readResource(mockClient, 'servicenow://totally-unknown') as any;
    expect(res.error).toContain('Unknown resource URI');
    expect(queryRecords).not.toHaveBeenCalled();
  });
});
