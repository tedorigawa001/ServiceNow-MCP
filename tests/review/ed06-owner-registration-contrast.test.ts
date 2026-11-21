import { describe, expect, it } from 'vitest';
import {
  registerReviewEvidenceSession,
  type ReviewRunBudgetLease,
  type ReviewSourceReleasePort,
  type ReviewSourceReleaseSnapshot,
} from '../../src/servicenow/review-evidence-lifecycle.js';

// Development-only contrast at the real owner guard. These fixture identities are not a
// BoundedReadSession, a source-issued Permit, or an entry into the packaged adapter.
const release: ReviewSourceReleaseSnapshot = Object.freeze({
  instance_release: Object.freeze({
    source: 'sys_cluster_state.build_name',
    resolution_status: 'resolved',
    family: 'Australia',
    raw_buildname: 'Australia',
    observed_at: '2026-11-20T00:00:00Z',
    visibility_scope: 'caller_acl',
  }),
  limitations: Object.freeze(['release_visible_nodes_only']),
});

type Mode = 'registered' | 'registration-omitted' | 'registration-omitted-at-deadline';
type GuardEvent = 'lease-read' | 'port-match' | 'port-copy';

function runOwnerContrast(mode: Mode) {
  const session = Object.freeze({});
  const snapshot = Object.freeze({});
  const source = Object.freeze({});
  const permit = Object.freeze({});
  const reads: GuardEvent[] = [];
  let budget = { requests: 0, received_bytes: 0, payload_bytes: 0, remaining_ms: 1000 };
  const lease: ReviewRunBudgetLease = Object.freeze({
    read() {
      reads.push('lease-read');
      return { ...budget };
    },
  });
  const port: ReviewSourceReleasePort = Object.freeze({
    matches() {
      reads.push('port-match');
      return true;
    },
    copyRelease() {
      reads.push('port-copy');
      return release;
    },
  });
  const owner = registerReviewEvidenceSession(session, snapshot, lease);
  const binding = [snapshot, lease, source, permit, port] as const;
  const constructed = owner.transportConstructor;
  let metadataSentinels = 0;
  let dispatchSentinels = 0;
  let prepared: ReturnType<typeof owner.inspectSource>;
  let firstFailure: ReturnType<typeof owner.failure>;
  let outcome: ReturnType<typeof owner.inspect>;
  let guardReads: GuardEvent[];
  try {
    const claim = constructed.claim(snapshot, lease);
    if (!claim.ok) throw new Error('fixture transport claim failed');
    expect(constructed.bindInitialSource(claim.value, snapshot, lease, source)).toMatchObject({
      ok: true,
      value: { initial_source: 'bound', evidence_issuance: 'disabled' },
    });
    expect(owner.markReady(snapshot, lease)).toBe(true);

    // Fixed fixture ledger only: neither parent/release nor metadata is fetched by this test.
    budget = { requests: 2, received_bytes: 80, payload_bytes: 0, remaining_ms: 900 };
    if (mode === 'registered') expect(owner.bindSource(...binding)).toBe(true);
    if (mode === 'registration-omitted-at-deadline') budget = { ...budget, remaining_ms: 0 };

    const beforeGuard = reads.length;
    prepared = owner.inspectSource(...binding);
    guardReads = reads.slice(beforeGuard);
    // Inspect status only after the first guard has returned. The ledger above records the
    // guard's existing dependency calls; it never inserts an extra owner/lease check.
    firstFailure = owner.failure();
    if (prepared !== null) {
      // In-memory continuation markers, not production metadata I/O or worker dispatch.
      metadataSentinels++;
      dispatchSentinels++;
    }
    outcome = owner.inspect(snapshot, lease);
  } finally {
    owner.close('closed');
  }
  return {
    prepared, firstFailure, outcome, guardReads, metadataSentinels, dispatchSentinels,
    closed: owner.inspect(snapshot, lease),
  };
}

describe('ED06 isolated owner registration contrast', () => {
  it('passes the real owner guard only when the registration was made in the fresh fixture run', () => {
    const registered = runOwnerContrast('registered');
    const omitted = runOwnerContrast('registration-omitted');

    expect(registered.prepared).toEqual({ state: 'prepared_only', ...release, evidence_issuance: 'disabled' });
    expect(registered.firstFailure).toBeUndefined();
    expect(registered.guardReads).toEqual(['lease-read', 'port-match', 'lease-read', 'port-match']);
    expect(registered).toMatchObject({ metadataSentinels: 1, dispatchSentinels: 1 });
    expect(registered.outcome).toMatchObject({
      state: 'ready', auth_ready: true, ready_generation: 1, source_claim: 'claimed', primary: null,
    });
    expect(registered.closed).toMatchObject({ state: 'closed', auth_ready: false, primary: { code: 'closed' } });

    expect(omitted.prepared).toBeNull();
    expect(omitted.firstFailure).toBe('evidence_binding_mismatch');
    expect(omitted.guardReads).toEqual(['lease-read']);
    expect(omitted).toMatchObject({ metadataSentinels: 0, dispatchSentinels: 0 });
    expect(omitted.outcome).toMatchObject({
      state: 'stopped', auth_ready: false, ready_generation: 1, source_claim: 'unclaimed',
      primary: { stage: 'binding', code: 'evidence_binding_mismatch' },
    });
    expect(omitted.outcome.budget).toEqual(registered.outcome.budget);
    expect(omitted.closed).toMatchObject({
      state: 'closed', auth_ready: false, primary: omitted.outcome.primary,
    });
  });

  it('retains a prior deadline from the same guard instead of classifying every null as missing registration', () => {
    const expired = runOwnerContrast('registration-omitted-at-deadline');
    expect(expired.prepared).toBeNull();
    expect(expired.firstFailure).toBe('deadline_exceeded');
    expect(expired.guardReads).toEqual(['lease-read']);
    expect(expired).toMatchObject({ metadataSentinels: 0, dispatchSentinels: 0 });
    expect(expired.outcome).toMatchObject({
      state: 'stopped', ready_generation: 1, source_claim: 'unclaimed',
      primary: { stage: 'owner', code: 'deadline_exceeded' },
    });
    expect(expired.closed).toMatchObject({ state: 'closed', primary: expired.outcome.primary });
  });
});
