//! Diagnostic-only result join. Does not release resources, complete strict or issue permits.
use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super::super) enum OuterPhase {
    Entry,
    Receipt,
    OuterClock,
    OwnerCreate,
    Initial,
    TopologyPrepare,
    Compare,
    AfterHandoff,
    AfterRound,
    BodyCheckpoint,
    Release,
    PostReleaseCheckpoint,
}

// Observations supplied by the future fixed release section, NOT cleanup evidence.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super::super) enum DropObservation {
    NotReached,
    SequenceReturned,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in super::super::super) enum PostReleaseCheckpoint {
    NotReached,
    Passed,
    Stopped(Failure),
}

pub(in super::super::super) struct OuterStrictFailure {
    primary: Failure,
    phase: OuterPhase,
    inner: Option<StrictInspectionFailure>,
    release: DropObservation,
    checkpoint: PostReleaseCheckpoint,
}
impl std::fmt::Debug for OuterStrictFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("OuterStrictFailure(diagnostics_only_not_cleanup_or_execution_authority)")
    }
}
impl OuterStrictFailure {
    pub(in super::super::super) fn plain(
        phase: OuterPhase,
        reason: Failure,
        b: &mut SharedBudget<'_>,
    ) -> Self {
        let primary = b.stop::<()>(reason).unwrap_err();
        Self {
            primary,
            phase,
            inner: None,
            release: DropObservation::NotReached,
            checkpoint: PostReleaseCheckpoint::NotReached,
        }
    }
    pub(in super::super::super) fn from_inner(
        phase: OuterPhase,
        inner: StrictInspectionFailure,
        b: &mut SharedBudget<'_>,
    ) -> Self {
        let mut error = Self::plain(phase, inner.reason(), b);
        error.inner = Some(inner); // move exactly once, never extract reason and discard the frame
        error
    }
    pub(in super::super::super) fn reason(&self) -> Failure {
        self.primary
    }
    pub(in super::super::super) fn phase(&self) -> OuterPhase {
        self.phase
    }
    pub(in super::super::super) fn round(&self) -> Option<Round> {
        self.inner.as_ref().and_then(|e| e.round)
    }
    pub(in super::super::super) fn inner(&self) -> Option<&StrictInspectionFailure> {
        self.inner.as_ref()
    }
    pub(in super::super::super) fn release(&self) -> DropObservation {
        self.release
    }
    pub(in super::super::super) fn checkpoint(&self) -> PostReleaseCheckpoint {
        self.checkpoint
    }
}

// T is caller-owned pending data, not a new RecordComparison/strict-success producer.
// The caller must retain the SAME inspection budget and invoke after its fixed release section.
#[allow(clippy::result_large_err)] // Fixed-size failure/cleanup diagnostics survive without allocation.
pub(in super::super::super) fn merge_after_release<T>(
    body: Result<T, OuterStrictFailure>,
    release: DropObservation,
    b: &mut SharedBudget<'_>,
) -> Result<T, OuterStrictFailure> {
    // Always evaluate, including an already failed body. Never use ? and discard `body`.
    let observed = match b.checkpoint() {
        Ok(()) => PostReleaseCheckpoint::Passed,
        Err(e) => PostReleaseCheckpoint::Stopped(e),
    };
    let mut error = match body {
        Err(mut error) => {
            // A sticky checkpoint usually returns this same reason. Even if it passes,
            // a retained body failure must not become success or lose its inner frame.
            let _ = b.stop::<()>(error.primary);
            error.release = release;
            error.checkpoint = observed;
            return Err(error);
        }
        Ok(value) => match observed {
            PostReleaseCheckpoint::Stopped(reason) => {
                drop(value);
                OuterStrictFailure::plain(OuterPhase::PostReleaseCheckpoint, reason, b)
            }
            _ if release != DropObservation::SequenceReturned => {
                drop(value);
                OuterStrictFailure::plain(OuterPhase::Release, Failure::Unavailable, b)
            }
            _ => return Ok(value),
        },
    };
    error.release = release;
    error.checkpoint = observed;
    Err(error)
}
