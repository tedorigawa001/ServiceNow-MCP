use super::super::super::completion;
use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::Kind as RecordKind;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use records_stage::valid_fixture;
use scan_ops::connection_owner::{self as owner, testing as ot};

struct Inert {
    scan: Option<Fake>,
    slot: usize,
    drops: Rc<[Cell<u32>; 3]>,
}
impl Drop for Inert {
    fn drop(&mut self) {
        self.drops[self.slot].set(self.drops[self.slot].get() + 1);
    }
}
fn scans(state: &Rc<RefCell<State>>, drops: &Rc<[Cell<u32>; 3]>) -> [Inert; 3] {
    std::array::from_fn(|slot| Inert {
        scan: Some(Fake(state.clone())),
        slot,
        drops: drops.clone(),
    })
}
// Instrument one RecordSource object; neither owner nor test runner can replace it.
struct Reader {
    fake: RecordFake,
    calls: Rc<RefCell<Vec<u8>>>,
    dropped: Rc<Cell<bool>>,
}
impl Reader {
    fn mark(&self) {
        self.calls.borrow_mut().push(7);
    }
}
impl Drop for Reader {
    fn drop(&mut self) {
        self.dropped.set(true);
    }
}
impl RecordSource for Reader {
    type Handle = <RecordFake as RecordSource>::Handle;
    fn clock(&mut self) -> Result<ClockReading, Failure> {
        self.mark();
        self.fake.clock()
    }
    fn open_anchor(&mut self, k: RecordKind) -> Result<Self::Handle, Failure> {
        self.mark();
        self.fake.open_anchor(k)
    }
    fn open_child(&mut self, p: &Self::Handle, n: &str, d: bool) -> Result<Self::Handle, Failure> {
        self.mark();
        self.fake.open_child(p, n, d)
    }
    fn observe(&mut self, h: &Self::Handle) -> Result<TopologyObservation, Failure> {
        self.mark();
        self.fake.observe(h)
    }
    fn read(&mut self, h: &Self::Handle, o: u64, v: &mut [u8]) -> Result<usize, Failure> {
        self.mark();
        self.fake.read(h, o, v)
    }
    fn revalidate(&mut self, _: [&[u8]; 3]) -> Result<RecordBinding, Failure> {
        panic!("projection forbidden")
    }
}

#[derive(Clone, Copy)]
enum Full {
    Good,
    OuterFail,
    TailFail,
    FalseSuccess,
    NoPolicy,
}
fn full(mode: Full) {
    let (f, state, registry) = valid_fixture(false);
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let calls = Rc::new(RefCell::new(Vec::new()));
    let dropped = Rc::new(Cell::new(false));
    let mut source = Reader {
        fake: RecordFake::for_stage(&f.receipt, &now, now.get()),
        calls: calls.clone(),
        dropped: dropped.clone(),
    };
    let drops = Rc::new(std::array::from_fn(|_| Cell::new(0)));
    let mut o = owner::create(
        &mut source,
        &f.receipt,
        &f.target,
        &c,
        scans(&state, &drops),
        "bp5-r2-strict-owner-0.1",
        &mut b,
    )
    .unwrap();
    assert_eq!(b.json_work, 4);
    assert_eq!(
        format!("{o:?}"),
        "StrictSessionOwner(internal_pending_connection_not_authority)"
    );
    if !matches!(mode, Full::NoPolicy) {
        ledger_test::configure(ot::ledger(&mut o), caps(), &mut b).unwrap();
    }
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let before = b.json_work;
        let mut slot = ot::take(&mut o, round, &mut b).unwrap();
        assert_eq!(format!("{slot:?}"), "RoundSlot(owned_pending_fixed_kernel)");
        assert_eq!(b.json_work - before, 2);
        slot.precheck_records(&mut b).unwrap();
        let result = ot::run(slot, &mut b, |mut inert, ledger, source, b| {
            if matches!(mode, Full::FalseSuccess) {
                return (Ok(()), None);
            }
            let mut failure = None;
            let result =
                round_declaration::with_round(&f.receipt, &f.target, &c, round, b, |scope, b| {
                    macro_rules! stage {
                        ($e:expr) => {
                            match $e {
                                Ok(v) => v,
                                Err(e) => {
                                    let reason = e.reason();
                                    failure = Some(e);
                                    return Err(reason);
                                }
                            }
                        };
                    }
                    let d = scope.decode(b)?;
                    let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = phases.bind_inputs(scope, b)?;
                    let lease = ledger.begin(scope, b)?;
                    let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
                    let e = calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
                    let pending = stage!(completion::collect_and_complete(
                        lease,
                        e,
                        &inputs,
                        scope,
                        (inert.scan.take().unwrap(), quotas()),
                        b
                    ));
                    drop(inputs);
                    let after = stage!(pending.after_scan(&mut phases, b));
                    if matches!(mode, Full::TailFail) {
                        let _ = b.stop::<()>(Failure::Changed);
                    }
                    let r = stage!(after.revalidate_records(source, &phases, b));
                    let i = stage!(r.verify_final_index(&mut phases, b));
                    let clock = stage!(i.verify_final_clock(source, &phases, b));
                    stage!(clock.acknowledge(&phases, b));
                    Ok(())
                });
            (result, failure)
        });
        if matches!(mode, Full::TailFail | Full::FalseSuccess | Full::NoPolicy) {
            let e = result.unwrap_err();
            assert_eq!(
                format!("{e:?}"),
                "StrictInspectionFailure(diagnostics_only)"
            );
            assert_eq!(
                e.reason(),
                if matches!(mode, Full::TailFail) {
                    Failure::Changed
                } else if matches!(mode, Full::NoPolicy) {
                    Failure::Unavailable
                } else {
                    Failure::Binding
                }
            );
            assert_eq!(
                ot::details(&e),
                (Some(round), matches!(mode, Full::TailFail | Full::NoPolicy))
            );
            if let Some(e) = ot::completion(&e) {
                if matches!(mode, Full::NoPolicy) {
                    assert!(matches!(e.cleanup(), CleanupDisposition::NotStarted));
                    assert!(e.summary_attempts().is_none());
                    assert_eq!(state.borrow().calls, 0);
                } else {
                    assert!(matches!(e.cleanup(), CleanupDisposition::Confirmed(_)));
                    assert!(e.summary_attempts().is_some());
                }
            }
            assert!(o.initial(&mut b).is_err());
            break;
        }
        result.unwrap();
    }
    if matches!(mode, Full::OuterFail) {
        let e = o.stop_inspection(Failure::ReadFailed, &mut b);
        assert_eq!(e.reason(), Failure::ReadFailed);
        assert_eq!(ot::details(&e), (None, false));
        assert_eq!(b.checkpoint(), Err(Failure::ReadFailed));
        assert_eq!(
            o.stop_inspection(Failure::Changed, &mut b).reason(),
            Failure::ReadFailed
        );
        assert!(o.initial(&mut b).is_err());
    }
    if matches!(mode, Full::Good | Full::OuterFail) {
        assert_eq!(ot::remaining(&o), [false; 3]);
    }
    drop(o);
    assert!(!dropped.get());
    assert!(calls.borrow().iter().all(|id| *id == 7));
    if matches!(mode, Full::Good | Full::OuterFail) {
        assert_eq!(source.fake.stage_cycles(), 6);
        let (_, made, freed, _) = source.fake.stage_counts();
        assert_eq!(made, freed);
    }
    assert_eq!(std::array::from_fn::<_, 3, _>(|i| drops[i].get()), [1; 3]);
    if matches!(mode, Full::Good) {
        assert_eq!(b.checkpoint(), Ok(()));
    }
    drop(source);
    assert!(dropped.get());
}
#[test]
fn same_record_source_and_three_inert_slots_survive_actual_ack_pipeline() {
    full(Full::Good);
}
#[test]
fn outer_failure_after_finished_and_actual_tail_diagnostics_are_preserved() {
    full(Full::OuterFail);
    full(Full::TailFail);
}
#[test]
fn synthetic_callback_ok_cannot_substitute_for_typed_ack() {
    full(Full::FalseSuccess);
}
#[test]
fn unprovided_policy_never_turns_into_default_operational_caps() {
    full(Full::NoPolicy);
}

#[derive(Clone, Copy)]
enum Fault {
    Model,
    CreateWork(u64),
    CreateCancel(u64),
    CreateDeadline(u64),
    SlotWork(u64),
    SlotCancel(u64),
    SlotDeadline(u64),
    WrongRound,
    Origin,
    Claim,
    Started,
    Drop,
    Forget,
    PreTwice,
    PreFail,
    PreCancel,
    PreDeadline,
    Recreate,
    OuterEarly,
    SlotOuter,
    Prior,
}
fn fault(mode: Fault) {
    let (f, state, registry) = valid_fixture(false);
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let active = Cell::new(false);
    let checks = Cell::new(0);
    let clock = || {
        if active.get() {
            checks.set(checks.get() + 1);
        }
        if let Fault::SlotDeadline(at) | Fault::CreateDeadline(at) = mode
            && active.get()
            && checks.get() >= at
        {
            now.get() + Duration::from_secs(10)
        } else {
            now.get()
        }
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let calls = Rc::new(RefCell::new(Vec::new()));
    let dropped = Rc::new(Cell::new(false));
    let mut source = Reader {
        fake: RecordFake::for_stage(&f.receipt, &now, now.get()),
        calls: calls.clone(),
        dropped,
    };
    if matches!(mode, Fault::PreFail) {
        source.fake.stage_fault(0, 1);
    }
    if matches!(mode, Fault::PreCancel | Fault::PreDeadline) {
        source.fake.stage_interrupt(
            1,
            cancel.clone(),
            if matches!(mode, Fault::PreDeadline) {
                Some(b.started + Duration::from_secs(10))
            } else {
                None
            },
        );
    }
    let drops = Rc::new(std::array::from_fn(|_| Cell::new(0)));
    if let Fault::CreateWork(n) = mode {
        b.json_work = 1_000_000 - n;
    }
    if let Fault::CreateCancel(at) = mode {
        let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
        a.cancel_after_work(at, cancel.clone());
        b.work_audit = Some(a);
    }
    active.set(matches!(mode, Fault::CreateDeadline(_)));
    let created = owner::create(
        &mut source,
        &f.receipt,
        &f.target,
        &c,
        scans(&state, &drops),
        if matches!(mode, Fault::Model) {
            "wrong"
        } else {
            "bp5-r2-strict-owner-0.1"
        },
        &mut b,
    );
    active.set(false);
    if matches!(
        mode,
        Fault::Model | Fault::CreateWork(_) | Fault::CreateCancel(_) | Fault::CreateDeadline(_)
    ) {
        assert_eq!(
            created.unwrap_err().reason(),
            if matches!(mode, Fault::Model) {
                Failure::Unavailable
            } else if matches!(mode, Fault::CreateCancel(_)) {
                Failure::Cancelled
            } else if matches!(mode, Fault::CreateDeadline(_)) {
                Failure::Deadline
            } else {
                Failure::Limit
            }
        );
        assert!(b.scan_session_claim.started.get());
        assert!(calls.borrow().is_empty());
    } else {
        let mut o = created.unwrap();
        if matches!(mode, Fault::OuterEarly) {
            assert_eq!(
                o.stop_inspection(Failure::ReadFailed, &mut b).reason(),
                Failure::ReadFailed
            );
        }
        if matches!(mode, Fault::Recreate) {
            let mut other = RecordFake::for_stage(&f.receipt, &now, now.get());
            let other_drops = Rc::new(std::array::from_fn(|_| Cell::new(0)));
            assert_eq!(
                owner::create(
                    &mut other,
                    &f.receipt,
                    &f.target,
                    &c,
                    scans(&state, &other_drops),
                    "bp5-r2-strict-owner-0.1",
                    &mut b
                )
                .unwrap_err()
                .reason(),
                Failure::Binding
            );
            assert_eq!(
                std::array::from_fn::<_, 3, _>(|i| other_drops[i].get()),
                [1; 3]
            );
        }
        match mode {
            Fault::SlotWork(n) => b.json_work = 1_000_000 - n,
            Fault::SlotCancel(at) => {
                let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
                a.cancel_after_work(at, cancel.clone());
                b.work_audit = Some(a);
            }
            Fault::Origin => b.inspection_origin = Rc::new(()),
            Fault::Claim => b.scan_session_claim = Rc::new(Default::default()),
            Fault::Started => b.started -= Duration::from_millis(1),
            Fault::Prior => {
                let _ = b.stop::<()>(Failure::Changed);
            }
            _ => {}
        }
        active.set(true);
        let result = if matches!(mode, Fault::WrongRound) {
            ot::take(&mut o, Round::AfterM4, &mut b)
        } else {
            o.initial(&mut b)
        };
        active.set(false);
        let expected = match mode {
            Fault::SlotWork(_) => Failure::Limit,
            Fault::SlotCancel(_) => Failure::Cancelled,
            Fault::SlotDeadline(_) => Failure::Deadline,
            Fault::Prior => Failure::Changed,
            Fault::OuterEarly => Failure::ReadFailed,
            _ => Failure::Binding,
        };
        if matches!(
            mode,
            Fault::Drop
                | Fault::Forget
                | Fault::PreTwice
                | Fault::PreFail
                | Fault::PreCancel
                | Fault::PreDeadline
                | Fault::SlotOuter
        ) {
            let mut slot = result.unwrap();
            if matches!(
                mode,
                Fault::PreTwice | Fault::PreFail | Fault::PreCancel | Fault::PreDeadline
            ) {
                if matches!(mode, Fault::PreFail | Fault::PreCancel | Fault::PreDeadline) {
                    assert_eq!(
                        slot.precheck_records(&mut b).unwrap_err().reason(),
                        match mode {
                            Fault::PreCancel => Failure::Cancelled,
                            Fault::PreDeadline => Failure::Deadline,
                            _ => Failure::ReadFailed,
                        }
                    );
                } else {
                    slot.precheck_records(&mut b).unwrap();
                    let n = calls.borrow().len();
                    assert_eq!(
                        slot.precheck_records(&mut b).unwrap_err().reason(),
                        Failure::Binding
                    );
                    assert_eq!(calls.borrow().len(), n);
                }
            }
            if matches!(mode, Fault::SlotOuter) {
                let e = slot.stop_inspection(Failure::ReadFailed, &mut b);
                assert_eq!(e.reason(), Failure::ReadFailed);
                assert_eq!(ot::details(&e), (Some(Round::Initial), false));
                assert_eq!(
                    o.stop_inspection(Failure::Changed, &mut b).reason(),
                    Failure::ReadFailed
                );
            } else if matches!(mode, Fault::Forget) {
                std::mem::forget(slot);
            } else {
                drop(slot);
            }
        } else {
            assert_eq!(result.unwrap_err().reason(), expected);
            assert_eq!(b.checkpoint(), Err(expected));
        }
        let n = calls.borrow().len();
        if !matches!(
            mode,
            Fault::PreTwice | Fault::PreFail | Fault::PreCancel | Fault::PreDeadline
        ) {
            assert_eq!(n, 0);
        }
        assert!(o.initial(&mut b).is_err());
        assert_eq!(calls.borrow().len(), n);
        drop(o);
    }
    assert_eq!(
        std::array::from_fn::<_, 3, _>(|i| drops[i].get()),
        if matches!(mode, Fault::Forget) {
            [0, 1, 1]
        } else {
            [1; 3]
        }
    );
}
#[test]
fn creation_model_and_each_work_prefix_stop_without_record_io() {
    fault(Fault::Model);
    for n in 0..4 {
        fault(Fault::CreateWork(n));
    }
}
#[test]
fn every_creation_checkpoint_and_post_charge_cancel_consumes_unique_claim() {
    for at in 1..=10 {
        fault(Fault::CreateDeadline(at));
    }
    for at in 1..=4 {
        fault(Fault::CreateCancel(at));
    }
    fault(Fault::Recreate);
}
#[test]
fn slot_binding_order_and_each_budget_boundary_fail_closed() {
    for m in [
        Fault::WrongRound,
        Fault::Origin,
        Fault::Claim,
        Fault::Started,
        Fault::Prior,
    ] {
        fault(m);
    }
    for n in 0..2 {
        fault(Fault::SlotWork(n));
    }
    for at in 1..=2 {
        fault(Fault::SlotCancel(at));
    }
    for at in 1..=6 {
        fault(Fault::SlotDeadline(at));
    }
}
#[test]
fn unconsumed_slot_drop_forget_and_record_precheck_failure_block_restart() {
    for m in [
        Fault::Drop,
        Fault::Forget,
        Fault::PreTwice,
        Fault::PreFail,
        Fault::PreCancel,
        Fault::PreDeadline,
        Fault::SlotOuter,
    ] {
        fault(m);
    }
}
#[test]
fn outer_stop_before_slot_consumption_preserves_first_failure() {
    fault(Fault::OuterEarly);
}
#[test]
fn owner_slot_and_diagnostics_are_opaque_noncopy_nonserde_values() {
    use owner::{RoundSlot, StrictInspectionFailure, StrictSessionOwner};
    macro_rules! not_impl {
        ($t:ty,$bound:path) => {{
            trait Ambiguous<A> {
                fn check() {}
            }
            impl<T: ?Sized> Ambiguous<()> for T {}
            impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
            let _ = <$t as Ambiguous<_>>::check;
        }};
    }
    macro_rules! opaque {
        ($t:ty) => {{
            not_impl!($t, Clone);
            not_impl!($t, Copy);
            not_impl!($t, serde::Serialize);
            not_impl!($t, serde::de::DeserializeOwned);
        }};
    }
    opaque!(StrictSessionOwner<'_, '_, Reader, Inert>);
    opaque!(RoundSlot<'_, '_, '_, Reader, Inert>);
    opaque!(StrictInspectionFailure);
    assert!(std::mem::size_of::<StrictInspectionFailure>() <= 256);
}

#[test]
fn owner_precheck_adds_only_two_guard_work_to_the_actual_record_path() {
    let (f, state, registry) = valid_fixture(false);
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut baseline = SharedBudget::new(now.get(), &cancel);
    baseline.now = &clock;
    let mut legacy = RecordFake::for_stage(&f.receipt, &now, now.get());
    reread_bytes(&mut legacy, &f.receipt, &mut baseline).unwrap();
    let reading = clock_check(&mut legacy, &f.receipt, &mut baseline, 450_000).unwrap();
    verify_records(&f.receipt, &f.target, &c, reading.wall_ms, &mut baseline).unwrap();
    for cancel_last in [false, true] {
        cancel.store(false, Ordering::Release);
        let mut b = SharedBudget::new(now.get(), &cancel);
        b.now = &clock;
        let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
        let drops = Rc::new(std::array::from_fn(|_| Cell::new(0)));
        let mut o = owner::create(
            &mut source,
            &f.receipt,
            &f.target,
            &c,
            scans(&state, &drops),
            "bp5-r2-strict-owner-0.1",
            &mut b,
        )
        .unwrap();
        let mut slot = o.initial(&mut b).unwrap();
        let before = (b.json_work, b.used, b.topology_calls, b.retries_left);
        if cancel_last {
            let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
            a.cancel_after_work(baseline.json_work + 2, cancel.clone());
            b.work_audit = Some(a);
        }
        let result = slot.precheck_records(&mut b);
        if cancel_last {
            assert_eq!(result.unwrap_err().reason(), Failure::Cancelled);
        } else {
            result.unwrap();
        }
        assert_eq!(b.json_work - before.0, baseline.json_work + 2);
        assert_eq!(b.used - before.1, baseline.used);
        assert_eq!(b.topology_calls - before.2, baseline.topology_calls);
        assert_eq!(b.retries_left, before.3);
        drop(slot);
        drop(o);
        assert_eq!(source.stage_cycles(), 1);
        assert_eq!(state.borrow().calls, 0);
        assert_eq!(std::array::from_fn::<_, 3, _>(|i| drops[i].get()), [1; 3]);
    }
}
