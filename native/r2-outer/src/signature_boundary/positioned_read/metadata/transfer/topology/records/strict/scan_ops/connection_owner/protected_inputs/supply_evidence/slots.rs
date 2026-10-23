//! Independent slot-evidence fragment. PolicyCaps remains unverified; no supply publication.
use super::*;
mod backend;
use backend::Backend;
#[cfg(test)]
pub(in super::super::super::super) mod synthetic;
const MODEL: &str = "bp5-r2-scan-slots-evidence-0.1";
const ORDER: [Round; 3] = [Round::Initial, Round::BeforeM4, Round::AfterM4];
struct Slot<B> {
    source: B,
    round: Round,
}
struct SlotIdentity<'s> {
    binding: held::SlotBinding<'s>,
    origins: [Rc<()>; 3],
    model: &'static str,
    issued_here: std::cell::Cell<bool>,
}
pub(in super::super::super::super) struct ScanSlotInputs<'s, R, T, S, B> {
    slots: [Option<Slot<B>>; 3], // Drop all inert scans before held/source/record owners.
    held: held::HeldEvidenceInputs<'s, R, T, S>,
    identity: Rc<SlotIdentity<'s>>,
}
pub(in super::super::super::super) struct ScanSlotsEvidence<'s> {
    identity: Rc<SlotIdentity<'s>>,
}
pub(in super::super::super::super) struct ScanSlotsChecked<'s> {
    _identity: Rc<SlotIdentity<'s>>,
}
fn validate<R: ResourceOrigin, T, S, B: Backend>(
    inputs: &ScanSlotInputs<'_, R, T, S, B>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let id = &inputs.identity;
    if id.model != MODEL {
        return Err(Failure::Unavailable);
    }
    id.binding.require(&inputs.held, b)?;
    for (i, round) in ORDER.iter().enumerate() {
        work(b)?; // O.slots_slot: exactly three fixed owned sources.
        let slot = inputs.slots[i].as_ref().ok_or(Failure::Unavailable)?;
        if slot.source.model() != backend::MODEL {
            return Err(Failure::Unavailable);
        }
        if slot.round != *round
            || !slot.source.unstarted()
            || !Rc::ptr_eq(slot.source.origin(), &id.origins[i])
            || (0..i).any(|j| Rc::ptr_eq(&id.origins[j], &id.origins[i]))
        {
            return Err(Failure::Binding);
        }
    }
    b.checkpoint()
}
fn reject(id: &SlotIdentity<'_>, reason: Failure, b: &mut SharedBudget<'_>) -> InputRejected {
    rejected(id.binding.owner(), SupplyStage::Slots, reason, b)
}
impl<'s> ScanSlotsEvidence<'s> {
    pub(in super::super::super::super) fn consume<R: ResourceOrigin, T, S, B: Backend>(
        self,
        inputs: &ScanSlotInputs<'_, R, T, S, B>,
        b: &mut SharedBudget<'_>,
    ) -> Result<ScanSlotsChecked<'s>, InputRejected> {
        let claim = &self.identity.binding.owner().bridge;
        let fresh = !claim.slots_evidence_used.replace(true);
        if !Rc::ptr_eq(claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.slots_evidence_used.set(true);
        }
        let result = (|| {
            work(b)?; // O.slots_consume entry. Plus three O.slots_slot guards = 4.
            check_identity(self.identity.binding.owner(), b)?;
            if !fresh
                || !self.identity.issued_here.get()
                || !Rc::ptr_eq(&self.identity, &inputs.identity)
            {
                return Err(Failure::Binding);
            }
            validate(inputs, b)
        })();
        match result {
            Ok(()) => Ok(ScanSlotsChecked {
                _identity: self.identity,
            }),
            Err(e) => Err(reject(&self.identity, e, b)),
        }
    }
}
impl<R, T, S, B> std::fmt::Debug for ScanSlotInputs<'_, R, T, S, B> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanSlotInputs(synthetic_inert_not_supply)")
    }
}
impl std::fmt::Debug for ScanSlotsEvidence<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanSlotsEvidence(synthetic_issuer_not_authority)")
    }
}
impl std::fmt::Debug for ScanSlotsChecked<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanSlotsChecked(independent_fragment_policy_unverified)")
    }
}
