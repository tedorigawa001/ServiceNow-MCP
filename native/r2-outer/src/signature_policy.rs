//! Pure draft-policy data processing. No Security API, trusted registry or execution authority.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Instant;
const SCHEMA: &str = "bp5-r2-signature-registry-0.1";
// Draft comparison profile only. Not approval of any real template, issuer or binary.
const RUNTIME_ONLY_FLAGS: u32 = 0x10000;
#[derive(Debug, PartialEq, Eq)]
pub enum PolicyFailure {
    Invalid,
    Limit,
    Deadline,
    RegistryMismatch,
    UnknownPolicy,
    RoleMismatch,
    UnknownObservation,
    EntitlementMismatch,
}
pub struct RegistryReference<'a> {
    pub schema_version: &'a str,
    pub registry_id: &'a str,
    pub sha256: &'a str,
}
pub enum ObservedValue {
    Boolean(bool),
    Number,
    String,
    Data,
    Container,
    Unknown,
}
pub enum Representation {
    Dictionary(Vec<(String, ObservedValue)>),
    AbsenceProven,
    UnsupportedOrUnknown,
}
pub struct Observation {
    pub representation: Representation,
    pub blob_bytes: usize,
}
#[derive(Debug, PartialEq, Eq)]
pub struct EntitlementMatch {
    pub key_count: usize,
}
pub struct ParsedRegistry {
    registry: Registry,
    digest: String,
}
impl std::fmt::Debug for ParsedRegistry {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ParsedRegistry(not_execution_authority)")
    }
}
impl ParsedRegistry {
    pub fn policy_count(&self) -> usize {
        self.registry.policies.len()
    }
}
impl ParsedRegistry {
    /// Pure comparison of caller-supplied data, not CF type verification or cryptographic validity.
    pub fn compare_entitlements(
        &self,
        reference: &RegistryReference<'_>,
        policy_id: &str,
        role: Role,
        observed: &Observation,
        started: Instant,
    ) -> Result<EntitlementMatch, PolicyFailure> {
        budget(started)?;
        if reference.schema_version != SCHEMA
            || reference.registry_id != self.registry.registry_id
            || reference.sha256 != self.digest
        {
            return Err(PolicyFailure::RegistryMismatch);
        }
        let policy = self
            .registry
            .policies
            .iter()
            .find(|p| p.id == policy_id)
            .ok_or(PolicyFailure::UnknownPolicy)?;
        if policy.role != role {
            return Err(PolicyFailure::RoleMismatch);
        }
        if observed.blob_bytes > 65536 {
            return Err(PolicyFailure::Limit);
        }
        let count = match &observed.representation {
            Representation::UnsupportedOrUnknown => return Err(PolicyFailure::UnknownObservation),
            Representation::AbsenceProven => {
                if !matches!(policy.entitlement_expectation, Expectation::Empty {}) {
                    return Err(PolicyFailure::EntitlementMismatch);
                }
                0
            }
            Representation::Dictionary(entries) => {
                if entries.len() > 32 {
                    return Err(PolicyFailure::Limit);
                }
                let mut keys = BTreeSet::new();
                for (k, _) in entries {
                    budget(started)?;
                    if !key(k) || !keys.insert(k) {
                        return Err(PolicyFailure::Invalid);
                    }
                }
                match &policy.entitlement_expectation {
                    Expectation::Empty {} => {
                        if !entries.is_empty() {
                            return Err(PolicyFailure::EntitlementMismatch);
                        }
                    }
                    Expectation::Dictionary { entries: expected } => {
                        if expected.len() != entries.len()
                            || entries.iter().any(|(k, v)| {
                                !expected.contains_key(k)
                                    || !matches!(v, ObservedValue::Boolean(true))
                            })
                        {
                            return Err(PolicyFailure::EntitlementMismatch);
                        }
                    }
                }
                entries.len()
            }
        };
        budget(started)?;
        Ok(EntitlementMatch { key_count: count })
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Registry {
    schema_version: String,
    registry_id: String,
    policies: Vec<Policy>,
}
#[derive(Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Launcher,
    Node,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Policy {
    id: String,
    role: Role,
    artifact_class: String,
    requirement_template_id: String,
    issuer: Issuer,
    expected_static_flags: u32,
    entitlement_expectation: Expectation,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Issuer {
    anchor: String,
    certificate_class: String,
    team_id: String,
    signing_identifier: String,
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
enum Expectation {
    Empty {},
    Dictionary {
        entries: BTreeMap<String, ExpectedValue>,
    },
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum ExpectedValue {
    Boolean { value: bool },
}
fn id(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 128
        && v.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
}
fn key(v: &str) -> bool {
    !v.is_empty() && v.len() <= 128 && !v.chars().any(char::is_control)
}
fn budget(start: Instant) -> Result<(), PolicyFailure> {
    if Instant::now()
        .checked_duration_since(start)
        .is_none_or(|d| d >= std::time::Duration::from_secs(10))
    {
        Err(PolicyFailure::Deadline)
    } else {
        Ok(())
    }
}
pub fn parse(bytes: &[u8], started: Instant) -> Result<ParsedRegistry, PolicyFailure> {
    budget(started)?;
    if bytes.len() > 65536 {
        return Err(PolicyFailure::Limit);
    }
    let decoded = crate::json::decode_policy(bytes, started);
    budget(started)?;
    let registry: Registry = decoded.map_err(|_| PolicyFailure::Invalid)?;
    if registry.schema_version != SCHEMA
        || !id(&registry.registry_id)
        || !(2..=32).contains(&registry.policies.len())
    {
        return Err(PolicyFailure::Invalid);
    }
    let mut ids = BTreeSet::new();
    let mut launcher = false;
    let mut node = false;
    for policy in &registry.policies {
        budget(started)?;
        if !id(&policy.id)
            || !ids.insert(&policy.id)
            || policy.artifact_class != "mach_o_thin_arm64"
            || policy.requirement_template_id != "developer_id_application_v1"
            || policy.issuer.anchor != "apple_developer_id"
            || policy.issuer.certificate_class != "developer_id_application"
            || policy.issuer.team_id.is_empty()
            || policy.issuer.team_id.len() > 128
            || !policy
                .issuer
                .team_id
                .bytes()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
            || !id(&policy.issuer.signing_identifier)
            || policy.expected_static_flags != RUNTIME_ONLY_FLAGS
        {
            return Err(PolicyFailure::Invalid);
        }
        match policy.role {
            Role::Launcher => launcher = true,
            Role::Node => node = true,
        }
        match &policy.entitlement_expectation {
            Expectation::Empty {} => {}
            Expectation::Dictionary { entries } => {
                if policy.role == Role::Launcher
                    || entries.is_empty()
                    || entries.len() > 32
                    || entries.iter().any(|(k, v)| {
                        !key(k) || !matches!(v, ExpectedValue::Boolean { value: true })
                    })
                {
                    return Err(PolicyFailure::Invalid);
                }
            }
        }
    }
    if !launcher || !node {
        return Err(PolicyFailure::Invalid);
    }
    let digest = format!("{:x}", Sha256::digest(bytes));
    budget(started)?;
    Ok(ParsedRegistry { registry, digest })
}
