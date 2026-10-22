use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::{
    records::tests::Fake as RecordFake, tests as topo,
};
use scan_ops::connection_owner::{body, protected_inputs as bridge};

#[test]
fn protected_bundle_is_single_generation_and_does_not_start_a_scan_session() {
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
    let (opened, topology, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, opened).unwrap();
    let source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let supply = bridge::fixture(
        held,
        topology,
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
    let mut bundle = bridge::create(supply, bridge::MODEL_ID, &mut b).unwrap();
    assert_eq!(b.json_work, 2);
    let accounting = (
        b.used,
        b.reserved,
        b.retries_left,
        b.metadata_calls,
        b.topology_calls,
    );
    assert!(!b.scan_session_claim.started.get());
    assert_eq!(bundle.require_use(bridge::MODEL_ID, &mut b), Ok(()));
    assert_eq!(b.json_work, 12);
    assert_eq!(
        (
            b.used,
            b.reserved,
            b.retries_left,
            b.metadata_calls,
            b.topology_calls
        ),
        accounting
    );
    assert!(!b.scan_session_claim.started.get());
    assert_eq!(state.borrow().calls, 0);
    assert_eq!(
        bundle.require_use(bridge::MODEL_ID, &mut b),
        Err(Failure::Binding)
    );
    drop(bundle);
    assert_eq!(tc.made.get(), tc.dropped.get());
    assert_eq!(b.checkpoint(), Err(Failure::Binding));
}

#[derive(Clone, Copy)]
enum Scenario {
    Fault(bridge::FixtureFault),
    ForeignCreate,
    ForeignUse,
    Origin,
    Session,
    Started,
    CreateModel,
    UseModel,
    CreateWork(u64),
    UseWork(u64),
    Cancel(u64),
    Deadline,
}
fn rejected(scenario: Scenario, expected: Failure) {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let other_context = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut foreign = SharedBudget::new(now.get(), &cancel);
    foreign.now = &clock;
    let binding = f.receipt.binding.clone();
    let lineage = f.receipt.lineage.clone();
    let target = f.target.clone();
    let bound = bind(&binding, &lineage, &target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (opened, topology, ts) = topo::setup(&bound, &tc);
    let held = attach(&bound, opened).unwrap();
    let source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let supply = bridge::fixture(
        held,
        topology,
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
    if let Scenario::CreateWork(n) = scenario {
        b.json_work = 1_000_000 - n;
    }
    if let Scenario::Cancel(n) = scenario {
        let a = crate::signature_boundary::positioned_read::work_audit::Audit::default();
        a.cancel_after_work(n, cancel.clone());
        b.work_audit = Some(a);
    }
    let model = if matches!(scenario, Scenario::CreateModel) {
        "unknown"
    } else {
        bridge::MODEL_ID
    };
    let result = if matches!(scenario, Scenario::ForeignCreate) {
        bridge::create(supply, model, &mut foreign)
    } else {
        bridge::create(supply, model, &mut b)
    };
    match result {
        Err(e) => assert_eq!(e, expected),
        Ok(mut bundle) => {
            match scenario {
                Scenario::Fault(fault) => bundle.fixture_change(fault, &other_context),
                Scenario::Origin => b.inspection_origin = Rc::new(()),
                Scenario::Session => b.scan_session_claim = Rc::new(Default::default()),
                Scenario::Started => b.started -= Duration::from_nanos(1),
                Scenario::UseWork(n) => b.json_work = 1_000_000 - n,
                Scenario::Deadline => now.set(now.get() + Duration::from_secs(10)),
                _ => (),
            }
            let model = if matches!(scenario, Scenario::UseModel) {
                "unknown"
            } else {
                bridge::MODEL_ID
            };
            let result = if matches!(scenario, Scenario::ForeignUse) {
                bundle.require_use(model, &mut foreign)
            } else {
                bundle.require_use(model, &mut b)
            };
            assert_eq!(result, Err(expected));
            assert_eq!(bundle.require_use(bridge::MODEL_ID, &mut b), Err(expected));
            drop(bundle);
        }
    }
    assert_eq!(b.checkpoint(), Err(expected));
    if matches!(scenario, Scenario::ForeignCreate | Scenario::ForeignUse) {
        assert_eq!(foreign.checkpoint(), Err(expected));
    }
    assert!(!b.scan_session_claim.started.get());
    assert_eq!(state.borrow().calls, 0);
    assert_eq!(tc.attempts.get(), 0);
    assert_eq!(tc.made.get(), tc.dropped.get());
}
#[test]
fn protected_identity_rejects_context_receipt_open_source_policy_and_slot_mixups() {
    use bridge::FixtureFault::*;
    for fault in [
        Context,
        Lineage,
        Binding,
        TopologyLineage,
        TopologyBinding,
        Target,
        HeldOrigin,
        Source,
        TopologySource,
        Policy,
        SwapScans,
    ] {
        rejected(Scenario::Fault(fault), Failure::Binding);
    }
    for i in 0..3 {
        rejected(Scenario::Fault(ScanSupply(i)), Failure::Binding);
        rejected(Scenario::Fault(QuotaSupply(i)), Failure::Binding);
        rejected(Scenario::Fault(MissingQuota(i)), Failure::Unavailable);
    }
    rejected(Scenario::Fault(MissingPolicy), Failure::Unavailable);
}
#[test]
fn protected_identity_rejects_foreign_inspection_and_unknown_models() {
    for scenario in [
        Scenario::ForeignCreate,
        Scenario::ForeignUse,
        Scenario::Origin,
        Scenario::Session,
        Scenario::Started,
    ] {
        rejected(scenario, Failure::Binding);
    }
    for scenario in [Scenario::CreateModel, Scenario::UseModel] {
        rejected(scenario, Failure::Unavailable);
    }
}
#[test]
fn protected_generation_and_use_stop_at_every_budget_boundary_without_restarting() {
    for n in 0..2 {
        rejected(Scenario::CreateWork(n), Failure::Limit);
    }
    for n in 0..10 {
        rejected(Scenario::UseWork(n), Failure::Limit);
    }
    for n in 1..=12 {
        rejected(Scenario::Cancel(n), Failure::Cancelled);
    }
    rejected(Scenario::Deadline, Failure::Deadline);
}

#[test]
fn dropping_a_checked_or_unchecked_bundle_stops_its_original_budget() {
    for checked in [false, true] {
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
        let (opened, topology, ts) = topo::setup(&bound, &tc);
        let held = attach(&bound, opened).unwrap();
        let source = RecordFake::for_stage(&f.receipt, &now, now.get());
        let supply = bridge::fixture(
            held,
            topology,
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
        let mut bundle = bridge::create(supply, bridge::MODEL_ID, &mut b).unwrap();
        if checked {
            bundle.require_use(bridge::MODEL_ID, &mut b).unwrap();
        }
        assert_eq!(b.checkpoint(), Ok(()));
        drop(bundle);
        assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
        assert!(!b.scan_session_claim.started.get());
        assert_eq!(tc.made.get(), tc.dropped.get());
        assert_eq!(state.borrow().calls, 0);
    }
}

#[test]
fn duplicate_supply_generation_poisoning_is_budget_owned_even_before_first_bundle_use() {
    for initial_model in [bridge::MODEL_ID, "unknown"] {
        let (f1, state1, registry1) = records_stage::valid_signature_fixture();
        let (f2, state2, registry2) = records_stage::valid_signature_fixture();
        let c1 = InspectionContext {
            registry: &registry1,
            groups: &[80],
        };
        let c2 = InspectionContext {
            registry: &registry2,
            groups: &[80],
        };
        let cancel = state1.borrow().cancelled.clone();
        let now = state1.borrow().now.clone();
        let clock = || now.get();
        let mut b = SharedBudget::new(now.get(), &cancel);
        b.now = &clock;
        let binding1 = f1.receipt.binding.clone();
        let lineage1 = f1.receipt.lineage.clone();
        let target1 = f1.target.clone();
        let binding2 = f2.receipt.binding.clone();
        let lineage2 = f2.receipt.lineage.clone();
        let target2 = f2.target.clone();
        let bound1 = bind(&binding1, &lineage1, &target1).unwrap();
        let bound2 = bind(&binding2, &lineage2, &target2).unwrap();
        let tc1 = Rc::new(topo::Counts::default());
        let (o1, t1, s1) = topo::setup(&bound1, &tc1);
        let tc2 = Rc::new(topo::Counts::default());
        let (o2, t2, s2) = topo::setup(&bound2, &tc2);
        let source1 = RecordFake::for_stage(&f1.receipt, &now, now.get());
        let source2 = RecordFake::for_stage(&f2.receipt, &now, now.get());
        let supply1 = bridge::fixture(
            attach(&bound1, o1).unwrap(),
            t1,
            f1.receipt,
            source1,
            s1,
            body::Inputs {
                context: &c1,
                scans: std::array::from_fn(|_| Fake(state1.clone())),
                resources: Some(ledger_test::input(caps())),
                quotas: std::array::from_fn(|_| quotas()),
            },
            &b,
        );
        let supply2 = bridge::fixture(
            attach(&bound2, o2).unwrap(),
            t2,
            f2.receipt,
            source2,
            s2,
            body::Inputs {
                context: &c2,
                scans: std::array::from_fn(|_| Fake(state2.clone())),
                resources: Some(ledger_test::input(caps())),
                quotas: std::array::from_fn(|_| quotas()),
            },
            &b,
        );
        let first = bridge::create(supply1, initial_model, &mut b);
        let expected = if initial_model == bridge::MODEL_ID {
            Failure::Binding
        } else {
            Failure::Unavailable
        };
        let error = bridge::create(supply2, bridge::MODEL_ID, &mut b).unwrap_err();
        assert_eq!(error, expected);
        if let Ok(mut first) = first {
            assert_eq!(first.require_use(bridge::MODEL_ID, &mut b), Err(expected));
        }
        assert_eq!(b.checkpoint(), Err(expected));
        assert!(!b.scan_session_claim.started.get());
        for tc in [tc1, tc2] {
            assert_eq!(tc.made.get(), tc.dropped.get());
            assert_eq!(tc.attempts.get(), 0);
        }
        assert_eq!(state1.borrow().calls, 0);
        assert_eq!(state2.borrow().calls, 0);
    }
}

#[test]
fn forgetting_bundle_does_not_restore_its_budget_generation_claim() {
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
    let source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let supply = bridge::fixture(
        attach(&bound, o).unwrap(),
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
    let bundle = bridge::create(supply, bridge::MODEL_ID, &mut b).unwrap();
    // Leak deliberately: this test makes no cleanup claim about forget.
    std::mem::forget(bundle);
    assert!(b.protected_bridge_claim.generated.get());
    assert!(!b.scan_session_claim.started.get());
    assert!(tc.made.get() > tc.dropped.get());
    assert_eq!(state.borrow().calls, 0);
}

#[test]
fn inert_payload_is_released_in_fixed_order_without_any_io_trait_calls() {
    use crate::signature_boundary::positioned_read::metadata::transfer::topology::ReleaseWatch;
    struct Watch(Rc<RefCell<Vec<u8>>>, u8);
    impl Drop for Watch {
        fn drop(&mut self) {
            self.0.borrow_mut().push(self.1);
        }
    }
    let (mut f, state, registry) = records_stage::valid_signature_fixture();
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
    let (o, mut t, _unused_ts) = topo::setup(&bound, &tc);
    let events = Rc::new(RefCell::new(Vec::new()));
    let e = events.clone();
    let held_counts = tc.clone();
    t.release_watch = Some(ReleaseWatch(Box::new(move || {
        assert_eq!(&*e.borrow(), &[0, 1, 2, 3, 4]);
        assert_eq!(held_counts.made.get(), held_counts.dropped.get());
        e.borrow_mut().push(5);
    })));
    let e = events.clone();
    f.receipt.release_watch = Some(ReleaseWatch(Box::new(move || {
        assert_eq!(&*e.borrow(), &[0, 1, 2, 3, 4, 5]);
        e.borrow_mut().push(6);
    })));
    let supply = bridge::fixture(
        attach(&bound, o).unwrap(),
        t,
        f.receipt,
        Watch(events.clone(), 3),
        Watch(events.clone(), 4),
        body::Inputs {
            context: &c,
            scans: std::array::from_fn(|i| Watch(events.clone(), i as u8)),
            resources: Some(ledger_test::input(caps())),
            quotas: std::array::from_fn(|_| quotas()),
        },
        &b,
    );
    let mut bundle = bridge::create(supply, bridge::MODEL_ID, &mut b).unwrap();
    assert_eq!(bundle.require_use(bridge::MODEL_ID, &mut b), Ok(()));
    assert_eq!(
        format!("{bundle:?}"),
        "ProtectedStrictInputs(inert_not_dispatch_or_execution_authority)"
    );
    drop(bundle);
    assert_eq!(&*events.borrow(), &[0, 1, 2, 3, 4, 5, 6]);
    assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
}
