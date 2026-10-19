use super::*;
use crate::json::shared::{Limit, Limits, Rejection};
use serde_json::Value;
fn limits() -> Limits {
    Limits {
        max_bytes: 65536,
        max_depth: 16,
        max_items: 65536,
    }
}
#[test]
fn original_deadline_and_cancel_are_preserved_without_new_start() {
    for cancelled in [false, true] {
        let stop = AtomicBool::new(cancelled);
        let started = Instant::now() - Duration::from_secs(if cancelled { 0 } else { 10 });
        let mut b = SharedBudget::new(started, &stop);
        let expected = if cancelled {
            Failure::Cancelled
        } else {
            Failure::Deadline
        };
        assert_eq!(
            b.decode_json::<Value>(b"{bad", limits()),
            Err(Rejection::Budget(expected))
        );
        assert_eq!(b.failed, Some(expected));
        assert_eq!(b.json_work, 0);
    }
}
#[test]
fn json_work_is_shared_but_payload_metadata_and_topology_credits_are_untouched() {
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    assert!(b.decode_json::<Value>(b"{}", limits()).is_ok());
    let first = b.json_work;
    assert!(first > 0);
    assert!(b.decode_json::<Value>(b"{}", limits()).is_ok());
    assert_eq!(b.json_work, 2 * first);
    assert_eq!(b.used, 0);
    assert_eq!(b.reserved, 0);
    assert_eq!(b.metadata_calls, 0);
    assert_eq!(b.topology_calls, 0);
}
#[test]
fn shared_work_ceiling_is_latched_and_not_reset_on_second_decode() {
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    b.json_work = 999999;
    assert_eq!(
        b.decode_json::<Value>(b"{}", limits()),
        Err(Rejection::Budget(Failure::Limit))
    );
    assert_eq!(b.failed, Some(Failure::Limit));
    assert_eq!(
        b.decode_json::<Value>(b"{}", limits()),
        Err(Rejection::Budget(Failure::Limit))
    );
}
#[test]
fn local_limits_and_invalid_record_are_typed_then_latched_without_text_matching() {
    for invalid in [false, true] {
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let out = b.decode_json::<Value>(
            if invalid { b"x" } else { b"{}" },
            Limits {
                max_bytes: 1,
                ..limits()
            },
        );
        if invalid {
            assert_eq!(out, Err(Rejection::InvalidRecord));
            assert_eq!(b.failed, Some(Failure::Binding));
        } else {
            assert_eq!(out, Err(Rejection::Limit(Limit::Bytes)));
            assert_eq!(b.failed, Some(Failure::Limit));
        }
    }
}
#[test]
fn an_existing_failure_is_not_reclassified_or_overwritten() {
    let stop = AtomicBool::new(true);
    let mut b = SharedBudget::new(Instant::now() - Duration::from_secs(10), &stop);
    b.failed = Some(Failure::HashMismatch);
    assert_eq!(
        b.decode_json::<Value>(b"x", limits()),
        Err(Rejection::Budget(Failure::HashMismatch))
    );
    assert_eq!(b.failed, Some(Failure::HashMismatch));
}
#[test]
fn original_budget_expiry_mid_parse_keeps_deadline_not_invalid_record() {
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let calls = std::cell::Cell::new(0);
    let clock = || {
        let n = calls.get() + 1;
        calls.set(n);
        if n >= 20 {
            start + Duration::from_secs(10)
        } else {
            start
        }
    };
    let mut b = SharedBudget::new(start, &stop);
    b.now = &clock;
    assert_eq!(
        b.decode_json::<Value>(br#"{"a":[1,2,3,4,5]}"#, limits()),
        Err(Rejection::Budget(Failure::Deadline))
    );
    assert!(b.json_work > 0);
    assert_eq!(b.failed, Some(Failure::Deadline));
    assert_eq!(b.started, start);
}
#[test]
fn cancellation_mid_parse_keeps_cancelled_not_invalid_record() {
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let calls = std::cell::Cell::new(0);
    let clock = || {
        let n = calls.get() + 1;
        calls.set(n);
        if n == 20 {
            stop.store(true, Ordering::Release);
        }
        start
    };
    let mut b = SharedBudget::new(start, &stop);
    b.now = &clock;
    assert_eq!(
        b.decode_json::<Value>(br#"{"a":[1,2,3,4,5]}"#, limits()),
        Err(Rejection::Budget(Failure::Cancelled))
    );
    assert!(b.json_work > 0);
    assert_eq!(b.failed, Some(Failure::Cancelled));
}
