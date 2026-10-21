//! Typed strict tail. Ordinary strict orchestration remains disconnected.
use super::*;
mod acknowledgement;
pub(in super::super::super::super) struct RecordsVerifiedRound<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    tail: ScanTailData,
}
pub(in super::super::super::super) struct FinalIndexRound<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    tail: ScanTailData,
}
pub(in super::super::super::super) struct FinalClockRound<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    tail: ScanTailData,
}
impl std::fmt::Debug for FinalClockRound<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("FinalClockRound(awaiting_strict_ack_not_execution_authority)")
    }
}
impl<'a, 'r, 's> FinalIndexRound<'a, 'r, 's> {
    #[allow(clippy::result_large_err)] // Preserve fixed cleanup diagnostics inline after a stop.
    pub(in super::super::super::super) fn verify_final_clock<S: RecordSource>(
        self,
        source: &mut S,
        phases: &super::super::super::phases::IndexPhases<'_, '_, '_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<FinalClockRound<'a, 'r, 's>, CompletionFailure> {
        let slot = match self.lease.scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        let fresh = !std::mem::replace(&mut self.lease.ledger.final_clock_started[slot], true);
        let result = (|| {
            work(b)?; // O.final_clock_stage 1: irreversible claim and owner/phase binding
            if !fresh
                || self.lease.ledger.state != State::AwaitStrict(self.lease.scope.round)
                || !self.lease.ledger.final_index_started[slot]
                || !self.lease.ledger.records_started[slot]
                || !self.lease.ledger.after_scan_started[slot]
            {
                return Err(Failure::Binding);
            }
            self.lease.ledger.binding(b)?;
            self.tail.require(&self.lease, b)?;
            phases.require_finished(self.lease.scope)?;
            check_final_round_clock(source, self.lease.scope, "bp5-r2-round-final-clock-0.1", b)?;
            work(b)?; // O.final_clock_stage 3: no typed publication before final checkpoint
            b.checkpoint()
        })();
        if let Err(e) = result {
            let reason = self.lease.ledger.fail::<()>(e, b).unwrap_err();
            return Err(self.tail.reject(reason));
        }
        Ok(FinalClockRound {
            lease: self.lease,
            tail: self.tail,
        })
    }
}
impl std::fmt::Debug for FinalIndexRound<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("FinalIndexRound(awaiting_final_clock_not_execution_authority)")
    }
}
impl<'a, 'r, 's> RecordsVerifiedRound<'a, 'r, 's> {
    #[allow(clippy::result_large_err)] // Keep fixed cleanup evidence inline after a stop.
    pub(in super::super::super::super) fn verify_final_index(
        self,
        phases: &mut super::super::super::phases::IndexPhases<'_, '_, '_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<FinalIndexRound<'a, 'r, 's>, CompletionFailure> {
        let slot = match self.lease.scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        let fresh = !std::mem::replace(&mut self.lease.ledger.final_index_started[slot], true);
        let result = (|| {
            work(b)?; // O.final_index_stage 1: irreversible claim and exact owner binding
            if !fresh
                || self.lease.ledger.state != State::AwaitStrict(self.lease.scope.round)
                || !self.lease.ledger.records_started[slot]
                || !self.lease.ledger.after_scan_started[slot]
            {
                return Err(Failure::Binding);
            }
            self.lease.ledger.binding(b)?;
            self.tail.require(&self.lease, b)?;
            phases.finish_for_round(self.lease.scope, "bp5-r2-round-final-index-0.1", b)?;
            work(b)?; // O.final_index_stage 3: no typed publication before the terminal guard
            b.checkpoint()
        })();
        if let Err(e) = result {
            let reason = self.lease.ledger.fail::<()>(e, b).unwrap_err();
            return Err(self.tail.reject(reason));
        }
        Ok(FinalIndexRound {
            lease: self.lease,
            tail: self.tail,
        })
    }
}
#[cfg(test)]
impl FinalIndexRound<'_, '_, '_> {
    pub(in super::super::super::super) fn acknowledge_for_test(
        mut self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        b.checkpoint()?;
        super::super::tests::ack_fixture(self.lease.ledger, self.lease.scope.round);
        self.lease.completed = true;
        Ok(())
    }
}
impl std::fmt::Debug for RecordsVerifiedRound<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RecordsVerifiedRound(awaiting_final_index_not_execution_authority)")
    }
}
impl<'a, 'r, 's> AfterScanRound<'a, 'r, 's> {
    #[allow(clippy::result_large_err)] // Fixed cleanup diagnostics, no heap allocation after stop.
    pub(in super::super::super::super) fn revalidate_records<S: RecordSource>(
        self,
        source: &mut S,
        phases: &super::super::super::phases::IndexPhases<'_, '_, '_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<RecordsVerifiedRound<'a, 'r, 's>, CompletionFailure> {
        let slot = match self.lease.scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        let fresh = !std::mem::replace(&mut self.lease.ledger.records_started[slot], true);
        let result = (|| {
            work(b)?; // O.record_stage 1: irreversible claim and exact owner binding
            if !fresh || self.lease.ledger.state != State::AwaitStrict(self.lease.scope.round) {
                return Err(Failure::Binding);
            }
            self.lease.ledger.binding(b)?;
            self.tail.require(&self.lease, b)?;
            phases.require_after_scan(self.lease.scope)?;
            revalidate_round_records(source, self.lease.scope, "bp5-r2-round-records-0.1", b)?;
            work(b)?; // O.record_stage 3: terminal guard before typed publication
            b.checkpoint()
        })();
        if let Err(e) = result {
            let reason = self.lease.ledger.fail::<()>(e, b).unwrap_err();
            return Err(self.tail.reject(reason));
        }
        Ok(RecordsVerifiedRound {
            lease: self.lease,
            tail: self.tail,
        })
    }
}
#[cfg(test)]
impl RecordsVerifiedRound<'_, '_, '_> {
    pub(in super::super::super::super) fn acknowledge_for_test(
        mut self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        b.checkpoint()?;
        super::super::tests::ack_fixture(self.lease.ledger, self.lease.scope.round);
        self.lease.completed = true;
        Ok(())
    }
}
