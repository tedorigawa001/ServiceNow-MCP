/**
 * Read-only PDI E2E coverage for Update Set SCA.
 *
 * This deliberately scans an existing in-progress Update Set and performs no
 * writes. It verifies the scanner against preview_update_set metadata rather
 * than expecting a third-party component to exist in every PDI.
 */
import { beforeAll, expect, it } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeUpdateSetToolCall } from '../../src/tools/updateset.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

e2eDescribe('E2E – Update Set SCA (read-only)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  it('matches preview metadata for a bounded Update Set scan without returning source', async () => {
    const updateSets = await client.queryRecords({
      table: 'sys_update_set',
      query: 'state=in progress',
      limit: 1,
      fields: 'sys_id,name',
    });
    if (updateSets.records.length === 0) return;
    const updateSet = updateSets.records[0] as Record<string, unknown>;
    const sysId = String(updateSet.sys_id);

    const preview = await executeUpdateSetToolCall(client, 'preview_update_set', { sys_id: sysId, limit: 10 });
    const scan = await executeUpdateSetToolCall(client, 'scan_update_set_sca', {
      update_set: sysId,
      max_records: 10,
      lookup_vulnerabilities: false,
    });

    const previewTypes = (preview.changes as Array<Record<string, unknown>>).reduce<Record<string, number>>((counts, change) => {
      const type = String(change.type || '(unknown)');
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});

    expect(scan.schema_version).toBe('1.0');
    expect(scan.update_set.sys_id).toBe(sysId);
    expect(scan.scope.metadata_records).toBe(preview.changes.length);
    expect(scan.scope.by_update_xml_type).toEqual(previewTypes);
    expect(scan.summary.safety_note).toContain('No findings does not prove');
    expect(scan.lookup.status).toBe('disabled');
    expect(scan.errors).toEqual([]);
    expect(JSON.stringify(scan)).not.toContain('<script>');
  });
});
