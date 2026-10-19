//! Internal staged contract, not a Security.framework implementation or execution authority.
//! No raw CF objects/status strings, arbitrary requirement text, flags or public injection hook.
use crate::signature_policy::{
    BoundPolicy, Observation, ParsedRegistry, PolicyFailure, RegistryReference, Role,
};
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Rejection {
    Unsupported,
    ApiFailed,
    MissingObject,
    InvalidSignature,
    RequirementMismatch,
    UnknownObservation,
    IdentityChanged,
    IssuerMismatch,
    FlagsMismatch,
    EntitlementMismatch,
    PolicyRejected,
    Limit,
    Deadline,
    Cancelled,
}
// Semantic request profile, NOT numeric Apple constants or an SDK-approved flags mask.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum ValidationProfile {
    OfflineFullExecutable,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Status {
    Valid,
    Invalid,
    RequirementMismatch,
    Unknown,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Layout {
    ThinArm64,
    Unsupported,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum SignatureForm {
    DeveloperIdApplication,
    Unsigned,
    AdHoc,
    LinkerOnly,
    Unknown,
}
#[derive(Clone, PartialEq, Eq)]
pub(super) struct Identity {
    pub device: u64,
    pub inode: u64,
    pub size: u64,
    pub sha256: String,
}
pub(super) struct Snapshot {
    pub layout: Layout,
    pub form: SignatureForm,
    pub identity: Identity,
    pub team_id: String,
    pub identifier: String,
    pub anchor: String,
    pub certificate_class: String,
    pub static_flags: u32,
    pub entitlements: Observation,
}
pub(super) struct SelfObservation {
    pub status: Status,
    pub identity: Identity,
}
// The future native backend must own every acquired CF object with RAII, including failures
// internal to acquisition/copy. A trait signature alone cannot prove native CF ownership.
pub(super) trait Backend {
    type Handle;
    fn now(&self) -> Instant {
        Instant::now()
    }
    fn identity(&self) -> Result<Identity, Rejection>;
    fn acquire(&self, role: Role) -> Result<Option<Self::Handle>, Rejection>;
    fn validate(
        &self,
        handle: &Self::Handle,
        policy: &BoundPolicy<'_>,
        profile: ValidationProfile,
    ) -> Result<Status, Rejection>;
    fn validate_self(
        &self,
        handle: &Self::Handle,
        profile: ValidationProfile,
    ) -> Result<SelfObservation, Rejection>;
    fn snapshot(&self, handle: &Self::Handle) -> Result<Option<Snapshot>, Rejection>;
}
pub(super) struct Request<'a> {
    pub registry: &'a ParsedRegistry,
    pub reference: RegistryReference<'a>,
    pub policy_id: &'a str,
    pub role: Role,
    pub expected: &'a Identity,
    // Original outer inspection start; never replaced with an API-local budget.
    pub started: Instant,
    pub cancelled: &'a AtomicBool,
}
pub(super) struct ComparedSnapshot {
    pub entitlement_keys: usize,
}
impl std::fmt::Debug for ComparedSnapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ComparedSnapshot(not_execution_authority)")
    }
}
fn guard(b: &impl Backend, r: &Request<'_>) -> Result<(), Rejection> {
    if r.cancelled.load(Ordering::Acquire) {
        return Err(Rejection::Cancelled);
    }
    if b.now()
        .checked_duration_since(r.started)
        .is_none_or(|d| d >= Duration::from_secs(10))
    {
        return Err(Rejection::Deadline);
    }
    Ok(())
}
fn checked<T>(
    b: &impl Backend,
    r: &Request<'_>,
    call: impl FnOnce() -> Result<T, Rejection>,
) -> Result<T, Rejection> {
    guard(b, r)?;
    let result = call();
    guard(b, r)?; // Drop even successful late responses; do not retry with weaker settings.
    result
}
fn valid(status: Status) -> Result<(), Rejection> {
    match status {
        Status::Valid => Ok(()),
        Status::Invalid => Err(Rejection::InvalidSignature),
        Status::RequirementMismatch => Err(Rejection::RequirementMismatch),
        Status::Unknown => Err(Rejection::UnknownObservation),
    }
}
fn policy_error(e: PolicyFailure) -> Rejection {
    match e {
        PolicyFailure::Deadline => Rejection::Deadline,
        PolicyFailure::Limit => Rejection::Limit,
        PolicyFailure::EntitlementMismatch => Rejection::EntitlementMismatch,
        PolicyFailure::UnknownObservation => Rejection::UnknownObservation,
        _ => Rejection::PolicyRejected,
    }
}
pub(super) fn inspect(b: &impl Backend, r: &Request<'_>) -> Result<ComparedSnapshot, Rejection> {
    guard(b, r)?;
    let p = r
        .registry
        .bound_policy(&r.reference, r.policy_id, r.role, r.started)
        .map_err(policy_error)?;
    if p.template != "developer_id_application_v1" {
        return Err(Rejection::PolicyRejected);
    }
    if r.expected.size == 0
        || r.expected.sha256.len() != 64
        || !r
            .expected
            .sha256
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    {
        return Err(Rejection::IdentityChanged);
    }
    if checked(b, r, || b.identity())? != *r.expected {
        return Err(Rejection::IdentityChanged);
    }
    let handle = checked(b, r, || b.acquire(r.role))?.ok_or(Rejection::MissingObject)?;
    let profile = ValidationProfile::OfflineFullExecutable;
    valid(checked(b, r, || b.validate(&handle, &p, profile))?)?;
    if r.role == Role::Launcher {
        let own = checked(b, r, || b.validate_self(&handle, profile))?;
        valid(own.status)?;
        if own.identity != *r.expected {
            return Err(Rejection::IdentityChanged);
        }
    }
    let observed = checked(b, r, || b.snapshot(&handle))?.ok_or(Rejection::MissingObject)?;
    if observed.layout != Layout::ThinArm64 {
        return Err(Rejection::Unsupported);
    }
    if observed.form != SignatureForm::DeveloperIdApplication {
        return Err(Rejection::InvalidSignature);
    }
    if observed.identity != *r.expected {
        return Err(Rejection::IdentityChanged);
    }
    // Bounded projection contract; a future CF adapter must enforce limits before allocating Strings.
    if [
        &observed.team_id,
        &observed.identifier,
        &observed.anchor,
        &observed.certificate_class,
    ]
    .iter()
    .any(|s| s.len() > 128 || s.chars().any(char::is_control))
    {
        return Err(Rejection::Limit);
    }
    if observed.team_id != p.team_id
        || observed.identifier != p.identifier
        || observed.anchor != p.anchor
        || observed.certificate_class != p.certificate_class
    {
        return Err(Rejection::IssuerMismatch);
    }
    if observed.static_flags != p.static_flags {
        return Err(Rejection::FlagsMismatch);
    }
    let summary = r
        .registry
        .compare_entitlements(
            &r.reference,
            r.policy_id,
            r.role,
            &observed.entitlements,
            r.started,
        )
        .map_err(policy_error)?;
    if checked(b, r, || b.identity())? != *r.expected {
        return Err(Rejection::IdentityChanged);
    }
    drop(handle);
    guard(b, r)?;
    Ok(ComparedSnapshot {
        entitlement_keys: summary.key_count,
    })
}

#[cfg(test)]
mod tests;
