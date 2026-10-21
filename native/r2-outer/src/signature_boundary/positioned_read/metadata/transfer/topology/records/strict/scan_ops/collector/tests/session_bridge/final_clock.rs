use super::super::super::completion;
use super::*;
use crate::closure::shared::index_decode_count;
use crate::record_validation::record_validation_count;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use records_stage::valid_fixture;
use round_declaration::session::completion::records::FinalClockRound;

#[derive(Clone, Copy)]
enum Mode {
    Legacy,
    Good,
    Forget,
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
    SourceFail,
    SourceCancel,
    SourceDeadline,
    Skew,
    FirstFailure,
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
    let checks = Cell::new(0u64);
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
    let dropped = Rc::new(Cell::new(0));
    let mut clock_checks = 0;
    let result = round_declaration::with_round(
        &f.receipt,
        &f.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let mut lease = ledger.begin(scope, b)?;
            if matches!(mode, Mode::Duplicate) {
                ledger_test::consume_final_clock_claim(&mut lease);
            }
            let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
            let estimate = calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
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
            let final_index = records.verify_final_index(&mut phases, b).unwrap();
            let source_before = source.stage_counts();
            let scan_before = state.borrow().calls;
            let ops = b.topology_calls;
            let bytes = b.used;
            let retries = b.retries_left;
            let decodes = index_decode_count();
            let validations = record_validation_count();
            match mode {
                Mode::Origin => b.inspection_origin = Rc::new(()),
                Mode::Claim => b.scan_session_claim = Rc::new(Default::default()),
                Mode::Started => b.started -= Duration::from_millis(1),
                Mode::Work(n) => b.json_work = 1_000_000 - n,
                Mode::CancelAt(at) => {
                    let a =
                        crate::signature_boundary::positioned_read::work_audit::Audit::default();
                    a.cancel_after_work(at, cancel.clone());
                    b.work_audit = Some(a);
                }
                Mode::Cancel => cancel.store(true, Ordering::Release),
                Mode::Deadline => now.set(b.started + Duration::from_secs(10)),
                Mode::SourceFail => source.stage_fault(0, source_before.0 + 1),
                Mode::SourceCancel => {
                    source.stage_interrupt(source_before.0 + 1, cancel.clone(), None)
                }
                Mode::SourceDeadline => source.stage_interrupt(
                    source_before.0 + 1,
                    cancel.clone(),
                    Some(b.started + Duration::from_secs(10)),
                ),
                Mode::Skew => source.stage_clock_skew_current(),
                Mode::FirstFailure => {
                    let _ = b.stop::<()>(Failure::Changed);
                }
                _ => {}
            }
            let before = b.json_work;
            if matches!(mode, Mode::Legacy) {
                clock_check(&mut source, &f.receipt, b, 450_000)?;
                assert_eq!(b.json_work - before, 0);
                drop(final_index);
                return Ok(());
            }
            active.set(true);
            let outcome = if matches!(mode, Mode::WrongPhase) {
                let mut captured = None;
                let _ = round_declaration::with_round(
                    &f.receipt,
                    &f.target,
                    &c,
                    Round::Initial,
                    b,
                    |other, b| {
                        let d = other.decode(b)?;
                        let mut other_phases = d.prepare_scan(other, PHASE_MODEL_ID, b)?;
                        other_phases.after_scan(
                            &ClosureObservation {
                                lineage: f.receipt.lineage.clone(),
                                records: f.receipt.binding.clone(),
                                round: Round::Initial,
                                token: other.token().clone(),
                                entries: f.observed.clone(),
                            },
                            b,
                        )?;
                        other_phases.finish(b)?; // TEST ONLY: genuinely Finished, but wrong owner.
                        captured = Some(
                            final_index
                                .verify_final_clock(&mut source, &other_phases, b)
                                .unwrap_err(),
                        );
                        Ok(())
                    },
                );
                Err(captured.unwrap())
            } else {
                final_index.verify_final_clock(&mut source, &phases, b)
            };
            active.set(false);
            clock_checks = checks.get();
            assert_eq!(dropped.get(), 1);
            assert_eq!(state.borrow().calls, scan_before);
            let source_after = source.stage_counts();
            assert_eq!(
                (source_after.1, source_after.2, source_after.3),
                (source_before.1, source_before.2, source_before.3)
            );
            assert!(source_after.0 - source_before.0 <= 1);
            assert_eq!(b.used, bytes);
            assert_eq!(b.retries_left, retries);
            assert_eq!(
                b.topology_calls - ops,
                (source_after.0 - source_before.0) as u32
            );
            assert_eq!(record_validation_count(), validations);
            assert_eq!(
                index_decode_count() - decodes,
                usize::from(matches!(mode, Mode::WrongPhase))
            );
            if matches!(mode, Mode::Good | Mode::Forget) {
                let final_clock = outcome.unwrap();
                assert_eq!(b.json_work - before, 3);
                assert_eq!(source_after.0 - source_before.0, 1);
                assert_eq!(clock_checks, 11);
                assert_eq!(
                    format!("{final_clock:?}"),
                    "FinalClockRound(awaiting_strict_ack_not_execution_authority)"
                );
                if matches!(mode, Mode::Forget) {
                    std::mem::forget(final_clock);
                } else {
                    drop(final_clock);
                }
            } else {
                let failure = outcome.unwrap_err();
                let expected = match mode {
                    Mode::Work(_) => Failure::Limit,
                    Mode::Cancel | Mode::CancelAt(_) | Mode::SourceCancel => Failure::Cancelled,
                    Mode::Deadline | Mode::SourceDeadline => Failure::Deadline,
                    Mode::DeadlineAt(7) | Mode::Skew => Failure::Expired, // direct elapsed sample, existing clock consistency semantics
                    Mode::DeadlineAt(_) => Failure::Deadline,
                    Mode::SourceFail => Failure::ReadFailed,
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
                if matches!(
                    mode,
                    Mode::Duplicate
                        | Mode::WrongPhase
                        | Mode::Origin
                        | Mode::Claim
                        | Mode::Started
                        | Mode::Cancel
                        | Mode::Deadline
                        | Mode::FirstFailure
                ) {
                    assert_eq!(source_after.0, source_before.0);
                }
            }
            Ok(())
        },
    );
    assert_eq!(result.is_ok(), matches!(mode, Mode::Forget));
    let (claimed, stopped) = ledger_test::final_clock_state(&ledger);
    assert_eq!(claimed, !matches!(mode, Mode::Legacy));
    assert_eq!(stopped, !matches!(mode, Mode::Forget));
    let before = source.stage_counts();
    let retry = round_declaration::with_round(
        &f.receipt,
        &f.target,
        &c,
        Round::BeforeM4,
        &mut b,
        |scope, b| {
            let _lease = ledger.begin(scope, b)?;
            Ok(())
        },
    );
    assert!(retry.is_err());
    assert_eq!(source.stage_counts(), before);
    clock_checks
}
#[test]
fn actual_final_clock_and_terminal_checkpoint_issue_only_ack_pending_stage() {
    scenario(Mode::Legacy);
    scenario(Mode::Good);
    scenario(Mode::Forget);
}
#[test]
fn final_clock_binding_and_claim_fail_before_clock_source() {
    for mode in [
        Mode::Duplicate,
        Mode::WrongPhase,
        Mode::Origin,
        Mode::Claim,
        Mode::Started,
        Mode::FirstFailure,
    ] {
        scenario(mode);
    }
}
#[test]
fn final_clock_work_and_post_charge_cancel_prefixes_keep_cleanup() {
    for n in 0..3 {
        scenario(Mode::Work(n));
    }
    for at in 1..=3 {
        scenario(Mode::CancelAt(at));
    }
}
#[test]
fn every_time_sample_and_checkpoint_failure_stops_before_publication() {
    let checks = scenario(Mode::Good);
    for at in 1..=checks {
        scenario(Mode::DeadlineAt(at));
    }
    scenario(Mode::Cancel);
    scenario(Mode::Deadline);
}
#[test]
fn clock_source_error_skew_and_late_result_keep_first_failure() {
    for mode in [
        Mode::SourceFail,
        Mode::SourceCancel,
        Mode::SourceDeadline,
        Mode::Skew,
    ] {
        scenario(mode);
    }
}
#[test]
fn final_clock_stage_is_not_clone_copy_or_serializable() {
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
    not_impl!(FinalClockRound<'_, '_, '_>, Clone);
    not_impl!(FinalClockRound<'_, '_, '_>, Copy);
    not_impl!(FinalClockRound<'_, '_, '_>, serde::Serialize);
    not_impl!(FinalClockRound<'_, '_, '_>, serde::de::DeserializeOwned);
}
#[test]
fn three_slots_run_one_final_clock_each_without_a_production_ack() {
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
        round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let lease = ledger.begin(scope, b)?;
            let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
            let estimate = calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
            let pending = completion::collect_and_complete(
                lease,
                estimate,
                &inputs,
                scope,
                (Fake(state.clone()), quotas()),
                b,
            )
            .unwrap();
            drop(inputs);
            let after = pending.after_scan(&mut phases, b).unwrap();
            let records = after.revalidate_records(&mut source, &phases, b).unwrap();
            let final_index = records.verify_final_index(&mut phases, b).unwrap();
            let calls = source.stage_counts().0;
            let work = b.json_work;
            let ops = b.topology_calls;
            let final_clock = final_index
                .verify_final_clock(&mut source, &phases, b)
                .unwrap();
            assert_eq!(source.stage_counts().0 - calls, 1);
            assert_eq!(b.json_work - work, 3);
            assert_eq!(b.topology_calls - ops, 1);
            final_clock.acknowledge_for_test(b) // TEST ONLY; real strict acknowledgement is absent.
        })
        .unwrap();
    }
    drop(ledger);
    assert_eq!(b.checkpoint(), Ok(()));
}
