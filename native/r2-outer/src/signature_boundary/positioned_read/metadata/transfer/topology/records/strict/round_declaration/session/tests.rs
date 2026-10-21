use super::super::tests::{Setup, context};
use super::*;
use crate::signature_boundary::positioned_read::work_audit::Audit;

// TEST ONLY: real collector cleanup and strict acknowledgement producers do not exist yet.
// No equivalent completion setter is compiled in a non-test build.
pub(super) fn finish_fixture(
    mut lease: RoundResourceScope<'_, '_, '_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    lease.require(lease.scope, b)?;
    lease.ledger.state = State::AwaitStrict(lease.scope.round);
    lease.completed = true;
    Ok(())
}
pub(super) fn ack_fixture(ledger: &mut ScanSessionLedger<'_>, round: Round) {
    assert!(ledger.state == State::AwaitStrict(round));
    ledger.state = match round {
        Round::Initial => State::Expect(Round::BeforeM4),
        Round::BeforeM4 => State::Expect(Round::AfterM4),
        Round::AfterM4 => State::Finished,
    };
}
fn alternate<'s>(
    scope: &RoundScope<'s>,
    f: &'s Setup,
    c: &'s InspectionContext<'s>,
) -> RoundScope<'s> {
    RoundScope {
        receipt: &f.receipt,
        target: &f.target,
        context: c,
        round: scope.round,
        token: scope.token.clone(),
        decode_started: Cell::new(false),
        budget_origin: scope.budget_origin.clone(),
        hash: scope.hash.clone(),
        index_path: scope.index_path.clone(),
    }
}

#[test]
fn three_round_order_uses_two_create_two_begin_and_one_require_work() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let old = (b.used, b.reserved, b.retries_left, b.started);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    assert_eq!(b.json_work, 2);
    assert_eq!(
        format!("{ledger:?}"),
        "ScanSessionLedger(state_only_not_resource_or_execution_authority)"
    );
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let old = b.json_work;
            let mut lease = ledger.begin(scope, b)?;
            assert_eq!(b.json_work - old, 2);
            assert_eq!(
                format!("{lease:?}"),
                "RoundResourceScope(binding_only_not_scan_permission)"
            );
            lease.require(scope, b)?;
            assert_eq!(b.json_work - old, 3);
            finish_fixture(lease, b)?;
            assert!(ledger.state == State::AwaitStrict(round));
            ack_fixture(&mut ledger, round);
            Ok(())
        })
        .unwrap();
    }
    assert!(ledger.state == State::Finished);
    drop(ledger);
    assert_eq!(b.checkpoint(), Ok(()));
    assert_eq!((b.used, b.reserved, b.retries_left, b.started), old);
    assert!(b.scan_session_claim.started.get());
}

#[test]
fn duplicate_creation_poisons_the_original_attempt_without_a_reset() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    assert!(matches!(
        create(&f.receipt, &f.target, &c, MODEL_ID, &mut b),
        Err(Failure::Binding)
    ));
    assert_eq!(b.json_work, 3); // duplicate's first work only
    assert_eq!(b.scan_session_claim.failure.get(), Some(Failure::Binding));
    let old = b.json_work;
    assert_eq!(
        with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| { ledger.begin(scope, b).map(|_| ()) }
        ),
        Err(Failure::Binding)
    );
    assert_eq!(b.json_work, old);
    drop(ledger);
    assert!(matches!(
        create(&f.receipt, &f.target, &c, MODEL_ID, &mut b),
        Err(Failure::Binding)
    ));
}

#[test]
fn abandoned_ledger_remains_claimed_and_propagates_failure_via_the_budget_guard() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    drop(create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap());
    assert_eq!(b.failed, None); // Drop has no mutable budget borrow
    assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
    assert!(matches!(
        create(&f.receipt, &f.target, &c, MODEL_ID, &mut b),
        Err(Failure::Unavailable)
    ));
    assert_eq!(b.json_work, 2);
}

#[test]
fn failed_creation_consumes_the_claim_before_any_fallible_step() {
    for case in 0..6 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let start = Instant::now();
        let now = Cell::new(start);
        let clock = || now.get();
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &clock;
        let expected = match case {
            0 | 1 => Failure::Limit,
            2 => Failure::Unavailable,
            3 => Failure::Cancelled,
            4 => Failure::Deadline,
            _ => Failure::HashMismatch,
        };
        match case {
            0 => b.json_work = 1_000_000,
            1 => b.json_work = 999_999,
            3 => cancel.store(true, Ordering::Release),
            4 => now.set(start + Duration::from_secs(10)),
            5 => {
                let _ = b.stop::<()>(Failure::HashMismatch);
            }
            _ => {}
        }
        let model = if case == 2 { "unknown" } else { MODEL_ID };
        assert!(matches!(create(&f.receipt,&f.target,&c,model,&mut b),Err(e) if e==expected));
        assert!(b.scan_session_claim.started.get());
        assert_eq!(b.scan_session_claim.failure.get(), Some(expected));
        let old = b.json_work;
        assert!(matches!(create(&f.receipt,&f.target,&c,MODEL_ID,&mut b),Err(e) if e==expected));
        assert_eq!(b.json_work, old);
    }
}

#[test]
fn out_of_order_active_awaiting_finished_and_stopped_states_cannot_begin() {
    for case in 0..7 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        let round = match case {
            0 => Round::BeforeM4,
            1 => Round::AfterM4,
            _ => Round::Initial,
        };
        ledger.state = match case {
            2 => State::Active(round),
            3 => State::AwaitStrict(round),
            4 => State::Finished,
            5 => State::Expect(Round::BeforeM4),
            6 => State::Stopped(Failure::Changed),
            _ => State::Expect(Round::Initial),
        };
        if case == 6 {
            ledger.claim.failure.set(Some(Failure::Changed));
        }
        let expected = if case == 6 {
            Failure::Changed
        } else {
            Failure::Binding
        };
        assert_eq!(
            with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
                ledger.begin(scope, b).map(|_| ())
            }),
            Err(expected)
        );
        assert_eq!(b.checkpoint(), Err(expected));
    }
}

#[test]
fn copied_receipt_equal_target_equal_context_or_wrong_round_origin_are_rejected() {
    for case in 0..4 {
        let f = Setup::new();
        let other = Setup::new();
        let c = context();
        let other_c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut wrong = alternate(scope, &f, &c);
                    match case {
                        0 => wrong.receipt = &other.receipt,
                        1 => wrong.target = &other.target,
                        2 => wrong.context = &other_c,
                        _ => wrong.budget_origin = Rc::new(()),
                    }
                    ledger.begin(&wrong, b).map(|_| ())
                }
            ),
            Err(Failure::Binding)
        );
        assert!(ledger.state == State::Stopped(Failure::Binding));
    }
}

#[test]
fn active_scope_rejects_copied_scope_new_token_and_budget_substitution() {
    for case in 0..5 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut lease = ledger.begin(scope, b)?;
                    if case <= 1 {
                        let mut wrong = alternate(scope, &f, &c);
                        if case == 1 {
                            wrong.token = Rc::new(());
                        }
                        lease.require(&wrong, b)
                    } else if case == 2 {
                        let mut wrong = SharedBudget::new(b.started, &cancel);
                        wrong.inspection_origin = b.inspection_origin.clone(); // same origin is insufficient
                        wrong.scan_session_claim.started.set(true);
                        lease.require(scope, &mut wrong)
                    } else {
                        if case == 3 {
                            b.started -= Duration::from_millis(1);
                        } else {
                            lease.ledger.model = "old";
                        }
                        lease.require(scope, b)
                    }
                }
            ),
            Err(if case == 4 {
                Failure::Unavailable
            } else {
                Failure::Binding
            })
        );
        assert!(matches!(ledger.state, State::Stopped(_)));
    }
}

#[test]
fn an_earlier_round_token_cannot_be_reused_for_the_next_slot() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    with_round(
        &f.receipt,
        &f.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let lease = ledger.begin(scope, b)?;
            finish_fixture(lease, b)?;
            ack_fixture(&mut ledger, Round::Initial);
            Ok(())
        },
    )
    .unwrap();
    let old_token = ledger.tokens[0].as_ref().unwrap().clone();
    assert_eq!(
        with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::BeforeM4,
            &mut b,
            |scope, b| {
                let mut wrong = alternate(scope, &f, &c);
                wrong.token = old_token;
                ledger.begin(&wrong, b).map(|_| ())
            }
        ),
        Err(Failure::Binding)
    );
    assert!(ledger.tokens[1].is_none());
    assert!(ledger.state == State::Stopped(Failure::Binding));
}

#[test]
fn abandoning_active_scope_and_explicit_failure_prevent_any_later_round() {
    for explicit in [false, true] {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        let expected = if explicit {
            Failure::HashMismatch
        } else {
            Failure::Unavailable
        };
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let lease = ledger.begin(scope, b)?;
                    if explicit {
                        let _ = b.stop::<()>(Failure::HashMismatch);
                        lease.stop(Failure::Changed, b)
                    } else {
                        drop(lease);
                        Ok(())
                    }
                }
            ),
            Err(expected)
        );
        let old = b.json_work;
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::BeforeM4,
                &mut b,
                |scope, b| { ledger.begin(scope, b).map(|_| ()) }
            ),
            Err(expected)
        );
        assert_eq!(b.json_work, old);
        assert!(ledger.state == State::Stopped(expected));
    }
}

#[test]
fn cancel_and_deadline_at_each_create_begin_require_charge_never_reset_the_attempt() {
    for phase in 0..3 {
        for at in 1..=if phase == 2 { 1 } else { 2 } {
            for deadline in [false, true] {
                let f = Setup::new();
                let c = context();
                let cancel = Rc::new(AtomicBool::new(false));
                let audit = Audit::default();
                let armed = Cell::new(false);
                let start = Instant::now();
                let clock = || {
                    if armed.get() && deadline && audit.counts().iter().sum::<u64>() >= at {
                        start + Duration::from_secs(10)
                    } else {
                        start
                    }
                };
                let mut b = SharedBudget::new(start, &cancel);
                b.now = &clock;
                let expected = if deadline {
                    Failure::Deadline
                } else {
                    Failure::Cancelled
                };
                if !deadline {
                    audit.cancel_after_work(at, cancel.clone());
                }
                if phase == 0 {
                    armed.set(true);
                    b.work_audit = Some(audit.clone());
                    assert!(
                        matches!(create(&f.receipt,&f.target,&c,MODEL_ID,&mut b),Err(e) if e==expected)
                    );
                } else {
                    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
                    assert_eq!(
                        with_round(
                            &f.receipt,
                            &f.target,
                            &c,
                            Round::Initial,
                            &mut b,
                            |scope, b| {
                                if phase == 1 {
                                    armed.set(true);
                                    b.work_audit = Some(audit.clone());
                                }
                                let mut lease = ledger.begin(scope, b)?;
                                if phase == 2 {
                                    armed.set(true);
                                    b.work_audit = Some(audit.clone());
                                }
                                lease.require(scope, b)
                            }
                        ),
                        Err(expected)
                    );
                    assert!(ledger.state == State::Stopped(expected));
                }
                assert_eq!(audit.counts().iter().sum::<u64>(), at);
                assert!(b.scan_session_claim.started.get());
                assert_eq!(b.scan_session_claim.failure.get(), Some(expected));
                assert_eq!(b.checkpoint(), Err(expected));
            }
        }
    }
}
