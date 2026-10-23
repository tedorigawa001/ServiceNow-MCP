use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::{
    records::tests::Fake as RecordFake, tests as topo,
};
use policy::synthetic::{self, Fault};
use scan_ops::connection_owner::protected_inputs::supply_evidence::{self as evidence, policy};
use scan_ops::connection_owner::result_owner::{
    InputLocation, InputRejected, StrictBridgeFailure, SupplyStage,
};
fn rejects(e: InputRejected, reason: Failure) {
    let e = StrictBridgeFailure::input(e);
    assert_eq!(e.reason(), reason);
    assert_eq!(
        e.input_location(),
        Some(InputLocation::Supply(SupplyStage::PolicyCaps))
    );
}
macro_rules! ready {
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
fn policy_evidence_success_has_fixed_cost_no_io_and_no_authority() {
    ready!(held, checked, counts, b, cancel, now, {
        let _ = (&cancel, &now);
        let cost = b.json_work;
        let io = (
            b.metadata_calls,
            b.topology_calls,
            b.used,
            b.reserved,
            b.retries_left,
        );
        let inputs = synthetic::prepare(held, checked, &mut b).unwrap();
        let proof = inputs.issue(&mut b).unwrap();
        let checked = proof.consume(&inputs, &mut b).unwrap();
        assert_eq!(b.json_work - cost, 89); // prepare1 + 2*(entry1 + binding1/models1/approval1 + 40)
        assert_eq!(
            io,
            (
                b.metadata_calls,
                b.topology_calls,
                b.used,
                b.reserved,
                b.retries_left
            )
        );
        assert_eq!(
            format!("{checked:?}"),
            "PolicyCapsChecked(independent_fragment_not_allocation_or_permit)"
        );
        assert!(!b.scan_session_claim.started.get());
        assert!(!b.protected_bridge_claim.generated.get());
        assert!(!b.protected_bridge_claim.slots_evidence_issued.get());
        drop(inputs);
        assert_eq!(counts.made.get(), counts.dropped.get());
        assert_eq!(b.checkpoint(), Ok(()));
    });
}
#[test]
fn policy_evidence_cap_and_model_faults_stop_at_issue_and_consume() {
    let mut faults = vec![
        (Fault::CapModel, Failure::Unavailable),
        (Fault::WitnessModel, Failure::Unavailable),
        (Fault::Build, Failure::Binding),
        (Fault::Coefficients, Failure::Binding),
        (Fault::Role, Failure::Binding),
        (Fault::Revision, Failure::Binding),
        (Fault::Digest, Failure::Binding),
        (Fault::Authority, Failure::Binding),
        (Fault::Profile, Failure::Binding),
        (Fault::Coverage, Failure::Unavailable),
        (Fault::MissingBootstrap, Failure::Unavailable),
        (Fault::Expired, Failure::Expired),
        (Fault::DeadlineEqual, Failure::Expired),
        (Fault::Future, Failure::Expired),
    ];
    for i in 0..12 {
        faults.push((Fault::Bundle(i), Failure::Unavailable));
    }
    for (fault, reason) in faults {
        for consume in [false, true] {
            ready!(held, checked, counts, b, cancel, now, {
                let _ = (&cancel, &now);
                let mut p = synthetic::prepare(held, checked, &mut b).unwrap();
                if consume {
                    let proof = p.issue(&mut b).unwrap();
                    p.fault(fault);
                    rejects(proof.consume(&p, &mut b).unwrap_err(), reason);
                } else {
                    p.fault(fault);
                    rejects(p.issue(&mut b).unwrap_err(), reason);
                }
                assert_eq!(b.checkpoint(), Err(reason));
                rejects(p.issue(&mut b).unwrap_err(), reason);
                drop(p);
                assert_eq!(counts.made.get(), counts.dropped.get());
            });
        }
    }
}
#[test]
fn policy_evidence_all_forty_dimensions_are_independent_and_exact() {
    for i in 0..40 {
        for (required, cap) in [
            (9, 10),
            (10, 10),
            (11, 10),
            (u64::MAX, u64::MAX),
            (u64::MAX, u64::MAX - 1),
        ] {
            ready!(held, checked, counts, b, cancel, now, {
                let _ = (&cancel, &now);
                let mut p = synthetic::prepare(held, checked, &mut b).unwrap();
                p.dimension(i, required, cap);
                if required > cap || cap > 1_000_000 {
                    rejects(p.issue(&mut b).unwrap_err(), Failure::Limit);
                } else {
                    p.issue(&mut b).unwrap().consume(&p, &mut b).unwrap();
                }
                drop(p);
                assert_eq!(counts.made.get(), counts.dropped.get());
            });
        }
    }
}
#[test]
fn policy_evidence_duplicate_issue_use_and_drop_never_restore_claims() {
    for mode in 0..3 {
        ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            let p = synthetic::prepare(held, checked, &mut b).unwrap();
            let proof = p.issue(&mut b).unwrap();
            if mode == 0 {
                rejects(p.issue(&mut b).unwrap_err(), Failure::Binding);
                rejects(proof.consume(&p, &mut b).unwrap_err(), Failure::Binding);
            } else if mode == 1 {
                let duplicate = proof.duplicate_fixture();
                proof.consume(&p, &mut b).unwrap();
                rejects(duplicate.consume(&p, &mut b).unwrap_err(), Failure::Binding);
            } else {
                drop(proof);
                rejects(p.issue(&mut b).unwrap_err(), Failure::Binding);
            }
            assert_eq!(
                b.protected_bridge_claim.failure.get(),
                Some(Failure::Binding)
            );
            drop(p);
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}
#[test]
fn policy_evidence_wrong_held_token_order_and_started_session_stop_before_issue() {
    for fault in 0..4 {
        ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            let checked = if fault == 0 {
                checked.foreign_fixture()
            } else {
                checked
            };
            match fault {
                1 => b.protected_bridge_claim.slots_evidence_issued.set(true),
                2 => b.protected_bridge_claim.slots_evidence_used.set(true),
                3 => b.scan_session_claim.started.set(true),
                _ => (),
            }
            rejects(
                synthetic::prepare(held, checked, &mut b).unwrap_err(),
                Failure::Binding,
            );
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}
#[test]
fn policy_evidence_late_slot_start_unissued_and_held_substitution_are_rejected() {
    for fault in 0..8 {
        ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            let mut p = synthetic::prepare(held, checked, &mut b).unwrap();
            let proof = p.issue(&mut b).unwrap();
            if fault == 0 {
                b.protected_bridge_claim.slots_evidence_issued.set(true);
            } else if fault == 1 {
                p.fault(Fault::Unissued);
            } else {
                p.fault(Fault::Held((fault - 2) as u8));
            }
            rejects(proof.consume(&p, &mut b).unwrap_err(), Failure::Binding);
            drop(p);
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}
#[test]
fn policy_evidence_foreign_budget_is_sticky_on_both_claims() {
    for phase in 0..3 {
        ready!(held, checked, counts, b, cancel, now, {
            let mut other = SharedBudget::new(now.get(), &cancel);
            let claim = b.protected_bridge_claim.clone();
            if phase == 0 {
                rejects(
                    synthetic::prepare(held, checked, &mut other).unwrap_err(),
                    Failure::Binding,
                );
            } else {
                let p = synthetic::prepare(held, checked, &mut b).unwrap();
                if phase == 1 {
                    rejects(p.issue(&mut other).unwrap_err(), Failure::Binding);
                } else {
                    let proof = p.issue(&mut b).unwrap();
                    rejects(proof.consume(&p, &mut other).unwrap_err(), Failure::Binding);
                }
                drop(p);
            }
            assert_eq!(claim.failure.get(), Some(Failure::Binding));
            assert_eq!(b.checkpoint(), Err(Failure::Binding));
            assert_eq!(other.checkpoint(), Err(Failure::Binding));
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}
#[test]
fn policy_evidence_each_work_boundary_fails_sticky_without_io_or_resource_leaks() {
    for available in 0..89 {
        ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            b.json_work = 1_000_000 - available;
            let io = (b.metadata_calls, b.topology_calls, b.used, b.reserved);
            match synthetic::prepare(held, checked, &mut b) {
                Err(e) => rejects(e, Failure::Limit),
                Ok(p) => {
                    match p.issue(&mut b) {
                        Err(e) => rejects(e, Failure::Limit),
                        Ok(proof) => {
                            rejects(proof.consume(&p, &mut b).unwrap_err(), Failure::Limit)
                        }
                    }
                    drop(p);
                }
            }
            assert_eq!(io, (b.metadata_calls, b.topology_calls, b.used, b.reserved));
            assert_eq!(b.checkpoint(), Err(Failure::Limit));
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}
#[test]
fn policy_evidence_cancel_deadline_prior_reason_and_expiry_are_rechecked() {
    for phase in 0..3 {
        for reason in [Failure::Cancelled, Failure::Deadline, Failure::HashMismatch] {
            ready!(held, checked, counts, b, cancel, now, {
                let stop = |b: &mut SharedBudget<'_>| match reason {
                    Failure::Cancelled => cancel.store(true, std::sync::atomic::Ordering::Release),
                    Failure::Deadline => now.set(now.get() + Duration::from_secs(10)),
                    _ => {
                        b.stop::<()>(reason).unwrap_err();
                    }
                };
                if phase == 0 {
                    stop(&mut b);
                    rejects(
                        synthetic::prepare(held, checked, &mut b).unwrap_err(),
                        reason,
                    );
                } else {
                    let p = synthetic::prepare(held, checked, &mut b).unwrap();
                    if phase == 1 {
                        stop(&mut b);
                        rejects(p.issue(&mut b).unwrap_err(), reason);
                    } else {
                        let proof = p.issue(&mut b).unwrap();
                        stop(&mut b);
                        rejects(proof.consume(&p, &mut b).unwrap_err(), reason);
                    }
                    drop(p);
                }
                assert_eq!(b.checkpoint(), Err(reason));
                assert_eq!(counts.made.get(), counts.dropped.get());
            });
        }
    }
}

#[test]
fn policy_evidence_every_post_charge_cancellation_is_sticky_and_releases_once() {
    for at in 1..=89 {
        ready!(held, checked, counts, b, cancel, now, {
            let _ = &now;
            let audit = crate::signature_boundary::positioned_read::work_audit::Audit::default();
            audit.cancel_after_work(at, cancel.clone());
            b.work_audit = Some(audit);
            let spent = b.json_work;
            match synthetic::prepare(held, checked, &mut b) {
                Err(e) => rejects(e, Failure::Cancelled),
                Ok(p) => {
                    match p.issue(&mut b) {
                        Err(e) => rejects(e, Failure::Cancelled),
                        Ok(proof) => {
                            rejects(proof.consume(&p, &mut b).unwrap_err(), Failure::Cancelled)
                        }
                    }
                    drop(p);
                }
            }
            assert_eq!(b.json_work - spent, at);
            cancel.store(false, std::sync::atomic::Ordering::Release);
            assert_eq!(b.checkpoint(), Err(Failure::Cancelled));
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}

#[test]
fn policy_evidence_cap_insufficiency_after_issue_is_not_accepted() {
    for i in 0..40 {
        ready!(held, checked, counts, b, cancel, now, {
            let _ = (&cancel, &now);
            let mut p = synthetic::prepare(held, checked, &mut b).unwrap();
            let proof = p.issue(&mut b).unwrap();
            p.dimension(i, 11, 10);
            rejects(proof.consume(&p, &mut b).unwrap_err(), Failure::Limit);
            drop(p);
            assert_eq!(counts.made.get(), counts.dropped.get());
        });
    }
}
