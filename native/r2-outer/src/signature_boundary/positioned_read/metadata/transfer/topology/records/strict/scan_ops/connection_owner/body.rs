//! Private borrowed body only. No release section, normal-strict replacement or permit.
use super::*;
use crate::signature_boundary::positioned_read::ScanSessionClaim;
use outer_result::{OuterPhase, OuterStrictFailure};

pub(in super::super) struct Inputs<'s, C> {
    pub(in super::super) context: &'s InspectionContext<'s>,
    pub(in super::super) scans: [C; 3],
    pub(in super::super) resources: Option<session::ResourceInput>,
    pub(in super::super) quotas: [Option<Quotas>; 3],
}
// Only this fixed body can construct it. No comparison getter/RecordComparison conversion.
pub(in super::super) struct PendingBody {
    compared: ComparedM0M4,
    _origin: Rc<()>,
    _claim: Rc<ScanSessionClaim>,
    _started: Instant,
}
impl std::fmt::Debug for PendingBody {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PendingBody(before_release_not_execution_authority)")
    }
}

#[allow(clippy::result_large_err)] // Preserve the real fixed-stage diagnostic inline.
pub(in super::super) fn run<
    's,
    R: MetadataOps + ResourceOrigin,
    T: TopologySource<R>,
    S: RecordSource,
    C: ScanOps,
>(
    held: &mut HeldTargetScope<'_, R>,
    topology: &TopologyReceipt,
    records: &'s RecordReceipt,
    source: &mut S,
    topology_source: &mut T,
    inputs: Inputs<'s, C>,
    b: &mut SharedBudget<'_>,
) -> Result<PendingBody, OuterStrictFailure> {
    let Inputs {
        context,
        scans,
        resources,
        mut quotas,
    } = inputs;
    let preflight = (|| {
        work(b)?; // O.outer_entry 1: fixed dependencies and no repeated inspection body
        if b.scan_session_claim.started.get() {
            return Err(Failure::Binding);
        }
        if resources.is_none() || quotas.iter().any(Option::is_none) {
            return Err(Failure::Unavailable);
        }
        b.checkpoint()
    })();
    preflight.map_err(|e| OuterStrictFailure::plain(OuterPhase::Entry, e, b))?;
    validate_receipt(records, held.bound, b)
        .map_err(|e| OuterStrictFailure::plain(OuterPhase::Receipt, e, b))?;
    clock_check(source, records, b, 460_000)
        .map_err(|e| OuterStrictFailure::plain(OuterPhase::OuterClock, e, b))?;
    let mut owner = create(
        source,
        records,
        held.bound.target,
        context,
        scans,
        "bp5-r2-strict-owner-0.1",
        b,
    )
    .map_err(|e| OuterStrictFailure::from_inner(OuterPhase::OwnerCreate, e, b))?;
    let mut phase = OuterPhase::OwnerCreate;
    let result = (|| {
        let Some(resources) = resources else {
            return Err(owner.stop_inspection(Failure::Unavailable, b));
        };
        owner
            .ledger
            .configure_input(resources, b)
            .map_err(|e| owner.failure(e, None, None, b))?;
        phase = OuterPhase::Initial;
        owner.initial(b)?.run_fixed(quotas[0].take(), b)?;
        phase = OuterPhase::TopologyPrepare;
        let run = owner.topology_run(held, topology, b)?;
        phase = OuterPhase::Compare;
        let handoff = topology_adapter::compare(
            &run,
            held,
            topology_source,
            &mut owner,
            b,
            quotas[1].take(),
        )?;
        phase = OuterPhase::AfterHandoff;
        let after = handoff.enter(&mut owner, b)?;
        phase = OuterPhase::AfterRound;
        let compared = after.finish(quotas[2].take(), b)?;
        phase = OuterPhase::BodyCheckpoint;
        owner.complete_body(&run, b)?;
        Ok(PendingBody {
            compared,
            _origin: b.inspection_origin.clone(),
            _claim: b.scan_session_claim.clone(),
            _started: b.started,
        })
    })();
    match result {
        Ok(pending) => Ok(pending),
        Err(inner) => {
            // Notification is not a replacement for the retained CompletionFailure.
            drop(owner.stop_inspection(inner.reason(), b));
            Err(OuterStrictFailure::from_inner(phase, inner, b))
        }
    }
}

#[cfg(test)]
impl PendingBody {
    pub(in super::super) fn entitlement_gate(&self) -> Result<(), physical_signature::Rejection> {
        self.compared.entitlement_gate()
    }
}
