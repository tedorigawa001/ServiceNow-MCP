import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { executeIntegrationToolCall, getIntegrationToolDefinitions, parseExcelImportRows } from '../../src/tools/integration.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  uploadAttachment: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const gr = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const cr = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const ua = () => mockClient.uploadAttachment as ReturnType<typeof vi.fn>;

async function xlsxBase64(rows: unknown[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('VI Import');
  rows.forEach(row => sheet.addRow(row));
  const content = await workbook.xlsx.writeBuffer();
  return Buffer.from(content).toString('base64');
}

/** Build a minimal ZIP central directory entry without a payload for preflight tests. */
function zipWithDeclaredEntrySizes(compressedBytes: number, uncompressedBytes: number): string {
  const name = Buffer.from('xl/worksheets/sheet1.xml');
  const centralDirectory = Buffer.alloc(46 + name.length);
  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt16LE(20, 4);
  centralDirectory.writeUInt16LE(20, 6);
  centralDirectory.writeUInt32LE(compressedBytes, 20);
  centralDirectory.writeUInt32LE(uncompressedBytes, 24);
  centralDirectory.writeUInt16LE(name.length, 28);
  name.copy(centralDirectory, 46);

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(0, 16);
  return Buffer.concat([centralDirectory, endOfCentralDirectory]).toString('base64');
}

describe('getIntegrationToolDefinitions', () => {
  it('returns exactly 25 integration tool definitions', () => {
    // Pinning the count catches accidental deletions/duplicate registrations
    // that `length > 0` would silently miss.
    expect(getIntegrationToolDefinitions().length).toBe(25);
  });

  it('all tools have name, description and inputSchema', () => {
    getIntegrationToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('executeIntegrationToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeIntegrationToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('REST Messages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_rest_messages queries sys_rest_message with a search filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_rest_messages', { query: 'jira' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_rest_message',
      query: 'nameCONTAINSjira^ORdescriptionCONTAINSjira',
    }));
  });

  it('get_rest_message requires sys_id_or_name', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'get_rest_message', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('get_rest_message fetches directly by sys_id when hex', async () => {
    gr().mockResolvedValue({ sys_id: 'a'.repeat(32), name: 'Jira' });
    const result = await executeIntegrationToolCall(mockClient, 'get_rest_message', { sys_id_or_name: 'a'.repeat(32) });
    expect(gr()).toHaveBeenCalledWith('sys_rest_message', 'a'.repeat(32));
    expect(result.name).toBe('Jira');
  });

  it('get_rest_message resolves by name and throws NOT_FOUND when missing', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeIntegrationToolCall(mockClient, 'get_rest_message', { sys_id_or_name: 'Jira' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('get_rest_message strips ^ from the name so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'rm1', name: 'Jira' }] });
    await executeIntegrationToolCall(mockClient, 'get_rest_message', { sys_id_or_name: 'Jira^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'name=JiraORactive=true' }));
  });

  it('list_rest_message_functions requires rest_message_sys_id', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'list_rest_message_functions', {})).rejects.toThrow('rest_message_sys_id is required');
  });

  it('list_rest_message_functions queries by parent sys_id', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_rest_message_functions', { rest_message_sys_id: 'rm1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_rest_message_fn', query: 'rest_message=rm1' }));
  });

  describe('create_rest_message', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeIntegrationToolCall(mockClient, 'create_rest_message', { name: 'X', endpoint: 'https://x' }))
        .rejects.toThrow('Write operations are disabled');
    });

    it('requires name and endpoint', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'create_rest_message', {})).rejects.toThrow('name and endpoint are required');
    });

    it('creates a REST message', async () => {
      cr().mockResolvedValue({ sys_id: 'rm1' });
      const result = await executeIntegrationToolCall(mockClient, 'create_rest_message', { name: 'Jira', endpoint: 'https://jira.example.com' });
      expect(cr()).toHaveBeenCalledWith('sys_rest_message', expect.objectContaining({ name: 'Jira', endpoint: 'https://jira.example.com' }));
      expect(result.summary).toContain('Jira');
    });
  });
});

describe('Transform Maps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_transform_maps filters by target_table and query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_transform_maps', { target_table: 'incident', query: 'csv' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_transform_map',
      query: 'target_table=incident^nameCONTAINScsv^ORtarget_tableCONTAINScsv',
    }));
  });

  it('get_transform_map requires sys_id_or_name', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'get_transform_map', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('get_transform_map throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeIntegrationToolCall(mockClient, 'get_transform_map', { sys_id_or_name: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('get_transform_map strips ^ from the name so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'tm1', name: 'Incident Map' }] });
    await executeIntegrationToolCall(mockClient, 'get_transform_map', { sys_id_or_name: 'Incident Map^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'name=Incident MapORactive=true' }));
  });

  describe('run_transform_map', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeIntegrationToolCall(mockClient, 'run_transform_map', { transform_map_sys_id: 't1', import_set_sys_id: 'i1' }))
        .rejects.toThrow('Write operations are disabled');
    });

    it('requires transform_map_sys_id and import_set_sys_id', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'run_transform_map', {})).rejects.toThrow(
        'transform_map_sys_id and import_set_sys_id are required'
      );
    });

    it('triggers a transform run', async () => {
      cr().mockResolvedValue({ sys_id: 'run1' });
      const result = await executeIntegrationToolCall(mockClient, 'run_transform_map', { transform_map_sys_id: 't1', import_set_sys_id: 'i1' });
      expect(cr()).toHaveBeenCalledWith('sys_import_set_run', { import_set: 'i1', transform_map: 't1' });
      expect(result.summary).toContain('t1');
    });
  });

  it('list_transform_field_maps requires transform_map_sys_id', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'list_transform_field_maps', {})).rejects.toThrow('transform_map_sys_id is required');
  });

  it('list_transform_field_maps queries by map', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_transform_field_maps', { transform_map_sys_id: 't1' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_transform_entry', query: 'map=t1' }));
  });
});

describe('Import Sets & Data Sources', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_import_sets combines state and query filters', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_import_sets', { state: 'loaded', query: 'table_name=u_x' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_import_set', query: 'state=loaded^table_name=u_x' }));
  });

  it('list_import_sets strips ^ from state (an exact-match value, not a free-form query)', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_import_sets', { state: 'loaded^active=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'state=loadedactive=true' }));
  });

  it('get_import_set requires sys_id', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'get_import_set', {})).rejects.toThrow('sys_id is required');
  });

  it('get_import_set delegates to getRecord', async () => {
    gr().mockResolvedValue({ sys_id: 'is1' });
    const result = await executeIntegrationToolCall(mockClient, 'get_import_set', { sys_id: 'is1' });
    expect(gr()).toHaveBeenCalledWith('sys_import_set', 'is1');
    expect(result.sys_id).toBe('is1');
  });

  it('list_data_sources filters by type and query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_data_sources', { type: 'jdbc', query: 'sap' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_data_source', query: 'type=jdbc^nameCONTAINSsap' }));
  });

  it('list_data_sources strips ^ and NUL from the free-text query before building the CONTAINS clause', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_data_sources', { query: 'sap^ORtype=jdbc' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'nameCONTAINSsapORtype=jdbc' }));
  });

  describe('create_import_set_row', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeIntegrationToolCall(mockClient, 'create_import_set_row', {
        staging_table: 'u_import_ci', import_set_sys_id: 'is1', data: { hostname: 'server-1' },
      })).rejects.toThrow('Write operations are disabled');
    });

    it('requires staging_table, import_set_sys_id, and data', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'create_import_set_row', {})).rejects.toThrow(
        'staging_table, import_set_sys_id, and data are required'
      );
    });

    it('rejects when staging_table does not match the import set\'s table_name', async () => {
      gr().mockResolvedValue({ sys_id: 'is1', table_name: 'u_import_other' });
      await expect(executeIntegrationToolCall(mockClient, 'create_import_set_row', {
        staging_table: 'u_import_ci', import_set_sys_id: 'is1', data: { hostname: 'server-1' },
      })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(cr()).not.toHaveBeenCalled();
    });

    it('rejects sys_* fields in the row data', async () => {
      gr().mockResolvedValue({ sys_id: 'is1', table_name: 'u_import_ci' });
      await expect(executeIntegrationToolCall(mockClient, 'create_import_set_row', {
        staging_table: 'u_import_ci', import_set_sys_id: 'is1', data: { hostname: 'server-1', sys_id: 'x', sys_domain: 'global' },
      })).rejects.toThrow('System fields are not permitted in import rows: sys_id, sys_domain');
      expect(cr()).not.toHaveBeenCalled();
    });

    it('inserts the row into the staging table when validation passes', async () => {
      gr().mockResolvedValue({ sys_id: 'is1', table_name: 'u_import_ci' });
      cr().mockResolvedValue({ sys_id: 'row1' });
      const result = await executeIntegrationToolCall(mockClient, 'create_import_set_row', {
        staging_table: 'u_import_ci', import_set_sys_id: 'is1', data: { hostname: 'server-1' },
      });
      expect(gr()).toHaveBeenCalledWith('sys_import_set', 'is1');
      expect(cr()).toHaveBeenCalledWith('u_import_ci', { hostname: 'server-1', sys_import_set: 'is1' });
      expect(result.summary).toContain('u_import_ci');
    });
  });

  describe('import_excel_to_import_set', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('parses header-mapped workbook rows without evaluating formulas', async () => {
      const base64 = await xlsxBase64([
        ['CVE', 'CI', 'Assignment Group'],
        ['CVE-2014-6271', 'linux-01', 'Endpoint Security'],
      ]);
      const parsed = await parseExcelImportRows(base64, 'VI Import', {
        CVE: 'u_cve', CI: 'u_cmdb_ci', 'Assignment Group': 'u_assignment_group',
      });
      expect(parsed.headers).toEqual(['u_cve', 'u_cmdb_ci', 'u_assignment_group']);
      expect(parsed.rows).toEqual([{
        u_cve: 'CVE-2014-6271', u_cmdb_ci: 'linux-01', u_assignment_group: 'Endpoint Security',
      }]);
    });

    it('rejects formula cells and system destination columns', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.addRow(['hostname']);
      sheet.getCell('A2').value = { formula: 'CONCAT("server", "-1")', result: 'server-1' };
      const formulaBase64 = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
      await expect(parseExcelImportRows(formulaBase64)).rejects.toThrow('Formula cells are not permitted');

      const systemBase64 = await xlsxBase64([['sys_id'], ['x']]);
      await expect(parseExcelImportRows(systemBase64)).rejects.toThrow('Invalid import field');
    });

    it('rejects a ZIP entry whose declared expansion ratio exceeds the limit before ExcelJS loads it', async () => {
      const zipBomb = zipWithDeclaredEntrySizes(1, 25 * 1024 * 1024);

      await expect(parseExcelImportRows(zipBomb)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('compression ratio'),
      });
    });

    it('rejects a ZIP entry whose declared uncompressed size exceeds the per-entry limit', async () => {
      const oversizedEntry = zipWithDeclaredEntrySizes(1_000_000, 25 * 1024 * 1024 + 1);

      await expect(parseExcelImportRows(oversizedEntry)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: expect.stringContaining('25 MiB'),
      });
    });

    it('neutralizes plain string values that look like formulas (CSV/Excel injection)', async () => {
      const base64 = await xlsxBase64([
        ['hostname', 'note'],
        ['=cmd|\'/c calc\'!A1', '+1+1'],
        ['-2+3', '@SUM(1)'],
        ['server-3', 'plain text with - inside'],
      ]);
      const parsed = await parseExcelImportRows(base64);
      expect(parsed.rows).toEqual([
        { hostname: "'=cmd|'/c calc'!A1", note: "'+1+1" },
        { hostname: "'-2+3", note: "'@SUM(1)" },
        { hostname: 'server-3', note: 'plain text with - inside' },
      ]);
    });

    it('creates an Import Set, attaches the workbook, links rows, and starts an optional transform', async () => {
      const base64 = await xlsxBase64([['hostname'], ['server-1'], ['server-2']]);
      const importSetId = 'a'.repeat(32);
      cr()
        .mockResolvedValueOnce({ sys_id: importSetId, table_name: 'u_import_ci' })
        .mockResolvedValueOnce({ sys_id: 'row1' })
        .mockResolvedValueOnce({ sys_id: 'row2' })
        .mockResolvedValueOnce({ sys_id: 'run1' });
      ua().mockResolvedValue({ sys_id: 'attachment1' });

      const result = await executeIntegrationToolCall(mockClient, 'import_excel_to_import_set', {
        file_name: 'vi-import.xlsx',
        content_base64: base64,
        staging_table: 'u_import_ci',
        transform_map_sys_id: 'b'.repeat(32),
      });

      expect(cr()).toHaveBeenNthCalledWith(1, 'sys_import_set', expect.objectContaining({ table_name: 'u_import_ci' }));
      expect(ua()).toHaveBeenCalledWith(
        'sys_import_set', importSetId, 'vi-import.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64
      );
      expect(cr()).toHaveBeenNthCalledWith(2, 'u_import_ci', { hostname: 'server-1', sys_import_set: importSetId });
      expect(cr()).toHaveBeenNthCalledWith(3, 'u_import_ci', { hostname: 'server-2', sys_import_set: importSetId });
      expect(cr()).toHaveBeenNthCalledWith(4, 'sys_import_set_run', {
        import_set: importSetId, transform_map: 'b'.repeat(32),
      });
      expect(result.rows_inserted).toBe(2);
      expect(result.transform_run.sys_id).toBe('run1');
    });

    it('rejects non-xlsx files before creating records', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'import_excel_to_import_set', {
        file_name: 'vi-import.csv', content_base64: 'eA==', staging_table: 'u_import_ci',
      })).rejects.toThrow('file_name must end in .xlsx');
      expect(cr()).not.toHaveBeenCalled();
    });
  });
});

describe('Event Registry & Management', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_event_registry searches by name/description', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_event_registry', { query: 'incident' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sysevent_register' }));
  });

  it('get_event_registry_entry requires name_or_sysid', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'get_event_registry_entry', {})).rejects.toThrow('name_or_sysid is required');
  });

  it('get_event_registry_entry throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeIntegrationToolCall(mockClient, 'get_event_registry_entry', { name_or_sysid: 'nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('get_event_registry_entry strips ^ from the name so it cannot inject extra encoded-query clauses', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'ev1', name: 'incident.created' }] });
    await executeIntegrationToolCall(mockClient, 'get_event_registry_entry', { name_or_sysid: 'incident.created^ORactive=true' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ query: 'name=incident.createdORactive=true' }));
  });

  describe('register_event', () => {
    beforeEach(() => {
      process.env.WRITE_ENABLED = 'true';
      process.env.SCRIPTING_ENABLED = 'true';
    });
    afterEach(() => {
      delete process.env.WRITE_ENABLED;
      delete process.env.SCRIPTING_ENABLED;
    });

    it('is blocked without SCRIPTING_ENABLED', async () => {
      delete process.env.SCRIPTING_ENABLED;
      await expect(executeIntegrationToolCall(mockClient, 'register_event', { name: 'x.created', table: 'incident' }))
        .rejects.toThrow('Scripting operations are disabled');
    });

    it('requires name and table', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'register_event', {})).rejects.toThrow('name and table are required');
    });

    it('registers the event', async () => {
      cr().mockResolvedValue({ sys_id: 'ev1' });
      const result = await executeIntegrationToolCall(mockClient, 'register_event', { name: 'x.created', table: 'incident' });
      expect(cr()).toHaveBeenCalledWith('sysevent_register', expect.objectContaining({ name: 'x.created', table: 'incident' }));
      expect(result.summary).toContain('x.created');
    });
  });

  describe('fire_event', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeIntegrationToolCall(mockClient, 'fire_event', { event_name: 'x', table: 'incident', record_sys_id: 'r1' }))
        .rejects.toThrow('Write operations are disabled');
    });

    it('requires event_name, table, and record_sys_id', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'fire_event', {})).rejects.toThrow(
        'event_name, table, and record_sys_id are required'
      );
    });

    it('fires the event', async () => {
      cr().mockResolvedValue({ sys_id: 'evt1' });
      const result = await executeIntegrationToolCall(mockClient, 'fire_event', { event_name: 'x.created', table: 'incident', record_sys_id: 'r1' });
      expect(cr()).toHaveBeenCalledWith('sysevent', expect.objectContaining({ name: 'x.created', table: 'incident', instance: 'r1' }));
      expect(result.summary).toContain('r1');
    });
  });

  it('list_event_log filters by event_name and state', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_event_log', { event_name: 'x.created', state: 'error' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sysevent', query: 'nameCONTAINSx.created^state=error' }));
  });
});

describe('OAuth & Credentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_oauth_applications searches by name/client_id', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_oauth_applications', { query: 'salesforce' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'oauth_entity' }));
  });

  it('list_credential_aliases filters by type and query', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_credential_aliases', { type: 'oauth2', query: 'aws' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_alias', query: 'type=oauth2^nameCONTAINSaws' }));
  });
});

describe('SOAP Messages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_soap_messages sanitizes query and applies active filter', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_soap_messages', { active: true, query: 'billing^ORactive=false' });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({
      table: 'sys_web_service',
      query: 'active=true^nameCONTAINSbillingORactive=false^ORendpointCONTAINSbillingORactive=false',
    }));
  });

  it('get_soap_message requires sys_id_or_name', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'get_soap_message', {})).rejects.toThrow('sys_id_or_name is required');
  });

  it('get_soap_message fetches by sys_id and includes functions', async () => {
    const id = 'a'.repeat(32);
    gr().mockResolvedValue({ sys_id: id, name: 'Billing' });
    qr().mockResolvedValue({ count: 1, records: [{ sys_id: 'fn1', name: 'charge' }] });
    const result = await executeIntegrationToolCall(mockClient, 'get_soap_message', { sys_id_or_name: id });
    expect(gr()).toHaveBeenCalledWith('sys_web_service', id);
    expect(result.soap_message.name).toBe('Billing');
    expect(result.function_count).toBe(1);
  });

  it('get_soap_message throws NOT_FOUND when name lookup misses', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(executeIntegrationToolCall(mockClient, 'get_soap_message', { sys_id_or_name: 'Nope' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('list_soap_message_functions requires a 32-char hex soap_message_sys_id', async () => {
    await expect(executeIntegrationToolCall(mockClient, 'list_soap_message_functions', { soap_message_sys_id: 'not-hex' }))
      .rejects.toThrow('32-char hex sys_id');
  });

  it('list_soap_message_functions queries by web_service', async () => {
    const id = 'b'.repeat(32);
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeIntegrationToolCall(mockClient, 'list_soap_message_functions', { soap_message_sys_id: id });
    expect(qr()).toHaveBeenCalledWith(expect.objectContaining({ table: 'sys_web_service_function', query: `web_service=${id}` }));
  });

  describe('create_soap_message', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeIntegrationToolCall(mockClient, 'create_soap_message', { name: 'X', endpoint: 'https://x' }))
        .rejects.toThrow('Write operations are disabled');
    });

    it('requires name and endpoint', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'create_soap_message', {})).rejects.toThrow('name and endpoint are required');
    });

    it('creates a SOAP message', async () => {
      cr().mockResolvedValue({ sys_id: 'sm1' });
      const result = await executeIntegrationToolCall(mockClient, 'create_soap_message', { name: 'Billing', endpoint: 'https://billing.example.com' });
      expect(cr()).toHaveBeenCalledWith('sys_web_service', expect.objectContaining({ name: 'Billing', endpoint: 'https://billing.example.com', active: true }));
      expect(result.summary).toContain('Billing');
    });
  });

  describe('create_soap_message_function', () => {
    beforeEach(() => { process.env.WRITE_ENABLED = 'true'; });
    afterEach(() => { delete process.env.WRITE_ENABLED; });

    it('is blocked without WRITE_ENABLED', async () => {
      delete process.env.WRITE_ENABLED;
      await expect(executeIntegrationToolCall(mockClient, 'create_soap_message_function', {
        soap_message_sys_id: 'a'.repeat(32), name: 'charge', function_name: 'Charge',
      })).rejects.toThrow('Write operations are disabled');
    });

    it('requires soap_message_sys_id, name, and function_name', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'create_soap_message_function', {})).rejects.toThrow(
        'soap_message_sys_id, name, and function_name are required'
      );
    });

    it('requires a 32-char hex soap_message_sys_id', async () => {
      await expect(executeIntegrationToolCall(mockClient, 'create_soap_message_function', {
        soap_message_sys_id: 'not-hex', name: 'charge', function_name: 'Charge',
      })).rejects.toThrow('32-char hex sys_id');
    });

    it('creates a SOAP function', async () => {
      const id = 'a'.repeat(32);
      cr().mockResolvedValue({ sys_id: 'fn1' });
      const result = await executeIntegrationToolCall(mockClient, 'create_soap_message_function', {
        soap_message_sys_id: id, name: 'charge', function_name: 'Charge',
      });
      expect(cr()).toHaveBeenCalledWith('sys_web_service_function', expect.objectContaining({ web_service: id, name: 'charge', function_name: 'Charge' }));
      expect(result.summary).toContain('charge');
    });
  });
});
