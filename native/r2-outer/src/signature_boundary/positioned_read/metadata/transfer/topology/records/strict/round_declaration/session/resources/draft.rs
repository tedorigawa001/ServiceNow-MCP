//! Non-executable allocation draft only. No ResourcePolicy/Input/Quotas, parts or permit.
use super::super::super::scan_inputs::profile::calculator::projection::caps::ScanCapAllocationView;
use super::*;
use crate::signature_boundary::positioned_read::{
    ProtectedBridgeClaim, allocation_claim::State as AllocationState,
};
const MODEL: &str = "bp5-r2-scan-parts-draft-0.1";
#[derive(Clone, Copy, PartialEq, Eq)]
enum Requirement {
    Unknown,
}
pub(in super::super::super::super) struct ScanPartsDraft<'a> {
    view: ScanCapAllocationView<'a>,
    owner: Rc<ProtectedBridgeClaim>,
    model: &'static str,
    // No Verified variant, defaults, setters, scalar quantities or completed-parts constructor.
    // Fixed order: outer owners, management allocation, bootstrap bytes/work/live.
    unknown: [Requirement; 5],
}
pub(in super::super::super::super) fn create<'a>(
    view: ScanCapAllocationView<'a>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<ScanPartsDraft<'a>, Failure> {
    let owner = view.owner().clone();
    let prior = owner.begin_allocation(AllocationState::DraftClaimed);
    let result = (|| {
        work(b)?; // irreversible claim entry, before any fallible guard
        if prior != AllocationState::Fresh {
            return Err(Failure::Binding);
        }
        view.require(scope, b)?; // three: exact comparison/cap/receipt/budget provenance
        work(b)?; // publication, not real allocation
        b.checkpoint()?;
        owner.allocation.set(AllocationState::DraftReady);
        Ok(())
    })();
    match result {
        Ok(()) => Ok(ScanPartsDraft {
            view,
            owner,
            model: MODEL,
            unknown: [Requirement::Unknown; 5],
        }),
        Err(e) => Err(view.reject(e, b)),
    }
}
impl ScanPartsDraft<'_> {
    pub(in super::super::super::super) fn finalize(
        self,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<std::convert::Infallible, Failure> {
        let prior = self
            .owner
            .begin_allocation(AllocationState::FinalizeClaimed);
        let result = (|| {
            work(b)?; // finalization attempt is spent even if cancelled/expired
            if prior != AllocationState::DraftReady {
                return Err(Failure::Binding);
            }
            if self.model != MODEL {
                return Err(Failure::Unavailable);
            }
            self.view.require(scope, b)?; // three guards, no pre-session guard weakened
            for requirement in &self.unknown {
                work(b)?; // five fixed unknown-dimension guards; no quantity is filled
                match requirement {
                    Requirement::Unknown => (),
                }
            }
            Err(Failure::Unavailable) // There is no successful full-coverage value in this subset.
        })();
        result.map_err(|e| self.view.reject(e, b))
    }
    #[cfg(test)]
    pub(in super::super::super::super) fn unknown_count(&self) -> usize {
        self.unknown
            .iter()
            .filter(|v| **v == Requirement::Unknown)
            .count()
    }
}
impl Drop for ScanPartsDraft<'_> {
    fn drop(&mut self) {
        // No resource is owned: abandonment is a stop, NOT evidence of OS cleanup.
        self.owner.stop_allocation(Failure::Unavailable);
    }
}
impl std::fmt::Debug for ScanPartsDraft<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanPartsDraft(non_executable_five_unknown_not_allocation_or_permit)")
    }
}
