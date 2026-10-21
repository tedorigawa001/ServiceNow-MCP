//! Fixed-width scalar formulae only; no budget, traversal, allocation or I/O.
use super::*;
pub(super) fn add(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_add(b).ok_or(Failure::Limit)
}
pub(super) fn mul(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_mul(b).ok_or(Failure::Limit)
}
pub(super) fn sub(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_sub(b).ok_or(Failure::Limit)
}
pub(super) fn ell(n: u64) -> u64 {
    u64::from(64 - n.leading_zeros())
}
pub(super) fn groups(s: &Shape, m: u64, ln: u64, lv: u64) -> Result<u64, Failure> {
    add(
        add(
            add(
                add(add(8, mul(4, s.e)?)?, mul(4, s.t)?)?,
                mul(s.p.min(m), ln)?,
            )?,
            lv,
        )?,
        s.cv,
    )
}
pub(super) fn route(s: &Shape, ln: u64) -> Result<u64, Failure> {
    add(
        add(add(add(add(s.h, 2)?, mul(s.e, add(s.h, 3)?)?)?, s.k)?, s.kv)?,
        mul(s.p, ln)?,
    )
}
pub(super) fn walk_shape(s: &Shape) -> Result<(u64, u64), Failure> {
    let w = add(mul(2, s.e)?, 3)?;
    Ok((w, add(mul(w, add(s.h, 1)?)?, mul(2, s.k)?)?))
}
pub(super) fn walk(w: u64, a: u64) -> Result<u64, Failure> {
    add(w, mul(23, a)?)
}
pub(super) fn enumeration(s: &Shape) -> Result<u64, Failure> {
    add(add(mul(32, s.e)?, mul(58, s.t)?)?, s.j)
}
pub(super) fn file(s: &Shape) -> Result<u64, Failure> {
    add(mul(56, s.f)?, mul(5, s.c)?)
}
pub(super) fn control(s: &Shape) -> Result<u64, Failure> {
    add(add(38, mul(4, s.e)?)?, s.d)
}
pub(super) fn seal(s: &Shape) -> Result<u64, Failure> {
    add(add(add(11, mul(2, s.cv_chunks)?)?, mul(4, s.e)?)?, s.p)
}
pub(super) fn tail(lc: u64, r: u64) -> Result<u64, Failure> {
    add(add(16, lc)?, mul(3, add(r, 1)?)?)
}
pub(super) fn total(c: [u64; 8]) -> Result<u64, Failure> {
    // Eight fixed terms, not a variable-length sum/traversal.
    add(
        add(
            add(add(add(add(add(c[0], c[1])?, c[2])?, c[3])?, c[4])?, c[5])?,
            c[6],
        )?,
        c[7],
    )
}
pub(super) fn remaining(n: u64, base: u64, r: u64) -> Result<u64, Failure> {
    add(add(mul(n, base)?, mul(3, r)?)?, 3)
}
pub(super) fn profile_upper(s: &Shape, m: u64, ln: u64) -> Result<u64, Failure> {
    add(
        add(
            add(add(add(11, mul(2, s.n)?)?, mul(5, s.e)?)?, s.k)?,
            mul(m, add(ln, 1)?)?,
        )?,
        s.d,
    )
}
