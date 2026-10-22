use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::{
    ReleaseWatch, TopologyObservation, TopologySource,
    records::{self, RecordSource, tests::Fake as RecordFake},
    tests as topo,
};
use scan_ops::connection_owner::outer_result::{
    DropObservation, OuterPhase, PostReleaseCheckpoint,
};
use scan_ops::connection_owner::{body, protected_inputs as bridge, result_owner as upper};

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
    slot: usize,
    first: bool,
    fault: Option<Case>,
    events: Rc<RefCell<Vec<u8>>>,
    starts: Rc<RefCell<Vec<(usize, usize)>>>,
}
impl Drop for Scan {
    fn drop(&mut self) {
        self.events.borrow_mut().push(self.slot as u8);
    }
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
            self.starts.borrow_mut().push((self.slot, s.trace.len()));
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
    Guard(bridge::FixtureFault),
    Prechecked,
    Foreign,
    Clock,
    M4,
    Scan(usize, Case),
    Work(u64),
    Cancel(u64),
    PreDeadline,
    PriorReason,
    LateCancel,
    LateDeadline,
    DuplicateOwner,
    ConsumedOwner,
}
fn exercise(mode: Mode) {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let other = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let events = Rc::new(RefCell::new(Vec::new()));
    let final_reads = Cell::new(0);
    let clock = || {
        if events.borrow().last() == Some(&6) {
            final_reads.set(final_reads.get() + 1);
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut foreign = SharedBudget::new(now.get(), &cancel);
    foreign.now = &clock;
    let mut owner = upper::StrictResultOwner::new();
    let mut previous = None;
    if matches!(mode, Mode::DuplicateOwner | Mode::ConsumedOwner) {
        let mut prior = SharedBudget::new(now.get(), &cancel);
        let slot = owner.begin(upper::MODEL_ID, &mut prior).unwrap();
        let first = upper::InputRejected::new(
            upper::InputStage::ReceiptBinding,
            Failure::HashMismatch,
            &mut prior,
        );
        slot.retain(Err(upper::StrictBridgeFailure::input(first)));
        if matches!(mode, Mode::ConsumedOwner) {
            previous = owner.take();
        }
    }
    let binding = f.receipt.binding.clone();
    let lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    let bound = bind(&binding, &lineage, &target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (o, mut t, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, o).unwrap();
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    if matches!(mode, Mode::Clock) {
        source.stage_fault(0, 1);
    }
    if matches!(mode, Mode::M4) {
        tc.adapter_fail_m4.set(true);
    }
    let watch = |id| {
        let e = events.clone();
        ReleaseWatch(Box::new(move || e.borrow_mut().push(id)))
    };
    let source = Watched {
        inner: source,
        _watch: watch(3),
    };
    let ts = Watched {
        inner: ts,
        _watch: watch(4),
    };
    let e = events.clone();
    let counts = tc.clone();
    let held_released = Rc::new(Cell::new(false));
    let released = held_released.clone();
    t.release_watch = Some(ReleaseWatch(Box::new(move || {
        released.set(counts.made.get() == counts.dropped.get());
        e.borrow_mut().push(5);
    })));
    let mut receipt = f.receipt;
    let e = events.clone();
    let cancel_drop = cancel.clone();
    let now_drop = now.clone();
    receipt.release_watch = Some(ReleaseWatch(Box::new(move || {
        e.borrow_mut().push(6);
        if matches!(mode, Mode::LateCancel) {
            cancel_drop.store(true, Ordering::Release);
        }
        if matches!(mode, Mode::LateDeadline) {
            now_drop.set(now_drop.get() + Duration::from_secs(10));
        }
    })));
    let starts = Rc::new(RefCell::new(Vec::new()));
    let supply = bridge::fixture(
        held,
        t,
        receipt,
        source,
        ts,
        body::Inputs {
            context: &c,
            scans: std::array::from_fn(|slot| Scan {
                fake: Fake(state.clone()),
                slot,
                first: false,
                events: events.clone(),
                starts: starts.clone(),
                fault: if let Mode::Scan(i, c) = mode
                    && i == slot
                {
                    Some(c)
                } else {
                    None
                },
            }),
            resources: Some(ledger_test::input(caps())),
            quotas: std::array::from_fn(|_| quotas()),
        },
        &b,
    );
    let mut bundle = bridge::create(supply, bridge::MODEL_ID, &mut b).unwrap();
    if let Mode::Guard(f) = mode {
        bundle.fixture_change(f, &other);
    }
    if matches!(mode, Mode::Prechecked) {
        bundle.require_use(bridge::MODEL_ID, &mut b).unwrap();
    }
    if let Mode::Work(n) = mode {
        b.json_work = 1_000_000 - n;
    }
    if let Mode::Cancel(n) = mode {
        let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
        a.cancel_after_work(n, cancel.clone());
        b.work_audit = Some(a);
    }
    if matches!(mode, Mode::PreDeadline) {
        now.set(b.started + Duration::from_secs(10));
    }
    if matches!(mode, Mode::PriorReason) {
        let _ = b.stop::<()>(Failure::HashMismatch);
    }
    let signal = if matches!(mode, Mode::Foreign) {
        owner.run_protected(bundle, &mut foreign)
    } else {
        owner.run_protected(bundle, &mut b)
    };
    let expected = if matches!(mode, Mode::Guard(bridge::FixtureFault::SwapScans)) {
        [2, 1, 0, 3, 4, 5, 6]
    } else {
        [0, 1, 2, 3, 4, 5, 6]
    };
    assert_eq!(&*events.borrow(), &expected);
    assert!(held_released.get());
    assert!(state.borrow().alive.is_empty());
    if matches!(mode, Mode::DuplicateOwner | Mode::ConsumedOwner) {
        assert_eq!(signal, Err(Failure::Binding));
        assert_eq!(b.checkpoint(), Err(Failure::Binding));
        assert!(starts.borrow().is_empty());
        let first = if matches!(mode, Mode::DuplicateOwner) {
            owner.take().unwrap().unwrap_err()
        } else {
            assert!(owner.take().is_none());
            previous.unwrap().unwrap_err()
        };
        assert_eq!(first.reason(), Failure::HashMismatch);
        assert_eq!(first.input_stage(), Some(upper::InputStage::ReceiptBinding));
        assert_eq!(first.release(), DropObservation::NotReached);
        assert_eq!(first.checkpoint(), PostReleaseCheckpoint::NotReached);
        assert!(owner.take().is_none());
        return;
    }
    if matches!(mode, Mode::Good) {
        assert_eq!(signal, Ok(()));
        assert_eq!(final_reads.get(), 1);
        assert_eq!(b.checkpoint(), Ok(()));
        assert!(owner.take().unwrap().is_ok());
        assert_eq!(starts.borrow().len(), 3);
        return;
    }
    let error = owner.take().unwrap().unwrap_err();
    let reason = error.reason();
    assert_eq!(signal, Err(reason));
    assert_eq!(b.checkpoint(), Err(reason));
    assert!(owner.take().is_none());
    if matches!(mode, Mode::Foreign) {
        assert_eq!(foreign.checkpoint(), Err(reason));
    }
    assert_eq!(error.release(), DropObservation::SequenceReturned);
    assert_eq!(error.checkpoint(), PostReleaseCheckpoint::Stopped(reason));
    match mode {
        Mode::Guard(f) => {
            use bridge::FixtureFault::*;
            assert_eq!(
                reason,
                if matches!(f, MissingPolicy | MissingQuota(_)) {
                    Failure::Unavailable
                } else {
                    Failure::Binding
                }
            );
            let stage = match f {
                Context => upper::InputStage::ContextBinding,
                Lineage | Binding | TopologyLineage | TopologyBinding | Target => {
                    upper::InputStage::ReceiptBinding
                }
                HeldOrigin | Source | TopologySource => upper::InputStage::SourceBinding,
                Policy | MissingPolicy => upper::InputStage::PolicyBinding,
                _ => upper::InputStage::SlotBinding,
            };
            assert_eq!(error.input_stage(), Some(stage));
            assert!(starts.borrow().is_empty());
        }
        Mode::Prechecked => {
            assert_eq!(reason, Failure::Binding);
            assert_eq!(
                error.input_stage(),
                Some(upper::InputStage::ModelInputUnavailable)
            );
        }
        Mode::Foreign => {
            assert_eq!(reason, Failure::Binding);
            assert_eq!(
                error.input_stage(),
                Some(upper::InputStage::InspectionBinding)
            );
            assert!(starts.borrow().is_empty());
        }
        Mode::Clock => {
            assert_eq!(error.outer_phase(), Some(OuterPhase::OuterClock));
            assert!(starts.borrow().is_empty());
        }
        Mode::M4 => {
            assert_eq!(error.outer_phase(), Some(OuterPhase::Compare));
            assert_eq!(starts.borrow().len(), 2);
        }
        Mode::Scan(slot, _) => {
            assert_eq!(
                error.round(),
                Some([Round::Initial, Round::BeforeM4, Round::AfterM4][slot])
            );
            assert_eq!(starts.borrow().len(), slot + 1);
            let begin = starts.borrow().last().unwrap().1;
            let s = state.borrow();
            let mut counts = [0; 5];
            for (op, _) in &s.trace[begin..] {
                counts[*op as usize] += 1;
            }
            assert_eq!(
                error.completion().unwrap().summary.unwrap().attempts,
                counts
            );
        }
        Mode::Work(n) | Mode::Cancel(n) => {
            assert_eq!(
                reason,
                if matches!(mode, Mode::Work(_)) {
                    Failure::Limit
                } else {
                    Failure::Cancelled
                }
            );
            if n < 13 || matches!(mode, Mode::Cancel(13)) {
                use upper::InputStage::*;
                let stages = [
                    ModelInputUnavailable,
                    ModelInputUnavailable,
                    ModelInputUnavailable,
                    InspectionBinding,
                    ContextBinding,
                    ReceiptBinding,
                    SourceBinding,
                    PolicyBinding,
                    SlotBinding,
                    SlotBinding,
                    SlotBinding,
                    InspectionBinding,
                    InspectionBinding,
                ];
                let i = if matches!(mode, Mode::Cancel(_)) {
                    n - 1
                } else {
                    n
                };
                assert_eq!(error.input_stage(), Some(stages[i as usize]));
                assert!(starts.borrow().is_empty());
            } else {
                assert_eq!(error.outer_phase(), Some(OuterPhase::Entry));
            }
        }
        Mode::PreDeadline => {
            assert_eq!(reason, Failure::Deadline);
            assert_eq!(
                error.input_stage(),
                Some(upper::InputStage::ModelInputUnavailable)
            );
            assert!(starts.borrow().is_empty());
        }
        Mode::PriorReason => {
            assert_eq!(reason, Failure::HashMismatch);
            assert_eq!(
                error.input_stage(),
                Some(upper::InputStage::ModelInputUnavailable)
            );
            assert!(starts.borrow().is_empty());
        }
        Mode::LateCancel | Mode::LateDeadline => {
            assert_eq!(error.outer_phase(), Some(OuterPhase::PostReleaseCheckpoint));
            assert!(error.completion().is_none());
        }
        Mode::Good | Mode::DuplicateOwner | Mode::ConsumedOwner => unreachable!(),
    }
}

#[test]
fn fixed_caller_duplicate_start_drops_new_inputs_without_replacing_the_first_diagnostic() {
    exercise(Mode::DuplicateOwner);
    exercise(Mode::ConsumedOwner);
}

#[test]
fn fixed_caller_guard_rejections_release_all_inputs_before_retaining_input_diagnostics() {
    use bridge::FixtureFault::*;
    for f in [
        Context,
        Lineage,
        Binding,
        TopologyLineage,
        TopologyBinding,
        Target,
        HeldOrigin,
        Source,
        TopologySource,
        Policy,
        MissingPolicy,
        SwapScans,
    ] {
        exercise(Mode::Guard(f));
    }
    for i in 0..3 {
        exercise(Mode::Guard(ScanSupply(i)));
        exercise(Mode::Guard(QuotaSupply(i)));
        exercise(Mode::Guard(MissingQuota(i)));
    }
    exercise(Mode::Prechecked);
    exercise(Mode::Foreign);
}
#[test]
fn fixed_caller_outer_failures_keep_actual_round_summary_and_stop_later_stages() {
    exercise(Mode::Clock);
    exercise(Mode::M4);
    for slot in 0..3 {
        for case in [Case::Failure(0), Case::Corrupt, Case::CleanupUnknown] {
            exercise(Mode::Scan(slot, case));
        }
    }
}
#[test]
fn fixed_caller_checks_each_budget_boundary_and_rejects_post_release_late_results() {
    for n in 0..=13 {
        exercise(Mode::Work(n));
    }
    for n in 1..=14 {
        exercise(Mode::Cancel(n));
    }
    exercise(Mode::PreDeadline);
    exercise(Mode::PriorReason);
    exercise(Mode::LateCancel);
    exercise(Mode::LateDeadline);
    exercise(Mode::Good);
}

#[test]
fn fixed_caller_transfers_the_original_bundle_and_retains_real_success() {
    assert_eq!(success_work(true) - success_work(false), 15);
}
fn success_work(protected: bool) -> u64 {
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
    let mut owner = upper::StrictResultOwner::new();
    let binding = f.receipt.binding.clone();
    let lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    let bound = bind(&binding, &lineage, &target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (o, t, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, o).unwrap();
    let source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let inputs = body::Inputs {
        context: &c,
        scans: std::array::from_fn(|_| Fake(state.clone())),
        resources: Some(ledger_test::input(caps())),
        quotas: std::array::from_fn(|_| quotas()),
    };
    let success = if protected {
        let supply = bridge::fixture(held, t, f.receipt, source, ts, inputs, &b);
        let bundle = bridge::create(supply, bridge::MODEL_ID, &mut b).unwrap();
        assert_eq!(owner.run_protected(bundle, &mut b), Ok(()));
        assert!(owner.failure().is_none());
        owner.take().unwrap().unwrap()
    } else {
        scan_ops::connection_owner::release::run(held, t, f.receipt, source, ts, inputs, &mut b)
            .unwrap()
    };
    assert_eq!(b.checkpoint(), Ok(()));
    assert!(owner.failure().is_none());
    assert_eq!(tc.made.get(), tc.dropped.get());
    assert!(state.borrow().alive.is_empty());
    assert_eq!(
        success.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
    assert!(owner.take().is_none());
    b.json_work
}
