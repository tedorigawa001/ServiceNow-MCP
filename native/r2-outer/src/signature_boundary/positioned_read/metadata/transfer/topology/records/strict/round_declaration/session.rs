//! Inspection/round-local state and internal accounting. No operational policy or permit.
use super::*;
use crate::signature_boundary::positioned_read::ScanSessionClaim;

pub(super) const MODEL_ID: &str = "bp5-r2-scan-session-state-0.1";
const RESOURCE_ID: &str = "bp5-r2-scan-resource-0.2";
const KERNEL_ID: &str = "bp5-r2-collector-work-0.2";

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Expect(Round),
    Active(Round),
    AwaitStrict(Round),
    Finished,
    Stopped(Failure),
}
pub(in super::super) struct ScanSessionLedger<'s> {
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    lineage: Rc<()>,
    origin: Rc<()>,
    claim: Rc<ScanSessionClaim>,
    started: Instant,
    model: &'static str,
    tokens: [Option<Rc<()>>; 3],
    complete_started: [bool; 3],
    after_scan_started: [bool; 3],
    records_started: [bool; 3],
    final_index_started: [bool; 3],
    final_clock_started: [bool; 3],
    ack_started: [bool; 3],
    state: State,
    resources: Option<Rc<std::cell::RefCell<resources::Accounting>>>,
}
pub(in super::super) struct RoundResourceScope<'a, 'r, 's> {
    ledger: &'a mut ScanSessionLedger<'s>,
    scope: &'r RoundScope<'s>,
    completed: bool, // Set only after consuming the complete typed strict tail (or test fixtures).
}
impl std::fmt::Debug for ScanSessionLedger<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanSessionLedger(state_only_not_resource_or_execution_authority)")
    }
}
impl std::fmt::Debug for RoundResourceScope<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RoundResourceScope(binding_only_not_scan_permission)")
    }
}
pub(in super::super) fn create<'s>(
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<ScanSessionLedger<'s>, Failure> {
    let fresh = !b.scan_session_claim.started.replace(true); // before ANY fallible step
    let result = (|| {
        work(b)?; // O.session_create 1: creation attempt and fixed models
        if !fresh {
            return Err(Failure::Binding);
        }
        if expected != MODEL_ID
            || RESOURCE_ID != super::super::scan_ops::resource_model::MODEL_ID
            || KERNEL_ID != super::super::scan_ops::collector::KERNEL_MODEL_ID
        {
            return Err(Failure::Unavailable);
        }
        work(b)?; // O.session_create 2: capture original identity, never a quota producer
        b.checkpoint()?;
        Ok(ScanSessionLedger {
            receipt,
            target,
            context,
            lineage: receipt.lineage.clone(),
            origin: b.inspection_origin.clone(),
            claim: b.scan_session_claim.clone(),
            started: b.started,
            model: MODEL_ID,
            tokens: [None, None, None],
            complete_started: [false; 3],
            after_scan_started: [false; 3],
            records_started: [false; 3],
            final_index_started: [false; 3],
            final_clock_started: [false; 3],
            ack_started: [false; 3],
            state: State::Expect(Round::Initial),
            resources: None,
        })
    })();
    match result {
        Ok(v) => Ok(v),
        Err(e) => b.stop(e),
    }
}
impl<'s> ScanSessionLedger<'s> {
    // Narrow outer-owner hooks; no state setter or normal completion producer.
    pub(in super::super) fn require_inspection(&self, b: &SharedBudget<'_>) -> Result<(), Failure> {
        self.binding(b)?;
        if let Some(reason) = self.claim.failure.get() {
            return Err(reason);
        }
        if let State::Stopped(reason) = self.state {
            return Err(reason);
        }
        Ok(())
    }
    pub(in super::super) fn require_acknowledged(
        &self,
        round: Round,
        b: &SharedBudget<'_>,
    ) -> Result<(), Failure> {
        self.require_inspection(b)?;
        let slot = match round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        let expected = match round {
            Round::Initial => State::Expect(Round::BeforeM4),
            Round::BeforeM4 => State::Expect(Round::AfterM4),
            Round::AfterM4 => State::Finished,
        };
        if !self.ack_started[slot] || self.state != expected {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    pub(in super::super) fn stop_inspection(
        &mut self,
        reason: Failure,
        b: &mut SharedBudget<'_>,
    ) -> Failure {
        self.fail::<()>(reason, b).unwrap_err()
    }
    pub(in super::super) fn abandon_inspection(&mut self) {
        let reason = self.claim.failure.get().unwrap_or(match self.state {
            State::Stopped(e) => e,
            _ => Failure::Unavailable,
        });
        self.claim.failure.set(Some(reason));
        self.state = State::Stopped(reason);
    }
    #[cfg(test)]
    pub(in super::super) fn acknowledged_for_owner_test(&self, round: Round) -> bool {
        let slot = match round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        self.ack_started[slot]
            && self.state
                == match round {
                    Round::Initial => State::Expect(Round::BeforeM4),
                    Round::BeforeM4 => State::Expect(Round::AfterM4),
                    Round::AfterM4 => State::Finished,
                }
    }
    fn binding(&self, b: &SharedBudget<'_>) -> Result<(), Failure> {
        if self.model != MODEL_ID {
            return Err(Failure::Unavailable);
        }
        if !Rc::ptr_eq(&self.origin, &b.inspection_origin)
            || !Rc::ptr_eq(&self.claim, &b.scan_session_claim)
            || !self.claim.started.get()
            || self.started != b.started
        {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    fn fail<T>(&mut self, reason: Failure, b: &mut SharedBudget<'_>) -> Result<T, Failure> {
        let reason = self.claim.failure.get().unwrap_or(reason);
        let _ = b.stop::<()>(reason);
        let reason = self.claim.failure.get().or(b.failed).unwrap_or(reason);
        self.claim.failure.set(Some(reason));
        self.state = State::Stopped(reason);
        Err(reason)
    }
    pub(in super::super) fn begin<'a, 'r>(
        &'a mut self,
        current: &'r RoundScope<'s>,
        b: &mut SharedBudget<'_>,
    ) -> Result<RoundResourceScope<'a, 'r, 's>, Failure> {
        let prior = std::mem::replace(&mut self.state, State::Stopped(Failure::Binding));
        let result = (|| {
            work(b)?; // O.session_begin 1: original budget/creation identity
            self.binding(b)?;
            work(b)?; // O.session_begin 2: expected slot and exact receipt/target/context
            if prior != State::Expect(current.round)
                || !std::ptr::eq(self.receipt, current.receipt)
                || !Rc::ptr_eq(&self.lineage, &current.receipt.lineage)
                || !std::ptr::eq(self.target, current.target)
                || !std::ptr::eq(self.context, current.context)
                || !Rc::ptr_eq(&current.budget_origin, &self.origin)
                || self
                    .tokens
                    .iter()
                    .flatten()
                    .any(|token| Rc::ptr_eq(token, &current.token))
            {
                return Err(Failure::Binding);
            }
            b.checkpoint()
        })();
        if let Err(e) = result {
            return self.fail(e, b);
        }
        let slot = match current.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        self.tokens[slot] = Some(current.token.clone());
        self.state = State::Active(current.round);
        Ok(RoundResourceScope {
            ledger: self,
            scope: current,
            completed: false,
        })
    }
}
impl RoundResourceScope<'_, '_, '_> {
    pub(super) fn require(
        &mut self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            work(b)?; // O.session_require 1: fixed identity/state block
            self.ledger.binding(b)?;
            if self.ledger.state != State::Active(current.round)
                || !std::ptr::eq(self.scope, current)
                || !Rc::ptr_eq(&self.scope.token, &current.token)
            {
                return Err(Failure::Binding);
            }
            b.checkpoint()
        })();
        match result {
            Ok(()) => Ok(()),
            Err(e) => self.ledger.fail(e, b),
        }
    }
    pub(super) fn stop(self, reason: Failure, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        self.ledger.fail(reason, b)
    }
}
fn abandon(state: &mut State, claim: &ScanSessionClaim) {
    if *state != State::Finished {
        let reason = claim.failure.get().unwrap_or(match *state {
            State::Stopped(e) => e,
            _ => Failure::Unavailable,
        });
        claim.failure.set(Some(reason));
        *state = State::Stopped(reason);
    }
}
impl Drop for RoundResourceScope<'_, '_, '_> {
    fn drop(&mut self) {
        if !self.completed {
            abandon(&mut self.ledger.state, &self.ledger.claim);
        }
    }
}
impl Drop for ScanSessionLedger<'_> {
    fn drop(&mut self) {
        abandon(&mut self.state, &self.claim);
    }
}

pub(in super::super) mod completion;
pub(in super::super) mod resources;
#[cfg(test)]
mod tests;
