//! Sole test issuer: no external caps, summary, clock, factory or production approval input.
use super::*;

fn bundle() -> ModelBundle {
    ModelBundle {
        models: MODELS,
        build: [0x51; 32],
        coefficients: [0x62; 32],
        role: "synthetic-only",
    }
}
pub(in super::super::super::super::super) fn prepare<'s, R: ResourceOrigin, T, S>(
    held: held::HeldEvidenceInputs<'s, R, T, S>,
    checked: held::HeldSourcesChecked,
    b: &mut SharedBudget<'_>,
) -> Result<PolicyInputs<'s, R, T, S>, InputRejected> {
    let owner = held.slot_owner().clone();
    let binding = (|| {
        work(b)?; // O.policy_prepare: consumes same held-stage token; no I/O/decode.
        if owner.bridge.policy_evidence_issued.get()
            || owner.bridge.policy_evidence_used.get()
            || owner.bridge.slots_evidence_issued.get()
            || owner.bridge.slots_evidence_used.get()
        {
            return Err(Failure::Binding);
        }
        held.bind_slots(checked, b)
    })()
    .map_err(|e| rejected(&owner, SupplyStage::PolicyCaps, e, b))?;
    let authority = Rc::new(());
    let profile = Rc::new(());
    let expires = b
        .started
        .checked_add(Duration::from_secs(11))
        .ok_or_else(|| rejected(&owner, SupplyStage::PolicyCaps, Failure::Limit, b))?;
    Ok(PolicyInputs {
        caps: ApprovedCaps {
            model: CAP_MODEL,
            authority: authority.clone(),
            revision: 1,
            digest: [0x73; 32],
            bundle: bundle(),
            valid_from: b.started,
            expires,
            coverage: COVERAGE,
            values: [1000; DIMENSIONS], // Fixture values, never approved operating caps.
        },
        requirement: ResourceRequirementWitness {
            model: REQUIREMENT_MODEL,
            authority: authority.clone(),
            profile: profile.clone(),
            bundle: bundle(),
            coverage: COVERAGE,
            values: [10; DIMENSIONS], // Simulated witness, NOT a production profile projection.
        },
        held,
        identity: Rc::new(PolicyIdentity {
            binding,
            authority,
            profile,
            model: MODEL,
            issued_here: std::cell::Cell::new(false),
        }),
    })
}
impl<'s, R: ResourceOrigin, T, S> PolicyInputs<'s, R, T, S> {
    pub(in super::super::super::super::super) fn issue(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<PolicyCapsEvidence<'s>, InputRejected> {
        let claim = &self.identity.binding.owner().bridge;
        let fresh = !claim.policy_evidence_issued.replace(true);
        if !Rc::ptr_eq(claim, &b.protected_bridge_claim) {
            b.protected_bridge_claim.policy_evidence_issued.set(true);
        }
        let result = (|| {
            work(b)?; // O.policy_issue entry.
            check_identity(self.identity.binding.owner(), b)?;
            if !fresh {
                return Err(Failure::Binding);
            }
            validate(self, b)
        })();
        match result {
            Ok(()) => {
                self.identity.issued_here.set(true);
                Ok(PolicyCapsEvidence {
                    identity: self.identity.clone(),
                })
            }
            Err(e) => Err(reject(&self.identity, e, b)),
        }
    }
    // Private fixture corruption only. Never a production constructor or override channel.
    pub(in super::super::super::super::super) fn fault(&mut self, fault: Fault) {
        match fault {
            Fault::CapModel => self.caps.model = "unknown",
            Fault::WitnessModel => self.requirement.model = "unknown",
            Fault::Bundle(i) => self.requirement.bundle.models[i] = "old-or-unknown",
            Fault::Build => self.caps.bundle.build[0] ^= 1,
            Fault::Coefficients => self.requirement.bundle.coefficients[0] ^= 1,
            Fault::Role => self.caps.bundle.role = "production",
            Fault::Revision => self.caps.revision += 1,
            Fault::Digest => self.caps.digest[0] ^= 1,
            Fault::Authority => self.caps.authority = Rc::new(()),
            Fault::Profile => self.requirement.profile = Rc::new(()),
            Fault::Coverage => self.requirement.coverage &= !1,
            Fault::MissingBootstrap => self.caps.coverage &= !(1 << 39),
            Fault::Expired => self.caps.expires = self.caps.valid_from,
            Fault::DeadlineEqual => {
                self.caps.expires = self.caps.valid_from + Duration::from_secs(10)
            }
            Fault::Future => self.caps.valid_from += Duration::from_secs(1),
            Fault::Unissued => self.identity.issued_here.set(false),
            Fault::Held(i) => self.held.corrupt_fixture(i),
        }
    }
    pub(in super::super::super::super::super) fn dimension(
        &mut self,
        i: usize,
        required: u64,
        cap: u64,
    ) {
        self.requirement.values[i] = required;
        self.caps.values[i] = cap;
    }
}
#[derive(Clone, Copy)]
pub(in super::super::super::super::super) enum Fault {
    CapModel,
    WitnessModel,
    Bundle(usize),
    Build,
    Coefficients,
    Role,
    Revision,
    Digest,
    Authority,
    Profile,
    Coverage,
    MissingBootstrap,
    Expired,
    DeadlineEqual,
    Future,
    Unissued,
    Held(u8),
}
impl PolicyCapsEvidence<'_> {
    pub(in super::super::super::super::super) fn duplicate_fixture(&self) -> Self {
        Self {
            identity: self.identity.clone(),
        }
    }
}
