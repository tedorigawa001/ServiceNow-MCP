//! Borrowed partial management shape only. No verified allocator layout or complete requirement.
use super::super::super::super::session::resources::management::recipes::{self, RecipeFacts};
use super::*;
use crate::signature_boundary::positioned_read::management_claim::State;
const MANAGEMENT_ID: &str = "bp5-r2-estimate-management-projection-0.1";
struct PartialShape {
    normal_entries: u64,
    // Element payload ONLY, never the Vec allocation upper bound. Deliberately no getter:
    // used solely to re-bind the same estimate; layout must come from separate evidence.
    element_payload_bytes: u64,
    key_allocation_sites: u8,
    inline_scalars: u8,
}
pub(in super::super::super::super::super) struct ManagementProjection<'e, 'p, 'i, 'd, 's, 'r> {
    estimate: &'e ScanWorkEstimate<'p, 'i, 'd, 's, 'r>,
    facts: RecipeFacts,
    shape: PartialShape,
    model: &'static str,
}
impl std::fmt::Debug for ManagementProjection<'_, '_, '_, '_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ManagementProjection(partial_all_layouts_unknown_not_full_requirement)")
    }
}
pub(in super::super::super::super::super) fn project<'e, 'p, 'i, 'd, 's, 'r>(
    estimate: &'e ScanWorkEstimate<'p, 'i, 'd, 's, 'r>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<ManagementProjection<'e, 'p, 'i, 'd, 's, 'r>, Failure> {
    let begun = estimate
        .resource_owner
        .begin_management(State::Fresh, State::Started);
    let result = (|| {
        work(b)?; // irreversible budget-owned claim before fallible guards
        begun?;
        projection::require_estimate(estimate, inputs, scope, b)?; // existing six guards
        let facts = recipes::inspect_fixed(b)?; // 23 review + 1 fixed owned publication
        work(b)?;
        if expected != MANAGEMENT_ID {
            return Err(Failure::Unavailable);
        }
        let n = estimate.profile.shape.n;
        let payload = element_payload(n)?;
        work(b)?; // fixed known key SITE count, not allocation bytes or success count
        let key_allocation_sites = 4;
        work(b)?; // inline scalar count, not parent allocation coverage
        let inline_scalars = 53;
        work(b)?; // publication, not cap approval or resource configuration
        b.checkpoint()?;
        estimate
            .resource_owner
            .management_projection
            .set(State::Issued);
        Ok(ManagementProjection {
            estimate,
            facts,
            shape: PartialShape {
                normal_entries: n,
                element_payload_bytes: payload,
                key_allocation_sites,
                inline_scalars,
            },
            model: MANAGEMENT_ID,
        })
    })();
    finish(estimate, result, b)
}
fn finish<T>(
    e: &ScanWorkEstimate<'_, '_, '_, '_, '_>,
    result: Result<T, Failure>,
    b: &mut SharedBudget<'_>,
) -> Result<T, Failure> {
    match result {
        Ok(value) => Ok(value),
        Err(reason) => Err(projection::stop_owner(&e.resource_owner, reason, b)),
    }
}
fn element_payload(n: u64) -> Result<u64, Failure> {
    if n > 100_000 {
        return Err(Failure::Limit);
    }
    n.checked_mul(8).ok_or(Failure::Limit)
}
impl ManagementProjection<'_, '_, '_, '_, '_, '_> {
    fn require(
        &self,
        e: &ScanWorkEstimate<'_, '_, '_, '_, '_>,
        inputs: &ScanInputs<'_, '_, '_, '_>,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        projection::require_estimate(self.estimate, inputs, scope, b)?;
        work(b)?;
        if self.model != MANAGEMENT_ID {
            return Err(Failure::Unavailable);
        }
        if !std::ptr::eq(self.estimate, e)
            || self.estimate.resource_owner.management_projection.get() != State::Consuming
        {
            return Err(Failure::Binding);
        }
        self.facts.require(b)?;
        work(b)?;
        let n = e.profile.shape.n;
        if self.shape.normal_entries != n || self.shape.element_payload_bytes != element_payload(n)?
        {
            return Err(Failure::Binding);
        }
        work(b)?;
        if self.shape.key_allocation_sites != 4 {
            return Err(Failure::Binding);
        }
        work(b)?;
        if self.shape.inline_scalars != 53 {
            return Err(Failure::Binding);
        }
        b.checkpoint()
    }
    pub(in super::super::super::super::super) fn consume(
        self,
        e: &ScanWorkEstimate<'_, '_, '_, '_, '_>,
        inputs: &ScanInputs<'_, '_, '_, '_>,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let begun = self
            .estimate
            .resource_owner
            .begin_management(State::Issued, State::Consuming);
        let result = (|| {
            work(b)?;
            begun?;
            self.require(e, inputs, scope, b)?;
            work(b)?;
            b.checkpoint()?;
            self.estimate
                .resource_owner
                .management_projection
                .set(State::Consumed);
            Ok(()) // partial check consumed, deliberately no witness/parts returned
        })();
        finish(self.estimate, result, b)
    }
}
#[cfg(test)]
mod tests;
