//! Borrowed scan-resource requirements from the SAME sealed estimate. No full-policy evidence.
use super::*;
use scan_ops::resource_model::{self, Quantities};
pub(in super::super::super::super::super) mod caps;

pub(in super::super::super::super::super) const PROJECTION_ID: &str =
    "bp5-r2-estimate-resource-projection-0.1";

pub(in super::super::super::super::super) struct ScanResourceRequirements<'e, 'p, 'i, 'd, 's, 'r> {
    estimate: &'e ScanWorkEstimate<'p, 'i, 'd, 's, 'r>,
    quantities: Quantities,
    model: &'static str,
    comparison_started: std::cell::Cell<bool>,
}
fn require_estimate(
    e: &ScanWorkEstimate<'_, '_, '_, '_, '_>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    e.profile.require(inputs, scope, MODEL_ID, b)?; // five: same inputs/scope/origin/start/retry
    work(b)?;
    if e.calculator_model != CALCULATOR_ID || e.kernel_model != KERNEL_ID {
        return Err(Failure::Unavailable);
    }
    // Initial is the sole pre-session 3-round projection. Later rounds need a separate contract.
    if scope.round != Round::Initial
        || inputs.scan_started.get() != super::super::super::use_state::State::Fresh
        || b.scan_session_claim.started.get()
        || b.protected_bridge_claim.generated.get()
        || b.protected_bridge_claim.used.get()
        || !Rc::ptr_eq(&e.resource_owner, &b.protected_bridge_claim)
    {
        return Err(Failure::Binding);
    }
    b.checkpoint()
}
fn finish<T>(
    estimate: &ScanWorkEstimate<'_, '_, '_, '_, '_>,
    result: Result<T, Failure>,
    b: &mut SharedBudget<'_>,
) -> Result<T, Failure> {
    match result {
        Ok(value) => Ok(value),
        Err(e) => Err(stop_owner(&estimate.resource_owner, e, b)),
    }
}
fn stop_owner(
    owner: &crate::signature_boundary::positioned_read::ProtectedBridgeClaim,
    e: Failure,
    b: &mut SharedBudget<'_>,
) -> Failure {
    let reason = owner
        .failure
        .get()
        .or(owner.allocation.get().failure())
        .unwrap_or(e);
    let reason = b.stop::<()>(reason).unwrap_err();
    owner.stop_allocation(reason)
}
pub(in super::super::super::super::super) fn project<'e, 'p, 'i, 'd, 's, 'r>(
    estimate: &'e ScanWorkEstimate<'p, 'i, 'd, 's, 'r>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<ScanResourceRequirements<'e, 'p, 'i, 'd, 's, 'r>, Failure> {
    let fresh = !estimate.resource_projected.replace(true);
    let result = (|| {
        work(b)?; // Projection claim, before fallible guards; no reset on error/drop.
        if !fresh {
            return Err(Failure::Binding);
        }
        require_estimate(estimate, inputs, scope, b)?;
        work(b)?; // fixed protected scalar mapping, no allocation/count-only pass/decode
        if expected != PROJECTION_ID {
            return Err(Failure::Unavailable);
        }
        let s = &estimate.profile.shape;
        let shape = resource_model::Shape {
            entries: s.e,
            files: s.f,
            directories: s.d,
            root_depth: s.h,
            edges: s.k,
            chunks: s.c,
            bytes: s.l,
        };
        let quantities = resource_model::calculate(&shape, resource_model::MODEL_ID, b)?; // nine
        work(b)?; // publication, not a reservation or approval
        b.checkpoint()?;
        Ok(ScanResourceRequirements {
            estimate,
            quantities,
            model: PROJECTION_ID,
            comparison_started: std::cell::Cell::new(false),
        })
    })();
    finish(estimate, result, b)
}
impl ScanResourceRequirements<'_, '_, '_, '_, '_, '_> {
    fn require(
        &self,
        estimate: &ScanWorkEstimate<'_, '_, '_, '_, '_>,
        inputs: &ScanInputs<'_, '_, '_, '_>,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        require_estimate(estimate, inputs, scope, b)?;
        work(b)?;
        if self.model != PROJECTION_ID {
            return Err(Failure::Unavailable);
        }
        if !std::ptr::eq(self.estimate, estimate) {
            return Err(Failure::Binding);
        }
        b.checkpoint()
    }
}
impl std::fmt::Debug for ScanResourceRequirements<'_, '_, '_, '_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanResourceRequirements(borrowed_same_estimate_not_full_policy)")
    }
}

#[cfg(test)]
mod tests;
