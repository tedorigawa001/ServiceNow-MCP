use super::*;
use round_declaration::scan_inputs::profile::{self, calculator};

fn prepare(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let profile = profile::build(inputs, scope, profile::MODEL_ID, b)?;
    calculator::calculate(profile, inputs, scope, calculator::CALCULATOR_ID, b)?
        .consume_for_collector(inputs, scope, b)
}

fn with_inputs<T>(
    f: &Setup,
    state: &Rc<RefCell<State>>,
    round: Round,
    run: impl for<'p, 'i, 'd, 's, 'r> FnOnce(
        &'p ScanInputs<'i, 'd, 's, 'r>,
        &'p RoundScope<'s>,
        &mut SharedBudget<'_>,
    ) -> Result<T, Failure>,
) -> Result<T, Failure> {
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
        let d = scope.decode(b)?;
        let phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
        let inputs = phases.bind_inputs(scope, b)?;
        run(&inputs, scope, b)
    })
}
fn quotas() -> Option<Quotas> {
    Some(Quotas {
        attempts: [10000; 5],
        live: 8,
        name_bytes: 100000,
    })
}

#[test]
fn direct_collect_without_a_bridge_claim_stops_before_any_source_operation() {
    let (f, state) = fixture(Case::Good);
    assert_eq!(
        with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
            let before = b.json_work;
            match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                DispatchOutcome::NotStarted(reason) => assert_eq!(reason, Failure::Binding),
                DispatchOutcome::Collected(_) => panic!("unclaimed Inputs entered the collector"),
            }
            assert_eq!(b.json_work - before, 1);
            assert_eq!(state.borrow().calls, 0);
            assert!(state.borrow().alive.is_empty());
            Err::<(), _>(Failure::Binding)
        }),
        Err(Failure::Binding)
    );
}

#[test]
fn fixed_collect_succeeds_once_with_one_additional_work_then_rejects_a_second_call() {
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let (f, state) = fixture(Case::Good);
        assert_eq!(
            with_inputs(&f, &state, round, |inputs, scope, b| {
                let before = b.json_work;
                prepare(inputs, scope, b)?;
                assert_eq!(b.json_work - before, 61 + 20 + 7);
                let old = b.json_work;
                let out = match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                    DispatchOutcome::Collected(out) => out,
                    DispatchOutcome::NotStarted(_) => panic!("prepared collector did not enter"),
                };
                assert_eq!(b.json_work - old, 1903);
                assert_eq!(b.json_work - before, 1991);
                assert_eq!(out.summary.live, 0);
                assert_eq!(out.summary.pending_cleanup, 0);
                assert_eq!(out.summary.unconfirmed, 0);
                assert_eq!(out.result?.entries, f.observed);
                let calls = state.borrow().calls;
                assert_eq!(calls, 876);
                let old = b.json_work;
                match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                    DispatchOutcome::NotStarted(reason) => assert_eq!(reason, Failure::Binding),
                    DispatchOutcome::Collected(_) => panic!("second collector entry was accepted"),
                }
                assert_eq!(b.json_work - old, 1);
                assert_eq!(state.borrow().calls, calls);
                assert!(state.borrow().alive.is_empty());
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn collector_errors_keep_cleanup_summary_and_do_not_allow_another_scan() {
    for (case, expected) in [
        (Case::NoQuotas, Failure::Unavailable),
        (Case::Quota(0), Failure::Limit),
        (Case::Corrupt, Failure::HashMismatch),
        (Case::Short, Failure::Changed),
        (Case::EintrForever, Failure::ReadFailed),
        (Case::FsUnknown, Failure::MetadataUnavailable),
        (Case::CleanupUnknown, Failure::Unavailable),
        (Case::Cancel(1), Failure::Cancelled),
        (Case::Deadline(1), Failure::Deadline),
    ] {
        let (f, state) = fixture(case);
        assert_eq!(
            with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
                prepare(inputs, scope, b)?;
                let out = match collect(
                    inputs,
                    scope,
                    Fake(state.clone()),
                    if matches!(case, Case::NoQuotas) {
                        None
                    } else if matches!(case, Case::Quota(0)) {
                        Some(Quotas {
                            attempts: [0; 5],
                            live: 8,
                            name_bytes: 100000,
                        })
                    } else {
                        quotas()
                    },
                    b,
                ) {
                    DispatchOutcome::Collected(out) => out,
                    DispatchOutcome::NotStarted(_) => {
                        panic!("valid entry did not reach the kernel")
                    }
                };
                assert_eq!(
                    out.result.as_ref().map(|_| ()).map_err(|e| *e),
                    Err(expected)
                );
                assert_eq!(out.summary.live, 0);
                assert_eq!(out.summary.pending_cleanup, 0);
                if matches!(case, Case::CleanupUnknown) {
                    assert!(out.summary.unconfirmed > 0);
                }
                let calls = state.borrow().calls;
                assert!(state.borrow().alive.is_empty());
                match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                    DispatchOutcome::NotStarted(reason) => assert_eq!(reason, expected), // first failure wins
                    DispatchOutcome::Collected(_) => panic!("failed first scan was retried"),
                }
                assert_eq!(state.borrow().calls, calls);
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn stopped_entry_never_constructs_kernel_outcome_or_calls_source() {
    for case in 0..5 {
        let (f, state) = fixture(Case::Good);
        let expected = match case {
            0 => Failure::Limit,
            1 => Failure::Cancelled,
            2 => Failure::Deadline,
            3 => Failure::Unavailable,
            _ => Failure::Changed,
        };
        assert_eq!(
            with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
                prepare(inputs, scope, b)?;
                match case {
                    0 => b.json_work = 1_000_000,
                    1 => state.borrow().cancelled.store(true, Ordering::Release),
                    2 => state
                        .borrow()
                        .now
                        .set(state.borrow().start + Duration::from_secs(10)),
                    3 => b.failed = Some(expected),
                    4 => b.retries_left -= 1,
                    _ => unreachable!(),
                }
                match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                    DispatchOutcome::NotStarted(reason) => assert_eq!(reason, expected),
                    DispatchOutcome::Collected(_) => panic!("stopped entry reached the kernel"),
                }
                assert_eq!(state.borrow().calls, 0);
                assert!(state.borrow().trace.is_empty());
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn accepted_entry_keeps_kernel_work_owners_separate_from_dispatch() {
    use crate::signature_boundary::positioned_read::work_audit::{Audit, Owner};
    let (f, state) = fixture(Case::Good);
    with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
        prepare(inputs, scope, b)?;
        let audit = Audit::default();
        b.work_audit = Some(audit.clone());
        let old = b.json_work;
        let out = match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
            DispatchOutcome::Collected(out) => out,
            DispatchOutcome::NotStarted(_) => panic!("entry failed"),
        };
        b.work_audit = None;
        out.result?;
        assert_eq!(b.json_work - old, 1903);
        assert_eq!(audit.counts().iter().sum::<u64>(), 1903);
        // Existing seven kernel owner buckets stay unchanged. Unassigned is the wrapper1 only.
        assert_eq!(audit.counts()[Owner::Unassigned as usize], 1);
        assert_eq!(&audit.counts()[..7], &[52, 49, 46, 1223, 322, 174, 36]);
        Ok(())
    })
    .unwrap();
}

#[test]
fn accepted_three_round_path_keeps_after_scan_final_index_and_shared_retry_budget() {
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
            prepare(&inputs, scope, b)?;
            let out = match collect(&inputs, scope, Fake(state.clone()), quotas(), b) {
                DispatchOutcome::Collected(out) => out,
                DispatchOutcome::NotStarted(_) => panic!("entry failed"),
            };
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

#[test]
fn cancellation_after_the_entry_charge_never_opens_a_source_resource() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    let (f, state) = fixture(Case::Good);
    assert_eq!(
        with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
            prepare(inputs, scope, b)?;
            let audit = Audit::default();
            audit.cancel_after_work(1, state.borrow().cancelled.clone());
            b.work_audit = Some(audit.clone());
            match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                DispatchOutcome::NotStarted(reason) => assert_eq!(reason, Failure::Cancelled),
                DispatchOutcome::Collected(_) => panic!("post-charge cancellation entered kernel"),
            }
            assert_eq!(audit.counts().iter().sum::<u64>(), 1);
            assert_eq!(state.borrow().calls, 0);
            assert!(state.borrow().alive.is_empty());
            Err::<(), _>(Failure::Cancelled)
        }),
        Err(Failure::Cancelled)
    );
}

#[test]
fn one_work_credit_enters_only_the_dispatch_not_the_kernel() {
    for left in 0..=1 {
        let (f, state) = fixture(Case::Good);
        assert_eq!(
            with_inputs(&f, &state, Round::Initial, |inputs, scope, b| {
                prepare(inputs, scope, b)?;
                b.json_work = 1_000_000 - left;
                match collect(inputs, scope, Fake(state.clone()), quotas(), b) {
                    DispatchOutcome::NotStarted(reason) => {
                        assert_eq!(left, 0);
                        assert_eq!(reason, Failure::Limit);
                    }
                    DispatchOutcome::Collected(out) => {
                        assert_eq!(left, 1);
                        assert_eq!(
                            out.result.as_ref().map(|_| ()).map_err(|e| *e),
                            Err(Failure::Limit)
                        );
                        assert_eq!(out.summary.live, 0);
                        assert_eq!(out.summary.pending_cleanup, 0);
                    }
                }
                assert_eq!(b.json_work, 1_000_000);
                assert_eq!(state.borrow().calls, 0);
                Err::<(), _>(Failure::Limit)
            }),
            Err(Failure::Limit)
        );
    }
}
