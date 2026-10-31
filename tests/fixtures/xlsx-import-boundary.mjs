// Purely synthetic input. Static imports (including the tsx transform) finish before "ready", so the
// parent bounds only the parse below and hard-kills the child even for a CPU loop. Writes are
// synchronous so "ready" reaches the pipe before a blocked event loop could hold it back.
import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseExcelImportRows } from '../../src/tools/integration.ts';

writeSync(1, 'ready\n');
const start = performance.now();
await assert.rejects(parseExcelImportRows(process.argv[2]), {
  code: 'VALIDATION_ERROR', message: 'Malformed worksheet: bad row number',
});
writeSync(1, `xlsx-rejected ${Math.ceil(performance.now() - start)}\n`);
