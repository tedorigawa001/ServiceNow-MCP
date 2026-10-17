/** Fixed offline benchmark. Prints aggregate/per-case outcomes, never fixture code. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateBestPracticeCases } from '../src/review/evaluation.js';

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--strict')) throw new Error('usage');
  const bytes = readFileSync(new URL('../tests/review/evaluation/bp4-cases.json', import.meta.url));
  const report = { ...evaluateBestPracticeCases(JSON.parse(bytes.toString('utf8'))),
    fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') };
  console.log(JSON.stringify(report, null, 2));
  // Report generation succeeds independently of quality. Strict mode is the release-quality gate.
  if (args[0] === '--strict' && !report.quality_gate_passed) process.exitCode = 2;
} catch {
  console.error('BP-4 evaluation failed. Usage: bp4-evaluate.ts [--strict]');
  process.exitCode = 1;
}
