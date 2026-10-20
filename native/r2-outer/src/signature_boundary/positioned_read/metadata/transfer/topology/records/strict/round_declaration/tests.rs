use super::super::super::tests::make_receipt;
use super::*;
use crate::closure::shared::{index_decode_count, tests::fixture};
use crate::signature_boundary::positioned_read::metadata::transfer::tests::{records, target};
use std::cell::Cell;

pub(super) struct Setup {
    pub(super) receipt: RecordReceipt,
    pub(super) target: TargetDeclaration,
    pub(super) observed: Vec<closure::Entry>,
}
impl Setup {
    pub(super) fn new() -> Self {
        let mut f = fixture();
        let mut v: serde_json::Value = serde_json::from_slice(&f.bytes).unwrap();
        v["entries"][3]["size"] = serde_json::json!(4096);
        f.bytes = serde_json::to_vec(&v).unwrap();
        f.hash = format!("{:x}", Sha256::digest(&f.bytes));
        f.observed = serde_json::from_value(v["entries"].clone()).unwrap();
        f.observed.push(closure::Entry::File {
            path: "index.json".into(),
            mode: "0444".into(),
            size: f.bytes.len() as u64,
            sha256: f.hash,
        });
        let mut binding = records();
        binding.release = "synthetic".into();
        let lineage = Rc::new(());
        let mut receipt = make_receipt(&mut binding, &lineage);
        receipt.pins[2].bytes = f.bytes;
        receipt.pins[2].leaf.stat.size = receipt.pins[2].bytes.len() as u64;
        binding.index_hash = Sha256::digest(&receipt.pins[2].bytes).into();
        receipt.binding = binding;
        let mut t = target();
        t.path = "/sealed/runtime/node".into();
        t.relative = "node".into();
        t.ledger_hash = [0xbb; 32];
        t.index_hash = t.ledger_hash;
        Self {
            receipt,
            target: t,
            observed: f.observed,
        }
    }
}
pub(super) fn context() -> InspectionContext<'static> {
    InspectionContext {
        registry: b"synthetic context only",
        groups: &[80],
    }
}

// Deliberately bypass the private producer in TESTS ONLY, so receipt/target/context guards
// are independently tested even if a copied nonce appears inside this module.
fn alternate<'s>(
    s: &RoundScope<'s>,
    r: &'s RecordReceipt,
    t: &'s TargetDeclaration,
    c: &'s InspectionContext<'s>,
) -> RoundScope<'s> {
    RoundScope {
        receipt: r,
        target: t,
        context: c,
        round: s.round,
        token: s.token.clone(),
        decode_started: Cell::new(true),
        budget_origin: s.budget_origin.clone(),
        hash: s.hash.clone(),
        index_path: s.index_path.clone(),
    }
}
#[test]
fn same_receipt_token_and_budget_reuse_tree_without_any_new_decode() {
    let s = Setup::new();
    let c = context();
    let stop = AtomicBool::new(false);
    let start = Instant::now();
    let mut b = SharedBudget::new(start, &stop);
    let before = index_decode_count();
    with_round(
        &s.receipt,
        &s.target,
        &c,
        Round::Initial,
        &mut b,
        |scope, b| {
            let d = scope.decode(b)?;
            let spent = b.json_work;
            assert_eq!(d.entries().len(), 4);
            d.recheck(scope, Some(&s.observed), b)?;
            d.recheck(scope, None, b)?;
            assert!(b.json_work > spent);
            assert_eq!(
                format!("{d:?}"),
                "RoundDeclaration(pending_synthetic_reader_not_execution_authority)"
            );
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(index_decode_count(), before + 1);
    assert_eq!(b.started, start);
    assert_eq!(b.used, 0);
    assert_eq!(b.reserved, 0);
    assert_eq!(b.topology_calls, 0);
    assert_eq!(b.metadata_calls, 0);
}

#[test]
fn token_allows_one_decode_attempt_only_and_never_reparses_on_retry() {
    let s = Setup::new();
    let c = context();
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    let before = index_decode_count();
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                d.recheck(scope, None, b)?;
                scope.decode(b).map(|_| ())
            }
        )
        .unwrap_err(),
        Failure::Binding
    );
    assert_eq!(index_decode_count(), before + 1);
    assert_eq!(b.failed, Some(Failure::Binding));
}
#[test]
fn separately_issued_tokens_are_rejected_even_for_same_enum_and_receipt() {
    for next in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let e = with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |first, b| {
                let d = first.decode(b)?;
                with_round(&s.receipt, &s.target, &c, next, b, |second, b| {
                    d.recheck(second, None, b).map(|_| ())
                })
            },
        )
        .unwrap_err();
        assert_eq!(e, Failure::Binding);
        assert_eq!(b.failed, Some(e));
    }
}
#[test]
fn distinct_receipt_with_identical_bytes_binding_and_lineage_is_not_accepted() {
    let s = Setup::new();
    let mut other = Setup::new();
    other.receipt.lineage = s.receipt.lineage.clone();
    let c = context();
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    assert!(other.receipt.binding == s.receipt.binding);
    assert_eq!(other.receipt.pins[2].bytes, s.receipt.pins[2].bytes);
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let different = alternate(scope, &other.receipt, &s.target, &c);
                d.recheck(&different, None, b).map(|_| ())
            }
        )
        .unwrap_err(),
        Failure::Binding
    );
}
#[test]
fn different_target_or_context_is_rejected_even_when_all_values_match() {
    for change in 0..2 {
        let s = Setup::new();
        let t = s.target.clone();
        let c = context();
        let other = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let altered = if change == 0 {
                        alternate(scope, &s.receipt, &t, &c)
                    } else {
                        alternate(scope, &s.receipt, &s.target, &other)
                    };
                    d.recheck(&altered, None, b).map(|_| ())
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
    }
}
#[test]
fn round_enum_and_lineage_guards_are_independent_of_nonce_guard() {
    for changed_round in [false, true] {
        let s = Setup::new();
        let mut other = Setup::new();
        other.receipt.lineage = Rc::new(());
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    let mut altered = alternate(scope, &s.receipt, &s.target, &c);
                    if changed_round {
                        altered.round = Round::BeforeM4;
                    } else {
                        altered.receipt = &other.receipt;
                    }
                    d.recheck(&altered, None, b).map(|_| ())
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
    }
}
#[test]
fn new_budget_cannot_reset_work_or_deadline_under_a_retained_scope() {
    for decode in [false, true] {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let mut fresh = SharedBudget::new(Instant::now(), &stop);
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    if decode {
                        scope.decode(&mut fresh).map(|_| ())
                    } else {
                        let d = scope.decode(b)?;
                        d.recheck(scope, None, &mut fresh).map(|_| ())
                    }
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
        assert_eq!(fresh.failed, Some(Failure::Binding));
        assert_eq!(b.failed, Some(Failure::Binding));
    }
}
#[test]
fn bad_receipt_or_launcher_role_cannot_create_scope_or_decode() {
    for case in 0..3 {
        let mut s = Setup::new();
        match case {
            0 => s.receipt.pins[2].bytes[0] ^= 1,
            1 => s.target.role = crate::signature_policy::Role::Launcher,
            _ => s.receipt.binding.activation_expires_ms = 461000,
        };
        let c = context();
        let stop = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &stop);
        let called = Cell::new(false);
        let before = index_decode_count();
        let out = with_round(&s.receipt, &s.target, &c, Round::Initial, &mut b, |_, _| {
            called.set(true);
            Ok(())
        });
        assert!(out.is_err());
        assert!(!called.get());
        assert_eq!(index_decode_count(), before);
    }
}
#[test]
fn full_set_failure_is_latched_and_does_not_trigger_reparse() {
    let s = Setup::new();
    let c = context();
    let stop = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &stop);
    let before = index_decode_count();
    assert_eq!(
        with_round(
            &s.receipt,
            &s.target,
            &c,
            Round::Initial,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                d.recheck(scope, Some(&[]), b).map(|_| ())
            }
        )
        .unwrap_err(),
        Failure::Changed
    );
    assert_eq!(b.failed, Some(Failure::Changed));
    assert_eq!(index_decode_count(), before + 1);
}
#[test]
fn cancel_deadline_work_limit_and_existing_failure_are_preserved_on_reuse() {
    for case in 0..4 {
        let s = Setup::new();
        let c = context();
        let stop = AtomicBool::new(false);
        let start = Instant::now();
        let tick = Cell::new(start);
        let clock = || tick.get();
        let mut b = SharedBudget::new(start, &stop);
        b.now = &clock;
        let reason = match case {
            0 => Failure::Cancelled,
            1 => Failure::Deadline,
            2 => Failure::Limit,
            _ => Failure::HashMismatch,
        };
        assert_eq!(
            with_round(
                &s.receipt,
                &s.target,
                &c,
                Round::Initial,
                &mut b,
                |scope, b| {
                    let d = scope.decode(b)?;
                    match case {
                        0 => stop.store(true, Ordering::Release),
                        1 => tick.set(start + Duration::from_secs(10)),
                        2 => b.json_work = 1_000_000,
                        _ => b.failed = Some(reason),
                    };
                    d.recheck(scope, None, b).map(|_| ())
                }
            )
            .unwrap_err(),
            reason
        );
        assert_eq!(b.failed, Some(reason));
    }
}
