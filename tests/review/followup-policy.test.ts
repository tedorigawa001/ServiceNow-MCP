import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { evaluateFollowupPolicy, followupPolicySetSchema } from '../../src/review/evaluation-followups-policy.js';
import { reviewUpdateSetPayloadContextual as reviewUpdateSetPayload } from '../../src/review/payload-review.js';

// CLI-boundary cases spawn real tsx scripts, which can take seconds under parallel suite load.
vi.setConfig({ testTimeout: 30_000 });

const bytes = readFileSync(new URL('./evaluation/followups-policy-0.2.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));
const saved = JSON.parse(readFileSync(new URL('../../docs/evaluation/followups-policy-0.2-baseline.json', import.meta.url), 'utf8'));
const hash = createHash('sha256').update(bytes).digest('hex');
type Result = Extract<ReturnType<typeof reviewUpdateSetPayload>, { status: 'reviewed' }>['result'];
const mutate = (change: (r: Result) => void) => (input: unknown) => {
  const out = reviewUpdateSetPayload(input); if (out.status === 'reviewed') change(out.result); return out;
};

describe('accepted rule-intrinsic policy and separate evaluation tracks', () => {
  it('freezes a new 24-case set and leaves previous cases unchanged', () => {
    expect(hash).toBe('3e5049ec39b1e87a194e38b3a8c5c8dded7a6cfdce7dfdd616ea93d0d9f5e760');
    expect(followupPolicySetSchema.parse(fixture).cases).toHaveLength(24);
    for (const file of ['followups-new-0.1.json', 'bp4-v2-cases.json']) {
      const oldBytes = readFileSync(new URL(`./evaluation/${file}`, import.meta.url));
      const old = JSON.parse(oldBytes.toString('utf8'));
      const snippets = new Set(old.cases.map((c: { code: string }) => c.code.trim()));
      for (const c of fixture.cases) expect(snippets.has(c.code.trim())).toBe(false);
      if (file === 'followups-new-0.1.json') expect(createHash('sha256').update(oldBytes).digest('hex'))
        .toBe('2d19b5c746df2745d43e166e1fe985b5c5de7cf33c44baa5d614c6c309dd697c');
    }
  });
  it('rejects intrinsic candidate-only expectations and unbalanced groups', () => {
    const changed = structuredClone(fixture); changed.cases[8].expected[0].followup = false;
    expect(followupPolicySetSchema.safeParse(changed).success).toBe(false);
    expect(followupPolicySetSchema.safeParse({ ...fixture, cases: [] }).success).toBe(false);
    changed.cases[8].expected[0].followup = true; changed.cases[8].variant = 'defensive';
    expect(followupPolicySetSchema.safeParse(changed).success).toBe(false);
  });
  it('records policy and measures contextual discrimination only for workflow', () => {
    const report = evaluateFollowupPolicy(fixture);
    expect({ ...report, fixture_file_sha256: hash }).toEqual(saved);
    expect(report.follow_up_catalog_version).toBe('bp-followups-0.3');
    expect(report.rule_policy).toEqual({ 'AU-BR-001': 'context_specific', 'AU-BR-002': 'rule_intrinsic', 'AU-CL-004': 'rule_intrinsic' });
    expect(report.context_discrimination.all).toMatchObject({ cases: 8, tp: 2, fp: 0, fn: 2, tn: 3 });
    expect(report.context_discrimination.declared_scope).toMatchObject({ cases: 6, tp: 2, fp: 0, fn: 0, tn: 3 });
    expect(report.intrinsic_completeness.by_variant.ordinary.required_item_on_detected).toMatchObject({ successes: 4, total: 4 });
    expect(report.intrinsic_completeness.by_variant.defensive.required_item_on_detected).toMatchObject({ successes: 4, total: 4 });
  });
  it('never treats complete attachment as exception discrimination or candidate accuracy', () => {
    const report = evaluateFollowupPolicy(fixture);
    expect(report.intrinsic_completeness.all.required_item_on_detected).toMatchObject({ successes: 9, total: 9 });
    expect(report.intrinsic_completeness.all.end_to_end_required_item_recall).toMatchObject({ successes: 8, total: 11 });
    expect(report.intrinsic_completeness.all).toMatchObject({ candidate_fp: 1, candidate_fn: 3 });
    expect(report.intrinsic_completeness.by_variant.control.required_item_on_detected.rate).toBeNull();
    expect(report.case_expectation).toMatchObject({ successes: 18, total: 24 });
    expect(report.cases.filter(c => c.basis === 'catalog_contract' && c.expectation_satisfied)).toHaveLength(18);
    expect(report.cases.filter(c => !c.expectation_satisfied).map(c => c.case_id))
      .toEqual(['NEXT-W07', 'NEXT-W08', 'NEXT-A07', 'NEXT-A08', 'NEXT-J07', 'NEXT-J08']);
    expect(report).not.toHaveProperty('overall.followup_precision');
    expect(report.suite_passed).toBe(false); expect(report.release_quality_gate.approved).toBe(false);
  });
  it('detects missing intrinsic items separately from workflow context decisions', () => {
    const report = evaluateFollowupPolicy(fixture, mutate(r => {
      for (const f of r.findings) if (f.rule_id !== 'AU-BR-001') f.required_follow_up = ['source_approval'];
    }));
    expect(report.intrinsic_completeness.all.required_item_on_detected).toMatchObject({ successes: 0, total: 9 });
    expect(report.intrinsic_completeness.all.missing_on_detected).toBe(9);
    expect(report.intrinsic_completeness.all.end_to_end_required_item_recall.successes).toBe(0);
    expect(report.context_discrimination.all).toEqual(evaluateFollowupPolicy(fixture).context_discrimination.all);
  });
  it('detects blanket context attachment without changing intrinsic completeness', () => {
    const report = evaluateFollowupPolicy(fixture, mutate(r => {
      for (const f of r.findings) if (f.rule_id === 'AU-BR-001') f.required_follow_up.push('workflow_suppression_review');
    }));
    expect(report.context_discrimination.all.fp).toBe(3);
    expect(report.intrinsic_completeness).toEqual(evaluateFollowupPolicy(fixture).intrinsic_completeness);
  });
  it('keeps gold metadata private and reports the CLI outcome separately from test success', () => {
    const before = JSON.stringify(fixture);
    const report = evaluateFollowupPolicy(fixture, input => {
      for (const key of ['expected', 'basis', 'variant', 'rationale']) expect(input).not.toHaveProperty(key);
      return reviewUpdateSetPayload(input);
    });
    expect(JSON.stringify(fixture)).toBe(before);
    for (const c of fixture.cases) expect(JSON.stringify(report)).not.toContain(JSON.stringify(c.code));
    for (const args of [[], ['--strict']]) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate-followup-policy.ts', ...args], { encoding: 'utf8' });
      expect(run.status).toBe(args.length ? 2 : 0); expect(run.stderr).toBe(''); expect(JSON.parse(run.stdout)).toEqual(saved);
    }
    const invalid = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate-followup-policy.ts', '--unknown'], { encoding: 'utf8' });
    expect(invalid.status).toBe(1); expect(invalid.stdout).toBe('');
  });
});
