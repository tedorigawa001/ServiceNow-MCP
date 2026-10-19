use super::super::super::collector::*;
use super::*;

#[derive(Default)]
struct Counts {
    made: RefCell<Vec<usize>>,
    dropped: RefCell<Vec<usize>>,
    reads: Cell<u32>,
    phases: RefCell<Vec<Phase>>,
    created: Cell<u32>,
    freed: Cell<u32>,
}
struct AclResource(Rc<Counts>);
impl Drop for AclResource {
    fn drop(&mut self) {
        self.0.freed.set(self.0.freed.get() + 1);
    }
}
type Hook = Box<dyn FnMut(Phase, &mut Rc<()>)>;
struct Live {
    id: usize,
    origin: Rc<()>,
    bytes: Vec<u8>,
    observed: Observation,
    counts: Rc<Counts>,
    before: Option<Hook>,
    fail: Option<Phase>,
    present: i32,
    local: bool,
}
impl Live {
    fn new(id: usize, counts: &Rc<Counts>) -> Self {
        counts.made.borrow_mut().push(id);
        let bytes = physical_signature::synthetic_file(true, false, 4096, 48);
        let mut observed = initial();
        observed.before.size = bytes.len() as u64;
        observed.after = observed.before.clone();
        Self {
            id,
            origin: Rc::new(()),
            bytes,
            observed,
            counts: counts.clone(),
            before: None,
            fail: None,
            present: 0,
            local: true,
        }
    }
}
impl Drop for Live {
    fn drop(&mut self) {
        self.counts.dropped.borrow_mut().push(self.id);
    }
}
impl ResourceOrigin for Live {
    fn resource_origin(&self) -> &Rc<()> {
        &self.origin
    }
}
impl PositionedSource for Live {
    fn pread(&mut self, offset: u64, out: &mut [u8]) -> Result<usize, IoFailure> {
        assert_eq!(self.id, 99);
        self.counts.reads.set(self.counts.reads.get() + 1);
        let start = offset as usize;
        let n = out.len().min(self.bytes.len().saturating_sub(start));
        if n > 0 {
            out[..n].copy_from_slice(&self.bytes[start..start + n]);
        }
        Ok(n)
    }
}
impl MetadataOps for Live {
    type AclHandle = AclResource;
    fn stat(&mut self, p: Phase, point: StatPoint) -> Result<Stat, OpFailure> {
        assert_eq!(self.id, 99);
        match point {
            StatPoint::Before => {
                self.counts.phases.borrow_mut().push(p);
                if let Some(hook) = &mut self.before {
                    hook(p, &mut self.origin);
                }
                if self.fail == Some(p) {
                    return Err(OpFailure::Unavailable);
                }
                Ok(self.observed.before.clone())
            }
            StatPoint::After => Ok(self.observed.after.clone()),
        }
    }
    fn filesystem(&mut self, _: Phase) -> Result<FsObservation, OpFailure> {
        Ok(FsObservation {
            location: Filesystem::Local,
            apfs: true,
            ownership_ignored: !self.local,
            noexec: false,
        })
    }
    fn acl_init(&mut self, _: Phase) -> Result<AclResource, OpFailure> {
        self.counts.created.set(self.counts.created.get() + 1);
        Ok(AclResource(self.counts.clone()))
    }
    fn acl_stat(&mut self, _: Phase, _: &mut AclResource) -> Result<Stat, OpFailure> {
        Ok(self.observed.before.clone())
    }
    fn acl_query(&mut self, _: Phase, _: &mut AclResource) -> Result<i32, OpFailure> {
        Ok(self.present)
    }
    fn acl_free(&mut self, handle: AclResource) {
        drop(handle);
    }
    fn names_size(&mut self, _: Phase) -> Result<i64, OpFailure> {
        Ok(self.observed.names.as_ref().map_or(0, |v| v.len()) as i64)
    }
    fn names_read(&mut self, _: Phase, out: &mut [u8]) -> Result<usize, OpFailure> {
        let names = self.observed.names.as_ref().ok_or(OpFailure::Unavailable)?;
        let n = names.len().min(out.len());
        out[..n].copy_from_slice(&names[..n]);
        Ok(n)
    }
}
fn target_for_bytes(bytes: &[u8]) -> TargetDeclaration {
    use sha2::{Digest, Sha256};
    let hash: [u8; 32] = Sha256::digest(bytes).into();
    let mut t = target();
    t.ledger_hash = hash;
    t.index_hash = hash;
    t.size = SizeEvidence::Indexed(bytes.len() as u64);
    t
}
fn open_live(b: &BoundTarget<'_>, counts: &Rc<Counts>) -> OpenedTarget<Live> {
    let leaf = Live::new(99, counts);
    OpenedTarget {
        lineage: b.lineage.clone(),
        records: b.records.clone(),
        target: b.target.clone(),
        root_device: 7,
        initial: leaf.observed.clone(),
        initial_origin: leaf.origin.clone(),
        leaf,
        ancestors: b
            .chain_names
            .iter()
            .enumerate()
            .map(|(id, component)| Ancestor {
                resource: Live::new(id, counts),
                component: component.clone(),
            })
            .collect(),
    }
}
fn freed(c: &Counts) {
    let mut made = c.made.borrow().clone();
    let mut dropped = c.dropped.borrow().clone();
    made.sort_unstable();
    dropped.sort_unstable();
    assert_eq!(made, dropped);
    assert!(dropped.windows(2).all(|v| v[0] != v[1]));
    assert_eq!(c.created.get(), c.freed.get());
}
fn run(
    counts: &Rc<Counts>,
    before_move: impl FnOnce(&mut OpenedTarget<Live>),
    after_move: impl FnOnce(&mut HeldTargetScope<'_, Live>),
) -> (
    Result<OpenBoundComparison, Failure>,
    Option<Failure>,
    u64,
    u32,
) {
    let cancel = AtomicBool::new(false);
    let mut budget = SharedBudget::new(Instant::now(), &cancel);
    let records = records();
    let origin = Rc::new(());
    let bytes = physical_signature::synthetic_file(true, false, 4096, 48);
    let target = target_for_bytes(&bytes);
    let bound = bind(&records, &origin, &target).unwrap();
    let mut open = open_live(&bound, counts);
    before_move(&mut open);
    let result = match attach(&bound, open) {
        Err(e) => budget.stop(e),
        Ok(mut held) => {
            after_move(&mut held);
            review_opened_target(held, &mut budget)
        }
    };
    assert_eq!(budget.reserved, 0);
    assert_eq!(budget.metadata_cleanup_reserved, 0);
    (result, budget.failed, budget.used, budget.metadata_calls)
}

#[test]
fn open_snapshot_is_compared_to_exactly_one_m0_before_any_payload_read() {
    let c = Rc::new(Counts::default());
    let (out, failed, used, calls) = run(&c, |_| {}, |_| {});
    let out = out.unwrap();
    assert_eq!(
        format!("{out:?}"),
        "OpenBoundComparison(pending_topology_records_lease_not_execution_authority)"
    );
    assert!(failed.is_none());
    assert_eq!(calls, 50);
    assert_eq!(
        *c.phases.borrow(),
        [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4]
    );
    let n = physical_signature::synthetic_file(true, false, 4096, 48).len() as u64;
    assert_eq!(used, 32 + 48 + 2 * n);
    assert_eq!(
        out.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
    freed(&c);
}
fn mutate(stat: &mut Stat, field: usize) {
    match field {
        0 => stat.device += 1,
        1 => stat.inode += 1,
        2 => stat.kind = FileType::Directory,
        3 => stat.uid += 1,
        4 => stat.gid += 1,
        5 => stat.mode = 0o755,
        6 => stat.links = 2,
        7 => stat.size += 1,
        8 => stat.mtime.seconds += 1,
        9 => stat.mtime.nanoseconds += 1,
        10 => stat.ctime.seconds += 1,
        _ => stat.ctime.nanoseconds += 1,
    }
}
#[test]
fn every_stat_difference_after_open_stops_as_changed_before_preflight() {
    for field in 0..12 {
        let c = Rc::new(Counts::default());
        let (out, failed, used, _) = run(
            &c,
            |o| {
                mutate(&mut o.leaf.observed.before, field);
                o.leaf.observed.after = o.leaf.observed.before.clone();
            },
            |_| {},
        );
        assert_eq!(out.unwrap_err(), Failure::Changed);
        assert_eq!(failed, Some(Failure::Changed));
        assert_eq!(used, 0);
        assert_eq!(c.reads.get(), 0);
        assert_eq!(*c.phases.borrow(), [Phase::M0]);
        freed(&c);
    }
}
#[test]
fn changes_after_ownership_move_are_not_accepted_as_a_new_baseline() {
    let c = Rc::new(Counts::default());
    let (out, failed, used, _) = run(
        &c,
        |_| {},
        |h| {
            h.source.leaf.observed.before.inode += 1;
            h.source.leaf.observed.after = h.source.leaf.observed.before.clone();
        },
    );
    assert_eq!(out.unwrap_err(), Failure::Changed);
    assert_eq!(failed, Some(Failure::Changed));
    assert_eq!(used, 0);
    freed(&c);
}
#[test]
fn valid_provenance_addition_or_removal_is_still_an_open_m0_change() {
    for remove in [false, true] {
        let c = Rc::new(Counts::default());
        let (out, _, used, _) = run(
            &c,
            |o| {
                let names = b"com.apple.provenance\0".to_vec();
                if remove {
                    o.initial.declared_name_bytes = names.len() as u32;
                    o.initial.names = Some(names);
                } else {
                    o.leaf.observed.names = Some(names);
                }
            },
            |_| {},
        );
        assert_eq!(out.unwrap_err(), Failure::Changed);
        assert_eq!(used, 0);
        freed(&c);
    }
}
#[test]
fn post_open_policy_failure_changes_but_query_unknown_remains_unavailable() {
    for case in 0..4 {
        let c = Rc::new(Counts::default());
        let (out, failed, used, _) = run(
            &c,
            |o| match case {
                0 => o.leaf.present = 1,
                1 => o.leaf.local = false,
                2 => o.leaf.present = -1,
                _ => o.leaf.observed.names = Some(b"secret-marker\0".to_vec()),
            },
            |_| {},
        );
        let reason = if case == 2 {
            Failure::MetadataUnavailable
        } else {
            Failure::Changed
        };
        assert_eq!(out.unwrap_err(), reason);
        assert_eq!(failed, Some(reason));
        assert_eq!(used, 0);
        freed(&c);
    }
}
#[test]
fn equal_metadata_from_a_replacement_resource_before_move_is_rejected() {
    let c = Rc::new(Counts::default());
    let (out, failed, _, calls) = run(&c, |o| o.leaf = Live::new(100, &c), |_| {});
    assert_eq!(out.unwrap_err(), Failure::Binding);
    assert_eq!(failed, Some(Failure::Binding));
    assert_eq!(calls, 0);
    assert!(c.phases.borrow().is_empty());
    assert_eq!(c.reads.get(), 0);
    freed(&c);
}
#[test]
fn equal_metadata_from_a_replacement_resource_after_move_is_rejected() {
    let c = Rc::new(Counts::default());
    let (out, failed, _, calls) = run(&c, |_| {}, |h| h.source.leaf = Live::new(100, &c));
    assert_eq!(out.unwrap_err(), Failure::SourceMismatch);
    assert_eq!(failed, Some(Failure::SourceMismatch));
    assert_eq!(calls, 0);
    assert!(c.phases.borrow().is_empty());
    assert_eq!(c.reads.get(), 0);
    freed(&c);
}
#[test]
fn transplanting_another_resources_snapshot_origin_fails_even_with_equal_values() {
    let c = Rc::new(Counts::default());
    let (out, _, _, calls) = run(
        &c,
        |o| {
            let other = Live::new(100, &c);
            o.initial = other.observed.clone();
            o.initial_origin = other.origin.clone();
        },
        |_| {},
    );
    assert_eq!(out.unwrap_err(), Failure::Binding);
    assert_eq!(calls, 0);
    freed(&c);
}
#[test]
fn origin_change_inside_collector_is_rejected_on_each_phase() {
    for phase in [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4] {
        let c = Rc::new(Counts::default());
        let (out, failed, _, _) = run(
            &c,
            |o| {
                o.leaf.before = Some(Box::new(move |p, id| {
                    if p == phase {
                        *id = Rc::new(());
                    }
                }));
            },
            |_| {},
        );
        assert_eq!(out.unwrap_err(), Failure::SourceMismatch);
        assert_eq!(failed, Some(Failure::SourceMismatch));
        if phase == Phase::M0 {
            assert_eq!(c.reads.get(), 0);
        }
        freed(&c);
    }
}
#[test]
fn acquisition_failure_does_not_fall_back_to_open_snapshot_or_read_bytes() {
    let c = Rc::new(Counts::default());
    let (out, failed, used, _) = run(&c, |o| o.leaf.fail = Some(Phase::M0), |_| {});
    assert_eq!(out.unwrap_err(), Failure::MetadataUnavailable);
    assert_eq!(failed, Some(Failure::MetadataUnavailable));
    assert_eq!(used, 0);
    assert_eq!(c.reads.get(), 0);
    freed(&c);
}
#[test]
fn delayed_or_cancelled_m0_releases_scope_and_does_not_set_a_baseline() {
    for cancelled in [false, true] {
        let c = Rc::new(Counts::default());
        let started = Instant::now();
        let now = Rc::new(Cell::new(started));
        let clock = || now.get();
        let cancel = Rc::new(AtomicBool::new(false));
        let mut budget = SharedBudget::new(started, &cancel);
        budget.now = &clock;
        let records = records();
        let origin = Rc::new(());
        let target = target_for_bytes(&physical_signature::synthetic_file(true, false, 4096, 48));
        let bound = bind(&records, &origin, &target).unwrap();
        let mut open = open_live(&bound, &c);
        let n = now.clone();
        let stop = cancel.clone();
        open.leaf.before = Some(Box::new(move |_, _| {
            if cancelled {
                stop.store(true, Ordering::Release);
            } else {
                n.set(started + Duration::from_secs(10));
            }
        }));
        let out = review_opened_target(
            attach(&bound, open).unwrap_or_else(|_| panic!("attach failed")),
            &mut budget,
        );
        let reason = if cancelled {
            Failure::Cancelled
        } else {
            Failure::Deadline
        };
        assert_eq!(out.unwrap_err(), reason);
        assert_eq!(budget.checkpoint(), Err(reason));
        assert_eq!(budget.reserved, 0);
        assert_eq!(budget.metadata_cleanup_reserved, 0);
        assert_eq!(c.reads.get(), 0);
        freed(&c);
    }
}
#[test]
fn existing_failure_prevents_m0_acquisition_and_still_drops_moved_resources() {
    let c = Rc::new(Counts::default());
    let cancel = AtomicBool::new(false);
    let mut budget = SharedBudget::new(Instant::now(), &cancel);
    let records = records();
    let origin = Rc::new(());
    let target = target_for_bytes(&physical_signature::synthetic_file(true, false, 4096, 48));
    let bound = bind(&records, &origin, &target).unwrap();
    let held = attach(&bound, open_live(&bound, &c)).unwrap_or_else(|_| panic!("attach failed"));
    budget.failed = Some(Failure::Binding);
    assert_eq!(
        review_opened_target(held, &mut budget).unwrap_err(),
        Failure::Binding
    );
    assert!(c.phases.borrow().is_empty());
    assert_eq!(budget.reserved, 0);
    freed(&c);
}

#[test]
fn unchanged_metadata_does_not_rescue_content_changed_after_move() {
    let c = Rc::new(Counts::default());
    let (out, failed, _, _) = run(&c, |_| {}, |held| held.source.leaf.bytes[100] ^= 1);
    assert_eq!(out.unwrap_err(), Failure::HashMismatch);
    assert_eq!(failed, Some(Failure::HashMismatch));
    assert!(c.reads.get() > 0);
    freed(&c);
}

#[test]
fn unwind_during_later_metadata_drops_scope_resources_and_acl_once() {
    let c = Rc::new(Counts::default());
    let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        run(
            &c,
            |o| {
                o.leaf.before = Some(Box::new(|phase, _| {
                    if phase == Phase::M1 {
                        panic!("synthetic M1 unwind");
                    }
                }));
            },
            |_| {},
        )
    }));
    assert!(out.is_err());
    freed(&c);
    assert_eq!(c.created.get(), 1);
}
