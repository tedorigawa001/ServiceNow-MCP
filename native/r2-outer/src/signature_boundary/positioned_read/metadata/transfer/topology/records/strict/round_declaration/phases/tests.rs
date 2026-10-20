use super::super::tests::{Setup, context};
use super::*;
use crate::closure::shared::index_decode_count;
use crate::json::shared::Budget;
use std::cell::Cell;

fn observation(s: &Setup, scope: &RoundScope<'_>) -> ClosureObservation {
    ClosureObservation {
        lineage: s.receipt.lineage.clone(),
        records: s.receipt.binding.clone(),
        round: scope.round,
        token: scope.token.clone(),
        entries: s.observed.clone(),
    }
}
#[test]
fn actual_child_phase_costs_partition_the_legacy_bound_and_keep_spent() {
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let mut b = SharedBudget::new(start, &stop);
        let decode_before = index_decode_count();
        let began = b.json_work;
        with_round(&s.receipt, &s.target, &c, round, &mut b, |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let p = &phases.partition;
            let ready_cost = b.json_work - began;
            // The pre bound is exact accepted kernel cost; phase-control6 is separate.
            assert_eq!(ready_cost, p.pre + 6);
            let round_upper = d.index_work.bound().per_round();
            assert_eq!(p.pre + p.compare + p.final_check, round_upper);
            let before = b.json_work;
            let ready = phases.remaining(scope, PHASE_MODEL_ID, b)?;
            assert_eq!(b.json_work - before, 4);
            assert_eq!(ready.completed_current, p.pre);
            assert_eq!(ready.remaining_current, p.compare + p.final_check);
            let future = match round {
                Round::Initial => 2,
                Round::BeforeM4 => 1,
                Round::AfterM4 => 0,
            };
            assert_eq!(ready.future_rounds, future * round_upper);
            assert_eq!(ready.remaining_schedule, (future + 1) * round_upper - p.pre);
            // Arbitrary work from some other phase is not subtracted from the index plan.
            b.work(7)?;
            let again = phases.remaining(scope, PHASE_MODEL_ID, b)?;
            assert_eq!(again.remaining_schedule, ready.remaining_schedule);
            let compare_upper = p.compare;
            let final_upper = p.final_check;
            let before = b.json_work;
            phases.after_scan(&observation(&s, scope), b)?;
            assert_eq!(
                b.json_work - before,
                compare_upper - (work_model::OBSERVED_MAX - s.observed.len() as u64) + 1
            );
            let compared = phases.remaining(scope, PHASE_MODEL_ID, b)?;
            assert_eq!(compared.remaining_current, final_upper);
            let before = b.json_work;
            phases.finish(b)?;
            assert_eq!(b.json_work - before, final_upper - 87 + 1);
            let done = phases.remaining(scope, PHASE_MODEL_ID, b)?;
            assert_eq!(done.completed_current, round_upper);
            assert_eq!(done.remaining_current, 0);
            assert_eq!(done.remaining_schedule, future * round_upper);
            assert!(b.json_work >= ready_cost); // no refund/reset of consumed work
            Ok(())
        })
        .unwrap();
        assert_eq!(index_decode_count(), decode_before + 1);
        assert_eq!(b.started, start);
        assert_eq!(
            (b.used, b.reserved, b.metadata_calls, b.topology_calls),
            (0, 0, 0, 0)
        );
    }
}
#[test]
fn duplicate_prepare_and_out_of_order_or_duplicate_transitions_are_rejected() {
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
                let mut p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                match case {
                    0 => d.prepare_scan(scope, PHASE_MODEL_ID, b).map(|_| ()),
                    1 => p.finish(b),
                    2 => {
                        let o = observation(&s, scope);
                        p.after_scan(&o, b)?;
                        p.after_scan(&o, b)
                    }
                    _ => {
                        p.after_scan(&observation(&s, scope), b)?;
                        p.finish(b)?;
                        p.finish(b)
                    }
                }
            },
        );
        assert_eq!(result.unwrap_err(), Failure::Binding);
        assert_eq!(b.failed, Some(Failure::Binding));
    }
}
#[test]
fn observation_identity_and_complete_set_are_required_before_phase_advances() {
    for case in 0..5 {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let e = with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let mut p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let mut o = observation(&s, scope);
                match case {
                    0 => o.lineage = Rc::new(()),
                    1 => o.records.generation += 1,
                    2 => o.round = Round::BeforeM4,
                    3 => o.token = Rc::new(()),
                    _ => {
                        o.entries.pop();
                    }
                }
                let result = p.after_scan(&o, b);
                assert!(p.state == State::Ready);
                result
            },
        )
        .unwrap_err();
        assert_eq!(e, Failure::Changed);
        assert_eq!(b.failed, Some(e));
    }
}
#[test]
fn failed_node_check_cannot_issue_pre_scan_completion() {
    let mut s = Setup::new();
    s.target.size = SizeEvidence::Indexed(4097);
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
            d.prepare_scan(scope, PHASE_MODEL_ID, b).map(|_| ())
        },
    );
    assert_eq!(result.unwrap_err(), Failure::Changed);
}
#[test]
fn unknown_phase_model_and_separate_budget_or_round_are_rejected() {
    for case in 0..4 {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let mut fresh = SharedBudget::new(Instant::now(), &stop);
        let result = with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                if case == 0 {
                    return d.prepare_scan(scope, "unknown", b).map(|_| ());
                }
                let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                match case {
                    1 => p.remaining(scope, "unknown", b).map(|_| ()),
                    2 => p.remaining(scope, PHASE_MODEL_ID, &mut fresh).map(|_| ()),
                    _ => with_round(&s.receipt, &s.target, &c, Round::Initial, b, |other, b| {
                        p.remaining(other, PHASE_MODEL_ID, b).map(|_| ())
                    }),
                }
            },
        );
        assert_eq!(
            result.unwrap_err(),
            if case < 2 {
                Failure::Unavailable
            } else {
                Failure::Binding
            }
        );
    }
}
#[test]
fn full_phase_run_keeps_each_checkpoint_cancellation_and_deadline() {
    fn run(stop: &AtomicBool, now: &dyn Fn() -> Instant, start: Instant) -> Result<usize, Failure> {
        let s = Setup::new();
        let c = context();
        let mut b = SharedBudget::new(start, stop);
        b.now = now;
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let mut p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                p.remaining(scope, PHASE_MODEL_ID, b)?;
                p.after_scan(&observation(&s, scope), b)?;
                p.remaining(scope, PHASE_MODEL_ID, b)?;
                p.finish(b)?;
                p.remaining(scope, PHASE_MODEL_ID, b)?;
                Ok(0)
            },
        )
    }
    let start = Instant::now();
    let stop = AtomicBool::new(false);
    let calls = Cell::new(0);
    run(
        &stop,
        &|| {
            calls.set(calls.get() + 1);
            start
        },
        start,
    )
    .unwrap();
    for cancelled in [true, false] {
        for fail in 1..=calls.get() {
            let stop = AtomicBool::new(false);
            let count = Cell::new(0);
            let now = || {
                let n = count.get() + 1;
                count.set(n);
                if n >= fail {
                    if cancelled {
                        stop.store(true, Ordering::Release);
                    } else {
                        return start + Duration::from_secs(10);
                    }
                }
                start
            };
            let result = run(&stop, &now, start);
            if cancelled && fail == calls.get() {
                // checkpoint checks cancel BEFORE calling now(). This injected cancel is
                // AFTER the final cancellation check; no cooperative guard can promise
                // to catch a cancellation arriving after its last check.
                assert_eq!(result, Ok(0));
                assert!(stop.load(Ordering::Acquire));
            } else {
                assert_eq!(
                    result,
                    Err(if cancelled {
                        Failure::Cancelled
                    } else {
                        Failure::Deadline
                    }),
                    "cancelled={cancelled} fail={fail} total={}",
                    calls.get()
                );
            }
        }
    }
}
#[test]
fn phase_control_work_is_bounded_and_exhaustion_does_not_complete_phase() {
    for case in 0..3 {
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
                if case == 0 {
                    b.json_work = 999_999;
                    return d.prepare_scan(scope, PHASE_MODEL_ID, b).map(|_| ());
                }
                let mut p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                if case == 1 {
                    b.json_work = 999_999;
                    return p.remaining(scope, PHASE_MODEL_ID, b).map(|_| ());
                }
                p.after_scan(&observation(&s, scope), b)?;
                b.json_work = 1_000_000;
                let out = p.finish(b);
                assert!(p.state == State::Compared);
                out
            },
        );
        assert_eq!(result.unwrap_err(), Failure::Limit);
        assert_eq!(b.failed, Some(Failure::Limit));
    }
}

#[test]
fn mixed_depth64_and_chunk_boundaries_keep_exact_child_costs() {
    for pad in [0, 65536, 65537, 16 * 1024 * 1024] {
        let mut s = Setup::new();
        let mut value: serde_json::Value =
            serde_json::from_slice(&s.receipt.pins[2].bytes).unwrap();
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
        let mut bytes = serde_json::to_string(&value)
            .unwrap()
            .replace("\"path\"", "\"p\\u0061th\"")
            .into_bytes();
        bytes.resize(bytes.len().max(pad), b' ');
        s.receipt.binding.index_hash = Sha256::digest(&bytes).into();
        s.receipt.pins[2].leaf.stat.size = bytes.len() as u64;
        s.receipt.pins[2].bytes = bytes;
        s.observed = serde_json::from_value(value["entries"].clone()).unwrap();
        s.observed.push(closure::Entry::File {
            path: "index.json".into(),
            mode: "0444".into(),
            size: s.receipt.pins[2].bytes.len() as u64,
            sha256: hex(&s.receipt.binding.index_hash),
        });
        let c = context();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let now = || start;
        let mut b = SharedBudget::new(start, &stop);
        b.now = &now;
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let mut p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                assert_eq!(b.json_work, p.partition.pre + 6);
                let before = b.json_work;
                let upper = p.partition.compare;
                p.after_scan(&observation(&s, scope), b)?;
                assert_eq!(
                    b.json_work - before,
                    upper - (work_model::OBSERVED_MAX - s.observed.len() as u64) + 1
                );
                let before = b.json_work;
                let upper = p.partition.final_check;
                p.finish(b)?;
                assert_eq!(b.json_work - before, upper - 87 + 1);
                Ok(())
            },
        )
        .unwrap();
    }
}
