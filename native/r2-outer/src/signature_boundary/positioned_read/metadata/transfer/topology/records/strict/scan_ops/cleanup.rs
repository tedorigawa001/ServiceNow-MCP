//! Bounded, prepaid terminal report. No round-success/acknowledgement producer.
use super::super::round_declaration::session::resources::RetiredConnection;
use super::*;
use crate::signature_boundary::positioned_read::ScanSessionClaim;

pub(in super::super) const MODEL_ID: &str = "bp5-r2-scan-cleanup-0.1";
#[derive(Default)]
pub(super) struct Lifecycle {
    origin: Option<Origin>,
    finalized: bool,
}
struct Origin {
    budget: Rc<()>,
    claim: Rc<ScanSessionClaim>,
    started: Instant,
}
pub(super) enum CleanupDisposition {
    NotStarted,
    Confirmed(ClosedScanResources),
    Incomplete(IncompleteCleanup),
}
pub(super) struct ClosedScanResources {
    _attempt: Rc<RefCell<Ledger>>,
    _origin: Origin,
    _session: Option<RetiredConnection>,
}
pub(super) struct IncompleteCleanup {
    reason: Problem,
}
// Read-only diagnostic vocabulary, not accepted by any evidence constructor.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum CleanupIssue {
    Duplicate,
    Binding,
    OwnersRemaining,
    ReleaseUnconfirmed,
    PendingRetry,
    DeclarationIncomplete,
    AcquisitionMismatch,
    SessionMismatch,
}
enum Problem {
    Duplicate,
    Binding,
    Owners,
    Unconfirmed,
    Retry,
    Declaration,
    Acquisitions,
    Session(Failure),
}
impl IncompleteCleanup {
    pub(super) fn issue(&self) -> CleanupIssue {
        match self.reason {
            Problem::Duplicate => CleanupIssue::Duplicate,
            Problem::Binding => CleanupIssue::Binding,
            Problem::Owners => CleanupIssue::OwnersRemaining,
            Problem::Unconfirmed => CleanupIssue::ReleaseUnconfirmed,
            Problem::Retry => CleanupIssue::PendingRetry,
            Problem::Declaration => CleanupIssue::DeclarationIncomplete,
            Problem::Acquisitions => CleanupIssue::AcquisitionMismatch,
            Problem::Session(_) => CleanupIssue::SessionMismatch,
        }
    }
    pub(super) fn failure(&self) -> Failure {
        match self.reason {
            Problem::Duplicate | Problem::Binding => Failure::Binding,
            Problem::Session(e) => e,
            Problem::Retry => Failure::ReadFailed,
            Problem::Declaration => Failure::Changed,
            _ => Failure::Unavailable,
        }
    }
}
impl std::fmt::Debug for CleanupDisposition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::NotStarted => "CleanupDisposition(not_started_no_evidence)",
            Self::Confirmed(_) => "CleanupDisposition(confirmed_scan_only_not_success)",
            Self::Incomplete(_) => "CleanupDisposition(incomplete_not_success)",
        })
    }
}
impl std::fmt::Debug for ClosedScanResources {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ClosedScanResources(scan_only_not_execution_authority)")
    }
}
pub(super) fn start(ledger: &Rc<RefCell<Ledger>>, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    work(b)?; // prepaid terminal report: remains available after sticky failure
    let mut l = ledger.borrow_mut();
    if l.cleanup.origin.is_some() || l.cleanup.finalized {
        return b.stop(Failure::Binding);
    }
    l.cleanup.origin = Some(Origin {
        budget: b.inspection_origin.clone(),
        claim: b.scan_session_claim.clone(),
        started: b.started,
    });
    Ok(())
}
fn incomplete(reason: Problem) -> CleanupDisposition {
    CleanupDisposition::Incomplete(IncompleteCleanup { reason })
}
pub(super) fn finish(
    ledger: &Rc<RefCell<Ledger>>,
    session: Option<Connection>,
    b: &mut SharedBudget<'_>,
) -> CleanupDisposition {
    let disposition = classify(ledger, session, b);
    if let CleanupDisposition::Incomplete(problem) = &disposition {
        let _ = b.stop::<()>(problem.failure());
    }
    disposition
}
fn classify(
    ledger: &Rc<RefCell<Ledger>>,
    session: Option<Connection>,
    b: &SharedBudget<'_>,
) -> CleanupDisposition {
    let mut l = ledger.borrow_mut();
    if std::mem::replace(&mut l.cleanup.finalized, true) {
        return incomplete(Problem::Duplicate);
    }
    let Some(origin) = &l.cleanup.origin else {
        if let Some(s) = session {
            s.abandon_cleanup();
        }
        return CleanupDisposition::NotStarted;
    };
    let retired = session.map(|s| s.retire_cleanup(&LocalTerminal { ledger: &l }, b));
    if !Rc::ptr_eq(&origin.budget, &b.inspection_origin)
        || !Rc::ptr_eq(&origin.claim, &b.scan_session_claim)
        || origin.started != b.started
    {
        return incomplete(Problem::Binding);
    }
    if l.unconfirmed != 0 {
        return incomplete(Problem::Unconfirmed);
    }
    if l.live != 0 || l.reserved_live != 0 || l.reserved_cleanup != 0 {
        return incomplete(Problem::Owners);
    }
    if l.retry.is_some() {
        return incomplete(Problem::Retry);
    }
    if l.declared_pending != 0 || l.declared_abandoned {
        return incomplete(Problem::Declaration);
    }
    if l.serial != l.attempts[Op::Cleanup as usize] {
        return incomplete(Problem::Acquisitions);
    }
    let retired = match retired.transpose() {
        Ok(v) => v,
        Err(e) => return incomplete(Problem::Session(e)),
    };
    CleanupDisposition::Confirmed(ClosedScanResources {
        _attempt: ledger.clone(),
        _origin: Origin {
            budget: origin.budget.clone(),
            claim: origin.claim.clone(),
            started: origin.started,
        },
        _session: retired,
    })
}
pub(super) fn sealed(ledger: &Ledger) -> bool {
    ledger.cleanup.finalized
}
// Only this terminal producer can construct the borrowed view. Owned projections are
// diagnostic counts, never accepted in place of this view by the session seal producer.
pub(in super::super) struct LocalTerminal<'a> {
    ledger: &'a Ledger,
}
pub(in super::super) struct TerminalCounts {
    pub(in super::super) attempts: [u64; 5],
    pub(in super::super) live: u64,
    pub(in super::super) reserved_live: u64,
    pub(in super::super) reserved_cleanup: u64,
    pub(in super::super) unconfirmed: u64,
    pub(in super::super) names: u64,
    pub(in super::super) peak: u64,
}
impl LocalTerminal<'_> {
    pub(in super::super) fn counts(&self) -> TerminalCounts {
        let l = self.ledger;
        TerminalCounts {
            attempts: l.attempts,
            live: l.live,
            reserved_live: l.reserved_live,
            reserved_cleanup: l.reserved_cleanup,
            unconfirmed: l.unconfirmed,
            names: l.names,
            peak: l.peak,
        }
    }
}
