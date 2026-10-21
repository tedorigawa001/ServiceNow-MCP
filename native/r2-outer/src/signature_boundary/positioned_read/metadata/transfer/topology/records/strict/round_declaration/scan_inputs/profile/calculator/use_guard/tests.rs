use super::super::super::super::tests::setup;
use super::super::super::tests::ready;
use super::*;
use std::{cell::Cell, time::Duration};

fn resources(b: &SharedBudget<'_>) -> (Instant, [u64; 6], u8) {
    (
        b.started,
        [
            b.used,
            b.reserved,
            b.metadata_calls.into(),
            b.metadata_cleanup_reserved.into(),
            b.metadata_name_bytes,
            b.topology_calls.into(),
        ],
        b.retries_left,
    )
}

#[test]
fn consuming_guard_sets_only_original_inputs_ready_in_exactly_seven_work() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
        assert_eq!(inputs.scan_started.get(), State::Fresh);
        let profile = build(inputs, scope, MODEL_ID, b)?;
        let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
        assert_eq!(inputs.scan_started.get(), State::Fresh);
        let before = b.json_work;
        let resources = (b.used, b.reserved, b.retries_left, b.started);
        consume(estimate, inputs, scope, b)?;
        assert_eq!(b.json_work - before, 7);
        assert_eq!(
            inputs.scan_started.get(),
            State::BridgeReady {
                started: b.started,
                retries: b.retries_left
            }
        );
        assert_eq!((b.used, b.reserved, b.retries_left, b.started), resources);
        Ok(())
    })
    .unwrap();
}

#[test]
fn all_rounds_and_retry_remainders_preserve_the_shared_resources_and_ready_phase() {
    let s = setup();
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        for retries in 0..=8 {
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            b.retries_left = retries;
            ready(&s, round, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let before = resources(b);
                let old = b.json_work;
                consume(estimate, inputs, scope, b)?;
                assert_eq!(b.json_work - old, 7);
                assert_eq!(resources(b), before);
                assert_eq!(
                    inputs.scan_started.get(),
                    State::BridgeReady {
                        started: b.started,
                        retries
                    }
                );
                // No phase advancement: the existing Ready guard still succeeds.
                inputs.guard(scope, b)?;
                assert_eq!(
                    format!("{:?}", inputs.scan_started.get()),
                    "ScanUseState(private_not_execution_authority)"
                );
                Ok(())
            })
            .unwrap();
        }
    }
}

#[test]
fn wrong_models_stop_before_publication_and_do_not_reset_the_attempt() {
    for case in 0..5 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let mut estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                match case {
                    0 => estimate.calculator_model = "unknown",
                    1 => estimate.kernel_model = "unknown",
                    2 => estimate.calculator_model = "bp5-r2-scan-work-0.1",
                    3 => estimate.kernel_model = "bp5-r2-scan-work-0.1",
                    4 => estimate.profile.model = "unknown",
                    _ => unreachable!(),
                }
                let old = b.json_work;
                let before = resources(b);
                assert_eq!(
                    consume(estimate, inputs, scope, b),
                    Err(Failure::Unavailable)
                );
                assert_eq!(b.json_work - old, if case == 4 { 4 } else { 6 });
                assert_eq!(inputs.scan_started.get(), State::Attempted);
                assert_eq!(resources(b), before);
                assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
                Err::<(), _>(Failure::Unavailable)
            }),
            Err(Failure::Unavailable)
        );
    }
}

#[test]
fn already_attempted_ready_or_entered_inputs_cannot_be_reused_or_downgraded() {
    let start = Instant::now();
    for prior in [
        State::Attempted,
        State::BridgeReady {
            started: start,
            retries: 8,
        },
        State::Entered,
    ] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(start, &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                // Only test fixtures may inject a prior state; there is no reset/constructor API.
                inputs.scan_started.set(prior);
                let old = b.json_work;
                assert_eq!(consume(estimate, inputs, scope, b), Err(Failure::Binding));
                assert_eq!(b.json_work - old, 7);
                assert_eq!(inputs.scan_started.get(), prior);
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn wrong_inputs_receipt_scope_round_or_budget_stop_without_touching_other_inputs() {
    for case in 0..11 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = if case == 2 || case == 3 {
            Failure::Changed
        } else {
            Failure::Binding
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let other = setup();
                let context = super::super::super::super::super::tests::context();
                let copied_scope = RoundScope {
                    receipt: if case == 8 {
                        &other.receipt
                    } else {
                        scope.receipt
                    },
                    target: if case == 9 {
                        &other.target
                    } else {
                        scope.target
                    },
                    context: if case == 10 { &context } else { scope.context },
                    round: if case == 7 {
                        Round::AfterM4
                    } else {
                        scope.round
                    },
                    token: if case == 6 {
                        Rc::new(())
                    } else {
                        scope.token.clone()
                    },
                    decode_started: Cell::new(true),
                    budget_origin: scope.budget_origin.clone(),
                    hash: scope.hash.clone(),
                    index_path: scope.index_path.clone(),
                };
                let copy = ScanInputs {
                    declaration: inputs.declaration,
                    phases: inputs.phases,
                    root: inputs.root,
                    index: inputs.index.clone(),
                    profile_started: Cell::new(false),
                    scan_started: Cell::new(State::Fresh),
                };
                match case {
                    0 => b.inspection_origin = Rc::new(()),
                    1 => b.started += Duration::from_nanos(1),
                    2 => b.retries_left -= 1,
                    3 => b.retries_left += 1,
                    _ => {}
                }
                let before = resources(b);
                assert_eq!(
                    consume(
                        estimate,
                        if case == 4 { &copy } else { inputs },
                        if case >= 5 { &copied_scope } else { scope },
                        b
                    ),
                    Err(expected)
                );
                assert_eq!(inputs.scan_started.get(), State::Attempted);
                assert_eq!(copy.scan_started.get(), State::Fresh);
                assert_eq!(resources(b), before);
                assert_eq!(b.checkpoint(), Err(expected));
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn every_insufficient_work_prefix_stays_attempted_and_never_publishes_ready() {
    for available in 0..=7 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let result = ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            b.json_work = 1_000_000 - available;
            let result = consume(estimate, inputs, scope, b);
            if available < 7 {
                assert_eq!(result, Err(Failure::Limit));
                assert_eq!(inputs.scan_started.get(), State::Attempted);
            } else {
                assert_eq!(result, Ok(()));
                assert!(matches!(
                    inputs.scan_started.get(),
                    State::BridgeReady { .. }
                ));
            }
            assert_eq!(b.json_work, 1_000_000);
            result
        });
        assert_eq!(
            result,
            if available < 7 {
                Err(Failure::Limit)
            } else {
                Ok(())
            }
        );
    }
}

#[test]
fn every_post_charge_cancel_and_deadline_keeps_the_original_attempt_spent() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for deadline in [false, true] {
        for at in 1..=7 {
            let s = setup();
            let audit = Audit::default();
            let cancel = Rc::new(AtomicBool::new(false));
            let active = Cell::new(false);
            let start = Instant::now();
            let clock = || {
                if deadline && active.get() && audit.counts().iter().sum::<u64>() >= at {
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
            assert_eq!(
                ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                    let profile = build(inputs, scope, MODEL_ID, b)?;
                    let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                    let before = resources(b);
                    b.work_audit = Some(audit.clone());
                    if !deadline {
                        audit.cancel_after_work(at, cancel.clone());
                    }
                    active.set(true);
                    assert_eq!(consume(estimate, inputs, scope, b), Err(expected));
                    assert_eq!(audit.counts().iter().sum::<u64>(), at);
                    assert_eq!(inputs.scan_started.get(), State::Attempted);
                    assert_eq!(resources(b), before);
                    assert_eq!(b.checkpoint(), Err(expected));
                    Err::<(), _>(expected)
                }),
                Err(expected)
            );
        }
    }
}

#[test]
fn terminal_checks_after_the_fifth_sixth_and_seventh_units_never_publish_late_ready() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for deadline in [false, true] {
        for at in 5..=7 {
            let s = setup();
            let audit = Audit::default();
            let cancel = AtomicBool::new(false);
            let active = Cell::new(false);
            let seen = Cell::new(0u8);
            let start = Instant::now();
            let clock = || {
                if active.get() && audit.counts().iter().sum::<u64>() == at {
                    seen.set(seen.get() + 1);
                    if deadline && seen.get() == 2 {
                        return start + Duration::from_secs(10);
                    }
                    if !deadline && seen.get() == 1 {
                        // Set during work's post-charge clock read, after its cancel check.
                        // The following explicit terminal checkpoint must catch this.
                        cancel.store(true, std::sync::atomic::Ordering::Release);
                    }
                }
                start
            };
            let mut b = SharedBudget::new(start, &cancel);
            b.now = &clock;
            let expected = if deadline {
                Failure::Deadline
            } else {
                Failure::Cancelled
            };
            assert_eq!(
                ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                    let profile = build(inputs, scope, MODEL_ID, b)?;
                    let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                    b.work_audit = Some(audit.clone());
                    active.set(true);
                    assert_eq!(consume(estimate, inputs, scope, b), Err(expected));
                    assert_eq!(inputs.scan_started.get(), State::Attempted);
                    assert_eq!(audit.counts().iter().sum::<u64>(), at);
                    assert_eq!(seen.get(), if deadline { 2 } else { 1 });
                    Err::<(), _>(expected)
                }),
                Err(expected)
            );
        }
    }
}

#[test]
fn prior_sticky_failure_or_precancel_uses_the_attempt_without_charging_work() {
    for case in 0..6 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = match case {
            0 => Failure::Unavailable,
            1 => Failure::Binding,
            2 => Failure::Limit,
            3 => Failure::Deadline,
            4 | 5 => Failure::Cancelled,
            _ => unreachable!(),
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let mut estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                estimate.kernel_model = "unknown";
                let old = b.json_work;
                let before = resources(b);
                if case == 5 {
                    cancel.store(true, std::sync::atomic::Ordering::Release);
                } else {
                    b.failed = Some(expected);
                }
                assert_eq!(consume(estimate, inputs, scope, b), Err(expected));
                assert_eq!(inputs.scan_started.get(), State::Attempted);
                assert_eq!(b.json_work, old);
                assert_eq!(resources(b), before);
                assert_eq!(b.checkpoint(), Err(expected));
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn successful_use_does_not_restore_profile_claim_or_allow_inputs_reconstruction() {
    for rebind in [false, true] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                consume(estimate, inputs, scope, b)?;
                let state = inputs.scan_started.get();
                if rebind {
                    assert_eq!(
                        inputs.phases.bind_inputs(scope, b).unwrap_err(),
                        Failure::Binding
                    );
                } else {
                    assert_eq!(
                        build(inputs, scope, MODEL_ID, b).unwrap_err(),
                        Failure::Binding
                    );
                }
                assert_eq!(inputs.scan_started.get(), state);
                assert!(inputs.profile_started.get());
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn guard_is_not_a_work_admission_or_a_collector_dispatch() {
    let s = super::super::super::tests::augmented(5000, 0, "index.json", 0);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
        let profile = build(inputs, scope, MODEL_ID, b)?;
        let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
        assert!(estimate.total > 1_000_000);
        let before = resources(b);
        let old = b.json_work;
        consume(estimate, inputs, scope, b)?;
        assert_eq!(b.json_work - old, 7);
        assert_eq!(resources(b), before);
        assert!(matches!(
            inputs.scan_started.get(),
            State::BridgeReady { .. }
        ));
        // No entry transition, ClosureObservation, source parameter or quota producer.
        assert!(!matches!(inputs.scan_started.get(), State::Entered));
        Ok(())
    })
    .unwrap();
}
