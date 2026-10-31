/** Pure, fresh construction diagnostics. No session registry, live binding or I/O authority. */
export type ConstructionPublicCode = 'invalid_input' | 'authentication_failed' | 'access_denied' | 'not_found_or_not_visible'
  | 'upstream_unavailable' | 'deadline_exceeded' | 'receive_budget_exceeded' | 'request_budget_exceeded'
  | 'payload_budget_exceeded' | 'payload_limit' | 'invalid_response' | 'review_busy' | 'cancelled' | 'closed'
  | 'changed_during_review' | 'release_not_admitted' | 'config_invalid' | 'phase_deadline_exceeded'
  | 'candidate_filter_violation' | 'internal_review_error';
export type ConstructionStage = 'input' | 'clock' | 'config' | 'authentication' | 'admission' | 'core' | 'owner'
  | 'controllers' | 'timer' | 'listener' | 'commit' | 'source_binding' | 'stop' | 'close';
const resourceNames = ['snapshot', 'core', 'registered_owner', 'admission', 'controller', 'phase_controller',
  'deadline_timer', 'phase_timer', 'abort_listener', 'source_transport'] as const;
export type ConstructionResource = typeof resourceNames[number];
type InternalCode = ConstructionPublicCode | 'invalid_state' | 'invalid_observation_time' | 'evidence_binding_mismatch';
const codes = new Set<InternalCode>(['invalid_input', 'authentication_failed', 'access_denied', 'not_found_or_not_visible',
  'upstream_unavailable', 'deadline_exceeded', 'receive_budget_exceeded', 'request_budget_exceeded', 'payload_budget_exceeded',
  'payload_limit', 'invalid_response', 'review_busy', 'cancelled', 'closed', 'changed_during_review', 'release_not_admitted',
  'config_invalid', 'phase_deadline_exceeded', 'candidate_filter_violation', 'internal_review_error', 'invalid_state',
  'invalid_observation_time', 'evidence_binding_mismatch']);
export const normalizeConstructionReason = (value: unknown): InternalCode =>
  typeof value === 'string' && codes.has(value as InternalCode) ? value as InternalCode : 'internal_review_error';
const publicCode = (code: InternalCode): ConstructionPublicCode =>
  code === 'invalid_state' || code === 'invalid_observation_time' || code === 'evidence_binding_mismatch' ? 'internal_review_error' : code;

/** Zero-argument allocation: each caller receives only its own diagnostic writer. */
export function createConstructionState() {
  type Slot = { state: 'absent' | 'pending' | 'held' | 'released' | 'unconfirmed'; release_claim: 0 | 1; releases: 0 | 1 };
  const resources = Object.fromEntries(resourceNames.map(k => [k, { state: 'absent', release_claim: 0, releases: 0 }])) as Record<ConstructionResource, Slot>;
  let state: 'pending' | 'ready' | 'failed' | 'closed' = 'pending', sealed = false, coreBound = false, sourceBound = false;
  let primary: Readonly<{ stage: ConstructionStage; code: InternalCode; public_code: ConstructionPublicCode }> | null = null;
  function fail(stage: ConstructionStage, reason: unknown) {
    if (sealed) return;
    const code = normalizeConstructionReason(reason);
    primary ??= Object.freeze({ stage, code, public_code: publicCode(code) });
    state = 'failed';
  }
  function copy() {
    return Object.freeze({ scope: 'construction_only' as const, state, sealed, primary, core_bound: coreBound, source_bound: sourceBound,
      purposes: Object.freeze({ authentication: false, parent: false, release: false }),
      resources: Object.freeze(Object.fromEntries(resourceNames.map(k => [k, Object.freeze({ ...resources[k] })])) as Record<ConstructionResource, Readonly<Slot>>),
      teardown: state !== 'closed' ? 'not_started' as const : resourceNames.some(k => !['absent', 'released'].includes(resources[k].state)) ? 'unconfirmed' as const : 'confirmed' as const });
  }
  return Object.freeze({
    attempt(k: ConstructionResource) { if (!sealed && resources[k].state === 'absent') resources[k].state = 'pending'; },
    held(k: ConstructionResource) { if (!sealed && resources[k].state === 'pending') resources[k].state = 'held'; },
    release(k: ConstructionResource, confirmed: boolean, attempted: boolean) {
      const r = resources[k]; if (sealed || r.state === 'absent' || r.release_claim) return;
      r.release_claim = 1; r.releases = attempted ? 1 : 0; r.state = confirmed ? 'released' : 'unconfirmed';
    },
    needed(k: ConstructionResource) { return !['absent', 'released'].includes(resources[k].state); },
    // These are historical diagnostic labels, never identity checks or transferable evidence.
    recordBinding(kind: 'core' | 'source') { if (!sealed && !primary) { if (kind === 'core') coreBound = true; else sourceBound = true; } },
    commit() { if (primary || !coreBound || sealed) { fail('commit', 'invalid_state'); return false; } state = 'ready'; return true; },
    fail, failure: () => primary, isSealed: () => sealed,
    seal() { if (sealed) return; for (const k of resourceNames) if (['held', 'pending'].includes(resources[k].state)) resources[k].state = 'unconfirmed'; state = 'closed'; sealed = true; },
    copy,
  });
}
export type ConstructionDiagnostic = ReturnType<ReturnType<typeof createConstructionState>['copy']>;
