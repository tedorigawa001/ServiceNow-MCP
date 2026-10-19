use super::*;
use serde_json::{Value, json};
use std::time::Instant;

pub(crate) const NOW: u64 = 1792368000000;
pub(crate) fn context() -> Context<'static> {
    Context {
        execution_uid: 501,
        reader_gid: 80,
        groups: &[80],
        product_version: "26.7",
        os_build: "TESTBUILD",
        started_wall_ms: NOW,
        now_wall_ms: NOW,
    }
}
fn date(ms: u64) -> String {
    chrono::DateTime::from_timestamp_millis(ms as i64)
        .unwrap()
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub(crate) fn hash(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
fn hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) struct Fixture {
    pub a: Vec<u8>,
    pub l: Vec<u8>,
    pub registry: Vec<u8>,
    pub ah: [u8; 32],
    pub rh: [u8; 32],
}
impl Fixture {
    pub fn pins(&self) -> Pins<'_> {
        Pins {
            activation_hash: &self.ah,
            registry_hash: &self.rh,
        }
    }
    fn pin_ledger(&mut self) {
        let mut a: Value = serde_json::from_slice(&self.a).unwrap();
        a["ledger_sha256"] = json!(hex(&self.l));
        self.a = serde_json::to_vec(&a).unwrap();
        self.ah = hash(&self.a);
    }
    fn ledger(&mut self, v: Value) {
        self.l = serde_json::to_vec(&v).unwrap();
        self.pin_ledger();
    }
    fn activation(&mut self, v: Value) {
        self.a = serde_json::to_vec(&v).unwrap();
        self.ah = hash(&self.a);
    }
}
pub(crate) fn fixture() -> Fixture {
    let policy = |role: &str| json!({"id":format!("{role}-1"),"role":role,"artifact_class":"mach_o_thin_arm64","requirement_template_id":"developer_id_application_v1","issuer":{"anchor":"apple_developer_id","certificate_class":"developer_id_application","team_id":"SYNTHETIC","signing_identifier":format!("test.{role}")},"expected_static_flags":65536,"entitlement_expectation":{"kind":"empty"}});
    let registry=serde_json::to_vec(&json!({"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic-registry","policies":[policy("launcher"),policy("node")]})).unwrap();
    let binary = |role: &str| json!({"path":format!("/release/bin/{role}"),"sha256":"a".repeat(64),"version":"1.2.3","signature_policy_id":format!("{role}-1")});
    let l=serde_json::to_vec(&json!({"schema_version":"bp5-r2-launch-ledger-0.2","policy_id":"bp5-r2-outer-macos-arm64-0.2","generation":1,"release_id":"synthetic","execution_uid":501,
        "platform":{"os":"darwin","arch":"arm64","product_version":"26.7","os_build":"TESTBUILD"},"launcher":binary("launcher"),"node":binary("node"),
        "signature_registry":{"schema_version":"bp5-r2-signature-registry-0.1","registry_id":"synthetic-registry","sha256":hex(&registry)},
        "runtime":{"root":"/release","cwd":"/release","entry_relative_path":"dist/review/r2-launcher-entry.js","index_path":"/release/index.json","index_sha256":"b".repeat(64)},"build_receipt_sha256":"c".repeat(64),"source_revision":"d".repeat(40),"lockfile_sha256":"e".repeat(64),"approved_at":date(NOW-1000),"expires_at":date(NOW+600000),"approval_ref":"SYNTHETIC"})).unwrap();
    let a=serde_json::to_vec(&json!({"schema_version":"bp5-r2-activation-0.1","generation":1,"execution_uid":501,"reader_gid":80,"ledger_path":"/private/synthetic-ledger.json","ledger_sha256":hex(&l),"release_id":"synthetic","artifact_index_sha256":"b".repeat(64),"approved_at":date(NOW-1000),"expires_at":date(NOW+600000),"approval_ref":"SYNTHETIC"})).unwrap();
    let ah = hash(&a);
    let rh = hash(&registry);
    Fixture {
        a,
        l,
        registry,
        ah,
        rh,
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stop {
    Deadline,
    Cancelled,
    Limit,
    Existing,
}
struct Synthetic {
    checks: usize,
    fail: usize,
    reason: Stop,
    first: Option<Stop>,
    work: u64,
    cap: u64,
}
impl Default for Synthetic {
    fn default() -> Self {
        Self {
            checks: 0,
            fail: usize::MAX,
            reason: Stop::Deadline,
            first: None,
            work: 0,
            cap: 1_000_000,
        }
    }
}
impl Budget for Synthetic {
    type Failure = Stop;
    fn checkpoint(&mut self) -> Result<(), Stop> {
        self.checks += 1;
        if self.checks == self.fail && self.first.is_none() {
            self.first = Some(self.reason);
        }
        self.first.map_or(Ok(()), Err)
    }
    fn work(&mut self, n: u64) -> Result<(), Stop> {
        self.checkpoint()?;
        let Some(total) = self.work.checked_add(n).filter(|v| *v <= self.cap) else {
            self.first = Some(Stop::Limit);
            return Err(Stop::Limit);
        };
        self.work = total;
        Ok(())
    }
}
fn run(f: &Fixture, b: &mut Synthetic) -> Result<ValidatedRecords, Rejection<Stop>> {
    validate(&f.a, &f.l, &f.registry, &f.pins(), &context(), b)
}
fn reason(e: Rejection<Stop>) -> Option<Stop> {
    match e {
        Rejection::Budget(e) | Rejection::Json(shared::Rejection::Budget(e)) => Some(e),
        _ => None,
    }
}
#[test]
fn strict_valid_records_use_same_meaning_as_public_ledger_and_registry() {
    let f = fixture();
    let result = run(&f, &mut Synthetic::default()).unwrap();
    assert_eq!(
        format!("{result:?}"),
        "ValidatedRecords(pure_pending_reader_closure_lease_not_execution_authority)"
    );
    let r = signature_policy::parse(&f.registry, Instant::now()).unwrap();
    let digest = hex(&f.l);
    let c = crate::ledger_v2::Context {
        ledger_sha256: &digest,
        generation: 1,
        release_id: "synthetic",
        execution_uid: 501,
        index_sha256: &"b".repeat(64),
        product_version: "26.7",
        os_build: "TESTBUILD",
        start_wall_ms: NOW,
    };
    assert_eq!(
        crate::ledger_v2::parse_and_bind(&f.l, &r, &c, Instant::now())
            .unwrap()
            .bound_policies,
        2
    );
}
#[test]
fn hash_first_rejects_malformed_unpinned_bytes_for_all_three_types() {
    for kind in 0..3 {
        let mut f = fixture();
        match kind {
            0 => f.a = b"{".to_vec(),
            1 => f.l = b"{".to_vec(),
            _ => f.registry = b"{".to_vec(),
        };
        assert_eq!(
            run(&f, &mut Synthetic::default()).unwrap_err(),
            Rejection::Binding
        );
    }
}
#[test]
fn authenticated_malformed_json_is_a_typed_json_failure() {
    for kind in 0..3 {
        let mut f = fixture();
        match kind {
            0 => {
                f.a = b"{".to_vec();
                f.ah = hash(&f.a);
            }
            1 => {
                f.l = b"{".to_vec();
                f.pin_ledger();
            }
            _ => {
                f.registry = b"{".to_vec();
                f.rh = hash(&f.registry);
            }
        };
        assert_eq!(
            run(&f, &mut Synthetic::default()).unwrap_err(),
            Rejection::Json(shared::Rejection::InvalidRecord)
        );
    }
}
#[test]
fn activation_unknown_duplicate_missing_and_legacy_schema_are_rejected() {
    for case in 0..4 {
        let mut f = fixture();
        let mut a: Value = serde_json::from_slice(&f.a).unwrap();
        match case {
            0 => a["unknown"] = json!(true),
            1 => {
                a.as_object_mut().unwrap().remove("reader_gid");
            }
            2 => a["schema_version"] = json!("old"),
            _ => {
                let s = String::from_utf8(f.a.clone()).unwrap().replacen(
                    "\"generation\":1",
                    "\"generation\":1,\"generation\":1",
                    1,
                );
                f.a = s.into_bytes();
                f.ah = hash(&f.a);
            }
        };
        if case != 3 {
            f.activation(a);
        }
        assert!(matches!(
            run(&f, &mut Synthetic::default()),
            Err(Rejection::InvalidRecord | Rejection::Json(shared::Rejection::InvalidRecord))
        ));
    }
}
#[test]
fn ledger_schema_unknown_fields_and_legacy_binary_shape_are_not_upgraded() {
    for case in 0..4 {
        let mut f = fixture();
        let mut l: Value = serde_json::from_slice(&f.l).unwrap();
        match case {
            0 => l["schema_version"] = json!("bp5-r2-launch-ledger-0.1"),
            1 => l["node"]["publisher"] = json!("old"),
            2 => l["runtime"]["unknown"] = json!(true),
            _ => l["node"]["path"] = json!("/release/../outside"),
        };
        f.ledger(l);
        assert!(matches!(
            run(&f, &mut Synthetic::default()),
            Err(Rejection::InvalidRecord | Rejection::Json(shared::Rejection::InvalidRecord))
        ));
    }
}
#[test]
fn activation_identity_and_membership_are_bound_to_context() {
    let f = fixture();
    for case in 0..3 {
        let mut c = context();
        match case {
            0 => c.execution_uid = 502,
            1 => c.reader_gid = 81,
            _ => c.groups = &[81],
        };
        assert_eq!(
            validate(
                &f.a,
                &f.l,
                &f.registry,
                &f.pins(),
                &c,
                &mut Synthetic::default()
            )
            .unwrap_err(),
            Rejection::Binding
        );
    }
}
#[test]
fn ledger_generation_release_uid_platform_and_index_stay_bound() {
    for case in 0..6 {
        let mut f = fixture();
        let mut l: Value = serde_json::from_slice(&f.l).unwrap();
        match case {
            0 => l["generation"] = json!(2),
            1 => l["release_id"] = json!("other"),
            2 => l["execution_uid"] = json!(502),
            3 => l["platform"]["product_version"] = json!("26.8"),
            4 => l["platform"]["os_build"] = json!("OTHER"),
            _ => l["runtime"]["index_sha256"] = json!("f".repeat(64)),
        };
        f.ledger(l);
        assert_eq!(
            run(&f, &mut Synthetic::default()).unwrap_err(),
            Rejection::Binding
        );
    }
}
#[test]
fn registry_reference_id_digest_schema_and_both_roles_are_checked() {
    for case in 0..7 {
        let mut f = fixture();
        let mut l: Value = serde_json::from_slice(&f.l).unwrap();
        match case {
            0 => l["signature_registry"]["registry_id"] = json!("other"),
            1 => l["signature_registry"]["sha256"] = json!("f".repeat(64)),
            2 => l["signature_registry"]["schema_version"] = json!("old"),
            3 => l["launcher"]["signature_policy_id"] = json!("node-1"),
            4 => l["node"]["signature_policy_id"] = json!("launcher-1"),
            5 => l["launcher"]["signature_policy_id"] = json!("unknown"),
            _ => l["node"]["signature_policy_id"] = json!("unknown"),
        };
        f.ledger(l);
        assert!(matches!(
            run(&f, &mut Synthetic::default()),
            Err(Rejection::Policy(_) | Rejection::InvalidRecord)
        ));
    }
}
#[test]
fn registry_semantics_match_legacy_rejections_without_accepting_new_policy() {
    for case in 0..5 {
        let mut f = fixture();
        let mut r: Value = serde_json::from_slice(&f.registry).unwrap();
        match case {
            0 => r["policies"][0]["issuer"]["anchor"] = json!("unknown"),
            1 => r["policies"][1]["id"] = r["policies"][0]["id"].clone(),
            2 => r["policies"][0]["expected_static_flags"] = json!(0),
            3 => r["policies"][1]["issuer"]["team_id"] = json!("lower"),
            _ => {
                r["policies"][0]["entitlement_expectation"] = json!({"kind":"dictionary","entries":{"com.apple.security.test":{"type":"boolean","value":true}}})
            }
        };
        f.registry = serde_json::to_vec(&r).unwrap();
        f.rh = hash(&f.registry);
        assert!(signature_policy::parse(&f.registry, Instant::now()).is_err());
        assert_eq!(
            run(&f, &mut Synthetic::default()).unwrap_err(),
            Rejection::Policy(PolicyFailure::Invalid)
        );
    }
}
#[test]
fn byte_caps_and_json_depth_limits_retain_distinct_reasons() {
    for kind in 0..3 {
        let mut f = fixture();
        match kind {
            0 => {
                f.a.resize(65536, b' ');
                f.ah = hash(&f.a);
            }
            1 => {
                f.l.resize(65536, b' ');
                f.pin_ledger();
            }
            _ => {
                f.registry.resize(65536, b' ');
                f.rh = hash(&f.registry);
                let mut l: Value = serde_json::from_slice(&f.l).unwrap();
                l["signature_registry"]["sha256"] = json!(hex(&f.registry));
                f.ledger(l);
            }
        };
        assert!(run(&f, &mut Synthetic::default()).is_ok());
        match kind {
            0 => f.a.push(b' '),
            1 => f.l.push(b' '),
            _ => f.registry.push(b' '),
        };
        assert_eq!(
            run(&f, &mut Synthetic::default()).unwrap_err(),
            Rejection::Limit
        );
    }
    let mut f = fixture();
    f.a = format!("{}0{}", "[".repeat(17), "]".repeat(17)).into_bytes();
    f.ah = hash(&f.a);
    assert_eq!(
        run(&f, &mut Synthetic::default()).unwrap_err(),
        Rejection::Json(shared::Rejection::Limit(shared::Limit::Depth))
    );
}
#[test]
fn registry_container_limit_is_not_collapsed_into_invalid() {
    let mut f = fixture();
    let mut r: Value = serde_json::from_slice(&f.registry).unwrap();
    r["policies"] = json!(vec![r["policies"][0].clone(); 33]);
    f.registry = serde_json::to_vec(&r).unwrap();
    f.rh = hash(&f.registry);
    assert_eq!(
        run(&f, &mut Synthetic::default()).unwrap_err(),
        Rejection::Json(shared::Rejection::Limit(shared::Limit::Container))
    );
}
#[test]
fn expiration_and_approval_errors_remain_distinct() {
    for ledger in [false, true] {
        for case in 0..3 {
            let mut f = fixture();
            let mut v: Value = serde_json::from_slice(if ledger { &f.l } else { &f.a }).unwrap();
            match case {
                0 => v["expires_at"] = json!(date(NOW + 460000)),
                1 => v["approved_at"] = json!(date(NOW + 1)),
                _ => v["expires_at"] = json!("bad"),
            };
            if ledger {
                f.ledger(v);
            } else {
                f.activation(v);
            }
            assert_eq!(
                run(&f, &mut Synthetic::default()).unwrap_err(),
                if case == 0 {
                    Rejection::Expired
                } else {
                    Rejection::InvalidRecord
                }
            );
        }
    }
}
#[test]
fn revalidation_uses_original_admission_and_current_final_margin_without_double_counting() {
    let mut f = fixture();
    let mut a: Value = serde_json::from_slice(&f.a).unwrap();
    a["expires_at"] = json!(date(NOW + 460001));
    f.activation(a);
    let mut l: Value = serde_json::from_slice(&f.l).unwrap();
    l["expires_at"] = json!(date(NOW + 460001));
    f.ledger(l);
    let mut c = context();
    c.now_wall_ms = NOW + 5000;
    assert!(
        validate(
            &f.a,
            &f.l,
            &f.registry,
            &f.pins(),
            &c,
            &mut Synthetic::default()
        )
        .is_ok()
    );
    c.now_wall_ms = NOW + 10001;
    assert_eq!(
        validate(
            &f.a,
            &f.l,
            &f.registry,
            &f.pins(),
            &c,
            &mut Synthetic::default()
        )
        .unwrap_err(),
        Rejection::Expired
    );
    c.now_wall_ms = NOW - 1;
    assert_eq!(
        validate(
            &f.a,
            &f.l,
            &f.registry,
            &f.pins(),
            &c,
            &mut Synthetic::default()
        )
        .unwrap_err(),
        Rejection::Binding
    );
}
#[test]
fn every_budget_checkpoint_preserves_deadline_and_cancel_across_all_layers() {
    let f = fixture();
    let mut normal = Synthetic::default();
    run(&f, &mut normal).unwrap();
    assert!(normal.checks > 100);
    for stop in [Stop::Deadline, Stop::Cancelled] {
        for n in 1..=normal.checks {
            let mut b = Synthetic {
                fail: n,
                reason: stop,
                ..Synthetic::default()
            };
            assert_eq!(reason(run(&f, &mut b).unwrap_err()), Some(stop));
        }
    }
}
#[test]
fn accumulated_work_limits_and_overflow_survive_semantic_and_json_boundaries() {
    let f = fixture();
    let mut normal = Synthetic::default();
    run(&f, &mut normal).unwrap();
    for cap in [0, 1, 10, normal.work - 1] {
        let mut b = Synthetic {
            cap,
            ..Synthetic::default()
        };
        assert_eq!(reason(run(&f, &mut b).unwrap_err()), Some(Stop::Limit));
    }
    let mut b = Synthetic {
        cap: normal.work,
        ..Synthetic::default()
    };
    run(&f, &mut b).unwrap();
    assert_eq!(reason(run(&f, &mut b).unwrap_err()), Some(Stop::Limit));
    let mut b = Synthetic {
        work: u64::MAX,
        cap: u64::MAX,
        ..Synthetic::default()
    };
    assert_eq!(reason(run(&f, &mut b).unwrap_err()), Some(Stop::Limit));
}
#[test]
fn existing_stop_wins_over_hash_mismatch_and_invalid_json() {
    let mut f = fixture();
    f.a = b"{".to_vec();
    let mut b = Synthetic {
        first: Some(Stop::Existing),
        ..Synthetic::default()
    };
    assert_eq!(reason(run(&f, &mut b).unwrap_err()), Some(Stop::Existing));
    assert_eq!(b.work, 0);
}
