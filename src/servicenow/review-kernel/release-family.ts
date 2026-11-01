/** Pure family values shared by contracts and catalog; not platform detection. */
export const RELEASE_FAMILIES = Object.freeze(['Australia', 'Brazil', 'Zurich', 'Yokohama', 'Xanadu'] as const);
export type ReleaseFamily = typeof RELEASE_FAMILIES[number];

export function normalizeReleaseFamily(value: string | null): ReleaseFamily | null {
  const normalized = value?.trim().toLowerCase();
  return RELEASE_FAMILIES.find(family => family.toLowerCase() === normalized) ?? null;
}

export function matchReleaseFamily(value: string | null): 'matched' | 'mismatched' | 'unknown' {
  const family = normalizeReleaseFamily(value);
  return family === 'Australia' ? 'matched' : family === null ? 'unknown' : 'mismatched';
}
