use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::tests as topo;
use scan_ops::connection_owner::{
    body,
    outer_result::{DropObservation, OuterPhase, PostReleaseCheckpoint},
};

#[test]
fn private_body_rejects_missing_resource_input_before_receipt_clock_or_owner() {
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
    let bound = bind(&f.receipt.binding, &f.receipt.lineage, &f.target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (opened, topology, mut ts) = topo::setup(&bound, &tc);
    let mut held = attach(&bound, opened).unwrap();
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let e = body::run(
        &mut held,
        &topology,
        &f.receipt,
        &mut source,
        &mut ts,
        body::Inputs {
            context: &c,
            scans: std::array::from_fn(|_| Fake(state.clone())),
            resources: None,
            quotas: std::array::from_fn(|_| quotas()),
        },
        &mut b,
    )
    .unwrap_err();
    assert_eq!(e.reason(), Failure::Unavailable);
    assert_eq!(e.phase(), OuterPhase::Entry);
    assert_eq!(e.release(), DropObservation::NotReached);
    assert_eq!(e.checkpoint(), PostReleaseCheckpoint::NotReached);
    assert!(e.inner().is_none());
    assert_eq!(source.stage_counts().0, 0);
    assert_eq!(state.borrow().calls, 0);
    assert!(!b.scan_session_claim.started.get());
}

type Starts = Rc<RefCell<Vec<(usize, Vec<Phase>)>>>;
struct Scan {
    fake: Fake,
    slot: usize,
    tc: Rc<topo::Counts>,
    starts: Starts,
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
            self.starts
                .borrow_mut()
                .push((self.slot, self.tc.phases.borrow().clone()));
            let mut s = self.fake.0.borrow_mut();
            s.case = match self.fault {
                Some(Case::Failure(_)) => Case::Failure(s.calls + 1),
                Some(case) => case,
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
enum Fault {
    Good,
    Receipt,
    ClockFail,
    ClockSkew,
    ClockCancel,
    ClockDeadline,
    Scan(usize, Case),
    M4,
    NoQuota,
    Work(u64),
    CancelWork(u64),
    Deadline(u64),
}
struct Report {
    work: u64,
    checks: u64,
    phase: Option<OuterPhase>,
    reason: Option<Failure>,
    cycles: usize,
    starts: usize,
    claim: bool,
}
fn run(fault: Fault) -> Report {
    let (mut f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let checks = Cell::new(0);
    let clock = || {
        checks.set(checks.get() + 1);
        if let Fault::Deadline(at) = fault
            && checks.get() >= at
        {
            return now.get() + Duration::from_secs(10);
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let bound = bind(&f.receipt.binding, &f.receipt.lineage, &f.target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (opened, topology, mut ts) = topo::setup(&bound, &tc);
    let mut held = attach(&bound, opened).unwrap();
    let starts = Rc::new(RefCell::new(Vec::new()));
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    match fault {
        Fault::Receipt => f.receipt.pins[0].bytes[0] ^= 1,
        Fault::ClockFail => source.stage_fault(0, 1),
        Fault::ClockSkew => source.stage_fault(7, 0),
        Fault::ClockCancel => source.stage_interrupt(1, cancel.clone(), None),
        Fault::ClockDeadline => {
            source.stage_interrupt(1, cancel.clone(), Some(b.started + Duration::from_secs(10)))
        }
        Fault::M4 => tc.adapter_fail_m4.set(true),
        Fault::Work(n) => b.json_work = 1_000_000 - n,
        Fault::CancelWork(at) => {
            let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
            a.cancel_after_work(at, cancel.clone());
            b.work_audit = Some(a);
        }
        _ => (),
    }
    let before = b.json_work;
    let inputs = body::Inputs {
        context: &c,
        resources: Some(ledger_test::input(caps())),
        quotas: std::array::from_fn(|i| {
            if matches!(fault, Fault::NoQuota) && i == 2 {
                None
            } else {
                quotas()
            }
        }),
        scans: std::array::from_fn(|slot| Scan {
            fake: Fake(state.clone()),
            slot,
            tc: tc.clone(),
            starts: starts.clone(),
            first: false,
            fault: if let Fault::Scan(i, case) = fault
                && i == slot
            {
                Some(case)
            } else {
                None
            },
        }),
    };
    let result = body::run(
        &mut held,
        &topology,
        &f.receipt,
        &mut source,
        &mut ts,
        inputs,
        &mut b,
    );
    let work = b.json_work - before;
    let observed_checks = checks.get();
    let (phase, reason) = match result {
        Ok(pending) => {
            assert!(matches!(fault, Fault::Good));
            assert_eq!(
                format!("{pending:?}"),
                "PendingBody(before_release_not_execution_authority)"
            );
            assert_eq!(
                pending.entitlement_gate(),
                Err(physical_signature::Rejection::UnverifiedXml)
            );
            assert_eq!(b.checkpoint(), Ok(()));
            drop(pending);
            (None, None)
        }
        Err(e) => {
            assert_eq!(e.release(), DropObservation::NotReached);
            assert_eq!(e.checkpoint(), PostReleaseCheckpoint::NotReached);
            if e.phase() == OuterPhase::BodyCheckpoint {
                assert!(e.inner().is_some());
                assert!(
                    scan_ops::connection_owner::testing::completion(e.inner().unwrap()).is_none()
                );
                assert_eq!(e.round(), None);
            }
            if let Fault::Scan(slot, case) = fault {
                assert_eq!(
                    e.round(),
                    Some([Round::Initial, Round::BeforeM4, Round::AfterM4][slot])
                );
                let frame =
                    scan_ops::connection_owner::testing::completion(e.inner().unwrap()).unwrap();
                assert!(frame.summary_attempts().is_some());
                match case {
                    Case::Corrupt | Case::CleanupUnknown => {
                        assert!(matches!(frame.cleanup(), CleanupDisposition::Incomplete(_)))
                    }
                    _ => assert!(matches!(frame.cleanup(), CleanupDisposition::Confirmed(_))),
                }
            }
            assert_eq!(b.stop::<()>(Failure::Changed), Err(e.reason()));
            (Some(e.phase()), Some(e.reason()))
        }
    };
    for (slot, phases) in starts.borrow().iter() {
        let all = [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4];
        assert_eq!(
            phases.as_slice(),
            &all[..match slot {
                0 => 0,
                1 => 4,
                _ => 5,
            }]
        );
    }
    let cycles = source.stage_cycles();
    let (_, made, freed, _) = source.stage_counts();
    assert_eq!(made, freed);
    assert!(state.borrow().alive.is_empty());
    drop(source);
    drop(held);
    drop(ts);
    assert_eq!(tc.made.get(), tc.dropped.get());
    let starts = starts.borrow().len();
    Report {
        work,
        checks: observed_checks,
        phase,
        reason,
        cycles,
        starts,
        claim: b.scan_session_claim.started.get(),
    }
}

#[test]
fn private_body_connects_receipt_clock_and_all_fixed_positions_without_releasing_outer_inputs() {
    let r = run(Fault::Good);
    assert_eq!(r.starts, 3);
    assert_eq!(r.cycles, 6);
    assert!(r.claim);
}

#[test]
fn private_body_receipt_and_outer_clock_errors_prevent_owner_and_scan() {
    for (fault, phase, reason) in [
        (Fault::Receipt, OuterPhase::Receipt, Failure::HashMismatch),
        (
            Fault::ClockFail,
            OuterPhase::OuterClock,
            Failure::ReadFailed,
        ),
        (Fault::ClockSkew, OuterPhase::OuterClock, Failure::Expired),
        (
            Fault::ClockCancel,
            OuterPhase::OuterClock,
            Failure::Cancelled,
        ),
        (
            Fault::ClockDeadline,
            OuterPhase::OuterClock,
            Failure::Deadline,
        ),
        (Fault::NoQuota, OuterPhase::Entry, Failure::Unavailable),
        (Fault::Work(0), OuterPhase::Entry, Failure::Limit),
    ] {
        let r = run(fault);
        assert_eq!(r.phase, Some(phase));
        assert_eq!(r.reason, Some(reason));
        assert!(!r.claim);
        assert_eq!(r.starts, 0);
        assert_eq!(r.cycles, 0);
    }
    for available in 1..=5 {
        let r = run(Fault::Work(available));
        assert_eq!(r.phase, Some(OuterPhase::OwnerCreate));
        assert_eq!(r.reason, Some(Failure::Limit));
        assert!(r.claim);
        assert_eq!(r.starts, 0);
        assert_eq!(r.cycles, 0);
    }
}

#[test]
fn private_body_retains_real_scan_diagnostics_and_m4_failure_stops_after_round() {
    for slot in 0..3 {
        for case in [Case::Failure(0), Case::Corrupt, Case::CleanupUnknown] {
            let r = run(Fault::Scan(slot, case));
            assert_eq!(
                r.phase,
                Some(
                    [
                        OuterPhase::Initial,
                        OuterPhase::Compare,
                        OuterPhase::AfterRound
                    ][slot]
                )
            );
            assert_eq!(
                r.reason,
                Some(if matches!(case, Case::Corrupt) {
                    Failure::HashMismatch
                } else {
                    Failure::Unavailable
                })
            );
            assert_eq!(r.starts, slot + 1);
        }
    }
    let r = run(Fault::M4);
    assert_eq!(r.reason, Some(Failure::MetadataUnavailable));
    assert_eq!(r.phase, Some(OuterPhase::Compare));
    assert_eq!(r.starts, 2);
    assert_eq!(r.cycles, 4);
}

#[test]
fn private_body_final_owner_guard_checks_every_work_and_deadline_boundary() {
    let r = run(Fault::CancelWork(1));
    assert_eq!(r.phase, Some(OuterPhase::Entry));
    assert_eq!(r.reason, Some(Failure::Cancelled));
    assert!(!r.claim);
    assert_eq!(r.starts, 0);
    for at in 1..=3 {
        let r = run(Fault::Deadline(at));
        assert_eq!(r.phase, Some(OuterPhase::Entry));
        assert_eq!(r.reason, Some(Failure::Deadline));
        assert!(!r.claim);
        assert_eq!(r.starts, 0);
    }
    let baseline = run(Fault::Good);
    for available in [baseline.work - 2, baseline.work - 1] {
        let r = run(Fault::Work(available));
        assert_eq!(r.phase, Some(OuterPhase::BodyCheckpoint));
        assert_eq!(r.reason, Some(Failure::Limit));
        assert_eq!(r.work, available);
        assert_eq!(r.starts, 3);
        assert_eq!(r.cycles, 6);
    }
    for at in [baseline.work - 1, baseline.work] {
        let r = run(Fault::CancelWork(at));
        assert_eq!(r.phase, Some(OuterPhase::BodyCheckpoint));
        assert_eq!(r.reason, Some(Failure::Cancelled));
        assert_eq!(r.work, at);
    }
    for at in baseline.checks - 5..=baseline.checks {
        let r = run(Fault::Deadline(at));
        assert_eq!(r.phase, Some(OuterPhase::BodyCheckpoint));
        assert_eq!(r.reason, Some(Failure::Deadline));
    }
}

#[test]
fn fixed_body_helper_rejects_early_duplicate_and_foreign_budget_completion() {
    use scan_ops::connection_owner::{self as owner, testing as ot, topology_adapter as adapter};
    for mode in 0..3 {
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
        let bound = bind(&f.receipt.binding, &f.receipt.lineage, &f.target).unwrap();
        let tc = Rc::new(topo::Counts::default());
        let (opened, topology, mut ts) = topo::setup(&bound, &tc);
        let mut held = attach(&bound, opened).unwrap();
        let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
        let mut o = owner::create(
            &mut source,
            &f.receipt,
            &f.target,
            &c,
            std::array::from_fn(|_| Fake(state.clone())),
            "bp5-r2-strict-owner-0.1",
            &mut b,
        )
        .unwrap();
        ledger_test::configure(ot::ledger(&mut o), caps(), &mut b).unwrap();
        o.initial(&mut b)
            .unwrap()
            .run_fixed(quotas(), &mut b)
            .unwrap();
        let root = o.topology_run(&held, &topology, &mut b).unwrap();
        if mode != 1 {
            let handoff =
                adapter::compare(&root, &mut held, &mut ts, &mut o, &mut b, quotas()).unwrap();
            let compared = handoff
                .enter(&mut o, &mut b)
                .unwrap()
                .finish(quotas(), &mut b)
                .unwrap();
            drop(compared);
        }
        if mode == 2 {
            b.inspection_origin = Rc::new(());
        }
        if mode == 0 {
            let before = b.json_work;
            ot::complete_body(&mut o, &root, &mut b).unwrap();
            assert_eq!(b.json_work - before, 2);
        }
        let e = ot::complete_body(&mut o, &root, &mut b).unwrap_err();
        assert_eq!(e.reason(), Failure::Binding);
        assert!(ledger_test::ack_state(ot::ledger(&mut o)).2);
        assert_eq!(b.checkpoint(), Err(Failure::Binding));
        drop(root);
        drop(o);
        drop(source);
        drop(held);
        drop(ts);
        assert_eq!(tc.made.get(), tc.dropped.get());
        assert!(state.borrow().alive.is_empty());
    }
}

#[test]
fn pending_body_and_resource_input_cannot_be_cloned_or_serialized() {
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
    opaque!(body::PendingBody);
    opaque!(session::ResourceInput);
}
