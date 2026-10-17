import { z } from 'zod';
import { CATALOG_VERSION, RULES, SOURCES, matchCatalogRelease } from './catalog.js';

export const searchInputSchema = z.strictObject({
  query: z.string().max(500).optional(),
  rule_id: z.string().regex(/^AU-(BR|CL|SI|REST|QRY)-\d{3}$/).optional(),
  asset_type: z.enum(['business_rule', 'client_script', 'script_include', 'scripted_rest_resource', 'server_script']),
  release: z.string().trim().min(1).max(40).nullable(),
  limit: z.number().int().min(1).max(27).default(10),
});

function literalMatch(query: string, term: string): boolean {
  const normalized = term.normalize('NFKC').toLowerCase();
  if (!/^[\x00-\x7F]+$/.test(normalized)) return query.includes(normalized);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9_])${escaped}(?![a-z0-9_])`, 'u').test(query);
}

/** Search curated candidates, not source code: no AST analysis or automatic findings. */
export function searchBestPractices(rawInput: z.input<typeof searchInputSchema>) {
  const input = searchInputSchema.parse(rawInput);
  const query = (input.query ?? '').normalize('NFKC').toLowerCase().trim();
  const releaseMatch = matchCatalogRelease(input.release);
  const hits = RULES.filter(rule => releaseMatch !== 'mismatched' && rule.asset_types.includes(input.asset_type)
    && (!input.rule_id || input.rule_id === rule.rule_id))
    .map(rule => {
      const apiMatches = rule.api_terms.filter(term => literalMatch(query, term));
      const keywordMatches = rule.keywords.filter(term => literalMatch(query, term));
      return { rule: structuredClone(rule), source: structuredClone(SOURCES[rule.source_id as keyof typeof SOURCES]),
        release_match: releaseMatch, score: (input.rule_id ? 1000 : 0) + apiMatches.length * 100 + keywordMatches.length * 10,
        matched_terms: [...apiMatches, ...keywordMatches] };
    })
    .filter(hit => !query || hit.score > 0)
    .sort((a, b) => b.score - a.score || a.rule.rule_id.localeCompare(b.rule.rule_id, 'en'));
  return { poc_only: true as const, catalog_version: CATALOG_VERSION, release_match: releaseMatch,
    total_candidates: hits.length, truncated: hits.length > input.limit,
    limitations: ['source_approval_pending', ...(releaseMatch === 'unknown' ? ['release_unknown'] : releaseMatch === 'mismatched' ? ['release_mismatch'] : []),
      ...(!hits.length ? ['no_candidate'] : [])], hits: hits.slice(0, input.limit) };
}
