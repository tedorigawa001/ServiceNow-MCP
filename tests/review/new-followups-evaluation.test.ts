import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { evaluateNewFollowups, followupEvaluationSetSchema } from '../../src/review/evaluation-followups.js';
import { reviewUpdateSetPayloadContextual as reviewUpdateSetPayload } from '../../src/review/payload-review.js';
import { RULE_SPECIFIC_FOLLOW_UP } from '../../src/review/follow-up-catalog.js';

const bytes = readFileSync(new URL('./evaluation/followups-new-0.1.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));
const saved = JSON.parse(readFileSync(new URL('../../docs/evaluation/followups-new-0.1-baseline.json', import.meta.url), 'utf8'));
const hash = createHash('sha256').update(bytes).digest('hex');
type Reviewed = Extract<ReturnType<typeof reviewUpdateSetPayload>, { status: 'reviewed' }>;
function mutate(change: (r: Reviewed['result']) => void) {
  return (input: unknown) => { const out = reviewUpdateSetPayload(input); if (out.status === 'reviewed') change(out.result); return out; };
}

describe('new, untuned followup evaluation', () => {
  it('freezes 36 previously unused cases before measuring, without copying v0.1/v0.2 cases', () => {
    expect(hash).toBe('2d19b5c746df2745d43e166e1fe985b5c5de7cf33c44baa5d614c6c309dd697c');
    const set = followupEvaluationSetSchema.parse(fixture);
    expect(set.cases).toHaveLength(36);
    for (const file of ['bp4-cases.json', 'bp4-v2-cases.json']) {
      const old = JSON.parse(readFileSync(new URL(`./evaluation/${file}`, import.meta.url), 'utf8'));
      const code = new Set(old.cases.map((c: { code: string }) => c.code.trim()));
      for (const c of set.cases) expect(code.has(c.code.trim())).toBe(false);
    }
    for (const patch of [{ cases: [] }, { cases: [...fixture.cases.slice(1), fixture.cases[1]] }])
      expect(followupEvaluationSetSchema.safeParse({ ...fixture, ...patch }).success).toBe(false);
    const changed = structuredClone(fixture); changed.cases[0].expected[0].line = 900;
    expect(followupEvaluationSetSchema.safeParse(changed).success).toBe(false);
  });
  it('reproduces the separately recorded initial measurement, including all misses and the false attachment', () => {
    const report = evaluateNewFollowups(fixture);
    expect({ ...report, fixture_file_sha256: hash }).toEqual(saved);
    expect(report.by_basis.catalog_contract).toMatchObject({ followup_tp: 13, followup_fp: 0, followup_fn: 0 });
    expect(report.cases.filter(c => c.basis === 'catalog_contract' && c.expectation_satisfied)).toHaveLength(24);
    expect(report.overall).toMatchObject({ detection_tp: 23, detection_fp: 1, detection_fn: 6,
      followup_tp: 14, followup_fp: 1, followup_fn: 10, missed_candidate_followups: 6, missing_attached_followups: 4 });
    expect(report.cases.filter(c => !c.expectation_satisfied).map(c => c.case_id))
      .toEqual(['NEW-W09', 'NEW-W10', 'NEW-W11', 'NEW-W12', 'NEW-A09', 'NEW-A10', 'NEW-A11', 'NEW-A12', 'NEW-J09', 'NEW-J10', 'NEW-J12']);
    expect(report.suite_passed).toBe(false); expect(report.release_quality_gate.approved).toBe(false);
  });
  it('scores individual findings, so one correct attachment cannot mask a wrong attachment on the same asset', () => {
    const report = evaluateNewFollowups(fixture, mutate(r => {
      for (const f of r.findings) if (f.rule_id === 'AU-BR-001') f.required_follow_up.push('workflow_suppression_review');
    }));
    const first = report.cases[0];
    expect(first).toMatchObject({ followup_tp: 1, followup_fp: 1, expectation_satisfied: false });
    expect(first.units.map(u => u.actual_followup)).toEqual([true, true]);
    const noContext = report.cases.find(c => c.case_id === 'NEW-W04')!;
    expect(noContext.followup_fp).toBe(1);
  });
  it('does not accept generic advice, a wrong-rule code, duplicate findings or absent limitations as successful attachment', () => {
    const generic = evaluateNewFollowups(fixture, mutate(r => { for (const f of r.findings) f.required_follow_up = ['binding_and_reachability']; }));
    expect(generic.overall.followup_tp).toBe(0); expect(generic.overall.followup_fn).toBe(24);
    const wrong = evaluateNewFollowups(fixture, mutate(r => {
      for (const f of r.findings) f.required_follow_up.push(f.rule_id === 'AU-BR-001' ? 'async_dependency_review' : 'workflow_suppression_review');
    }));
    expect(wrong.cases[0].wrong_rule_codes).toHaveLength(2);
    expect(wrong.cases[0].expectation_satisfied).toBe(false);
    const duplicates = evaluateNewFollowups(fixture, mutate(r => { r.findings.push(...structuredClone(r.findings)); }));
    expect(duplicates.overall.detection_fp).toBeGreaterThan(1);
    const noLimits = evaluateNewFollowups(fixture, mutate(r => { r.limitations = []; }));
    expect(noLimits.cases[0].missing_limitations).toContain('workflow_suppression_relation_not_verified');
    expect(noLimits.cases[0].expectation_satisfied).toBe(false);
  });
  it('distinguishes candidate misses, attached-code misses and refusals, without treating missing negatives as TN', () => {
    const empty = evaluateNewFollowups(fixture, mutate(r => { r.findings = []; }));
    expect(empty.overall).toMatchObject({ detection_fn: 29, followup_fn: 24, missed_candidate_followups: 24,
      missing_attached_followups: 0, followup_tn: 0, negative_unassessed: 5 });
    const rejected = evaluateNewFollowups(fixture, () => ({ poc_only: true, status: 'rejected', reason: 'analysis_limit' }));
    expect(rejected.safety.review_rejections).toBe(36); expect(rejected.safety.invalid_outputs).toBe(0);
    expect(rejected.case_expectation.successes).toBe(0);
    expect(rejected.cases.every(c => c.rejection_reason === 'analysis_limit')).toBe(true);
  });
  it('validates provenance and output vocabulary, and sanitizes exceptions or unknown refusal reasons', () => {
    for (const adapter of [
      mutate(r => { r.target.code_hash = 'f'.repeat(64); }),
      mutate(r => { r.target.asset_sys_id = 'e'.repeat(32); }),
      mutate(r => { for (const f of r.findings) f.required_follow_up.push('sensitive_SENTINEL'); }),
      () => { throw new Error('sensitive_SENTINEL'); },
      () => ({ status: 'rejected', poc_only: true, reason: 'sensitive_SENTINEL' }),
    ]) {
      const report = evaluateNewFollowups(fixture, adapter);
      expect(report.safety.invalid_outputs).toBeGreaterThan(0);
      expect(report.suite_passed).toBe(false);
      expect(JSON.stringify(report)).not.toContain('sensitive_SENTINEL');
    }
  });
  it('never passes gold metadata into the detector or returns code in the report', () => {
    const before = JSON.stringify(fixture);
    const report = evaluateNewFollowups(fixture, input => {
      for (const key of ['expected', 'limitations', 'basis', 'scenario', 'rationale']) expect(input).not.toHaveProperty(key);
      return reviewUpdateSetPayload(input);
    });
    expect(JSON.stringify(fixture)).toBe(before);
    for (const c of fixture.cases) expect(JSON.stringify(report)).not.toContain(JSON.stringify(c.code));
    expect(JSON.stringify(report)).not.toContain('"payload":');
    // This frozen evaluation covers the original three rules, not additive catalog extensions.
    expect(['AU-BR-001', 'AU-BR-002', 'AU-CL-004'].map(rule =>
      RULE_SPECIFIC_FOLLOW_UP[rule as keyof typeof RULE_SPECIFIC_FOLLOW_UP])).toEqual([
      'workflow_suppression_review', 'async_dependency_review', 'synchronous_ajax_review',
    ]);
  });
  it('counts unverified status promotion as unsafe and never grants quality approval', () => {
    const report = evaluateNewFollowups(fixture, mutate(r => {
      for (const f of r.findings) {
        f.verification_status = 'evidence_matched';
        f.verification_evidence = [{ stage: 'evidence_matched', method: 'static_analysis', code_hash: r.target.code_hash,
          reference: 'synthetic-oracle-only', verified_at: r.reviewed_at }];
      }
    }));
    expect(report.safety.confirmed_findings).toBeGreaterThan(0);
    expect(report.safety.passed).toBe(false);
    expect(report.release_quality_gate.approved).toBe(false);
    expect(report.suite_passed).toBe(false);
  });
  it('supports report generation, strict failure and sanitized CLI usage errors', () => {
    for (const args of [[], ['--strict']]) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate-new-followups.ts', ...args], { encoding: 'utf8' });
      expect(run.status).toBe(args.length ? 2 : 0); expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual(saved);
    }
    const bad = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate-new-followups.ts', '--unexpected'], { encoding: 'utf8' });
    expect(bad.status).toBe(1); expect(bad.stdout).toBe('');
  });
});
