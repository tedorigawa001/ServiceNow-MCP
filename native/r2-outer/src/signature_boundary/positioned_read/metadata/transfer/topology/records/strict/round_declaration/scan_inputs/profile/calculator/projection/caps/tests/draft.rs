use super::*;
use crate::signature_boundary::positioned_read::{allocation_claim::State as AllocationState,work_audit::Audit};
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::strict::round_declaration::session::resources::draft;

#[test]
fn allocation_view_and_draft_keep_five_unknown_and_never_finalize_or_start_anything() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let p = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
            let cap = synthetic(scope, b);
            let compared = compare(&p, &cap, &e, inputs, scope, b)?;
            let old = b.json_work;
            let accounting = (
                b.used,
                b.reserved,
                b.retries_left,
                b.metadata_calls,
                b.topology_calls,
            );
            let view = compared.into_allocation_view(b)?;
            assert_eq!(b.json_work - old, 4);
            assert_eq!(
                format!("{view:?}"),
                "ScanCapAllocationView(borrowed_partial_not_policy_or_quota)"
            );
            let d = draft::create(view, scope, b)?;
            assert_eq!(b.json_work - old, 9);
            assert_eq!(d.unknown_count(), 5);
            assert_eq!(
                format!("{d:?}"),
                "ScanPartsDraft(non_executable_five_unknown_not_allocation_or_permit)"
            );
            assert!(b.protected_bridge_claim.allocation.get() == AllocationState::DraftReady);
            assert_eq!(d.finalize(scope, b), Err(Failure::Unavailable));
            assert_eq!(b.json_work - old, 18);
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
            assert!(
                b.protected_bridge_claim.allocation.get()
                    == AllocationState::Stopped(Failure::Unavailable)
            );
            assert!(!b.scan_session_claim.started.get());
            assert!(!b.protected_bridge_claim.policy_evidence_issued.get());
            assert!(!b.protected_bridge_claim.generated.get());
            Err::<(), _>(Failure::Unavailable)
        }),
        Err(Failure::Unavailable)
    );
}

#[test]
fn allocation_budget_claim_blocks_duplicate_dropped_and_forgotten_drafts() {
    for mode in 0..3 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let reason = if mode == 1 {
            Failure::Unavailable
        } else {
            Failure::Binding
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let caps = synthetic(scope, b);
                let view = compare(&p, &caps, &e, inputs, scope, b)?.into_allocation_view(b)?;
                let duplicate = view.duplicate_fixture();
                let d = draft::create(view, scope, b)?;
                match mode {
                    0 => {
                        assert_eq!(draft::create(duplicate, scope, b).unwrap_err(), reason);
                        drop(d);
                    }
                    1 => {
                        drop(d);
                        assert_eq!(draft::create(duplicate, scope, b).unwrap_err(), reason);
                    }
                    _ => {
                        std::mem::forget(d);
                        assert_eq!(draft::create(duplicate, scope, b).unwrap_err(), reason);
                    }
                }
                assert_eq!(b.protected_bridge_claim.failure.get(), Some(reason));
                Err::<(), _>(reason)
            }),
            Err(reason)
        );
    }
}

#[test]
fn allocation_view_create_and_finalize_refuse_foreign_budget_and_preserve_original_stop() {
    for phase in 0..3 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let caps = synthetic(scope, b);
                let compared = compare(&p, &caps, &e, inputs, scope, b)?;
                let mut other = SharedBudget::new(b.started, &cancel);
                if phase == 0 {
                    assert_eq!(
                        compared.into_allocation_view(&mut other).unwrap_err(),
                        Failure::Binding
                    );
                } else {
                    let view = compared.into_allocation_view(b)?;
                    if phase == 1 {
                        assert_eq!(
                            draft::create(view, scope, &mut other).unwrap_err(),
                            Failure::Binding
                        );
                    } else {
                        let d = draft::create(view, scope, b)?;
                        assert_eq!(d.finalize(scope, &mut other), Err(Failure::Binding));
                    }
                }
                assert_eq!(other.checkpoint(), Err(Failure::Binding));
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn allocation_every_work_boundary_stops_with_limit_cancel_or_deadline_and_claim_observes_it() {
    for phase in 0..3 {
        for mode in 0..3 {
            let cost = [4, 5, 9][phase];
            for at in 1..=cost {
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
                let reason = match mode {
                    0 => Failure::Limit,
                    1 => Failure::Cancelled,
                    _ => Failure::Deadline,
                };
                assert_eq!(
                    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                        let profile = build(inputs, scope, MODEL_ID, b)?;
                        let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                        let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                        let caps = synthetic(scope, b);
                        let compared = compare(&p, &caps, &e, inputs, scope, b)?;
                        let arm = |b: &mut SharedBudget<'_>| {
                            if mode == 0 {
                                b.json_work = 1_000_000 - (at - 1);
                            } else {
                                b.work_audit = Some(audit.clone());
                                if mode == 1 {
                                    audit.cancel_after_work(at, cancel.clone());
                                }
                                active.set(true);
                            }
                        };
                        if phase == 0 {
                            arm(b);
                            assert_eq!(compared.into_allocation_view(b).unwrap_err(), reason);
                        } else {
                            let view = compared.into_allocation_view(b)?;
                            if phase == 1 {
                                arm(b);
                                assert_eq!(draft::create(view, scope, b).unwrap_err(), reason);
                            } else {
                                let d = draft::create(view, scope, b)?;
                                arm(b);
                                assert_eq!(d.finalize(scope, b), Err(reason));
                            }
                        }
                        assert_eq!(b.protected_bridge_claim.failure.get(), Some(reason));
                        if phase > 0 {
                            assert!(
                                b.protected_bridge_claim.allocation.get()
                                    == AllocationState::Stopped(reason)
                            );
                        }
                        let spent = b.json_work;
                        assert_eq!(b.checkpoint(), Err(reason));
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
fn allocation_draft_rejects_another_receipt_or_fresh_round_even_with_equal_cap_values() {
    let s = setup();
    let other = setup();
    for different_receipt in [false, true] {
        for finalize in [false, true] {
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            assert_eq!(
                ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                    let profile = build(inputs, scope, MODEL_ID, b)?;
                    let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                    let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                    let caps = synthetic(scope, b);
                    let view = compare(&p, &caps, &e, inputs, scope, b)?.into_allocation_view(b)?;
                    if finalize {
                        let d = draft::create(view, scope, b)?;
                        ready(
                            if different_receipt { &other } else { &s },
                            Round::Initial,
                            b,
                            |_, scope2, b| {
                                assert_eq!(d.finalize(scope2, b), Err(Failure::Binding));
                                Err::<(), _>(Failure::Binding)
                            },
                        )
                    } else {
                        ready(
                            if different_receipt { &other } else { &s },
                            Round::Initial,
                            b,
                            |_, scope2, b| {
                                assert_eq!(
                                    draft::create(view, scope2, b).unwrap_err(),
                                    Failure::Binding
                                );
                                Err::<(), _>(Failure::Binding)
                            },
                        )
                    }
                }),
                Err(Failure::Binding)
            );
        }
    }
}

#[test]
fn allocation_rechecks_shared_retry_payload_and_unstarted_state_at_each_stage() {
    for phase in 0..3 {
        for fault in 0..5 {
            let s = setup();
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let reason = match fault {
                0 => Failure::Changed,
                1 => Failure::Limit,
                _ => Failure::Binding,
            };
            assert_eq!(
                ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                    let profile = build(inputs, scope, MODEL_ID, b)?;
                    let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                    let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                    let caps = synthetic(scope, b);
                    let c = compare(&p, &caps, &e, inputs, scope, b)?;
                    let change = |b: &mut SharedBudget<'_>| match fault {
                        0 => b.retries_left -= 1,
                        1 => b.reserved = MAX_BYTES,
                        2 => b.scan_session_claim.started.set(true),
                        3 => b.protected_bridge_claim.generated.set(true),
                        _ => b.protected_bridge_claim.used.set(true),
                    };
                    if phase == 0 {
                        change(b);
                        assert_eq!(c.into_allocation_view(b).unwrap_err(), reason);
                    } else {
                        let view = c.into_allocation_view(b)?;
                        if phase == 1 {
                            change(b);
                            assert_eq!(draft::create(view, scope, b).unwrap_err(), reason);
                        } else {
                            let d = draft::create(view, scope, b)?;
                            change(b);
                            assert_eq!(d.finalize(scope, b), Err(reason));
                        }
                    }
                    assert_eq!(b.checkpoint(), Err(reason));
                    Err::<(), _>(reason)
                }),
                Err(reason)
            );
        }
    }
}

#[test]
fn allocation_draft_observes_external_stops_and_drop_never_relabels_the_first_reason() {
    for finalize in [false, true] {
        for reason in [Failure::Deadline, Failure::Cancelled, Failure::HashMismatch] {
            let s = setup();
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            assert_eq!(
                ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                    let profile = build(inputs, scope, MODEL_ID, b)?;
                    let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                    let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                    let caps = synthetic(scope, b);
                    let view = compare(&p, &caps, &e, inputs, scope, b)?.into_allocation_view(b)?;
                    let d = draft::create(view, scope, b)?;
                    b.stop::<()>(reason).unwrap_err();
                    assert_eq!(b.protected_bridge_claim.failure.get(), Some(reason));
                    assert!(
                        b.protected_bridge_claim.allocation.get()
                            == AllocationState::Stopped(reason)
                    );
                    if finalize {
                        assert_eq!(d.finalize(scope, b), Err(reason));
                    } else {
                        drop(d);
                    }
                    assert_eq!(b.protected_bridge_claim.failure.get(), Some(reason));
                    Err::<(), _>(reason)
                }),
                Err(reason)
            );
        }
    }
}

#[test]
fn allocation_types_are_move_only_not_serializable_and_have_no_completed_parts_value() {
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
    macro_rules! opaque {
        ($t:ty) => {{
            not_impl!($t, Clone);
            not_impl!($t, Copy);
            not_impl!($t, serde::Serialize);
            not_impl!($t, serde::de::DeserializeOwned);
        }};
    }
    opaque!(ScanCapAllocationView<'static>);
    opaque!(draft::ScanPartsDraft<'static>);
    assert!(
        std::mem::size_of::<crate::signature_boundary::positioned_read::ProtectedBridgeClaim>()
            <= 64
    );
}
