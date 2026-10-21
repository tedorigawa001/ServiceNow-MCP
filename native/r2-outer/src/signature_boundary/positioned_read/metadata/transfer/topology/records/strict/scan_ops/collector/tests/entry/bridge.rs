use super::*;
mod cleanup;

fn execute(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    state: &Rc<RefCell<State>>,
    q: Option<Quotas>,
    b: &mut SharedBudget<'_>,
) -> Result<Outcome<ClosureObservation>, Failure> {
    let p = profile::build(inputs, scope, profile::MODEL_ID, b)?;
    let estimate = calculator::calculate(p, inputs, scope, calculator::CALCULATOR_ID, b)?;
    let owners = Rc::strong_count(state);
    let out = consume_and_collect(estimate, inputs, scope, Fake(state.clone()), q, b);
    assert_eq!(Rc::strong_count(state), owners); // source ownership never escapes the bridge
    match out {
        DispatchOutcome::Collected(out) => Ok(out),
        DispatchOutcome::NotStarted(e) => Err(e),
    }
}

#[test]
fn single_bridge_moves_result_and_keeps_costs_for_each_round() {
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let (f, state) = fixture(Case::Good);
        with_inputs(&f, &state, round, |inputs, scope, b| {
            let before = b.json_work;
            let out = execute(inputs, scope, &state, quotas(), b)?;
            assert_eq!(out.result?.entries, f.observed);
            assert_eq!(out.summary.live, 0);
            assert_eq!(out.summary.pending_cleanup, 0);
            assert_eq!(out.summary.unconfirmed, 0);
            assert_eq!(b.json_work - before, 1992);
            assert_eq!(state.borrow().calls, 876);
            assert!(state.borrow().alive.is_empty());
            Ok(())
        })
        .unwrap();
    }
}

#[test]
fn guard_failures_never_call_source_or_issue_a_cleanup_summary() {
    for case in 0..6 {
        let (f, state) = fixture(Case::Good);
        let expected = [
            Failure::Limit,
            Failure::Cancelled,
            Failure::Deadline,
            Failure::Changed,
            Failure::Binding,
            Failure::Unavailable,
        ][case];
        assert_eq!(
            with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
                let p = profile::build(inputs, scope, profile::MODEL_ID, b)?;
                let estimate =
                    calculator::calculate(p, inputs, scope, calculator::CALCULATOR_ID, b)?;
                match case {
                    0 => b.json_work = 1_000_000,
                    1 => state.borrow().cancelled.store(true, Ordering::Release),
                    2 => state.borrow().now.set(b.started + Duration::from_secs(10)),
                    3 => b.retries_left -= 1,
                    4 => b.inspection_origin = Rc::new(()),
                    _ => {
                        let _ = b.stop::<()>(Failure::Unavailable);
                    }
                }
                let owners = Rc::strong_count(&state);
                match consume_and_collect(estimate, inputs, scope, Fake(state.clone()), quotas(), b)
                {
                    DispatchOutcome::NotStarted(e) => assert_eq!(e, expected),
                    DispatchOutcome::Collected(_) => panic!("guard failure called collector"),
                }
                assert_eq!(Rc::strong_count(&state), owners);
                assert_eq!(b.failed, Some(expected));
                assert_eq!(state.borrow().calls, 0);
                // The failed estimate is gone and the ORIGINAL Inputs attempt stays consumed.
                match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                    DispatchOutcome::NotStarted(e) => assert_eq!(e, expected),
                    DispatchOutcome::Collected(_) => panic!("guard failure was retried"),
                }
                assert_eq!(state.borrow().calls, 0);
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn collector_failures_preserve_first_reason_and_cleanup_evidence() {
    for (case, expected) in [
        (Case::NoQuotas, Failure::Unavailable),
        (Case::Corrupt, Failure::HashMismatch),
        (Case::Short, Failure::Changed),
        (Case::Surplus, Failure::Changed),
        (Case::EintrForever, Failure::ReadFailed),
        (Case::FsUnknown, Failure::MetadataUnavailable),
        (Case::CleanupUnknown, Failure::Unavailable),
        (Case::Cancel(1), Failure::Cancelled),
        (Case::Deadline(1), Failure::Deadline),
    ] {
        let (f, state) = fixture(case);
        assert_eq!(
            with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
                let q = if matches!(case, Case::NoQuotas) {
                    None
                } else {
                    quotas()
                };
                let out = execute(inputs, scope, &state, q, b)?;
                assert_eq!(
                    out.result.as_ref().map(|_| ()).map_err(|e| *e),
                    Err(expected)
                );
                assert_eq!(b.failed, Some(expected));
                assert_eq!(out.summary.live, 0);
                assert_eq!(out.summary.pending_cleanup, 0);
                assert_eq!(
                    out.summary.unconfirmed > 0,
                    matches!(case, Case::CleanupUnknown)
                );
                assert!(state.borrow().alive.is_empty());
                let calls = state.borrow().calls;
                match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                    DispatchOutcome::NotStarted(e) => assert_eq!(e, expected),
                    DispatchOutcome::Collected(_) => panic!("failed bridge retried collector"),
                }
                assert_eq!(state.borrow().calls, calls);
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

// Count the existing clock boundary, not a callback inserted into the production bridge.
// Arm only the final bridge checkpoint, after the kernel's own terminal guard succeeded.
fn timed_bridge(stop_at: Option<(u64, bool)>, unified: bool) -> (Result<(), Failure>, u64) {
    let (f, state) = fixture(Case::Good);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let start = state.borrow().start;
    let ticks = Cell::new(0_u64);
    let clock = || {
        let tick = ticks.get() + 1;
        ticks.set(tick);
        if let Some((at, cancellation)) = stop_at
            && tick == at
        {
            if cancellation {
                cancel.store(true, Ordering::Release);
            } else {
                return start + Duration::from_secs(10);
            }
        }
        start
    };
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &clock;
    let end_ticks = Cell::new(0);
    let result = round_declaration::with_round(
        &f.receipt,
        &f.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let d = scope.decode(b)?;
            let phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
            let estimate = calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
            ticks.set(0);
            let before = b.json_work;
            let dispatch = if unified {
                consume_and_collect(estimate, &inputs, scope, Fake(state.clone()), quotas(), b)
            } else {
                estimate.consume_for_collector(&inputs, scope, b)?;
                collect(&inputs, scope, Fake(state.clone()), quotas(), b)
            };
            let out = match dispatch {
                DispatchOutcome::Collected(out) => out,
                DispatchOutcome::NotStarted(_) => panic!("late stop happened before collector"),
            };
            end_ticks.set(ticks.get());
            assert_eq!(b.json_work - before, 1911); // use7 + dispatch1 + S1903
            assert_eq!(state.borrow().calls, 876);
            assert!(state.borrow().alive.is_empty());
            assert_eq!(out.summary.live, 0);
            assert_eq!(out.summary.pending_cleanup, 0);
            assert_eq!(out.summary.unconfirmed, 0);
            if let Some((_, cancellation)) = stop_at {
                let expected = if cancellation {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                };
                assert_eq!(b.failed, Some(expected));
                assert_eq!(
                    out.result.as_ref().map(|_| ()).map_err(|e| *e),
                    Err(expected)
                );
            }
            out.result.map(|_| ())
        },
    );
    (result, end_ticks.get())
}

#[test]
fn late_deadline_discards_success_but_keeps_cleanup_summary() {
    let (direct_result, direct_ticks) = timed_bridge(None, false);
    assert_eq!(direct_result, Ok(()));
    let (result, ticks) = timed_bridge(None, true);
    assert_eq!(result, Ok(()));
    assert_eq!(ticks, direct_ticks + 2); // exactly the bridge pre/post checkpoints
    assert_eq!(
        timed_bridge(Some((direct_ticks + 2, false)), true),
        (Err(Failure::Deadline), ticks)
    );
}

#[test]
fn cancellation_between_kernel_return_and_terminal_checkpoint_discards_success() {
    let (direct_result, direct_ticks) = timed_bridge(None, false);
    assert_eq!(direct_result, Ok(()));
    let (result, ticks) = timed_bridge(None, true);
    assert_eq!(result, Ok(()));
    assert_eq!(ticks, direct_ticks + 2);
    // now() in the kernel's final successful work guard sets the cancellation flag;
    // the bridge checkpoint must observe it before returning the Observation.
    assert_eq!(
        timed_bridge(Some((direct_ticks + 1, true)), true),
        (Err(Failure::Cancelled), ticks - 1)
    );
}

#[test]
fn bridge_allows_legal_retry_and_existing_after_scan_final_index_in_three_rounds() {
    let (f, state) = fixture(Case::Eintr);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let start = now.get();
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &clock;
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let out = execute(&inputs, scope, &state, quotas(), b)?;
            let observed = out.result?;
            assert_eq!(out.summary.live, 0);
            assert_eq!(out.summary.unconfirmed, 0);
            drop(inputs);
            phases.after_scan(&observed, b)?;
            phases.finish(b)
        })
        .unwrap();
        assert_eq!(b.started, start);
        assert_eq!(b.retries_left, 7);
    }
    assert!(state.borrow().alive.is_empty());
    assert_eq!(state.borrow().next, state.borrow().released.len() as u64);
}
