import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { reviewResultV2JsonSchema, reviewResultV2Schema } from '../../src/review/result-schema-v2.js';
import { aggregateReviewJsonSchema, aggregateReviewSchema } from '../../src/review/aggregate-schema.js';
import { reviewResultSchema } from '../../src/review/result-schema.js';

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
describe('BP-5 portable artifacts and legacy compatibility', () => {
  it('keeps generated structural JSON Schemas synchronized and all object shapes closed', () => {
    for (const [path, schema] of [
      ['schemas/best-practice-review-result-v2.schema.json', reviewResultV2JsonSchema],
      ['schemas/best-practice-mcp-review-result.schema.json', aggregateReviewJsonSchema],
    ] as const) {
      expect(json(path)).toEqual(schema);
      const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return;
        const node = value as Record<string, unknown>;
        if (node.type === 'object') expect(node.additionalProperties).toBe(false);
        Object.values(node).forEach(visit);
      };
      visit(schema);
    }
  });
  it('validates synthetic examples and preserves separate version boundaries', () => {
    const old = json('examples/bp2-review-result.json');
    const single = json('examples/bp5-review-result.json');
    const run = json('examples/bp5-aggregate-result.json');
    expect(reviewResultSchema.safeParse(old).success).toBe(true);
    expect(reviewResultV2Schema.safeParse(single).success).toBe(true);
    expect(aggregateReviewSchema.safeParse(run).success).toBe(true);
    expect(reviewResultSchema.safeParse(single).success).toBe(false);
    expect(reviewResultV2Schema.safeParse(old).success).toBe(false);
    run.assets[0].result = old;
    expect(aggregateReviewSchema.safeParse(run).success).toBe(false);
  });
});
