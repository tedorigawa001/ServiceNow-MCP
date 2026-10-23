//! Protected-input ownership/claim and fixed release transfer. No operational producer/permit.
use super::*;
use crate::signature_boundary::positioned_read::{ProtectedBridgeClaim, ScanSessionClaim};
use outer_result::DropObservation;
use result_owner::{
    CreateStage, InputLocation, InputRejected, InputStage, StrictBridgeFailure, StrictBridgeResult,
};
pub(in super::super) mod preparation;
pub(in super::super) mod supply_evidence;

pub(in super::super) const MODEL_ID: &str = "bp5-r2-protected-bridge-0.1";
struct Tagged<T> {
    value: T,
    supply: Rc<()>,
    slot: usize,
}
struct Seal<'s> {
    supply: Rc<()>,
    origin: Rc<()>,
    claim: Rc<ProtectedBridgeClaim>,
    session: Rc<ScanSessionClaim>,
    started: Instant,
    context: &'s InspectionContext<'s>,
    bound: &'s BoundTarget<'s>,
    held_origin: Rc<()>,
}
// Field order is the fixed discard order, including owner-generation failures.
struct Payload<'s, R, T, S, C> {
    scans: [Tagged<C>; 3],
    resources: Option<Tagged<session::ResourceInput>>,
    quotas: [Option<Tagged<Quotas>>; 3],
    source: Tagged<S>,
    topology_source: Tagged<T>,
    held: HeldTargetScope<'s, R>,
    topology: TopologyReceipt,
    records: RecordReceipt,
    context: &'s InspectionContext<'s>,
}
pub(in super::super) struct ProtectedSupply<'s, R, T, S, C> {
    payload: Payload<'s, R, T, S, C>,
    seal: Seal<'s>,
}
pub(in super::super) struct ProtectedStrictInputs<'s, R, T, S, C> {
    // The fixed transfer takes this once despite Drop; never refilled.
    payload: Option<Payload<'s, R, T, S, C>>,
    seal: Seal<'s>,
}
impl<R, T, S, C> std::fmt::Debug for ProtectedStrictInputs<'_, R, T, S, C> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ProtectedStrictInputs(inert_not_dispatch_or_execution_authority)")
    }
}
fn latch(claim: &ProtectedBridgeClaim, reason: Failure) -> Failure {
    let reason = claim.failure.get().unwrap_or(reason);
    claim.failure.set(Some(reason));
    reason
}
fn reject<T>(seal: &Seal<'_>, b: &mut SharedBudget<'_>, e: Failure) -> Result<T, Failure> {
    // Both the original inspection and a wrongly supplied inspection must stop.
    let reason = seal.claim.failure.get().unwrap_or(e);
    let current = b.stop::<()>(reason).unwrap_err();
    latch(&seal.claim, current);
    Err(current)
}
fn inspection(seal: &Seal<'_>, b: &SharedBudget<'_>) -> Result<(), Failure> {
    if !Rc::ptr_eq(&seal.origin, &b.inspection_origin)
        || !Rc::ptr_eq(&seal.claim, &b.protected_bridge_claim)
        || !Rc::ptr_eq(&seal.session, &b.scan_session_claim)
        || seal.started != b.started
        || seal.session.started.get()
    {
        return Err(Failure::Binding);
    }
    if let Some(e) = seal.claim.failure.get() {
        return Err(e);
    }
    Ok(())
}
#[cfg(test)]
pub(in super::super) fn create<'s, R, T, S, C>(
    supply: ProtectedSupply<'s, R, T, S, C>,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<ProtectedStrictInputs<'s, R, T, S, C>, Failure> {
    create_typed(supply, expected, b).map_err(|e| StrictBridgeFailure::input(e).reason())
}
pub(super) fn create_typed<'s, R, T, S, C>(
    supply: ProtectedSupply<'s, R, T, S, C>,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<ProtectedStrictInputs<'s, R, T, S, C>, InputRejected> {
    let fresh = !supply.seal.claim.generated.replace(true);
    if !Rc::ptr_eq(&supply.seal.claim, &b.protected_bridge_claim) {
        b.protected_bridge_claim.generated.set(true);
    }
    let mut stage = CreateStage::ClaimModel;
    let result = (|| {
        work(b)?; // O.bridge_create 1: irreversible creation/model
        if !fresh {
            return Err(Failure::Binding);
        }
        if expected != MODEL_ID {
            return Err(Failure::Unavailable);
        }
        stage = CreateStage::InspectionPublish;
        work(b)?; // O.bridge_create 2: original inspection/publication
        inspection(&supply.seal, b)?;
        b.checkpoint()
    })();
    match result {
        Ok(()) => Ok(ProtectedStrictInputs {
            payload: Some(supply.payload),
            seal: supply.seal,
        }),
        Err(e) => {
            let reason = reject::<()>(&supply.seal, b, e).unwrap_err();
            let rejection = InputRejected::at(InputLocation::Create(stage), reason, b);
            drop(supply); // Fixed payload field order, before terminal observation.
            Err(rejection.after_release(DropObservation::SequenceReturned, b))
        }
    }
}
impl<'s, R, T, S, C> ProtectedStrictInputs<'s, R, T, S, C> {
    // Test-only direct check. Production uses it only inside the fixed into_release transfer.
    #[cfg(test)]
    pub(in super::super) fn require_use(
        &mut self,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        self.require_use_at(expected, b)
            .map_err(|(_, reason)| reason)
    }
    fn require_use_at(
        &mut self,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), (InputStage, Failure)> {
        let mut stage = InputStage::ModelInputUnavailable;
        let fresh = !self.seal.claim.used.replace(true);
        if !Rc::ptr_eq(&self.seal.claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.used.set(true);
        }
        let result = (|| {
            work(b)?; // O.bridge_use 1
            let Some(payload) = &self.payload else {
                return Err(Failure::Binding);
            };
            if !fresh || !self.seal.claim.generated.get() {
                return Err(Failure::Binding);
            }
            if expected != MODEL_ID {
                return Err(Failure::Unavailable);
            }
            stage = InputStage::InspectionBinding;
            work(b)?; // 2
            inspection(&self.seal, b)?;
            stage = InputStage::ContextBinding;
            work(b)?; // 3: immutable context retention
            if !std::ptr::eq(payload.context, self.seal.context) {
                return Err(Failure::Binding);
            }
            stage = InputStage::ReceiptBinding;
            work(b)?; // 4: receipt/target; the external bind copy is allowed only with lineage
            let bound = payload.held.bound;
            if !std::ptr::eq(bound, self.seal.bound)
                || !Rc::ptr_eq(&payload.records.lineage, bound.lineage)
                || payload.records.binding != *bound.records
                || payload.topology.target != *bound.target
                || payload.topology.records != payload.records.binding
                || !Rc::ptr_eq(&payload.topology.lineage, &payload.records.lineage)
            {
                return Err(Failure::Binding);
            }
            stage = InputStage::SourceBinding;
            work(b)?; // 5: same held/open/source supply; no OS identity assertion
            if !Rc::ptr_eq(&payload.held.initial_origin, &self.seal.held_origin)
                || !self.tag(&payload.source, 0)
                || !self.tag(&payload.topology_source, 0)
            {
                return Err(Failure::Binding);
            }
            stage = InputStage::PolicyBinding;
            work(b)?; // 6: supply seal only; operational policy/model approval is NOT supplied
            let Some(resources) = &payload.resources else {
                return Err(Failure::Unavailable);
            };
            if !self.tag(resources, 0) {
                return Err(Failure::Binding);
            }
            for i in 0..3 {
                stage = InputStage::SlotBinding;
                work(b)?; // 7..9
                let Some(quota) = &payload.quotas[i] else {
                    return Err(Failure::Unavailable);
                };
                if !self.tag(quota, i) || !self.tag(&payload.scans[i], i) {
                    return Err(Failure::Binding);
                }
            }
            stage = InputStage::InspectionBinding;
            work(b)?; // 10: terminal identity-check checkpoint, NOT a dispatch
            b.checkpoint()
        })();
        match result {
            Ok(()) => Ok(()),
            Err(e) => Err((stage, reject::<()>(&self.seal, b, e).unwrap_err())),
        }
    }
    fn tag<V>(&self, value: &Tagged<V>, slot: usize) -> bool {
        Rc::ptr_eq(&value.supply, &self.seal.supply) && value.slot == slot
    }
}

impl<R, T, S, C> ProtectedStrictInputs<'_, R, T, S, C> {
    pub(super) fn discard(
        self,
        location: InputLocation,
        reason: Failure,
        b: &mut SharedBudget<'_>,
    ) -> InputRejected {
        // No retry/dispatch is permitted after owner rejection, including a foreign budget.
        self.seal.claim.used.set(true);
        if !Rc::ptr_eq(&self.seal.claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.used.set(true);
        }
        let reason = reject::<()>(&self.seal, b, reason).unwrap_err();
        let rejection = InputRejected::at(location, reason, b);
        drop(self); // All owned inputs in fixed payload field order, before the checkpoint.
        rejection.after_release(DropObservation::SequenceReturned, b)
    }
}
impl<R: MetadataOps + ResourceOrigin, T: TopologySource<R>, S: RecordSource, C: ScanOps>
    ProtectedStrictInputs<'_, R, T, S, C>
{
    // The only payload take; no raw transfer object/getter or caller-selected callee.
    #[allow(clippy::result_large_err)] // Retain the original bounded diagnostic inline, including after stop.
    pub(super) fn into_release(mut self, b: &mut SharedBudget<'_>) -> StrictBridgeResult {
        if let Err((stage, reason)) = self.require_use_at(MODEL_ID, b) {
            return Err(StrictBridgeFailure::input(self.discard(
                InputLocation::Use(stage),
                reason,
                b,
            )));
        }
        let transfer = (|| {
            work(b)?;
            inspection(&self.seal, b)?;
            b.checkpoint()
        })(); // O.bridge_transfer 1
        if let Err(reason) = transfer {
            return Err(StrictBridgeFailure::input(self.discard(
                InputLocation::TransferCommit,
                reason,
                b,
            )));
        }
        let Some(payload) = self.payload.take() else {
            return Err(StrictBridgeFailure::input(self.discard(
                InputLocation::TransferCommit,
                Failure::Binding,
                b,
            )));
        };
        drop(self); // Empty shell: must not latch abandonment after ownership has moved.
        let Payload {
            scans,
            resources,
            quotas,
            source,
            topology_source,
            held,
            topology,
            records,
            context,
        } = payload;
        let inputs = body::Inputs {
            context,
            scans: scans.map(|s| s.value),
            resources: resources.map(|r| r.value),
            quotas: quotas.map(|q| q.map(|q| q.value)),
        };
        // No fallible code after ownership move except the fixed owning release itself.
        release::run(
            held,
            topology,
            records,
            source.value,
            topology_source.value,
            inputs,
            b,
        )
        .map_err(StrictBridgeFailure::outer)
    }
}

#[cfg(test)]
#[derive(Clone, Copy)]
pub(in super::super) enum FixtureFault {
    Context,
    Lineage,
    Binding,
    TopologyLineage,
    TopologyBinding,
    Target,
    HeldOrigin,
    Source,
    TopologySource,
    Policy,
    MissingPolicy,
    ScanSupply(usize),
    SwapScans,
    QuotaSupply(usize),
    MissingQuota(usize),
}
#[cfg(test)]
impl<'s, R, T, S, C> ProtectedStrictInputs<'s, R, T, S, C> {
    pub(in super::super) fn fixture_change(
        &mut self,
        fault: FixtureFault,
        context: &'s InspectionContext<'s>,
    ) {
        let payload = self.payload.as_mut().unwrap();
        match fault {
            FixtureFault::Context => payload.context = context,
            FixtureFault::Lineage => payload.records.lineage = Rc::new(()),
            FixtureFault::Binding => payload.records.binding.generation += 1,
            FixtureFault::TopologyLineage => payload.topology.lineage = Rc::new(()),
            FixtureFault::TopologyBinding => payload.topology.records.generation += 1,
            FixtureFault::Target => payload.topology.target.policy = "wrong".into(),
            FixtureFault::HeldOrigin => payload.held.initial_origin = Rc::new(()),
            FixtureFault::Source => payload.source.supply = Rc::new(()),
            FixtureFault::TopologySource => payload.topology_source.supply = Rc::new(()),
            FixtureFault::Policy => payload.resources.as_mut().unwrap().supply = Rc::new(()),
            FixtureFault::MissingPolicy => {
                payload.resources.take();
            }
            FixtureFault::ScanSupply(i) => payload.scans[i].supply = Rc::new(()),
            FixtureFault::SwapScans => payload.scans.swap(0, 2),
            FixtureFault::QuotaSupply(i) => {
                payload.quotas[i].as_mut().unwrap().supply = Rc::new(())
            }
            FixtureFault::MissingQuota(i) => {
                payload.quotas[i].take();
            }
        }
    }
}
impl<R, T, S, C> Drop for ProtectedStrictInputs<'_, R, T, S, C> {
    fn drop(&mut self) {
        // The fixed transfer takes the payload; only an untransferred one is abandonment.
        if self.payload.is_some() {
            latch(&self.seal.claim, Failure::Unavailable);
        }
    }
}

// Sole synthetic producer. No non-test constructor, policy creator or operational input path.
#[cfg(test)]
pub(in super::super) fn fixture<'s, R, T, S, C>(
    held: HeldTargetScope<'s, R>,
    topology: TopologyReceipt,
    records: RecordReceipt,
    source: S,
    topology_source: T,
    inputs: body::Inputs<'s, C>,
    b: &SharedBudget<'_>,
) -> ProtectedSupply<'s, R, T, S, C> {
    let supply = Rc::new(());
    let tag = |slot| (supply.clone(), slot);
    let seal = Seal {
        supply: supply.clone(),
        origin: b.inspection_origin.clone(),
        claim: b.protected_bridge_claim.clone(),
        session: b.scan_session_claim.clone(),
        started: b.started,
        context: inputs.context,
        bound: held.bound,
        held_origin: held.initial_origin.clone(),
    };
    let payload = Payload {
        scans: inputs.scans.map(|value| {
            let (supply, slot) = tag(0);
            Tagged {
                value,
                supply,
                slot,
            }
        }),
        resources: inputs.resources.map(|value| Tagged {
            value,
            supply: supply.clone(),
            slot: 0,
        }),
        quotas: inputs.quotas.map(|v| {
            v.map(|value| Tagged {
                value,
                supply: supply.clone(),
                slot: 0,
            })
        }),
        source: Tagged {
            value: source,
            supply: supply.clone(),
            slot: 0,
        },
        topology_source: Tagged {
            value: topology_source,
            supply: supply.clone(),
            slot: 0,
        },
        held,
        topology,
        records,
        context: inputs.context,
    };
    let mut payload = payload;
    for i in 0..3 {
        payload.scans[i].slot = i;
        if let Some(q) = &mut payload.quotas[i] {
            q.slot = i;
        }
    }
    ProtectedSupply { payload, seal }
}

#[cfg(test)]
mod contracts {
    use super::*;
    #[test]
    fn protected_input_types_are_move_only_opaque_and_not_serializable() {
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
        opaque!(ProtectedSupply<'static, (), (), (), ()>);
        opaque!(ProtectedStrictInputs<'static, (), (), (), ()>);
        opaque!(preparation::PreparationEnvelope<'static, (), (), (), ()>);
        opaque!(preparation::PreparationAttempt);
        assert!(std::mem::size_of::<preparation::PreparationAttempt>() <= 96);
        assert!(std::mem::size_of::<ProtectedBridgeClaim>() <= 64);
    }
}
