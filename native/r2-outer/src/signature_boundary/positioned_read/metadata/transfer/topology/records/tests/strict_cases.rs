use super::super::strict::*;
use super::*;
use crate::{closure::Entry, record_validation::tests as fixtures};
use serde_json::{Value, json};

struct Data {
    f: fixtures::Fixture,
    index: Vec<u8>,
    observed: Vec<Entry>,
    node: Vec<u8>,
    groups: Vec<u32>,
    interrupt: Option<(usize, bool)>,
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
impl Data {
    fn new() -> Self {
        let node = physical_signature::synthetic_file(true, false, 4096, 48);
        let entries = json!([
            {"kind":"directory","path":"bin","mode":"0555"},
            {"kind":"file","path":"bin/node","mode":"0555","size":node.len(),"sha256":digest(&node)},
            {"kind":"directory","path":"dist","mode":"0555"},
            {"kind":"directory","path":"dist/review","mode":"0555"},
            {"kind":"file","path":"dist/review/r2-launcher-entry.js","mode":"0444","size":1,"sha256":"a".repeat(64)}
        ]);
        let index = serde_json::to_vec(&json!({"schema_version":"bp5-r2-closure-index-0.1","release_id":"synthetic","generation":1,"entries":entries})).unwrap();
        let mut observed: Vec<Entry> = serde_json::from_value(entries).unwrap();
        observed.push(Entry::File {
            path: "index.json".into(),
            mode: "0444".into(),
            size: index.len() as u64,
            sha256: digest(&index),
        });
        let mut data = Self {
            f: fixtures::fixture(),
            index,
            observed,
            node,
            groups: vec![80],
            interrupt: None,
        };
        let mut l: Value = serde_json::from_slice(&data.f.l).unwrap();
        l["node"]["sha256"] = json!(digest(&data.node));
        data.f.l = serde_json::to_vec(&l).unwrap();
        data.repin();
        data
    }
    fn repin(&mut self) {
        let mut l: Value = serde_json::from_slice(&self.f.l).unwrap();
        l["runtime"]["index_sha256"] = json!(digest(&self.index));
        l["signature_registry"]["sha256"] = json!(digest(&self.f.registry));
        self.f.l = serde_json::to_vec(&l).unwrap();
        let mut a: Value = serde_json::from_slice(&self.f.a).unwrap();
        a["artifact_index_sha256"] = json!(digest(&self.index));
        a["ledger_sha256"] = json!(digest(&self.f.l));
        self.f.a = serde_json::to_vec(&a).unwrap();
        self.f.ah = fixtures::hash(&self.f.a);
        self.f.rh = fixtures::hash(&self.f.registry);
    }
}
#[derive(Default)]
struct ScanCounts {
    rounds: RefCell<Vec<Round>>,
    phases: RefCell<Vec<Vec<Phase>>>,
    work: RefCell<Vec<u64>>,
    dropped: Cell<bool>,
}
struct Scanner {
    c: Rc<ScanCounts>,
    target: Rc<TargetCounts>,
    entries: Vec<Entry>,
    change: usize,
    at: usize,
    fail: Option<Failure>,
    stop: Rc<AtomicBool>,
    tick: Rc<Cell<Instant>>,
    start: Instant,
}
impl ClosureSource for Scanner {
    fn scan(
        &mut self,
        q: ClosureRequest<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<ClosureObservation, Failure> {
        b.checkpoint()?;
        self.c.rounds.borrow_mut().push(q.round);
        self.c
            .phases
            .borrow_mut()
            .push(self.target.phases.borrow().clone());
        self.c.work.borrow_mut().push(b.json_work);
        assert_eq!(q.entries.len(), 5);
        // Synthetic producer has no filesystem activity. No hidden I/O credit is claimed.
        if self.c.rounds.borrow().len() == self.at {
            if let Some(f) = self.fail {
                return Err(f);
            }
            if self.change == 8 {
                self.stop.store(true, Ordering::Release);
            }
            if self.change == 9 {
                self.tick.set(self.start + Duration::from_secs(10));
            }
            if self.change == 10 {
                b.json_work = 1_000_000;
            }
            if self.change == 11 {
                self.tick.set(self.start + Duration::from_secs(5));
            }
        }
        let mut result = ClosureObservation {
            lineage: q.lineage.clone(),
            records: q.records.clone(),
            round: q.round,
            entries: self.entries.clone(),
        };
        if self.c.rounds.borrow().len() == self.at {
            match self.change {
                1 => {
                    result.entries.pop();
                }
                2 => result.entries.push(result.entries[0].clone()),
                3 => {
                    if let Entry::File { sha256, .. } = &mut result.entries[4] {
                        *sha256 = "f".repeat(64);
                    }
                }
                4 => result.lineage = Rc::new(()),
                5 => result.records.generation += 1,
                6 => {
                    result.round = if q.round == Round::Initial {
                        Round::BeforeM4
                    } else {
                        Round::Initial
                    }
                }
                7 => result.records.runtime_root.push('x'),
                _ => {}
            }
        }
        Ok(result)
    }
}
impl Drop for Scanner {
    fn drop(&mut self) {
        self.c.dropped.set(true);
    }
}
struct ResultData {
    result: Result<RecordComparison, Failure>,
    failed: Option<Failure>,
    source: Rc<Counts>,
    target: Rc<TargetCounts>,
    scan: Rc<ScanCounts>,
    work: u64,
    used: u64,
    checks: usize,
}
fn execute(
    data: Data,
    change: impl FnOnce(&mut RecordReceipt, &mut Fake, &mut Scanner, &mut SharedBudget<'_>),
) -> ResultData {
    let start = Instant::now();
    let now = Rc::new(Cell::new(start));
    let cancel = Rc::new(AtomicBool::new(false));
    let checks = Cell::new(0usize);
    let clock = || {
        let n = checks.get() + 1;
        checks.set(n);
        if let Some((at, cancelled)) = data.interrupt
            && n >= at
        {
            if cancelled {
                cancel.store(true, Ordering::Release);
            } else {
                return start + Duration::from_secs(10);
            }
        }
        now.get()
    };
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &clock;
    let c = Rc::new(Counts::default());
    let tc = Rc::new(TargetCounts::default());
    let sc = Rc::new(ScanCounts::default());
    let lineage = Rc::new(());
    let mut binding = records();
    binding.ledger_path = "/private/synthetic-ledger.json".into();
    binding.index_path = "/release/index.json".into();
    binding.runtime_root = "/release".into();
    binding.release = "synthetic".into();
    binding.node_policy = "node-1".into();
    binding.product_version = "26.7".into();
    binding.os_build = "TESTBUILD".into();
    binding.start_wall_ms = fixtures::NOW;
    binding.approved_wall_ms = fixtures::NOW - 1000;
    binding.activation_expires_ms = fixtures::NOW + 600000;
    binding.ledger_expires_ms = fixtures::NOW + 600000;
    let mut receipt = make_receipt(&mut binding, &lineage);
    for (i, bytes) in [data.f.a, data.f.l, data.index].into_iter().enumerate() {
        receipt.pins[i].leaf.stat.size = bytes.len() as u64;
        receipt.pins[i].bytes = bytes;
    }
    binding.activation_hash = fixtures::hash(&receipt.pins[0].bytes);
    binding.ledger_hash = fixtures::hash(&receipt.pins[1].bytes);
    binding.index_hash = fixtures::hash(&receipt.pins[2].bytes);
    binding.registry_hash = fixtures::hash(&data.f.registry);
    if let Ok(a) = serde_json::from_slice::<crate::schema::Activation>(&receipt.pins[0].bytes)
        && let Ok((approved, expires)) = a.time().inspection_bounds()
    {
        binding.approved_wall_ms = approved;
        binding.activation_expires_ms = expires;
    }
    if let Ok(l) = serde_json::from_slice::<crate::schema::LedgerV2>(&receipt.pins[1].bytes)
        && let Ok((_, expires)) = l.time().inspection_bounds()
    {
        binding.ledger_expires_ms = expires;
    }
    receipt.binding = binding.clone();
    let mut t = target();
    t.path = "/release/bin/node".into();
    t.policy = "node-1".into();
    t.ledger_hash = fixtures::hash(&data.node);
    t.index_hash = t.ledger_hash;
    t.size = SizeEvidence::Indexed(data.node.len() as u64);
    let bound = bind(&binding, &lineage, &t).unwrap_or_else(|_| panic!("bind"));
    let (open, topology, topology_source) = setup(&bound, &tc);
    let held = attach(&bound, open).unwrap_or_else(|_| panic!("attach"));
    let mut source = Fake::new(&receipt, &c, &tc, &now, start);
    source.cancelled = cancel.clone();
    let mut scanner = Scanner {
        c: sc.clone(),
        target: tc.clone(),
        entries: data.observed,
        change: 0,
        at: 1,
        fail: None,
        stop: cancel.clone(),
        tick: now.clone(),
        start,
    };
    change(&mut receipt, &mut source, &mut scanner, &mut b);
    let result = review_strict_record_target(
        held,
        topology,
        topology_source,
        receipt,
        source,
        ClosureInspection {
            source: scanner,
            context: InspectionContext {
                registry: &data.f.registry,
                groups: &data.groups,
            },
        },
        &mut b,
    );
    assert_eq!(c.made.get(), c.freed.get());
    assert_eq!(c.live.get(), 0);
    assert!(c.peak.get() <= 2);
    assert!(c.dropped.get() && sc.dropped.get());
    assert_eq!(tc.made.get(), tc.dropped.get());
    assert_eq!(b.reserved, 0);
    assert_eq!(b.metadata_cleanup_reserved, 0);
    assert_eq!(c.decoded.get(), 0); // Legacy source projection is NEVER used.
    ResultData {
        result,
        failed: b.failed,
        source: c,
        target: tc,
        scan: sc,
        work: b.json_work,
        used: b.used,
        checks: checks.get(),
    }
}
fn run_strict(
    change: impl FnOnce(&mut RecordReceipt, &mut Fake, &mut Scanner, &mut SharedBudget<'_>),
) -> ResultData {
    execute(Data::new(), change)
}
#[test]
fn strict_three_rounds_bracket_scans_and_keep_all_original_resources_and_budget() {
    let o = run_strict(|_, _, _, _| {});
    let result = o.result.unwrap();
    assert!(o.failed.is_none());
    assert_eq!(
        *o.scan.rounds.borrow(),
        [Round::Initial, Round::BeforeM4, Round::AfterM4]
    );
    assert_eq!(
        *o.scan.phases.borrow(),
        [
            vec![],
            vec![Phase::M0, Phase::M1, Phase::M2, Phase::M3],
            vec![Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4]
        ]
    );
    assert_eq!(o.source.cycles.get(), 6);
    assert!(o.scan.work.borrow().windows(2).all(|v| v[0] < v[1]));
    assert!(o.work > *o.scan.work.borrow().last().unwrap());
    let n = Data::new().node.len() as u64;
    assert_eq!(o.used, 32 + 48 + 2 * n + o.source.bytes.get());
    assert_eq!(
        result.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
}
#[test]
fn full_set_missing_duplicate_and_non_node_hash_changes_stop_each_round() {
    for at in 1..=3 {
        for change in 1..=3 {
            let o = run_strict(|_, _, s, _| {
                s.at = at;
                s.change = change;
            });
            assert_eq!(o.result.unwrap_err(), Failure::Changed);
            assert_eq!(o.failed, Some(Failure::Changed));
            assert_eq!(o.scan.rounds.borrow().len(), at);
            assert_eq!(o.target.phases.borrow().contains(&Phase::M4), at == 3);
        }
    }
}
#[test]
fn wrong_session_record_root_or_round_never_becomes_a_completed_scan() {
    for at in 1..=3 {
        for change in 4..=7 {
            let o = run_strict(|_, _, s, _| {
                s.at = at;
                s.change = change;
            });
            assert_eq!(o.result.unwrap_err(), Failure::Changed);
            assert_eq!(o.scan.rounds.borrow().len(), at);
            assert_eq!(o.target.phases.borrow().contains(&Phase::M4), at == 3);
        }
    }
}
#[test]
fn late_scan_success_on_cancel_or_deadline_is_discarded_with_original_reason() {
    for at in 1..=3 {
        for change in [8, 9] {
            let o = run_strict(|_, _, s, _| {
                s.at = at;
                s.change = change;
            });
            let expected = if change == 8 {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            assert_eq!(o.result.unwrap_err(), expected);
            assert_eq!(o.failed, Some(expected));
            assert_eq!(o.scan.rounds.borrow().len(), at);
        }
    }
}
#[test]
fn scan_failure_reasons_are_not_flattened_or_retried() {
    for reason in [
        Failure::ReadFailed,
        Failure::MetadataUnavailable,
        Failure::Limit,
        Failure::Expired,
        Failure::Cancelled,
        Failure::Deadline,
    ] {
        for at in 1..=3 {
            let o = run_strict(|_, _, s, _| {
                s.at = at;
                s.fail = Some(reason);
            });
            assert_eq!(o.result.unwrap_err(), reason);
            assert_eq!(o.failed, Some(reason));
            assert_eq!(o.scan.rounds.borrow().len(), at);
        }
    }
}
#[test]
fn changed_record_before_or_after_every_scan_stops_without_new_projection() {
    for cycle in 1..=6 {
        for kind in KINDS {
            let o = run_strict(|_, s, _, _| s.byte_change = Some((cycle, kind)));
            assert_eq!(o.result.unwrap_err(), Failure::Changed);
            assert_eq!(o.scan.rounds.borrow().len(), cycle / 2);
        }
    }
}
#[test]
fn authenticated_bad_json_in_each_record_stops_before_scan_or_target_read() {
    for kind in 0..3 {
        let mut d = Data::new();
        match kind {
            0 => d.f.a = b"{".to_vec(),
            1 => {
                d.f.l = b"{".to_vec();
                let mut a: Value = serde_json::from_slice(&d.f.a).unwrap();
                a["ledger_sha256"] = json!(digest(&d.f.l));
                d.f.a = serde_json::to_vec(&a).unwrap();
            }
            _ => {
                d.index = b"{".to_vec();
                d.repin();
            }
        }
        let o = execute(d, |_, _, _, _| {});
        assert_eq!(o.result.unwrap_err(), Failure::Binding);
        assert!(o.scan.rounds.borrow().is_empty());
        assert_eq!(o.target.reads.get(), 0);
    }
}
#[test]
fn invalid_registry_and_wrong_policy_roles_stop_before_scan() {
    for role in ["launcher", "node"] {
        let mut d = Data::new();
        let mut l: Value = serde_json::from_slice(&d.f.l).unwrap();
        l[role]["signature_policy_id"] = json!(if role == "node" {
            "launcher-1"
        } else {
            "node-1"
        });
        d.f.l = serde_json::to_vec(&l).unwrap();
        d.repin();
        let o = execute(d, |_, _, _, _| {});
        assert_eq!(o.result.unwrap_err(), Failure::Binding);
        assert!(o.scan.rounds.borrow().is_empty());
    }
    let mut d = Data::new();
    d.f.registry = b"{".to_vec();
    d.repin();
    let o = execute(d, |_, _, _, _| {});
    assert_eq!(o.result.unwrap_err(), Failure::Binding);
    assert_eq!(o.target.reads.get(), 0);
}
#[test]
fn fixed_projection_catches_ledger_paths_node_hash_and_index_size_mismatch() {
    for case in 0..4 {
        let mut d = Data::new();
        if case < 3 {
            let mut l: Value = serde_json::from_slice(&d.f.l).unwrap();
            match case {
                0 => l["runtime"]["index_path"] = json!("/release/other.json"),
                1 => l["node"]["path"] = json!("/release/bin/other"),
                _ => l["node"]["sha256"] = json!("f".repeat(64)),
            };
            d.f.l = serde_json::to_vec(&l).unwrap();
        } else {
            let mut i: Value = serde_json::from_slice(&d.index).unwrap();
            i["entries"][1]["size"] = json!(4097);
            d.index = serde_json::to_vec(&i).unwrap();
        }
        d.repin();
        let o = execute(d, |_, _, _, _| {});
        assert_eq!(o.result.unwrap_err(), Failure::Changed);
        assert!(o.scan.rounds.borrow().is_empty());
    }
}
#[test]
fn shared_work_exhaustion_and_preexisting_stop_do_not_reach_scanner() {
    for reason in [
        Failure::Limit,
        Failure::HashMismatch,
        Failure::Cancelled,
        Failure::Deadline,
    ] {
        let o = run_strict(|_, _, _, b| {
            if reason == Failure::Limit {
                b.json_work = 999999;
            } else {
                b.failed = Some(reason);
            }
        });
        assert_eq!(o.result.unwrap_err(), reason);
        assert_eq!(o.failed, Some(reason));
        assert!(o.scan.rounds.borrow().is_empty());
        assert_eq!(o.target.reads.get(), 0);
    }
}
#[test]
fn source_errors_during_post_scan_reread_preserve_reason_and_stop() {
    let total = run_strict(|_, _, _, _| {}).source.calls.get();
    for at in 1..=total {
        let o = run_strict(|_, s, _, _| s.fail = Some(at));
        assert_eq!(o.result.unwrap_err(), Failure::ReadFailed);
        assert_eq!(o.source.calls.get(), at);
        assert_eq!(o.failed, Some(Failure::ReadFailed));
    }
}
#[test]
fn short_reads_succeed_and_post_scan_namespace_swap_is_rejected() {
    assert!(run_strict(|_, s, _, _| s.max_read = 37).result.is_ok());
    let o = run_strict(|_, s, _, _| s.change_after_read = true);
    assert_eq!(o.result.unwrap_err(), Failure::Changed);
    assert!(o.scan.rounds.borrow().is_empty());
}

#[test]
fn accumulated_work_and_work_exhaustion_after_any_scan_stop_without_reset() {
    for at in 1..=3 {
        let o = run_strict(|_, _, s, _| {
            s.at = at;
            s.change = 10;
        });
        assert_eq!(o.result.unwrap_err(), Failure::Limit);
        assert_eq!(o.failed, Some(Failure::Limit));
        assert_eq!(o.scan.rounds.borrow().len(), at);
    }
    let total = run_strict(|_, _, _, _| {}).work;
    let o = run_strict(|_, _, _, b| b.json_work = 1_000_000 - total + 1);
    assert_eq!(o.result.unwrap_err(), Failure::Limit);
    assert_eq!(o.failed, Some(Failure::Limit));
    assert_eq!(o.scan.rounds.borrow().len(), 3);
}

fn expiry(data: &mut Data, remaining: u64) {
    let value = chrono::DateTime::from_timestamp_millis((fixtures::NOW + remaining) as i64)
        .unwrap()
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    for bytes in [&mut data.f.a, &mut data.f.l] {
        let mut v: Value = serde_json::from_slice(bytes).unwrap();
        v["expires_at"] = json!(value);
        *bytes = serde_json::to_vec(&v).unwrap();
    }
    data.repin();
}
#[test]
fn original_admission_and_current_final_margins_are_not_double_counted() {
    let mut d = Data::new();
    expiry(&mut d, 460001);
    let o = execute(d, |_, _, s, _| s.change = 11);
    assert!(o.result.is_ok());
    assert_eq!(o.scan.rounds.borrow().len(), 3);
    let mut d = Data::new();
    expiry(&mut d, 460000);
    let o = execute(d, |_, _, _, _| {});
    assert_eq!(o.result.unwrap_err(), Failure::Expired);
    assert_eq!(o.failed, Some(Failure::Expired));
    assert_eq!(o.source.calls.get(), 0);
    assert_eq!(o.target.reads.get(), 0);
}
#[test]
fn effective_groups_are_required_and_no_schema_fallback_occurs() {
    let mut d = Data::new();
    d.groups = vec![81];
    let o = execute(d, |_, _, _, _| {});
    assert_eq!(o.result.unwrap_err(), Failure::Binding);
    assert!(o.scan.rounds.borrow().is_empty());
    let mut d = Data::new();
    let mut l: Value = serde_json::from_slice(&d.f.l).unwrap();
    l["schema_version"] = json!("bp5-r2-launch-ledger-0.1");
    d.f.l = serde_json::to_vec(&l).unwrap();
    d.repin();
    let o = execute(d, |_, _, _, _| {});
    assert_eq!(o.result.unwrap_err(), Failure::Binding);
    assert_eq!(o.target.reads.get(), 0);
}

#[test]
fn sampled_shared_checkpoints_across_full_pipeline_keep_deadline_and_cancel() {
    let total = run_strict(|_, _, _, _| {}).checks;
    assert!(total > 1000);
    for cancelled in [false, true] {
        for at in (1..=total).step_by((total / 32).max(1)) {
            let mut d = Data::new();
            d.interrupt = Some((at, cancelled));
            let o = execute(d, |_, _, _, _| {});
            let reason = if cancelled {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            assert_eq!(o.result.unwrap_err(), reason);
            assert_eq!(o.failed, Some(reason));
        }
    }
}
