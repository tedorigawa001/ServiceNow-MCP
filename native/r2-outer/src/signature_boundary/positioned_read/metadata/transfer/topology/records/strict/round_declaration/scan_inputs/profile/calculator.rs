//! Pure fixed-row estimate; never a work reservation or scan/execution permit.
use super::*;
mod arithmetic;
use arithmetic::{add, mul, sub};
pub(in super::super::super::super) const CALCULATOR_ID: &str = "bp5-r2-collector-work-0.1";
// The coefficient table is versioned with the calculator, not a registered OS kernel.
const KERNEL_ID: &str = CALCULATOR_ID;

pub(in super::super::super::super) struct ScanWorkEstimate<'p, 'i, 'd, 's, 'r> {
    profile: ScanShapeProfile<'p, 'i, 'd, 's, 'r>,
    components: [u64; 8],
    total: u64,
    base: u64,
    remaining_scans: u64,
    profile_upper: u64,
    calculator_model: &'static str,
    kernel_model: &'static str,
}
impl std::fmt::Debug for ScanWorkEstimate<'_, '_, '_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanWorkEstimate(round_budget_only_not_admission_authority)")
    }
}
pub(in super::super::super::super) fn calculate<'p, 'i, 'd, 's, 'r>(
    profile: ScanShapeProfile<'p, 'i, 'd, 's, 'r>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<ScanWorkEstimate<'p, 'i, 'd, 's, 'r>, Failure> {
    let result = (|| {
        profile.require(inputs, scope, MODEL_ID, b)?; // five existing guard work
        let s = &profile.shape;
        row(b, || {
            // 1: models and scalar domains
            if expected != CALCULATOR_ID || KERNEL_ID != CALCULATOR_ID || profile.model != MODEL_ID
            {
                return Err(Failure::Unavailable);
            }
            if s.n > 100_000
                || s.e > 100_001
                || !(1..=64).contains(&s.h)
                || !(1..=64).contains(&s.kv)
                || s.r > 8
                || s.l > MAX_BYTES
                || !(1..=16 * 1024 * 1024).contains(&s.bv)
                || s.cv_chunks != add(s.bv / 65536, u64::from(!s.bv.is_multiple_of(65536)))?
                || s.c < s.cv_chunks
            {
                return Err(Failure::Binding);
            }
            Ok(())
        })?;
        let (m, ln, lv, lc, rounds) = row(b, || {
            // 2
            Ok((
                sub(s.e, s.c0)?,
                arithmetic::ell(s.n),
                arithmetic::ell(s.cv),
                arithmetic::ell(s.cmax),
                match scope.round {
                    Round::Initial => 3,
                    Round::BeforeM4 => 2,
                    Round::AfterM4 => 1,
                },
            ))
        })?;
        let groups = row(b, || arithmetic::groups(s, m, ln, lv))?; // 3
        let route = row(b, || arithmetic::route(s, ln))?; // 4
        let (w, a) = row(b, || arithmetic::walk_shape(s))?; // 5
        let walk = row(b, || arithmetic::walk(w, a))?; // 6
        let enumeration = row(b, || arithmetic::enumeration(s))?; // 7
        let file = row(b, || arithmetic::file(s))?; // 8
        let control = row(b, || arithmetic::control(s))?; // 9
        let seal = row(b, || arithmetic::seal(s))?; // 10
        let tail = row(b, || arithmetic::tail(lc, s.r.into()))?; // 11
        let components = [groups, route, walk, enumeration, file, control, seal, tail];
        let total = row(b, || arithmetic::total(components))?; // 12
        let base = row(b, || sub(total, mul(3, add(s.r.into(), 1)?)?))?; // 13
        let (remaining_scans, profile_upper) = row(b, || {
            // 14
            Ok((
                arithmetic::remaining(rounds, base, s.r.into())?,
                arithmetic::profile_upper(s, m, ln)?,
            ))
        })?;
        work(b)?; // 15: publication, never admission
        validate_relations(s, m)?;
        if !std::ptr::eq(profile.inputs, inputs)
            || !std::ptr::eq(profile.scope, scope)
            || !Rc::ptr_eq(&profile.origin, &b.inspection_origin)
            || profile.started != b.started
        {
            return Err(Failure::Binding);
        }
        if s.r != b.retries_left {
            return Err(Failure::Changed);
        }
        b.checkpoint()?;
        Ok(ScanWorkEstimate {
            profile,
            components,
            total,
            base,
            remaining_scans,
            profile_upper,
            calculator_model: CALCULATOR_ID,
            kernel_model: KERNEL_ID,
        })
    })();
    stop(result, b)
}

fn row<T>(b: &mut SharedBudget<'_>, f: impl FnOnce() -> Result<T, Failure>) -> Result<T, Failure> {
    work(b)?;
    let value = f()?;
    b.checkpoint()?;
    Ok(value)
}
fn validate_relations(s: &Shape, m: u64) -> Result<(), Failure> {
    if s.e != add(s.n, 1)?
        || s.e != add(s.d, s.f)?
        || s.t != add(s.d, 1)?
        || s.t > s.e
        || s.k < s.e
        || s.k > mul(64, s.e)?
        || s.p != sub(s.k, s.e)?
        || m > s.p
        || s.cv == 0
        || s.cv > s.cmax
        || s.cmax > s.e
        || s.j > mul(s.e, arithmetic::ell(s.e))?
        || s.c > s.l
        || s.bv > s.l
    {
        return Err(Failure::Binding);
    }
    Ok(())
}
#[cfg(test)]
mod tests;
