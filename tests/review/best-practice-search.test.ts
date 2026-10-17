import { describe, expect, it } from 'vitest';
import { searchBestPractices } from '../../src/review/search.js';
import { readFileSync } from 'node:fs';
import { RULES, SOURCES } from '../../src/review/catalog.js';

describe('local best-practice lookup', () => {
  it.each([
    ['再帰', 'business_rule', 'AU-BR-001'],
    ['previous', 'business_rule', 'AU-BR-002'],
    ['非同期 順序', 'business_rule', 'AU-BR-003'],
    ['g_scratchpad', 'client_script', 'AU-CL-003'],
    ['getXMLWait', 'client_script', 'AU-CL-004'],
    ['g_form.setValue', 'client_script', 'AU-CL-005'],
    ['DOM', 'client_script', 'AU-CL-007'],
    ['isPublic', 'script_include', 'AU-SI-002'],
    ['GlideRecordSecure', 'scripted_rest_resource', 'AU-REST-004'],
    ['breaking version', 'scripted_rest_resource', 'AU-REST-002'],
    ['CONTAINS', 'server_script', 'AU-QRY-001'],
    ['123TEXTQUERY321', 'server_script', 'AU-QRY-002'],
  ])('retrieves the curated baseline for %s', (query, assetType, expected) => {
    const result = searchBestPractices({ query, asset_type: assetType as Parameters<typeof searchBestPractices>[0]['asset_type'], release: 'Australia' });
    expect(result.hits[0].rule.rule_id).toBe(expected);
    expect(result.limitations).toContain('source_approval_pending');
  });
  it('bounds requests, rejects unknown arguments, reports truncation and returns isolated results', () => {
    for (const extra of [{ limit: 0 }, { limit: 28 }, { query: 'x'.repeat(501) }, { unexpected: true }]) {
      expect(() => searchBestPractices({ asset_type: 'business_rule', release: 'Australia', ...extra })).toThrow();
    }
    const result = searchBestPractices({ asset_type: 'business_rule', release: 'Australia', limit: 1 });
    expect(result.truncated).toBe(true);
    result.hits[0].rule.title = 'tampered';
    expect(searchBestPractices({ asset_type: 'business_rule', release: 'Australia', limit: 1 }).hits[0].rule.title).not.toBe('tampered');
    expect(searchBestPractices({ asset_type: 'business_rule', release: 'Australia', query: 'totallyunknown' }).limitations).toContain('no_candidate');
  });
  it('looks up a fixed rule and ranks exact API names without matching suffixes', () => {
    const byId = searchBestPractices({ rule_id: 'AU-SI-002', asset_type: 'script_include', release: 'Australia', limit: 1 });
    expect(byId.hits.map(hit => hit.rule.rule_id)).toEqual(['AU-SI-002']);
    expect(searchBestPractices({ query: 'current.updateMultiple()', asset_type: 'business_rule', release: 'Australia' }).hits).toEqual([]);
    expect(searchBestPractices({ query: '参照 displayValue', asset_type: 'client_script', release: 'Australia' }).hits[0].rule.rule_id).toBe('AU-CL-005');
    expect(searchBestPractices({ query: 'current.update()', asset_type: 'script_include', release: 'Australia' }).hits).toEqual([]);
  });
  it('never labels unknown or different releases as Australia matches', () => {
    expect(searchBestPractices({ query: 'current.update()', asset_type: 'business_rule', release: 'not-a-family' }).release_match).toBe('unknown');
    expect(searchBestPractices({ query: 'current.update()', asset_type: 'business_rule', release: 'Zurich' }).hits).toEqual([]);
    const unknown = searchBestPractices({ query: 'current.update()', asset_type: 'business_rule', release: null });
    expect(unknown.release_match).toBe('unknown');
    expect(unknown.hits[0].release_match).toBe('unknown');
    expect(unknown.limitations).toContain('release_unknown');
  });
  it('retrieves the Australia recursion rule with its exact official source section', () => {
    const result = searchBestPractices({ query: 'current.update()', asset_type: 'business_rule', release: 'Australia' });
    expect(result.hits[0].rule.rule_id).toBe('AU-BR-001');
    expect(result.hits[0].source.url).toContain('/r/australia/');
    expect(result.hits[0].rule.section).toContain('Prevent recursive business rules');
    expect(result.poc_only).toBe(true);
  });
  it('keeps all 27 registered rules, sections and applicability/exception text linked to their source', () => {
    const register = readFileSync(new URL('../../docs/BEST_PRACTICE_REGISTER_AUSTRALIA.md', import.meta.url), 'utf8');
    const rows = register.split('\n').filter(row => /^\| AU-(BR|CL|SI|REST|QRY)-\d{3} \|/.test(row));
    expect(RULES).toHaveLength(27);
    expect(new Set(RULES.map(rule => rule.rule_id)).size).toBe(27);
    for (const row of rows) {
      const [, id, title, reference, context] = row.split('|').map(value => value.trim());
      const rule = RULES.find(value => value.rule_id === id)!;
      expect(rule.title).toBe(title);
      expect(reference).toBe(`${rule.source_id} / ${rule.section}`);
      expect(rule.applicability).toBe(context);
      expect(SOURCES[rule.source_id as keyof typeof SOURCES].url).toContain('/r/australia/');
    }
  });
});
