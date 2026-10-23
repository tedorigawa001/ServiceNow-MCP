//! Isolated context/records evidence subset. No operational issuer or supply publication.
use super::*;
use result_owner::SupplyStage;

mod context;
pub(in super::super::super) mod held;
mod records;
pub(in super::super::super) mod slots;
use context::ContextChecked;
#[cfg(test)]
pub(in super::super::super) mod synthetic;

const MODEL: &str = "bp5-r2-context-records-evidence-0.1";
struct Identity {
    model: &'static str,
    origin: Rc<()>,
    bridge: Rc<ProtectedBridgeClaim>,
    session: Rc<ScanSessionClaim>,
    started: Instant,
    // Per-issuer flags: consume checks the identity it was issued from, for both proofs.
    context_issued_here: std::cell::Cell<bool>,
    records_issued_here: std::cell::Cell<bool>,
}
// Immutable owned receipt/source pairing. No mutation/extraction API in non-test builds.
// The only acquisition constructor is synthetic::acquire under cfg(test).
pub(in super::super::super) struct EvidenceInputs<'s, S> {
    source: S, // Fixed drop order: source before its owned record receipt.
    receipt: RecordReceipt,
    context: &'s InspectionContext<'s>,
    bound: &'s BoundTarget<'s>,
    identity: Rc<Identity>,
    source_origin: Rc<()>,
}
fn check_identity(id: &Identity, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    b.checkpoint()?;
    if id.model != MODEL {
        return Err(Failure::Unavailable);
    }
    if !Rc::ptr_eq(&id.origin, &b.inspection_origin)
        || !Rc::ptr_eq(&id.bridge, &b.protected_bridge_claim)
        || !Rc::ptr_eq(&id.session, &b.scan_session_claim)
        || id.started != b.started
        || id.session.started.get()
        || id.bridge.generated.get()
        || id.bridge.used.get()
    {
        return Err(Failure::Binding);
    }
    if let Some(e) = id.bridge.failure.get() {
        return Err(e);
    }
    Ok(())
}
fn rejected(
    id: &Identity,
    stage: SupplyStage,
    reason: Failure,
    b: &mut SharedBudget<'_>,
) -> InputRejected {
    let first = id.bridge.failure.get().unwrap_or(reason);
    let first = b.stop::<()>(first).unwrap_err();
    latch(&id.bridge, first);
    InputRejected::at(InputLocation::Supply(stage), first, b)
}
impl<S> std::fmt::Debug for EvidenceInputs<'_, S> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("EvidenceInputs(immutable_synthetic_acquisition_not_authority)")
    }
}
#[cfg(test)]
impl<'s, S> EvidenceInputs<'s, S> {
    pub(in super::super::super) fn issue_context(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<context::ContextEvidence<'s>, InputRejected> {
        context::issue(self, b)
    }
    pub(in super::super::super) fn issue_records(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<records::RecordsEvidence<'s>, InputRejected> {
        records::issue(self, b)
    }
    pub(in super::super::super) fn source_for_test(&self) -> &S {
        &self.source
    }
    // Deliberate private-fixture corruption, never a production mutation/extraction API.
    pub(in super::super::super) fn corrupt_for_test(&mut self, fault: u8) {
        match fault {
            0 => self.source_origin = Rc::new(()),
            1 => self.receipt.lineage = Rc::new(()),
            2 => {
                self.identity = Rc::new(Identity {
                    model: MODEL,
                    origin: self.identity.origin.clone(),
                    bridge: self.identity.bridge.clone(),
                    session: self.identity.session.clone(),
                    started: self.identity.started,
                    context_issued_here: std::cell::Cell::new(true),
                    records_issued_here: std::cell::Cell::new(false),
                })
            }
            _ => unreachable!(),
        }
    }
}

#[cfg(test)]
mod contracts {
    use super::*;
    #[test]
    fn evidence_types_are_move_only_opaque_and_not_serializable() {
        macro_rules! not_impl {
            ($t:ty,$bound:path) => {{
                trait Ambiguous<A> {
                    fn check() {}
                }
                impl<T: ?Sized> Ambiguous<()> for T {}
                impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
                let _ = <$t as Ambiguous<_>>::check;
            }};
        }
        macro_rules! opaque {
            ($t:ty) => {{
                not_impl!($t, Clone);
                not_impl!($t, Copy);
                not_impl!($t, serde::Serialize);
                not_impl!($t, serde::de::DeserializeOwned);
            }};
        }
        opaque!(EvidenceInputs<'static, ()>);
        opaque!(context::ContextEvidence<'static>);
        opaque!(context::ContextChecked);
        opaque!(records::RecordsEvidence<'static>);
        opaque!(records::ContextRecordsChecked);
        opaque!(held::HeldEvidenceInputs<'static, (), (), ()>);
        opaque!(held::HeldSourcesEvidence<'static>);
        opaque!(held::HeldSourcesChecked);
        opaque!(slots::ScanSlotInputs<'static, (), (), (), ()>);
        opaque!(slots::ScanSlotsEvidence<'static>);
        opaque!(slots::ScanSlotsChecked<'static>);
        assert!(std::mem::size_of::<context::ContextEvidence<'static>>() <= 32);
        assert!(std::mem::size_of::<records::RecordsEvidence<'static>>() <= 64);
        assert!(std::mem::size_of::<ProtectedBridgeClaim>() <= 64);
        assert!(std::mem::size_of::<held::HeldSourcesEvidence<'static>>() <= 64);
        assert!(std::mem::size_of::<slots::ScanSlotsEvidence<'static>>() <= 32);
    }
    #[test]
    fn evidence_issued_before_preparation_latches_later_budget_stops() {
        for stage in 0..4 {
            let cancel = std::sync::atomic::AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let claim = b.protected_bridge_claim.clone();
            // Synthetic issuers have consumed only their issue flag; no preparation/generation yet.
            if stage == 3 {
                claim.slots_evidence_issued.set(true);
            } else if stage == 2 {
                claim.held_evidence_issued.set(true);
            } else if stage == 1 {
                claim.records_evidence_issued.set(true);
            } else {
                claim.context_evidence_issued.set(true);
            }
            assert_eq!(b.stop::<()>(Failure::Deadline), Err(Failure::Deadline));
            assert_eq!(claim.failure.get(), Some(Failure::Deadline));
            assert!(!claim.preparation_started.get() && !claim.generated.get());
            assert_eq!(b.stop::<()>(Failure::Binding), Err(Failure::Deadline));
            assert_eq!(claim.failure.get(), Some(Failure::Deadline));
        }
    }
}
