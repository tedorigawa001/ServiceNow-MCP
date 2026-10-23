use super::super::super::super::tests::setup;
use super::super::super::tests::{augmented, ready};
use super::*;
use crate::signature_boundary::positioned_read::work_audit::Audit;
use std::{cell::Cell, time::Duration};

#[test]
fn same_estimate_partial_projection_is_independent_of_resource_projection_and_keeps_unknowns() {
    for reverse in [false, true] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let accounting = (
                b.used,
                b.reserved,
                b.retries_left,
                b.metadata_calls,
                b.topology_calls,
            );
            {
                let _resource = if reverse {
                    Some(projection::project(
                        &e,
                        inputs,
                        scope,
                        projection::PROJECTION_ID,
                        b,
                    )?)
                } else {
                    None
                };
                let before = b.json_work;
                let p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
                assert_eq!(b.json_work - before, 35);
                assert!(std::ptr::eq(p.estimate, &e));
                assert_eq!(p.shape.normal_entries, 4); // literal base fixture oracle
                assert_eq!(p.shape.element_payload_bytes, 32); // NOT an allocator upper bound
                assert_eq!(
                    (p.shape.key_allocation_sites, p.shape.inline_scalars),
                    (4, 53)
                );
                assert!(e.resource_owner.management_projection.get() == State::Issued);
                assert_eq!(
                    format!("{p:?}"),
                    "ManagementProjection(partial_all_layouts_unknown_not_full_requirement)"
                );
                if !reverse {
                    let _resource =
                        projection::project(&e, inputs, scope, projection::PROJECTION_ID, b)?;
                }
                let before = b.json_work;
                p.consume(&e, inputs, scope, b)?;
                assert_eq!(b.json_work - before, 13);
                assert!(e.resource_owner.management_projection.get() == State::Consumed);
                assert_eq!(
                    accounting,
                    (
                        b.used,
                        b.reserved,
                        b.retries_left,
                        b.metadata_calls,
                        b.topology_calls
                    )
                );
                assert!(!b.scan_session_claim.started.get());
                assert!(!b.protected_bridge_claim.policy_evidence_issued.get());
                assert!(!b.protected_bridge_claim.generated.get());
                assert!(
                b.protected_bridge_claim.allocation.get()
                    == crate::signature_boundary::positioned_read::allocation_claim::State::Fresh
            );
            }
            e.consume_for_collector(inputs, scope, b)?;
            Ok(())
        })
        .unwrap();
    }
}

#[test]
fn duplicate_generation_after_drop_forget_consume_and_failed_model_never_restarts() {
    for mode in 0..4 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = if mode == 3 {
            Failure::Unavailable
        } else {
            Failure::Binding
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let p = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
                if mode == 3 {
                    assert_eq!(
                        project(&e, inputs, scope, "unknown", b).unwrap_err(),
                        expected
                    );
                } else {
                    let p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
                    match mode {
                        0 => {
                            #[allow(
                                clippy::drop_non_drop,
                                reason = "Deliberate abandonment probes a budget-owned claim, not resource cleanup"
                            )]
                            drop(p);
                        }
                        1 => {
                            #[allow(
                                clippy::forget_non_drop,
                                reason = "Deliberate forget probes regeneration; this non-resource value has no destructor"
                            )]
                            std::mem::forget(p);
                        }
                        _ => p.consume(&e, inputs, scope, b)?,
                    }
                }
                assert_eq!(
                    project(&e, inputs, scope, MANAGEMENT_ID, b).unwrap_err(),
                    expected
                );
                assert!(e.resource_owner.management_projection.get() == State::Stopped(expected));
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn foreign_budget_on_generation_or_consumption_stops_both_original_and_presented() {
    for consume in [false, true] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let p = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
                let mut other = SharedBudget::new(b.started, &cancel);
                // Matching origin alone must not replace the canonical bridge/session owner.
                other.inspection_origin = b.inspection_origin.clone();
                if consume {
                    let p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
                    assert_eq!(
                        p.consume(&e, inputs, scope, &mut other),
                        Err(Failure::Binding)
                    );
                } else {
                    assert_eq!(
                        project(&e, inputs, scope, MANAGEMENT_ID, &mut other).unwrap_err(),
                        Failure::Binding
                    );
                }
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
                assert_eq!(other.checkpoint(), Err(Failure::Binding));
                assert!(
                    e.resource_owner.management_projection.get()
                        == State::Stopped(Failure::Binding)
                );
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn other_estimate_receipt_profile_or_round_cannot_be_used_on_consumption() {
    for change in 0..3 {
        let s = setup();
        let other = augmented(1, 0, "index.json", 1);
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
                ready(
                    if change == 1 { &other } else { &s },
                    Round::Initial,
                    b,
                    |inputs2, scope2, b| {
                        let profile2 = build(inputs2, scope2, MODEL_ID, b)?;
                        let e2 = calculate(profile2, inputs2, scope2, CALCULATOR_ID, b)?;
                        let result = if change == 0 {
                            p.consume(&e2, inputs, scope, b)
                        } else {
                            p.consume(&e, inputs2, scope2, b)
                        };
                        assert_eq!(result, Err(Failure::Binding));
                        Err::<(), _>(Failure::Binding)
                    },
                )
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn budget_owned_claim_cannot_be_regenerated_with_another_estimate() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            {
                let _p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
            }
            ready(&s, Round::Initial, b, |inputs2, scope2, b| {
                let profile2 = build(inputs2, scope2, MODEL_ID, b)?;
                let e2 = calculate(profile2, inputs2, scope2, CALCULATOR_ID, b)?;
                assert_eq!(
                    project(&e2, inputs2, scope2, MANAGEMENT_ID, b).unwrap_err(),
                    Failure::Binding
                );
                Err::<(), _>(Failure::Binding)
            })
        }),
        Err(Failure::Binding)
    );
}

#[test]
fn changed_retry_start_models_started_flags_and_noninitial_round_are_rejected() {
    for fault in 0..8 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = match fault {
            0 | 1 => Failure::Unavailable,
            2 => Failure::Changed,
            _ => Failure::Binding,
        };
        assert_eq!(
            ready(
                &s,
                if fault == 7 {
                    Round::BeforeM4
                } else {
                    Round::Initial
                },
                &mut b,
                |inputs, scope, b| {
                    let p = build(inputs, scope, MODEL_ID, b)?;
                    let mut e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
                    match fault {
                        0 => e.calculator_model = "unknown",
                        1 => e.kernel_model = "old",
                        2 => b.retries_left -= 1,
                        3 => b.started += Duration::from_nanos(1),
                        4 => b.scan_session_claim.started.set(true),
                        5 => b.protected_bridge_claim.generated.set(true),
                        6 => b.protected_bridge_claim.used.set(true),
                        _ => (),
                    }
                    assert_eq!(
                        project(&e, inputs, scope, MANAGEMENT_ID, b).unwrap_err(),
                        expected
                    );
                    assert_eq!(b.checkpoint(), Err(expected));
                    Err::<(), _>(expected)
                }
            ),
            Err(expected)
        );
    }
}

#[test]
fn external_stop_in_all_active_states_is_visible_to_owner_and_never_overwritten() {
    for state in [
        State::Started,
        State::Issued,
        State::Consuming,
        State::Consumed,
    ] {
        for reason in [Failure::Cancelled, Failure::Deadline, Failure::HashMismatch] {
            let c = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &c);
            b.protected_bridge_claim.management_projection.set(state);
            let owner = b.protected_bridge_claim.clone();
            b.stop::<()>(reason).unwrap_err();
            assert!(owner.management_projection.get() == State::Stopped(reason));
            assert_eq!(
                owner.begin_management(State::Fresh, State::Started),
                Err(reason)
            );
            assert!(owner.management_projection.get() == State::Stopped(reason));
            assert_eq!(b.stop::<()>(Failure::Binding), Err(reason));
        }
    }
}

#[test]
fn every_generation_and_consumption_work_boundary_preserves_reason_and_claim() {
    for phase in 0..2 {
        for mode in 0..3 {
            for at in 1..=if phase == 0 { 35 } else { 13 } {
                let s = setup();
                let cancel = Rc::new(AtomicBool::new(false));
                let audit = Audit::default();
                let active = Cell::new(false);
                let start = Instant::now();
                let clock = || {
                    if mode == 2 && active.get() && audit.counts().iter().sum::<u64>() >= at {
                        start + Duration::from_secs(10)
                    } else {
                        start
                    }
                };
                let mut b = SharedBudget::new(start, &cancel);
                b.now = &clock;
                let reason = [Failure::Limit, Failure::Cancelled, Failure::Deadline][mode];
                assert_eq!(
                    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                        let p = build(inputs, scope, MODEL_ID, b)?;
                        let e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
                        let arm = |b: &mut SharedBudget<'_>| {
                            if mode == 0 {
                                b.json_work = 1_000_000 - (at - 1);
                            } else {
                                b.work_audit = Some(audit.clone());
                                active.set(true);
                                if mode == 1 {
                                    audit.cancel_after_work(at, cancel.clone());
                                }
                            }
                        };
                        if phase == 0 {
                            arm(b);
                            assert_eq!(
                                project(&e, inputs, scope, MANAGEMENT_ID, b).unwrap_err(),
                                reason
                            );
                        } else {
                            let p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
                            arm(b);
                            assert_eq!(p.consume(&e, inputs, scope, b), Err(reason));
                        }
                        assert!(
                            e.resource_owner.management_projection.get() == State::Stopped(reason)
                        );
                        let spent = b.json_work;
                        assert_eq!(
                            project(&e, inputs, scope, MANAGEMENT_ID, b).unwrap_err(),
                            reason
                        );
                        assert_eq!(b.json_work, spent);
                        Err::<(), _>(reason)
                    }),
                    Err(reason)
                );
            }
        }
    }
}

#[test]
fn partial_shape_corruption_and_same_value_foreign_owner_cannot_pass() {
    for fault in 0..5 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let reason = if fault == 4 {
            Failure::Unavailable
        } else {
            Failure::Binding
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let mut p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
                match fault {
                    0 => p.shape.normal_entries += 1,
                    1 => p.shape.element_payload_bytes += 1,
                    2 => p.shape.key_allocation_sites = 3,
                    3 => p.shape.inline_scalars = 52,
                    _ => p.model = "unknown",
                }
                assert_eq!(p.consume(&e, inputs, scope, b), Err(reason));
                Err::<(), _>(reason)
            }),
            Err(reason)
        );
    }
}

#[test]
fn scalar_boundaries_are_payload_only_and_wide_deep_profiles_use_same_source() {
    assert_eq!(element_payload(0), Ok(0));
    assert_eq!(element_payload(1), Ok(8));
    assert_eq!(element_payload(100_000), Ok(800_000));
    assert_eq!(element_payload(100_001), Err(Failure::Limit));
    assert_eq!(element_payload(u64::MAX), Err(Failure::Limit));
    for (width, depth) in [(0, 0), (1, 0), (12, 8), (64, 0)] {
        let s = augmented(width, depth, "index.json", 1);
        let c = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &c);
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
            let n = inputs.declaration.entries().len() as u64; // independent fixture oracle, no runtime extra pass
            assert_eq!(p.shape.normal_entries, n);
            assert_eq!(p.shape.element_payload_bytes, n * 8);
            p.consume(&e, inputs, scope, b)
        })
        .unwrap();
    }
}

#[test]
fn partial_type_is_move_only_and_not_serializable() {
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
    type P = ManagementProjection<'static, 'static, 'static, 'static, 'static, 'static>;
    not_impl!(P, Clone);
    not_impl!(P, Copy);
    not_impl!(P, serde::Serialize);
    not_impl!(P, serde::de::DeserializeOwned);
    assert!(
        std::mem::size_of::<crate::signature_boundary::positioned_read::ProtectedBridgeClaim>()
            <= 64
    );
}

#[test]
fn claim_has_no_reset_transition_and_duplicate_consumption_is_rejected() {
    let c = AtomicBool::new(false);
    let b = SharedBudget::new(Instant::now(), &c);
    for state in [
        State::Started,
        State::Issued,
        State::Consuming,
        State::Consumed,
    ] {
        b.protected_bridge_claim.management_projection.set(state);
        assert_eq!(
            b.protected_bridge_claim
                .begin_management(state, State::Fresh),
            Err(Failure::Binding)
        );
        assert!(b.protected_bridge_claim.management_projection.get() == state);
    }
    let s = setup();
    let mut b = SharedBudget::new(Instant::now(), &c);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, MANAGEMENT_ID, b)?;
            // Deliberate TEST-ONLY forged second wrapper, not a runtime factory/Clone.
            let duplicate = ManagementProjection {
                estimate: &e,
                facts: recipes::inspect_fixed(b)?,
                shape: PartialShape {
                    normal_entries: 4,
                    element_payload_bytes: 32,
                    key_allocation_sites: 4,
                    inline_scalars: 53,
                },
                model: MANAGEMENT_ID,
            };
            p.consume(&e, inputs, scope, b)?;
            assert_eq!(
                duplicate.consume(&e, inputs, scope, b),
                Err(Failure::Binding)
            );
            assert!(
                e.resource_owner.management_projection.get() == State::Stopped(Failure::Binding)
            );
            Err::<(), _>(Failure::Binding)
        }),
        Err(Failure::Binding)
    );
}
