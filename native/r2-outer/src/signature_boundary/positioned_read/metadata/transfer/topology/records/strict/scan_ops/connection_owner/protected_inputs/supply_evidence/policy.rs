//! Synthetic-only cap/requirement evidence contract. No production approval, allocation or permit.
use super::*;
#[cfg(test)]
pub(in super::super::super::super) mod synthetic;

const MODEL: &str = "bp5-r2-policy-caps-evidence-0.1";
const CAP_MODEL: &str = "bp5-r2-synthetic-approved-caps-0.1";
const REQUIREMENT_MODEL: &str = "bp5-r2-synthetic-resource-witness-0.1";
// Session + three rounds, each: five attempts, total, live/cleanup, names.
// Eight independent dimensions: payload, retry, enum bytes, outer owners,
// management allocations, bootstrap bytes/work/live. No omitted dimension is zero-filled.
const DIMENSIONS: usize = 40;
const COVERAGE: u64 = (1u64 << DIMENSIONS) - 1;
const MAX_SYNTHETIC_CAP: u64 = 1_000_000; // Test contract only, not an operating cap.
const MODELS: [&str; 12] = [
    "bp5-r2-record-work-0.1",
    "bp5-r2-index-work-0.1",
    "bp5-r2-index-phase-work-0.1",
    "bp5-r2-scan-profile-0.1",
    "bp5-r2-collector-work-0.2",
    "bp5-r2-collector-entry-0.2",
    "bp5-r2-session-collector-entry-0.2",
    "bp5-r2-scan-resource-0.2",
    "bp5-r2-scan-xattr-names-0.1",
    "bp5-r2-scan-session-state-0.1",
    "bp5-r2-session-allocation-0.1",
    "bp5-r2-synthetic-cap-bootstrap-0.1",
];
struct ModelBundle {
    models: [&'static str; 12],
    // Synthetic artifact identities, NOT hashes of an approved production build.
    build: [u8; 32],
    coefficients: [u8; 32],
    role: &'static str,
}
struct ApprovedCaps {
    model: &'static str,
    authority: Rc<()>,
    revision: u64,
    digest: [u8; 32],
    bundle: ModelBundle,
    valid_from: Instant,
    expires: Instant,
    coverage: u64,
    values: [u64; DIMENSIONS],
}
struct ResourceRequirementWitness {
    model: &'static str,
    authority: Rc<()>,
    // Same synthetic profile/Initial scope owner; no raw summary constructor.
    profile: Rc<()>,
    bundle: ModelBundle,
    coverage: u64,
    values: [u64; DIMENSIONS],
}
struct PolicyIdentity<'s> {
    binding: held::SlotBinding<'s>,
    model: &'static str,
    authority: Rc<()>,
    profile: Rc<()>,
    issued_here: std::cell::Cell<bool>,
}
pub(in super::super::super::super) struct PolicyInputs<'s, R, T, S> {
    held: held::HeldEvidenceInputs<'s, R, T, S>,
    caps: ApprovedCaps,
    requirement: ResourceRequirementWitness,
    identity: Rc<PolicyIdentity<'s>>,
}
pub(in super::super::super::super) struct PolicyCapsEvidence<'s> {
    identity: Rc<PolicyIdentity<'s>>,
}
pub(in super::super::super::super) struct PolicyCapsChecked<'s> {
    _identity: Rc<PolicyIdentity<'s>>,
}
fn validate<R: ResourceOrigin, T, S>(
    p: &PolicyInputs<'_, R, T, S>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    work(b)?; // O.policy_binding: same held/source/context/receipt and pre-session identity.
    p.identity.binding.require(&p.held, b)?;
    let claim = &p.identity.binding.owner().bridge;
    if claim.slots_evidence_issued.get() || claim.slots_evidence_used.get() {
        return Err(Failure::Binding); // Never accept Slots -> PolicyCaps.
    }
    if !Rc::ptr_eq(&p.identity.authority, &p.caps.authority)
        || !Rc::ptr_eq(&p.identity.authority, &p.requirement.authority)
        || !Rc::ptr_eq(&p.identity.profile, &p.requirement.profile)
    {
        return Err(Failure::Binding);
    }
    work(b)?; // O.policy_models: fixed bounded bundle, not ID-only authority.
    if p.identity.model != MODEL
        || p.caps.model != CAP_MODEL
        || p.requirement.model != REQUIREMENT_MODEL
        || p.caps.coverage != COVERAGE
        || p.requirement.coverage != COVERAGE
    {
        return Err(Failure::Unavailable);
    }
    for bundle in [&p.caps.bundle, &p.requirement.bundle] {
        if bundle.models != MODELS {
            return Err(Failure::Unavailable);
        }
        if bundle.build != [0x51; 32]
            || bundle.coefficients != [0x62; 32]
            || bundle.role != "synthetic-only"
        {
            return Err(Failure::Binding);
        }
    }
    work(b)?; // O.policy_approval: fixed synthetic approval record + original deadline.
    if p.caps.revision != 1 || p.caps.digest != [0x73; 32] {
        return Err(Failure::Binding);
    }
    let now = (b.now)();
    let end = b
        .started
        .checked_add(Duration::from_secs(10))
        .ok_or(Failure::Limit)?;
    if p.caps.valid_from > now || p.caps.expires <= end {
        return Err(Failure::Expired);
    }
    for (required, cap) in p.requirement.values.iter().zip(p.caps.values) {
        work(b)?; // O.policy_dimension: 40 fixed independent comparisons; no cap arithmetic.
        if cap > MAX_SYNTHETIC_CAP || *required > cap {
            return Err(Failure::Limit);
        }
    }
    b.checkpoint()
}
fn reject(id: &PolicyIdentity<'_>, e: Failure, b: &mut SharedBudget<'_>) -> InputRejected {
    rejected(id.binding.owner(), SupplyStage::PolicyCaps, e, b)
}
impl<'s> PolicyCapsEvidence<'s> {
    pub(in super::super::super::super) fn consume<R: ResourceOrigin, T, S>(
        self,
        inputs: &PolicyInputs<'_, R, T, S>,
        b: &mut SharedBudget<'_>,
    ) -> Result<PolicyCapsChecked<'s>, InputRejected> {
        let claim = &self.identity.binding.owner().bridge;
        let fresh = !claim.policy_evidence_used.replace(true);
        if !Rc::ptr_eq(claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.policy_evidence_used.set(true);
        }
        let result = (|| {
            work(b)?; // O.policy_consume entry; irreversible before any fallible step.
            check_identity(self.identity.binding.owner(), b)?;
            if !fresh
                || !self.identity.issued_here.get()
                || !Rc::ptr_eq(&self.identity, &inputs.identity)
            {
                return Err(Failure::Binding);
            }
            validate(inputs, b)
        })();
        match result {
            Ok(()) => Ok(PolicyCapsChecked {
                _identity: self.identity,
            }),
            Err(e) => Err(reject(&self.identity, e, b)),
        }
    }
}
macro_rules! opaque {
    ($t:ident $(<$($g:ident),+>)?, $text:literal) => {
        impl$(<$($g),+>)? std::fmt::Debug for $t$(<$($g),+>)? {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str($text)
            }
        }
    };
}
opaque!(
    ApprovedCaps,
    "ApprovedCaps(synthetic_only_not_production_authority)"
);
opaque!(
    ResourceRequirementWitness,
    "ResourceRequirementWitness(synthetic_profile_only)"
);
impl<R, T, S> std::fmt::Debug for PolicyInputs<'_, R, T, S> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PolicyInputs(synthetic_inert_not_supply)")
    }
}
impl std::fmt::Debug for PolicyCapsEvidence<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PolicyCapsEvidence(synthetic_issuer_not_authority)")
    }
}
impl std::fmt::Debug for PolicyCapsChecked<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PolicyCapsChecked(independent_fragment_not_allocation_or_permit)")
    }
}

#[cfg(test)]
mod contracts {
    use super::*;
    #[test]
    fn policy_cap_and_witness_are_move_only_and_not_serializable() {
        macro_rules! not_impl {
            ($t:ty,$bound:path) => {{
                trait Ambiguous<A> {
                    fn check() {}
                }
                impl<T: ?Sized> Ambiguous<()> for T {}
                impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
                let _ = <$t as Ambiguous<_>>::check;
            }};
        }
        macro_rules! opaque {
            ($t:ty) => {{
                not_impl!($t, Clone);
                not_impl!($t, Copy);
                not_impl!($t, serde::Serialize);
                not_impl!($t, serde::de::DeserializeOwned);
            }};
        }
        opaque!(ApprovedCaps);
        opaque!(ResourceRequirementWitness);
        opaque!(ModelBundle);
        assert!(std::mem::size_of::<PolicyCapsEvidence<'static>>() <= 32);
    }
}
