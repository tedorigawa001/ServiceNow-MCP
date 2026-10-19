use super::*;
use serde_json::{Value, json};

pub(crate) struct Fixture {
    pub bytes: Vec<u8>,
    pub hash: String,
    pub observed: Vec<Entry>,
}
impl Fixture {
    pub fn binding(&self) -> Binding<'_> {
        Binding {
            release_id: "synthetic",
            generation: 1,
            index_sha256: &self.hash,
            index_path: "index.json",
            node_path: "node",
        }
    }
}
fn document() -> Value {
    json!({"schema_version":"bp5-r2-closure-index-0.1","release_id":"synthetic","generation":1,"entries":[
    {"kind":"directory","path":"dist","mode":"0555"}, {"kind":"directory","path":"dist/review","mode":"0555"},
    {"kind":"file","path":"dist/review/r2-launcher-entry.js","mode":"0444","size":1,"sha256":"a".repeat(64)},
    {"kind":"file","path":"node","mode":"0555","size":1,"sha256":"b".repeat(64)}]})
}
fn from_value(v: Value) -> Fixture {
    let bytes = serde_json::to_vec(&v).unwrap();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let mut observed: Vec<Entry> = serde_json::from_value(v["entries"].clone())
        .unwrap_or_else(|_| serde_json::from_value(document()["entries"].clone()).unwrap());
    observed.push(Entry::File {
        path: "index.json".into(),
        mode: "0444".into(),
        size: bytes.len() as u64,
        sha256: hash.clone(),
    });
    Fixture {
        bytes,
        hash,
        observed,
    }
}
pub(crate) fn fixture() -> Fixture {
    from_value(document())
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
fn run(f: &Fixture, b: &mut Synthetic) -> Result<Comparison, Rejection<Stop>> {
    check(&f.bytes, &f.binding(), &f.observed, b)
}
fn budget_reason(e: Rejection<Stop>) -> Option<Stop> {
    match e {
        Rejection::Budget(e) | Rejection::Json(json::Rejection::Budget(e)) => Some(e),
        _ => None,
    }
}
#[test]
fn valid_complete_set_and_unordered_observations_match_legacy_counts() {
    let mut f = fixture();
    f.observed.reverse();
    let out = run(&f, &mut Synthetic::default()).unwrap();
    let old = super::super::check(&f.bytes, &f.binding(), &f.observed, Instant::now()).unwrap();
    assert_eq!(out.checked.entries, old.entries);
    assert_eq!(out.checked.file_bytes, old.file_bytes);
    assert_eq!(
        format!("{out:?}"),
        "ClosureComparison(pure_pending_observation_producer_lease_not_execution_authority)"
    );
}
#[test]
fn declaration_is_validated_but_never_claims_an_observation() {
    let f = fixture();
    let declaration = declared(&f.bytes, &f.binding(), &mut Synthetic::default()).unwrap();
    assert_eq!(declaration.entries.len(), 4);
    assert_eq!(
        format!("{declaration:?}"),
        "ClosureDeclaration(pure_not_observation_or_execution_authority)"
    );
    assert_eq!(
        check(&f.bytes, &f.binding(), &[], &mut Synthetic::default()).unwrap_err(),
        Rejection::Closure(ClosureFailure::Set)
    );
}
#[test]
fn shared_hash_first_rejects_unauthenticated_invalid_json_before_decode() {
    let f = fixture();
    for bytes in [b"{".as_slice(), b"\xff", br#"{"schema_version":"unknown"}"#] {
        assert_eq!(
            check(bytes, &f.binding(), &[], &mut Synthetic::default()).unwrap_err(),
            Rejection::Closure(ClosureFailure::Binding)
        );
        assert_eq!(
            declared(bytes, &f.binding(), &mut Synthetic::default()).unwrap_err(),
            Rejection::Closure(ClosureFailure::Binding)
        );
    }
}
#[test]
fn authenticated_invalid_json_and_legacy_failure_order_are_distinct() {
    let mut f = fixture();
    f.bytes = b"{".to_vec();
    assert_eq!(
        super::super::check(&f.bytes, &f.binding(), &[], Instant::now()).unwrap_err(),
        ClosureFailure::Invalid
    );
    f.hash = format!("{:x}", Sha256::digest(&f.bytes));
    assert_eq!(
        run(&f, &mut Synthetic::default()).unwrap_err(),
        Rejection::Json(json::Rejection::InvalidRecord)
    );
}
#[test]
fn strict_json_unknown_duplicate_utf8_and_trailing_are_not_accepted() {
    let f = fixture();
    let text = String::from_utf8(f.bytes).unwrap();
    for bytes in [
        text.replacen("\"generation\":1", "\"generation\":1,\"generation\":1", 1)
            .into_bytes(),
        text.replacen(
            "\"mode\":\"0555\"",
            "\"mode\":\"0555\",\"mode\":\"0555\"",
            1,
        )
        .into_bytes(),
        [text.as_bytes(), b" {}"].concat(),
        vec![0xff],
    ] {
        let mut f = fixture();
        f.bytes = bytes;
        f.hash = format!("{:x}", Sha256::digest(&f.bytes));
        assert_eq!(
            run(&f, &mut Synthetic::default()).unwrap_err(),
            Rejection::Json(json::Rejection::InvalidRecord)
        );
    }
    for case in 0..3 {
        let mut v = document();
        match case {
            0 => v["unknown"] = json!(true),
            1 => v["entries"][0]["size"] = json!(1),
            _ => {
                v.as_object_mut().unwrap().remove("generation");
            }
        };
        assert_eq!(
            run(&from_value(v), &mut Synthetic::default()).unwrap_err(),
            Rejection::Json(json::Rejection::InvalidRecord)
        );
    }
}
#[test]
fn schema_release_generation_and_binding_fields_are_strict() {
    for (key, value) in [
        ("schema_version", json!("old")),
        ("generation", json!(0)),
        ("release_id", json!("other")),
        ("generation", json!(2)),
    ] {
        let mut v = document();
        v[key] = value;
        assert!(matches!(
            run(&from_value(v), &mut Synthetic::default()),
            Err(Rejection::Closure(
                ClosureFailure::Invalid | ClosureFailure::Binding
            ))
        ));
    }
    let f = fixture();
    for case in 0..4 {
        let mut b = f.binding();
        match case {
            0 => b.index_path = "node",
            1 => b.index_path = "../index",
            2 => b.node_path = "dist/review/r2-launcher-entry.js",
            _ => b.index_sha256 = "NOT_HEX",
        };
        let legacy = super::super::check(&f.bytes, &b, &f.observed, Instant::now()).unwrap_err();
        assert_eq!(
            check(&f.bytes, &b, &f.observed, &mut Synthetic::default()).unwrap_err(),
            Rejection::Closure(legacy)
        );
    }
}
#[test]
fn traversal_native_suffix_and_invalid_modes_remain_rejected() {
    for path in [
        "/absolute",
        "../escape",
        "a/../x",
        "a//b",
        "a/./b",
        "a\\b",
        "a%2fb",
        "é",
        "a\0b",
        "",
    ] {
        let mut v = document();
        v["entries"][2]["path"] = json!(path);
        assert_eq!(
            run(&from_value(v), &mut Synthetic::default()).unwrap_err(),
            Rejection::Closure(ClosureFailure::Invalid)
        );
    }
    for path in ["addon.NODE", "addon.dylib", "addon.so", "addon.dll"] {
        let mut v = document();
        v["entries"].as_array_mut().unwrap().insert(
            0,
            json!({"kind":"file","path":path,"mode":"0444","size":1,"sha256":"a".repeat(64)}),
        );
        assert_eq!(
            run(&from_value(v), &mut Synthetic::default()).unwrap_err(),
            Rejection::Closure(ClosureFailure::Invalid)
        );
    }
    let mut v = document();
    v["entries"][2]["mode"] = json!("4755");
    assert!(run(&from_value(v), &mut Synthetic::default()).is_err());
}
#[test]
fn parents_case_order_duplicates_and_self_index_are_checked() {
    for case in 0..6 {
        let mut v = document();
        let entries = v["entries"].as_array_mut().unwrap();
        match case{0=>{entries.remove(1);},1=>entries.swap(0,1),2=>{let e=entries[0].clone();entries.insert(0,e);},3=>entries.insert(0,json!({"kind":"directory","path":"DIST","mode":"0555"})),4=>entries.insert(3,json!({"kind":"file","path":"index.json","mode":"0444","size":1,"sha256":"a".repeat(64)})),_=>{entries.remove(2);}};
        let f = from_value(v);
        assert!(run(&f, &mut Synthetic::default()).is_err());
        assert!(declared(&f.bytes, &f.binding(), &mut Synthetic::default()).is_err());
    }
}
#[test]
fn every_non_node_and_index_observation_must_match_exactly() {
    for case in 0..8 {
        let mut f = fixture();
        match case {
            0 => {
                f.observed.remove(2);
            }
            1 => f.observed.push(Entry::Directory {
                path: "extra".into(),
                mode: "0555".into(),
            }),
            2 => {
                let e = f.observed[0].clone();
                f.observed.push(e);
            }
            3 => {
                if let Entry::File { sha256, .. } = &mut f.observed[2] {
                    *sha256 = "c".repeat(64)
                }
            }
            4 => {
                if let Entry::File { size, .. } = &mut f.observed[2] {
                    *size += 1
                }
            }
            5 => {
                f.observed.pop();
            }
            6 => {
                if let Entry::File { sha256, .. } = f.observed.last_mut().unwrap() {
                    *sha256 = "c".repeat(64)
                }
            }
            _ => {
                f.observed[2] = Entry::Directory {
                    path: "dist/review/r2-launcher-entry.js".into(),
                    mode: "0555".into(),
                }
            }
        };
        assert_eq!(
            run(&f, &mut Synthetic::default()).unwrap_err(),
            Rejection::Closure(ClosureFailure::Set)
        );
    }
}
#[test]
fn exact_declared_total_includes_index_and_overflow_is_limit() {
    let mut v = document();
    v["entries"][3]["size"] = json!(MAX_FILE_BYTES - 1000);
    let len = serde_json::to_vec(&v).unwrap().len() as u64;
    v["entries"][3]["size"] = json!(MAX_FILE_BYTES - len - 1);
    let f = from_value(v.clone());
    assert_eq!(f.bytes.len() as u64, len);
    assert_eq!(
        run(&f, &mut Synthetic::default())
            .unwrap()
            .checked
            .file_bytes,
        MAX_FILE_BYTES
    );
    v["entries"][3]["size"] = json!(MAX_FILE_BYTES - len);
    assert_eq!(
        run(&from_value(v), &mut Synthetic::default()).unwrap_err(),
        Rejection::Closure(ClosureFailure::Limit)
    );
}
#[test]
fn byte_bound_accepts_exact_16mib_and_rejects_one_more_before_hash() {
    let mut f = fixture();
    f.bytes.resize(MAX_BYTES, b' ');
    f.hash = format!("{:x}", Sha256::digest(&f.bytes));
    if let Entry::File { size, sha256, .. } = f.observed.last_mut().unwrap() {
        *size = f.bytes.len() as u64;
        *sha256 = f.hash.clone();
    }
    assert!(run(&f, &mut Synthetic::default()).is_ok());
    f.bytes.push(b' ');
    assert_eq!(
        run(&f, &mut Synthetic::default()).unwrap_err(),
        Rejection::Closure(ClosureFailure::Limit)
    );
}
#[test]
fn observed_count_guard_runs_before_maps_or_json() {
    let mut f = fixture();
    f.bytes = b"{".to_vec();
    f.observed = vec![
        Entry::Directory {
            path: "x".into(),
            mode: "0555".into()
        };
        MAX_ENTRIES + 2
    ];
    let mut b = Synthetic::default();
    assert_eq!(
        run(&f, &mut b).unwrap_err(),
        Rejection::Closure(ClosureFailure::Limit)
    );
    assert_eq!(b.work, 1);
}
#[test]
fn depth_and_container_overflow_keep_json_limit_kind() {
    for bytes in [
        format!("{}0{}", "[".repeat(17), "]".repeat(17)).into_bytes(),
        format!(
            "{{\"entries\":[{}]}}",
            vec!["null"; MAX_ENTRIES + 1].join(",")
        )
        .into_bytes(),
    ] {
        let mut f = fixture();
        f.bytes = bytes;
        f.hash = format!("{:x}", Sha256::digest(&f.bytes));
        assert!(matches!(
            run(&f, &mut Synthetic::default()),
            Err(Rejection::Json(json::Rejection::Limit(_)))
        ));
    }
}
#[test]
fn complete_work_is_shared_and_limits_are_not_flattened() {
    let f = fixture();
    let mut normal = Synthetic::default();
    run(&f, &mut normal).unwrap();
    for cap in [0, 1, 10, normal.work - 1] {
        let mut b = Synthetic {
            cap,
            ..Synthetic::default()
        };
        assert_eq!(
            budget_reason(run(&f, &mut b).unwrap_err()),
            Some(Stop::Limit)
        );
    }
    let mut b = Synthetic {
        cap: normal.work,
        ..Synthetic::default()
    };
    run(&f, &mut b).unwrap();
    assert_eq!(
        budget_reason(run(&f, &mut b).unwrap_err()),
        Some(Stop::Limit)
    );
    let mut b = Synthetic {
        work: u64::MAX,
        cap: u64::MAX,
        ..Synthetic::default()
    };
    assert_eq!(
        budget_reason(run(&f, &mut b).unwrap_err()),
        Some(Stop::Limit)
    );
}
#[test]
fn each_check_and_declaration_checkpoint_preserves_deadline_and_cancel() {
    let f = fixture();
    for declaration in [false, true] {
        let mut normal = Synthetic::default();
        if declaration {
            declared(&f.bytes, &f.binding(), &mut normal).unwrap();
        } else {
            run(&f, &mut normal).unwrap();
        }
        assert!(normal.checks > 100);
        for stop in [Stop::Deadline, Stop::Cancelled] {
            for n in 1..=normal.checks {
                let mut b = Synthetic {
                    fail: n,
                    reason: stop,
                    ..Synthetic::default()
                };
                let e = if declaration {
                    declared(&f.bytes, &f.binding(), &mut b).unwrap_err()
                } else {
                    run(&f, &mut b).unwrap_err()
                };
                assert_eq!(budget_reason(e), Some(stop));
            }
        }
    }
}
#[test]
fn maximal_path_depth_does_not_skip_parent_checks() {
    let mut v = document();
    let entries = v["entries"].as_array_mut().unwrap();
    let mut p = String::new();
    for _ in 0..64 {
        if !p.is_empty() {
            p.push('/');
        }
        p.push('z');
        entries.push(json!({"kind":"directory","path":p,"mode":"0555"}));
    }
    assert!(run(&from_value(v.clone()), &mut Synthetic::default()).is_ok());
    v["entries"].as_array_mut().unwrap().last_mut().unwrap()["path"] = json!(format!("{p}/z"));
    assert!(run(&from_value(v), &mut Synthetic::default()).is_err());
}
#[test]
fn existing_failure_precedes_hash_and_limit_guards() {
    let mut f = fixture();
    f.bytes = b"{".to_vec();
    let mut b = Synthetic {
        first: Some(Stop::Existing),
        ..Synthetic::default()
    };
    assert_eq!(
        budget_reason(run(&f, &mut b).unwrap_err()),
        Some(Stop::Existing)
    );
    assert_eq!(b.work, 0);
}
