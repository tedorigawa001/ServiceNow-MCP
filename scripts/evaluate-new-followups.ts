import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateNewFollowups } from '../src/review/evaluation-followups.js';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--strict')) throw new Error('usage');
  const bytes = readFileSync(new URL('../tests/review/evaluation/followups-new-0.1.json', import.meta.url));
  const result = evaluateNewFollowups(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify({ ...result, fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
  if (args.includes('--strict') && !result.suite_passed) process.exitCode = 2;
} catch {
  console.error('New followup evaluation failed. Usage: evaluate-new-followups.ts [--strict]');
  process.exitCode = 1;
}
