use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::strict::round_declaration::session::resources::draft::{self,SlotFault,LogicalSlotRef};

#[test]
fn inert_mapping_agrees_with_independent_literal_oracle_for_asymmetric_caps() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
            let mut cap = synthetic(scope, b);
            // Independent source fixture: asymmetric rounds and totals unrelated to attempt sums.
            cap.values = [
                101001, 102002, 103003, 104004, 105005, 120006, 1007, 180008, 201001, 202002,
                203003, 204004, 205005, 220006, 2007, 280008, 301001, 302002, 303003, 304004,
                305005, 320006, 3007, 380008, 401001, 402002, 403003, 404004, 405005, 420006, 4007,
                480008, 9000000, 8, 999999,
            ];
            let view = compare(&p, &cap, &e, inputs, scope, b)?.into_allocation_view(b)?;
            let d = Box::new(draft::create(view, scope, b)?); // inert owner may move before keys are borrowed
            let snapshot = d.map_snapshot();
            assert_eq!(
                snapshot.session,
                [101001, 102002, 103003, 104004, 105005, 120006, 1007, 180008]
            );
            assert_eq!(
                snapshot.rounds,
                [
                    [201001, 202002, 203003, 204004, 205005, 220006, 2007, 280008],
                    [301001, 302002, 303003, 304004, 305005, 320006, 3007, 380008],
                    [401001, 402002, 403003, 404004, 405005, 420006, 4007, 480008],
                ]
            );
            assert_eq!(
                snapshot.locals,
                [
                    [201001, 202002, 203003, 204004, 205005, 2007, 280008],
                    [301001, 302002, 303003, 304004, 305005, 3007, 380008],
                    [401001, 402002, 403003, 404004, 405005, 4007, 480008],
                ]
            );
            assert_eq!(d.unknown_count(), 5);
            for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
                let old = b.json_work;
                let key = d.logical_slot(round, scope, b)?;
                assert_eq!(b.json_work - old, 62);
                d.require_slot(&key, round, scope, b)?;
                assert_eq!(b.json_work - old, 124);
                assert_eq!(
                    format!("{key:?}"),
                    "LogicalSlotRef(borrowed_inert_not_source_or_round_token)"
                );
            }
            assert!(!b.scan_session_claim.started.get());
            assert!(!b.protected_bridge_claim.policy_evidence_issued.get());
            assert_eq!(d.finalize(scope, b), Err(Failure::Unavailable));
            Err::<(), _>(Failure::Unavailable)
        }),
        Err(Failure::Unavailable)
    );
}

#[test]
fn all_fifty_three_mapping_fields_are_checked_against_the_same_immutable_cap() {
    let faults = (0..8)
        .map(MapFault::Session)
        .chain((0..3).flat_map(|i| (0..8).map(move |k| MapFault::Round(i, k))))
        .chain((0..3).flat_map(|i| (0..7).map(move |k| MapFault::Local(i, k))))
        .chain(std::iter::once(MapFault::Model));
    for fault in faults {
        let reason = if matches!(fault, MapFault::Model) {
            Failure::Unavailable
        } else {
            Failure::Binding
        };
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let cap = synthetic(scope, b);
                let view = compare(&p, &cap, &e, inputs, scope, b)?.into_allocation_view(b)?;
                let mut d = draft::create(view, scope, b)?;
                d.corrupt_map(fault);
                assert_eq!(
                    d.logical_slot(Round::Initial, scope, b).unwrap_err(),
                    reason
                );
                assert_eq!(d.finalize(scope, b), Err(reason));
                Err::<(), _>(reason)
            }),
            Err(reason)
        );
    }
}

#[test]
fn logical_keys_refuse_swaps_wrong_round_group_nonce_and_canonical_alias() {
    let faults = [
        SlotFault::Swap(0, 1),
        SlotFault::Swap(1, 2),
        SlotFault::Swap(0, 2),
        SlotFault::Ordinal(0),
        SlotFault::Ordinal(1),
        SlotFault::Ordinal(2),
        SlotFault::Round(0),
        SlotFault::Round(1),
        SlotFault::Round(2),
        SlotFault::Group(0),
        SlotFault::Group(1),
        SlotFault::Group(2),
        SlotFault::Nonce(0),
        SlotFault::Nonce(1),
        SlotFault::Nonce(2),
        SlotFault::AliasCanonical(1),
        SlotFault::AliasCanonical(2),
        SlotFault::Model(0),
        SlotFault::Model(1),
        SlotFault::Model(2),
    ];
    for fault in faults {
        let reason = if matches!(fault, SlotFault::Model(_)) {
            Failure::Unavailable
        } else {
            Failure::Binding
        };
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let cap = synthetic(scope, b);
                let view = compare(&p, &cap, &e, inputs, scope, b)?.into_allocation_view(b)?;
                let mut d = draft::create(view, scope, b)?;
                d.corrupt_slot(fault);
                assert_eq!(
                    d.logical_slot(Round::Initial, scope, b).unwrap_err(),
                    reason
                );
                Err::<(), _>(reason)
            }),
            Err(reason)
        );
    }
}

#[test]
fn logical_key_cannot_be_used_for_a_different_ordinal() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
            let cap = synthetic(scope, b);
            let view = compare(&p, &cap, &e, inputs, scope, b)?.into_allocation_view(b)?;
            let d = draft::create(view, scope, b)?;
            let key = d.logical_slot(Round::Initial, scope, b)?;
            assert_eq!(
                d.require_slot(&key, Round::AfterM4, scope, b),
                Err(Failure::Binding)
            );
            Err::<(), _>(Failure::Binding)
        }),
        Err(Failure::Binding)
    );
}

#[test]
fn equal_cap_values_in_another_group_cannot_authorize_a_foreign_key_and_both_stop() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
            let cap = synthetic(scope, b);
            let view = compare(&p, &cap, &e, inputs, scope, b)?.into_allocation_view(b)?;
            let d = draft::create(view, scope, b)?;
            let key = d.logical_slot(Round::Initial, scope, b)?;
            let mut b2 = SharedBudget::new(b.started, &cancel);
            assert_eq!(
                ready(&s, Round::Initial, &mut b2, |inputs2, scope2, b2| {
                    let profile2 = build(inputs2, scope2, MODEL_ID, b2)?;
                    let e2 = calculate(profile2, inputs2, scope2, CALCULATOR_ID, b2)?;
                    let p2 = project(&e2, inputs2, scope2, PROJECTION_ID, b2)?;
                    let cap2 = synthetic(scope2, b2);
                    let view2 =
                        compare(&p2, &cap2, &e2, inputs2, scope2, b2)?.into_allocation_view(b2)?;
                    let d2 = draft::create(view2, scope2, b2)?;
                    assert_eq!(
                        d2.require_slot(&key, Round::Initial, scope2, b2),
                        Err(Failure::Binding)
                    );
                    Err::<(), _>(Failure::Binding)
                }),
                Err(Failure::Binding)
            );
            assert_eq!(b.checkpoint(), Err(Failure::Binding));
            Err::<(), _>(Failure::Binding)
        }),
        Err(Failure::Binding)
    );
}

#[test]
fn logical_key_type_is_not_clone_copy_or_serializable() {
    macro_rules! check {
        ($bound:path) => {{
            trait Ambiguous<A> {
                fn check() {}
            }
            impl<T: ?Sized> Ambiguous<()> for T {}
            impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
            let _ = <LogicalSlotRef<'static> as Ambiguous<_>>::check;
        }};
    }
    check!(Clone);
    check!(Copy);
    check!(serde::Serialize);
    check!(serde::de::DeserializeOwned);
    macro_rules! map_check {
        ($bound:path) => {{
            trait Ambiguous<A> {
                fn check() {}
            }
            impl<T: ?Sized> Ambiguous<()> for T {}
            impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
            let _ = <DraftCapMap<'static> as Ambiguous<_>>::check;
        }};
    }
    map_check!(Clone);
    map_check!(Copy);
    map_check!(serde::Serialize);
    map_check!(serde::de::DeserializeOwned);
}

#[test]
fn mapping_rejects_an_equal_value_cap_from_another_object() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
            let cap = synthetic(scope, b);
            let cap2 = synthetic(scope, b);
            let view = compare(&p, &cap, &e, inputs, scope, b)?.into_allocation_view(b)?;
            let mapping = view.inert_mapping(scope, b)?;
            let mut other = view.duplicate_fixture();
            other.replace_cap_fixture(&cap2);
            assert_eq!(mapping.require(&other, scope, b), Err(Failure::Binding));
            Err::<(), _>(Failure::Binding)
        }),
        Err(Failure::Binding)
    );
}

#[test]
fn logical_slot_access_and_validation_stop_at_every_work_boundary() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for validate in [false, true] {
        for mode in 0..3 {
            for at in 1..=62 {
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
                        let cap = synthetic(scope, b);
                        let view =
                            compare(&p, &cap, &e, inputs, scope, b)?.into_allocation_view(b)?;
                        let d = draft::create(view, scope, b)?;
                        let key = if validate {
                            Some(d.logical_slot(Round::Initial, scope, b)?)
                        } else {
                            None
                        };
                        if mode == 0 {
                            b.json_work = 1_000_000 - (at - 1);
                        } else {
                            b.work_audit = Some(audit.clone());
                            if mode == 1 {
                                audit.cancel_after_work(at, cancel.clone());
                            }
                            active.set(true);
                        }
                        if let Some(key) = key {
                            assert_eq!(d.require_slot(&key, Round::Initial, scope, b), Err(reason));
                        } else {
                            assert_eq!(
                                d.logical_slot(Round::Initial, scope, b).unwrap_err(),
                                reason
                            );
                        }
                        assert_eq!(b.protected_bridge_claim.failure.get(), Some(reason));
                        Err::<(), _>(reason)
                    }),
                    Err(reason)
                );
            }
        }
    }
}
