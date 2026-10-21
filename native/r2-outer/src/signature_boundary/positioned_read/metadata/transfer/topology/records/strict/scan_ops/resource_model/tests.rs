use super::*;
use crate::signature_boundary::positioned_read::work_audit::Audit;
use std::time::Duration;

fn basic() -> Shape {
    Shape {
        entries: 5,
        files: 3,
        directories: 2,
        root_depth: 2,
        edges: 8,
        chunks: 3,
        bytes: 4590,
    }
}
#[test]
fn current_kernel_quantities_are_nine_work_and_not_a_quota() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let old = (b.used, b.reserved, b.retries_left, b.started);
    let q = calculate(&basic(), MODEL_ID, &mut b).unwrap();
    assert_eq!(q.base, [63, 14, 6, 657, 136]);
    assert_eq!(q.snapshots, 73);
    assert_eq!(sum(&q.base), Ok(876));
    assert_eq!(q.round, [63, 15, 15, 657, 136]);
    assert_eq!(q.three, [189, 43, 27, 1971, 408]);
    assert_eq!((q.round_total, q.three_total), (885, 2637));
    assert_eq!((q.xattr_round, q.xattr_three), (67048, 70114));
    assert_eq!(
        (q.enum_buffer_three, q.payload_three),
        (43 * 255, 3 * (4590 + 3))
    );
    assert_eq!((q.peak_owners, q.retries), (5, 8));
    assert_eq!(b.json_work, 9);
    assert_eq!((b.used, b.reserved, b.retries_left, b.started), old);
    assert_eq!(
        format!("{q:?}"),
        "ScanResourceQuantities(not_policy_or_admission_authority)"
    );
}

#[test]
fn wide_arithmetic_oracle_and_shared_retry_are_independent_of_round_reset() {
    for (e, d, h, k, c, bytes) in [
        (1, 0, 1, 1, 1, 1),
        (5, 2, 2, 8, 3, 4590),
        (100_001, 50_000, 64, 6_400_064, 65536, MAX_BYTES),
    ] {
        for r in 0..=8 {
            let s = Shape {
                entries: e,
                directories: d,
                files: e - d,
                root_depth: h,
                edges: k,
                chunks: c,
                bytes,
            };
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            b.retries_left = r;
            let q = calculate(&s, MODEL_ID, &mut b).unwrap();
            let (e, d, f, h, k, c) = (
                e as u128,
                d as u128,
                (e - d) as u128,
                h as u128,
                k as u128,
                c as u128,
            );
            let paths = (e * 2 + 3) * (h + 1) + 2 * k;
            let o = paths + d + 1 + e;
            let m = paths + e + 2 * (d + 1) + 2 * f + 1;
            let expected =
                [o, e + 3 * (d + 1), c + f, 9 * m, o + m].map(|x| u64::try_from(x).unwrap());
            assert_eq!(q.base, expected);
            assert_eq!(q.xattr_round, u64::try_from(21 * (m - 1) + 65536).unwrap());
            assert_eq!(
                q.xattr_three,
                u64::try_from(21 * (3 * m - 1) + 65536).unwrap()
            );
            assert_eq!(
                q.three_total,
                3 * expected.iter().sum::<u64>() + u64::from(r) + 1
            );
            assert_eq!(q.three[2], 3 * expected[2] + u64::from(r) + 1);
            assert_eq!(sum(&q.three).unwrap(), q.three_total + 1); // independent per-kind terminal tails
            assert_eq!(q.peak_owners, 5); // never 3*5
            assert_eq!(b.retries_left, r);
        }
    }
}

#[test]
fn xattr_policy_and_terminal_copy_are_versioned_not_an_unconditional_capacity_product() {
    assert_eq!(xattr_bound(0), Err(Failure::Binding));
    assert_eq!(xattr_bound(1), Ok(65536));
    assert_eq!(xattr_bound(73), Ok(67048));
    assert_eq!(xattr_bound(137538), Ok(2953813));
    assert_eq!(xattr_bound(u64::MAX), Err(Failure::Limit));
    assert_eq!(normalized_metadata::ALLOWED_NONEMPTY_NAMES.len(), 21);
    for (policy, allowed, capacity) in [
        ("unknown", &b"com.apple.provenance\0"[..], 65536),
        (XATTR_POLICY_ID, &b"com.apple.quarantine\0"[..], 65536),
        (
            XATTR_POLICY_ID,
            &b"com.apple.provenance\0other\0"[..],
            65536,
        ),
        (XATTR_POLICY_ID, &b"com.apple.provenance\0"[..], 65537),
    ] {
        assert_eq!(
            xattr_contract(policy, allowed, capacity),
            Err(Failure::Unavailable)
        );
    }
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert!(matches!(
        calculate(&basic(), "bp5-r2-scan-resource-0.1", &mut b),
        Err(Failure::Unavailable)
    ));
}

#[test]
fn malformed_shapes_and_unknown_model_stop_without_fallback() {
    for case in 0..12 {
        let mut s = basic();
        let expected = if case == 0 { "old-model" } else { MODEL_ID };
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        match case {
            1 => s.entries = 0,
            2 => s.entries = 100_002,
            3 => s.files = 0,
            4 => s.directories = 4,
            5 => s.root_depth = 65,
            6 => s.edges = 4,
            7 => s.edges = 321,
            8 => s.bytes = 0,
            9 => s.chunks = 0,
            10 => s.chunks = s.bytes + 1,
            11 => b.retries_left = 9,
            _ => {}
        }
        let reason = if case == 0 {
            Failure::Unavailable
        } else {
            Failure::Binding
        };
        assert!(matches!(calculate(&s,expected,&mut b),Err(e) if e==reason));
        let spent = b.json_work;
        assert!(matches!(calculate(&basic(),MODEL_ID,&mut b),Err(e) if e==reason));
        assert_eq!(b.json_work, spent);
    }
}

#[test]
fn checked_arithmetic_never_saturates_or_wraps() {
    assert_eq!(add(u64::MAX, 1), Err(Failure::Limit));
    assert_eq!(mul(u64::MAX, 2), Err(Failure::Limit));
    assert_eq!(sum(&[u64::MAX, 1, 0, 0, 0]), Err(Failure::Limit));
    assert_eq!(add(u64::MAX, 0), Ok(u64::MAX));
    let mut s = basic();
    s.files = u64::MAX;
    s.directories = 1;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert!(matches!(
        calculate(&s, MODEL_ID, &mut b),
        Err(Failure::Limit)
    ));
    assert_eq!(b.failed, Some(Failure::Limit));
}

#[test]
fn every_insufficient_work_prefix_stops_without_replenishment() {
    for left in 0..9 {
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        b.json_work = 1_000_000 - left;
        assert!(matches!(
            calculate(&basic(), MODEL_ID, &mut b),
            Err(Failure::Limit)
        ));
        assert_eq!(b.json_work, 1_000_000);
        assert_eq!((b.used, b.reserved, b.retries_left), (0, 0, 8));
    }
}

#[test]
fn all_nine_post_charge_cancellations_keep_the_spent_prefix() {
    for at in 1..=9 {
        let cancel = Rc::new(AtomicBool::new(false));
        let audit = Audit::default();
        audit.cancel_after_work(at, cancel.clone());
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        b.work_audit = Some(audit);
        assert!(matches!(
            calculate(&basic(), MODEL_ID, &mut b),
            Err(Failure::Cancelled)
        ));
        assert_eq!(b.json_work, at);
        assert_eq!(b.failed, Some(Failure::Cancelled));
    }
}

#[test]
fn all_row_terminal_deadlines_and_preexisting_stop_fail_closed() {
    for at in 1..=9 {
        let cancel = AtomicBool::new(false);
        let start = Instant::now();
        let ticks = Cell::new(0);
        // work has pre/post checks, then row has its own terminal checkpoint.
        let clock = || {
            ticks.set(ticks.get() + 1);
            if ticks.get() == 3 * at {
                start + Duration::from_secs(10)
            } else {
                start
            }
        };
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &clock;
        assert!(matches!(
            calculate(&basic(), MODEL_ID, &mut b),
            Err(Failure::Deadline)
        ));
        assert_eq!(b.json_work, at);
    }
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.failed = Some(Failure::HashMismatch);
    assert!(matches!(
        calculate(&basic(), MODEL_ID, &mut b),
        Err(Failure::HashMismatch)
    ));
    assert_eq!(b.json_work, 0);
}
