use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::Kind as RecordKind;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::tests::Fake as RecordFake;
use scan_ops::connection_owner::protected_inputs::supply_evidence as evidence;
use scan_ops::connection_owner::result_owner::{InputLocation, StrictBridgeFailure, SupplyStage};
use sha2::{Digest, Sha256};

macro_rules! acquired {
    ($inputs:ident, $b:ident, $cancel:ident, $body:block) => {{
        let (f, state, registry) = records_stage::valid_signature_fixture();
        let context = InspectionContext {
            registry: &registry,
            groups: &[80],
        };
        let $cancel = state.borrow().cancelled.clone();
        let now = state.borrow().now.clone();
        let clock = || now.get();
        let mut $b = SharedBudget::new(now.get(), &$cancel);
        $b.now = &clock;
        let binding = f.receipt.binding.clone();
        let lineage = f.receipt.lineage.clone();
        let target = f.target.clone();
        let bound = bind(&binding, &lineage, &target).unwrap();
        let source = RecordFake::for_stage(&f.receipt, &now, now.get());
        let $inputs =
            evidence::synthetic::acquire(&context, &bound, f.receipt, source, &mut $b).unwrap();
        $body
    }};
}
fn rejection(
    e: scan_ops::connection_owner::result_owner::InputRejected,
    stage: SupplyStage,
    reason: Failure,
) {
    let e = StrictBridgeFailure::input(e);
    assert_eq!(e.reason(), reason);
    assert_eq!(e.input_location(), Some(InputLocation::Supply(stage)));
    assert_eq!(
        e.release(),
        scan_ops::connection_owner::outer_result::DropObservation::NotReached
    );
}

#[test]
fn supply_evidence_duplicate_issuance_and_wrong_order_poison_the_original_budget() {
    for mode in 0..3 {
        acquired!(inputs, b, cancel, {
            let _ = &cancel;
            let (error, stage) = match mode {
                0 => {
                    let _c = inputs.issue_context(&mut b).unwrap();
                    (
                        inputs.issue_context(&mut b).unwrap_err(),
                        SupplyStage::Context,
                    )
                }
                1 => {
                    let _c = inputs.issue_context(&mut b).unwrap();
                    let _r = inputs.issue_records(&mut b).unwrap();
                    (
                        inputs.issue_records(&mut b).unwrap_err(),
                        SupplyStage::ReceiptTarget,
                    )
                }
                _ => (
                    inputs.issue_records(&mut b).unwrap_err(),
                    SupplyStage::ReceiptTarget,
                ),
            };
            rejection(error, stage, Failure::Binding);
            let before = inputs.source_for_test().stage_counts();
            assert_eq!(b.checkpoint(), Err(Failure::Binding));
            rejection(
                inputs.issue_context(&mut b).unwrap_err(),
                SupplyStage::Context,
                Failure::Binding,
            );
            assert_eq!(inputs.source_for_test().stage_counts(), before);
        });
    }
}

#[test]
fn supply_evidence_each_issue_and_consume_has_one_work_and_stops_at_every_boundary() {
    for allowed in 0..=4 {
        acquired!(inputs, b, cancel, {
            let _ = &cancel;
            let counts = inputs.source_for_test().stage_counts();
            b.json_work = 1_000_000 - allowed;
            let result = inputs.issue_context(&mut b).and_then(|c| {
                inputs.issue_records(&mut b).and_then(|r| {
                    c.consume(&inputs, &mut b)
                        .and_then(|c| r.consume(c, &inputs, &mut b))
                })
            });
            if allowed == 4 {
                assert!(result.is_ok());
            } else {
                let stages = [
                    SupplyStage::Context,
                    SupplyStage::ReceiptTarget,
                    SupplyStage::Context,
                    SupplyStage::ReceiptTarget,
                ];
                rejection(
                    result.unwrap_err(),
                    stages[allowed as usize],
                    Failure::Limit,
                );
            }
            assert_eq!(inputs.source_for_test().stage_counts(), counts);
            assert_eq!(b.json_work, 1_000_000);
        });
    }
}

#[test]
fn supply_evidence_cancellation_at_all_four_boundaries_is_sticky() {
    for at in 0..4 {
        acquired!(inputs, b, cancel, {
            if at == 0 {
                cancel.store(true, std::sync::atomic::Ordering::SeqCst);
            }
            let result = inputs.issue_context(&mut b).and_then(|c| {
                if at == 1 {
                    cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                }
                inputs.issue_records(&mut b).and_then(|r| {
                    if at == 2 {
                        cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                    }
                    c.consume(&inputs, &mut b).and_then(|c| {
                        if at == 3 {
                            cancel.store(true, std::sync::atomic::Ordering::SeqCst);
                        }
                        r.consume(c, &inputs, &mut b)
                    })
                })
            });
            let stages = [
                SupplyStage::Context,
                SupplyStage::ReceiptTarget,
                SupplyStage::Context,
                SupplyStage::ReceiptTarget,
            ];
            rejection(result.unwrap_err(), stages[at], Failure::Cancelled);
            cancel.store(false, std::sync::atomic::Ordering::SeqCst);
            assert_eq!(b.checkpoint(), Err(Failure::Cancelled));
        });
    }
}

#[test]
fn supply_evidence_foreign_budget_with_same_time_is_rejected_at_issue_or_consume() {
    for at in 0..4 {
        acquired!(inputs, b, cancel, {
            let mut foreign = SharedBudget::new(b.started, &cancel);
            foreign.now = b.now;
            let result = if at == 0 {
                inputs.issue_context(&mut foreign).map(|_| ())
            } else {
                let c = inputs.issue_context(&mut b).unwrap();
                if at == 1 {
                    inputs.issue_records(&mut foreign).map(|_| ())
                } else {
                    let r = inputs.issue_records(&mut b).unwrap();
                    if at == 2 {
                        c.consume(&inputs, &mut foreign).map(|_| ())
                    } else {
                        let c = c.consume(&inputs, &mut b).unwrap();
                        r.consume(c, &inputs, &mut foreign).map(|_| ())
                    }
                }
            };
            let stages = [
                SupplyStage::Context,
                SupplyStage::ReceiptTarget,
                SupplyStage::Context,
                SupplyStage::ReceiptTarget,
            ];
            rejection(result.unwrap_err(), stages[at], Failure::Binding);
            rejection(
                inputs.issue_context(&mut b).unwrap_err(),
                SupplyStage::Context,
                Failure::Binding,
            );
            assert_eq!(foreign.checkpoint(), Err(Failure::Binding));
        });
    }
}

#[test]
fn supply_evidence_moving_the_immutable_owned_receipt_source_pair_does_not_break_identity() {
    acquired!(inputs, b, cancel, {
        let _ = &cancel;
        let c = inputs.issue_context(&mut b).unwrap();
        let r = inputs.issue_records(&mut b).unwrap();
        let moved = Box::new(inputs);
        let c = c.consume(&moved, &mut b).unwrap();
        assert!(r.consume(c, &moved, &mut b).is_ok());
    });
}

#[test]
fn supply_evidence_duplicate_fixture_consumption_is_rejected_by_budget_owned_claim() {
    for records in [false, true] {
        acquired!(inputs, b, cancel, {
            let _ = &cancel;
            let c = inputs.issue_context(&mut b).unwrap();
            let c2 = c.duplicate_fixture();
            let r = inputs.issue_records(&mut b).unwrap();
            let r2 = r.duplicate_fixture();
            let checked = c.consume(&inputs, &mut b).unwrap();
            if records {
                let checked2 = checked.duplicate_fixture();
                assert!(r.consume(checked, &inputs, &mut b).is_ok());
                rejection(
                    r2.consume(checked2, &inputs, &mut b).unwrap_err(),
                    SupplyStage::ReceiptTarget,
                    Failure::Binding,
                );
            } else {
                rejection(
                    c2.consume(&inputs, &mut b).unwrap_err(),
                    SupplyStage::Context,
                    Failure::Binding,
                );
            }
        });
    }
}

#[test]
fn supply_evidence_source_lineage_or_immutable_owner_substitution_is_rejected() {
    for fault in 0..3 {
        acquired!(inputs, b, cancel, {
            let _ = &cancel;
            let c = inputs.issue_context(&mut b).unwrap();
            let r = inputs.issue_records(&mut b).unwrap();
            let checked = c.consume(&inputs, &mut b).unwrap();
            let mut inputs = inputs;
            inputs.corrupt_for_test(fault);
            rejection(
                r.consume(checked, &inputs, &mut b).unwrap_err(),
                SupplyStage::ReceiptTarget,
                Failure::Binding,
            );
            assert_eq!(b.checkpoint(), Err(Failure::Binding));
        });
    }
}

#[test]
fn supply_evidence_deadline_at_all_four_boundaries_preserves_the_original_reason() {
    for at in 0..4 {
        acquired!(inputs, b, cancel, {
            let _ = &cancel;
            let late = b.started + Duration::from_secs(11);
            let expired_clock = || late;
            if at == 0 {
                b.now = &expired_clock;
            }
            let result = inputs.issue_context(&mut b).and_then(|c| {
                if at == 1 {
                    b.now = &expired_clock;
                }
                inputs.issue_records(&mut b).and_then(|r| {
                    if at == 2 {
                        b.now = &expired_clock;
                    }
                    c.consume(&inputs, &mut b).and_then(|c| {
                        if at == 3 {
                            b.now = &expired_clock;
                        }
                        r.consume(c, &inputs, &mut b)
                    })
                })
            });
            let stages = [
                SupplyStage::Context,
                SupplyStage::ReceiptTarget,
                SupplyStage::Context,
                SupplyStage::ReceiptTarget,
            ];
            rejection(result.unwrap_err(), stages[at], Failure::Deadline);
            assert_eq!(b.checkpoint(), Err(Failure::Deadline));
        });
    }
}

#[test]
fn supply_evidence_discarded_proof_cannot_be_reissued_and_prior_failure_is_not_relabelled() {
    acquired!(inputs, b, cancel, {
        let _ = &cancel;
        drop(inputs.issue_context(&mut b).unwrap());
        rejection(
            inputs.issue_context(&mut b).unwrap_err(),
            SupplyStage::Context,
            Failure::Binding,
        );
    });
    acquired!(inputs, b, cancel, {
        let _ = &cancel;
        drop(inputs.issue_context(&mut b).unwrap());
        let (f2, _, registry2) = records_stage::valid_signature_fixture();
        let context2 = InspectionContext {
            registry: &registry2,
            groups: &[80],
        };
        let binding2 = f2.receipt.binding.clone();
        let lineage2 = f2.receipt.lineage.clone();
        let target2 = f2.target.clone();
        let bound2 = bind(&binding2, &lineage2, &target2).unwrap();
        let now2 = Rc::new(Cell::new((b.now)()));
        let source2 = RecordFake::for_stage(&f2.receipt, &now2, now2.get());
        let second =
            evidence::synthetic::acquire(&context2, &bound2, f2.receipt, source2, &mut b).unwrap();
        rejection(
            second.issue_context(&mut b).unwrap_err(),
            SupplyStage::Context,
            Failure::Binding,
        );
    });
    acquired!(inputs, b, cancel, {
        let _ = &cancel;
        let c = inputs.issue_context(&mut b).unwrap();
        let _ = b.stop::<()>(Failure::Expired);
        rejection(
            c.consume(&inputs, &mut b).unwrap_err(),
            SupplyStage::Context,
            Failure::Expired,
        );
        rejection(
            inputs.issue_records(&mut b).unwrap_err(),
            SupplyStage::ReceiptTarget,
            Failure::Expired,
        );
    });
}

struct WatchedSource {
    inner: RecordFake,
    dropped: Rc<Cell<usize>>,
    released: Rc<Cell<bool>>,
}
impl RecordSource for WatchedSource {
    type Handle = <RecordFake as RecordSource>::Handle;
    fn clock(&mut self) -> Result<ClockReading, Failure> {
        self.inner.clock()
    }
    fn open_anchor(&mut self, k: RecordKind) -> Result<Self::Handle, Failure> {
        self.inner.open_anchor(k)
    }
    fn open_child(&mut self, p: &Self::Handle, c: &str, d: bool) -> Result<Self::Handle, Failure> {
        self.inner.open_child(p, c, d)
    }
    fn observe(&mut self, h: &Self::Handle) -> Result<TopologyObservation, Failure> {
        self.inner.observe(h)
    }
    fn read(&mut self, h: &Self::Handle, o: u64, out: &mut [u8]) -> Result<usize, Failure> {
        self.inner.read(h, o, out)
    }
    fn revalidate(&mut self, bytes: [&[u8]; 3]) -> Result<RecordBinding, Failure> {
        self.inner.revalidate(bytes)
    }
}
impl Drop for WatchedSource {
    fn drop(&mut self) {
        let (_, made, freed, _) = self.inner.stage_counts();
        self.released.set(made == freed);
        self.dropped.set(self.dropped.get() + 1);
    }
}
#[test]
fn supply_evidence_acquisition_cancellation_deadline_and_read_failure_release_once() {
    for mode in 0..4 {
        let (mut f, state, registry) = records_stage::valid_signature_fixture();
        let context = InspectionContext {
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
        let mut inner = RecordFake::for_stage(&f.receipt, &now, now.get());
        match mode {
            0 => inner.stage_interrupt(1, cancel.clone(), None),
            1 => {
                inner.stage_interrupt(1, cancel.clone(), Some(b.started + Duration::from_secs(11)))
            }
            2 => inner.stage_fault(0, 3),
            _ => (),
        }
        let dropped = Rc::new(Cell::new(0));
        let released = Rc::new(Cell::new(false));
        let receipt_dropped_after_source = Rc::new(Cell::new(false));
        let receipt_observation = receipt_dropped_after_source.clone();
        let source_observation = dropped.clone();
        f.receipt.release_watch = Some(ReleaseWatch(Box::new(move || {
            receipt_observation.set(source_observation.get() == 1);
        })));
        let source = WatchedSource {
            inner,
            dropped: dropped.clone(),
            released: released.clone(),
        };
        let result = evidence::synthetic::acquire(&context, &bound, f.receipt, source, &mut b);
        if mode == 3 {
            let inputs = result.unwrap();
            let c = inputs.issue_context(&mut b).unwrap();
            let r = inputs.issue_records(&mut b).unwrap();
            let checked = c.consume(&inputs, &mut b).unwrap();
            let both = r.consume(checked, &inputs, &mut b).unwrap();
            drop(inputs);
            assert_eq!(dropped.get(), 1); // Proofs retain identities, not resources.
            drop(both);
        } else {
            let e = StrictBridgeFailure::input(result.unwrap_err());
            assert_eq!(
                e.reason(),
                [Failure::Cancelled, Failure::Deadline, Failure::ReadFailed][mode]
            );
            assert_eq!(
                e.input_location(),
                Some(InputLocation::Supply(SupplyStage::ReceiptTarget))
            );
        }
        assert_eq!(dropped.get(), 1);
        assert!(released.get());
        assert!(receipt_dropped_after_source.get());
        assert!(state.borrow().trace.is_empty());
    }
}

#[test]
fn supply_evidence_acquisition_rejects_untrusted_context_and_record_faults() {
    for mode in 0..13 {
        let (mut f, state, mut registry) = records_stage::valid_signature_fixture();
        let groups: Vec<u32> = match mode {
            1 => vec![],
            2 => vec![80, 80],
            3 => vec![81],
            4 => vec![80; 1025],
            _ => vec![80],
        };
        if mode == 0 {
            registry[0] ^= 1;
        }
        if mode == 5 {
            registry.resize(65537, 0);
        }
        let context = InspectionContext {
            registry: &registry,
            groups: &groups,
        };
        let cancel = state.borrow().cancelled.clone();
        let now = state.borrow().now.clone();
        let clock = || now.get();
        let mut b = SharedBudget::new(now.get(), &cancel);
        b.now = &clock;
        if mode == 12 {
            f.receipt.pins[0].bytes[0] = b'['; // malformed JSON with authentic matching pin hash
            f.receipt.binding.activation_hash = Sha256::digest(&f.receipt.pins[0].bytes).into();
        }
        let binding = f.receipt.binding.clone();
        let lineage = f.receipt.lineage.clone();
        let target = f.target.clone();
        let bound = bind(&binding, &lineage, &target).unwrap();
        if mode == 6 {
            f.receipt.lineage = Rc::new(());
        }
        if mode == 7 {
            f.receipt.pins[0].bytes[0] ^= 1;
        }
        let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
        if (8..12).contains(&mode) {
            source.stage_fault(mode - 8, 1);
        }
        let result = evidence::synthetic::acquire(&context, &bound, f.receipt, source, &mut b);
        if mode == 9 {
            // Existing bounded reread correctly completes positive short reads.
            assert!(result.is_ok());
            continue;
        }
        let error = result.unwrap_err();
        let error = StrictBridgeFailure::input(error);
        assert_eq!(
            error.input_location(),
            Some(InputLocation::Supply(if mode < 6 {
                SupplyStage::Context
            } else {
                SupplyStage::ReceiptTarget
            }))
        );
        let expected = [
            Failure::Unavailable,
            Failure::Binding,
            Failure::Binding,
            Failure::Binding,
            Failure::Limit,
            Failure::Limit,
            Failure::Binding,
            Failure::HashMismatch,
            Failure::ReadFailed,
            Failure::Unavailable,
            Failure::ReadFailed,
            Failure::Changed,
            Failure::Binding,
        ];
        assert_eq!(error.reason(), expected[mode as usize], "case {mode}");
        assert!(b.checkpoint().is_err());
        assert!(state.borrow().trace.is_empty());
    }
}

#[test]
fn synthetic_context_and_records_evidence_require_verified_acquisition_and_consume_in_order() {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let context = InspectionContext {
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
    let source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let inputs = evidence::synthetic::acquire(&context, &bound, f.receipt, source, &mut b).unwrap();
    let c = inputs.issue_context(&mut b).unwrap();
    let r = inputs.issue_records(&mut b).unwrap();
    let before = inputs.source_for_test().stage_counts();
    let c = c.consume(&inputs, &mut b).unwrap();
    let both = r.consume(c, &inputs, &mut b).unwrap();
    assert_eq!(
        format!("{both:?}"),
        "ContextRecordsChecked(not_supply_or_execution_authority)"
    );
    assert_eq!(inputs.source_for_test().stage_counts(), before);
    assert!(state.borrow().trace.is_empty());
    assert_eq!(b.checkpoint(), Ok(()));
}
