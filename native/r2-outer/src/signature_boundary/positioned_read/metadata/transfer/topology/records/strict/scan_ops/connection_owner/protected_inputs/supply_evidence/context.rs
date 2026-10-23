use super::*;

pub(in super::super::super::super) struct ContextEvidence<'s> {
    owner: Rc<Identity>,
    context: &'s InspectionContext<'s>,
}
pub(in super::super::super::super) struct ContextChecked {
    owner: Rc<Identity>,
}
impl ContextChecked {
    #[cfg(test)]
    pub(in super::super::super::super) fn duplicate_fixture(&self) -> Self {
        Self {
            owner: self.owner.clone(),
        }
    }
    pub(super) fn same_issuer(&self, owner: &Rc<Identity>) -> bool {
        Rc::ptr_eq(&self.owner, owner)
    }
}
impl ContextEvidence<'_> {
    #[cfg(test)]
    pub(in super::super::super::super) fn duplicate_fixture(&self) -> Self {
        Self {
            owner: self.owner.clone(),
            context: self.context,
        }
    }
    pub(in super::super::super::super) fn consume<S>(
        self,
        inputs: &EvidenceInputs<'_, S>,
        b: &mut SharedBudget<'_>,
    ) -> Result<ContextChecked, InputRejected> {
        let fresh = !self.owner.bridge.context_evidence_used.replace(true);
        if !Rc::ptr_eq(&self.owner.bridge, &b.protected_bridge_claim) {
            b.protected_bridge_claim.context_evidence_used.set(true);
        }
        let result = (|| {
            work(b)?; // O.evidence_context_consume 1: fixed identity/linear consumption guard.
            check_identity(&self.owner, b)?;
            if !fresh
                || !self.owner.context_issued_here.get()
                || !Rc::ptr_eq(&self.owner, &inputs.identity)
                || !std::ptr::eq(self.context, inputs.context)
            {
                return Err(Failure::Binding);
            }
            b.checkpoint()
        })();
        match result {
            Ok(()) => Ok(ContextChecked { owner: self.owner }),
            Err(e) => Err(rejected(&self.owner, SupplyStage::Context, e, b)),
        }
    }
}
#[cfg(test)]
pub(super) fn issue<'s, S>(
    inputs: &EvidenceInputs<'s, S>,
    b: &mut SharedBudget<'_>,
) -> Result<ContextEvidence<'s>, InputRejected> {
    let id = &inputs.identity;
    let fresh = !id.bridge.context_evidence_issued.replace(true);
    if !Rc::ptr_eq(&id.bridge, &b.protected_bridge_claim) {
        b.protected_bridge_claim.context_evidence_issued.set(true);
    }
    let result = (|| {
        work(b)?; // O.evidence_context_issue 1. Acquisition validation is separate.
        check_identity(id, b)?;
        if !fresh {
            return Err(Failure::Binding);
        }
        b.checkpoint()
    })();
    match result {
        Ok(()) => {
            id.context_issued_here.set(true);
            Ok(ContextEvidence {
                owner: id.clone(),
                context: inputs.context,
            })
        }
        Err(e) => Err(rejected(id, SupplyStage::Context, e, b)),
    }
}
impl std::fmt::Debug for ContextEvidence<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ContextEvidence(synthetic_issuer_not_authority)")
    }
}
impl std::fmt::Debug for ContextChecked {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ContextChecked(awaiting_records_not_authority)")
    }
}
