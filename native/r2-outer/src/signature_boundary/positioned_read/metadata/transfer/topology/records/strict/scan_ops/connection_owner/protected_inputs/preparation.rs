//! Preparation claim and partial ownership/discard subset. No operational producer/policy.
use super::*;
use result_owner::SupplyStage;

// Same fixed field order as Payload, including when only some values exist.
struct PartialPayload<'s, R, T, S, C> {
    scans: [Option<Tagged<C>>; 3],
    resources: Option<Tagged<session::ResourceInput>>,
    quotas: [Option<Tagged<Quotas>>; 3],
    source: Option<Tagged<S>>,
    topology_source: Option<Tagged<T>>,
    held: Option<HeldTargetScope<'s, R>>,
    topology: Option<TopologyReceipt>,
    records: Option<RecordReceipt>,
    context: Option<&'s InspectionContext<'s>>,
}
pub(in super::super::super) struct PreparationEnvelope<'s, R, T, S, C> {
    payload: PartialPayload<'s, R, T, S, C>,
    seal: Seal<'s>,
}
// Consumed by complete. Existing identities are shared, never allocated anew or exposed.
pub(in super::super) struct PreparationAttempt {
    fresh: bool,
    supply: Rc<()>,
    origin: Rc<()>,
    claim: Rc<ProtectedBridgeClaim>,
    session: Rc<ScanSessionClaim>,
    started: Instant,
}
impl<R, T, S, C> std::fmt::Debug for PreparationEnvelope<'_, R, T, S, C> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PreparationEnvelope(partial_not_producer_or_authority)")
    }
}
impl<'s, R, T, S, C> PreparationEnvelope<'s, R, T, S, C> {
    pub(in super::super) fn start_preparation(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> PreparationAttempt {
        let fresh = !self.seal.claim.preparation_started.replace(true);
        if !Rc::ptr_eq(&self.seal.claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.preparation_started.set(true);
        }
        PreparationAttempt {
            fresh,
            supply: self.seal.supply.clone(),
            origin: b.inspection_origin.clone(),
            claim: b.protected_bridge_claim.clone(),
            session: b.scan_session_claim.clone(),
            started: b.started,
        }
    }
    pub(in super::super) fn discard(
        self,
        location: InputLocation,
        reason: Failure,
        b: &mut SharedBudget<'_>,
    ) -> InputRejected {
        self.seal.claim.used.set(true);
        b.protected_bridge_claim.used.set(true);
        let reason = reject::<()>(&self.seal, b, reason).unwrap_err();
        let rejected = InputRejected::at(location, reason, b);
        drop(self);
        rejected.after_release(DropObservation::SequenceReturned, b)
    }
    pub(in super::super) fn complete(
        self,
        attempt: PreparationAttempt,
        b: &mut SharedBudget<'_>,
    ) -> Result<ProtectedSupply<'s, R, T, S, C>, InputRejected> {
        let entry = (|| {
            work(b)?; // O.supply_entry 1; the claim was already consumed before owner begin.
            if !attempt.fresh
                || !Rc::ptr_eq(&attempt.supply, &self.seal.supply)
                || !Rc::ptr_eq(&attempt.origin, &b.inspection_origin)
                || !Rc::ptr_eq(&attempt.claim, &b.protected_bridge_claim)
                || !Rc::ptr_eq(&attempt.session, &b.scan_session_claim)
                || attempt.started != b.started
                || !self.seal.claim.preparation_started.get()
                || self.seal.claim.generated.get()
                || self.seal.claim.used.get()
            {
                return Err(Failure::Binding);
            }
            inspection(&self.seal, b)?;
            b.checkpoint()
        })();
        drop(attempt); // One-shot identity token never survives preparation validation.
        if let Err(e) = entry {
            return Err(self.discard(InputLocation::Supply(SupplyStage::InspectionEntry), e, b));
        }
        // One fixed-size completeness guard, NOT the proposed eight producer guards.
        if let Err(e) = work(b).and_then(|()| b.checkpoint()) {
            return Err(self.discard(InputLocation::Supply(SupplyStage::SealPublish), e, b));
        }
        let p = &self.payload;
        let missing = if p.context.is_none() {
            Some(SupplyStage::Context)
        } else if p.records.is_none() {
            Some(SupplyStage::ReceiptTarget)
        } else if p.held.is_none()
            || p.topology.is_none()
            || p.source.is_none()
            || p.topology_source.is_none()
        {
            Some(SupplyStage::HeldSources)
        } else if p.resources.is_none() || p.quotas.iter().any(Option::is_none) {
            Some(SupplyStage::PolicyCaps)
        } else if p.scans.iter().any(Option::is_none) {
            Some(SupplyStage::Slots)
        } else {
            None
        };
        if let Some(stage) = missing {
            return Err(self.discard(InputLocation::Supply(stage), Failure::Unavailable, b));
        }
        // Private fields, all checked above; no user callback/mutation between check and move.
        let p = self.payload;
        Ok(ProtectedSupply {
            payload: Payload {
                scans: p.scans.map(Option::unwrap),
                resources: p.resources,
                quotas: p.quotas,
                source: p.source.unwrap(),
                topology_source: p.topology_source.unwrap(),
                held: p.held.unwrap(),
                topology: p.topology.unwrap(),
                records: p.records.unwrap(),
                context: p.context.unwrap(),
            },
            seal: self.seal,
        })
    }
}

// Only synthetic acquisition/partial construction. No non-test source of an Envelope.
#[cfg(test)]
pub(in super::super::super) fn fixture<R, T, S, C>(
    supply: ProtectedSupply<'_, R, T, S, C>,
) -> PreparationEnvelope<'_, R, T, S, C> {
    let p = supply.payload;
    PreparationEnvelope {
        payload: PartialPayload {
            scans: p.scans.map(Some),
            resources: p.resources,
            quotas: p.quotas,
            source: Some(p.source),
            topology_source: Some(p.topology_source),
            held: Some(p.held),
            topology: Some(p.topology),
            records: Some(p.records),
            context: Some(p.context),
        },
        seal: supply.seal,
    }
}

#[cfg(test)]
#[derive(Clone, Copy)]
pub(in super::super::super) enum PartialField {
    Context,
    Records,
    Topology,
    Held,
    Source,
    TopologySource,
    Resources,
    Quota(usize),
    Scan(usize),
}
#[cfg(test)]
impl<R, T, S, C> PreparationEnvelope<'_, R, T, S, C> {
    pub(in super::super::super) fn preclaim(&self, b: &mut SharedBudget<'_>) {
        drop(self.start_preparation(b));
    }
    pub(in super::super::super) fn empty_retry_fixture(&self) -> Self {
        Self {
            payload: PartialPayload {
                scans: std::array::from_fn(|_| None),
                resources: None,
                quotas: std::array::from_fn(|_| None),
                source: None,
                topology_source: None,
                held: None,
                topology: None,
                records: None,
                context: None,
            },
            seal: Seal {
                supply: Rc::new(()),
                origin: self.seal.origin.clone(),
                claim: self.seal.claim.clone(),
                session: self.seal.session.clone(),
                started: self.seal.started,
                context: self.seal.context,
                bound: self.seal.bound,
                held_origin: self.seal.held_origin.clone(),
            },
        }
    }
    pub(in super::super::super) fn remove(&mut self, field: PartialField) {
        match field {
            PartialField::Context => {
                self.payload.context.take();
            }
            PartialField::Records => {
                self.payload.records.take();
            }
            PartialField::Topology => {
                self.payload.topology.take();
            }
            PartialField::Held => {
                self.payload.held.take();
            }
            PartialField::Source => {
                self.payload.source.take();
            }
            PartialField::TopologySource => {
                self.payload.topology_source.take();
            }
            PartialField::Resources => {
                self.payload.resources.take();
            }
            PartialField::Quota(i) => {
                self.payload.quotas[i].take();
            }
            PartialField::Scan(i) => {
                self.payload.scans[i].take();
            }
        }
    }
}

#[cfg(test)]
mod claim_tests {
    use super::*;
    #[test]
    fn prepared_budget_stop_reaches_a_waiting_slot_before_generation() {
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let claim = b.protected_bridge_claim.clone();
        claim.preparation_started.set(true); // Synthetic entry has consumed its preparation claim.
        let mut owner = result_owner::StrictResultOwner::new();
        let slot = owner.begin(result_owner::MODEL_ID, &mut b).unwrap();
        let work = b.json_work;
        assert_eq!(
            b.stop::<()>(Failure::HashMismatch),
            Err(Failure::HashMismatch)
        );
        assert_eq!(claim.failure.get(), Some(Failure::HashMismatch));
        assert!(!claim.generated.get());
        assert!(!claim.used.get());
        assert!(!b.scan_session_claim.started.get());
        drop(slot);
        let e = owner.take().unwrap().unwrap_err();
        assert_eq!(e.reason(), Failure::HashMismatch);
        assert_eq!(e.input_location(), Some(InputLocation::SlotAbandoned));
        assert_eq!(b.json_work, work);
        assert_eq!(b.stop::<()>(Failure::Binding), Err(Failure::HashMismatch));
        assert_eq!(claim.failure.get(), Some(Failure::HashMismatch));
    }
}
