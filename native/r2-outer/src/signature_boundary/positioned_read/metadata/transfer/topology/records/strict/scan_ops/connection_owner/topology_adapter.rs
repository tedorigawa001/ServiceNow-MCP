//! Fixed topology position subset. No normal strict kernel, OS source or permit.
use super::*;
use crate::signature_boundary::positioned_read::ScanSessionClaim;

pub(in super::super::super) struct TopologyRunOwner<'t, 's> {
    topology: &'t TopologyReceipt,
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    leaf: Rc<()>,
    origin: Rc<()>,
    claim: Rc<ScanSessionClaim>,
    started: Instant,
    compare_started: Cell<bool>,
    before_started: Cell<bool>,
    before_succeeded: Cell<bool>,
    completion_consumed: Cell<bool>,
    finished: Cell<bool>,
    failed: Cell<Option<Failure>>,
}
pub(in super::super::super) struct BeforeM4Position<'m, 't, 's> {
    run: &'m TopologyRunOwner<'t, 's>,
}
pub(in super::super::super) struct AfterM4Handoff<'m, 't, 's> {
    run: &'m TopologyRunOwner<'t, 's>,
    compared: Option<ComparedM0M4>,
    entered: bool,
    model: &'static str,
}
pub(in super::super::super) struct AfterM4Round<'o, 'a, 's, 'm, 't, S: RecordSource, C> {
    slot: Option<RoundSlot<'o, 'a, 's, S, C>>,
    run: &'m TopologyRunOwner<'t, 's>,
    compared: Option<ComparedM0M4>,
    finished: bool,
}
macro_rules! opaque_debug {
    ($t:ty,$s:literal) => {
        impl std::fmt::Debug for $t {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str($s)
            }
        }
    };
}
opaque_debug!(
    TopologyRunOwner<'_, '_>,
    "TopologyRunOwner(position_only_not_execution_authority)"
);
opaque_debug!(
    BeforeM4Position<'_, '_, '_>,
    "BeforeM4Position(before_metadata_not_m4_success)"
);
opaque_debug!(
    AfterM4Handoff<'_, '_, '_>,
    "AfterM4Handoff(actual_comparison_pending_after_round)"
);
impl<S: RecordSource, C> std::fmt::Debug for AfterM4Round<'_, '_, '_, '_, '_, S, C> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AfterM4Round(pending_kernel_not_authority)")
    }
}

impl<'t, 's> TopologyRunOwner<'t, 's> {
    fn stop(&self, e: Failure) -> Failure {
        let reason = self.claim.failure.get().or(self.failed.get()).unwrap_or(e);
        self.claim.failure.set(Some(reason));
        self.failed.set(Some(reason));
        reason
    }
    fn require<S: RecordSource, C>(
        &self,
        o: &StrictSessionOwner<'_, 's, S, C>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        if let Some(e) = self.failed.get() {
            return Err(e);
        }
        o.binding(b)?;
        if !std::ptr::eq(self.receipt, o.receipt)
            || !std::ptr::eq(self.target, o.target)
            || !std::ptr::eq(self.context, o.context)
            || !Rc::ptr_eq(&self.origin, &b.inspection_origin)
            || !Rc::ptr_eq(&self.claim, &b.scan_session_claim)
            || self.started != b.started
        {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    fn error<S: RecordSource, C>(
        &self,
        o: &mut StrictSessionOwner<'_, 's, S, C>,
        e: Failure,
        b: &mut SharedBudget<'_>,
    ) -> StrictInspectionFailure {
        let e = self.stop(e);
        o.failure(e, None, None, b)
    }
}
impl Drop for TopologyRunOwner<'_, '_> {
    fn drop(&mut self) {
        if !self.finished.get() {
            self.stop(Failure::Unavailable);
        }
    }
}
impl Drop for AfterM4Handoff<'_, '_, '_> {
    fn drop(&mut self) {
        if !self.entered {
            self.run.stop(Failure::Unavailable);
        }
    }
}
impl<S: RecordSource, C> Drop for AfterM4Round<'_, '_, '_, '_, '_, S, C> {
    fn drop(&mut self) {
        if !self.finished {
            self.run.stop(Failure::Unavailable);
        }
    }
}

impl<'a, 's, S: RecordSource, C> StrictSessionOwner<'a, 's, S, C> {
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn topology_run<'t, R: ResourceOrigin>(
        &mut self,
        held: &HeldTargetScope<'_, R>,
        topology: &'t TopologyReceipt,
        b: &mut SharedBudget<'_>,
    ) -> Result<TopologyRunOwner<'t, 's>, StrictInspectionFailure> {
        let fresh = !std::mem::replace(&mut self.topology_started, true);
        let result = (|| {
            work(b)?; // O.topology_owner 1: irreversible owner attempt / exact original binding
            self.binding(b)?;
            if !fresh
                || self.progress != Progress::Expected(Round::BeforeM4)
                || !std::ptr::eq(held.bound.target, self.target)
                || !std::ptr::eq(held.bound.records, &self.receipt.binding)
                || !Rc::ptr_eq(held.bound.lineage, &self.receipt.lineage)
                || !Rc::ptr_eq(&topology.lineage, &self.receipt.lineage)
                || topology.records != self.receipt.binding
                || topology.target != *self.target
                || !Rc::ptr_eq(&held.initial_origin, held.source.leaf.resource_origin())
            {
                return Err(Failure::Binding);
            }
            self.ledger.require_acknowledged(Round::Initial, b)?;
            work(b)?; // O.topology_owner 2: stable borrow capture, no I/O or capability
            b.checkpoint()
        })();
        if let Err(e) = result {
            return Err(self.failure(e, None, None, b));
        }
        Ok(TopologyRunOwner {
            topology,
            receipt: self.receipt,
            target: self.target,
            context: self.context,
            leaf: held.initial_origin.clone(),
            origin: b.inspection_origin.clone(),
            claim: b.scan_session_claim.clone(),
            started: b.started,
            compare_started: Cell::new(false),
            before_started: Cell::new(false),
            before_succeeded: Cell::new(false),
            completion_consumed: Cell::new(false),
            finished: Cell::new(false),
            failed: Cell::new(None),
        })
    }
    #[allow(clippy::result_large_err)]
    fn before_position<'o>(
        &'o mut self,
        position: BeforeM4Position<'_, '_, 's>,
        b: &mut SharedBudget<'_>,
    ) -> Result<RoundSlot<'o, 'a, 's, S, C>, StrictInspectionFailure> {
        let run = position.run;
        let fresh = !run.before_started.replace(true);
        let result = (|| {
            work(b)?; // O.before_position 1: position owner, attempt and original session
            run.require(self, b)?;
            if !fresh || !run.compare_started.get() || run.before_succeeded.get() {
                return Err(Failure::Binding);
            }
            self.ledger.require_acknowledged(Round::Initial, b)?;
            b.checkpoint()
        })();
        if let Err(e) = result {
            return Err(run.error(self, e, b));
        }
        self.take(Round::BeforeM4, b)
    }
}

// The only non-test wrapper accepts no caller callback. Until the fixed normal kernel
// is connected, consuming the real BeforeM4 position stops before M4 acquisition.
#[allow(clippy::result_large_err)]
pub(in super::super::super) fn compare<
    'm,
    't,
    's,
    R: MetadataOps + ResourceOrigin,
    T: TopologySource<R>,
    S: RecordSource,
    C,
>(
    run: &'m TopologyRunOwner<'t, 's>,
    held: &mut HeldTargetScope<'_, R>,
    topology_source: &mut T,
    owner: &mut StrictSessionOwner<'_, 's, S, C>,
    b: &mut SharedBudget<'_>,
) -> Result<AfterM4Handoff<'m, 't, 's>, StrictInspectionFailure> {
    compare_core(run, held, topology_source, owner, b, |o, p, b| {
        let slot = o.before_position(p, b)?;
        Err(slot.stop_inspection(Failure::Unavailable, b))
    })
}
#[allow(clippy::result_large_err)]
fn compare_core<
    'm,
    't,
    's,
    'a,
    R: MetadataOps + ResourceOrigin,
    T: TopologySource<R>,
    S: RecordSource,
    C,
>(
    run: &'m TopologyRunOwner<'t, 's>,
    held: &mut HeldTargetScope<'_, R>,
    source: &mut T,
    owner: &mut StrictSessionOwner<'a, 's, S, C>,
    b: &mut SharedBudget<'_>,
    mut before: impl FnMut(
        &mut StrictSessionOwner<'a, 's, S, C>,
        BeforeM4Position<'m, 't, 's>,
        &mut SharedBudget<'_>,
    ) -> Result<(), StrictInspectionFailure>,
) -> Result<AfterM4Handoff<'m, 't, 's>, StrictInspectionFailure> {
    let fresh = !run.compare_started.replace(true);
    let mut captured = None;
    let result = (|| {
        work(b)?; // O.topology_compare 1: fixed comparison entry, no reused comparison input
        run.require(owner, b)?;
        if !fresh
            || owner.progress != Progress::Expected(Round::BeforeM4)
            || !std::ptr::eq(held.bound.target, run.target)
            || !std::ptr::eq(held.bound.records, &run.receipt.binding)
            || !Rc::ptr_eq(&run.leaf, &held.initial_origin)
            || !Rc::ptr_eq(&run.leaf, held.source.leaf.resource_origin())
        {
            return Err(Failure::Binding);
        }
        let compared = compare_topology(held, run.topology, source, b, &mut |b| {
            // This sole position producer is reached only after B + topology recheck.
            let position = BeforeM4Position { run };
            if let Err(e) = before(owner, position, b) {
                let reason = e.reason();
                captured = Some(e);
                return Err(reason);
            }
            work(b)?; // O.before_position 2: actual ack AND with_round terminal success
            run.require(owner, b)?;
            owner.ledger.require_acknowledged(Round::BeforeM4, b)?;
            if !run.before_started.get()
                || run.before_succeeded.get()
                || owner.progress != Progress::Expected(Round::AfterM4)
            {
                return Err(Failure::Binding);
            }
            b.checkpoint()?;
            run.before_succeeded.set(true);
            Ok(())
        })?;
        work(b)?; // O.topology_compare 2: real M4 result / late checkpoint before publication
        run.require(owner, b)?;
        if !run.before_succeeded.get() {
            return Err(Failure::Binding);
        }
        b.checkpoint()?;
        Ok(compared)
    })();
    match result {
        Ok(compared) => Ok(AfterM4Handoff {
            run,
            compared: Some(compared),
            entered: false,
            model: "bp5-r2-m4-handoff-0.1",
        }),
        Err(e) => {
            let e = run.stop(e);
            let mut error = owner.failure(e, None, None, b);
            if let Some(frame) = captured {
                error.completion = frame.completion;
                error.round = frame.round;
            }
            Err(error)
        }
    }
}
impl<'m, 't, 's> AfterM4Handoff<'m, 't, 's> {
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn enter<'o, 'a, S: RecordSource, C>(
        mut self,
        owner: &'o mut StrictSessionOwner<'a, 's, S, C>,
        b: &mut SharedBudget<'_>,
    ) -> Result<AfterM4Round<'o, 'a, 's, 'm, 't, S, C>, StrictInspectionFailure> {
        let fresh = !self.run.completion_consumed.replace(true);
        let result = (|| {
            work(b)?; // O.after_handoff 1: irreversible consumption and original owner binding
            self.run.require(owner, b)?;
            if !fresh
                || self.model != "bp5-r2-m4-handoff-0.1"
                || !self.run.before_succeeded.get()
                || self.compared.is_none()
            {
                return Err(Failure::Binding);
            }
            owner.ledger.require_acknowledged(Round::BeforeM4, b)?;
            work(b)?; // O.after_handoff 2: no late success / no cloned ComparedM0M4
            b.checkpoint()
        })();
        if let Err(e) = result {
            return Err(self.run.error(owner, e, b));
        }
        let slot = owner.take(Round::AfterM4, b)?;
        self.entered = true;
        Ok(AfterM4Round {
            slot: Some(slot),
            run: self.run,
            compared: self.compared.take(),
            finished: false,
        })
    }
}

#[cfg(test)]
pub(in super::super::super) mod testing {
    use super::*;
    pub(in super::super::super::super) fn claim_before(run: &TopologyRunOwner<'_, '_>) {
        run.before_started.set(true);
    }
    pub(in super::super::super::super) fn claim_completion(run: &TopologyRunOwner<'_, '_>) {
        run.completion_consumed.set(true);
    }
    pub(in super::super::super::super) fn corrupt_model(handoff: &mut AfterM4Handoff<'_, '_, '_>) {
        handoff.model = "wrong";
    }
    // Synthetic topology fixture delegates to the actual internal fixed kernel.
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn run_fixed<S: RecordSource, C: ScanOps>(
        slot: RoundSlot<'_, '_, '_, S, C>,
        b: &mut SharedBudget<'_>,
        quotas: Option<Quotas>,
    ) -> Result<(), StrictInspectionFailure> {
        slot.run_fixed(quotas, b)
    }
    #[allow(clippy::result_large_err)]
    pub(in super::super::super::super) fn compare_with_fixture<
        'm,
        't,
        's,
        'a,
        R: MetadataOps + ResourceOrigin,
        T: TopologySource<R>,
        S: RecordSource,
        C,
    >(
        run: &'m TopologyRunOwner<'t, 's>,
        held: &mut HeldTargetScope<'_, R>,
        source: &mut T,
        owner: &mut StrictSessionOwner<'a, 's, S, C>,
        b: &mut SharedBudget<'_>,
        mut f: impl for<'o> FnMut(
            RoundSlot<'o, 'a, 's, S, C>,
            &mut SharedBudget<'_>,
        ) -> Result<(), StrictInspectionFailure>,
    ) -> Result<AfterM4Handoff<'m, 't, 's>, StrictInspectionFailure> {
        compare_core(run, held, source, owner, b, |o, p, b| {
            let slot = o.before_position(p, b)?;
            f(slot, b)
        })
    }
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn finish_with_fixture<S: RecordSource, C: ScanOps>(
        mut after: AfterM4Round<'_, '_, '_, '_, '_, S, C>,
        b: &mut SharedBudget<'_>,
        quotas: Option<Quotas>,
    ) -> Result<ComparedM0M4, StrictInspectionFailure> {
        run_fixed(after.slot.take().unwrap(), b, quotas)?;
        after.run.finished.set(true);
        after.finished = true;
        Ok(after.compared.take().unwrap())
    }
}
