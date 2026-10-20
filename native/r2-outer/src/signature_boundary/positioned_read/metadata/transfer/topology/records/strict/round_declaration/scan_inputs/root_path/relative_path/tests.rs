use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::strict::round_declaration::{scan_inputs::tests::setup,tests::{Setup,context}};
use phases::PHASE_MODEL_ID;
use std::collections::BTreeSet;

struct Held {
    origin: Rc<()>,
    depth: usize,
}
impl ResourceOrigin for Held {
    fn resource_origin(&self) -> &Rc<()> {
        &self.origin
    }
}
#[derive(Default)]
struct Trace {
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
#[derive(Clone, Copy)]
enum Case {
    File,
    Directory,
    Mutation(usize, u8),
    Fail(usize, SourceError),
    Cancel(usize),
    Deadline(usize),
    Work(u64),
    Binding(u8),
    Cleanup(bool),
}
struct Source<'a> {
    snapshots: Vec<RecordSnapshot>,
    trace: Rc<RefCell<Trace>>,
    case: Case,
    cancel: &'a AtomicBool,
    clock: &'a Cell<Instant>,
}
impl Source<'_> {
    fn event(&self, label: String) -> Result<usize, SourceError> {
        let mut trace = self.trace.borrow_mut();
        let n = trace.calls;
        trace.calls += 1;
        trace.log.push(label);
        match self.case {
            Case::Fail(at, e) if at == n => return Err(e),
            Case::Cancel(at) if at == n => self.cancel.store(true, Ordering::Release),
            Case::Deadline(at) if at == n => self
                .clock
                .set(self.clock.get() + std::time::Duration::from_secs(10)),
            _ => {}
        }
        Ok(n)
    }
    fn make(&self, depth: usize) -> Temp {
        let mut t = self.trace.borrow_mut();
        let id = t.issued;
        t.issued += 1;
        assert!(t.alive.insert(id));
        t.peak = t.peak.max(t.alive.len());
        Temp { id, depth }
    }
    fn raw(&self, depth: usize, n: usize) -> Observation {
        let s = &self.snapshots[depth];
        let mut raw = Observation {
            before: s.stat.clone(),
            after: s.stat.clone(),
            acl: Acl::Absent,
            names: s.names,
            filesystem: FsObservation {
                location: Filesystem::Local,
                apfs: true,
                ownership_ignored: false,
                noexec: false,
            },
        };
        let mutation = match self.case {
            Case::Mutation(at, field) if at == n => Some(field),
            Case::Cleanup(true) if n == 13 => Some(0),
            _ => None,
        };
        if let Some(field) = mutation {
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
                8 => raw.acl = Acl::Unknown,
                9 => raw.names = VisibleNames::Unknown,
                _ => raw.filesystem.location = Filesystem::Unknown,
            }
        }
        raw
    }
}
impl RootPathSource<Held> for Source<'_> {
    type Temporary = Temp;
    fn held(&mut self, r: &Held) -> Result<Observation, SourceError> {
        let n = self.event(format!("held:{}", r.depth))?;
        Ok(self.raw(r.depth, n))
    }
    fn anchor(&mut self) -> Result<Temp, SourceError> {
        self.event("anchor:/".into())?;
        Ok(self.make(0))
    }
    fn child(&mut self, parent: &Temp, name: &str) -> Result<Temp, SourceError> {
        self.event(format!("directory:{name}"))?;
        assert_eq!(name, ["sealed", "runtime", "dist", "review"][parent.depth]);
        Ok(self.make(parent.depth + 1))
    }
    fn temporary(&mut self, t: &Temp) -> Result<Observation, SourceError> {
        let n = self.event(format!("observe:{}", t.depth))?;
        Ok(self.raw(t.depth, n))
    }
    fn release(&mut self, t: Temp) -> Release {
        let mut trace = self.trace.borrow_mut();
        assert!(trace.alive.remove(&t.id));
        assert!(trace.released.insert(t.id));
        if matches!(self.case, Case::Cleanup(_)) && t.id == 4 {
            Release::Unconfirmed
        } else {
            Release::Complete
        }
    }
}
impl RelativeSource<Held> for Source<'_> {
    fn file(&mut self, parent: &Temp, name: &str) -> Result<Temp, SourceError> {
        self.event(format!("file:{name}"))?;
        assert_eq!(parent.depth, 4);
        assert_eq!(name, "r2-launcher-entry.js");
        Ok(self.make(5))
    }
}
fn snapshots(s: &Setup) -> Vec<RecordSnapshot> {
    let mut snapshots = s.receipt.pins[2].ancestors[..=2].to_vec();
    for (i, entry) in s.observed[..3].iter().enumerate() {
        let mut stat = s.receipt.pins[2].ancestors[2].stat.clone();
        stat.inode += 100 + i as u64;
        if let closure::Entry::File { size, .. } = entry {
            stat.kind = FileType::Regular;
            stat.mode = 0o444;
            stat.size = *size;
            stat.links = 1;
        }
        snapshots.push(RecordSnapshot {
            stat,
            names: VisibleNames::Empty,
        });
    }
    snapshots
}
struct Outcome {
    result: Result<(), Failure>,
    trace: Rc<RefCell<Trace>>,
    work: u64,
}
fn exercise(case: Case) -> Outcome {
    let s = setup();
    let c = context();
    let cancel = AtomicBool::new(false);
    let now = Cell::new(Instant::now());
    let clock = || now.get();
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let root = Held {
        origin: Rc::new(()),
        depth: 2,
    };
    let leaf = Held {
        origin: Rc::new(()),
        depth: if matches!(case, Case::Directory) {
            4
        } else {
            5
        },
    };
    let trace = Rc::new(RefCell::new(Trace::default()));
    let all = snapshots(&s);
    let mut spent = 0;
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
            let parent = inputs.directory(
                if matches!(case, Case::Directory) {
                    "dist"
                } else {
                    "dist/review"
                },
                scope,
                b,
            )?;
            let children = parent.expected(scope, b)?;
            let child = &children[0];
            let mut root_bound = RootBinding {
                inputs: &inputs,
                resource: &root,
                origin: root.origin.clone(),
                baseline: inputs.root,
                started: Cell::new(false),
            };
            if matches!(case, Case::Binding(1)) {
                root_bound.origin = Rc::new(());
            }
            let count = if matches!(case, Case::Directory) {
                2
            } else {
                3
            };
            let copied = inputs.declaration.entries()[0].clone();
            let mut edges: Vec<_> = inputs.declaration.entries()[..count]
                .iter()
                .enumerate()
                .map(|(i, entry)| Edge {
                    entry,
                    snapshot: all[i + 3].clone(),
                })
                .collect();
            match case {
                Case::Binding(2) => edges[0].entry = &copied,
                Case::Binding(3) => {
                    edges.remove(0);
                }
                Case::Binding(4) => edges.swap(0, 1),
                Case::Binding(5) => {
                    edges.last_mut().unwrap().entry = &inputs.declaration.entries()[3]
                }
                Case::Binding(6) => edges[0].snapshot.stat.device += 1,
                Case::Binding(12) => edges.last_mut().unwrap().snapshot.stat.size += 1,
                Case::Binding(13) => edges.last_mut().unwrap().snapshot.stat.mode = 0o555,
                Case::Binding(14) => {
                    edges.last_mut().unwrap().snapshot.names = VisibleNames::Unknown
                }
                Case::Binding(15) => {
                    edges.last_mut().unwrap().snapshot.stat.kind = FileType::Directory
                }
                Case::Binding(16) => edges.last_mut().unwrap().snapshot.stat.links = 2,
                Case::Binding(17) => {
                    edges.last_mut().unwrap().snapshot.stat.ctime.nanoseconds = 1_000_000_000
                }
                _ => {}
            }
            let mut bound = RelativeBinding {
                root: &root_bound,
                child,
                resource: &leaf,
                origin: leaf.origin.clone(),
                edges,
                started: Cell::new(false),
            };
            match case {
                Case::Binding(0) => bound.origin = Rc::new(()),
                Case::Binding(7) => bound.started.set(true),
                Case::Binding(8) => {
                    bound.origin = root.origin.clone();
                    bound.resource = &root;
                }
                _ => {}
            }
            assert_eq!(
                format!("{bound:?}"),
                "RelativePathBinding(synthetic_only_not_execution_authority)"
            );
            let source = Source {
                snapshots: all,
                trace: trace.clone(),
                case,
                cancel: &cancel,
                clock: &now,
            };
            if let Case::Work(remaining) = case {
                b.json_work = 1_000_000 - remaining;
            }
            let before = b.json_work;
            let result = match case {
                Case::Binding(9) => {
                    let other = ChildInput {
                        parent: child.parent,
                        entry: child.entry,
                    };
                    recheck(&inputs, &other, &bound, scope, source, b)
                }
                Case::Binding(10) => {
                    with_round(&s.receipt, &s.target, &c, Round::Initial, b, |next, b| {
                        recheck(&inputs, child, &bound, next, source, b)
                    })
                }
                Case::Binding(11) => {
                    let mut other = SharedBudget::new(now.get(), &cancel);
                    recheck(&inputs, child, &bound, scope, source, &mut other)
                }
                _ => recheck(&inputs, child, &bound, scope, source, b),
            };
            spent = b.json_work - before;
            result
        },
    );
    assert_eq!(
        (
            b.used,
            b.reserved,
            b.topology_calls,
            b.metadata_calls,
            b.retries_left
        ),
        (0, 0, 0, 0, 8)
    );
    assert!(b.json_work <= 1_000_000);
    let t = trace.borrow();
    assert!(t.alive.is_empty());
    assert_eq!(t.released.len(), t.issued);
    assert!(t.peak <= 2);
    drop(t);
    Outcome {
        result,
        trace,
        work: spent,
    }
}

#[test]
fn directory_and_file_rewalk_every_absolute_and_relative_edge() {
    let file = exercise(Case::File);
    file.result.unwrap();
    assert_eq!(file.work, 112);
    assert_eq!(file.trace.borrow().calls, 16);
    assert_eq!(file.trace.borrow().issued, 6);
    assert_eq!(
        file.trace.borrow().log,
        [
            "held:2",
            "held:5",
            "anchor:/",
            "observe:0",
            "directory:sealed",
            "observe:1",
            "directory:runtime",
            "observe:2",
            "directory:dist",
            "observe:3",
            "directory:review",
            "observe:4",
            "file:r2-launcher-entry.js",
            "observe:5",
            "held:5",
            "held:2"
        ]
    );
    let dir = exercise(Case::Directory);
    dir.result.unwrap();
    assert_eq!(dir.work, 96);
    assert_eq!(dir.trace.borrow().calls, 14);
    assert!(
        !dir.trace
            .borrow()
            .log
            .iter()
            .any(|s| s.starts_with("file:"))
    );
}
#[test]
fn replacements_and_unknowns_at_every_observation_stop_without_baseline_refresh() {
    for at in [0, 1, 3, 5, 7, 9, 11, 13, 14, 15] {
        for field in 0..11 {
            let out = exercise(Case::Mutation(at, field));
            assert_eq!(
                out.result.unwrap_err(),
                if field >= 8 {
                    Failure::MetadataUnavailable
                } else {
                    Failure::Changed
                }
            );
            assert_eq!(out.trace.borrow().calls, at + 1);
        }
    }
}
#[test]
fn every_source_failure_and_interruption_stops_without_retry() {
    for error in [
        SourceError::Unavailable,
        SourceError::Interrupted,
        SourceError::WouldBlock,
    ] {
        for at in 0..16 {
            let out = exercise(Case::Fail(at, error));
            assert_eq!(
                out.result.unwrap_err(),
                if [2, 4, 6, 8, 10, 12].contains(&at) {
                    Failure::Unavailable
                } else {
                    Failure::MetadataUnavailable
                }
            );
            assert_eq!(out.trace.borrow().calls, at + 1);
        }
    }
}
#[test]
fn late_successes_cancel_or_expire_and_release_every_owned_handle() {
    for at in 0..16 {
        for (case, expected) in [
            (Case::Cancel(at), Failure::Cancelled),
            (Case::Deadline(at), Failure::Deadline),
        ] {
            let out = exercise(case);
            assert_eq!(out.result.unwrap_err(), expected);
            assert_eq!(out.trace.borrow().calls, at + 1);
        }
    }
}
#[test]
fn shared_work_cap_all_prefixes_stop_and_release() {
    for remaining in 0..=112 {
        let out = exercise(Case::Work(remaining));
        if remaining == 112 {
            out.result.unwrap();
        } else {
            assert_eq!(out.result.unwrap_err(), Failure::Limit);
        }
    }
}
#[test]
fn origin_canonical_chain_parent_round_and_budget_mixing_stop_before_io() {
    for case in 0..=17 {
        let out = exercise(Case::Binding(case));
        assert_eq!(out.result.unwrap_err(), Failure::Binding);
        assert_eq!(out.trace.borrow().calls, 0);
    }
}
#[test]
fn incomplete_cleanup_never_succeeds_or_overwrites_first_failure() {
    for changed in [false, true] {
        let out = exercise(Case::Cleanup(changed));
        assert_eq!(
            out.result.unwrap_err(),
            if changed {
                Failure::Changed
            } else {
                Failure::Unavailable
            }
        );
        assert_eq!(out.trace.borrow().calls, 14);
    }
}
