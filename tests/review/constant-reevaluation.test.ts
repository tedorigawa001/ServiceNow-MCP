import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constantValidationSetSchema } from '../../src/review/evaluation-constants.js';

// CLI-boundary cases spawn real tsx scripts, which can take seconds under parallel suite load.
vi.setConfig({ testTimeout: 30_000 });

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const reports = Object.fromEntries(['v2', 'new36', 'policy24', 'unseen18'].map(name => [name, read(`../../docs/evaluation/constants-${name}.json`)]));

describe('bounded constants: frozen reevaluation and unused-case first measurement', () => {
  it('preserves every fixed fixture hash and pre-measurement validation expectations', () => {
    for (const [file, hash] of [
      ['bp4-v2-cases.json', '9edbe42d8546f898640c55f86c219ed71d1159a540aa06870090a7f327d988df'],
      ['followups-new-0.1.json', '2d19b5c746df2745d43e166e1fe985b5c5de7cf33c44baa5d614c6c309dd697c'],
      ['followups-policy-0.2.json', '3e5049ec39b1e87a194e38b3a8c5c8dded7a6cfdce7dfdd616ea93d0d9f5e760'],
      ['constant-validation-0.1.json', '9049b2e45accd37022b54fc61a37e4eb734923aaae0020e00fcad6c5ebfef341'],
    ]) expect(createHash('sha256').update(readFileSync(new URL(`./evaluation/${file}`, import.meta.url))).digest('hex')).toBe(hash);
  });
  it('uses new validation snippets and rejects malformed or unbalanced sets', () => {
    const fresh = read('./evaluation/constant-validation-0.1.json');
    expect(constantValidationSetSchema.parse(fresh).cases).toHaveLength(18);
    const used = new Set(['bp4-cases.json', 'bp4-v2-cases.json', 'followups-new-0.1.json', 'followups-policy-0.2.json']
      .flatMap(file => read(`./evaluation/${file}`).cases.map((c: { code: string }) => c.code.trim())));
    for (const c of fresh.cases) expect(used.has(c.code.trim())).toBe(false);
    expect(constantValidationSetSchema.safeParse({ ...fresh, cases: [] }).success).toBe(false);
    const changed = structuredClone(fresh); changed.cases[0].basis = 'semantic_boundary';
    expect(constantValidationSetSchema.safeParse(changed).success).toBe(false);
  });
  it.each(['v2', 'new36', 'policy24', 'unseen18'])('reproduces saved %s results and keeps strict failure separate from test success', name => {
    for (const strict of [false, true]) {
      const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate-constants.ts', '--set', name, ...(strict ? ['--strict'] : [])], { encoding: 'utf8' });
      expect(run.status).toBe(strict ? 2 : 0); expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual(reports[name]);
    }
    expect(reports[name].engine_ruleset_versions).toEqual(['bp3-0.4']);
    expect(reports[name].follow_up_catalog_version).toBe('bp-followups-0.4');
    expect(reports[name].release_quality_gate.approved).toBe(false);
    expect(reports[name].safety.invalid_outputs).toBe(0);
  });
  it('has no v0.2 case-outcome changes and exactly the declared fixed-set improvements, with zero regressions', () => {
    const beforeV2 = read('../../docs/evaluation/bp4-v2-followups.json');
    expect(reports.v2.cases).toEqual(beforeV2.cases);
    expect(reports.v2.overall).toEqual(beforeV2.overall);
    for (const [name, file, expectedIds] of [
      ['new36', 'followups-new-0.1-baseline.json', ['NEW-W09', 'NEW-W10', 'NEW-A11', 'NEW-J09', 'NEW-J10']],
      ['policy24', 'followups-policy-0.2-baseline.json', ['NEXT-W07', 'NEXT-A07', 'NEXT-J07']],
    ] as const) {
      const before = read(`../../docs/evaluation/${file}`);
      const rows = new Map<string, Record<string, unknown>>(before.cases.map((c: { case_id: string }) => [c.case_id, c]));
      const after = reports[name].cases as Array<Record<string, unknown> & { case_id: string; expectation_satisfied: boolean }>;
      expect(after.filter(c => c.expectation_satisfied && !rows.get(c.case_id)!.expectation_satisfied).map(c => c.case_id)).toEqual([...expectedIds]);
      expect(after.filter(c => !c.expectation_satisfied && rows.get(c.case_id)!.expectation_satisfied)).toEqual([]);
      for (const c of after.filter(c => !(expectedIds as readonly string[]).includes(c.case_id))) {
        const old = rows.get(c.case_id)!;
        expect(Object.fromEntries(Object.keys(old).map(key => [key, c[key]]))).toEqual(old);
      }
      expect(reports[name].dataset_hash).toBe(before.dataset_hash);
    }
  });
  it('records all fresh declared cases as satisfied without hiding out-of-scope misses', () => {
    const r = reports.unseen18;
    expect(r.cases.filter((c: { basis: string; expectation_satisfied: boolean }) => c.basis === 'catalog_contract' && c.expectation_satisfied)).toHaveLength(15);
    expect(r.cases.filter((c: { expectation_satisfied: boolean }) => !c.expectation_satisfied).map((c: { case_id: string }) => c.case_id))
      .toEqual(['CONST-W06', 'CONST-A06', 'CONST-J06']);
    expect(r.candidate_detection).toEqual({ tp: 12, fp: 0, fn: 2 });
    expect(r.intrinsic_completeness.all.required_item_on_detected).toMatchObject({ successes: 6, total: 6 });
    expect(r.intrinsic_completeness.all.end_to_end_required_item_recall).toMatchObject({ successes: 6, total: 8 });
  });
  it('sanitizes invalid CLI usage without exposing inputs', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/evaluate-constants.ts', '--set', 'secret_SENTINEL'], { encoding: 'utf8' });
    expect(run.status).toBe(1); expect(run.stdout).toBe(''); expect(run.stderr).not.toContain('secret_SENTINEL');
  });
});
