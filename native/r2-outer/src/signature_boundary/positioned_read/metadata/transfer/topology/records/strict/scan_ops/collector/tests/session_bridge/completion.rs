use super::super::super::completion::{self, RoundScanSuccess};
use super::*;
use round_declaration::session::completion::PendingStrictRound;

#[derive(Clone, Copy)]
enum Mode {
    Integrated,
    Split,
    Forget,
    Duplicate,
    Work(u64),
    Cancel,
    Deadline,
    Origin,
    Claim,
    Started,
    Identity(u8),
    WorkCancel(u64),
    LateDeadline(u64),
}
fn scenario(case: Case, mode: Mode) {
    let (f, state) = fixture(case);
    let (other, _) = fixture(Case::Good);
    let (c, other_context) = (context(), context());
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let deadline_at = Cell::new(None);
    let ticks = Cell::new(0_u64);
    let clock = || {
        if let Some(at) = deadline_at.get() {
            ticks.set(ticks.get() + 1);
            if ticks.get() >= at {
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
            let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
            let estimate = calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
            let before = b.json_work;
            if matches!(mode, Mode::Integrated) {
                let result = completion::collect_and_complete(
                    lease,
                    estimate,
                    &inputs,
                    scope,
                    (
                        Fake(state.clone()),
                        if matches!(case, Case::NoQuotas) {
                            None
                        } else {
                            quotas()
                        },
                    ),
                    b,
                );
                match result {
                    Ok(pending) => {
                        assert!(matches!(case, Case::Good));
                        assert!(pending.awaiting());
                        assert_eq!(pending.observation().entries, f.observed);
                        // kernel + bridge7 + entry1 + require/connect2 + completion3.
                        assert_eq!(b.json_work - before, run(Case::Good, Round::Initial).2 + 13);
                        assert_eq!(
                            format!("{pending:?}"),
                            "PendingStrictRound(awaiting_strict_not_execution_authority)"
                        );
                        drop(pending); // Unacknowledged success must stop, never unlock the next round.
                        assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
                    }
                    Err(failure) => {
                        assert!(!matches!(case, Case::Good));
                        if matches!(case, Case::NoQuotas) {
                            assert!(matches!(failure.cleanup(), CleanupDisposition::NotStarted));
                        } else {
                            assert!(failure.summary_attempts().is_some());
                        }
                        assert_eq!(b.checkpoint(), Err(failure.reason()));
                    }
                }
                return Ok(());
            }
            let success = completion::pause_after_scan(
                &mut lease,
                estimate,
                &inputs,
                scope,
                (Fake(state.clone()), quotas()),
                b,
            )
            .unwrap();
            assert_eq!(success.observation().entries, f.observed);
            assert_eq!(
                format!("{success:?}"),
                "RoundScanSuccess(scan_only_not_strict_success)"
            );
            let used = b.json_work;
            match mode {
                Mode::Duplicate => ledger_test::consume_complete_claim(&mut lease),
                Mode::Work(n) => b.json_work = 1_000_000 - n,
                Mode::Cancel => cancel.store(true, Ordering::Release),
                Mode::Deadline => now.set(b.started + Duration::from_secs(10)),
                Mode::LateDeadline(at) => deadline_at.set(Some(at)),
                Mode::WorkCancel(at) => {
                    let audit =
                        crate::signature_boundary::positioned_read::work_audit::Audit::default();
                    audit.cancel_after_work(at, cancel.clone());
                    b.work_audit = Some(audit);
                }
                Mode::Origin => b.inspection_origin = Rc::new(()),
                Mode::Claim => b.scan_session_claim = Rc::new(Default::default()),
                Mode::Started => b.started -= Duration::from_millis(1),
                Mode::Identity(kind) => ledger_test::taint_completion_identity(
                    &mut lease,
                    &other.receipt,
                    &other.target,
                    &other_context,
                    kind,
                ),
                _ => {}
            }
            let result = lease.complete_scan(success, b);
            match mode {
                Mode::Split | Mode::Forget => {
                    let pending = result.unwrap();
                    assert!(pending.awaiting());
                    assert_eq!(b.json_work - used, 3);
                    drop(inputs); // Pending must not borrow Inputs/phase owner.
                    phases.after_scan(pending.observation(), b)?;
                    phases.finish(b)?;
                    if matches!(mode, Mode::Forget) {
                        std::mem::forget(pending); // Still AwaitStrict; cannot open the next round.
                        assert_eq!(b.checkpoint(), Ok(()));
                    } else {
                        drop(pending);
                        assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
                    }
                }
                _ => {
                    let failure = result.unwrap_err();
                    let expected = match mode {
                        Mode::Work(_) => Failure::Limit,
                        Mode::Cancel | Mode::WorkCancel(_) => Failure::Cancelled,
                        Mode::Deadline | Mode::LateDeadline(_) => Failure::Deadline,
                        _ => Failure::Binding,
                    };
                    assert_eq!(failure.reason(), expected);
                    assert!(matches!(
                        failure.cleanup(),
                        CleanupDisposition::Confirmed(_)
                    ));
                    assert!(failure.summary_attempts().is_some());
                    assert_eq!(b.checkpoint(), Err(expected));
                    assert_eq!(
                        format!("{failure:?}"),
                        "RoundCompletionFailure(diagnostics_only)"
                    );
                }
            }
            Ok(())
        },
    );
    assert_eq!(result.is_ok(), matches!(mode, Mode::Forget));
    assert_eq!(state.borrow().next, state.borrow().released.len() as u64);
    let (claimed, stopped) = ledger_test::completion_state(&ledger);
    assert_eq!(stopped, !matches!(mode, Mode::Forget));
    assert_eq!(
        claimed,
        !matches!(mode, Mode::Integrated) || matches!(case, Case::Good)
    );
    let calls = state.borrow().calls;
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
    assert_eq!(state.borrow().calls, calls);
}
#[test]
fn forgetting_pending_evidence_does_not_acknowledge_or_unlock_the_next_round() {
    scenario(Case::Good, Mode::Forget);
}
#[test]
fn real_closed_scan_is_consumed_once_and_pending_drop_cannot_advance_round() {
    scenario(Case::Good, Mode::Integrated);
    scenario(Case::Good, Mode::Split);
    scenario(Case::Good, Mode::Duplicate);
}
#[test]
fn completion_failure_preserves_closed_diagnostics_at_every_work_prefix() {
    for n in 0..3 {
        scenario(Case::Good, Mode::Work(n));
    }
}
#[test]
fn completion_rejects_late_stop_and_other_budget_identity() {
    for mode in [
        Mode::Cancel,
        Mode::Deadline,
        Mode::Origin,
        Mode::Claim,
        Mode::Started,
    ] {
        scenario(Case::Good, mode);
    }
}
#[test]
fn completion_requires_original_receipt_lineage_target_context_token_and_accounting() {
    for kind in 0..9 {
        scenario(Case::Good, Mode::Identity(kind));
    }
}
#[test]
fn every_post_charge_cancel_and_final_checkpoint_deadline_preserves_closed_evidence() {
    for at in 1..=3 {
        scenario(Case::Good, Mode::WorkCancel(at));
    }
    for at in 1..=8 {
        scenario(Case::Good, Mode::LateDeadline(at));
    }
}
#[test]
fn actual_closed_proofs_bind_each_round_slot_with_test_only_strict_acknowledgement() {
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
            .map_err(|e| e.reason())?;
            assert!(pending.awaiting());
            drop(inputs);
            phases.after_scan(pending.observation(), b)?;
            phases.finish(b)?;
            pending.acknowledge_for_test(b) // TEST ONLY: bypass the actual strict tail/ack.
        })
        .unwrap();
    }
    drop(ledger);
    assert_eq!(b.checkpoint(), Ok(()));
    assert_eq!(state.borrow().calls, 2628);
}
#[test]
fn failed_or_unstarted_fixed_scan_never_produces_round_completion() {
    for case in [
        Case::Corrupt,
        Case::Surplus,
        Case::CleanupUnknown,
        Case::NoQuotas,
        Case::Cancel(876),
        Case::Deadline(876),
    ] {
        scenario(case, Mode::Integrated);
    }
}
#[test]
fn round_completion_evidence_cannot_be_cloned_copied_or_serialized() {
    macro_rules! not_impl {
        ($t:ty, $bound:path) => {{
            trait Ambiguous<A> {
                fn check() {}
            }
            impl<T: ?Sized> Ambiguous<()> for T {}
            impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
            let _ = <$t as Ambiguous<_>>::check;
        }};
    }
    not_impl!(RoundScanSuccess, Clone);
    not_impl!(RoundScanSuccess, Copy);
    not_impl!(RoundScanSuccess, serde::Serialize);
    not_impl!(RoundScanSuccess, serde::de::DeserializeOwned);
    not_impl!(PendingStrictRound<'_, '_, '_>, Clone);
    not_impl!(PendingStrictRound<'_, '_, '_>, Copy);
    not_impl!(PendingStrictRound<'_, '_, '_>, serde::Serialize);
    not_impl!(PendingStrictRound<'_, '_, '_>, serde::de::DeserializeOwned);
}
