//! Offline records and gated, dedicated-process exec components. No executable, OAuth or network.
#![deny(unsafe_code)]
pub mod closure;
pub mod deployment;
mod exec_os;
mod filesystem;
mod json;
mod launch;
mod launch_args;
pub use launch::{LaunchFailure, exec_installed};
mod schema;
use schema::{Activation, Ledger};
use sha2::{Digest, Sha256};
pub const ACTIVATION_PATH: &str = "/Library/Application Support/ServiceNowMCP/R2/activation.json";
const MAX_BYTES: usize = 65536;
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Failure {
    InvalidRecord,
    UntrustedFile,
    Unavailable,
    Changed,
    HashMismatch,
    BindingMismatch,
    Expired,
    ClockInvalid,
    Deadline,
    Unsupported,
}
/// NOT an execution permit: signatures, closure, group exclusivity and TTY remain OL-03+ gates.
pub struct InspectedRecords {
    _activation: Activation,
    _ledger: Ledger,
}
impl std::fmt::Debug for InspectedRecords {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("InspectedRecords(not_execution_authority)")
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    Activation,
    Ledger,
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Metadata {
    directory: bool,
    regular: bool,
    uid: u32,
    gid: u32,
    mode: u32,
    links: u64,
    no_acl: bool,
}
#[derive(Clone, PartialEq, Eq)]
struct Snapshot {
    bytes: Vec<u8>,
    meta: Metadata,
    ancestors: Vec<Metadata>,
    identity: Vec<u64>,
}
struct Context {
    uid: u32,
    groups: Vec<u32>,
    product_version: String,
    os_build: String,
}
trait Source {
    fn context(&self) -> Result<Context, Failure>;
    fn clock(&self) -> Result<(u64, u64), Failure>;
    fn read(&self, path: &str, role: Role, uid: u32) -> Result<Snapshot, Failure>;
}
fn check_file(m: &Metadata, role: Role, uid: u32) -> Result<(), Failure> {
    let owner = if role == Role::Activation { 0 } else { uid };
    let mode = if role == Role::Activation {
        0o440
    } else {
        0o600
    };
    if !m.regular || m.directory || m.uid != owner || m.mode != mode || m.links != 1 || !m.no_acl {
        return Err(Failure::UntrustedFile);
    }
    Ok(())
}
fn read_checked(s: &impl Source, path: &str, role: Role, uid: u32) -> Result<Snapshot, Failure> {
    let v = s.read(path, role, uid)?;
    check_file(&v.meta, role, uid)?;
    if v.bytes.len() > MAX_BYTES || v.ancestors.is_empty() || v.ancestors.len() > 64 {
        return Err(Failure::UntrustedFile);
    }
    for m in &v.ancestors {
        if !m.directory
            || m.regular
            || !m.no_acl
            || m.mode & 0o7022 != 0
            || !(m.uid == 0 || (role == Role::Ledger && m.uid == uid))
        {
            return Err(Failure::UntrustedFile);
        }
    }
    Ok(v)
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn inspect(s: &impl Source) -> Result<InspectedRecords, Failure> {
    let start = s.clock()?;
    let ctx = s.context()?;
    if ctx.uid == 0 {
        return Err(Failure::UntrustedFile);
    }
    let a_file = read_checked(s, ACTIVATION_PATH, Role::Activation, ctx.uid)?;
    let a: Activation = json::decode(&a_file.bytes)?;
    a.validate()?;
    a.time().validate(start.0, 460_000)?;
    if a.execution_uid != ctx.uid
        || a.reader_gid != a_file.meta.gid
        || !ctx.groups.contains(&a.reader_gid)
    {
        return Err(Failure::BindingMismatch);
    }
    let l_file = read_checked(s, &a.ledger_path, Role::Ledger, ctx.uid)?;
    if digest(&l_file.bytes) != a.ledger_sha256 {
        return Err(Failure::HashMismatch);
    }
    let l: Ledger = json::decode(&l_file.bytes)?;
    l.validate()?;
    if a.generation != l.generation
        || a.execution_uid != l.execution_uid
        || a.release_id != l.release_id
        || a.artifact_index_sha256 != l.runtime.index_sha256
        || l.platform.product_version != ctx.product_version
        || l.platform.os_build != ctx.os_build
    {
        return Err(Failure::BindingMismatch);
    }
    a.time().validate(start.0, 460_000)?;
    l.time().validate(start.0, 460_000)?;
    if a_file != read_checked(s, ACTIVATION_PATH, Role::Activation, ctx.uid)?
        || l_file != read_checked(s, &a.ledger_path, Role::Ledger, ctx.uid)?
    {
        return Err(Failure::Changed);
    }
    let end = s.clock()?;
    if end.0 < start.0 || end.1 < start.1 || (end.0 - start.0).abs_diff(end.1 - start.1) > 1 {
        return Err(Failure::ClockInvalid);
    }
    if end.1 - start.1 >= 10_000 {
        return Err(Failure::Deadline);
    }
    a.time().validate(end.0, 450_000)?;
    l.time().validate(end.0, 450_000)?;
    Ok(InspectedRecords {
        _activation: a,
        _ledger: l,
    })
}
/// Fixed activation path. This reads documents only; it does NOT launch or authorize Node.
pub fn inspect_installed_records() -> Result<InspectedRecords, Failure> {
    inspect(&filesystem::Native::new())
}
#[cfg(all(test, target_os = "macos", target_arch = "aarch64"))]
mod exec_tests;
#[cfg(test)]
mod tests;
