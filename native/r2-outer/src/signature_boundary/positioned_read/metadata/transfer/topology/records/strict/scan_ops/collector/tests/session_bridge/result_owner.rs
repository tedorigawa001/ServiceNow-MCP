use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use scan_ops::connection_owner::{self as owner, outer_result as outer, testing as ot};
use scan_ops::connection_owner::{
    outer_result::{DropObservation, PostReleaseCheckpoint},
    result_owner as upper,
};

#[derive(Clone, Copy)]
enum RealCase {
    Operation,
    Hash,
    Cleanup,
    NoPolicy,
    NoQuota,
}
fn retain_real_failure(round: Round, case: RealCase) {
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
    let mut result_owner = upper::StrictResultOwner::new();
    let slot = result_owner.begin(upper::MODEL_ID, &mut b).unwrap();
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
    if !matches!(case, RealCase::NoPolicy) {
        ledger_test::configure(ot::ledger(&mut o), caps(), &mut b).unwrap();
    }
    let mut captured = None;
    for current in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        if current == round {
            let mut s = state.borrow_mut();
            s.case = match case {
                RealCase::Operation => Case::Failure(s.calls + 1),
                RealCase::Hash => Case::Corrupt,
                RealCase::Cleanup => Case::CleanupUnknown,
                _ => Case::Good,
            };
        }
        let result = ot::take(&mut o, current, &mut b).unwrap().run_fixed(
            if current == round && matches!(case, RealCase::NoQuota) {
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
    let before = ot::completion(&inner).unwrap().diagnostic();
    let reason = inner.reason();
    let phase = match round {
        Round::Initial => outer::OuterPhase::Initial,
        Round::BeforeM4 => outer::OuterPhase::Compare,
        Round::AfterM4 => outer::OuterPhase::AfterRound,
    };
    let error = outer::OuterStrictFailure::from_inner(phase, inner, &mut b);
    drop(o.stop_inspection(reason, &mut b));
    drop(o);
    drop(source);
    drop(f);
    let error =
        outer::merge_after_release::<()>(Err(error), DropObservation::SequenceReturned, &mut b)
            .unwrap_err();
    b.json_work = 1_000_000;
    cancel.store(true, Ordering::Release);
    now.set(b.started + Duration::from_secs(10));
    slot.retain(Err(upper::StrictBridgeFailure::outer(error)));
    let e = result_owner.failure().unwrap();
    assert_eq!(e.reason(), reason);
    assert_eq!(e.outer_phase(), Some(phase));
    assert_eq!(e.input_stage(), None);
    assert_eq!(e.round(), Some(round));
    assert_eq!(e.completion(), Some(before));
    assert_eq!(e.release(), DropObservation::SequenceReturned);
    assert_eq!(e.checkpoint(), PostReleaseCheckpoint::Stopped(reason));
    assert_eq!(
        result_owner.begin("secret-new-model", &mut b).unwrap_err(),
        reason
    );
    let e = result_owner.take().unwrap().unwrap_err();
    assert_eq!(e.completion(), Some(before));
    assert_eq!(e.round(), Some(round));
    assert!(result_owner.take().is_none());
    assert_eq!(b.json_work, 1_000_000);
    assert!(state.borrow().alive.is_empty());
}
#[test]
fn upper_owner_retains_real_outer_round_cleanup_and_full_summary_after_source_destruction() {
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        for case in [
            RealCase::Operation,
            RealCase::Hash,
            RealCase::Cleanup,
            RealCase::NoQuota,
        ] {
            retain_real_failure(round, case);
        }
    }
    retain_real_failure(Round::Initial, RealCase::NoPolicy);
    // No round frame exists for a late post-release failure; retain that distinction too.
    let cancel = AtomicBool::new(false);
    let start = Instant::now();
    let now = Cell::new(start);
    let clock = || now.get();
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &clock;
    let mut owner = upper::StrictResultOwner::new();
    let slot = owner.begin(upper::MODEL_ID, &mut b).unwrap();
    now.set(start + Duration::from_secs(10));
    let error =
        outer::merge_after_release(Ok(()), DropObservation::SequenceReturned, &mut b).unwrap_err();
    slot.retain(Err(upper::StrictBridgeFailure::outer(error)));
    let e = owner.take().unwrap().unwrap_err();
    assert_eq!(
        e.outer_phase(),
        Some(outer::OuterPhase::PostReleaseCheckpoint)
    );
    assert_eq!(e.reason(), Failure::Deadline);
    assert_eq!(e.round(), None);
    assert!(e.completion().is_none());
    assert_eq!(
        e.checkpoint(),
        PostReleaseCheckpoint::Stopped(Failure::Deadline)
    );
}

#[test]
fn upper_owner_moves_only_genuine_success_and_does_not_revalidate_during_storage() {
    use crate::signature_boundary::positioned_read::metadata::transfer::topology::tests as topo;
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
    let mut result_owner = upper::StrictResultOwner::new();
    let slot = result_owner.begin(upper::MODEL_ID, &mut b).unwrap();
    let binding = f.receipt.binding.clone();
    let lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    let bound = bind(&binding, &lineage, &target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (opened, topology, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, opened).unwrap();
    let source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let success = owner::release::run(
        held,
        topology,
        f.receipt,
        source,
        ts,
        owner::body::Inputs {
            context: &c,
            scans: std::array::from_fn(|_| Fake(state.clone())),
            resources: Some(ledger_test::input(caps())),
            quotas: std::array::from_fn(|_| quotas()),
        },
        &mut b,
    )
    .unwrap();
    assert_eq!(tc.made.get(), tc.dropped.get());
    assert!(state.borrow().alive.is_empty());
    b.json_work = 1_000_000;
    cancel.store(true, Ordering::Release);
    now.set(b.started + Duration::from_secs(10));
    slot.retain(Ok(success));
    assert!(result_owner.failure().is_none());
    assert_eq!(
        result_owner.begin(upper::MODEL_ID, &mut b).unwrap_err(),
        Failure::Binding
    );
    let success = result_owner.take().unwrap().unwrap();
    assert_eq!(
        success.entitlement_gate(),
        Err(physical_signature::Rejection::UnverifiedXml)
    );
    assert!(result_owner.take().is_none());
    assert_eq!(b.json_work, 1_000_000);
}

#[test]
fn upper_debug_output_is_fixed_and_never_contains_supplied_secret_or_diagnostic_fields() {
    let secret = "SYNTHETIC_SECRET_TOKEN_PATH_CODE_REGISTRY_NOT_REAL";
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut result_owner = upper::StrictResultOwner::new();
    assert_eq!(
        result_owner.begin(secret, &mut b).unwrap_err(),
        Failure::Unavailable
    );
    assert_eq!(
        format!("{result_owner:?}"),
        "StrictResultOwner(inline_retention_not_execution_authority)"
    );
    let e = result_owner.take().unwrap().unwrap_err();
    assert_eq!(format!("{e:?}"), "StrictBridgeFailure(diagnostics_only)");
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let rejection =
        upper::InputRejected::new(upper::InputStage::PolicyBinding, Failure::Changed, &mut b);
    assert_eq!(format!("{rejection:?}"), "InputRejected(diagnostics_only)");
    let outer =
        outer::OuterStrictFailure::plain(outer::OuterPhase::Receipt, Failure::Changed, &mut b);
    let e = upper::StrictBridgeFailure::outer(outer);
    assert_eq!(format!("{e:?}"), "StrictBridgeFailure(diagnostics_only)");
    drop(e);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut owner = upper::StrictResultOwner::new();
    let before = Rc::strong_count(&b.protected_bridge_claim);
    let slot = owner.begin(upper::MODEL_ID, &mut b).unwrap();
    assert_eq!(Rc::strong_count(&b.protected_bridge_claim), before + 1);
    assert_eq!(
        format!("{slot:?}"),
        "StrictResultSlot(one_shot_not_execution_authority)"
    );
    let e = upper::StrictBridgeFailure::outer(outer::OuterStrictFailure::plain(
        outer::OuterPhase::Receipt,
        Failure::Changed,
        &mut b,
    ));
    slot.retain(Err(e));
    assert_eq!(Rc::strong_count(&b.protected_bridge_claim), before);
    assert!(!format!("{owner:?}").contains(secret));
}

#[test]
fn upper_begin_guard_failure_is_retained_and_cannot_restart() {
    for mode in 0..8 {
        let cancel = Rc::new(AtomicBool::new(false));
        let start = Instant::now();
        let now = Cell::new(start);
        let clock = || now.get();
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &clock;
        let mut owner = upper::StrictResultOwner::new();
        let expected = match mode {
            0 | 1 => {
                b.json_work = 1_000_000 - mode;
                Failure::Limit
            }
            2 => {
                cancel.store(true, Ordering::Release);
                Failure::Cancelled
            }
            3 => {
                now.set(start + Duration::from_secs(10));
                Failure::Deadline
            }
            4 => {
                let _ = b.stop::<()>(Failure::HashMismatch);
                Failure::HashMismatch
            }
            5 | 6 => {
                let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
                a.cancel_after_work(mode - 4, cancel.clone());
                b.work_audit = Some(a);
                Failure::Cancelled
            }
            7 => Failure::Unavailable,
            _ => unreachable!(),
        };
        let model = if mode == 7 {
            "SYNTHETIC_SECRET_MODEL_NOT_FOR_OUTPUT"
        } else {
            upper::MODEL_ID
        };
        assert_eq!(owner.begin(model, &mut b).unwrap_err(), expected);
        let work = b.json_work;
        assert_eq!(owner.failure().unwrap().reason(), expected);
        assert_eq!(owner.begin(upper::MODEL_ID, &mut b).unwrap_err(), expected);
        assert_eq!(b.json_work, work);
        let failure = owner.take().unwrap().unwrap_err();
        assert_eq!(failure.reason(), expected);
        assert_eq!(
            failure.input_stage(),
            Some(upper::InputStage::ModelInputUnavailable)
        );
        assert!(owner.take().is_none());
        assert_eq!(b.checkpoint(), Err(expected));
    }
}

#[test]
fn input_rejection_keeps_stage_observations_and_first_reason_without_post_return_work() {
    use upper::InputStage::*;
    for stage in [
        ModelInputUnavailable,
        InspectionBinding,
        ContextBinding,
        ReceiptBinding,
        SourceBinding,
        PolicyBinding,
        SlotBinding,
        SlotAbandoned,
    ] {
        let cancel = AtomicBool::new(false);
        let start = Instant::now();
        let now = Cell::new(start);
        let clock = || now.get();
        let mut b = SharedBudget::new(start, &cancel);
        b.now = &clock;
        let mut owner = upper::StrictResultOwner::new();
        let slot = owner.begin(upper::MODEL_ID, &mut b).unwrap();
        assert_eq!(b.json_work, 2);
        let _ = b.stop::<()>(Failure::Expired);
        let e = upper::InputRejected::new(stage, Failure::Changed, &mut b)
            .after_release(DropObservation::SequenceReturned, &mut b);
        b.json_work = 1_000_000;
        cancel.store(true, Ordering::Release);
        now.set(start + Duration::from_secs(10));
        slot.retain(Err(upper::StrictBridgeFailure::input(e)));
        assert_eq!(b.json_work, 1_000_000);
        let e = owner.failure().unwrap();
        assert_eq!(e.reason(), Failure::Expired);
        assert_eq!(e.input_stage(), Some(stage));
        assert_eq!(e.outer_phase(), None);
        assert_eq!(e.round(), None);
        assert!(e.completion().is_none());
        assert_eq!(e.release(), DropObservation::SequenceReturned);
        assert_eq!(
            e.checkpoint(),
            PostReleaseCheckpoint::Stopped(Failure::Expired)
        );
        let _ = owner.begin("new-secret-override", &mut b).unwrap_err();
        assert_eq!(
            owner.take().unwrap().unwrap_err().input_stage(),
            Some(stage)
        );
    }
}

#[test]
fn forgetting_an_awaiting_slot_does_not_allow_another_begin() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut owner = upper::StrictResultOwner::new();
    std::mem::forget(owner.begin(upper::MODEL_ID, &mut b).unwrap());
    assert_eq!(
        owner.begin(upper::MODEL_ID, &mut b).unwrap_err(),
        Failure::Binding
    );
    assert!(owner.take().is_none());
    assert_eq!(b.checkpoint(), Err(Failure::Binding));
}

#[test]
fn upper_owner_stores_input_rejection_once_and_preserves_it_on_duplicate_begin() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut owner = upper::StrictResultOwner::new();
    let slot = owner.begin(upper::MODEL_ID, &mut b).unwrap();
    let rejection = upper::InputRejected::new(
        upper::InputStage::ReceiptBinding,
        Failure::HashMismatch,
        &mut b,
    );
    slot.retain(Err(upper::StrictBridgeFailure::input(rejection)));
    let e = owner.failure().unwrap();
    assert_eq!(e.reason(), Failure::HashMismatch);
    assert_eq!(e.input_stage(), Some(upper::InputStage::ReceiptBinding));
    assert_eq!(
        owner.begin(upper::MODEL_ID, &mut b).unwrap_err(),
        Failure::HashMismatch
    );
    let e = owner.failure().unwrap();
    assert_eq!(e.reason(), Failure::HashMismatch);
    assert_eq!(e.input_stage(), Some(upper::InputStage::ReceiptBinding));
    assert_eq!(e.release(), DropObservation::NotReached);
    assert_eq!(e.checkpoint(), PostReleaseCheckpoint::NotReached);
    let e = owner.take().unwrap().unwrap_err();
    assert_eq!(e.reason(), Failure::HashMismatch);
    assert!(owner.take().is_none());
    assert_eq!(
        owner.begin(upper::MODEL_ID, &mut b).unwrap_err(),
        Failure::HashMismatch
    );
}

#[test]
fn abandoning_an_awaiting_slot_stops_original_budget_without_claiming_release() {
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let mut owner = upper::StrictResultOwner::new();
    drop(owner.begin(upper::MODEL_ID, &mut b).unwrap());
    assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
    let e = owner.failure().unwrap();
    assert_eq!(e.reason(), Failure::Unavailable);
    // Distinguishable from a begin model/input failure with the same primary reason.
    assert_eq!(e.input_stage(), Some(upper::InputStage::SlotAbandoned));
    assert_eq!(e.release(), DropObservation::NotReached);
    assert_eq!(e.checkpoint(), PostReleaseCheckpoint::NotReached);
}
