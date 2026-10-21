use super::super::super::completion;
use super::*;
use crate::closure::shared::index_decode_count;
use crate::record_validation::record_validation_count;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use records_stage::valid_fixture;

#[derive(Clone, Copy)]
enum Mode {
    Good,
    Duplicate,
    WrongPhase,
    Origin,
    Claim,
    Started,
    Work(u64),
    CancelAt(u64),
    DeadlineAt(u64),
    Cancel,
    Deadline,
    FirstFailure,
    OuterCancel,
    OuterDeadline,
    OuterFinalCancel,
    OuterFinalDeadline,
}
fn scenario(mode: Mode) -> u64 {
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
        if let Mode::DeadlineAt(at) = mode
            && active.get()
            && checks.get() >= at
        {
            return now.get() + Duration::from_secs(10);
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let mut ledger = session::create(
        &f.receipt,
        &f.target,
        &c,
        "bp5-r2-scan-session-state-0.1",
        &mut b,
    )
    .unwrap();
    ledger_test::configure(&mut ledger, caps(), &mut b).unwrap();
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let result =
            round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
                let d = scope.decode(b)?;
                let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let inputs = phases.bind_inputs(scope, b)?;
                let mut lease = ledger.begin(scope, b)?;
                if matches!(mode, Mode::Duplicate) {
                    ledger_test::consume_ack_claim(&mut lease);
                }
                let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
                let estimate =
                    calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
                let dropped = Rc::new(Cell::new(0));
                let mut scan = completion::pause_after_scan(
                    &mut lease,
                    estimate,
                    &inputs,
                    scope,
                    (Fake(state.clone()), quotas()),
                    b,
                )
                .unwrap();
                scan.watch_observation_drop(dropped.clone());
                let pending = lease.complete_scan(scan, b).unwrap();
                drop(inputs);
                let after = pending.after_scan(&mut phases, b).unwrap();
                let records = after.revalidate_records(&mut source, &phases, b).unwrap();
                let index = records.verify_final_index(&mut phases, b).unwrap();
                let final_clock = index.verify_final_clock(&mut source, &phases, b).unwrap();
                let source_before = source.stage_counts();
                let scan_before = state.borrow().calls;
                let quantities = (b.used, b.topology_calls, b.retries_left);
                let decodes = index_decode_count();
                let validations = record_validation_count();
                match mode {
                    Mode::Origin => b.inspection_origin = Rc::new(()),
                    Mode::Claim => b.scan_session_claim = Rc::new(Default::default()),
                    Mode::Started => b.started -= Duration::from_millis(1),
                    Mode::Work(n) => b.json_work = 1_000_000 - n,
                    Mode::CancelAt(at) => {
                        let a =
                            crate::signature_boundary::positioned_read::work_audit::Audit::default(
                            );
                        a.cancel_after_work(at, cancel.clone());
                        b.work_audit = Some(a);
                    }
                    Mode::Cancel => cancel.store(true, Ordering::Release),
                    Mode::Deadline => now.set(b.started + Duration::from_secs(10)),
                    Mode::FirstFailure => {
                        let _ = b.stop::<()>(Failure::Changed);
                    }
                    _ => {}
                }
                let before = b.json_work;
                checks.set(0);
                active.set(true);
                let outcome = if matches!(mode, Mode::WrongPhase) {
                    let mut failure = None;
                    let _ = round_declaration::with_round(
                        &f.receipt,
                        &f.target,
                        &c,
                        round,
                        b,
                        |other, b| {
                            let d = other.decode(b)?;
                            let mut p = d.prepare_scan(other, PHASE_MODEL_ID, b)?;
                            p.after_scan(
                                &ClosureObservation {
                                    lineage: f.receipt.lineage.clone(),
                                    records: f.receipt.binding.clone(),
                                    round,
                                    token: other.token().clone(),
                                    entries: f.observed.clone(),
                                },
                                b,
                            )?;
                            p.finish(b)?; // genuinely Finished, but not this round owner
                            failure = Some(final_clock.acknowledge(&p, b).unwrap_err());
                            Ok(())
                        },
                    );
                    Err(failure.unwrap())
                } else {
                    final_clock.acknowledge(&phases, b)
                };
                active.set(false);
                assert_eq!(source.stage_counts(), source_before);
                assert_eq!(state.borrow().calls, scan_before);
                assert_eq!((b.used, b.topology_calls, b.retries_left), quantities);
                assert_eq!(
                    index_decode_count() - decodes,
                    usize::from(matches!(mode, Mode::WrongPhase))
                );
                assert_eq!(record_validation_count(), validations);
                assert_eq!(dropped.get(), 1);
                if matches!(
                    mode,
                    Mode::Good
                        | Mode::OuterCancel
                        | Mode::OuterDeadline
                        | Mode::OuterFinalCancel
                        | Mode::OuterFinalDeadline
                ) {
                    outcome.unwrap();
                    assert_eq!(b.json_work - before, 3);
                    // TEST ONLY: inject after ack to exercise with_round's later checkpoint.
                    if matches!(mode, Mode::OuterCancel)
                        || (round == Round::AfterM4 && matches!(mode, Mode::OuterFinalCancel))
                    {
                        cancel.store(true, Ordering::Release);
                    }
                    if matches!(mode, Mode::OuterDeadline)
                        || (round == Round::AfterM4 && matches!(mode, Mode::OuterFinalDeadline))
                    {
                        now.set(b.started + Duration::from_secs(10));
                    }
                    Ok(()) // no further production work after acknowledgement
                } else {
                    let failure = outcome.unwrap_err();
                    let expected = match mode {
                        Mode::Work(_) => Failure::Limit,
                        Mode::Cancel | Mode::CancelAt(_) => Failure::Cancelled,
                        Mode::Deadline | Mode::DeadlineAt(_) => Failure::Deadline,
                        Mode::FirstFailure => Failure::Changed,
                        _ => Failure::Binding,
                    };
                    assert_eq!(failure.reason(), expected);
                    assert_eq!(b.checkpoint(), Err(expected));
                    assert!(matches!(
                        failure.cleanup(),
                        CleanupDisposition::Confirmed(_)
                    ));
                    assert!(failure.summary_attempts().is_some());
                    Err(expected)
                }
            });
        let final_outer = matches!(mode, Mode::OuterFinalCancel | Mode::OuterFinalDeadline);
        if !matches!(mode, Mode::Good) && (!final_outer || round == Round::AfterM4) {
            assert!(result.is_err());
            let (claimed, finished, stopped) = ledger_test::ack_state(&ledger);
            assert_eq!(
                claimed,
                if final_outer {
                    [true; 3]
                } else {
                    [true, false, false]
                }
            );
            assert_eq!(finished, final_outer);
            assert_eq!(
                stopped,
                !matches!(
                    mode,
                    Mode::OuterCancel
                        | Mode::OuterDeadline
                        | Mode::OuterFinalCancel
                        | Mode::OuterFinalDeadline
                )
            );
            let counts = source.stage_counts();
            assert!(
                round_declaration::with_round(
                    &f.receipt,
                    &f.target,
                    &c,
                    Round::BeforeM4,
                    &mut b,
                    |scope, b| {
                        let _lease = ledger.begin(scope, b)?;
                        Ok(())
                    }
                )
                .is_err()
            );
            assert_eq!(source.stage_counts(), counts);
            return checks.get();
        }
        result.unwrap();
    }
    assert_eq!(ledger_test::ack_state(&ledger), ([true; 3], true, false));
    drop(ledger);
    assert_eq!(b.checkpoint(), Ok(()));
    checks.get()
}
#[test]
fn real_typed_acknowledgement_advances_all_three_slots_without_fixture_ack() {
    scenario(Mode::Good);
}
#[test]
fn duplicate_and_budget_binding_reject_without_new_source_operations() {
    for m in [
        Mode::Duplicate,
        Mode::WrongPhase,
        Mode::Origin,
        Mode::Claim,
        Mode::Started,
        Mode::FirstFailure,
    ] {
        scenario(m);
    }
}
#[test]
fn every_work_shortage_and_post_charge_cancel_preserves_cleanup() {
    for n in 0..3 {
        scenario(Mode::Work(n));
    }
    for at in 1..=3 {
        scenario(Mode::CancelAt(at));
    }
}
#[test]
fn every_ack_checkpoint_deadline_and_pre_cancel_stops() {
    let n = scenario(Mode::Good);
    for at in 1..=8 {
        scenario(Mode::DeadlineAt(at));
    }
    assert_eq!(n, 8);
    scenario(Mode::Cancel);
    scenario(Mode::Deadline);
}
#[test]
fn outer_terminal_checkpoint_failure_is_not_overridden_by_successful_ack() {
    scenario(Mode::OuterCancel);
    scenario(Mode::OuterDeadline);
    scenario(Mode::OuterFinalCancel);
    scenario(Mode::OuterFinalDeadline);
}
