//! Scan completion only. No strict acknowledgement or next-round authority.
use super::super::super::scan_ops::collector::completion::{CompletionFailure, RoundScanSuccess};
use super::*;

pub(in super::super::super) const MODEL_ID: &str = "bp5-r2-strict-round-completion-0.1";
pub(in super::super::super) struct PendingStrictRound<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    scan: RoundScanSuccess,
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
    // TEST ONLY: real strict tail acknowledgement is deliberately not implemented.
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
