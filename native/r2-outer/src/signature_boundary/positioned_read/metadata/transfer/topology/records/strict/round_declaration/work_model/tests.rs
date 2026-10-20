use super::super::tests::{Setup, context};
use super::*;
use crate::json::shared::Budget;
use std::cell::Cell;

#[test]
fn sealed_shape_summary_is_exact_and_uses_original_shared_budget() {
    let s = Setup::new();
    let c = context();
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let mut b = SharedBudget::new(start, &stop);
    with_round(
        &s.receipt,
        &s.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let d = scope.decode(b)?;
            let prior = b.json_work;
            let v = d.work_summary(scope, WORK_MODEL_ID, b)?;
            assert_eq!(v.model_id, WORK_MODEL_ID);
            assert_eq!(v.counts, (s.receipt.pins[2].bytes.len() as u64, 2, 2, 3));
            let chunks = (v.counts.0).div_ceil(65536);
            assert_eq!(v.components.0, chunks + 20 + 26 * 2 + 17 * 2);
            assert_eq!(v.components.1, 4 + 3);
            assert_eq!(v.components.2, 6 * chunks + 9 * 4 + 3 * 3 + 100001);
            assert_eq!(v.components.3, 128);
            assert_eq!(
                v.per_round,
                v.components.0 + v.components.1 + v.components.2 + v.components.3
            );
            assert_eq!(v.three_rounds, 3 * v.per_round);
            assert_eq!(b.json_work - prior, 3);
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(b.started, start);
    assert_eq!(b.used, 0);
    assert_eq!(b.reserved, 0);
    assert_eq!(b.metadata_calls, 0);
    assert_eq!(b.topology_calls, 0);
}
#[test]
fn charged_fixed_steps_fit_128_without_counting_the_allowance_as_spent() {
    let s = Setup::new();
    let c = context();
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    let before = b.json_work;
    let (upper, variable) = with_round(
        &s.receipt,
        &s.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let d = scope.decode(b)?;
            // Isolate exactly the index kernel: projection four steps, two Node scans.
            b.work(4)?;
            for _ in 0..2 {
                for _ in d.entries() {
                    b.work(1)?;
                }
            }
            d.recheck(scope, Some(&s.observed), b)?;
            d.recheck(scope, None, b)?;
            let shape = &d.index_work.shape;
            let bound = &d.index_work.bound;
            let n = shape.files + shape.directories;
            let chunks = shape.bytes.div_ceil(65536);
            let actual_variable = bound.decode
                + 6 * chunks
                + 9 * n
                + 3 * shape.parents
                + s.observed.len() as u64
                + bound.statistics;
            Ok((bound.per_round, actual_variable))
        },
    )
    .unwrap();
    let charged = b.json_work - before;
    assert_eq!(charged - variable, FIXED_CHARGED);
    assert_eq!(FIXED_CHARGED, 45);
    assert!(charged - variable <= FIXED_BOUND);
    assert_eq!(
        upper - charged,
        (OBSERVED_MAX - s.observed.len() as u64) + (FIXED_BOUND - FIXED_CHARGED)
    );
}
#[test]
fn calculation_itself_costs_eight_units_and_uses_global_observation_max() {
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    let s = Shape {
        bytes: 65536,
        files: 4500,
        directories: 1000,
        parents: 22000,
    };
    let bound = calculate(&s, WORK_MODEL_ID, &mut b).unwrap();
    assert_eq!(b.json_work, 8);
    assert_eq!(bound.decode, 1 + 20 + 26 * 4500 + 17 * 1000);
    assert_eq!(bound.variable, 6 + 9 * 5500 + 3 * 22000 + 100001);
    assert_eq!(bound.statistics, 5500 + 22000);
    assert_eq!(bound.three_rounds, 3 * bound.per_round);
    assert!(bound.three_rounds > 1_000_000); // Unlike the N+1-only draft example.
}
#[test]
fn bytes_entries_and_all_parent_prefix_limits_are_defensive_and_inclusive() {
    let stop = AtomicBool::new(false);
    for s in [
        Shape {
            bytes: 16 * 1024 * 1024,
            files: 100000,
            directories: 0,
            parents: 6300063,
        },
        Shape {
            bytes: 1,
            files: 0,
            directories: 0,
            parents: 0,
        },
    ] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert!(calculate(&s, WORK_MODEL_ID, &mut b).is_ok());
    }
    for s in [
        Shape {
            bytes: 16 * 1024 * 1024 + 1,
            files: 1,
            directories: 0,
            parents: 0,
        },
        Shape {
            bytes: 0,
            files: 0,
            directories: 0,
            parents: 0,
        },
        Shape {
            bytes: 1,
            files: 100001,
            directories: 0,
            parents: 0,
        },
        Shape {
            bytes: 1,
            files: 0,
            directories: 0,
            parents: 64,
        },
    ] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            calculate(&s, WORK_MODEL_ID, &mut b).err(),
            Some(Error::Limit(Limit::Shape))
        );
    }
}
#[test]
fn chunk_edges_and_checked_arithmetic_never_wrap() {
    let stop = AtomicBool::new(false);
    for bytes in [1, 65535, 65536, 65537, 16 * 1024 * 1024] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let bound = calculate(
            &Shape {
                bytes,
                files: 2,
                directories: 2,
                parents: 3,
            },
            WORK_MODEL_ID,
            &mut b,
        )
        .unwrap();
        assert_eq!(bound.decode, bytes.div_ceil(65536) + 20 + 52 + 34);
    }
    assert_eq!(add(u64::MAX, 1), Err(Error::Limit(Limit::Overflow)));
    assert_eq!(mul(u64::MAX, 3), Err(Error::Limit(Limit::Overflow)));
    assert_eq!(sum(&[u64::MAX, 1]), Err(Error::Limit(Limit::Overflow)));
    for s in [
        Shape {
            bytes: 1,
            files: u64::MAX,
            directories: 1,
            parents: 0,
        },
        Shape {
            bytes: 1,
            files: u64::MAX,
            directories: 0,
            parents: 0,
        },
        Shape {
            bytes: 1,
            files: u64::MAX / 2,
            directories: 0,
            parents: 0,
        },
    ] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            calculate(&s, WORK_MODEL_ID, &mut b).err(),
            Some(Error::Limit(Limit::Overflow))
        );
    }
}
#[test]
fn index_cap_equality_and_one_unit_short_are_distinct_without_reservation() {
    for case in 0..4 {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let result = with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let units = d.index_work.bound.three_rounds;
                let available = match case {
                    0 => units,
                    1 => units - 1,
                    2 => CAP,
                    _ => CAP + 1,
                };
                d.check_index_cap(scope, WORK_MODEL_ID, available, b)
            },
        );
        assert_eq!(
            result.err(),
            if case == 0 || case == 2 {
                None
            } else {
                Some(Failure::Limit)
            }
        );
        assert_eq!(b.reserved, 0); // This helper is NOT admission.
    }
}
#[test]
fn model_mismatch_is_unavailable_and_never_falls_back_to_default_coefficients() {
    for expected in ["", "unknown", "bp5-r2-index-work-0.2"] {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    d.work_summary(scope, expected, b).map(|_| ())
                }
            )
            .err(),
            Some(Failure::Unavailable)
        );
        assert_eq!(b.failed, Some(Failure::Unavailable));
    }
    let s = Setup::new();
    let c = context();
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let mut d = scope.decode(b)?;
                d.index_work.id = "test-only-corruption";
                d.recheck(scope, None, b).map(|_| ())
            }
        )
        .err(),
        Some(Failure::Unavailable)
    );
}
#[test]
fn counter_limit_and_original_failure_win_during_model_build_or_query() {
    let stop = AtomicBool::new(false);
    for before in [999993, 999999, 1_000_000] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        b.json_work = before;
        assert_eq!(
            calculate(
                &Shape {
                    bytes: 1,
                    files: 2,
                    directories: 2,
                    parents: 3
                },
                WORK_MODEL_ID,
                &mut b
            )
            .err(),
            Some(Error::Budget(Failure::Limit))
        );
    }
    let mut exact = SharedBudget::new(Instant::now(), &stop);
    exact.json_work = 999992;
    calculate(
        &Shape {
            bytes: 1,
            files: 2,
            directories: 2,
            parents: 3,
        },
        WORK_MODEL_ID,
        &mut exact,
    )
    .unwrap();
    assert_eq!(exact.json_work, 1_000_000);
    assert_eq!(exact.work(1), Err(Failure::Limit));
    for reason in [Failure::HashMismatch, Failure::Cancelled, Failure::Deadline] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        b.failed = Some(reason);
        assert_eq!(
            calculate(
                &Shape {
                    bytes: 0,
                    files: 0,
                    directories: 0,
                    parents: 0
                },
                "wrong",
                &mut b
            )
            .err(),
            Some(Error::Budget(reason))
        );
        assert_eq!(b.json_work, 0);
    }
}
#[test]
fn cancellation_and_deadline_at_every_calculation_checkpoint_are_typed() {
    let shape = Shape {
        bytes: 65537,
        files: 2,
        directories: 2,
        parents: 3,
    };
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let checks = Cell::new(0usize);
    let clock = || {
        checks.set(checks.get() + 1);
        start
    };
    let mut b = SharedBudget::new(start, &stop);
    b.now = &clock;
    calculate(&shape, WORK_MODEL_ID, &mut b).unwrap();
    let total = checks.get();
    for cancelled in [false, true] {
        for at in 1..=total {
            let stop = AtomicBool::new(false);
            let n = Cell::new(0usize);
            let clock = || {
                let k = n.get() + 1;
                n.set(k);
                if k >= at {
                    if cancelled {
                        stop.store(true, Ordering::Release);
                    } else {
                        return start + Duration::from_secs(10);
                    }
                }
                start
            };
            let mut b = SharedBudget::new(start, &stop);
            b.now = &clock;
            let out = calculate(&shape, WORK_MODEL_ID, &mut b);
            let reason = if cancelled {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            // Caller guard discards a late success if cancel is raised inside the last
            // clock read (SharedBudget checks the flag before reading that clock).
            let checked = out.and_then(|_| b.checkpoint().map_err(Error::Budget));
            assert_eq!(checked.err(), Some(Error::Budget(reason)));
        }
    }
}

fn changed_index(value: serde_json::Value, pad: usize, index_path: &str) -> Setup {
    let mut s = Setup::new();
    let mut binding = s.receipt.binding.clone();
    binding.index_path = format!("{}/{index_path}", binding.runtime_root);
    let mut receipt =
        super::super::super::super::tests::make_receipt(&mut binding, &s.receipt.lineage);
    let mut bytes = serde_json::to_vec(&value).unwrap();
    // JSON escape spelling changes raw B, but not accepted decoded-key/string costs.
    bytes = String::from_utf8(bytes)
        .unwrap()
        .replace("\"path\"", "\"p\\u0061th\"")
        .into_bytes();
    bytes.resize(pad.max(bytes.len()), b' ');
    let hash: [u8; 32] = Sha256::digest(&bytes).into();
    receipt.pins[2].leaf.stat.size = bytes.len() as u64;
    receipt.pins[2].bytes = bytes;
    binding.index_hash = hash;
    receipt.binding = binding;
    s.receipt = receipt;
    s.observed = serde_json::from_value(value["entries"].clone()).unwrap();
    s.observed.push(closure::Entry::File {
        path: index_path.into(),
        mode: "0444".into(),
        size: s.receipt.pins[2].bytes.len() as u64,
        sha256: hex(&hash),
    });
    s
}
#[test]
fn mixed_deep_and_escaped_payloads_keep_exact_shape_and_fixed_step_bound() {
    let base = Setup::new();
    let mut value: serde_json::Value = serde_json::from_slice(&base.receipt.pins[2].bytes).unwrap();
    let entries = value["entries"].as_array_mut().unwrap();
    let mut path = String::new();
    for _ in 0..63 {
        if !path.is_empty() {
            path.push('/');
        }
        path.push('a');
        entries.push(serde_json::json!({"kind":"directory","path":path,"mode":"0555"}));
    }
    entries.push(serde_json::json!({"kind":"file","path":format!("{path}/leaf.js"),"mode":"0444","size":0,"sha256":"a".repeat(64)}));
    entries.sort_by(|a, b| a["path"].as_str().unwrap().cmp(b["path"].as_str().unwrap()));
    let relative_index = format!("{path}/index.json");
    for pad in [0, 65536, 65537, 16 * 1024 * 1024] {
        let s = changed_index(value.clone(), pad, &relative_index);
        let c = context();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let clock = || start;
        let mut b = SharedBudget::new(start, &stop);
        b.now = &clock;
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let before = b.json_work;
                let d = scope.decode(b)?;
                assert_eq!(d.index_work.shape.files, 3);
                assert_eq!(d.index_work.shape.directories, 65);
                assert_eq!(d.index_work.shape.parents, 2082);
                assert_eq!(d.index_work.bound.statistics, 68 + 2082);
                let chunks = d.index_work.shape.bytes.div_ceil(65536);
                assert_eq!(d.index_work.bound.decode, chunks + 20 + 26 * 3 + 17 * 65);
                let scope_cost = 1; // with_round's one step happened before `before`.
                b.work(4)?;
                for _ in 0..2 {
                    for _ in d.entries() {
                        b.work(1)?;
                    }
                }
                d.recheck(scope, Some(&s.observed), b)?;
                d.recheck(scope, None, b)?;
                let actual_variable = d.index_work.bound.decode
                    + 6 * chunks
                    + 9 * 68
                    + 3 * 2082
                    + s.observed.len() as u64
                    + d.index_work.bound.statistics;
                assert_eq!(
                    b.json_work - before + scope_cost - actual_variable,
                    FIXED_CHARGED
                );
                Ok(())
            },
        )
        .unwrap();
    }
}
#[test]
fn summary_rejects_another_round_even_when_model_is_correct() {
    let s = Setup::new();
    let c = context();
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |one, b| {
                let d = one.decode(b)?;
                with_round(&s.receipt, &s.target, &c, Round::Initial, b, |two, b| {
                    d.work_summary(two, WORK_MODEL_ID, b).map(|_| ())
                })
            }
        )
        .err(),
        Some(Failure::Binding)
    );
}
#[test]
fn every_statistics_collection_and_calculation_boundary_stops_on_cancel_or_deadline() {
    fn run(fault: Option<(usize, bool)>) -> (Result<(), Failure>, usize, Option<Failure>) {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let calls = Cell::new(0usize);
        let trigger = Cell::new(usize::MAX);
        let clock = || {
            let n = calls.get() + 1;
            calls.set(n);
            if n >= trigger.get() {
                if fault.is_some_and(|v| v.1) {
                    stop.store(true, Ordering::Release);
                } else {
                    return start + Duration::from_secs(10);
                }
            }
            start
        };
        let mut b = SharedBudget::new(start, &stop);
        b.now = &clock;
        let mut seen = 0;
        let out = with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let before = calls.get();
                if let Some((at, _)) = fault {
                    trigger.set(before + at);
                }
                let built = IndexWork::build(scope, &d.parsed, b);
                seen = calls.get() - before;
                b.checkpoint()?;
                built.map_err(|e| latch(e, b))?;
                Ok(())
            },
        );
        (out, seen, b.failed)
    }
    let (normal, total, _) = run(None);
    assert!(normal.is_ok());
    assert!(total > 16);
    for cancelled in [false, true] {
        for at in 1..=total {
            let (out, _, failed) = run(Some((at, cancelled)));
            let reason = if cancelled {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            assert_eq!(out.err(), Some(reason));
            assert_eq!(failed, Some(reason));
        }
    }
}
