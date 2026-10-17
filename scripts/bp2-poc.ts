/** Offline PoC. Does not load instance settings, credentials or ServiceNow clients. */
import { readFileSync, statSync } from 'node:fs';
import { searchBestPractices } from '../src/review/search.js';
import { reviewResultJsonSchema, reviewResultSchema } from '../src/review/result-schema.js';

try {
  const [mode, argument] = process.argv.slice(2);
  if (mode === '--schema') {
    console.log(JSON.stringify(reviewResultJsonSchema, null, 2));
  } else if (mode === '--search' && argument) {
    console.log(JSON.stringify(searchBestPractices(JSON.parse(argument)), null, 2));
  } else if (mode === '--validate' && argument) {
    if (statSync(argument).size > 2 * 1024 * 1024) throw new Error('Input exceeds 2 MiB');
    const input = readFileSync(argument);
    if (input.byteLength > 2 * 1024 * 1024) throw new Error('Input exceeds 2 MiB');
    const result = reviewResultSchema.safeParse(JSON.parse(input.toString('utf8')));
    console.log(JSON.stringify(result.success ? { valid: true, poc_only: true }
      : { valid: false, issues: result.error.issues.map(issue => ({ path: issue.path, message: issue.message })) }, null, 2));
    if (!result.success) process.exitCode = 1;
  } else {
    throw new Error('Usage: --search <JSON> | --schema | --validate <local JSON file>');
  }
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid JSON' : error instanceof Error ? error.message : 'PoC failed');
  process.exitCode = 1;
}
