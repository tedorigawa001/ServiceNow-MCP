//! Sealed index-only charged-work model. Not a reservation, CPU/RSS bound or permit.
use super::*;

pub(super) const WORK_MODEL_ID: &str = "bp5-r2-index-work-0.1";
const CAP: u64 = 1_000_000;
const FIXED_BOUND: u64 = 128;
// Legacy compatibility harness: existing32 + shape3 + calculation8 + reuse guards2.
// Its45 includes projection4 now owned by records; the pure index child kernel is41.
const FIXED_CHARGED: u64 = 45;
pub(super) const OBSERVED_MAX: u64 = 100_001; // N+1 early rejection is NOT implemented.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Limit {
    Shape,
    Overflow,
    Cap,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Error {
    ModelMismatch,
    Limit(Limit),
    Budget(Failure),
}
pub(super) fn step(b: &mut SharedBudget<'_>) -> Result<(), Error> {
    work(b).map_err(Error::Budget)
}
pub(super) fn add(a: u64, b: u64) -> Result<u64, Error> {
    a.checked_add(b).ok_or(Error::Limit(Limit::Overflow))
}
pub(super) fn mul(a: u64, b: u64) -> Result<u64, Error> {
    a.checked_mul(b).ok_or(Error::Limit(Limit::Overflow))
}
pub(super) fn sum(values: &[u64]) -> Result<u64, Error> {
    values.iter().try_fold(0, |a, v| add(a, *v))
}
pub(super) struct Shape {
    pub(super) bytes: u64,
    pub(super) files: u64,
    pub(super) directories: u64,
    pub(super) parents: u64,
}
impl Shape {
    pub(super) fn counts(&self) -> (u64, u64, u64, u64) {
        (self.bytes, self.files, self.directories, self.parents)
    }
}
pub(super) struct Bound {
    pub(super) decode: u64,
    statistics: u64,
    variable: u64,
    per_round: u64,
    three_rounds: u64,
}
impl Bound {
    pub(super) fn per_round(&self) -> u64 {
        self.per_round
    }
    pub(super) fn three_rounds(&self) -> u64 {
        self.three_rounds
    }
    pub(super) fn components(&self) -> (u64, u64, u64, u64) {
        (self.decode, self.statistics, self.variable, FIXED_BOUND)
    }
}
pub(super) struct IndexWork {
    id: &'static str,
    shape: Shape,
    bound: Bound,
}
impl std::fmt::Debug for IndexWork {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("IndexWork(sealed_index_only_not_admission_or_execution_authority)")
    }
}
impl IndexWork {
    pub(super) fn build(
        scope: &RoundScope<'_>,
        parsed: &closure::shared::DecodedDeclaration<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<Self, Error> {
        step(b)?;
        let bytes = u64::try_from(scope.receipt.pins[2].bytes.len())
            .map_err(|_| Error::Limit(Limit::Overflow))?;
        let mut shape = Shape {
            bytes,
            files: 0,
            directories: 0,
            parents: 0,
        };
        for entry in parsed.entries() {
            step(b)?;
            match entry {
                closure::Entry::File { .. } => shape.files = add(shape.files, 1)?,
                closure::Entry::Directory { .. } => shape.directories = add(shape.directories, 1)?,
            }
            count_parents(entry.path(), &mut shape.parents, b)?;
        }
        step(b)?;
        count_parents(&scope.index_path, &mut shape.parents, b)?;
        step(b)?;
        let bound = calculate(&shape, WORK_MODEL_ID, b)?;
        Ok(Self {
            id: WORK_MODEL_ID,
            shape,
            bound,
        })
    }
    pub(super) fn require_model(
        &self,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Error> {
        step(b)?;
        if self.id != WORK_MODEL_ID || expected != WORK_MODEL_ID {
            return Err(Error::ModelMismatch);
        }
        Ok(())
    }
    pub(super) fn model_id(&self) -> &'static str {
        self.id
    }
    pub(super) fn shape(&self) -> &Shape {
        &self.shape
    }
    pub(super) fn bound(&self) -> &Bound {
        &self.bound
    }
    // Pure index cap check only. Does not inspect spent/remaining work or reserve anything.
    pub(super) fn check_cap(
        &self,
        expected: &str,
        available: u64,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Error> {
        self.require_model(expected, b)?;
        step(b)?;
        if available > CAP || self.bound.three_rounds > available {
            return Err(Error::Limit(Limit::Cap));
        }
        Ok(())
    }
}
fn count_parents(path: &str, total: &mut u64, b: &mut SharedBudget<'_>) -> Result<(), Error> {
    // Scope/parsed tree were already strict-validated. Recheck local limits defensively.
    if !closure::path(path) {
        return Err(Error::Limit(Limit::Shape));
    }
    let mut parent = path;
    while let Some((prefix, _)) = parent.rsplit_once('/') {
        step(b)?;
        *total = add(*total, 1)?;
        parent = prefix;
    }
    Ok(())
}
fn calculate(s: &Shape, expected: &str, b: &mut SharedBudget<'_>) -> Result<Bound, Error> {
    step(b)?; // 1: fixed model selector, never a caller-supplied coefficient table.
    if expected != WORK_MODEL_ID {
        return Err(Error::ModelMismatch);
    }
    step(b)?; // 2: structural limits; checked addition before size comparisons.
    let n = add(s.files, s.directories)?;
    let max_parents = mul(add(n, 1)?, 63)?;
    if s.bytes == 0 || s.bytes > 16 * 1024 * 1024 || n > 100_000 || s.parents > max_parents {
        return Err(Error::Limit(Limit::Shape));
    }
    step(b)?; // 3: accepted JSON work only, not arbitrary unauthenticated input.
    let chunks = add(s.bytes / 65536, u64::from(!s.bytes.is_multiple_of(65536)))?;
    let decode = sum(&[chunks, 20, mul(26, s.files)?, mul(17, s.directories)?])?;
    step(b)?; // 4: unchanged semantic/hash/Node loops, including observed global cap.
    let variable = sum(&[
        mul(6, chunks)?,
        mul(9, n)?,
        mul(3, s.parents)?,
        OBSERVED_MAX,
    ])?;
    step(b)?; // 5: collection variable cost; collection fixed3 is inside FIXED_BOUND.
    let statistics = add(n, s.parents)?;
    step(b)?; // 6: fixed allowance includes all eight calculation steps and two reuse guards.
    let per_round = sum(&[decode, variable, statistics, FIXED_BOUND])?;
    step(b)?; // 7: exactly three fresh-decode rounds; no spent-work subtraction.
    let three_rounds = mul(3, per_round)?;
    step(b)?; // 8: completed immutable result.
    Ok(Bound {
        decode,
        statistics,
        variable,
        per_round,
        three_rounds,
    })
}
pub(super) fn latch(error: Error, b: &mut SharedBudget<'_>) -> Failure {
    let reason = match error {
        Error::ModelMismatch => Failure::Unavailable,
        Error::Limit(_) => Failure::Limit,
        Error::Budget(e) => e,
    };
    let _ = b.stop::<()>(reason);
    b.failed.unwrap_or(reason)
}

#[cfg(test)]
mod tests;
