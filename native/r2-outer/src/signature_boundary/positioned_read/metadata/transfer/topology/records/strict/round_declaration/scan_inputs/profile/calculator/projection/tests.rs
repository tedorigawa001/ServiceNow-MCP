use super::super::super::super::tests::setup;
use super::super::super::tests::{augmented, ready};
use super::*;
use std::{cell::Cell, time::Duration};

#[test]
fn protected_resource_projection_reuses_exact_estimate_without_decode_or_profile_rebuild() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
        let profile = build(inputs, scope, MODEL_ID, b)?;
        let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
        let old = b.json_work;
        let before = (
            b.used,
            b.reserved,
            b.retries_left,
            b.metadata_calls,
            b.topology_calls,
        );
        {
            let p = project(&estimate, inputs, scope, PROJECTION_ID, b)?;
            assert_eq!(b.json_work - old, 18);
            assert!(std::ptr::eq(p.estimate, &estimate));
            let q = &p.quantities;
            // Independent hand-counted base fixture; includes the virtual index and empty file.
            assert_eq!(q.base, [63, 14, 6, 657, 136]);
            assert_eq!(q.round, [63, 15, 15, 657, 136]);
            assert_eq!(q.three, [189, 43, 27, 1971, 408]);
            assert_eq!((q.round_total, q.three_total, q.snapshots), (885, 2637, 73));
            assert_eq!(
                (q.xattr_round, q.xattr_three, q.enum_buffer_three),
                (67048, 70114, 10965)
            );
            assert_eq!(
                q.payload_three,
                3 * (4100 + s.receipt.pins[2].bytes.len() as u64)
            );
            assert_eq!((q.retries, q.peak_owners), (8, 5));
            assert_eq!(
                format!("{p:?}"),
                "ScanResourceRequirements(borrowed_same_estimate_not_full_policy)"
            );
        }
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
        assert!(inputs.profile_started.get() && scope.decode_started.get());
        // Same estimate is still movable after its projection borrow ends.
        estimate.consume_for_collector(inputs, scope, b)?;
        assert!(!b.scan_session_claim.started.get());
        Ok(())
    })
    .unwrap();
}

#[test]
fn projection_claim_is_one_shot_even_after_drop_and_failure() {
    for unknown in [false, true] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = if unknown {
            Failure::Unavailable
        } else {
            Failure::Binding
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                if unknown {
                    assert_eq!(
                        project(&e, inputs, scope, "unknown", b).unwrap_err(),
                        expected
                    );
                } else {
                    let _projection = project(&e, inputs, scope, PROJECTION_ID, b)?;
                }
                assert_eq!(
                    project(&e, inputs, scope, PROJECTION_ID, b).unwrap_err(),
                    expected
                );
                assert!(e.resource_projected.get());
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn projection_rejects_model_retry_noninitial_scope_and_foreign_budget() {
    for fault in 0..6 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let round = if fault == 5 {
            Round::BeforeM4
        } else {
            Round::Initial
        };
        let expected = match fault {
            0 | 1 => Failure::Unavailable,
            2 => Failure::Changed,
            _ => Failure::Binding,
        };
        assert_eq!(
            ready(&s, round, &mut b, |inputs, scope, b| {
                let p = build(inputs, scope, MODEL_ID, b)?;
                let mut e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
                match fault {
                    0 => e.calculator_model = "unknown",
                    1 => e.kernel_model = "old",
                    2 => b.retries_left -= 1,
                    3 => b.started += Duration::from_nanos(1),
                    _ => (),
                }
                if fault == 4 {
                    let mut other = SharedBudget::new(b.started, &cancel);
                    assert_eq!(
                        project(&e, inputs, scope, PROJECTION_ID, &mut other).unwrap_err(),
                        expected
                    );
                    assert_eq!(other.checkpoint(), Err(expected));
                    assert_eq!(b.checkpoint(), Err(expected));
                } else {
                    assert_eq!(
                        project(&e, inputs, scope, PROJECTION_ID, b).unwrap_err(),
                        expected
                    );
                }
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn projection_every_work_limit_cancel_and_deadline_boundary_stops_sticky() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for mode in 0..3 {
        for at in 1..=18 {
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
                    let p = build(inputs, scope, MODEL_ID, b)?;
                    let e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
                    if mode == 0 {
                        b.json_work = 1_000_000 - (at - 1);
                    } else {
                        b.work_audit = Some(audit.clone());
                        if mode == 1 {
                            audit.cancel_after_work(at, cancel.clone());
                        }
                        active.set(true);
                    }
                    assert_eq!(
                        project(&e, inputs, scope, PROJECTION_ID, b).unwrap_err(),
                        reason
                    );
                    assert!(e.resource_projected.get());
                    let cost = b.json_work;
                    assert_eq!(
                        project(&e, inputs, scope, PROJECTION_ID, b).unwrap_err(),
                        reason
                    );
                    assert_eq!(b.json_work, cost);
                    Err::<(), _>(reason)
                }),
                Err(reason)
            );
        }
    }
}

#[test]
fn projection_resources_follow_wide_deep_empty_and_chunk_boundaries() {
    for (width, depth, size) in [
        (0, 0, 0),
        (12, 8, 65537),
        (64, 0, 1),
        (1, 0, 512 * 1024 * 1024),
    ] {
        let s = augmented(width, depth, "index.json", size);
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
            let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
            let entries = inputs.entries().collect::<Vec<_>>();
            let files = entries
                .iter()
                .filter(|e| matches!(e, closure::Entry::File { .. }))
                .count() as u64;
            let bytes = entries
                .iter()
                .map(|e| {
                    if let closure::Entry::File { size, .. } = e {
                        *size
                    } else {
                        0
                    }
                })
                .sum::<u64>();
            let chunks = entries
                .iter()
                .map(|e| {
                    if let closure::Entry::File { size, .. } = e {
                        size.div_ceil(65536)
                    } else {
                        0
                    }
                })
                .sum::<u64>();
            assert_eq!(p.quantities.payload_three, 3 * (bytes + files));
            assert_eq!(p.quantities.base[2], chunks + files);
            assert_eq!(p.quantities.retries, b.retries_left);
            Ok(())
        })
        .unwrap();
    }
}

#[test]
fn projection_cannot_be_rebound_to_another_estimate_receipt_or_round() {
    for change in 0..3 {
        let s = setup();
        let other = augmented(1, 0, "index.json", 1);
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                // Separate fixture round only: production projection performs no new decode.
                ready(
                    if change == 1 { &other } else { &s },
                    Round::Initial,
                    b,
                    |inputs2, scope2, b| {
                        let profile2 = build(inputs2, scope2, MODEL_ID, b)?;
                        let e2 = calculate(profile2, inputs2, scope2, CALCULATOR_ID, b)?;
                        let result = if change == 0 {
                            p.require(&e2, inputs2, scope2, b)
                        } else {
                            p.require(&e, inputs2, scope2, b)
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
fn projection_types_are_opaque_move_only_and_not_serializable() {
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
    macro_rules! check {
        ($t:ty) => {{
            not_impl!($t, Clone);
            not_impl!($t, Copy);
            not_impl!($t, serde::Serialize);
            not_impl!($t, serde::de::DeserializeOwned);
        }};
    }
    check!(ScanResourceRequirements<'static, 'static, 'static, 'static, 'static, 'static>);
    check!(caps::ScanResourceCaps);
    check!(caps::ScanCapsCompared<'static>);
}

#[test]
fn projection_refuses_started_session_used_bridge_and_same_origin_foreign_claim() {
    for fault in 0..4 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let p = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(p, inputs, scope, CALCULATOR_ID, b)?;
                match fault {
                    0 => b.scan_session_claim.started.set(true),
                    1 => b.protected_bridge_claim.generated.set(true),
                    2 => b.protected_bridge_claim.used.set(true),
                    _ => (),
                }
                if fault == 3 {
                    let mut other = SharedBudget::new(b.started, &cancel);
                    other.inspection_origin = b.inspection_origin.clone();
                    assert_eq!(
                        project(&e, inputs, scope, PROJECTION_ID, &mut other).unwrap_err(),
                        Failure::Binding
                    );
                    assert_eq!(other.checkpoint(), Err(Failure::Binding));
                } else {
                    assert_eq!(
                        project(&e, inputs, scope, PROJECTION_ID, b).unwrap_err(),
                        Failure::Binding
                    );
                }
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}
