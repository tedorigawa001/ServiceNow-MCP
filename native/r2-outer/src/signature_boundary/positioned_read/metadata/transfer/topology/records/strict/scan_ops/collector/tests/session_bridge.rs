use super::*;
use round_declaration::scan_inputs::profile::{self, calculator};
use round_declaration::session::{self, resources::testing as ledger_test};
mod after_scan;
mod completion;
mod final_index;
mod records_stage;

fn caps() -> ledger_test::Policy {
    ledger_test::Policy {
        attempts: [10000; 5],
        round_attempts: [10000; 5],
        total: 50000,
        round_total: 50000,
        live: 8,
        names: 100000,
    }
}
fn quotas() -> Option<Quotas> {
    Some(Quotas {
        attempts: [10000; 5],
        live: 8,
        name_bytes: 100000,
    })
}
fn trace_counts(state: &State) -> [u64; 5] {
    let mut counts = [0; 5];
    for (op, _) in &state.trace {
        counts[*op as usize] += 1;
    }
    counts
}
fn execute(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    state: &Rc<RefCell<State>>,
    lease: &mut session::RoundResourceScope<'_, '_, '_>,
    b: &mut SharedBudget<'_>,
) -> Result<Outcome<ClosureObservation>, Failure> {
    let p = profile::build(inputs, scope, profile::MODEL_ID, b)?;
    let estimate = calculator::calculate(p, inputs, scope, calculator::CALCULATOR_ID, b)?;
    let mut output = None;
    let result = lease.with_resources(b, |account, b| {
        match consume_and_collect_session(
            estimate,
            inputs,
            scope,
            (Fake(state.clone()), quotas()),
            account,
            b,
        ) {
            DispatchOutcome::NotStarted(e) => Err(e),
            DispatchOutcome::Collected(out) => {
                let result = out.result.as_ref().map(|_| ()).map_err(|e| *e);
                output = Some(out);
                result
            }
        }
    });
    // Preserve Collected summary even on a sticky stop.
    if let Some(out) = output {
        Ok(out)
    } else {
        result?;
        Err(Failure::Unavailable)
    }
}

#[test]
fn fixed_collector_charges_one_session_attempt_per_trace_and_keeps_three_round_totals() {
    // Existing retry costs: declared-read guard1 + dispatch1 + classification1.
    assert_eq!(
        run(Case::Eintr, Round::Initial).2 - run(Case::Good, Round::Initial).2,
        3
    );
    let (f, state) = fixture(Case::Eintr);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let start = now.get();
    let mut b = SharedBudget::new(start, &cancel);
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
    let mut totals = [0; 5];
    for (slot, round) in [Round::Initial, Round::BeforeM4, Round::AfterM4]
        .into_iter()
        .enumerate()
    {
        round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let before = trace_counts(&state.borrow());
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let mut lease = ledger.begin(scope, b)?;
            let before_work = b.json_work;
            let out = execute(&inputs, scope, &state, &mut lease, b)?;
            assert!(matches!(out.cleanup, CleanupDisposition::Confirmed(_)));
            assert_eq!(
                b.json_work - before_work,
                if slot == 0 { 1997 } else { 1994 }
            );
            assert_eq!(out.summary.live, 0);
            assert_eq!(out.summary.pending_cleanup, 0);
            assert_eq!(out.summary.unconfirmed, 0);
            let after = trace_counts(&state.borrow());
            let delta = std::array::from_fn(|i| after[i] - before[i]);
            assert_eq!(out.summary.attempts, delta);
            let observed = out.result?;
            assert_eq!(observed.entries, f.observed);
            drop(inputs);
            phases.after_scan(&observed, b)?;
            phases.finish(b)?;
            ledger_test::acknowledge(lease, b)?; // ONLY synthetic strict acknowledgement
            let local = ledger_test::counts(&ledger, Some(slot));
            assert_eq!(local.attempts, delta);
            assert_eq!(local.names, out.summary.names);
            assert_eq!(local.peak, out.summary.peak);
            for i in 0..5 {
                totals[i] += delta[i];
            }
            let cumulative = ledger_test::counts(&ledger, None);
            assert_eq!(cumulative.attempts, totals);
            assert_eq!(cumulative.total, state.borrow().calls);
            assert_eq!(cumulative.peak, state.borrow().peak as u64);
            assert_eq!(
                (cumulative.live, cumulative.reserved, cumulative.unconfirmed),
                (0, 0, 0)
            );
            Ok(())
        })
        .unwrap();
        assert_eq!(b.started, start);
        assert_eq!(b.retries_left, 7);
    }
    assert_eq!(totals, [189, 42, 19, 1971, 408]);
    assert_eq!(state.borrow().calls, 2629);
    assert_eq!(state.borrow().next, state.borrow().released.len() as u64);
}

#[test]
fn source_failure_cancel_deadline_and_unconfirmed_cleanup_keep_exact_prefix_accounting() {
    for case in [
        Case::Corrupt,
        Case::Short,
        Case::Surplus,
        Case::EintrForever,
        Case::FsUnknown,
        Case::CleanupUnknown,
        Case::Cancel(1),
        Case::Deadline(1),
        Case::NamesChanged,
    ] {
        let (f, state) = fixture(case);
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
                let mut lease = ledger.begin(scope, b)?;
                let out = execute(&inputs, scope, &state, &mut lease, b)?;
                assert!(out.result.is_err());
                if matches!(
                    case,
                    Case::Corrupt | Case::Short | Case::EintrForever | Case::CleanupUnknown
                ) {
                    assert!(matches!(out.cleanup, CleanupDisposition::Incomplete(_)));
                } else {
                    assert!(matches!(out.cleanup, CleanupDisposition::Confirmed(_)));
                }
                assert_eq!(out.summary.attempts, trace_counts(&state.borrow()));
                assert_eq!(out.summary.live, 0);
                assert_eq!(out.summary.pending_cleanup, 0);
                let error = out.result.err().unwrap();
                assert_eq!(b.checkpoint(), Err(error));
                Err::<(), _>(error)
            },
        );
        assert!(result.is_err());
        let count = ledger_test::counts(&ledger, None);
        assert_eq!(count.attempts, trace_counts(&state.borrow()));
        assert_eq!(count.total, state.borrow().calls);
        assert_eq!(count.live, 0);
        assert_eq!(count.reserved, 0);
        assert_eq!(count.unconfirmed > 0, matches!(case, Case::CleanupUnknown));
        assert!(state.borrow().alive.is_empty());
        assert_eq!(state.borrow().next, state.borrow().released.len() as u64);
    }
}

#[test]
fn all_source_failure_cleanup_cancel_and_deadline_points_keep_exact_session_counts() {
    for at in 1..=876 {
        for case in [
            Case::Failure(at),
            Case::CleanupAt(at),
            Case::Cancel(at),
            Case::Deadline(at),
        ] {
            let (f, state) = fixture(case);
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
            let _ = round_declaration::with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = phases.bind_inputs(scope, b)?;
                    let mut lease = ledger.begin(scope, b)?;
                    let out = execute(&inputs, scope, &state, &mut lease, b)?;
                    let count = trace_counts(&state.borrow());
                    assert_eq!(out.summary.attempts, count);
                    out.result.map(|_| ())
                },
            );
            let counts = ledger_test::counts(&ledger, None);
            assert_eq!(counts.attempts, trace_counts(&state.borrow()));
            assert_eq!(counts.total, state.borrow().calls);
            assert_eq!((counts.live, counts.reserved), (0, 0));
            assert!(state.borrow().alive.is_empty());
            assert_eq!(state.borrow().next, state.borrow().released.len() as u64);
        }
    }
}

#[test]
fn every_early_work_prefix_leaves_both_ledgers_equal_and_cleans_owned_resources() {
    for left in 0..160 {
        let (f, state) = fixture(Case::Good);
        let c = context();
        let cancel = state.borrow().cancelled.clone();
        let mut b = SharedBudget::new(state.borrow().start, &cancel);
        let mut ledger = session::create(
            &f.receipt,
            &f.target,
            &c,
            "bp5-r2-scan-session-state-0.1",
            &mut b,
        )
        .unwrap();
        ledger_test::configure(&mut ledger, caps(), &mut b).unwrap();
        assert_eq!(
            round_declaration::with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = phases.bind_inputs(scope, b)?;
                    let mut lease = ledger.begin(scope, b)?;
                    let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
                    let estimate =
                        calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
                    lease.with_resources(b, |account, b| {
                        b.json_work = 1_000_000 - left;
                        match consume_and_collect_session(
                            estimate,
                            &inputs,
                            scope,
                            (Fake(state.clone()), quotas()),
                            account,
                            b,
                        ) {
                            DispatchOutcome::NotStarted(e) => Err(e),
                            DispatchOutcome::Collected(out) => {
                                assert_eq!(out.summary.attempts, trace_counts(&state.borrow()));
                                out.result.map(|_| ())
                            }
                        }
                    })
                }
            ),
            Err(Failure::Limit)
        );
        let count = ledger_test::counts(&ledger, None);
        assert_eq!(count.attempts, trace_counts(&state.borrow()));
        assert_eq!((count.live, count.reserved), (0, 0));
        assert!(state.borrow().alive.is_empty());
    }
}

#[test]
fn legacy_entry_wrong_round_duplicate_connection_and_revoked_hook_are_rejected() {
    for mode in 0..4 {
        let (f, state) = fixture(Case::Good);
        let c = context();
        let cancel = state.borrow().cancelled.clone();
        let mut b = SharedBudget::new(state.borrow().start, &cancel);
        let mut ledger = session::create(
            &f.receipt,
            &f.target,
            &c,
            "bp5-r2-scan-session-state-0.1",
            &mut b,
        )
        .unwrap();
        ledger_test::configure(&mut ledger, caps(), &mut b).unwrap();
        assert_eq!(
            round_declaration::with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = phases.bind_inputs(scope, b)?;
                    let mut lease = ledger.begin(scope, b)?;
                    let p = profile::build(&inputs, scope, profile::MODEL_ID, b)?;
                    let estimate =
                        calculator::calculate(p, &inputs, scope, calculator::CALCULATOR_ID, b)?;
                    if mode == 0 {
                        match consume_and_collect(
                            estimate,
                            &inputs,
                            scope,
                            Fake(state.clone()),
                            quotas(),
                            b,
                        ) {
                            DispatchOutcome::NotStarted(e) => return Err(e),
                            _ => panic!("legacy entry bypassed session"),
                        }
                    }
                    if mode == 3 {
                        let mut saved = None;
                        lease.with_resources(b, |account, b| {
                            saved = Some(account.connect(scope, b)?);
                            Ok(())
                        })?;
                        return saved.unwrap().validate(b);
                    }
                    lease.with_resources(b, |account, b| {
                        if mode == 1 {
                            return round_declaration::with_round(
                                &f.receipt,
                                &f.target,
                                &c,
                                Round::Initial,
                                b,
                                |other, b| account.connect(other, b).map(drop),
                            );
                        }
                        let _first = account.connect(scope, b)?;
                        match consume_and_collect_session(
                            estimate,
                            &inputs,
                            scope,
                            (Fake(state.clone()), quotas()),
                            account,
                            b,
                        ) {
                            DispatchOutcome::NotStarted(e) => Err(e),
                            _ => panic!("connection reused"),
                        }
                    })
                }
            ),
            Err(Failure::Binding)
        );
        assert_eq!(state.borrow().calls, 0);
        assert_eq!(ledger_test::counts(&ledger, None).attempts, [0; 5]);
    }
}

#[test]
fn nonempty_xattr_copies_are_accounted_once_and_capacity_is_checked_before_copy() {
    for short in [false, true] {
        let (f, state) = fixture(Case::Provenance);
        let c = context();
        let cancel = state.borrow().cancelled.clone();
        let mut b = SharedBudget::new(state.borrow().start, &cancel);
        let mut ledger = session::create(
            &f.receipt,
            &f.target,
            &c,
            "bp5-r2-scan-session-state-0.1",
            &mut b,
        )
        .unwrap();
        let mut p = caps();
        p.names = 1533 - u64::from(short);
        ledger_test::configure(&mut ledger, p, &mut b).unwrap();
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
                let mut lease = ledger.begin(scope, b)?;
                let out = execute(&inputs, scope, &state, &mut lease, b)?;
                assert_eq!(out.summary.names, if short { 1512 } else { 1533 });
                let result = out.result.map(|_| ());
                if result.is_ok() {
                    ledger_test::acknowledge(lease, b)?;
                }
                result
            },
        );
        assert_eq!(result, if short { Err(Failure::Limit) } else { Ok(()) });
        let count = ledger_test::counts(&ledger, None);
        assert_eq!(count.names, if short { 1512 } else { 1533 });
        assert_eq!(count.attempts, trace_counts(&state.borrow()));
        assert_eq!((count.live, count.reserved), (0, 0));
    }
}

#[test]
fn second_round_hits_cumulative_cap_without_refill_and_releases_its_existing_owners() {
    let (f, state) = fixture(Case::Good);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let mut b = SharedBudget::new(state.borrow().start, &cancel);
    let mut ledger = session::create(
        &f.receipt,
        &f.target,
        &c,
        "bp5-r2-scan-session-state-0.1",
        &mut b,
    )
    .unwrap();
    let mut p = caps();
    p.attempts[2] = 6;
    ledger_test::configure(&mut ledger, p, &mut b).unwrap();
    for (slot, round) in [Round::Initial, Round::BeforeM4].into_iter().enumerate() {
        let result =
            round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
                let d = scope.decode(b)?;
                let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let inputs = phases.bind_inputs(scope, b)?;
                let mut lease = ledger.begin(scope, b)?;
                let out = execute(&inputs, scope, &state, &mut lease, b)?;
                let observed = out.result?;
                drop(inputs);
                phases.after_scan(&observed, b)?;
                phases.finish(b)?;
                ledger_test::acknowledge(lease, b)
            });
        assert_eq!(
            result,
            if slot == 0 {
                Ok(())
            } else {
                Err(Failure::Limit)
            }
        );
    }
    let counts = ledger_test::counts(&ledger, None);
    assert_eq!(counts.attempts[2], 6);
    assert_eq!(ledger_test::counts(&ledger, Some(1)).attempts[2], 0);
    assert_eq!(counts.attempts, trace_counts(&state.borrow()));
    assert_eq!((counts.live, counts.reserved), (0, 0));
    assert!(state.borrow().alive.is_empty());
    let before = state.borrow().calls;
    assert_eq!(
        round_declaration::with_round(
            &f.receipt,
            &f.target,
            &c,
            Round::AfterM4,
            &mut b,
            |scope, b| ledger.begin(scope, b).map(drop)
        ),
        Err(Failure::Limit)
    );
    assert_eq!(state.borrow().calls, before);
}

#[test]
fn terminal_mirror_and_cumulative_corruption_never_issue_closed_evidence_or_hide_first_error() {
    for only_total in [false, true] {
        for case in [Case::Good, Case::Surplus] {
            let (f, state) = fixture(case);
            let c = context();
            let cancel = state.borrow().cancelled.clone();
            let mut b = SharedBudget::new(state.borrow().start, &cancel);
            let mut ledger = session::create(
                &f.receipt,
                &f.target,
                &c,
                "bp5-r2-scan-session-state-0.1",
                &mut b,
            )
            .unwrap();
            ledger_test::configure(&mut ledger, caps(), &mut b).unwrap();
            ledger_test::taint_terminal_names(&ledger, only_total);
            let expected = if matches!(case, Case::Good) {
                Failure::Binding
            } else {
                Failure::Changed
            };
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
                    let mut lease = ledger.begin(scope, b)?;
                    let out = execute(&inputs, scope, &state, &mut lease, b)?;
                    if let CleanupDisposition::Incomplete(problem) = &out.cleanup {
                        assert_eq!(problem.failure(), Failure::Binding);
                    } else {
                        panic!("corrupt mirror issued closed evidence");
                    }
                    assert_eq!(out.summary.attempts, trace_counts(&state.borrow()));
                    out.result.map(|_| ())
                },
            );
            assert_eq!(result, Err(expected));
            assert_eq!(b.checkpoint(), Err(expected));
            assert!(state.borrow().alive.is_empty());
        }
    }
}

#[test]
fn session_caps_block_source_and_cleanup_still_uses_the_original_reservation() {
    for which in 0..7 {
        let (f, state) = fixture(Case::Good);
        let c = context();
        let cancel = state.borrow().cancelled.clone();
        let mut b = SharedBudget::new(state.borrow().start, &cancel);
        let mut ledger = session::create(
            &f.receipt,
            &f.target,
            &c,
            "bp5-r2-scan-session-state-0.1",
            &mut b,
        )
        .unwrap();
        let mut p = caps();
        match which {
            0 => p.attempts[0] = 0,
            1 => p.round_attempts[0] = 0,
            2 => p.attempts[4] = 0,
            3 => p.live = 0,
            4 => p.total = 1,
            5 => p.attempts[3] = 0,
            _ => p.names = 0,
        }
        ledger_test::configure(&mut ledger, p, &mut b).unwrap();
        assert_eq!(
            round_declaration::with_round(
                &f.receipt,
                &f.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = phases.bind_inputs(scope, b)?;
                    let mut lease = ledger.begin(scope, b)?;
                    execute(&inputs, scope, &state, &mut lease, b)?
                        .result
                        .map(|_| ())
                }
            ),
            Err(Failure::Limit)
        );
        let count = ledger_test::counts(&ledger, None);
        assert_eq!(count.attempts, trace_counts(&state.borrow()));
        if which < 5 {
            assert_eq!(state.borrow().calls, 0);
        }
        assert!(state.borrow().alive.is_empty());
        assert_eq!(count.live, 0);
        assert_eq!(count.reserved, 0);
    }
}
