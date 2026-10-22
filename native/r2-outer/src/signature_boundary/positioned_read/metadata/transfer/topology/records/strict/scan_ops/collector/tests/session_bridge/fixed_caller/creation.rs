use super::*;

#[test]
fn creation_caller_reserves_owner_before_create_and_retains_real_success() {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let binding = f.receipt.binding.clone();
    let lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    let bound = bind(&binding, &lineage, &target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (o, t, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, o).unwrap();
    let source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let supply = bridge::fixture(
        held,
        t,
        f.receipt,
        source,
        ts,
        body::Inputs {
            context: &c,
            scans: std::array::from_fn(|_| Fake(state.clone())),
            resources: Some(ledger_test::input(caps())),
            quotas: std::array::from_fn(|_| quotas()),
        },
        &b,
    );
    let input = bridge::preparation::fixture(supply);
    let mut owner = upper::StrictResultOwner::new();
    assert_eq!(owner.run_creation(input, &mut b), Ok(()));
    assert!(owner.take().unwrap().is_ok());
    assert!(owner.take().is_none());
    assert!(state.borrow().alive.is_empty());
    assert_eq!(tc.made.get(), tc.dropped.get());
    assert_eq!(b.checkpoint(), Ok(()));
    assert_eq!(b.json_work, super::success_work(true) + 2);
    assert!(b.protected_bridge_claim.preparation_started.get());
}

#[test]
fn creation_partial_inputs_are_discarded_before_a_typed_rejection_is_retained() {
    for i in 0..13 {
        exercise(Mode::Missing(1 << i));
    }
    for i in 1..=13 {
        exercise(Mode::Missing((1 << i) - 1));
    }
}

#[derive(Clone, Copy)]
enum Mode {
    Missing(u16),
    Work(u64),
    Cancel(u64),
    Deadline(u64),
    Prior,
    Foreign,
    Generated,
    Preclaimed,
    OtherBudgetPreclaimed,
    Duplicate,
    Consumed,
    LateCancel,
    LateDeadline,
}

fn exercise(mode: Mode) {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let events = Rc::new(RefCell::new(Vec::new()));
    let started = now.get();
    let deadline_audit = crate::signature_boundary::positioned_read::work_audit::Audit::default();
    let clock = || {
        if let Mode::Deadline(n) = mode
            && deadline_audit.counts().iter().sum::<u64>() >= n
        {
            now.set(started + Duration::from_secs(10));
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut foreign = SharedBudget::new(now.get(), &cancel);
    foreign.now = &clock;
    let binding = f.receipt.binding.clone();
    let lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    let bound = bind(&binding, &lineage, &target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (o, mut t, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, o).unwrap();
    let watch = |id| {
        let e = events.clone();
        ReleaseWatch(Box::new(move || e.borrow_mut().push(id)))
    };
    let held_before_topology = Rc::new(Cell::new(false));
    let observed = held_before_topology.clone();
    let counts = tc.clone();
    let e = events.clone();
    t.release_watch = Some(ReleaseWatch(Box::new(move || {
        observed.set(counts.made.get() == counts.dropped.get());
        e.borrow_mut().push(5);
    })));
    let mut receipt = f.receipt;
    let e = events.clone();
    let cancelled = cancel.clone();
    let late_clock = now.clone();
    receipt.release_watch = Some(ReleaseWatch(Box::new(move || {
        e.borrow_mut().push(6);
        if matches!(mode, Mode::LateCancel) {
            cancelled.store(true, Ordering::Release);
        }
        if matches!(mode, Mode::LateDeadline) {
            late_clock.set(late_clock.get() + Duration::from_secs(10));
        }
    })));
    let source = Watched {
        inner: RecordFake::for_stage(&receipt, &now, now.get()),
        _watch: watch(3),
    };
    let ts = Watched {
        inner: ts,
        _watch: watch(4),
    };
    let starts = Rc::new(RefCell::new(Vec::new()));
    let supply = bridge::fixture(
        held,
        t,
        receipt,
        source,
        ts,
        body::Inputs {
            context: &c,
            scans: std::array::from_fn(|slot| super::Scan {
                fake: Fake(state.clone()),
                slot,
                first: false,
                fault: None,
                events: events.clone(),
                starts: starts.clone(),
            }),
            resources: Some(ledger_test::input(caps())),
            quotas: std::array::from_fn(|_| quotas()),
        },
        &b,
    );
    let mut input = bridge::preparation::fixture(supply);
    let retry = input.empty_retry_fixture();
    if matches!(mode, Mode::Preclaimed) {
        input.preclaim(&mut b);
    }
    if matches!(mode, Mode::OtherBudgetPreclaimed) {
        input.preclaim(&mut foreign);
    }
    assert_eq!(
        format!("{input:?}"),
        "PreparationEnvelope(partial_not_producer_or_authority)"
    );
    use bridge::preparation::PartialField::*;
    let fields = [
        Context,
        Records,
        Topology,
        Held,
        Source,
        TopologySource,
        Resources,
        Quota(0),
        Quota(1),
        Quota(2),
        Scan(0),
        Scan(1),
        Scan(2),
    ];
    if let Mode::Missing(mask) = mode {
        for (i, field) in fields.into_iter().enumerate() {
            if mask & (1 << i) != 0 {
                input.remove(field);
            }
        }
    }
    let already = events.borrow().clone();
    events.borrow_mut().clear();
    let mut owner = upper::StrictResultOwner::new();
    let mut previous = None;
    if matches!(mode, Mode::Duplicate | Mode::Consumed) {
        let mut prior = SharedBudget::new(now.get(), &cancel);
        let slot = owner.begin(upper::MODEL_ID, &mut prior).unwrap();
        slot.retain(Err(upper::StrictBridgeFailure::input(
            upper::InputRejected::new(
                upper::InputStage::ReceiptBinding,
                Failure::HashMismatch,
                &mut prior,
            ),
        )));
        if matches!(mode, Mode::Consumed) {
            previous = owner.take();
        }
    }
    match mode {
        Mode::Work(n) => b.json_work = 1_000_000 - n,
        Mode::Cancel(n) => {
            let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
            a.cancel_after_work(n, cancel.clone());
            b.work_audit = Some(a);
        }
        Mode::Deadline(_) => b.work_audit = Some(deadline_audit.clone()),
        Mode::Prior => {
            let _ = b.stop::<()>(Failure::HashMismatch);
        }
        Mode::Generated => b.protected_bridge_claim.generated.set(true),
        _ => {}
    }
    let signal = if matches!(mode, Mode::Foreign) {
        owner.run_creation(input, &mut foreign)
    } else {
        owner.run_creation(input, &mut b)
    };
    assert!(b.protected_bridge_claim.preparation_started.get());
    if matches!(mode, Mode::Foreign | Mode::OtherBudgetPreclaimed) {
        assert!(foreign.protected_bridge_claim.preparation_started.get());
    }
    let expected: Vec<_> = (0..=6).filter(|v| !already.contains(v)).collect();
    assert_eq!(&*events.borrow(), &expected);
    if !already.contains(&5) {
        assert!(held_before_topology.get());
    }
    assert!(state.borrow().alive.is_empty());
    assert_eq!(tc.made.get(), tc.dropped.get());
    if matches!(mode, Mode::Duplicate | Mode::Consumed) {
        assert_eq!(signal, Err(Failure::Binding));
        assert_eq!(b.json_work, 0);
        assert!(!b.protected_bridge_claim.generated.get());
        assert!(starts.borrow().is_empty());
        let first = if matches!(mode, Mode::Consumed) {
            assert!(owner.take().is_none());
            previous.unwrap().unwrap_err()
        } else {
            owner.take().unwrap().unwrap_err()
        };
        assert_eq!(first.reason(), Failure::HashMismatch);
        assert_eq!(first.input_stage(), Some(upper::InputStage::ReceiptBinding));
        assert_eq!(first.release(), DropObservation::NotReached);
        assert!(owner.take().is_none());
        assert_eq!(
            b.protected_bridge_claim.failure.get(),
            Some(Failure::Binding)
        );
        let mut next = upper::StrictResultOwner::new();
        assert_eq!(next.run_creation(retry, &mut b), Err(Failure::Binding));
        assert_eq!(
            next.take().unwrap().unwrap_err().input_location(),
            Some(upper::InputLocation::OwnerBegin)
        );
        assert_eq!(b.json_work, 0);
        return;
    }
    let error = owner.take().unwrap().unwrap_err();
    let reason = error.reason();
    assert_eq!(signal, Err(reason));
    assert_eq!(b.checkpoint(), Err(reason));
    if matches!(mode, Mode::Foreign) {
        assert_eq!(foreign.checkpoint(), Err(reason));
    }
    assert_eq!(error.release(), DropObservation::SequenceReturned);
    assert_eq!(error.checkpoint(), PostReleaseCheckpoint::Stopped(reason));
    use upper::{CreateStage as C, InputLocation as L, InputStage as U, SupplyStage as S};
    let expected_location = match mode {
        Mode::Missing(mask) => {
            assert_eq!(reason, Failure::Unavailable);
            assert!(!b.protected_bridge_claim.generated.get());
            let first = mask.trailing_zeros();
            Some(L::Supply(match first {
                0 => S::Context,
                1 => S::ReceiptTarget,
                2..=5 => S::HeldSources,
                6..=9 => S::PolicyCaps,
                _ => S::Slots,
            }))
        }
        Mode::Work(n) | Mode::Cancel(n) | Mode::Deadline(n) => {
            assert_eq!(
                reason,
                if matches!(mode, Mode::Work(_)) {
                    Failure::Limit
                } else if matches!(mode, Mode::Cancel(_)) {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                }
            );
            let i = if matches!(mode, Mode::Cancel(_) | Mode::Deadline(_)) {
                n.saturating_sub(1)
            } else {
                n
            };
            let locations = [
                L::OwnerBegin,
                L::OwnerBegin,
                L::Supply(S::InspectionEntry),
                L::Supply(S::SealPublish),
                L::Create(C::ClaimModel),
                L::Create(C::InspectionPublish),
                L::Use(U::ModelInputUnavailable),
                L::Use(U::InspectionBinding),
                L::Use(U::ContextBinding),
                L::Use(U::ReceiptBinding),
                L::Use(U::SourceBinding),
                L::Use(U::PolicyBinding),
                L::Use(U::SlotBinding),
                L::Use(U::SlotBinding),
                L::Use(U::SlotBinding),
                L::Use(U::InspectionBinding),
                L::TransferCommit,
            ];
            assert_eq!(b.protected_bridge_claim.generated.get(), i >= 4);
            if i == 17 {
                assert_eq!(error.outer_phase(), Some(OuterPhase::Entry));
                None
            } else {
                Some(locations[i as usize])
            }
        }
        Mode::Prior => {
            assert_eq!(reason, Failure::HashMismatch);
            Some(L::OwnerBegin)
        }
        Mode::Foreign | Mode::Preclaimed | Mode::OtherBudgetPreclaimed => {
            assert_eq!(reason, Failure::Binding);
            assert!(!b.protected_bridge_claim.generated.get());
            Some(L::Supply(S::InspectionEntry))
        }
        Mode::Generated => {
            assert_eq!(reason, Failure::Binding);
            Some(L::Supply(S::InspectionEntry))
        }
        Mode::LateCancel | Mode::LateDeadline => {
            assert_eq!(
                reason,
                if matches!(mode, Mode::LateCancel) {
                    Failure::Cancelled
                } else {
                    Failure::Deadline
                }
            );
            assert_eq!(error.outer_phase(), Some(OuterPhase::PostReleaseCheckpoint));
            assert_eq!(starts.borrow().len(), 3);
            None
        }
        Mode::Duplicate | Mode::Consumed => unreachable!(),
    };
    assert_eq!(error.input_location(), expected_location);
    if !matches!(mode, Mode::LateCancel | Mode::LateDeadline) {
        assert!(starts.borrow().is_empty());
    }
    if matches!(expected_location, Some(L::Supply(_) | L::Create(_))) {
        assert_eq!(error.input_stage(), None);
    }
    assert!(owner.take().is_none());
    let spent = b.json_work;
    let mut next = upper::StrictResultOwner::new();
    assert_eq!(next.run_creation(retry, &mut b), Err(reason));
    let saved = next.take().unwrap().unwrap_err();
    assert_eq!(saved.reason(), reason);
    assert_eq!(saved.input_location(), Some(L::OwnerBegin));
    assert_eq!(b.protected_bridge_claim.failure.get(), Some(reason));
    assert_eq!(b.json_work, spent);
}

#[test]
fn preparation_claim_is_consumed_before_even_owner_begin_failure() {
    exercise(Mode::Work(0));
}

#[test]
fn creation_each_guard_budget_boundary_retains_its_location_and_sticky_reason() {
    for n in 0..=17 {
        exercise(Mode::Work(n));
    }
    for n in 1..=18 {
        exercise(Mode::Cancel(n));
    }
    exercise(Mode::Prior);
}
#[test]
fn creation_deadline_at_each_committed_guard_never_publishes_late_success() {
    for n in 0..=18 {
        exercise(Mode::Deadline(n));
    }
}
#[test]
fn preparation_claim_rejects_abandoned_attempts_even_with_a_fresh_result_owner() {
    exercise(Mode::Preclaimed);
    exercise(Mode::OtherBudgetPreclaimed);
}
#[test]
fn preparation_failed_attempt_cannot_resume_through_a_new_owner() {
    exercise(Mode::Missing(1));
    exercise(Mode::Work(0));
    exercise(Mode::Prior);
}
#[test]
fn creation_foreign_inspection_and_duplicate_claim_never_start_the_release() {
    exercise(Mode::Foreign);
    exercise(Mode::Generated);
}
#[test]
fn creation_duplicate_owner_discards_new_partial_inputs_without_replacing_prior_diagnostics() {
    exercise(Mode::Duplicate);
    exercise(Mode::Consumed);
}
#[test]
fn creation_late_release_cancel_and_expiry_retain_actual_outer_failure() {
    exercise(Mode::LateCancel);
    exercise(Mode::LateDeadline);
}
