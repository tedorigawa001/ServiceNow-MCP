use super::*;

fn declaration(size: u64) -> closure::Entry {
    closure::Entry::File {
        path: "file".into(),
        mode: "0444".into(),
        size,
        sha256: "a".repeat(64),
    }
}
fn observed(state: &Rc<RefCell<State>>, size: u64) {
    let mut value = stat();
    value.size = size;
    state.borrow_mut().metadata_value = Some(MetaValue::Stat(value));
}

#[test]
fn empty_single_and_multichunk_files_have_exact_positions() {
    for size in [0, 1, 4, MAX_CHUNK as u64, MAX_CHUNK as u64 + 3] {
        let (source, state, stop, tick) = fixture();
        observed(&state, size);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(size);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            assert_eq!(
                format!("{file:?}"),
                "DeclaredScanFile(pending_not_execution_authority)"
            );
            let mut offset = 0;
            let mut data = [0; MAX_CHUNK];
            while offset < size {
                let n = (size - offset).min(MAX_CHUNK as u64) as usize;
                assert_eq!(
                    s.read_declared(&mut file, offset, &mut data[..n])?,
                    ReadStep::Complete
                );
                offset += n as u64;
            }
            state.borrow_mut().reads.push_back(Ok(0));
            observed(&state, size);
            s.eof_declared(&mut file, size, &mut [0]).map(|_| ())
        });
        assert_eq!(out.result, Ok(()));
        let mut requests = Vec::new();
        let mut offset = 0;
        while offset < size {
            let n = (size - offset).min(MAX_CHUNK as u64) as usize;
            requests.push((2, offset, n));
            offset += n as u64;
        }
        requests.push((2, size, 1));
        assert_eq!(state.borrow().read_requests, requests);
        assert_eq!(b.used, size);
        assert_eq!(state.borrow().counts[3], 2); // before + after stat
        assert_eq!((out.summary.declared_pending, out.summary.live), (0, 0));
        assert!(!state.borrow().duplicate);
    }
}

#[test]
fn invalid_range_or_early_eof_never_calls_read_source() {
    for case in 0..8 {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            match case {
                0 => s.read_declared(&mut file, 1, &mut [0; 4]),
                1 => s.read_declared(&mut file, 0, &mut [0; 5]),
                2 => s.read_declared(&mut file, 0, &mut [0; 3]),
                3 => s.read_declared(&mut file, 0, &mut []),
                4 => s.read_declared(&mut file, u64::MAX, &mut [0; 4]),
                5 => s.eof_declared(&mut file, 4, &mut [0]),
                6 => s.eof_declared(&mut file, 0, &mut [0]),
                _ => s.eof_declared(&mut file, 5, &mut [0]),
            }
            .map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::InvalidRange));
        assert_eq!(state.borrow().counts, [2, 0, 0, 1, 2]);
        assert_eq!(b.used, 0);
    }
}

#[test]
fn short_reads_charge_actual_bytes_and_stop_without_refill() {
    for n in [0, 1, 3, 5] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.extend([Ok(n), Ok(4)]);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            s.read_declared(&mut file, 0, &mut [0; 4]).map(|_| ())
        });
        assert_eq!(
            out.result,
            Err(if n > 4 {
                Failure::ReadFailed
            } else {
                Failure::Changed
            })
        );
        assert_eq!(state.borrow().counts, [2, 0, 1, 1, 2]);
        assert_eq!(state.borrow().reads.len(), 1);
        assert_eq!(b.used, n.min(4) as u64);
    }
}

#[test]
fn initial_size_or_file_type_mismatch_rejects_before_read() {
    for case in 0..4 {
        let (source, state, stop, tick) = fixture();
        let mut value = stat();
        match case {
            0 => value.size = 3,
            1 => value.size = 5,
            2 => value.kind = FileType::Directory,
            _ => value.kind = FileType::Symlink,
        }
        state.borrow_mut().metadata_value = Some(MetaValue::Stat(value));
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.bind_declared(&f, &entry).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(state.borrow().counts, [2, 0, 0, 1, 2]);
        assert_eq!(out.summary.declared_pending, 0);
    }
}

#[test]
fn size_or_stat_change_after_eof_never_completes_binding() {
    for case in 0..5 {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            s.read_declared(&mut file, 0, &mut [0; 4])?;
            let mut after = stat();
            match case {
                0 => after.size = 3,
                1 => after.size = 5,
                2 => after.inode += 1,
                3 => after.mtime.seconds += 1,
                _ => after.mode = 0o777,
            }
            state.borrow_mut().metadata_value = Some(MetaValue::Stat(after));
            s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(out.summary.declared_pending, 1);
        assert_eq!(state.borrow().counts, [2, 0, 2, 2, 2]);
    }
}

#[test]
fn growth_at_eof_stops_before_post_stat_and_charges_probe_byte() {
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().reads.extend([Ok(4), Ok(1)]);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let entry = declaration(4);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let mut file = s.bind_declared(&f, &entry)?;
        s.read_declared(&mut file, 0, &mut [0; 4])?;
        s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::Changed));
    assert_eq!(b.used, 5);
    assert_eq!(state.borrow().counts, [2, 0, 2, 1, 2]);
}

#[test]
fn retries_keep_same_position_for_data_and_eof() {
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().reads.extend([
        Err(OpFailure::Interrupted),
        Ok(4),
        Err(OpFailure::Interrupted),
        Ok(0),
    ]);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let entry = declaration(4);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let mut file = s.bind_declared(&f, &entry)?;
        assert_eq!(
            s.read_declared(&mut file, 0, &mut [0; 4])?,
            ReadStep::Interrupted
        );
        assert_eq!(
            s.read_declared(&mut file, 0, &mut [0; 4])?,
            ReadStep::Complete
        );
        assert_eq!(
            s.eof_declared(&mut file, 4, &mut [0])?,
            ReadStep::Interrupted
        );
        s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
    });
    assert_eq!(out.result, Ok(()));
    assert_eq!(
        state.borrow().read_requests,
        [(2, 0, 4), (2, 0, 4), (2, 4, 1), (2, 4, 1)]
    );
    assert_eq!((b.retries_left, b.used), (6, 4));
    assert_eq!(out.summary.declared_pending, 0);
}

#[test]
fn unfinished_and_double_binding_or_completed_reuse_are_rejected() {
    for case in 0..5 {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            if case == 0 {
                drop(file);
                assert_eq!(
                    s.metadata(&f, MetaOp::Stat, &mut []).map(|_| ()),
                    Err(Failure::Changed)
                );
                assert_eq!(state.borrow().counts[3], 1);
                return Ok(());
            }
            if case == 1 {
                return s.bind_declared(&f, &entry).map(|_| ());
            }
            s.read_declared(&mut file, 0, &mut [0; 4])?;
            if case == 2 {
                return Ok(());
            }
            s.eof_declared(&mut file, 4, &mut [0])?;
            if case == 3 {
                s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
            } else {
                s.read_declared(&mut file, 0, &mut [0; 4]).map(|_| ())
            }
        });
        assert_eq!(
            out.result,
            Err(if case == 0 || case == 2 {
                Failure::Changed
            } else {
                Failure::Binding
            })
        );
        assert_eq!(out.summary.live, 0);
        assert!(!state.borrow().duplicate);
    }
}

#[test]
fn invalid_declaration_or_oversize_is_rejected_before_stat() {
    for entry in [
        declaration(MAX_FILE + 1),
        declaration(u64::MAX),
        closure::Entry::Directory {
            path: "file".into(),
            mode: "0555".into(),
        },
    ] {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.bind_declared(&f, &entry).map(|_| ())
        });
        assert!(matches!(out.result, Err(Failure::Limit | Failure::Binding)));
        assert_eq!(state.borrow().counts, [2, 0, 0, 0, 2]);
    }
}

#[test]
fn cancellation_at_each_io_keeps_reason_bytes_and_cleanup() {
    for hook in [Hook::Cancel, Hook::Deadline] {
        for at in 1..=6 {
            // anchor, file, before-stat, data, EOF, after-stat
            let (source, state, stop, tick) = fixture();
            state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
            state.borrow_mut().at = Some((at, hook));
            let now = || tick.get();
            let mut b = SharedBudget::new(tick.get(), &stop);
            b.now = &now;
            let entry = declaration(4);
            let out = with_boundary(source, Some(quotas()), &mut b, |s| {
                let a = s.acquire(None, None, Kind::Anchor)?;
                let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
                let mut file = s.bind_declared(&f, &entry)?;
                s.read_declared(&mut file, 0, &mut [0; 4])?;
                s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
            });
            assert_eq!(
                out.result,
                Err(match hook {
                    Hook::Cancel => Failure::Cancelled,
                    Hook::Deadline => Failure::Deadline,
                })
            );
            assert_eq!(b.used, if at >= 4 { 4 } else { 0 });
            assert_eq!(out.summary.live, 0);
            assert_eq!(state.borrow().counts[0], state.borrow().counts[4]);
            assert!(!state.borrow().duplicate);
        }
    }
}

#[test]
fn post_data_wrong_eof_or_rewind_never_adds_an_io_attempt() {
    for case in 0..4 {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            s.read_declared(&mut file, 0, &mut [0; 4])?;
            if case == 0 {
                s.read_declared(&mut file, 0, &mut [0; 4]).map(|_| ())
            } else {
                s.eof_declared(&mut file, [0, 3, 5, u64::MAX][case], &mut [0])
                    .map(|_| ())
            }
        });
        assert_eq!(out.result, Err(Failure::InvalidRange));
        assert_eq!(state.borrow().read_requests, [(2, 0, 4)]);
    }
}

#[test]
fn short_tail_does_not_advance_or_issue_eof() {
    let size = MAX_CHUNK as u64 + 3;
    let (source, state, stop, tick) = fixture();
    observed(&state, size);
    state
        .borrow_mut()
        .reads
        .extend([Ok(MAX_CHUNK), Ok(2), Ok(0)]);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let entry = declaration(size);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let mut file = s.bind_declared(&f, &entry)?;
        s.read_declared(&mut file, 0, &mut [0; MAX_CHUNK])?;
        s.read_declared(&mut file, MAX_CHUNK as u64, &mut [0; 3])
            .map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::Changed));
    assert_eq!(b.used, MAX_CHUNK as u64 + 2);
    assert_eq!(
        state.borrow().read_requests,
        [(2, 0, MAX_CHUNK), (2, MAX_CHUNK as u64, 3)]
    );
    assert_eq!(state.borrow().reads.len(), 1);
}

#[test]
fn stat_failure_is_not_size_match_and_first_reason_is_retained() {
    for after in [false, true] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
        if !after {
            state.borrow_mut().metadata_failure = Some(OpFailure::Unavailable);
        }
        let mut b = SharedBudget::new(tick.get(), &stop);
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            s.read_declared(&mut file, 0, &mut [0; 4])?;
            state.borrow_mut().metadata_failure = Some(OpFailure::Interrupted);
            s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::MetadataUnavailable));
        assert_eq!(b.retries_left, 8);
        assert_eq!(state.borrow().counts[2], if after { 2 } else { 0 });
        assert_eq!(out.summary.live, 0);
    }
}

#[test]
fn exact_shared_work_cost_and_each_exhaustion_prefix_release_handles() {
    for available in 0..=17 {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
        let mut b = SharedBudget::new(tick.get(), &stop);
        b.json_work = 1_000_000 - available;
        let entry = declaration(4);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry)?;
            s.read_declared(&mut file, 0, &mut [0; 4])?;
            s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
        });
        assert_eq!(
            out.result,
            if available == 17 {
                Ok(())
            } else {
                Err(Failure::Limit)
            }
        );
        assert!(b.json_work <= 1_000_000);
        assert_eq!(state.borrow().counts[0], state.borrow().counts[4]);
        assert_eq!(out.summary.live, 0);
    }
}

#[test]
fn size_cap_is_inclusive_and_foreign_ledger_binding_is_rejected() {
    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let (other, state, _, _) = fixture();
    let entry = declaration(4);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        // A normal nested generative scope cannot accept f (E0521). Deliberately forge a
        // same-lifetime private test boundary to exercise the runtime source/ledger guard.
        let mut inner = Boundary {
            marker: s.marker,
            source: Rc::new(RefCell::new(other)),
            ledger: Rc::new(RefCell::new(Ledger::default())),
            quotas: quotas(),
            budget: s.budget,
        };
        inner.bind_declared(&f, &entry).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::Binding));
    assert_eq!(state.borrow().counts, [0; 5]);
    let (source, state, stop, tick) = fixture();
    observed(&state, MAX_FILE);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let entry = declaration(MAX_FILE);
    let bound = Cell::new(false);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        let _file = s.bind_declared(&f, &entry)?;
        bound.set(true);
        Ok(()) // Intentionally unfinished: cap acceptance does not prove a completed read.
    });
    assert!(bound.get());
    assert_eq!(out.result, Err(Failure::Changed));
    assert_eq!(state.borrow().counts, [2, 0, 0, 1, 2]);
}

#[test]
fn matched_child_visitor_can_complete_a_size_bound_read_on_same_resource() {
    use super::super::child_set::ExpectedChild;
    let (source, state, stop, tick) = fixture();
    state
        .borrow_mut()
        .names
        .push_back(Ok(Some(b"file".to_vec())));
    state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let entry = declaration(4);
    let expected = [ExpectedChild {
        name: "file",
        kind: Kind::File,
    }];
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        s.children(&a, &expected, |s, i, f| {
            assert_eq!(i, 0);
            let mut file = s.bind_declared(&f, &entry)?;
            s.read_declared(&mut file, 0, &mut [0; 4])?;
            s.eof_declared(&mut file, 4, &mut [0]).map(|_| ())
        })
    });
    assert_eq!(out.result, Ok(()));
    assert_eq!(state.borrow().counts, [3, 2, 2, 2, 3]);
    assert_eq!(state.borrow().read_requests, [(3, 0, 4), (3, 4, 1)]);
    assert_eq!((out.summary.live, out.summary.declared_pending), (0, 0));
    assert_eq!(b.json_work, 32);
}
