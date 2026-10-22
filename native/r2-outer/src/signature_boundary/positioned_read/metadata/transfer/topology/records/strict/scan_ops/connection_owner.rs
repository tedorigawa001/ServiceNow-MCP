//! Internal fixed owner/position/body subset. No normal strict/OS entry or policy constructor.
use super::*;
use collector::completion::CompletionFailure;
use round_declaration::session::{self, ScanSessionLedger};

const MODEL: &str = "bp5-r2-strict-owner-0.1";
pub(super) mod body;
mod kernel;
pub(in super::super) mod outer_result;
pub(in super::super) mod topology_adapter;
#[derive(Clone, Copy, PartialEq, Eq)]
enum Progress {
    Expected(Round),
    Taken(Round),
    Finished,
    Stopped,
}

pub(in super::super) struct StrictSessionOwner<'a, 's, S: RecordSource, C> {
    source: &'a mut S,
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    ledger: ScanSessionLedger<'s>,
    slots: [Option<C>; 3],
    progress: Progress,
    model: &'static str,
    topology_started: bool,
    body_done_started: bool,
}
pub(in super::super) struct RoundSlot<'o, 'a, 's, S: RecordSource, C> {
    owner: &'o mut StrictSessionOwner<'a, 's, S, C>,
    scan: Option<C>,
    round: Round,
    precheck_started: bool,
    prechecked: bool,
    completed: bool,
}
pub(in super::super) struct StrictInspectionFailure {
    reason: Failure,
    round: Option<Round>,
    completion: Option<CompletionFailure>,
}
impl std::fmt::Debug for StrictInspectionFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("StrictInspectionFailure(diagnostics_only)")
    }
}
impl StrictInspectionFailure {
    pub(in super::super) fn reason(&self) -> Failure {
        self.reason
    }
}
impl<S: RecordSource, C> std::fmt::Debug for StrictSessionOwner<'_, '_, S, C> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("StrictSessionOwner(internal_pending_connection_not_authority)")
    }
}
impl<S: RecordSource, C> std::fmt::Debug for RoundSlot<'_, '_, '_, S, C> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RoundSlot(owned_pending_fixed_kernel)")
    }
}
// No operational cap/ResourcePolicy is manufactured here. Sources must be inert.
#[allow(clippy::result_large_err)] // Keep bounded diagnostics inline after a stop.
pub(in super::super) fn create<'a, 's, S: RecordSource, C>(
    source: &'a mut S,
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    scans: [C; 3],
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<StrictSessionOwner<'a, 's, S, C>, StrictInspectionFailure> {
    // Existing unique session claim precedes even owner-model failure.
    let mut ledger = session::create(receipt, target, context, "bp5-r2-scan-session-state-0.1", b)
        .map_err(|reason| StrictInspectionFailure {
            reason,
            round: None,
            completion: None,
        })?;
    let result = (|| {
        work(b)?; // O.connection_create 1: fixed model/original inspection binding
        if expected != MODEL {
            return Err(Failure::Unavailable);
        }
        ledger.require_inspection(b)?;
        work(b)?; // O.connection_create 2: fixed three-slot capture/publication
        b.checkpoint()
    })();
    if let Err(e) = result {
        let reason = ledger.stop_inspection(e, b);
        return Err(StrictInspectionFailure {
            reason,
            round: None,
            completion: None,
        });
    }
    Ok(StrictSessionOwner {
        source,
        receipt,
        target,
        context,
        ledger,
        slots: scans.map(Some),
        progress: Progress::Expected(Round::Initial),
        model: MODEL,
        topology_started: false,
        body_done_started: false,
    })
}
impl<'a, 's, S: RecordSource, C> StrictSessionOwner<'a, 's, S, C> {
    fn binding(&self, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        if self.model != MODEL {
            return Err(Failure::Unavailable);
        }
        self.ledger.require_inspection(b)?;
        b.checkpoint()
    }
    fn failure(
        &mut self,
        reason: Failure,
        round: Option<Round>,
        completion: Option<CompletionFailure>,
        b: &mut SharedBudget<'_>,
    ) -> StrictInspectionFailure {
        let reason = self.ledger.stop_inspection(reason, b);
        self.progress = Progress::Stopped;
        StrictInspectionFailure {
            reason,
            round,
            completion,
        }
    }
    #[allow(clippy::result_large_err)]
    pub(in super::super) fn stop_inspection(
        &mut self,
        reason: Failure,
        b: &mut SharedBudget<'_>,
    ) -> StrictInspectionFailure {
        let round = match self.progress {
            Progress::Expected(r) | Progress::Taken(r) => Some(r),
            _ => None,
        };
        self.failure(reason, round, None, b)
    }
    // Only Initial has a production-facing internal accessor in this subset.
    // Before/AfterM4 must later require the fixed topology position/handoff.
    #[allow(clippy::result_large_err)]
    pub(in super::super) fn initial(
        &mut self,
        b: &mut SharedBudget<'_>,
    ) -> Result<RoundSlot<'_, 'a, 's, S, C>, StrictInspectionFailure> {
        self.take(Round::Initial, b)
    }
    #[allow(clippy::result_large_err)]
    fn take(
        &mut self,
        round: Round,
        b: &mut SharedBudget<'_>,
    ) -> Result<RoundSlot<'_, 'a, 's, S, C>, StrictInspectionFailure> {
        let slot = match round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        // Irreversible take and state change before work, binding or checkpoint.
        let scan = self.slots[slot].take();
        let prior = std::mem::replace(&mut self.progress, Progress::Stopped);
        let result = (|| {
            work(b)?; // O.slot_take 1: one-shot order/model/budget guard
            self.binding(b)?;
            if prior != Progress::Expected(round) || scan.is_none() {
                return Err(Failure::Binding);
            }
            work(b)?; // O.slot_take 2: publish an exclusive, non-replenishable slot
            b.checkpoint()
        })();
        if let Err(e) = result {
            return Err(self.failure(e, Some(round), None, b));
        }
        self.progress = Progress::Taken(round);
        Ok(RoundSlot {
            owner: self,
            scan,
            round,
            precheck_started: false,
            prechecked: false,
            completed: false,
        })
    }
}
impl<S: RecordSource, C> RoundSlot<'_, '_, '_, S, C> {
    pub(in super::super) fn stop_inspection(
        self,
        reason: Failure,
        b: &mut SharedBudget<'_>,
    ) -> StrictInspectionFailure {
        self.owner.failure(reason, Some(self.round), None, b)
    }
    // Diagnostics are moved, never turned into successful completion authority.
    fn stop_with_completion(
        self,
        failure: CompletionFailure,
        b: &mut SharedBudget<'_>,
    ) -> StrictInspectionFailure {
        self.owner
            .failure(failure.reason(), Some(self.round), Some(failure), b)
    }
    #[allow(clippy::result_large_err)]
    pub(in super::super) fn precheck_records(
        &mut self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), StrictInspectionFailure> {
        let fresh = !std::mem::replace(&mut self.precheck_started, true);
        let result = (|| {
            work(b)?; // O.owner_record_guard 1: same-source one-shot precheck
            self.owner.binding(b)?;
            if !fresh || self.owner.progress != Progress::Taken(self.round) {
                return Err(Failure::Binding);
            }
            reread_bytes(self.owner.source, self.owner.receipt, b)?;
            let clock = clock_check(self.owner.source, self.owner.receipt, b, 450_000)?;
            verify_records(
                self.owner.receipt,
                self.owner.target,
                self.owner.context,
                clock.wall_ms,
                b,
            )?;
            work(b)?; // O.owner_record_guard 2: reject late success
            b.checkpoint()
        })();
        if let Err(e) = result {
            return Err(self.owner.failure(e, Some(self.round), None, b));
        }
        self.prechecked = true;
        Ok(())
    }
}
impl<S: RecordSource, C> Drop for RoundSlot<'_, '_, '_, S, C> {
    fn drop(&mut self) {
        if !self.completed {
            self.owner.ledger.abandon_inspection();
            self.owner.progress = Progress::Stopped;
        }
    }
}
impl<S: RecordSource, C> Drop for StrictSessionOwner<'_, '_, S, C> {
    fn drop(&mut self) {
        if self.progress != Progress::Finished {
            self.ledger.abandon_inspection();
        }
    }
}

#[cfg(test)]
pub(in super::super) mod testing {
    use super::*;
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn complete_body<'s, S: RecordSource, C>(
        owner: &mut StrictSessionOwner<'_, 's, S, C>,
        run: &topology_adapter::TopologyRunOwner<'_, 's>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), StrictInspectionFailure> {
        owner.complete_body(run, b)
    }
    pub(in super::super::super) fn ledger<'o, 's, S: RecordSource, C>(
        o: &'o mut StrictSessionOwner<'_, 's, S, C>,
    ) -> &'o mut ScanSessionLedger<'s> {
        &mut o.ledger
    }
    #[allow(clippy::result_large_err)] // Preserve fixed diagnostics, including on allocation failure paths.
    pub(in super::super::super) fn take<'o, 'a, 's, S: RecordSource, C>(
        o: &'o mut StrictSessionOwner<'a, 's, S, C>,
        r: Round,
        b: &mut SharedBudget<'_>,
    ) -> Result<RoundSlot<'o, 'a, 's, S, C>, StrictInspectionFailure> {
        o.take(r, b)
    }
    pub(in super::super::super) fn details(e: &StrictInspectionFailure) -> (Option<Round>, bool) {
        (e.round, e.completion.is_some())
    }
    pub(in super::super::super) fn completion(
        e: &StrictInspectionFailure,
    ) -> Option<&CompletionFailure> {
        e.completion.as_ref()
    }
    pub(in super::super::super) fn remaining<S: RecordSource, C>(
        o: &StrictSessionOwner<'_, '_, S, C>,
    ) -> [bool; 3] {
        std::array::from_fn(|i| o.slots[i].is_some())
    }
    // Synthetic connection only. Success requires an actual typed ack on this ledger;
    // this callback never serves as a production strict/M4/normal completion producer.
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn run<'s, S: RecordSource, C>(
        mut slot: RoundSlot<'_, '_, 's, S, C>,
        b: &mut SharedBudget<'_>,
        f: impl FnOnce(
            C,
            &mut ScanSessionLedger<'s>,
            &mut S,
            &mut SharedBudget<'_>,
        ) -> (Result<(), Failure>, Option<CompletionFailure>),
    ) -> Result<(), StrictInspectionFailure> {
        if !slot.prechecked || slot.owner.progress != Progress::Taken(slot.round) {
            return Err(slot
                .owner
                .failure(Failure::Binding, Some(slot.round), None, b));
        }
        if let Err(e) = slot.owner.binding(b) {
            return Err(slot.owner.failure(e, Some(slot.round), None, b));
        }
        let scan = slot.scan.take().unwrap();
        let (result, completion) = f(scan, &mut slot.owner.ledger, slot.owner.source, b);
        if let Err(e) = result {
            return Err(match completion {
                Some(failure) => slot.stop_with_completion(failure, b),
                None => slot.stop_inspection(e, b),
            });
        }
        if completion.is_some() || !slot.owner.ledger.acknowledged_for_owner_test(slot.round) {
            return Err(slot
                .owner
                .failure(Failure::Binding, Some(slot.round), completion, b));
        }
        if let Err(e) = slot.owner.binding(b) {
            return Err(slot.owner.failure(e, Some(slot.round), None, b));
        }
        slot.owner.progress = match slot.round {
            Round::Initial => Progress::Expected(Round::BeforeM4),
            Round::BeforeM4 => Progress::Expected(Round::AfterM4),
            Round::AfterM4 => Progress::Finished,
        };
        slot.completed = true;
        Ok(())
    }
}
