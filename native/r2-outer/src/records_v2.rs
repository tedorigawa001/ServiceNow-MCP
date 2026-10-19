//! Separate v2 inspection path. Fixed build registry only; never an execution permit.
use crate::{ledger_v2, schema::Activation, signature_policy, *};
use std::time::{Duration, Instant};

// No production policy has been approved. Do not populate with synthetic test policy.
// No environment, argv, ledger path or caller override may replace these build bytes.
const APPROVED_REGISTRY: Option<&[u8]> = None;

pub struct InspectedV2Records {
    _activation: Activation,
    _ledger: schema::LedgerV2,
    _registry: signature_policy::ParsedRegistry,
}
impl std::fmt::Debug for InspectedV2Records {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("InspectedV2Records(not_execution_authority)")
    }
}
/// Separate from the legacy offline reader. Unavailable until a build registry is approved.
/// Does not execute Node, inspect signatures or accept an external registry file/path.
pub fn inspect_installed_v2_records() -> Result<InspectedV2Records, Failure> {
    let registry = APPROVED_REGISTRY.ok_or(Failure::Unavailable)?;
    inspect(&filesystem::Native::new(), registry)
}

fn checkpoint(s: &impl Source, start: (u64, u64), began: Instant) -> Result<u64, Failure> {
    let end = s.clock()?;
    if end.0 < start.0 || end.1 < start.1 || (end.0 - start.0).abs_diff(end.1 - start.1) > 1 {
        return Err(Failure::ClockInvalid);
    }
    if end.1 - start.1 >= 10_000 || began.elapsed() >= Duration::from_secs(10) {
        return Err(Failure::Deadline);
    }
    Ok(end.0)
}
pub(super) fn inspect(
    s: &impl Source,
    build_registry: &[u8],
) -> Result<InspectedV2Records, Failure> {
    let began = Instant::now();
    let start = s.clock()?;
    let registry = signature_policy::parse(build_registry, began).map_err(policy_error)?;
    let ctx = s.context()?;
    if ctx.uid == 0 {
        return Err(Failure::UntrustedFile);
    }
    checkpoint(s, start, began)?;
    let a_file = read_checked(s, ACTIVATION_PATH, Role::Activation, ctx.uid)?;
    checkpoint(s, start, began)?;
    let a: Activation = json::decode_bounded(&a_file.bytes, MAX_BYTES, MAX_BYTES, began)?;
    a.validate()?;
    a.time().validate(start.0, 460_000)?;
    if a.execution_uid != ctx.uid
        || a.reader_gid != a_file.meta.gid
        || !ctx.groups.contains(&a.reader_gid)
    {
        return Err(Failure::BindingMismatch);
    }
    let l_file = read_checked(s, &a.ledger_path, Role::Ledger, ctx.uid)?;
    checkpoint(s, start, began)?;
    // Exact bytes authenticated before strict decoding, as in the legacy reader.
    if digest(&l_file.bytes) != a.ledger_sha256 {
        return Err(Failure::HashMismatch);
    }
    let ledger = ledger_v2::parse_bound_ledger(
        &l_file.bytes,
        &registry,
        &ledger_v2::Context {
            ledger_sha256: &a.ledger_sha256,
            generation: a.generation,
            release_id: &a.release_id,
            execution_uid: ctx.uid,
            index_sha256: &a.artifact_index_sha256,
            product_version: &ctx.product_version,
            os_build: &ctx.os_build,
            start_wall_ms: start.0,
        },
        began,
    )
    .map_err(ledger_error)?;
    for (path, role, original) in [
        (ACTIVATION_PATH, Role::Activation, &a_file),
        (a.ledger_path.as_str(), Role::Ledger, &l_file),
    ] {
        checkpoint(s, start, began)?;
        if *original != read_checked(s, path, role, ctx.uid)? {
            return Err(Failure::Changed);
        }
    }
    let end = checkpoint(s, start, began)?;
    a.time().validate(end, 450_000)?;
    ledger.time().validate(end, 450_000)?;
    Ok(InspectedV2Records {
        _activation: a,
        _ledger: ledger,
        _registry: registry,
    })
}
fn policy_error(e: signature_policy::PolicyFailure) -> Failure {
    match e {
        signature_policy::PolicyFailure::Deadline => Failure::Deadline,
        _ => Failure::InvalidRecord,
    }
}
fn ledger_error(e: ledger_v2::LedgerFailure) -> Failure {
    match e {
        ledger_v2::LedgerFailure::Deadline
        | ledger_v2::LedgerFailure::Registry(signature_policy::PolicyFailure::Deadline) => {
            Failure::Deadline
        }
        ledger_v2::LedgerFailure::Expired => Failure::Expired,
        ledger_v2::LedgerFailure::Binding | ledger_v2::LedgerFailure::Registry(_) => {
            Failure::BindingMismatch
        }
        _ => Failure::InvalidRecord,
    }
}
