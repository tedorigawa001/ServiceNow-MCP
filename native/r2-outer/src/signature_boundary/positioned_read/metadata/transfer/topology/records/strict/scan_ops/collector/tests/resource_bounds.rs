use super::super::super::resource_model::{self, Shape};
use super::*;

fn quantities(case: Case, r: u8) -> resource_model::Quantities {
    let (f, _) = fixture(case);
    // Independent declaration oracle: no runtime groups/routes/old scan_work calculator.
    let mut s = Shape {
        entries: f.observed.len() as u64,
        files: 0,
        directories: 0,
        root_depth: f
            .receipt
            .binding
            .runtime_root
            .split('/')
            .filter(|v| !v.is_empty())
            .count() as u64,
        edges: 0,
        chunks: 0,
        bytes: 0,
    };
    for e in &f.observed {
        s.edges += e.path().split('/').count() as u64;
        match e {
            closure::Entry::Directory { .. } => s.directories += 1,
            closure::Entry::File { size, .. } => {
                s.files += 1;
                s.bytes += size;
                s.chunks += size.div_ceil(65536);
            }
        }
    }
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.retries_left = r;
    resource_model::calculate(&s, resource_model::MODEL_ID, &mut b).unwrap()
}
fn counts(state: &State) -> [u64; 5] {
    let mut v = [0; 5];
    for (op, _) in &state.trace {
        v[*op as usize] += 1;
    }
    v
}
#[test]
fn actual_current_collector_matches_base_for_ten_shapes_and_three_rounds() {
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
        let bound = quantities(case, 0);
        for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
            // Match the existing wide/deep work audit harness; the default 10k fixture
            // quota intentionally cannot finish these shapes. No product cap is changed.
            let (result, state, _, _) = run_with_audit(
                case,
                round,
                Some(crate::signature_boundary::positioned_read::work_audit::Audit::default()),
            );
            assert!(
                result.is_ok(),
                "round={round:?} result={result:?} counts={:?} bound={:?}",
                counts(&state.borrow()),
                bound.base
            );
            let s = state.borrow();
            assert_eq!(counts(&s), bound.base);
            assert!(s.peak as u64 <= bound.peak_owners);
            assert!(s.alive.is_empty());
            assert_eq!(s.next, s.released.len() as u64);
        }
    }
}

#[test]
fn rejected_prefixes_retries_and_all_source_failure_points_respect_bounds() {
    for case in [
        Case::Surplus,
        Case::Duplicate,
        Case::Missing,
        Case::Corrupt,
        Case::Short,
        Case::EofExtra,
        Case::EintrForever,
        Case::CleanupUnknown,
        Case::FsUnknown,
        Case::CursorSwap,
        Case::PathSwap,
        Case::AncestorSwap,
        Case::InvalidUtf8,
        Case::NamesChanged,
        Case::NamesOversize,
        Case::DuplicateDot,
    ] {
        check(case);
    }
    for at in 1..=876 {
        for case in [
            Case::Failure(at),
            Case::CleanupAt(at),
            Case::Cancel(at),
            Case::Deadline(at),
        ] {
            check(case);
        }
    }
    for r in [0, 1, 8, 9] {
        for eof in [false, true] {
            check(Case::Interrupts { count: r, eof });
        }
    }
}
fn check(case: Case) {
    let cap = quantities(case, 8);
    let (_, state, _, _) = run(case, Round::Initial);
    let s = state.borrow();
    let actual = counts(&s);
    for (v, limit) in actual.into_iter().zip(cap.round) {
        assert!(v <= limit, "{actual:?}>{:?}", cap.round);
    }
    assert!(actual.iter().sum::<u64>() <= cap.round_total);
    assert!(s.peak as u64 <= cap.peak_owners);
    assert!(s.alive.is_empty());
    assert_eq!(s.next, s.released.len() as u64);
}

#[test]
fn three_actual_rounds_fit_the_single_shared_retry_envelope() {
    let case = Case::Eintr;
    let cap = quantities(case, 8);
    let (f, state) = fixture(case);
    let context = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let start = now.get();
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &clock;
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        round_declaration::with_round(
            &f.receipt,
            &f.target,
            &context,
            round,
            &mut b,
            |scope, b| {
                let d = scope.decode(b)?;
                let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                let inputs = phases.bind_inputs(scope, b)?;
                let out = kernel_for_test(
                    &inputs,
                    scope,
                    Fake(state.clone()),
                    Some(Quotas {
                        attempts: [10000; 5],
                        live: 8,
                        name_bytes: 100000,
                    }),
                    b,
                );
                let observed = out.result?;
                assert_eq!(out.summary.unconfirmed, 0);
                drop(inputs);
                phases.after_scan(&observed, b)?;
                phases.finish(b)
            },
        )
        .unwrap();
        assert_eq!(b.started, start);
        assert_eq!(b.retries_left, 7);
    }
    let s = state.borrow();
    let actual = counts(&s);
    for (v, limit) in actual.into_iter().zip(cap.three) {
        assert!(v <= limit);
    }
    assert_eq!(actual[2], 3 * cap.base[2] + 1);
    assert_eq!(
        actual.iter().sum::<u64>(),
        3 * cap.base.iter().sum::<u64>() + 1
    );
    assert!(actual.iter().sum::<u64>() <= cap.three_total);
    assert!(s.peak as u64 <= cap.peak_owners);
    assert!(s.alive.is_empty());
}
