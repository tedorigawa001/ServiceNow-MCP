use super::super::normalized_metadata::MetadataPolicy;
use super::*;

fn fs() -> FsObservation {
    FsObservation {
        location: Filesystem::Local,
        apfs: true,
        ownership_ignored: false,
        noexec: false,
    }
}
fn policy() -> MetadataPolicy {
    MetadataPolicy {
        device: 1,
        kind: Kind::File,
        mode: 0o444,
        size: Some(4),
    }
}
fn script(value: Stat, names: &[u8]) -> VecDeque<MetadataReply> {
    VecDeque::from([
        (MetaOp::Stat, Ok(MetaValue::Stat(value.clone())), vec![]),
        (MetaOp::Filesystem, Ok(MetaValue::Filesystem(fs())), vec![]),
        (MetaOp::AclStat, Ok(MetaValue::Stat(value.clone())), vec![]),
        (MetaOp::AclQuery, Ok(MetaValue::Acl(0)), vec![]),
        (
            MetaOp::NamesSize,
            Ok(MetaValue::Size(names.len() as i64)),
            vec![],
        ),
        (
            MetaOp::NamesRead,
            Ok(MetaValue::Bytes(names.len())),
            names.to_vec(),
        ),
        (
            MetaOp::NamesSize,
            Ok(MetaValue::Size(names.len() as i64)),
            vec![],
        ),
        (MetaOp::Stat, Ok(MetaValue::Stat(value)), vec![]),
    ])
}

#[test]
fn normalizes_empty_or_provenance_and_counts_each_snapshot_eighteen_work() {
    for names in [&b""[..], &b"com.apple.provenance\0"[..]] {
        let (source, state, stop, tick) = fixture();
        state
            .borrow_mut()
            .metadata_script
            .extend(script(stat(), names));
        state
            .borrow_mut()
            .metadata_script
            .extend(script(stat(), names));
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let before = s.collect_snapshot(&f, &policy(), false)?;
            let after = s.collect_snapshot(&f, &policy(), true)?;
            assert!(before == after);
            Ok(())
        });
        assert_eq!(out.result, Ok(()));
        assert_eq!(b.json_work, 42); // scope2 + file/anchor4 + 2*18
        assert_eq!(state.borrow().counts, [2, 0, 0, 18, 4]);
        assert_eq!(out.summary.names, 2 * names.len() as u64);
        assert_eq!(
            (
                b.metadata_calls,
                b.metadata_name_bytes,
                b.topology_calls,
                b.used,
                b.retries_left
            ),
            (0, 0, 0, 0, 8)
        );
        let requests = &state.borrow().metadata_requests;
        assert!(
            requests
                .iter()
                .enumerate()
                .all(|(i, (id, _))| if i % 8 == 2 || i % 8 == 3 {
                    *id == if i < 8 { 3 } else { 4 }
                } else {
                    *id == 2
                })
        );
        assert!(!state.borrow().duplicate);
    }
}

#[test]
fn initial_policy_failures_and_after_policy_changes_are_distinct() {
    for after in [false, true] {
        for case in 0..12 {
            let (source, state, stop, tick) = fixture();
            let mut replies = script(stat(), &[]);
            match case {
                0..=4 | 11 => {
                    let mut v = stat();
                    match case {
                        0 => v.uid = 1,
                        1 => v.device = 2,
                        2 => v.mode = 0o644,
                        3 => v.links = 2,
                        4 => v.mtime.nanoseconds = 1_000_000_000,
                        _ => v.mode = 0o4444,
                    }
                    replies[0].1 = Ok(MetaValue::Stat(v));
                }
                5..=8 => {
                    let mut value = fs();
                    match case {
                        5 => value.location = Filesystem::NonLocal,
                        6 => value.apfs = false,
                        7 => value.ownership_ignored = true,
                        _ => value.noexec = true,
                    }
                    replies[1].1 = Ok(MetaValue::Filesystem(value));
                }
                9 => replies[3].1 = Ok(MetaValue::Acl(1)),
                _ => replies = script(stat(), b"com.apple.quarantine\0"),
            }
            state.borrow_mut().metadata_script = replies;
            let mut b = SharedBudget::new(tick.get(), &stop);
            let out = with_boundary(source, Some(quotas()), &mut b, |s| {
                let a = s.acquire(None, None, Kind::Anchor)?;
                let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
                s.collect_snapshot(&f, &policy(), after).map(|_| ())
            });
            assert_eq!(
                out.result,
                Err(if after {
                    Failure::Changed
                } else {
                    Failure::Metadata
                })
            );
            assert_eq!(out.summary.live, 0);
            assert_eq!(state.borrow().counts[4], state.borrow().next);
            assert!(!state.borrow().duplicate);
        }
    }
}

#[test]
fn unknown_fields_and_each_retrieval_failure_never_normalize_as_empty() {
    for case in 0..12 {
        let (source, state, stop, tick) = fixture();
        let mut replies = script(stat(), &[]);
        match case {
            0..=7 => replies[case].1 = Err(OpFailure::Interrupted),
            8 => {
                let mut value = fs();
                value.location = Filesystem::Unknown;
                replies[1].1 = Ok(MetaValue::Filesystem(value));
            }
            9 => replies[3].1 = Ok(MetaValue::Acl(2)),
            10 => replies[4].1 = Ok(MetaValue::Size(-1)),
            _ => replies[4].1 = Ok(MetaValue::Size(65537)),
        }
        state.borrow_mut().metadata_script = replies;
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.collect_snapshot(&f, &policy(), false).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::MetadataUnavailable));
        assert_eq!(b.retries_left, 8);
        assert_eq!(state.borrow().counts[4], state.borrow().next);
    }
}

#[test]
fn acl_stat_name_size_and_final_stat_races_stop_without_baseline_reset() {
    for case in 0..4 {
        let (source, state, stop, tick) = fixture();
        let mut replies = script(stat(), &[]);
        match case {
            0 | 3 => {
                let mut changed = stat();
                changed.inode += 1;
                replies[if case == 0 { 2 } else { 7 }].1 = Ok(MetaValue::Stat(changed));
            }
            1 => replies[5].1 = Ok(MetaValue::Bytes(1)),
            _ => replies[6].1 = Ok(MetaValue::Size(1)),
        }
        state.borrow_mut().metadata_script = replies;
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.collect_snapshot(&f, &policy(), false).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(state.borrow().counts[4], state.borrow().next);
        assert_eq!(out.summary.names, u64::from(case == 1));
    }
}

#[test]
fn rejects_unknown_duplicate_and_malformed_xattr_lists() {
    for raw in [
        b"com.apple.ResourceFork\0".to_vec(),
        b"other\0".to_vec(),
        b"com.apple.provenance".to_vec(),
        b"com.apple.provenance\0com.apple.provenance\0".to_vec(),
        vec![0xff, 0],
        vec![b'x'; 65536],
    ] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().metadata_script = script(stat(), &raw);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.collect_snapshot(&f, &policy(), false).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::Metadata));
        assert_eq!(out.summary.names, raw.len() as u64);
        assert_eq!(out.summary.live, 0);
    }
}

fn declaration(digest: &str) -> closure::Entry {
    closure::Entry::File {
        path: "file".into(),
        mode: "0444".into(),
        size: 3,
        sha256: digest.into(),
    }
}
const ABC: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

#[test]
fn allowed_xattr_presence_changes_between_read_snapshots_are_rejected() {
    for remove in [false, true] {
        let (source, state, stop, tick) = fixture();
        let mut v = stat();
        v.size = 3;
        let provenance = b"com.apple.provenance\0";
        state
            .borrow_mut()
            .metadata_script
            .extend(script(v.clone(), if remove { provenance } else { &[] }));
        state
            .borrow_mut()
            .metadata_script
            .extend(script(v, if remove { &[] } else { provenance }));
        state.borrow_mut().reads.extend([Ok(3), Ok(0)]);
        state.borrow_mut().read_data.push_back(b"abc".to_vec());
        let entry = declaration(ABC);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry, 1)?;
            s.read_declared(&mut file, 0, &mut [0; 3])?;
            s.eof_declared(&mut file, 3, &mut [0]).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(out.summary.declared_pending, 1);
        assert_eq!(out.summary.names, provenance.len() as u64);
        assert_eq!((b.used, b.retries_left), (3, 8));
        assert_eq!(state.borrow().counts, [2, 0, 2, 18, 4]);
    }
}

#[test]
fn snapshots_are_resource_bound_and_runtime_directory_policy_is_explicit() {
    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let f = s.acquire(Some(&a), Some("first"), Kind::File)?;
        let g = s.acquire(Some(&a), Some("second"), Kind::File)?;
        let first = s.collect_snapshot(&f, &policy(), false)?;
        let second = s.collect_snapshot(&g, &policy(), false)?;
        assert!(first != second); // even identical spoofed Stat values do not mix resources
        Ok(())
    });
    assert_eq!(out.result, Ok(()));
    let (source, state, stop, tick) = fixture();
    let mut directory = stat();
    directory.kind = FileType::Directory;
    directory.mode = 0o555;
    directory.links = 4;
    state.borrow_mut().metadata_script = script(directory, &[]);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        let d = s.acquire(Some(&a), Some("dir"), Kind::Directory)?;
        let p = MetadataPolicy {
            device: 1,
            kind: Kind::Directory,
            mode: 0o555,
            size: None,
        };
        s.collect_snapshot(&d, &p, false).map(|_| ())
    });
    assert_eq!(out.result, Ok(()));
    assert_eq!(b.json_work, 24);
}

#[test]
fn independent_operation_live_cleanup_and_name_quotas_stop_before_unfunded_io() {
    for case in 0..7 {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().metadata_script = script(stat(), b"com.apple.provenance\0");
        if case == 6 {
            state.borrow_mut().metadata_script = script(stat(), &[]);
        }
        let mut q = quotas();
        match case {
            0 => q.attempts[3] = 8,
            1 => q.live = 2,
            2 => q.attempts[4] = 2,
            3 => q.name_bytes = b"com.apple.provenance\0".len() as u64 - 1,
            4 => q.name_bytes = b"com.apple.provenance\0".len() as u64,
            5 => q.attempts[3] = 9,
            _ => q.name_bytes = 0,
        }
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(q), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.collect_snapshot(&f, &policy(), false).map(|_| ())
        });
        assert_eq!(
            out.result,
            if case == 4 || case == 5 {
                Ok(())
            } else {
                Err(Failure::Limit)
            }
        );
        assert_eq!(out.summary.live, 0);
        assert_eq!(state.borrow().counts[4], state.borrow().next);
        if case == 3 || case == 6 {
            assert!(
                !state
                    .borrow()
                    .metadata_requests
                    .iter()
                    .any(|(_, op)| *op == MetaOp::NamesRead)
            );
        }
        assert_eq!((b.metadata_calls, b.metadata_name_bytes), (0, 0));
    }
}

#[test]
fn late_success_at_every_snapshot_operation_preserves_bytes_and_releases_acl_once() {
    for hook in [Hook::Cancel, Hook::Deadline] {
        for at in 1..=12 {
            let (source, state, stop, tick) = fixture();
            state.borrow_mut().metadata_script = script(stat(), b"com.apple.provenance\0");
            state.borrow_mut().at = Some((at, hook));
            let now = || tick.get();
            let mut b = SharedBudget::new(tick.get(), &stop);
            b.now = &now;
            let out = with_boundary(source, Some(quotas()), &mut b, |s| {
                let a = s.acquire(None, None, Kind::Anchor)?;
                let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
                s.collect_snapshot(&f, &policy(), false).map(|_| ())
            });
            assert_eq!(
                out.result,
                Err(match hook {
                    Hook::Cancel => Failure::Cancelled,
                    Hook::Deadline => Failure::Deadline,
                })
            );
            assert_eq!(
                out.summary.names,
                if at >= 9 {
                    b"com.apple.provenance\0".len() as u64
                } else {
                    0
                }
            );
            assert_eq!(state.borrow().counts[4], state.borrow().next);
            assert_eq!((out.summary.live, out.summary.pending_cleanup), (0, 0));
            assert!(!state.borrow().duplicate);
        }
    }
}

#[test]
fn acl_init_failure_or_unconfirmed_release_never_yields_a_snapshot() {
    for unknown_cleanup in [false, true] {
        let (source, state, stop, tick) = fixture();
        if unknown_cleanup {
            state.borrow_mut().cleanup.push_back(Cleanup::Unconfirmed);
        } else {
            state.borrow_mut().acl_failure = Some(OpFailure::Interrupted);
        }
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            s.collect_snapshot(&f, &policy(), false).map(|_| ())
        });
        assert_eq!(
            out.result,
            Err(if unknown_cleanup {
                Failure::Unavailable
            } else {
                Failure::MetadataUnavailable
            })
        );
        assert_eq!(out.summary.unconfirmed, u64::from(unknown_cleanup));
        assert_eq!(state.borrow().counts[4], state.borrow().next);
        assert_eq!(b.retries_left, 8);
    }
}

#[test]
fn post_acl_or_fs_change_stops_before_digest_mismatch_can_override_reason() {
    for acl in [false, true] {
        let (source, state, stop, tick) = fixture();
        let mut v = stat();
        v.size = 3;
        state
            .borrow_mut()
            .metadata_script
            .extend(script(v.clone(), &[]));
        let mut after = script(v, &[]);
        if acl {
            after[3].1 = Ok(MetaValue::Acl(1));
        } else {
            let mut value = fs();
            value.noexec = true;
            after[1].1 = Ok(MetaValue::Filesystem(value));
        }
        state.borrow_mut().metadata_script.extend(after);
        state.borrow_mut().reads.extend([Ok(3), Ok(0)]);
        state.borrow_mut().read_data.push_back(b"abc".to_vec());
        let entry = declaration(&"a".repeat(64)); // also mismatched; metadata must win first
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
            let mut file = s.bind_declared(&f, &entry, 1)?;
            s.read_declared(&mut file, 0, &mut [0; 3])?;
            s.eof_declared(&mut file, 3, &mut [0]).map(|_| ())
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(out.summary.declared_pending, 1);
        assert_eq!(out.summary.live, 0);
    }
}
