use super::*;
use std::cell::Cell;

type Hook<'a> = Box<dyn FnMut(usize, u64, usize) + 'a>;
struct Memory<'a> {
    bytes: Vec<u8>,
    calls: Vec<(u64, usize)>,
    edit: Option<(usize, usize, u8)>,
    short: Option<usize>,
    interrupts: Vec<usize>,
    append: Option<usize>,
    hook: Option<Hook<'a>>,
}
impl Memory<'_> {
    fn new(bytes: Vec<u8>) -> Self {
        Self {
            bytes,
            calls: Vec::new(),
            edit: None,
            short: None,
            interrupts: Vec::new(),
            append: None,
            hook: None,
        }
    }
}
impl PositionedSource for Memory<'_> {
    fn pread(&mut self, offset: u64, output: &mut [u8]) -> Result<usize, IoFailure> {
        self.calls.push((offset, output.len()));
        let call = self.calls.len();
        if let Some((at, index, value)) = self.edit
            && at == call
        {
            self.bytes[index] = value;
        }
        if self.append == Some(call) {
            self.bytes.push(1);
        }
        if self.interrupts.contains(&call) {
            return Err(IoFailure::Interrupted);
        }
        let start = usize::try_from(offset).map_err(|_| IoFailure::Failed)?;
        let mut n = output.len().min(self.bytes.len().saturating_sub(start));
        if self.short == Some(call) {
            n = n.saturating_sub(1);
        }
        if n > 0 {
            output[..n].copy_from_slice(&self.bytes[start..start + n]);
        }
        if let Some(hook) = self.hook.as_mut() {
            hook(call, offset, n);
        }
        Ok(n)
    }
}
fn fixture(xml: bool, der: bool, offset: usize, header: usize) -> Vec<u8> {
    physical_signature::synthetic_file(xml, der, offset, header)
}
fn digest(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
fn le(bytes: &mut [u8], at: usize, n: u32) {
    bytes[at..at + 4].copy_from_slice(&n.to_le_bytes());
}
fn run(source: &mut Memory<'_>, expected: &[u8; 32]) -> (Result<CapturedA, Failure>, u64) {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let n = source.bytes.len() as u64;
    let result = {
        let mut r = b.begin(source, n).unwrap();
        r.capture_a(expected)
    };
    assert_eq!(b.reserved, 0);
    (result, b.used)
}
#[test]
fn success_captures_exact_hashed_ranges_and_pending_debug_only() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len();
    let mut m = Memory::new(bytes.clone());
    let (result, used) = run(&mut m, &expected);
    let out = result.unwrap();
    assert_eq!(out.header, &bytes[..48]);
    assert_eq!(out.signature, &bytes[4096..]);
    assert_eq!(out.full_hash, expected);
    assert_eq!(out.file_bytes, n as u64);
    assert_eq!(used, (32 + 48 + n) as u64);
    assert_eq!(m.calls, [(0, 32), (0, 48), (0, n), (n as u64, 1)]);
    assert_eq!(
        format!("{out:?}"),
        "CapturedA(pending_revalidation_not_execution_authority)"
    );
    assert_eq!(
        out.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
}
#[test]
fn der_and_absence_stops_are_preserved_after_capture() {
    for (xml, der, stop) in [
        (true, true, physical_signature::Rejection::UnsupportedDer),
        (false, true, physical_signature::Rejection::UnsupportedDer),
        (false, false, physical_signature::Rejection::AbsenceUnproven),
    ] {
        let bytes = fixture(xml, der, 4096, 48);
        let expected = digest(&bytes);
        let mut m = Memory::new(bytes);
        assert_eq!(
            run(&mut m, &expected).0.unwrap().entitlement_gate(),
            Err(stop)
        );
    }
}
#[test]
fn header_and_signature_cross_chunk_boundaries_without_reread() {
    let offset = 131069;
    let header = 65568;
    let bytes = fixture(true, false, offset, header);
    let expected = digest(&bytes);
    let n = bytes.len();
    let mut m = Memory::new(bytes.clone());
    let (result, used) = run(&mut m, &expected);
    let out = result.unwrap();
    assert_eq!(out.header, &bytes[..header]);
    assert_eq!(out.signature, &bytes[offset..]);
    assert_eq!(used, (32 + header + n) as u64);
    assert!(m.calls.iter().all(|(_, size)| *size <= MAX_CHUNK));
    assert_eq!(m.calls[1..3], [(0, MAX_CHUNK), (MAX_CHUNK as u64, 32)]);
    assert!(!m.calls.iter().any(|(at, _)| *at == offset as u64)); // no later signature-only acquisition
}
#[test]
fn multi_chunk_signature_is_supported() {
    let offset = 3000 * 4096 - 3;
    let bytes = fixture(true, false, offset, 48);
    let expected = digest(&bytes);
    let mut m = Memory::new(bytes);
    let (result, _) = run(&mut m, &expected);
    assert!(result.unwrap().signature.len() > 65536);
}
#[test]
fn signature_five_mib_padding_boundary_is_bounded() {
    let mut bytes = fixture(true, false, 4096, 48);
    bytes.resize(4096 + 5 * 1024 * 1024, 0);
    le(&mut bytes, 44, 5 * 1024 * 1024);
    let expected = digest(&bytes);
    let mut m = Memory::new(bytes);
    assert_eq!(
        run(&mut m, &expected).0.unwrap().signature.len(),
        5 * 1024 * 1024
    );
}
#[test]
fn header_command_limit_is_checked_before_allocation_or_body_scan() {
    for (at, value) in [(16, 4097), (20, 1048577), (20, u32::MAX)] {
        let mut bytes = fixture(true, false, 4096, 48);
        le(&mut bytes, at, value);
        let expected = digest(&bytes);
        let mut m = Memory::new(bytes);
        assert!(matches!(
            run(&mut m, &expected).0,
            Err(Failure::Parser(physical_signature::Rejection::Limit))
        ));
        assert_eq!(m.calls.len(), 1);
    }
}
#[test]
fn header_file_extent_and_profiles_reject_in_preflight() {
    for (at, value) in [
        (0, 0xcafebabe),
        (4, 0x01000007),
        (8, 2),
        (12, 6),
        (28, 1),
        (20, 8192),
    ] {
        let mut bytes = fixture(true, false, 4096, 48);
        le(&mut bytes, at, value);
        let expected = digest(&bytes);
        let mut m = Memory::new(bytes);
        assert!(matches!(run(&mut m, &expected).0, Err(Failure::Parser(_))));
        assert_eq!(m.calls.len(), 1);
    }
}
#[test]
fn signature_missing_duplicate_unknown_and_invalid_ranges_stop_before_body() {
    for case in 0..7 {
        let mut bytes = fixture(true, false, 4096, 64);
        match case {
            0 => le(&mut bytes, 32, 1),
            1 => le(&mut bytes, 48, 0x1d),
            2 => le(&mut bytes, 48, 0x80000123),
            3 => le(&mut bytes, 40, 32),
            4 => le(&mut bytes, 44, 5 * 1024 * 1024 + 1),
            5 => le(&mut bytes, 44, u32::MAX),
            _ => le(&mut bytes, 36, 8),
        };
        let expected = digest(&bytes);
        let mut m = Memory::new(bytes);
        assert!(run(&mut m, &expected).0.is_err());
        assert_eq!(m.calls.len(), 2);
    }
}
#[test]
fn initial_header_change_is_rejected_without_hash_or_retry() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let mut m = Memory::new(bytes);
    m.edit = Some((2, 24, 1));
    assert_eq!(
        run(&mut m, &expected).0.unwrap_err(),
        Failure::SourceMismatch
    );
    assert_eq!(m.calls.len(), 2);
}
#[test]
fn preflight_capture_difference_rejects_even_if_hash_matches_new_bytes() {
    let bytes = fixture(true, false, 4096, 48);
    let mut changed = bytes.clone();
    changed[24] = 1;
    let expected = digest(&changed);
    let mut m = Memory::new(bytes);
    m.edit = Some((3, 24, 1));
    assert_eq!(
        run(&mut m, &expected).0.unwrap_err(),
        Failure::SourceMismatch
    );
    assert_eq!(m.calls.len(), 4);
}
#[test]
fn whole_hash_includes_bytes_outside_captured_ranges() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let mut m = Memory::new(bytes);
    m.edit = Some((3, 100, 0));
    assert_eq!(run(&mut m, &expected).0.unwrap_err(), Failure::HashMismatch);
    assert_eq!(m.calls.len(), 3);
}
#[test]
fn wrong_expected_hash_is_not_replaced_by_computed_hash() {
    let bytes = fixture(true, false, 4096, 48);
    let mut m = Memory::new(bytes);
    assert_eq!(run(&mut m, &[0; 32]).0.unwrap_err(), Failure::HashMismatch);
    assert_eq!(m.calls.len(), 3);
}
#[test]
fn parser_rejection_is_preserved_after_correct_full_hash() {
    let mut bytes = fixture(true, false, 4096, 48);
    bytes[4096] = 0;
    let expected = digest(&bytes);
    let mut m = Memory::new(bytes);
    assert_eq!(
        run(&mut m, &expected).0.unwrap_err(),
        Failure::Parser(physical_signature::Rejection::InvalidBlob)
    );
    assert_eq!(m.calls.len(), 4);
}
#[test]
fn preflight_body_and_eof_short_or_growth_stop() {
    for call in [1, 2, 3] {
        let bytes = fixture(true, false, 4096, 48);
        let expected = digest(&bytes);
        let mut m = Memory::new(bytes);
        m.short = Some(call);
        assert_eq!(run(&mut m, &expected).0.unwrap_err(), Failure::Changed);
        assert_eq!(m.calls.len(), call);
    }
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let mut m = Memory::new(bytes);
    m.append = Some(4);
    assert_eq!(run(&mut m, &expected).0.unwrap_err(), Failure::Changed);
    assert_eq!(m.calls.len(), 4);
}
#[test]
fn eintr_retries_keep_source_offset_and_charge_actual_bytes_only() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len();
    let mut m = Memory::new(bytes);
    m.interrupts = vec![1, 4, 5];
    let (result, used) = run(&mut m, &expected);
    assert!(result.is_ok());
    assert_eq!(used, (32 + 48 + n) as u64);
    assert_eq!(m.calls[0], m.calls[1]);
    assert_eq!(m.calls[3], m.calls[4]);
    assert_eq!(m.calls[4], m.calls[5]);
}
#[test]
fn failures_latch_the_entire_shared_scope_and_next_artifact() {
    let bytes = fixture(true, false, 4096, 48);
    let n = bytes.len() as u64;
    let mut m = Memory::new(bytes);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        assert_eq!(r.capture_a(&[0; 32]).unwrap_err(), Failure::HashMismatch);
        assert_eq!(r.capture_a(&[0; 32]).unwrap_err(), Failure::HashMismatch);
        assert_eq!(r.read(0, &mut [0; 1]), Err(Failure::HashMismatch));
    }
    assert!(matches!(b.begin(&mut m, n), Err(Failure::HashMismatch)));
    assert_eq!(m.calls.len(), 3);
    assert_eq!(b.reserved, 0);
}
#[test]
fn shared_consumption_and_reservation_are_not_reset_by_capture() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.account_read(123).unwrap();
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        r.capture_a(&expected).unwrap();
        assert_eq!(r.budget.used, 123 + 32 + 48 + n);
        assert!(r.credit > 0);
    }
    assert_eq!(b.reserved, 0);
    b.account_read(MAX_BYTES - b.used).unwrap();
    assert!(matches!(b.begin(&mut m, n), Err(Failure::Limit)));
    assert_eq!(m.calls.len(), 4);
}
#[test]
fn initial_deadline_cancel_and_capacity_stop_before_source() {
    let bytes = fixture(true, false, 4096, 48);
    let n = bytes.len() as u64;
    let start = Instant::now();
    for case in 0..3 {
        let cancel = AtomicBool::new(case == 1);
        let mut b = SharedBudget::new(
            if case == 0 {
                start - Duration::from_secs(10)
            } else {
                start
            },
            &cancel,
        );
        if case == 2 {
            b.account_read(MAX_BYTES).unwrap();
        }
        let mut m = Memory::new(bytes.clone());
        assert!(b.begin(&mut m, n).is_err());
        assert!(m.calls.is_empty());
    }
}
#[test]
fn deadlines_during_each_read_phase_drop_late_success() {
    let bytes = fixture(true, false, 131069, 65568);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    for at in 1..=7 {
        let start = Instant::now();
        let tick = Cell::new(Duration::ZERO);
        let cancel = AtomicBool::new(false);
        let now = || start + tick.get();
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &now;
        let mut m = Memory::new(bytes.clone());
        m.hook = Some(Box::new(|call, _, _| {
            if call == at {
                tick.set(Duration::from_secs(10));
            }
        }));
        {
            let mut r = b.begin(&mut m, n).unwrap();
            assert_eq!(r.capture_a(&expected).unwrap_err(), Failure::Deadline);
        }
        assert_eq!(m.calls.len(), at);
        assert_eq!(b.reserved, 0);
    }
}
#[test]
fn cancellation_during_body_and_before_parser_stops_without_new_budget() {
    for at in [3, 4] {
        let bytes = fixture(true, false, 4096, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut m = Memory::new(bytes);
        m.hook = Some(Box::new(|call, _, _| {
            if call == at {
                cancel.store(true, Ordering::Release);
            }
        }));
        {
            let mut r = b.begin(&mut m, n).unwrap();
            assert_eq!(r.capture_a(&expected).unwrap_err(), Failure::Cancelled);
        }
        assert_eq!(m.calls.len(), at);
    }
}
#[test]
fn parser_loop_uses_original_shared_clock_not_a_fresh_deadline() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let start = Instant::now();
    let after_eof = Cell::new(false);
    let checks = Cell::new(0);
    let cancel = AtomicBool::new(false);
    let now = || {
        if after_eof.get() {
            let c = checks.get() + 1;
            checks.set(c);
            if c >= 12 {
                return start + Duration::from_secs(10);
            }
        }
        start + Duration::from_secs(9)
    };
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &now;
    let mut m = Memory::new(bytes);
    m.hook = Some(Box::new(|_, at, _| {
        if at == n {
            after_eof.set(true);
        }
    }));
    {
        let mut r = b.begin(&mut m, n).unwrap();
        assert_eq!(r.capture_a(&expected).unwrap_err(), Failure::Deadline);
    }
    assert_eq!(checks.get(), 12);
    assert_eq!(m.calls.len(), 4);
}
#[test]
fn collection_intersection_math_covers_partial_and_empty_ranges() {
    let mut out = [0; 5];
    assert_eq!(collect(&mut out, 10, 8, &[1, 2, 3, 4]), Ok(2));
    assert_eq!(out, [3, 4, 0, 0, 0]);
    assert_eq!(collect(&mut out, 10, 12, &[5, 6, 7, 8]), Ok(3));
    assert_eq!(out, [3, 4, 5, 6, 7]);
    assert_eq!(collect(&mut out, 10, 15, &[8]), Ok(0));
    assert_eq!(
        collect(&mut out, u64::MAX, 0, &[1]),
        Err(Failure::InvalidRange)
    );
    assert_eq!(
        collect(&mut out, 0, u64::MAX, &[1]),
        Err(Failure::InvalidRange)
    );
}
#[test]
fn bounded_allocation_rejects_oversize_without_a_source() {
    assert_eq!(allocate(5 * 1024 * 1024 + 1), Err(Failure::Limit));
}

#[test]
fn full_header_limit_is_supported_in_chunked_preflight_and_capture() {
    let header = 1024 * 1024 + 32;
    let bytes = fixture(true, false, 2 * 1024 * 1024 + 3, header);
    let expected = digest(&bytes);
    let n = bytes.len();
    let mut m = Memory::new(bytes.clone());
    let (result, used) = run(&mut m, &expected);
    assert_eq!(result.unwrap().header, &bytes[..header]);
    assert_eq!(used, (32 + header + n) as u64);
    assert!(m.calls.iter().all(|(_, n)| *n <= MAX_CHUNK));
}

#[test]
fn changes_behind_hash_cursor_are_not_claimed_as_revalidated() {
    let bytes = fixture(true, false, 131069, 48);
    let expected = digest(&bytes);
    let mut m = Memory::new(bytes);
    m.edit = Some((4, 100, 0)); // first A block has already been hashed/captured
    let out = run(&mut m, &expected).0.unwrap();
    assert_ne!(digest(&m.bytes), out.full_hash);
    assert_eq!(
        format!("{out:?}"),
        "CapturedA(pending_revalidation_not_execution_authority)"
    );
    assert!(out.entitlement_gate().is_err()); // B/metadata are required in a later stage
}

fn run_ab(m: &mut Memory<'_>, expected: &[u8; 32]) -> (Result<ComparedAB, Failure>, u64) {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let n = m.bytes.len() as u64;
    let result = {
        let mut r = b.begin(m, n).unwrap();
        r.capture_a(expected).and_then(|a| r.recheck_b(a))
    };
    assert_eq!(b.reserved, 0);
    (result, b.used)
}
#[test]
fn b_matches_all_bytes_and_charges_a_and_b_without_new_scope() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len();
    let mut m = Memory::new(bytes.clone());
    let (result, used) = run_ab(&mut m, &expected);
    let out = result.unwrap();
    assert_eq!(out.capture.full_hash, expected);
    assert_eq!(out.capture.header, &bytes[..48]);
    assert_eq!(out.capture.signature, &bytes[4096..]);
    assert_eq!(used, (32 + 48 + 2 * n) as u64);
    assert_eq!(
        m.calls,
        [
            (0, 32),
            (0, 48),
            (0, n),
            (n as u64, 1),
            (0, n),
            (n as u64, 1)
        ]
    );
    assert_eq!(
        format!("{out:?}"),
        "ComparedAB(bytes_only_pending_metadata_not_execution_authority)"
    );
    assert_eq!(
        out.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
}
#[test]
fn b_preserves_der_and_absence_stop_without_semantic_upgrade() {
    for (xml, der, stop) in [
        (true, true, physical_signature::Rejection::UnsupportedDer),
        (false, true, physical_signature::Rejection::UnsupportedDer),
        (false, false, physical_signature::Rejection::AbsenceUnproven),
    ] {
        let bytes = fixture(xml, der, 4096, 48);
        let expected = digest(&bytes);
        let mut m = Memory::new(bytes);
        assert_eq!(
            run_ab(&mut m, &expected).0.unwrap().entitlement_gate(),
            Err(stop)
        );
    }
}
#[test]
fn b_handles_split_ranges_and_maximum_header() {
    for (offset, header) in [(131069, 65568), (2 * 1024 * 1024 + 3, 1024 * 1024 + 32)] {
        let bytes = fixture(true, false, offset, header);
        let expected = digest(&bytes);
        let n = bytes.len();
        let mut m = Memory::new(bytes.clone());
        let (out, used) = run_ab(&mut m, &expected);
        let out = out.unwrap();
        assert_eq!(out.capture.header, &bytes[..header]);
        assert_eq!(out.capture.signature, &bytes[offset..]);
        assert_eq!(used, (32 + header + 2 * n) as u64);
        assert!(m.calls.iter().all(|(_, n)| *n <= MAX_CHUNK));
    }
}
#[test]
fn b_reuses_a_signature_buffer_at_five_mib_without_a_second_blob() {
    let mut bytes = fixture(true, false, 4096, 48);
    bytes.resize(4096 + 5 * 1024 * 1024, 0);
    le(&mut bytes, 44, 5 * 1024 * 1024);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        let allocation = a.signature.as_ptr();
        let out = r.recheck_b(a).unwrap();
        assert_eq!(out.capture.signature.as_ptr(), allocation);
        assert_eq!(out.capture.signature.len(), 5 * 1024 * 1024);
    }
}
#[test]
fn b_rejects_header_and_signature_changes_without_recomputing_ranges() {
    for index in [0, 24, 32, 4096, 4200] {
        let bytes = fixture(true, false, 4096, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut m = Memory::new(bytes);
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let a = r.capture_a(&expected).unwrap();
            r.source.bytes[index] ^= 1;
            assert_eq!(r.recheck_b(a).unwrap_err(), Failure::SourceMismatch);
        }
        assert_eq!(m.calls.len(), 5);
    }
}
#[test]
fn b_full_hash_detects_changes_outside_the_captured_ranges() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        r.source.bytes[100] ^= 1;
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::HashMismatch);
        assert_eq!(r.read(0, &mut [0; 1]), Err(Failure::HashMismatch));
    }
    assert_eq!(m.calls.len(), 5);
    assert_eq!(b.reserved, 0);
    assert!(matches!(b.begin(&mut m, n), Err(Failure::HashMismatch)));
}
#[test]
fn b_checks_range_bytes_even_if_full_file_digest_would_match() {
    // Corrupt only private synthetic A buffers, never a production mutation API.
    for signature in [false, true] {
        let bytes = fixture(true, false, 4096, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut m = Memory::new(bytes);
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let mut a = r.capture_a(&expected).unwrap();
            if signature {
                a.signature[0] ^= 1;
            } else {
                a.header[24] ^= 1;
            }
            assert_eq!(r.recheck_b(a).unwrap_err(), Failure::SourceMismatch);
        }
        assert_eq!(m.calls.len(), 5);
    }
}
#[test]
fn b_detects_the_a_cursor_change_that_pending_a_alone_could_not_detect() {
    let bytes = fixture(true, false, 131069, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    m.edit = Some((4, 100, 0));
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        assert_ne!(digest(&r.source.bytes), a.full_hash);
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::HashMismatch);
    }
    assert_eq!(m.calls.len(), 9);
}
#[test]
fn b_detects_observable_mid_scan_body_and_signature_changes() {
    for (call, index, reason) in [
        (8, 70000, Failure::HashMismatch),
        (9, 131080, Failure::SourceMismatch),
    ] {
        let bytes = fixture(true, false, 131069, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut m = Memory::new(bytes);
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let a = r.capture_a(&expected).unwrap();
            assert_ne!(r.source.bytes[index], 0);
            r.source.edit = Some((call, index, 0));
            assert_eq!(r.recheck_b(a).unwrap_err(), reason);
        }
        assert_eq!(m.calls.len(), 9);
    }
}
#[test]
fn b_short_reads_and_truncation_stop_without_completing_the_read() {
    for truncate in [false, true] {
        let bytes = fixture(true, false, 4096, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut m = Memory::new(bytes);
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let a = r.capture_a(&expected).unwrap();
            if truncate {
                r.source.bytes.pop();
            } else {
                r.source.short = Some(5);
            }
            assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Changed);
        }
        assert_eq!(m.calls.len(), 5);
    }
}
#[test]
fn b_eof_refuses_growth_and_keeps_the_original_length() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        r.source.append = Some(6);
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Changed);
    }
    assert_eq!(m.calls.len(), 6);
    assert_eq!(b.used, 32 + 48 + 2 * n + 1);
}
#[test]
fn b_cannot_take_a_from_a_different_scope_even_with_identical_bytes() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut first = Memory::new(bytes.clone());
    let mut second = Memory::new(bytes);
    let a = {
        let mut r = b.begin(&mut first, n).unwrap();
        r.capture_a(&expected).unwrap()
    };
    {
        let mut r = b.begin(&mut second, n).unwrap();
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::SourceMismatch);
    }
    assert!(second.calls.is_empty());
    assert_eq!(first.calls.len(), 4);
}
#[test]
fn b_cannot_transfer_a_to_a_fresh_budget_of_the_same_source() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut first = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    let a = {
        let mut r = first.begin(&mut m, n).unwrap();
        r.capture_a(&expected).unwrap()
    };
    let mut second = SharedBudget::new(Instant::now(), &cancel);
    {
        let mut r = second.begin(&mut m, n).unwrap();
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::SourceMismatch);
    }
    assert_eq!(m.calls.len(), 4);
    assert_eq!(second.used, 0);
    assert_eq!(second.reserved, 0);
}
#[test]
fn b_rejects_inconsistent_private_capture_extent_before_reading() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let mut a = r.capture_a(&expected).unwrap();
        a.signature_start = u64::MAX;
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::SourceMismatch);
    }
    assert_eq!(m.calls.len(), 4);
}
#[test]
fn b_uses_the_eintr_allowance_already_consumed_by_a() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    m.interrupts = (1..=8).collect();
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        assert_eq!(r.budget.retries_left, 0);
        r.source.interrupts.push(13);
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::ReadFailed);
    }
    assert_eq!(m.calls.len(), 13);
}
#[test]
fn a_and_b_eintr_retry_the_same_offset_and_do_not_charge_failed_attempts() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len();
    let mut m = Memory::new(bytes);
    m.interrupts = vec![1, 6];
    let (out, used) = run_ab(&mut m, &expected);
    assert!(out.is_ok());
    assert_eq!(used, (32 + 48 + 2 * n) as u64);
    assert_eq!(m.calls[5], m.calls[6]);
    assert_eq!(m.calls.len(), 8);
}
#[test]
fn b_preserves_the_original_request_limit_including_its_eof_probe() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        r.requests = MAX_REQUESTS - 1;
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Limit);
    }
    assert_eq!(m.calls.len(), 5);
}
#[test]
fn b_refuses_insufficient_reserved_credit_without_new_reservation() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        let release = r.credit - (n - 1);
        r.credit = n - 1;
        r.budget.reserved -= release;
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Limit);
    }
    assert_eq!(m.calls.len(), 4);
    assert_eq!(b.reserved, 0);
}
#[test]
fn b_keeps_prior_consumption_and_releases_only_unused_credit() {
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let plan = 2 * n + 32 + MAX_HEADER + 2;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.account_read(MAX_BYTES - plan).unwrap();
    let prior = b.used;
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        r.recheck_b(a).unwrap();
        assert_eq!(r.budget.used, prior + 32 + 48 + 2 * n);
    }
    assert_eq!(b.reserved, 0);
}
#[test]
fn b_initial_deadline_or_cancel_has_no_io_and_no_fresh_deadline() {
    for is_cancel in [false, true] {
        let start = Instant::now();
        let tick = Cell::new(Duration::from_secs(9));
        let now = || start + tick.get();
        let cancel = AtomicBool::new(false);
        let bytes = fixture(true, false, 4096, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &now;
        let mut m = Memory::new(bytes);
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let a = r.capture_a(&expected).unwrap();
            if is_cancel {
                cancel.store(true, Ordering::Release);
            } else {
                tick.set(Duration::from_secs(10));
            }
            assert_eq!(
                r.recheck_b(a).unwrap_err(),
                if is_cancel {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                }
            );
        }
        assert_eq!(m.calls.len(), 4);
    }
}
#[test]
fn b_late_success_at_each_block_or_eof_is_discarded() {
    for at in 7..=10 {
        let start = Instant::now();
        let tick = Cell::new(Duration::ZERO);
        let now = || start + tick.get();
        let cancel = AtomicBool::new(false);
        let bytes = fixture(true, false, 131069, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &now;
        let mut m = Memory::new(bytes);
        m.hook = Some(Box::new(|call, _, _| {
            if call == at {
                tick.set(Duration::from_secs(10));
            }
        }));
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let a = r.capture_a(&expected).unwrap();
            assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Deadline);
        }
        assert_eq!(m.calls.len(), at);
        assert_eq!(b.reserved, 0);
    }
}
#[test]
fn b_cancel_at_each_block_or_eof_is_latched() {
    for at in 7..=10 {
        let cancel = AtomicBool::new(false);
        let bytes = fixture(true, false, 131069, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut m = Memory::new(bytes);
        m.hook = Some(Box::new(|call, _, _| {
            if call == at {
                cancel.store(true, Ordering::Release);
            }
        }));
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let a = r.capture_a(&expected).unwrap();
            assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Cancelled);
            cancel.store(false, Ordering::Release);
            assert_eq!(r.checkpoint(), Err(Failure::Cancelled));
        }
        assert_eq!(m.calls.len(), at);
    }
}
#[test]
fn b_hash_and_range_comparison_checkpoint_expiry_is_not_ignored() {
    for cutoff in [3, 4, 5] {
        let start = Instant::now();
        let armed = Cell::new(false);
        let checks = Cell::new(0);
        let now = || {
            if armed.get() {
                let n = checks.get() + 1;
                checks.set(n);
                if n >= cutoff {
                    return start + Duration::from_secs(10);
                }
            }
            start
        };
        let cancel = AtomicBool::new(false);
        let bytes = fixture(true, false, 4096, 48);
        let expected = digest(&bytes);
        let n = bytes.len() as u64;
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &now;
        let mut m = Memory::new(bytes);
        m.hook = Some(Box::new(|call, _, _| {
            if call == 5 {
                armed.set(true);
            }
        }));
        {
            let mut r = b.begin(&mut m, n).unwrap();
            let a = r.capture_a(&expected).unwrap();
            assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Deadline);
        }
        assert_eq!(checks.get(), cutoff);
        assert_eq!(m.calls.len(), 5);
    }
}
#[test]
fn b_final_checkpoint_after_zero_eof_can_still_reject() {
    let start = Instant::now();
    let after = Cell::new(false);
    let checks = Cell::new(0);
    let now = || {
        if after.get() {
            let n = checks.get() + 1;
            checks.set(n);
            if n >= 2 {
                return start + Duration::from_secs(10);
            }
        }
        start
    };
    let cancel = AtomicBool::new(false);
    let bytes = fixture(true, false, 4096, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &now;
    let mut m = Memory::new(bytes);
    m.hook = Some(Box::new(|call, _, _| {
        if call == 6 {
            after.set(true);
        }
    }));
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        assert_eq!(r.recheck_b(a).unwrap_err(), Failure::Deadline);
    }
    assert_eq!(m.calls.len(), 6);
    assert_eq!(checks.get(), 2);
}
#[test]
fn even_b_cannot_claim_absence_of_changes_behind_its_cursor() {
    let bytes = fixture(true, false, 131069, 48);
    let expected = digest(&bytes);
    let n = bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut m = Memory::new(bytes);
    {
        let mut r = b.begin(&mut m, n).unwrap();
        let a = r.capture_a(&expected).unwrap();
        r.source.edit = Some((8, 100, 0));
        let out = r.recheck_b(a).unwrap();
        assert_ne!(digest(&r.source.bytes), out.capture.full_hash);
        assert_eq!(
            format!("{out:?}"),
            "ComparedAB(bytes_only_pending_metadata_not_execution_authority)"
        );
        assert!(out.entitlement_gate().is_err());
    }
}
#[test]
fn b_comparison_helper_checks_partials_empty_intersections_and_overflow() {
    let target = [3, 4, 5, 6, 7];
    assert_eq!(compare_part(&target, 10, 8, &[1, 2, 3, 4]), Ok(2));
    assert_eq!(compare_part(&target, 10, 12, &[5, 6, 7, 8]), Ok(3));
    assert_eq!(compare_part(&target, 10, 15, &[8]), Ok(0));
    assert_eq!(
        compare_part(&target, 10, 8, &[1, 2, 3, 0]),
        Err(Failure::SourceMismatch)
    );
    assert_eq!(
        compare_part(&target, u64::MAX, 0, &[1]),
        Err(Failure::InvalidRange)
    );
}
