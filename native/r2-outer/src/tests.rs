use super::*;
use serde_json::{Value, json};
use std::cell::{Cell, RefCell};
const LEDGER: &str = "/private/operator/ledger.json";
const NOW: u64 = 1792368000000; // 2026-10-19T00:00:00.000Z, synthetic only
fn bytes(v: &Value) -> Vec<u8> {
    serde_json::to_vec(v).unwrap()
}
pub(super) struct Fake {
    a: Snapshot,
    l: Snapshot,
    reads: RefCell<Vec<String>>,
    uid: u32,
    groups: Vec<u32>,
    end: (u64, u64),
    clocks: Cell<usize>,
    mutation: Option<Role>,
    missing: bool,
}
fn meta(uid: u32, mode: u32) -> Metadata {
    Metadata {
        regular: true,
        directory: false,
        uid,
        gid: 777,
        mode,
        links: 1,
        no_acl: true,
    }
}
pub(super) fn fixture() -> Fake {
    let binary = json!({"path":"/release/bin/node","sha256":"a".repeat(64),"version":"v24.18.0",
        "signature_requirement":"PRIVATE_REQUIREMENT","publisher":"PRIVATE_PUBLISHER","hardened_runtime":true,"entitlements":[]});
    let l = json!({"schema_version":"bp5-r2-launch-ledger-0.1","generation":1,"release_id":"PRIVATE_RELEASE","execution_uid":501,
        "platform":{"os":"darwin","arch":"arm64","product_version":"26.7","os_build":"PRIVATEBUILD"},
        "launcher":binary,"node":binary,"runtime":{"root":"/release","entry_relative_path":"dist/review/r2-launcher-entry.js",
        "cwd":"/release","index_path":"/release/index.json","index_sha256":"b".repeat(64)},"build_receipt_sha256":"c".repeat(64),
        "source_revision":"d".repeat(40),"lockfile_sha256":"e".repeat(64),"approved_at":"2026-10-18T00:00:00.000Z",
        "expires_at":"2026-10-20T00:00:00.000Z","approval_ref":"PRIVATE_APPROVAL","policy_id":"bp5-r2-outer-macos-arm64-0.1"});
    let l = bytes(&l);
    let a = bytes(
        &json!({"schema_version":"bp5-r2-activation-0.1","generation":1,"execution_uid":501,"reader_gid":777,
        "ledger_path":LEDGER,"ledger_sha256":digest(&l),"release_id":"PRIVATE_RELEASE","artifact_index_sha256":"b".repeat(64),
        "approved_at":"2026-10-18T00:00:00.000Z","expires_at":"2026-10-20T00:00:00.000Z","approval_ref":"PRIVATE_APPROVAL"}),
    );
    let dir = Metadata {
        regular: false,
        directory: true,
        uid: 0,
        gid: 0,
        mode: 0o755,
        links: 1,
        no_acl: true,
    };
    Fake {
        a: Snapshot {
            bytes: a,
            meta: meta(0, 0o440),
            ancestors: vec![dir.clone()],
            identity: vec![1],
        },
        l: Snapshot {
            bytes: l,
            meta: meta(501, 0o600),
            ancestors: vec![dir],
            identity: vec![2],
        },
        reads: RefCell::new(vec![]),
        uid: 501,
        groups: vec![777],
        end: (NOW, 0),
        clocks: Cell::new(0),
        mutation: None,
        missing: false,
    }
}
impl Source for Fake {
    fn context(&self) -> Result<Context, Failure> {
        Ok(Context {
            uid: self.uid,
            groups: self.groups.clone(),
            product_version: "26.7".into(),
            os_build: "PRIVATEBUILD".into(),
        })
    }
    fn clock(&self) -> Result<(u64, u64), Failure> {
        let n = self.clocks.get();
        self.clocks.set(n + 1);
        Ok(if n == 0 { (NOW, 0) } else { self.end })
    }
    fn read(&self, path: &str, role: Role, _uid: u32) -> Result<Snapshot, Failure> {
        if self.missing {
            return Err(Failure::Unavailable);
        }
        assert_eq!(
            path,
            if role == Role::Activation {
                ACTIVATION_PATH
            } else {
                LEDGER
            }
        );
        let mut v = if role == Role::Activation {
            self.a.clone()
        } else {
            self.l.clone()
        };
        if self.reads.borrow().len() >= 2 && self.mutation == Some(role) {
            v.identity.push(99);
        }
        self.reads.borrow_mut().push(path.into());
        Ok(v)
    }
}
fn change(f: &mut Fake, role: Role, edit: impl FnOnce(&mut Value)) {
    let s = if role == Role::Activation {
        &mut f.a
    } else {
        &mut f.l
    };
    let mut v: Value = serde_json::from_slice(&s.bytes).unwrap();
    edit(&mut v);
    s.bytes = bytes(&v);
    if role == Role::Ledger {
        let mut a: Value = serde_json::from_slice(&f.a.bytes).unwrap();
        a["ledger_sha256"] = json!(digest(&f.l.bytes));
        f.a.bytes = bytes(&a);
    }
}
fn stopped(f: &Fake, error: Failure) {
    let node_calls = Cell::new(0);
    let result = inspect(f);
    if result.is_ok() {
        node_calls.set(node_calls.get() + 1);
    } // synthetic downstream spy; NEVER a real Node spawn
    assert_eq!(result.err(), Some(error));
    assert_eq!(node_calls.get(), 0);
    assert!(!format!("{error:?}").contains("PRIVATE"));
}
#[test]
fn valid_records_are_opaque_not_execution_authority() {
    let f = fixture();
    let r = inspect(&f).unwrap();
    assert_eq!(f.reads.borrow().len(), 4);
    assert_eq!(
        format!("{r:?}"),
        "InspectedRecords(not_execution_authority)"
    );
}
#[test]
fn rejects_unknown_record_before_any_execution() {
    let mut f = fixture();
    f.a.bytes = br#"{"PRIVATE_UNKNOWN":true}"#.to_vec();
    stopped(&f, Failure::InvalidRecord);
}
#[test]
fn rejects_owner_and_mode_for_both_files() {
    for role in [Role::Activation, Role::Ledger] {
        for kind in 0..7 {
            let mut f = fixture();
            let m = if role == Role::Activation {
                &mut f.a.meta
            } else {
                &mut f.l.meta
            };
            match kind {
                0 => m.uid = 900,
                1 => m.mode |= 0o020,
                2 => m.mode |= 0o4000,
                3 => m.links = 2,
                4 => m.no_acl = false,
                5 => m.regular = false,
                _ => m.directory = true,
            }
            stopped(&f, Failure::UntrustedFile);
        }
    }
}
#[test]
fn rejects_untrusted_ancestors() {
    for role in [Role::Activation, Role::Ledger] {
        for kind in 0..5 {
            let mut f = fixture();
            let m = if role == Role::Activation {
                &mut f.a.ancestors[0]
            } else {
                &mut f.l.ancestors[0]
            };
            match kind {
                0 => m.uid = 999,
                1 => m.mode |= 0o002,
                2 => m.no_acl = false,
                3 => m.directory = false,
                _ => m.mode |= 0o2000,
            }
            stopped(&f, Failure::UntrustedFile);
        }
    }
}
#[test]
fn rejects_symlink_or_non_regular_leaf() {
    let mut f = fixture();
    f.l.meta.regular = false;
    stopped(&f, Failure::UntrustedFile);
}
#[test]
fn rejects_missing_and_acl_unavailable() {
    let mut f = fixture();
    f.missing = true;
    stopped(&f, Failure::Unavailable);
}
#[test]
fn rejects_root_or_wrong_identity_or_group() {
    for kind in 0..4 {
        let mut f = fixture();
        match kind {
            0 => f.uid = 0,
            1 => f.uid = 999,
            2 => f.groups.clear(),
            _ => f.a.meta.gid = 888,
        }
        stopped(
            &f,
            if kind == 0 {
                Failure::UntrustedFile
            } else {
                Failure::BindingMismatch
            },
        );
    }
}
#[test]
fn rejects_exact_bytes_hash_mismatch() {
    let mut f = fixture();
    f.l.bytes.push(b' ');
    stopped(&f, Failure::HashMismatch);
}
#[test]
fn rejects_bindings() {
    for key in [
        "generation",
        "execution_uid",
        "release_id",
        "artifact_index_sha256",
    ] {
        let mut f = fixture();
        change(&mut f, Role::Activation, |v| {
            v[key] = match key {
                "generation" => json!(2),
                "execution_uid" => json!(502),
                "release_id" => json!("PRIVATE_OTHER"),
                _ => json!("f".repeat(64)),
            }
        });
        stopped(&f, Failure::BindingMismatch);
    }
}
#[test]
fn rejects_unknown_keys_at_root_and_nested() {
    for (role, key) in [
        (Role::Activation, "time"),
        (Role::Ledger, "PRIVATE_EXTRA"),
        (Role::Ledger, "platform"),
    ] {
        let mut f = fixture();
        change(&mut f, role, |v| {
            if key == "platform" {
                v[key]["extra"] = json!(true)
            } else {
                v[key] = json!(true)
            }
        });
        stopped(&f, Failure::InvalidRecord);
    }
}
#[test]
fn rejects_duplicates_including_escaped_keys() {
    for role in [Role::Activation, Role::Ledger] {
        let mut f = fixture();
        let s = if role == Role::Activation {
            &mut f.a
        } else {
            &mut f.l
        };
        let original = String::from_utf8(s.bytes.clone()).unwrap();
        s.bytes = original
            .replacen('{', "{\"generation\":1,\"generat\\u0069on\":1,", 1)
            .into_bytes();
        if role == Role::Ledger {
            let hash = digest(&f.l.bytes);
            change(&mut f, Role::Activation, |v| {
                v["ledger_sha256"] = json!(hash)
            });
        }
        stopped(&f, Failure::InvalidRecord);
    }
}
#[test]
fn rejects_invalid_utf8_size_trailing_and_depth() {
    for v in [
        vec![0xff],
        vec![b' '; MAX_BYTES + 1],
        b"{} {}".to_vec(),
        format!("{}0{}", "[".repeat(18), "]".repeat(18)).into_bytes(),
    ] {
        let mut f = fixture();
        f.a.bytes = v;
        let expected = if f.a.bytes.len() > MAX_BYTES {
            Failure::UntrustedFile
        } else {
            Failure::InvalidRecord
        };
        stopped(&f, expected);
    }
}
#[test]
fn rejects_bad_paths() {
    for p in ["relative", "/a/../b", "/a//b", "/a/./b", "/a/", "/a\0b"] {
        let mut f = fixture();
        change(&mut f, Role::Activation, |v| v["ledger_path"] = json!(p));
        stopped(&f, Failure::InvalidRecord);
    }
}
#[test]
fn rejects_future_invalid_or_insufficient_dates() {
    for role in [Role::Activation, Role::Ledger] {
        for (k, v, e) in [
            (
                "approved_at",
                "2026-10-19T00:00:01.000Z",
                Failure::InvalidRecord,
            ),
            ("expires_at", "2026-10-19T00:07:40.000Z", Failure::Expired),
            (
                "expires_at",
                "2026-10-18T00:00:00.000Z",
                Failure::InvalidRecord,
            ),
            (
                "expires_at",
                "2026-02-30T00:00:00.000Z",
                Failure::InvalidRecord,
            ),
            (
                "expires_at",
                "2026-10-20T00:00:00+00:00",
                Failure::InvalidRecord,
            ),
        ] {
            let mut f = fixture();
            change(&mut f, role, |j| j[k] = json!(v));
            stopped(&f, e);
        }
    }
}
#[test]
fn rejects_deadline_or_clock_changes() {
    for (end, e) in [
        ((NOW + 10000, 10000), Failure::Deadline),
        ((NOW - 1, 0), Failure::ClockInvalid),
        ((NOW + 5000, 1), Failure::ClockInvalid),
    ] {
        let mut f = fixture();
        f.end = end;
        stopped(&f, e);
    }
}
#[test]
fn rejects_replacement_of_either_document() {
    for role in [Role::Activation, Role::Ledger] {
        let mut f = fixture();
        f.mutation = Some(role);
        stopped(&f, Failure::Changed);
    }
}
#[test]
fn rejects_unsafe_binary_and_runtime_contracts() {
    for kind in 0..7 {
        let mut f = fixture();
        change(&mut f, Role::Ledger, |v| match kind {
            0 => v["launcher"]["entitlements"] = json!(["com.apple.security.get-task-allow"]),
            1 => {
                v["node"]["entitlements"] = json!([
                    "com.apple.security.allow-jit",
                    "com.apple.security.allow-jit"
                ])
            }
            2 => v["node"]["hardened_runtime"] = json!(false),
            3 => v["runtime"]["cwd"] = json!("/other"),
            4 => v["runtime"]["entry_relative_path"] = json!("../evil.js"),
            5 => v["platform"]["arch"] = json!("x64"),
            _ => v["generation"] = json!(1.0),
        });
        stopped(&f, Failure::InvalidRecord);
    }
}
#[test]
fn validates_platform_binding() {
    let mut f = fixture();
    change(&mut f, Role::Ledger, |v| {
        v["platform"]["os_build"] = json!("OTHERBUILD")
    });
    stopped(&f, Failure::BindingMismatch);
}

#[test]
fn accepts_strict_expiry_boundary_and_rounding_only() {
    let mut f = fixture();
    for role in [Role::Activation, Role::Ledger] {
        change(&mut f, role, |v| {
            v["expires_at"] = json!("2026-10-19T00:07:40.001Z")
        });
    }
    f.end = (NOW + 9999, 9998); // at most 1ms sampling rounding; still >450s validity at return
    assert!(inspect(&f).is_ok());
}

#[test]
fn rejects_nested_duplicate_keys_before_schema_conversion() {
    let mut f = fixture();
    let s = String::from_utf8(f.l.bytes.clone()).unwrap();
    f.l.bytes = s
        .replace(
            "\"os\":\"darwin\"",
            "\"os\":\"darwin\",\"o\\u0073\":\"darwin\"",
        )
        .into_bytes();
    let hash = digest(&f.l.bytes);
    change(&mut f, Role::Activation, |v| {
        v["ledger_sha256"] = json!(hash)
    });
    stopped(&f, Failure::InvalidRecord);
}

#[test]
fn offline_v1_stays_valid_and_never_accepts_v2_records() {
    assert!(inspect(&fixture()).is_ok());
    let mut f = fixture();
    change(&mut f, Role::Ledger, |v| {
        v["schema_version"] = json!("bp5-r2-launch-ledger-0.2");
        v["policy_id"] = json!("bp5-r2-outer-macos-arm64-0.2");
        v["signature_registry"] = json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic","sha256":"a".repeat(64)});
        for role in ["launcher", "node"] {
            let binary = v[role].as_object_mut().unwrap();
            for old in [
                "signature_requirement",
                "publisher",
                "hardened_runtime",
                "entitlements",
            ] {
                binary.remove(old);
            }
            binary.insert("signature_policy_id".into(), json!(format!("{role}-1")));
        }
    });
    stopped(&f, Failure::InvalidRecord);
}

mod v2_reader {
    use super::*;
    fn registry() -> Vec<u8> {
        let policy = |role: &str| json!({"id":format!("{role}-1"),"role":role,"artifact_class":"mach_o_thin_arm64","requirement_template_id":"developer_id_application_v1","issuer":{"anchor":"apple_developer_id","certificate_class":"developer_id_application","team_id":"SYNTHETIC","signing_identifier":format!("test.{role}")},"expected_static_flags":65536,"entitlement_expectation":{"kind":"empty"}});
        bytes(
            &json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic","policies":[policy("launcher"),policy("node")]}),
        )
    }
    fn fixture_v2() -> Fake {
        let mut f = fixture();
        change(&mut f, Role::Ledger, |v| {
            v["schema_version"] = json!("bp5-r2-launch-ledger-0.2");
            v["policy_id"] = json!("bp5-r2-outer-macos-arm64-0.2");
            v["signature_registry"] = json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic","sha256":digest(&registry())});
            for role in ["launcher", "node"] {
                let b = v[role].as_object_mut().unwrap();
                for key in [
                    "signature_requirement",
                    "publisher",
                    "hardened_runtime",
                    "entitlements",
                ] {
                    b.remove(key);
                }
                b.insert("signature_policy_id".into(), json!(format!("{role}-1")));
            }
        });
        f
    }
    fn run(f: &Fake) -> Result<records_v2::InspectedV2Records, Failure> {
        records_v2::inspect(f, &registry())
    }
    fn rejects(f: &Fake, error: Failure) {
        assert_eq!(run(f).unwrap_err(), error);
        assert!(!format!("{error:?}").contains("PRIVATE"));
    }
    #[test]
    fn safe_read_binds_registry_and_returns_opaque_non_authority() {
        let f = fixture_v2();
        assert_eq!(
            format!("{:?}", run(&f).unwrap()),
            "InspectedV2Records(not_execution_authority)"
        );
        assert_eq!(
            *f.reads.borrow(),
            [ACTIVATION_PATH, LEDGER, ACTIVATION_PATH, LEDGER]
        );
    }
    #[test]
    fn no_approved_build_registry_means_no_operational_reader() {
        assert_eq!(
            inspect_installed_v2_records().unwrap_err(),
            Failure::Unavailable
        );
    }
    #[test]
    fn invalid_build_registry_stops_before_any_file_read() {
        for bad in [b"{".as_slice(), b"{}", b"\xff"] {
            let f = fixture_v2();
            assert_eq!(
                records_v2::inspect(&f, bad).unwrap_err(),
                Failure::InvalidRecord
            );
            assert!(f.reads.borrow().is_empty());
        }
    }
    #[test]
    fn registry_bytes_cannot_be_substituted_by_same_id() {
        let f = fixture_v2();
        let mut other = registry();
        other.push(b' ');
        assert_eq!(
            records_v2::inspect(&f, &other).unwrap_err(),
            Failure::BindingMismatch
        );
    }
    #[test]
    fn v2_and_legacy_offline_readers_remain_separate() {
        rejects(&fixture(), Failure::InvalidRecord);
        assert!(inspect(&fixture()).is_ok());
        assert_eq!(inspect(&fixture_v2()).unwrap_err(), Failure::InvalidRecord);
    }
    #[test]
    fn both_documents_require_safe_owner_mode_acl_and_regular_single_link_files() {
        for role in [Role::Activation, Role::Ledger] {
            for kind in 0..8 {
                let mut f = fixture_v2();
                let m = if role == Role::Activation {
                    &mut f.a.meta
                } else {
                    &mut f.l.meta
                };
                match kind {
                    0 => m.uid = 900,
                    1 => m.mode |= 0o020,
                    2 => m.mode |= 0o4000,
                    3 => m.links = 2,
                    4 => m.no_acl = false,
                    5 => m.regular = false,
                    6 => m.directory = true,
                    _ => m.mode = 0o644,
                }
                rejects(&f, Failure::UntrustedFile);
            }
        }
    }
    #[test]
    fn ancestor_changes_and_untrusted_parents_stop() {
        for role in [Role::Activation, Role::Ledger] {
            for kind in 0..5 {
                let mut f = fixture_v2();
                let a = if role == Role::Activation {
                    &mut f.a.ancestors
                } else {
                    &mut f.l.ancestors
                };
                match kind {
                    0 => a[0].uid = 900,
                    1 => a[0].mode |= 0o002,
                    2 => a[0].no_acl = false,
                    3 => a[0].directory = false,
                    _ => a.clear(),
                }
                rejects(&f, Failure::UntrustedFile);
            }
        }
    }
    #[test]
    fn replacements_of_activation_or_ledger_are_detected() {
        for role in [Role::Activation, Role::Ledger] {
            let mut f = fixture_v2();
            f.mutation = Some(role);
            rejects(&f, Failure::Changed);
        }
    }
    #[test]
    fn hash_is_checked_before_ledger_json_and_no_fallback_occurs() {
        let mut f = fixture_v2();
        f.l.bytes = b"{".to_vec();
        rejects(&f, Failure::HashMismatch);
        let hash = digest(&f.l.bytes);
        change(&mut f, Role::Activation, |v| {
            v["ledger_sha256"] = json!(hash)
        });
        rejects(&f, Failure::InvalidRecord);
    }
    #[test]
    fn group_uid_generation_platform_and_index_bindings_stop() {
        for kind in 0..7 {
            let mut f = fixture_v2();
            match kind {
                0 => f.uid = 0,
                1 => f.groups.clear(),
                2 => f.a.meta.gid = 888,
                3 => change(&mut f, Role::Ledger, |v| v["generation"] = json!(2)),
                4 => change(&mut f, Role::Ledger, |v| {
                    v["platform"]["os_build"] = json!("OTHER")
                }),
                5 => change(&mut f, Role::Ledger, |v| {
                    v["runtime"]["index_sha256"] = json!("f".repeat(64))
                }),
                _ => change(&mut f, Role::Ledger, |v| v["execution_uid"] = json!(502)),
            }
            rejects(
                &f,
                if kind == 0 {
                    Failure::UntrustedFile
                } else {
                    Failure::BindingMismatch
                },
            );
        }
    }
    #[test]
    fn unknown_policy_role_or_external_registry_fields_stop() {
        for kind in 0..4 {
            let mut f = fixture_v2();
            change(&mut f, Role::Ledger, |v| match kind {
                0 => v["node"]["signature_policy_id"] = json!("unknown"),
                1 => v["launcher"]["signature_policy_id"] = json!("node-1"),
                2 => v["signature_registry"]["path"] = json!("/untrusted/registry.json"),
                _ => v["signature_registry"]["sha256"] = json!("f".repeat(64)),
            });
            rejects(
                &f,
                if kind == 2 {
                    Failure::InvalidRecord
                } else {
                    Failure::BindingMismatch
                },
            );
        }
    }
    #[test]
    fn missing_oversized_or_invalid_activation_stops() {
        let mut f = fixture_v2();
        f.missing = true;
        rejects(&f, Failure::Unavailable);
        for role in [Role::Activation, Role::Ledger] {
            let mut f = fixture_v2();
            if role == Role::Activation {
                f.a.bytes.resize(MAX_BYTES + 1, b' ');
            } else {
                f.l.bytes.resize(MAX_BYTES + 1, b' ');
            }
            rejects(&f, Failure::UntrustedFile);
        }
        let mut f = fixture_v2();
        f.a.bytes = b"{}".to_vec();
        rejects(&f, Failure::InvalidRecord);
        assert_eq!(f.reads.borrow().len(), 1);
    }
    #[test]
    fn deadline_and_clock_failure_stop_before_new_reads() {
        for (end, error) in [
            ((NOW + 10000, 10000), Failure::Deadline),
            ((NOW - 1, 0), Failure::ClockInvalid),
            ((NOW + 10, 0), Failure::ClockInvalid),
        ] {
            let mut f = fixture_v2();
            f.end = end;
            rejects(&f, error);
            assert!(f.reads.borrow().is_empty());
        }
    }
    #[test]
    fn expiry_of_either_record_is_checked() {
        for role in [Role::Activation, Role::Ledger] {
            let mut f = fixture_v2();
            change(&mut f, role, |v| {
                v["expires_at"] = json!("2026-10-19T00:07:40.000Z")
            });
            rejects(&f, Failure::Expired);
        }
    }
    struct Timed {
        inner: Fake,
        after_reads: usize,
        elapsed: u64,
    }
    impl Source for Timed {
        fn context(&self) -> Result<Context, Failure> {
            self.inner.context()
        }
        fn read(&self, path: &str, role: Role, uid: u32) -> Result<Snapshot, Failure> {
            self.inner.read(path, role, uid)
        }
        fn clock(&self) -> Result<(u64, u64), Failure> {
            let elapsed = if self.inner.reads.borrow().len() >= self.after_reads {
                self.elapsed
            } else {
                0
            };
            Ok((NOW + elapsed, elapsed))
        }
    }
    #[test]
    fn shared_deadline_covers_initial_reads_and_final_rereads() {
        for count in 1..=4 {
            let f = Timed {
                inner: fixture_v2(),
                after_reads: count,
                elapsed: 10000,
            };
            assert_eq!(
                records_v2::inspect(&f, &registry()).unwrap_err(),
                Failure::Deadline
            );
            assert_eq!(f.inner.reads.borrow().len(), count);
        }
    }
    #[test]
    fn valid_just_inside_shared_deadline_preserves_return_validity() {
        let mut inner = fixture_v2();
        for role in [Role::Activation, Role::Ledger] {
            change(&mut inner, role, |v| {
                v["expires_at"] = json!("2026-10-19T00:07:40.001Z")
            });
        }
        let f = Timed {
            inner,
            after_reads: 1,
            elapsed: 9999,
        };
        assert!(records_v2::inspect(&f, &registry()).is_ok());
        assert_eq!(f.inner.reads.borrow().len(), 4);
    }
}
