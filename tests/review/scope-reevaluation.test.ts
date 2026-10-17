import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateBestPracticeV2 } from '../../src/review/evaluation-v2.js';
import { reviewUpdateSetPayloadScoped } from '../../src/review/payload-review.js';

const bytes = readFileSync(new URL('./evaluation/bp4-v2-cases.json', import.meta.url));
const fixture = JSON.parse(bytes.toString('utf8'));
const original = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-v2-baseline.json', import.meta.url), 'utf8'));
const saved = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-v2-scoped.json', import.meta.url), 'utf8'));
const current = evaluateBestPracticeV2(fixture, reviewUpdateSetPayloadScoped);
type CaseRow = typeof current.cases[number];
const before = new Map<string, CaseRow>(original.cases.map((row: CaseRow) => [row.case_id, row]));
const after = new Map(current.cases.map(row => [row.case_id, row]));
const groups = [
  { name: 'fixed object properties and literal array indices', ids: ['P04', 'P05', 'P09', 'P11'], improved: true },
  { name: 'interprocedural argument and return flow, out of scope', ids: ['P03', 'P06', 'P10', 'P12'], improved: false },
  { name: 'dynamic member names and indirect invocation, out of scope', ids: ['P17', 'P18'], improved: false },
  { name: 'lexical scope', ids: ['C02', 'C03', 'C04', 'C08'], improved: true },
  { name: 'local receiver provenance', ids: ['C07', 'C11', 'C14', 'C16'], improved: true },
];

describe('fixed v0.2 scoped reevaluation and declared change boundaries', () => {
  it('preserves the original dataset/hash and saves the current report separately', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(original.fixture_file_sha256);
    expect(current.dataset_hash).toBe(original.dataset_hash);
    expect({ ...current, engine_ruleset_versions: ['bp3-0.2'], fixture_file_sha256: original.fixture_file_sha256 }).toEqual(saved);
    expect(current.overall).toMatchObject({ tp: 30, fp: 0, tn: 18, fn: 6, assessed: 54 });
    expect(current.followup.all_expected).toMatchObject({ successes: 6, total: 18 });
    expect(current.insufficient).toMatchObject({ successes: 18, total: 18 });
    expect(current.safety).toEqual({ invalid_outputs: 0, confirmed_findings: 0, passed: true });
    expect(current.release_quality_gate.approved).toBe(false);
  });
  it.each(groups)('reports only the declared effect for $name', group => {
    for (const id of group.ids.map(id => `V2-${id}`)) {
      expect(before.get(id)!.contract_satisfied).toBe(false);
      expect(after.get(id)!.contract_satisfied).toBe(group.improved);
      if (!group.improved) expect(after.get(id)).toEqual(before.get(id));
    }
  });
  it('has exactly twelve improved cases, no regressions and sixty unchanged case outcomes', () => {
    const improvements = current.cases.filter(row => row.contract_satisfied && !before.get(row.case_id)!.contract_satisfied);
    expect(improvements.map(row => row.case_id).sort()).toEqual(groups.filter(g => g.improved).flatMap(g => g.ids.map(id => `V2-${id}`)).sort());
    const regressions = current.cases.filter(row => !row.contract_satisfied && before.get(row.case_id)!.contract_satisfied);
    expect(regressions).toEqual([]);
    const changed = new Set(improvements.map(row => row.case_id));
    const unchanged = current.cases.filter(row => !changed.has(row.case_id));
    expect(unchanged).toHaveLength(60);
    for (const row of unchanged) expect(row).toEqual(before.get(row.case_id));
  });
});
