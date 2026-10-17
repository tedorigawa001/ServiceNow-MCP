import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateBestPracticeV2 } from '../src/review/evaluation-v2.js';
import { followupEvaluationSetSchema } from '../src/review/evaluation-followups.js';
import { followupPolicySetSchema, measureFollowupPolicy } from '../src/review/evaluation-followups-policy.js';
import { evaluateConstantValidation } from '../src/review/evaluation-constants.js';
import { reviewUpdateSetPayload } from '../src/review/payload-review.js';
import { FOLLOW_UP_CATALOG_VERSION } from '../src/review/follow-up-catalog.js';

try {
  const args = process.argv.slice(2), names = ['v2', 'new36', 'policy24', 'unseen18'] as const;
  if (args.length < 2 || args.length > 3 || args[0] !== '--set' || !names.includes(args[1] as typeof names[number])
    || (args.length === 3 && args[2] !== '--strict')) throw new Error('usage');
  const name = args[1], file = { v2: 'bp4-v2-cases.json', new36: 'followups-new-0.1.json',
    policy24: 'followups-policy-0.2.json', unseen18: 'constant-validation-0.1.json' }[name]!;
  const bytes = readFileSync(new URL(`../tests/review/evaluation/${file}`, import.meta.url)), data = JSON.parse(bytes.toString('utf8'));
  const versions = new Set<string>();
  const engine = (input: unknown) => {
    const out = reviewUpdateSetPayload(input); if (out.status === 'reviewed') versions.add(out.result.ruleset_version); return out;
  };
  const measured = name === 'v2' ? evaluateBestPracticeV2(data, engine)
    : name === 'unseen18' ? evaluateConstantValidation(data, engine)
      : measureFollowupPolicy(name === 'new36' ? followupEvaluationSetSchema.parse(data) : followupPolicySetSchema.parse(data), engine, FOLLOW_UP_CATALOG_VERSION);
  const report = { ...measured, measurement: name === 'unseen18' ? 'new_constant_validation' : 'fixed_set_development_reevaluation',
    follow_up_catalog_version: FOLLOW_UP_CATALOG_VERSION, engine_ruleset_versions: [...versions].sort(),
    limitations: measured.limitations.filter(l => l !== 'no_engine_tuning').concat('bounded_constant_analysis_not_general_execution'),
    fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') };
  console.log(JSON.stringify(report, null, 2));
  const passed = 'suite_passed' in measured ? measured.suite_passed : measured.contract_suite_passed;
  if (args.includes('--strict') && !passed) process.exitCode = 2;
} catch {
  console.error('Constant evaluation failed. Usage: evaluate-constants.ts --set v2|new36|policy24|unseen18 [--strict]');
  process.exitCode = 1;
}
