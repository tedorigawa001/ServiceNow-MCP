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
    // Claims the next attempt state irreversibly, but never overwrites a terminal Stopped state:
    // the caller still rejects (prior != expected) without passing through a transient state.
    pub(super) fn begin_allocation(&self, next: State) -> State {
        let prior = self.allocation.get();
        if prior.failure().is_none() {
            self.allocation.set(next);
        }
        prior
    }
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
    #[test]
    fn begin_allocation_never_overwrites_a_stopped_state() {
        let cancel = AtomicBool::new(false);
        let b = SharedBudget::new(Instant::now(), &cancel);
        let owner = b.protected_bridge_claim.clone();
        assert!(owner.begin_allocation(State::DraftClaimed) == State::Fresh);
        assert!(owner.allocation.get() == State::DraftClaimed);
        owner.stop_allocation(Failure::Changed);
        for next in [State::DraftClaimed, State::FinalizeClaimed] {
            assert!(owner.begin_allocation(next) == State::Stopped(Failure::Changed));
            assert!(owner.allocation.get() == State::Stopped(Failure::Changed));
        }
        assert_eq!(owner.failure.get(), Some(Failure::Changed));
    }
}
