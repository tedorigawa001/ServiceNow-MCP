use r2_outer_records::signature_policy::*;
use serde_json::{Value, json};
use std::time::Instant;
fn document() -> Value {
    let policy = |id: &str, role: &str, expectation: Value| {
        json!({"id":id,"role":role,"artifact_class":"mach_o_thin_arm64","requirement_template_id":"developer_id_application_v1",
        "issuer":{"anchor":"apple_developer_id","certificate_class":"developer_id_application","team_id":"SYNTHETIC","signing_identifier":format!("test.{role}")},
        "expected_static_flags":65536,"entitlement_expectation":expectation})
    };
    json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"test-registry-1","policies":[
        policy("launcher-1","launcher",json!({"kind":"empty"})),
        policy("node-1","node",json!({"kind":"dictionary","entries":{"TEST_KEY":{"type":"boolean","value":true}}}))]})
}
#[test]
fn strict_registry_parses_synthetic_roles_without_authority() {
    let bytes = serde_json::to_vec(&document()).unwrap();
    assert_eq!(parse(&bytes, Instant::now()).unwrap().policy_count(), 2);
}
#[test]
fn boolean_true_matches_exactly_and_returns_only_a_count() {
    use sha2::{Digest, Sha256};
    let bytes = serde_json::to_vec(&document()).unwrap();
    let parsed = parse(&bytes, Instant::now()).unwrap();
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let reference = RegistryReference {
        schema_version: "bp5-r2-signature-registry-0.1",
        registry_id: "test-registry-1",
        sha256: &digest,
    };
    assert_eq!(
        parsed
            .compare_entitlements(
                &reference,
                "node-1",
                Role::Node,
                &Observation {
                    representation: Representation::Dictionary(vec![(
                        "TEST_KEY".into(),
                        ObservedValue::Boolean(true)
                    )]),
                    blob_bytes: 1
                },
                Instant::now()
            )
            .unwrap()
            .key_count,
        1
    );
}
fn compare(v: Value, role: Role, observed: Observation) -> Result<EntitlementMatch, PolicyFailure> {
    use sha2::{Digest, Sha256};
    let bytes = serde_json::to_vec(&v).unwrap();
    let digest = format!("{:x}", Sha256::digest(&bytes));
    parse(&bytes, Instant::now()).unwrap().compare_entitlements(
        &RegistryReference {
            schema_version: "bp5-r2-signature-registry-0.1",
            registry_id: "test-registry-1",
            sha256: &digest,
        },
        if role == Role::Launcher {
            "launcher-1"
        } else {
            "node-1"
        },
        role,
        &observed,
        Instant::now(),
    )
}
fn obs(entries: Vec<(&str, ObservedValue)>) -> Observation {
    Observation {
        representation: Representation::Dictionary(
            entries.into_iter().map(|(k, v)| (k.into(), v)).collect(),
        ),
        blob_bytes: 1,
    }
}
fn rejects(v: Value) {
    assert!(parse(&serde_json::to_vec(&v).unwrap(), Instant::now()).is_err());
}
#[test]
fn false_and_all_non_boolean_observations_are_rejected() {
    for value in [
        ObservedValue::Boolean(false),
        ObservedValue::Number,
        ObservedValue::String,
        ObservedValue::Data,
        ObservedValue::Container,
        ObservedValue::Unknown,
    ] {
        assert_eq!(
            compare(document(), Role::Node, obs(vec![("TEST_KEY", value)])),
            Err(PolicyFailure::EntitlementMismatch)
        );
    }
}
#[test]
fn missing_extra_duplicate_and_case_changed_keys_are_not_coerced() {
    for entries in [
        vec![],
        vec![("test_key", ObservedValue::Boolean(true))],
        vec![
            ("TEST_KEY", ObservedValue::Boolean(true)),
            ("EXTRA", ObservedValue::Boolean(true)),
        ],
        vec![
            ("TEST_KEY", ObservedValue::Boolean(true)),
            ("TEST_KEY", ObservedValue::Boolean(true)),
        ],
    ] {
        assert!(compare(document(), Role::Node, obs(entries)).is_err());
    }
}
#[test]
fn key_order_does_not_matter_but_byte_spelling_does() {
    let mut v = document();
    v["policies"][1]["entitlement_expectation"]["entries"]["ANOTHER"] =
        json!({"type":"boolean","value":true});
    assert_eq!(
        compare(
            v,
            Role::Node,
            obs(vec![
                ("TEST_KEY", ObservedValue::Boolean(true)),
                ("ANOTHER", ObservedValue::Boolean(true))
            ])
        )
        .unwrap()
        .key_count,
        2
    );
    for key in ["TEST_KEY ", " TEST_KEY", "ＴＥＳＴ_KEY"] {
        assert!(
            compare(
                document(),
                Role::Node,
                obs(vec![(key, ObservedValue::Boolean(true))])
            )
            .is_err()
        );
    }
}
#[test]
fn empty_absence_and_unknown_are_distinct() {
    for representation in [
        Representation::Dictionary(vec![]),
        Representation::AbsenceProven,
    ] {
        assert_eq!(
            compare(
                document(),
                Role::Launcher,
                Observation {
                    representation,
                    blob_bytes: 0
                }
            )
            .unwrap()
            .key_count,
            0
        );
    }
    assert_eq!(
        compare(
            document(),
            Role::Launcher,
            Observation {
                representation: Representation::UnsupportedOrUnknown,
                blob_bytes: 0
            }
        ),
        Err(PolicyFailure::UnknownObservation)
    );
    assert!(
        compare(
            document(),
            Role::Node,
            Observation {
                representation: Representation::AbsenceProven,
                blob_bytes: 0
            }
        )
        .is_err()
    );
    assert!(
        compare(
            document(),
            Role::Launcher,
            obs(vec![("FALSE_PRESENT", ObservedValue::Boolean(false))])
        )
        .is_err()
    );
}
#[test]
fn empty_node_policy_is_allowed_but_nonempty_launcher_is_not() {
    let mut v = document();
    v["policies"][1]["entitlement_expectation"] = json!({"kind":"empty"});
    assert_eq!(compare(v, Role::Node, obs(vec![])).unwrap().key_count, 0);
    let mut v = document();
    v["policies"][0]["entitlement_expectation"] =
        v["policies"][1]["entitlement_expectation"].clone();
    rejects(v);
}
#[test]
fn expectation_values_are_strict_boolean_true_only() {
    for value in [
        json!(false),
        json!(1),
        json!("true"),
        json!(null),
        json!([]),
        json!({}),
    ] {
        let mut v = document();
        v["policies"][1]["entitlement_expectation"]["entries"]["TEST_KEY"]["value"] = value;
        rejects(v);
    }
    let mut v = document();
    v["policies"][1]["entitlement_expectation"]["entries"] = json!({});
    rejects(v);
    let mut v = document();
    v["policies"][1]["entitlement_expectation"]["entries"]["TEST_KEY"]["type"] = json!("number");
    rejects(v);
}
#[test]
fn empty_variant_cannot_hide_extra_fields() {
    let mut v = document();
    v["policies"][0]["entitlement_expectation"]["entries"] =
        json!({"EXTRA":{"type":"boolean","value":true}});
    rejects(v);
}
#[test]
fn every_object_rejects_unknown_fields() {
    for layer in 0..6 {
        let mut v = document();
        let target = match layer {
            0 => &mut v,
            1 => &mut v["policies"][0],
            2 => &mut v["policies"][0]["issuer"],
            3 => &mut v["policies"][1]["entitlement_expectation"],
            4 => &mut v["policies"][1]["entitlement_expectation"]["entries"]["TEST_KEY"],
            _ => &mut v["policies"][0]["entitlement_expectation"],
        };
        target["EXTRA"] = json!(true);
        rejects(v);
    }
}
#[test]
fn duplicate_keys_are_rejected_before_map_conversion() {
    let text = serde_json::to_string(&document()).unwrap();
    for bad in [
        text.replacen(
            "\"registry_id\":",
            "\"registry_id\":\"duplicate\",\"registry_id\":",
            1,
        ),
        text.replacen("\"value\":true", "\"value\":true,\"value\":true", 1),
        text.replacen(
            "\"TEST_KEY\":",
            "\"TEST_KEY\":{\"type\":\"boolean\",\"value\":true},\"TEST_KEY\":",
            1,
        ),
    ] {
        assert!(parse(bad.as_bytes(), Instant::now()).is_err());
    }
}
#[test]
fn malformed_json_bom_trailing_bytes_and_depth_are_rejected() {
    let good = serde_json::to_vec(&document()).unwrap();
    for bytes in [
        [b"\xef\xbb\xbf".as_slice(), &good].concat(),
        [good.as_slice(), b" {}"].concat(),
        vec![0xff],
        b"NaN".to_vec(),
        format!("{}0{}", "[".repeat(10), "]".repeat(10)).into_bytes(),
    ] {
        assert!(parse(&bytes, Instant::now()).is_err());
    }
}
#[test]
fn roles_ids_templates_issuers_and_static_flags_are_closed() {
    for (key, value) in [
        ("role", json!("other")),
        ("id", json!("")),
        ("id", json!("node *")),
        ("artifact_class", json!("universal")),
        ("requirement_template_id", json!("true")),
        ("expected_static_flags", json!(0)),
        ("expected_static_flags", json!(65538)),
        ("expected_static_flags", json!(196608)),
        ("expected_static_flags", json!(65536.0)),
        ("expected_static_flags", json!(-1)),
        ("expected_static_flags", json!(4294967296u64)),
    ] {
        let mut v = document();
        v["policies"][1][key] = value;
        rejects(v);
    }
    for (key, value) in [
        ("anchor", "any"),
        ("certificate_class", "development"),
        ("team_id", "bad\"value"),
        ("signing_identifier", "test\" or true"),
    ] {
        let mut v = document();
        v["policies"][1]["issuer"][key] = json!(value);
        rejects(v);
    }
    let mut v = document();
    v["policies"][1]["id"] = json!("launcher-1");
    rejects(v);
    let mut v = document();
    v["policies"][0]["role"] = json!("node");
    rejects(v);
}
#[test]
fn registry_and_role_bindings_are_exact_no_fallback() {
    use sha2::{Digest, Sha256};
    let bytes = serde_json::to_vec(&document()).unwrap();
    let parsed = parse(&bytes, Instant::now()).unwrap();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let good = RegistryReference {
        schema_version: "bp5-r2-signature-registry-0.1",
        registry_id: "test-registry-1",
        sha256: &hash,
    };
    for reference in [
        RegistryReference {
            schema_version: "future",
            ..good
        },
        RegistryReference {
            registry_id: "TEST-REGISTRY-1",
            ..good
        },
        RegistryReference {
            sha256: &"a".repeat(64),
            ..good
        },
    ] {
        assert_eq!(
            parsed.compare_entitlements(
                &reference,
                "node-1",
                Role::Node,
                &obs(vec![]),
                Instant::now()
            ),
            Err(PolicyFailure::RegistryMismatch)
        );
    }
    assert_eq!(
        parsed.compare_entitlements(&good, "absent", Role::Node, &obs(vec![]), Instant::now()),
        Err(PolicyFailure::UnknownPolicy)
    );
    assert_eq!(
        parsed.compare_entitlements(
            &good,
            "node-1",
            Role::Launcher,
            &obs(vec![]),
            Instant::now()
        ),
        Err(PolicyFailure::RoleMismatch)
    );
    let mut changed = bytes.clone();
    changed.push(b' ');
    let parsed = parse(&changed, Instant::now()).unwrap();
    assert_eq!(
        parsed.compare_entitlements(&good, "node-1", Role::Node, &obs(vec![]), Instant::now()),
        Err(PolicyFailure::RegistryMismatch)
    );
}
#[test]
fn byte_limits_accept_64kib_and_reject_one_more() {
    let mut bytes = serde_json::to_vec(&document()).unwrap();
    bytes.resize(65536, b' ');
    assert!(parse(&bytes, Instant::now()).is_ok());
    bytes.push(b' ');
    assert_eq!(
        parse(&bytes, Instant::now()).unwrap_err(),
        PolicyFailure::Limit
    );
    assert_eq!(
        compare(
            document(),
            Role::Launcher,
            Observation {
                representation: Representation::Dictionary(vec![]),
                blob_bytes: 65536
            }
        )
        .unwrap()
        .key_count,
        0
    );
    assert_eq!(
        compare(
            document(),
            Role::Launcher,
            Observation {
                representation: Representation::Dictionary(vec![]),
                blob_bytes: 65537
            }
        ),
        Err(PolicyFailure::Limit)
    );
}
#[test]
fn count_limits_accept_32_policies_and_keys_reject_33() {
    let mut v = document();
    for i in 2..32 {
        let mut p = v["policies"][1].clone();
        p["id"] = json!(format!("node-{i}"));
        v["policies"].as_array_mut().unwrap().push(p);
    }
    assert!(parse(&serde_json::to_vec(&v).unwrap(), Instant::now()).is_ok());
    let p = v["policies"][1].clone();
    v["policies"].as_array_mut().unwrap().push(p);
    rejects(v);
    let mut v = document();
    let entries = v["policies"][1]["entitlement_expectation"]["entries"]
        .as_object_mut()
        .unwrap();
    entries.clear();
    for i in 0..32 {
        entries.insert(format!("KEY{i}"), json!({"type":"boolean","value":true}));
    }
    assert!(parse(&serde_json::to_vec(&v).unwrap(), Instant::now()).is_ok());
    v["policies"][1]["entitlement_expectation"]["entries"]["KEY33"] =
        json!({"type":"boolean","value":true});
    rejects(v);
    assert_eq!(
        compare(
            document(),
            Role::Node,
            obs((0..33)
                .map(|_| ("X", ObservedValue::Boolean(true)))
                .collect())
        ),
        Err(PolicyFailure::Limit)
    );
}
#[test]
fn key_and_id_byte_limits_and_control_characters_are_enforced() {
    for key in ["".to_string(), "x".repeat(129), "x\0".into(), "x\n".into()] {
        let mut v = document();
        v["policies"][1]["entitlement_expectation"]["entries"] =
            json!({key:{"type":"boolean","value":true}});
        rejects(v);
    }
    let mut v = document();
    v["registry_id"] = json!("x".repeat(128));
    assert!(parse(&serde_json::to_vec(&v).unwrap(), Instant::now()).is_ok());
    v["registry_id"] = json!("x".repeat(129));
    rejects(v);
}
#[test]
fn shared_deadline_rejects_expired_or_future_start() {
    let bytes = serde_json::to_vec(&document()).unwrap();
    for start in [
        Instant::now() - std::time::Duration::from_secs(10),
        Instant::now() + std::time::Duration::from_secs(100),
    ] {
        assert_eq!(parse(&bytes, start).unwrap_err(), PolicyFailure::Deadline);
    }
}
#[test]
fn comparison_does_not_reset_the_shared_deadline() {
    use sha2::{Digest, Sha256};
    let bytes = serde_json::to_vec(&document()).unwrap();
    let parsed = parse(&bytes, Instant::now()).unwrap();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let reference = RegistryReference {
        schema_version: "bp5-r2-signature-registry-0.1",
        registry_id: "test-registry-1",
        sha256: &hash,
    };
    assert_eq!(
        parsed.compare_entitlements(
            &reference,
            "launcher-1",
            Role::Launcher,
            &obs(vec![]),
            Instant::now() - std::time::Duration::from_secs(10)
        ),
        Err(PolicyFailure::Deadline)
    );
}
#[test]
fn maximum_key_bytes_match_without_normalization() {
    let key = "x".repeat(128);
    let mut v = document();
    v["policies"][1]["entitlement_expectation"]["entries"] =
        json!({key.clone():{"type":"boolean","value":true}});
    assert_eq!(
        compare(
            v,
            Role::Node,
            obs(vec![(&key, ObservedValue::Boolean(true))])
        )
        .unwrap()
        .key_count,
        1
    );
    assert_eq!(
        compare(
            document(),
            Role::Node,
            obs(vec![(&"x".repeat(129), ObservedValue::Boolean(true))])
        ),
        Err(PolicyFailure::Invalid)
    );
}
