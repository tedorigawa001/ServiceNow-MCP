use r2_outer_records::{ledger_v2::*, signature_policy};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::Instant;
const NOW: u64 = 1792368000000;
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn registry_bytes() -> Vec<u8> {
    let policy = |role: &str| json!({"id":format!("{role}-1"),"role":role,"artifact_class":"mach_o_thin_arm64","requirement_template_id":"developer_id_application_v1","issuer":{"anchor":"apple_developer_id","certificate_class":"developer_id_application","team_id":"SYNTHETIC","signing_identifier":format!("test.{role}")},"expected_static_flags":65536,"entitlement_expectation":{"kind":"empty"}});
    serde_json::to_vec(&json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic-registry","policies":[policy("launcher"),policy("node")]})).unwrap()
}
fn document() -> Value {
    let binary = |name: &str| json!({"path":format!("/release/bin/{name}"),"sha256":"a".repeat(64),"version":"1.2.3","signature_policy_id":format!("{name}-1")});
    json!({"schema_version":"bp5-r2-launch-ledger-0.2","policy_id":"bp5-r2-outer-macos-arm64-0.2","generation":1,"release_id":"synthetic","execution_uid":501,
        "platform":{"os":"darwin","arch":"arm64","product_version":"26.7","os_build":"TESTBUILD"},"launcher":binary("launcher"),"node":binary("node"),
        "signature_registry":{"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic-registry","sha256":hash(&registry_bytes())},
        "runtime":{"root":"/release","cwd":"/release","entry_relative_path":"dist/review/r2-launcher-entry.js","index_path":"/release/index.json","index_sha256":"b".repeat(64)},
        "build_receipt_sha256":"c".repeat(64),"source_revision":"d".repeat(40),"lockfile_sha256":"e".repeat(64),"approved_at":"2026-10-18T00:00:00.000Z","expires_at":"2026-10-20T00:00:00.000Z","approval_ref":"SYNTHETIC_APPROVAL"})
}
fn context<'a>(digest: &'a str) -> Context<'a> {
    Context {
        ledger_sha256: digest,
        generation: 1,
        release_id: "synthetic",
        execution_uid: 501,
        index_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        product_version: "26.7",
        os_build: "TESTBUILD",
        start_wall_ms: NOW,
    }
}
fn run(v: Value) -> Result<BindingSummary, LedgerFailure> {
    let bytes = serde_json::to_vec(&v).unwrap();
    let digest = hash(&bytes);
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    parse_and_bind(&bytes, &registry, &context(&digest), Instant::now())
}
#[test]
fn v2_binds_two_role_specific_policies_and_returns_only_counts() {
    assert_eq!(run(document()).unwrap().bound_policies, 2);
}
#[test]
fn registry_digest_schema_and_id_mismatch_stop_binding() {
    for (key, value) in [
        ("sha256", json!("f".repeat(64))),
        ("registry_id", json!("different")),
        ("schema_version", json!("future")),
    ] {
        let mut v = document();
        v["signature_registry"][key] = value;
        assert!(run(v).is_err());
    }
}
#[test]
fn unknown_policy_and_role_swaps_never_fall_back() {
    for role in ["launcher", "node"] {
        let mut v = document();
        v[role]["signature_policy_id"] = json!("missing");
        assert_eq!(
            run(v),
            Err(LedgerFailure::Registry(
                signature_policy::PolicyFailure::UnknownPolicy
            ))
        );
    }
    for (role, wrong) in [("launcher", "node-1"), ("node", "launcher-1")] {
        let mut v = document();
        v[role]["signature_policy_id"] = json!(wrong);
        assert_eq!(
            run(v),
            Err(LedgerFailure::Registry(
                signature_policy::PolicyFailure::RoleMismatch
            ))
        );
    }
}
#[test]
fn every_legacy_binary_field_is_rejected_when_mixed_into_v2() {
    for role in ["launcher", "node"] {
        for (key, value) in [
            ("signature_requirement", json!("true")),
            ("publisher", json!("old")),
            ("hardened_runtime", json!(true)),
            ("entitlements", json!([])),
        ] {
            let mut v = document();
            v[role][key] = value;
            assert_eq!(run(v), Err(LedgerFailure::Invalid));
        }
    }
}
#[test]
fn v1_v2_and_unknown_schema_tags_are_not_union_accepted() {
    for schema in ["bp5-r2-launch-ledger-0.1", "bp5-r2-launch-ledger-0.3"] {
        let mut v = document();
        v["schema_version"] = json!(schema);
        assert_eq!(run(v), Err(LedgerFailure::Invalid));
    }
    let mut v = document();
    v["policy_id"] = json!("bp5-r2-outer-macos-arm64-0.1");
    assert_eq!(run(v), Err(LedgerFailure::Invalid));
    let mut v = document();
    v.as_object_mut().unwrap().remove("signature_registry");
    assert_eq!(run(v), Err(LedgerFailure::Invalid));
}
#[test]
fn all_objects_reject_unknown_fields_and_missing_required_keys() {
    for name in [
        "",
        "platform",
        "runtime",
        "signature_registry",
        "launcher",
        "node",
    ] {
        let mut v = document();
        let target = if name.is_empty() {
            &mut v
        } else {
            &mut v[name]
        };
        target["unknown"] = json!(true);
        assert_eq!(run(v), Err(LedgerFailure::Invalid));
    }
    for name in ["path", "sha256", "version", "signature_policy_id"] {
        let mut v = document();
        v["node"].as_object_mut().unwrap().remove(name);
        assert_eq!(run(v), Err(LedgerFailure::Invalid));
    }
}
#[test]
fn strict_json_rejects_duplicates_bom_invalid_utf8_trailing_and_depth() {
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    let text = serde_json::to_string(&document()).unwrap();
    let dup = text.replacen(
        "\"signature_policy_id\":",
        "\"signature_policy_id\":\"duplicate\",\"signature_policy_id\":",
        1,
    );
    let topdup = text.replacen("\"generation\":1", "\"generation\":1,\"generation\":1", 1);
    for bytes in [
        dup.into_bytes(),
        topdup.into_bytes(),
        [b"\xef\xbb\xbf".as_slice(), text.as_bytes()].concat(),
        vec![0xff],
        [text.as_bytes(), b" {}"].concat(),
        format!("{}0{}", "[".repeat(18), "]".repeat(18)).into_bytes(),
    ] {
        let digest = hash(&bytes);
        assert_eq!(
            parse_and_bind(&bytes, &registry, &context(&digest), Instant::now()),
            Err(LedgerFailure::Invalid)
        );
    }
}
#[test]
fn raw_ledger_hash_is_bound_without_json_normalization() {
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    let bytes = serde_json::to_vec(&document()).unwrap();
    let digest = hash(&bytes);
    let mut changed = bytes.clone();
    changed.push(b' ');
    assert_eq!(
        parse_and_bind(&changed, &registry, &context(&digest), Instant::now()),
        Err(LedgerFailure::Binding)
    );
    let new_digest = hash(&changed);
    assert!(parse_and_bind(&changed, &registry, &context(&new_digest), Instant::now()).is_ok());
}
#[test]
fn context_bindings_are_checked_before_a_success_summary() {
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    let bytes = serde_json::to_vec(&document()).unwrap();
    let digest = hash(&bytes);
    for changed in 0..7 {
        let mut c = context(&digest);
        match changed {
            0 => c.generation = 2,
            1 => c.execution_uid = 502,
            2 => c.release_id = "other",
            3 => c.index_sha256 = "wrong",
            4 => c.product_version = "different",
            5 => c.os_build = "different",
            _ => c.ledger_sha256 = "wrong",
        };
        assert_eq!(
            parse_and_bind(&bytes, &registry, &c, Instant::now()),
            Err(LedgerFailure::Binding)
        );
    }
}
#[test]
fn content_changed_registry_same_id_is_not_the_referenced_registry() {
    let mut bytes = registry_bytes();
    bytes.push(b' ');
    let registry = signature_policy::parse(&bytes, Instant::now()).unwrap();
    let bytes = serde_json::to_vec(&document()).unwrap();
    let digest = hash(&bytes);
    assert_eq!(
        parse_and_bind(&bytes, &registry, &context(&digest), Instant::now()),
        Err(LedgerFailure::Registry(
            signature_policy::PolicyFailure::RegistryMismatch
        ))
    );
}
#[test]
fn field_shapes_paths_hashes_versions_and_numbers_remain_strict() {
    for (key, value) in [
        ("path", json!("relative")),
        ("path", json!("/release/../outside")),
        ("path", json!("/release-other/node")),
        ("sha256", json!("A".repeat(64))),
        ("version", json!("1.2")),
        ("signature_policy_id", json!("node *")),
    ] {
        let mut v = document();
        v["node"][key] = value;
        assert_eq!(run(v), Err(LedgerFailure::Invalid));
    }
    for value in [json!(0), json!(-1), json!(1.0), json!(9007199254740992u64)] {
        let mut v = document();
        v["generation"] = value;
        assert_eq!(run(v), Err(LedgerFailure::Invalid));
    }
    for (key, value) in [
        ("cwd", "/other"),
        ("entry_relative_path", "else.js"),
        ("index_path", "/release-other/index.json"),
    ] {
        let mut v = document();
        v["runtime"][key] = json!(value);
        assert_eq!(run(v), Err(LedgerFailure::Invalid));
    }
}
fn date(ms: u64) -> String {
    chrono::DateTime::from_timestamp_millis(ms as i64)
        .unwrap()
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
#[test]
fn expiration_boundary_and_invalid_approval_times_stop() {
    let mut v = document();
    v["expires_at"] = json!(date(NOW + 460000));
    assert_eq!(run(v), Err(LedgerFailure::Expired));
    let mut v = document();
    v["expires_at"] = json!(date(NOW + 460001));
    assert!(run(v).is_ok());
    let mut v = document();
    v["approved_at"] = json!(date(NOW + 1));
    assert_eq!(run(v), Err(LedgerFailure::Invalid));
    let mut v = document();
    v["expires_at"] = json!("bad");
    assert_eq!(run(v), Err(LedgerFailure::Invalid));
}
#[test]
fn byte_limit_accepts_64kib_rejects_one_more() {
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    let mut bytes = serde_json::to_vec(&document()).unwrap();
    bytes.resize(65536, b' ');
    let digest = hash(&bytes);
    assert!(parse_and_bind(&bytes, &registry, &context(&digest), Instant::now()).is_ok());
    bytes.push(b' ');
    assert_eq!(
        parse_and_bind(&bytes, &registry, &context(&digest), Instant::now()),
        Err(LedgerFailure::Limit)
    );
}
#[test]
fn expired_and_future_monotonic_starts_are_rejected() {
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    let bytes = serde_json::to_vec(&document()).unwrap();
    let digest = hash(&bytes);
    for started in [
        Instant::now() - std::time::Duration::from_secs(10),
        Instant::now() + std::time::Duration::from_secs(100),
    ] {
        assert_eq!(
            parse_and_bind(&bytes, &registry, &context(&digest), started),
            Err(LedgerFailure::Deadline)
        );
    }
}
#[test]
fn complete_legacy_shape_is_not_upgraded_to_v2() {
    let mut v = document();
    v["schema_version"] = json!("bp5-r2-launch-ledger-0.1");
    v["policy_id"] = json!("bp5-r2-outer-macos-arm64-0.1");
    v.as_object_mut().unwrap().remove("signature_registry");
    for role in ["launcher", "node"] {
        let binary = v[role].as_object_mut().unwrap();
        binary.remove("signature_policy_id");
        binary.insert("signature_requirement".into(), json!("SYNTHETIC"));
        binary.insert("publisher".into(), json!("SYNTHETIC"));
        binary.insert("hardened_runtime".into(), json!(true));
        binary.insert("entitlements".into(), json!([]));
    }
    assert_eq!(run(v), Err(LedgerFailure::Invalid));
}
#[test]
fn wall_time_overflow_is_not_an_implicit_valid_approval() {
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    let bytes = serde_json::to_vec(&document()).unwrap();
    let digest = hash(&bytes);
    let mut c = context(&digest);
    c.start_wall_ms = u64::MAX;
    assert_eq!(
        parse_and_bind(&bytes, &registry, &c, Instant::now()),
        Err(LedgerFailure::Invalid)
    );
}
#[test]
fn raw_hash_is_bound_before_any_json_parsing() {
    let registry = signature_policy::parse(&registry_bytes(), Instant::now()).unwrap();
    let pinned = hash(&serde_json::to_vec(&document()).unwrap());
    // Unauthenticated bytes must stop at the hash binding, whatever their JSON shape is.
    for unpinned in [
        b"{".as_slice(),
        b"\xff\xfe".as_slice(),
        br#"{"schema_version":"unknown"}"#.as_slice(),
    ] {
        assert_eq!(
            parse_and_bind(unpinned, &registry, &context(&pinned), Instant::now()).unwrap_err(),
            LedgerFailure::Binding
        );
    }
    // Pinned bytes that are not a valid ledger are still rejected as invalid after binding.
    let malformed = b"{";
    assert_eq!(
        parse_and_bind(
            malformed,
            &registry,
            &context(&hash(malformed)),
            Instant::now()
        )
        .unwrap_err(),
        LedgerFailure::Invalid
    );
}
