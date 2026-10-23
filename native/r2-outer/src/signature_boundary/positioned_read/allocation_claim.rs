//! Inspection-local draft attempt only. No complete-parts or transfer state exists yet.
use super::*;
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub(super) enum State {
    #[default]
    Fresh,
    DraftClaimed,
    DraftReady,
    FinalizeClaimed,
    Stopped(Failure),
}
impl State {
    pub(super) fn failure(self) -> Option<Failure> {
        match self {
            Self::Stopped(e) => Some(e),
            _ => None,
        }
    }
}
impl ProtectedBridgeClaim {
    pub(super) fn stop_allocation(&self, reason: Failure) -> Failure {
        let first = self
            .failure
            .get()
            .or(self.allocation.get().failure())
            .unwrap_or(reason);
        self.failure.set(Some(first));
        if self.allocation.get() != State::Fresh {
            self.allocation.set(State::Stopped(first));
        }
        first
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn each_started_allocation_state_latches_budget_stops_without_other_bridge_flags() {
        for state in [
            State::DraftClaimed,
            State::DraftReady,
            State::FinalizeClaimed,
        ] {
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let owner = b.protected_bridge_claim.clone();
            owner.allocation.set(state);
            assert_eq!(b.stop::<()>(Failure::Deadline), Err(Failure::Deadline));
            assert_eq!(owner.failure.get(), Some(Failure::Deadline));
            assert!(owner.allocation.get() == State::Stopped(Failure::Deadline));
            assert_eq!(b.stop::<()>(Failure::Binding), Err(Failure::Deadline));
            assert_eq!(owner.failure.get(), Some(Failure::Deadline));
        }
    }
}
