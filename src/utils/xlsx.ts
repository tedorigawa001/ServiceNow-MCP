/**
 * Minimal, read-only XLSX reader for import_excel_to_import_set.
 *
 * Replaces exceljs, which was 22 MB of mostly write-side code and pulled in
 * an unmaintained dependency tree (uuid 8, archiver, unzipper, glob 7 …) whose
 * advisories reached every install. This reads exactly what the import needs —
 * one worksheet's cell values — with no third-party code:
 *
 * - ZIP: the central directory is validated before anything is inflated
 *   (entry count, per-entry and total uncompressed size, compression ratio,
 *   no ZIP64 / multi-disk / encryption), then only the parts the workbook
 *   actually references are inflated with node:zlib, bounded by the declared
 *   size and checked against the stored length and CRC-32.
 * - XML: a small non-validating tokenizer. DTDs are rejected outright, so
 *   entity expansion (billion laughs, XXE) is impossible; only the five
 *   predefined entities and numeric character references are decoded.
 * - Values: formulas are reported as such and never evaluated; dates follow
 *   the cell's number format the way Excel does.
 */
import { crc32, inflateRawSync } from 'node:zlib';
import { ServiceNowError } from './errors.js';

export const MAX_XLSX_ZIP_ENTRIES = 200;
export const MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
export const MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_XLSX_COMPRESSION_RATIO = 100;

const invalid = (message: string) => new ServiceNowError(message, 'VALIDATION_ERROR');

// ─── ZIP ─────────────────────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedBytes: number;
  uncompressedBytes: number;
  localHeaderOffset: number;
}

/**
 * Validate ZIP metadata without inflating any entry and return the entries.
 * XLSX files are ZIP archives, so compressed-size limits alone do not prevent
 * zip bombs. ZIP64 archives are deliberately rejected: their 64-bit size
 * metadata is outside this bounded parser and unnecessary for real XLSX.
 */
export function listXlsxZipEntries(buffer: Buffer): Map<string, ZipEntry> {
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const eocdMinSize = 22;
  const maxCommentBytes = 0xffff;
  if (buffer.length < eocdMinSize) throw invalid('Invalid XLSX ZIP archive: end-of-central-directory record is missing');
  const searchStart = Math.max(0, buffer.length - eocdMinSize - maxCommentBytes);
  let eocdOffset = -1;
  for (let offset = buffer.length - eocdMinSize; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw invalid('Invalid XLSX ZIP archive: end-of-central-directory record is missing');

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (
    diskNumber !== 0 || centralDirectoryDisk !== 0 ||
    entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff
  ) {
    throw invalid('ZIP64 and multi-disk XLSX archives are not supported');
  }
  if (entryCount > MAX_XLSX_ZIP_ENTRIES) {
    throw invalid(`XLSX archive contains too many entries (maximum ${MAX_XLSX_ZIP_ENTRIES})`);
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryOffset > buffer.length || centralDirectoryEnd > buffer.length || centralDirectoryEnd < centralDirectoryOffset) {
    throw invalid('Invalid XLSX ZIP archive: central directory is out of bounds');
  }

  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > centralDirectoryEnd || buffer.readUInt32LE(offset) !== centralDirectorySignature) {
      throw invalid('Invalid XLSX ZIP archive: malformed central directory entry');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const fileNameBytes = buffer.readUInt16LE(offset + 28);
    const extraFieldBytes = buffer.readUInt16LE(offset + 30);
    const commentBytes = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const entrySize = 46 + fileNameBytes + extraFieldBytes + commentBytes;

    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw invalid('ZIP64 XLSX archive entries are not supported');
    }
    if (entrySize > centralDirectoryEnd - offset) {
      throw invalid('Invalid XLSX ZIP archive: entry extends beyond central directory');
    }
    if (uncompressedBytes > MAX_XLSX_ENTRY_UNCOMPRESSED_BYTES) {
      throw invalid('XLSX archive entry exceeds the 25 MiB uncompressed limit');
    }
    if (
      (compressedBytes === 0 && uncompressedBytes > 0) ||
      (compressedBytes > 0 && uncompressedBytes > compressedBytes * MAX_XLSX_COMPRESSION_RATIO)
    ) {
      throw invalid('XLSX archive compression ratio exceeds the permitted limit');
    }
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_XLSX_TOTAL_UNCOMPRESSED_BYTES) {
      throw invalid('XLSX archive exceeds the 50 MiB total uncompressed limit');
    }

    const name = buffer.toString('utf8', offset + 46, offset + 46 + fileNameBytes);
    // Two entries with one name would let the validated entry and the parsed
    // one differ; real XLSX never has duplicates.
    if (entries.has(name)) throw invalid(`Invalid XLSX ZIP archive: duplicate entry "${name}"`);
    entries.set(name, { name, flags, method, crc, compressedBytes, uncompressedBytes, localHeaderOffset });
    offset += entrySize;
  }
  if (offset !== centralDirectoryEnd) {
    throw invalid('Invalid XLSX ZIP archive: central directory size mismatch');
  }
  return entries;
}

function readZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  const localHeaderSignature = 0x04034b50;
  if (entry.flags & 0x1) throw invalid(`Encrypted XLSX entries are not supported ("${entry.name}")`);
  const start = entry.localHeaderOffset;
  if (start + 30 > buffer.length || buffer.readUInt32LE(start) !== localHeaderSignature) {
    throw invalid(`Invalid XLSX ZIP archive: bad local header for "${entry.name}"`);
  }
  const dataStart = start + 30 + buffer.readUInt16LE(start + 26) + buffer.readUInt16LE(start + 28);
  const dataEnd = dataStart + entry.compressedBytes;
  if (dataEnd > buffer.length) throw invalid(`Invalid XLSX ZIP archive: data for "${entry.name}" is out of bounds`);
  const data = buffer.subarray(dataStart, dataEnd);

  let content: Buffer;
  if (entry.method === 0) {
    content = data;
  } else if (entry.method === 8) {
    try {
      // The declared size was already bounded above; never inflate past it.
      content = inflateRawSync(data, { maxOutputLength: Math.max(entry.uncompressedBytes, 1) });
    } catch {
      throw invalid(`Invalid XLSX ZIP archive: "${entry.name}" does not inflate to its declared size`);
    }
  } else {
    throw invalid(`Unsupported ZIP compression method ${entry.method} in "${entry.name}"`);
  }
  if (content.length !== entry.uncompressedBytes || crc32(content) !== entry.crc) {
    throw invalid(`Invalid XLSX ZIP archive: "${entry.name}" fails its size or CRC check`);
  }
  return content;
}

// ─── XML ─────────────────────────────────────────────────────────────────────

interface XmlHandlers {
  open?(name: string, attrs: Record<string, string>, selfClosing: boolean): void;
  close?(name: string): void;
  text?(text: string): void;
}

const NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(raw: string): string {
  if (!raw.includes('&')) return raw;
  return raw.replace(/&([^;&\s]{1,10});|&/g, (match, body: string | undefined) => {
    if (body === undefined) throw invalid('Malformed XML in XLSX part: bare "&"');
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) throw invalid(`Malformed XML in XLSX part: bad character reference ${match}`);
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body];
    if (named === undefined) throw invalid(`Malformed XML in XLSX part: undefined entity ${match}`);
    return named;
  });
}

const localName = (qualified: string) => qualified.slice(qualified.indexOf(':') + 1);

/** Non-validating XML tokenizer: element names and attribute names lose their namespace prefix. */
export function scanXml(xml: string, handlers: XmlHandlers): void {
  let pos = 0;
  const length = xml.length;
  while (pos < length) {
    const lt = xml.indexOf('<', pos);
    if (lt < 0) {
      if (handlers.text) handlers.text(decodeEntities(xml.slice(pos)));
      return;
    }
    if (lt > pos && handlers.text) handlers.text(decodeEntities(xml.slice(pos, lt)));

    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) throw invalid('Malformed XML in XLSX part: unterminated processing instruction');
      pos = end + 2;
    } else if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) throw invalid('Malformed XML in XLSX part: unterminated comment');
      pos = end + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) throw invalid('Malformed XML in XLSX part: unterminated CDATA');
      if (handlers.text) handlers.text(xml.slice(lt + 9, end));
      pos = end + 3;
    } else if (xml.startsWith('<!', lt)) {
      // DOCTYPE / ENTITY declarations are never needed in XLSX and are the
      // vector for entity-expansion and external-entity attacks.
      throw invalid('XLSX parts must not contain a DTD');
    } else if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt + 2);
      if (end < 0) throw invalid('Malformed XML in XLSX part: unterminated end tag');
      if (handlers.close) handlers.close(localName(xml.slice(lt + 2, end).trim()));
      pos = end + 1;
    } else {
      // Start tag: find the closing '>' outside quoted attribute values.
      let i = lt + 1;
      let quote = '';
      for (; i < length; i++) {
        const ch = xml[i];
        if (quote) {
          if (ch === quote) quote = '';
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === '>') {
          break;
        }
      }
      if (i >= length) throw invalid('Malformed XML in XLSX part: unterminated start tag');
      let body = xml.slice(lt + 1, i);
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1);
      const nameMatch = /^[^\s/>]+/.exec(body);
      if (!nameMatch) throw invalid('Malformed XML in XLSX part: element without a name');
      const attrs: Record<string, string> = Object.create(null) as Record<string, string>;
      const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      const attrText = body.slice(nameMatch[0].length);
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(attrText)) !== null) {
        attrs[localName(m[1])] = decodeEntities(m[2] ?? m[3] ?? '');
      }
      const name = localName(nameMatch[0]);
      if (handlers.open) handlers.open(name, attrs, selfClosing);
      if (selfClosing && handlers.close) handlers.close(name);
      pos = i + 1;
    }
  }
}

/** XML parts are UTF-8 in practice; honour a UTF-16 byte-order mark if present. */
function decodePart(content: Buffer): string {
  if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) return content.toString('utf16le', 2);
  if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {
    const swapped = Buffer.from(content.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  const text = content.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ECMA-376 ST_Xstring: characters XML cannot carry are written as _xHHHH_
// (Excel uses it for carriage returns as _x000D_; a literal "_x" is escaped as _x005F_).
const decodeXstring = (value: string) => value.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

// ─── Workbook structure ──────────────────────────────────────────────────────

function resolvePartPath(baseDir: string, target: string): string {
  const raw = target.startsWith('/') ? target.slice(1) : `${baseDir}${target}`;
  const parts: string[] = [];
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) throw invalid(`XLSX relationship target escapes the package: "${target}"`);
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

interface Relationship { type: string; target: string; external: boolean }

function parseRelationships(xml: string): Map<string, Relationship> {
  const rels = new Map<string, Relationship>();
  scanXml(xml, {
    open(name, attrs) {
      if (name === 'Relationship' && attrs.Id && attrs.Target) {
        rels.set(attrs.Id, { type: attrs.Type ?? '', target: attrs.Target, external: attrs.TargetMode === 'External' });
      }
    },
  });
  return rels;
}

// Built-in number formats that are dates/times. 14–22 and 45–47 are the
// locale-independent ones; 27–36 and 50–58 are the CJK built-ins (e.g. ja-JP
// 31 = yyyy"年"m"月"d"日", 57/58 = Japanese era dates), which Excel writes by id
// without a <numFmt> definition.
const BUILTIN_DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Same rule exceljs applies: strip [..] and ".." sections, then look for date/time tokens. */
export function isDateFormatCode(code: string): boolean {
  const stripped = code.replace(/\[[^\]]*]/g, '').replace(/"[^"]*"/g, '');
  return /[ymdhMsb]+/.test(stripped);
}

/** Per cellXfs index: does the style format the number as a date? */
function parseDateStyles(xml: string): boolean[] {
  const customFormats = new Map<number, string>();
  const xfIsDate: boolean[] = [];
  let inCellXfs = false;
  scanXml(xml, {
    open(name, attrs) {
      if (name === 'numFmt' && attrs.numFmtId !== undefined) {
        customFormats.set(Number(attrs.numFmtId), attrs.formatCode ?? '');
      } else if (name === 'cellXfs') {
        inCellXfs = true;
      } else if (name === 'xf' && inCellXfs) {
        const id = Number(attrs.numFmtId ?? 0);
        const custom = customFormats.get(id);
        xfIsDate.push(custom !== undefined ? isDateFormatCode(custom) : BUILTIN_DATE_FORMAT_IDS.has(id));
      }
    },
    close(name) {
      if (name === 'cellXfs') inCellXfs = false;
    },
  });
  return xfIsDate;
}

/** Shared strings: each <si> is the concatenation of its <t> runs, excluding phonetic (<rPh>) runs. */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  let current: string[] | null = null;
  let inText = false;
  let phoneticDepth = 0;
  scanXml(xml, {
    open(name, _attrs, selfClosing) {
      if (name === 'si') current = [];
      else if (name === 'rPh') phoneticDepth++;
      else if (name === 't' && !selfClosing) inText = true;
    },
    close(name) {
      if (name === 'si' && current) { strings.push(decodeXstring(current.join(''))); current = null; }
      else if (name === 'rPh') phoneticDepth--;
      else if (name === 't') inText = false;
    },
    text(text) {
      if (inText && phoneticDepth === 0 && current) current.push(text);
    },
  });
  return strings;
}

// Excel serial date → JS Date, identical to exceljs's excelToDate.
const excelSerialToDate = (serial: number, date1904: boolean) =>
  new Date(Math.round((serial - 25569 + (date1904 ? 1462 : 0)) * 24 * 3600 * 1000));

// ─── Worksheet ───────────────────────────────────────────────────────────────

export type XlsxCell =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'date'; value: Date }
  | { kind: 'error'; value: string }
  | { kind: 'formula' };

export interface XlsxSheet {
  name: string;
  /** row number (1-based) → column number (1-based) → cell. Only cells with content. */
  rows: Map<number, Map<number, XlsxCell>>;
}

function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

interface SheetContext { sharedStrings: string[]; dateStyles: boolean[]; date1904: boolean }

function parseWorksheet(xml: string, ctx: SheetContext): Map<number, Map<number, XlsxCell>> {
  const rows = new Map<number, Map<number, XlsxCell>>();
  let rowNumber = 0;
  let columnCursor = 0;
  let inSheetData = false;
  let cell: { row: number; column: number; type: string; style: number; hasFormula: boolean; value: string[] | null; inline: string[] | null } | null = null;
  let capture: 'v' | 't' | null = null;
  let inInline = false;
  let phoneticDepth = 0;

  scanXml(xml, {
    open(name, attrs, selfClosing) {
      if (name === 'sheetData') { inSheetData = true; return; }
      if (!inSheetData) return;
      if (name === 'row') {
        rowNumber = attrs.r ? Number(attrs.r) : rowNumber + 1;
        if (!Number.isInteger(rowNumber) || rowNumber < 1) throw invalid('Malformed worksheet: bad row number');
        columnCursor = 0;
      } else if (name === 'c') {
        let row = rowNumber;
        let column = columnCursor + 1;
        if (attrs.r) {
          const ref = /^([A-Z]{1,3})(\d+)$/.exec(attrs.r);
          if (!ref) throw invalid(`Malformed worksheet: bad cell reference "${attrs.r}"`);
          column = columnNumber(ref[1]);
          row = Number(ref[2]);
        }
        columnCursor = column;
        cell = { row, column, type: attrs.t ?? 'n', style: attrs.s ? Number(attrs.s) : 0, hasFormula: false, value: null, inline: null };
        if (selfClosing) cell = null;
      } else if (cell) {
        if (name === 'f') cell.hasFormula = true;
        else if (name === 'v' && !selfClosing) { capture = 'v'; cell.value = []; }
        else if (name === 'is') { inInline = true; cell.inline = []; }
        else if (name === 'rPh') phoneticDepth++;
        else if (name === 't' && inInline && !selfClosing) capture = 't';
      }
    },
    close(name) {
      if (name === 'sheetData') { inSheetData = false; return; }
      if (!inSheetData) return;
      if (name === 'v' || name === 't') capture = null;
      else if (name === 'is') inInline = false;
      else if (name === 'rPh') phoneticDepth--;
      else if (name === 'c' && cell) {
        const value = toCellValue(cell, ctx);
        if (value) {
          let row = rows.get(cell.row);
          if (!row) { row = new Map(); rows.set(cell.row, row); }
          row.set(cell.column, value);
        }
        cell = null;
      }
    },
    text(text) {
      if (!cell || !capture) return;
      if (capture === 'v' && cell.value) cell.value.push(text);
      else if (capture === 't' && cell.inline && phoneticDepth === 0) cell.inline.push(text);
    },
  });
  return rows;
}

function toCellValue(
  cell: { type: string; style: number; hasFormula: boolean; value: string[] | null; inline: string[] | null },
  ctx: SheetContext,
): XlsxCell | null {
  if (cell.hasFormula) return { kind: 'formula' };
  if (cell.type === 'inlineStr') {
    return cell.inline ? { kind: 'string', value: decodeXstring(cell.inline.join('')) } : null;
  }
  if (cell.value === null) return null;
  const raw = cell.value.join('');
  switch (cell.type) {
    case 's': {
      const index = Number(raw);
      const value = ctx.sharedStrings[index];
      if (!Number.isInteger(index) || value === undefined) throw invalid(`Malformed worksheet: shared string ${raw} does not exist`);
      return { kind: 'string', value };
    }
    case 'str':
      return { kind: 'string', value: decodeXstring(raw) };
    case 'b':
      return { kind: 'boolean', value: raw.trim() === '1' || raw.trim().toLowerCase() === 'true' };
    case 'e':
      return { kind: 'error', value: raw };
    case 'd': {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw invalid(`Malformed worksheet: bad ISO date "${raw}"`);
      return { kind: 'date', value: date };
    }
    default: {
      if (raw.trim() === '') return null;
      const number = Number(raw);
      if (!Number.isFinite(number)) throw invalid(`Malformed worksheet: bad number "${raw}"`);
      if (ctx.dateStyles[cell.style]) return { kind: 'date', value: excelSerialToDate(number, ctx.date1904) };
      return { kind: 'number', value: number };
    }
  }
}

/**
 * Read one worksheet (by name, or the first in workbook order) from an XLSX
 * buffer. Returns null when a named sheet does not exist.
 */
export function readXlsxSheet(buffer: Buffer, sheetName?: string): XlsxSheet | null {
  const entries = listXlsxZipEntries(buffer);
  const part = (path: string, required: boolean): string | null => {
    const entry = entries.get(path);
    if (!entry) {
      if (required) throw invalid(`Not a valid .xlsx workbook: "${path}" is missing`);
      return null;
    }
    return decodePart(readZipEntry(buffer, entry));
  };

  // Package root → workbook part (normally xl/workbook.xml).
  let workbookPath = 'xl/workbook.xml';
  const rootRels = part('_rels/.rels', false);
  if (rootRels) {
    for (const rel of parseRelationships(rootRels).values()) {
      if (rel.type.endsWith('/officeDocument') && !rel.external) { workbookPath = resolvePartPath('', rel.target); break; }
    }
  }
  const workbookXml = part(workbookPath, true)!;
  const workbookDir = dirOf(workbookPath);
  const relsPath = `${workbookDir}_rels/${workbookPath.slice(workbookDir.length)}.rels`;
  const workbookRels = parseRelationships(part(relsPath, true)!);

  const sheets: Array<{ name: string; relId: string }> = [];
  let date1904 = false;
  scanXml(workbookXml, {
    open(name, attrs) {
      if (name === 'sheet' && attrs.name !== undefined && attrs.id) sheets.push({ name: attrs.name, relId: attrs.id });
      else if (name === 'workbookPr' && attrs.date1904 !== undefined) date1904 = attrs.date1904 === '1' || attrs.date1904.toLowerCase() === 'true';
    },
  });
  if (sheets.length === 0) throw invalid('Not a valid .xlsx workbook: it has no worksheets');
  const sheet = sheetName === undefined ? sheets[0] : sheets.find((s) => s.name === sheetName);
  if (!sheet) return null;

  const findRel = (suffix: string) => [...workbookRels.values()].find((r) => r.type.endsWith(suffix) && !r.external);
  const sharedRel = findRel('/sharedStrings');
  const stylesRel = findRel('/styles');
  const sheetRel = workbookRels.get(sheet.relId);
  if (!sheetRel || sheetRel.external) throw invalid(`Not a valid .xlsx workbook: worksheet "${sheet.name}" has no part`);

  const ctx: SheetContext = {
    sharedStrings: sharedRel ? parseSharedStrings(part(resolvePartPath(workbookDir, sharedRel.target), true)!) : [],
    dateStyles: stylesRel ? parseDateStyles(part(resolvePartPath(workbookDir, stylesRel.target), true)!) : [],
    date1904,
  };
  return { name: sheet.name, rows: parseWorksheet(part(resolvePartPath(workbookDir, sheetRel.target), true)!, ctx) };
}
