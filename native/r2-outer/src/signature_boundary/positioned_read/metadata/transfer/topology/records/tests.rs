use super::super::super::tests::{initial, records, target};
use super::super::tests::{Counts as TargetCounts, setup};
use super::*;
use std::cell::{Cell, RefCell};

#[derive(Default)]
struct Counts {
    calls: Cell<usize>,
    made: Cell<usize>,
    freed: Cell<usize>,
    live: Cell<usize>,
    peak: Cell<usize>,
    bytes: Cell<u64>,
    cycles: Cell<usize>,
    decoded: Cell<usize>,
    dropped: Cell<bool>,
    phases: RefCell<Vec<Vec<Phase>>>,
}
struct Handle {
    kind: Kind,
    index: usize,
    c: Rc<Counts>,
    replaced: bool,
}
impl Handle {
    fn new(kind: Kind, index: usize, c: &Rc<Counts>) -> Self {
        c.made.set(c.made.get() + 1);
        c.live.set(c.live.get() + 1);
        c.peak.set(c.peak.get().max(c.live.get()));
        Self {
            kind,
            index,
            c: c.clone(),
            replaced: false,
        }
    }
}
impl Drop for Handle {
    fn drop(&mut self) {
        self.c.freed.set(self.c.freed.get() + 1);
        self.c.live.set(self.c.live.get() - 1);
    }
}
fn index(k: Kind) -> usize {
    match k {
        Kind::Activation => 0,
        Kind::Ledger => 1,
        Kind::Index => 2,
    }
}
fn raw(s: Stat) -> TopologyObservation {
    TopologyObservation {
        before: s.clone(),
        after: s,
        acl: Acl::Absent,
        filesystem: Filesystem::Local,
        names: VisibleNames::Empty,
    }
}
fn make_receipt(binding: &mut RecordBinding, lineage: &Rc<()>) -> RecordReceipt {
    let pins = KINDS.map(|kind| {
        let bytes = format!("synthetic-record-{}-not-json", index(kind)).into_bytes();
        let hash: [u8; 32] = Sha256::digest(&bytes).into();
        match kind {
            Kind::Activation => binding.activation_hash = hash,
            Kind::Ledger => binding.ledger_hash = hash,
            Kind::Index => binding.index_hash = hash,
        };
        let depth = absolute_components(kind.path(binding), 128)
            .unwrap_or_else(|_| panic!("path"))
            .len();
        let ancestors = (0..depth)
            .map(|i| {
                let mut s = initial().before;
                s.kind = FileType::Directory;
                s.inode = 1000 + index(kind) as u64 * 100 + i as u64;
                s.mode = 0o755;
                s.links = 3;
                s.size = 0;
                RecordSnapshot {
                    stat: s,
                    names: VisibleNames::Empty,
                }
            })
            .collect();
        let mut stat = initial().before;
        stat.inode = 2000 + index(kind) as u64;
        stat.size = bytes.len() as u64;
        stat.uid = if kind == Kind::Ledger {
            binding.execution_uid
        } else {
            0
        };
        stat.mode = match kind {
            Kind::Activation => 0o440,
            Kind::Ledger => 0o600,
            Kind::Index => 0o444,
        };
        stat.gid = binding.reader_gid;
        RecordPin {
            kind,
            bytes,
            ancestors,
            leaf: RecordSnapshot {
                stat,
                names: VisibleNames::Empty,
            },
        }
    });
    RecordReceipt {
        lineage: lineage.clone(),
        binding: binding.clone(),
        start_monotonic_ms: 2000,
        pins,
    }
}
type Hook = Box<dyn FnMut(usize)>;
struct Fake {
    c: Rc<Counts>,
    target: Rc<TargetCounts>,
    now: Rc<Cell<Instant>>,
    start: Instant,
    binding: RecordBinding,
    paths: [Vec<String>; 3],
    data: [Vec<u8>; 3],
    metadata: [Vec<RecordSnapshot>; 3],
    fail: Option<usize>,
    hook: Option<Hook>,
    replace: Option<(usize, Kind, usize)>,
    byte_change: Option<(usize, Kind)>,
    projection_change: Option<(usize, usize)>,
    clock_skew: Option<usize>,
    max_read: usize,
    extra: bool,
    zero: bool,
    overreport: bool,
    panic_at: Option<usize>,
    cancelled: Rc<AtomicBool>,
    activation_walks: usize,
    change_after_read: bool,
    namespace_changed: bool,
}
impl Fake {
    fn new(
        r: &RecordReceipt,
        c: &Rc<Counts>,
        target: &Rc<TargetCounts>,
        now: &Rc<Cell<Instant>>,
        start: Instant,
    ) -> Self {
        Self {
            c: c.clone(),
            target: target.clone(),
            now: now.clone(),
            start,
            binding: r.binding.clone(),
            paths: KINDS.map(|k| {
                absolute_components(k.path(&r.binding), 128).unwrap_or_else(|_| panic!("path"))
            }),
            data: std::array::from_fn(|i| r.pins[i].bytes.clone()),
            metadata: std::array::from_fn(|i| {
                let mut v = r.pins[i].ancestors.clone();
                v.push(r.pins[i].leaf.clone());
                v
            }),
            fail: None,
            hook: None,
            replace: None,
            byte_change: None,
            projection_change: None,
            clock_skew: None,
            max_read: MAX_CHUNK,
            extra: false,
            zero: false,
            overreport: false,
            panic_at: None,
            cancelled: Rc::new(AtomicBool::new(false)),
            activation_walks: 0,
            change_after_read: false,
            namespace_changed: false,
        }
    }
    fn event(&mut self) -> Result<(), Failure> {
        let n = self.c.calls.get() + 1;
        self.c.calls.set(n);
        if let Some(h) = &mut self.hook {
            h(n);
        }
        if self.panic_at == Some(n) {
            panic!("synthetic record unwind");
        }
        if self.fail == Some(n) {
            return Err(Failure::ReadFailed);
        }
        Ok(())
    }
}
impl Drop for Fake {
    fn drop(&mut self) {
        self.c.dropped.set(true);
    }
}
impl RecordSource for Fake {
    type Handle = Handle;
    fn clock(&mut self) -> Result<ClockReading, Failure> {
        self.event()?;
        let n = self.now.get().duration_since(self.start).as_millis() as u64;
        let skew = if self.clock_skew == Some(self.c.cycles.get()) {
            2
        } else {
            0
        };
        Ok(ClockReading {
            wall_ms: self.binding.start_wall_ms + n + skew,
            monotonic_ms: 2000 + n,
        })
    }
    fn open_anchor(&mut self, kind: Kind) -> Result<Handle, Failure> {
        self.event()?;
        if kind == Kind::Activation {
            self.activation_walks += 1;
            if self.activation_walks % 2 == 1 {
                self.c.cycles.set(self.c.cycles.get() + 1);
                self.c
                    .phases
                    .borrow_mut()
                    .push(self.target.phases.borrow().clone());
            }
        }
        Ok(Handle::new(kind, 0, &self.c))
    }
    fn open_child(
        &mut self,
        p: &Handle,
        component: &str,
        directory: bool,
    ) -> Result<Handle, Failure> {
        self.event()?;
        let i = index(p.kind);
        assert_eq!(component, self.paths[i][p.index]);
        assert_eq!(directory, p.index + 1 < self.paths[i].len());
        let mut handle = Handle::new(p.kind, p.index + 1, &self.c);
        handle.replaced = self.namespace_changed && p.kind == Kind::Activation && !directory;
        Ok(handle)
    }
    fn observe(&mut self, h: &Handle) -> Result<TopologyObservation, Failure> {
        self.event()?;
        let mut v = self.metadata[index(h.kind)][h.index].clone();
        if self.replace == Some((self.c.cycles.get(), h.kind, h.index)) {
            v.stat.inode += 1;
        }
        if h.replaced {
            v.stat.inode += 1;
        }
        let mut raw = raw(v.stat);
        raw.names = v.names;
        Ok(raw)
    }
    fn read(&mut self, h: &Handle, offset: u64, out: &mut [u8]) -> Result<usize, Failure> {
        self.event()?;
        assert_eq!(h.index, self.paths[index(h.kind)].len());
        if self.zero {
            return Ok(0);
        }
        if self.overreport {
            return Ok(out.len() + 1);
        }
        let data = &self.data[index(h.kind)];
        let start = offset as usize;
        let n = out
            .len()
            .min(self.max_read)
            .min(data.len().saturating_sub(start));
        if n == 0 && self.change_after_read {
            self.namespace_changed = true;
        }
        if n > 0 {
            out[..n].copy_from_slice(&data[start..start + n]);
            if self.byte_change == Some((self.c.cycles.get(), h.kind)) {
                out[0] ^= 1;
            }
        }
        if self.extra && n == 0 && !out.is_empty() {
            out[0] = 1;
            self.c.bytes.set(self.c.bytes.get() + 1);
            return Ok(1);
        }
        self.c.bytes.set(self.c.bytes.get() + n as u64);
        Ok(n)
    }
    fn revalidate(&mut self, bytes: [&[u8]; 3]) -> Result<RecordBinding, Failure> {
        self.event()?;
        for (i, b) in bytes.iter().enumerate() {
            assert_eq!(*b, self.data[i]);
        }
        self.c.decoded.set(self.c.decoded.get() + 1);
        let mut b = self.binding.clone();
        if let Some((cycle, field)) = self.projection_change
            && cycle == self.c.cycles.get()
        {
            match field {
                0 => b.generation += 1,
                1 => b.release.push('x'),
                2 => b.node_policy.push('x'),
                3 => b.registry_hash[0] ^= 1,
                4 => b.execution_uid += 1,
                5 => b.ledger_expires_ms += 1,
                _ => b.index_hash[0] ^= 1,
            }
        }
        Ok(b)
    }
}
struct Outcome {
    result: Result<RecordComparison, Failure>,
    failed: Option<Failure>,
    used: u64,
    c: Rc<Counts>,
    target: Rc<TargetCounts>,
}
fn run(change: impl FnOnce(&mut RecordReceipt, &mut Fake, &mut SharedBudget<'_>)) -> Outcome {
    run_binding(|_| {}, change)
}
fn run_binding(
    initial: impl FnOnce(&mut RecordBinding),
    change: impl FnOnce(&mut RecordReceipt, &mut Fake, &mut SharedBudget<'_>),
) -> Outcome {
    let start = Instant::now();
    let now = Rc::new(Cell::new(start));
    let clock = || now.get();
    let cancel = Rc::new(AtomicBool::new(false));
    let mut budget = SharedBudget::new(start, &cancel);
    budget.now = &clock;
    let c = Rc::new(Counts::default());
    let target_c = Rc::new(TargetCounts::default());
    let mut binding = records();
    let lineage = Rc::new(());
    let mut r = make_receipt(&mut binding, &lineage);
    initial(&mut binding);
    r.binding = binding.clone();
    let mut t = target();
    let bytes = physical_signature::synthetic_file(true, false, 4096, 48);
    t.ledger_hash = Sha256::digest(&bytes).into();
    t.index_hash = t.ledger_hash;
    t.size = SizeEvidence::Indexed(bytes.len() as u64);
    let bound = bind(&binding, &lineage, &t).unwrap_or_else(|_| panic!("bind"));
    let (open, topology, source) = setup(&bound, &target_c);
    let held = attach(&bound, open).unwrap_or_else(|_| panic!("attach"));
    let mut s = Fake::new(&r, &c, &target_c, &now, start);
    s.cancelled = cancel.clone();
    change(&mut r, &mut s, &mut budget);
    let result = review_record_target(held, topology, source, r, s, &mut budget);
    assert_eq!(budget.reserved, 0);
    assert_eq!(budget.metadata_cleanup_reserved, 0);
    assert_eq!(c.made.get(), c.freed.get());
    assert_eq!(c.live.get(), 0);
    assert!(c.peak.get() <= 2);
    assert!(c.dropped.get());
    assert_eq!(target_c.made.get(), target_c.dropped.get());
    Outcome {
        result,
        failed: budget.failed,
        used: budget.used,
        c,
        target: target_c,
    }
}
#[test]
fn final_records_are_reread_before_m4_and_after_m4_with_exact_byte_accounting() {
    let o = run(|_, _, _| {});
    let result = o.result.unwrap();
    assert!(o.failed.is_none());
    assert_eq!(o.c.cycles.get(), 2);
    assert_eq!(o.c.decoded.get(), 2);
    assert_eq!(o.c.peak.get(), 2);
    assert_eq!(
        *o.c.phases.borrow(),
        [
            vec![Phase::M0, Phase::M1, Phase::M2, Phase::M3],
            vec![Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4]
        ]
    );
    let n = physical_signature::synthetic_file(true, false, 4096, 48).len() as u64;
    assert_eq!(o.used, 32 + 48 + 2 * n + o.c.bytes.get());
    assert_eq!(
        format!("{result:?}"),
        "RecordComparison(synthetic_pending_lease_os_reader_not_execution_authority)"
    );
    assert_eq!(
        result.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
}
#[test]
fn same_bytes_different_record_inode_or_any_ancestor_is_rejected() {
    for cycle in 1..=2 {
        for kind in KINDS {
            let depth = absolute_components(kind.path(&records()), 128)
                .unwrap()
                .len();
            for pos in 0..=depth {
                let o = run(|_, s, _| s.replace = Some((cycle, kind, pos)));
                assert_eq!(o.result.unwrap_err(), Failure::Changed);
                assert_eq!(o.failed, Some(Failure::Changed));
                assert_eq!(o.target.phases.borrow().contains(&Phase::M4), cycle == 2);
            }
        }
    }
}
#[test]
fn all_record_byte_changes_are_rejected_without_following_new_values() {
    for cycle in 1..=2 {
        for kind in KINDS {
            let o = run(|_, s, _| s.byte_change = Some((cycle, kind)));
            assert_eq!(o.result.unwrap_err(), Failure::Changed);
            assert_eq!(o.c.decoded.get(), cycle - 1);
        }
    }
}
#[test]
fn changed_generation_release_policy_registry_identity_or_expiry_projection_stops() {
    for cycle in 1..=2 {
        for field in 0..7 {
            let o = run(|_, s, _| s.projection_change = Some((cycle, field)));
            assert_eq!(o.result.unwrap_err(), Failure::Changed);
            assert_eq!(o.failed, Some(Failure::Changed));
        }
    }
}
#[test]
fn record_receipt_binding_or_hash_mismatch_stops_before_any_read() {
    for case in 0..6 {
        let o = run(|r, _, _| match case {
            0 => r.lineage = Rc::new(()),
            1 => r.binding.generation += 1,
            2 => r.pins[0].bytes[0] ^= 1,
            3 => r.pins.swap(0, 1),
            4 => {
                r.pins[2].ancestors.pop();
            }
            _ => r.pins[0].bytes.clear(),
        });
        assert!(matches!(
            o.result.unwrap_err(),
            Failure::Binding | Failure::HashMismatch
        ));
        assert_eq!(o.c.calls.get(), 0);
        assert_eq!(o.target.reads.get(), 0);
    }
}
#[test]
fn insufficient_expiry_or_clock_drift_stops_without_retry() {
    for phase in 0..=2 {
        let o = run(|_, s, _| s.clock_skew = Some(phase));
        assert_eq!(o.result.unwrap_err(), Failure::Expired);
        assert_eq!(o.failed, Some(Failure::Expired));
        if phase == 0 {
            assert_eq!(o.target.reads.get(), 0);
        }
    }
    // Expiry admission is checked against the pinned binding, not a new projected expiry.
    let mut b = records();
    b.activation_expires_ms = b.start_wall_ms + 460000;
    assert_eq!(
        record_time(&b, b.start_wall_ms, 460000),
        Err(Failure::Expired)
    );
    b.activation_expires_ms += 1;
    assert!(record_time(&b, b.start_wall_ms, 460000).is_ok());
}
#[test]
fn expired_pinned_records_stop_before_any_source_or_target_read() {
    for kind in [Kind::Activation, Kind::Ledger] {
        let o = run_binding(
            |b| match kind {
                Kind::Activation => b.activation_expires_ms = b.start_wall_ms + 460000,
                _ => b.ledger_expires_ms = b.start_wall_ms + 460000,
            },
            |_, _, _| {},
        );
        assert_eq!(o.result.unwrap_err(), Failure::Expired);
        assert_eq!(o.c.calls.get(), 0);
        assert_eq!(o.target.reads.get(), 0);
    }
}
#[test]
fn namespace_change_during_read_is_caught_by_post_read_full_rewalk() {
    let o = run(|_, s, _| s.change_after_read = true);
    assert_eq!(o.result.unwrap_err(), Failure::Changed);
    assert_eq!(o.c.decoded.get(), 0);
    assert!(!o.target.phases.borrow().contains(&Phase::M4));
}
#[test]
fn every_late_source_result_on_cancel_or_deadline_is_discarded_and_released() {
    let count = run(|_, _, _| {}).c.calls.get();
    for expired in [false, true] {
        for n in 1..=count {
            let o = run(|_, s, _| {
                let tick = s.now.clone();
                let start = s.start;
                let cancel = s.cancelled.clone();
                s.hook = Some(Box::new(move |i| {
                    if i == n {
                        if expired {
                            tick.set(start + Duration::from_secs(10));
                        } else {
                            cancel.store(true, Ordering::Release);
                        }
                    }
                }));
            });
            let reason = if expired {
                Failure::Deadline
            } else {
                Failure::Cancelled
            };
            assert_eq!(o.result.unwrap_err(), reason);
            assert_eq!(o.failed, Some(reason));
            assert_eq!(o.c.calls.get(), n);
        }
    }
}
#[test]
fn all_source_failure_boundaries_stop_and_release_without_retry() {
    let count = run(|_, _, _| {}).c.calls.get();
    for n in 1..=count {
        let o = run(|_, s, _| s.fail = Some(n));
        assert_eq!(o.result.unwrap_err(), Failure::ReadFailed);
        assert_eq!(o.c.calls.get(), n);
        assert_eq!(o.failed, Some(Failure::ReadFailed));
    }
}
#[test]
fn short_reads_work_but_early_eof_extra_bytes_and_overreport_do_not() {
    assert!(run(|_, s, _| s.max_read = 3).result.is_ok());
    for case in 0..3 {
        let o = run(|_, s, _| match case {
            0 => s.zero = true,
            1 => s.extra = true,
            _ => s.overreport = true,
        });
        assert_eq!(
            o.result.unwrap_err(),
            if case == 1 {
                Failure::Changed
            } else {
                Failure::ReadFailed
            }
        );
    }
}
#[test]
fn original_payload_limit_and_contract_call_limit_are_not_reset() {
    for case in 0..2 {
        let o = run(|_, _, b| {
            if case == 0 {
                b.used = MAX_BYTES;
            } else {
                b.topology_calls = MAX_TOPOLOGY_CALLS - 1;
            }
        });
        assert_eq!(o.result.unwrap_err(), Failure::Limit);
        assert_eq!(o.failed, Some(Failure::Limit));
    }
}
#[test]
fn record_reread_cannot_spend_reserved_ab_credit() {
    let o = run(|_, _, b| {
        let n = physical_signature::synthetic_file(true, false, 4096, 48).len() as u64;
        b.used = MAX_BYTES - (2 * n + 32 + MAX_HEADER + 2);
    });
    assert_eq!(o.result.unwrap_err(), Failure::Limit);
    assert!(o.c.bytes.get() > 0);
    assert!(o.target.reads.get() > 0);
    assert!(!o.target.phases.borrow().contains(&Phase::M4));
}
#[test]
fn record_byte_caps_are_enforced_before_hash_or_source_operations() {
    for kind in KINDS {
        let o = run(|r, _, _| {
            let pin = &mut r.pins[index(kind)];
            pin.bytes = vec![0; kind.limit() + 1];
            pin.leaf.stat.size = pin.bytes.len() as u64;
        });
        assert_eq!(o.result.unwrap_err(), Failure::Binding);
        assert_eq!(o.c.calls.get(), 0);
        assert_eq!(o.target.reads.get(), 0);
    }
}
#[test]
fn record_policy_and_unknown_observation_fail_closed() {
    for case in 0..6 {
        let o = run(|_, s, _| match case {
            0 => s.metadata[0].last_mut().unwrap().stat.uid = 501,
            1 => s.metadata[1].last_mut().unwrap().stat.mode = 0o640,
            2 => s.metadata[2].last_mut().unwrap().stat.links = 2,
            3 => s.metadata[0][0].names = VisibleNames::Unknown,
            4 => s.metadata[0][0].stat.mode = 0o777,
            _ => s.metadata[0][0].names = VisibleNames::Disallowed,
        });
        assert_eq!(
            o.result.unwrap_err(),
            if case == 3 {
                Failure::MetadataUnavailable
            } else {
                Failure::Changed
            }
        );
    }
}
#[test]
fn preexisting_failure_prevents_record_or_payload_operations() {
    let o = run(|_, _, b| b.failed = Some(Failure::Binding));
    assert_eq!(o.result.unwrap_err(), Failure::Binding);
    assert_eq!(o.c.calls.get(), 0);
    assert_eq!(o.target.reads.get(), 0);
}
#[test]
fn unwind_in_record_walk_releases_temporary_handles_and_target_scope() {
    let c = Rc::new(Counts::default());
    let c2 = c.clone();
    let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run(|_, s, _| {
            s.c = c2;
            s.panic_at = Some(7);
        })
    }));
    assert!(out.is_err());
    assert_eq!(c.made.get(), c.freed.get());
    assert_eq!(c.live.get(), 0);
    assert!(c.dropped.get());
}
