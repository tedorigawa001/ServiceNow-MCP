use super::*;
use std::cell::Cell;

fn put(b: &mut [u8], at: usize, value: u32) {
    b[at..at + 4].copy_from_slice(&value.to_be_bytes());
}
fn little(b: &mut [u8], at: usize, value: u32) {
    b[at..at + 4].copy_from_slice(&value.to_le_bytes());
}
fn blob(magic: u32, payload: &[u8]) -> Vec<u8> {
    let mut b = vec![0; 8 + payload.len()];
    let len = b.len();
    put(&mut b, 0, magic);
    put(&mut b, 4, len as u32);
    b[8..].copy_from_slice(payload);
    b
}
struct Fixture {
    header: Vec<u8>,
    signature: Vec<u8>,
    file_bytes: u64,
}
impl Fixture {
    fn new(version: u32, xml: bool, der: bool, codes: usize) -> Self {
        let limit = codes * 4096;
        let mut children = vec![
            (2, blob(0xfade0c01, b"synthetic requirements")),
            (0x10000, blob(0xfade0b01, b"NOT A REAL CMS")),
        ];
        if xml {
            children.push((5, blob(0xfade7171, b"synthetic XML only")));
        }
        if der {
            children.push((7, blob(0xfade7172, b"synthetic DER only")));
        }
        let mut cd = vec![0; 352 + 32 * codes];
        let len = cd.len();
        for (at, v) in [
            (0, 0xfade0c02),
            (4, len as u32),
            (8, version),
            (12, 0x10000),
            (16, 352),
            (20, 96),
            (24, 7),
            (28, codes as u32),
            (32, limit as u32),
            (48, 112),
        ] {
            put(&mut cd, at, v);
        }
        cd[36] = 32;
        cd[37] = 2;
        cd[39] = 12;
        cd[96..110].copy_from_slice(b"test.synthetic");
        cd[112..121].copy_from_slice(b"SYNTHETIC");
        cd[72..80].copy_from_slice(&(limit as u64).to_be_bytes());
        cd[80..88].copy_from_slice(&1u64.to_be_bytes());
        if version == 0x20500 {
            put(&mut cd, 88, 42);
        }
        for (kind, bytes) in &children {
            if *kind != 0x10000 {
                let at = 352 - 32 * (*kind as usize);
                cd[at..at + 32].copy_from_slice(&Sha256::digest(bytes));
            }
        }
        children.insert(0, (0, cd));
        let count = children.len();
        let mut signature = vec![0; 12 + count * 8];
        put(&mut signature, 0, 0xfade0cc0);
        put(&mut signature, 8, count as u32);
        // Deliberately unaligned child starts and non-physical index order.
        for (i, (kind, bytes)) in children.iter().rev().enumerate() {
            let at = signature.len();
            put(&mut signature, 12 + i * 8, *kind);
            put(&mut signature, 16 + i * 8, at as u32);
            signature.extend(bytes);
        }
        let len = signature.len();
        put(&mut signature, 4, len as u32);
        let mut header = vec![0; 48];
        for (at, v) in [
            (0, 0xfeedfacf),
            (4, 0x0100000c),
            (12, 2),
            (16, 1),
            (20, 16),
            (32, 0x1d),
            (36, 16),
            (40, limit as u32),
            (44, len as u32),
        ] {
            little(&mut header, at, v);
        }
        Self {
            header,
            signature,
            file_bytes: (limit + len) as u64,
        }
    }
    fn basic() -> Self {
        Self::new(0x20500, true, false, 1)
    }
    fn input(&self) -> Input<'_> {
        Input {
            file_bytes: self.file_bytes,
            header_commands: &self.header,
            signature: &self.signature,
        }
    }
    fn run(&self) -> Result<Inventory<'_>, Rejection> {
        parse(self.input(), Instant::now(), &AtomicBool::new(false))
    }
    fn index(&self, kind: u32) -> usize {
        (0..be(&self.signature, 8).unwrap() as usize)
            .map(|i| 12 + i * 8)
            .find(|at| be(&self.signature, *at).unwrap() == kind)
            .unwrap()
    }
    fn start(&self, kind: u32) -> usize {
        be(&self.signature, self.index(kind) + 4).unwrap() as usize
    }
    fn cd(&mut self, at: usize, v: u32) {
        let start = self.start(0);
        put(&mut self.signature, start + at, v);
    }
    fn byte(&mut self, at: usize, v: u8) {
        let start = self.start(0);
        self.signature[start + at] = v;
    }
    fn resize_tail(&mut self, n: usize) {
        self.signature.resize(self.signature.len() + n, 0);
        little(&mut self.header, 44, self.signature.len() as u32);
        self.file_bytes += n as u64;
    }
}
#[test]
fn supported_versions_preserve_diagnostics_not_authority() {
    for version in [0x20400, 0x20500] {
        let f = Fixture::new(version, true, false, 1);
        let out = f.run().unwrap();
        assert_eq!(out.slot_count, 4);
        assert_eq!(out.code.version, version);
        assert_eq!(out.code.identifier, "test.synthetic");
        assert_eq!(out.code.team, "SYNTHETIC");
        assert_eq!(out.code.flags, 0x10000);
        assert_eq!(out.code.exec_flags, 1);
        assert_eq!(
            out.code.runtime,
            if version == 0x20500 { Some(42) } else { None }
        );
        let start = f.start(0);
        assert_eq!(
            out.code.full_digest,
            <[u8; 32]>::from(Sha256::digest(&f.signature[start..]))
        );
        assert_eq!(out.entitlement_gate(), Err(Rejection::UnverifiedXml));
        assert_eq!(
            format!("{out:?}"),
            "PhysicalInventory(structure_only_not_execution_authority)"
        );
    }
}
#[test]
fn der_and_absence_remain_closed() {
    for (xml, der, expected) in [
        (true, true, Rejection::UnsupportedDer),
        (false, true, Rejection::UnsupportedDer),
        (false, false, Rejection::AbsenceUnproven),
    ] {
        let f = Fixture::new(0x20500, xml, der, 1);
        assert_eq!(f.run().unwrap().entitlement_gate(), Err(expected));
    }
}
#[test]
fn rejects_other_macho_profiles() {
    for (at, v) in [
        (0, 0xcafebabe),
        (0, 0xcffaedfe),
        (4, 0x01000007),
        (8, 2),
        (12, 6),
        (28, 1),
    ] {
        let mut f = Fixture::basic();
        little(&mut f.header, at, v);
        assert!(f.run().is_err(), "{at}");
    }
}
#[test]
fn all_header_and_signature_prefix_truncations_reject() {
    let f = Fixture::basic();
    for end in 0..f.header.len() {
        assert!(
            parse(
                Input {
                    header_commands: &f.header[..end],
                    ..f.input()
                },
                Instant::now(),
                &AtomicBool::new(false)
            )
            .is_err()
        );
    }
    for end in 0..f.signature.len() {
        assert!(
            parse(
                Input {
                    signature: &f.signature[..end],
                    ..f.input()
                },
                Instant::now(),
                &AtomicBool::new(false)
            )
            .is_err()
        );
    }
}
#[test]
fn caps_reject_before_allocation() {
    let f = Fixture::basic();
    assert_eq!(
        parse(
            Input {
                file_bytes: MAX_FILE + 1,
                ..f.input()
            },
            Instant::now(),
            &AtomicBool::new(false)
        )
        .unwrap_err(),
        Rejection::Limit
    );
    for (at, v) in [(16, 4097), (20, 1048577)] {
        let mut f = Fixture::basic();
        little(&mut f.header, at, v);
        assert_eq!(f.run().unwrap_err(), Rejection::Limit);
    }
    let mut f = Fixture::basic();
    f.resize_tail(MAX_SIGNATURE);
    assert_eq!(f.run().unwrap_err(), Rejection::Limit);
    let mut f = Fixture::basic();
    put(&mut f.signature, 8, 65);
    assert_eq!(f.run().unwrap_err(), Rejection::Limit);
}
#[test]
fn load_commands_require_exact_consumption_alignment_and_range() {
    for (at, v) in [
        (16, 0),
        (16, 2),
        (20, 15),
        (36, 7),
        (36, 15),
        (36, 24),
        (40, 47),
        (44, 11),
        (44, u32::MAX),
    ] {
        let mut f = Fixture::basic();
        little(&mut f.header, at, v);
        assert!(f.run().is_err());
    }
    let mut f = Fixture::basic();
    f.file_bytes += 1;
    assert!(f.run().is_err());
}
#[test]
fn missing_duplicate_and_unknown_required_commands_reject() {
    let mut f = Fixture::basic();
    little(&mut f.header, 32, 1);
    assert_eq!(f.run().unwrap_err(), Rejection::MissingSignature);
    let mut f = Fixture::basic();
    little(&mut f.header, 32, 0x80000123);
    assert_eq!(f.run().unwrap_err(), Rejection::UnsupportedCommand);
    let mut f = Fixture::basic();
    let command = f.header[32..].to_vec();
    f.header.extend(command);
    little(&mut f.header, 16, 2);
    little(&mut f.header, 20, 32);
    assert_eq!(f.run().unwrap_err(), Rejection::DuplicateSlot);
}
#[test]
fn known_required_and_opaque_optional_commands_are_bounded() {
    for kind in [
        1, 0x80000018, 0x8000001c, 0x8000001f, 0x80000022, 0x80000023, 0x80000028, 0x80000033,
        0x80000034,
    ] {
        let mut f = Fixture::basic();
        f.header.extend([0; 8]);
        little(&mut f.header, 48, kind);
        little(&mut f.header, 52, 8);
        little(&mut f.header, 16, 2);
        little(&mut f.header, 20, 24);
        assert!(f.run().is_ok());
    }
}
#[test]
fn superblob_magic_table_and_ranges_reject() {
    for (at, v) in [(0, 0), (4, 11), (4, u32::MAX), (16, 0), (16, u32::MAX)] {
        let mut f = Fixture::basic();
        put(&mut f.signature, at, v);
        assert!(f.run().is_err());
    }
}
#[test]
fn duplicate_unknown_and_alternate_slots_reject() {
    for (kind, expected) in [
        (0, Rejection::DuplicateSlot),
        (0x1000, Rejection::UnsupportedSlot),
        (6, Rejection::UnsupportedSlot),
    ] {
        let mut f = Fixture::basic();
        let at = f.index(5);
        put(&mut f.signature, at, kind);
        assert_eq!(f.run().unwrap_err(), expected);
    }
}
#[test]
fn aliased_and_overlapping_children_reject() {
    let mut f = Fixture::basic();
    let orphan = f.start(5);
    let size = be(&f.signature, orphan + 4).unwrap() as usize;
    f.signature[orphan..orphan + size].fill(0);
    let at = f.index(5) + 4;
    let offset = f.start(2);
    put(&mut f.signature, at, offset as u32);
    assert_eq!(f.run().unwrap_err(), Rejection::OverlappingBlob);
    let mut f = Fixture::basic();
    let start = f.start(0x10000);
    put(&mut f.signature, start + 4, 100);
    assert!(f.run().is_err());
}

fn synthetic_cd(strings: usize, codes: usize) -> Vec<u8> {
    let offset = 96 + strings;
    let mut cd = vec![0; offset + codes * 32];
    let len = cd.len();
    for (at, value) in [
        (0, 0xfade0c02),
        (4, len as u32),
        (8, 0x20500),
        (16, offset as u32),
        (20, 96),
        (28, codes as u32),
        (32, (codes * 4096) as u32),
        (48, 226),
    ] {
        put(&mut cd, at, value);
    }
    cd[36] = 32;
    cd[37] = 2;
    cd[39] = 12;
    cd[96..224].fill(b'a');
    cd[226..230].copy_from_slice(b"TEAM");
    cd
}
fn local_cd(cd: &[u8]) -> Result<CodeDirectory<'_>, Rejection> {
    let cancel = AtomicBool::new(false);
    let budget = Budget {
        started: Instant::now(),
        cancelled: &cancel,
        now: &Instant::now,
    };
    code_directory(cd, be(cd, 32).unwrap() as usize, None, None, None, &budget)
}
#[test]
fn identifier_128_bytes_and_header_maximum_accept_129_rejects() {
    let mut cd = synthetic_cd(65536 - 96, 1);
    assert_eq!(local_cd(&cd).unwrap().identifier.len(), 128);
    cd[224] = b'a';
    assert!(matches!(
        local_cd(&cd),
        Err(Rejection::UnsupportedCodeDirectory)
    ));
}
#[test]
fn local_code_array_exact_maximum_and_complete_length() {
    // Local CD maximum is tested separately: combined file/signature caps constrain
    // which maxima can coexist in a whole input.
    let mut cd = synthetic_cd(65536 - 96, 131072);
    assert!(local_cd(&cd).is_ok());
    cd.push(0);
    let len = cd.len();
    put(&mut cd, 4, len as u32);
    assert!(matches!(local_cd(&cd), Err(Rejection::Limit)));
    let mut cd = synthetic_cd(200, 1);
    cd.push(0);
    let len = cd.len();
    put(&mut cd, 4, len as u32);
    assert!(matches!(local_cd(&cd), Err(Rejection::InvalidRange)));
}
#[test]
fn omitted_special_array_does_not_prove_absence() {
    let cd = synthetic_cd(200, 1);
    assert!(local_cd(&cd).is_ok());
    let cancel = AtomicBool::new(false);
    let budget = Budget {
        started: Instant::now(),
        cancelled: &cancel,
        now: &Instant::now,
    };
    assert!(matches!(
        code_directory(&cd, 4096, None, Some(b"present"), None, &budget),
        Err(Rejection::SpecialHashMismatch)
    ));
}
fn rewrap(f: &mut Fixture, children: &[(u32, Vec<u8>)]) {
    let mut s = vec![0; 12 + 8 * children.len()];
    put(&mut s, 0, 0xfade0cc0);
    put(&mut s, 8, children.len() as u32);
    for (i, (kind, b)) in children.iter().enumerate() {
        let start = s.len();
        put(&mut s, 12 + i * 8, *kind);
        put(&mut s, 16 + i * 8, start as u32);
        s.extend(b);
    }
    let len = s.len();
    put(&mut s, 4, len as u32);
    little(&mut f.header, 44, len as u32);
    f.file_bytes = 4096 + len as u64;
    f.signature = s;
}
#[test]
fn mandatory_children_are_required_even_without_orphan_data() {
    for missing in [0, 0x10000] {
        let mut f = Fixture::basic();
        let children: Vec<_> = [0, 2, 5, 0x10000]
            .into_iter()
            .filter(|k| *k != missing)
            .map(|k| {
                let start = f.start(k);
                let len = be(&f.signature, start + 4).unwrap() as usize;
                (k, f.signature[start..start + len].to_vec())
            })
            .collect();
        rewrap(&mut f, &children);
        assert_eq!(f.run().unwrap_err(), Rejection::MissingSignature);
    }
}
#[test]
fn entitlement_combined_wrapper_limit_is_exact() {
    for total in [65536, 65537] {
        let mut f = Fixture::basic();
        let start = f.start(0);
        let mut cd = f.signature[start..].to_vec();
        let xml = blob(0xfade7171, &vec![b'x'; total - 16]);
        let der = blob(0xfade7172, &[]);
        for (k, b) in [(5, &xml), (7, &der)] {
            let at = 352 - 32 * k;
            cd[at..at + 32].copy_from_slice(&Sha256::digest(b));
        }
        cd[352 - 64..352 - 32].fill(0); // no requirements child in this fixture
        rewrap(
            &mut f,
            &[
                (0, cd),
                (5, xml),
                (7, der),
                (0x10000, blob(0xfade0b01, b"synthetic")),
            ],
        );
        if total == 65536 {
            assert_eq!(
                f.run().unwrap().entitlement_gate(),
                Err(Rejection::UnsupportedDer)
            );
        } else {
            assert_eq!(f.run().unwrap_err(), Rejection::Limit);
        }
    }
}
#[test]
fn wrong_magic_and_empty_or_short_blobs_reject() {
    for kind in [0, 2, 5, 0x10000] {
        let mut f = Fixture::basic();
        let at = f.start(kind);
        put(&mut f.signature, at, 0);
        assert_eq!(f.run().unwrap_err(), Rejection::InvalidBlob);
    }
    for size in [0, 7, 8] {
        let mut f = Fixture::basic();
        let at = f.start(0x10000);
        put(&mut f.signature, at + 4, size);
        assert!(f.run().is_err());
    }
}
#[test]
fn unindexed_padding_must_be_zero() {
    let mut f = Fixture::basic();
    f.resize_tail(37);
    assert!(f.run().is_ok());
    *f.signature.last_mut().unwrap() = 1;
    assert_eq!(f.run().unwrap_err(), Rejection::InvalidPadding);
}
#[test]
fn missing_mandatory_slots_reject() {
    for kind in [0, 0x10000] {
        let mut f = Fixture::basic();
        let at = f.index(kind); // remove index while preserving its bytes, which are nonzero unindexed data
        let count = be(&f.signature, 8).unwrap();
        let last = 12 + (count as usize - 1) * 8;
        let replacement = f.signature[last..last + 8].to_vec();
        f.signature[at..at + 8].copy_from_slice(&replacement);
        put(&mut f.signature, 8, count - 1);
        assert!(f.run().is_err());
    }
}
#[test]
fn unsupported_cd_versions_and_hash_profiles_reject() {
    for v in [0x20300, 0x20600, u32::MAX] {
        let mut f = Fixture::basic();
        f.cd(8, v);
        assert_eq!(f.run().unwrap_err(), Rejection::UnsupportedCodeDirectory);
    }
    for (at, v) in [(36, 20), (37, 1), (38, 1), (39, 0), (39, 13)] {
        let mut f = Fixture::basic();
        f.byte(at, v);
        assert!(f.run().is_err());
    }
}
#[test]
fn scatter_spare_limit64_and_preencrypt_reject() {
    for at in [40, 44, 52, 56, 60, 92] {
        let mut f = Fixture::basic();
        f.cd(at, 1);
        assert_eq!(f.run().unwrap_err(), Rejection::UnsupportedCodeDirectory);
    }
}
#[test]
fn cd_hash_ranges_and_caps_are_checked() {
    for (at, v) in [(16, 65537), (24, 8), (28, 131073)] {
        let mut f = Fixture::basic();
        f.cd(at, v);
        assert_eq!(f.run().unwrap_err(), Rejection::Limit);
    }
    for (at, v) in [
        (16, 1),
        (16, 351),
        (16, 353),
        (24, 0),
        (28, 0),
        (28, 2),
        (32, 0),
        (32, 4095),
    ] {
        let mut f = Fixture::basic();
        f.cd(at, v);
        assert!(f.run().is_err());
    }
}
#[test]
fn strings_require_bounded_nonoverlapping_utf8_nul() {
    for (at, v) in [(20, 87), (20, 128), (20, u32::MAX), (48, 96)] {
        let mut f = Fixture::basic();
        f.cd(at, v);
        assert!(f.run().is_err());
    }
    for byte in [0, 0xff, 0x1f, 0x7f] {
        let mut f = Fixture::basic();
        f.byte(96, byte);
        assert_eq!(f.run().unwrap_err(), Rejection::UnsupportedCodeDirectory);
    }
    let mut f = Fixture::basic();
    for at in 96..128 {
        f.byte(at, b'a');
    }
    assert!(f.run().is_err());
}
#[test]
fn executable_ranges_overflow_or_exceed_limit_reject() {
    for (base, limit) in [(u64::MAX, 1u64), (4096, 1u64)] {
        let mut f = Fixture::basic();
        let start = f.start(0);
        f.signature[start + 64..start + 72].copy_from_slice(&base.to_be_bytes());
        f.signature[start + 72..start + 80].copy_from_slice(&limit.to_be_bytes());
        assert_eq!(f.run().unwrap_err(), Rejection::InvalidRange);
    }
}
#[test]
fn page14_and_large_cd_are_supported() {
    let mut f = Fixture::new(0x20500, true, false, 4);
    f.byte(39, 14); // four 4KiB pages become one 16KiB page: mismatch is rejected
    assert!(f.run().is_err());
    let f = Fixture::new(0x20500, true, false, 9000);
    assert!(f.signature.len() > 256 * 1024);
    assert!(f.run().is_ok());
    let mut f = Fixture::basic();
    little(&mut f.header, 40, 16384);
    f.file_bytes = 16384 + f.signature.len() as u64;
    f.cd(32, 16384);
    f.byte(39, 14);
    assert!(f.run().is_ok());
}
#[test]
fn special_hashes_cover_entire_wrapper() {
    for kind in [2, 5, 7] {
        let mut f = Fixture::new(0x20500, true, true, 1);
        let child = f.start(kind);
        let len = be(&f.signature, child + 4).unwrap() as usize;
        let body_digest = Sha256::digest(&f.signature[child + 8..child + len]);
        let at = f.start(0) + 352 - 32 * kind as usize;
        f.signature[at..at + 32].copy_from_slice(&body_digest);
        assert_eq!(f.run().unwrap_err(), Rejection::SpecialHashMismatch);
    }
}
#[test]
fn absent_nonzero_present_zero_and_unsupported_special_hash_reject() {
    let mut f = Fixture::new(0x20500, false, false, 1);
    let at = f.start(0) + 352 - 32 * 5;
    f.signature[at] = 1;
    assert_eq!(f.run().unwrap_err(), Rejection::SpecialHashMismatch);
    let mut f = Fixture::basic();
    let at = f.start(0) + 352 - 32 * 5;
    f.signature[at..at + 32].fill(0);
    assert_eq!(f.run().unwrap_err(), Rejection::SpecialHashMismatch);
    for kind in [1, 3, 4, 6] {
        let mut f = Fixture::basic();
        let at = f.start(0) + 352 - 32 * kind;
        f.signature[at] = 1;
        assert_eq!(f.run().unwrap_err(), Rejection::UnsupportedSlot);
    }
}
#[test]
fn cancelled_expired_and_future_start_reject() {
    let f = Fixture::basic();
    assert_eq!(
        parse(f.input(), Instant::now(), &AtomicBool::new(true)).unwrap_err(),
        Rejection::Cancelled
    );
    let now = Instant::now();
    for start in [now - Duration::from_secs(10), now + Duration::from_secs(1)] {
        assert_eq!(
            parse_inner(f.input(), start, &AtomicBool::new(false), &|| now).unwrap_err(),
            Rejection::Deadline
        );
    }
}
#[test]
fn deadline_and_cancel_propagate_inside_work() {
    let f = Fixture::new(0x20500, true, true, 9000);
    let start = Instant::now();
    for threshold in [2, 8, 20, 40] {
        let calls = Cell::new(0);
        let now = || {
            let n = calls.get() + 1;
            calls.set(n);
            if n >= threshold {
                start + Duration::from_secs(10)
            } else {
                start
            }
        };
        assert_eq!(
            parse_inner(f.input(), start, &AtomicBool::new(false), &now).unwrap_err(),
            Rejection::Deadline
        );
    }
    let cancel = AtomicBool::new(false);
    let calls = Cell::new(0);
    let now = || {
        let n = calls.get() + 1;
        calls.set(n);
        if n == 20 {
            cancel.store(true, Ordering::Release);
        }
        start
    };
    assert_eq!(
        parse_inner(f.input(), start, &cancel, &now).unwrap_err(),
        Rejection::Cancelled
    );
}
#[test]
fn mutation_smoke_never_panics_or_grants_authority() {
    let original = Fixture::basic();
    for at in 0..original.signature.len() {
        let mut f = Fixture::basic();
        f.signature[at] ^= 0xff;
        let result = std::panic::catch_unwind(|| f.run().map(|v| v.entitlement_gate()));
        assert!(result.is_ok());
        if let Ok(Ok(gate)) = result {
            assert!(gate.is_err());
        }
    }
}

#[test]
fn signature_and_command_limits_accept_exact_boundary() {
    let mut f = Fixture::basic();
    f.resize_tail(MAX_SIGNATURE - f.signature.len());
    assert!(f.run().is_ok());
    let mut f = Fixture::new(0x20500, true, false, 9000);
    f.header.resize(32 + MAX_COMMANDS, 0);
    little(&mut f.header, 16, 2);
    little(&mut f.header, 20, MAX_COMMANDS as u32);
    little(&mut f.header, 48, 1);
    little(&mut f.header, 52, (MAX_COMMANDS - 16) as u32);
    assert!(f.run().is_ok());
    f.header.truncate(48);
    f.header.resize(48 + 4095 * 8, 0);
    for at in (48..f.header.len()).step_by(8) {
        little(&mut f.header, at, 1);
        little(&mut f.header, at + 4, 8);
    }
    let size = f.header.len() - 32;
    little(&mut f.header, 16, 4096);
    little(&mut f.header, 20, size as u32);
    assert!(f.run().is_ok());
}

#[test]
fn checked_helpers_and_nonzero_inner_padding_reject() {
    assert_eq!(add(usize::MAX, 1), Err(Rejection::InvalidRange));
    assert_eq!(mul(usize::MAX, 2), Err(Rejection::InvalidRange));
    let mut f = Fixture::basic();
    let at = 12 + 8 * be(&f.signature, 8).unwrap() as usize;
    f.signature.splice(at..at, [0u8; 3]);
    for i in 0..be(&f.signature, 8).unwrap() as usize {
        let index = 16 + 8 * i;
        let start = be(&f.signature, index).unwrap();
        put(&mut f.signature, index, start + 3);
    }
    let len = f.signature.len();
    put(&mut f.signature, 4, len as u32);
    little(&mut f.header, 44, len as u32);
    f.file_bytes += 3;
    assert!(f.run().is_ok());
    f.signature[at] = 1;
    assert_eq!(f.run().unwrap_err(), Rejection::InvalidPadding);
}

#[test]
fn shared_budget_reaches_hash_and_padding_chunks() {
    let start = Instant::now();
    let calls = Cell::new(0);
    let now = || {
        let n = calls.get() + 1;
        calls.set(n);
        if n == 3 {
            start + Duration::from_secs(10)
        } else {
            start
        }
    };
    let cancel = AtomicBool::new(false);
    let budget = Budget {
        started: start,
        cancelled: &cancel,
        now: &now,
    };
    assert_eq!(hash(&vec![0; 3 * 65536], &budget), Err(Rejection::Deadline));
    calls.set(0);
    assert_eq!(
        zeros(&vec![0; 3 * 65536], &budget),
        Err(Rejection::Deadline)
    );
}
