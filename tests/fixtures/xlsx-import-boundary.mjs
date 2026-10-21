// Purely synthetic input. Parent enforces a hard timeout even for a CPU loop.
import assert from 'node:assert/strict';
import { parseExcelImportRows } from '../../src/tools/integration.ts';

await assert.rejects(parseExcelImportRows(process.argv[2]), {
  code: 'VALIDATION_ERROR', message: 'Malformed worksheet: bad row number',
});
console.log('xlsx-rejected');
