//! Pure ledger-0.2 data validation. Not an installed-record reader or an execution permit.
use crate::signature_policy::{ParsedRegistry, PolicyFailure};
use crate::{
    schema::LedgerV2,
    signature_policy::{RegistryReference, Role},
};
use sha2::{Digest, Sha256};
use std::time::Instant;
#[derive(Debug, PartialEq, Eq)]
pub enum LedgerFailure {
    Invalid,
    Limit,
    Deadline,
    Binding,
    Expired,
    Registry(PolicyFailure),
}
pub struct Context<'a> {
    pub ledger_sha256: &'a str,
    pub generation: u64,
    pub release_id: &'a str,
    pub execution_uid: u32,
    pub index_sha256: &'a str,
    pub product_version: &'a str,
    pub os_build: &'a str,
    pub start_wall_ms: u64,
}
#[derive(Debug, PartialEq, Eq)]
pub struct BindingSummary {
    pub bound_policies: usize,
}
/// All inputs are caller-provided inspection data. Context is not proof of a validated activation.
pub fn parse_and_bind(
    bytes: &[u8],
    registry: &ParsedRegistry,
    context: &Context<'_>,
    started: Instant,
) -> Result<BindingSummary, LedgerFailure> {
    parse_bound_ledger(bytes, registry, context, started)?;
    Ok(BindingSummary { bound_policies: 2 })
}
pub(crate) fn parse_bound_ledger(
    bytes: &[u8],
    registry: &ParsedRegistry,
    context: &Context<'_>,
    started: Instant,
) -> Result<LedgerV2, LedgerFailure> {
    elapsed(started)?;
    if bytes.len() > 65536 {
        return Err(LedgerFailure::Limit);
    }
    // Authenticate the exact bytes against the pinned hash before parsing anything (same order as OL-02).
    if format!("{:x}", Sha256::digest(bytes)) != context.ledger_sha256 {
        return Err(LedgerFailure::Binding);
    }
    let decoded = crate::json::decode_bounded(bytes, 65536, 65536, started);
    elapsed(started)?;
    let ledger: LedgerV2 = decoded.map_err(|_| LedgerFailure::Invalid)?;
    validate_context(&ledger, context)?;
    ledger
        .time()
        .validate(context.start_wall_ms, 460_000)
        .map_err(time_error)?;
    let link = &ledger.signature_registry;
    let reference = RegistryReference {
        schema_version: &link.schema_version,
        registry_id: &link.registry_id,
        sha256: &link.sha256,
    };
    registry
        .bind_reference(
            &reference,
            &ledger.launcher.signature_policy_id,
            Role::Launcher,
            started,
        )
        .map_err(LedgerFailure::Registry)?;
    registry
        .bind_reference(
            &reference,
            &ledger.node.signature_policy_id,
            Role::Node,
            started,
        )
        .map_err(LedgerFailure::Registry)?;
    let end = context
        .start_wall_ms
        .checked_add(elapsed(started)?)
        .ok_or(LedgerFailure::Invalid)?;
    ledger.time().validate(end, 450_000).map_err(time_error)?;
    Ok(ledger)
}
fn validate_context(ledger: &LedgerV2, context: &Context<'_>) -> Result<(), LedgerFailure> {
    ledger.validate().map_err(|_| LedgerFailure::Invalid)?;
    if ledger.generation != context.generation
        || ledger.release_id != context.release_id
        || ledger.execution_uid != context.execution_uid
        || ledger.runtime.index_sha256 != context.index_sha256
        || ledger.platform.product_version != context.product_version
        || ledger.platform.os_build != context.os_build
    {
        return Err(LedgerFailure::Binding);
    }
    Ok(())
}
pub(crate) fn parse_shared<B: crate::json::shared::Budget>(
    bytes: &[u8],
    registry: &ParsedRegistry,
    context: &Context<'_>,
    now_wall_ms: u64,
    b: &mut B,
) -> Result<LedgerV2, crate::record_validation::Rejection<B::Failure>> {
    use crate::{
        json::shared::{self, Limits},
        record_validation as r,
    };
    // Size + exact raw hash FIRST. Do not decode unauthenticated bytes, even malformed JSON.
    let digest = r::hash_record(bytes, b)?;
    if digest != context.ledger_sha256 {
        return Err(r::Rejection::Binding);
    }
    let ledger: LedgerV2 = shared::decode(
        bytes,
        Limits {
            max_bytes: 65536,
            max_depth: 16,
            max_items: 65536,
        },
        b,
    )
    .map_err(r::Rejection::Json)?;
    r::step(b)?;
    let result = validate_context(&ledger, context);
    r::step(b)?;
    result.map_err(|e| match e {
        LedgerFailure::Binding => r::Rejection::Binding,
        _ => r::Rejection::InvalidRecord,
    })?;
    r::time(&ledger.time(), context.start_wall_ms, now_wall_ms, b)?;
    let link = &ledger.signature_registry;
    let reference = RegistryReference {
        schema_version: &link.schema_version,
        registry_id: &link.registry_id,
        sha256: &link.sha256,
    };
    registry.bind_reference_shared(
        &reference,
        &ledger.launcher.signature_policy_id,
        Role::Launcher,
        b,
    )?;
    registry.bind_reference_shared(&reference, &ledger.node.signature_policy_id, Role::Node, b)?;
    r::step(b)?;
    Ok(ledger)
}
fn time_error(error: crate::Failure) -> LedgerFailure {
    if error == crate::Failure::Expired {
        LedgerFailure::Expired
    } else {
        LedgerFailure::Invalid
    }
}
fn elapsed(started: Instant) -> Result<u64, LedgerFailure> {
    let value = Instant::now()
        .checked_duration_since(started)
        .ok_or(LedgerFailure::Deadline)?;
    if value >= std::time::Duration::from_secs(10) {
        return Err(LedgerFailure::Deadline);
    }
    Ok(value.as_millis() as u64)
}
