import { crc32, deflateRawSync } from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { isDateFormatCode, readXlsxSheet, scanXml } from '../../src/utils/xlsx.js';
import { parseExcelImportRows } from '../../src/tools/integration.js';

/** Minimal ZIP writer so tests can hand-craft parts exceljs never produces. */
function zip(files: Record<string, string | Buffer>, opts: { store?: boolean; tamperCrc?: string; encrypt?: string; duplicate?: string } = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const entries = Object.entries(files);
  if (opts.duplicate) entries.push([opts.duplicate, files[opts.duplicate]]);
  for (const [name, content] of entries) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const data = opts.store ? raw : deflateRawSync(raw);
    const method = opts.store ? 0 : 8;
    const crc = opts.tamperCrc === name ? (crc32(raw) ^ 1) >>> 0 : crc32(raw);
    const flags = opts.encrypt === name ? 1 : 0;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const ROOT_RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
const workbook = (sheets: string[], extra = '') => `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${extra}<sheets>${sheets.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
const workbookRels = (count: number, extras = '') => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({ length: count }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}${extras}</Relationships>`;
const SST_REL = '<Relationship Id="rS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>';
const STYLES_REL = '<Relationship Id="rT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="/xl/styles.xml"/>';
const sheetXml = (rows: string) => `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;

function book(sheet: string, extra: Record<string, string> = {}, relExtras = '', wbExtra = '') {
  return zip({
    '_rels/.rels': ROOT_RELS,
    'xl/workbook.xml': workbook(['S'], wbExtra),
    'xl/_rels/workbook.xml.rels': workbookRels(1, relExtras),
    'xl/worksheets/sheet1.xml': sheet,
    ...extra,
  });
}

const values = (buf: Buffer) => {
  const sheet = readXlsxSheet(buf)!;
  return [...sheet.rows].map(([r, cells]) => [r, Object.fromEntries([...cells].map(([c, v]) => [c, 'value' in v ? (v.value instanceof Date ? v.value.toISOString() : v.value) : v.kind]))]);
};

describe('readXlsxSheet — content exceljs cannot produce', () => {
  it('drops phonetic (furigana) runs from shared strings', () => {
    const sst = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>東京</t><rPh sb="0" eb="2"><t>トウキョウ</t></rPh><phoneticPr fontId="1"/></si><si><r><t>富</t></r><r><t>士</t></r><rPh sb="0" eb="2"><t>フジ</t></rPh></si></sst>';
    const buf = book(sheetXml('<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'), { 'xl/sharedStrings.xml': sst }, SST_REL);
    expect(values(buf)).toEqual([[1, { 1: '東京', 2: '富士' }]]);
  });

  it('treats the Japanese built-in date formats (ids 31, 57) as dates, and plain numbers as numbers', () => {
    const styles = '<styleSheet><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="31"/><xf numFmtId="57"/><xf numFmtId="3"/></cellXfs></styleSheet>';
    const buf = book(sheetXml('<row r="1"><c r="A1" s="1"><v>45000</v></c><c r="B1" s="2"><v>45000</v></c><c r="C1" s="3"><v>45000</v></c><c r="D1"><v>1.5</v></c></row>'), { 'xl/styles.xml': styles }, STYLES_REL);
    expect(values(buf)).toEqual([[1, { 1: '2023-03-15T00:00:00.000Z', 2: '2023-03-15T00:00:00.000Z', 3: 45000, 4: 1.5 }]]);
  });

  it('applies custom date formats and the 1904 date system', () => {
    const styles = '<styleSheet><numFmts count="2"><numFmt numFmtId="176" formatCode="yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;"/><numFmt numFmtId="177" formatCode="&quot;No.&quot;0"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="176"/><xf numFmtId="177"/></cellXfs></styleSheet>';
    const buf = book(sheetXml('<row r="1"><c r="A1" s="1"><v>0</v></c><c r="B1" s="2"><v>7</v></c></row>'), { 'xl/styles.xml': styles }, STYLES_REL, '<workbookPr date1904="1"/>');
    expect(values(buf)).toEqual([[1, { 1: '1904-01-01T00:00:00.000Z', 2: 7 }]]);
  });

  it('decodes _xHHHH_ escapes, inline strings, entities, CDATA and namespace prefixes', () => {
    const xml = '<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>'
      + '<x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>line1_x000D_&#10;line2</x:t></x:is></x:c>'
      + '<x:c r="B1" t="inlineStr"><x:is><x:t>a &amp; b &lt;c&gt; &#x41;</x:t></x:is></x:c>'
      + '<x:c r="C1" t="inlineStr"><x:is><x:t><![CDATA[<raw & text>]]></x:t></x:is></x:c>'
      + '<x:c r="D1" t="inlineStr"><x:is><x:t>_x005F_x0041_</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>';
    expect(values(book(xml))).toEqual([[1, { 1: 'line1\r\nline2', 2: 'a & b <c> A', 3: '<raw & text>', 4: '_x0041_' }]]);
  });

  it('reads cells without r attributes, booleans, errors, ISO dates and formulas', () => {
    const buf = book(sheetXml('<row><c><v>1</v></c><c t="b"><v>1</v></c><c t="e"><v>#DIV/0!</v></c></row><row><c t="d"><v>2026-10-04T09:30:00Z</v></c><c t="str"><f>A1&amp;"x"</f><v>1x</v></c><c s="0"/></row>'));
    expect(values(buf)).toEqual([[1, { 1: 1, 2: true, 3: '#DIV/0!' }], [2, { 1: '2026-10-04T09:30:00.000Z', 2: 'formula' }]]);
  });

  it('picks a sheet by name, defaults to the first, and returns null for an unknown name', () => {
    const buf = zip({
      '_rels/.rels': ROOT_RELS,
      'xl/workbook.xml': workbook(['One', 'Two']),
      'xl/_rels/workbook.xml.rels': workbookRels(2),
      'xl/worksheets/sheet1.xml': sheetXml('<row r="1"><c r="A1"><v>1</v></c></row>'),
      'xl/worksheets/sheet2.xml': sheetXml('<row r="1"><c r="A1"><v>2</v></c></row>'),
    });
    expect(readXlsxSheet(buf)!.name).toBe('One');
    expect(readXlsxSheet(buf, 'Two')!.rows.get(1)!.get(1)).toEqual({ kind: 'number', value: 2 });
    expect(readXlsxSheet(buf, 'Three')).toBeNull();
  });

  it('reads stored (uncompressed) entries', () => {
    const files = { '_rels/.rels': ROOT_RELS, 'xl/workbook.xml': workbook(['S']), 'xl/_rels/workbook.xml.rels': workbookRels(1), 'xl/worksheets/sheet1.xml': sheetXml('<row r="1"><c r="A1"><v>3</v></c></row>') };
    expect(values(zip(files, { store: true }))).toEqual([[1, { 1: 3 }]]);
  });
});

describe('readXlsxSheet — hostile input', () => {
  const sheet = sheetXml('<row r="1"><c r="A1"><v>1</v></c></row>');

  it('rejects a huge row coordinate before it can reach import traversal', () => {
    const xml = sheetXml('<row r="100000000000000000000"><c t="inlineStr"><is><t>x</t></is></c></row>');
    expect(() => readXlsxSheet(book(xml))).toThrow('bad row number');
  });

  it.each(['0', '-1', '1.5', '1e20', '0x100', '', '1048577', '9007199254740992', '&#49;000000000'])
    ('rejects invalid explicit row coordinate %s even with an ordinary cell reference', r => {
      expect(() => readXlsxSheet(book(sheetXml(`<row r="${r}"><c r="A2"><v>1</v></c></row>`))))
        .toThrow('bad row number');
    });

  it.each(['0', '1048577', '100000000000000000000', '9'.repeat(400), '&#49;000000000'])
    ('rejects invalid cell-reference row %s independently of its parent row', r => {
      expect(() => readXlsxSheet(book(sheetXml(`<row r="2"><c r="A${r}"><v>1</v></c></row>`))))
        .toThrow('bad row number');
    });

  it('rejects inferred row overflow and invalid empty rows or cells', () => {
    for (const rows of ['<row r="1048576"/><row/>', '<row r="1048577"/>', '<row r="2"><c r="A1048577"/></row>']) {
      expect(() => readXlsxSheet(book(sheetXml(rows)))).toThrow('bad row number');
    }
  });

  it('rejects a DTD, so entity expansion and external entities never happen', () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&lol2;</t></is></c></row></sheetData></worksheet>';
    expect(() => readXlsxSheet(book(bomb))).toThrow('must not contain a DTD');
    const xxe = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><worksheet/>';
    expect(() => readXlsxSheet(book(xxe))).toThrow('must not contain a DTD');
  });

  it('rejects undefined entities instead of passing them through', () => {
    const xml = sheetXml('<row r="1"><c r="A1" t="inlineStr"><is><t>&nbsp;</t></is></c></row>');
    expect(() => readXlsxSheet(book(xml))).toThrow('undefined entity');
  });

  it('rejects an entry whose CRC does not match its content', () => {
    const files = { '_rels/.rels': ROOT_RELS, 'xl/workbook.xml': workbook(['S']), 'xl/_rels/workbook.xml.rels': workbookRels(1), 'xl/worksheets/sheet1.xml': sheet };
    expect(() => readXlsxSheet(zip(files, { tamperCrc: 'xl/worksheets/sheet1.xml' }))).toThrow('size or CRC check');
  });

  it('rejects encrypted entries and duplicate entry names', () => {
    const files = { '_rels/.rels': ROOT_RELS, 'xl/workbook.xml': workbook(['S']), 'xl/_rels/workbook.xml.rels': workbookRels(1), 'xl/worksheets/sheet1.xml': sheet };
    expect(() => readXlsxSheet(zip(files, { encrypt: 'xl/worksheets/sheet1.xml' }))).toThrow('Encrypted');
    expect(() => readXlsxSheet(zip(files, { duplicate: 'xl/worksheets/sheet1.xml' }))).toThrow('duplicate entry');
  });

  it('refuses relationship targets that climb out of the package', () => {
    const rels = '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="../../../etc/passwd"/></Relationships>';
    const buf = zip({ '_rels/.rels': ROOT_RELS, 'xl/workbook.xml': workbook(['S']), 'xl/_rels/workbook.xml.rels': rels });
    expect(() => readXlsxSheet(buf)).toThrow('escapes the package');
  });

  it('rejects a deflate stream that expands beyond its declared size', () => {
    const files = { '_rels/.rels': ROOT_RELS, 'xl/workbook.xml': workbook(['S']), 'xl/_rels/workbook.xml.rels': workbookRels(1), 'xl/worksheets/sheet1.xml': sheet };
    const buf = zip(files);
    // Lower the declared uncompressed size of the sheet in its central directory record.
    const at = buf.lastIndexOf(Buffer.from('xl/worksheets/sheet1.xml')) - 46;
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    buf.writeUInt32LE(10, at + 24);
    expect(() => readXlsxSheet(buf)).toThrow('does not inflate to its declared size');
  });

  it('rejects a workbook that is missing required parts', () => {
    expect(() => readXlsxSheet(zip({ '_rels/.rels': ROOT_RELS }))).toThrow('is missing');
  });
});

/**
 * Runs the import-boundary fixture under separate clocks. node + tsx startup and process teardown
 * both slow down badly under a parallel suite, so they get a generous clock; the parse alone, from
 * the child's "ready" line to its result line, gets a tight one. Any clock expiring SIGKILLs the
 * child, so a non-terminating parse still fails within BOUNDARY_PARSE_MS.
 */
const BOUNDARY_SLOW_MS = 30_000;
const BOUNDARY_PARSE_MS = 2_000;
function runImportBoundary(base64: string): Promise<{ stdout: string; code: number | null; signal: NodeJS.Signals | null; timedOut?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '--import', 'tsx', fileURLToPath(new URL('../fixtures/xlsx-import-boundary.mjs', import.meta.url)), base64,
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    let lines = 0;
    let timedOut: string | undefined;
    const expire = (phase: string) => () => { timedOut = phase; child.kill('SIGKILL'); };
    const phases = [`startup (${BOUNDARY_SLOW_MS} ms)`, `parse (${BOUNDARY_PARSE_MS} ms)`, `exit (${BOUNDARY_SLOW_MS} ms)`];
    let timer = setTimeout(expire(phases[0]), BOUNDARY_SLOW_MS);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 64 * 1024) return expire('output limit')();
      // Each completed line ("ready", then the result) moves the child into its next phase.
      for (const seen = Math.min(stdout.split('\n').length - 1, 2); lines < seen; lines++) {
        clearTimeout(timer);
        timer = setTimeout(expire(phases[lines + 1]), lines === 0 ? BOUNDARY_PARSE_MS : BOUNDARY_SLOW_MS);
      }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ stdout, code, signal, timedOut }); });
  });
}

describe('sparse XLSX import traversal', () => {
  const header = '<row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c></row>';
  const row = (r: number, value: string) => `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${value}</t></is></c></row>`;

  it('imports distant populated rows in numeric order, ignoring gaps and dimension metadata', async () => {
    const xml = sheetXml(row(1048576, 'last') + header + row(100, 'middle') + row(2, 'first'))
      .replace('<sheetData>', '<dimension ref="A1:A999999999999999999999"/><sheetData>');
    const parsed = await parseExcelImportRows(book(xml).toString('base64'));
    expect(parsed.rows).toEqual([{ name: 'first' }, { name: 'middle' }, { name: 'last' }]);
  });

  it('still rejects formulas after a large gap using their actual row number', async () => {
    const xml = sheetXml(header + '<row r="1048576"><c r="A1048576"><f>1+1</f><v>2</v></c></row>');
    await expect(parseExcelImportRows(book(xml).toString('base64')))
      .rejects.toThrow('Formula cells are not permitted (row 1048576, column 1)');
  });

  it('retains the 500 populated data-row limit independently of row positions', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => row(1000 + i, `v${i}`));
    expect((await parseExcelImportRows(book(sheetXml(header + rows.slice(0, 500).join(''))).toString('base64'))).rows)
      .toHaveLength(500);
    await expect(parseExcelImportRows(book(sheetXml(header + rows.join(''))).toString('base64')))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an overflowing reference through the public import parser', async () => {
    const xml = sheetXml(header + `<row r="2"><c r="A${'9'.repeat(400)}"><v>1</v></c></row>`);
    await expect(parseExcelImportRows(book(xml).toString('base64')))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: 'Malformed worksheet: bad row number' });
  });

  it.each([
    '<row r="100000000000000000000"><c><v>1</v></c></row>',
    `<row r="2"><c r="A${'9'.repeat(400)}"><v>1</v></c></row>`,
  ])('rejects the former non-progressing-loop input in a bounded child process (%#)', async data => {
    const result = await runImportBoundary(book(sheetXml(header + data)).toString('base64'));
    expect(result).toMatchObject({ code: 0, signal: null, timedOut: undefined });
    const [, parseMs] = result.stdout.match(/^ready\nxlsx-rejected (\d+)\n$/) ?? [];
    expect(Number(parseMs)).toBeLessThan(BOUNDARY_PARSE_MS);
  }, 2 * BOUNDARY_SLOW_MS + BOUNDARY_PARSE_MS + 5_000);
});

describe('isDateFormatCode', () => {
  it('matches exceljs: ignores quoted text and bracketed sections', () => {
    expect(isDateFormatCode('yyyy/mm/dd')).toBe(true);
    expect(isDateFormatCode('[$-411]ge.m.d')).toBe(true);
    expect(isDateFormatCode('hh:mm')).toBe(true);
    expect(isDateFormatCode('#,##0.00')).toBe(false);
    expect(isDateFormatCode('"day"0')).toBe(false);
    expect(isDateFormatCode('[Red]0.0')).toBe(false);
  });
});

describe('scanXml', () => {
  it('keeps ">" inside quoted attribute values and strips namespace prefixes', () => {
    const seen: Array<[string, Record<string, string>]> = [];
    scanXml('<a:root x:k="1 > 0" y=\'q\'><b/></a:root>', { open: (n, attrs) => seen.push([n, { ...attrs }]) });
    expect(seen).toEqual([['root', { k: '1 > 0', y: 'q' }], ['b', {}]]);
  });
});
