use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::{
    ReleaseWatch, TopologyObservation, TopologySource,
    records::{self, RecordSource, tests::Fake as RecordFake},
    tests as topo,
};
use scan_ops::connection_owner::{
    body,
    outer_result::{DropObservation, OuterPhase, PostReleaseCheckpoint},
    release,
};

// Observe actual field destruction, not a simulated release enum. The watch is last.
struct Watched<T> {
    inner: T,
    _watch: ReleaseWatch,
}
impl<T: RecordSource> RecordSource for Watched<T> {
    type Handle = T::Handle;
    fn clock(&mut self) -> Result<records::ClockReading, Failure> {
        self.inner.clock()
    }
    fn open_anchor(&mut self, k: records::Kind) -> Result<Self::Handle, Failure> {
        self.inner.open_anchor(k)
    }
    fn open_child(&mut self, p: &Self::Handle, n: &str, d: bool) -> Result<Self::Handle, Failure> {
        self.inner.open_child(p, n, d)
    }
    fn observe(&mut self, h: &Self::Handle) -> Result<TopologyObservation, Failure> {
        self.inner.observe(h)
    }
    fn read(&mut self, h: &Self::Handle, o: u64, out: &mut [u8]) -> Result<usize, Failure> {
        self.inner.read(h, o, out)
    }
    fn revalidate(&mut self, b: [&[u8]; 3]) -> Result<RecordBinding, Failure> {
        self.inner.revalidate(b)
    }
}
impl<R, T: TopologySource<R>> TopologySource<R> for Watched<T> {
    type Temporary = T::Temporary;
    fn observe_held(&mut self, h: &R) -> Result<TopologyObservation, Failure> {
        self.inner.observe_held(h)
    }
    fn open_anchor(&mut self) -> Result<Self::Temporary, Failure> {
        self.inner.open_anchor()
    }
    fn open_child(
        &mut self,
        p: &Self::Temporary,
        n: &str,
        d: bool,
    ) -> Result<Self::Temporary, Failure> {
        self.inner.open_child(p, n, d)
    }
    fn observe_temporary(&mut self, h: &Self::Temporary) -> Result<TopologyObservation, Failure> {
        self.inner.observe_temporary(h)
    }
}
struct Scan {
    fake: Fake,
    first: bool,
    fault: Option<Case>,
}
impl ScanOps for Scan {
    type Handle = <Fake as ScanOps>::Handle;
    fn open(
        &mut self,
        p: Option<&Self::Handle>,
        n: Option<&str>,
        k: Kind,
    ) -> Result<Self::Handle, OpFailure> {
        if !std::mem::replace(&mut self.first, true) {
            let mut s = self.fake.0.borrow_mut();
            s.case = match self.fault {
                Some(Case::Failure(_)) => Case::Failure(s.calls + 1),
                Some(c) => c,
                None => Case::Good,
            };
        }
        self.fake.open(p, n, k)
    }
    fn acl_init(&mut self, h: &Self::Handle) -> Result<Self::Handle, OpFailure> {
        self.fake.acl_init(h)
    }
    fn enumerate(&mut self, h: &Self::Handle, out: &mut [u8; 255]) -> Result<EnumValue, OpFailure> {
        self.fake.enumerate(h, out)
    }
    fn read(&mut self, h: &Self::Handle, o: u64, out: &mut [u8]) -> Result<usize, OpFailure> {
        self.fake.read(h, o, out)
    }
    fn metadata(
        &mut self,
        h: &Self::Handle,
        op: MetaOp,
        out: &mut [u8],
    ) -> Result<MetaValue, OpFailure> {
        self.fake.metadata(h, op, out)
    }
    fn cleanup(&mut self, h: Self::Handle) -> Cleanup {
        self.fake.cleanup(h)
    }
}
#[derive(Clone, Copy)]
enum Mode {
    Good,
    LateCancel,
    LateDeadline,
    Receipt,
    Clock,
    M4,
    M4LateCancel,
    M4LateDeadline,
    Binding,
    Lineage,
    EntryWork,
    Prefix(u64),
    CancelPrefix(u64),
    MissingPolicy,
    Scan(usize, Case),
}
fn run(mode: Mode) {
    let (mut f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let events = Rc::new(RefCell::new(Vec::new()));
    let final_checks = Cell::new(0);
    let clock = || {
        if events.borrow().last() == Some(&"records") {
            final_checks.set(final_checks.get() + 1);
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut binding = f.receipt.binding.clone();
    let mut lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    if matches!(mode, Mode::Binding) {
        binding.generation += 1;
    }
    if matches!(mode, Mode::Lineage) {
        lineage = Rc::new(());
    }
    let bound = bind(&binding, &lineage, &target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (opened, mut topology, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, opened).unwrap();
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    if matches!(mode, Mode::Receipt) {
        f.receipt.pins[0].bytes[0] ^= 1;
    }
    if matches!(mode, Mode::Clock) {
        source.stage_fault(0, 1);
    }
    if matches!(mode, Mode::M4 | Mode::M4LateCancel | Mode::M4LateDeadline) {
        tc.adapter_fail_m4.set(true);
    }
    if matches!(mode, Mode::EntryWork) {
        b.json_work = 1_000_000;
    }
    if let Mode::Prefix(n) = mode {
        b.json_work = 1_000_000 - n;
    }
    if let Mode::CancelPrefix(n) = mode {
        let audit = crate::signature_boundary::positioned_read::work_audit::Audit::default();
        audit.cancel_after_work(n, cancel.clone());
        b.work_audit = Some(audit);
    }
    let watch = |label| {
        let events = events.clone();
        ReleaseWatch(Box::new(move || events.borrow_mut().push(label)))
    };
    let source = Watched {
        inner: source,
        _watch: watch("source"),
    };
    let ts = Watched {
        inner: ts,
        _watch: watch("topology_source"),
    };
    let tc_drop = tc.clone();
    let ev = events.clone();
    topology.release_watch = Some(ReleaseWatch(Box::new(move || {
        assert_eq!(
            tc_drop.made.get(),
            tc_drop.dropped.get(),
            "held resources still alive"
        );
        assert_eq!(&*ev.borrow(), &["source", "topology_source"]);
        ev.borrow_mut().push("topology");
    })));
    let ev = events.clone();
    let cancel_drop = cancel.clone();
    let now_drop = now.clone();
    let state_drop = state.clone();
    f.receipt.release_watch = Some(ReleaseWatch(Box::new(move || {
        assert_eq!(&*ev.borrow(), &["source", "topology_source", "topology"]);
        assert!(state_drop.borrow().alive.is_empty());
        ev.borrow_mut().push("records");
        if matches!(mode, Mode::LateCancel | Mode::M4LateCancel | Mode::Scan(..)) {
            cancel_drop.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        if matches!(mode, Mode::LateDeadline | Mode::M4LateDeadline) {
            now_drop.set(now_drop.get() + Duration::from_secs(10));
        }
    })));
    let result = release::run(
        held,
        topology,
        f.receipt,
        source,
        ts,
        body::Inputs {
            context: &c,
            scans: std::array::from_fn(|slot| Scan {
                fake: Fake(state.clone()),
                first: false,
                fault: if let Mode::Scan(i, case) = mode
                    && i == slot
                {
                    Some(case)
                } else {
                    None
                },
            }),
            resources: if matches!(mode, Mode::MissingPolicy) {
                None
            } else {
                Some(ledger_test::input(caps()))
            },
            quotas: std::array::from_fn(|_| quotas()),
        },
        &mut b,
    );
    assert_eq!(
        &*events.borrow(),
        &["source", "topology_source", "topology", "records"]
    );
    match mode {
        Mode::Good => {
            let result = result.unwrap();
            assert_eq!(
                result.entitlement_gate(),
                Err(physical_signature::Rejection::UnverifiedXml)
            );
            assert_eq!(final_checks.get(), 1);
        }
        _ => {
            let e = result.err().unwrap();
            let (phase, reason) = match mode {
                Mode::LateCancel => (OuterPhase::PostReleaseCheckpoint, Failure::Cancelled),
                Mode::LateDeadline => (OuterPhase::PostReleaseCheckpoint, Failure::Deadline),
                Mode::Receipt => (OuterPhase::Receipt, Failure::HashMismatch),
                Mode::Clock => (OuterPhase::OuterClock, Failure::ReadFailed),
                Mode::M4 | Mode::M4LateCancel | Mode::M4LateDeadline => {
                    (OuterPhase::Compare, Failure::MetadataUnavailable)
                }
                Mode::Binding | Mode::Lineage => (OuterPhase::Entry, Failure::Binding),
                Mode::EntryWork | Mode::Prefix(_) => (OuterPhase::Entry, Failure::Limit),
                Mode::CancelPrefix(_) => (OuterPhase::Entry, Failure::Cancelled),
                Mode::MissingPolicy => (OuterPhase::Entry, Failure::Unavailable),
                Mode::Scan(slot, _) => (
                    [
                        OuterPhase::Initial,
                        OuterPhase::Compare,
                        OuterPhase::AfterRound,
                    ][slot],
                    Failure::Unavailable,
                ),
                Mode::Good => unreachable!(),
            };
            assert_eq!((e.phase(), e.reason()), (phase, reason));
            assert_eq!(e.release(), DropObservation::SequenceReturned);
            assert_eq!(e.checkpoint(), PostReleaseCheckpoint::Stopped(reason));
            if phase == OuterPhase::Entry {
                assert_eq!(state.borrow().calls, 0);
            }
            assert_eq!(
                e.inner().is_some(),
                matches!(
                    mode,
                    Mode::M4 | Mode::M4LateCancel | Mode::M4LateDeadline | Mode::Scan(..)
                )
            );
            if let Mode::Scan(slot, _) = mode {
                assert_eq!(
                    e.round(),
                    Some([Round::Initial, Round::BeforeM4, Round::AfterM4][slot])
                );
                let frame =
                    scan_ops::connection_owner::testing::completion(e.inner().unwrap()).unwrap();
                assert!(frame.summary_attempts().unwrap().iter().any(|v| *v > 0));
                if slot == 0 {
                    assert!(matches!(
                        frame.cleanup(),
                        CleanupDisposition::Confirmed(_) | CleanupDisposition::Incomplete(_)
                    ));
                }
            }
        }
    }
    assert_eq!(tc.made.get(), tc.dropped.get());
    assert!(state.borrow().alive.is_empty());
}
#[test]
fn fixed_release_success_and_post_release_cancellation_deadline() {
    for mode in [Mode::Good, Mode::LateCancel, Mode::LateDeadline] {
        run(mode);
    }
}
#[test]
fn actual_scan_completion_diagnostics_survive_release_and_late_cancel() {
    for slot in 0..3 {
        for case in [Case::Failure(0), Case::CleanupUnknown] {
            run(Mode::Scan(slot, case));
        }
    }
}
#[test]
fn failures_keep_diagnostics_and_always_run_fixed_release() {
    for mode in [
        Mode::Receipt,
        Mode::Clock,
        Mode::M4,
        Mode::M4LateCancel,
        Mode::M4LateDeadline,
        Mode::Binding,
        Mode::Lineage,
        Mode::EntryWork,
        Mode::MissingPolicy,
    ] {
        run(mode);
    }
}

#[test]
fn canonical_binding_preparation_and_release_control_reject_every_work_prefix() {
    let (f, _, _) = records_stage::valid_signature_fixture();
    let bound = bind(&f.receipt.binding, &f.receipt.lineage, &f.target).unwrap();
    // Preparation 1 + K name copies + publication 1; include the body entry's first failure.
    for n in 0..=bound.chain_names.len() as u64 + 2 {
        run(Mode::Prefix(n));
    }
    for n in 1..=bound.chain_names.len() as u64 + 2 {
        run(Mode::CancelPrefix(n));
    }
}

#[test]
fn real_pending_body_requires_matching_position_and_original_budget_identity() {
    for change in 0..=6 {
        let (f, state, registry) = records_stage::valid_signature_fixture();
        let c = InspectionContext {
            registry: &registry,
            groups: &[80],
        };
        let cancel = state.borrow().cancelled.clone();
        let now = state.borrow().now.clone();
        let clock = || now.get();
        let mut b = SharedBudget::new(now.get(), &cancel);
        b.now = &clock;
        let original_claim = b.scan_session_claim.clone();
        let bound = bind(&f.receipt.binding, &f.receipt.lineage, &f.target).unwrap();
        let tc = Rc::new(topo::Counts::default());
        let (opened, topology, mut ts) = topo::setup(&bound, &tc);
        let mut held = attach(&bound, opened).unwrap();
        let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
        let pending = body::run(
            &mut held,
            &topology,
            &f.receipt,
            &mut source,
            &mut ts,
            body::Inputs {
                context: &c,
                scans: std::array::from_fn(|_| Fake(state.clone())),
                resources: Some(ledger_test::input(caps())),
                quotas: std::array::from_fn(|_| quotas()),
            },
            &mut b,
        )
        .unwrap();
        drop(source);
        drop(ts);
        drop(held);
        drop(topology);
        drop(f.receipt);
        let result = release::consume_fixture(pending, &mut b, change);
        if change == 0 {
            assert!(result.is_ok());
            assert_eq!(b.checkpoint(), Ok(()));
        } else {
            let e = result.unwrap_err();
            assert_eq!(
                (e.phase(), e.reason()),
                (OuterPhase::Release, Failure::Binding)
            );
            assert_eq!(e.release(), DropObservation::NotReached);
            assert_eq!(e.checkpoint(), PostReleaseCheckpoint::NotReached);
            assert_eq!(original_claim.failure.get(), Some(Failure::Binding));
            assert_eq!(b.checkpoint(), Err(Failure::Binding));
        }
        assert_eq!(tc.made.get(), tc.dropped.get());
        assert!(state.borrow().alive.is_empty());
    }
}
