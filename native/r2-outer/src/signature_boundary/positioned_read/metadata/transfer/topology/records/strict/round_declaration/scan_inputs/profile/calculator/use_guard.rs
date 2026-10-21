//! Guard-only internal stage. No collector/source dispatch or permit is returned.
use super::super::super::use_state::State;
use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::strict::scan_ops::collector::{ENTRY_MODEL_ID, KERNEL_MODEL_ID};

pub(super) fn consume(
    estimate: ScanWorkEstimate<'_, '_, '_, '_, '_>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    current: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    // Consume the estimate's ORIGINAL Inputs attempt before any fallible work.
    // A mismatched caller-supplied Inputs must remain untouched.
    let original = estimate.profile.inputs;
    let fresh = original.scan_started.get() == State::Fresh;
    if fresh {
        original.scan_started.set(State::Attempted);
    }
    let result = (|| {
        estimate.profile.require(inputs, current, MODEL_ID, b)?; // 1..5
        work(b)?; // 6: fixed collector contract; no caller-selected callee or expected ID
        if estimate.calculator_model != CALCULATOR_ID
            || estimate.kernel_model != KERNEL_MODEL_ID
            || KERNEL_ID != KERNEL_MODEL_ID
        {
            return Err(Failure::Unavailable);
        }
        b.checkpoint()?;
        work(b)?; // 7: same attempt and final binding, never an executable permit
        if !fresh
            || original.scan_started.get() != State::Attempted
            || !std::ptr::eq(original, inputs)
            || !std::ptr::eq(estimate.profile.scope, current)
            || !Rc::ptr_eq(&estimate.profile.origin, &b.inspection_origin)
            || estimate.profile.started != b.started
        {
            return Err(Failure::Binding);
        }
        if estimate.profile.shape.r != b.retries_left {
            return Err(Failure::Changed);
        }
        // Publish only after the last fallible step; no rollback/reset or further work.
        b.checkpoint()?;
        original.scan_started.set(State::BridgeReady {
            owner: std::ptr::from_ref(original).cast::<()>(),
            started: estimate.profile.started,
            retries: estimate.profile.shape.r,
            kernel_model: KERNEL_MODEL_ID,
            entry_model: ENTRY_MODEL_ID,
        });
        Ok(())
    })();
    // The owned estimate/profile are dropped on both paths, never returned for retry.
    stop(result, b)
}

#[cfg(test)]
mod tests;
