use super::super::super::tests::Setup;
use super::super::super::tests::context;
use sha2::{Digest, Sha256};
use std::{cell::Cell, collections::BTreeMap, time::Duration};

fn ready<T>(
    s: &Setup,
    round: Round,
    b: &mut SharedBudget<'_>,
    f: impl for<'p, 'i, 'd, 's, 'r> FnOnce(
        &'p ScanInputs<'i, 'd, 's, 'r>,
        &'p RoundScope<'s>,
        &mut SharedBudget<'_>,
    ) -> Result<T, Failure>,
) -> Result<T, Failure> {
    let c = context();
    with_round(&s.receipt, &s.target, &c, round, b, |scope, b| {
        let d = scope.decode(b)?;
        let phases = d.prepare_scan(scope, phases::PHASE_MODEL_ID, b)?;
        let inputs = phases.bind_inputs(scope, b)?;
        f(&inputs, scope, b)
    })
}
fn augmented(width: usize, depth: usize, index: &str, size: u64) -> Setup {
    let mut s = setup();
    let mut value: serde_json::Value = serde_json::from_slice(&s.receipt.pins[2].bytes).unwrap();
    let entries = value["entries"].as_array_mut().unwrap();
    for i in 0..width {
        entries.push(serde_json::json!({"kind":"file","path":format!("f{i:05}"),"mode":"0444","size":size,"sha256":"c".repeat(64)}));
    }
    let mut prefix = String::new();
    for _ in 0..depth {
        if !prefix.is_empty() {
            prefix.push('/');
        }
        prefix.push('x');
        entries.push(serde_json::json!({"kind":"directory","path":prefix,"mode":"0555"}));
    }
    if depth > 0 {
        entries.push(serde_json::json!({"kind":"file","path":format!("{prefix}/empty"),"mode":"0444","size":0,"sha256":"c".repeat(64)}));
    }
    entries.push(serde_json::json!({"kind":"directory","path":"z-empty","mode":"0555"}));
    entries.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    let pin = &mut s.receipt.pins[2];
    pin.bytes = serde_json::to_vec(&value).unwrap();
    pin.leaf.stat.size = pin.bytes.len() as u64;
    s.receipt.binding.index_hash = Sha256::digest(&pin.bytes).into();
    s.receipt.binding.index_path = format!("{}/{index}", s.receipt.binding.runtime_root);
    for _ in index.split('/').skip(1) {
        pin.ancestors.push(pin.ancestors.last().unwrap().clone());
    }
    s
}
fn check_oracle(profile: &ScanShapeProfile<'_, '_, '_, '_, '_>, spent: u64) {
    let x = &profile.shape;
    let entries: Vec<_> = profile
        .inputs
        .declaration
        .entries()
        .iter()
        .chain(std::iter::once(&profile.inputs.index))
        .collect();
    let mut counts = BTreeMap::<&str, u64>::new();
    let (mut k, mut d, mut f, mut l, mut c) = (0, 0, 0, 0, 0);
    for e in &entries {
        *counts
            .entry(e.path().rsplit_once('/').map_or("", |(p, _)| p))
            .or_default() += 1;
        k += e.path().split('/').count() as u64;
        match e {
            closure::Entry::File { size, .. } => {
                f += 1;
                l += size;
                c += size.div_ceil(65536);
            }
            closure::Entry::Directory { .. } => d += 1,
        }
    }
    let e = entries.len() as u64;
    let p = k - e;
    let c0 = counts.get("").copied().unwrap_or(0);
    let virtual_parent = profile
        .inputs
        .index
        .path()
        .rsplit_once('/')
        .map_or("", |(p, _)| p);
    let ell = |n: u64| u64::from(64 - n.leading_zeros());
    assert_eq!(
        (x.e, x.n, x.f, x.d, x.t, x.k, x.p),
        (e, e - 1, f, d, d + 1, k, p)
    );
    assert_eq!(
        (x.c0, x.cv, x.cmax, x.j),
        (
            c0,
            counts[virtual_parent],
            *counts.values().max().unwrap(),
            counts.values().map(|v| v * ell(*v)).sum()
        )
    );
    assert_eq!(
        (x.l, x.c, x.bv, x.cv_chunks),
        (
            l,
            c,
            profile.scope.receipt.pins[2].bytes.len() as u64,
            (profile.scope.receipt.pins[2].bytes.len() as u64).div_ceil(65536)
        )
    );
    let fixed = 11 + 2 * x.n + 5 * e + k + (e - c0) + d;
    assert!(spent >= fixed + (e - c0));
    assert!(spent <= fixed + (e - c0) * ell(x.n));
}
use super::super::tests::setup;
use super::*;

#[test]
fn sealed_profile_counts_the_accepted_entries_and_virtual_index_at_exact_cost() {
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
            let phases = d.prepare_scan(scope, phases::PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let old = b.json_work;
            let profile = build(&inputs, scope, MODEL_ID, b)?;
            assert_eq!(b.json_work - old, 61);
            let x = &profile.shape;
            assert_eq!(
                (x.n, x.e, x.d, x.f, x.t, x.h, x.k, x.p, x.kv),
                (4, 5, 2, 3, 3, 2, 8, 3, 1)
            );
            assert_eq!((x.c0, x.cv, x.cmax, x.j), (3, 3, 3, 8));
            assert_eq!(x.l, 4097 + s.receipt.pins[2].bytes.len() as u64);
            assert_eq!((x.c, x.cv_chunks, x.r), (3, 1, 8));
            assert_eq!(
                format!("{profile:?}"),
                "ScanShapeProfile(round_budget_only_not_admission_authority)"
            );
            Ok(())
        },
    )
    .unwrap();
}

#[test]
fn count_only_pass_agrees_with_separate_oracle_for_shapes_and_all_rounds() {
    for (width, depth, index, size) in [
        (0, 0, "index.json", 0),
        (1, 0, "-index", 0),
        (7, 8, "zz-index", 65537),
        (128, 0, "index.json", 1),
        (0, 63, "index.json", 0),
        (2, 0, "dist/index.json", 65536),
        (1, 0, "index.json", 512 * 1024 * 1024),
    ] {
        let s = augmented(width, depth, index, size);
        for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
            let cancel = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            ready(&s, round, &mut b, |inputs, scope, b| {
                let old = b.json_work;
                let resources = (b.used, b.reserved, b.retries_left, b.started);
                let profile = build(inputs, scope, MODEL_ID, b)?;
                check_oracle(&profile, b.json_work - old);
                let old = b.json_work;
                profile.require(inputs, scope, MODEL_ID, b)?;
                assert_eq!(b.json_work - old, 5);
                assert_eq!((b.used, b.reserved, b.retries_left, b.started), resources);
                Ok(())
            })
            .unwrap();
        }
    }
}

#[test]
fn one_shot_is_not_reset_after_success_unknown_model_or_collection_failure() {
    for failure in [false, true] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            if failure {
                assert_eq!(
                    build(inputs, scope, "unknown", b).unwrap_err(),
                    Failure::Unavailable
                );
            } else {
                build(inputs, scope, MODEL_ID, b)?;
            }
            assert!(inputs.profile_started.get());
            // Simulate an illicit fresh budget with the same private origin; the claim still wins.
            let other_cancel = AtomicBool::new(false);
            let mut other = SharedBudget::new(b.started, &other_cancel);
            other.inspection_origin = b.inspection_origin.clone();
            assert_eq!(
                build(inputs, scope, MODEL_ID, &mut other).unwrap_err(),
                Failure::Binding
            );
            if failure {
                assert_eq!(b.checkpoint(), Err(Failure::Unavailable));
            }
            Ok(())
        })
        .map_or_else(
            |e| assert!(failure && e == Failure::Unavailable),
            |_| assert!(!failure),
        );
    }
    let s = augmented(1, 0, "index.json", 512 * 1024 * 1024 + 1);
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            let error = build(inputs, scope, MODEL_ID, b).unwrap_err();
            assert_eq!(error, Failure::Limit);
            assert!(inputs.profile_started.get());
            assert_eq!(build(inputs, scope, MODEL_ID, b).unwrap_err(), error);
            Err::<(), _>(error)
        }),
        Err(Failure::Limit)
    );
}

#[test]
fn profile_rejects_foreign_budget_start_retry_model_and_scope() {
    for case in 0..11 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = match case {
            2 | 3 => Failure::Changed,
            4 => Failure::Unavailable,
            _ => Failure::Binding,
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                let other = setup();
                let other_context = context();
                let copied_scope = RoundScope {
                    receipt: if case == 8 {
                        &other.receipt
                    } else {
                        scope.receipt
                    },
                    target: if case == 9 {
                        &other.target
                    } else {
                        scope.target
                    },
                    context: if case == 10 {
                        &other_context
                    } else {
                        scope.context
                    },
                    round: if case == 6 {
                        Round::AfterM4
                    } else {
                        scope.round
                    },
                    token: if case == 7 {
                        Rc::new(())
                    } else {
                        scope.token.clone()
                    },
                    decode_started: Cell::new(true),
                    budget_origin: scope.budget_origin.clone(),
                    hash: scope.hash.clone(),
                    index_path: scope.index_path.clone(),
                };
                match case {
                    0 => b.inspection_origin = Rc::new(()),
                    1 => b.started += Duration::from_nanos(1),
                    2 => b.retries_left -= 1,
                    3 => b.retries_left += 1,
                    _ => {}
                }
                let current = if case >= 5 { &copied_scope } else { scope };
                let model = if case == 4 { "unknown" } else { MODEL_ID };
                assert_eq!(profile.require(inputs, current, model, b), Err(expected));
                assert_eq!(b.checkpoint(), Err(expected));
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn every_collection_and_guard_work_prefix_stops_without_publication() {
    for available in 0..=61 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let result = ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            b.json_work = 1_000_000 - available;
            let result = build(inputs, scope, MODEL_ID, b);
            assert!(inputs.profile_started.get());
            if available < 61 {
                assert_eq!(result.unwrap_err(), Failure::Limit);
                assert_eq!(b.json_work, 1_000_000);
                Err(Failure::Limit)
            } else {
                result.map(|_| ())
            }
        });
        assert_eq!(
            result,
            if available < 61 {
                Err(Failure::Limit)
            } else {
                Ok(())
            }
        );
    }
    for available in 0..5 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                b.json_work = 1_000_000 - available;
                profile.require(inputs, scope, MODEL_ID, b)
            }),
            Err(Failure::Limit)
        );
    }
}

#[test]
fn cancellation_and_deadline_at_every_committed_work_stop_and_keep_the_claim() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for deadline in [false, true] {
        for at in 1..=61 {
            let s = setup();
            let audit = Audit::default();
            let cancel = Rc::new(AtomicBool::new(false));
            let active = Cell::new(false);
            let start = Instant::now();
            let clock = || {
                if deadline && active.get() && audit.counts().iter().sum::<u64>() >= at {
                    start + Duration::from_secs(10)
                } else {
                    start
                }
            };
            let mut b = SharedBudget::new(start, &cancel);
            b.now = &clock;
            let expected = if deadline {
                Failure::Deadline
            } else {
                Failure::Cancelled
            };
            assert_eq!(
                ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                    b.work_audit = Some(audit.clone());
                    if !deadline {
                        audit.cancel_after_work(at, cancel.clone());
                    }
                    active.set(true);
                    assert_eq!(build(inputs, scope, MODEL_ID, b).unwrap_err(), expected);
                    assert!(inputs.profile_started.get());
                    assert_eq!(audit.counts().iter().sum::<u64>(), at);
                    assert_eq!(build(inputs, scope, MODEL_ID, b).unwrap_err(), expected);
                    Err::<(), _>(expected)
                }),
                Err(expected)
            );
        }
    }
}

#[test]
fn copied_inputs_and_rebuilt_inputs_cannot_reuse_the_profile() {
    for rebind in [false, true] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let profile = build(inputs, scope, MODEL_ID, b)?;
                if rebind {
                    assert_eq!(
                        inputs.phases.bind_inputs(scope, b).unwrap_err(),
                        Failure::Binding
                    );
                } else {
                    let copy = ScanInputs {
                        declaration: inputs.declaration,
                        phases: inputs.phases,
                        root: inputs.root,
                        index: inputs.index.clone(),
                        profile_started: Cell::new(false),
                    };
                    assert_eq!(
                        profile.require(&copy, scope, MODEL_ID, b),
                        Err(Failure::Binding)
                    );
                }
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn preexisting_failure_consumes_one_shot_without_work_or_other_resource_changes() {
    for error in [
        Failure::Cancelled,
        Failure::Deadline,
        Failure::Limit,
        Failure::Binding,
    ] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                let before = (b.json_work, b.used, b.reserved, b.retries_left, b.started);
                b.failed = Some(error);
                assert_eq!(build(inputs, scope, MODEL_ID, b).unwrap_err(), error);
                assert!(inputs.profile_started.get());
                assert_eq!(
                    (b.json_work, b.used, b.reserved, b.retries_left, b.started),
                    before
                );
                Err::<(), _>(error)
            }),
            Err(error)
        );
    }
}

#[test]
fn sealed_type_has_no_clone_copy_or_serde_construction() {
    // These compile-time inference guards become ambiguous if a forbidden trait is added.
    trait Ambiguous<A> {
        fn check() {}
    }
    impl<T: ?Sized> Ambiguous<()> for T {}
    struct CloneMarker;
    impl<T: Clone> Ambiguous<CloneMarker> for T {}
    struct CopyMarker;
    impl<T: Copy> Ambiguous<CopyMarker> for T {}
    struct SerializeMarker;
    impl<T: ?Sized + serde::Serialize> Ambiguous<SerializeMarker> for T {}
    struct DeserializeMarker;
    impl<T: for<'de> serde::Deserialize<'de>> Ambiguous<DeserializeMarker> for T {}
    let _ = <ScanShapeProfile<'_, '_, '_, '_, '_> as Ambiguous<_>>::check;
}
