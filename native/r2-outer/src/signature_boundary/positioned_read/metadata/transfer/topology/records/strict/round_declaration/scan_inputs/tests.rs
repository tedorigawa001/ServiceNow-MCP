use super::super::tests::{Setup, context};
use super::*;
use crate::closure::shared::index_decode_count;
use phases::PHASE_MODEL_ID;

pub(super) fn setup() -> Setup {
    let mut s = Setup::new();
    let depth = absolute(&s.receipt.binding.runtime_root).unwrap().len();
    for ancestor in &mut s.receipt.pins[2].ancestors[depth..] {
        ancestor.stat.mode = 0o555;
    }
    s
}

#[test]
fn receipt_round_parent_children_and_virtual_index_are_bound_without_io_or_decode() {
    let s = setup();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let before = index_decode_count();
    with_round(
        &s.receipt,
        &s.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let d = scope.decode(b)?;
            let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let work_before = b.json_work;
            let inputs = p.bind_inputs(scope, b)?;
            assert_eq!(b.json_work - work_before, 8);
            let root = inputs.root(scope, b)?;
            let work_before = b.json_work;
            let children = root.expected(scope, b)?;
            assert_eq!(b.json_work - work_before, 15);
            assert_eq!(
                children.iter().map(ChildInput::name).collect::<Vec<_>>(),
                ["dist", "node", "index.json"]
            );
            let (node, device) = children[1].file(scope, b)?;
            assert!(std::ptr::eq(node, &d.entries()[3]));
            assert_eq!(device, 7);
            let (index, _) = children[2].file(scope, b)?;
            match index {
                closure::Entry::File { size, sha256, .. } => {
                    assert_eq!(*size, s.receipt.pins[2].bytes.len() as u64);
                    assert_eq!(sha256, &scope.hash);
                }
                _ => panic!("not a file"),
            }
            let nested = inputs.directory("dist/review", scope, b)?;
            assert_eq!(nested.expected(scope, b)?[0].name(), "r2-launcher-entry.js");
            assert_eq!(
                format!("{inputs:?}"),
                "ScanInputs(receipt_round_only_not_execution_authority)"
            );
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(index_decode_count(), before + 1);
    assert_eq!(
        (b.used, b.reserved, b.metadata_calls, b.topology_calls),
        (0, 0, 0, 0)
    );
}

#[test]
fn copied_scope_nonce_cannot_substitute_receipt_target_or_context() {
    for case in 0..3 {
        let s = setup();
        let mut other = setup();
        other.receipt.lineage = s.receipt.lineage.clone();
        let c = context();
        let alternate_context = context();
        let target = s.target.clone();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = p.bind_inputs(scope, b)?;
                    let forged = RoundScope {
                        receipt: if case == 0 {
                            &other.receipt
                        } else {
                            scope.receipt
                        },
                        target: if case == 1 { &target } else { scope.target },
                        context: if case == 2 {
                            &alternate_context
                        } else {
                            scope.context
                        },
                        round: scope.round,
                        token: scope.token.clone(),
                        decode_started: std::cell::Cell::new(true),
                        budget_origin: scope.budget_origin.clone(),
                        hash: scope.hash.clone(),
                        index_path: scope.index_path.clone(),
                    };
                    inputs.root(&forged, b).map(|_| ())
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
    }
}

#[test]
fn forged_equal_child_wrong_parent_and_duplicate_projection_fail_closed() {
    for case in 0..4 {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let result = with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let inputs = p.bind_inputs(scope, b)?;
                let root = inputs.root(scope, b)?;
                let children = root.expected(scope, b)?;
                match case {
                    0 => {
                        let clone = children[1].entry.clone();
                        let forged = ChildInput {
                            parent: &root,
                            entry: &clone,
                        };
                        inputs.require_child(&root, &forged, scope, b)
                    }
                    1 => {
                        let other = inputs.root(scope, b)?;
                        inputs.require_child(&other, &children[1], scope, b)
                    }
                    2 => {
                        let other = inputs.directory("dist", scope, b)?;
                        inputs.require_child(&other, &children[1], scope, b)
                    }
                    _ => p.bind_inputs(scope, b).map(|_| ()),
                }
            },
        );
        assert_eq!(result.unwrap_err(), Failure::Binding);
        assert_eq!(b.failed, Some(Failure::Binding));
    }
}

#[test]
fn selectors_and_directory_as_file_are_rejected() {
    for path in ["node", "/dist", "../dist", "absent", "dist/review2", ""] {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    p.bind_inputs(scope, b)?
                        .directory(path, scope, b)
                        .map(|_| ())
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
    }
    let s = setup();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let inputs = p.bind_inputs(scope, b)?;
                let root = inputs.root(scope, b)?;
                root.expected(scope, b)?[0].file(scope, b).map(|_| ())
            }
        )
        .unwrap_err(),
        Failure::Binding
    );
}

#[test]
fn distinct_round_or_budget_cannot_reuse_projection() {
    for next in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = p.bind_inputs(scope, b)?;
                    with_round(&s.receipt, &s.target, &c, next, b, |other, b| {
                        inputs.root(other, b).map(|_| ())
                    })
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
    }
    let s = setup();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    with_round(
        &s.receipt,
        &s.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let d = scope.decode(b)?;
            let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = p.bind_inputs(scope, b)?;
            let mut other = SharedBudget::new(Instant::now(), &cancel);
            assert_eq!(
                inputs.root(scope, &mut other).unwrap_err(),
                Failure::Binding
            );
            Ok(())
        },
    )
    .unwrap();
}

#[test]
fn root_or_index_metadata_defects_stop_before_projection() {
    for case in 0..9 {
        let mut s = setup();
        let pin = &mut s.receipt.pins[2];
        match case {
            0 => pin.ancestors[2].stat.mode = 0o755,
            1 => pin.ancestors[2].stat.uid = 1,
            2 => pin.ancestors[2].stat.kind = FileType::Regular,
            3 => pin.leaf.stat.device += 1,
            4 => pin.ancestors[2].names = VisibleNames::Unknown,
            5 => pin.leaf.names = VisibleNames::Disallowed,
            6 => pin.ancestors[2].stat.mtime.nanoseconds = 1_000_000_000,
            7 => pin.leaf.stat.mode = 0o555,
            _ => pin.leaf.stat.ctime.nanoseconds = 1_000_000_000,
        }
        let c = context();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    p.bind_inputs(scope, b).map(|_| ())
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
    }
}

#[test]
fn cancellation_work_limit_and_deadline_remain_sticky_at_input_boundaries() {
    for stage in 0..3 {
        for reason in [Failure::Cancelled, Failure::Deadline, Failure::Limit] {
            let s = setup();
            let c = context();
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let result = with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    if stage == 0 {
                        let _: Result<(), _> = b.stop(reason);
                        return p.bind_inputs(scope, b).map(|_| ());
                    }
                    let inputs = p.bind_inputs(scope, b)?;
                    let root = inputs.root(scope, b)?;
                    if stage == 1 {
                        let _: Result<(), _> = b.stop(reason);
                        return root.expected(scope, b).map(|_| ());
                    }
                    let children = root.expected(scope, b)?;
                    let _: Result<(), _> = b.stop(reason);
                    children[1].file(scope, b).map(|_| ())
                },
            );
            assert_eq!(result.unwrap_err(), reason);
            assert_eq!(b.failed, Some(reason));
            assert_eq!(
                (b.used, b.reserved, b.metadata_calls, b.topology_calls),
                (0, 0, 0, 0)
            );
        }
    }
}

#[test]
fn actual_cancel_clock_and_exhausted_work_stop_child_projection() {
    for case in 0..3 {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let now = std::cell::Cell::new(Instant::now());
        let clock = || now.get();
        let mut b = SharedBudget::new(now.get(), &cancel);
        b.now = &clock;
        let expected = [Failure::Cancelled, Failure::Deadline, Failure::Limit][case];
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = p.bind_inputs(scope, b)?;
                    let root = inputs.root(scope, b)?;
                    match case {
                        0 => cancel.store(true, Ordering::Release),
                        1 => now.set(now.get() + std::time::Duration::from_secs(10)),
                        _ => b.json_work = 1_000_000,
                    }
                    root.expected(scope, b).map(|_| ())
                }
            )
            .unwrap_err(),
            expected
        );
        assert_eq!(b.failed, Some(expected));
    }
}

#[test]
fn completed_scan_phase_cannot_issue_inputs() {
    let s = setup();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let mut p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let observation = ClosureObservation {
                    lineage: s.receipt.lineage.clone(),
                    records: s.receipt.binding.clone(),
                    round: scope.round,
                    token: scope.token.clone(),
                    entries: s.observed.clone(),
                };
                p.after_scan(&observation, b)?;
                p.bind_inputs(scope, b).map(|_| ())
            }
        )
        .unwrap_err(),
        Failure::Binding
    );
}

#[test]
fn index_accepted_large_file_remains_rejected_by_scan_file_limit() {
    let mut s = setup();
    let mut v: serde_json::Value = serde_json::from_slice(&s.receipt.pins[2].bytes).unwrap();
    v["entries"][2]["size"] = serde_json::json!(MAX_FILE + 1);
    s.receipt.pins[2].bytes = serde_json::to_vec(&v).unwrap();
    s.receipt.pins[2].leaf.stat.size = s.receipt.pins[2].bytes.len() as u64;
    s.receipt.binding.index_hash = Sha256::digest(&s.receipt.pins[2].bytes).into();
    let c = context();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let inputs = p.bind_inputs(scope, b)?;
                let parent = inputs.directory("dist/review", scope, b)?;
                parent.expected(scope, b)?[0].file(scope, b).map(|_| ())
            }
        )
        .unwrap_err(),
        Failure::Limit
    );
}
