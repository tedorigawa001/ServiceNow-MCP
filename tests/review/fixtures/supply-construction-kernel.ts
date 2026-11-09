/** Values only. No identities, artifact adoption, allocation callbacks or runtime dependencies. */
export type SupplyConstructionStage = 'not_started' | 'attempting' | 'provisional' | 'confirmed';
export const SUPPLY_FIELDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27]);
export function supplyStageAllows(from: SupplyConstructionStage, to: SupplyConstructionStage): boolean {
  return from === 'not_started' && to === 'attempting' || from === 'attempting' && to === 'provisional'
    || from === 'provisional' && to === 'confirmed';
}
