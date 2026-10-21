//! Typed scan completion and tail stages. Ordinary strict orchestration is disconnected.
use super::super::super::scan_ops::collector::completion::{
    CompletionFailure, RoundScanSuccess, ScanTailData,
};
use super::*;
pub(in super::super::super) mod records;

pub(in super::super::super) const MODEL_ID: &str = "bp5-r2-strict-round-completion-0.1";
pub(in super::super::super) struct PendingStrictRound<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    scan: RoundScanSuccess,
}
// Holds cleanup/attempt identity but no Observation/Vec and no reusable scan authority.
pub(in super::super::super) struct AfterScanRound<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    tail: ScanTailData,
}
impl std::fmt::Debug for AfterScanRound<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("AfterScanRound(awaiting_strict_tail_not_execution_authority)")
    }
}
impl<'a, 'r, 's> PendingStrictRound<'a, 'r, 's> {
    // Fixed-size cleanup diagnostic, no allocation after the budget stops.
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn after_scan(
        self,
        phases: &mut super::super::phases::IndexPhases<'_, '_, '_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<AfterScanRound<'a, 'r, 's>, CompletionFailure> {
        let slot = match self.lease.scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        let fresh = !std::mem::replace(&mut self.lease.ledger.after_scan_started[slot], true);
        let result = (|| {
            work(b)?; // O.after_scan_stage 1: one-shot claim and pending owner binding
            if !fresh || self.lease.ledger.state != State::AwaitStrict(self.lease.scope.round) {
                return Err(Failure::Binding);
            }
            self.lease.ledger.binding(b)?;
            self.scan.require(&self.lease, b)?;
            phases.after_scan_for_round(
                self.lease.scope,
                self.scan.observation(),
                "bp5-r2-round-after-scan-0.1",
                b,
            )
        })();
        if let Err(e) = result {
            let reason = self.lease.ledger.fail::<()>(e, b).unwrap_err();
            return Err(self.scan.reject(reason));
        }
        let tail = self.scan.discard_observation();
        // Post-release checkpoint: cancellation here cannot publish a typed success.
        if let Err(e) = work(b).and_then(|()| b.checkpoint()) {
            // O.after_scan_stage 3
            let reason = self.lease.ledger.fail::<()>(e, b).unwrap_err();
            return Err(tail.reject(reason));
        }
        Ok(AfterScanRound {
            lease: self.lease,
            tail,
        })
    }
}
impl std::fmt::Debug for PendingStrictRound<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PendingStrictRound(awaiting_strict_not_execution_authority)")
    }
}
impl PendingStrictRound<'_, '_, '_> {
    pub(in super::super::super) fn observation(&self) -> &ClosureObservation {
        self.scan.observation()
    }
    #[cfg(test)]
    pub(in super::super::super) fn awaiting(&self) -> bool {
        self.lease.ledger.state == State::AwaitStrict(self.lease.scope.round)
            && !self.lease.completed
    }
}
#[cfg(test)]
impl AfterScanRound<'_, '_, '_> {
    // TEST ONLY: bypass the record/FinalIndex/clock-tail stages for component tests.
    pub(in super::super::super) fn acknowledge_for_test(
        mut self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        b.checkpoint()?;
        super::tests::ack_fixture(self.lease.ledger, self.lease.scope.round);
        self.lease.completed = true;
        Ok(())
    }
}
impl<'a, 'r, 's> RoundResourceScope<'a, 'r, 's> {
    // Preserve closed cleanup evidence inline even when the budget has stopped.
    #[allow(clippy::result_large_err)]
    pub(in super::super::super) fn complete_scan(
        mut self,
        success: RoundScanSuccess,
        b: &mut SharedBudget<'_>,
    ) -> Result<PendingStrictRound<'a, 'r, 's>, CompletionFailure> {
        let slot = match self.scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        // Irreversible attempt claim before work/checkpoint/binding; never refund.
        let fresh = !std::mem::replace(&mut self.ledger.complete_started[slot], true);
        let result = (|| {
            work(b)?; // O.round_complete 1: attempt, fixed producer model and owner binding
            if !fresh || success.model() != MODEL_ID {
                return Err(Failure::Binding);
            }
            self.require(self.scope, b)?; // O.round_complete 2: existing require1
            work(b)?; // O.round_complete 3: closed attempt/session/scope binding
            success.require(&self, b)?;
            b.checkpoint()
        })();
        if let Err(e) = result {
            let reason = self.ledger.fail::<()>(e, b).unwrap_err();
            return Err(success.reject(reason));
        }
        self.ledger.state = State::AwaitStrict(self.scope.round);
        // Keep the exclusive lease; its unacknowledged Drop stops the session.
        Ok(PendingStrictRound {
            lease: self,
            scan: success,
        })
    }
}
#[cfg(test)]
impl PendingStrictRound<'_, '_, '_> {
    // TEST ONLY: bypass the actual strict tail; not used by typed acknowledgement.
    pub(in super::super::super) fn acknowledge_for_test(
        mut self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        b.checkpoint()?;
        super::tests::ack_fixture(self.lease.ledger, self.lease.scope.round);
        self.lease.completed = true;
        Ok(())
    }
}
