import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateFollowupPolicy } from '../src/review/evaluation-followups-policy.js';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--strict')) throw new Error('usage');
  const bytes = readFileSync(new URL('../tests/review/evaluation/followups-policy-0.2.json', import.meta.url));
  const report = evaluateFollowupPolicy(JSON.parse(bytes.toString('utf8')));
  console.log(JSON.stringify({ ...report, fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') }, null, 2));
  if (args.includes('--strict') && !report.suite_passed) process.exitCode = 2;
} catch {
  console.error('Followup policy evaluation failed. Usage: evaluate-followup-policy.ts [--strict]');
  process.exitCode = 1;
}
