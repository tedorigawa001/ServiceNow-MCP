use super::*;
use super::super::tests::setup;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::strict::round_declaration::tests::{Setup,context};
use phases::PHASE_MODEL_ID;
use std::collections::BTreeSet;

struct Held {
    origin: Rc<()>,
    drops: Rc<Cell<u32>>,
}
impl Held {
    fn new() -> Self {
        Self {
            origin: Rc::new(()),
            drops: Rc::new(Cell::new(0)),
        }
    }
}
impl ResourceOrigin for Held {
    fn resource_origin(&self) -> &Rc<()> {
        &self.origin
    }
}
impl Drop for Held {
    fn drop(&mut self) {
        self.drops.set(self.drops.get() + 1);
    }
}
#[derive(Default)]
struct Stats {
    calls: usize,
    issued: usize,
    alive: BTreeSet<usize>,
    released: BTreeSet<usize>,
    peak: usize,
    log: Vec<String>,
}
struct Temp {
    id: usize,
    depth: usize,
}
struct Source<'a> {
    baseline: Vec<RecordSnapshot>,
    stats: Rc<RefCell<Stats>>,
    fail: Option<usize>,
    failure_kind: SourceError,
    mutation: Option<(usize, u8)>,
    cancel: Option<(usize, &'a AtomicBool)>,
    clock: Option<(usize, &'a Cell<Instant>)>,
    release_unknown: bool,
}
impl<'a> Source<'a> {
    fn new(s: &Setup) -> Self {
        Self {
            baseline: s.receipt.pins[2].ancestors[..=2].to_vec(),
            stats: Rc::new(RefCell::new(Stats::default())),
            fail: None,
            failure_kind: SourceError::Unavailable,
            mutation: None,
            cancel: None,
            clock: None,
            release_unknown: false,
        }
    }
    fn event(&self, label: String) -> Result<usize, SourceError> {
        let mut state = self.stats.borrow_mut();
        let n = state.calls;
        state.calls += 1;
        state.log.push(label);
        if let Some((at, cancel)) = self.cancel
            && at == n
        {
            cancel.store(true, Ordering::Release);
        }
        if let Some((at, clock)) = self.clock
            && at == n
        {
            clock.set(clock.get() + std::time::Duration::from_secs(10));
        }
        if self.fail == Some(n) {
            return Err(self.failure_kind);
        }
        Ok(n)
    }
    fn temp(&self, depth: usize) -> Temp {
        let mut state = self.stats.borrow_mut();
        let id = state.issued;
        state.issued += 1;
        assert!(state.alive.insert(id));
        state.peak = state.peak.max(state.alive.len());
        Temp { id, depth }
    }
    fn observation(&self, depth: usize, n: usize) -> Observation {
        let baseline = &self.baseline[depth];
        let mut raw = Observation {
            before: baseline.stat.clone(),
            after: baseline.stat.clone(),
            acl: Acl::Absent,
            filesystem: FsObservation {
                location: Filesystem::Local,
                apfs: true,
                ownership_ignored: false,
                noexec: false,
            },
            names: baseline.names,
        };
        if let Some((at, field)) = self.mutation
            && at == n
        {
            match field {
                0 => {
                    raw.before.inode += 1;
                    raw.after.inode += 1;
                }
                1 => raw.after.size += 1,
                2 => {
                    raw.before.device += 1;
                    raw.after.device += 1;
                }
                3 => raw.names = VisibleNames::Provenance,
                4 => raw.acl = Acl::Present,
                5 => raw.filesystem.apfs = false,
                6 => raw.filesystem.ownership_ignored = true,
                7 => raw.filesystem.noexec = true,
                8 => raw.names = VisibleNames::Unknown,
                9 => raw.acl = Acl::Unknown,
                10 => raw.filesystem.location = Filesystem::Unknown,
                11 => {
                    raw.before.mode = 0o777;
                    raw.after.mode = 0o777;
                }
                _ => {
                    raw.before.mtime.nanoseconds = 1_000_000_000;
                    raw.after.mtime = raw.before.mtime;
                }
            }
        }
        raw
    }
}
impl RootPathSource<Held> for Source<'_> {
    type Temporary = Temp;
    fn held(&mut self, _: &Held) -> Result<Observation, SourceError> {
        let n = self.event("held".into())?;
        Ok(self.observation(2, n))
    }
    fn anchor(&mut self) -> Result<Temp, SourceError> {
        self.event("anchor:/".into())?;
        Ok(self.temp(0))
    }
    fn child(&mut self, parent: &Temp, name: &str) -> Result<Temp, SourceError> {
        self.event(format!("child:{}:{name}", parent.depth))?;
        assert_eq!(name, ["sealed", "runtime"][parent.depth]);
        Ok(self.temp(parent.depth + 1))
    }
    fn temporary(&mut self, temp: &Temp) -> Result<Observation, SourceError> {
        let n = self.event(format!("observe:{}", temp.depth))?;
        Ok(self.observation(temp.depth, n))
    }
    fn release(&mut self, temp: Temp) -> Release {
        let mut state = self.stats.borrow_mut();
        assert!(state.alive.remove(&temp.id));
        assert!(state.released.insert(temp.id));
        if self.release_unknown {
            Release::Unconfirmed
        } else {
            Release::Complete
        }
    }
}
fn bound<'p, 'i, 'd, 's, 'r>(
    inputs: &'p ScanInputs<'i, 'd, 's, 'r>,
    held: &'p Held,
) -> RootBinding<'p, 'i, 'd, 's, 'r, Held> {
    RootBinding {
        inputs,
        resource: held,
        origin: held.origin.clone(),
        baseline: inputs.root,
        started: Cell::new(false),
    }
}
fn released(stats: &RefCell<Stats>) {
    let state = stats.borrow();
    assert!(state.alive.is_empty());
    assert_eq!(state.issued, state.released.len());
    assert!(state.peak <= 2);
}

#[test]
fn retained_root_and_fresh_anchor_all_edges_match_receipt_and_release_once() {
    let s = setup();
    let c = context();
    let cancel = AtomicBool::new(false);
    let held = Held::new();
    let drops = held.drops.clone();
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
            let bound = bound(&inputs, &held);
            let source = Source::new(&s);
            let stats = source.stats.clone();
            let before = b.json_work;
            recheck(&inputs, &bound, scope, source, b)?;
            assert_eq!(b.json_work - before, 42);
            released(&stats);
            assert_eq!(stats.borrow().calls, 8);
            assert_eq!(stats.borrow().peak, 2);
            assert_eq!(
                stats.borrow().log,
                [
                    "held",
                    "anchor:/",
                    "observe:0",
                    "child:0:sealed",
                    "observe:1",
                    "child:1:runtime",
                    "observe:2",
                    "held"
                ]
            );
            assert_eq!(
                format!("{bound:?}"),
                "ScanRootBinding(synthetic_only_not_execution_authority)"
            );
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(
        (b.used, b.reserved, b.topology_calls, b.metadata_calls),
        (0, 0, 0, 0)
    );
    assert_eq!(drops.get(), 0);
    drop(held);
    assert_eq!(drops.get(), 1);
}

#[test]
fn renamed_replaced_or_changed_root_and_each_ancestor_stop_without_refresh() {
    for at in [0, 2, 4, 6, 7] {
        for field in 0..13 {
            let s = setup();
            let c = context();
            let cancel = AtomicBool::new(false);
            let held = Held::new();
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let mut source = Source::new(&s);
            source.mutation = Some((at, field));
            let stats = source.stats.clone();
            let expected = if (8..=10).contains(&field) {
                Failure::MetadataUnavailable
            } else {
                Failure::Changed
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
                        let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                        let inputs = p.bind_inputs(scope, b)?;
                        recheck(&inputs, &bound(&inputs, &held), scope, source, b)
                    }
                )
                .unwrap_err(),
                expected
            );
            assert_eq!(stats.borrow().calls, at + 1);
            released(&stats);
            assert_eq!(b.failed, Some(expected));
        }
    }
}

#[test]
fn failures_at_every_attempt_never_retry_or_skip_edges() {
    for failure_kind in [
        SourceError::Unavailable,
        SourceError::Interrupted,
        SourceError::WouldBlock,
    ] {
        for at in 0..8 {
            let s = setup();
            let c = context();
            let cancel = AtomicBool::new(false);
            let held = Held::new();
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let mut source = Source::new(&s);
            source.fail = Some(at);
            source.failure_kind = failure_kind;
            let stats = source.stats.clone();
            let expected = if [1, 3, 5].contains(&at) {
                Failure::Unavailable
            } else {
                Failure::MetadataUnavailable
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
                        let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                        let inputs = p.bind_inputs(scope, b)?;
                        recheck(&inputs, &bound(&inputs, &held), scope, source, b)
                    }
                )
                .unwrap_err(),
                expected
            );
            assert_eq!(stats.borrow().calls, at + 1);
            released(&stats);
            assert_eq!(b.retries_left, 8);
        }
    }
}

#[test]
fn cancellation_and_deadline_at_every_late_success_release_owned_temporaries() {
    for deadline in [false, true] {
        for at in 0..8 {
            let s = setup();
            let c = context();
            let cancel = AtomicBool::new(false);
            let held = Held::new();
            let now = Cell::new(Instant::now());
            let clock = || now.get();
            let mut b = SharedBudget::new(now.get(), &cancel);
            b.now = &clock;
            let mut source = Source::new(&s);
            if deadline {
                source.clock = Some((at, &now));
            } else {
                source.cancel = Some((at, &cancel));
            }
            let stats = source.stats.clone();
            let expected = if deadline {
                Failure::Deadline
            } else {
                Failure::Cancelled
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
                        let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                        let inputs = p.bind_inputs(scope, b)?;
                        recheck(&inputs, &bound(&inputs, &held), scope, source, b)
                    }
                )
                .unwrap_err(),
                expected
            );
            assert_eq!(stats.borrow().calls, at + 1);
            released(&stats);
            assert_eq!(b.failed, Some(expected));
        }
    }
}

#[test]
fn every_work_prefix_preserves_shared_cap_and_cleanup() {
    for remaining in 0..=42 {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let held = Held::new();
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let source = Source::new(&s);
        let stats = source.stats.clone();
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
                b.json_work = 1_000_000 - remaining; // test-only injection, never a new/refunded budget
                recheck(&inputs, &bound(&inputs, &held), scope, source, b)
            },
        );
        if remaining == 42 {
            result.unwrap();
        } else {
            assert_eq!(result.unwrap_err(), Failure::Limit);
        }
        assert!(b.json_work <= 1_000_000);
        released(&stats);
    }
}

#[test]
fn wrong_origin_copied_baseline_other_round_or_second_use_stop_before_source() {
    for case in 0..4 {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let held = Held::new();
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let source = Source::new(&s);
        let stats = source.stats.clone();
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
                    let mut bound = bound(&inputs, &held);
                    let copy = inputs.root.clone();
                    match case {
                        0 => bound.origin = Rc::new(()),
                        1 => bound.baseline = &copy,
                        2 => bound.started.set(true),
                        _ => {}
                    }
                    if case == 3 {
                        return with_round(
                            &s.receipt,
                            &s.target,
                            &c,
                            Round::Initial,
                            b,
                            |next, b| recheck(&inputs, &bound, next, source, b),
                        );
                    }
                    recheck(&inputs, &bound, scope, source, b)
                }
            )
            .unwrap_err(),
            Failure::Binding
        );
        assert_eq!(stats.borrow().calls, 0);
        released(&stats);
    }
}

#[test]
fn cleanup_unknown_never_becomes_success_and_original_error_is_not_overwritten() {
    for changed in [false, true] {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let held = Held::new();
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let mut source = Source::new(&s);
        source.release_unknown = true;
        if changed {
            source.mutation = Some((4, 0));
        }
        let stats = source.stats.clone();
        let expected = if changed {
            Failure::Changed
        } else {
            Failure::Unavailable
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
                    let p = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
                    let inputs = p.bind_inputs(scope, b)?;
                    recheck(&inputs, &bound(&inputs, &held), scope, source, b)
                }
            )
            .unwrap_err(),
            expected
        );
        released(&stats);
        assert_eq!(b.failed, Some(expected));
        assert_eq!(stats.borrow().calls, 5);
    }
}

#[test]
fn copied_input_view_and_different_budget_are_not_root_authority() {
    for other_budget in [false, true] {
        let s = setup();
        let c = context();
        let cancel = AtomicBool::new(false);
        let held = Held::new();
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let source = Source::new(&s);
        let stats = source.stats.clone();
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
                let bound = bound(&inputs, &held);
                if other_budget {
                    let mut other = SharedBudget::new(Instant::now(), &cancel);
                    assert_eq!(
                        recheck(&inputs, &bound, scope, source, &mut other).unwrap_err(),
                        Failure::Binding
                    );
                } else {
                    let copy = ScanInputs {
                        profile_started: std::cell::Cell::new(false),
                        scan_started: std::cell::Cell::new(super::super::use_state::State::Fresh),
                        declaration: inputs.declaration,
                        phases: inputs.phases,
                        root: inputs.root,
                        index: inputs.index.clone(),
                    };
                    assert_eq!(
                        recheck(&copy, &bound, scope, source, b).unwrap_err(),
                        Failure::Binding
                    );
                }
                assert_eq!(stats.borrow().calls, 0);
                released(&stats);
                Ok(())
            },
        );
        if other_budget {
            result.unwrap();
        } else {
            assert_eq!(result.unwrap_err(), Failure::Binding);
        }
    }
}
