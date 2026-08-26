import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeUpdateSetToolCall, getUpdateSetToolDefinitions } from '../../src/tools/updateset.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
} as unknown as ServiceNowClient;

describe('getUpdateSetToolDefinitions', () => {
  it('returns update set tool definitions', () => {
    expect(getUpdateSetToolDefinitions().length).toBeGreaterThanOrEqual(7);
  });
});

describe('executeUpdateSetToolCall – get_current_update_set', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries in-progress update sets', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ name: 'Sprint 42' }] });
    const result = await executeUpdateSetToolCall(mockClient, 'get_current_update_set', {});
    expect(result.count).toBe(1);
    expect(result.active_update_sets[0].name).toBe('Sprint 42');
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_update_set',
      query: 'state=in progress',
    }));
  });
});

describe('executeUpdateSetToolCall – list_update_sets', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists all update sets with no filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3, records: [{}, {}, {}] });
    const result = await executeUpdateSetToolCall(mockClient, 'list_update_sets', {});
    expect(result.count).toBe(3);
    expect(result.update_sets).toHaveLength(3);
  });

  it('applies state filter', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{}] });
    await executeUpdateSetToolCall(mockClient, 'list_update_sets', { state: 'complete' });
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.query).toContain('state=complete');
  });
});

describe('executeUpdateSetToolCall – create_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('throws when name is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'create_update_set', {})
    ).rejects.toThrow('name is required');
  });

  it('creates and switches to update set by default', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us001' });
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us001' });
    const result = await executeUpdateSetToolCall(mockClient, 'create_update_set', { name: 'Sprint 43 Changes' });
    expect(result.action).toBe('created_and_switched');
    expect(result.name).toBe('Sprint 43 Changes');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_update_set', 'us001', { is_default: true });
  });

  it('creates without switching when switch_to=false', async () => {
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us002' });
    const result = await executeUpdateSetToolCall(mockClient, 'create_update_set', {
      name: 'Background Update Set',
      switch_to: false,
    });
    expect(result.action).toBe('created');
    expect(mockClient.updateRecord).not.toHaveBeenCalled();
  });

  it('blocks when SCRIPTING_ENABLED=false', async () => {
    process.env.SCRIPTING_ENABLED = 'false';
    await expect(
      executeUpdateSetToolCall(mockClient, 'create_update_set', { name: 'Test' })
    ).rejects.toThrow();
  });
});

describe('executeUpdateSetToolCall – switch_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('throws when sys_id is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'switch_update_set', {})
    ).rejects.toThrow('sys_id is required');
  });

  it('sets is_default on target update set', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us003' });
    const result = await executeUpdateSetToolCall(mockClient, 'switch_update_set', { sys_id: 'us003' });
    expect(result.action).toBe('switched');
    expect(result.sys_id).toBe('us003');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_update_set', 'us003', { is_default: true });
  });
});

describe('executeUpdateSetToolCall – complete_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('throws when sys_id is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'complete_update_set', {})
    ).rejects.toThrow('sys_id is required');
  });

  it('marks update set as complete', async () => {
    (mockClient.updateRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us004', state: 'complete' });
    const result = await executeUpdateSetToolCall(mockClient, 'complete_update_set', { sys_id: 'us004' });
    expect(result.action).toBe('completed');
    expect(result.sys_id).toBe('us004');
    expect(mockClient.updateRecord).toHaveBeenCalledWith('sys_update_set', 'us004', { state: 'complete' });
  });
});

describe('executeUpdateSetToolCall – preview_update_set', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when sys_id is missing', async () => {
    await expect(
      executeUpdateSetToolCall(mockClient, 'preview_update_set', {})
    ).rejects.toThrow('sys_id is required');
  });

  it('lists sys_update_xml records for the update set', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 5, records: [{}, {}, {}, {}, {}] });
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us005', name: 'Test Set' });
    const result = await executeUpdateSetToolCall(mockClient, 'preview_update_set', { sys_id: 'us005' });
    expect(result.change_count).toBe(5);
    const call = (mockClient.queryRecords as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.table).toBe('sys_update_xml');
    expect(call.query).toContain('us005');
  });
});

describe('executeUpdateSetToolCall – scan_update_set_sca', () => {
  const updateSetId = 'a'.repeat(32);
  const businessRuleXmlId = 'b'.repeat(32);

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('collects allowlisted script assets without returning their source', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockImplementation(async (table: string, sysId: string) => {
      if (table === 'sys_update_set') {
        return { sys_id: sysId, name: 'SCA candidate', state: 'in progress', application: 'global' };
      }
      return {
        sys_id: sysId,
        payload: '<record_update><sys_script><script><![CDATA[var component = "lodash@4.17.20";]]></script></sys_script></record_update>',
      };
    });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
      records: [
        { sys_id: businessRuleXmlId, name: 'Example BR', type: 'Business Rule', action: 'INSERT_OR_UPDATE', sys_updated_on: '2026-08-26' },
        { sys_id: 'c'.repeat(32), name: 'Dictionary field', type: 'Dictionary', action: 'INSERT_OR_UPDATE' },
      ],
    });

    const result = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', {
      update_set: updateSetId,
      max_records: 2,
    });

    expect(result.scan_status).toBe('collection_complete');
    expect(result.scope).toMatchObject({ metadata_records: 2, collected_assets: 1, truncated: false });
    expect(result.scope.skipped.non_sca_asset_type).toBe(1);
    expect(result.components).toEqual([]);
    expect(result.assets[0]).toMatchObject({
      update_xml_sys_id: businessRuleXmlId,
      asset_type: 'business_rule',
      extracted_text: { fields: ['script'] },
    });
    expect(result.assets[0].payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('lodash@4.17.20');
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_update_xml',
      query: `update_set=${updateSetId}`,
      fields: 'sys_id,name,type,action,sys_updated_on',
    }));
  });

  it('resolves an exact Update Set name and rejects encoded-query separators', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: updateSetId, name: 'Release 1.11', state: 'complete' }],
    });
    const result = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', { update_set: 'Release 1.11' });
    expect(result.update_set.sys_id).toBe(updateSetId);
    expect(mockClient.queryRecords).toHaveBeenNthCalledWith(1, expect.objectContaining({
      table: 'sys_update_set', query: 'name=Release 1.11', limit: 3,
    }));

    vi.clearAllMocks();
    await expect(executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', {
      update_set: 'Release^ORstate=complete',
    })).rejects.toThrow('encoded-query operators');
    expect(mockClient.queryRecords).not.toHaveBeenCalled();
  });

  it('reports oversized payloads without returning their contents', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockImplementation(async (table: string, sysId: string) => {
      if (table === 'sys_update_set') return { sys_id: sysId, name: 'Large candidate' };
      return { sys_id: sysId, payload: 'x'.repeat(512 * 1024 + 1) };
    });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: businessRuleXmlId, name: 'Large BR', type: 'Business Rule', action: 'INSERT_OR_UPDATE' }],
    });

    const result = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', { update_set: updateSetId, lookup_vulnerabilities: false });
    expect(result.assets).toEqual([]);
    expect(result.scope.skipped.payload_too_large).toBe(1);
  });

  it('fetches one extra metadata row and reports a bounded scan as truncated', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: updateSetId, name: 'Bounded scan' });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
      records: [
        { sys_id: 'd'.repeat(32), name: 'Dictionary one', type: 'Dictionary', action: 'INSERT_OR_UPDATE' },
        { sys_id: 'e'.repeat(32), name: 'Dictionary two', type: 'Dictionary', action: 'INSERT_OR_UPDATE' },
      ],
    });

    const result = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', {
      update_set: updateSetId,
      max_records: 1,
    });
    expect(result.scope).toMatchObject({ metadata_records: 1, truncated: true });
    expect(mockClient.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ limit: 2, offset: 0 }));
  });

  it('detects exact versions from manifests, versioned CDN URLs, and module specifiers without source evidence', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockImplementation(async (table: string, sysId: string) => {
      if (table === 'sys_update_set') return { sys_id: sysId, name: 'Component candidate' };
      return {
        sys_id: sysId,
        payload: '<record_update><sys_script><script><![CDATA[{"lockfileVersion":3,"packages":{"node_modules/lodash":{"version":"4.17.21"}}}]]></script><condition><![CDATA[const x = require("axios@1.7.9"); const y = "https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js";]]></condition></sys_script></record_update>',
      };
    });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: businessRuleXmlId, name: 'Component BR', type: 'Business Rule', action: 'INSERT_OR_UPDATE' }],
    });

    const result = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', {
      update_set: updateSetId,
      lookup_vulnerabilities: false,
    });
    expect(result.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'lodash', version: '4.17.21', ecosystem: 'npm', confidence: 'high' }),
      expect.objectContaining({ name: 'axios', version: '1.7.9', ecosystem: 'npm', confidence: 'medium' }),
      expect.objectContaining({ name: 'dayjs', version: '1.11.13', ecosystem: 'npm', confidence: 'high' }),
    ]));
    expect(result.scope).toMatchObject({ detected_component_evidence: 3, normalized_components: 3 });
    expect(result.components.find((component: { name: string }) => component.name === 'lodash')?.evidence).toEqual([
      expect.objectContaining({ extractor: 'package_lockfile', match_sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]);
    expect(JSON.stringify(result)).not.toContain('cdn.jsdelivr.net');
    expect(JSON.stringify(result)).not.toContain('require(');
  });

  it('normalizes identical package versions and retains evidence from every asset', async () => {
    const secondXmlId = 'f'.repeat(32);
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockImplementation(async (table: string, sysId: string) => {
      if (table === 'sys_update_set') return { sys_id: sysId, name: 'Duplicate components' };
      return {
        sys_id: sysId,
        payload: '<record_update><sys_script><script><![CDATA[const url = "https://unpkg.com/lodash@4.17.21/lodash.js";]]></script></sys_script></record_update>',
      };
    });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2,
      records: [
        { sys_id: businessRuleXmlId, name: 'First reference', type: 'Business Rule', action: 'INSERT_OR_UPDATE' },
        { sys_id: secondXmlId, name: 'Second reference', type: 'Script Include', action: 'INSERT_OR_UPDATE' },
      ],
    });

    const result = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', {
      update_set: updateSetId,
      max_records: 2,
      lookup_vulnerabilities: false,
    });
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({
      name: 'lodash', version: '4.17.21', purl: 'pkg:npm/lodash@4.17.21',
      dependency_types: ['unknown'],
    });
    expect(result.components[0].evidence).toHaveLength(2);
    expect(result.scope).toMatchObject({ detected_component_evidence: 2, normalized_components: 1 });
  });

  it('queries OSV for exact versions, normalizes advisory fields, and caches successful lookups', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      vulns: [{
        id: 'GHSA-test-1234', aliases: ['CVE-2026-12345'], summary: 'Test advisory',
        database_specific: { severity: 'HIGH' },
        severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
        affected: [{ ranges: [{ type: 'ECOSYSTEM', events: [{ introduced: '0' }, { fixed: '1.2.4' }] }] }],
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockImplementation(async (table: string, sysId: string) => {
      if (table === 'sys_update_set') return { sys_id: sysId, name: 'OSV candidate' };
      return { sys_id: sysId, payload: '<record_update><sys_script><script><![CDATA[require("axios@1.2.3")]]></script></sys_script></record_update>' };
    });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: businessRuleXmlId, name: 'OSV BR', type: 'Business Rule', action: 'INSERT_OR_UPDATE' }],
    });

    const first = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', { update_set: updateSetId });
    const second = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', { update_set: updateSetId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api.osv.dev/v1/query', expect.objectContaining({ method: 'POST' }));
    expect(first.lookup).toMatchObject({ source: 'OSV', status: 'completed', queried_components: 1, cache_hits: 0 });
    expect(second.lookup).toMatchObject({ cache_hits: 1 });
    expect(first.findings).toEqual([expect.objectContaining({
      component: 'axios', installed_version: '1.2.3', advisory_id: 'GHSA-test-1234',
      aliases: ['CVE-2026-12345'], severity: 'high', fixed_versions: ['1.2.4'], source: 'OSV',
    })]);
    expect(JSON.stringify(first)).not.toContain('require(');
  });

  it('reports OSV failures as incomplete lookup rather than a clean result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockImplementation(async (table: string, sysId: string) => {
      if (table === 'sys_update_set') return { sys_id: sysId, name: 'OSV failure' };
      return { sys_id: sysId, payload: '<record_update><sys_script><script><![CDATA[require("ky@9.9.9")]]></script></sys_script></record_update>' };
    });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: businessRuleXmlId, name: 'Failure BR', type: 'Business Rule', action: 'INSERT_OR_UPDATE' }],
    });

    const result = await executeUpdateSetToolCall(mockClient, 'scan_update_set_sca', { update_set: updateSetId });
    expect(result.findings).toEqual([]);
    expect(result.lookup).toMatchObject({ status: 'partial_failure', errors: [{ purl: 'pkg:npm/ky@9.9.9', code: 'OSV_REQUEST_FAILED' }] });
  });
});

describe('executeUpdateSetToolCall – ensure_active_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  it('returns existing update set when one is active', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: 'us006', name: 'Existing Set' }],
    });
    const result = await executeUpdateSetToolCall(mockClient, 'ensure_active_update_set', {});
    expect(result.action).toBe('existing_found');
    expect(result.update_set.name).toBe('Existing Set');
    expect(mockClient.createRecord).not.toHaveBeenCalled();
  });

  it('creates a new set when none is active', async () => {
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0, records: [] });
    (mockClient.createRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us007' });
    const result = await executeUpdateSetToolCall(mockClient, 'ensure_active_update_set', {
      default_name: 'Auto AI Session',
    });
    expect(result.action).toBe('auto_created');
    expect(result.name).toBe('Auto AI Session');
    expect(mockClient.createRecord).toHaveBeenCalledWith('sys_update_set', expect.objectContaining({ name: 'Auto AI Session' }));
  });
});

describe('executeUpdateSetToolCall – export_update_set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
  });

  afterEach(() => {
    delete process.env.WRITE_ENABLED;
    delete process.env.SCRIPTING_ENABLED;
  });

  it('is blocked without SCRIPTING_ENABLED', async () => {
    delete process.env.SCRIPTING_ENABLED;
    await expect(executeUpdateSetToolCall(mockClient, 'export_update_set', { sys_id: 'us1' })).rejects.toThrow(
      'Scripting operations are disabled'
    );
  });

  it('requires sys_id', async () => {
    await expect(executeUpdateSetToolCall(mockClient, 'export_update_set', {})).rejects.toThrow('sys_id is required');
  });

  it('builds an unload XML from the update set header and its change payloads', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us1', name: 'My Update Set', state: 'complete' });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
      records: [{ sys_id: 'x1', name: 'Change 1', type: 'Table', action: 'INSERT_OR_UPDATE', payload: '<sys_script>...</sys_script>' }],
    });

    const result = await executeUpdateSetToolCall(mockClient, 'export_update_set', { sys_id: 'us1' });

    expect(mockClient.getRecord).toHaveBeenCalledWith('sys_update_set', 'us1');
    expect(result.update_set_name).toBe('My Update Set');
    expect(result.change_count).toBe(1);
    expect(result.xml).toContain('<unload');
    expect(result.xml).toContain('<sys_script>...</sys_script>');
  });

  it('throws RESULT_TOO_LARGE when the update set exceeds 2000 changes', async () => {
    (mockClient.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ sys_id: 'us1', name: 'Huge Set' });
    (mockClient.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 500,
      records: Array.from({ length: 500 }, (_, i) => ({ sys_id: `x${i}`, payload: '<x/>' })),
    });
    await expect(executeUpdateSetToolCall(mockClient, 'export_update_set', { sys_id: 'us1' }))
      .rejects.toMatchObject({ code: 'RESULT_TOO_LARGE' });
  });
});

describe('executeUpdateSetToolCall – unknown tool', () => {
  it('returns null for unrecognised tool', async () => {
    const result = await executeUpdateSetToolCall(mockClient, 'nonexistent_tool', {});
    expect(result).toBeNull();
  });
});
