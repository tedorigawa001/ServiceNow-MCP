//! Actual record reread and strict validation. No FinalIndex/clock-tail acknowledgement.
use super::*;
pub(in super::super::super::super) struct RecordsVerifiedRound<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    tail: ScanTailData,
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
