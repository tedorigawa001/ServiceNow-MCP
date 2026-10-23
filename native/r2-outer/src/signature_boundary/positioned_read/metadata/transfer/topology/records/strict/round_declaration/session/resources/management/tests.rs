use super::*;
use crate::signature_boundary::positioned_read::work_audit::Audit;
use std::{sync::atomic::AtomicBool, time::Duration};

fn r(id: u8, bytes: u64) -> Request {
    Request {
        id,
        bytes,
        alignment: 8,
        class: Class::Control,
    }
}
fn numbers(v: &SyntheticEstimate) -> [u64; 7] {
    let (d, carry, live, blocks) = match v {
        SyntheticEstimate::Closed(v) => (&v.demand, v.carry_in, 0, 0),
        SyntheticEstimate::Carry(v) => (&v.demand, v.carry_in, v.live, v.blocks),
    };
    [
        d.attempts,
        d.cumulative,
        d.peak,
        d.maximum,
        carry,
        live,
        blocks,
    ]
}
fn run(carry: &[Request], events: &[Event], end: End) -> Result<([u64; 7], u64), Failure> {
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    let estimate = Attempt::new(&b).run(carry, events, end, MODEL, &mut b)?;
    Ok((numbers(&estimate), b.json_work))
}
fn grow_trace() -> [Event; 7] {
    [
        Event::Reserve(r(1, 8)),
        Event::Commit(1),
        Event::Grow {
            old: 1,
            new: r(2, 13),
        },
        Event::Commit(2),
        Event::ReleaseConfirmed(1),
        Event::Advance(Phase::BX),
        Event::ReleaseConfirmed(2),
    ]
}
fn handoff() -> [Event; 5] {
    [
        Event::Advance(Phase::B1),
        Event::Advance(Phase::B2),
        Event::Advance(Phase::B3),
        Event::Advance(Phase::B4),
        Event::Advance(Phase::S0),
    ]
}

#[test]
fn independent_literal_oracle_distinguishes_overlap_sequential_grow_and_failed_requests() {
    // Literal expectations: no production shape/offset/aggregation/work helpers in the oracle.
    assert_eq!(
        run(&[], &grow_trace(), End::Closed),
        Ok(([2, 21, 21, 13, 0, 0, 0], 162))
    );
    let sequential = [
        Event::Reserve(r(1, 8)),
        Event::Commit(1),
        Event::ReleaseConfirmed(1),
        Event::Reserve(r(2, 13)),
        Event::Commit(2),
        Event::Advance(Phase::BX),
        Event::ReleaseConfirmed(2),
    ];
    assert_eq!(
        run(&[], &sequential, End::Closed).unwrap().0,
        [2, 21, 13, 13, 0, 0, 0]
    );
    let failed_grow = [
        Event::Grow {
            old: 1,
            new: r(2, 13),
        },
        Event::FailNoBlock(2),
        Event::Borrow(1),
        Event::CloneRef(1),
        Event::Move {
            id: 1,
            to: Class::Profile,
        },
        Event::Advance(Phase::BX),
        Event::ReleaseConfirmed(1),
    ];
    assert_eq!(
        run(&[r(1, 8)], &failed_grow, End::Closed).unwrap().0,
        [1, 13, 21, 13, 8, 0, 0]
    );
    let failed = [
        Event::Reserve(r(1, 13)),
        Event::FailNoBlock(1),
        Event::Advance(Phase::BX),
    ];
    assert_eq!(
        run(&[], &failed, End::Closed).unwrap().0,
        [1, 13, 13, 13, 0, 0, 0]
    );
    assert_eq!(
        run(&[], &[Event::Advance(Phase::BX)], End::Closed),
        Ok(([0; 7], 136))
    );
}

#[test]
fn independent_carry_oracle_counts_initial_ownership_only_in_peak_and_preserves_partial_type() {
    let mut events = vec![Event::Reserve(r(2, 13)), Event::Commit(2)];
    events.extend(handoff());
    assert_eq!(
        run(&[r(1, 8)], &events, End::CarryOut),
        Ok(([1, 13, 21, 13, 8, 21, 2], 160))
    );
    assert_eq!(run(&[r(1, 8)], &events, End::Closed), Err(Failure::Binding));
    assert_eq!(
        run(&[], &[Event::Advance(Phase::BX)], End::CarryOut),
        Err(Failure::Binding)
    );
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    let value = Attempt::new(&b)
        .run(&[], &handoff(), End::CarryOut, MODEL, &mut b)
        .unwrap();
    assert!(matches!(value, SyntheticEstimate::Carry(_)));
    assert_eq!(
        format!("{value:?}"),
        "SyntheticManagementEstimate(not_requirement_parts_cleanup_or_permit)"
    );
}

#[test]
fn invalid_ids_layouts_and_retired_identity_reuse_are_rejected() {
    for id in [0, 65, 255] {
        assert_eq!(
            run(&[], &[Event::Reserve(r(id, 1))], End::Closed),
            Err(Failure::Limit)
        );
    }
    for bytes in [0, MAX_REQUEST + 1, u64::MAX] {
        assert_eq!(
            run(&[], &[Event::Reserve(r(1, bytes))], End::Closed),
            Err(Failure::Limit)
        );
    }
    for alignment in [0, 3, 8192, u32::MAX] {
        let request = Request {
            alignment,
            ..r(1, 1)
        };
        assert_eq!(run(&[request], &[], End::CarryOut), Err(Failure::Limit));
    }
    let duplicate = [
        Event::Reserve(r(1, 8)),
        Event::FailNoBlock(1),
        Event::Reserve(r(1, 8)),
    ];
    assert_eq!(run(&[], &duplicate, End::Closed), Err(Failure::Binding));
    assert_eq!(
        run(&[r(1, 8), r(1, 8)], &[], End::Closed),
        Err(Failure::Binding)
    );
    for event in [
        Event::Commit(1),
        Event::FailNoBlock(1),
        Event::ReleaseConfirmed(1),
        Event::Borrow(1),
        Event::CloneRef(1),
        Event::Move {
            id: 1,
            to: Class::Collector,
        },
    ] {
        assert_eq!(run(&[], &[event], End::Closed), Err(Failure::Binding));
    }
    assert_eq!(
        run(
            &[r(1, 8)],
            &[Event::ReleaseConfirmed(1), Event::ReleaseConfirmed(1)],
            End::Closed
        ),
        Err(Failure::Binding)
    );
}

#[test]
fn phase_skip_reverse_resume_and_incomplete_end_never_look_closed() {
    for next in [Phase::B0, Phase::B2, Phase::B3, Phase::B4, Phase::S0] {
        assert_eq!(
            run(&[], &[Event::Advance(next)], End::Closed),
            Err(Failure::Binding)
        );
    }
    for event in [
        Event::Advance(Phase::B0),
        Event::Reserve(r(1, 8)),
        Event::Grow {
            old: 1,
            new: r(2, 13),
        },
    ] {
        assert_eq!(
            run(&[r(1, 8)], &[Event::Advance(Phase::BX), event], End::Closed),
            Err(Failure::Binding)
        );
    }
    let mut events = handoff().to_vec();
    events.push(Event::Advance(Phase::BX));
    assert_eq!(run(&[], &events, End::CarryOut), Err(Failure::Binding));
    assert_eq!(run(&[], &[], End::Closed), Err(Failure::Binding));
    assert_eq!(
        run(&[r(1, 8)], &[Event::Advance(Phase::BX)], End::Closed),
        Err(Failure::Binding)
    );
    let mut pending = vec![Event::Reserve(r(1, 8))];
    pending.extend(handoff());
    assert_eq!(run(&[], &pending, End::CarryOut), Err(Failure::Binding));
}

#[test]
fn grow_links_keep_old_alive_and_delayed_results_in_bx_are_accounted() {
    let grow = Event::Grow {
        old: 1,
        new: r(2, 13),
    };
    for event in [
        Event::ReleaseConfirmed(1),
        Event::Grow {
            old: 1,
            new: r(3, 17),
        },
    ] {
        assert_eq!(
            run(&[r(1, 8)], &[grow, event], End::Closed),
            Err(Failure::Binding)
        );
    }
    for request in [
        r(1, 13),
        r(2, 8),
        Request {
            class: Class::Profile,
            ..r(2, 13)
        },
        Request {
            alignment: 16,
            ..r(2, 13)
        },
    ] {
        assert_eq!(
            run(
                &[r(1, 8)],
                &[Event::Grow {
                    old: 1,
                    new: request
                }],
                End::Closed
            ),
            Err(Failure::Binding)
        );
    }
    for completion in [Event::Commit(2), Event::FailNoBlock(2)] {
        let mut events = vec![
            grow,
            Event::Advance(Phase::BX),
            completion,
            Event::ReleaseConfirmed(1),
        ];
        if matches!(completion, Event::Commit(_)) {
            events.push(Event::ReleaseConfirmed(2));
        }
        assert_eq!(
            run(&[r(1, 8)], &events, End::Closed).unwrap().0,
            [1, 13, 21, 13, 8, 0, 0]
        );
    }
}

#[test]
fn every_structure_limit_is_enforced_before_iteration_and_exact_limits_are_accepted() {
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    let too_many = vec![Event::Borrow(1); 513];
    assert_eq!(
        Attempt::new(&b)
            .run(&[], &too_many, End::Closed, MODEL, &mut b)
            .unwrap_err(),
        Failure::Limit
    );
    assert_eq!(b.json_work, 3); // no scratch precharge or event iteration
    assert_eq!(
        run(&vec![r(1, 1); 65], &[], End::Closed),
        Err(Failure::Limit)
    );
    let carry: Vec<_> = (1..=64).map(|id| r(id, 1)).collect();
    let mut events = vec![Event::Borrow(64); 507];
    events.extend(handoff());
    assert_eq!(
        run(&carry, &events, End::CarryOut).unwrap().0,
        [0, 0, 64, 0, 64, 64, 64]
    );
    // One full 16 MiB request and 4096 alignment are synthetic-domain bounds, not a cap approval.
    let q = Request {
        alignment: 4096,
        ..r(1, MAX_REQUEST)
    };
    let events = [
        Event::Reserve(q),
        Event::Commit(1),
        Event::Advance(Phase::BX),
        Event::ReleaseConfirmed(1),
    ];
    assert_eq!(
        run(&[], &events, End::Closed).unwrap().0,
        [1, MAX_REQUEST, MAX_REQUEST, MAX_REQUEST, 0, 0, 0]
    );
}

#[test]
fn live_and_cumulative_limits_are_independent_and_do_not_refund_failed_attempts() {
    let carry: Vec<_> = (1..=8).map(|id| r(id, MAX_REQUEST)).collect();
    assert_eq!(
        run(&carry, &handoff(), End::CarryOut).unwrap().0,
        [0, 0, 134217728, 0, 134217728, 134217728, 8]
    );
    assert_eq!(
        run(&carry, &[Event::Reserve(r(9, 1))], End::Closed),
        Err(Failure::Limit)
    );
    let mut events = Vec::new();
    for id in 1..=16 {
        events.extend([Event::Reserve(r(id, MAX_REQUEST)), Event::FailNoBlock(id)]);
    }
    let mut closed = events.clone();
    closed.push(Event::Advance(Phase::BX));
    assert_eq!(
        run(&[], &closed, End::Closed).unwrap().0,
        [16, 268435456, 16777216, 16777216, 0, 0, 0]
    );
    events.push(Event::Reserve(r(17, 1)));
    assert_eq!(run(&[], &events, End::Closed), Err(Failure::Limit));
    assert_eq!(add(u64::MAX, 1), Err(Failure::Limit));
    assert_eq!(sub(0, 1), Err(Failure::Binding));
}

#[test]
fn attempt_is_bound_to_original_budget_and_spent_before_failure_with_no_authority_side_effects() {
    let c = AtomicBool::new(false);
    let start = Instant::now();
    let mut b = SharedBudget::new(start, &c);
    let mut a = Attempt::new(&b);
    let before = (
        b.used,
        b.reserved,
        b.retries_left,
        b.metadata_calls,
        b.topology_calls,
    );
    let value = a
        .run(&[], &grow_trace(), End::Closed, MODEL, &mut b)
        .unwrap();
    assert_eq!(numbers(&value), [2, 21, 21, 13, 0, 0, 0]);
    assert_eq!(
        before,
        (
            b.used,
            b.reserved,
            b.retries_left,
            b.metadata_calls,
            b.topology_calls
        )
    );
    assert!(!b.scan_session_claim.started.get());
    assert!(!b.protected_bridge_claim.generated.get());
    assert!(!b.protected_bridge_claim.policy_evidence_issued.get());
    assert!(
        b.protected_bridge_claim.allocation.get()
            == crate::signature_boundary::positioned_read::allocation_claim::State::Fresh
    );
    assert_eq!(
        a.run(&[], &[], End::Closed, MODEL, &mut b).unwrap_err(),
        Failure::Binding
    );
    let mut b = SharedBudget::new(start, &c);
    let mut a = Attempt::new(&b);
    let mut foreign = SharedBudget::new(start, &c);
    assert_eq!(
        a.run(&[], &[], End::Closed, MODEL, &mut foreign)
            .unwrap_err(),
        Failure::Binding
    );
    assert_eq!(
        a.run(&[], &[], End::Closed, MODEL, &mut b).unwrap_err(),
        Failure::Binding
    );
    // A local calculator is not authority and does not stop a foreign original budget by proxy.
    let mut b = SharedBudget::new(start, &c);
    let mut a = Attempt::new(&b);
    assert_eq!(
        a.run(&[], &[], End::Closed, "unknown", &mut b).unwrap_err(),
        Failure::Unavailable
    );
    assert_eq!(
        a.run(&[], &[], End::Closed, MODEL, &mut b).unwrap_err(),
        Failure::Unavailable
    );
}

#[test]
fn unconfirmed_release_and_external_stops_keep_first_reason_and_never_resume() {
    let c = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &c);
    let mut a = Attempt::new(&b);
    assert_eq!(
        a.run(
            &[r(1, 8)],
            &[Event::ReleaseUnconfirmed(1)],
            End::Closed,
            MODEL,
            &mut b
        )
        .unwrap_err(),
        Failure::Unavailable
    );
    assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
    assert_eq!(
        a.run(&[], &[], End::Closed, MODEL, &mut b).unwrap_err(),
        Failure::Unavailable
    );
    for e in [
        Failure::Changed,
        Failure::HashMismatch,
        Failure::Cancelled,
        Failure::Deadline,
    ] {
        let mut b = SharedBudget::new(Instant::now(), &c);
        let mut a = Attempt::new(&b);
        b.stop::<()>(e).unwrap_err();
        assert_eq!(a.run(&[], &[], End::Closed, MODEL, &mut b).unwrap_err(), e);
        assert!(a.used);
        assert_eq!(b.json_work, 0);
    }
}

#[test]
fn all_work_units_stop_on_limit_cancellation_deadline_and_latch_attempt() {
    // Independent literal costs; no production work_upper helper in this oracle.
    let mut carry_events = vec![Event::Reserve(r(2, 13)), Event::Commit(2)];
    carry_events.extend(handoff());
    let traces = [
        (vec![], grow_trace().to_vec(), End::Closed, 162),
        (vec![r(1, 8)], carry_events, End::CarryOut, 160),
        (
            vec![],
            vec![
                Event::Reserve(r(1, 13)),
                Event::FailNoBlock(1),
                Event::Advance(Phase::BX),
            ],
            End::Closed,
            144,
        ),
    ];
    for (carry, events, end, cost) in traces {
        assert_eq!(run(&carry, &events, end).unwrap().1, cost);
        for mode in 0..3 {
            for at in 1..=cost {
                let cancel = Rc::new(AtomicBool::new(false));
                let audit = Audit::default();
                let start = Instant::now();
                let clock = || {
                    if mode == 2 && audit.counts().iter().sum::<u64>() >= at {
                        start + Duration::from_secs(10)
                    } else {
                        start
                    }
                };
                let mut b = SharedBudget::new(start, &cancel);
                b.now = &clock;
                b.work_audit = Some(audit.clone());
                if mode == 0 {
                    b.json_work = 1_000_000 - (at - 1);
                }
                if mode == 1 {
                    audit.cancel_after_work(at, cancel.clone());
                }
                let reason = [Failure::Limit, Failure::Cancelled, Failure::Deadline][mode];
                let mut attempt = Attempt::new(&b);
                assert_eq!(
                    attempt
                        .run(&carry, &events, end, MODEL, &mut b)
                        .unwrap_err(),
                    reason
                );
                assert!(attempt.used);
                let spent = b.json_work;
                assert_eq!(
                    attempt
                        .run(&[], &[], End::Closed, MODEL, &mut b)
                        .unwrap_err(),
                    reason
                );
                assert_eq!(b.json_work, spent);
            }
        }
    }
}

#[test]
fn scratch_and_results_are_fixed_opaque_and_not_clone_copy_or_serde() {
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
    opaque!(SyntheticEstimate);
    opaque!(ClosedSyntheticTrace);
    opaque!(SyntheticCarryOut);
    opaque!(Attempt);
    assert!(std::mem::size_of::<[Slot; 64]>() <= 4096);
    assert!(std::mem::size_of::<Attempt>() <= 64);
}

#[test]
fn checked_work_bound_covers_all_accepted_phase_and_operation_prefixes() {
    assert_eq!(work_upper(0, 0), Ok(133));
    assert_eq!(work_upper(64, 512), Ok(2949));
    assert_eq!(work_upper(65, 0), Err(Failure::Limit));
    assert_eq!(work_upper(0, 513), Err(Failure::Limit));
    assert_eq!(work_upper(usize::MAX, usize::MAX), Err(Failure::Limit));
    // Test-side matrix, deliberately no production bound helper.
    for class in [
        Class::Control,
        Class::Declaration,
        Class::Profile,
        Class::Collector,
    ] {
        let carry = [Request { class, ..r(1, 8) }];
        for fail in [false, true] {
            let mut e = vec![
                Event::Advance(Phase::B1),
                Event::Borrow(1),
                Event::CloneRef(1),
                Event::Move { id: 1, to: class },
                Event::Grow {
                    old: 1,
                    new: Request { class, ..r(2, 13) },
                },
                if fail {
                    Event::FailNoBlock(2)
                } else {
                    Event::Commit(2)
                },
                Event::Advance(Phase::BX),
                Event::ReleaseConfirmed(1),
            ];
            if !fail {
                e.push(Event::ReleaseConfirmed(2));
            }
            let (_, work) = run(&carry, &e, End::Closed).unwrap();
            assert!(work <= 133 + 4 + 5 * e.len() as u64);
        }
    }
}
