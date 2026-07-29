/**
 * E2E coverage for Excel-to-Import Set ingestion. This is a write test, so it
 * only runs against an explicitly configured disposable PDI with
 * WRITE_ENABLED=true. Every artifact is removed in finally.
 */
import ExcelJS from 'exceljs';
import { beforeAll, expect, it } from 'vitest';
import { writeE2eDescribe, getE2EClient } from './helpers.js';
import { executeIntegrationToolCall } from '../../src/tools/integration.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const MARK = `e2e-excel-import-${Date.now()}`;
const STAGING_TABLE = 'imp_notification';

function referenceSysId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'value' in value && typeof value.value === 'string') {
    return value.value;
  }
  return undefined;
}

async function makeWorkbookBase64(): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import rows');
  sheet.addRow(['uuid', 'message']);
  sheet.addRow([MARK, 'Created by the Excel Import Set E2E test']);
  const content = await workbook.xlsx.writeBuffer();
  return Buffer.from(content).toString('base64');
}

writeE2eDescribe('E2E – Excel Import Set ingestion (self-cleaning)', () => {
  let client: ServiceNowClient;

  beforeAll(() => {
    client = getE2EClient();
  });

  it('uploads a workbook, creates an Import Set, and binds its staging row', async () => {
    let importSetSysId: string | undefined;
    let stagingRowSysId: string | undefined;
    let attachmentSysId: string | undefined;

    try {
      const result = await executeIntegrationToolCall(client, 'import_excel_to_import_set', {
        file_name: `${MARK}.xlsx`,
        content_base64: await makeWorkbookBase64(),
        staging_table: STAGING_TABLE,
        sheet_name: 'Import rows',
        import_set_label: `E2E Excel Import Set ${MARK}`,
      });

      importSetSysId = result.import_set_sys_id;
      expect(importSetSysId).toMatch(/^[0-9a-f]{32}$/i);
      expect(result.rows_inserted).toBe(1);
      expect(result.attachment_uploaded).toBe(true);

      const importSet = await client.getRecord('sys_import_set', importSetSysId);
      expect(importSet.table_name).toBe(STAGING_TABLE);

      const stagingRows = await client.queryRecords({
        table: STAGING_TABLE,
        query: `sys_import_set=${importSetSysId}`,
        fields: 'sys_id,sys_import_set,uuid,message',
        limit: 10,
      });
      expect(stagingRows.count).toBe(1);
      stagingRowSysId = stagingRows.records[0]?.sys_id;
      expect(referenceSysId(stagingRows.records[0]?.sys_import_set)).toBe(importSetSysId);
      expect(stagingRows.records[0]?.uuid).toBe(MARK);

      const attachments = await client.queryRecords({
        table: 'sys_attachment',
        query: `table_name=sys_import_set^table_sys_id=${importSetSysId}`,
        fields: 'sys_id,file_name,table_name,table_sys_id',
        limit: 10,
      });
      expect(attachments.count).toBeGreaterThanOrEqual(1);
      const attachment = attachments.records.find(row => row.file_name === `${MARK}.xlsx`);
      expect(attachment).toBeDefined();
      attachmentSysId = attachment?.sys_id;
    } finally {
      // Delete children explicitly before the Import Set so the test does not
      // depend on instance-specific cascade-delete behavior.
      if (importSetSysId && !stagingRowSysId) {
        const remainingRows = await client.queryRecords({
          table: STAGING_TABLE,
          query: `sys_import_set=${importSetSysId}`,
          fields: 'sys_id',
          limit: 10,
        });
        stagingRowSysId = remainingRows.records[0]?.sys_id;
      }
      if (importSetSysId && !attachmentSysId) {
        const remainingAttachments = await client.queryRecords({
          table: 'sys_attachment',
          query: `table_name=sys_import_set^table_sys_id=${importSetSysId}`,
          fields: 'sys_id',
          limit: 10,
        });
        attachmentSysId = remainingAttachments.records[0]?.sys_id;
      }
      if (stagingRowSysId) await client.deleteRecord(STAGING_TABLE, stagingRowSysId);
      if (attachmentSysId) await client.deleteRecord('sys_attachment', attachmentSysId);
      if (importSetSysId) await client.deleteRecord('sys_import_set', importSetSysId);
    }
  });
});
