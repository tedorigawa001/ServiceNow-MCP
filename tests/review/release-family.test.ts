import {expect, it} from 'vitest';
import {RELEASE_FAMILIES, normalizeReleaseFamily, matchReleaseFamily} from '../../src/servicenow/review-kernel/release-family.js';
import {matchCatalogRelease} from '../../src/review/catalog.js';

it('recognizes only whole known family values and preserves catalog matching', () => {
  const canonical = ['Australia', 'Brazil', 'Zurich', 'Yokohama', 'Xanadu'];
  expect(RELEASE_FAMILIES).toEqual(canonical);
  expect(Object.isFrozen(RELEASE_FAMILIES)).toBe(true);
  for (const [index, family] of canonical.entries()) {
    const observed = ` \t${family.toUpperCase()}\n`;
    expect(normalizeReleaseFamily(observed)).toBe(family);
    expect(matchReleaseFamily(observed)).toBe(index === 0 ? 'matched' : 'mismatched');
    expect(matchCatalogRelease(observed)).toBe(index === 0 ? 'matched' : 'mismatched');
  }
  for (const value of [null, '', ' ', 'Australia Patch 1', 'Aus', 'Next']) {
    expect(normalizeReleaseFamily(value)).toBeNull();
    expect(matchReleaseFamily(value)).toBe('unknown');
    expect(matchCatalogRelease(value)).toBe('unknown');
  }
});
