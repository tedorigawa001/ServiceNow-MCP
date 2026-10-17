import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { evaluateBestPracticeV2, evaluationV2SetSchema, wilsonSummary } from '../../src/review/evaluation-v2.js';
import { reviewUpdateSetPayload, reviewUpdateSetPayloadLegacy } from '../../src/review/payload-review.js';
import type { ReviewResult } from '../../src/review/result-schema.js';

const bytes = readFileSync(new URL('./evaluation/bp4-v2-cases.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));
const parsed = evaluationV2SetSchema.parse(fixture);
const baseline = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-v2-baseline.json', import.meta.url), 'utf8'));
const scopedReport = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-v2-scoped.json', import.meta.url), 'utf8'));
const specific = { 'AU-BR-001': 'workflow_suppression_review', 'AU-BR-002': 'async_dependency_review', 'AU-CL-004': 'synchronous_ajax_review' };
type Output = ReturnType<typeof reviewUpdateSetPayload>;

/** Test-only oracle of already-parsed synthetic output, never used by actual measurement/CLI. */
function oracle(mutate?: (result: ReviewResult, index: number) => void) {
  let index = 0;
  const templates = new Map<string, ReviewResult['findings'][number]>();
  return (input: unknown): Output => {
    const current = index++, c = parsed.cases[current];
    const output = reviewUpdateSetPayload(input);
    if (output.status !== 'reviewed' || c.expectation.mode === 'abstain') return output;
    if (output.result.findings.length && !templates.has(c.rule_id)) templates.set(c.rule_id, structuredClone(output.result.findings[0]));
    output.result.findings = c.expectation.outcome === 'clear' ? [] : [structuredClone(templates.get(c.rule_id)!)];
    if (c.expectation.outcome === 'candidate_with_followup') {
      for (const finding of output.result.findings) finding.required_follow_up.push(...c.expectation.required_follow_up);
      for (const limit of c.expectation.required_limitations) if (!output.result.limitations.includes(limit)) output.result.limitations.push(limit);
    }
    mutate?.(output.result, current);
    return output;
  };
}

describe('BP-4 v0.2 evaluation contract', () => {
  it('freezes 72 unique, balanced cases and does not copy old snippets or IDs', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('9edbe42d8546f898640c55f86c219ed71d1159a540aa06870090a7f327d988df');
    expect(parsed.cases).toHaveLength(72);
    const old = JSON.parse(readFileSync(new URL('./evaluation/bp4-cases.json', import.meta.url), 'utf8'));
    const oldCode = new Set(old.cases.map((c: { code: string }) => c.code.trim()));
    expect(new Set(parsed.cases.map(c => c.id)).size).toBe(72);
    for (const c of parsed.cases) expect(oldCode.has(c.code.trim())).toBe(false);
  });
  it('rejects empty/duplicate/unbalanced cases and category mismatches', () => {
    expect(evaluationV2SetSchema.safeParse({ ...fixture, cases: [] }).success).toBe(false);
    expect(evaluationV2SetSchema.safeParse({ ...fixture, cases: [...fixture.cases.slice(1), fixture.cases[1]] }).success).toBe(false);
    for (const property of [{ rule_id: 'AU-BR-002' }, { category: 'exception' }, { expectation: { mode: 'decision', outcome: 'clear' } }]) {
      const changed = structuredClone(fixture); Object.assign(changed.cases[0], property);
      expect(evaluationV2SetSchema.safeParse(changed).success).toBe(false);
    }
  });
  it('requires specific followup context, rejects wrong-rule requirements and unknown keys', () => {
    for (const expectation of [
      { mode: 'decision', outcome: 'candidate_with_followup' },
      { mode: 'decision', outcome: 'candidate_with_followup', required_follow_up: ['binding_and_reachability'] },
      { mode: 'decision', outcome: 'candidate_with_followup', required_follow_up: ['async_dependency_review'] },
      { mode: 'decision', outcome: 'candidate_with_followup', required_follow_up: ['workflow_suppression_review'], approved: true },
    ]) {
      const changed = structuredClone(fixture); changed.cases[36].expectation = expectation;
      expect(evaluationV2SetSchema.safeParse(changed).success).toBe(false);
    }
  });
  it('reproduces the frozen baseline, including missing followup despite a detected candidate', () => {
    const report = evaluateBestPracticeV2(fixture, reviewUpdateSetPayloadLegacy);
    expect({ ...report, fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') }).toEqual(baseline);
    expect(report.overall).toMatchObject({ tp: 26, fp: 8, tn: 10, fn: 10 });
    expect(report.followup.all_expected).toMatchObject({ successes: 6, total: 18 });
    expect(report.cases.find(c => c.case_id === 'V2-F06')).toMatchObject({ actual: 'candidate_with_followup', contract_satisfied: false,
      missing_follow_up: ['workflow_suppression_review'] });
    expect(report.cases.find(c => c.case_id === 'V2-F04')).toMatchObject({ actual: 'candidate_with_followup', contract_satisfied: true });
    expect(report.insufficient).toMatchObject({ successes: 18, total: 18 });
    expect(report.release_quality_gate).toMatchObject({ status: 'not_assessed', approved: false });
  });
  it('can satisfy every case contract without granting release approval', () => {
    const report = evaluateBestPracticeV2(fixture, oracle());
    expect(report.overall).toMatchObject({ tp: 36, fp: 0, tn: 18, fn: 0 });
    expect(report.followup.all_expected).toMatchObject({ successes: 18, total: 18, rate: 1 });
    expect(report.decision_contract).toMatchObject({ successes: 54, total: 54 });
    expect(report.exact_three_way_match).toMatchObject({ successes: 54, total: 54 });
    expect(report.contract_suite_passed).toBe(true);
    expect(report.release_quality_gate.approved).toBe(false);
  });
  it('classifies actual outputs independently of gold and accepts extra followup for a basic candidate', () => {
    const report = evaluateBestPracticeV2(fixture, oracle((result, i) => {
      if (i < 18) for (const f of result.findings) f.required_follow_up.push(specific[parsed.cases[i].rule_id]);
    }));
    expect(report.cases[0]).toMatchObject({ expected: 'candidate', actual: 'candidate_with_followup', contract_satisfied: true });
    expect(report.decision_contract.successes).toBe(54);
    expect(report.exact_three_way_match.successes).toBe(36);
    expect(report.contract_suite_passed).toBe(true);
  });
  it('does not accept generic notices as specific followup or let one finding mask another', () => {
    const generic = evaluateBestPracticeV2(fixture, oracle((result, i) => {
      if (i === 36) for (const f of result.findings) f.required_follow_up = ['exceptions_and_business_intent', 'source_approval'];
    }));
    expect(generic.cases[36]).toMatchObject({ actual: 'candidate', contract_satisfied: false, missing_follow_up: ['workflow_suppression_review'] });
    const partial = evaluateBestPracticeV2(fixture, oracle((result, i) => {
      if (i === 36) result.findings.push({ ...structuredClone(result.findings[0]), required_follow_up: [] });
    }));
    expect(partial.cases[36].contract_satisfied).toBe(false);
  });
  it('requires inactive_asset when declared, not just a rule-specific followup', () => {
    const report = evaluateBestPracticeV2(fixture, oracle((result, i) => {
      if (i === 39) {
        result.limitations = result.limitations.filter(l => l !== 'inactive_asset');
        result.findings[0].required_follow_up.push('workflow_suppression_review');
      }
    }));
    expect(report.cases[39]).toMatchObject({ actual: 'candidate_with_followup', contract_satisfied: false, missing_limitations: ['inactive_asset'] });
  });
  it('retains missed positives and negative abstentions, with null for empty denominators', () => {
    const report = evaluateBestPracticeV2(fixture, () => ({ poc_only: true, status: 'rejected', reason: 'javascript_parse_failed' }));
    expect(report.overall).toMatchObject({ tp: 0, fp: 0, tn: 0, fn: 36, negative_abstentions: 18, assessed: 0 });
    expect(report.overall.precision).toEqual({ successes: 0, total: 0, rate: null, wilson_95: null });
    expect(report.followup.all_expected).toMatchObject({ successes: 0, total: 18 });
    expect(report.followup.detected_only.total).toBe(0);
    expect(report.insufficient.successes).toBe(3);
    expect(report.safety.passed).toBe(false);
  });
  it('fails closed on foreign provenance, invalid source/output, thrown errors and unsafe confirmation', () => {
    const mutations = [
      (r: ReviewResult) => { r.target.code_hash = 'f'.repeat(64); },
      (r: ReviewResult) => { r.target.asset_sys_id = 'e'.repeat(32); },
      (r: ReviewResult) => { r.findings[0].sources[0].url = 'https://invalid.example/source'; },
      (r: ReviewResult) => { r.findings[0].line_end = 9999; },
    ];
    for (const mutate of mutations) {
      const report = evaluateBestPracticeV2(fixture, oracle((r, i) => { if (i === 0) mutate(r); }));
      expect(report.cases[0]).toMatchObject({ actual: 'abstain', contract_satisfied: false, reasons: ['invalid_output'] });
      expect(report.safety.invalid_outputs).toBe(1);
      expect(report.contract_suite_passed).toBe(false);
    }
    const confirmed = evaluateBestPracticeV2(fixture, oracle((r, i) => {
      if (i === 0) { const f = r.findings[0]; f.verification_status = 'evidence_matched';
        f.verification_evidence = [{ stage: 'evidence_matched', method: 'static_analysis', code_hash: r.target.code_hash,
          reference: 'synthetic-test-only', verified_at: r.reviewed_at }]; }
    }));
    expect(confirmed.safety.confirmed_findings).toBe(1);
    expect(confirmed.cases[0].contract_satisfied).toBe(false);
    expect(confirmed.safety.passed).toBe(false);
    for (const adapter of [() => { throw new Error('secret_SENTINEL'); },
      () => ({ poc_only: true, status: 'rejected', reason: 'secret_payload' }),
      () => ({ poc_only: true, status: 'rejected', reason: 'missing_context' })]) {
      const report = evaluateBestPracticeV2(fixture, adapter);
      expect(report.safety.invalid_outputs).toBe(72);
      expect(JSON.stringify(report)).not.toContain('secret');
    }
  });
  it('computes descriptive Wilson intervals and validates count bounds', () => {
    expect(wilsonSummary(0, 0).wilson_95).toBeNull();
    expect(wilsonSummary(6, 12).wilson_95?.lower).toBeCloseTo(0.2537815976);
    expect(wilsonSummary(6, 18).wilson_95?.upper).toBeCloseTo(0.5625053270);
    expect(wilsonSummary(0, 8).wilson_95?.lower).toBeCloseTo(0);
    expect(wilsonSummary(8, 8).wilson_95?.upper).toBe(1);
    expect(() => wilsonSummary(9, 8)).toThrow();
    expect(() => wilsonSummary(0.5, 8)).toThrow();
  });
  it('does not mutate cases, expose code or send expectation metadata into the engine', () => {
    const before = JSON.stringify(fixture);
    const report = evaluateBestPracticeV2(fixture, input => {
      expect(input).not.toHaveProperty('expectation'); expect(input).not.toHaveProperty('rationale'); expect(input).not.toHaveProperty('category');
      return reviewUpdateSetPayload(input);
    });
    expect(JSON.stringify(fixture)).toBe(before);
    expect(JSON.stringify(report)).not.toContain('"code":'); expect(JSON.stringify(report)).not.toContain('"payload":');
    for (const c of parsed.cases) expect(JSON.stringify(report)).not.toContain(JSON.stringify(c.code));
  });
  it('keeps report generation, strict case-contract failure and CLI errors separate', () => {
    for (const args of [[], ['--strict']]) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bp4-evaluate-v2.ts', ...args], { encoding: 'utf8' });
      expect(run.status).toBe(args.length ? 2 : 0); expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual(scopedReport);
    }
    for (const args of [['--legacy'], ['--legacy', '--strict']]) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bp4-evaluate-v2.ts', ...args], { encoding: 'utf8' });
      expect(run.status).toBe(args.includes('--strict') ? 2 : 0);
      expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual(baseline);
    }
    const invalid = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bp4-evaluate-v2.ts', '--unknown'], { encoding: 'utf8' });
    expect(invalid.status).toBe(1); expect(invalid.stdout).toBe('');
  });
});
