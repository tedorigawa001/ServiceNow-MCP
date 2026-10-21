use super::super::super::completion;
use super::*;
use crate::closure::shared::index_decode_count;
use crate::record_validation::record_validation_count;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use records_stage::valid_fixture;
use round_declaration::session::completion::records::FinalIndexRound;

#[derive(Clone, Copy)]
enum Mode {
    Legacy,
    Good,
    Forget,
    Duplicate,
    Finished,
    WrongPhase,
    Origin,
    Claim,
    Started,
    Work(u64),
    CancelAt(u64),
    DeadlineAt(u64),
    Cancel,
    Deadline,
}
fn scenario(mode: Mode) -> (u64, u64) {
    let (f, state, registry) = valid_fixture(false);
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let dropped = Rc::new(Cell::new(0));
    let active = Cell::new(false);
    let checks = Cell::new(0_u64);
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
                ledger_test::consume_final_index_claim(&mut lease);
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
            let verified = after.revalidate_records(&mut source, &phases, b).unwrap();
            assert_eq!(dropped.get(), 1);
            // Independent existing partition: actual final check = upper - slack87 + transition1.
            let final_upper = phases
                .remaining(scope, PHASE_MODEL_ID, b)?
                .remaining_current_for_test();
            if matches!(mode, Mode::Finished) {
                phases.finish(b)?;
            }
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
                _ => {}
            }
            let scan_calls = state.borrow().calls;
            let source_counts = source.stage_counts();
            let records = record_validation_count();
            let decodes = index_decode_count();
            let before = b.json_work;
            if matches!(mode, Mode::Legacy) {
                phases.finish(b)?;
                spent = b.json_work - before;
                assert_eq!(spent, final_upper - 87 + 1);
                drop(verified);
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
                        // TEST ONLY: different phase reaches Compared, isolating exact scope identity.
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
                        captured = Some(
                            verified
                                .verify_final_index(&mut other_phases, b)
                                .unwrap_err(),
                        );
                        Ok(())
                    },
                );
                Err(captured.unwrap())
            } else {
                verified.verify_final_index(&mut phases, b)
            };
            active.set(false);
            spent = b.json_work - before;
            assert_eq!(state.borrow().calls, scan_calls);
            assert_eq!(source.stage_counts(), source_counts); // no new OS/source/revalidate projection
            assert_eq!(record_validation_count(), records);
            assert_eq!(
                index_decode_count() - decodes,
                usize::from(matches!(mode, Mode::WrongPhase))
            );
            assert_eq!(dropped.get(), 1);
            match mode {
                Mode::Good | Mode::Forget => {
                    let final_stage = outcome.unwrap();
                    assert_eq!(spent, final_upper - 87 + 1 + 3); // detects skipping reauthentication/Node work
                    assert_eq!(
                        format!("{final_stage:?}"),
                        "FinalIndexRound(awaiting_final_clock_not_execution_authority)"
                    );
                    assert_eq!(
                        phases
                            .remaining(scope, PHASE_MODEL_ID, b)?
                            .remaining_current_for_test(),
                        0
                    );
                    if matches!(mode, Mode::Forget) {
                        std::mem::forget(final_stage);
                    } else {
                        drop(final_stage);
                    }
                }
                _ => {
                    let failure = outcome.unwrap_err();
                    let expected = match mode {
                        Mode::Work(_) => Failure::Limit,
                        Mode::Cancel | Mode::CancelAt(_) => Failure::Cancelled,
                        Mode::Deadline | Mode::DeadlineAt(_) => Failure::Deadline,
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
    assert_eq!(result.is_ok(), matches!(mode, Mode::Forget));
    let (claimed, stopped) = ledger_test::final_index_state(&ledger);
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
    (spent, checks.get())
}
#[test]
fn actual_final_index_and_node_checks_issue_only_payload_free_typed_stage() {
    let (legacy, _) = scenario(Mode::Legacy);
    assert_eq!(scenario(Mode::Good).0, legacy + 3);
    scenario(Mode::Forget);
}
#[test]
fn final_index_claim_phase_and_budget_binding_are_one_shot() {
    for mode in [
        Mode::Duplicate,
        Mode::Finished,
        Mode::WrongPhase,
        Mode::Origin,
        Mode::Claim,
        Mode::Started,
    ] {
        scenario(mode);
    }
}
#[test]
fn all_final_index_work_shortage_and_post_charge_cancel_prefixes_stop() {
    let (work, _) = scenario(Mode::Good);
    for n in 0..work {
        scenario(Mode::Work(n));
    }
    for at in 1..=work {
        scenario(Mode::CancelAt(at));
    }
}
#[test]
fn every_checkpoint_deadline_including_after_phase_finish_refuses_publication() {
    let (_, checks) = scenario(Mode::Good);
    for at in 1..=checks {
        scenario(Mode::DeadlineAt(at));
    }
    scenario(Mode::Cancel);
    scenario(Mode::Deadline);
}
#[test]
fn same_fixed_node_checker_rejects_missing_wrong_digest_size_and_mode() {
    let (f, _, _) = valid_fixture(false);
    for change in 0..4 {
        let mut entries = f.observed.clone();
        let slot = entries
            .iter()
            .position(|e| e.path() == f.target.relative)
            .unwrap();
        if change == 0 {
            entries.remove(slot);
        } else if let closure::Entry::File {
            mode, size, sha256, ..
        } = &mut entries[slot]
        {
            match change {
                1 => *sha256 = "f".repeat(64),
                2 => *size += 1,
                _ => *mode = "0444".into(),
            }
        }
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            verify_node_entries(&entries, &f.target, &mut b),
            Err(Failure::Changed)
        );
    }
}
#[test]
fn final_index_stage_is_not_clone_copy_or_serializable() {
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
    not_impl!(FinalIndexRound<'_, '_, '_>, Clone);
    not_impl!(FinalIndexRound<'_, '_, '_>, Copy);
    not_impl!(FinalIndexRound<'_, '_, '_>, serde::Serialize);
    not_impl!(FinalIndexRound<'_, '_, '_>, serde::de::DeserializeOwned);
}
#[test]
fn three_slots_recheck_final_index_node_without_a_production_ack() {
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
    let decodes = index_decode_count();
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
            let verified = after.revalidate_records(&mut source, &phases, b).unwrap();
            let final_stage = verified.verify_final_index(&mut phases, b).unwrap();
            final_stage.acknowledge_for_test(b) // TEST ONLY: no final clock/strict ack producer.
        })
        .unwrap();
    }
    assert_eq!(index_decode_count() - decodes, 3);
    drop(ledger);
    assert_eq!(b.checkpoint(), Ok(()));
}
