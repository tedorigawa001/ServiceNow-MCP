//! Private input-local state and fixed collector entry. Not a transferable permit.
use super::super::super::scan_ops::collector::{ENTRY_MODEL_ID, KERNEL_MODEL_ID};
use super::*;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum State {
    Fresh,
    Attempted,
    BridgeReady {
        owner: *const (), // Compared only, never dereferenced; binds the same Inputs object.
        started: Instant,
        retries: u8,
        kernel_model: &'static str,
        entry_model: &'static str,
    },
    Entered,
}
impl ScanInputs<'_, '_, '_, '_> {
    pub(in super::super::super) fn enter_collector(
        &self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        // Irreversible even when a pre-existing stop prevents the first work charge.
        let prior = self.scan_started.replace(State::Entered);
        let result = (|| {
            work(b)?; // O.dispatch1, outside the unchanged kernel S.control.
            let State::BridgeReady {
                owner,
                started,
                retries,
                kernel_model,
                entry_model,
            } = prior
            else {
                return Err(Failure::Binding);
            };
            if owner != std::ptr::from_ref(self).cast::<()>()
                || !std::ptr::eq(current, self.declaration.scope)
                || !Rc::ptr_eq(&self.declaration.scope.budget_origin, &b.inspection_origin)
                || started != b.started
            {
                return Err(Failure::Binding);
            }
            if kernel_model != KERNEL_MODEL_ID || entry_model != ENTRY_MODEL_ID {
                return Err(Failure::Unavailable);
            }
            if retries != b.retries_left {
                return Err(Failure::Changed);
            }
            b.checkpoint()
        })();
        stop(result, b)
    }
}

#[cfg(test)]
mod tests;
impl std::fmt::Debug for State {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanUseState(private_not_execution_authority)")
    }
}
