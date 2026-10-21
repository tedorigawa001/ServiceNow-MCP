use super::super::super::completion;
use super::*;
use crate::signature_boundary::positioned_read::work_audit::Audit;
use round_declaration::session::completion::AfterScanRound;

#[derive(Clone, Copy)]
enum Mode {
    Good,
    Forget,
    Legacy,
    Duplicate,
    Compared,
    WrongPhase,
    Changed,
    Work(u64),
    CancelAt(u64),
    Cancel,
    Deadline,
    Origin,
    CancelAtDrop,
    DeadlineAtDrop,
}
fn scenario(mode: Mode) -> u64 {
    let (f, state) = fixture(Case::Good);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let dropped = Rc::new(Cell::new(0));
    let clock = || {
        if dropped.get() == 1 {
            if matches!(mode, Mode::CancelAtDrop) {
                cancel.store(true, Ordering::Release);
            }
            if matches!(mode, Mode::DeadlineAtDrop) {
                return now.get() + Duration::from_secs(10);
            }
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut ledger = session::create(
        &f.receipt,
        &f.target,
        &c,
        "bp5-r2-scan-session-state-0.1",
        &mut b,
    )
    .unwrap();
    ledger_test::configure(&mut ledger, caps(), &mut b).unwrap();
    let mut spent = 0;
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
                ledger_test::consume_after_scan_claim(&mut lease);
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
            if matches!(mode, Mode::Changed) {
                scan.corrupt_observation_entries();
            }
            let pending = lease.complete_scan(scan, b).unwrap();
            drop(inputs); // stage and phase must not keep the short Inputs borrow alive.
            assert_eq!(dropped.get(), 0);
            let calls = state.borrow().calls;
            if matches!(mode, Mode::Compared | Mode::Legacy) {
                let before = b.json_work;
                phases.after_scan(pending.observation(), b)?;
                if matches!(mode, Mode::Legacy) {
                    spent = b.json_work - before;
                    drop(pending);
                    assert_eq!(dropped.get(), 1);
                    return Ok(());
                }
            }
            match mode {
                Mode::Work(n) => b.json_work = 1_000_000 - n,
                Mode::CancelAt(at) => {
                    let audit = Audit::default();
                    audit.cancel_after_work(at, cancel.clone());
                    b.work_audit = Some(audit);
                }
                Mode::Cancel => cancel.store(true, Ordering::Release),
                Mode::Deadline => now.set(b.started + Duration::from_secs(10)),
                Mode::Origin => b.inspection_origin = Rc::new(()),
                _ => {}
            }
            let before = b.json_work;
            let outcome = if matches!(mode, Mode::WrongPhase) {
                // Different actual RoundScope/phase with identical record values.
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
                        let err = pending.after_scan(&mut other_phases, b).unwrap_err();
                        captured = Some(err);
                        Ok(())
                    },
                );
                Err(captured.unwrap())
            } else {
                pending.after_scan(&mut phases, b)
            };
            spent = b.json_work - before;
            assert_eq!(state.borrow().calls, calls); // No source operation or cleanup retry.
            assert_eq!(dropped.get(), 1); // Observation gone BEFORE the next stage is used.
            match mode {
                Mode::Good | Mode::Forget => {
                    let stage = outcome.unwrap();
                    assert_eq!(
                        format!("{stage:?}"),
                        "AfterScanRound(awaiting_strict_tail_not_execution_authority)"
                    );
                    phases.finish(b)?;
                    if matches!(mode, Mode::Forget) {
                        std::mem::forget(stage);
                    } else {
                        drop(stage);
                    }
                }
                _ => {
                    let failure = outcome.unwrap_err();
                    let expected = match mode {
                        Mode::Work(_) => Failure::Limit,
                        Mode::Cancel | Mode::CancelAt(_) | Mode::CancelAtDrop => Failure::Cancelled,
                        Mode::Deadline | Mode::DeadlineAtDrop => Failure::Deadline,
                        Mode::Changed => Failure::Changed,
                        _ => Failure::Binding,
                    };
                    assert_eq!(failure.reason(), expected);
                    assert!(matches!(
                        failure.cleanup(),
                        CleanupDisposition::Confirmed(_)
                    ));
                    assert!(failure.summary_attempts().is_some());
                    assert_eq!(b.checkpoint(), Err(expected));
                }
            }
            Ok(())
        },
    );
    assert_eq!(dropped.get(), 1);
    assert_eq!(result.is_ok(), matches!(mode, Mode::Forget));
    let (claimed, stopped) = ledger_test::after_scan_state(&ledger);
    assert_eq!(claimed, !matches!(mode, Mode::Legacy));
    assert_eq!(stopped, !matches!(mode, Mode::Forget));
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
    assert_eq!(dropped.get(), 1);
    spent
}
#[test]
fn after_scan_stage_drops_observation_before_return_and_preserves_phase_finish() {
    let legacy = scenario(Mode::Legacy);
    assert_eq!(scenario(Mode::Good), legacy + 3);
    scenario(Mode::Forget);
}
#[test]
fn duplicate_claim_compared_phase_wrong_phase_and_changed_set_are_rejected() {
    for mode in [
        Mode::Duplicate,
        Mode::Compared,
        Mode::WrongPhase,
        Mode::Changed,
        Mode::Origin,
    ] {
        scenario(mode);
    }
}
#[test]
fn all_work_shortage_and_post_charge_cancel_prefixes_stop_and_release_observation_once() {
    let total = scenario(Mode::Good);
    for remaining in 0..total {
        scenario(Mode::Work(remaining));
    }
    for at in 1..=total {
        scenario(Mode::CancelAt(at));
    }
}
#[test]
fn late_stop_including_after_observation_release_keeps_closed_diagnostics() {
    for mode in [
        Mode::Cancel,
        Mode::Deadline,
        Mode::CancelAtDrop,
        Mode::DeadlineAtDrop,
    ] {
        scenario(mode);
    }
}
#[test]
fn after_scan_stage_is_not_clone_copy_or_serializable() {
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
    not_impl!(AfterScanRound<'_, '_, '_>, Clone);
    not_impl!(AfterScanRound<'_, '_, '_>, Copy);
    not_impl!(AfterScanRound<'_, '_, '_>, serde::Serialize);
    not_impl!(AfterScanRound<'_, '_, '_>, serde::de::DeserializeOwned);
}
#[test]
fn each_round_releases_its_observation_before_test_only_acknowledgement() {
    let (f, state) = fixture(Case::Good);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
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
        let dropped = Rc::new(Cell::new(0));
        round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let mut lease = ledger.begin(scope, b)?;
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
            assert_eq!(dropped.get(), 0);
            let stage = pending.after_scan(&mut phases, b).unwrap();
            assert_eq!(dropped.get(), 1);
            phases.finish(b)?;
            stage.acknowledge_for_test(b) // TEST ONLY; no production strict tail producer.
        })
        .unwrap();
        assert_eq!(dropped.get(), 1);
    }
    drop(ledger);
    assert_eq!(b.checkpoint(), Ok(()));
    assert_eq!(state.borrow().calls, 2628);
}
