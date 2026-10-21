use super::super::super::tests::setup;
use super::super::tests::augmented;
use super::super::tests::ready;
use super::*;
use std::{cell::Cell, time::Duration};

fn oracle(s: &Shape, rounds: u128) -> ([u64; 8], u64, u64, u64, u64) {
    // Separate wide arithmetic, no runtime arithmetic helper or estimate input.
    let (n, e, d, f, t, h, k, p, kv, c0, cv, cmax, j, c, cv_chunks, r) = (
        s.n as u128,
        s.e as u128,
        s.d as u128,
        s.f as u128,
        s.t as u128,
        s.h as u128,
        s.k as u128,
        s.p as u128,
        s.kv as u128,
        s.c0 as u128,
        s.cv as u128,
        s.cmax as u128,
        s.j as u128,
        s.c as u128,
        s.cv_chunks as u128,
        s.r as u128,
    );
    let ell = |x: u128| {
        if x == 0 {
            0
        } else {
            128 - x.leading_zeros() as u128
        }
    };
    let components = [
        8 + 4 * e + 4 * t + p.min(e - c0) * ell(n) + ell(cv) + cv,
        h + 2 + e * (h + 3) + k + kv + p * ell(n),
        (2 * e + 3) + 23 * ((2 * e + 3) * (h + 1) + 2 * k),
        32 * e + 58 * t + j,
        56 * f + 5 * c,
        38 + 4 * e + d,
        11 + 2 * cv_chunks + 4 * e + p,
        16 + ell(cmax) + 3 * (r + 1),
    ];
    let total: u128 = components.iter().sum();
    let base = total - 3 * (r + 1);
    (
        components.map(|v| u64::try_from(v).unwrap()),
        total.try_into().unwrap(),
        base.try_into().unwrap(),
        (rounds * base + 3 * r + 3).try_into().unwrap(),
        (11 + 2 * n + 5 * e + k + (e - c0) * (ell(n) + 1) + d)
            .try_into()
            .unwrap(),
    )
}

#[test]
fn consumed_profile_produces_basic_estimate_in_twenty_work() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
        let profile = build(inputs, scope, MODEL_ID, b)?;
        let old = b.json_work;
        let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
        assert_eq!(b.json_work - old, 20);
        assert_eq!(estimate.components, [51, 47, 1278, 342, 183, 60, 36, 45]);
        assert_eq!(
            (
                estimate.total,
                estimate.base,
                estimate.remaining_scans,
                estimate.profile_upper
            ),
            (2042, 2015, 6072, 62)
        );
        assert!(std::ptr::eq(estimate.profile.inputs, inputs));
        Ok(())
    })
    .unwrap();
}

#[test]
fn estimates_match_wide_oracle_for_shapes_rounds_and_shared_retry_remainders() {
    for (width, depth, index, size) in [
        (0, 0, "index.json", 0),
        (1, 0, "-index", 0),
        (7, 8, "zz-index", 65537),
        (128, 0, "index.json", 1),
        (0, 63, "index.json", 0),
        (2, 0, "dist/index.json", 65536),
        (1, 0, "index.json", 512 * 1024 * 1024),
    ] {
        let s = augmented(width, depth, index, size);
        for (round, n) in [
            (Round::Initial, 3),
            (Round::BeforeM4, 2),
            (Round::AfterM4, 1),
        ] {
            for retries in 0..=8 {
                let cancel = AtomicBool::new(false);
                let mut b = SharedBudget::new(Instant::now(), &cancel);
                b.retries_left = retries;
                ready(&s, round, &mut b, |inputs, scope, b| {
                    let profile = build(inputs, scope, MODEL_ID, b)?;
                    let expected = oracle(&profile.shape, n);
                    let resources = (b.used, b.reserved, b.retries_left, b.started);
                    let old = b.json_work;
                    let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                    assert_eq!(
                        (
                            estimate.components,
                            estimate.total,
                            estimate.base,
                            estimate.remaining_scans,
                            estimate.profile_upper
                        ),
                        expected
                    );
                    assert_eq!(b.json_work - old, 20);
                    assert_eq!((b.used, b.reserved, b.retries_left, b.started), resources);
                    assert_eq!(
                        (estimate.calculator_model, estimate.kernel_model),
                        (CALCULATOR_ID, KERNEL_ID)
                    );
                    assert_eq!(
                        format!("{estimate:?}"),
                        "ScanWorkEstimate(round_budget_only_not_admission_authority)"
                    );
                    Ok(())
                })
                .unwrap();
            }
        }
    }
}

#[test]
fn checked_scalar_formulae_reject_overflow_and_underflow_without_saturation() {
    let max = u64::MAX;
    assert_eq!(add(max, 1), Err(Failure::Limit));
    assert_eq!(mul(max, 2), Err(Failure::Limit));
    assert_eq!(sub(0, 1), Err(Failure::Limit));
    assert_eq!(
        (add(max, 0), mul(max, 1), sub(max, max)),
        (Ok(max), Ok(max), Ok(0))
    );
    for (n, want) in [
        (0, 0),
        (1, 1),
        (2, 2),
        (3, 2),
        (4, 3),
        (7, 3),
        (8, 4),
        (max, 64),
    ] {
        assert_eq!(arithmetic::ell(n), want);
    }
    let mut s = Shape {
        e: max,
        t: max,
        h: max,
        k: max,
        p: max,
        kv: max,
        f: max,
        c: max,
        d: max,
        cv: max,
        cv_chunks: max,
        n: max,
        ..Shape::default()
    };
    assert_eq!(arithmetic::groups(&s, max, 64, 64), Err(Failure::Limit));
    assert_eq!(arithmetic::route(&s, 64), Err(Failure::Limit));
    assert_eq!(arithmetic::walk_shape(&s), Err(Failure::Limit));
    assert_eq!(arithmetic::walk(0, max), Err(Failure::Limit));
    assert_eq!(arithmetic::enumeration(&s), Err(Failure::Limit));
    assert_eq!(arithmetic::file(&s), Err(Failure::Limit));
    assert_eq!(arithmetic::control(&s), Err(Failure::Limit));
    assert_eq!(arithmetic::seal(&s), Err(Failure::Limit));
    assert_eq!(arithmetic::tail(0, max), Err(Failure::Limit));
    assert_eq!(arithmetic::tail(max, 0), Err(Failure::Limit));
    assert_eq!(
        arithmetic::total([max, 1, 0, 0, 0, 0, 0, 0]),
        Err(Failure::Limit)
    );
    assert_eq!(arithmetic::remaining(3, max, 0), Err(Failure::Limit));
    assert_eq!(arithmetic::remaining(0, 0, max), Err(Failure::Limit));
    assert_eq!(arithmetic::profile_upper(&s, max, 64), Err(Failure::Limit));
    s.n = 0;
    s.e = 0;
    s.k = 0;
    assert_eq!(arithmetic::profile_upper(&s, max, 64), Err(Failure::Limit));
}

#[test]
fn binding_and_model_failures_consume_the_profile_and_latch_the_first_reason() {
    for case in 0..10 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = match case {
            2 | 3 => Failure::Changed,
            4 | 5 => Failure::Unavailable,
            _ => Failure::Binding,
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let mut profile = build(inputs, scope, MODEL_ID, b)?;
                let other = setup();
                let copied_scope = RoundScope {
                    receipt: if case == 9 {
                        &other.receipt
                    } else {
                        scope.receipt
                    },
                    target: scope.target,
                    context: scope.context,
                    round: if case == 8 {
                        Round::BeforeM4
                    } else {
                        scope.round
                    },
                    token: if case == 7 {
                        Rc::new(())
                    } else {
                        scope.token.clone()
                    },
                    decode_started: Cell::new(true),
                    budget_origin: scope.budget_origin.clone(),
                    hash: scope.hash.clone(),
                    index_path: scope.index_path.clone(),
                };
                let copied_inputs = ScanInputs {
                    declaration: inputs.declaration,
                    phases: inputs.phases,
                    root: inputs.root,
                    index: inputs.index.clone(),
                    profile_started: Cell::new(false),
                    scan_started: Cell::new(super::super::super::use_state::State::Fresh),
                };
                match case {
                    0 => b.inspection_origin = Rc::new(()),
                    1 => b.started += Duration::from_nanos(1),
                    2 => b.retries_left -= 1,
                    3 => b.retries_left += 1,
                    5 => profile.model = "unknown",
                    _ => {}
                }
                let current = if case >= 7 { &copied_scope } else { scope };
                let bound_inputs = if case == 6 { &copied_inputs } else { inputs };
                let model = if case == 4 { "unknown" } else { CALCULATOR_ID };
                assert_eq!(
                    calculate(profile, bound_inputs, current, model, b).unwrap_err(),
                    expected
                );
                assert_eq!(b.checkpoint(), Err(expected));
                assert!(inputs.profile_started.get());
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn every_guard_and_arithmetic_work_prefix_rejects_without_an_estimate() {
    for available in 0..=20 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let result = ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let profile = build(inputs, scope, MODEL_ID, b)?;
            b.json_work = 1_000_000 - available;
            let result = calculate(profile, inputs, scope, CALCULATOR_ID, b);
            if available < 20 {
                assert_eq!(result.unwrap_err(), Failure::Limit);
                assert_eq!(b.json_work, 1_000_000);
                Err(Failure::Limit)
            } else {
                result.map(|_| ())
            }
        });
        assert_eq!(
            result,
            if available < 20 {
                Err(Failure::Limit)
            } else {
                Ok(())
            }
        );
    }
}

#[test]
fn each_of_twenty_post_charge_cancel_and_deadline_boundaries_stops() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for deadline in [false, true] {
        for at in 1..=20 {
            let s = setup();
            let audit = Audit::default();
            let cancel = Rc::new(AtomicBool::new(false));
            let active = Cell::new(false);
            let start = Instant::now();
            let clock = || {
                if deadline && active.get() && audit.counts().iter().sum::<u64>() >= at {
                    start + Duration::from_secs(10)
                } else {
                    start
                }
            };
            let mut b = SharedBudget::new(start, &cancel);
            b.now = &clock;
            let expected = if deadline {
                Failure::Deadline
            } else {
                Failure::Cancelled
            };
            assert_eq!(
                ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                    let profile = build(inputs, scope, MODEL_ID, b)?;
                    let resources = (b.used, b.reserved, b.retries_left, b.started);
                    b.work_audit = Some(audit.clone());
                    if !deadline {
                        audit.cancel_after_work(at, cancel.clone());
                    }
                    active.set(true);
                    assert_eq!(
                        calculate(profile, inputs, scope, CALCULATOR_ID, b).unwrap_err(),
                        expected
                    );
                    assert_eq!(audit.counts().iter().sum::<u64>(), at);
                    assert_eq!((b.used, b.reserved, b.retries_left, b.started), resources);
                    assert_eq!(b.checkpoint(), Err(expected));
                    assert!(inputs.profile_started.get());
                    Err::<(), _>(expected)
                }),
                Err(expected)
            );
        }
    }
}

#[test]
fn synthetic_corruption_fails_at_the_charged_row_without_publishing() {
    for (case, expected, cost) in [
        (0, Failure::Limit, 9),
        (1, Failure::Limit, 12),
        (2, Failure::Limit, 13),
        (3, Failure::Binding, 6),
        (4, Failure::Binding, 20),
        (5, Failure::Limit, 7),
    ] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let mut profile = build(inputs, scope, MODEL_ID, b)?;
                // Test-only access to private scalars; no runtime unsealed constructor.
                match case {
                    0 => profile.shape.k = u64::MAX,
                    1 => profile.shape.j = u64::MAX,
                    2 => profile.shape.c = u64::MAX,
                    3 => profile.shape.h = 0,
                    4 => profile.shape.k += 1,
                    5 => profile.shape.c0 = u64::MAX,
                    _ => unreachable!(),
                }
                let old = b.json_work;
                assert_eq!(
                    calculate(profile, inputs, scope, CALCULATOR_ID, b).unwrap_err(),
                    expected
                );
                assert_eq!(b.json_work - old, cost);
                assert_eq!(b.checkpoint(), Err(expected));
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn oversized_upper_is_only_an_estimate_and_does_not_reserve_or_admit() {
    let s = augmented(5000, 0, "index.json", 0);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
        let profile = build(inputs, scope, MODEL_ID, b)?;
        let resources = (b.used, b.reserved, b.retries_left, b.started);
        let estimate = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
        assert!(estimate.total > 1_000_000);
        assert!(estimate.remaining_scans > estimate.total);
        assert_eq!((b.used, b.reserved, b.retries_left, b.started), resources);
        drop(estimate);
        // Dropping an estimate cannot reset the profile claim or authorize a second estimate.
        assert_eq!(
            build(inputs, scope, MODEL_ID, b).unwrap_err(),
            Failure::Binding
        );
        Err::<(), _>(Failure::Binding)
    })
    .unwrap_err();
}

#[test]
fn existing_sticky_failure_wins_without_new_work_or_resources() {
    for reason in [
        Failure::Binding,
        Failure::Changed,
        Failure::Limit,
        Failure::Cancelled,
        Failure::Deadline,
    ] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let before = (b.json_work, b.used, b.reserved, b.retries_left, b.started);
                b.failed = Some(reason);
                assert_eq!(
                    calculate(profile, inputs, scope, "unknown", b).unwrap_err(),
                    reason
                );
                assert_eq!(
                    (b.json_work, b.used, b.reserved, b.retries_left, b.started),
                    before
                );
                Err::<(), _>(reason)
            }),
            Err(reason)
        );
    }
}

#[test]
fn estimate_cannot_be_cloned_copied_or_deserialized() {
    trait Ambiguous<A> {
        fn check() {}
    }
    impl<T: ?Sized> Ambiguous<()> for T {}
    struct CloneMarker;
    impl<T: Clone> Ambiguous<CloneMarker> for T {}
    struct CopyMarker;
    impl<T: Copy> Ambiguous<CopyMarker> for T {}
    struct SerializeMarker;
    impl<T: ?Sized + serde::Serialize> Ambiguous<SerializeMarker> for T {}
    struct DeserializeMarker;
    impl<T: for<'de> serde::Deserialize<'de>> Ambiguous<DeserializeMarker> for T {}
    let _ = <ScanWorkEstimate<'_, '_, '_, '_, '_> as Ambiguous<_>>::check;
}

#[test]
fn all_fifteen_arithmetic_rows_check_the_deadline_after_computing() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for at in 6..=20 {
        let s = setup();
        let audit = Audit::default();
        let cancel = AtomicBool::new(false);
        let active = Cell::new(false);
        let seen = Cell::new(0u8);
        let start = Instant::now();
        let clock = || {
            if active.get() && audit.counts().iter().sum::<u64>() == at {
                seen.set(seen.get() + 1);
                // First call is work's post-charge guard; second is row's terminal guard.
                if seen.get() == 2 {
                    return start + Duration::from_secs(10);
                }
            }
            start
        };
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &clock;
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                b.work_audit = Some(audit.clone());
                active.set(true);
                assert_eq!(
                    calculate(profile, inputs, scope, CALCULATOR_ID, b).unwrap_err(),
                    Failure::Deadline
                );
                assert_eq!(audit.counts().iter().sum::<u64>(), at);
                assert_eq!(seen.get(), 2);
                Err::<(), _>(Failure::Deadline)
            }),
            Err(Failure::Deadline)
        );
    }
}
