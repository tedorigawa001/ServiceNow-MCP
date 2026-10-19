use super::super::tests::{initial, records, target};
use super::*;
use crate::signature_boundary::positioned_read::metadata::collector::*;
use sha2::{Digest, Sha256};
use std::cell::{Cell, RefCell};

#[derive(Default)]
pub(super) struct Counts {
    pub(super) made: Cell<usize>,
    pub(super) dropped: Cell<usize>,
    pub(super) live: Cell<usize>,
    pub(super) peak: Cell<usize>,
    opened: RefCell<Vec<(String, bool)>>,
    pub(super) phases: RefCell<Vec<Phase>>,
    pub(super) reads: Cell<usize>,
    pub(super) copied: Cell<u64>,
    attempts: Cell<usize>,
    round: Cell<usize>,
}
pub(super) struct Resource {
    id: usize,
    origin: Rc<()>,
    c: Rc<Counts>,
    bytes: Vec<u8>,
}
impl Resource {
    fn new(id: usize, c: &Rc<Counts>) -> Self {
        c.made.set(c.made.get() + 1);
        Self {
            id,
            origin: Rc::new(()),
            c: c.clone(),
            bytes: physical_signature::synthetic_file(true, false, 4096, 48),
        }
    }
}
impl Drop for Resource {
    fn drop(&mut self) {
        self.c.dropped.set(self.c.dropped.get() + 1);
    }
}
impl ResourceOrigin for Resource {
    fn resource_origin(&self) -> &Rc<()> {
        &self.origin
    }
}
impl PositionedSource for Resource {
    fn pread(&mut self, offset: u64, out: &mut [u8]) -> Result<usize, IoFailure> {
        assert_eq!(self.id, 99);
        self.c.reads.set(self.c.reads.get() + 1);
        let start = offset as usize;
        let n = out.len().min(self.bytes.len().saturating_sub(start));
        if n > 0 {
            out[..n].copy_from_slice(&self.bytes[start..start + n]);
        }
        self.c.copied.set(self.c.copied.get() + n as u64);
        Ok(n)
    }
}
impl MetadataOps for Resource {
    type AclHandle = ();
    fn stat(&mut self, p: Phase, point: StatPoint) -> Result<Stat, OpFailure> {
        if matches!(point, StatPoint::Before) {
            self.c.phases.borrow_mut().push(p);
        }
        Ok(leaf_stat(self.bytes.len() as u64))
    }
    fn filesystem(&mut self, _: Phase) -> Result<FsObservation, OpFailure> {
        Ok(FsObservation {
            location: Filesystem::Local,
            apfs: true,
            ownership_ignored: false,
            noexec: false,
        })
    }
    fn acl_init(&mut self, _: Phase) -> Result<(), OpFailure> {
        Ok(())
    }
    fn acl_stat(&mut self, _: Phase, _: &mut ()) -> Result<Stat, OpFailure> {
        Ok(leaf_stat(self.bytes.len() as u64))
    }
    fn acl_query(&mut self, _: Phase, _: &mut ()) -> Result<i32, OpFailure> {
        Ok(0)
    }
    fn acl_free(&mut self, _: ()) {}
    fn names_size(&mut self, _: Phase) -> Result<i64, OpFailure> {
        Ok(0)
    }
    fn names_read(&mut self, _: Phase, _: &mut [u8]) -> Result<usize, OpFailure> {
        Ok(0)
    }
}
fn leaf_stat(n: u64) -> Stat {
    let mut s = initial().before;
    s.size = n;
    s
}
fn observation(s: Stat) -> TopologyObservation {
    TopologyObservation {
        before: s.clone(),
        after: s,
        acl: Acl::Absent,
        filesystem: Filesystem::Local,
        names: VisibleNames::Empty,
    }
}
pub(super) struct Temporary {
    index: usize,
    c: Rc<Counts>,
}
impl Temporary {
    fn new(index: usize, c: &Rc<Counts>) -> Self {
        c.made.set(c.made.get() + 1);
        c.live.set(c.live.get() + 1);
        c.peak.set(c.peak.get().max(c.live.get()));
        Self {
            index,
            c: c.clone(),
        }
    }
}
impl Drop for Temporary {
    fn drop(&mut self) {
        self.c.dropped.set(self.c.dropped.get() + 1);
        self.c.live.set(self.c.live.get() - 1);
    }
}
type Hook = Box<dyn FnMut(usize, usize)>;
pub(super) struct Synthetic {
    c: Rc<Counts>,
    held: Vec<TopologyObservation>,
    namespace: Vec<TopologyObservation>,
    expected_components: Vec<String>,
    fail: Option<usize>,
    hook: Option<Hook>,
    second_change: Option<usize>,
    second_held_change: Option<usize>,
}
impl Synthetic {
    fn event(&mut self) -> Result<(), Failure> {
        let n = self.c.attempts.get() + 1;
        self.c.attempts.set(n);
        if let Some(h) = &mut self.hook {
            h(n, self.c.round.get());
        }
        if self.fail == Some(n) {
            return Err(Failure::MetadataUnavailable);
        }
        Ok(())
    }
}
impl TopologySource<Resource> for Synthetic {
    type Temporary = Temporary;
    fn observe_held(&mut self, r: &Resource) -> Result<TopologyObservation, Failure> {
        self.event()?;
        if self.c.attempts.get() == 15
            && let Some(i) = self.second_held_change
        {
            self.held[i].before.inode += 1;
            self.held[i].after = self.held[i].before.clone();
        }
        Ok(self.held[r.id].clone())
    }
    fn open_anchor(&mut self) -> Result<Temporary, Failure> {
        self.event()?;
        self.c.round.set(self.c.round.get() + 1);
        if self.c.round.get() == 2
            && let Some(i) = self.second_change
        {
            self.namespace[i].before.inode += 1;
            self.namespace[i].after = self.namespace[i].before.clone();
        }
        Ok(Temporary::new(0, &self.c))
    }
    fn open_child(
        &mut self,
        p: &Temporary,
        component: &str,
        directory: bool,
    ) -> Result<Temporary, Failure> {
        self.event()?;
        let index = p.index + 1;
        assert_eq!(component, self.expected_components[index]);
        assert_eq!(directory, index + 1 < self.namespace.len());
        self.c
            .opened
            .borrow_mut()
            .push((component.into(), directory));
        Ok(Temporary::new(index, &self.c))
    }
    fn observe_temporary(&mut self, r: &Temporary) -> Result<TopologyObservation, Failure> {
        self.event()?;
        Ok(self.namespace[r.index].clone())
    }
}
pub(super) fn setup(
    b: &BoundTarget<'_>,
    c: &Rc<Counts>,
) -> (OpenedTarget<Resource>, TopologyReceipt, Synthetic) {
    let leaf = Resource::new(99, c);
    let mut raw = initial();
    raw.before = leaf_stat(leaf.bytes.len() as u64);
    raw.after = raw.before.clone();
    let mut baselines = Vec::new();
    let mut observed = Vec::new();
    let ancestors = b
        .chain_names
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let r = Resource::new(i, c);
            let mut s = initial().before;
            s.kind = FileType::Directory;
            s.inode = 100 + i as u64;
            s.size = 0;
            s.links = 3;
            s.mode = 0o755;
            // System ancestor device may differ from leaf device, but each remains exact.
            if i == 0 {
                s.device = 1;
            }
            let raw = observation(s);
            baselines.push(AncestorBaseline {
                origin: r.origin.clone(),
                snapshot: snapshot(raw.clone(), true).unwrap_or_else(|_| panic!("baseline")),
            });
            observed.push(raw);
            Ancestor {
                resource: r,
                component: name.clone(),
            }
        })
        .collect();
    let receipt = TopologyReceipt {
        lineage: b.lineage.clone(),
        records: b.records.clone(),
        target: b.target.clone(),
        ancestors: baselines,
    };
    let mut namespace = observed.clone();
    namespace.push(observation(raw.before.clone()));
    let mut components = b.chain_names.clone();
    components.push("node".into());
    let source = Synthetic {
        c: c.clone(),
        held: observed,
        namespace,
        expected_components: components,
        fail: None,
        hook: None,
        second_change: None,
        second_held_change: None,
    };
    (
        OpenedTarget {
            lineage: b.lineage.clone(),
            records: b.records.clone(),
            target: b.target.clone(),
            root_device: 7,
            initial: raw,
            initial_origin: leaf.origin.clone(),
            leaf,
            ancestors,
        },
        receipt,
        source,
    )
}
fn run(
    c: &Rc<Counts>,
    mutate: impl FnOnce(
        &mut HeldTargetScope<'_, Resource>,
        &mut TopologyReceipt,
        &mut Synthetic,
        &mut SharedBudget<'_>,
    ),
) -> (Result<TopologyComparison, Failure>, Option<Failure>, u32) {
    let cancel = AtomicBool::new(false);
    let mut budget = SharedBudget::new(Instant::now(), &cancel);
    let records = records();
    let lineage = Rc::new(());
    let mut t = target();
    let bytes = physical_signature::synthetic_file(true, false, 4096, 48);
    t.ledger_hash = Sha256::digest(&bytes).into();
    t.index_hash = t.ledger_hash;
    t.size = SizeEvidence::Indexed(bytes.len() as u64);
    let bound = bind(&records, &lineage, &t).unwrap_or_else(|_| panic!("bind"));
    let (opened, mut receipt, mut source) = setup(&bound, c);
    let mut held = attach(&bound, opened).unwrap_or_else(|_| panic!("attach"));
    mutate(&mut held, &mut receipt, &mut source, &mut budget);
    let result = review_topology_target(held, receipt, source, &mut budget);
    assert_eq!(budget.reserved, 0);
    assert_eq!(budget.metadata_cleanup_reserved, 0);
    assert_eq!(c.made.get(), c.dropped.get());
    assert_eq!(c.live.get(), 0);
    assert!(c.peak.get() <= 2);
    (result, budget.failed, budget.topology_calls)
}
#[test]
fn unchanged_topology_rewalks_all_edges_twice_before_m0_and_m4() {
    let c = Rc::new(Counts::default());
    let (out, failed, calls) = run(&c, |_, _, s, _| {
        let c = c.clone();
        s.hook = Some(Box::new(move |attempt, _| {
            if attempt == 15 {
                let n = physical_signature::synthetic_file(true, false, 4096, 48).len() as u64;
                assert_eq!(c.copied.get(), 32 + 48 + 2 * n);
                assert_eq!(
                    *c.phases.borrow(),
                    [Phase::M0, Phase::M1, Phase::M2, Phase::M3]
                );
            }
        }));
    });
    let out = out.unwrap();
    assert!(failed.is_none());
    assert_eq!(c.round.get(), 2);
    assert_eq!(calls, 28);
    assert_eq!(calls as usize, c.attempts.get());
    assert_eq!(
        *c.phases.borrow(),
        [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4]
    );
    assert_eq!(c.opened.borrow().len(), 8);
    assert_eq!(c.peak.get(), 2);
    assert_eq!(
        format!("{out:?}"),
        "TopologyComparison(synthetic_pending_records_lease_not_execution_authority)"
    );
    assert_eq!(
        out.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
}
#[test]
fn every_retained_ancestor_change_after_move_stops_before_payload() {
    for i in 0..4 {
        let c = Rc::new(Counts::default());
        let (out, failed, _) = run(&c, |_, _, s, _| {
            s.held[i].before.inode += 1;
            s.held[i].after = s.held[i].before.clone();
        });
        assert_eq!(out.unwrap_err(), Failure::Changed);
        assert_eq!(failed, Some(Failure::Changed));
        assert_eq!(c.reads.get(), 0);
    }
}
#[test]
fn namespace_replacement_including_root_parent_and_same_hash_leaf_stops() {
    for i in 0..5 {
        let c = Rc::new(Counts::default());
        let (out, _, _) = run(&c, |_, _, s, _| {
            s.namespace[i].before.inode += 1;
            s.namespace[i].after = s.namespace[i].before.clone();
        });
        assert_eq!(out.unwrap_err(), Failure::Changed);
        assert_eq!(c.reads.get(), 0);
    }
}
#[test]
fn replacement_after_b_discards_comparison_before_m4() {
    for i in 0..5 {
        let c = Rc::new(Counts::default());
        let (out, failed, _) = run(&c, |_, _, s, _| s.second_change = Some(i));
        assert_eq!(out.unwrap_err(), Failure::Changed);
        assert_eq!(failed, Some(Failure::Changed));
        assert!(c.reads.get() > 0);
        assert_eq!(
            *c.phases.borrow(),
            [Phase::M0, Phase::M1, Phase::M2, Phase::M3]
        );
    }
}
#[test]
fn retained_ancestor_change_during_byte_scans_is_rejected_before_namespace_rewalk() {
    for i in 0..4 {
        let c = Rc::new(Counts::default());
        let (out, failed, _) = run(&c, |_, _, s, _| s.second_held_change = Some(i));
        assert_eq!(out.unwrap_err(), Failure::Changed);
        assert_eq!(failed, Some(Failure::Changed));
        assert_eq!(c.round.get(), 1);
        assert!(!c.phases.borrow().contains(&Phase::M4));
    }
}
#[test]
fn ancestor_metadata_is_exact_not_just_inode_or_hash() {
    for field in 0..12 {
        let c = Rc::new(Counts::default());
        let (out, _, _) = run(&c, |_, _, s, _| {
            let stat = &mut s.namespace[1].before;
            match field {
                0 => stat.device += 1,
                1 => stat.inode += 1,
                2 => stat.kind = FileType::Regular,
                3 => stat.uid += 1,
                4 => stat.gid += 1,
                5 => stat.mode = 0o555,
                6 => stat.links += 1,
                7 => stat.size += 1,
                8 => stat.mtime.seconds += 1,
                9 => stat.mtime.nanoseconds += 1,
                10 => stat.ctime.seconds += 1,
                _ => stat.ctime.nanoseconds += 1,
            }
            s.namespace[1].after = s.namespace[1].before.clone();
        });
        assert_eq!(out.unwrap_err(), Failure::Changed);
        assert_eq!(c.reads.get(), 0);
    }
}
#[test]
fn every_single_attempt_failure_stops_without_retry_and_releases_temporaries() {
    for n in 1..=28 {
        let c = Rc::new(Counts::default());
        let (out, failed, calls) = run(&c, |_, _, s, _| s.fail = Some(n));
        assert_eq!(out.unwrap_err(), Failure::MetadataUnavailable);
        assert_eq!(failed, Some(Failure::MetadataUnavailable));
        assert_eq!(calls as usize, n);
        assert_eq!(c.attempts.get(), n);
        if n <= 14 {
            assert_eq!(c.reads.get(), 0);
        } else {
            assert!(!c.phases.borrow().contains(&Phase::M4));
        }
    }
}
#[test]
fn foreign_receipt_or_ancestor_origin_is_rejected_before_any_observation() {
    for case in 0..5 {
        let c = Rc::new(Counts::default());
        let (out, _, calls) = run(&c, |h, r, _, _| match case {
            0 => r.lineage = Rc::new(()),
            1 => r.records.generation += 1,
            2 => r.target.policy = "other".into(),
            3 => {
                r.ancestors.pop();
            }
            _ => h.ancestors[1].resource.origin = Rc::new(()),
        });
        assert!(matches!(
            out.unwrap_err(),
            Failure::Binding | Failure::SourceMismatch
        ));
        assert_eq!(calls, 0);
        assert_eq!(c.reads.get(), 0);
    }
}
#[test]
fn changed_or_unknown_policy_observations_never_count_as_absent() {
    for case in 0..8 {
        let c = Rc::new(Counts::default());
        let (out, _, _) = run(&c, |_, _, s, _| match case {
            0 => s.namespace[1].acl = Acl::Present,
            1 => s.namespace[1].acl = Acl::Unknown,
            2 => s.namespace[1].names = VisibleNames::Disallowed,
            3 => s.namespace[1].names = VisibleNames::Unknown,
            4 => s.namespace[1].filesystem = Filesystem::Unknown,
            5 => s.namespace[1].before.kind = FileType::Symlink,
            6 => s.namespace[1].names = VisibleNames::Provenance,
            _ => s.namespace[1].after.ctime.seconds += 1,
        });
        let expected = if [1, 3, 4].contains(&case) {
            Failure::MetadataUnavailable
        } else {
            Failure::Changed
        };
        assert_eq!(out.unwrap_err(), expected);
        assert_eq!(c.reads.get(), 0);
    }
}
#[test]
fn shared_topology_limit_does_not_reset_for_second_recheck() {
    let c = Rc::new(Counts::default());
    let (out, failed, calls) = run(&c, |_, _, _, b| b.topology_calls = MAX_TOPOLOGY_CALLS - 14);
    assert_eq!(out.unwrap_err(), Failure::Limit);
    assert_eq!(failed, Some(Failure::Limit));
    assert_eq!(calls, MAX_TOPOLOGY_CALLS);
    assert_eq!(c.attempts.get(), 14);
    assert!(!c.phases.borrow().contains(&Phase::M4));
}
#[test]
fn preexisting_failure_performs_no_topology_or_payload_attempt() {
    let c = Rc::new(Counts::default());
    let (out, _, calls) = run(&c, |_, _, _, b| b.failed = Some(Failure::Binding));
    assert_eq!(out.unwrap_err(), Failure::Binding);
    assert_eq!(calls, 0);
    assert_eq!(c.reads.get(), 0);
}
#[test]
fn cancellation_or_deadline_after_each_attempt_stops_and_drops_late_resources() {
    for expired in [false, true] {
        for n in 1..=28 {
            let c = Rc::new(Counts::default());
            let start = Instant::now();
            let now = Rc::new(Cell::new(start));
            let clock = || now.get();
            let cancelled = Rc::new(AtomicBool::new(false));
            let mut budget = SharedBudget::new(start, &cancelled);
            budget.now = &clock;
            let records = records();
            let lineage = Rc::new(());
            let mut t = target();
            let bytes = physical_signature::synthetic_file(true, false, 4096, 48);
            t.ledger_hash = Sha256::digest(&bytes).into();
            t.index_hash = t.ledger_hash;
            t.size = SizeEvidence::Indexed(bytes.len() as u64);
            let bound = bind(&records, &lineage, &t).unwrap_or_else(|_| panic!("bind"));
            let (opened, receipt, mut s) = setup(&bound, &c);
            let stop = cancelled.clone();
            let tick = now.clone();
            s.hook = Some(Box::new(move |attempt, _| {
                if attempt == n {
                    if expired {
                        tick.set(start + Duration::from_secs(10));
                    } else {
                        stop.store(true, Ordering::Release);
                    }
                }
            }));
            let out = review_topology_target(
                attach(&bound, opened).unwrap_or_else(|_| panic!("attach")),
                receipt,
                s,
                &mut budget,
            );
            let reason = if expired {
                Failure::Deadline
            } else {
                Failure::Cancelled
            };
            assert_eq!(out.unwrap_err(), reason);
            assert_eq!(budget.failed, Some(reason));
            assert_eq!(c.attempts.get(), n);
            assert_eq!(c.made.get(), c.dropped.get());
            assert_eq!(c.live.get(), 0);
            assert_eq!(budget.reserved, 0);
        }
    }
}
#[test]
fn unwind_during_rewalk_drops_current_temporary_leaf_and_ancestors() {
    let c = Rc::new(Counts::default());
    let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run(&c, |_, _, s, _| {
            s.hook = Some(Box::new(|n, _| {
                if n == 8 {
                    panic!("synthetic topology unwind")
                }
            }))
        })
    }));
    assert!(out.is_err());
    assert_eq!(c.made.get(), c.dropped.get());
    assert_eq!(c.live.get(), 0);
}
