use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::tests as topo;
use scan_ops::connection_owner::{
    self as owner, testing as ot,
    topology_adapter::{self as adapter, testing as at},
};
mod fixed_connection;

#[derive(Clone, Copy)]
enum Mode {
    Good,
    Fixed,
    BadB,
    BadBHash,
    Recheck(usize),
    M4Fail,
    M4Swap,
    M4Cancel,
    M4Deadline,
    WrongHeld,
    ForeignTopology,
    ForeignOwner,
    Origin,
    BeforeClaim,
    AfterClaim,
    BeforeFail,
    FalseBefore,
    DropRun,
    DropHandoff,
    DropAfter,
    Replay,
    DuplicateRun,
    Work,
    Cancel,
    Deadline,
    EnterWork(u64),
    EnterCancel(u64),
    EnterDeadline(u64),
    BadModel,
    PostCancel(u64),
    NoInitial,
    PrepareWork(u64),
    PrepareCancel(u64),
    PrepareDeadline(u64),
}
#[allow(clippy::result_large_err)] // Preserve fixed cleanup diagnostics inline; no heap on failure.
fn scenario(mode: Mode) -> u64 {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let enter_active = Cell::new(false);
    let checks = Cell::new(0u64);
    let clock = || {
        if enter_active.get() {
            checks.set(checks.get() + 1);
        }
        if let Mode::EnterDeadline(at) | Mode::PrepareDeadline(at) = mode
            && enter_active.get()
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
    let (other_open, other_topology, _) = topo::setup(&bound, &tc);
    let mut other_held = attach(&bound, other_open).unwrap();
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
    if !matches!(mode, Mode::NoInitial) {
        at::run_fixed(o.initial(&mut b).unwrap(), &mut b, quotas()).unwrap();
    }
    match mode {
        Mode::PrepareWork(n) => b.json_work = 1_000_000 - n,
        Mode::PrepareCancel(at) => {
            let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
            a.cancel_after_work(at, cancel.clone());
            b.work_audit = Some(a);
        }
        _ => {}
    }
    enter_active.set(matches!(mode, Mode::PrepareDeadline(_)));
    let prepare_work = b.json_work;
    let prepared = o.topology_run(
        &held,
        if matches!(mode, Mode::ForeignTopology) {
            &other_topology
        } else {
            &topology
        },
        &mut b,
    );
    enter_active.set(false);
    if matches!(
        mode,
        Mode::NoInitial | Mode::PrepareWork(_) | Mode::PrepareCancel(_) | Mode::PrepareDeadline(_)
    ) {
        let e = prepared.unwrap_err();
        assert_eq!(
            e.reason(),
            match mode {
                Mode::PrepareWork(_) => Failure::Limit,
                Mode::PrepareCancel(_) => Failure::Cancelled,
                Mode::PrepareDeadline(_) => Failure::Deadline,
                _ => Failure::Binding,
            }
        );
        assert_eq!(tc.reads.get(), 0);
        assert!(tc.phases.borrow().is_empty());
        assert!(ledger_test::ack_state(ot::ledger(&mut o)).2);
        drop(o);
        drop(held);
        drop(other_held);
        assert_eq!(tc.made.get(), tc.dropped.get());
        return 0;
    }
    let run = prepared.unwrap();
    assert_eq!(b.json_work - prepare_work, 2);
    assert_eq!(
        format!("{run:?}"),
        "TopologyRunOwner(position_only_not_execution_authority)"
    );
    let entry_work = b.json_work;
    let compared_work = Cell::new(0);
    let before = Rc::new(Cell::new(0));
    let before_end = Cell::new(0);
    let phase_oracle = Rc::new(Cell::new(false));
    let n = state.borrow().data[&f.target.path].len() as u64;
    let c2 = tc.clone();
    let oracle = phase_oracle.clone();
    ts.adapter_hook(move |_, round| {
        if round == 1 && c2.phases.borrow().len() == 4 {
            assert_eq!(c2.copied.get(), 80 + 2 * n); // B EOF/hash precede this second recheck
            assert_eq!(c2.adapter_eofs.get(), 2);
            assert_eq!(
                *c2.phases.borrow(),
                [Phase::M0, Phase::M1, Phase::M2, Phase::M3]
            );
            oracle.set(true);
        }
    });
    match mode {
        Mode::BadB => tc.adapter_fail_b.set(true),
        Mode::BadBHash => tc.adapter_corrupt_b.set(true),
        Mode::Recheck(at) => ts.adapter_fault(at),
        Mode::M4Fail => tc.adapter_fail_m4.set(true),
        Mode::M4Swap => tc.adapter_swap_m4.set(true),
        Mode::M4Cancel => *tc.adapter_cancel_m4.borrow_mut() = Some(cancel.clone()),
        Mode::M4Deadline => {
            *tc.adapter_deadline_m4.borrow_mut() =
                Some((now.clone(), b.started + Duration::from_secs(10)))
        }
        Mode::BeforeClaim => at::claim_before(&run),
        Mode::Origin => b.inspection_origin = Rc::new(()),
        Mode::Work => b.json_work = 1_000_000,
        Mode::Cancel => cancel.store(true, Ordering::Release),
        Mode::Deadline => now.set(b.started + Duration::from_secs(10)),
        Mode::PostCancel(at) => {
            let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
            a.cancel_after_work(at, cancel.clone());
            b.work_audit = Some(a);
        }
        _ => {}
    }
    if matches!(mode, Mode::DropRun) {
        drop(run);
        assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
    } else if matches!(mode, Mode::DuplicateRun) {
        assert_eq!(
            o.topology_run(&held, &topology, &mut b)
                .unwrap_err()
                .reason(),
            Failure::Binding
        );
        drop(run);
    } else {
        let mut before_body = |slot: owner::RoundSlot<'_, '_, '_, RecordFake, Fake>,
                               b: &mut SharedBudget<'_>| {
            before.set(before.get() + 1);
            assert_eq!(b.json_work - entry_work, 4); // compare entry + position + existing slot take2
            assert!(phase_oracle.get());
            assert_eq!(tc.attempts.get(), 22); // Both complete rechecks, not just entry into the second.
            assert_eq!(
                *tc.phases.borrow(),
                [Phase::M0, Phase::M1, Phase::M2, Phase::M3]
            );
            assert_eq!(tc.copied.get(), 80 + 2 * n);
            if matches!(mode, Mode::FalseBefore) {
                std::mem::forget(slot);
                return Ok(());
            }
            if matches!(mode, Mode::BeforeFail) {
                let mut s = state.borrow_mut();
                s.case = Case::Failure(s.calls + 1);
            }
            let result = at::run_fixed(slot, b, quotas());
            before_end.set(b.json_work);
            result
        };
        let handoff = if matches!(
            mode,
            Mode::Fixed
                | Mode::M4Fail
                | Mode::M4Swap
                | Mode::M4Cancel
                | Mode::M4Deadline
                | Mode::ForeignOwner
        ) {
            adapter::compare(&run, &mut held, &mut ts, &mut o, &mut b, quotas())
        } else {
            at::compare_with_fixture(
                &run,
                if matches!(mode, Mode::WrongHeld) {
                    &mut other_held
                } else {
                    &mut held
                },
                &mut ts,
                &mut o,
                &mut b,
                &mut before_body,
            )
        };
        match mode {
            Mode::Good | Mode::Fixed => {
                let handoff = handoff.unwrap();
                compared_work.set(b.json_work - entry_work);
                if matches!(mode, Mode::Good) {
                    assert_eq!(b.json_work - before_end.get(), 2); // post-before guard + post-M4 guard
                }
                assert_eq!(
                    format!("{handoff:?}"),
                    "AfterM4Handoff(actual_comparison_pending_after_round)"
                );
                assert_eq!(before.get(), u32::from(matches!(mode, Mode::Good)));
                assert!(phase_oracle.get());
                assert_eq!(
                    *tc.phases.borrow(),
                    [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4]
                );
                let enter_work = b.json_work;
                let after = handoff.enter(&mut o, &mut b).unwrap();
                assert_eq!(b.json_work - enter_work, 4); // handoff2 + existing slot take2
                assert_eq!(
                    format!("{after:?}"),
                    "AfterM4Round(pending_kernel_not_authority)"
                );
                let compared = if matches!(mode, Mode::Fixed) {
                    after.finish(quotas(), &mut b).unwrap()
                } else {
                    at::finish_with_fixture(after, &mut b, quotas()).unwrap()
                };
                assert_eq!(
                    compared.entitlement_gate(),
                    Err(physical_signature::Rejection::UnverifiedXml)
                );
                assert_eq!(ot::remaining(&o), [false; 3]);
            }
            Mode::DropHandoff => {
                drop(handoff.unwrap());
                assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
            }
            Mode::DropAfter => {
                drop(handoff.unwrap().enter(&mut o, &mut b).unwrap());
                assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
            }
            Mode::Replay => {
                std::mem::forget(handoff.unwrap());
                assert_eq!(
                    at::compare_with_fixture(
                        &run,
                        &mut held,
                        &mut ts,
                        &mut o,
                        &mut b,
                        &mut before_body
                    )
                    .unwrap_err()
                    .reason(),
                    Failure::Binding
                );
            }
            Mode::AfterClaim => {
                at::claim_completion(&run);
                assert_eq!(
                    handoff.unwrap().enter(&mut o, &mut b).unwrap_err().reason(),
                    Failure::Binding
                );
            }
            Mode::EnterWork(n) | Mode::EnterCancel(n) | Mode::EnterDeadline(n) => {
                let handoff = handoff.unwrap();
                let calls = state.borrow().calls;
                if matches!(mode, Mode::EnterWork(_)) {
                    b.json_work = 1_000_000 - n;
                }
                if matches!(mode, Mode::EnterCancel(_)) {
                    let a =
                        crate::signature_boundary::positioned_read::work_audit::Audit::default();
                    a.cancel_after_work(n, cancel.clone());
                    b.work_audit = Some(a);
                }
                enter_active.set(true);
                let e = handoff.enter(&mut o, &mut b).unwrap_err();
                enter_active.set(false);
                assert_eq!(
                    e.reason(),
                    match mode {
                        Mode::EnterWork(_) => Failure::Limit,
                        Mode::EnterCancel(_) => Failure::Cancelled,
                        _ => Failure::Deadline,
                    }
                );
                assert_eq!(state.borrow().calls, calls);
                assert!(ledger_test::ack_state(ot::ledger(&mut o)).2);
            }
            Mode::BadModel => {
                let mut h = handoff.unwrap();
                at::corrupt_model(&mut h);
                assert_eq!(
                    h.enter(&mut o, &mut b).unwrap_err().reason(),
                    Failure::Binding
                );
            }
            Mode::ForeignOwner => {
                let handoff = handoff.unwrap();
                let other_cancel = AtomicBool::new(false);
                let mut ob = SharedBudget::new(now.get(), &other_cancel);
                ob.now = &clock;
                let mut other_record = RecordFake::for_stage(&f.receipt, &now, now.get());
                let mut other = owner::create(
                    &mut other_record,
                    &f.receipt,
                    &f.target,
                    &c,
                    std::array::from_fn(|_| Fake(state.clone())),
                    "bp5-r2-strict-owner-0.1",
                    &mut ob,
                )
                .unwrap();
                ledger_test::configure(ot::ledger(&mut other), caps(), &mut ob).unwrap();
                at::run_fixed(other.initial(&mut ob).unwrap(), &mut ob, quotas()).unwrap();
                let other_before = ot::take(&mut other, Round::BeforeM4, &mut ob).unwrap();
                at::run_fixed(other_before, &mut ob, quotas()).unwrap();
                assert_eq!(
                    handoff.enter(&mut other, &mut ob).unwrap_err().reason(),
                    Failure::Binding
                );
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
                assert_eq!(ob.checkpoint(), Err(Failure::Binding));
            }
            _ => {
                let e = handoff.unwrap_err();
                let expected = match mode {
                    Mode::BeforeFail => Failure::Unavailable,
                    Mode::BadB => Failure::ReadFailed,
                    Mode::BadBHash => Failure::HashMismatch,
                    Mode::Recheck(_) | Mode::M4Fail => Failure::MetadataUnavailable,
                    Mode::M4Swap | Mode::ForeignTopology => Failure::SourceMismatch,
                    Mode::M4Cancel | Mode::Cancel => Failure::Cancelled,
                    Mode::PostCancel(_) => Failure::Cancelled,
                    Mode::M4Deadline | Mode::Deadline => Failure::Deadline,
                    Mode::Work => Failure::Limit,
                    _ => Failure::Binding,
                };
                assert_eq!(e.reason(), expected);
                if matches!(mode, Mode::BeforeFail) {
                    let frame = ot::completion(&e).unwrap();
                    assert!(matches!(frame.cleanup(), CleanupDisposition::Confirmed(_)));
                    assert!(frame.summary_attempts().is_some());
                }
                assert_eq!(b.checkpoint(), Err(expected));
                assert!(ledger_test::ack_state(ot::ledger(&mut o)).2);
                if matches!(
                    mode,
                    Mode::M4Fail
                        | Mode::M4Swap
                        | Mode::M4Cancel
                        | Mode::M4Deadline
                        | Mode::PostCancel(_)
                ) {
                    assert_eq!(
                        ledger_test::ack_state(ot::ledger(&mut o)).0,
                        [true, true, false]
                    );
                }
                assert!(ot::remaining(&o)[2]); // no AfterM4 slot consumed on any compare failure
            }
        }
        if !matches!(mode, Mode::Good | Mode::Fixed) {
            assert!(o.initial(&mut b).is_err());
        }
        if matches!(
            mode,
            Mode::BadB
                | Mode::BadBHash
                | Mode::Recheck(_)
                | Mode::WrongHeld
                | Mode::ForeignTopology
                | Mode::Origin
                | Mode::Work
                | Mode::Cancel
                | Mode::Deadline
        ) {
            assert_eq!(before.get(), 0);
        }
        drop(run);
    }
    drop(o);
    drop(held);
    drop(other_held);
    assert_eq!(tc.live.get(), 0);
    assert_eq!(tc.made.get(), tc.dropped.get());
    assert_eq!(b.reserved, 0);
    assert_eq!(b.metadata_cleanup_reserved, 0);
    if matches!(mode, Mode::Good | Mode::Fixed) {
        assert_eq!(b.checkpoint(), Ok(()));
        assert_eq!(source.stage_cycles(), 6);
    } else if !matches!(
        mode,
        Mode::M4Fail
            | Mode::M4Swap
            | Mode::M4Cancel
            | Mode::M4Deadline
            | Mode::DropHandoff
            | Mode::DropAfter
            | Mode::Replay
            | Mode::AfterClaim
            | Mode::ForeignOwner
            | Mode::EnterWork(_)
            | Mode::EnterCancel(_)
            | Mode::EnterDeadline(_)
            | Mode::BadModel
            | Mode::PostCancel(_)
    ) {
        assert!(!tc.phases.borrow().contains(&Phase::M4));
    }
    compared_work.get()
}
#[test]
fn real_b_recheck_before_m4_and_after_handoff_order_is_fixed() {
    scenario(Mode::Good);
}
#[test]
fn fixed_positions_use_real_kernel_and_complete_the_original_owner() {
    scenario(Mode::Fixed);
}
#[test]
fn b_and_every_topology_recheck_failure_prevent_before_or_m4() {
    scenario(Mode::BadB);
    scenario(Mode::BadBHash);
    for at in 1..=22 {
        scenario(Mode::Recheck(at));
    }
}
#[test]
fn topology_owner_requires_initial_ack_and_all_prepare_budget_guards() {
    scenario(Mode::NoInitial);
    for n in 0..2 {
        scenario(Mode::PrepareWork(n));
    }
    for n in 1..=2 {
        scenario(Mode::PrepareCancel(n));
    }
    for at in 1..=6 {
        scenario(Mode::PrepareDeadline(at));
    }
}
#[test]
fn m4_error_origin_swap_and_late_results_stop_after_before_ack() {
    for m in [Mode::M4Fail, Mode::M4Swap, Mode::M4Cancel, Mode::M4Deadline] {
        scenario(m);
    }
}
#[test]
fn owner_receipt_held_and_budget_identity_are_not_interchangeable() {
    for m in [
        Mode::WrongHeld,
        Mode::ForeignTopology,
        Mode::ForeignOwner,
        Mode::Origin,
    ] {
        scenario(m);
    }
}
#[test]
fn one_shot_claims_false_success_and_actual_before_failure_are_rejected() {
    for m in [
        Mode::BeforeClaim,
        Mode::AfterClaim,
        Mode::BeforeFail,
        Mode::FalseBefore,
        Mode::Replay,
        Mode::DuplicateRun,
    ] {
        scenario(m);
    }
}
#[test]
fn dropped_position_owner_and_pending_stages_do_not_authorize_after() {
    for m in [Mode::DropRun, Mode::DropHandoff, Mode::DropAfter] {
        scenario(m);
    }
}
#[test]
fn shared_work_cancellation_and_deadline_stop_before_comparison_io() {
    for m in [Mode::Work, Mode::Cancel, Mode::Deadline] {
        scenario(m);
    }
}
#[test]
fn late_compare_publication_and_every_handoff_guard_fail_closed() {
    let n = scenario(Mode::Good);
    assert!(n > 0);
    scenario(Mode::PostCancel(n));
    for n in 0..4 {
        scenario(Mode::EnterWork(n));
    }
    for n in 1..=4 {
        scenario(Mode::EnterCancel(n));
    }
    for at in 1..=12 {
        scenario(Mode::EnterDeadline(at));
    }
    scenario(Mode::BadModel);
}
#[test]
fn position_handoff_and_owner_types_are_not_clone_copy_or_serializable() {
    use adapter::{AfterM4Handoff, AfterM4Round, BeforeM4Position, TopologyRunOwner};
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
    opaque!(TopologyRunOwner<'_, '_>);
    opaque!(BeforeM4Position<'_, '_, '_>);
    opaque!(AfterM4Handoff<'_, '_, '_>);
    opaque!(AfterM4Round<'_, '_, '_, '_, '_, RecordFake, Fake>);
}
