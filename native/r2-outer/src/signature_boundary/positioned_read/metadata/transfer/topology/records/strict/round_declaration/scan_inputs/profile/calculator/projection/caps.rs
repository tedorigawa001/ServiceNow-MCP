//! Pure comparison with a sealed synthetic cap snapshot. No policy/allocation/permit publication.
use super::*;
const CAP_ID: &str = "bp5-r2-projected-scan-caps-synthetic-0.1";
const BUNDLE: [&str; 4] = [
    PROJECTION_ID,
    resource_model::MODEL_ID,
    KERNEL_ID,
    "bp5-r2-scan-xattr-names-0.1",
];
const COUNT: usize = 35;
const COVERAGE: u64 = (1u64 << COUNT) - 1;
const MAX_SYNTHETIC_CAP: u64 = 1_000_000_000;
// Deliberately distinct from PC-01's mock Witness. Only this scan subset is derived.
pub(in super::super::super::super::super::super) struct ScanResourceCaps {
    model: &'static str,
    bundle: [&'static str; 4],
    artifact: [u8; 32],
    origin: Rc<()>,
    token: Rc<()>,
    started: Instant,
    expires: Instant,
    values: [u64; COUNT],
    coverage: u64,
}
pub(in super::super::super::super::super::super) struct ScanCapsCompared<'a> {
    // Borrow self + caps: their lifetime cannot escape or become an owned full-policy proof.
    _borrow: std::marker::PhantomData<&'a ()>,
    owner: Rc<crate::signature_boundary::positioned_read::ProtectedBridgeClaim>,
}
impl ScanCapsCompared<'_> {
    pub(in super::super::super::super::super::super) fn require_complete(
        self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        // Outer/management + bootstrap's three dimensions are not derived yet.
        let reason = work(b).err().unwrap_or(Failure::Unavailable);
        Err(stop_owner(&self.owner, reason, b))
    }
}
fn dimensions(q: &Quantities) -> [u64; COUNT] {
    let mut v = [0; COUNT];
    for (i, attempts) in std::iter::once(&q.three)
        .chain(std::iter::repeat_n(&q.round, 3))
        .enumerate()
    {
        let offset = i * 8;
        v[offset..offset + 5].copy_from_slice(attempts);
        v[offset + 5] = if i == 0 { q.three_total } else { q.round_total };
        v[offset + 6] = q.peak_owners;
        v[offset + 7] = if i == 0 { q.xattr_three } else { q.xattr_round };
    }
    v[32] = q.payload_three;
    v[33] = q.retries.into();
    v[34] = q.enum_buffer_three;
    v
}
pub(in super::super::super::super::super::super) fn compare<'a>(
    projection: &'a ScanResourceRequirements<'_, '_, '_, '_, '_, '_>,
    caps: &'a ScanResourceCaps,
    estimate: &ScanWorkEstimate<'_, '_, '_, '_, '_>,
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<ScanCapsCompared<'a>, Failure> {
    let fresh = !projection.comparison_started.replace(true);
    let result = (|| {
        work(b)?;
        if !fresh {
            return Err(Failure::Binding);
        }
        projection.require(estimate, inputs, scope, b)?; // seven guards
        work(b)?; // fixed cap snapshot authentication, no production approval assertion
        if caps.model != CAP_ID || caps.bundle != BUNDLE || caps.coverage != COVERAGE {
            return Err(Failure::Unavailable);
        }
        if caps.artifact != [0x82; 32]
            || !Rc::ptr_eq(&caps.origin, &b.inspection_origin)
            || !Rc::ptr_eq(&caps.token, &scope.token)
            || caps.started != b.started
        {
            return Err(Failure::Binding);
        }
        if caps.expires
            <= b.started
                .checked_add(Duration::from_secs(10))
                .ok_or(Failure::Limit)?
        {
            return Err(Failure::Expired);
        }
        work(b)?; // fixed 35-slot mapping + shared payload envelope
        let required = dimensions(&projection.quantities);
        let remaining = MAX_BYTES
            .checked_sub(b.used)
            .and_then(|n| n.checked_sub(b.reserved))
            .ok_or(Failure::Limit)?;
        if projection.quantities.payload_three > remaining {
            return Err(Failure::Limit);
        }
        for (need, limit) in required.into_iter().zip(caps.values) {
            work(b)?;
            if limit > MAX_SYNTHETIC_CAP || need > limit {
                return Err(Failure::Limit);
            }
        }
        b.checkpoint()?;
        Ok(ScanCapsCompared {
            _borrow: std::marker::PhantomData,
            owner: estimate.resource_owner.clone(),
        })
    })();
    finish(projection.estimate, result, b)
}
impl std::fmt::Debug for ScanResourceCaps {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanResourceCaps(synthetic_snapshot_not_operating_cap)")
    }
}
impl std::fmt::Debug for ScanCapsCompared<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanCapsCompared(scan_subset_only_outer_bootstrap_unverified)")
    }
}

// No non-test issuer; values are independent fixed caps, never copied from requirements.
#[cfg(test)]
pub(super) fn synthetic(scope: &RoundScope<'_>, b: &SharedBudget<'_>) -> ScanResourceCaps {
    ScanResourceCaps {
        model: CAP_ID,
        bundle: BUNDLE,
        artifact: [0x82; 32],
        origin: b.inspection_origin.clone(),
        token: scope.token.clone(),
        started: b.started,
        expires: b.started + Duration::from_secs(11),
        coverage: COVERAGE,
        values: [MAX_SYNTHETIC_CAP; COUNT],
    }
}

#[cfg(test)]
mod tests;
