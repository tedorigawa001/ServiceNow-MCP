use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use records_stage::valid_fixture;
use scan_ops::connection_owner::{self as owner, testing as ot};

#[test]
fn fixed_round_kernel_requires_real_ack_for_each_owned_slot() {
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
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let slot = ot::take(&mut o, round, &mut b).unwrap();
        slot.run_fixed(quotas(), &mut b).unwrap();
        ot::ledger(&mut o).require_acknowledged(round, &b).unwrap();
    }
    assert_eq!(ot::remaining(&o), [false; 3]);
    drop(o);
    assert_eq!(source.stage_cycles(), 6);
    let (_, made, freed, _) = source.stage_counts();
    assert_eq!(made, freed);
    assert!(state.borrow().alive.is_empty());
}

#[derive(Clone, Copy)]
enum Stop {
    None,
    Deadline(usize),
    Cancel(usize),
    Work(u64),
    WorkCancel(u64),
    Precheck,
    NoPolicy,
    Collector(Case),
}
struct Report {
    checkpoints: usize,
    work: u64,
    reason: Option<Failure>,
    diagnostic: bool,
    cleanup: Option<bool>,
}
fn once(stop: Stop) -> Report {
    let (f, state, registry) = valid_fixture(false);
    if let Stop::Collector(case) = stop {
        state.borrow_mut().case = case;
    }
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let ticks = Cell::new(0usize);
    let armed = Cell::new(false);
    let clock = || {
        if armed.get() {
            let tick = ticks.get() + 1;
            ticks.set(tick);
            match stop {
                Stop::Deadline(at) if tick >= at => return now.get() + Duration::from_secs(10),
                Stop::Cancel(at) if tick >= at => cancel.store(true, Ordering::Release),
                _ => (),
            }
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    if matches!(stop, Stop::Precheck) {
        source.stage_fault(0, 1);
    }
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
    if !matches!(stop, Stop::NoPolicy) {
        ledger_test::configure(ot::ledger(&mut o), caps(), &mut b).unwrap();
    }
    let slot = o.initial(&mut b).unwrap();
    if let Stop::Work(available) = stop {
        b.json_work = 1_000_000 - available;
    }
    let work_before = b.json_work;
    if let Stop::WorkCancel(at) = stop {
        let audit = crate::signature_boundary::positioned_read::work_audit::Audit::default();
        audit.cancel_after_work(at, cancel.clone());
        b.work_audit = Some(audit);
    }
    armed.set(true);
    let result = slot.run_fixed(quotas(), &mut b);
    let checkpoints = ticks.get();
    let work = b.json_work - work_before;
    armed.set(false);
    let (reason, diagnostic, cleanup) = match result {
        Ok(()) => {
            ot::ledger(&mut o)
                .require_acknowledged(Round::Initial, &b)
                .unwrap();
            (None, false, None)
        }
        Err(e) => {
            assert_eq!(ot::details(&e).0, Some(Round::Initial));
            let completion = ot::completion(&e);
            if let Some(frame) = completion {
                match stop {
                    Stop::NoPolicy => {
                        assert!(matches!(frame.cleanup(), CleanupDisposition::NotStarted));
                        assert!(frame.summary_attempts().is_none());
                        assert_eq!(state.borrow().calls, 0);
                    }
                    Stop::Collector(case) => {
                        let CleanupDisposition::Incomplete(problem) = frame.cleanup() else {
                            panic!("incomplete collector must retain its diagnostic");
                        };
                        assert_eq!(
                            problem.issue(),
                            match case {
                                Case::Corrupt =>
                                    scan_ops::cleanup::CleanupIssue::DeclarationIncomplete,
                                Case::CleanupUnknown =>
                                    scan_ops::cleanup::CleanupIssue::ReleaseUnconfirmed,
                                _ => unreachable!(),
                            }
                        );
                        assert!(frame.summary_attempts().is_some());
                    }
                    _ => (),
                }
            }
            let cleanup =
                completion.map(|e| matches!(e.cleanup(), CleanupDisposition::Confirmed(_)));
            let reason = e.reason();
            assert_eq!(o.initial(&mut b).unwrap_err().reason(), reason);
            assert_eq!(b.stop::<()>(Failure::Changed), Err(reason));
            (Some(reason), completion.is_some(), cleanup)
        }
    };
    drop(o);
    let (_, made, freed, _) = source.stage_counts();
    assert_eq!(made, freed);
    assert!(state.borrow().alive.is_empty());
    Report {
        checkpoints,
        work,
        reason,
        diagnostic,
        cleanup,
    }
}

#[test]
fn fixed_round_kernel_owner_completion_guards_charge_two_units_and_reject_late_stop() {
    let n = once(Stop::None).work;
    for available in [n - 2, n - 1] {
        let r = once(Stop::Work(available));
        assert_eq!(r.reason, Some(Failure::Limit));
        assert!(!r.diagnostic);
        assert_eq!(r.work, available);
    }
    for at in [n - 1, n] {
        let r = once(Stop::WorkCancel(at));
        assert_eq!(r.reason, Some(Failure::Cancelled));
        assert!(!r.diagnostic);
        assert_eq!(r.work, at);
    }
}

#[test]
fn fixed_round_kernel_terminal_checkpoint_rejects_success_after_actual_ack() {
    let n = once(Stop::None).checkpoints;
    // After with_round's terminal checkpoint: work1 (2 guards), binding (1),
    // work2 (2), final checkpoint (1). Six clock observations remain.
    let terminal = once(Stop::Deadline(n - 6));
    assert_eq!(terminal.reason, Some(Failure::Deadline));
    assert!(!terminal.diagnostic); // ack consumed the tail; do not fabricate cleanup proof
    let ack = once(Stop::Deadline(n - 7));
    assert_eq!(ack.reason, Some(Failure::Deadline));
    assert!(ack.diagnostic); // immediately preceding checkpoint is still inside typed ack
    assert_eq!(ack.cleanup, Some(true));
    // Cancellation set by the preceding clock is seen at the terminal checkpoint.
    let cancel = once(Stop::Cancel(n - 7));
    assert_eq!(cancel.reason, Some(Failure::Cancelled));
    assert!(!cancel.diagnostic);
    for at in n - 5..=n {
        let late = once(Stop::Deadline(at));
        assert_eq!(late.reason, Some(Failure::Deadline));
        assert!(!late.diagnostic);
    }
}

#[test]
fn fixed_round_kernel_preserves_precheck_collector_and_policy_failure_diagnostics() {
    let pre = once(Stop::Precheck);
    assert_eq!(pre.reason, Some(Failure::ReadFailed));
    assert!(!pre.diagnostic);
    let policy = once(Stop::NoPolicy);
    assert_eq!(policy.reason, Some(Failure::Unavailable));
    assert!(policy.diagnostic);
    assert_eq!(policy.cleanup, Some(false));
    let digest = once(Stop::Collector(Case::Corrupt));
    assert_eq!(digest.reason, Some(Failure::HashMismatch));
    assert_eq!(digest.cleanup, Some(false));
    let cleanup = once(Stop::Collector(Case::CleanupUnknown));
    assert_eq!(cleanup.reason, Some(Failure::Unavailable));
    assert!(cleanup.diagnostic);
    assert_eq!(cleanup.cleanup, Some(false));
}
