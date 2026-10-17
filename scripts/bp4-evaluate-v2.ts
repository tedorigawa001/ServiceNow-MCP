/** Separate v0.2 evaluator. Never changes the v0.1 dataset, scorer or baseline. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateBestPracticeV2 } from '../src/review/evaluation-v2.js';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--strict')) throw new Error('usage');
  const bytes = readFileSync(new URL('../tests/review/evaluation/bp4-v2-cases.json', import.meta.url));
  const report = { ...evaluateBestPracticeV2(JSON.parse(bytes.toString('utf8'))),
    fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') };
  console.log(JSON.stringify(report, null, 2));
  // This is a case-contract gate, NOT a production quality approval.
  if (args[0] === '--strict' && !report.contract_suite_passed) process.exitCode = 2;
} catch {
  console.error('BP-4 v0.2 evaluation failed. Usage: bp4-evaluate-v2.ts [--strict]');
  process.exitCode = 1;
}
