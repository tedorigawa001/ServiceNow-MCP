/**
 * Integration tools — REST Messages, Transform Maps, Import Sets, and Event Registry.
 * Read tools: Tier 0. Write tools: Tier 1 (WRITE_ENABLED=true).
 * Inspired by snow-flow's "Automation/Integration" category.
 */
import { sanitizeLikeValue, type ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';
import { requireWrite, requireScripting } from '../utils/permissions.js';
import ExcelJS from 'exceljs';

const MAX_EXCEL_BYTES = 10 * 1024 * 1024;
const MAX_EXCEL_ZIP_ENTRIES = 200;
const MAX_EXCEL_ENTRY_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_EXCEL_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_EXCEL_COMPRESSION_RATIO = 100;
const MAX_EXCEL_ROWS = 500;
const MAX_EXCEL_COLUMNS = 50;
const STAGING_FIELD_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const RESERVED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

type ImportCellValue = string | number | boolean;

// CWE-1236 (CSV/Excel formula injection): a plain string cell — not an Excel
// formula cell, just literal text — starting with =, +, -, or @ (optionally
// after whitespace/tab) is interpreted as a live formula by Excel/Sheets if
// this data is later exported and reopened. The formula-cell check above only
// catches genuine formula cells; this catches the string-typed variant per
// the OWASP CSV Injection mitigation (prefix with a single quote so the
// value round-trips as literal text).
const FORMULA_LIKE_PREFIX_RE = /^[\s\t\r]*[=+\-@]/;

function neutralizeFormulaLikeString(value: string): string {
  return FORMULA_LIKE_PREFIX_RE.test(value) ? `'${value}` : value;
}

function validateStagingField(field: string): void {
  if (!STAGING_FIELD_RE.test(field) || field.toLowerCase().startsWith('sys_') || RESERVED_FIELD_NAMES.has(field)) {
    throw new ServiceNowError(
      `Invalid import field "${field}". Use a non-system ServiceNow column name.`,
      'VALIDATION_ERROR'
    );
  }
}

function decodeXlsxBase64(contentBase64: unknown): Buffer {
  if (typeof contentBase64 !== 'string' || !contentBase64) {
    throw new ServiceNowError('content_base64 is required', 'INVALID_REQUEST');
  }
  if (contentBase64.length > Math.ceil(MAX_EXCEL_BYTES * 4 / 3) ||
      contentBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) {
    throw new ServiceNowError('content_base64 is not a valid or permitted-size base64 payload', 'VALIDATION_ERROR');
  }
  const buffer = Buffer.from(contentBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_EXCEL_BYTES || buffer.subarray(0, 2).toString() !== 'PK') {
    throw new ServiceNowError('Only non-empty .xlsx files up to 10 MiB are supported', 'VALIDATION_ERROR');
  }
  return buffer;
}

/**
 * Validate ZIP metadata without inflating any entry. XLSX files are ZIP
 * archives, so compressed-size limits alone do not prevent zip bombs.
 * ZIP64 archives are deliberately rejected: their 64-bit size metadata is
 * outside the bounded parser used here and is unnecessary for supported XLSX.
 */
function assertSafeXlsxArchive(buffer: Buffer): void {
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const eocdMinSize = 22;
  const maxCommentBytes = 0xffff;
  const searchStart = Math.max(0, buffer.length - eocdMinSize - maxCommentBytes);
  let eocdOffset = -1;

  for (let offset = buffer.length - eocdMinSize; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new ServiceNowError('Invalid XLSX ZIP archive: end-of-central-directory record is missing', 'VALIDATION_ERROR');
  }

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 || centralDirectoryDisk !== 0 ||
    entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff
  ) {
    throw new ServiceNowError('ZIP64 and multi-disk XLSX archives are not supported', 'VALIDATION_ERROR');
  }
  if (entryCount > MAX_EXCEL_ZIP_ENTRIES) {
    throw new ServiceNowError(`XLSX archive contains too many entries (maximum ${MAX_EXCEL_ZIP_ENTRIES})`, 'VALIDATION_ERROR');
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset > buffer.length ||
    centralDirectoryEnd > buffer.length ||
    centralDirectoryEnd < centralDirectoryOffset
  ) {
    throw new ServiceNowError('Invalid XLSX ZIP archive: central directory is out of bounds', 'VALIDATION_ERROR');
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  for (let entry = 0; entry < entryCount; entry++) {
    if (offset + 46 > centralDirectoryEnd || buffer.readUInt32LE(offset) !== centralDirectorySignature) {
      throw new ServiceNowError('Invalid XLSX ZIP archive: malformed central directory entry', 'VALIDATION_ERROR');
    }
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const fileNameBytes = buffer.readUInt16LE(offset + 28);
    const extraFieldBytes = buffer.readUInt16LE(offset + 30);
    const commentBytes = buffer.readUInt16LE(offset + 32);
    const entrySize = 46 + fileNameBytes + extraFieldBytes + commentBytes;

    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff) {
      throw new ServiceNowError('ZIP64 XLSX archive entries are not supported', 'VALIDATION_ERROR');
    }
    if (entrySize > centralDirectoryEnd - offset) {
      throw new ServiceNowError('Invalid XLSX ZIP archive: entry extends beyond central directory', 'VALIDATION_ERROR');
    }
    if (uncompressedBytes > MAX_EXCEL_ENTRY_UNCOMPRESSED_BYTES) {
      throw new ServiceNowError('XLSX archive entry exceeds the 25 MiB uncompressed limit', 'VALIDATION_ERROR');
    }
    if (
      (compressedBytes === 0 && uncompressedBytes > 0) ||
      (compressedBytes > 0 && uncompressedBytes > compressedBytes * MAX_EXCEL_COMPRESSION_RATIO)
    ) {
      throw new ServiceNowError('XLSX archive compression ratio exceeds the permitted limit', 'VALIDATION_ERROR');
    }
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_EXCEL_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ServiceNowError('XLSX archive exceeds the 50 MiB total uncompressed limit', 'VALIDATION_ERROR');
    }
    offset += entrySize;
  }
  if (offset !== centralDirectoryEnd) {
    throw new ServiceNowError('Invalid XLSX ZIP archive: central directory size mismatch', 'VALIDATION_ERROR');
  }
}

/** Parse a single worksheet without evaluating formulas or trusting workbook metadata. */
export async function parseExcelImportRows(
  contentBase64: unknown,
  sheetName?: unknown,
  columnMapping?: unknown
): Promise<{ sheetName: string; headers: string[]; rows: Record<string, ImportCellValue>[] }> {
  const buffer = decodeXlsxBase64(contentBase64);
  assertSafeXlsxArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs declares the pre-Node-20 Buffer generic here; the binary is a
    // standard Node Buffer decoded above.
    await workbook.xlsx.load(buffer as any);
  } catch (error) {
    throw new ServiceNowError(
      `Could not parse .xlsx file: ${error instanceof Error ? error.message : 'invalid workbook'}`,
      'VALIDATION_ERROR'
    );
  }

  const worksheet = typeof sheetName === 'string' && sheetName
    ? workbook.getWorksheet(sheetName)
    : workbook.worksheets[0];
  if (!worksheet) throw new ServiceNowError('Requested worksheet was not found', 'VALIDATION_ERROR');
  if (worksheet.actualColumnCount === 0 || worksheet.actualColumnCount > MAX_EXCEL_COLUMNS ||
      worksheet.actualRowCount < 2 || worksheet.actualRowCount > MAX_EXCEL_ROWS + 1) {
    throw new ServiceNowError(
      `Worksheet must contain a header plus 1–${MAX_EXCEL_ROWS} rows and at most ${MAX_EXCEL_COLUMNS} columns`,
      'VALIDATION_ERROR'
    );
  }

  const mapping = columnMapping && typeof columnMapping === 'object' && !Array.isArray(columnMapping)
    ? columnMapping as Record<string, unknown>
    : {};
  if (columnMapping !== undefined && (typeof columnMapping !== 'object' || columnMapping === null || Array.isArray(columnMapping))) {
    throw new ServiceNowError('column_mapping must be an object of Excel header to staging column names', 'VALIDATION_ERROR');
  }
  const headers: string[] = [];
  for (let column = 1; column <= worksheet.actualColumnCount; column++) {
    const header = worksheet.getCell(1, column).text.trim();
    if (!header) throw new ServiceNowError(`Header row has an empty column at position ${column}`, 'VALIDATION_ERROR');
    const mapped = mapping[header] === undefined ? header : mapping[header];
    if (typeof mapped !== 'string') {
      throw new ServiceNowError(`column_mapping value for "${header}" must be a string`, 'VALIDATION_ERROR');
    }
    validateStagingField(mapped);
    if (headers.includes(mapped)) throw new ServiceNowError(`Duplicate destination column "${mapped}"`, 'VALIDATION_ERROR');
    headers.push(mapped);
  }

  const rows: Record<string, ImportCellValue>[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber++) {
    const row: Record<string, ImportCellValue> = Object.create(null) as Record<string, ImportCellValue>;
    let hasValue = false;
    for (let column = 1; column <= headers.length; column++) {
      const cell = worksheet.getCell(rowNumber, column);
      const value = cell.value as unknown;
      if (value && typeof value === 'object' && 'formula' in value) {
        throw new ServiceNowError(`Formula cells are not permitted (row ${rowNumber}, column ${column})`, 'VALIDATION_ERROR');
      }
      if (value === null || value === undefined || cell.text === '') continue;
      hasValue = true;
      if (value instanceof Date) {
        row[headers[column - 1]] = value.toISOString().replace('T', ' ').slice(0, 19);
      } else if (typeof value === 'string') {
        row[headers[column - 1]] = neutralizeFormulaLikeString(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        row[headers[column - 1]] = value;
      } else {
        row[headers[column - 1]] = neutralizeFormulaLikeString(cell.text);
      }
    }
    if (hasValue) rows.push(row);
  }
  if (rows.length === 0) throw new ServiceNowError('Worksheet has no data rows', 'VALIDATION_ERROR');
  return { sheetName: worksheet.name, headers, rows };
}

export function getIntegrationToolDefinitions() {
  return [
    // ── Outbound REST Messages ───────────────────────────────────────────────
    {
      name: 'list_rest_messages',
      description: 'List outbound REST Message configurations (integrations with external APIs)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or description' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_rest_message',
      description: 'Get full configuration of an outbound REST Message including its endpoints',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'REST Message sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'list_rest_message_functions',
      description: 'List HTTP methods (functions) defined within a REST Message',
      inputSchema: {
        type: 'object',
        properties: {
          rest_message_sys_id: { type: 'string', description: 'Parent REST Message sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['rest_message_sys_id'],
      },
    },
    {
      name: 'create_rest_message',
      description: 'Create a new outbound REST Message definition (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique REST Message name' },
          endpoint: { type: 'string', description: 'Base URL endpoint (e.g. "https://api.example.com/v1")' },
          description: { type: 'string', description: 'Purpose/description of this integration' },
          use_mutual_auth: { type: 'boolean', description: 'Whether to use mutual TLS authentication' },
          authentication_type: {
            type: 'string',
            description: 'Auth type: "no_authentication", "basic", "oauth2"',
          },
        },
        required: ['name', 'endpoint'],
      },
    },
    // ── Transform Maps ──────────────────────────────────────────────────────
    {
      name: 'list_transform_maps',
      description: 'List Transform Maps used for importing data into ServiceNow tables',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or target table' },
          target_table: { type: 'string', description: 'Filter by target table name (e.g. "incident")' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_transform_map',
      description: 'Get details of a Transform Map including its field mappings',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'Transform Map sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'run_transform_map',
      description: 'Execute a Transform Map on an Import Set to load data (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          transform_map_sys_id: { type: 'string', description: 'sys_id of the Transform Map to run' },
          import_set_sys_id: { type: 'string', description: 'sys_id of the Import Set containing source data' },
        },
        required: ['transform_map_sys_id', 'import_set_sys_id'],
      },
    },
    {
      name: 'list_transform_field_maps',
      description: 'List field-level mappings within a Transform Map',
      inputSchema: {
        type: 'object',
        properties: {
          transform_map_sys_id: { type: 'string', description: 'Parent Transform Map sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: ['transform_map_sys_id'],
      },
    },
    // ── Import Sets ─────────────────────────────────────────────────────────
    {
      name: 'list_import_sets',
      description: 'List Import Sets with optional filter by state or staging table',
      inputSchema: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Filter by state: loaded, partial, transform_failed, complete' },
          query: { type: 'string', description: 'Additional encoded query string' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_import_set',
      description: 'Get details of a specific Import Set including row count and transform status',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id: { type: 'string', description: 'Import Set sys_id' },
        },
        required: ['sys_id'],
      },
    },
    {
      name: 'create_import_set_row',
      description: 'Insert a row into an Import Set staging table for later transformation (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          staging_table: {
            type: 'string',
            description: 'Staging table name (e.g. "u_import_incident"). Must already exist.',
          },
          import_set_sys_id: { type: 'string', description: 'sys_id of the Import Set that owns this staging table' },
          data: { type: 'object', description: 'Key-value pairs for the staging table row' },
        },
        required: ['staging_table', 'import_set_sys_id', 'data'],
      },
    },
    {
      name: 'import_excel_to_import_set',
      description:
        'Upload and parse one .xlsx worksheet, create an Import Set, insert its staging rows, and optionally run a Transform Map. ' +
        'Requires WRITE_ENABLED=true. The original workbook is attached to the Import Set for auditability; formulas and sys_* columns are rejected.',
      inputSchema: {
        type: 'object',
        properties: {
          file_name: { type: 'string', description: 'Original .xlsx file name' },
          content_base64: {
            type: 'string',
            description: 'Base64-encoded .xlsx content (maximum 10 MiB compressed; ZIP expansion limits apply)',
          },
          staging_table: { type: 'string', description: 'Existing Import Set staging table to receive parsed rows' },
          transform_map_sys_id: { type: 'string', description: 'Optional Transform Map sys_id to run after rows are inserted' },
          sheet_name: { type: 'string', description: 'Optional worksheet name (default: first worksheet)' },
          import_set_label: { type: 'string', description: 'Optional Import Set label' },
          column_mapping: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Optional mapping of Excel header to staging-table column, e.g. { "CVE": "u_cve" }',
          },
        },
        required: ['file_name', 'content_base64', 'staging_table'],
      },
    },
    {
      name: 'list_data_sources',
      description: 'List Import Set data source definitions (file/JDBC/REST loaders)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name' },
          type: { type: 'string', description: 'Filter by type: file, jdbc, ldap, rest' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── Event Registry & Management ─────────────────────────────────────────
    {
      name: 'list_event_registry',
      description: 'List registered event definitions in the ServiceNow event registry',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search events by name or description' },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    {
      name: 'get_event_registry_entry',
      description: 'Get details of a specific registered event definition',
      inputSchema: {
        type: 'object',
        properties: {
          name_or_sysid: { type: 'string', description: 'Event name (e.g. "incident.created") or sys_id' },
        },
        required: ['name_or_sysid'],
      },
    },
    {
      name: 'register_event',
      description: 'Register a new custom event in the event registry (requires SCRIPTING_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique event name (e.g. "my_app.record_created")' },
          description: { type: 'string', description: 'Description of when this event fires' },
          table: { type: 'string', description: 'Table that fires this event (e.g. "incident")' },
        },
        required: ['name', 'table'],
      },
    },
    {
      name: 'fire_event',
      description: 'Fire a custom ServiceNow event for a specific record (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          event_name: { type: 'string', description: 'Event name to fire (must be registered)' },
          table: { type: 'string', description: 'Table name of the target record' },
          record_sys_id: { type: 'string', description: 'sys_id of the record to fire the event on' },
          parm1: { type: 'string', description: 'Optional first parameter passed to event handlers' },
          parm2: { type: 'string', description: 'Optional second parameter passed to event handlers' },
        },
        required: ['event_name', 'table', 'record_sys_id'],
      },
    },
    {
      name: 'list_event_log',
      description: 'List recent event log entries (fired events and their processing status)',
      inputSchema: {
        type: 'object',
        properties: {
          event_name: { type: 'string', description: 'Filter by event name' },
          state: {
            type: 'string',
            description: 'Filter by state: ready, processing, processed, error, transferred',
          },
          limit: { type: 'number', description: 'Max records to return (default 50)' },
        },
        required: [],
      },
    },
    // ── OAuth & Credentials ─────────────────────────────────────────────────
    {
      name: 'list_oauth_applications',
      description: 'List OAuth application registry entries (client applications that can authenticate)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or client ID' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'list_credential_aliases',
      description: 'List connection and credential aliases used by integrations',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name' },
          type: { type: 'string', description: 'Filter by type: basic, oauth2, api_key, certificate' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    // ── Outbound SOAP Messages ───────────────────────────────────────────────
    {
      name: 'list_soap_messages',
      description: 'List outbound SOAP Message configurations (sys_web_service)',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search by name or endpoint' },
          active: { type: 'boolean', description: 'Filter by active status' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: [],
      },
    },
    {
      name: 'get_soap_message',
      description: 'Get full configuration of a SOAP Message including its functions/operations',
      inputSchema: {
        type: 'object',
        properties: {
          sys_id_or_name: { type: 'string', description: 'SOAP Message sys_id or name' },
        },
        required: ['sys_id_or_name'],
      },
    },
    {
      name: 'list_soap_message_functions',
      description: 'List SOAP Message Functions (operations) for a given SOAP Message',
      inputSchema: {
        type: 'object',
        properties: {
          soap_message_sys_id: { type: 'string', description: 'Parent SOAP Message sys_id' },
          limit: { type: 'number', description: 'Max records to return (default 25)' },
        },
        required: ['soap_message_sys_id'],
      },
    },
    {
      name: 'create_soap_message',
      description: 'Create a new outbound SOAP Message definition (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Unique SOAP Message name' },
          endpoint: { type: 'string', description: 'SOAP service endpoint URL' },
          wsdl: { type: 'string', description: 'WSDL URL for the service (used for schema introspection)' },
          namespace: { type: 'string', description: 'XML namespace for SOAP body elements' },
          soap_action_prefix: { type: 'string', description: 'Prefix prepended to all SOAP action headers' },
          authentication_type: {
            type: 'string',
            description: 'Auth type: "no_authentication" (default), "basic", "mutual_authentication"',
          },
          description: { type: 'string', description: 'Purpose/description of this integration' },
          active: { type: 'boolean', description: 'Make active immediately (default: true)' },
        },
        required: ['name', 'endpoint'],
      },
    },
    {
      name: 'create_soap_message_function',
      description: 'Add a SOAP function (operation) to an existing SOAP Message (requires WRITE_ENABLED=true)',
      inputSchema: {
        type: 'object',
        properties: {
          soap_message_sys_id: { type: 'string', description: 'Parent SOAP Message sys_id' },
          name: { type: 'string', description: 'Function name (used in scripts to call this operation)' },
          function_name: { type: 'string', description: 'WSDL operation name (matches the SOAP operation)' },
          soap_action: { type: 'string', description: 'Full SOAP Action header value' },
          soap_message_template: { type: 'string', description: 'SOAP XML request body template with ${variable} placeholders' },
          active: { type: 'boolean', description: 'Make active immediately (default: true)' },
        },
        required: ['soap_message_sys_id', 'name', 'function_name'],
      },
    },
  ];
}

export async function executeIntegrationToolCall(
  client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    // ── Outbound REST Messages ───────────────────────────────────────────────
    case 'list_rest_messages': {
      const parts: string[] = [];
      if (args.query) {
        const value = sanitizeLikeValue(args.query);
        parts.push(`nameCONTAINS${value}^ORdescriptionCONTAINS${value}`);
      }
      return await client.queryRecords({
        table: 'sys_rest_message',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,endpoint,description,authentication_type,sys_updated_on',
      });
    }
    case 'get_rest_message': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_rest_message', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'sys_rest_message',
        query: `name=${sanitizeLikeValue(args.sys_id_or_name)}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`REST Message not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'list_rest_message_functions': {
      if (!args.rest_message_sys_id) throw new ServiceNowError('rest_message_sys_id is required', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sys_rest_message_fn',
        query: `rest_message=${args.rest_message_sys_id}`,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,http_method,relative_path,rest_message,sys_updated_on',
      });
    }
    case 'create_rest_message': {
      requireWrite();
      if (!args.name || !args.endpoint) throw new ServiceNowError('name and endpoint are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        endpoint: args.endpoint,
        description: args.description || '',
        authentication_type: args.authentication_type || 'no_authentication',
      };
      if (args.use_mutual_auth !== undefined) data.use_mutual_auth = args.use_mutual_auth;
      const result = await client.createRecord('sys_rest_message', data);
      return { ...result, summary: `Created REST Message "${args.name}"` };
    }
    // ── Transform Maps ──────────────────────────────────────────────────────
    case 'list_transform_maps': {
      const parts: string[] = [];
      if (args.target_table) parts.push(`target_table=${sanitizeLikeValue(args.target_table)}`);
      if (args.query) {
        const value = sanitizeLikeValue(args.query);
        parts.push(`nameCONTAINS${value}^ORtarget_tableCONTAINS${value}`);
      }
      return await client.queryRecords({
        table: 'sys_transform_map',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,target_table,source_table,active,sys_updated_on',
      });
    }
    case 'get_transform_map': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        return await client.getRecord('sys_transform_map', args.sys_id_or_name);
      }
      const resp = await client.queryRecords({
        table: 'sys_transform_map',
        query: `name=${sanitizeLikeValue(args.sys_id_or_name)}`,
        limit: 1,
      });
      if (resp.count === 0) throw new ServiceNowError(`Transform Map not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
      return resp.records[0];
    }
    case 'run_transform_map': {
      requireWrite();
      if (!args.transform_map_sys_id || !args.import_set_sys_id) {
        throw new ServiceNowError('transform_map_sys_id and import_set_sys_id are required', 'INVALID_REQUEST');
      }
      // Trigger transform via Scripted REST — create a sys_import_set_run record
      const data = {
        import_set: args.import_set_sys_id,
        transform_map: args.transform_map_sys_id,
      };
      const result = await client.createRecord('sys_import_set_run', data);
      return {
        ...result,
        summary: `Triggered Transform Map ${args.transform_map_sys_id} on Import Set ${args.import_set_sys_id}`,
      };
    }
    case 'list_transform_field_maps': {
      if (!args.transform_map_sys_id) throw new ServiceNowError('transform_map_sys_id is required', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sys_transform_entry',
        query: `map=${args.transform_map_sys_id}`,
        limit: args.limit ?? 50,
        fields: 'sys_id,map,source_field,target_field,coalesce,use_source_script,sys_updated_on',
      });
    }
    // ── Import Sets ─────────────────────────────────────────────────────────
    case 'list_import_sets': {
      const parts: string[] = [];
      if (args.state) parts.push(`state=${sanitizeLikeValue(args.state)}`);
      // args.query is documented as a full encoded query filter (not a free-text
      // search term), so it is passed through as-is rather than sanitized.
      if (args.query) parts.push(args.query);
      return await client.queryRecords({
        table: 'sys_import_set',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,label,state,table_name,import_count,error_count,sys_created_on',
      });
    }
    case 'get_import_set': {
      if (!args.sys_id) throw new ServiceNowError('sys_id is required', 'INVALID_REQUEST');
      return await client.getRecord('sys_import_set', args.sys_id);
    }
    case 'create_import_set_row': {
      requireWrite();
      if (!args.staging_table || !args.import_set_sys_id || !args.data ||
          typeof args.data !== 'object' || Array.isArray(args.data)) {
        throw new ServiceNowError('staging_table, import_set_sys_id, and data are required', 'INVALID_REQUEST');
      }
      const importSet = await client.getRecord('sys_import_set', args.import_set_sys_id);
      if (importSet.table_name !== args.staging_table) {
        throw new ServiceNowError('staging_table does not match the specified import set.', 'VALIDATION_ERROR');
      }
      const unsafeFields = Object.keys(args.data).filter(field =>
        field.toLowerCase().startsWith('sys_') || RESERVED_FIELD_NAMES.has(field)
      );
      if (unsafeFields.length) {
        throw new ServiceNowError(`System fields are not permitted in import rows: ${unsafeFields.join(', ')}`, 'VALIDATION_ERROR');
      }
      const result = await client.createRecord(args.staging_table, {
        ...args.data,
        sys_import_set: args.import_set_sys_id,
      });
      return { ...result, summary: `Inserted row into staging table "${args.staging_table}"` };
    }
    case 'import_excel_to_import_set': {
      requireWrite();
      if (!args.file_name || !args.content_base64 || !args.staging_table) {
        throw new ServiceNowError('file_name, content_base64, and staging_table are required', 'INVALID_REQUEST');
      }
      const fileName = String(args.file_name);
      if (!/\.xlsx$/i.test(fileName)) {
        throw new ServiceNowError('file_name must end in .xlsx', 'VALIDATION_ERROR');
      }
      const stagingTable = String(args.staging_table);
      if (!STAGING_FIELD_RE.test(stagingTable)) {
        throw new ServiceNowError('staging_table must contain only letters, numbers, and underscores', 'VALIDATION_ERROR');
      }
      if (args.sheet_name !== undefined && typeof args.sheet_name !== 'string') {
        throw new ServiceNowError('sheet_name must be a string', 'VALIDATION_ERROR');
      }
      if (args.transform_map_sys_id !== undefined &&
          !/^[0-9a-f]{32}$/i.test(String(args.transform_map_sys_id))) {
        throw new ServiceNowError('transform_map_sys_id must be a 32-char sys_id', 'VALIDATION_ERROR');
      }

      const parsed = await parseExcelImportRows(args.content_base64, args.sheet_name, args.column_mapping);
      const importSet = await client.createRecord('sys_import_set', {
        table_name: stagingTable,
        label: typeof args.import_set_label === 'string' && args.import_set_label.trim()
          ? args.import_set_label.trim()
          : `MCP Excel import: ${fileName}`,
      });
      const importSetSysId = String(importSet.sys_id ?? '');
      if (!/^[0-9a-f]{32}$/i.test(importSetSysId)) {
        throw new ServiceNowError('ServiceNow did not return a valid Import Set sys_id', 'API_ERROR');
      }

      await client.uploadAttachment(
        'sys_import_set',
        importSetSysId,
        fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        String(args.content_base64)
      );
      for (const row of parsed.rows) {
        await client.createRecord(stagingTable, { ...row, sys_import_set: importSetSysId });
      }

      let transformRun: any;
      if (args.transform_map_sys_id) {
        transformRun = await client.createRecord('sys_import_set_run', {
          import_set: importSetSysId,
          transform_map: String(args.transform_map_sys_id),
        });
      }
      return {
        import_set: importSet,
        import_set_sys_id: importSetSysId,
        attachment_uploaded: true,
        sheet_name: parsed.sheetName,
        columns: parsed.headers,
        rows_inserted: parsed.rows.length,
        ...(transformRun ? { transform_run: transformRun } : {}),
        summary: `Created Import Set ${importSetSysId} from ${fileName}; inserted ${parsed.rows.length} row(s)` +
          (transformRun ? ' and started the Transform Map' : ''),
      };
    }
    case 'list_data_sources': {
      const parts: string[] = [];
      if (args.type) parts.push(`type=${sanitizeLikeValue(args.type)}`);
      if (args.query) parts.push(`nameCONTAINS${sanitizeLikeValue(args.query)}`);
      return await client.queryRecords({
        table: 'sys_data_source',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,type,format,import_set_table_name,sys_updated_on',
      });
    }
    // ── Event Registry ──────────────────────────────────────────────────────
    case 'list_event_registry': {
      const parts: string[] = [];
      if (args.query) {
        const value = sanitizeLikeValue(args.query);
        parts.push(`nameCONTAINS${value}^ORdescriptionCONTAINS${value}`);
      }
      return await client.queryRecords({
        table: 'sysevent_register',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 50,
        fields: 'sys_id,name,table,description,sys_updated_on',
      });
    }
    case 'get_event_registry_entry': {
      if (!args.name_or_sysid) throw new ServiceNowError('name_or_sysid is required', 'INVALID_REQUEST');
      if (/^[0-9a-f]{32}$/i.test(args.name_or_sysid)) {
        return await client.getRecord('sysevent_register', args.name_or_sysid);
      }
      const resp = await client.queryRecords({
        table: 'sysevent_register',
        query: `name=${sanitizeLikeValue(args.name_or_sysid)}`,
        limit: 1,
      });
      if (resp.count === 0) {
        throw new ServiceNowError(`Event registry entry not found: ${args.name_or_sysid}`, 'NOT_FOUND');
      }
      return resp.records[0];
    }
    case 'register_event': {
      requireScripting();
      if (!args.name || !args.table) throw new ServiceNowError('name and table are required', 'INVALID_REQUEST');
      const data = {
        name: args.name,
        table: args.table,
        description: args.description || '',
      };
      const result = await client.createRecord('sysevent_register', data);
      return { ...result, summary: `Registered event "${args.name}" for table "${args.table}"` };
    }
    case 'fire_event': {
      requireWrite();
      if (!args.event_name || !args.table || !args.record_sys_id) {
        throw new ServiceNowError('event_name, table, and record_sys_id are required', 'INVALID_REQUEST');
      }
      // Fire via sys_event table insert
      const data: Record<string, any> = {
        name: args.event_name,
        table: args.table,
        instance: args.record_sys_id,
      };
      if (args.parm1) data.parm1 = args.parm1;
      if (args.parm2) data.parm2 = args.parm2;
      const result = await client.createRecord('sysevent', data);
      return {
        ...result,
        summary: `Fired event "${args.event_name}" on ${args.table}:${args.record_sys_id}`,
      };
    }
    case 'list_event_log': {
      const parts: string[] = [];
      if (args.event_name) parts.push(`nameCONTAINS${sanitizeLikeValue(args.event_name)}`);
      if (args.state) parts.push(`state=${sanitizeLikeValue(args.state)}`);
      return await client.queryRecords({
        table: 'sysevent',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 50,
        orderBy: '-sys_created_on',
        fields: 'sys_id,name,table,instance,state,parm1,parm2,sys_created_on',
      });
    }
    // ── Outbound SOAP Messages ───────────────────────────────────────────────
    case 'list_soap_messages': {
      const parts: string[] = [];
      if (args.active !== undefined) parts.push(`active=${args.active}`);
      if (args.query) {
        // Strip encoded-query control characters from free-text search value
        const safe = args.query.replace(/[\^]/g, '').replace(/\0/g, '');
        parts.push(`nameCONTAINS${safe}^ORendpointCONTAINS${safe}`);
      }
      return await client.queryRecords({
        table: 'sys_web_service',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,endpoint,wsdl,namespace,authentication_type,active,description,sys_updated_on',
      });
    }
    case 'get_soap_message': {
      if (!args.sys_id_or_name) throw new ServiceNowError('sys_id_or_name is required', 'INVALID_REQUEST');
      let msg: any;
      if (/^[0-9a-f]{32}$/i.test(args.sys_id_or_name)) {
        msg = await client.getRecord('sys_web_service', args.sys_id_or_name);
      } else {
        // Sanitize name: strip encoded-query control chars before using in CONTAINS clause
        const safeName = args.sys_id_or_name.replace(/[\^=]/g, '').replace(/\0/g, '');
        if (!safeName) throw new ServiceNowError('sys_id_or_name must not be empty after sanitization', 'INVALID_REQUEST');
        const resp = await client.queryRecords({
          table: 'sys_web_service',
          query: `nameCONTAINS${safeName}`,
          limit: 1,
        });
        if (resp.count === 0) throw new ServiceNowError(`SOAP Message not found: ${args.sys_id_or_name}`, 'NOT_FOUND');
        msg = resp.records[0];
      }
      const msgId = (msg as any).sys_id?.value ?? (msg as any).sys_id;
      if (!/^[0-9a-f]{32}$/i.test(String(msgId))) throw new ServiceNowError('Unexpected sys_id format in response', 'API_ERROR');
      const fns = await client.queryRecords({
        table: 'sys_web_service_function',
        query: `web_service=${msgId}`,
        limit: 50,
        fields: 'sys_id,name,function_name,soap_action,active',
      });
      return { soap_message: msg, functions: fns.records, function_count: fns.count };
    }
    case 'list_soap_message_functions': {
      if (!args.soap_message_sys_id) throw new ServiceNowError('soap_message_sys_id is required', 'INVALID_REQUEST');
      if (!/^[0-9a-f]{32}$/i.test(args.soap_message_sys_id))
        throw new ServiceNowError('soap_message_sys_id must be a 32-char hex sys_id', 'INVALID_REQUEST');
      return await client.queryRecords({
        table: 'sys_web_service_function',
        query: `web_service=${args.soap_message_sys_id}`,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,function_name,soap_action,active,sys_updated_on',
      });
    }
    case 'create_soap_message': {
      requireWrite();
      if (!args.name || !args.endpoint) throw new ServiceNowError('name and endpoint are required', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        name: args.name,
        endpoint: args.endpoint,
        authentication_type: args.authentication_type || 'no_authentication',
        active: args.active !== false,
      };
      if (args.wsdl) data.wsdl = args.wsdl;
      if (args.namespace) data.namespace = args.namespace;
      if (args.soap_action_prefix) data.soap_action_prefix = args.soap_action_prefix;
      if (args.description) data.description = args.description;
      const result = await client.createRecord('sys_web_service', data);
      return { ...result, summary: `Created SOAP Message "${args.name}" at ${args.endpoint}` };
    }
    case 'create_soap_message_function': {
      requireWrite();
      if (!args.soap_message_sys_id || !args.name || !args.function_name)
        throw new ServiceNowError('soap_message_sys_id, name, and function_name are required', 'INVALID_REQUEST');
      if (!/^[0-9a-f]{32}$/i.test(args.soap_message_sys_id))
        throw new ServiceNowError('soap_message_sys_id must be a 32-char hex sys_id', 'INVALID_REQUEST');
      const data: Record<string, any> = {
        web_service: args.soap_message_sys_id,
        name: args.name,
        function_name: args.function_name,
        active: args.active !== false,
      };
      if (args.soap_action) data.soap_action = args.soap_action;
      if (args.soap_message_template) data.soap_message = args.soap_message_template;
      const result = await client.createRecord('sys_web_service_function', data);
      return { ...result, summary: `Created SOAP function "${args.name}" on message ${args.soap_message_sys_id}` };
    }
    // ── OAuth ────────────────────────────────────────────────────────────────
    case 'list_oauth_applications': {
      const parts: string[] = [];
      if (args.query) {
        const value = sanitizeLikeValue(args.query);
        parts.push(`nameCONTAINS${value}^ORclient_idCONTAINS${value}`);
      }
      return await client.queryRecords({
        table: 'oauth_entity',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,client_id,type,active,sys_updated_on',
      });
    }
    case 'list_credential_aliases': {
      const parts: string[] = [];
      if (args.type) parts.push(`type=${sanitizeLikeValue(args.type)}`);
      if (args.query) parts.push(`nameCONTAINS${sanitizeLikeValue(args.query)}`);
      return await client.queryRecords({
        table: 'sys_alias',
        query: parts.join('^') || undefined,
        limit: args.limit ?? 25,
        fields: 'sys_id,name,type,description,sys_updated_on',
      });
    }
    default:
      return null;
  }
}
