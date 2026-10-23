//! Preserve the actual compared cap + scope + estimate-field borrows; never export raw cap arrays.
use super::*;
const VIEW_ID: &str = "bp5-r2-scan-cap-allocation-view-0.1";
pub(in super::super::super::super::super::super::super) struct ScanCapAllocationView<'a> {
    proof: ScanCapsCompared<'a>,
    model: &'static str,
}
impl<'a> ScanCapsCompared<'a> {
    pub(in super::super::super::super::super::super::super) fn into_allocation_view(
        self,
        b: &mut SharedBudget<'_>,
    ) -> Result<ScanCapAllocationView<'a>, Failure> {
        let result = (|| {
            work(b)?; // view entry, original comparison is consumed by value
            self.require_allocation(self.scope, b)?; // three fixed guards
            Ok(())
        })();
        match result {
            Ok(()) => Ok(ScanCapAllocationView {
                proof: self,
                model: VIEW_ID,
            }),
            Err(e) => Err(stop_owner(&self.owner, e, b)),
        }
    }
    fn require_allocation(
        &self,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        work(b)?; // owner/original inspection, not a session/bridge start
        if !Rc::ptr_eq(&self.owner, &b.protected_bridge_claim)
            || !Rc::ptr_eq(&self.caps.origin, &b.inspection_origin)
            || !Rc::ptr_eq(&self.session, &b.scan_session_claim)
            || self.started != b.started
            || self.caps.started != b.started
            || self.session.started.get()
            || self.owner.generated.get()
            || self.owner.used.get()
        {
            return Err(Failure::Binding);
        }
        work(b)?; // actual scope => same receipt/target/context/token; real estimate/projection borrows
        if !std::ptr::eq(self.scope, scope)
            || scope.round != Round::Initial
            || !Rc::ptr_eq(&scope.token, &self.caps.token)
            || !Rc::ptr_eq(&scope.budget_origin, &b.inspection_origin)
            || !self.estimate_claim.get()
            || !self.projection_claim.get()
        {
            return Err(Failure::Binding);
        }
        work(b)?; // immutable cap snapshot, expiry, retry/payload snapshot
        if self.caps.model != CAP_ID || self.caps.bundle != BUNDLE || self.caps.coverage != COVERAGE
        {
            return Err(Failure::Unavailable);
        }
        if self.caps.artifact != [0x82; 32] {
            return Err(Failure::Binding);
        }
        if self.caps.expires
            <= self
                .started
                .checked_add(Duration::from_secs(10))
                .ok_or(Failure::Limit)?
        {
            return Err(Failure::Expired);
        }
        if self.retries != b.retries_left {
            return Err(Failure::Changed);
        }
        let remaining = MAX_BYTES
            .checked_sub(b.used)
            .and_then(|n| n.checked_sub(b.reserved))
            .ok_or(Failure::Limit)?;
        if self.payload > remaining {
            return Err(Failure::Limit);
        }
        b.checkpoint()
    }
}
impl ScanCapAllocationView<'_> {
    #[cfg(test)]
    pub(in super::super::super::super::super::super::super) fn duplicate_fixture(&self) -> Self {
        let p = &self.proof;
        Self {
            proof: ScanCapsCompared {
                _borrow: std::marker::PhantomData,
                owner: p.owner.clone(),
                caps: p.caps,
                scope: p.scope,
                estimate_claim: p.estimate_claim,
                projection_claim: p.projection_claim,
                session: p.session.clone(),
                started: p.started,
                retries: p.retries,
                payload: p.payload,
            },
            model: self.model,
        }
    }
    pub(in super::super::super::super::super::super::super) fn owner(
        &self,
    ) -> &Rc<crate::signature_boundary::positioned_read::ProtectedBridgeClaim> {
        &self.proof.owner
    }
    pub(in super::super::super::super::super::super::super) fn require(
        &self,
        scope: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            if self.model != VIEW_ID {
                return Err(Failure::Unavailable);
            }
            self.proof.require_allocation(scope, b)
        })();
        result.map_err(|e| stop_owner(&self.proof.owner, e, b))
    }
    pub(in super::super::super::super::super::super::super) fn reject(
        &self,
        e: Failure,
        b: &mut SharedBudget<'_>,
    ) -> Failure {
        stop_owner(&self.proof.owner, e, b)
    }
}
impl std::fmt::Debug for ScanCapAllocationView<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanCapAllocationView(borrowed_partial_not_policy_or_quota)")
    }
}
