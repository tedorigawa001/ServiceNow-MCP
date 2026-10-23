//! Fixed three-source factory only. No arbitrary source/factory/model input.
use super::*;
use backend::{Audit, SyntheticBackend};
#[derive(Clone, Copy)]
pub(in super::super::super::super::super) enum Fault {
    Swap(usize, usize),
    Round(usize),
    Missing(usize),
    Foreign(usize),
    Duplicate(usize),
    Model(usize),
    Held(u8),
    Unissued,
}
fn change<R: ResourceOrigin, T, S>(
    inputs: &mut ScanSlotInputs<'_, R, T, S, SyntheticBackend>,
    fault: Fault,
) {
    match fault {
        Fault::Swap(a, b) => inputs.slots.swap(a, b),
        Fault::Round(i) => inputs.slots[i].as_mut().unwrap().round = ORDER[(i + 1) % 3],
        Fault::Missing(i) => {
            inputs.slots[i].take();
        }
        Fault::Foreign(i) => inputs.slots[i].as_mut().unwrap().source.origin = Rc::new(()),
        Fault::Duplicate(i) => {
            let origin = inputs.slots[0].as_ref().unwrap().source.origin().clone();
            inputs.slots[i].as_mut().unwrap().source.origin = origin;
        }
        Fault::Model(i) => inputs.slots[i].as_mut().unwrap().source.model = "unknown",
        Fault::Held(i) => inputs.held.corrupt_fixture(i),
        Fault::Unissued => inputs.identity.issued_here.set(false),
    }
}
fn exercise<R, T, S>(
    inputs: &mut ScanSlotInputs<'_, R, T, S, SyntheticBackend>,
    index: usize,
    op: u8,
) {
    let source = &mut inputs.slots[index].as_mut().unwrap().source;
    match op {
        0 => {
            let _ = source.open(None, None, scan_ops::Kind::Anchor);
        }
        1 => {
            let _ = source.acl_init(&());
        }
        2 => {
            let _ = source.enumerate(&(), &mut [0; 255]);
        }
        3 => {
            let _ = source.read(&(), 0, &mut [0; 1]);
        }
        4 => {
            let _ = source.metadata(&(), scan_ops::MetaOp::Stat, &mut []);
        }
        5 => {
            let _ = source.cleanup(());
        }
        _ => unreachable!(),
    }
}
pub(in super::super::super::super::super) struct Candidate<'s, R, T, S> {
    inputs: ScanSlotInputs<'s, R, T, S, SyntheticBackend>,
    audit: Audit,
}
impl<R, T, S> std::fmt::Debug for Candidate<'_, R, T, S> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanSlotCandidate(unverified_not_authority)")
    }
}
pub(in super::super::super::super::super) fn prepare<'s, R: ResourceOrigin, T, S>(
    held: held::HeldEvidenceInputs<'s, R, T, S>,
    checked: held::HeldSourcesChecked,
    b: &mut SharedBudget<'_>,
) -> Result<Candidate<'s, R, T, S>, InputRejected> {
    let owner = held.slot_owner().clone();
    let binding = (|| {
        work(b)?;
        held.bind_slots(checked, b)
    })()
    .map_err(|e| rejected(&owner, SupplyStage::Slots, e, b))?;
    let audit = Audit::default();
    let slots = ORDER.map(|round| {
        Some(Slot {
            source: SyntheticBackend::fresh(audit.clone()),
            round,
        })
    });
    let origins = std::array::from_fn(|i| slots[i].as_ref().unwrap().source.origin().clone());
    let identity = Rc::new(SlotIdentity {
        binding,
        origins,
        model: MODEL,
        issued_here: std::cell::Cell::new(false),
    });
    Ok(Candidate {
        inputs: ScanSlotInputs {
            slots,
            held,
            identity,
        },
        audit,
    })
}
impl<'s, R: ResourceOrigin, T, S> Candidate<'s, R, T, S> {
    pub(in super::super::super::super::super) fn canonical_alias_fixture(&mut self, i: usize) {
        let origin = self.inputs.slots[0]
            .as_ref()
            .unwrap()
            .source
            .origin()
            .clone();
        self.inputs.slots[i].as_mut().unwrap().source.origin = origin.clone();
        Rc::get_mut(&mut self.inputs.identity).unwrap().origins[i] = origin;
    }
    pub(in super::super::super::super::super) fn change(&mut self, f: Fault) {
        change(&mut self.inputs, f);
    }
    pub(in super::super::super::super::super) fn exercise(&mut self, i: usize, op: u8) {
        exercise(&mut self.inputs, i, op);
    }
    pub(in super::super::super::super::super) fn audit(&self) -> Audit {
        self.audit.clone()
    }
    pub(in super::super::super::super::super) fn acquire(
        self,
        b: &mut SharedBudget<'_>,
    ) -> Result<ScanSlotInputs<'s, R, T, S, SyntheticBackend>, InputRejected> {
        let result = (|| {
            work(b)?;
            validate(&self.inputs, b)
        })();
        match result {
            Ok(()) => Ok(self.inputs),
            Err(e) => Err(reject(&self.inputs.identity, e, b)),
        }
    }
}
impl<'s, R: ResourceOrigin, T, S> ScanSlotInputs<'s, R, T, S, SyntheticBackend> {
    pub(in super::super::super::super::super) fn change(&mut self, f: Fault) {
        change(self, f);
    }
    pub(in super::super::super::super::super) fn exercise(&mut self, i: usize, op: u8) {
        exercise(self, i, op);
    }
    pub(in super::super::super::super::super) fn issue(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<ScanSlotsEvidence<'s>, InputRejected> {
        let claim = &self.identity.binding.owner().bridge;
        let fresh = !claim.slots_evidence_issued.replace(true);
        if !Rc::ptr_eq(claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.slots_evidence_issued.set(true);
        }
        let result = (|| {
            work(b)?;
            check_identity(self.identity.binding.owner(), b)?;
            if !fresh {
                return Err(Failure::Binding);
            }
            validate(self, b)
        })();
        match result {
            Ok(()) => {
                self.identity.issued_here.set(true);
                Ok(ScanSlotsEvidence {
                    identity: self.identity.clone(),
                })
            }
            Err(e) => Err(reject(&self.identity, e, b)),
        }
    }
}
impl ScanSlotsEvidence<'_> {
    pub(in super::super::super::super::super) fn duplicate_fixture(&self) -> Self {
        Self {
            identity: self.identity.clone(),
        }
    }
}
