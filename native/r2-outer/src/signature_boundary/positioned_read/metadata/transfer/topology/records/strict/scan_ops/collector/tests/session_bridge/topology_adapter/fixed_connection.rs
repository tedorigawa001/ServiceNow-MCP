use super::*;
type ScanStarts = Rc<RefCell<Vec<(usize, Vec<Phase>)>>>;

struct Scan {
    fake: Fake,
    slot: usize,
    topology: Rc<topo::Counts>,
    starts: ScanStarts,
    started: bool,
}
impl ScanOps for Scan {
    type Handle = <Fake as ScanOps>::Handle;
    fn open(
        &mut self,
        p: Option<&Self::Handle>,
        n: Option<&str>,
        k: Kind,
    ) -> Result<Self::Handle, OpFailure> {
        if !std::mem::replace(&mut self.started, true) {
            self.starts
                .borrow_mut()
                .push((self.slot, self.topology.phases.borrow().clone()));
        }
        self.fake.open(p, n, k)
    }
    fn acl_init(&mut self, h: &Self::Handle) -> Result<Self::Handle, OpFailure> {
        self.fake.acl_init(h)
    }
    fn enumerate(&mut self, h: &Self::Handle, out: &mut [u8; 255]) -> Result<EnumValue, OpFailure> {
        self.fake.enumerate(h, out)
    }
    fn read(&mut self, h: &Self::Handle, o: u64, out: &mut [u8]) -> Result<usize, OpFailure> {
        self.fake.read(h, o, out)
    }
    fn metadata(
        &mut self,
        h: &Self::Handle,
        op: MetaOp,
        out: &mut [u8],
    ) -> Result<MetaValue, OpFailure> {
        self.fake.metadata(h, op, out)
    }
    fn cleanup(&mut self, h: Self::Handle) -> Cleanup {
        self.fake.cleanup(h)
    }
}

#[derive(Clone, Copy)]
enum Fault {
    None,
    Before,
    After,
    BeforeHash,
    AfterHash,
    BeforePolicy,
    AfterPolicy,
    AfterCleanup,
    FinishOrigin,
    Work(u64),
    Cancel(u64),
    Deadline(u64),
}

fn fixed(fault: Fault) -> (u64, u64) {
    let (f, state, registry) = records_stage::valid_signature_fixture();
    let c = InspectionContext {
        registry: &registry,
        groups: &[80],
    };
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let active = Cell::new(false);
    let checks = Cell::new(0);
    let clock = || {
        if active.get() {
            checks.set(checks.get() + 1);
            if let Fault::Deadline(at) = fault
                && checks.get() >= at
            {
                return now.get() + Duration::from_secs(10);
            }
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let bound = bind(&f.receipt.binding, &f.receipt.lineage, &f.target).unwrap();
    let tc = Rc::new(topo::Counts::default());
    let (opened, topology, mut ts) = topo::setup(&bound, &tc);
    let mut held = attach(&bound, opened).unwrap();
    let starts = Rc::new(RefCell::new(Vec::new()));
    let mut source = RecordFake::for_stage(&f.receipt, &now, now.get());
    let mut o = owner::create(
        &mut source,
        &f.receipt,
        &f.target,
        &c,
        std::array::from_fn(|slot| Scan {
            fake: Fake(state.clone()),
            slot,
            topology: tc.clone(),
            starts: starts.clone(),
            started: false,
        }),
        "bp5-r2-strict-owner-0.1",
        &mut b,
    )
    .unwrap();
    ledger_test::configure(ot::ledger(&mut o), caps(), &mut b).unwrap();
    o.initial(&mut b)
        .unwrap()
        .run_fixed(quotas(), &mut b)
        .unwrap();
    let run = o.topology_run(&held, &topology, &mut b).unwrap();
    if matches!(fault, Fault::Before) {
        let mut s = state.borrow_mut();
        s.case = Case::Failure(s.calls + 1);
    }
    if matches!(fault, Fault::BeforeHash) {
        state.borrow_mut().case = Case::Corrupt;
    }
    let handoff = adapter::compare(
        &run,
        &mut held,
        &mut ts,
        &mut o,
        &mut b,
        if matches!(fault, Fault::BeforePolicy) {
            None
        } else {
            quotas()
        },
    );
    let mut finish_work = 0;
    let failed_round = if matches!(
        fault,
        Fault::Before | Fault::BeforeHash | Fault::BeforePolicy
    ) {
        let e = handoff.unwrap_err();
        assert_eq!(ot::details(&e).0, Some(Round::BeforeM4));
        assert!(!tc.phases.borrow().contains(&Phase::M4));
        assert!(ot::remaining(&o)[2]);
        Some(e)
    } else {
        let after = handoff.unwrap().enter(&mut o, &mut b).unwrap();
        if matches!(fault, Fault::After) {
            let mut s = state.borrow_mut();
            s.case = Case::Failure(s.calls + 1);
        }
        if matches!(fault, Fault::AfterHash) {
            state.borrow_mut().case = Case::Corrupt;
        }
        if matches!(fault, Fault::AfterCleanup) {
            state.borrow_mut().case = Case::CleanupUnknown;
        }
        if matches!(fault, Fault::FinishOrigin) {
            b.inspection_origin = Rc::new(());
        }
        if let Fault::Work(available) = fault {
            b.json_work = 1_000_000 - available;
        }
        if let Fault::Cancel(at) = fault {
            let audit = crate::signature_boundary::positioned_read::work_audit::Audit::default();
            audit.cancel_after_work(at, cancel.clone());
            b.work_audit = Some(audit);
        }
        let work_before = b.json_work;
        active.set(true);
        let result = after.finish(
            if matches!(fault, Fault::AfterPolicy) {
                None
            } else {
                quotas()
            },
            &mut b,
        );
        active.set(false);
        finish_work = b.json_work - work_before;
        if matches!(fault, Fault::None) {
            let compared = result.unwrap();
            assert_eq!(
                compared.entitlement_gate(),
                Err(physical_signature::Rejection::UnverifiedXml)
            );
            assert_eq!(ledger_test::ack_state(ot::ledger(&mut o)).0, [true; 3]);
            assert_eq!(b.checkpoint(), Ok(()));
            None
        } else {
            let e = result.unwrap_err();
            assert_eq!(ot::details(&e).0, Some(Round::AfterM4));
            Some(e)
        }
    };
    if let Some(e) = failed_round {
        let expected = match fault {
            Fault::BeforeHash | Fault::AfterHash => Failure::HashMismatch,
            Fault::Work(_) => Failure::Limit,
            Fault::Cancel(_) => Failure::Cancelled,
            Fault::Deadline(_) => Failure::Deadline,
            Fault::FinishOrigin => Failure::Binding,
            _ => Failure::Unavailable,
        };
        assert_eq!(e.reason(), expected);
        if matches!(
            fault,
            Fault::Work(_) | Fault::Cancel(_) | Fault::Deadline(_) | Fault::FinishOrigin
        ) {
            assert!(ot::completion(&e).is_none());
        } else {
            let frame = ot::completion(&e).unwrap();
            match fault {
                Fault::BeforePolicy | Fault::AfterPolicy => {
                    assert!(matches!(frame.cleanup(), CleanupDisposition::NotStarted));
                    assert_eq!(frame.summary_attempts(), Some([0; 5]));
                }
                Fault::BeforeHash | Fault::AfterHash => {
                    let CleanupDisposition::Incomplete(problem) = frame.cleanup() else {
                        panic!("missing incomplete diagnostic")
                    };
                    assert_eq!(
                        problem.issue(),
                        scan_ops::cleanup::CleanupIssue::DeclarationIncomplete
                    );
                    assert!(frame.summary_attempts().is_some());
                }
                Fault::AfterCleanup => {
                    let CleanupDisposition::Incomplete(problem) = frame.cleanup() else {
                        panic!("missing cleanup diagnostic")
                    };
                    assert_eq!(
                        problem.issue(),
                        scan_ops::cleanup::CleanupIssue::ReleaseUnconfirmed
                    );
                    assert!(frame.summary_attempts().is_some());
                }
                _ => {
                    assert!(matches!(frame.cleanup(), CleanupDisposition::Confirmed(_)));
                    assert!(frame.summary_attempts().is_some());
                }
            }
        }
        assert!(ledger_test::ack_state(ot::ledger(&mut o)).2);
        assert_eq!(o.initial(&mut b).unwrap_err().reason(), expected);
        assert_eq!(b.stop::<()>(Failure::Changed), Err(expected));
    }
    let expected_slots: &[usize] = match fault {
        Fault::BeforePolicy => &[0],
        Fault::Before | Fault::BeforeHash | Fault::AfterPolicy => &[0, 1],
        Fault::Work(0) | Fault::Cancel(1) | Fault::Deadline(1..=4) | Fault::FinishOrigin => &[0, 1],
        _ => &[0, 1, 2],
    };
    assert_eq!(
        starts
            .borrow()
            .iter()
            .map(|(slot, _)| *slot)
            .collect::<Vec<_>>(),
        expected_slots
    );
    for (slot, phases) in starts.borrow().iter() {
        let all = [Phase::M0, Phase::M1, Phase::M2, Phase::M3, Phase::M4];
        assert_eq!(
            phases.as_slice(),
            &all[..match slot {
                0 => 0,
                1 => 4,
                _ => 5,
            }]
        );
    }
    drop(run);
    drop(o);
    drop(held);
    assert!(state.borrow().alive.is_empty());
    assert_eq!(tc.made.get(), tc.dropped.get());
    let (_, made, freed, _) = source.stage_counts();
    assert_eq!(made, freed);
    if matches!(fault, Fault::None) {
        assert_eq!(source.stage_cycles(), 6);
    }
    (finish_work, checks.get())
}

#[test]
fn fixed_connection_records_scan_phase_order_and_keeps_real_comparison_gated() {
    fixed(Fault::None);
}
#[test]
fn fixed_connection_retains_before_and_after_typed_diagnostics() {
    for fault in [
        Fault::Before,
        Fault::After,
        Fault::BeforeHash,
        Fault::AfterHash,
        Fault::BeforePolicy,
        Fault::AfterPolicy,
        Fault::AfterCleanup,
    ] {
        fixed(fault);
    }
}

#[test]
fn fixed_after_finish_entry_and_publication_guards_stop_the_original_owner() {
    let (work, checks) = fixed(Fault::None);
    fixed(Fault::Work(0));
    fixed(Fault::Cancel(1));
    fixed(Fault::FinishOrigin);
    for at in 1..=4 {
        fixed(Fault::Deadline(at));
    }
    fixed(Fault::Work(work - 1));
    fixed(Fault::Cancel(work));
    for at in checks - 3..=checks {
        fixed(Fault::Deadline(at));
    }
}
