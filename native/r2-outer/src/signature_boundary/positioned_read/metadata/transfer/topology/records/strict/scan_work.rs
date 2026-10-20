//! Pure quantity calculator for the proposed collector. No OS source, admission or permit.
use super::*;

pub(super) const MODEL_ID: &str = "bp5-r2-scan-work-0.1";
const CALCULATION_WORK: u64 = 12;
const WORK_CAP: u64 = 1_000_000;
const COLLECTOR_FIXED: u64 = 16; // proposed operation schedule, NOT measured collector work
const SNAPSHOT_WORK: u64 = 18; // same: backend/ABI costs remain unverified

pub(super) struct Shape {
    pub(super) files: u64, // declaration only, excluding index itself
    pub(super) directories: u64,
    pub(super) parents: u64, // includes index path parents
    pub(super) root_depth: u64,
    pub(super) index_bytes: u64,
    pub(super) file_bytes: u64, // includes index bytes
    pub(super) chunks: u64,     // sum of per-file ceil(size/65536), including index
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Limit {
    Shape,
    Overflow,
    Retry,
    Cap,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Error {
    ModelMismatch,
    Binding,
    Changed,
    Limit(Limit),
    Budget(Failure),
}
fn step(b: &mut SharedBudget<'_>) -> Result<(), Error> {
    work(b).map_err(Error::Budget)
}
fn add(a: u64, b: u64) -> Result<u64, Error> {
    a.checked_add(b).ok_or(Error::Limit(Limit::Overflow))
}
fn mul(a: u64, b: u64) -> Result<u64, Error> {
    a.checked_mul(b).ok_or(Error::Limit(Limit::Overflow))
}
fn sum(v: &[u64]) -> Result<u64, Error> {
    v.iter().try_fold(0, |a, n| add(a, *n))
}
fn latch(e: Error, b: &mut SharedBudget<'_>) -> Failure {
    let reason = match e {
        Error::ModelMismatch => Failure::Unavailable,
        Error::Binding => Failure::Binding,
        Error::Changed => Failure::Changed,
        Error::Limit(_) => Failure::Limit,
        Error::Budget(e) => e,
    };
    let _ = b.stop::<()>(reason);
    b.failed.unwrap_or(reason)
}
struct Operations {
    entries: u64,
    files: u64,
    directories: u64,
    relative_edges: u64,
    walks: u64,
    walk_opens: u64,
    opens: u64,
    snapshots: u64,
    yields: u64,
    enum_attempts: u64,
    read_base: u64,
    cleanup: u64,
    live_base: u64,
    total_base: u64,
    round_with_retries: u64,
    three_with_retries: u64,
}
struct Costs {
    expected: u64,
    open_close: u64,
    metadata: u64,
    enumeration: u64,
    missing: u64,
    reads_base: u64,
    hashing: u64,
    observed: u64,
    fixed: u64,
    round_base: u64,
    round_with_retries: u64,
    three_with_retries: u64,
    payload_round: u64,
    payload_three: u64,
    name_copy_three: u64,
}
// Sealed arithmetic result only. Shape has no protected producer in this stage.
pub(super) struct Estimate {
    id: &'static str,
    origin: Rc<()>,
    retries: u8,
    operations: Operations,
    costs: Costs,
}
impl std::fmt::Debug for Estimate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanWork(arithmetic_only_not_collector_or_admission_authority)")
    }
}
impl Estimate {
    fn require_inner(&self, expected: &str, b: &mut SharedBudget<'_>) -> Result<(), Error> {
        step(b)?; // optional extra guard, outside both calculation12 and collector16
        if expected != MODEL_ID || self.id != MODEL_ID {
            return Err(Error::ModelMismatch);
        }
        if !Rc::ptr_eq(&self.origin, &b.inspection_origin) {
            return Err(Error::Binding);
        }
        if self.retries != b.retries_left {
            return Err(Error::Changed);
        }
        b.checkpoint().map_err(Error::Budget)
    }
    pub(super) fn require(&self, expected: &str, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        self.require_inner(expected, b).map_err(|e| latch(e, b))
    }
    // Quantity-only, like the index helper: does not subtract spent or reserve work.
    pub(super) fn check_work_cap(
        &self,
        expected: &str,
        available: u64,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            self.require_inner(expected, b)?;
            step(b)?;
            if available > WORK_CAP || self.costs.three_with_retries > available {
                return Err(Error::Limit(Limit::Cap));
            }
            b.checkpoint().map_err(Error::Budget)
        })();
        result.map_err(|e| latch(e, b))
    }
}
fn calculate(s: &Shape, expected: &str, b: &mut SharedBudget<'_>) -> Result<Estimate, Error> {
    step(b)?; // 1 fixed model
    if expected != MODEL_ID {
        return Err(Error::ModelMismatch);
    }
    step(b)?; // 2 structural envelope, NOT evidence of an accepted index
    let n = add(s.files, s.directories)?;
    let e = add(n, 1)?;
    let f = add(s.files, 1)?;
    let t = add(s.directories, 1)?;
    let k = add(e, s.parents)?;
    if n > 100_000
        || s.parents > mul(63, e)?
        || !(1..=64).contains(&s.root_depth)
        || s.index_bytes == 0
        || s.index_bytes > 16 * 1024 * 1024
        || s.file_bytes < s.index_bytes
        || s.file_bytes > MAX_BYTES
    {
        return Err(Error::Limit(Limit::Shape));
    }
    step(b)?; // 3 reject incoherent aggregate byte/chunk claims
    let data = s.file_bytes - s.index_bytes; // validated above; never saturating subtraction
    if data > mul(s.files, MAX_FILE)? {
        return Err(Error::Limit(Limit::Shape));
    }
    let index_chunks = s.index_bytes.div_ceil(65536);
    let minimum_data_chunks = data.div_ceil(65536);
    let maximum_data_chunks = if data == 0 {
        0
    } else {
        let positive = s.files.min(data);
        if positive == 0 {
            return Err(Error::Limit(Limit::Shape));
        }
        add(minimum_data_chunks, positive - 1)?
            .min(data)
            .min(mul(s.files, MAX_FILE / 65536)?)
    };
    if s.chunks < add(index_chunks, minimum_data_chunks)?
        || s.chunks > add(index_chunks, maximum_data_chunks)?
    {
        return Err(Error::Limit(Limit::Shape));
    }
    step(b)?; // 4 snapshot ORIGINAL shared retry credit, do not consume or replenish it
    let retries = b.retries_left;
    if retries > EINTR_RETRIES {
        return Err(Error::Limit(Limit::Retry));
    }
    let r = u64::from(retries);
    step(b)?; // 5 complete root/path walks
    let walks = mul(2, add(e, 1)?)?;
    let walk_opens = add(mul(walks, add(s.root_depth, 1)?)?, mul(2, k)?)?;
    let opens = add(walk_opens, t)?;
    let snapshots = sum(&[walk_opens, f, mul(2, t)?])?;
    step(b)?; // 6 enumeration, including one rejected extra yield and EOFs
    let yields = sum(&[e, mul(2, t)?, 1])?;
    let enum_attempts = add(yields, t)?;
    step(b)?; // 7 operation histogram, including mandatory cleanup
    let read_base = add(s.chunks, f)?;
    let cleanup = add(opens, snapshots)?;
    let live_base = sum(&[opens, mul(9, snapshots)?, enum_attempts, read_base])?;
    let total_base = add(live_base, cleanup)?;
    step(b)?; // 8 work ownership components; coefficients remain proposed collector costs
    let mut costs = Costs {
        expected: mul(4, e)?,
        open_close: mul(2, opens)?,
        metadata: mul(SNAPSHOT_WORK, snapshots)?,
        enumeration: sum(&[mul(2, enum_attempts)?, mul(3, yields)?, t])?,
        missing: e,
        reads_base: mul(2, read_base)?,
        hashing: add(mul(2, s.chunks)?, mul(2, f)?)?,
        observed: mul(4, e)?,
        fixed: COLLECTOR_FIXED,
        round_base: 0,
        round_with_retries: 0,
        three_with_retries: 0,
        payload_round: 0,
        payload_three: 0,
        name_copy_three: 0,
    };
    step(b)?; // 9 round upper
    costs.round_base = sum(&[
        costs.expected,
        costs.open_close,
        costs.metadata,
        costs.enumeration,
        costs.missing,
        costs.reads_base,
        costs.hashing,
        costs.observed,
        costs.fixed,
    ])?;
    costs.round_with_retries = add(costs.round_base, mul(2, r)?)?;
    step(b)?; // 10 THREE rounds share retry credit ONCE, never 3*r
    costs.three_with_retries = add(mul(3, costs.round_base)?, mul(2, r)?)?;
    let operations = Operations {
        entries: e,
        files: f,
        directories: t,
        relative_edges: k,
        walks,
        walk_opens,
        opens,
        snapshots,
        yields,
        enum_attempts,
        read_base,
        cleanup,
        live_base,
        total_base,
        round_with_retries: add(total_base, r)?,
        three_with_retries: add(mul(3, total_base)?, r)?,
    };
    step(b)?; // 11 independent resource quantities, NOT approvals of their caps
    costs.payload_round = add(s.file_bytes, f)?;
    costs.payload_three = mul(3, costs.payload_round)?;
    costs.name_copy_three = mul(mul(3, snapshots)?, 65536)?;
    step(b)?; // 12 completed result
    b.checkpoint().map_err(Error::Budget)?;
    Ok(Estimate {
        id: MODEL_ID,
        origin: b.inspection_origin.clone(),
        retries,
        operations,
        costs,
    })
}
pub(super) fn estimate(
    s: &Shape,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<Estimate, Failure> {
    calculate(s, expected, b).map_err(|e| latch(e, b))
}

#[cfg(test)]
mod tests;
