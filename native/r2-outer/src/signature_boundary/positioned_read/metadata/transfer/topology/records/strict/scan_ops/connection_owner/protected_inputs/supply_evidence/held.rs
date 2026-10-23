//! Immutable synthetic held-source acquisition; no operational issuer or extraction API.
use super::*;
use records::ContextRecordsChecked;

const HELD_MODEL: &str = "bp5-r2-held-sources-evidence-0.1";
struct HeldIdentity {
    owner: Rc<Identity>,
    model: &'static str,
    issued_here: std::cell::Cell<bool>,
}
pub(in super::super::super::super) struct HeldEvidenceInputs<'s, R, T, S> {
    // Fixed drop order. Proofs hold identities only, never these resources.
    record_source: S,
    topology_source: T,
    held: HeldTargetScope<'s, R>,
    topology: TopologyReceipt,
    receipt: RecordReceipt,
    _context: &'s InspectionContext<'s>,
    identity: Rc<HeldIdentity>,
    record_origin: Rc<()>,
    topology_origin: Rc<()>,
}
pub(in super::super::super::super) struct HeldSourcesEvidence<'s> {
    identity: Rc<HeldIdentity>,
    leaf: Rc<()>,
    lineage: Rc<()>,
    record_origin: Rc<()>,
    topology_origin: Rc<()>,
    bound: &'s BoundTarget<'s>,
}
pub(in super::super::super::super) struct HeldSourcesChecked {
    _identity: Rc<HeldIdentity>,
}
fn guard(id: &HeldIdentity, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    check_identity(&id.owner, b)?;
    if id.model != HELD_MODEL {
        return Err(Failure::Unavailable);
    }
    if !id.owner.records_issued_here.get() || !id.owner.bridge.records_evidence_used.get() {
        return Err(Failure::Binding);
    }
    Ok(())
}
impl HeldSourcesEvidence<'_> {
    #[cfg(test)]
    pub(in super::super::super::super) fn duplicate_fixture(&self) -> Self {
        Self {
            identity: self.identity.clone(),
            leaf: self.leaf.clone(),
            lineage: self.lineage.clone(),
            record_origin: self.record_origin.clone(),
            topology_origin: self.topology_origin.clone(),
            bound: self.bound,
        }
    }
    pub(in super::super::super::super) fn consume<R: ResourceOrigin, T, S>(
        self,
        checked: ContextRecordsChecked,
        inputs: &HeldEvidenceInputs<'_, R, T, S>,
        b: &mut SharedBudget<'_>,
    ) -> Result<HeldSourcesChecked, InputRejected> {
        let claim = &self.identity.owner.bridge;
        let fresh = !claim.held_evidence_used.replace(true);
        if !Rc::ptr_eq(claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.held_evidence_used.set(true);
        }
        let result = (|| {
            work(b)?; // O.evidence_held_consume 1: fixed identity and one-shot guard only.
            guard(&self.identity, b)?;
            if !fresh
                || !self.identity.issued_here.get()
                || !checked.same_issuer(&self.identity.owner)
                || !Rc::ptr_eq(&self.identity, &inputs.identity)
                || !Rc::ptr_eq(&self.leaf, inputs.held.source.leaf.resource_origin())
                || !Rc::ptr_eq(&self.leaf, &inputs.held.initial_origin)
                || !Rc::ptr_eq(&self.lineage, &inputs.receipt.lineage)
                || !Rc::ptr_eq(&self.lineage, &inputs.topology.lineage)
                || !Rc::ptr_eq(&self.record_origin, &inputs.record_origin)
                || !Rc::ptr_eq(&self.topology_origin, &inputs.topology_origin)
                || !std::ptr::eq(self.bound, inputs.held.bound)
            {
                return Err(Failure::Binding);
            }
            b.checkpoint()
        })();
        drop(checked);
        match result {
            Ok(()) => Ok(HeldSourcesChecked {
                _identity: self.identity,
            }),
            Err(e) => Err(rejected(
                &self.identity.owner,
                SupplyStage::HeldSources,
                e,
                b,
            )),
        }
    }
}
#[cfg(test)]
pub(in super::super::super::super) fn acquire<
    's,
    R: MetadataOps + ResourceOrigin,
    T: TopologySource<R>,
    S,
>(
    inputs: EvidenceInputs<'s, S>,
    held: HeldTargetScope<'s, R>,
    topology: TopologyReceipt,
    source: T,
    b: &mut SharedBudget<'_>,
) -> Result<HeldEvidenceInputs<'s, R, T, S>, InputRejected> {
    let EvidenceInputs {
        source: record_source,
        receipt,
        context,
        bound,
        identity,
        source_origin,
    } = inputs;
    let mut inputs = HeldEvidenceInputs {
        record_source,
        topology_source: source,
        held,
        topology,
        receipt,
        _context: context,
        identity: Rc::new(HeldIdentity {
            owner: identity,
            model: HELD_MODEL,
            issued_here: std::cell::Cell::new(false),
        }),
        record_origin: source_origin,
        topology_origin: Rc::new(()),
    };
    let result = (|| {
        work(b)?; // Synthetic held acquisition dispatch. Dynamic acquisition is not this guard.
        guard(&inputs.identity, b)?;
        if !std::ptr::eq(bound, inputs.held.bound)
            || !Rc::ptr_eq(
                &inputs.held.initial_origin,
                inputs.held.source.leaf.resource_origin(),
            )
        {
            return Err(Failure::Binding);
        }
        // Existing bounded attach/topology contracts; never trust a diagnostic or FD number.
        recheck(
            bound,
            &inputs.held.ancestors,
            &inputs.held.initial,
            &inputs.topology,
            &mut inputs.topology_source,
            b,
        )?;
        let device = inputs.held.initial.stat.device;
        {
            let mut read = b.begin(&mut inputs.held.source.leaf, bound.bytes)?;
            let raw = read.collect_metadata_after_open(Phase::M0, device)?;
            if normalize(raw, device, bound.bytes)? != inputs.held.initial {
                return Err(Failure::Changed);
            }
            read.checkpoint()?;
        } // Releases A/B reservation without reading payload or issuing a comparison.
        if !Rc::ptr_eq(
            &inputs.held.initial_origin,
            inputs.held.source.leaf.resource_origin(),
        ) {
            return Err(Failure::SourceMismatch);
        }
        recheck(
            bound,
            &inputs.held.ancestors,
            &inputs.held.initial,
            &inputs.topology,
            &mut inputs.topology_source,
            b,
        )?;
        b.checkpoint()
    })();
    match result {
        Ok(()) => Ok(inputs),
        Err(e) => Err(rejected(
            &inputs.identity.owner,
            SupplyStage::HeldSources,
            e,
            b,
        )),
    }
}
#[cfg(test)]
impl<'s, R: ResourceOrigin, T, S> HeldEvidenceInputs<'s, R, T, S> {
    pub(in super::super::super::super) fn corrupt_fixture(&mut self, fault: u8) {
        match fault {
            0 => self.topology_origin = Rc::new(()),
            1 => self.record_origin = Rc::new(()),
            2 => self.receipt.lineage = Rc::new(()),
            3 => self.topology.lineage = Rc::new(()),
            4 => self.held.initial_origin = Rc::new(()),
            5 => self.identity.issued_here.set(false),
            _ => unreachable!(),
        }
    }
    pub(in super::super::super::super) fn issue(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<HeldSourcesEvidence<'s>, InputRejected> {
        let id = &self.identity;
        let fresh = !id.owner.bridge.held_evidence_issued.replace(true);
        if !Rc::ptr_eq(&id.owner.bridge, &b.protected_bridge_claim) {
            b.protected_bridge_claim.held_evidence_issued.set(true);
        }
        let result = (|| {
            work(b)?; // O.evidence_held_issue 1; acquisition costs are separate.
            guard(id, b)?;
            if !fresh {
                return Err(Failure::Binding);
            }
            b.checkpoint()
        })();
        match result {
            Ok(()) => {
                id.issued_here.set(true);
                Ok(HeldSourcesEvidence {
                    identity: id.clone(),
                    leaf: self.held.initial_origin.clone(),
                    lineage: self.receipt.lineage.clone(),
                    record_origin: self.record_origin.clone(),
                    topology_origin: self.topology_origin.clone(),
                    bound: self.held.bound,
                })
            }
            Err(e) => Err(rejected(&id.owner, SupplyStage::HeldSources, e, b)),
        }
    }
}
impl<R, T, S> std::fmt::Debug for HeldEvidenceInputs<'_, R, T, S> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HeldEvidenceInputs(immutable_synthetic_acquisition_not_authority)")
    }
}
impl std::fmt::Debug for HeldSourcesEvidence<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HeldSourcesEvidence(synthetic_issuer_not_authority)")
    }
}
impl std::fmt::Debug for HeldSourcesChecked {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HeldSourcesChecked(not_supply_or_execution_authority)")
    }
}
