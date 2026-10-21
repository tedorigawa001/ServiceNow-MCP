//! Monotone index-only phase accounting. No admission, spent refund or execution permit.
use super::*;
use work_model::{Error, add, mul, step, sum};

pub(in super::super) const PHASE_MODEL_ID: &str = "bp5-r2-index-phase-work-0.1";
// Preserve the old index bound128; projection4 belongs to records, NOT these phases.
const PRE_FIXED: u64 = 20;
const COMPARE_FIXED: u64 = 11;
const FINAL_FIXED: u64 = 97; // actual10 + unspent conservative slack87

pub(super) struct Partition {
    pub(super) pre: u64,
    pub(super) compare: u64,
    pub(super) final_check: u64,
    pub(super) per_round: u64,
}
pub(super) fn partition(
    index: &work_model::IndexWork,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<Partition, Error> {
    step(b)?; // 1: fixed submodel; no externally supplied phase coefficients
    if expected != PHASE_MODEL_ID || index.model_id() != work_model::WORK_MODEL_ID {
        return Err(Error::ModelMismatch);
    }
    let s = index.shape();
    let n = add(s.files, s.directories)?;
    let c = s.bytes.div_ceil(65536);
    step(b)?; // 2: decoded and Node-checked pre-scan prefix
    let pre = sum(&[
        index.bound().decode,
        mul(2, c)?,
        mul(4, n)?,
        mul(2, s.parents)?,
        PRE_FIXED,
    ])?;
    step(b)?; // 3: two still-required reauthentication/semantic phases
    let compare = sum(&[
        mul(2, c)?,
        mul(3, n)?,
        s.parents,
        work_model::OBSERVED_MAX,
        COMPARE_FIXED,
    ])?;
    let final_check = sum(&[mul(2, c)?, mul(3, n)?, s.parents, FINAL_FIXED])?;
    step(b)?; // 4: compatibility with the WHOLE existing bound, including its slack
    let per_round = sum(&[pre, compare, final_check])?;
    if per_round != index.bound().per_round() || mul(3, per_round)? != index.bound().three_rounds()
    {
        return Err(Error::ModelMismatch);
    }
    b.checkpoint().map_err(Error::Budget)?;
    Ok(Partition {
        pre,
        compare,
        final_check,
        per_round,
    })
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Ready,
    Compared,
    Finished,
}

pub(in super::super) struct IndexPhases<'d, 's, 'r> {
    declaration: &'d RoundDeclaration<'s, 'r>,
    partition: Partition,
    state: State,
    scan_inputs_started: std::cell::Cell<bool>,
}
impl std::fmt::Debug for IndexPhases<'_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("IndexPhases(index_only_not_admission_or_execution_authority)")
    }
}
// Inspection-only scalars, never accepted back as phase completion or a reservation.
pub(in super::super) struct Remaining {
    pub(super) completed_current: u64,
    pub(super) remaining_current: u64,
    pub(super) future_rounds: u64,
    pub(super) remaining_schedule: u64,
}
#[cfg(test)]
impl Remaining {
    pub(in super::super) fn remaining_current_for_test(&self) -> u64 {
        self.remaining_current
    }
}
impl<'s, 'r> RoundDeclaration<'s, 'r> {
    pub(in super::super) fn prepare_scan<'d>(
        &'d self,
        current: &RoundScope<'_>,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<IndexPhases<'d, 's, 'r>, Failure> {
        let result = (|| {
            self.ensure_scope(current, b)?; // extra phase control1
            self.index_work
                .require_model(work_model::WORK_MODEL_ID, b)
                .map_err(|e| work_model::latch(e, b))?; // extra phase control1
            if self.phase_started.replace(true) {
                return Err(Failure::Binding);
            }
            let partition =
                partition(&self.index_work, expected, b).map_err(|e| work_model::latch(e, b))?; // extra phase control4
            // Completion is issued only after the actual Node search, not by a caller enum.
            verify_node_entries(self.entries(), self.scope.target, b)?;
            b.checkpoint()?;
            Ok(IndexPhases {
                declaration: self,
                partition,
                state: State::Ready,
                scan_inputs_started: std::cell::Cell::new(false),
            })
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
}
impl IndexPhases<'_, '_, '_> {
    // Constant-time binding block paid by the final-clock stage owner.
    pub(in super::super) fn require_finished(&self, scope: &RoundScope<'_>) -> Result<(), Failure> {
        if self.state != State::Finished || !std::ptr::eq(self.declaration.scope, scope) {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    pub(in super::super) fn finish_for_round(
        &mut self,
        current: &RoundScope<'_>,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            work(b)?; // O.final_index_stage 2: exact phase/model, not a caller completion enum
            if expected != "bp5-r2-round-final-index-0.1" {
                return Err(Failure::Unavailable);
            }
            self.require_after_scan(current)?;
            self.finish(b)
        })();
        match result {
            Ok(()) => Ok(()),
            Err(e) => b.stop(e),
        }
    }
    // Constant-time check, paid by the record-stage owner's fixed binding block.
    pub(in super::super) fn require_after_scan(
        &self,
        scope: &RoundScope<'_>,
    ) -> Result<(), Failure> {
        if self.state != State::Compared || !std::ptr::eq(self.declaration.scope, scope) {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    // Fixed typed-stage adapter: never accept a caller's "already compared" flag.
    pub(in super::super) fn after_scan_for_round(
        &mut self,
        current: &RoundScope<'_>,
        observed: &ClosureObservation,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            work(b)?; // O.after_scan_stage 2: exact phase owner and fixed submodel
            if expected != "bp5-r2-round-after-scan-0.1" {
                return Err(Failure::Unavailable);
            }
            if !std::ptr::eq(self.declaration.scope, current) {
                return Err(Failure::Binding);
            }
            self.after_scan(observed, b)
        })();
        match result {
            Ok(()) => Ok(()),
            Err(e) => b.stop(e),
        }
    }
    fn transition(&self, state: State, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        work(b)?; // one extra control unit, outside legacy kernel bound
        if self.state != state {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    pub(in super::super) fn after_scan(
        &mut self,
        observed: &ClosureObservation,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            self.transition(State::Ready, b)?;
            let scope = self.declaration.scope;
            if !Rc::ptr_eq(&observed.lineage, &scope.receipt.lineage)
                || observed.records != scope.receipt.binding
                || observed.round != scope.round
                || !Rc::ptr_eq(&observed.token, &scope.token)
            {
                return Err(Failure::Changed);
            }
            self.declaration
                .recheck(scope, Some(&observed.entries), b)?;
            b.checkpoint()?;
            self.state = State::Compared;
            Ok(())
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
    pub(in super::super) fn finish(&mut self, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        let result = (|| {
            self.transition(State::Compared, b)?;
            let scope = self.declaration.scope;
            self.declaration.recheck(scope, None, b)?;
            verify_node_entries(self.declaration.entries(), scope.target, b)?;
            b.checkpoint()?;
            self.state = State::Finished;
            Ok(())
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
    pub(in super::super) fn remaining(
        &self,
        current: &RoundScope<'_>,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<Remaining, Failure> {
        let result = (|| {
            self.declaration.ensure_scope(current, b)?;
            self.declaration
                .index_work
                .require_model(work_model::WORK_MODEL_ID, b)
                .map_err(|e| work_model::latch(e, b))?;
            work(b)?; // bounded phase arithmetic; extra control cost
            if expected != PHASE_MODEL_ID {
                return Err(Failure::Unavailable);
            }
            let result = (|| {
                let p = &self.partition;
                let (completed_current, remaining_current) = match self.state {
                    State::Ready => (p.pre, add(p.compare, p.final_check)?),
                    State::Compared => (add(p.pre, p.compare)?, p.final_check),
                    State::Finished => (p.per_round, 0),
                };
                let future = match self.declaration.scope.round {
                    Round::Initial => 2,
                    Round::BeforeM4 => 1,
                    Round::AfterM4 => 0,
                };
                let future_rounds = mul(future, p.per_round)?;
                Ok::<_, Error>(Remaining {
                    completed_current,
                    remaining_current,
                    future_rounds,
                    remaining_schedule: add(remaining_current, future_rounds)?,
                })
            })()
            .map_err(|e| work_model::latch(e, b))?;
            work(b)?; // terminal snapshot step; never credit it to completed kernel work
            Ok(result)
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
}

impl<'d, 's, 'r> IndexPhases<'d, 's, 'r> {
    pub(super) fn input_declaration(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<&'d RoundDeclaration<'s, 'r>, Failure> {
        self.transition(State::Ready, b)?;
        Ok(self.declaration)
    }
    pub(super) fn claim_inputs(&self, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        work(b)?;
        if self.scan_inputs_started.replace(true) {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    pub(in super::super) fn bind_inputs<'i>(
        &'i self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<super::scan_inputs::ScanInputs<'i, 'd, 's, 'r>, Failure> {
        super::scan_inputs::build(self, current, b)
    }
}

#[cfg(test)]
mod tests;
