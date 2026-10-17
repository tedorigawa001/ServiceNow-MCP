/** Separate v0.2 evaluator. Never changes the v0.1 dataset, scorer or baseline. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateBestPracticeV2 } from '../src/review/evaluation-v2.js';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy, reviewUpdateSetPayloadScoped } from '../src/review/payload-review.js';
import { FOLLOW_UP_CATALOG_VERSION } from '../src/review/follow-up-catalog.js';

try {
  const args = process.argv.slice(2);
  if (new Set(args).size !== args.length || args.some(arg => !['--strict', '--legacy', '--scoped'].includes(arg))
    || (args.includes('--legacy') && args.includes('--scoped'))) throw new Error('usage');
  const bytes = readFileSync(new URL('../tests/review/evaluation/bp4-v2-cases.json', import.meta.url));
  const versions = new Set<string>();
  const engine = args.includes('--legacy') ? reviewUpdateSetPayloadLegacy : args.includes('--scoped') ? reviewUpdateSetPayloadScoped : reviewUpdateSetPayload;
  const measured = evaluateBestPracticeV2(JSON.parse(bytes.toString('utf8')), input => {
    const output = engine(input);
    if (output.status === 'reviewed') versions.add(output.result.ruleset_version);
    return output;
  });
  const historical = args.includes('--legacy') || args.includes('--scoped');
  const report = { ...measured, ...(args.includes('--legacy') ? {} : { engine_ruleset_versions: [...versions].sort() }),
    ...(!historical ? { follow_up_catalog_version: FOLLOW_UP_CATALOG_VERSION,
      limitations: measured.limitations.map(l => l === 'no_engine_tuning' ? 'engine_updated_after_dataset_review' : l) } : {}),
    fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') };
  console.log(JSON.stringify(report, null, 2));
  // This is a case-contract gate, NOT a production quality approval.
  if (args.includes('--strict') && !report.contract_suite_passed) process.exitCode = 2;
} catch {
  console.error('BP-4 v0.2 evaluation failed. Usage: bp4-evaluate-v2.ts [--strict] [--legacy | --scoped]');
  process.exitCode = 1;
}
