use crate::Failure;
use serde::Deserialize;
fn invalid() -> Failure {
    Failure::InvalidRecord
}
fn text(v: &str, max: usize) -> bool {
    !v.is_empty() && v.len() <= max && !v.chars().any(char::is_control)
}
fn hex(v: &str, n: usize) -> bool {
    v.len() == n
        && v.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn path(v: &str) -> bool {
    v.starts_with('/')
        && v.len() <= 4096
        && v.len() > 1
        && !v.chars().any(char::is_control)
        && v[1..]
            .split('/')
            .all(|c| !c.is_empty() && c != "." && c != "..")
}
fn within(v: &str, root: &str) -> bool {
    v.strip_prefix(root).is_some_and(|s| s.starts_with('/'))
}
fn version(v: &str) -> bool {
    let p: Vec<_> = v.strip_prefix('v').unwrap_or(v).split('.').collect();
    p.len() == 3
        && p.iter()
            .all(|p| !p.is_empty() && p.len() <= 8 && p.bytes().all(|c| c.is_ascii_digit()))
}
#[derive(Default)]
pub(crate) struct Time {
    pub approved_at: String,
    pub expires_at: String,
    pub approval_ref: String,
}
impl Time {
    fn millis(v: &str) -> Result<u64, Failure> {
        if v.len() != 24
            || !v.ends_with('Z')
            || v.as_bytes()[10] != b'T'
            || v.as_bytes()[19] != b'.'
        {
            return Err(invalid());
        }
        let t = chrono::DateTime::parse_from_rfc3339(v).map_err(|_| invalid())?;
        u64::try_from(t.timestamp_millis()).map_err(|_| invalid())
    }
    pub fn validate(&self, now: u64, margin: u64) -> Result<(), Failure> {
        let a = Self::millis(&self.approved_at)?;
        let e = Self::millis(&self.expires_at)?;
        if !text(&self.approval_ref, 128) || a > now || e <= a {
            return Err(invalid());
        }
        if e <= now.checked_add(margin).ok_or(Failure::ClockInvalid)? {
            return Err(Failure::Expired);
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Activation {
    schema_version: String,
    pub generation: u64,
    pub execution_uid: u32,
    pub reader_gid: u32,
    pub ledger_path: String,
    pub ledger_sha256: String,
    pub release_id: String,
    pub artifact_index_sha256: String,
    approved_at: String,
    expires_at: String,
    approval_ref: String,
}
impl Activation {
    pub fn time(&self) -> Time {
        Time {
            approved_at: self.approved_at.clone(),
            expires_at: self.expires_at.clone(),
            approval_ref: self.approval_ref.clone(),
        }
    }
    pub fn validate(&self) -> Result<(), Failure> {
        if self.schema_version != "bp5-r2-activation-0.1"
            || self.generation == 0
            || self.generation > 9007199254740991
            || self.execution_uid == 0
            || self.reader_gid == 0
            || !path(&self.ledger_path)
            || !hex(&self.ledger_sha256, 64)
            || !hex(&self.artifact_index_sha256, 64)
            || !text(&self.release_id, 128)
        {
            return Err(invalid());
        }
        Ok(())
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Platform {
    os: String,
    arch: String,
    pub product_version: String,
    pub os_build: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Binary {
    path: String,
    sha256: String,
    version: String,
    signature_requirement: String,
    publisher: String,
    hardened_runtime: bool,
    entitlements: Vec<String>,
}
impl Binary {
    fn valid(&self, launcher: bool) -> bool {
        path(&self.path)
            && hex(&self.sha256, 64)
            && version(&self.version)
            && text(&self.signature_requirement, 2048)
            && text(&self.publisher, 128)
            && self.hardened_runtime
            && self.entitlements.len() <= 32
            && (!launcher || self.entitlements.is_empty())
            && self
                .entitlements
                .iter()
                .all(|e| text(e, 128) && e.starts_with("com.apple.security."))
            && self
                .entitlements
                .iter()
                .collect::<std::collections::BTreeSet<_>>()
                .len()
                == self.entitlements.len()
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Runtime {
    root: String,
    entry_relative_path: String,
    cwd: String,
    index_path: String,
    pub index_sha256: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Ledger {
    schema_version: String,
    pub generation: u64,
    pub release_id: String,
    pub execution_uid: u32,
    pub platform: Platform,
    launcher: Binary,
    node: Binary,
    pub runtime: Runtime,
    build_receipt_sha256: String,
    source_revision: String,
    lockfile_sha256: String,
    approved_at: String,
    expires_at: String,
    approval_ref: String,
    policy_id: String,
}
impl Ledger {
    pub(crate) fn launch_paths(&self) -> (&str, &str) {
        (&self.node.path, &self.runtime.cwd)
    }
    pub fn time(&self) -> Time {
        Time {
            approved_at: self.approved_at.clone(),
            expires_at: self.expires_at.clone(),
            approval_ref: self.approval_ref.clone(),
        }
    }
    pub fn validate(&self) -> Result<(), Failure> {
        let r = &self.runtime;
        if self.schema_version != "bp5-r2-launch-ledger-0.1"
            || self.policy_id != "bp5-r2-outer-macos-arm64-0.1"
            || self.generation == 0
            || self.generation > 9007199254740991
            || self.execution_uid == 0
            || !text(&self.release_id, 128)
            || self.platform.os != "darwin"
            || self.platform.arch != "arm64"
            || !text(&self.platform.product_version, 32)
            || !self
                .platform
                .product_version
                .bytes()
                .all(|c| c.is_ascii_digit() || c == b'.')
            || !text(&self.platform.os_build, 32)
            || !self
                .platform
                .os_build
                .bytes()
                .all(|c| c.is_ascii_alphanumeric())
            || !self.launcher.valid(true)
            || !self.node.valid(false)
            || !path(&r.root)
            || r.cwd != r.root
            || r.entry_relative_path != "dist/review/r2-launcher-entry.js"
            || !path(&r.index_path)
            || !within(&r.index_path, &r.root)
            || !within(&self.node.path, &r.root)
            || !hex(&r.index_sha256, 64)
            || !hex(&self.build_receipt_sha256, 64)
            || !hex(&self.lockfile_sha256, 64)
            || !hex(&self.source_revision, 40)
        {
            return Err(invalid());
        }
        Ok(())
    }
}

// Separate schema: never deserialize v2 through the legacy offline Ledger.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RegistryLink {
    pub schema_version: String,
    pub registry_id: String,
    pub sha256: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct BinaryV2 {
    path: String,
    sha256: String,
    version: String,
    pub signature_policy_id: String,
}
impl BinaryV2 {
    fn valid(&self) -> bool {
        path(&self.path)
            && hex(&self.sha256, 64)
            && version(&self.version)
            && crate::signature_policy::id(&self.signature_policy_id)
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LedgerV2 {
    schema_version: String,
    pub generation: u64,
    pub release_id: String,
    pub execution_uid: u32,
    pub platform: Platform,
    pub launcher: BinaryV2,
    pub node: BinaryV2,
    pub runtime: Runtime,
    pub signature_registry: RegistryLink,
    build_receipt_sha256: String,
    source_revision: String,
    lockfile_sha256: String,
    approved_at: String,
    expires_at: String,
    approval_ref: String,
    policy_id: String,
}
impl LedgerV2 {
    pub fn time(&self) -> Time {
        Time {
            approved_at: self.approved_at.clone(),
            expires_at: self.expires_at.clone(),
            approval_ref: self.approval_ref.clone(),
        }
    }
    pub fn validate(&self) -> Result<(), Failure> {
        let r = &self.runtime;
        if self.schema_version != "bp5-r2-launch-ledger-0.2"
            || self.policy_id != "bp5-r2-outer-macos-arm64-0.2"
            || self.generation == 0
            || self.generation > 9007199254740991
            || self.execution_uid == 0
            || !text(&self.release_id, 128)
            || self.platform.os != "darwin"
            || self.platform.arch != "arm64"
            || !text(&self.platform.product_version, 32)
            || !self
                .platform
                .product_version
                .bytes()
                .all(|c| c.is_ascii_digit() || c == b'.')
            || !text(&self.platform.os_build, 32)
            || !self
                .platform
                .os_build
                .bytes()
                .all(|c| c.is_ascii_alphanumeric())
            || !self.launcher.valid()
            || !self.node.valid()
            || !path(&r.root)
            || r.cwd != r.root
            || r.entry_relative_path != "dist/review/r2-launcher-entry.js"
            || !path(&r.index_path)
            || !within(&r.index_path, &r.root)
            || !within(&self.node.path, &r.root)
            || !hex(&r.index_sha256, 64)
            || !hex(&self.build_receipt_sha256, 64)
            || !hex(&self.source_revision, 40)
            || !hex(&self.lockfile_sha256, 64)
            || self.signature_registry.schema_version != "bp5-r2-signature-registry-0.1"
            || !crate::signature_policy::id(&self.signature_registry.registry_id)
            || !hex(&self.signature_registry.sha256, 64)
        {
            return Err(invalid());
        }
        Ok(())
    }
}
