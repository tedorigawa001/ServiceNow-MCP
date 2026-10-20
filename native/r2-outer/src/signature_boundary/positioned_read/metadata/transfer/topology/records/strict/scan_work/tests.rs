use super::*;
use std::cell::Cell;

fn small() -> Shape {
    Shape {
        files: 2,
        directories: 2,
        parents: 3,
        root_depth: 2,
        index_bytes: 65536,
        file_bytes: 3 * 65536,
        chunks: 3,
    }
}
#[test]
fn documented_example_has_exact_histogram_components_and_twelve_calculation_units() {
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let mut b = SharedBudget::new(start, &stop);
    let e = estimate(&small(), MODEL_ID, &mut b).unwrap();
    let o = &e.operations;
    let c = &e.costs;
    assert_eq!(
        (o.entries, o.files, o.directories, o.relative_edges, o.walks),
        (5, 3, 3, 8, 12)
    );
    assert_eq!(
        (
            o.walk_opens,
            o.opens,
            o.snapshots,
            o.yields,
            o.enum_attempts
        ),
        (52, 55, 61, 12, 15)
    );
    assert_eq!(
        (o.read_base, o.cleanup, o.live_base, o.total_base),
        (6, 116, 625, 741)
    );
    assert_eq!((o.round_with_retries, o.three_with_retries), (749, 2231));
    assert_eq!(
        (
            c.expected,
            c.open_close,
            c.metadata,
            c.enumeration,
            c.missing
        ),
        (20, 110, 1098, 69, 5)
    );
    assert_eq!(
        (c.reads_base, c.hashing, c.observed, c.fixed),
        (12, 12, 20, 16)
    );
    assert_eq!(
        (c.round_base, c.round_with_retries, c.three_with_retries),
        (1362, 1378, 4102)
    );
    assert_eq!(
        (c.payload_round, c.payload_three, c.name_copy_three),
        (196611, 589833, 11993088)
    );
    assert_eq!(b.json_work, CALCULATION_WORK);
    assert_eq!(b.started, start);
    assert_eq!(b.retries_left, 8);
    assert_eq!(
        (
            b.used,
            b.reserved,
            b.metadata_calls,
            b.topology_calls,
            b.metadata_name_bytes
        ),
        (0, 0, 0, 0, 0)
    );
    assert_eq!(
        format!("{e:?}"),
        "ScanWork(arithmetic_only_not_collector_or_admission_authority)"
    );
}
#[test]
fn three_scans_share_remaining_eintr_once_and_do_not_consume_it() {
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    for r in 0..=8 {
        b.retries_left = r;
        let e = estimate(&small(), MODEL_ID, &mut b).unwrap();
        assert_eq!(e.costs.three_with_retries, 3 * 1362 + 2 * u64::from(r));
        assert_eq!(e.operations.three_with_retries, 3 * 741 + u64::from(r));
        assert_eq!(e.costs.round_with_retries, 1362 + 2 * u64::from(r));
        assert_eq!(b.retries_left, r);
    }
    assert_eq!(b.json_work, 9 * 12);
}
#[test]
fn independent_planned_schedule_interpreter_matches_the_proposed_work_and_operations() {
    // Test-only prescribed schedule, NOT an implementation or validation of the OS collector.
    let depths = [1, 2, 1, 3, 1]; // directory a, directory a/b, node, a/b/script, index
    let root_depth = 2;
    let mut opens = 0;
    let mut snapshots = 0;
    for depth in std::iter::once(0).chain(depths) {
        for _ in 0..2 {
            // fresh anchor, root path, relative path
            opens += 1;
            snapshots += 1;
            for _ in 0..root_depth + depth {
                opens += 1;
                snapshots += 1;
            }
        }
    }
    let directories = 3;
    let files = 3;
    for _ in 0..directories {
        opens += 1;
        snapshots += 2;
    } // cursor binding and post-enumeration
    for _ in 0..files {
        snapshots += 1;
    } // post-read
    let mut work = 16;
    let mut cleanup = 0;
    let mut live = 0;
    for _ in 0..opens {
        work += 2;
        live += 1;
        cleanup += 1;
    }
    for _ in 0..snapshots {
        work += 18;
        live += 9;
        cleanup += 1;
    }
    let yields = depths.len() + 2 * directories + 1;
    for _ in 0..yields {
        work += 2 + 3;
        live += 1;
    }
    for _ in 0..directories {
        work += 2 + 1;
        live += 1;
    }
    for _ in &depths {
        work += 4 + 1 + 4;
    } // expected, missing, observed
    for _ in 0..3 {
        work += 2 + 2;
        live += 1;
    } // chunk read/classification and hash/progress
    for _ in 0..files {
        work += 2 + 2;
        live += 1;
    } // EOF attempt + validation/digest
    for _ in 0..8 {
        work += 2;
        live += 1;
    } // original shared EINTR allowance, only once
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    let e = estimate(&small(), MODEL_ID, &mut b).unwrap();
    assert_eq!(work, e.costs.round_with_retries as usize);
    assert_eq!(live + cleanup, e.operations.round_with_retries as usize);
    assert_eq!(cleanup, e.operations.cleanup as usize);
}
#[test]
fn structural_envelope_accepts_inclusive_edges_without_claiming_a_valid_index() {
    let stop = AtomicBool::new(false);
    for depth in [1, 64] {
        for index_bytes in [1, 65535, 65536, 65537, 16 * 1024 * 1024] {
            let s = Shape {
                files: 100000,
                directories: 0,
                parents: 63 * 100001,
                root_depth: depth,
                index_bytes,
                file_bytes: index_bytes,
                chunks: index_bytes.div_ceil(65536),
            };
            let mut b = SharedBudget::new(Instant::now(), &stop);
            let e = estimate(&s, MODEL_ID, &mut b).unwrap();
            assert!(e.costs.three_with_retries > WORK_CAP);
            assert_eq!(e.operations.entries, 100001);
        }
    }
    let s = Shape {
        files: 0,
        directories: 0,
        parents: 0,
        root_depth: 1,
        index_bytes: 1,
        file_bytes: 1,
        chunks: 1,
    };
    let mut b = SharedBudget::new(Instant::now(), &stop);
    estimate(&s, MODEL_ID, &mut b).unwrap();
}
#[test]
fn invalid_shapes_are_typed_limits_and_shared_budget_latches_before_any_operation() {
    let stop = AtomicBool::new(false);
    for case in 0..14 {
        let mut s = small();
        match case {
            0 => s.files = 100001,
            1 => s.root_depth = 0,
            2 => s.root_depth = 65,
            3 => s.parents = 316,
            4 => s.index_bytes = 0,
            5 => s.index_bytes = 16 * 1024 * 1024 + 1,
            6 => s.file_bytes = s.index_bytes - 1,
            7 => s.file_bytes = MAX_BYTES + 1,
            8 => {
                s.files = 0;
                s.file_bytes = s.index_bytes + 1;
            }
            9 => s.chunks = 0,
            10 => s.chunks = 2,
            11 => s.chunks = 6,
            12 => {
                s.files = 1;
                s.file_bytes = s.index_bytes + MAX_FILE + 1;
            }
            _ => {
                s.index_bytes = 65537;
                s.file_bytes = 65537;
                s.chunks = 1;
            }
        }
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            calculate(&s, MODEL_ID, &mut b).err(),
            Some(Error::Limit(Limit::Shape)),
            "case={case}"
        );
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(estimate(&s, MODEL_ID, &mut b).err(), Some(Failure::Limit));
        assert_eq!(b.failed, Some(Failure::Limit));
        assert_eq!(
            (b.used, b.reserved, b.metadata_calls, b.topology_calls),
            (0, 0, 0, 0)
        );
    }
}
#[test]
fn byte_and_chunk_envelope_includes_empty_files_and_per_file_caps() {
    let stop = AtomicBool::new(false);
    for (files, bytes, chunks) in [
        (2, 65538, 3),
        (2, 65536, 1),
        (1, 65536 + MAX_FILE, 8193),
        (4, MAX_BYTES, 32768),
    ] {
        let s = Shape {
            files,
            directories: 0,
            parents: 0,
            root_depth: 1,
            index_bytes: 65536,
            file_bytes: bytes,
            chunks,
        };
        let mut b = SharedBudget::new(Instant::now(), &stop);
        estimate(&s, MODEL_ID, &mut b).unwrap();
    }
}
#[test]
fn arithmetic_overflow_and_corrupt_retry_snapshot_are_distinct_internal_limits() {
    assert_eq!(add(u64::MAX, 1), Err(Error::Limit(Limit::Overflow)));
    assert_eq!(mul(u64::MAX, 3), Err(Error::Limit(Limit::Overflow)));
    assert_eq!(sum(&[u64::MAX, 1]), Err(Error::Limit(Limit::Overflow)));
    let stop = AtomicBool::new(false);
    let mut s = small();
    s.files = u64::MAX;
    let mut b = SharedBudget::new(Instant::now(), &stop);
    assert_eq!(
        calculate(&s, MODEL_ID, &mut b).err(),
        Some(Error::Limit(Limit::Overflow))
    );
    let mut b = SharedBudget::new(Instant::now(), &stop);
    b.retries_left = 9;
    assert_eq!(
        calculate(&small(), MODEL_ID, &mut b).err(),
        Some(Error::Limit(Limit::Retry))
    );
}
#[test]
fn unknown_models_and_guard_binding_are_fail_closed() {
    let stop = AtomicBool::new(false);
    for model in ["", "unknown", "bp5-r2-scan-work-0.2"] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            estimate(&small(), model, &mut b).err(),
            Some(Failure::Unavailable)
        );
        assert_eq!(b.json_work, 1);
    }
    for case in 0..4 {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let mut e = estimate(&small(), MODEL_ID, &mut b).unwrap();
        let before = b.json_work;
        match case {
            0 => {
                e.require(MODEL_ID, &mut b).unwrap();
                assert_eq!(b.json_work - before, 1);
            }
            1 => {
                let mut other = SharedBudget::new(Instant::now(), &stop);
                assert_eq!(e.require(MODEL_ID, &mut other), Err(Failure::Binding));
            }
            2 => {
                b.retries_left -= 1;
                assert_eq!(e.require(MODEL_ID, &mut b), Err(Failure::Changed));
            }
            _ => {
                e.id = "corrupt";
                assert_eq!(e.require(MODEL_ID, &mut b), Err(Failure::Unavailable));
            }
        }
    }
}
#[test]
fn quantity_cap_check_is_inclusive_and_is_not_spent_accounting_or_admission() {
    let stop = AtomicBool::new(false);
    for available in [4101, 4102, WORK_CAP, WORK_CAP + 1] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let e = estimate(&small(), MODEL_ID, &mut b).unwrap();
        let before = b.json_work;
        let result = e.check_work_cap(MODEL_ID, available, &mut b);
        if available == 4102 || available == WORK_CAP {
            assert!(result.is_ok());
        } else {
            assert_eq!(result, Err(Failure::Limit));
        }
        assert_eq!(b.json_work - before, 2);
        assert_eq!(b.reserved, 0);
    }
    let mut b = SharedBudget::new(Instant::now(), &stop);
    let e = estimate(&small(), MODEL_ID, &mut b).unwrap();
    b.json_work = 999998;
    e.check_work_cap(MODEL_ID, 4102, &mut b).unwrap();
    assert_eq!(b.json_work, 1_000_000); // helper does NOT authorize another work unit
    assert_eq!(e.require(MODEL_ID, &mut b), Err(Failure::Limit));
}
#[test]
fn calculator_work_exact_boundary_overflow_and_original_failure_are_preserved() {
    let stop = AtomicBool::new(false);
    for spent in [999988, 999989, u64::MAX] {
        let mut b = SharedBudget::new(Instant::now(), &stop);
        b.json_work = spent;
        if spent == 999988 {
            estimate(&small(), MODEL_ID, &mut b).unwrap();
            assert_eq!(b.json_work, 1_000_000);
        } else {
            assert_eq!(
                estimate(&small(), MODEL_ID, &mut b).err(),
                Some(Failure::Limit)
            );
            assert_eq!(b.failed, Some(Failure::Limit));
        }
    }
    let mut b = SharedBudget::new(Instant::now(), &stop);
    b.failed = Some(Failure::HashMismatch);
    assert_eq!(
        estimate(&small(), "bad", &mut b).err(),
        Some(Failure::HashMismatch)
    );
    assert_eq!(b.json_work, 0);
}
#[test]
fn every_calculation_clock_point_preserves_deadline_and_cancel_with_caller_guard() {
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let count = Cell::new(0);
    let now = || {
        count.set(count.get() + 1);
        start
    };
    let mut b = SharedBudget::new(start, &stop);
    b.now = &now;
    estimate(&small(), MODEL_ID, &mut b).unwrap();
    let total = count.get();
    for cancelled in [false, true] {
        for fail in 1..=total {
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
            let mut b = SharedBudget::new(start, &stop);
            b.now = &now;
            // cancel is checked before now(); the caller guard discards the final-clock late success.
            let result = estimate(&small(), MODEL_ID, &mut b).and_then(|e| {
                b.checkpoint()?;
                Ok(e)
            });
            let reason = if cancelled {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            assert_eq!(result.err(), Some(reason));
            assert_eq!(b.failed, Some(reason));
        }
    }
}
#[test]
fn realistic_scale_examples_are_computable_but_cannot_pass_the_existing_work_cap() {
    let stop = AtomicBool::new(false);
    for (parents, depth, chunks, snapshots, work) in [
        (22000, 5, 6000, 127529, 2671628),
        (0, 1, 4501, 39513, 905312),
    ] {
        let s = Shape {
            files: 4500,
            directories: 1000,
            parents,
            root_depth: depth,
            index_bytes: 65536,
            file_bytes: chunks * 65536,
            chunks,
        };
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let e = estimate(&s, MODEL_ID, &mut b).unwrap();
        assert_eq!(e.operations.snapshots, snapshots);
        assert_eq!(e.costs.round_base, work);
        assert_eq!(e.costs.three_with_retries, 3 * work + 16);
        assert_eq!(
            e.check_work_cap(MODEL_ID, WORK_CAP, &mut b),
            Err(Failure::Limit)
        );
    }
}

#[test]
fn preexisting_independent_ledgers_and_spent_are_not_reset_or_borrowed() {
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let mut b = SharedBudget::new(start, &stop);
    b.json_work = 37;
    b.used = 17;
    b.reserved = 29;
    b.metadata_calls = 11;
    b.metadata_cleanup_reserved = 1;
    b.metadata_name_bytes = 23;
    b.topology_calls = 31;
    b.retries_left = 3;
    let origin = b.inspection_origin.clone();
    for _ in 0..2 {
        let e = estimate(&small(), MODEL_ID, &mut b).unwrap();
        assert_eq!(e.costs.three_with_retries, 4092);
    }
    assert_eq!(b.json_work, 37 + 2 * 12);
    assert_eq!(b.started, start);
    assert!(Rc::ptr_eq(&origin, &b.inspection_origin));
    assert_eq!(
        (
            b.used,
            b.reserved,
            b.metadata_calls,
            b.metadata_cleanup_reserved,
            b.metadata_name_bytes,
            b.topology_calls,
            b.retries_left
        ),
        (17, 29, 11, 1, 23, 31, 3)
    );
}
