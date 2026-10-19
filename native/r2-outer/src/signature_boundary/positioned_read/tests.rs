use super::*;
use std::{cell::Cell, collections::VecDeque};

enum Reply {
    Count(usize),
    Error(IoFailure),
}
struct Source {
    replies: VecDeque<Reply>,
    calls: Vec<(u64, usize)>,
}
impl Source {
    fn new(replies: impl IntoIterator<Item = Reply>) -> Self {
        Self {
            replies: replies.into_iter().collect(),
            calls: Vec::new(),
        }
    }
}
impl PositionedSource for Source {
    fn pread(&mut self, offset: u64, output: &mut [u8]) -> Result<usize, IoFailure> {
        self.calls.push((offset, output.len()));
        match self.replies.pop_front().expect("unexpected synthetic read") {
            Reply::Count(n) => {
                let count = n.min(output.len());
                output[..count].fill(0xa5);
                Ok(n)
            }
            Reply::Error(e) => Err(e),
        }
    }
}
fn budget<'a>(
    start: Instant,
    cancel: &'a AtomicBool,
    clock: &'a dyn Fn() -> Instant,
) -> SharedBudget<'a> {
    let mut b = SharedBudget::new(start, cancel);
    b.now = clock;
    b
}
#[test]
fn exact_reads_use_explicit_offsets_and_charge_duplicate_reads() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([Reply::Count(4), Reply::Count(4), Reply::Count(0)]);
    let mut bytes = [0; 4];
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        r.read(9, &mut bytes).unwrap();
        r.read(9, &mut bytes).unwrap();
        r.eof().unwrap();
        assert_eq!(
            format!("{r:?}"),
            "PositionedReadScope(not_execution_authority)"
        );
    }
    assert_eq!(bytes, [0xa5; 4]);
    assert_eq!(s.calls, [(9, 4), (9, 4), (32, 1)]);
    assert_eq!(b.used, 8);
    assert_eq!(b.reserved, 0);
}
#[test]
fn zero_and_positive_short_reads_stop_without_completion_retry() {
    for n in [0, 1, 3] {
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut s = Source::new([Reply::Count(n)]);
        let mut bytes = [0xff; 4];
        {
            let mut r = b.begin(&mut s, 32).unwrap();
            assert_eq!(r.read(0, &mut bytes), Err(Failure::Changed));
            assert_eq!(r.read(0, &mut bytes), Err(Failure::Changed));
            assert_eq!(r.eof(), Err(Failure::Changed));
        }
        assert_eq!(s.calls.len(), 1);
        assert_eq!(b.used, n as u64);
        assert_eq!(bytes, [0; 4]);
        assert_eq!(b.reserved, 0);
    }
}
#[test]
fn eight_eintr_retries_are_allowed_with_same_offset_and_slice() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let replies = (0..8)
        .map(|_| Reply::Error(IoFailure::Interrupted))
        .chain([Reply::Count(4)]);
    let mut s = Source::new(replies);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        r.read(7, &mut [0; 4]).unwrap();
    }
    assert_eq!(s.calls, vec![(7, 4); 9]);
    assert_eq!(b.retries_left, 0);
    assert_eq!(b.used, 4);
}
#[test]
fn ninth_eintr_stops_and_does_not_reset_on_new_scope() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new((0..9).map(|_| Reply::Error(IoFailure::Interrupted)));
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        assert_eq!(r.read(0, &mut [0; 4]), Err(Failure::ReadFailed));
    }
    assert!(matches!(b.begin(&mut s, 32), Err(Failure::ReadFailed)));
    assert_eq!(s.calls.len(), 9);
    assert_eq!(b.used, 0);
    assert_eq!(b.reserved, 0);
}
#[test]
fn retry_allowance_is_shared_across_successes_and_artifacts() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let replies = (0..4)
        .map(|_| Reply::Error(IoFailure::Interrupted))
        .chain([Reply::Count(1)])
        .chain((0..4).map(|_| Reply::Error(IoFailure::Interrupted)))
        .chain([Reply::Count(1), Reply::Error(IoFailure::Interrupted)]);
    let mut s = Source::new(replies);
    for _ in 0..2 {
        let mut r = b.begin(&mut s, 32).unwrap();
        r.read(0, &mut [0; 1]).unwrap();
    }
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        assert_eq!(r.read(0, &mut [0; 1]), Err(Failure::ReadFailed));
    }
    assert_eq!(s.calls.len(), 11);
    assert_eq!(b.used, 2);
}
#[test]
fn would_block_other_error_and_impossible_count_fail_closed() {
    for reply in [
        Reply::Error(IoFailure::WouldBlock),
        Reply::Error(IoFailure::Failed),
        Reply::Count(5),
    ] {
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut s = Source::new([reply]);
        let mut output = [0xff; 4];
        {
            let mut r = b.begin(&mut s, 32).unwrap();
            assert_eq!(r.read(0, &mut output), Err(Failure::ReadFailed));
        }
        assert_eq!(s.calls.len(), 1);
        assert_eq!(output, [0; 4]);
        assert_eq!(b.checkpoint(), Err(Failure::ReadFailed));
    }
}
#[test]
fn eof_requires_zero_and_accounts_extra_byte_before_rejection() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([Reply::Count(1)]);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        assert_eq!(r.eof(), Err(Failure::Changed));
    }
    assert_eq!(b.used, 1);
    assert_eq!(s.calls, [(32, 1)]);
}
#[test]
fn invalid_empty_large_overflowing_and_outside_requests_never_call_source() {
    for (offset, len) in [(0, 0), (0, MAX_CHUNK + 1), (u64::MAX, 1), (32, 1), (31, 2)] {
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut s = Source::new([]);
        {
            let mut r = b.begin(&mut s, 32).unwrap();
            assert_eq!(
                r.read(offset, &mut vec![0; len]),
                Err(Failure::InvalidRange)
            );
        }
        assert!(s.calls.is_empty());
        assert_eq!(b.reserved, 0);
    }
}
#[test]
fn chunk_maximum_and_file_end_are_inclusive() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([Reply::Count(MAX_CHUNK)]);
    {
        let mut r = b.begin(&mut s, MAX_CHUNK as u64).unwrap();
        r.read(0, &mut [0; MAX_CHUNK]).unwrap();
    }
    assert_eq!(b.used, MAX_CHUNK as u64);
}
#[test]
fn file_limits_reject_before_any_source_calls() {
    for size in [0, 31, MAX_FILE + 1, u64::MAX] {
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut s = Source::new([]);
        assert!(matches!(b.begin(&mut s, size), Err(Failure::Limit)));
        assert!(s.calls.is_empty());
        assert_eq!(b.reserved, 0);
    }
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([]);
    drop(b.begin(&mut s, MAX_FILE).unwrap());
    assert_eq!(b.reserved, 0);
}
#[test]
fn reservation_is_released_unused_and_counts_only_actual_bytes() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([Reply::Count(1)]);
    let expected = 2 * 32 + 32 + MAX_HEADER + 2;
    {
        let r = b.begin(&mut s, 32).unwrap();
        assert_eq!(r.credit, expected);
        assert_eq!(r.budget.reserved, expected);
    }
    assert_eq!(b.used, 0);
    assert_eq!(b.reserved, 0);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        r.read(0, &mut [0; 1]).unwrap();
        assert_eq!(r.credit, expected - 1);
        assert_eq!(r.budget.reserved, expected - 1);
    }
    assert_eq!(b.used, 1);
    assert_eq!(b.reserved, 0);
}
#[test]
fn global_byte_boundary_external_accounting_and_overflow() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.account_read(MAX_BYTES).unwrap();
    assert_eq!(b.used, MAX_BYTES);
    assert_eq!(b.account_read(1), Err(Failure::Limit));
    assert_eq!(b.used, MAX_BYTES);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.used = 1;
    assert_eq!(b.account_read(u64::MAX), Err(Failure::Limit));
}
#[test]
fn reservations_consume_remaining_capacity_before_io() {
    let cancel = AtomicBool::new(false);
    let plan = 2 * 32 + 32 + MAX_HEADER + 2;
    for extra in [0, 1] {
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        b.account_read(MAX_BYTES - plan + extra).unwrap();
        let mut s = Source::new([]);
        {
            let result = b.begin(&mut s, 32);
            if extra == 0 {
                drop(result.unwrap());
            } else {
                assert!(matches!(result, Err(Failure::Limit)));
            }
        }
        assert!(s.calls.is_empty());
    }
}
#[test]
fn artifacts_do_not_reset_shared_bytes() {
    let cancel = AtomicBool::new(false);
    let plan = 2 * 32 + 32 + MAX_HEADER + 2;
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.account_read(MAX_BYTES - plan).unwrap();
    let mut s = Source::new([Reply::Count(1)]);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        r.read(0, &mut [0; 1]).unwrap();
    }
    assert!(matches!(b.begin(&mut s, 32), Err(Failure::Limit)));
    assert_eq!(s.calls.len(), 1);
}
#[test]
fn request_limit_is_per_artifact_and_retries_are_separate() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([Reply::Error(IoFailure::Interrupted), Reply::Count(1)]);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        r.requests = MAX_REQUESTS - 1;
        r.read(0, &mut [0; 1]).unwrap();
        assert_eq!(r.requests, MAX_REQUESTS);
        assert_eq!(r.read(0, &mut [0; 1]), Err(Failure::Limit));
    }
    assert_eq!(s.calls.len(), 2);
}
#[test]
fn exhausted_plan_refuses_io_even_when_global_capacity_remains() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([]);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        let removed = r.credit - 1;
        r.credit = 1;
        r.budget.reserved -= removed;
        assert_eq!(r.read(0, &mut [0; 2]), Err(Failure::Limit));
    }
    assert!(s.calls.is_empty());
    assert_eq!(b.reserved, 0);
}
#[test]
fn initial_cancel_expiry_and_future_clock_stop_before_io() {
    let now = Instant::now();
    for (start, cancelled, expected) in [
        (now, true, Failure::Cancelled),
        (now - Duration::from_secs(10), false, Failure::Deadline),
        (now + Duration::from_secs(1), false, Failure::Deadline),
    ] {
        let cancel = AtomicBool::new(cancelled);
        let clock = || now;
        let mut b = budget(start, &cancel, &clock);
        let mut s = Source::new([]);
        assert!(matches!(b.begin(&mut s,32),Err(e) if e==expected));
        assert!(s.calls.is_empty());
    }
}
#[test]
fn clock_boundary_before_ten_seconds_is_allowed() {
    let start = Instant::now();
    let cancel = AtomicBool::new(false);
    let clock = || start + Duration::from_secs(10) - Duration::from_nanos(1);
    let mut b = budget(start, &cancel, &clock);
    assert_eq!(b.checkpoint(), Ok(()));
}
struct TimedSource<'a> {
    tick: &'a Cell<Duration>,
    cancel: &'a AtomicBool,
    late: bool,
    cancel_now: bool,
    reply: Reply,
    calls: usize,
}
impl PositionedSource for TimedSource<'_> {
    fn pread(&mut self, _: u64, output: &mut [u8]) -> Result<usize, IoFailure> {
        self.calls += 1;
        if self.late {
            self.tick.set(Duration::from_secs(10));
        }
        if self.cancel_now {
            self.cancel.store(true, Ordering::Release);
        }
        output.fill(0xa5);
        match self.reply {
            Reply::Count(n) => Ok(n),
            Reply::Error(e) => Err(e),
        }
    }
}
#[test]
fn late_success_short_and_error_responses_are_discarded_and_latched() {
    let start = Instant::now();
    for reply in [
        Reply::Count(4),
        Reply::Count(1),
        Reply::Error(IoFailure::Failed),
    ] {
        let tick = Cell::new(Duration::ZERO);
        let cancel = AtomicBool::new(false);
        let clock = || start + tick.get();
        let mut b = budget(start, &cancel, &clock);
        let actual = match reply {
            Reply::Count(n) => n,
            _ => 0,
        };
        let mut s = TimedSource {
            tick: &tick,
            cancel: &cancel,
            late: true,
            cancel_now: false,
            reply,
            calls: 0,
        };
        let mut out = [0xff; 4];
        {
            let mut r = b.begin(&mut s, 32).unwrap();
            assert_eq!(r.read(0, &mut out), Err(Failure::Deadline));
            tick.set(Duration::ZERO);
            assert_eq!(r.read(0, &mut out), Err(Failure::Deadline));
        }
        assert_eq!(out, [0; 4]);
        assert_eq!(s.calls, 1);
        assert_eq!(b.used, actual as u64);
    }
}
#[test]
fn cancellation_during_io_discards_success_and_never_retries_eintr() {
    let start = Instant::now();
    for reply in [Reply::Count(4), Reply::Error(IoFailure::Interrupted)] {
        let tick = Cell::new(Duration::ZERO);
        let cancel = AtomicBool::new(false);
        let clock = || start;
        let mut b = budget(start, &cancel, &clock);
        let mut s = TimedSource {
            tick: &tick,
            cancel: &cancel,
            late: false,
            cancel_now: true,
            reply,
            calls: 0,
        };
        let mut out = [0xff; 4];
        {
            let mut r = b.begin(&mut s, 32).unwrap();
            assert_eq!(r.read(0, &mut out), Err(Failure::Cancelled));
            cancel.store(false, Ordering::Release);
            assert_eq!(r.eof(), Err(Failure::Cancelled));
        }
        assert_eq!(out, [0; 4]);
        assert_eq!(s.calls, 1);
        assert_eq!(b.retries_left, 8);
    }
}
#[test]
fn expiry_during_eintr_prevents_next_attempt() {
    let start = Instant::now();
    let tick = Cell::new(Duration::ZERO);
    let cancel = AtomicBool::new(false);
    let clock = || start + tick.get();
    let mut b = budget(start, &cancel, &clock);
    let mut s = TimedSource {
        tick: &tick,
        cancel: &cancel,
        late: true,
        cancel_now: false,
        reply: Reply::Error(IoFailure::Interrupted),
        calls: 0,
    };
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        assert_eq!(r.read(0, &mut [0; 1]), Err(Failure::Deadline));
    }
    assert_eq!(s.calls, 1);
    assert_eq!(b.retries_left, 8);
}
#[test]
fn shared_start_survives_success_and_later_scope() {
    let start = Instant::now();
    let tick = Cell::new(Duration::from_secs(9));
    let cancel = AtomicBool::new(false);
    let clock = || start + tick.get();
    let mut b = budget(start, &cancel, &clock);
    let mut s = Source::new([Reply::Count(1)]);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        r.read(0, &mut [0; 1]).unwrap();
    }
    tick.set(Duration::from_secs(10));
    assert!(matches!(b.begin(&mut s, 32), Err(Failure::Deadline)));
    assert_eq!(s.calls.len(), 1);
}
#[test]
fn eof_late_zero_is_not_success() {
    let start = Instant::now();
    let tick = Cell::new(Duration::ZERO);
    let cancel = AtomicBool::new(false);
    let clock = || start + tick.get();
    let mut b = budget(start, &cancel, &clock);
    let mut s = TimedSource {
        tick: &tick,
        cancel: &cancel,
        late: true,
        cancel_now: false,
        reply: Reply::Count(0),
        calls: 0,
    };
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        assert_eq!(r.eof(), Err(Failure::Deadline));
    }
    assert_eq!(s.calls, 1);
    assert_eq!(b.used, 0);
    assert_eq!(b.reserved, 0);
}
#[test]
fn external_bytes_are_charged_even_when_completion_is_late() {
    let start = Instant::now();
    let cancel = AtomicBool::new(false);
    let clock = || start + Duration::from_secs(10);
    let mut b = budget(start, &cancel, &clock);
    assert_eq!(b.account_read(4), Err(Failure::Deadline));
    assert_eq!(b.used, 4);
}
#[test]
fn explicit_phase_checkpoint_fails_without_io_and_debug_is_fixed() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        format!("{b:?}"),
        "SharedReadBudget(not_execution_authority)"
    );
    let mut s = Source::new([]);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        cancel.store(true, Ordering::Release);
        assert_eq!(r.checkpoint(), Err(Failure::Cancelled));
    }
    assert!(s.calls.is_empty());
    assert_eq!(b.reserved, 0);
}

#[test]
fn deadline_or_cancel_between_scope_creation_and_read_stops_before_source() {
    let start = Instant::now();
    for is_cancel in [false, true] {
        let tick = Cell::new(Duration::ZERO);
        let cancel = AtomicBool::new(false);
        let clock = || start + tick.get();
        let mut b = budget(start, &cancel, &clock);
        let mut s = Source::new([]);
        {
            let mut r = b.begin(&mut s, 32).unwrap();
            if is_cancel {
                cancel.store(true, Ordering::Release);
            } else {
                tick.set(Duration::from_secs(10));
            }
            assert_eq!(
                r.read(0, &mut [0; 1]),
                Err(if is_cancel {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                })
            );
        }
        assert!(s.calls.is_empty());
        assert_eq!(b.used, 0);
        assert_eq!(b.reserved, 0);
    }
}

#[test]
fn invalid_source_count_is_bounded_accounting_and_first_failure_sticks() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Source::new([Reply::Count(usize::MAX)]);
    {
        let mut r = b.begin(&mut s, 32).unwrap();
        assert_eq!(r.read(0, &mut [0; 4]), Err(Failure::ReadFailed));
    }
    assert_eq!(b.used, 4);
    assert_eq!(b.reserved, 0);
    cancel.store(true, Ordering::Release);
    assert_eq!(b.checkpoint(), Err(Failure::ReadFailed));
    assert_eq!(s.calls.len(), 1);
}
