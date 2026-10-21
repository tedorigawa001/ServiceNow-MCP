use super::super::super::completion;
use super::*;
use crate::record_validation::{record_validation_count, tests as json_fixture};
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use round_declaration::session::completion::records::RecordsVerifiedRound;
use serde_json::{Value, json};

pub(super) fn valid_fixture(bad_json: bool) -> (Setup, Rc<RefCell<State>>, Vec<u8>) {
    let (mut f, state) = fixture(Case::Good);
    let mut j = json_fixture::fixture();
    let b = &mut f.receipt.binding;
    b.product_version = "26.7".into();
    b.os_build = "TESTBUILD".into();
    b.start_wall_ms = json_fixture::NOW;
    b.approved_wall_ms = json_fixture::NOW - 1000;
    b.activation_expires_ms = json_fixture::NOW + 600000;
    b.ledger_expires_ms = b.activation_expires_ms;
    b.node_policy = "node-1".into();
    f.target.policy = "node-1".into();
    let mut l: Value = serde_json::from_slice(&j.l).unwrap();
    l["node"]["path"] = json!(f.target.path);
    l["node"]["sha256"] = json!(hex(&f.target.ledger_hash));
    l["launcher"]["path"] = json!("/sealed/runtime/launcher");
    l["runtime"]["root"] = json!(b.runtime_root);
    l["runtime"]["cwd"] = json!(b.runtime_root);
    l["runtime"]["index_path"] = json!(b.index_path);
    l["runtime"]["index_sha256"] = json!(hex(&b.index_hash));
    j.l = serde_json::to_vec(&l).unwrap();
    b.ledger_hash = Sha256::digest(&j.l).into();
    b.registry_hash = Sha256::digest(&j.registry).into();
    let mut a: Value = serde_json::from_slice(&j.a).unwrap();
    a["ledger_path"] = json!(b.ledger_path);
    a["ledger_sha256"] = json!(hex(&b.ledger_hash));
    a["artifact_index_sha256"] = json!(hex(&b.index_hash));
    j.a = if bad_json {
        b"{".to_vec()
    } else {
        serde_json::to_vec(&a).unwrap()
    };
    b.activation_hash = Sha256::digest(&j.a).into();
    for (i, bytes) in [j.a, j.l].into_iter().enumerate() {
        f.receipt.pins[i].leaf.stat.size = bytes.len() as u64;
        f.receipt.pins[i].bytes = bytes;
    }
    (f, state, j.registry)
}

#[derive(Clone, Copy)]
enum Mode {
    Legacy,
    Good,
    Forget,
    Duplicate,
    BadJson,
    Fault(u8, usize),
    Cancel(usize),
    Deadline(usize),
    Work(u64),
    WorkCancel(u64),
    Origin,
    Claim,
    Started,
    Registry,
    Finished,
    WrongPhase,
}
fn scenario(mode: Mode) -> (u64, usize) {
    let (f, state, mut registry) = valid_fixture(matches!(mode, Mode::BadJson));
    if matches!(mode, Mode::Registry) {
        registry = b"untrusted registry".to_vec();
    }
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
    match mode {
        Mode::Fault(kind, at) => source.stage_fault(kind, at),
        Mode::Cancel(at) => source.stage_interrupt(at, cancel.clone(), None),
        Mode::Deadline(at) => source.stage_interrupt(
            at,
            cancel.clone(),
            Some(b.started + Duration::from_secs(10)),
        ),
        _ => {}
    }
    let mut ledger = session::create(
        &f.receipt,
        &f.target,
        &c,
        "bp5-r2-scan-session-state-0.1",
        &mut b,
    )
    .unwrap();
    ledger_test::configure(&mut ledger, caps(), &mut b).unwrap();
    let dropped = Rc::new(Cell::new(0));
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
                ledger_test::consume_records_claim(&mut lease);
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
            if matches!(mode, Mode::Finished) {
                phases.finish(b)?;
            }
            assert_eq!(dropped.get(), 1);
            match mode {
                Mode::Origin => b.inspection_origin = Rc::new(()),
                Mode::Claim => b.scan_session_claim = Rc::new(Default::default()),
                Mode::Started => b.started -= Duration::from_millis(1),
                Mode::Work(n) => b.json_work = 1_000_000 - n,
                Mode::WorkCancel(at) => {
                    let a =
                        crate::signature_boundary::positioned_read::work_audit::Audit::default();
                    a.cancel_after_work(at, cancel.clone());
                    b.work_audit = Some(a);
                }
                _ => {}
            }
            let before = b.json_work;
            let validations = record_validation_count();
            let scan_calls = state.borrow().calls;
            if matches!(mode, Mode::Legacy) {
                // Independent old tail sequence: no typed-stage helper or its O control.
                reread_bytes(&mut source, &f.receipt, b)?;
                let reading = clock_check(&mut source, &f.receipt, b, 450_000)?;
                verify_records(&f.receipt, &f.target, &c, reading.wall_ms, b)?;
                spent = b.json_work - before;
                assert_eq!(record_validation_count() - validations, 1);
                let (_, made, freed, projected) = source.stage_counts();
                assert_eq!(made, freed);
                assert_eq!(projected, 0);
                drop(after);
                return Ok(());
            }
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
                        // TEST ONLY: a different real phase also reaches Compared, so
                        // only exact scope identity (not merely the enum) can reject it.
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
                            after
                                .revalidate_records(&mut source, &other_phases, b)
                                .unwrap_err(),
                        );
                        Ok(())
                    },
                );
                Err(captured.unwrap())
            } else {
                after.revalidate_records(&mut source, &phases, b)
            };
            spent = b.json_work - before;
            assert_eq!(dropped.get(), 1);
            assert_eq!(state.borrow().calls, scan_calls);
            let (_, made, freed, projected) = source.stage_counts();
            assert_eq!(made, freed); // while source remains alive; all temporary handles released
            assert_eq!(projected, 0); // never use RecordSource::revalidate projection as proof
            let success = matches!(mode, Mode::Good | Mode::Forget | Mode::Fault(1, _));
            if success {
                let verified = outcome.unwrap();
                assert_eq!(record_validation_count() - validations, 1);
                assert_eq!(
                    format!("{verified:?}"),
                    "RecordsVerifiedRound(awaiting_final_index_not_execution_authority)"
                );
                phases.finish(b)?; // Compatibility only: production FinalIndex stage is still absent.
                if matches!(mode, Mode::Forget) {
                    std::mem::forget(verified);
                } else {
                    drop(verified);
                }
            } else {
                let failure = outcome.unwrap_err();
                let expected = match mode {
                    Mode::Cancel(_) | Mode::WorkCancel(_) => Failure::Cancelled,
                    Mode::Deadline(_) => Failure::Deadline,
                    Mode::Work(_) => Failure::Limit,
                    Mode::BadJson
                    | Mode::Registry
                    | Mode::Duplicate
                    | Mode::Origin
                    | Mode::Claim
                    | Mode::Started => Failure::Binding,
                    Mode::Finished | Mode::WrongPhase => Failure::Binding,
                    Mode::Fault(0, _) | Mode::Fault(2, _) | Mode::Fault(8, _) => {
                        Failure::ReadFailed
                    }
                    Mode::Fault(7, _) => Failure::Expired,
                    Mode::Fault(6, _) => Failure::MetadataUnavailable,
                    _ => Failure::Changed,
                };
                assert_eq!(failure.reason(), expected);
                assert!(matches!(
                    failure.cleanup(),
                    CleanupDisposition::Confirmed(_)
                ));
                assert!(failure.summary_attempts().is_some());
                assert_eq!(b.checkpoint(), Err(expected));
                if matches!(
                    mode,
                    Mode::Duplicate
                        | Mode::Origin
                        | Mode::Claim
                        | Mode::Started
                        | Mode::Finished
                        | Mode::WrongPhase
                ) {
                    assert_eq!(source.stage_counts().0, 0);
                }
                if matches!(mode, Mode::BadJson | Mode::Registry) {
                    assert_eq!(record_validation_count() - validations, 1);
                }
                if matches!(
                    mode,
                    Mode::Fault(_, _) | Mode::Cancel(_) | Mode::Deadline(_)
                ) {
                    assert_eq!(record_validation_count() - validations, 0);
                }
            }
            Ok(())
        },
    );
    assert_eq!(result.is_ok(), matches!(mode, Mode::Forget));
    let (claimed, stopped) = ledger_test::records_state(&ledger);
    assert_eq!(claimed, !matches!(mode, Mode::Legacy));
    assert_eq!(stopped, !matches!(mode, Mode::Forget));
    let calls = source.stage_counts().0;
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
    assert_eq!(source.stage_counts().0, calls);
    (spent, calls)
}
#[test]
fn actual_reread_and_strict_validation_issue_payload_free_record_stage() {
    let (legacy_work, legacy_calls) = scenario(Mode::Legacy);
    let (work, calls) = scenario(Mode::Good);
    assert_eq!(work, legacy_work + 3);
    assert_eq!(calls, legacy_calls);
    scenario(Mode::Forget);
}
#[test]
fn pinned_malformed_json_and_registry_mismatch_cannot_become_verified() {
    scenario(Mode::BadJson);
    scenario(Mode::Registry);
}
#[test]
fn record_stage_claim_and_budget_binding_are_one_shot() {
    scenario(Mode::Duplicate);
    scenario(Mode::Origin);
    scenario(Mode::Claim);
    scenario(Mode::Started);
    scenario(Mode::Finished);
    scenario(Mode::WrongPhase);
}
#[test]
fn record_reread_rejects_changed_bytes_metadata_namespace_clock_and_eof() {
    for kind in 2..=8 {
        scenario(Mode::Fault(kind, 1));
    }
    scenario(Mode::Fault(1, 0));
}
#[test]
fn all_source_failure_and_late_stop_boundaries_release_temporaries_and_keep_reason() {
    let (_, calls) = scenario(Mode::Good);
    for at in 1..=calls {
        scenario(Mode::Fault(0, at));
        scenario(Mode::Cancel(at));
        scenario(Mode::Deadline(at));
    }
}
#[test]
fn record_stage_work_prefixes_preserve_cleanup_and_stop_before_publication() {
    let (work, _) = scenario(Mode::Good);
    for n in [0, 1, 2, work / 2, work - 2, work - 1] {
        scenario(Mode::Work(n));
    }
    for at in [1, 2, work / 2, work - 1, work] {
        scenario(Mode::WorkCancel(at));
    }
}
#[test]
fn record_stage_is_not_clone_copy_or_serializable() {
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
    not_impl!(RecordsVerifiedRound<'_, '_, '_>, Clone);
    not_impl!(RecordsVerifiedRound<'_, '_, '_>, Copy);
    not_impl!(RecordsVerifiedRound<'_, '_, '_>, serde::Serialize);
    not_impl!(
        RecordsVerifiedRound<'_, '_, '_>,
        serde::de::DeserializeOwned
    );
}
#[test]
fn all_three_round_slots_use_actual_record_validation_before_test_only_ack() {
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
    let validations = record_validation_count();
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
            let (_, made, freed, projected) = source.stage_counts();
            assert_eq!(made, freed);
            assert_eq!(projected, 0);
            phases.finish(b)?;
            verified.acknowledge_for_test(b) // Explicitly synthetic, NOT a real strict tail ack.
        })
        .unwrap();
    }
    assert_eq!(record_validation_count() - validations, 3);
    drop(ledger);
    assert_eq!(b.checkpoint(), Ok(()));
}
