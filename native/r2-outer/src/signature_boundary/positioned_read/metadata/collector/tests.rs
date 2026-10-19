use super::*;
use std::cell::Cell;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Step {
    Before,
    Fs,
    Init,
    AclStat,
    Query,
    Size,
    Names,
    Confirm,
    After,
    Free,
}
const STEPS: [Step; 10] = [
    Step::Before,
    Step::Fs,
    Step::Init,
    Step::AclStat,
    Step::Query,
    Step::Size,
    Step::Names,
    Step::Confirm,
    Step::After,
    Step::Free,
];
const PHASES: [Phase; 5] = [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4];
#[derive(Default)]
struct Life {
    created: Cell<u32>,
    freed: Cell<u32>,
    dropped: Cell<u32>,
}
struct Handle {
    phase: Phase,
    life: Rc<Life>,
}
impl Drop for Handle {
    fn drop(&mut self) {
        self.life.dropped.set(self.life.dropped.get() + 1);
    }
}
type Hook<'a> = Box<dyn FnMut(Phase, Step) + 'a>;
struct Synthetic<'a> {
    bytes: Vec<u8>,
    stat: Stat,
    names: Vec<u8>,
    events: Vec<(Phase, Step)>,
    reads: usize,
    life: Rc<Life>,
    hook: Option<Hook<'a>>,
    fail: Option<(Phase, Step, OpFailure)>,
    size_calls: usize,
    sizes: Option<(i64, i64)>,
    got: Option<usize>,
    present: i32,
    present_at: Option<(Phase, i32)>,
    fs: FsObservation,
    change: Option<(Phase, Step)>,
    bad_stat: bool,
    copy_capacity: Vec<usize>,
}
fn file() -> Vec<u8> {
    physical_signature::synthetic_file(true, false, 4096, 48)
}
fn hash(bytes: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes).into()
}
impl Synthetic<'_> {
    fn new() -> Self {
        let bytes = file();
        let stat = Stat {
            device: 7,
            inode: 42,
            kind: FileType::Regular,
            uid: 0,
            gid: 80,
            mode: 0o555,
            links: 1,
            size: bytes.len() as u64,
            mtime: Timestamp {
                seconds: 123,
                nanoseconds: 10,
            },
            ctime: Timestamp {
                seconds: 456,
                nanoseconds: 20,
            },
        };
        Self {
            bytes,
            stat,
            names: Vec::new(),
            events: Vec::new(),
            reads: 0,
            life: Rc::new(Life::default()),
            hook: None,
            fail: None,
            size_calls: 0,
            sizes: None,
            got: None,
            present: 0,
            present_at: None,
            fs: FsObservation {
                location: Filesystem::Local,
                apfs: true,
                ownership_ignored: false,
                noexec: false,
            },
            change: None,
            bad_stat: false,
            copy_capacity: Vec::new(),
        }
    }
    fn event(&mut self, p: Phase, step: Step) -> Result<(), OpFailure> {
        self.events.push((p, step));
        if let Some(hook) = &mut self.hook {
            hook(p, step);
        }
        if let Some((q, t, e)) = self.fail
            && (p, step) == (q, t)
        {
            return Err(e);
        }
        Ok(())
    }
    fn stamp(&self, p: Phase, step: Step) -> Stat {
        let mut stat = self.stat.clone();
        if self.change == Some((p, step)) {
            stat.ctime.nanoseconds += 1;
        }
        if self.bad_stat {
            stat.uid = 1;
        }
        stat
    }
}
impl PositionedSource for Synthetic<'_> {
    fn pread(&mut self, offset: u64, output: &mut [u8]) -> Result<usize, IoFailure> {
        self.reads += 1;
        let start = offset as usize;
        let n = output.len().min(self.bytes.len().saturating_sub(start));
        if n > 0 {
            output[..n].copy_from_slice(&self.bytes[start..start + n]);
        }
        Ok(n)
    }
}
impl MetadataOps for Synthetic<'_> {
    type AclHandle = Handle;
    fn stat(&mut self, p: Phase, point: StatPoint) -> Result<Stat, OpFailure> {
        let step = match point {
            StatPoint::Before => {
                self.size_calls = 0;
                Step::Before
            }
            StatPoint::After => Step::After,
        };
        self.event(p, step)?;
        Ok(self.stamp(p, step))
    }
    fn filesystem(&mut self, p: Phase) -> Result<FsObservation, OpFailure> {
        self.event(p, Step::Fs)?;
        Ok(FsObservation {
            location: self.fs.location,
            apfs: self.fs.apfs,
            ownership_ignored: self.fs.ownership_ignored,
            noexec: self.fs.noexec,
        })
    }
    fn acl_init(&mut self, p: Phase) -> Result<Handle, OpFailure> {
        self.event(p, Step::Init)?;
        self.life.created.set(self.life.created.get() + 1);
        Ok(Handle {
            phase: p,
            life: self.life.clone(),
        })
    }
    fn acl_stat(&mut self, p: Phase, handle: &mut Handle) -> Result<Stat, OpFailure> {
        assert_eq!(p, handle.phase);
        self.event(p, Step::AclStat)?;
        Ok(self.stamp(p, Step::AclStat))
    }
    fn acl_query(&mut self, p: Phase, handle: &mut Handle) -> Result<i32, OpFailure> {
        assert_eq!(p, handle.phase);
        self.event(p, Step::Query)?;
        Ok(match self.present_at {
            Some((q, value)) if q == p => value,
            _ => self.present,
        })
    }
    fn acl_free(&mut self, handle: Handle) {
        self.event(handle.phase, Step::Free).unwrap_or(());
        self.life.freed.set(self.life.freed.get() + 1);
        drop(handle);
    }
    fn names_size(&mut self, p: Phase) -> Result<i64, OpFailure> {
        let step = if self.size_calls == 0 {
            Step::Size
        } else {
            Step::Confirm
        };
        self.size_calls += 1;
        self.event(p, step)?;
        Ok(self.sizes.map_or(self.names.len() as i64, |(a, b)| {
            if step == Step::Size { a } else { b }
        }))
    }
    fn names_read(&mut self, p: Phase, output: &mut [u8]) -> Result<usize, OpFailure> {
        self.copy_capacity.push(output.len());
        self.event(p, Step::Names)?;
        let copied = output.len().min(self.names.len());
        output[..copied].copy_from_slice(&self.names[..copied]);
        Ok(self.got.unwrap_or(copied))
    }
}
fn run(s: &mut Synthetic<'_>) -> (Result<ComparedM0M4, Failure>, u32, u64, u64) {
    let cancel = AtomicBool::new(false);
    let mut budget = SharedBudget::new(Instant::now(), &cancel);
    let n = s.bytes.len() as u64;
    let expected = hash(&s.bytes);
    let out = budget
        .begin(s, n)
        .unwrap()
        .compare_collected_m0_m4(&expected, 7);
    assert_eq!(budget.metadata_cleanup_reserved, 0);
    assert_eq!(budget.reserved, 0);
    (
        out,
        budget.metadata_calls,
        budget.metadata_name_bytes,
        budget.used,
    )
}
fn released(s: &Synthetic<'_>) {
    assert_eq!(s.life.created.get(), s.life.freed.get());
    assert_eq!(s.life.created.get(), s.life.dropped.get());
}

#[test]
fn five_phases_follow_single_attempt_recipe_and_keep_payload_accounting() {
    for names in [Vec::new(), b"com.apple.provenance\0".to_vec()] {
        let mut s = Synthetic::new();
        s.names = names;
        let n = s.bytes.len() as u64;
        let (out, calls, name_bytes, used) = run(&mut s);
        let out = out.unwrap();
        assert_eq!(
            s.events,
            PHASES
                .into_iter()
                .flat_map(|p| STEPS.map(|t| (p, t)))
                .collect::<Vec<_>>()
        );
        assert_eq!(calls, 50);
        assert_eq!(name_bytes, 5 * s.names.len() as u64);
        assert_eq!(used, 32 + 48 + 2 * n);
        assert_eq!(s.life.created.get(), 5);
        released(&s);
        assert!(s.copy_capacity.iter().all(|n| *n >= 1));
        assert_eq!(
            format!("{out:?}"),
            "ComparedM0M4(source_only_pending_path_record_lease_not_execution_authority)"
        );
        assert_eq!(
            out.entitlement_gate(),
            Err(physical_signature::Rejection::UnverifiedXml)
        );
    }
}
#[test]
fn every_operation_failure_stops_all_later_work_but_releases_created_handles() {
    for p in PHASES {
        for step in &STEPS[..9] {
            for error in [OpFailure::Unavailable, OpFailure::Interrupted] {
                let mut s = Synthetic::new();
                s.fail = Some((p, *step, error));
                assert_eq!(run(&mut s).0.unwrap_err(), Failure::MetadataUnavailable);
                released(&s);
                let i = s.events.iter().position(|v| *v == (p, *step)).unwrap();
                assert!(s.events[i + 1..].iter().all(|v| *v == (p, Step::Free)));
            }
        }
    }
}
#[test]
fn acl_and_before_after_stat_races_reject_at_each_phase() {
    for p in PHASES {
        for step in [Step::AclStat, Step::After] {
            let mut s = Synthetic::new();
            s.change = Some((p, step));
            assert_eq!(run(&mut s).0.unwrap_err(), Failure::Changed);
            released(&s);
        }
    }
}
#[test]
fn initial_bad_stat_has_no_filesystem_allocation_or_payload_calls() {
    let mut s = Synthetic::new();
    s.bad_stat = true;
    assert_eq!(run(&mut s).0.unwrap_err(), Failure::Metadata);
    assert_eq!(s.events, [(Phase::M0, Step::Before)]);
    assert_eq!(s.reads, 0);
    released(&s);
}
#[test]
fn filesystem_profile_rejects_nonlocal_unknown_nonapfs_ignored_owners_and_noexec() {
    for case in 0..5 {
        let mut s = Synthetic::new();
        match case {
            0 => s.fs.location = Filesystem::NonLocal,
            1 => s.fs.location = Filesystem::Unknown,
            2 => s.fs.apfs = false,
            3 => s.fs.ownership_ignored = true,
            _ => s.fs.noexec = true,
        }
        assert_eq!(run(&mut s).0.unwrap_err(), Failure::Metadata);
        assert_eq!(s.events.len(), 2);
        assert_eq!(s.reads, 0);
        released(&s);
    }
}
#[test]
fn acl_present_and_invalid_sentinel_never_become_absent() {
    for phase in PHASES {
        for present in [1, -1, 2, i32::MAX] {
            let mut s = Synthetic::new();
            s.present_at = Some((phase, present));
            let reason = match (phase, present) {
                (Phase::M0, 1) => Failure::Metadata,
                (_, 1) => Failure::Changed,
                _ => Failure::MetadataUnavailable,
            };
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let expected = hash(&s.bytes);
            let n = s.bytes.len() as u64;
            let out = b
                .begin(&mut s, n)
                .unwrap()
                .compare_collected_m0_m4(&expected, 7);
            assert_eq!(out.unwrap_err(), reason);
            assert_eq!(b.checkpoint(), Err(reason));
            assert_eq!(b.metadata_cleanup_reserved, 0);
            assert_eq!(s.events.last(), Some(&(phase, Step::Free)));
            assert!(!s.events.contains(&(phase, Step::Size)));
            released(&s);
        }
    }
}
#[test]
fn name_lengths_are_bounded_before_allocation_and_negative_is_not_empty() {
    for (n, reason) in [
        (-1, Failure::MetadataUnavailable),
        (65537, Failure::Limit),
        (i64::MAX, Failure::Limit),
    ] {
        let mut s = Synthetic::new();
        s.sizes = Some((n, n));
        assert_eq!(run(&mut s).0.unwrap_err(), reason);
        assert!(s.copy_capacity.is_empty());
        released(&s);
    }
}
#[test]
fn empty_name_list_still_performs_nonzero_copy_and_requery() {
    let mut s = Synthetic::new();
    assert!(run(&mut s).0.is_ok());
    assert_eq!(s.copy_capacity, [1; 5]);
    let mut s = Synthetic::new();
    s.got = Some(1);
    let (_, _, charged, _) = run(&mut s);
    assert_eq!(charged, 1);
    released(&s);
}
#[test]
fn copy_short_overlarge_erange_and_requery_races_are_not_retried() {
    for case in 0..6 {
        let mut s = Synthetic::new();
        s.names = b"com.apple.provenance\0".to_vec();
        let n = s.names.len();
        let expected = if case == 5 {
            Failure::MetadataUnavailable
        } else {
            Failure::Changed
        };
        match case {
            0 => s.got = Some(0),
            1 => s.got = Some(n - 1),
            2 => s.got = Some(n + 1),
            3 => s.fail = Some((Phase::M0, Step::Names, OpFailure::Range)),
            4 => s.sizes = Some((n as i64, n as i64 + 1)),
            _ => s.sizes = Some((n as i64, -1)),
        }
        assert_eq!(run(&mut s).0.unwrap_err(), expected);
        assert_eq!(s.copy_capacity.len(), 1);
        released(&s);
    }
}
#[test]
fn name_policy_rejects_nul_duplicates_unknown_and_exact_64k_without_exposure() {
    for names in [
        b"secret-marker\0".to_vec(),
        b"com.apple.quarantine\0".to_vec(),
        b"com.apple.ResourceFork\0".to_vec(),
        b"com.apple.provenance".to_vec(),
        b"\0".to_vec(),
        b"com.apple.provenance\0com.apple.provenance\0".to_vec(),
        vec![1; 65536],
    ] {
        let mut s = Synthetic::new();
        s.names = names;
        let (out, _, charged, _) = run(&mut s);
        let reason = out.unwrap_err();
        assert_eq!(reason, Failure::Metadata);
        assert_eq!(charged, s.names.len() as u64);
        assert!(!format!("{reason:?}").contains("secret-marker"));
        assert!(!s.events.iter().any(|v| v.1 == Step::After));
        released(&s);
    }
}
#[test]
fn late_success_and_error_or_cancel_at_every_boundary_stop_and_release() {
    for p in PHASES {
        for step in STEPS {
            for mode in 0..3 {
                let started = Instant::now();
                let now = Cell::new(started);
                let cancel = AtomicBool::new(false);
                let mut s = Synthetic::new();
                if mode == 1 && step != Step::Free {
                    s.fail = Some((p, step, OpFailure::Unavailable));
                }
                s.hook = Some(Box::new(|q, t| {
                    if (q, t) == (p, step) {
                        if mode == 2 {
                            cancel.store(true, Ordering::Release);
                        } else {
                            now.set(started + Duration::from_secs(10));
                        }
                    }
                }));
                let expected = hash(&s.bytes);
                let n = s.bytes.len() as u64;
                let clock = || now.get();
                let mut b = SharedBudget::new(started, &cancel);
                b.now = &clock;
                let result = b
                    .begin(&mut s, n)
                    .unwrap()
                    .compare_collected_m0_m4(&expected, 7);
                let reason = if mode == 2 {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                };
                assert_eq!(result.unwrap_err(), reason);
                assert_eq!(b.checkpoint(), Err(reason));
                assert_eq!(b.metadata_cleanup_reserved, 0);
                released(&s);
                let i = s.events.iter().position(|v| *v == (p, step)).unwrap();
                assert!(s.events[i + 1..].iter().all(|v| *v == (p, Step::Free)));
            }
        }
    }
}
#[test]
fn shared_operation_cap_has_no_new_phase_or_role_reset_and_reserves_free() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    for _ in 0..2 {
        let mut s = Synthetic::new();
        let expected = hash(&s.bytes);
        let n = s.bytes.len() as u64;
        assert!(
            b.begin(&mut s, n)
                .unwrap()
                .compare_collected_m0_m4(&expected, 7)
                .is_ok()
        );
        released(&s);
    }
    assert_eq!(b.metadata_calls, 100);
    let mut s = Synthetic::new();
    let n = s.bytes.len() as u64;
    assert!(matches!(
        b.begin(&mut s, n).unwrap().collect_metadata(Phase::M0, 7),
        Err(Failure::Limit)
    ));
    assert!(s.events.is_empty());
    assert_eq!(b.metadata_cleanup_reserved, 0);
}
#[test]
fn insufficient_cleanup_credit_stops_before_init_and_does_not_consume_read_retries() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.metadata_calls = 97;
    let mut s = Synthetic::new();
    let n = s.bytes.len() as u64;
    assert!(matches!(
        b.begin(&mut s, n).unwrap().collect_metadata(Phase::M0, 7),
        Err(Failure::Limit)
    ));
    assert_eq!(s.events, [(Phase::M0, Step::Before), (Phase::M0, Step::Fs)]);
    assert_eq!(b.retries_left, 8);
    assert_eq!(b.metadata_cleanup_reserved, 0);
    released(&s);
}
#[test]
fn first_failure_is_sticky_and_early_cancel_has_no_ops_or_resource() {
    for cancelled in [false, true] {
        let cancel = AtomicBool::new(cancelled);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        if !cancelled {
            b.failed = Some(Failure::HashMismatch);
        }
        let mut s = Synthetic::new();
        let n = s.bytes.len() as u64;
        let reason = if cancelled {
            Failure::Cancelled
        } else {
            Failure::HashMismatch
        };
        assert_eq!(b.begin(&mut s, n).err().unwrap(), reason);
        assert!(s.events.is_empty());
        released(&s);
    }
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut s = Synthetic::new();
    s.present = 1;
    let n = s.bytes.len() as u64;
    {
        let mut r = b.begin(&mut s, n).unwrap();
        assert!(matches!(
            r.collect_metadata(Phase::M0, 7),
            Err(Failure::Metadata)
        ));
        assert!(matches!(
            r.collect_metadata(Phase::M0, 7),
            Err(Failure::Metadata)
        ));
    }
    assert_eq!(s.events.iter().filter(|v| v.1 == Step::Init).count(), 1);
    released(&s);
}
#[test]
fn successful_copy_is_charged_before_deadline_and_impossible_return_is_capped() {
    for late in [false, true] {
        let started = Instant::now();
        let now = Cell::new(started);
        let clock = || now.get();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(started, &cancel);
        b.now = &clock;
        let mut s = Synthetic::new();
        s.names = b"com.apple.provenance\0".to_vec();
        if late {
            s.hook = Some(Box::new(|_, step| {
                if step == Step::Names {
                    now.set(started + Duration::from_secs(10));
                }
            }));
        } else {
            s.got = Some(usize::MAX);
        }
        let n = s.bytes.len() as u64;
        let result = b.begin(&mut s, n).unwrap().collect_metadata(Phase::M0, 7);
        assert!(matches!(result,Err(e) if e==if late {Failure::Deadline}else{Failure::Changed}));
        assert_eq!(b.metadata_name_bytes, s.names.len() as u64);
        assert_eq!(b.used, 0);
        released(&s);
    }
}

#[test]
fn later_policy_failure_latches_changed_and_does_not_return_old_success() {
    for p in PHASES.into_iter().skip(1) {
        let mut s = Synthetic::new();
        s.present_at = Some((p, 1));
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = hash(&s.bytes);
        let n = s.bytes.len() as u64;
        let result = b
            .begin(&mut s, n)
            .unwrap()
            .compare_collected_m0_m4(&expected, 7);
        assert_eq!(result.unwrap_err(), Failure::Changed);
        assert_eq!(b.checkpoint(), Err(Failure::Changed));
        released(&s);
        assert_eq!(s.events.last(), Some(&(p, Step::Free)));
    }
}

#[test]
fn exhausted_operation_budget_still_spends_reserved_cleanup_exactly_once() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.metadata_calls = 94;
    let mut s = Synthetic::new();
    let n = s.bytes.len() as u64;
    assert!(matches!(
        b.begin(&mut s, n).unwrap().collect_metadata(Phase::M0, 7),
        Err(Failure::Limit)
    ));
    assert_eq!(b.metadata_calls, 100);
    assert_eq!(b.metadata_cleanup_reserved, 0);
    assert_eq!(s.events.last(), Some(&(Phase::M0, Step::Free)));
    assert!(!s.events.iter().any(|v| v.1 == Step::Size));
    released(&s);
}

#[test]
fn shared_name_byte_limit_stops_before_copy_without_payload_credit_use() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.metadata_name_bytes = MAX_NAME_BYTES;
    let mut s = Synthetic::new();
    s.names = b"com.apple.provenance\0".to_vec();
    let n = s.bytes.len() as u64;
    assert!(matches!(
        b.begin(&mut s, n).unwrap().collect_metadata(Phase::M0, 7),
        Err(Failure::Limit)
    ));
    assert_eq!(b.metadata_name_bytes, MAX_NAME_BYTES);
    assert_eq!(b.used, 0);
    assert_eq!(b.reserved, 0);
    assert_eq!(b.retries_left, 8);
    assert!(!s.events.iter().any(|v| v.1 == Step::Confirm));
    assert!(s.copy_capacity.is_empty());
    released(&s);
}

#[test]
fn unwinding_after_handle_creation_also_releases_it_once() {
    let mut s = Synthetic::new();
    s.hook = Some(Box::new(|_, step| {
        if step == Step::Query {
            panic!("synthetic operation failure");
        }
    }));
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&mut s)));
    assert!(result.is_err());
    released(&s);
    assert_eq!(s.life.created.get(), 1);
    assert_eq!(s.events.last(), Some(&(Phase::M0, Step::Free)));
}

#[test]
fn der_absence_and_xml_entitlement_stops_survive_collector_connection() {
    for (xml, der, reason) in [
        (true, false, physical_signature::Rejection::UnverifiedXml),
        (true, true, physical_signature::Rejection::UnsupportedDer),
        (false, false, physical_signature::Rejection::AbsenceUnproven),
    ] {
        let mut s = Synthetic::new();
        s.bytes = physical_signature::synthetic_file(xml, der, 4096, 48);
        s.stat.size = s.bytes.len() as u64;
        assert_eq!(run(&mut s).0.unwrap().entitlement_gate(), Err(reason));
        released(&s);
    }
}
