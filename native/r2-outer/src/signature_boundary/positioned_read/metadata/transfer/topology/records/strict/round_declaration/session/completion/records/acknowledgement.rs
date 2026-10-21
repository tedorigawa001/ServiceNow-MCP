//! Private immediate producer/consumer; never an execution or M4 proof.
use super::*;

struct StrictAcknowledgement<'a, 'r, 's> {
    lease: RoundResourceScope<'a, 'r, 's>,
    tail: ScanTailData,
    model: &'static str,
}
impl std::fmt::Debug for StrictAcknowledgement<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("StrictAcknowledgement(round_tail_only_not_execution_authority)")
    }
}
impl FinalClockRound<'_, '_, '_> {
    #[allow(clippy::result_large_err)] // Fixed cleanup diagnostics stay inline after failure.
    pub(in super::super::super::super::super) fn acknowledge(
        self,
        phases: &super::super::super::super::phases::IndexPhases<'_, '_, '_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), CompletionFailure> {
        let slot = match self.lease.scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        // Owner-side irreversible attempt, before any fallible operation.
        let fresh = !std::mem::replace(&mut self.lease.ledger.ack_started[slot], true);
        let result = (|| {
            work(b)?; // O.strict_ack 1: claim and complete typed-tail state
            if !fresh
                || self.lease.ledger.state != State::AwaitStrict(self.lease.scope.round)
                || !self.lease.ledger.complete_started[slot]
                || !self.lease.ledger.after_scan_started[slot]
                || !self.lease.ledger.records_started[slot]
                || !self.lease.ledger.final_index_started[slot]
                || !self.lease.ledger.final_clock_started[slot]
            {
                return Err(Failure::Binding);
            }
            self.lease.ledger.binding(b)?;
            self.tail.require(&self.lease, b)?;
            phases.require_finished(self.lease.scope)?;
            work(b)?; // O.strict_ack 2: fixed producer, no arbitrary callback or timestamp
            b.checkpoint()
        })();
        if let Err(e) = result {
            let reason = self.lease.ledger.fail::<()>(e, b).unwrap_err();
            return Err(self.tail.reject(reason));
        }
        // No await, caller callback or public acknowledgement handoff in this gap.
        StrictAcknowledgement {
            lease: self.lease,
            tail: self.tail,
            model: "bp5-r2-strict-ack-0.1",
        }
        .consume(b)
    }
}
impl StrictAcknowledgement<'_, '_, '_> {
    #[allow(clippy::result_large_err)]
    fn consume(mut self, b: &mut SharedBudget<'_>) -> Result<(), CompletionFailure> {
        let result = (|| {
            work(b)?; // O.strict_ack 3: consumer binding and last fallible checkpoint
            if self.model != "bp5-r2-strict-ack-0.1"
                || self.lease.ledger.state != State::AwaitStrict(self.lease.scope.round)
            {
                return Err(Failure::Binding);
            }
            self.lease.ledger.binding(b)?;
            self.tail.require(&self.lease, b)?;
            b.checkpoint()
        })();
        if let Err(e) = result {
            let reason = self.lease.ledger.fail::<()>(e, b).unwrap_err();
            return Err(self.tail.reject(reason));
        }
        // No further fallible work between commit and releasing the exclusive lease.
        self.lease.ledger.state = match self.lease.scope.round {
            Round::Initial => State::Expect(Round::BeforeM4),
            Round::BeforeM4 => State::Expect(Round::AfterM4),
            Round::AfterM4 => State::Finished,
        };
        self.lease.completed = true;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn acknowledgement_is_not_clone_copy_or_serializable() {
        macro_rules! not_impl {
            ($bound:path) => {{
                trait Ambiguous<A> {
                    fn check() {}
                }
                impl<T: ?Sized> Ambiguous<()> for T {}
                impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
                let _ = <StrictAcknowledgement<'_, '_, '_> as Ambiguous<_>>::check;
            }};
        }
        not_impl!(Clone);
        not_impl!(Copy);
        not_impl!(serde::Serialize);
        not_impl!(serde::de::DeserializeOwned);
    }
}
