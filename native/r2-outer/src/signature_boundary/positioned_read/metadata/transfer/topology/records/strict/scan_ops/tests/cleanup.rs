use super::*;

#[test]
fn cleanup_distinguishes_no_boundary_from_started_and_closed_zero_owner_boundary() {
    for start in [false, true] {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(
            source,
            if start { Some(quotas()) } else { None },
            &mut b,
            |_| Ok(()),
        );
        if start {
            assert!(matches!(out.cleanup, CleanupDisposition::Confirmed(_)));
        } else {
            assert!(matches!(out.cleanup, CleanupDisposition::NotStarted));
        }
        assert_eq!(state.borrow().counts, [0; 5]);
        assert_eq!(
            out.result,
            if start {
                Ok(())
            } else {
                Err(Failure::Unavailable)
            }
        );
    }
}

#[test]
fn main_failure_and_cleanup_status_are_independent_and_diagnostics_survive() {
    for unconfirmed in [false, true] {
        let (source, state, stop, tick) = fixture();
        if unconfirmed {
            state.borrow_mut().cleanup.push_back(Cleanup::Unconfirmed);
        }
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let _anchor = s.acquire(None, None, Kind::Anchor)?;
            s.fail::<()>(Failure::HashMismatch)
        });
        assert_eq!(out.result, Err(Failure::HashMismatch));
        assert_eq!(out.summary.attempts, [1, 0, 0, 0, 1]);
        assert_eq!(state.borrow().released.len(), 1);
        if unconfirmed {
            if let CleanupDisposition::Incomplete(problem) = &out.cleanup {
                assert_eq!(
                    problem.issue(),
                    super::super::cleanup::CleanupIssue::ReleaseUnconfirmed
                );
            } else {
                panic!("release uncertainty was lost");
            }
        } else {
            assert!(matches!(out.cleanup, CleanupDisposition::Confirmed(_)));
        }
    }
}

#[test]
fn late_acquire_cancellation_and_deadline_keep_cleanup_and_first_reason() {
    for hook in [Hook::Cancel, Hook::Deadline] {
        for unconfirmed in [false, true] {
            let (source, state, stop, tick) = fixture();
            state.borrow_mut().at = Some((1, hook));
            if unconfirmed {
                state.borrow_mut().cleanup.push_back(Cleanup::Unconfirmed);
            }
            let now = || tick.get();
            let mut b = SharedBudget::new(tick.get(), &stop);
            b.now = &now;
            let out = with_boundary(source, Some(quotas()), &mut b, |s| {
                let _owner = s.acquire(None, None, Kind::Anchor)?;
                Ok(())
            });
            assert_eq!(
                out.result,
                Err(match hook {
                    Hook::Cancel => Failure::Cancelled,
                    Hook::Deadline => Failure::Deadline,
                })
            );
            assert_eq!(out.summary.attempts, [1, 0, 0, 0, 1]);
            assert_eq!(out.summary.unconfirmed, u64::from(unconfirmed));
            assert_eq!(state.borrow().released.len(), 1);
            assert_eq!(
                matches!(out.cleanup, CleanupDisposition::Incomplete(_)),
                unconfirmed
            );
        }
    }
}

#[test]
fn prepaid_terminal_report_survives_work_exhaustion_without_fabricating_start() {
    for left in 0..=3 {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        b.json_work = 1_000_000 - left;
        b.reserved = 17;
        let out = with_boundary(source, Some(quotas()), &mut b, |_| Ok(()));
        assert_eq!(
            out.result,
            if left == 3 {
                Ok(())
            } else {
                Err(Failure::Limit)
            }
        );
        assert_eq!(
            matches!(out.cleanup, CleanupDisposition::NotStarted),
            left < 2
        );
        assert_eq!(
            matches!(out.cleanup, CleanupDisposition::Confirmed(_)),
            left >= 2
        );
        assert_eq!(b.reserved, 17);
        assert_eq!(b.used, 0);
        assert_eq!(b.retries_left, 8);
        assert_eq!(state.borrow().counts, [0; 5]);
    }
}

#[test]
fn pending_retry_abandoned_declaration_and_forgotten_owner_never_become_confirmed() {
    for kind in 0..4 {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        if kind == 0 {
            state
                .borrow_mut()
                .reads
                .push_back(Err(OpFailure::Interrupted));
        }
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            match kind {
                0 => {
                    let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
                    s.read_once(&f, 0, &mut [0; 4])?;
                }
                1 => {
                    let f = s.acquire(Some(&a), Some("file"), Kind::File)?;
                    let entry = closure::Entry::File {
                        path: "file".into(),
                        mode: "0444".into(),
                        size: 4,
                        sha256: "0".repeat(64),
                    };
                    let declared = s.bind_declared(&f, &entry, 1)?;
                    drop(declared);
                }
                2 => {
                    std::mem::forget(a);
                    return Ok(());
                }
                _ => {
                    s.ledger.borrow_mut().reserved_live = 1;
                }
            }
            Ok(())
        });
        assert!(out.result.is_err());
        assert!(matches!(out.cleanup, CleanupDisposition::Incomplete(_)));
        if let CleanupDisposition::Incomplete(problem) = &out.cleanup {
            use super::super::cleanup::CleanupIssue;
            assert_eq!(
                problem.issue(),
                match kind {
                    0 => CleanupIssue::PendingRetry,
                    1 => CleanupIssue::DeclarationIncomplete,
                    _ => CleanupIssue::OwnersRemaining,
                }
            );
        }
        assert_eq!(out.summary.attempts, state.borrow().counts);
    }
}

#[test]
fn finalizer_claim_is_one_shot_and_zero_summary_cannot_replace_acquisition_history() {
    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let mut ledger = None;
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        ledger = Some(s.ledger.clone());
        Ok(())
    });
    assert!(matches!(out.cleanup, CleanupDisposition::Confirmed(_)));
    let work = b.json_work;
    let duplicate = super::super::cleanup::finish(&ledger.unwrap(), None, &mut b);
    assert!(matches!(duplicate, CleanupDisposition::Incomplete(_)));
    assert_eq!(b.checkpoint(), Err(Failure::Binding));
    assert_eq!(b.json_work, work);

    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        s.ledger.borrow_mut().serial = 1;
        Ok(())
    });
    assert_eq!(out.summary.attempts, [0; 5]);
    assert_eq!(out.summary.live, 0);
    assert!(matches!(out.cleanup, CleanupDisposition::Incomplete(_)));
    assert_eq!(out.result, Err(Failure::Unavailable));
}

#[test]
fn evidence_debug_is_opaque_and_types_are_not_clone_copy_or_serializable() {
    use super::super::cleanup::ClosedScanResources;
    macro_rules! not_impl {
        ($t:ty,$bound:path) => {{
            trait Ambiguous<A> {
                fn check() {}
            }
            impl<T: ?Sized> Ambiguous<()> for T {}
            impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
            let _ = <$t as Ambiguous<_>>::check;
        }};
    }
    not_impl!(ClosedScanResources, Clone);
    not_impl!(ClosedScanResources, Copy);
    not_impl!(ClosedScanResources, serde::Serialize);
    not_impl!(ClosedScanResources, serde::de::DeserializeOwned);
    not_impl!(CleanupDisposition, Clone);
    not_impl!(CleanupDisposition, Copy);
    not_impl!(CleanupDisposition, serde::Serialize);
    not_impl!(CleanupDisposition, serde::de::DeserializeOwned);
    let (source, _, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |_| Ok(()));
    assert_eq!(
        format!("{:?}", out.cleanup),
        "CleanupDisposition(confirmed_scan_only_not_success)"
    );
    if let CleanupDisposition::Confirmed(closed) = out.cleanup {
        assert_eq!(
            format!("{closed:?}"),
            "ClosedScanResources(scan_only_not_execution_authority)"
        );
    } else {
        panic!("closed boundary was not classified");
    }
}

#[test]
fn sealed_local_attempt_rejects_a_new_dispatch_before_source_io() {
    let (source, state, stop, tick) = fixture();
    let mut b = SharedBudget::new(tick.get(), &stop);
    let mut saved = None;
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        saved = Some(s.ledger.clone());
        Ok(())
    });
    assert!(matches!(out.cleanup, CleanupDisposition::Confirmed(_)));
    let marker = ScopeMarker;
    // Private same-ledger forged alias, analogous to the existing cross-source guard fixture.
    let mut alias = Boundary {
        marker: &marker,
        source: Rc::new(RefCell::new(Fake(state.clone()))),
        ledger: saved.unwrap(),
        quotas: quotas(),
        budget: &mut b,
        session: None,
    };
    assert!(matches!(
        alias.acquire(None, None, Kind::Anchor),
        Err(Failure::Binding)
    ));
    assert_eq!(state.borrow().counts, [0; 5]);
}
