use super::*;
use crate::signature_policy::{self, ObservedValue, Representation};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
};

fn identity() -> Identity {
    Identity {
        device: 1,
        inode: 2,
        size: 100,
        sha256: "a".repeat(64),
    }
}
fn snapshot(role: Role) -> Snapshot {
    let name = if role == Role::Launcher {
        "launcher"
    } else {
        "node"
    };
    Snapshot {
        layout: Layout::ThinArm64,
        form: SignatureForm::DeveloperIdApplication,
        identity: identity(),
        team_id: "SYNTHETIC".into(),
        identifier: format!("test.{name}"),
        anchor: "apple_developer_id".into(),
        certificate_class: "developer_id_application".into(),
        static_flags: 65536,
        entitlements: Observation {
            representation: Representation::Dictionary(if role == Role::Launcher {
                vec![]
            } else {
                vec![("TEST_KEY".into(), ObservedValue::Boolean(true))]
            }),
            blob_bytes: 100,
        },
    }
}
struct Lease(Rc<Cell<usize>>);
impl Drop for Lease {
    fn drop(&mut self) {
        self.0.set(self.0.get() + 1);
    }
}
struct Fake {
    start: Instant,
    now: Cell<Instant>,
    cancelled: AtomicBool,
    calls: RefCell<Vec<&'static str>>,
    drop_count: Rc<Cell<usize>>,
    fail: Option<&'static str>,
    interrupt: Option<&'static str>,
    late: bool,
    null_handle: bool,
    null_snapshot: bool,
    status: Status,
    self_status: Status,
    self_changed: bool,
    observation: RefCell<Option<Snapshot>>,
    post_changed: bool,
}
impl Fake {
    fn new(role: Role) -> Self {
        let start = Instant::now();
        Self {
            start,
            now: Cell::new(start),
            cancelled: AtomicBool::new(false),
            calls: RefCell::new(vec![]),
            drop_count: Rc::new(Cell::new(0)),
            fail: None,
            interrupt: None,
            late: false,
            null_handle: false,
            null_snapshot: false,
            status: Status::Valid,
            self_status: Status::Valid,
            self_changed: false,
            observation: RefCell::new(Some(snapshot(role))),
            post_changed: false,
        }
    }
    fn step(&self, name: &'static str) -> Result<(), Rejection> {
        self.calls.borrow_mut().push(name);
        if self.interrupt == Some(name) {
            if self.late {
                self.now.set(self.start + Duration::from_secs(10));
            } else {
                self.cancelled.store(true, Ordering::Release);
            }
        }
        if self.fail == Some(name) {
            Err(Rejection::ApiFailed)
        } else {
            Ok(())
        }
    }
}
impl Backend for Fake {
    type Handle = Lease;
    fn now(&self) -> Instant {
        self.now.get()
    }
    fn identity(&self) -> Result<Identity, Rejection> {
        let final_read = self.calls.borrow().contains(&"snapshot");
        self.step(if final_read { "after" } else { "before" })?;
        let mut id = identity();
        if final_read && self.post_changed {
            id.inode += 1;
        }
        Ok(id)
    }
    fn acquire(&self, _: Role) -> Result<Option<Lease>, Rejection> {
        self.step("acquire")?;
        Ok(if self.null_handle {
            None
        } else {
            Some(Lease(self.drop_count.clone()))
        })
    }
    fn validate(
        &self,
        _: &Lease,
        p: &BoundPolicy<'_>,
        profile: ValidationProfile,
    ) -> Result<Status, Rejection> {
        assert!(profile == ValidationProfile::OfflineFullExecutable);
        assert_eq!(p.template, "developer_id_application_v1");
        assert_eq!(p.anchor, "apple_developer_id");
        self.step("validate")?;
        Ok(self.status)
    }
    fn validate_self(
        &self,
        _: &Lease,
        profile: ValidationProfile,
    ) -> Result<SelfObservation, Rejection> {
        assert!(profile == ValidationProfile::OfflineFullExecutable);
        self.step("self")?;
        let mut own = identity();
        if self.self_changed {
            own.inode += 1;
        }
        Ok(SelfObservation {
            status: self.self_status,
            identity: own,
        })
    }
    fn snapshot(&self, _: &Lease) -> Result<Option<Snapshot>, Rejection> {
        self.step("snapshot")?;
        Ok(if self.null_snapshot {
            None
        } else {
            self.observation.borrow_mut().take()
        })
    }
}
struct RegistryFixture {
    registry: ParsedRegistry,
    hash: String,
}
impl RegistryFixture {
    fn new() -> Self {
        let p = |role: &str| json!({"id":role,"role":role,"artifact_class":"mach_o_thin_arm64","requirement_template_id":"developer_id_application_v1","issuer":{"anchor":"apple_developer_id","certificate_class":"developer_id_application","team_id":"SYNTHETIC","signing_identifier":format!("test.{role}")},"expected_static_flags":65536,"entitlement_expectation":if role == "launcher" { json!({"kind":"empty"}) } else { json!({"kind":"dictionary","entries":{"TEST_KEY":{"type":"boolean","value":true}}}) }});
        let bytes = serde_json::to_vec(&json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic","policies":[p("launcher"),p("node")]})).unwrap();
        Self {
            registry: signature_policy::parse(&bytes, Instant::now()).unwrap(),
            hash: format!("{:x}", Sha256::digest(&bytes)),
        }
    }
    fn run(&self, f: &Fake, role: Role) -> Result<ComparedSnapshot, Rejection> {
        inspect(
            f,
            &Request {
                registry: &self.registry,
                reference: RegistryReference {
                    schema_version: "bp5-r2-signature-registry-0.1",
                    registry_id: "synthetic",
                    sha256: &self.hash,
                },
                policy_id: if role == Role::Launcher {
                    "launcher"
                } else {
                    "node"
                },
                role,
                expected: &identity(),
                started: f.start,
                cancelled: &f.cancelled,
            },
        )
    }
}
#[test]
fn normal_role_specific_pipeline_returns_non_authority_and_releases_handle() {
    let r = RegistryFixture::new();
    for role in [Role::Launcher, Role::Node] {
        let f = Fake::new(role);
        let result = r.run(&f, role).unwrap();
        assert_eq!(result.entitlement_keys, usize::from(role == Role::Node));
        assert_eq!(
            format!("{result:?}"),
            "ComparedSnapshot(not_execution_authority)"
        );
        let expected = if role == Role::Launcher {
            vec!["before", "acquire", "validate", "self", "snapshot", "after"]
        } else {
            vec!["before", "acquire", "validate", "snapshot", "after"]
        };
        assert_eq!(*f.calls.borrow(), expected);
        assert_eq!(f.drop_count.get(), 1);
    }
}
#[test]
fn every_api_failure_stops_without_retry_and_releases_owned_handle() {
    let r = RegistryFixture::new();
    for phase in ["before", "acquire", "validate", "self", "snapshot", "after"] {
        let mut f = Fake::new(Role::Launcher);
        f.fail = Some(phase);
        assert_eq!(r.run(&f, Role::Launcher).unwrap_err(), Rejection::ApiFailed);
        assert_eq!(f.calls.borrow().last(), Some(&phase));
        assert_eq!(
            f.drop_count.get(),
            usize::from(!["before", "acquire"].contains(&phase))
        );
    }
}
#[test]
fn null_objects_stop_and_information_is_not_validity() {
    let r = RegistryFixture::new();
    for null_at_acquire in [true, false] {
        let mut f = Fake::new(Role::Node);
        f.null_handle = null_at_acquire;
        f.null_snapshot = !null_at_acquire;
        assert_eq!(r.run(&f, Role::Node).unwrap_err(), Rejection::MissingObject);
        assert_eq!(f.drop_count.get(), usize::from(!null_at_acquire));
    }
    for (status, error) in [
        (Status::Invalid, Rejection::InvalidSignature),
        (Status::RequirementMismatch, Rejection::RequirementMismatch),
        (Status::Unknown, Rejection::UnknownObservation),
    ] {
        let mut f = Fake::new(Role::Node);
        f.status = status;
        assert_eq!(r.run(&f, Role::Node).unwrap_err(), error);
        assert!(!f.calls.borrow().contains(&"snapshot"));
        assert_eq!(f.drop_count.get(), 1);
    }
}
#[test]
fn launcher_requires_dynamic_self_validity_too() {
    let r = RegistryFixture::new();
    for status in [
        Status::Invalid,
        Status::RequirementMismatch,
        Status::Unknown,
    ] {
        let mut f = Fake::new(Role::Launcher);
        f.self_status = status;
        assert!(r.run(&f, Role::Launcher).is_err());
        assert!(!f.calls.borrow().contains(&"snapshot"));
        assert_eq!(f.drop_count.get(), 1);
    }
}
#[test]
fn cancellation_and_late_results_at_every_phase_drop_resources() {
    let r = RegistryFixture::new();
    for phase in ["before", "acquire", "validate", "self", "snapshot", "after"] {
        for late in [true, false] {
            let mut f = Fake::new(Role::Launcher);
            f.interrupt = Some(phase);
            f.late = late;
            assert_eq!(
                r.run(&f, Role::Launcher).unwrap_err(),
                if late {
                    Rejection::Deadline
                } else {
                    Rejection::Cancelled
                }
            );
            assert_eq!(f.calls.borrow().last(), Some(&phase));
            assert_eq!(f.drop_count.get(), usize::from(phase != "before"));
        }
    }
}
#[test]
fn initial_cancel_expiry_and_future_start_make_no_backend_calls() {
    let r = RegistryFixture::new();
    for kind in 0..3 {
        let f = Fake::new(Role::Node);
        match kind {
            0 => f.cancelled.store(true, Ordering::Release),
            1 => f.now.set(f.start + Duration::from_secs(10)),
            _ => f.now.set(f.start - Duration::from_millis(1)),
        }
        assert_eq!(
            r.run(&f, Role::Node).unwrap_err(),
            if kind == 0 {
                Rejection::Cancelled
            } else {
                Rejection::Deadline
            }
        );
        assert!(f.calls.borrow().is_empty());
    }
}
#[test]
fn changed_security_object_or_final_file_identity_stops() {
    let r = RegistryFixture::new();
    for kind in 0..5 {
        let mut f = Fake::new(Role::Node);
        if kind == 4 {
            f.post_changed = true;
        } else {
            let mut o = f.observation.borrow_mut();
            let o = o.as_mut().unwrap();
            match kind {
                0 => o.identity.inode += 1,
                1 => o.identity.device += 1,
                2 => o.identity.size += 1,
                _ => o.identity.sha256 = "b".repeat(64),
            }
        }
        assert_eq!(
            r.run(&f, Role::Node).unwrap_err(),
            Rejection::IdentityChanged
        );
        assert_eq!(f.drop_count.get(), 1);
    }
}
#[test]
fn issuer_and_complete_static_flags_must_match_exactly() {
    let r = RegistryFixture::new();
    for kind in 0..8 {
        let f = Fake::new(Role::Node);
        {
            let mut o = f.observation.borrow_mut();
            let o = o.as_mut().unwrap();
            match kind {
                0 => o.team_id = "OTHER".into(),
                1 => o.identifier = "other".into(),
                2 => o.anchor = "other".into(),
                3 => o.certificate_class = "development".into(),
                4 => o.static_flags = 0,
                5 => o.static_flags |= 2,
                6 => o.static_flags |= 0x80000000,
                _ => o.team_id = "x".repeat(129),
            }
        }
        assert_eq!(
            r.run(&f, Role::Node).unwrap_err(),
            if kind == 7 {
                Rejection::Limit
            } else if kind >= 4 {
                Rejection::FlagsMismatch
            } else {
                Rejection::IssuerMismatch
            }
        );
        assert_eq!(f.drop_count.get(), 1);
    }
}
#[test]
fn unsigned_adhoc_linker_unknown_and_non_thin_layout_are_rejected() {
    let r = RegistryFixture::new();
    for form in [
        SignatureForm::Unsigned,
        SignatureForm::AdHoc,
        SignatureForm::LinkerOnly,
        SignatureForm::Unknown,
    ] {
        let f = Fake::new(Role::Node);
        f.observation.borrow_mut().as_mut().unwrap().form = form;
        assert_eq!(
            r.run(&f, Role::Node).unwrap_err(),
            Rejection::InvalidSignature
        );
    }
    let f = Fake::new(Role::Node);
    f.observation.borrow_mut().as_mut().unwrap().layout = Layout::Unsupported;
    assert_eq!(r.run(&f, Role::Node).unwrap_err(), Rejection::Unsupported);
}
#[test]
fn missing_entitlement_dictionary_is_never_upgraded_to_absence() {
    let r = RegistryFixture::new();
    for role in [Role::Launcher, Role::Node] {
        let f = Fake::new(role);
        f.observation
            .borrow_mut()
            .as_mut()
            .unwrap()
            .entitlements
            .representation = Representation::UnsupportedOrUnknown;
        assert_eq!(r.run(&f, role).unwrap_err(), Rejection::UnknownObservation);
        assert_eq!(f.drop_count.get(), 1);
    }
}
#[test]
fn wrong_entitlement_type_value_and_blob_limit_stop() {
    let r = RegistryFixture::new();
    for value in [
        ObservedValue::Boolean(false),
        ObservedValue::Number,
        ObservedValue::String,
        ObservedValue::Data,
        ObservedValue::Container,
        ObservedValue::Unknown,
    ] {
        let f = Fake::new(Role::Node);
        f.observation
            .borrow_mut()
            .as_mut()
            .unwrap()
            .entitlements
            .representation = Representation::Dictionary(vec![("TEST_KEY".into(), value)]);
        assert_eq!(
            r.run(&f, Role::Node).unwrap_err(),
            Rejection::EntitlementMismatch
        );
        assert_eq!(f.drop_count.get(), 1);
    }
    let f = Fake::new(Role::Node);
    f.observation
        .borrow_mut()
        .as_mut()
        .unwrap()
        .entitlements
        .blob_bytes = 65537;
    assert_eq!(r.run(&f, Role::Node).unwrap_err(), Rejection::Limit);
}
#[test]
fn wrong_registry_reference_stops_before_backend_access() {
    let mut r = RegistryFixture::new();
    r.hash = "f".repeat(64);
    let f = Fake::new(Role::Node);
    assert_eq!(
        r.run(&f, Role::Node).unwrap_err(),
        Rejection::PolicyRejected
    );
    assert!(f.calls.borrow().is_empty());
}
#[test]
fn fixed_errors_and_debug_never_echo_observation_markers() {
    let r = RegistryFixture::new();
    let f = Fake::new(Role::Node);
    f.observation.borrow_mut().as_mut().unwrap().team_id = "PRIVATE_MARKER".into();
    let e = r.run(&f, Role::Node).unwrap_err();
    assert_eq!(format!("{e:?}"), "IssuerMismatch");
    assert!(!format!("{e:?}").contains("PRIVATE_MARKER"));
}

#[test]
fn unknown_policy_and_wrong_role_fail_before_acquisition() {
    let r = RegistryFixture::new();
    for policy_id in ["missing", "launcher"] {
        let f = Fake::new(Role::Node);
        assert_eq!(
            inspect(
                &f,
                &Request {
                    registry: &r.registry,
                    reference: RegistryReference {
                        schema_version: "bp5-r2-signature-registry-0.1",
                        registry_id: "synthetic",
                        sha256: &r.hash
                    },
                    policy_id,
                    role: Role::Node,
                    expected: &identity(),
                    started: f.start,
                    cancelled: &f.cancelled,
                }
            )
            .unwrap_err(),
            Rejection::PolicyRejected
        );
        assert!(f.calls.borrow().is_empty());
    }
}

#[test]
fn no_absence_proof_is_manufactured_and_nonempty_policy_rejects_absence() {
    let r = RegistryFixture::new();
    // Deliberately supplied synthetic assertion only, not proof that a native producer exists.
    for role in [Role::Launcher, Role::Node] {
        let f = Fake::new(role);
        f.observation
            .borrow_mut()
            .as_mut()
            .unwrap()
            .entitlements
            .representation = Representation::AbsenceProven;
        if role == Role::Launcher {
            assert_eq!(r.run(&f, role).unwrap().entitlement_keys, 0);
        } else {
            assert_eq!(r.run(&f, role).unwrap_err(), Rejection::EntitlementMismatch);
        }
        assert_eq!(f.drop_count.get(), 1);
    }
}

#[test]
fn malformed_expected_identity_stops_without_backend_calls() {
    let r = RegistryFixture::new();
    for kind in 0..3 {
        let f = Fake::new(Role::Node);
        let mut expected = identity();
        match kind {
            0 => expected.size = 0,
            1 => expected.sha256 = "A".repeat(64),
            _ => expected.sha256.clear(),
        }
        assert_eq!(
            inspect(
                &f,
                &Request {
                    registry: &r.registry,
                    reference: RegistryReference {
                        schema_version: "bp5-r2-signature-registry-0.1",
                        registry_id: "synthetic",
                        sha256: &r.hash
                    },
                    policy_id: "node",
                    role: Role::Node,
                    expected: &expected,
                    started: f.start,
                    cancelled: &f.cancelled,
                }
            )
            .unwrap_err(),
            Rejection::IdentityChanged
        );
        assert!(f.calls.borrow().is_empty());
    }
}

#[test]
fn valid_but_different_running_self_is_not_accepted() {
    let r = RegistryFixture::new();
    let mut f = Fake::new(Role::Launcher);
    f.self_changed = true;
    assert_eq!(
        r.run(&f, Role::Launcher).unwrap_err(),
        Rejection::IdentityChanged
    );
    assert!(!f.calls.borrow().contains(&"snapshot"));
    assert_eq!(f.drop_count.get(), 1);
}
