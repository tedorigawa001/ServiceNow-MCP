import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateBestPracticeV2 } from '../../src/review/evaluation-v2.js';
import { reviewUpdateSetPayloadContextual as reviewUpdateSetPayload, reviewUpdateSetPayloadScoped } from '../../src/review/payload-review.js';

const bytes = readFileSync(new URL('./evaluation/bp4-v2-cases.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));
const before = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-v2-scoped.json', import.meta.url), 'utf8'));
const saved = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-v2-followups.json', import.meta.url), 'utf8'));
const current = evaluateBestPracticeV2(fixture);

describe('context followup reevaluation on unchanged v0.2', () => {
  it('matches a separately saved report and keeps the frozen data hash', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(before.fixture_file_sha256);
    expect(current.dataset_hash).toBe(before.dataset_hash);
    expect({ ...current, engine_ruleset_versions: ['bp3-0.3'], follow_up_catalog_version: 'bp-followups-0.2',
      limitations: current.limitations.map(l => l === 'no_engine_tuning' ? 'engine_updated_after_dataset_review' : l),
      fixture_file_sha256: before.fixture_file_sha256 }).toEqual(saved);
    expect(saved.limitations).not.toContain('no_engine_tuning');
  });
  it('improves exactly twelve followup contracts with zero contract regressions', () => {
    const rows = new Map<string, typeof current.cases[number]>(before.cases.map((c: typeof current.cases[number]) => [c.case_id, c]));
    const improved = current.cases.filter(c => c.contract_satisfied && !rows.get(c.case_id)!.contract_satisfied);
    expect(improved.map(c => c.case_id)).toEqual([1, 2, 3, 6, 7, 8, 9, 12, 13, 14, 15, 18].map(i => `V2-F${String(i).padStart(2, '0')}`));
    expect(current.cases.filter(c => !c.contract_satisfied && rows.get(c.case_id)!.contract_satisfied)).toEqual([]);
    expect(current.decision_contract).toMatchObject({ successes: 48, total: 54 });
    expect(current.followup.all_expected).toMatchObject({ successes: 18, total: 18 });
  });
  it('separates eight allowed classification changes from unchanged detection and residual misses', () => {
    const rows = new Map<string, typeof current.cases[number]>(before.cases.map((c: typeof current.cases[number]) => [c.case_id, c]));
    expect(current.overall).toEqual(before.overall);
    expect(current.by_rule).toEqual(before.by_rule);
    expect(current.cases.filter(c => c.category === 'problem' && c.actual !== rows.get(c.case_id)!.actual).map(c => c.case_id))
      .toEqual([7, 8, 9, 11, 13, 14, 15, 16].map(i => `V2-P${String(i).padStart(2, '0')}`));
    expect(before.exact_three_way_match.successes).toBe(36);
    expect(current.exact_three_way_match.successes).toBe(40);
    expect(current.cases.filter(c => !c.contract_satisfied).map(c => c.case_id))
      .toEqual(['V2-P03', 'V2-P06', 'V2-P10', 'V2-P12', 'V2-P17', 'V2-P18']);
    for (const c of current.cases) expect(c.finding_count).toBe(rows.get(c.case_id)!.finding_count);
    expect(current.insufficient).toEqual(before.insufficient);
    expect(current.safety).toEqual(before.safety);
    expect(current.contract_suite_passed).toBe(false);
    expect(current.release_quality_gate.approved).toBe(false);
  });
  it('does not change candidate identity, coverage, hashes, source evidence or severity to pass the scorer', () => {
    let compared = 0;
    evaluateBestPracticeV2(fixture, input => {
      const old = reviewUpdateSetPayloadScoped(input), next = reviewUpdateSetPayload(input);
      if (old.status === 'reviewed' && next.status === 'reviewed') {
        compared++;
        const shape = (r: typeof next.result) => ({ ...r, ruleset_version: 'comparison', limitations: [],
          findings: r.findings.map(f => ({ ...f, required_follow_up: [] })) });
        expect(shape(next.result)).toEqual(shape(old.result));
        for (const limitation of old.result.limitations) expect(next.result.limitations).toContain(limitation);
        for (const f of next.result.findings) expect(f.verification_status).toBe('candidate');
      } else expect(next).toEqual(old);
      return next;
    });
    expect(compared).toBeGreaterThan(54);
  });
});
