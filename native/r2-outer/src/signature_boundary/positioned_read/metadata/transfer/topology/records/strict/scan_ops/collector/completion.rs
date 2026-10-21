//! Sole fixed-callee success producer. Never accepts an arbitrary Outcome/Observation.
use super::super::super::round_declaration::session::{
    RoundResourceScope, completion::PendingStrictRound,
};
use super::super::cleanup::ClosedScanResources;
use super::*;

const MODEL: &str = "bp5-r2-strict-round-completion-0.1";
pub(in super::super::super) struct RoundScanSuccess {
    observation: ClosureObservation,
    closed: ClosedScanResources,
    summary: Summary,
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
        &self.observation
    }
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
            observation,
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
