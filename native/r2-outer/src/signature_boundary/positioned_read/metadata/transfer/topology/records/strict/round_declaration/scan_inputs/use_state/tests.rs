use super::super::profile::{self, calculator};
use super::super::tests::setup;
use super::*;

fn ready<T>(
    s: &super::super::super::tests::Setup,
    round: Round,
    b: &mut SharedBudget<'_>,
    f: impl for<'p, 'i, 'd, 's, 'r> FnOnce(
        &'p ScanInputs<'i, 'd, 's, 'r>,
        &'p RoundScope<'s>,
        &mut SharedBudget<'_>,
    ) -> Result<T, Failure>,
) -> Result<T, Failure> {
    let c = super::super::super::tests::context();
    with_round(&s.receipt, &s.target, &c, round, b, |scope, b| {
        let d = scope.decode(b)?;
        let p = d.prepare_scan(scope, phases::PHASE_MODEL_ID, b)?;
        let inputs = p.bind_inputs(scope, b)?;
        f(&inputs, scope, b)
    })
}

fn prepare(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let p = profile::build(inputs, scope, profile::MODEL_ID, b)?;
    calculator::calculate(p, inputs, scope, calculator::CALCULATOR_ID, b)?
        .consume_for_collector(inputs, scope, b)
}

#[test]
fn ready_consumes_once_in_one_work_and_cannot_be_reentered() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert_eq!(
        ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            prepare(inputs, scope, b)?;
            let old = b.json_work;
            inputs.enter_collector(scope, b)?;
            assert_eq!(b.json_work - old, 1);
            assert_eq!(inputs.scan_started.get(), State::Entered);
            assert_eq!(inputs.enter_collector(scope, b), Err(Failure::Binding));
            assert_eq!(inputs.scan_started.get(), State::Entered);
            Err::<(), _>(Failure::Binding)
        }),
        Err(Failure::Binding)
    );
}

#[test]
fn fresh_attempted_and_entered_never_count_as_bridge_ready() {
    for prior in [State::Fresh, State::Attempted, State::Entered] {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                inputs.scan_started.set(prior); // test-only state injection
                let old = b.json_work;
                assert_eq!(inputs.enter_collector(scope, b), Err(Failure::Binding));
                assert_eq!(b.json_work - old, 1);
                assert_eq!(inputs.scan_started.get(), State::Entered);
                Err::<(), _>(Failure::Binding)
            }),
            Err(Failure::Binding)
        );
    }
}

#[test]
fn copied_claim_cannot_be_imported_into_a_different_inputs_object() {
    let s = setup();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
        prepare(inputs, scope, b)?;
        let original = inputs.scan_started.get();
        let copy = ScanInputs {
            declaration: inputs.declaration,
            phases: inputs.phases,
            root: inputs.root,
            index: inputs.index.clone(),
            profile_started: std::cell::Cell::new(true),
            scan_started: std::cell::Cell::new(original),
        };
        assert_eq!(copy.enter_collector(scope, b), Err(Failure::Binding));
        assert_eq!(copy.scan_started.get(), State::Entered);
        assert_eq!(inputs.scan_started.get(), original);
        // Deliberately clear only the synthetic test stop to prove the original claim survived.
        // No operational reset API exists.
        b.failed = None;
        inputs.enter_collector(scope, b)?;
        assert_eq!(inputs.scan_started.get(), State::Entered);
        Ok(())
    })
    .unwrap();
}

#[test]
fn entry_rejects_changed_owner_models_budget_start_retry_or_scope_and_spends_claim() {
    for case in 0..8 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = match case {
            0 | 1 => Failure::Unavailable,
            4 | 5 => Failure::Changed,
            _ => Failure::Binding,
        };
        assert_eq!(
            ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
                prepare(inputs, scope, b)?;
                let mut saved = inputs.scan_started.get();
                if let State::BridgeReady {
                    owner,
                    started,
                    retries,
                    kernel_model,
                    entry_model,
                } = &mut saved
                {
                    match case {
                        0 => *kernel_model = "bp5-r2-scan-work-0.1",
                        1 => *entry_model = "unknown",
                        2 => *owner = std::ptr::null(),
                        3 => *started += std::time::Duration::from_nanos(1),
                        4 => *retries -= 1,
                        5 => *retries += 1,
                        _ => {}
                    }
                } else {
                    panic!("not ready");
                }
                inputs.scan_started.set(saved);
                if case == 6 {
                    b.inspection_origin = Rc::new(());
                }
                let copied = RoundScope {
                    receipt: scope.receipt,
                    target: scope.target,
                    context: scope.context,
                    round: scope.round,
                    token: scope.token.clone(),
                    decode_started: std::cell::Cell::new(true),
                    budget_origin: scope.budget_origin.clone(),
                    hash: scope.hash.clone(),
                    index_path: scope.index_path.clone(),
                };
                let old = b.json_work;
                assert_eq!(
                    inputs.enter_collector(if case == 7 { &copied } else { scope }, b),
                    Err(expected)
                );
                assert_eq!(b.json_work - old, 1);
                assert_eq!(inputs.scan_started.get(), State::Entered);
                assert_eq!(b.checkpoint(), Err(expected));
                Err::<(), _>(expected)
            }),
            Err(expected)
        );
    }
}

#[test]
fn entry_work_prefix_and_existing_stops_consume_without_reset() {
    for case in 0..6 {
        let s = setup();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let expected = match case {
            0 => Some(Failure::Limit),
            1 => None,
            2 => Some(Failure::Unavailable),
            3 => Some(Failure::Cancelled),
            4 => Some(Failure::Deadline),
            _ => Some(Failure::Binding),
        };
        let result = ready(&s, Round::Initial, &mut b, |inputs, scope, b| {
            prepare(inputs, scope, b)?;
            match case {
                0 => b.json_work = 1_000_000,
                1 => b.json_work = 999_999,
                _ => b.failed = expected,
            }
            let old = b.json_work;
            let result = inputs.enter_collector(scope, b);
            assert_eq!(result, expected.map_or(Ok(()), Err));
            assert_eq!(b.json_work - old, u64::from(case == 1));
            assert_eq!(inputs.scan_started.get(), State::Entered);
            result
        });
        assert_eq!(result, expected.map_or(Ok(()), Err));
    }
}

#[test]
fn entry_cancel_deadline_and_terminal_guards_never_restore_ready() {
    use crate::signature_boundary::positioned_read::work_audit::Audit;
    for terminal in [false, true] {
        for deadline in [false, true] {
            let s = setup();
            let audit = Audit::default();
            let cancel = Rc::new(AtomicBool::new(false));
            let active = std::cell::Cell::new(false);
            let seen = std::cell::Cell::new(0u8);
            let start = Instant::now();
            let clock = || {
                if active.get() && audit.counts().iter().sum::<u64>() == 1 {
                    seen.set(seen.get() + 1);
                    if deadline && seen.get() == if terminal { 2 } else { 1 } {
                        return start + std::time::Duration::from_secs(10);
                    }
                    if !deadline && terminal && seen.get() == 1 {
                        cancel.store(true, std::sync::atomic::Ordering::Release);
                    }
                }
                start
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
                    prepare(inputs, scope, b)?;
                    b.work_audit = Some(audit.clone());
                    if !deadline && !terminal {
                        audit.cancel_after_work(1, cancel.clone());
                    }
                    active.set(true);
                    assert_eq!(inputs.enter_collector(scope, b), Err(expected));
                    assert_eq!(audit.counts().iter().sum::<u64>(), 1);
                    assert_eq!(inputs.scan_started.get(), State::Entered);
                    Err::<(), _>(expected)
                }),
                Err(expected)
            );
        }
    }
}
