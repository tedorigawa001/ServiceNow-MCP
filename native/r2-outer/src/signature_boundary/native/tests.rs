use super::*;
use std::collections::BTreeSet;
struct FakeApi {
    next: Cell<usize>,
    live: RefCell<BTreeSet<usize>>,
    calls: RefCell<Vec<&'static str>>,
    fail: Cell<Option<&'static str>>,
    null: Cell<bool>,
    wrong_type: Cell<bool>,
    raw_present: Cell<bool>,
    missing_dict: Cell<bool>,
    value_kind: Cell<Kind>,
    flag_value: Cell<u32>,
    wrong_path: Cell<bool>,
    count: Cell<usize>,
    status: Cell<i32>,
}
impl FakeApi {
    fn new() -> Self {
        Self {
            next: Cell::new(1000),
            live: RefCell::new(BTreeSet::new()),
            calls: RefCell::new(vec![]),
            fail: Cell::new(None),
            null: Cell::new(false),
            wrong_type: Cell::new(false),
            raw_present: Cell::new(false),
            missing_dict: Cell::new(false),
            value_kind: Cell::new(Kind::Boolean),
            flag_value: Cell::new(65536),
            wrong_path: Cell::new(false),
            count: Cell::new(1),
            status: Cell::new(0),
        }
    }
    fn copy(&self, phase: &'static str) -> (i32, usize) {
        self.calls.borrow_mut().push(phase);
        if self.null.get() {
            return (0, 0);
        }
        let id = self.next.get();
        self.next.set(id + 1);
        self.live.borrow_mut().insert(id);
        (
            if self.fail.get() == Some(phase) {
                -9999
            } else {
                0
            },
            id,
        )
    }
}
impl Api for FakeApi {
    fn release(&self, object: usize) {
        assert!(
            self.live.borrow_mut().remove(&object),
            "double release or borrowed object released"
        );
    }
    fn create_static(&self, _: &str) -> (i32, usize) {
        self.copy("create_static")
    }
    fn copy_self(&self) -> (i32, usize) {
        self.copy("self")
    }
    fn copy_static(&self, _: usize) -> (i32, usize) {
        self.copy("copy_static")
    }
    fn copy_path(&self, _: usize) -> (i32, usize) {
        self.copy("path")
    }
    fn requirement(&self, text: &str) -> (i32, usize) {
        assert!(text.contains("anchor apple generic"));
        assert!(text.contains("certificate leaf[field.1.2.840.113635.100.6.1.13] exists"));
        self.copy("requirement")
    }
    fn validate(&self, _: usize, req: usize, flags: u32, dynamic: bool) -> i32 {
        assert!(self.live.borrow().contains(&req));
        assert_eq!(flags, if dynamic { NO_NETWORK } else { STATIC_FLAGS });
        assert_eq!(flags & ((1 << 1) | (1 << 2)), 0);
        self.calls.borrow_mut().push(if dynamic {
            "dynamic_validity"
        } else {
            "static_validity"
        });
        self.status.get()
    }
    fn signing(&self, _: usize, flags: u32) -> (i32, usize) {
        assert_eq!(flags, SIGNING_INFO);
        self.copy("signing")
    }
    fn kind(&self, object: usize) -> Kind {
        if self.wrong_type.get() {
            return Kind::Other;
        }
        match object {
            10 | 11 | 20 => Kind::String,
            12 => Kind::Number,
            13 => Kind::Dictionary,
            30 => self.value_kind.get(),
            id if self.live.borrow().contains(&id) => {
                if self.calls.borrow().last() == Some(&"path") {
                    Kind::Url
                } else {
                    Kind::Dictionary
                }
            }
            _ => Kind::Other,
        }
    }
    fn lookup(&self, _: usize, key: Key) -> usize {
        match key {
            Key::Team => 10,
            Key::Identifier => 11,
            Key::Flags => 12,
            Key::Entitlements => {
                if self.missing_dict.get() {
                    0
                } else {
                    13
                }
            }
            Key::RawEntitlements => usize::from(self.raw_present.get()),
        }
    }
    fn string(&self, object: usize, limit: usize) -> Result<String, Rejection> {
        if self.kind(object) != Kind::String {
            return Err(Rejection::UnknownObservation);
        }
        let s = match object {
            10 => "SYNTHETIC",
            11 => "test.node",
            20 => "TEST_KEY",
            _ => return Err(Rejection::UnknownObservation),
        };
        assert!(s.len() <= limit);
        Ok(s.into())
    }
    fn path(&self, _: usize) -> Result<String, Rejection> {
        Ok(if self.wrong_path.get() {
            "/different/node"
        } else {
            "/release/node"
        }
        .into())
    }
    fn number(&self, _: usize) -> Result<u32, Rejection> {
        Ok(self.flag_value.get())
    }
    fn boolean(&self, _: usize) -> bool {
        true
    }
    fn entries(&self, _: usize) -> Result<Vec<(usize, usize)>, Rejection> {
        Ok(vec![(20, 30); self.count.get()])
    }
}
struct SyntheticEvidence;
impl Evidence for SyntheticEvidence {
    fn checkpoint(&self) -> Result<(), Rejection> {
        Ok(())
    }
    fn path(&self) -> &str {
        "/release/node"
    }
    fn identity(&self) -> Result<Identity, Rejection> {
        Ok(Identity {
            device: 1,
            inode: 2,
            size: 100,
            sha256: "a".repeat(64),
        })
    }
    fn layout(&self) -> Result<Layout, Rejection> {
        Ok(Layout::ThinArm64)
    }
    fn path_identity(&self) -> Result<Identity, Rejection> {
        self.identity()
    }
}
fn fixture() -> Native<FakeApi, SyntheticEvidence> {
    Native {
        api: Rc::new(FakeApi::new()),
        evidence: SyntheticEvidence,
    }
}
fn policy() -> BoundPolicy<'static> {
    BoundPolicy {
        template: "developer_id_application_v1",
        anchor: "apple_developer_id",
        certificate_class: "developer_id_application",
        team_id: "SYNTHETIC",
        identifier: "test.node",
        static_flags: 65536,
    }
}
#[test]
fn driver_uses_fixed_flags_and_releases_all_copy_create_outputs() {
    let b = fixture();
    {
        let h = b.acquire(Role::Node).unwrap().unwrap();
        assert!(
            b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
                .unwrap()
                == Status::Valid
        );
        let o = b.snapshot(&h).unwrap().unwrap();
        assert_eq!(o.team_id, "SYNTHETIC");
        assert_eq!(o.static_flags, 65536);
    }
    assert!(b.api.live.borrow().is_empty());
}
#[test]
fn copy_outputs_on_error_and_success_null_are_handled_without_leaks() {
    let b = fixture();
    b.api.fail.set(Some("create_static"));
    assert!(b.acquire(Role::Node).is_err());
    assert!(b.api.live.borrow().is_empty());
    b.api.fail.set(None);
    b.api.null.set(true);
    assert!(b.acquire(Role::Node).is_err());
    assert!(b.api.live.borrow().is_empty());
}
#[test]
fn launcher_partial_acquisition_errors_release_both_objects() {
    for phase in ["self", "copy_static", "path"] {
        let b = fixture();
        b.api.fail.set(Some(phase));
        assert!(b.acquire(Role::Launcher).is_err());
        assert!(b.api.live.borrow().is_empty());
    }
}
#[test]
fn failed_requirement_or_signing_releases_error_output_and_handle() {
    for phase in ["requirement", "signing"] {
        let b = fixture();
        {
            let h = b.acquire(Role::Node).unwrap().unwrap();
            if phase == "requirement" {
                b.api.fail.set(Some(phase));
                assert!(
                    b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
                        .is_err()
                );
            } else {
                b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
                    .unwrap();
                b.api.fail.set(Some(phase));
                assert!(b.snapshot(&h).is_err());
            }
        }
        assert!(b.api.live.borrow().is_empty());
    }
}
#[test]
fn projection_cannot_precede_validity_or_follow_failed_revalidation() {
    let b = fixture();
    let h = b.acquire(Role::Node).unwrap().unwrap();
    assert!(b.snapshot(&h).is_err());
    assert!(!b.api.calls.borrow().contains(&"signing"));
    b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
        .unwrap();
    b.api.status.set(-67050);
    assert!(
        b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
            .is_err()
    );
    assert!(b.snapshot(&h).is_err());
}
#[test]
fn unknown_status_and_known_failures_never_succeed() {
    for (status, expected) in [
        (-67050, Rejection::RequirementMismatch),
        (-67062, Rejection::InvalidSignature),
        (-67061, Rejection::InvalidSignature),
        (-67034, Rejection::IdentityChanged),
        (1, Rejection::ApiFailed),
        (-9999, Rejection::ApiFailed),
    ] {
        let b = fixture();
        let h = b.acquire(Role::Node).unwrap().unwrap();
        b.api.status.set(status);
        assert_eq!(
            b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
                .err(),
            Some(expected)
        );
    }
}
#[test]
fn path_mismatch_and_unknown_cf_type_are_not_accepted() {
    for wrong_path in [true, false] {
        let b = fixture();
        if wrong_path {
            b.api.wrong_path.set(true);
        } else {
            b.api.wrong_type.set(true);
        }
        assert!(b.acquire(Role::Node).is_err());
        assert!(b.api.live.borrow().is_empty());
    }
}
#[test]
fn missing_dictionary_and_unverified_raw_formats_stop_without_absence() {
    for raw in [true, false] {
        let b = fixture();
        let h = b.acquire(Role::Node).unwrap().unwrap();
        b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
            .unwrap();
        if raw {
            b.api.raw_present.set(true);
        } else {
            b.api.missing_dict.set(true);
        }
        assert_eq!(
            b.snapshot(&h).err(),
            Some(if raw {
                Rejection::Unsupported
            } else {
                Rejection::UnknownObservation
            })
        );
    }
}
#[test]
fn cf_number_one_is_not_coerced_to_boolean_true() {
    let b = fixture();
    let h = b.acquire(Role::Node).unwrap().unwrap();
    b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
        .unwrap();
    b.api.value_kind.set(Kind::Number);
    let o = b.snapshot(&h).unwrap().unwrap();
    let Representation::Dictionary(entries) = o.entitlements.representation else {
        panic!()
    };
    assert!(matches!(entries[0].1, ObservedValue::Number));
}
#[test]
fn oversized_projection_and_adhoc_linker_flags_stop() {
    for kind in 0..3 {
        let b = fixture();
        let h = b.acquire(Role::Node).unwrap().unwrap();
        b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
            .unwrap();
        match kind {
            0 => b.api.count.set(33),
            1 => b.api.flag_value.set(65538),
            _ => b.api.flag_value.set(65536 | 0x20000),
        }
        assert!(b.snapshot(&h).is_err());
    }
}
#[test]
fn requirement_template_rejects_injection_and_non_approved_shapes() {
    for kind in 0..5 {
        let mut p = policy();
        match kind {
            0 => p.identifier = "x\" or true",
            1 => p.team_id = "X\"",
            2 => p.anchor = "any",
            3 => p.template = "true",
            _ => p.certificate_class = "development",
        }
        assert_eq!(requirement_text(&p).err(), Some(Rejection::PolicyRejected));
    }
    let text = requirement_text(&policy()).unwrap();
    assert!(text.contains("certificate 1[field.1.2.840.113635.100.6.2.6] exists"));
    assert!(text.contains("identifier \"test.node\""));
}
#[test]
fn dynamic_self_uses_retained_requirement_and_checks_its_static_path() {
    let b = fixture();
    let h = b.acquire(Role::Launcher).unwrap().unwrap();
    assert!(
        b.validate_self(&h, ValidationProfile::OfflineFullExecutable)
            .is_err()
    );
    b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
        .unwrap();
    assert!(
        b.validate_self(&h, ValidationProfile::OfflineFullExecutable)
            .is_ok()
    );
    b.api.wrong_path.set(true);
    assert!(
        b.validate_self(&h, ValidationProfile::OfflineFullExecutable)
            .is_err()
    );
    drop(h);
    assert!(b.api.live.borrow().is_empty());
}

struct Probe {
    ticks: Cell<usize>,
    fail_at: usize,
    cancelled: bool,
    changed_path: bool,
}
impl Evidence for Probe {
    fn checkpoint(&self) -> Result<(), Rejection> {
        self.ticks.set(self.ticks.get() + 1);
        if self.ticks.get() == self.fail_at {
            Err(if self.cancelled {
                Rejection::Cancelled
            } else {
                Rejection::Deadline
            })
        } else {
            Ok(())
        }
    }
    fn path(&self) -> &str {
        "/release/node"
    }
    fn identity(&self) -> Result<Identity, Rejection> {
        SyntheticEvidence.identity()
    }
    fn path_identity(&self) -> Result<Identity, Rejection> {
        let mut id = self.identity()?;
        if self.changed_path {
            id.inode += 1;
        }
        Ok(id)
    }
    fn layout(&self) -> Result<Layout, Rejection> {
        Ok(Layout::ThinArm64)
    }
}
#[test]
fn nested_api_deadline_and_cancel_reject_late_outputs_and_release_everything() {
    for cancelled in [false, true] {
        for fail_at in 1..=12 {
            let b = Native {
                api: Rc::new(FakeApi::new()),
                evidence: Probe {
                    ticks: Cell::new(0),
                    fail_at,
                    cancelled,
                    changed_path: false,
                },
            };
            let result = (|| {
                let h = b.acquire(Role::Node)?.unwrap();
                b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)?;
                b.snapshot(&h)
            })();
            assert_eq!(
                result.err(),
                Some(if cancelled {
                    Rejection::Cancelled
                } else {
                    Rejection::Deadline
                })
            );
            assert!(b.api.live.borrow().is_empty());
        }
    }
}
#[test]
fn same_path_string_but_different_path_inode_is_rejected() {
    let b = Native {
        api: Rc::new(FakeApi::new()),
        evidence: Probe {
            ticks: Cell::new(0),
            fail_at: usize::MAX,
            cancelled: false,
            changed_path: true,
        },
    };
    assert!(b.acquire(Role::Node).is_err());
    assert!(b.api.live.borrow().is_empty());
}
#[test]
fn launcher_snapshot_requires_dynamic_self_check_after_each_static_validation() {
    let b = fixture();
    let h = b.acquire(Role::Launcher).unwrap().unwrap();
    b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
        .unwrap();
    assert!(b.snapshot(&h).is_err());
    b.validate_self(&h, ValidationProfile::OfflineFullExecutable)
        .unwrap();
    assert!(b.snapshot(&h).is_ok());
    b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
        .unwrap();
    assert!(b.snapshot(&h).is_err());
}
#[test]
fn wrong_signing_dictionary_type_drops_its_copy_output() {
    let b = fixture();
    {
        let h = b.acquire(Role::Node).unwrap().unwrap();
        b.validate(&h, &policy(), ValidationProfile::OfflineFullExecutable)
            .unwrap();
        b.api.wrong_type.set(true);
        assert_eq!(b.snapshot(&h).err(), Some(Rejection::UnknownObservation));
    }
    assert!(b.api.live.borrow().is_empty());
}

#[test]
fn native_driver_with_synthetic_calls_connects_to_outer_policy_comparison() {
    use serde_json::json;
    use sha2::{Digest, Sha256};
    let p = |role: &str| json!({"id":role,"role":role,"artifact_class":"mach_o_thin_arm64","requirement_template_id":"developer_id_application_v1","issuer":{"anchor":"apple_developer_id","certificate_class":"developer_id_application","team_id":"SYNTHETIC","signing_identifier":format!("test.{role}")},"expected_static_flags":65536,"entitlement_expectation":if role == "node" { json!({"kind":"dictionary","entries":{"TEST_KEY":{"type":"boolean","value":true}}}) } else { json!({"kind":"empty"}) }});
    let bytes = serde_json::to_vec(&json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic","policies":[p("launcher"),p("node")]})).unwrap();
    let started = Instant::now();
    let registry = crate::signature_policy::parse(&bytes, started).unwrap();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let b = fixture();
    let result = super::super::inspect(
        &b,
        &Request {
            registry: &registry,
            reference: crate::signature_policy::RegistryReference {
                schema_version: "bp5-r2-signature-registry-0.1",
                registry_id: "synthetic",
                sha256: &hash,
            },
            policy_id: "node",
            role: Role::Node,
            expected: &SyntheticEvidence.identity().unwrap(),
            started,
            cancelled: &AtomicBool::new(false),
        },
    )
    .unwrap();
    assert_eq!(result.entitlement_keys, 1);
    assert_eq!(
        format!("{result:?}"),
        "ComparedSnapshot(not_execution_authority)"
    );
    assert!(b.api.live.borrow().is_empty());
}
