//! Round-local parse reuse in the synthetic strict pipeline. No runtime entry or permit.
use super::*;

pub(super) mod phases;
mod work_model;

pub(super) struct RoundScope<'s> {
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    round: Round,
    token: Rc<()>,
    decode_started: std::cell::Cell<bool>,
    budget_origin: Rc<()>,
    hash: String,
    index_path: String,
}
impl RoundScope<'_> {
    pub(super) fn token(&self) -> &Rc<()> {
        &self.token
    }
    fn binding(&self) -> closure::Binding<'_> {
        closure::Binding {
            release_id: &self.receipt.binding.release,
            generation: self.receipt.binding.generation,
            index_sha256: &self.hash,
            index_path: &self.index_path,
            node_path: &self.target.relative,
        }
    }
}
// No Clone/serde/public constructor, mutable getter or mutable tree view. The borrow of
// scope prevents the declaration from escaping the private with_round invocation.
pub(super) struct RoundDeclaration<'s, 'r> {
    scope: &'r RoundScope<'s>,
    parsed: closure::shared::DecodedDeclaration<'s>,
    index_work: work_model::IndexWork,
    phase_started: std::cell::Cell<bool>,
}
// Inspection-only copy of counts/units, never accepted as a constructor or reservation.
pub(super) struct IndexWorkSummary {
    pub(super) model_id: &'static str,
    pub(super) counts: (u64, u64, u64, u64),
    pub(super) components: (u64, u64, u64, u64),
    pub(super) per_round: u64,
    pub(super) three_rounds: u64,
}
impl std::fmt::Debug for RoundDeclaration<'_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RoundDeclaration(pending_synthetic_reader_not_execution_authority)")
    }
}
impl<'s, 'r> RoundDeclaration<'s, 'r> {
    pub(super) fn entries(&self) -> &[closure::Entry] {
        self.parsed.entries()
    }
    fn ensure_scope(
        &self,
        current: &RoundScope<'_>,
        budget: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        work(budget)?;
        if !Rc::ptr_eq(&self.scope.budget_origin, &budget.inspection_origin)
            || !Rc::ptr_eq(&current.budget_origin, &budget.inspection_origin)
            || !Rc::ptr_eq(&self.scope.token, &current.token)
            || !Rc::ptr_eq(&self.scope.receipt.lineage, &current.receipt.lineage)
            || !std::ptr::eq(self.scope.receipt, current.receipt)
            || !std::ptr::eq(self.scope.target, current.target)
            || !std::ptr::eq(self.scope.context, current.context)
            || self.scope.round != current.round
        {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    pub(super) fn work_summary(
        &self,
        current: &RoundScope<'_>,
        expected: &str,
        budget: &mut SharedBudget<'_>,
    ) -> Result<IndexWorkSummary, Failure> {
        let result = (|| {
            self.ensure_scope(current, budget)?;
            self.index_work
                .require_model(expected, budget)
                .map_err(|e| work_model::latch(e, budget))?;
            work(budget)?; // Optional summary access is separate from the kernel bound.
            Ok(IndexWorkSummary {
                model_id: self.index_work.model_id(),
                counts: self.index_work.shape().counts(),
                components: self.index_work.bound().components(),
                per_round: self.index_work.bound().per_round(),
                three_rounds: self.index_work.bound().three_rounds(),
            })
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => budget.stop(e),
        }
    }
    pub(super) fn check_index_cap(
        &self,
        current: &RoundScope<'_>,
        expected: &str,
        available: u64,
        budget: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            self.ensure_scope(current, budget)?;
            self.index_work
                .check_cap(expected, available, budget)
                .map_err(|e| work_model::latch(e, budget))
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => budget.stop(e),
        }
    }
    pub(super) fn recheck(
        &self,
        current: &RoundScope<'_>,
        observed: Option<&[closure::Entry]>,
        budget: &mut SharedBudget<'_>,
    ) -> Result<closure::CheckedIndex, Failure> {
        let result = (|| {
            self.ensure_scope(current, budget)?;
            self.index_work
                .require_model(work_model::WORK_MODEL_ID, budget)
                .map_err(|e| work_model::latch(e, budget))?;
            // Identity checks supplement the sealed borrowed scope; an address/hash
            // supplied by a caller is never a producer of approved record evidence.
            budget
                .recheck_round_declaration(&self.parsed, &current.binding(), observed)
                .map_err(|_| latched(budget))
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => budget.stop(e),
        }
    }
}
impl<'s> RoundScope<'s> {
    pub(super) fn decode<'r>(
        &'r self,
        budget: &mut SharedBudget<'_>,
    ) -> Result<RoundDeclaration<'s, 'r>, Failure> {
        let result = (|| {
            work(budget)?;
            if !Rc::ptr_eq(&self.budget_origin, &budget.inspection_origin) {
                return Err(Failure::Binding);
            }
            // The attempt is one-shot, including syntax/semantic failure. No retry or
            // implicit fallback parse is allowed under an existing round token.
            if self.decode_started.replace(true) {
                return Err(Failure::Binding);
            }
            let parsed = budget
                .decode_round_declaration(&self.receipt.pins[2].bytes, &self.binding())
                .map_err(|_| latched(budget))?;
            let index_work = work_model::IndexWork::build(self, &parsed, budget)
                .map_err(|e| work_model::latch(e, budget))?;
            Ok(RoundDeclaration {
                scope: self,
                parsed,
                index_work,
                phase_started: std::cell::Cell::new(false),
            })
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => budget.stop(e),
        }
    }
}
pub(super) fn with_round<'s, T>(
    receipt: &'s RecordReceipt,
    target: &'s TargetDeclaration,
    context: &'s InspectionContext<'s>,
    round: Round,
    budget: &mut SharedBudget<'_>,
    use_round: impl for<'r> FnOnce(&'r RoundScope<'s>, &mut SharedBudget<'_>) -> Result<T, Failure>,
) -> Result<T, Failure> {
    let result = (|| {
        work(budget)?;
        let bound = bind(&receipt.binding, &receipt.lineage, target)?;
        validate_receipt(receipt, &bound, budget)?;
        let scope = RoundScope {
            receipt,
            target,
            context,
            round,
            token: Rc::new(()),
            decode_started: std::cell::Cell::new(false),
            budget_origin: budget.inspection_origin.clone(),
            hash: hex(&receipt.binding.index_hash),
            index_path: relative(&receipt.binding.index_path, &receipt.binding.runtime_root)?
                .into(),
        };
        let result = use_round(&scope, budget);
        // Latch before dropping the scope and before the terminal cancellation guard.
        let result = match result {
            Ok(v) => Ok(v),
            Err(e) => budget.stop(e),
        };
        drop(scope);
        budget.checkpoint()?;
        result
    })();
    match result {
        Ok(v) => Ok(v),
        Err(e) => budget.stop(e),
    }
}

#[cfg(test)]
mod tests;
