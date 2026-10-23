use super::super::super::super::super::tests::setup;
use super::super::super::super::tests::ready;
use super::*;
use std::{cell::Cell, time::Duration};
mod draft;

#[test]
fn scan_caps_comparison_is_partial_and_does_not_allocate_or_admit() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
        let profile = build(inputs, scope, MODEL_ID, b)?;
        let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
        let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
        let caps = synthetic(scope, b);
        let old = b.json_work;
        let accounting = (b.used, b.reserved, b.retries_left);
        let result = compare(&p, &caps, &e, inputs, scope, b)?;
        assert_eq!(b.json_work - old, 45);
        assert_eq!(accounting, (b.used, b.reserved, b.retries_left));
        assert_eq!(
            format!("{result:?}"),
            "ScanCapsCompared(scan_subset_only_outer_bootstrap_unverified)"
        );
        assert!(!b.scan_session_claim.started.get());
        assert!(!b.protected_bridge_claim.policy_evidence_issued.get());
        assert_eq!(result.require_complete(b), Err(Failure::Unavailable));
        Err::<(), _>(Failure::Unavailable)
    })
    .unwrap_err();
}

#[test]
fn scan_caps_all_thirty_five_dimensions_are_independent_exact_and_checked() {
    for slot in 0..35 {
        for delta in [-1i64, 0, 1] {
            let s = setup();
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let result = ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let mut caps = synthetic(scope, b);
                let values = dimensions(&p.quantities);
                caps.values[slot] = values[slot].checked_add_signed(delta).unwrap();
                match compare(&p, &caps, &e, inputs, scope, b) {
                    Ok(_) => {
                        assert!(delta >= 0);
                        Ok(())
                    }
                    Err(e) => {
                        assert_eq!((delta, e), (-1, Failure::Limit));
                        Err(e)
                    }
                }
            });
            assert_eq!(
                result,
                if delta < 0 {
                    Err(Failure::Limit)
                } else {
                    Ok(())
                }
            );
        }
    }
}

#[test]
fn scan_caps_snapshot_identity_models_expiry_and_unknown_coverage_fail_closed() {
    for fault in 0..14 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = match fault {
            0..=4 | 9 | 12 | 13 => Failure::Unavailable,
            8 => Failure::Expired,
            10 => Failure::Changed,
            _ => Failure::Binding,
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let mut p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let mut caps = synthetic(scope, b);
                match fault {
                    0 => caps.model = "unknown",
                    1..=4 => caps.bundle[fault - 1] = "old",
                    5 => caps.artifact[0] ^= 1,
                    6 => caps.origin = Rc::new(()),
                    7 => caps.token = Rc::new(()),
                    8 => caps.expires = b.started + Duration::from_secs(10),
                    9 => caps.coverage |= 1 << 39,
                    10 => b.retries_left -= 1,
                    11 => caps.started += Duration::from_nanos(1),
                    12 => caps.coverage &= !1,
                    13 => p.model = "unknown",
                    _ => unreachable!(),
                }
                assert_eq!(
                    compare(&p, &caps, &e, inputs, scope, b).unwrap_err(),
                    expected
                );
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn scan_caps_payload_reservations_cannot_be_borrowed_or_refilled() {
    for mode in 0..3 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let caps = synthetic(scope, b);
                match mode {
                    0 => b.used = MAX_BYTES,
                    1 => b.reserved = MAX_BYTES,
                    _ => {
                        b.used = MAX_BYTES;
                        b.reserved = u64::MAX;
                    }
                }
                assert_eq!(
                    compare(&p, &caps, &e, inputs, scope, b).unwrap_err(),
                    Failure::Limit
                );
                Err::<(), _>(Failure::Limit)
            }),
            Err(Failure::Limit)
        );
    }
}

#[test]
fn scan_caps_unknown_dimensions_and_unbounded_caps_never_issue_full_evidence() {
    for mode in 0..2 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let reason = if mode == 0 {
            Failure::Unavailable
        } else {
            Failure::Limit
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let mut caps = synthetic(scope, b);
                if mode == 0 {
                    let proof = compare(&p, &caps, &e, inputs, scope, b)?;
                    let mut other = SharedBudget::new(b.started, &cancel);
                    assert_eq!(proof.require_complete(&mut other), Err(reason));
                    assert_eq!(other.checkpoint(), Err(reason));
                    assert_eq!(b.checkpoint(), Err(reason));
                } else {
                    caps.values[0] = u64::MAX;
                    assert_eq!(
                        compare(&p, &caps, &e, inputs, scope, b).unwrap_err(),
                        reason
                    );
                }
                Err::<(), _>(reason)
            }),
            Err(reason)
        );
    }
}

#[test]
fn scan_caps_comparison_claim_survives_drop_and_poison_both_budgets() {
    for foreign in [false, true] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let e = calculate(profile, inputs, scope, CALCULATOR_ID, b)?;
                let p = project(&e, inputs, scope, PROJECTION_ID, b)?;
                let caps = synthetic(scope, b);
                if foreign {
                    let mut other = SharedBudget::new(b.started, &cancel);
                    assert_eq!(
                        compare(&p, &caps, &e, inputs, scope, &mut other).unwrap_err(),
                        Failure::Binding
                    );
                    assert_eq!(other.checkpoint(), Err(Failure::Binding));
                } else {
                    drop(compare(&p, &caps, &e, inputs, scope, b)?);
                }
                assert_eq!(
                    compare(&p, &caps, &e, inputs, scope, b).unwrap_err(),
                    Failure::Binding
                );
                assert_eq!(b.checkpoint(), Err(Failure::Binding));
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn scan_caps_every_work_limit_cancel_and_deadline_boundary_is_sticky() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for mode in 0..3 {
        for at in 1..=45 {
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
            let expected = match mode {
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
                        compare(&p, &caps, &e, inputs, scope, b).unwrap_err(),
                        expected
                    );
                    let spent = b.json_work;
                    assert_eq!(
                        compare(&p, &caps, &e, inputs, scope, b).unwrap_err(),
                        expected
                    );
                    assert_eq!(b.json_work, spent);
                    Err::<(), _>(expected)
                }),
                Err(expected)
            );
        }
    }
}
