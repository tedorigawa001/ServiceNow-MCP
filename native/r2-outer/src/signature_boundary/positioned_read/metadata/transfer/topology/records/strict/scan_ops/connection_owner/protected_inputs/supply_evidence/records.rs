use super::*;

pub(in super::super::super::super) struct RecordsEvidence<'s> {
    owner: Rc<Identity>,
    lineage: Rc<()>,
    source: Rc<()>,
    bound: &'s BoundTarget<'s>,
}
pub(in super::super::super::super) struct ContextRecordsChecked {
    _owner: Rc<Identity>,
}
impl RecordsEvidence<'_> {
    #[cfg(test)]
    pub(in super::super::super::super) fn duplicate_fixture(&self) -> Self {
        Self {
            owner: self.owner.clone(),
            lineage: self.lineage.clone(),
            source: self.source.clone(),
            bound: self.bound,
        }
    }
    pub(in super::super::super::super) fn consume<S>(
        self,
        context: ContextChecked,
        inputs: &EvidenceInputs<'_, S>,
        b: &mut SharedBudget<'_>,
    ) -> Result<ContextRecordsChecked, InputRejected> {
        let fresh = !self.owner.bridge.records_evidence_used.replace(true);
        if !Rc::ptr_eq(&self.owner.bridge, &b.protected_bridge_claim) {
            b.protected_bridge_claim.records_evidence_used.set(true);
        }
        let result = (|| {
            work(b)?; // O.evidence_records_consume 1; immutable owner, no whole-binding copy/compare.
            check_identity(&self.owner, b)?;
            if !fresh
                || !self.owner.records_issued_here.get()
                || !context.same_issuer(&self.owner)
                || !self.owner.bridge.context_evidence_used.get()
                || !Rc::ptr_eq(&self.owner, &inputs.identity)
                || !Rc::ptr_eq(&self.lineage, &inputs.receipt.lineage)
                || !Rc::ptr_eq(&self.source, &inputs.source_origin)
                || !std::ptr::eq(self.bound, inputs.bound)
            {
                return Err(Failure::Binding);
            }
            b.checkpoint()
        })();
        drop(context);
        match result {
            Ok(()) => Ok(ContextRecordsChecked { _owner: self.owner }),
            Err(e) => Err(rejected(&self.owner, SupplyStage::ReceiptTarget, e, b)),
        }
    }
}
#[cfg(test)]
pub(super) fn issue<'s, S>(
    inputs: &EvidenceInputs<'s, S>,
    b: &mut SharedBudget<'_>,
) -> Result<RecordsEvidence<'s>, InputRejected> {
    let id = &inputs.identity;
    let fresh = !id.bridge.records_evidence_issued.replace(true);
    if !Rc::ptr_eq(&id.bridge, &b.protected_bridge_claim) {
        b.protected_bridge_claim.records_evidence_issued.set(true);
    }
    let result = (|| {
        work(b)?; // O.evidence_records_issue 1. Acquisition checks are not repeated here.
        check_identity(id, b)?;
        if !fresh || !id.context_issued_here.get() {
            return Err(Failure::Binding);
        }
        b.checkpoint()
    })();
    match result {
        Ok(()) => {
            id.records_issued_here.set(true);
            Ok(RecordsEvidence {
                owner: id.clone(),
                lineage: inputs.receipt.lineage.clone(),
                source: inputs.source_origin.clone(),
                bound: inputs.bound,
            })
        }
        Err(e) => Err(rejected(id, SupplyStage::ReceiptTarget, e, b)),
    }
}
impl std::fmt::Debug for RecordsEvidence<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RecordsEvidence(synthetic_issuer_not_authority)")
    }
}
impl std::fmt::Debug for ContextRecordsChecked {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ContextRecordsChecked(not_supply_or_execution_authority)")
    }
}
