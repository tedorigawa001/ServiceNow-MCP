/** Independent construction-event oracle. No registry, view, kernel, limits or coefficients imported. */
export const canonicalFailurePoints = ['envelope', 'origin', 'registry_0', 'registry_1', 'registry_2', 'registry_3',
  'bindings_0', 'bindings_1', 'bindings_2', 'bindings_3', 'table', 'declarations_0', 'declarations_1',
  'declarations_2', 'declarations_3', 'view', 'post'] as const;
export function canonicalGenerationOracle(failure: typeof canonicalFailurePoints[number]) {
  const completed: string[] = [];
  for (const event of canonicalFailurePoints) { if (event === failure) break; completed.push(event); }
  return { preparationClaims: 1, registryRecords: completed.filter(e => e.startsWith('registry_')).length,
    bindings: completed.filter(e => e.startsWith('bindings_')).length,
    declarations: completed.filter(e => e.startsWith('declarations_')).length,
    tables: Number(completed.includes('table')), views: Number(completed.includes('view')),
    validationPasses: 0, fileChecks: 0, discardPasses: Number(completed.includes('envelope')) };
}
