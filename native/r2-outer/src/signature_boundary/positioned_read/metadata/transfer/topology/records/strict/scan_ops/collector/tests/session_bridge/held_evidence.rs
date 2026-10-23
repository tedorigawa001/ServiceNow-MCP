use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::{
    records::tests::Fake as RecordFake, tests as topo,
};
use scan_ops::connection_owner::protected_inputs::supply_evidence as evidence;
use scan_ops::connection_owner::result_owner::{InputLocation, StrictBridgeFailure, SupplyStage};

macro_rules! ready {
    ($inputs:ident,$checked:ident,$held:ident,$topology:ident,$source:ident,$counts:ident,$b:ident,$cancel:ident,$now:ident,$body:block) => {{
        let (f, state, registry) = records_stage::valid_signature_fixture();
        let context = InspectionContext { registry: &registry, groups: &[80] };
        let $cancel = state.borrow().cancelled.clone();
        let $now = state.borrow().now.clone();
        let clock = || $now.get();
        let mut $b = SharedBudget::new($now.get(), &$cancel);
        $b.now = &clock;
        let binding = f.receipt.binding.clone();
        let lineage = f.receipt.lineage.clone();
        let target = f.target.clone();
        let bound = bind(&binding, &lineage, &target).unwrap();
        let $counts = Rc::new(topo::Counts::default());
        let (opened, $topology, $source) = topo::setup(&bound, &$counts);
        let $held = attach(&bound, opened).unwrap();
        let record_source = RecordFake::for_stage(&f.receipt, &$now, $now.get());
        let $inputs = evidence::synthetic::acquire(&context, &bound, f.receipt, record_source, &mut $b).unwrap();
        let c = $inputs.issue_context(&mut $b).unwrap();
        let r = $inputs.issue_records(&mut $b).unwrap();
        let c = c.consume(&$inputs, &mut $b).unwrap();
        let $checked = r.consume(c, &$inputs, &mut $b).unwrap();
        $body
        assert!(state.borrow().trace.is_empty());
    }};
}
fn rejects(e: scan_ops::connection_owner::result_owner::InputRejected, reason: Failure) {
    let e = StrictBridgeFailure::input(e);
    assert_eq!(e.reason(), reason);
    assert_eq!(
        e.input_location(),
        Some(InputLocation::Supply(SupplyStage::HeldSources))
    );
}

#[test]
fn held_evidence_acquisition_rejects_open_and_record_topology_mixups() {
    for fault in 0..7 {
        ready!(
            inputs,
            checked,
            held,
            topology,
            source,
            counts,
            b,
            cancel,
            now,
            {
                let _ = (&cancel, &now, &checked);
                let mut held = held;
                let mut topology = topology;
                match fault {
                    0 => topology.lineage = Rc::new(()),
                    1 => topology.records.generation += 1,
                    2 => topology.target.policy = "foreign".into(),
                    3 => held.initial_origin = Rc::new(()),
                    4 => held.initial.stat.inode += 1,
                    5 => topology.ancestors[0].snapshot.stat.inode += 1,
                    _ => {
                        held.ancestors.pop();
                    }
                }
                let result = evidence::held::acquire(inputs, held, topology, source, &mut b);
                rejects(
                    result.unwrap_err(),
                    if [4, 5].contains(&fault) {
                        Failure::Changed
                    } else {
                        Failure::Binding
                    },
                );
                assert_eq!(counts.reads.get(), 0);
                assert_eq!(counts.made.get(), counts.dropped.get());
                assert_eq!(counts.live.get(), 0);
                assert!(b.checkpoint().is_err());
            }
        );
    }
}

#[test]
fn held_evidence_issue_and_consume_are_one_shot_even_for_duplicate_fixtures() {
    for duplicate_issue in [true, false] {
        ready!(
            inputs,
            checked,
            held,
            topology,
            source,
            counts,
            b,
            cancel,
            now,
            {
                let _ = (&cancel, &now);
                let inputs =
                    evidence::held::acquire(inputs, held, topology, source, &mut b).unwrap();
                let p = inputs.issue(&mut b).unwrap();
                if duplicate_issue {
                    drop(p);
                    rejects(inputs.issue(&mut b).unwrap_err(), Failure::Binding);
                } else {
                    let p2 = p.duplicate_fixture();
                    let checked2 = checked.duplicate_fixture();
                    let _ok = p.consume(checked, &inputs, &mut b).unwrap();
                    rejects(
                        p2.consume(checked2, &inputs, &mut b).unwrap_err(),
                        Failure::Binding,
                    );
                }
                drop(inputs);
                assert_eq!(counts.made.get(), counts.dropped.get());
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
            }
        );
    }
}

#[test]
fn held_evidence_rejects_source_lineage_origin_or_issuer_substitution() {
    for fault in 0..7 {
        ready!(
            inputs,
            checked,
            held,
            topology,
            source,
            counts,
            b,
            cancel,
            now,
            {
                let _ = (&cancel, &now);
                let mut inputs =
                    evidence::held::acquire(inputs, held, topology, source, &mut b).unwrap();
                let p = inputs.issue(&mut b).unwrap();
                let checked = if fault == 6 {
                    checked.foreign_fixture()
                } else {
                    inputs.corrupt_fixture(fault);
                    checked
                };
                rejects(
                    p.consume(checked, &inputs, &mut b).unwrap_err(),
                    Failure::Binding,
                );
                drop(inputs);
                assert_eq!(counts.made.get(), counts.dropped.get());
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
            }
        );
    }
}

#[test]
fn held_evidence_foreign_budget_is_stopped_at_issue_and_consume() {
    for at in 0..2 {
        ready!(
            inputs,
            checked,
            held,
            topology,
            source,
            counts,
            b,
            cancel,
            now,
            {
                let inputs =
                    evidence::held::acquire(inputs, held, topology, source, &mut b).unwrap();
                let mut foreign = SharedBudget::new(b.started, &cancel);
                let clock = || now.get();
                foreign.now = &clock;
                let error = if at == 0 {
                    inputs.issue(&mut foreign).unwrap_err()
                } else {
                    inputs
                        .issue(&mut b)
                        .unwrap()
                        .consume(checked, &inputs, &mut foreign)
                        .unwrap_err()
                };
                rejects(error, Failure::Binding);
                assert_eq!(foreign.checkpoint(), Err(Failure::Binding));
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
                drop(inputs);
                assert_eq!(counts.made.get(), counts.dropped.get());
            }
        );
    }
}

#[test]
fn held_evidence_two_guards_charge_once_and_fail_at_each_work_cancel_deadline_boundary() {
    for kind in 0..3 {
        for at in 0..=2 {
            ready!(
                inputs,
                checked,
                held,
                topology,
                source,
                counts,
                b,
                cancel,
                now,
                {
                    let inputs =
                        evidence::held::acquire(inputs, held, topology, source, &mut b).unwrap();
                    let before = (counts.attempts.get(), b.metadata_calls, b.topology_calls);
                    let spent = b.json_work;
                    if kind == 0 {
                        b.json_work = 1_000_000 - at;
                    }
                    let started = b.started;
                    let stop = |at: u64| {
                        if kind == 1 {
                            cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                        }
                        if kind == 2 {
                            now.set(started + Duration::from_secs(10 + at));
                        }
                    };
                    if at == 0 && kind != 0 {
                        stop(at);
                    }
                    let p = inputs.issue(&mut b);
                    if at == 1 && kind != 0 {
                        stop(at);
                    }
                    let result = p.and_then(|p| p.consume(checked, &inputs, &mut b));
                    if at == 2 {
                        assert!(result.is_ok());
                    } else {
                        rejects(
                            result.unwrap_err(),
                            [Failure::Limit, Failure::Cancelled, Failure::Deadline][kind],
                        );
                    }
                    assert_eq!(
                        before,
                        (counts.attempts.get(), b.metadata_calls, b.topology_calls)
                    );
                    if at == 2 && kind != 0 {
                        assert_eq!(b.json_work - spent, 2);
                    }
                    drop(inputs);
                    assert_eq!(counts.made.get(), counts.dropped.get());
                    assert_eq!(b.reserved, 0);
                    assert_eq!(b.metadata_cleanup_reserved, 0);
                }
            );
        }
    }
    for at in 1..=2 {
        ready!(
            inputs,
            checked,
            held,
            topology,
            source,
            counts,
            b,
            cancel,
            now,
            {
                let _ = &now;
                let inputs =
                    evidence::held::acquire(inputs, held, topology, source, &mut b).unwrap();
                let audit =
                    crate::signature_boundary::positioned_read::work_audit::Audit::default();
                audit.cancel_after_work(at, cancel.clone());
                b.work_audit = Some(audit.clone());
                let result = inputs
                    .issue(&mut b)
                    .and_then(|p| p.consume(checked, &inputs, &mut b));
                rejects(result.unwrap_err(), Failure::Cancelled);
                assert_eq!(audit.counts().iter().sum::<u64>(), at);
                cancel.store(false, std::sync::atomic::Ordering::SeqCst);
                rejects(inputs.issue(&mut b).unwrap_err(), Failure::Cancelled);
                assert_eq!(audit.counts().iter().sum::<u64>(), at);
                drop(inputs);
                assert_eq!(counts.made.get(), counts.dropped.get());
            }
        );
    }
}

#[test]
fn held_evidence_fresh_metadata_policy_or_read_failure_never_issues_proof() {
    for fault in 1..=9 {
        ready!(
            inputs,
            checked,
            held,
            topology,
            source,
            counts,
            b,
            cancel,
            now,
            {
                let _ = (&checked, &cancel, &now);
                counts.evidence_metadata_fault.set(fault);
                let error =
                    evidence::held::acquire(inputs, held, topology, source, &mut b).unwrap_err();
                let expected = if [4, 6, 8].contains(&fault) {
                    Failure::MetadataUnavailable
                } else {
                    Failure::Changed
                };
                rejects(error, expected);
                assert!(!b.protected_bridge_claim.held_evidence_issued.get());
                assert_eq!(counts.reads.get(), 0);
                assert_eq!(counts.made.get(), counts.dropped.get());
                assert_eq!(
                    counts.evidence_acl_made.get(),
                    counts.evidence_acl_freed.get()
                );
                assert_eq!(b.reserved, 0);
                assert_eq!(b.metadata_cleanup_reserved, 0);
            }
        );
    }
}

#[test]
fn held_evidence_late_acl_handle_on_cancel_is_freed_once_and_prior_reason_is_kept() {
    ready!(
        inputs,
        checked,
        held,
        topology,
        source,
        counts,
        b,
        cancel,
        now,
        {
            let _ = (&checked, &now);
            *counts.evidence_cancel_acl.borrow_mut() = Some(cancel.clone());
            let error =
                evidence::held::acquire(inputs, held, topology, source, &mut b).unwrap_err();
            rejects(error, Failure::Cancelled);
            assert_eq!(counts.evidence_acl_made.get(), 1);
            assert_eq!(counts.evidence_acl_freed.get(), 1);
            assert_eq!(counts.made.get(), counts.dropped.get());
            assert_eq!(b.metadata_cleanup_reserved, 0);
            assert_eq!(b.reserved, 0);
            cancel.store(false, std::sync::atomic::Ordering::SeqCst);
            assert_eq!(b.stop::<()>(Failure::Binding), Err(Failure::Cancelled));
        }
    );
}

#[test]
fn held_evidence_requires_same_budget_and_completed_records_before_acquisition_io() {
    for foreign in [false, true] {
        ready!(
            inputs,
            checked,
            held,
            topology,
            source,
            counts,
            b,
            cancel,
            now,
            {
                let _ = (&checked, &now);
                let mut other = SharedBudget::new(b.started, &cancel);
                other.now = b.now;
                let result = if foreign {
                    evidence::held::acquire(inputs, held, topology, source, &mut other)
                } else {
                    b.protected_bridge_claim.records_evidence_used.set(false);
                    evidence::held::acquire(inputs, held, topology, source, &mut b)
                };
                rejects(result.unwrap_err(), Failure::Binding);
                assert_eq!(counts.attempts.get(), 0);
                assert_eq!(counts.reads.get(), 0);
                assert_eq!(counts.made.get(), counts.dropped.get());
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
            }
        );
    }
}

#[test]
fn held_evidence_every_topology_attempt_failure_cancel_or_deadline_stops_and_releases() {
    let (fixture, _, _) = records_stage::valid_signature_fixture();
    let bound = bind(
        &fixture.receipt.binding,
        &fixture.receipt.lineage,
        &fixture.target,
    )
    .unwrap();
    // Two rechecks: K held observations, anchor pair, K-1 edge pairs, leaf pair.
    let attempts = 2 * (3 * bound.chain_names.len() + 2);
    for kind in 0..3 {
        for at in 1..=attempts {
            ready!(
                inputs,
                checked,
                held,
                topology,
                source,
                counts,
                b,
                cancel,
                now,
                {
                    let _ = &checked;
                    let mut source = source;
                    if kind == 0 {
                        source.adapter_fault(at);
                    } else {
                        let tick = now.clone();
                        let stop = cancel.clone();
                        let started = b.started;
                        source.adapter_hook(move |n, _| {
                            if n == at {
                                if kind == 1 {
                                    stop.store(true, std::sync::atomic::Ordering::SeqCst);
                                } else {
                                    tick.set(started + Duration::from_secs(10));
                                }
                            }
                        });
                    }
                    let result = evidence::held::acquire(inputs, held, topology, source, &mut b);
                    rejects(
                        result.unwrap_err(),
                        [
                            Failure::MetadataUnavailable,
                            Failure::Cancelled,
                            Failure::Deadline,
                        ][kind],
                    );
                    assert_eq!(counts.attempts.get(), at);
                    assert_eq!(counts.made.get(), counts.dropped.get());
                    assert_eq!(counts.live.get(), 0);
                    assert_eq!(counts.reads.get(), 0);
                    assert_eq!(
                        counts.evidence_acl_made.get(),
                        counts.evidence_acl_freed.get()
                    );
                    assert_eq!(b.reserved, 0);
                    assert_eq!(b.metadata_cleanup_reserved, 0);
                }
            );
        }
    }
}

#[test]
fn held_evidence_requires_verified_open_topology_and_same_consumed_records() {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let context = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let binding = f.receipt.binding.clone();
    let lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    let bound = bind(&binding, &lineage, &target).unwrap();
    let counts = Rc::new(topo::Counts::default());
    let (opened, topology, source) = topo::setup(&bound, &counts);
    let record_source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let inputs =
        evidence::synthetic::acquire(&context, &bound, f.receipt, record_source, &mut b).unwrap();
    let c = inputs.issue_context(&mut b).unwrap();
    let r = inputs.issue_records(&mut b).unwrap();
    let c = c.consume(&inputs, &mut b).unwrap();
    let checked = r.consume(c, &inputs, &mut b).unwrap();
    let inputs = evidence::held::acquire(
        inputs,
        attach(&bound, opened).unwrap(),
        topology,
        source,
        &mut b,
    )
    .unwrap();
    assert!(counts.attempts.get() > 0);
    assert_eq!(counts.reads.get(), 0);
    let before = (
        counts.attempts.get(),
        counts.reads.get(),
        b.metadata_calls,
        b.topology_calls,
    );
    let proof = inputs.issue(&mut b).unwrap();
    let inputs = Box::new(inputs); // Ownership may move; no saved field addresses.
    let both = proof.consume(checked, &inputs, &mut b).unwrap();
    assert_eq!(
        format!("{both:?}"),
        "HeldSourcesChecked(not_supply_or_execution_authority)"
    );
    assert_eq!(
        before,
        (
            counts.attempts.get(),
            counts.reads.get(),
            b.metadata_calls,
            b.topology_calls
        )
    );
    drop(inputs);
    assert_eq!(counts.made.get(), counts.dropped.get());
    assert_eq!(counts.live.get(), 0);
    assert_eq!(b.reserved, 0);
    assert_eq!(b.metadata_cleanup_reserved, 0);
    assert!(state.borrow().trace.is_empty());
    assert_eq!(b.checkpoint(), Ok(()));
}
