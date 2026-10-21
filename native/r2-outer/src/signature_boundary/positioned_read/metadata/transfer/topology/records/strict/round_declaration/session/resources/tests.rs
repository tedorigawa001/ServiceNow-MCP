use super::super::super::tests::{Setup, context};
use super::super::tests::{ack_fixture, finish_fixture};
use super::*;

fn policy() -> ResourcePolicy {
    let cap = Caps {
        attempts: [100; 5],
        total: 500,
        live: 3,
        names: 65578,
    };
    ResourcePolicy {
        model: MODEL,
        session: cap,
        rounds: [cap; 3],
    }
}
struct Fake {
    releases: Rc<Cell<u64>>,
    confirmed: bool,
}
impl Resource for Fake {
    fn release(self) -> bool {
        self.releases.set(self.releases.get() + 1);
        self.confirmed
    }
}
fn fake(count: &Rc<Cell<u64>>, confirmed: bool) -> Fake {
    Fake {
        releases: count.clone(),
        confirmed,
    }
}
#[test]
fn three_round_cumulative_counts_names_and_peak_are_not_reset_or_summed() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let original = (b.used, b.reserved, b.retries_left, b.started);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    let mut p = policy();
    p.session.attempts = [3, 3, 3, 6, 6];
    p.session.total = 21;
    p.session.live = 2;
    p.session.names = 63;
    ledger.configure_resources(p, &mut b).unwrap();
    let releases = Rc::new(Cell::new(0));
    for (slot, round) in [Round::Initial, Round::BeforeM4, Round::AfterM4]
        .into_iter()
        .enumerate()
    {
        with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let mut lease = ledger.begin(scope, b)?;
            lease.with_resources(b, |ops, b| {
                let a = ops.acquire(Operation::Open, b, || Ok(fake(&releases, true)))?;
                let acl = ops.acquire(Operation::Metadata, b, || Ok(fake(&releases, true)))?;
                ops.attempt(Operation::Enum, b, || Ok(()))?;
                ops.attempt(Operation::Read, b, || Ok(()))?;
                ops.copy_names(21, b, || Ok(21))?;
                assert_eq!(ops.book.borrow().session.cleanup_reserved, 2);
                drop(a);
                drop(acl);
                Ok(())
            })?;
            finish_fixture(lease, b)?;
            ack_fixture(&mut ledger, round);
            let a = ledger.resources.as_ref().unwrap().borrow();
            assert_eq!(
                a.session.attempts,
                [
                    slot as u64 + 1,
                    slot as u64 + 1,
                    slot as u64 + 1,
                    2 * (slot as u64 + 1),
                    2 * (slot as u64 + 1)
                ]
            );
            assert_eq!(a.session.total, 7 * (slot as u64 + 1));
            assert_eq!(a.session.peak, 2);
            assert_eq!(a.session.names, 21 * (slot as u64 + 1));
            assert_eq!(a.rounds[slot].total, 7);
            assert_eq!(a.session.cleanup_reserved, 0);
            assert_eq!(a.session.live, 0);
            Ok(())
        })
        .unwrap();
    }
    assert_eq!(releases.get(), 6);
    assert_eq!((b.used, b.reserved, b.retries_left, b.started), original);
}

#[test]
fn every_round_and_session_cap_blocks_before_the_source_and_never_partially_commits() {
    for which in 0..10 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        let mut p = policy();
        let cap = if which < 5 {
            &mut p.session
        } else {
            &mut p.rounds[0]
        };
        match which % 5 {
            0 => cap.attempts[0] = 0,
            1 => cap.attempts[4] = 0,
            2 => cap.total = 1, // acquire needs dispatch + future cleanup
            3 => cap.live = 0,
            _ => cap.names = 20,
        }
        ledger.configure_resources(p, &mut b).unwrap();
        let calls = Cell::new(0);
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut lease = ledger.begin(scope, b)?;
                    lease.with_resources(b, |ops, b| {
                        let before = ops.book.borrow().session;
                        let result = if which % 5 == 4 {
                            ops.copy_names(21, b, || {
                                calls.set(calls.get() + 1);
                                Ok(21)
                            })
                        } else {
                            ops.acquire(Operation::Open, b, || {
                                calls.set(calls.get() + 1);
                                Ok(fake(&Rc::new(Cell::new(0)), true))
                            })
                            .map(drop)
                        };
                        assert_eq!(ops.book.borrow().session, before);
                        result
                    })
                }
            ),
            Err(Failure::Limit)
        );
        assert_eq!(calls.get(), 0);
        assert_eq!(b.checkpoint(), Err(Failure::Limit));
    }
}

#[test]
fn session_exhaustion_in_second_round_is_not_refilled_by_fresh_round_capacity() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    let mut p = policy();
    p.session.attempts[2] = 1;
    ledger.configure_resources(p, &mut b).unwrap();
    with_round(
        &f.receipt,
        &f.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let mut lease = ledger.begin(scope, b)?;
            lease.with_resources(b, |ops, b| ops.attempt(Operation::Read, b, || Ok(())))?;
            finish_fixture(lease, b)?;
            ack_fixture(&mut ledger, Round::Initial);
            Ok(())
        },
    )
    .unwrap();
    let calls = Cell::new(0);
    assert_eq!(
        with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::BeforeM4,
            &mut b,
            |scope, b| {
                let mut lease = ledger.begin(scope, b)?;
                lease.with_resources(b, |ops, b| {
                    ops.attempt(Operation::Read, b, || {
                        calls.set(1);
                        Ok(())
                    })
                })
            }
        ),
        Err(Failure::Limit)
    );
    assert_eq!(calls.get(), 0);
    let a = ledger.resources.as_ref().unwrap().borrow();
    assert_eq!(a.session.attempts[2], 1);
    assert_eq!(a.rounds[1].attempts[2], 0);
}

#[test]
fn source_failure_returns_only_unused_reservations_not_attempts_or_work() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    ledger.configure_resources(policy(), &mut b).unwrap();
    assert_eq!(
        with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let mut lease = ledger.begin(scope, b)?;
                lease.with_resources(b, |ops, b| {
                    let old = b.json_work;
                    let result =
                        ops.acquire::<Fake>(Operation::Open, b, || Err(Failure::ReadFailed));
                    assert_eq!(b.json_work - old, 2);
                    let a = ops.book.borrow();
                    assert_eq!(a.session.attempts[0], 1);
                    assert_eq!(a.session.total, 1);
                    assert_eq!(a.session.cleanup_reserved, 0);
                    assert_eq!(a.session.live_reserved, 0);
                    assert_eq!(a.session.live, 0);
                    assert_eq!(a.session.attempts[4], 0);
                    result.map(drop)
                })
            }
        ),
        Err(Failure::ReadFailed)
    );
}

#[test]
fn prepaid_cleanup_runs_for_all_owners_after_cancel_deadline_or_work_failure() {
    for mode in 0..4 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        ledger.configure_resources(policy(), &mut b).unwrap();
        let releases = Rc::new(Cell::new(0));
        let expected = match mode {
            0 => Failure::Cancelled,
            1 => Failure::Deadline,
            2 => Failure::Limit,
            _ => Failure::HashMismatch,
        };
        let result = with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let mut lease = ledger.begin(scope, b)?;
                lease.with_resources(b, |ops, b| {
                    let a = ops.acquire(Operation::Open, b, || Ok(fake(&releases, true)))?;
                    let acl = ops.acquire(Operation::Metadata, b, || Ok(fake(&releases, false)))?;
                    match mode {
                        0 => cancel.store(true, Ordering::SeqCst),
                        1 => b.started = Instant::now() - std::time::Duration::from_secs(11),
                        2 => b.json_work = 1_000_000,
                        _ => {
                            let _ = b.stop::<()>(Failure::HashMismatch);
                        }
                    }
                    let result = ops.attempt(Operation::Read, b, || panic!("must not dispatch"));
                    let spent = b.json_work;
                    drop(a);
                    drop(acl);
                    assert_eq!(spent, b.json_work);
                    let a = ops.book.borrow();
                    assert_eq!(a.session.attempts[4], 2);
                    assert_eq!(a.session.unconfirmed, 1);
                    assert_eq!(a.session.live, 0);
                    assert_eq!(a.session.cleanup_reserved, 0);
                    result
                })
            },
        );
        assert_eq!(result, Err(expected));
        assert_eq!(releases.get(), 2);
        assert_eq!(b.checkpoint(), Err(expected));
    }
}

#[test]
fn late_success_is_owned_then_released_before_returning_cancellation() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    ledger.configure_resources(policy(), &mut b).unwrap();
    let releases = Rc::new(Cell::new(0));
    assert_eq!(
        with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let mut lease = ledger.begin(scope, b)?;
                lease.with_resources(b, |ops, b| {
                    ops.acquire(Operation::Open, b, || {
                        cancel.store(true, Ordering::SeqCst);
                        Ok(fake(&releases, true))
                    })
                    .map(drop)
                })
            }
        ),
        Err(Failure::Cancelled)
    );
    assert_eq!(releases.get(), 1);
    let a = ledger.resources.as_ref().unwrap().borrow();
    assert_eq!(a.session.attempts[0], 1);
    assert_eq!(a.session.attempts[4], 1);
    assert_eq!(a.session.live, 0);
    assert_eq!(a.session.cleanup_reserved, 0);
}

#[test]
fn pure_candidate_overflow_and_total_cleanup_reservation_are_fail_closed() {
    for field in 0..5 {
        let mut u = Used::default();
        let cap = Caps {
            attempts: [u64::MAX; 5],
            total: u64::MAX,
            live: u64::MAX,
            names: u64::MAX,
        };
        match field {
            0 => u.attempts[0] = u64::MAX,
            1 => u.total = u64::MAX,
            2 => u.cleanup_reserved = u64::MAX,
            3 => u.live_reserved = u64::MAX,
            _ => u.live = u64::MAX,
        }
        assert!(matches!(
            candidate(u, cap, Operation::Open, true),
            Err(Failure::Limit)
        ));
    }
    let cap = Caps {
        attempts: [10; 5],
        total: 2,
        live: 1,
        names: 0,
    };
    let u = candidate(Used::default(), cap, Operation::Open, true).unwrap();
    assert!(matches!(
        candidate(u, cap, Operation::Read, false),
        Err(Failure::Limit)
    ));
}

#[test]
fn no_policy_unknown_model_reconfiguration_and_leaked_owner_never_allow_success() {
    for mode in 0..4 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        if mode == 1 {
            let mut p = policy();
            p.model = "unknown";
            assert_eq!(
                ledger.configure_resources(p, &mut b),
                Err(Failure::Unavailable)
            );
            continue;
        }
        if mode >= 2 {
            ledger.configure_resources(policy(), &mut b).unwrap();
        }
        if mode == 2 {
            assert_eq!(
                ledger.configure_resources(policy(), &mut b),
                Err(Failure::Binding)
            );
            continue;
        }
        let calls = Cell::new(0);
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut lease = ledger.begin(scope, b)?;
                    lease.with_resources(b, |ops, b| {
                        calls.set(1);
                        let owner = ops.acquire(Operation::Open, b, || {
                            Ok(fake(&Rc::new(Cell::new(0)), true))
                        })?;
                        std::mem::forget(owner);
                        Ok(())
                    })
                }
            ),
            Err(Failure::Unavailable)
        );
        assert_eq!(calls.get(), u32::from(mode == 3));
    }
}

#[test]
fn held_owner_exhausts_peak_and_cleanup_capacity_without_refunding_consumption() {
    for which in 0..4 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        let mut p = policy();
        let cap = if which < 2 {
            &mut p.session
        } else {
            &mut p.rounds[0]
        };
        if which % 2 == 0 {
            cap.live = 1;
        } else {
            cap.attempts[4] = 1;
        }
        ledger.configure_resources(p, &mut b).unwrap();
        let releases = Rc::new(Cell::new(0));
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut lease = ledger.begin(scope, b)?;
                    lease.with_resources(b, |ops, b| {
                        let owner =
                            ops.acquire(Operation::Open, b, || Ok(fake(&releases, true)))?;
                        let before = ops.book.borrow().session;
                        let denied = ops
                            .acquire::<Fake>(Operation::Metadata, b, || panic!("no extra acquire"));
                        assert_eq!(ops.book.borrow().session, before);
                        drop(owner);
                        denied.map(drop)
                    })
                }
            ),
            Err(Failure::Limit)
        );
        assert_eq!(releases.get(), 1);
        let a = ledger.resources.as_ref().unwrap().borrow();
        assert_eq!(a.session.total, 2);
        assert_eq!(a.session.attempts[4], 1);
        assert_eq!(a.session.live, 0);
        assert_eq!(a.session.peak, 1);
    }
}

#[test]
fn precharge_failure_never_commits_reservations_or_calls_source() {
    for remaining in 0..2 {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        ledger.configure_resources(policy(), &mut b).unwrap();
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut lease = ledger.begin(scope, b)?;
                    lease.with_resources(b, |ops, b| {
                        b.json_work = 1_000_000 - remaining;
                        let denied =
                            ops.acquire::<Fake>(Operation::Open, b, || panic!("no dispatch"));
                        assert_eq!(b.json_work, 1_000_000);
                        assert_eq!(ops.book.borrow().session, Used::default());
                        assert_eq!(ops.book.borrow().rounds[0], Used::default());
                        denied.map(drop)
                    })
                }
            ),
            Err(Failure::Limit)
        );
    }
}

#[test]
fn unconfirmed_cleanup_is_sticky_and_blocks_reuse_even_with_zero_live() {
    let f = Setup::new();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
    ledger.configure_resources(policy(), &mut b).unwrap();
    let releases = Rc::new(Cell::new(0));
    assert_eq!(
        with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let mut lease = ledger.begin(scope, b)?;
                lease.with_resources(b, |ops, b| {
                    drop(ops.acquire(Operation::Open, b, || Ok(fake(&releases, false)))?);
                    assert_eq!(ops.book.borrow().session.live, 0);
                    ops.acquire::<Fake>(Operation::Open, b, || panic!("unconfirmed cannot refill"))
                        .map(drop)
                })
            }
        ),
        Err(Failure::Unavailable)
    );
    assert_eq!(releases.get(), 1);
    assert_eq!(
        ledger
            .resources
            .as_ref()
            .unwrap()
            .borrow()
            .session
            .unconfirmed,
        1
    );
}

#[test]
fn malformed_and_late_name_copies_keep_bounded_actual_bytes() {
    for late in [false, true] {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        ledger.configure_resources(policy(), &mut b).unwrap();
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut lease = ledger.begin(scope, b)?;
                    lease.with_resources(b, |ops, b| {
                        ops.copy_names(65536, b, || {
                            if late {
                                cancel.store(true, Ordering::SeqCst);
                                Ok(21)
                            } else {
                                Ok(65537)
                            }
                        })
                    })
                }
            ),
            Err(if late {
                Failure::Cancelled
            } else {
                Failure::ReadFailed
            })
        );
        let a = ledger.resources.as_ref().unwrap().borrow();
        assert_eq!(a.session.names, if late { 21 } else { 65536 });
        assert_eq!(a.session.attempts[3], 1);
    }
}

#[test]
fn operation_boundary_rejects_another_budget_and_nonowning_open() {
    for wrong_budget in [false, true] {
        let f = Setup::new();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut ledger = create(&f.receipt, &f.target, &c, MODEL_ID, &mut b).unwrap();
        ledger.configure_resources(policy(), &mut b).unwrap();
        assert_eq!(
            with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let mut lease = ledger.begin(scope, b)?;
                    lease.with_resources(b, |ops, b| {
                        if wrong_budget {
                            let mut other = SharedBudget::new(Instant::now(), &cancel);
                            ops.attempt(Operation::Read, &mut other, || panic!("wrong origin"))
                        } else {
                            ops.attempt(Operation::Open, b, || panic!("open must own"))
                        }
                    })
                }
            ),
            Err(Failure::Binding)
        );
        assert_eq!(
            ledger.resources.as_ref().unwrap().borrow().session,
            Used::default()
        );
    }
}
