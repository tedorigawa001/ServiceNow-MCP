use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::{
    records::tests::Fake as RecordFake, tests as topo,
};
use scan_ops::connection_owner::protected_inputs::supply_evidence::{self as evidence, slots};
use scan_ops::connection_owner::result_owner::{
    InputLocation, InputRejected, StrictBridgeFailure, SupplyStage,
};
use slots::synthetic::Fault;
fn rejects(e: InputRejected, reason: Failure) {
    let e = StrictBridgeFailure::input(e);
    assert_eq!(e.reason(), reason);
    assert_eq!(
        e.input_location(),
        Some(InputLocation::Supply(SupplyStage::Slots))
    );
}

macro_rules! held_ready {
    ($held:ident,$checked:ident,$counts:ident,$b:ident,$cancel:ident,$now:ident,$body:block) => {{
        let (f, state, registry) = records_stage::valid_signature_fixture();
        let context = InspectionContext { registry:&registry, groups:&[80] };
        let $cancel=state.borrow().cancelled.clone();
        let $now=state.borrow().now.clone();
        let clock=||$now.get();
        let mut $b=SharedBudget::new($now.get(), &$cancel);
        $b.now=&clock;
        let binding=f.receipt.binding.clone(); let lineage=f.receipt.lineage.clone(); let target=f.target.clone();
        let bound=bind(&binding,&lineage,&target).unwrap();
        let $counts=Rc::new(topo::Counts::default());
        let (opened,topology,source)=topo::setup(&bound,&$counts);
        let record_source=RecordFake::for_stage(&f.receipt,&$now,$now.get());
        let inputs=evidence::synthetic::acquire(&context,&bound,f.receipt,record_source,&mut $b).unwrap();
        let c=inputs.issue_context(&mut $b).unwrap(); let r=inputs.issue_records(&mut $b).unwrap();
        let c=c.consume(&inputs,&mut $b).unwrap(); let checked=r.consume(c,&inputs,&mut $b).unwrap();
        let $held=evidence::held::acquire(inputs,attach(&bound,opened).unwrap(),topology,source,&mut $b).unwrap();
        let $checked=$held.issue(&mut $b).unwrap().consume(checked,&$held,&mut $b).unwrap();
        $body
        assert!(state.borrow().trace.is_empty());
    }};
}

#[test]
fn slots_evidence_validates_three_fixed_unstarted_sources_without_starting_scans() {
    held_ready!(held, checked, counts, b, cancel, now, {
        let _ = (&cancel, &now);
        let spent = b.json_work;
        let io = (b.metadata_calls, b.topology_calls, b.used, b.reserved);
        let candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
        let audit = candidate.audit();
        let inputs = candidate.acquire(&mut b).unwrap();
        let p = inputs.issue(&mut b).unwrap();
        let inputs = Box::new(inputs);
        let checked = p.consume(&inputs, &mut b).unwrap();
        assert_eq!(
            format!("{checked:?}"),
            "ScanSlotsChecked(independent_fragment_policy_unverified)"
        );
        assert_eq!(audit.operations(), 0);
        assert_eq!(b.json_work - spent, 13);
        assert_eq!(io, (b.metadata_calls, b.topology_calls, b.used, b.reserved));
        drop(inputs);
        assert_eq!(audit.dropped(), 3);
        assert_eq!(counts.made.get(), counts.dropped.get());
        assert!(!b.scan_session_claim.started.get());
        assert!(!b.protected_bridge_claim.generated.get());
        assert_eq!(b.checkpoint(), Ok(()));
    });
}

#[test]
fn slots_evidence_foreign_held_token_started_session_and_canonical_alias_are_rejected() {
    for fault in 0..4 {
        held_ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            if fault == 0 {
                let checked = checked.foreign_fixture();
                rejects(
                    slots::synthetic::prepare(held, checked, &mut b).unwrap_err(),
                    Failure::Binding,
                );
            } else if fault == 1 {
                b.scan_session_claim.started.set(true);
                rejects(
                    slots::synthetic::prepare(held, checked, &mut b).unwrap_err(),
                    Failure::Binding,
                );
            } else {
                let mut candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
                let audit = candidate.audit();
                candidate.canonical_alias_fixture(fault - 1);
                rejects(candidate.acquire(&mut b).unwrap_err(), Failure::Binding);
                assert_eq!(audit.operations(), 0);
                assert_eq!(audit.dropped(), 3);
            }
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}

#[test]
fn slots_evidence_rejects_wrong_round_missing_foreign_duplicate_and_swapped_sources() {
    let faults = [
        Fault::Swap(0, 1),
        Fault::Swap(1, 2),
        Fault::Swap(0, 2),
        Fault::Round(0),
        Fault::Round(1),
        Fault::Round(2),
        Fault::Missing(0),
        Fault::Missing(1),
        Fault::Missing(2),
        Fault::Foreign(0),
        Fault::Foreign(1),
        Fault::Foreign(2),
        Fault::Duplicate(1),
        Fault::Duplicate(2),
        Fault::Model(0),
        Fault::Model(1),
        Fault::Model(2),
    ];
    for fault in faults {
        for phase in 0..3 {
            held_ready!(held, checked, counts, b, cancel, now, {
                let _ = (&cancel, &now);
                let mut candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
                let audit = candidate.audit();
                let expected = if matches!(fault, Fault::Missing(_) | Fault::Model(_)) {
                    Failure::Unavailable
                } else {
                    Failure::Binding
                };
                if phase == 0 {
                    candidate.change(fault);
                    rejects(candidate.acquire(&mut b).unwrap_err(), expected);
                } else {
                    let mut inputs = candidate.acquire(&mut b).unwrap();
                    if phase == 1 {
                        inputs.change(fault);
                        rejects(inputs.issue(&mut b).unwrap_err(), expected);
                    } else {
                        let p = inputs.issue(&mut b).unwrap();
                        inputs.change(fault);
                        rejects(p.consume(&inputs, &mut b).unwrap_err(), expected);
                    }
                    drop(inputs);
                }
                assert_eq!(audit.operations(), 0);
                assert_eq!(audit.dropped(), 3);
                assert_eq!(counts.made.get(), counts.dropped.get());
                assert_eq!(b.checkpoint(), Err(expected));
            });
        }
    }
}

#[test]
fn slots_evidence_every_backend_operation_including_failed_attempt_marks_source_started() {
    for index in 0..3 {
        for op in 0..6 {
            for phase in 0..3 {
                held_ready!(held, checked, counts, b, cancel, now, {
                    let _ = (&cancel, &now);
                    let mut candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
                    let audit = candidate.audit();
                    if phase == 0 {
                        candidate.exercise(index, op);
                        rejects(candidate.acquire(&mut b).unwrap_err(), Failure::Binding);
                    } else {
                        let mut inputs = candidate.acquire(&mut b).unwrap();
                        if phase == 1 {
                            inputs.exercise(index, op);
                            rejects(inputs.issue(&mut b).unwrap_err(), Failure::Binding);
                        } else {
                            let p = inputs.issue(&mut b).unwrap();
                            inputs.exercise(index, op);
                            rejects(p.consume(&inputs, &mut b).unwrap_err(), Failure::Binding);
                        }
                        drop(inputs);
                    }
                    assert_eq!(audit.operations(), 1);
                    assert_eq!(audit.dropped(), 3);
                    assert_eq!(counts.made.get(), counts.dropped.get());
                });
            }
        }
    }
}

#[test]
fn slots_evidence_issuer_and_held_binding_are_not_replaceable_or_reusable() {
    for fault in 0..6 {
        held_ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            let candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
            let mut inputs = candidate.acquire(&mut b).unwrap();
            let p = inputs.issue(&mut b).unwrap();
            inputs.change(Fault::Held(fault));
            rejects(p.consume(&inputs, &mut b).unwrap_err(), Failure::Binding);
            drop(inputs);
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
    for mode in 0..3 {
        held_ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            let candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
            let mut inputs = candidate.acquire(&mut b).unwrap();
            let p = inputs.issue(&mut b).unwrap();
            match mode {
                0 => {
                    drop(p);
                    rejects(inputs.issue(&mut b).unwrap_err(), Failure::Binding);
                }
                1 => {
                    let p2 = p.duplicate_fixture();
                    let _checked = p.consume(&inputs, &mut b).unwrap();
                    rejects(p2.consume(&inputs, &mut b).unwrap_err(), Failure::Binding);
                }
                _ => {
                    inputs.change(Fault::Unissued);
                    rejects(p.consume(&inputs, &mut b).unwrap_err(), Failure::Binding);
                }
            }
            drop(inputs);
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}

#[test]
fn slots_evidence_rejects_foreign_budget_at_prepare_acquire_issue_and_consume() {
    for phase in 0..4 {
        held_ready!(held, checked, counts, b, cancel, now, {
            let mut foreign = SharedBudget::new(b.started, &cancel);
            foreign.now = b.now;
            let _ = &now;
            if phase == 0 {
                rejects(
                    slots::synthetic::prepare(held, checked, &mut foreign).unwrap_err(),
                    Failure::Binding,
                );
            } else {
                let candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
                let audit = candidate.audit();
                if phase == 1 {
                    rejects(
                        candidate.acquire(&mut foreign).unwrap_err(),
                        Failure::Binding,
                    );
                } else {
                    let inputs = candidate.acquire(&mut b).unwrap();
                    if phase == 2 {
                        rejects(inputs.issue(&mut foreign).unwrap_err(), Failure::Binding);
                    } else {
                        let p = inputs.issue(&mut b).unwrap();
                        rejects(
                            p.consume(&inputs, &mut foreign).unwrap_err(),
                            Failure::Binding,
                        );
                    }
                    drop(inputs);
                }
                assert_eq!(audit.operations(), 0);
                assert_eq!(audit.dropped(), 3);
            }
            assert_eq!(b.checkpoint(), Err(Failure::Binding));
            assert_eq!(foreign.checkpoint(), Err(Failure::Binding));
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}

#[test]
fn slots_evidence_fixed_guard_costs_and_each_work_boundary_stop_without_starting_sources() {
    for phase in 0..3 {
        for remaining in 0..=4 {
            held_ready!(held, checked, counts, b, cancel, now, {
                let _ = (&cancel, &now);
                let candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
                let audit = candidate.audit();
                if phase == 0 {
                    b.json_work = 1_000_000 - remaining;
                    let result = candidate.acquire(&mut b);
                    if remaining == 4 {
                        assert!(result.is_ok());
                    } else {
                        rejects(result.unwrap_err(), Failure::Limit);
                    }
                } else {
                    let inputs = candidate.acquire(&mut b).unwrap();
                    if phase == 1 {
                        b.json_work = 1_000_000 - remaining;
                        let result = inputs.issue(&mut b);
                        if remaining == 4 {
                            assert!(result.is_ok());
                        } else {
                            rejects(result.unwrap_err(), Failure::Limit);
                        }
                    } else {
                        let p = inputs.issue(&mut b).unwrap();
                        b.json_work = 1_000_000 - remaining;
                        let result = p.consume(&inputs, &mut b);
                        if remaining == 4 {
                            assert!(result.is_ok());
                        } else {
                            rejects(result.unwrap_err(), Failure::Limit);
                        }
                    }
                    drop(inputs);
                }
                assert_eq!(b.json_work, 1_000_000);
                assert_eq!(audit.operations(), 0);
                assert_eq!(audit.dropped(), 3);
                assert_eq!(counts.made.get(), counts.dropped.get());
            });
        }
    }
}

#[test]
fn slots_evidence_each_post_charge_cancel_and_preexisting_deadline_retains_first_reason() {
    for phase in 0..3 {
        for at in 0..=4 {
            held_ready!(held, checked, counts, b, cancel, now, {
                let candidate = slots::synthetic::prepare(held, checked, &mut b).unwrap();
                let audit = candidate.audit();
                let stop = |b: &mut SharedBudget<'_>| {
                    if at == 0 {
                        now.set(b.started + Duration::from_secs(10));
                    } else {
                        let a =
                            crate::signature_boundary::positioned_read::work_audit::Audit::default(
                            );
                        a.cancel_after_work(at, cancel.clone());
                        b.work_audit = Some(a);
                    }
                };
                if phase == 0 {
                    stop(&mut b);
                    rejects(
                        candidate.acquire(&mut b).unwrap_err(),
                        if at == 0 {
                            Failure::Deadline
                        } else {
                            Failure::Cancelled
                        },
                    );
                } else {
                    let inputs = candidate.acquire(&mut b).unwrap();
                    if phase == 1 {
                        stop(&mut b);
                        rejects(
                            inputs.issue(&mut b).unwrap_err(),
                            if at == 0 {
                                Failure::Deadline
                            } else {
                                Failure::Cancelled
                            },
                        );
                    } else {
                        let p = inputs.issue(&mut b).unwrap();
                        stop(&mut b);
                        rejects(
                            p.consume(&inputs, &mut b).unwrap_err(),
                            if at == 0 {
                                Failure::Deadline
                            } else {
                                Failure::Cancelled
                            },
                        );
                    }
                    let spent = b.json_work;
                    cancel.store(false, std::sync::atomic::Ordering::SeqCst);
                    rejects(
                        inputs.issue(&mut b).unwrap_err(),
                        if at == 0 {
                            Failure::Deadline
                        } else {
                            Failure::Cancelled
                        },
                    );
                    assert_eq!(b.json_work, spent);
                    drop(inputs);
                }
                assert_eq!(audit.operations(), 0);
                assert_eq!(audit.dropped(), 3);
                assert_eq!(counts.made.get(), counts.dropped.get());
            });
        }
    }
}
