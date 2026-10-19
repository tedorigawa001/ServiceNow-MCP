use super::*;
use std::cell::Cell;

#[derive(Debug, PartialEq, Eq)]
enum Event {
    Read(u64, usize),
    Metadata(Phase),
}
type Hook<'a> = Box<dyn FnMut(Phase, &mut Observation) + 'a>;
struct Synthetic<'a> {
    bytes: Vec<u8>,
    base: Observation,
    overrides: Vec<(Phase, Observation)>,
    failure: Option<Phase>,
    events: Vec<Event>,
    hook: Option<Hook<'a>>,
    reads: usize,
    mutate_after: Option<usize>,
}
fn file() -> Vec<u8> {
    physical_signature::synthetic_file(true, false, 4096, 48)
}
fn observation(n: u64) -> Observation {
    let stat = Stat {
        device: 7,
        inode: 42,
        kind: FileType::Regular,
        uid: 0,
        gid: 80,
        mode: 0o555,
        links: 1,
        size: n,
        mtime: Timestamp {
            seconds: 123,
            nanoseconds: 10,
        },
        ctime: Timestamp {
            seconds: 456,
            nanoseconds: 20,
        },
    };
    Observation {
        before: stat.clone(),
        after: stat,
        acl: Acl::Absent,
        filesystem: Filesystem::Local,
        declared_name_bytes: 0,
        names: Some(Vec::new()),
    }
}
impl Synthetic<'_> {
    fn new(bytes: Vec<u8>) -> Self {
        let base = observation(bytes.len() as u64);
        Self {
            bytes,
            base,
            overrides: Vec::new(),
            failure: None,
            events: Vec::new(),
            hook: None,
            reads: 0,
            mutate_after: None,
        }
    }
    fn phases(&self) -> Vec<Phase> {
        self.events
            .iter()
            .filter_map(|event| {
                if let Event::Metadata(p) = event {
                    Some(*p)
                } else {
                    None
                }
            })
            .collect()
    }
}
impl PositionedSource for Synthetic<'_> {
    fn pread(&mut self, offset: u64, output: &mut [u8]) -> Result<usize, IoFailure> {
        self.events.push(Event::Read(offset, output.len()));
        self.reads += 1;
        let start = usize::try_from(offset).map_err(|_| IoFailure::Failed)?;
        let n = output.len().min(self.bytes.len().saturating_sub(start));
        if n > 0 {
            output[..n].copy_from_slice(&self.bytes[start..start + n]);
        }
        if self.mutate_after == Some(self.reads) {
            self.bytes[100] ^= 1;
            self.base.before.ctime.nanoseconds += 1;
            self.base.after = self.base.before.clone();
        }
        Ok(n)
    }
}
impl MetadataSource for Synthetic<'_> {
    fn metadata(&mut self, phase: Phase) -> Result<Observation, RetrievalFailure> {
        self.events.push(Event::Metadata(phase));
        let mut value = self
            .overrides
            .iter()
            .find(|(p, _)| *p == phase)
            .map_or_else(|| self.base.clone(), |(_, v)| v.clone());
        if let Some(hook) = self.hook.as_mut() {
            hook(phase, &mut value);
        }
        if self.failure == Some(phase) {
            Err(RetrievalFailure::Unavailable)
        } else {
            Ok(value)
        }
    }
}
fn hash(v: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(v).into()
}
const PHASES: [Phase; 5] = [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4];
fn position(p: Phase) -> usize {
    PHASES.iter().position(|q| *q == p).unwrap()
}
fn run(source: &mut Synthetic<'_>) -> (Result<ComparedM0M4, Failure>, u64) {
    let expected = hash(&source.bytes);
    let n = source.bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let result = {
        let mut r = b.begin(source, n).unwrap();
        r.compare_m0_m4(&expected, 7)
    };
    assert_eq!(b.reserved, 0);
    (result, b.used)
}
fn same_stat(value: &mut Observation, f: impl FnOnce(&mut Stat)) {
    f(&mut value.before);
    value.after = value.before.clone();
}
fn set_names(value: &mut Observation, raw: Option<Vec<u8>>) {
    value.declared_name_bytes = raw.as_ref().map_or(0, |v| v.len() as u32);
    value.names = raw;
}

#[test]
fn successful_flow_has_exact_m0_m4_order_and_original_io_budget() {
    let mut s = Synthetic::new(file());
    let n = s.bytes.len();
    let (out, used) = run(&mut s);
    let out = out.unwrap();
    assert_eq!(used, (32 + 48 + 2 * n) as u64);
    assert_eq!(s.phases(), PHASES);
    assert_eq!(
        s.events,
        vec![
            Event::Metadata(Phase::M0),
            Event::Read(0, 32),
            Event::Read(0, 48),
            Event::Metadata(Phase::M1),
            Event::Read(0, n),
            Event::Read(n as u64, 1),
            Event::Metadata(Phase::M2),
            Event::Metadata(Phase::M3),
            Event::Read(0, n),
            Event::Read(n as u64, 1),
            Event::Metadata(Phase::M4)
        ]
    );
    assert_eq!(out.baseline.stat.inode, 42);
    assert_eq!(
        format!("{out:?}"),
        "ComparedM0M4(source_only_pending_path_record_lease_not_execution_authority)"
    );
    assert_eq!(
        out.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
}
#[test]
fn valid_provenance_names_and_nonzero_gid_are_preserved_without_values() {
    let mut s = Synthetic::new(file());
    set_names(&mut s.base, Some(b"com.apple.provenance\0".to_vec()));
    same_stat(&mut s.base, |v| v.gid = 123);
    let out = run(&mut s).0.unwrap();
    assert!(out.baseline.names == Names::Provenance);
    assert_eq!(out.baseline.stat.gid, 123);
}
#[test]
fn der_and_absence_remain_closed_even_after_all_metadata_matches() {
    for (xml, der, stop) in [
        (true, true, physical_signature::Rejection::UnsupportedDer),
        (false, true, physical_signature::Rejection::UnsupportedDer),
        (false, false, physical_signature::Rejection::AbsenceUnproven),
    ] {
        let mut s = Synthetic::new(physical_signature::synthetic_file(xml, der, 4096, 48));
        assert_eq!(run(&mut s).0.unwrap().entitlement_gate(), Err(stop));
        assert_eq!(s.phases(), PHASES);
    }
}
#[test]
fn initial_owner_mode_type_links_size_device_acl_and_fs_policy_fail_before_reads() {
    for field in 0..9 {
        let mut s = Synthetic::new(file());
        let mut value = s.base.clone();
        match field {
            0 => same_stat(&mut value, |v| v.uid = 1),
            1 => same_stat(&mut value, |v| v.mode = 0o444),
            2 => same_stat(&mut value, |v| v.kind = FileType::Directory),
            3 => same_stat(&mut value, |v| v.links = 2),
            4 => same_stat(&mut value, |v| v.size += 1),
            5 => same_stat(&mut value, |v| v.device = 8),
            6 => value.acl = Acl::Present,
            7 => value.filesystem = Filesystem::NonLocal,
            _ => same_stat(&mut value, |v| v.mode = 0o4555),
        };
        s.overrides.push((Phase::M0, value));
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::Metadata);
        assert_eq!(s.phases(), [Phase::M0]);
        assert_eq!(s.reads, 0);
    }
}
#[test]
fn unknown_observations_are_never_coerced_to_absence_or_local_regular_file() {
    for field in 0..6 {
        let mut s = Synthetic::new(file());
        let mut v = s.base.clone();
        match field {
            0 => v.acl = Acl::Unknown,
            1 => v.filesystem = Filesystem::Unknown,
            2 => set_names(&mut v, None),
            3 => same_stat(&mut v, |v| v.kind = FileType::Unknown),
            4 => same_stat(&mut v, |v| v.kind = FileType::Symlink),
            _ => same_stat(&mut v, |v| v.kind = FileType::Other),
        };
        s.overrides.push((Phase::M0, v));
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::Metadata);
        assert_eq!(s.reads, 0);
    }
}
#[test]
fn malformed_times_and_unmasked_type_or_permission_bits_fail() {
    for field in 0..4 {
        let mut s = Synthetic::new(file());
        let mut v = s.base.clone();
        same_stat(&mut v, |v| match field {
            0 => v.mtime.nanoseconds = 1_000_000_000,
            1 => v.ctime.nanoseconds = u32::MAX,
            2 => v.mode = 0o100555,
            _ => v.mode = 0o755,
        });
        s.overrides.push((Phase::M0, v));
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::Metadata);
        assert_eq!(s.reads, 0);
    }
}
#[test]
fn xattr_names_are_exact_and_quarantine_resourcefork_duplicates_or_invalid_lists_reject() {
    for raw in [
        b"com.apple.quarantine\0".as_slice(),
        b"com.apple.ResourceFork\0",
        b"unknown\0",
        b"com.apple.provenance",
        b"com.apple.provenance\0com.apple.provenance\0",
        b"\0",
        b"com.apple.Provenance\0",
        b"\xff\0",
    ] {
        let mut s = Synthetic::new(file());
        set_names(&mut s.base, Some(raw.to_vec()));
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::Metadata);
        assert_eq!(s.reads, 0);
    }
}
#[test]
fn xattr_declared_returned_size_race_and_byte_caps_stop() {
    for case in 0..4 {
        let mut s = Synthetic::new(file());
        let expected = match case {
            0 => {
                s.base.declared_name_bytes = 1;
                Failure::Changed
            }
            1 => {
                s.base.declared_name_bytes = u32::MAX;
                Failure::Limit
            }
            2 => {
                set_names(&mut s.base, Some(vec![0; 65537]));
                Failure::Limit
            }
            _ => {
                set_names(&mut s.base, Some(vec![0; 65536]));
                Failure::Metadata
            }
        };
        assert_eq!(run(&mut s).0.unwrap_err(), expected);
        assert_eq!(s.reads, 0);
    }
}
#[test]
fn before_after_stat_race_rejects_at_each_phase() {
    for phase in PHASES {
        let mut s = Synthetic::new(file());
        let mut v = s.base.clone();
        v.after.ctime.nanoseconds += 1;
        s.overrides.push((phase, v));
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
        assert_eq!(s.phases(), PHASES[..=position(phase)]);
    }
}
#[test]
fn every_identity_attribute_change_at_m1_through_m4_rejects() {
    for phase in &PHASES[1..] {
        for field in 0..15 {
            let mut s = Synthetic::new(file());
            let mut v = s.base.clone();
            if field < 12 {
                same_stat(&mut v, |v| match field {
                    0 => v.device += 1,
                    1 => v.inode += 1,
                    2 => v.kind = FileType::Directory,
                    3 => v.uid += 1,
                    4 => v.gid += 1,
                    5 => v.mode = 0o444,
                    6 => v.links += 1,
                    7 => v.size += 1,
                    8 => v.mtime.seconds += 1,
                    9 => v.mtime.nanoseconds += 1,
                    10 => v.ctime.seconds += 1,
                    _ => v.ctime.nanoseconds += 1,
                });
            } else {
                match field {
                    12 => v.acl = Acl::Present,
                    13 => v.filesystem = Filesystem::NonLocal,
                    _ => set_names(&mut v, Some(b"com.apple.provenance\0".to_vec())),
                };
            }
            s.overrides.push((*phase, v));
            assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
            assert_eq!(s.phases(), PHASES[..=position(*phase)]);
        }
    }
}
#[test]
fn unknown_later_fields_stop_as_changed_not_as_a_new_baseline() {
    for phase in &PHASES[1..] {
        for field in 0..3 {
            let mut s = Synthetic::new(file());
            let mut v = s.base.clone();
            match field {
                0 => v.acl = Acl::Unknown,
                1 => v.filesystem = Filesystem::Unknown,
                _ => set_names(&mut v, None),
            };
            s.overrides.push((*phase, v));
            assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
        }
    }
}
#[test]
fn metadata_retrieval_failure_at_every_phase_never_falls_back_or_retries() {
    for phase in PHASES {
        let mut s = Synthetic::new(file());
        s.failure = Some(phase);
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::MetadataUnavailable);
        assert_eq!(s.phases(), PHASES[..=position(phase)]);
        let expected = match phase {
            Phase::M0 => 0,
            Phase::M1 => 2,
            Phase::M2 | Phase::M3 => 4,
            Phase::M4 => 6,
        };
        assert_eq!(s.reads, expected);
    }
}
#[test]
fn m1_detects_change_after_preflight_before_any_a_walk() {
    let mut s = Synthetic::new(file());
    s.mutate_after = Some(2);
    assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
    assert_eq!(s.reads, 2);
    assert_eq!(s.phases(), [Phase::M0, Phase::M1]);
}
#[test]
fn m2_detects_change_behind_a_cursor_before_parser_or_b() {
    let mut s = Synthetic::new(file());
    s.mutate_after = Some(3);
    assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
    assert_eq!(s.reads, 4);
    assert_eq!(s.phases(), [Phase::M0, Phase::M1, Phase::M2]);
}
#[test]
fn m4_detects_change_behind_b_cursor_and_discards_bytes_only_success() {
    let mut s = Synthetic::new(file());
    s.mutate_after = Some(5);
    assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
    assert_eq!(s.reads, 6);
    assert_eq!(s.phases(), PHASES);
}
#[test]
fn m2_precedes_parser_and_m3_does_not_run_after_parser_failure() {
    for changed in [false, true] {
        let mut bytes = file();
        bytes[4096] = 0;
        let mut s = Synthetic::new(bytes);
        if changed {
            let mut v = s.base.clone();
            same_stat(&mut v, |v| v.inode += 1);
            s.overrides.push((Phase::M2, v));
        }
        assert_eq!(
            run(&mut s).0.unwrap_err(),
            if changed {
                Failure::Changed
            } else {
                Failure::Parser(physical_signature::Rejection::InvalidBlob)
            }
        );
        assert_eq!(s.phases(), [Phase::M0, Phase::M1, Phase::M2]);
        assert_eq!(s.reads, 4);
    }
}
#[test]
fn m3_failure_is_after_parser_but_before_the_b_walk() {
    let mut s = Synthetic::new(file());
    s.failure = Some(Phase::M3);
    assert_eq!(run(&mut s).0.unwrap_err(), Failure::MetadataUnavailable);
    assert_eq!(s.phases(), PHASES[..4]);
    assert_eq!(s.reads, 4);
}
#[test]
fn failing_m4_latches_future_reads_metadata_and_next_scope() {
    let mut s = Synthetic::new(file());
    let expected = hash(&s.bytes);
    let n = s.bytes.len() as u64;
    s.failure = Some(Phase::M4);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    {
        let mut r = b.begin(&mut s, n).unwrap();
        assert_eq!(
            r.compare_m0_m4(&expected, 7).unwrap_err(),
            Failure::MetadataUnavailable
        );
        assert_eq!(r.read(0, &mut [0; 1]), Err(Failure::MetadataUnavailable));
        assert_eq!(
            r.compare_m0_m4(&expected, 7).unwrap_err(),
            Failure::MetadataUnavailable
        );
    }
    assert!(matches!(
        b.begin(&mut s, n),
        Err(Failure::MetadataUnavailable)
    ));
    assert_eq!(s.phases(), PHASES);
    assert_eq!(s.reads, 6);
    assert_eq!(b.reserved, 0);
}
#[test]
fn wrong_expected_device_is_not_learned_from_source() {
    let mut s = Synthetic::new(file());
    let expected = hash(&s.bytes);
    let n = s.bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    {
        let mut r = b.begin(&mut s, n).unwrap();
        assert_eq!(
            r.compare_m0_m4(&expected, 8).unwrap_err(),
            Failure::Metadata
        );
    }
    assert_eq!(s.reads, 0);
}
#[test]
fn metadata_workflow_rejects_skipped_duplicate_and_out_of_order_phases() {
    for wrong in [Phase::M0, Phase::M2, Phase::M4] {
        let mut s = Synthetic::new(file());
        let n = s.bytes.len() as u64;
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        {
            let mut r = b.begin(&mut s, n).unwrap();
            let mut acquire = |r: &mut ReadScope<'_, '_, Synthetic<'_>>, p| {
                r.source
                    .metadata(p)
                    .map_err(|_| Failure::MetadataUnavailable)
            };
            let mut flow = Flow::start(&mut r, 7, &mut acquire).unwrap();
            assert_eq!(
                flow.advance(&mut r, wrong, &mut acquire),
                Err(Failure::SourceMismatch)
            );
        }
        assert_eq!(s.phases(), [Phase::M0]);
    }
    let mut s = Synthetic::new(file());
    let n = s.bytes.len() as u64;
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    {
        let mut r = b.begin(&mut s, n).unwrap();
        let mut acquire = |r: &mut ReadScope<'_, '_, Synthetic<'_>>, p| {
            r.source
                .metadata(p)
                .map_err(|_| Failure::MetadataUnavailable)
        };
        let mut flow = Flow::start(&mut r, 7, &mut acquire).unwrap();
        flow.advance(&mut r, Phase::M1, &mut acquire).unwrap();
        assert_eq!(
            flow.advance(&mut r, Phase::M1, &mut acquire),
            Err(Failure::SourceMismatch)
        );
    }
    assert_eq!(s.phases(), [Phase::M0, Phase::M1]);
}
#[test]
fn metadata_late_success_or_error_at_each_phase_is_discarded() {
    for phase in PHASES {
        for fail in [false, true] {
            let start = Instant::now();
            let tick = Cell::new(Duration::ZERO);
            let now = || start + tick.get();
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(start, &cancel);
            b.now = &now;
            let mut s = Synthetic::new(file());
            if fail {
                s.failure = Some(phase);
            }
            s.hook = Some(Box::new(|p, _| {
                if p == phase {
                    tick.set(Duration::from_secs(10));
                }
            }));
            let expected = hash(&s.bytes);
            let n = s.bytes.len() as u64;
            {
                let mut r = b.begin(&mut s, n).unwrap();
                assert_eq!(
                    r.compare_m0_m4(&expected, 7).unwrap_err(),
                    Failure::Deadline
                );
                tick.set(Duration::ZERO);
                assert_eq!(r.checkpoint(), Err(Failure::Deadline));
            }
            assert_eq!(s.phases(), PHASES[..=position(phase)]);
            assert_eq!(b.reserved, 0);
        }
    }
}
#[test]
fn metadata_cancel_at_each_phase_stops_even_when_source_returns_error() {
    for phase in PHASES {
        for fail in [false, true] {
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let mut s = Synthetic::new(file());
            if fail {
                s.failure = Some(phase);
            }
            s.hook = Some(Box::new(|p, _| {
                if p == phase {
                    cancel.store(true, Ordering::Release);
                }
            }));
            let expected = hash(&s.bytes);
            let n = s.bytes.len() as u64;
            {
                let mut r = b.begin(&mut s, n).unwrap();
                assert_eq!(
                    r.compare_m0_m4(&expected, 7).unwrap_err(),
                    Failure::Cancelled
                );
                cancel.store(false, Ordering::Release);
                assert_eq!(r.checkpoint(), Err(Failure::Cancelled));
            }
            assert_eq!(s.phases(), PHASES[..=position(phase)]);
        }
    }
}
#[test]
fn metadata_m4_final_checkpoint_cannot_return_a_late_summary() {
    let start = Instant::now();
    let after = Cell::new(false);
    let checks = Cell::new(0);
    let now = || {
        if after.get() {
            let n = checks.get() + 1;
            checks.set(n);
            if n >= 3 {
                return start + Duration::from_secs(10);
            }
        }
        start
    };
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &now;
    let mut s = Synthetic::new(file());
    s.hook = Some(Box::new(|p, _| {
        if p == Phase::M4 {
            after.set(true);
        }
    }));
    let expected = hash(&s.bytes);
    let n = s.bytes.len() as u64;
    {
        let mut r = b.begin(&mut s, n).unwrap();
        assert_eq!(
            r.compare_m0_m4(&expected, 7).unwrap_err(),
            Failure::Deadline
        );
    }
    assert_eq!(checks.get(), 3);
    assert_eq!(s.phases(), PHASES);
}
#[test]
fn metadata_before_after_mismatch_is_not_hidden_by_unchanged_file_bytes() {
    let mut s = Synthetic::new(file());
    let original = hash(&s.bytes);
    let mut v = s.base.clone();
    v.before.gid = 81;
    s.overrides.push((Phase::M4, v));
    assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
    assert_eq!(hash(&s.bytes), original);
}
#[test]
fn metadata_state_uses_original_deadline_and_retains_prior_io_accounting() {
    let start = Instant::now();
    let now = || start + Duration::from_secs(9);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &now;
    b.account_read(123).unwrap();
    let mut s = Synthetic::new(file());
    let expected = hash(&s.bytes);
    let n = s.bytes.len() as u64;
    {
        let mut r = b.begin(&mut s, n).unwrap();
        r.compare_m0_m4(&expected, 7).unwrap();
    }
    assert_eq!(b.used, 123 + 32 + 48 + 2 * n);
    assert_eq!(b.reserved, 0);
}
#[test]
fn metadata_untrusted_name_markers_never_appear_in_failure_or_debug() {
    let mut s = Synthetic::new(file());
    set_names(&mut s.base, Some(b"secret-marker\0".to_vec()));
    let err = run(&mut s).0.unwrap_err();
    assert_eq!(format!("{err:?}"), "Metadata");
}

#[test]
fn removing_allowed_provenance_name_is_also_a_change() {
    for phase in &PHASES[1..] {
        let mut s = Synthetic::new(file());
        set_names(&mut s.base, Some(b"com.apple.provenance\0".to_vec()));
        let mut changed = s.base.clone();
        set_names(&mut changed, Some(Vec::new()));
        s.overrides.push((*phase, changed));
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
    }
}

#[test]
fn expiration_or_cancel_before_m0_does_not_call_metadata_source() {
    for cancelled in [false, true] {
        let start = Instant::now();
        let tick = Cell::new(Duration::ZERO);
        let now = || start + tick.get();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &now;
        let mut s = Synthetic::new(file());
        let expected = hash(&s.bytes);
        let n = s.bytes.len() as u64;
        {
            let mut r = b.begin(&mut s, n).unwrap();
            if cancelled {
                cancel.store(true, Ordering::Release);
            } else {
                tick.set(Duration::from_secs(10));
            }
            assert_eq!(
                r.compare_m0_m4(&expected, 7).unwrap_err(),
                if cancelled {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                }
            );
        }
        assert!(s.events.is_empty());
        assert_eq!(b.reserved, 0);
    }
}

#[test]
fn cancellation_after_m4_comparison_is_caught_before_returning_summary() {
    let start = Instant::now();
    let after = Cell::new(false);
    let checks = Cell::new(0);
    let cancel = AtomicBool::new(false);
    let now = || {
        if after.get() {
            let n = checks.get() + 1;
            checks.set(n);
            if n == 2 {
                cancel.store(true, Ordering::Release);
            }
        }
        start
    };
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &now;
    let mut s = Synthetic::new(file());
    s.hook = Some(Box::new(|p, _| {
        if p == Phase::M4 {
            after.set(true);
        }
    }));
    let expected = hash(&s.bytes);
    let n = s.bytes.len() as u64;
    {
        let mut r = b.begin(&mut s, n).unwrap();
        assert_eq!(
            r.compare_m0_m4(&expected, 7).unwrap_err(),
            Failure::Cancelled
        );
    }
    assert_eq!(s.phases(), PHASES);
    assert_eq!(checks.get(), 2);
}
