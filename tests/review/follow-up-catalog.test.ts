import { describe, expect, it } from 'vitest';
import { FOLLOW_UP_CODES, FOLLOW_UP_DEFINITIONS, COMMON_FOLLOW_UP_CODES, RULE_SPECIFIC_FOLLOW_UP,
  CONTEXT_LIMITATIONS, followUpCodeSchema, isFollowUpApplicable } from '../../src/review/follow-up-catalog.js';
import { followUpCodeSchema as publicCodeSchema } from '../../src/review/result-schema.js';
import { RULES } from '../../src/review/catalog.js';
import { evaluateBestPracticeV2 } from '../../src/review/evaluation-v2.js';
import { reviewUpdateSetPayloadLegacy } from '../../src/review/payload-review.js';
import { readFileSync } from 'node:fs';

describe('shared followup vocabulary', () => {
  it('defines all six codes once with meaning, attachment context and limits', () => {
    expect(FOLLOW_UP_CODES).toHaveLength(6);
    expect(new Set(FOLLOW_UP_CODES).size).toBe(6);
    expect(Object.keys(FOLLOW_UP_DEFINITIONS).sort()).toEqual([...FOLLOW_UP_CODES].sort());
    for (const code of FOLLOW_UP_CODES) {
      expect(followUpCodeSchema.safeParse(code).success).toBe(true);
      expect(publicCodeSchema.safeParse(code).success).toBe(true);
      const d = FOLLOW_UP_DEFINITIONS[code];
      for (const text of [d.meaning, d.attach_when, d.does_not_prove]) expect(text.length).toBeGreaterThan(10);
      if (d.applicable_rules !== 'all') for (const rule of d.applicable_rules) expect(RULES.some(r => r.rule_id === rule)).toBe(true);
    }
    expect(followUpCodeSchema.safeParse('arbitrary_note').success).toBe(false);
    expect(followUpCodeSchema.safeParse('inactive_asset').success).toBe(false);
    expect(CONTEXT_LIMITATIONS.inactive_asset.attach_when).toContain('active=false');
  });
  it('keeps generic and rule-specific codes distinct', () => {
    expect(isFollowUpApplicable('source_approval', 'unknown_rule')).toBe(false);
    for (const code of COMMON_FOLLOW_UP_CODES) for (const rule of RULES) expect(isFollowUpApplicable(code, rule.rule_id)).toBe(true);
    for (const [ruleId, code] of Object.entries(RULE_SPECIFIC_FOLLOW_UP)) {
      expect(FOLLOW_UP_DEFINITIONS[code].kind).toBe('context_specific');
      for (const other of Object.keys(RULE_SPECIFIC_FOLLOW_UP)) expect(isFollowUpApplicable(code, other)).toBe(other === ruleId);
    }
  });
  it('registers current engine codes without emitting new context-specific ones or changing the frozen baseline', () => {
    const fixture = JSON.parse(readFileSync(new URL('./evaluation/bp4-v2-cases.json', import.meta.url), 'utf8'));
    const baseline = JSON.parse(readFileSync(new URL('../../docs/evaluation/bp4-v2-baseline.json', import.meta.url), 'utf8'));
    const report = evaluateBestPracticeV2(fixture, input => {
      const output = reviewUpdateSetPayloadLegacy(input);
      if (output.status === 'reviewed') for (const f of output.result.findings) for (const code of f.required_follow_up) {
        const parsed = followUpCodeSchema.parse(code);
        expect(FOLLOW_UP_DEFINITIONS[parsed].kind).toBe('generic');
        expect(isFollowUpApplicable(parsed, f.rule_id)).toBe(true);
      }
      return output;
    });
    const { fixture_file_sha256, ...expected } = baseline;
    expect(fixture_file_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report).toEqual(expected);
  });
});
