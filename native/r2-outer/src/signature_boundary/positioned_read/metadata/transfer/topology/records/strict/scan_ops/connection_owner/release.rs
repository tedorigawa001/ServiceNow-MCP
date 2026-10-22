//! Fixed owning release section. No installed entry, OS producer or execution authority.
use super::*;
use crate::signature_boundary::positioned_read::ScanSessionClaim;
use outer_result::{DropObservation, OuterPhase, OuterStrictFailure};

// Minted only after the explicit release sequence below, not from a diagnostic enum.
pub(super) struct ReleasePosition {
    origin: Rc<()>,
    claim: Rc<ScanSessionClaim>,
    started: Instant,
}
impl ReleasePosition {
    pub(super) fn require(
        self,
        origin: &Rc<()>,
        claim: &Rc<ScanSessionClaim>,
        started: Instant,
        b: &SharedBudget<'_>,
    ) -> Result<(), Failure> {
        if !Rc::ptr_eq(&self.origin, origin)
            || !Rc::ptr_eq(&self.claim, claim)
            || self.started != started
            || !Rc::ptr_eq(&self.origin, &b.inspection_origin)
            || !Rc::ptr_eq(&self.claim, &b.scan_session_claim)
            || self.started != b.started
            || !self.claim.started.get()
        {
            return Err(Failure::Binding);
        }
        Ok(())
    }
}

#[allow(clippy::result_large_err)] // Keep the original cleanup diagnostics inline after stop.
pub(in super::super) fn run<
    R: MetadataOps + ResourceOrigin,
    T: TopologySource<R>,
    S: RecordSource,
    C: ScanOps,
>(
    held: HeldTargetScope<'_, R>,
    topology: TopologyReceipt,
    records: RecordReceipt,
    mut source: S,
    mut topology_source: T,
    inputs: body::Inputs<'_, C>,
    b: &mut SharedBudget<'_>,
) -> Result<RecordComparison, OuterStrictFailure> {
    let origin = b.inspection_origin.clone();
    let claim = b.scan_session_claim.clone();
    let started = b.started;
    // Moving the receipt changes its address. Preserve its exact lineage/value binding,
    // then canonicalize only the borrow; never reopen or replace the held resource.
    let prepared = (|| {
        work(b)?;
        if !Rc::ptr_eq(&records.lineage, held.bound.lineage)
            || records.binding != *held.bound.records
        {
            return Err(Failure::Binding);
        }
        for _ in &held.bound.chain_names {
            work(b)?;
        }
        Ok(held.bound.chain_names.clone())
    })();
    let mut canonical = BoundTarget {
        records: &records.binding,
        lineage: &records.lineage,
        target: held.bound.target,
        chain_names: Vec::new(),
        bytes: held.bound.bytes,
    };
    let preparation = prepared.map(|names| canonical.chain_names = names);
    let mut held = HeldTargetScope {
        source: held.source,
        ancestors: held.ancestors,
        bound: &canonical,
        initial: held.initial,
        initial_origin: held.initial_origin,
    };
    // Prepay bounded identity/publication control. No work/I/O is needed after release.
    let result = match preparation.and_then(|()| work(b)) {
        // O.outer_release 1
        Ok(()) => body::run(
            &mut held,
            &topology,
            &records,
            &mut source,
            &mut topology_source,
            inputs,
            b,
        ),
        Err(e) => {
            drop(inputs);
            Err(OuterStrictFailure::plain(OuterPhase::Entry, e, b))
        }
    };
    // body has ended every owner/slot/handoff borrow. Do not put ? in this section.
    drop(source);
    drop(topology_source);
    drop(held);
    drop(canonical);
    drop(topology);
    drop(records);
    let position = ReleasePosition {
        origin,
        claim,
        started,
    };
    let result = result.and_then(|pending| pending.consume_after_release(position, b));
    outer_result::merge_after_release(result, DropObservation::SequenceReturned, b)
        .map(|compared| RecordComparison { compared })
}

// Corrupt only the position presented to the real consumer; never synthesize PendingBody.
#[cfg(test)]
#[allow(clippy::result_large_err)]
pub(in super::super) fn consume_fixture(
    pending: body::PendingBody,
    b: &mut SharedBudget<'_>,
    change: u8,
) -> Result<(), OuterStrictFailure> {
    let mut position = ReleasePosition {
        origin: b.inspection_origin.clone(),
        claim: b.scan_session_claim.clone(),
        started: b.started,
    };
    match change {
        1 => position.origin = Rc::new(()),
        2 => position.claim = Rc::new(ScanSessionClaim::default()),
        3 => position.started += Duration::from_nanos(1),
        4 => b.inspection_origin = Rc::new(()),
        5 => b.scan_session_claim = Rc::new(ScanSessionClaim::default()),
        6 => b.started += Duration::from_nanos(1),
        _ => (),
    }
    pending.consume_after_release(position, b).map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn release_position_is_move_only_small_and_not_serializable() {
        macro_rules! not_impl {
            ($bound:path) => {{
                trait Ambiguous<A> {
                    fn check() {}
                }
                impl<T: ?Sized> Ambiguous<()> for T {}
                impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
                let _ = <ReleasePosition as Ambiguous<_>>::check;
            }};
        }
        not_impl!(Clone);
        not_impl!(Copy);
        not_impl!(serde::Serialize);
        not_impl!(serde::de::DeserializeOwned);
        assert!(std::mem::size_of::<ReleasePosition>() <= 64);
    }
}
