use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use scan_ops::connection_owner::outer_result::{
    self as outer, DropObservation, OuterPhase, PostReleaseCheckpoint,
};
use scan_ops::connection_owner::{self as owner, testing as ot};

#[test]
fn outer_result_rejects_late_success_after_release_and_drops_pending_value() {
    struct Pending(Rc<Cell<u32>>);
    impl Drop for Pending {
        fn drop(&mut self) {
            self.0.set(self.0.get() + 1);
        }
    }
    let cancel = AtomicBool::new(false);
    let start = Instant::now();
    let now = Cell::new(start);
    let clock = || now.get();
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &clock;
    let dropped = Rc::new(Cell::new(0));
    now.set(start + Duration::from_secs(10));
    let error = outer::merge_after_release(
        Ok(Pending(dropped.clone())),
        DropObservation::SequenceReturned,
        &mut b,
    )
    .err()
    .unwrap();
    assert_eq!(error.reason(), Failure::Deadline);
    assert_eq!(error.phase(), OuterPhase::PostReleaseCheckpoint);
    assert_eq!(
        error.checkpoint(),
        PostReleaseCheckpoint::Stopped(Failure::Deadline)
    );
    assert!(error.inner().is_none());
    assert_eq!(dropped.get(), 1);
}

#[test]
fn outer_result_success_requires_returned_release_and_a_passing_checkpoint() {
    let cancel = AtomicBool::new(false);
    let start = Instant::now();
    let mut b = SharedBudget::new(start, &cancel);
    assert_eq!(
        outer::merge_after_release(Ok(17), DropObservation::SequenceReturned, &mut b).unwrap(),
        17
    );
    let e = outer::merge_after_release(Ok(19), DropObservation::NotReached, &mut b).unwrap_err();
    assert_eq!(e.reason(), Failure::Unavailable);
    assert_eq!(e.phase(), OuterPhase::Release);
    assert_eq!(e.release(), DropObservation::NotReached);
    assert_eq!(e.checkpoint(), PostReleaseCheckpoint::Passed);
    assert!(e.inner().is_none());
    assert_eq!(b.checkpoint(), Err(Failure::Unavailable));

    struct Release<'a>(&'a AtomicBool);
    impl Drop for Release<'_> {
        fn drop(&mut self) {
            self.0.store(true, Ordering::Release);
        }
    }
    let mut b = SharedBudget::new(start, &cancel);
    let resource = Release(&cancel);
    drop(resource);
    let e =
        outer::merge_after_release(Ok(23), DropObservation::SequenceReturned, &mut b).unwrap_err();
    assert_eq!(e.reason(), Failure::Cancelled);
    assert_eq!(
        e.checkpoint(),
        PostReleaseCheckpoint::Stopped(Failure::Cancelled)
    );
    assert_eq!(e.round(), None);
}

#[test]
fn outer_plain_failure_latches_original_reason_and_never_needs_work_credit() {
    for phase in [
        OuterPhase::Entry,
        OuterPhase::Receipt,
        OuterPhase::OuterClock,
        OuterPhase::OwnerCreate,
        OuterPhase::Initial,
        OuterPhase::TopologyPrepare,
        OuterPhase::Compare,
        OuterPhase::AfterHandoff,
        OuterPhase::AfterRound,
        OuterPhase::BodyCheckpoint,
        OuterPhase::Release,
        OuterPhase::PostReleaseCheckpoint,
    ] {
        for release in [
            DropObservation::NotReached,
            DropObservation::SequenceReturned,
        ] {
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            b.json_work = 1_000_000;
            let e = outer::OuterStrictFailure::plain(phase, Failure::HashMismatch, &mut b);
            assert_eq!(e.checkpoint(), PostReleaseCheckpoint::NotReached);
            assert_eq!(e.release(), DropObservation::NotReached);
            assert_eq!(b.stop::<()>(Failure::Changed), Err(Failure::HashMismatch));
            cancel.store(true, Ordering::Release);
            let e = outer::merge_after_release::<()>(Err(e), release, &mut b).unwrap_err();
            assert_eq!(e.reason(), Failure::HashMismatch);
            assert_eq!(e.phase(), phase);
            assert_eq!(e.round(), None);
            assert!(e.inner().is_none());
            assert_eq!(e.release(), release);
            assert_eq!(
                e.checkpoint(),
                PostReleaseCheckpoint::Stopped(Failure::HashMismatch)
            );
            assert_eq!(b.json_work, 1_000_000);
        }
    }
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let _ = b.stop::<()>(Failure::Expired);
    let e = outer::OuterStrictFailure::plain(OuterPhase::Receipt, Failure::Changed, &mut b);
    assert_eq!(e.reason(), Failure::Expired); // Prior latch wins over the wrapper's supplied reason.
}

#[derive(Clone, Copy)]
enum InnerCase {
    Operation,
    Hash,
    Cleanup,
    NoPolicy,
    NoQuotas,
}
fn retain_real_inner(round: Round, case: InnerCase) {
    let (f, state, registry) = records_stage::valid_fixture(false);
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let mut o = owner::create(
        &mut source,
        &f.receipt,
        &f.target,
        &c,
        std::array::from_fn(|_| Fake(state.clone())),
        "bp5-r2-strict-owner-0.1",
        &mut b,
    )
    .unwrap();
    if !matches!(case, InnerCase::NoPolicy) {
        ledger_test::configure(ot::ledger(&mut o), caps(), &mut b).unwrap();
    }
    let mut captured = None;
    for current in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        if current == round {
            let mut s = state.borrow_mut();
            s.case = match case {
                InnerCase::Operation => Case::Failure(s.calls + 1),
                InnerCase::Hash => Case::Corrupt,
                InnerCase::Cleanup => Case::CleanupUnknown,
                _ => Case::Good,
            };
        }
        let slot = ot::take(&mut o, current, &mut b).unwrap();
        let result = slot.run_fixed(
            if current == round && matches!(case, InnerCase::NoQuotas) {
                None
            } else {
                quotas()
            },
            &mut b,
        );
        if current == round {
            captured = Some(result.unwrap_err());
            break;
        }
        result.unwrap();
    }
    let inner = captured.unwrap();
    let reason = inner.reason();
    let before_attempts = ot::completion(&inner).unwrap().summary_attempts();
    let phase = match round {
        Round::Initial => OuterPhase::Initial,
        Round::BeforeM4 => OuterPhase::Compare,
        Round::AfterM4 => OuterPhase::AfterRound,
    };
    let e = outer::OuterStrictFailure::from_inner(phase, inner, &mut b);
    // The owner's outer-only stop notification must not replace the retained frame.
    drop(o.stop_inspection(reason, &mut b));
    drop(o);
    let (_, made, freed, _) = source.stage_counts();
    assert_eq!(made, freed);
    drop(source);
    assert!(state.borrow().alive.is_empty());
    drop(f); // Record bytes are not borrowed by the retained diagnostic.
    b.json_work = 1_000_000;
    cancel.store(true, Ordering::Release);
    now.set(b.started + Duration::from_secs(10));
    let e = outer::merge_after_release::<()>(Err(e), DropObservation::SequenceReturned, &mut b)
        .unwrap_err();
    assert_eq!(e.reason(), reason);
    assert_eq!(e.phase(), phase);
    assert_eq!(e.round(), Some(round));
    assert_eq!(e.checkpoint(), PostReleaseCheckpoint::Stopped(reason));
    let frame = ot::completion(e.inner().unwrap()).unwrap();
    assert_eq!(frame.summary_attempts(), before_attempts);
    match case {
        InnerCase::Operation => {
            assert!(matches!(frame.cleanup(), CleanupDisposition::Confirmed(_)))
        }
        InnerCase::NoPolicy | InnerCase::NoQuotas => {
            assert!(matches!(frame.cleanup(), CleanupDisposition::NotStarted))
        }
        InnerCase::Hash | InnerCase::Cleanup => {
            let CleanupDisposition::Incomplete(problem) = frame.cleanup() else {
                panic!("lost cleanup diagnostic")
            };
            assert_eq!(
                problem.issue(),
                if matches!(case, InnerCase::Hash) {
                    scan_ops::cleanup::CleanupIssue::DeclarationIncomplete
                } else {
                    scan_ops::cleanup::CleanupIssue::ReleaseUnconfirmed
                }
            );
        }
    }
    assert_eq!(b.json_work, 1_000_000);
}

#[test]
fn outer_result_moves_real_kernel_failures_without_losing_round_cleanup_or_summary() {
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        for case in [
            InnerCase::Operation,
            InnerCase::Hash,
            InnerCase::Cleanup,
            InnerCase::NoQuotas,
        ] {
            retain_real_inner(round, case);
        }
    }
    retain_real_inner(Round::Initial, InnerCase::NoPolicy);
}

#[test]
fn outer_failure_remains_failure_even_if_an_inconsistent_checkpoint_passes() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let e = outer::OuterStrictFailure::plain(OuterPhase::Receipt, Failure::Changed, &mut b);
    // Test-only corruption. Production has no reset/clear-latch API.
    b.failed = None;
    b.scan_session_claim.failure.set(None);
    let e = outer::merge_after_release::<()>(Err(e), DropObservation::SequenceReturned, &mut b)
        .unwrap_err();
    assert_eq!(e.reason(), Failure::Changed);
    assert_eq!(e.phase(), OuterPhase::Receipt);
    assert_eq!(e.checkpoint(), PostReleaseCheckpoint::Passed);
    assert_eq!(b.checkpoint(), Err(Failure::Changed));
}

#[test]
fn outer_failure_is_bounded_opaque_and_not_clone_copy_or_serializable() {
    use outer::OuterStrictFailure;
    macro_rules! not_impl {
        ($bound:path) => {{
            trait Ambiguous<A> {
                fn check() {}
            }
            impl<T: ?Sized> Ambiguous<()> for T {}
            impl<T: ?Sized + $bound> Ambiguous<u8> for T {}
            let _ = <OuterStrictFailure as Ambiguous<_>>::check;
        }};
    }
    not_impl!(Clone);
    not_impl!(Copy);
    not_impl!(serde::Serialize);
    not_impl!(serde::de::DeserializeOwned);
    assert!(std::mem::size_of::<OuterStrictFailure>() <= 384);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let e = OuterStrictFailure::plain(OuterPhase::Receipt, Failure::Changed, &mut b);
    assert_eq!(
        format!("{e:?}"),
        "OuterStrictFailure(diagnostics_only_not_cleanup_or_execution_authority)"
    );
}
