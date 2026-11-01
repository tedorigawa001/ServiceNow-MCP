import type {ReleaseComparisonDraft, ReleaseComparisonInput} from '../../../src/servicenow/review-kernel/release-comparison.js';

// Compile-only negative assertions. No authority-bearing factory is introduced.
export function checkReadonlyContract(input: ReleaseComparisonInput, draft: ReleaseComparisonDraft): void {
  // @ts-expect-error immutable timing
  input.timing.deadline_ms = 1;
  // @ts-expect-error immutable policy
  input.policy.instanceBinding = 'changed';
  // @ts-expect-error draft never carries a Permit
  void draft.permit;
  // @ts-expect-error no issuing permission even for a matched decision
  const issuance: ReleaseComparisonDraft['permissions']['formal_issuance'] = true;
  // @ts-expect-error no Permit authority
  const permit: ReleaseComparisonDraft['permissions']['release_permit'] = true;
  // @ts-expect-error no dispatch authority
  const dispatch: ReleaseComparisonDraft['permissions']['dispatch'] = true;
  // @ts-expect-error no fallback activation
  const fallback: ReleaseComparisonDraft['permissions']['fallback_activation'] = true;
  void [issuance, permit, dispatch, fallback];
  // @ts-expect-error immutable draft decision
  draft.decision.release_match = 'matched';
  // @ts-expect-error immutable limitations
  draft.decision.limitations.push('permission');
}
