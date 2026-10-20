use super::*;
use std::{cell::Cell, collections::VecDeque};

mod children;
mod declared;

struct Raw(u64); // Not Clone, not a descriptor; no OS objects in the synthetic source.
#[derive(Clone, Copy)]
enum Hook {
    Cancel,
    Deadline,
}
struct State {
    counts: [u64; 5],
    next: u64,
    released: Vec<u64>,
    duplicate: bool,
    reads: VecDeque<Result<usize, OpFailure>>,
    read_requests: Vec<(u64, u64, usize)>,
    names: VecDeque<Result<Option<Vec<u8>>, OpFailure>>,
    open_failure: Option<OpFailure>,
    acl_failure: Option<OpFailure>,
    metadata_failure: Option<OpFailure>,
    metadata_value: Option<MetaValue>,
    cleanup: VecDeque<Cleanup>,
    at: Option<(u64, Hook)>,
    stop: Rc<AtomicBool>,
    tick: Rc<Cell<Instant>>,
    start: Instant,
}
struct Fake(Rc<RefCell<State>>);
impl Fake {
    fn call(&mut self, op: Op) {
        let mut s = self.0.borrow_mut();
        s.counts[op as usize] += 1;
        if let Some((at, hook)) = s.at
            && s.counts.iter().sum::<u64>() == at
        {
            match hook {
                Hook::Cancel => s.stop.store(true, Ordering::Release),
                Hook::Deadline => s.tick.set(s.start + Duration::from_secs(10)),
            }
        }
    }
    fn raw(&mut self) -> Raw {
        let mut s = self.0.borrow_mut();
        s.next += 1;
        Raw(s.next)
    }
}
fn stat() -> Stat {
    Stat {
        device: 1,
        inode: 2,
        kind: FileType::Regular,
        uid: 0,
        gid: 0,
        mode: 0o555,
        links: 1,
        size: 4,
        mtime: Timestamp {
            seconds: 0,
            nanoseconds: 0,
        },
        ctime: Timestamp {
            seconds: 0,
            nanoseconds: 0,
        },
    }
}
impl ScanOps for Fake {
    type Handle = Raw;
    fn open(&mut self, _: Option<&Raw>, _: Option<&str>, _: Kind) -> Result<Raw, OpFailure> {
        self.call(Op::Open);
        let fail = self.0.borrow_mut().open_failure.take();
        if let Some(e) = fail {
            Err(e)
        } else {
            Ok(self.raw())
        }
    }
    fn acl_init(&mut self, _: &Raw) -> Result<Raw, OpFailure> {
        self.call(Op::Metadata);
        let fail = self.0.borrow_mut().acl_failure.take();
        if let Some(e) = fail {
            Err(e)
        } else {
            Ok(self.raw())
        }
    }
    fn enumerate(&mut self, _: &Raw, out: &mut [u8; 255]) -> Result<EnumValue, OpFailure> {
        self.call(Op::Enum);
        match self.0.borrow_mut().names.pop_front().unwrap_or(Ok(None)) {
            Ok(Some(v)) => {
                let n = v.len().min(out.len());
                out[..n].copy_from_slice(&v[..n]);
                Ok(EnumValue::Name(v.len()))
            }
            Ok(None) => Ok(EnumValue::End),
            Err(e) => Err(e),
        }
    }
    fn read(&mut self, file: &Raw, offset: u64, out: &mut [u8]) -> Result<usize, OpFailure> {
        self.call(Op::Read);
        self.0
            .borrow_mut()
            .read_requests
            .push((file.0, offset, out.len()));
        out.fill(b'x');
        self.0
            .borrow_mut()
            .reads
            .pop_front()
            .unwrap_or(Ok(out.len()))
    }
    fn metadata(&mut self, _: &Raw, op: MetaOp, out: &mut [u8]) -> Result<MetaValue, OpFailure> {
        self.call(Op::Metadata);
        let mut s = self.0.borrow_mut();
        if let Some(e) = s.metadata_failure.take() {
            return Err(e);
        }
        if let Some(v) = s.metadata_value.take() {
            out.fill(b'x');
            return Ok(v);
        }
        Ok(match op {
            MetaOp::Stat | MetaOp::AclStat => MetaValue::Stat(stat()),
            MetaOp::Filesystem => MetaValue::Filesystem(FsObservation {
                location: Filesystem::Local,
                apfs: true,
                ownership_ignored: false,
                noexec: false,
            }),
            MetaOp::AclQuery => MetaValue::Acl(0),
            MetaOp::NamesSize => MetaValue::Size(0),
            MetaOp::NamesRead => MetaValue::Bytes(0),
        })
    }
    fn cleanup(&mut self, raw: Raw) -> Cleanup {
        self.call(Op::Cleanup);
        let mut s = self.0.borrow_mut();
        if s.released.contains(&raw.0) {
            s.duplicate = true;
        }
        s.released.push(raw.0);
        s.cleanup.pop_front().unwrap_or(Cleanup::Released)
    }
}
type Fixture = (Fake, Rc<RefCell<State>>, Rc<AtomicBool>, Rc<Cell<Instant>>);
fn fixture() -> Fixture {
    let start = Instant::now();
    let stop = Rc::new(AtomicBool::new(false));
    let tick = Rc::new(Cell::new(start));
    let s = Rc::new(RefCell::new(State {
        counts: [0; 5],
        next: 0,
        released: vec![],
        duplicate: false,
        reads: VecDeque::new(),
        read_requests: Vec::new(),
        names: VecDeque::new(),
        open_failure: None,
        acl_failure: None,
        metadata_failure: None,
        metadata_value: None,
        cleanup: VecDeque::new(),
        at: None,
        stop: stop.clone(),
        tick: tick.clone(),
        start,
    }));
    (Fake(s.clone()), s, stop, tick)
}
fn quotas() -> Quotas {
    Quotas {
        attempts: [100; 5],
        live: 8,
        name_bytes: 65536,
    }
}
fn full<'s>(s: &mut Boundary<'s, '_, '_, Fake>) -> Result<(), Failure> {
    let anchor = s.acquire(None, None, Kind::Anchor)?;
    let file = s.acquire(Some(&anchor), Some("file"), Kind::File)?;
    let cursor = s.acquire(Some(&anchor), None, Kind::Cursor)?;
    let acl = s.acquire(Some(&file), None, Kind::Acl)?;
    s.metadata(&acl, MetaOp::AclQuery, &mut [])?;
    s.enumerate(&cursor, &mut [0; 255])?;
    s.read_once(&file, 0, &mut [0; 4])?;
    s.eof_once(&file, 4, &mut [0])?;
    Ok(())
}
#[test]
fn each_method_is_one_attempt_and_cleanup_is_prepaid_and_once() {
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
    state
        .borrow_mut()
        .names
        .push_back(Ok(Some(b"file".to_vec())));
    let now = || tick.get();
    let mut b = SharedBudget::new(tick.get(), &stop);
    b.now = &now;
    let out = with_boundary(source, Some(quotas()), &mut b, full);
    out.result.unwrap();
    assert_eq!(out.summary.attempts, [3, 1, 2, 2, 4]);
    assert_eq!(
        (
            out.summary.live,
            out.summary.pending_cleanup,
            out.summary.unconfirmed,
            out.summary.peak
        ),
        (0, 0, 0, 4)
    );
    assert_eq!(state.borrow().released.len(), 4);
    assert!(!state.borrow().duplicate);
    assert_eq!(b.json_work, 17);
    assert_eq!(b.used, 4);
    assert_eq!(b.retries_left, 8);
    assert_eq!(
        (
            b.reserved,
            b.metadata_calls,
            b.metadata_cleanup_reserved,
            b.metadata_name_bytes,
            b.topology_calls
        ),
        (0, 0, 0, 0, 0)
    );
    assert_eq!(
        format!("{:?}", out.summary),
        "ScanOpsSummary(counts_only_not_execution_authority)"
    );
}
#[test]
fn no_operational_quotas_and_existing_stop_never_call_source_or_callback() {
    for existing in [false, true] {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        if existing {
            b.failed = Some(Failure::HashMismatch);
        }
        let called = Cell::new(false);
        let out = with_boundary(source, None, &mut b, |_| {
            called.set(true);
            Ok(())
        });
        assert_eq!(
            out.result,
            Err(if existing {
                Failure::HashMismatch
            } else {
                Failure::Unavailable
            })
        );
        assert!(!called.get());
        assert_eq!(state.borrow().counts, [0; 5]);
        assert_eq!(b.json_work, 0);
    }
}
#[test]
fn each_operation_live_and_cleanup_quota_rejects_before_source() {
    for case in 0..7 {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let mut q = quotas();
        match case {
            0 => q.attempts[0] = 0,
            1 => q.attempts[1] = 0,
            2 => q.attempts[2] = 0,
            3 => q.attempts[3] = 0,
            4 => q.attempts[4] = 0,
            5 => q.live = 0,
            _ => q.name_bytes = 1,
        };
        let out = with_boundary(source, Some(q), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            match case {
                1 => {
                    let c = s.acquire(Some(&a), None, Kind::Cursor)?;
                    s.enumerate(&c, &mut [0; 255])?;
                }
                2 => {
                    let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
                    s.read_once(&f, 0, &mut [0; 4])?;
                }
                3 => {
                    s.metadata(&a, MetaOp::Stat, &mut [])?;
                }
                6 => {
                    s.metadata(&a, MetaOp::NamesRead, &mut [0; 2])?;
                }
                _ => (),
            }
            Ok(())
        });
        assert_eq!(out.result, Err(Failure::Limit));
        if [0, 4, 5].contains(&case) {
            assert_eq!(state.borrow().counts, [0; 5]);
        } else {
            let op = match case {
                1 => 1,
                2 => 2,
                _ => 3,
            };
            assert_eq!(state.borrow().counts[op], 0);
        }
        assert_eq!(out.summary.live, 0);
        assert_eq!(out.summary.pending_cleanup, 0);
    }
}
#[test]
fn failed_acquires_do_not_free_nonexistent_handles_or_refund_precharge() {
    for acl in [false, true] {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        if acl {
            state.borrow_mut().acl_failure = Some(OpFailure::Interrupted);
        } else {
            state.borrow_mut().open_failure = Some(OpFailure::Interrupted);
        }
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.acquire(Some(&a), None, Kind::Acl)?;
            Ok(())
        });
        assert_eq!(
            out.result,
            Err(if acl {
                Failure::MetadataUnavailable
            } else {
                Failure::Unavailable
            })
        );
        assert_eq!(out.summary.attempts[4], u64::from(acl));
        assert_eq!(out.summary.pending_cleanup, 0);
        assert_eq!(b.json_work, if acl { 5 } else { 3 });
        assert_eq!(b.retries_left, 8);
    }
}

#[test]
fn late_success_at_every_source_call_stops_and_releases_every_returned_handle() {
    for hook in [Hook::Cancel, Hook::Deadline] {
        for at in 1..=12 {
            let (source, state, stop, tick) = fixture();
            state.borrow_mut().reads.extend([Ok(4), Ok(0)]);
            state.borrow_mut().at = Some((at, hook));
            let now = || tick.get();
            let mut b = SharedBudget::new(state.borrow().start, &stop);
            b.now = &now;
            let out = with_boundary(source, Some(quotas()), &mut b, full);
            assert_eq!(
                out.result,
                Err(match hook {
                    Hook::Cancel => Failure::Cancelled,
                    Hook::Deadline => Failure::Deadline,
                }),
                "at={at}"
            );
            assert_eq!(out.summary.live, 0);
            assert_eq!(out.summary.pending_cleanup, 0);
            assert_eq!(out.summary.unconfirmed, 0);
            assert_eq!(state.borrow().released.len() as u64, state.borrow().next);
            assert!(!state.borrow().duplicate);
        }
    }
}
#[test]
fn read_short_overlong_and_errors_are_one_attempt_and_late_bytes_are_accounted() {
    for (response, reason, bytes) in [
        (Ok(0), Failure::Changed, 0),
        (Ok(1), Failure::Changed, 1),
        (Ok(5), Failure::ReadFailed, 4),
        (Err(OpFailure::WouldBlock), Failure::ReadFailed, 0),
        (Err(OpFailure::Unavailable), Failure::ReadFailed, 0),
    ] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.push_back(response);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let e = s.read_once(&f, 0, &mut [0; 4]).unwrap_err();
            assert_eq!(s.metadata(&f, MetaOp::Stat, &mut []).err(), Some(e));
            Err::<(), _>(e)
        });
        assert_eq!(out.result, Err(reason));
        assert_eq!(out.summary.attempts[2], 1);
        assert_eq!(out.summary.attempts[3], 0);
        assert_eq!(b.used, bytes);
        assert_eq!(b.retries_left, 8);
        assert_eq!(out.summary.attempts[4], 2);
    }
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().at = Some((3, Hook::Cancel));
    let now = || tick.get();
    let mut b = SharedBudget::new(tick.get(), &stop);
    b.now = &now;
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        s.read_once(&f, 0, &mut [0; 4]).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::Cancelled));
    assert_eq!(b.used, 4);
    assert_eq!(out.summary.attempts[4], 2);
}
#[test]
fn eintr_requires_explicit_matching_retry_and_remains_shared_across_files_and_scopes() {
    let (source, state, stop, tick) = fixture();
    state
        .borrow_mut()
        .reads
        .extend((0..8).map(|_| Err(OpFailure::Interrupted)));
    state
        .borrow_mut()
        .reads
        .extend([Ok(4), Err(OpFailure::Interrupted)]);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        for n in 0..8 {
            assert_eq!(s.read_once(&f, 0, &mut [0; 4])?, ReadStep::Interrupted);
            assert_eq!(s.ledger.borrow().attempts[2], n + 1);
        }
        assert_eq!(s.read_once(&f, 0, &mut [0; 4])?, ReadStep::Complete);
        let f2 = s.acquire(Some(&a), Some("second"), Kind::File)?;
        s.read_once(&f2, 0, &mut [0; 4]).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::ReadFailed));
    assert_eq!(out.summary.attempts[2], 10);
    assert_eq!(b.retries_left, 0);
    assert_eq!(b.used, 4);
    assert_eq!(out.summary.attempts[4], 3);
    // Same budget cannot be restarted after its sticky failure.
    let (other, counts, _, _) = fixture();
    let out = with_boundary(other, Some(quotas()), &mut b, full);
    assert_eq!(out.result, Err(Failure::ReadFailed));
    assert_eq!(counts.borrow().counts, [0; 5]);
}
#[test]
fn retry_mismatch_and_abandoned_retry_never_become_success() {
    for case in 0..6 {
        let (source, state, stop, tick) = fixture();
        state
            .borrow_mut()
            .reads
            .push_back(Err(OpFailure::Interrupted));
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let other = s.acquire(Some(&a), Some("other"), Kind::File)?;
            assert_eq!(s.read_once(&f, 0, &mut [0; 4])?, ReadStep::Interrupted);
            match case {
                0 => s.read_once(&f, 1, &mut [0; 4]).map(|_| ()),
                1 => s.read_once(&f, 0, &mut [0; 3]).map(|_| ()),
                2 => s.read_once(&other, 0, &mut [0; 4]).map(|_| ()),
                3 => s.eof_once(&f, 0, &mut [0]).map(|_| ()),
                4 => s.metadata(&f, MetaOp::Stat, &mut []).map(|_| ()),
                _ => Ok(()),
            }
        });
        assert_eq!(
            out.result,
            Err(if case == 5 {
                Failure::ReadFailed
            } else {
                Failure::Binding
            })
        );
        assert_eq!(out.summary.attempts[2], 1);
        assert!(out.summary.retry_pending);
        assert_eq!(b.retries_left, 7);
    }
}
#[test]
fn eof_and_range_validation_do_not_hide_extra_data_or_issue_extra_reads() {
    for response in [0, 1] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().reads.push_back(Ok(response));
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.eof_once(&f, 4, &mut [0]).map(|_| ())
        });
        assert_eq!(
            out.result,
            if response == 0 {
                Ok(())
            } else {
                Err(Failure::Changed)
            }
        );
        assert_eq!(b.used, response as u64);
        assert_eq!(out.summary.attempts[2], 1);
    }
    for case in 0..3 {
        let (source, _, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            match case {
                0 => s.read_once(&f, 0, &mut []),
                1 => s.read_once(&f, u64::MAX, &mut [0]),
                _ => s.read_once(&f, MAX_FILE, &mut [0]),
            }
            .map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::InvalidRange));
        assert_eq!(out.summary.attempts[2], 0);
    }
}
#[test]
fn enum_errors_and_invalid_frames_are_not_end_and_never_retried() {
    let cases = [
        Err(OpFailure::Interrupted),
        Err(OpFailure::Unavailable),
        Ok(Some(vec![])),
        Ok(Some(vec![b'a'; 256])),
        Ok(Some(b"a/b".to_vec())),
        Ok(Some(vec![0])),
        Ok(Some(vec![255])),
    ];
    for response in cases {
        let expected = if response.is_err() {
            Failure::ReadFailed
        } else {
            Failure::Changed
        };
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().names.push_back(response);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let c = s.acquire(Some(&a), None, Kind::Cursor)?;
            s.enumerate(&c, &mut [0; 255]).map(|_| ())
        });
        assert_eq!(out.result, Err(expected));
        assert_eq!(out.summary.attempts[1], 1);
        assert_eq!(b.retries_left, 8);
    }
}
#[test]
fn metadata_primitives_are_separate_attempts_not_an_implicit_snapshot() {
    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        assert!(matches!(
            s.metadata(&f, MetaOp::Stat, &mut [])?,
            MetaValue::Stat(_)
        ));
        assert!(matches!(
            s.metadata(&f, MetaOp::Filesystem, &mut [])?,
            MetaValue::Filesystem(_)
        ));
        let acl = s.acquire(Some(&f), None, Kind::Acl)?;
        s.metadata(&acl, MetaOp::AclStat, &mut [])?;
        s.metadata(&acl, MetaOp::AclQuery, &mut [])?;
        s.metadata(&f, MetaOp::NamesSize, &mut [])?;
        s.metadata(&f, MetaOp::NamesRead, &mut [0])?;
        s.metadata(&f, MetaOp::NamesSize, &mut [])?;
        s.metadata(&f, MetaOp::Stat, &mut [])?;
        Ok(())
    });
    out.result.unwrap();
    assert_eq!(out.summary.attempts, [2, 0, 0, 9, 3]);
    assert_eq!(b.json_work, 16);
    assert_eq!((b.metadata_calls, b.metadata_name_bytes), (0, 0));
}
#[test]
fn metadata_errors_wrong_types_and_late_copy_keep_finite_reasons_and_counts() {
    for value in [MetaValue::Acl(2), MetaValue::Size(-1), MetaValue::Bytes(8)] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().metadata_value = Some(value);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.metadata(&a, MetaOp::NamesRead, &mut [0; 4]).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::MetadataUnavailable));
        assert_eq!(out.summary.attempts[3], 1);
    }
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().metadata_failure = Some(OpFailure::Interrupted);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        s.metadata(&a, MetaOp::Stat, &mut []).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::MetadataUnavailable));
    assert_eq!(b.retries_left, 8);
    let (source, state, stop, tick) = fixture();
    state.borrow_mut().metadata_value = Some(MetaValue::Bytes(4));
    state.borrow_mut().at = Some((2, Hook::Cancel));
    let now = || tick.get();
    let mut b = SharedBudget::new(tick.get(), &stop);
    b.now = &now;
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        s.metadata(&a, MetaOp::NamesRead, &mut [0; 4]).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::Cancelled));
    assert_eq!(out.summary.names, 4);
    assert_eq!(out.summary.attempts[4], 1);
}
#[test]
fn cleanup_unknown_stops_new_operations_and_does_not_replace_original_stop() {
    for cancelled in [false, true] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().cleanup.push_back(Cleanup::Unconfirmed);
        if cancelled {
            state.borrow_mut().at = Some((2, Hook::Cancel));
        }
        let now = || tick.get();
        let mut b = SharedBudget::new(tick.get(), &stop);
        b.now = &now;
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            if cancelled {
                s.acquire(Some(&a), Some("file"), Kind::File)?;
            } else {
                let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
                drop(f);
                s.acquire(Some(&a), Some("next"), Kind::File)?;
            }
            Ok(())
        });
        assert_eq!(
            out.result,
            Err(if cancelled {
                Failure::Cancelled
            } else {
                Failure::Unavailable
            })
        );
        assert_eq!(out.summary.unconfirmed, 1);
        assert_eq!(out.summary.attempts[0], 2);
        assert_eq!(out.summary.attempts[4], 2);
        assert!(!state.borrow().duplicate);
    }
}
#[test]
fn callback_unwind_and_forgotten_owner_are_not_falsely_reported_complete() {
    let (source, state, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        with_boundary(source, Some(quotas()), &mut b, |s| -> Result<(), Failure> {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let _f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            panic!("synthetic callback unwind");
        })
    }));
    assert!(result.is_err());
    assert_eq!(state.borrow().released.len(), 2);
    assert!(!state.borrow().duplicate);
    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        std::mem::forget(a);
        Ok(())
    });
    assert_eq!(out.result, Err(Failure::Unavailable));
    assert_eq!(out.summary.live, 1);
    assert_eq!(out.summary.pending_cleanup, 1);
}
#[test]
fn existing_payload_reservation_work_and_foreign_scope_are_not_bypassed() {
    let (source, state, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    b.reserved = MAX_BYTES - 3;
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
        s.read_once(&f, 0, &mut [0; 4]).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::Limit));
    assert_eq!(state.borrow().counts[2], 0);
    assert_eq!(b.reserved, MAX_BYTES - 3);
    assert_eq!(b.used, 0);
    let (source, state, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    b.json_work = 999998;
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        s.acquire(None, None, Kind::Anchor).map(|_| ())
    });
    assert_eq!(out.result, Err(Failure::Limit));
    assert_eq!(state.borrow().counts, [0; 5]);
    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let (other, other_state, _, _) = fixture();
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let result = with_boundary(other, Some(quotas()), s.budget, |inner| {
            inner.metadata(&a, MetaOp::Stat, &mut []).map(|_| ())
        });
        result.result
    });
    assert_eq!(out.result, Err(Failure::Binding));
    assert_eq!(other_state.borrow().counts, [0; 5]);
}
