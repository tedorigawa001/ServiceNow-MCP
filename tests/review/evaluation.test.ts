import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { evaluationSetSchema, evaluateBestPracticeCases } from '../../src/review/evaluation.js';
import { reviewUpdateSetPayload } from '../../src/review/payload-review.js';

// CLI-boundary cases spawn real tsx scripts, which can take seconds under parallel suite load.
vi.setConfig({ testTimeout: 30_000 });

const bytes = readFileSync(new URL('./evaluation/bp4-cases.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));
const baseline = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-baseline.json', import.meta.url), 'utf8'));

describe('BP-4 fixed synthetic evaluation set and scoring', () => {
  it('locks the pre-run dataset with 48 unique cases and four cases per label/rule cell', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('ca0aee13e9ccb66a353d14493e7074c41976f67ef8b9222679f81a0cf00451ad');
    expect(evaluationSetSchema.safeParse(fixture).success).toBe(true);
    expect(new Set(fixture.cases.map((c: { id: string }) => c.id)).size).toBe(48);
    expect(evaluationSetSchema.safeParse({ ...fixture, cases: [] }).success).toBe(false);
    expect(evaluationSetSchema.safeParse({ ...fixture, cases: [...fixture.cases.slice(1), fixture.cases[1]] }).success).toBe(false);
  });
  it('rejects missing gold reasons, unknown labels and unbalanced strata', () => {
    const changed = structuredClone(fixture);
    delete changed.cases[36].expected_reason;
    expect(evaluationSetSchema.safeParse(changed).success).toBe(false);
    changed.cases[0].label = 'safe';
    expect(evaluationSetSchema.safeParse(changed).success).toBe(false);
    const unbalanced = structuredClone(fixture);
    unbalanced.cases[0].rule_id = 'AU-BR-002';
    expect(evaluationSetSchema.safeParse(unbalanced).success).toBe(false);
  });
  it('reproduces the saved baseline exactly without changing the engine or gold labels', () => {
    const report = evaluateBestPracticeCases(fixture);
    expect({ ...report, fixture_file_sha256: createHash('sha256').update(bytes).digest('hex') }).toEqual(baseline);
    expect(report.quality_gate_passed).toBe(false); // A passing test is NOT a quality approval.
    expect(report.overall).toMatchObject({ tp: 6, fp: 12, tn: 12, fn: 6, precision: 0.333333, recall: 0.5 });
    expect(report.insufficient).toEqual({ total: 12, correct: 12, accuracy: 1 });
    expect(report.confirmed_findings).toBe(0);
  });
  it('counts case/rule presence, separates exceptions and preserves all insufficient cases', () => {
    const report = evaluateBestPracticeCases(fixture);
    expect(report.cases).toHaveLength(48);
    expect(report.overall.total).toBe(36);
    expect(report.by_label.no_problem).toMatchObject({ fp: 4, tn: 8 });
    expect(report.by_label.exception).toMatchObject({ fp: 8, tn: 4 });
    expect(report.cases.filter(c => c.classification === 'fn').map(c => c.case_id)).toEqual(['P03', 'P04', 'P07', 'P08', 'P11', 'P12']);
  });
  it('does not score missing assessments as true negatives or divide zero into a perfect score', () => {
    const report = evaluateBestPracticeCases(fixture, () => ({ poc_only: true, status: 'rejected', reason: 'missing_context' }));
    expect(report.overall).toEqual({ tp: 0, fp: 0, tn: 0, fn: 12, negative_abstentions: 24,
      assessed: 0, total: 36, precision: null, recall: 0, assessment_coverage: 0 });
    expect(report.insufficient.correct).toBe(2);
    expect(report.quality_gate_passed).toBe(false);
  });
  it('detects unsupported confirmation stages rather than treating them as a better score', () => {
    const report = evaluateBestPracticeCases(fixture, input => {
      const output = reviewUpdateSetPayload(input);
      if (output.status === 'reviewed') for (const finding of output.result.findings) finding.verification_status = 'evidence_matched';
      return output;
    });
    expect(report.confirmed_findings).toBeGreaterThan(0);
    expect(report.quality_gate_passed).toBe(false);
  });
  it('allows a perfect synthetic oracle to pass, so the scoring gate is not permanently false', () => {
    // This adapter tests arithmetic only; it is NOT the detector and is never used by the CLI.
    let index = 0;
    const templates = new Map<string, ReturnType<typeof reviewUpdateSetPayload>>();
    const report = evaluateBestPracticeCases(fixture, input => {
      const gold = fixture.cases[index++];
      const output = reviewUpdateSetPayload(input);
      if (output.status !== 'reviewed' || gold.label === 'insufficient') return output;
      if (output.result.findings.length && !templates.has(gold.rule_id)) templates.set(gold.rule_id, structuredClone(output));
      output.result.findings = [];
      if (gold.label === 'problem') {
        const template = templates.get(gold.rule_id)!;
        if (template.status !== 'reviewed') throw new Error('Missing oracle template');
        output.result.findings = [structuredClone(template.result.findings[0])];
      }
      return output;
    });
    expect(report.overall).toMatchObject({ tp: 12, fp: 0, tn: 24, fn: 0, precision: 1, recall: 1 });
    expect(report.quality_gate_passed).toBe(true);
  });
  it('does not mutate the dataset or disclose synthetic code in reports', () => {
    const before = JSON.stringify(fixture);
    const report = JSON.stringify(evaluateBestPracticeCases(fixture));
    expect(JSON.stringify(fixture)).toBe(before);
    for (const c of fixture.cases) expect(report).not.toContain(JSON.stringify(c.code));
    expect(report).not.toContain('"code":');
    expect(report).not.toContain('"payload":');
  });
  it('distinguishes report completion from a failed strict quality gate at the CLI boundary', () => {
    for (const args of [[], ['--strict']]) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bp4-evaluate.ts', ...args], { encoding: 'utf8' });
      expect(run.status).toBe(args.length ? 2 : 0);
      expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual(baseline);
    }
    const invalid = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/bp4-evaluate.ts', '--unknown'], { encoding: 'utf8' });
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe('');
  });
});
