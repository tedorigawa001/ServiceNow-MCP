use super::*;
use crate::signature_boundary::positioned_read::work_audit::{Audit, Owner};

// Independent test oracle: derive shape from fixture records, not collector groups/routes.
struct Bound {
    owners: [u64; 7],
    tail: u64,
}
fn ell(n: u64) -> u128 {
    u128::from(64 - n.leading_zeros())
}
fn bound(f: &Setup, retries: u64) -> Bound {
    let entries = &f.observed;
    let e = entries.len() as u64;
    let d = entries
        .iter()
        .filter(|x| matches!(x, closure::Entry::Directory { .. }))
        .count() as u64;
    let files = e - d;
    let t = d + 1;
    let h = f
        .receipt
        .binding
        .runtime_root
        .split('/')
        .filter(|s| !s.is_empty())
        .count() as u64;
    let k = entries
        .iter()
        .map(|x| x.path().split('/').count() as u64)
        .sum::<u64>();
    let p = k - e;
    let index = entries.last().unwrap();
    let kv = index.path().split('/').count() as u64;
    let cv = match index {
        closure::Entry::File { size, .. } => size.div_ceil(65536),
        _ => unreachable!(),
    };
    let chunks = entries
        .iter()
        .map(|x| match x {
            closure::Entry::File { size, .. } => size.div_ceil(65536),
            _ => 0,
        })
        .sum::<u64>();
    let mut children = BTreeMap::<&str, u64>::new();
    for entry in entries {
        *children
            .entry(entry.path().rsplit_once('/').map_or("", |(p, _)| p))
            .or_default() += 1;
    }
    let parent = index.path().rsplit_once('/').map_or("", |(p, _)| p);
    let cv_children = children[parent];
    let c0 = u128::from(children.get("").copied().unwrap_or(0));
    let max = *children.values().max().unwrap();
    let j = children
        .values()
        .map(|c| u128::from(*c) * ell(*c))
        .sum::<u128>();
    let (e, d, files, t, h, k, p, kv, cv, chunks, ci) = (
        u128::from(e),
        u128::from(d),
        u128::from(files),
        u128::from(t),
        u128::from(h),
        u128::from(k),
        u128::from(p),
        u128::from(kv),
        u128::from(cv),
        u128::from(chunks),
        u128::from(cv_children),
    );
    let w = 2 * e + 3;
    let a = w * (h + 1) + 2 * k;
    // +21 explicitly owns final held-root record<=20 and compare=1 (draft-0.1 omitted it).
    let owners = [
        37 + 4 * e + d,
        8 + 4 * e + 4 * t + p.min(e - c0) * ell(entries.len() as u64 - 1) + ell(cv_children) + ci,
        h + 2 + e * (h + 3) + k + kv + p * ell(entries.len() as u64 - 1),
        w + 23 * a,
        32 * e + 58 * t + j,
        56 * files + 5 * chunks,
        11 + 2 * cv + 4 * e + p,
    ];
    Bound {
        owners: owners.map(|x| u64::try_from(x).unwrap()),
        tail: u64::try_from(16 + ell(max) + 3 * u128::from(retries + 1)).unwrap(),
    }
}

#[test]
fn each_owner_respects_the_documented_candidate_bound() {
    let (f, _) = fixture(Case::Good);
    let limit = bound(&f, 0);
    assert_eq!(limit.owners.iter().sum::<u64>() + limit.tail, 2017);
    let audit = Audit::default();
    run_with_audit(Case::Good, Round::Initial, Some(audit.clone()))
        .0
        .unwrap();
    for (owner, (actual, cap)) in audit.counts().iter().zip(limit.owners).enumerate() {
        assert!(*actual <= cap, "owner {owner}: actual={actual} bound={cap}");
    }
}

fn checked(case: Case, round: Round, retries: u64) -> (Result<(), Failure>, u64, u64) {
    let (f, _) = fixture(case);
    let cap = bound(&f, retries);
    let audit = Audit::default();
    let (result, state, spent, _) = run_with_audit(case, round, Some(audit.clone()));
    let kernel = audit.completion().expect("collector returned");
    if !matches!(case, Case::Work(_)) {
        assert_eq!(result, kernel);
    }
    let actual = audit.counts();
    assert_eq!(actual.iter().sum::<u64>(), spent);
    assert_eq!(actual[Owner::Unassigned as usize], 0);
    for (i, limit) in cap.owners.iter().enumerate() {
        let tail = if i == Owner::File as usize || i == Owner::Enumeration as usize {
            cap.tail
        } else {
            0
        };
        assert!(
            actual[i] <= limit + tail,
            "owner={i} actual={} bound={limit} tail={tail}",
            actual[i]
        );
    }
    let total = cap.owners.iter().sum::<u64>() + cap.tail;
    assert!(spent <= total, "{spent}>{total}");
    let calls = state.borrow().calls;
    (kernel, spent, calls)
}

#[test]
fn independent_shape_bounds_cover_successful_wide_deep_empty_and_virtual_orders() {
    for case in [
        Case::Good,
        Case::Empty,
        Case::Chunks,
        Case::NestedIndex,
        Case::IndexFirst,
        Case::IndexLast,
        Case::Shape { width: 0, depth: 1 },
        Case::Shape {
            width: 16,
            depth: 8,
        },
        Case::Shape {
            width: 128,
            depth: 0,
        },
        Case::Shape {
            width: 0,
            depth: 63,
        },
    ] {
        for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
            let (result, spent, calls) = checked(case, round, 0);
            result.unwrap();
            eprintln!("shape owners: round={round:?} work={spent} calls={calls}");
        }
    }
}

#[test]
fn refusal_retry_exhaustion_and_all_operation_failures_stay_under_the_bound() {
    for case in [
        Case::Surplus,
        Case::Duplicate,
        Case::Missing,
        Case::CursorSwap,
        Case::PathSwap,
        Case::AncestorSwap,
        Case::IndexPin,
        Case::Corrupt,
        Case::Short,
        Case::EofExtra,
        Case::EintrForever,
        Case::FsUnknown,
        Case::Noexec,
        Case::CleanupUnknown,
        Case::NoQuotas,
        Case::NamesZero,
        Case::DuplicateDot,
        Case::InvalidUtf8,
        Case::WrongMetaVariant,
        Case::AclPresent,
        Case::NamesChanged,
        Case::NamesOversize,
    ] {
        assert!(checked(case, Round::Initial, 8).0.is_err());
    }
    for op in 0..6 {
        assert_eq!(
            checked(Case::Quota(op), Round::Initial, 8).0,
            Err(Failure::Limit)
        );
    }
    let (_, state, _, _) = run(Case::Good, Round::Initial);
    for (index, (op, _)) in state.borrow().trace.iter().enumerate() {
        if *op != Op::Cleanup {
            assert!(
                checked(Case::Failure(index as u64 + 1), Round::Initial, 8)
                    .0
                    .is_err()
            );
        } else {
            assert_eq!(
                checked(Case::CleanupAt(index as u64 + 1), Round::Initial, 8).0,
                Err(Failure::Unavailable)
            );
        }
    }
    assert_eq!(
        checked(Case::CancelCleanup(10), Round::Initial, 8).0,
        Err(Failure::Cancelled)
    );
    for eof in [false, true] {
        for count in [0, 1, 8, 9] {
            let result = checked(Case::Interrupts { count, eof }, Round::Initial, 8).0;
            if count <= 8 {
                result.unwrap();
            } else {
                assert_eq!(result, Err(Failure::ReadFailed));
            }
        }
    }
}

#[test]
fn every_source_cancellation_deadline_and_work_prefix_preserves_attribution() {
    let (_, state, spent, _) = run(Case::Good, Round::Initial);
    let calls = state.borrow().calls;
    for at in 1..=calls {
        assert_eq!(
            checked(Case::Cancel(at), Round::Initial, 8).0,
            Err(Failure::Cancelled),
            "source attempt {at}"
        );
        assert_eq!(
            checked(Case::Deadline(at), Round::Initial, 8).0,
            Err(Failure::Deadline)
        );
    }
    for left in 0..spent {
        assert_eq!(
            checked(Case::Work(left), Round::Initial, 8).0,
            Err(Failure::Limit)
        );
    }
    checked(Case::Work(spent), Round::Initial, 0).0.unwrap();
    for at in [
        1, 4, 8, 32, 49, 100, 500, 1000, 1500, 1865, 1866, 1867, 1901, 1902,
    ] {
        assert_eq!(
            checked(Case::WorkCancelAt(at), Round::Initial, 8).0,
            Err(Failure::Cancelled)
        );
        assert_eq!(
            checked(Case::WorkDeadlineAt(at), Round::Initial, 8).0,
            Err(Failure::Deadline)
        );
    }
}

#[test]
fn three_rounds_charge_seals_separately_and_share_only_one_retry_allowance() {
    let (f, state) = fixture(Case::Interrupts {
        count: 8,
        eof: true,
    });
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let audit = Audit::default();
    let cap = bound(&f, 0);
    let mut total = 0;
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let before = b.json_work;
            b.work_audit = Some(audit.clone());
            let outcome = kernel_for_test(
                &inputs,
                scope,
                Fake(state.clone()),
                Some(Quotas {
                    attempts: [1_000_000; 5],
                    live: 8,
                    name_bytes: 100000,
                }),
                b,
            );
            b.work_audit = None;
            total += b.json_work - before;
            assert_eq!(outcome.summary.live, 0);
            assert_eq!(outcome.summary.unconfirmed, 0);
            let observed = outcome.result?;
            drop(inputs);
            // Outside the audited collector: neither caller phase is suppressed or charged to S.
            let owners = audit.counts();
            let old = b.json_work;
            phases.after_scan(&observed, b)?;
            phases.finish(b)?;
            assert!(b.json_work > old);
            assert_eq!(owners, audit.counts());
            Ok(())
        })
        .unwrap();
        assert_eq!(b.retries_left, 0);
    }
    assert_eq!(audit.counts().iter().sum::<u64>(), total);
    assert_eq!(audit.counts()[Owner::Seal as usize], 3 * 36);
    assert_eq!(total, 3 * 1902 + 3 * 8);
    let base = cap.owners.iter().sum::<u64>() + cap.tail - 3;
    assert!(total <= 3 * base + 3 * 8 + 3);
    assert!(state.borrow().alive.is_empty());
}

#[test]
fn complete_collector_work_is_attributed_once_without_changing_charges() {
    let audit = Audit::default();
    let (result, _, spent, _) = run_with_audit(Case::Good, Round::Initial, Some(audit.clone()));
    result.unwrap();
    let counts = audit.counts();
    assert_eq!(counts, [52, 49, 46, 1223, 322, 174, 36, 0]);
    assert_eq!(counts.iter().sum::<u64>(), spent);
    assert_eq!(counts[Owner::Unassigned as usize], 0);
    assert_eq!(spent, 1902);
    eprintln!("collector owners={counts:?} total={spent}");
}
