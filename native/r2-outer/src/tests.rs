use super::*;
use serde_json::{Value, json};
use std::cell::{Cell, RefCell};
const LEDGER: &str = "/private/operator/ledger.json";
const NOW: u64 = 1792368000000; // 2026-10-19T00:00:00.000Z, synthetic only
fn bytes(v: &Value) -> Vec<u8> {
    serde_json::to_vec(v).unwrap()
}
struct Fake {
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
fn fixture() -> Fake {
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
