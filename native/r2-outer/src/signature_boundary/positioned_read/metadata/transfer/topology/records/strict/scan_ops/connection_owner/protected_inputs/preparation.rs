//! Partial ownership/discard subset only. No operational producer or policy constructor.
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
impl<R, T, S, C> std::fmt::Debug for PreparationEnvelope<'_, R, T, S, C> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PreparationEnvelope(partial_not_producer_or_authority)")
    }
}
impl<'s, R, T, S, C> PreparationEnvelope<'s, R, T, S, C> {
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
        b: &mut SharedBudget<'_>,
    ) -> Result<ProtectedSupply<'s, R, T, S, C>, InputRejected> {
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
