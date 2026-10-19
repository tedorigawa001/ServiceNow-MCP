use super::*;
use std::cell::{Cell, RefCell};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Call {
    Stat,
    Fs,
    Init,
    AclStat,
    Query,
    Size,
    Names,
    Read,
    Free,
}
type Events = Rc<RefCell<Vec<(Call, u32)>>>;
#[derive(Default)]
struct Life {
    files: Cell<u32>,
    init: Cell<u32>,
    free: Cell<u32>,
}
struct FakeFile {
    token: u32,
    bytes: Vec<u8>,
    life: Rc<Life>,
}
impl Drop for FakeFile {
    fn drop(&mut self) {
        self.life.files.set(self.life.files.get() + 1);
    }
}
struct FakeAcl {
    events: Events,
    life: Rc<Life>,
}
impl Drop for FakeAcl {
    fn drop(&mut self) {
        self.life.free.set(self.life.free.get() + 1);
        self.events.borrow_mut().push((Call::Free, 0));
    }
}
type Hook<'a> = Box<dyn FnMut(Call) + 'a>;
struct FakeApi<'a> {
    events: Events,
    life: Rc<Life>,
    fail: Option<(usize, i32)>,
    hook: Option<Hook<'a>>,
    bad: Option<Call>,
    present: i32,
    name: Vec<u8>,
    length: Option<isize>,
    got: Option<isize>,
    fs_flags: u32,
    fs_name: Vec<u8>,
}
// Test values only: these integer-only libc ABI fixtures are never filled by OS calls.
#[allow(unsafe_code)]
fn raw_stat(n: usize) -> libc::stat {
    // SAFETY: Darwin libc::stat contains only integer/array fields; zero is valid for each.
    let mut raw: libc::stat = unsafe { std::mem::zeroed() };
    raw.st_dev = 7;
    raw.st_ino = 42;
    raw.st_uid = 0;
    raw.st_gid = 80;
    raw.st_mode = libc::S_IFREG | 0o555;
    raw.st_nlink = 1;
    raw.st_size = n as i64;
    raw.st_mtime = 123;
    raw.st_mtime_nsec = 10;
    raw.st_ctime = 456;
    raw.st_ctime_nsec = 20;
    raw
}
#[allow(unsafe_code)]
fn raw_fs(flags: u32, name: &[u8]) -> libc::statfs {
    // SAFETY: Darwin libc::statfs contains only integer/array fields, no pointer ownership.
    let mut raw: libc::statfs = unsafe { std::mem::zeroed() };
    raw.f_flags = flags;
    for (out, value) in raw.f_fstypename.iter_mut().zip(name) {
        *out = *value as libc::c_char;
    }
    raw
}
impl FakeApi<'_> {
    fn event(&mut self, call: Call, token: u32) -> Result<(), Errno> {
        if token != 0 {
            assert_eq!(token, 7);
        }
        let index = self.events.borrow().len();
        self.events.borrow_mut().push((call, token));
        if let Some(hook) = &mut self.hook {
            hook(call);
        }
        if let Some((i, e)) = self.fail
            && index == i
        {
            return Err(Errno(e));
        }
        Ok(())
    }
}
impl RawApi for FakeApi<'_> {
    type File = FakeFile;
    type Acl = FakeAcl;
    fn stat(&mut self, file: &FakeFile) -> Result<libc::stat, Errno> {
        self.event(Call::Stat, file.token)?;
        let mut s = raw_stat(file.bytes.len());
        if self.bad == Some(Call::Stat) {
            s.st_size = -1;
        }
        Ok(s)
    }
    fn fs(&mut self, file: &FakeFile) -> Result<libc::statfs, Errno> {
        self.event(Call::Fs, file.token)?;
        Ok(raw_fs(self.fs_flags, &self.fs_name))
    }
    fn acl_init(&mut self) -> Result<FakeAcl, Errno> {
        self.event(Call::Init, 0)?;
        self.life.init.set(self.life.init.get() + 1);
        Ok(FakeAcl {
            events: self.events.clone(),
            life: self.life.clone(),
        })
    }
    fn acl_stat(&mut self, file: &FakeFile, _: &mut FakeAcl) -> Result<libc::stat, Errno> {
        self.event(Call::AclStat, file.token)?;
        let mut s = raw_stat(file.bytes.len());
        if self.bad == Some(Call::AclStat) {
            s.st_ctime_nsec = -1;
        }
        Ok(s)
    }
    fn acl_query(&mut self, _: &mut FakeAcl) -> Result<i32, Errno> {
        self.event(Call::Query, 0)?;
        Ok(self.present)
    }
    fn names_size(&mut self, file: &FakeFile) -> Result<isize, Errno> {
        self.event(Call::Size, file.token)?;
        Ok(self.length.unwrap_or(self.name.len() as isize))
    }
    fn names_read(&mut self, file: &FakeFile, output: &mut [u8]) -> Result<isize, Errno> {
        self.event(Call::Names, file.token)?;
        let n = output.len().min(self.name.len());
        output[..n].copy_from_slice(&self.name[..n]);
        Ok(self.got.unwrap_or(n as isize))
    }
    fn pread(&mut self, file: &FakeFile, offset: i64, output: &mut [u8]) -> Result<isize, Errno> {
        self.event(Call::Read, file.token)?;
        let start = offset as usize;
        let n = output.len().min(file.bytes.len().saturating_sub(start));
        if n > 0 {
            output[..n].copy_from_slice(&file.bytes[start..start + n]);
        }
        Ok(self.got.unwrap_or(n as isize))
    }
}
fn source<'a>() -> HeldSource<FakeApi<'a>> {
    let life = Rc::new(Life::default());
    HeldSource {
        file: FakeFile {
            token: 7,
            bytes: physical_signature::synthetic_file(true, false, 4096, 48),
            life: life.clone(),
        },
        api: FakeApi {
            events: Rc::new(RefCell::new(Vec::new())),
            life,
            fail: None,
            hook: None,
            bad: None,
            present: 0,
            name: Vec::new(),
            length: None,
            got: None,
            fs_flags: libc::MNT_LOCAL as u32,
            fs_name: b"apfs\0".to_vec(),
        },
    }
}
fn expected(s: &HeldSource<FakeApi<'_>>) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    Sha256::digest(&s.file.bytes).into()
}
fn run(s: &mut HeldSource<FakeApi<'_>>) -> Result<ComparedM0M4, Failure> {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let hash = expected(s);
    let n = s.file.bytes.len() as u64;
    let result = b.begin(s, n).unwrap().compare_collected_m0_m4(&hash, 7);
    assert_eq!(b.metadata_cleanup_reserved, 0);
    assert_eq!(b.reserved, 0);
    result
}
fn freed(s: &HeldSource<FakeApi<'_>>) {
    assert_eq!(s.api.life.init.get(), s.api.life.free.get());
}

#[test]
fn raw_to_collector_ab_flow_uses_one_owned_fake_file_and_releases_all_resources() {
    for name in [Vec::new(), b"com.apple.provenance\0".to_vec()] {
        let mut s = source();
        s.api.name = name;
        let life = s.api.life.clone();
        let result = run(&mut s).unwrap();
        freed(&s);
        assert_eq!(life.init.get(), 5);
        assert_eq!(life.files.get(), 0);
        let e = s.api.events.borrow();
        assert_eq!(e.iter().filter(|v| v.0 == Call::Stat).count(), 10);
        assert_eq!(e.iter().filter(|v| v.0 == Call::AclStat).count(), 5);
        assert!(e.iter().all(
            |(c, t)| if matches!(c, Call::Init | Call::Query | Call::Free) {
                *t == 0
            } else {
                *t == 7
            }
        ));
        assert_eq!(
            format!("{s:?}"),
            "HeldMetadataSource(staged_not_execution_authority)"
        );
        assert_eq!(
            result.entitlement_gate(),
            Err(physical_signature::Rejection::UnverifiedXml)
        );
        drop(e);
        drop(s);
        assert_eq!(life.files.get(), 1);
    }
}
#[test]
fn stat_projection_retains_device_sign_times_and_all_special_permission_bits() {
    let mut raw = raw_stat(4096);
    raw.st_dev = -1;
    raw.st_gid = 123;
    raw.st_mode = libc::S_IFREG | 0o7555;
    raw.st_mtime = -123;
    let s = decode_stat(raw).ok().unwrap();
    assert_eq!(s.device, u64::MAX);
    assert_eq!(s.mode, 0o7555);
    assert_eq!(s.gid, 123);
    assert_eq!(s.mtime.seconds, -123);
    assert_eq!(s.mtime.nanoseconds, 10);
}
#[test]
fn invalid_stat_numbers_types_and_nanoseconds_are_unavailable_not_masked() {
    for case in 0..7 {
        let mut raw = raw_stat(4096);
        match case {
            0 => raw.st_size = -1,
            1 => raw.st_mtime_nsec = -1,
            2 => raw.st_mtime_nsec = 1_000_000_000,
            3 => raw.st_ctime_nsec = -1,
            4 => raw.st_ctime_nsec = 1_000_000_000,
            5 => raw.st_mode = 0o555,
            _ => raw.st_mode = 0xffff,
        }
        assert!(matches!(decode_stat(raw), Err(OpFailure::Unavailable)));
    }
}
#[test]
fn stat_file_type_projection_does_not_misclassify_nonregular_objects() {
    for (kind, expected) in [
        (libc::S_IFDIR, FileType::Directory),
        (libc::S_IFLNK, FileType::Symlink),
        (libc::S_IFIFO, FileType::Other),
        (libc::S_IFCHR, FileType::Other),
        (libc::S_IFBLK, FileType::Other),
        (libc::S_IFSOCK, FileType::Other),
    ] {
        let mut raw = raw_stat(4096);
        raw.st_mode = kind | 0o555;
        assert!(decode_stat(raw).ok().unwrap().kind == expected);
    }
}
#[test]
fn fs_projection_requires_bounded_name_and_collector_enforces_fixed_mount_profile() {
    for (flags, name, reason) in [
        (0, b"apfs\0".as_slice(), Failure::Metadata),
        (
            (libc::MNT_LOCAL | libc::MNT_IGNORE_OWNERSHIP) as u32,
            b"apfs\0",
            Failure::Metadata,
        ),
        (
            (libc::MNT_LOCAL | libc::MNT_NOEXEC) as u32,
            b"apfs\0",
            Failure::Metadata,
        ),
        (libc::MNT_LOCAL as u32, b"hfs\0", Failure::Metadata),
        (libc::MNT_LOCAL as u32, b"\0", Failure::MetadataUnavailable),
        (
            libc::MNT_LOCAL as u32,
            b"abcdefghijklmnop",
            Failure::MetadataUnavailable,
        ),
    ] {
        let mut s = source();
        s.api.fs_flags = flags;
        s.api.fs_name = name.to_vec();
        assert_eq!(run(&mut s).unwrap_err(), reason);
        freed(&s);
        assert_eq!(s.api.life.init.get(), 0);
    }
}
#[test]
fn each_raw_metadata_call_error_stops_without_retry_and_drops_successful_acl() {
    // First phase's nine raw calls; no read payload has begun yet.
    for i in 0..9 {
        for errno in [
            libc::EINTR,
            libc::EACCES,
            libc::ENOTSUP,
            libc::EBADF,
            libc::EIO,
        ] {
            let mut s = source();
            s.api.fail = Some((i, errno));
            assert_eq!(run(&mut s).unwrap_err(), Failure::MetadataUnavailable);
            freed(&s);
            let e = s.api.events.borrow();
            assert!(e[i + 1..].iter().all(|v| v.0 == Call::Free));
            assert!(!e.iter().any(|v| v.0 == Call::Read));
        }
    }
}
#[test]
fn malformed_acl_stat_null_init_and_invalid_present_preserve_unavailable_reason() {
    // SAFETY: null has no ownership and creates no Filesec; no actual init/free call occurs.
    #[allow(unsafe_code)]
    let null_result = unsafe { ffi::owned_filesec(std::ptr::null_mut()) };
    assert!(null_result.is_err());
    for case in 0..5 {
        let mut s = source();
        match case {
            0 => s.api.bad = Some(Call::AclStat),
            1 => s.api.fail = Some((2, libc::ENOMEM)),
            2 => s.api.present = -1,
            3 => s.api.present = 2,
            _ => s.api.present = i32::MAX,
        }
        assert_eq!(run(&mut s).unwrap_err(), Failure::MetadataUnavailable);
        freed(&s);
        assert!(!s.api.events.borrow().iter().any(|v| v.0 == Call::Names));
    }
}
#[test]
fn negative_or_overlimit_name_lengths_do_not_reach_copy_and_erange_stays_changed() {
    for (length, reason) in [
        (-2, Failure::MetadataUnavailable),
        (-1, Failure::MetadataUnavailable),
        (65537, Failure::Limit),
    ] {
        let mut s = source();
        s.api.length = Some(length);
        assert_eq!(run(&mut s).unwrap_err(), reason);
        freed(&s);
        assert!(!s.api.events.borrow().iter().any(|v| v.0 == Call::Names));
    }
    let mut s = source();
    s.api.fail = Some((6, libc::ERANGE));
    assert_eq!(run(&mut s).unwrap_err(), Failure::Changed);
    freed(&s);
}
#[test]
fn copy_return_count_is_checked_by_collector_and_raw_names_never_escape() {
    for got in [-2, -1, 1, isize::MAX] {
        let mut s = source();
        s.api.got = Some(got);
        let reason = if got < 0 {
            Failure::MetadataUnavailable
        } else {
            Failure::Changed
        };
        assert_eq!(run(&mut s).unwrap_err(), reason);
        freed(&s);
    }
    let mut s = source();
    s.api.name = b"secret-marker\0".to_vec();
    let reason = run(&mut s).unwrap_err();
    assert_eq!(reason, Failure::Metadata);
    assert!(!format!("{reason:?} {s:?}").contains("secret-marker"));
    freed(&s);
}
#[test]
fn pread_is_one_attempt_with_checked_offset_and_finite_errno() {
    for (errno, expected) in [
        (libc::EINTR, IoFailure::Interrupted),
        (libc::EAGAIN, IoFailure::WouldBlock),
        (libc::EIO, IoFailure::Failed),
    ] {
        let mut s = source();
        s.api.fail = Some((0, errno));
        let mut out = [0; 4];
        let got = s.pread(0, &mut out).err().unwrap();
        assert!(matches!(
            (got, expected),
            (IoFailure::Interrupted, IoFailure::Interrupted)
                | (IoFailure::WouldBlock, IoFailure::WouldBlock)
                | (IoFailure::Failed, IoFailure::Failed)
        ));
        assert_eq!(s.api.events.borrow().len(), 1);
    }
    for (offset, len) in [(u64::MAX, 1), (i64::MAX as u64, 1), (0, 0), (0, 65537)] {
        let mut s = source();
        let mut out = vec![0; len];
        assert!(matches!(s.pread(offset, &mut out), Err(IoFailure::Failed)));
        assert!(s.api.events.borrow().is_empty());
    }
    let mut s = source();
    s.api.got = Some(-1);
    let mut out = [0; 1];
    assert!(matches!(s.pread(0, &mut out), Err(IoFailure::Failed)));
}
#[test]
fn direct_name_copy_rejects_invalid_capacity_before_backend() {
    for len in [0, 65537] {
        let mut s = source();
        let mut out = vec![0; len];
        assert!(matches!(
            s.names_read(Phase::M0, &mut out),
            Err(OpFailure::Unavailable)
        ));
        assert!(s.api.events.borrow().is_empty());
    }
}
#[test]
fn delayed_init_and_query_failure_release_before_latched_deadline_or_cancel() {
    for call in [Call::Init, Call::Query, Call::Names] {
        for cancelled in [false, true] {
            let started = Instant::now();
            let now = Cell::new(started);
            let clock = || now.get();
            let cancel = AtomicBool::new(false);
            let mut s = source();
            s.api.hook = Some(Box::new(|c| {
                if c == call {
                    if cancelled {
                        cancel.store(true, Ordering::Release);
                    } else {
                        now.set(started + Duration::from_secs(10));
                    }
                }
            }));
            if call == Call::Query {
                s.api.fail = Some((4, libc::EIO));
            }
            let mut b = SharedBudget::new(started, &cancel);
            b.now = &clock;
            let hash = expected(&s);
            let n = s.file.bytes.len() as u64;
            let result = b
                .begin(&mut s, n)
                .unwrap()
                .compare_collected_m0_m4(&hash, 7);
            let reason = if cancelled {
                Failure::Cancelled
            } else {
                Failure::Deadline
            };
            assert_eq!(result.unwrap_err(), reason);
            assert_eq!(b.checkpoint(), Err(reason));
            assert_eq!(b.metadata_cleanup_reserved, 0);
            freed(&s);
            assert_eq!(s.api.life.free.get(), 1);
            assert_eq!(s.api.events.borrow().last(), Some(&(Call::Free, 0)));
        }
    }
}
#[test]
fn der_and_absence_gates_are_not_opened_by_the_source() {
    for (xml, der, reason) in [
        (false, false, physical_signature::Rejection::AbsenceUnproven),
        (false, true, physical_signature::Rejection::UnsupportedDer),
    ] {
        let mut s = source();
        s.file.bytes = physical_signature::synthetic_file(xml, der, 4096, 48);
        assert_eq!(run(&mut s).unwrap().entitlement_gate(), Err(reason));
        freed(&s);
    }
}

#[test]
fn early_cancel_and_exhausted_metadata_budget_never_invoke_raw_backend() {
    for cancelled in [false, true] {
        let cancel = AtomicBool::new(cancelled);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut s = source();
        let life = s.api.life.clone();
        let hash = expected(&s);
        let n = s.file.bytes.len() as u64;
        if cancelled {
            assert!(matches!(b.begin(&mut s, n), Err(Failure::Cancelled)));
        } else {
            b.metadata_calls = 100;
            assert_eq!(
                b.begin(&mut s, n)
                    .unwrap()
                    .compare_collected_m0_m4(&hash, 7)
                    .unwrap_err(),
                Failure::Limit
            );
        }
        assert!(s.api.events.borrow().is_empty());
        assert_eq!(life.init.get(), 0);
        assert_eq!(b.metadata_cleanup_reserved, 0);
        assert_eq!(b.reserved, 0);
        drop(s);
        assert_eq!(life.files.get(), 1);
    }
}
