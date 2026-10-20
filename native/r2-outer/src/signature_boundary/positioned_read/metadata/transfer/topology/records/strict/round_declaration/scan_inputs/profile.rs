//! Round-bound statistics and pure estimates. No collector dispatch or admission.
use super::*;
pub(in super::super::super) mod calculator;
mod collect;

pub(in super::super::super) const MODEL_ID: &str = "bp5-r2-scan-profile-0.1";

#[derive(Default)]
struct Shape {
    n: u64,
    e: u64,
    d: u64,
    f: u64,
    t: u64,
    h: u64,
    k: u64,
    p: u64,
    kv: u64,
    c0: u64,
    cv: u64,
    cmax: u64,
    j: u64,
    l: u64,
    c: u64,
    bv: u64,
    cv_chunks: u64,
    r: u8,
}
pub(in super::super::super) struct ScanShapeProfile<'p, 'i, 'd, 's, 'r> {
    inputs: &'p ScanInputs<'i, 'd, 's, 'r>,
    scope: &'p RoundScope<'s>,
    origin: Rc<()>,
    started: Instant,
    shape: Shape,
    model: &'static str,
}
impl std::fmt::Debug for ScanShapeProfile<'_, '_, '_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanShapeProfile(round_budget_only_not_admission_authority)")
    }
}
pub(in super::super::super) fn build<'p, 'i, 'd, 's, 'r>(
    inputs: &'p ScanInputs<'i, 'd, 's, 'r>,
    current: &'p RoundScope<'s>,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<ScanShapeProfile<'p, 'i, 'd, 's, 'r>, Failure> {
    let result = (|| {
        // Claim before the first fallible step. Even a cancelled/failed attempt stays spent.
        let duplicate = inputs.profile_started.replace(true);
        work(b)?;
        if duplicate {
            return Err(Failure::Binding);
        }
        work(b)?;
        if expected != MODEL_ID {
            return Err(Failure::Unavailable);
        }
        let layout = inputs.layout(current, b)?; // existing guard/projection: four work
        work(b)?;
        if !std::ptr::eq(current, inputs.declaration.scope) {
            return Err(Failure::Binding);
        }
        let origin = b.inspection_origin.clone();
        let started = b.started;
        let retries = b.retries_left;
        let (mut shape, total, nested) = collect::counts(&layout, current, b)?;
        work(b)?; // scalar consistency + publication, not another scan/parse
        shape.t = collect::add(shape.d, 1)?;
        shape.r = retries;
        if shape.e != collect::add(shape.n, 1)?
            || shape.e != collect::add(shape.d, shape.f)?
            || shape.t > shape.e
            || total != shape.e
            || shape.p != shape.k.checked_sub(shape.e).ok_or(Failure::Limit)?
            || shape.c0 > shape.e
            || nested != shape.e - shape.c0
            || nested > shape.p
            || shape.cv == 0
            || shape.cv > shape.cmax
            || shape.cmax > shape.e
        {
            return Err(Failure::Binding);
        }
        if !Rc::ptr_eq(&origin, &b.inspection_origin) || started != b.started {
            return Err(Failure::Binding);
        }
        if retries != b.retries_left {
            return Err(Failure::Changed);
        }
        b.checkpoint()?;
        Ok(ScanShapeProfile {
            inputs,
            scope: current,
            origin,
            started,
            shape,
            model: MODEL_ID,
        })
    })();
    stop(result, b)
}

impl ScanShapeProfile<'_, '_, '_, '_, '_> {
    pub(in super::super::super) fn require(
        &self,
        inputs: &ScanInputs<'_, '_, '_, '_>,
        current: &RoundScope<'_>,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            inputs.guard(current, b)?; // three work, including Ready
            work(b)?;
            if expected != MODEL_ID || self.model != MODEL_ID {
                return Err(Failure::Unavailable);
            }
            if !std::ptr::eq(self.inputs, inputs)
                || !std::ptr::eq(self.scope, current)
                || !Rc::ptr_eq(&self.origin, &b.inspection_origin)
                || self.started != b.started
            {
                return Err(Failure::Binding);
            }
            work(b)?;
            if self.shape.r != b.retries_left {
                return Err(Failure::Changed);
            }
            b.checkpoint()
        })();
        stop(result, b)
    }
}

#[cfg(test)]
mod tests;
