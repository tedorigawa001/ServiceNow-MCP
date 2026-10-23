//! Dedicated budget-owned partial management projection claim, not allocation authority.
use super::*;
#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub(super) enum State {
    #[default]
    Fresh,
    Started,
    Issued,
    Consuming,
    Consumed,
    Stopped(Failure),
}
impl ProtectedBridgeClaim {
    pub(super) fn begin_management(&self, expected: State, next: State) -> Result<(), Failure> {
        match self.management_projection.get() {
            State::Stopped(e) => Err(e),
            value
                if value == expected
                    && matches!(
                        (expected, next),
                        (State::Fresh, State::Started) | (State::Issued, State::Consuming)
                    ) =>
            {
                self.management_projection.set(next);
                Ok(())
            }
            _ => Err(Failure::Binding),
        }
    }
}
