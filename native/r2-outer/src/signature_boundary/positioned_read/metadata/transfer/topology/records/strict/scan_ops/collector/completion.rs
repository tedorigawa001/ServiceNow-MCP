//! Sole fixed-callee success producer. Never accepts an arbitrary Outcome/Observation.
use super::super::super::round_declaration::session::{
    RoundResourceScope, completion::PendingStrictRound,
};
use super::super::cleanup::ClosedScanResources;
use super::*;

const MODEL: &str = "bp5-r2-strict-round-completion-0.1";
pub(in super::super::super) struct RoundScanSuccess {
    observation: OwnedObservation,
    closed: ClosedScanResources,
    summary: Summary,
}
struct OwnedObservation {
    value: ClosureObservation,
    #[cfg(test)]
    dropped: Option<Rc<Cell<u64>>>,
}
#[cfg(test)]
impl Drop for OwnedObservation {
    fn drop(&mut self) {
        if let Some(dropped) = &self.dropped {
            dropped.set(dropped.get() + 1);
        }
    }
}
// Payload only: NOT an AfterScan/strict completion producer. No Observation field.
pub(in super::super::super) struct ScanTailData {
    closed: ClosedScanResources,
    summary: Summary,
}
impl ScanTailData {
    pub(in super::super::super) fn require(
        &self,
        lease: &RoundResourceScope<'_, '_, '_>,
        b: &SharedBudget<'_>,
    ) -> Result<(), Failure> {
        self.closed.require_completion(lease, b)
    }
    pub(in super::super::super) fn reject(self, reason: Failure) -> CompletionFailure {
        CompletionFailure {
            reason,
            cleanup: CleanupDisposition::Confirmed(self.closed),
            summary: Some(self.summary),
        }
    }
}
pub(in super::super::super) struct CompletionFailure {
    reason: Failure,
    cleanup: CleanupDisposition,
    summary: Option<Summary>,
}
impl std::fmt::Debug for RoundScanSuccess {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RoundScanSuccess(scan_only_not_strict_success)")
    }
}
impl std::fmt::Debug for CompletionFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RoundCompletionFailure(diagnostics_only)")
    }
}
impl RoundScanSuccess {
    pub(in super::super::super) fn model(&self) -> &'static str {
        MODEL
    }
    pub(in super::super::super) fn observation(&self) -> &ClosureObservation {
        &self.observation.value
    }
    pub(in super::super::super) fn require(
        &self,
        lease: &RoundResourceScope<'_, '_, '_>,
        b: &SharedBudget<'_>,
    ) -> Result<(), Failure> {
        self.closed.require_completion(lease, b)
    }
    pub(in super::super::super) fn reject(self, reason: Failure) -> CompletionFailure {
        self.discard_observation().reject(reason)
    }
    pub(in super::super::super) fn discard_observation(self) -> ScanTailData {
        let Self {
            observation,
            closed,
            summary,
        } = self;
        drop(observation); // All entries/strings are released before publishing the next stage.
        ScanTailData { closed, summary }
    }
    #[cfg(test)]
    pub(super) fn watch_observation_drop(&mut self, dropped: Rc<Cell<u64>>) {
        self.observation.dropped = Some(dropped);
    }
    #[cfg(test)]
    pub(super) fn corrupt_observation_entries(&mut self) {
        self.observation.value.entries.clear();
    }
}
impl CompletionFailure {
    pub(in super::super::super) fn reason(&self) -> Failure {
        self.reason
    }
    pub(super) fn cleanup(&self) -> &CleanupDisposition {
        &self.cleanup
    }
    pub(super) fn summary_attempts(&self) -> Option<[u64; 5]> {
        self.summary.as_ref().map(|s| s.attempts)
    }
    pub(in super::super) fn diagnostic(&self) -> CompletionDiagnostic {
        CompletionDiagnostic {
            cleanup: match &self.cleanup {
                CleanupDisposition::NotStarted => CleanupClass::NotStarted,
                CleanupDisposition::Confirmed(_) => CleanupClass::Confirmed,
                CleanupDisposition::Incomplete(e) => CleanupClass::Incomplete(e.issue()),
            },
            summary: self.summary.as_ref().map(|s| SummaryCounts {
                attempts: s.attempts,
                live: s.live,
                pending_cleanup: s.pending_cleanup,
                unconfirmed: s.unconfirmed,
                retry_pending: s.retry_pending,
                names: s.names,
                peak: s.peak,
                declared_pending: s.declared_pending,
            }),
        }
    }
}
// Read-only copied counts/classification only, never accepted as cleanup/round evidence.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super) enum CleanupClass {
    NotStarted,
    Confirmed,
    Incomplete(super::super::cleanup::CleanupIssue),
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(in super::super) struct SummaryCounts {
    pub(in super::super) attempts: [u64; 5],
    pub(in super::super) live: u64,
    pub(in super::super) pending_cleanup: u64,
    pub(in super::super) unconfirmed: u64,
    pub(in super::super) retry_pending: bool,
    pub(in super::super) names: u64,
    pub(in super::super) peak: u64,
    pub(in super::super) declared_pending: u64,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(in super::super) struct CompletionDiagnostic {
    pub(in super::super) cleanup: CleanupClass,
    pub(in super::super) summary: Option<SummaryCounts>,
}
impl std::fmt::Debug for CompletionDiagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CompletionDiagnostic(counts_only_not_evidence)")
    }
}
impl std::fmt::Debug for SummaryCounts {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SummaryCounts(diagnostics_only)")
    }
}
// Fixed-size diagnostic/evidence stays inline: no fallible heap allocation after stop.
#[allow(clippy::result_large_err)]
pub(super) fn collect_and_complete<'a, 'r, 's, S: ScanOps>(
    mut lease: RoundResourceScope<'a, 'r, 's>,
    estimate: ScanWorkEstimate<'_, '_, '_, '_, '_>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    current: &RoundScope<'_>,
    scan: (S, Option<Quotas>),
    b: &mut SharedBudget<'_>,
) -> Result<PendingStrictRound<'a, 'r, 's>, CompletionFailure> {
    let success = collect_success(&mut lease, estimate, inputs, current, scan, b)?;
    lease.complete_scan(success, b)
}
#[allow(clippy::result_large_err)] // Same bounded, allocation-free terminal diagnostic.
fn collect_success<S: ScanOps>(
    lease: &mut RoundResourceScope<'_, '_, '_>,
    estimate: ScanWorkEstimate<'_, '_, '_, '_, '_>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    current: &RoundScope<'_>,
    scan: (S, Option<Quotas>),
    b: &mut SharedBudget<'_>,
) -> Result<RoundScanSuccess, CompletionFailure> {
    let mut captured = None;
    let result = lease.with_resources(b, |account, b| {
        match consume_and_collect_session(estimate, inputs, current, scan, account, b) {
            DispatchOutcome::NotStarted(e) => Err(e),
            DispatchOutcome::Collected(out) => {
                let result = out.result.as_ref().map(|_| ()).map_err(|e| *e);
                captured = Some(out);
                result
            }
        }
    });
    let Some(out) = captured else {
        let reason = result.err().unwrap_or(Failure::Unavailable);
        return Err(CompletionFailure {
            reason,
            cleanup: CleanupDisposition::NotStarted,
            summary: None,
        });
    };
    if let Err(reason) = result {
        return Err(CompletionFailure {
            reason,
            cleanup: out.cleanup,
            summary: Some(out.summary),
        });
    }
    match (out.result, out.cleanup) {
        (Ok(observation), CleanupDisposition::Confirmed(closed)) => Ok(RoundScanSuccess {
            observation: OwnedObservation {
                value: observation,
                #[cfg(test)]
                dropped: None,
            },
            closed,
            summary: out.summary,
        }),
        (result, cleanup) => {
            let reason = result.err().unwrap_or(Failure::Unavailable);
            let _ = b.stop::<()>(reason);
            Err(CompletionFailure {
                reason,
                cleanup,
                summary: Some(out.summary),
            })
        }
    }
}
// Test-only pause at the real fixed producer output, never a constructor from counts.
#[cfg(test)]
#[allow(clippy::result_large_err)]
pub(in super::super) fn collect_fixture<'a, 'r, 's, S: ScanOps>(
    lease: RoundResourceScope<'a, 'r, 's>,
    estimate: ScanWorkEstimate<'_, '_, '_, '_, '_>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    current: &RoundScope<'_>,
    scan: (S, Option<Quotas>),
    b: &mut SharedBudget<'_>,
) -> Result<PendingStrictRound<'a, 'r, 's>, CompletionFailure> {
    collect_and_complete(lease, estimate, inputs, current, scan, b)
}
#[cfg(test)]
#[allow(clippy::result_large_err)]
pub(super) fn pause_after_scan<S: ScanOps>(
    lease: &mut RoundResourceScope<'_, '_, '_>,
    estimate: ScanWorkEstimate<'_, '_, '_, '_, '_>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    current: &RoundScope<'_>,
    scan: (S, Option<Quotas>),
    b: &mut SharedBudget<'_>,
) -> Result<RoundScanSuccess, CompletionFailure> {
    collect_success(lease, estimate, inputs, current, scan, b)
}
