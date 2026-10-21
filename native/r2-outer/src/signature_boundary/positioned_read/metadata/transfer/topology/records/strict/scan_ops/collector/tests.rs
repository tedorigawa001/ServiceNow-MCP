use super::*;
use crate::signature_boundary::positioned_read::metadata::transfer::topology::records::strict::{
    Round,
    round_declaration::{
        self,
        phases::PHASE_MODEL_ID,
        tests::{Setup, context},
    },
};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

#[derive(Clone, Copy)]
enum Case {
    Good,
    Empty,
    Chunks,
    NestedIndex,
    IndexPin,
    Surplus,
    Duplicate,
    Missing,
    Corrupt,
    Short,
    EofExtra,
    Eintr,
    EintrForever,
    CursorSwap,
    PathSwap,
    AncestorSwap,
    FsUnknown,
    Noexec,
    CleanupUnknown,
    Cancel(u64),
    Deadline(u64),
    Failure(u64),
    Work(u64),
    NoQuotas,
    Quota(usize),
    NamesZero,
    Provenance,
    WrongScope,
    Shape { width: u16, depth: u8 },
    IndexFirst,
    IndexLast,
    Interrupts { count: u8, eof: bool },
    WorkCancelAt(u64),
    WorkDeadlineAt(u64),
    DuplicateDot,
    InvalidUtf8,
    WrongMetaVariant,
    AclPresent,
    NamesChanged,
    NamesOversize,
    CleanupAt(u64),
    CancelCleanup(u64),
}
struct Raw {
    id: u64,
    path: String,
    kind: Kind,
    swap: bool,
}
struct State {
    stats: BTreeMap<String, Stat>,
    data: BTreeMap<String, Vec<u8>>,
    positions: BTreeMap<u64, usize>,
    alive: BTreeSet<u64>,
    released: BTreeSet<u64>,
    next: u64,
    calls: u64,
    trace: Vec<(Op, String)>,
    reads: Vec<(String, u64, usize)>,
    opens: BTreeMap<String, u64>,
    case: Case,
    interrupted: bool,
    interruptions: u8,
    cancelled: Rc<AtomicBool>,
    now: Rc<Cell<Instant>>,
    start: Instant,
    peak: usize,
}
struct Fake(Rc<RefCell<State>>);
impl Fake {
    fn event(&self, op: Op, path: &str) -> Result<(), OpFailure> {
        let mut s = self.0.borrow_mut();
        s.calls += 1;
        s.trace.push((op, path.into()));
        match s.case {
            Case::Cancel(at) if s.calls == at => s.cancelled.store(true, Ordering::Release),
            Case::CancelCleanup(at) if s.calls == at => s.cancelled.store(true, Ordering::Release),
            Case::Deadline(at) if s.calls == at => s.now.set(s.start + Duration::from_secs(10)),
            Case::Failure(at) if s.calls == at => return Err(OpFailure::Unavailable),
            _ => {}
        }
        Ok(())
    }
    fn raw(&self, path: String, kind: Kind) -> Raw {
        let mut s = self.0.borrow_mut();
        s.next += 1;
        let id = s.next;
        assert!(s.alive.insert(id));
        s.peak = s.peak.max(s.alive.len());
        let count = if matches!(kind, Kind::Anchor | Kind::Directory | Kind::File) {
            let n = s.opens.entry(path.clone()).or_default();
            *n += 1;
            *n
        } else {
            *s.opens.get(&path).unwrap_or(&0)
        };
        let swap = (matches!(s.case, Case::PathSwap)
            && path.ends_with("r2-launcher-entry.js")
            && kind == Kind::File
            && count >= 3)
            || (matches!(s.case, Case::AncestorSwap) && path == "/sealed" && count >= 2);
        Raw {
            id,
            path,
            kind,
            swap,
        }
    }
    fn stat(&self, r: &Raw) -> Stat {
        let s = self.0.borrow();
        let mut stat = s.stats[&r.path].clone();
        if r.swap || (matches!(s.case, Case::CursorSwap) && r.kind == Kind::Cursor) {
            stat.inode += 1;
        }
        stat
    }
}
impl ScanOps for Fake {
    type Handle = Raw;
    fn open(
        &mut self,
        parent: Option<&Raw>,
        name: Option<&str>,
        kind: Kind,
    ) -> Result<Raw, OpFailure> {
        let path = match kind {
            Kind::Anchor => {
                assert!(parent.is_none() && name.is_none());
                "/".into()
            }
            Kind::Cursor => parent.unwrap().path.clone(),
            _ => format!(
                "{}/{}",
                parent.unwrap().path.trim_end_matches('/'),
                name.unwrap()
            ),
        };
        self.event(Op::Open, &path)?;
        if !self.0.borrow().stats.contains_key(&path) {
            return Err(OpFailure::Unavailable);
        }
        Ok(self.raw(path, kind))
    }
    fn acl_init(&mut self, r: &Raw) -> Result<Raw, OpFailure> {
        self.event(Op::Metadata, &r.path)?;
        let mut raw = self.raw(r.path.clone(), Kind::Acl);
        raw.swap =
            r.swap || (matches!(self.0.borrow().case, Case::CursorSwap) && r.kind == Kind::Cursor);
        Ok(raw)
    }
    fn enumerate(&mut self, r: &Raw, out: &mut [u8; 255]) -> Result<EnumValue, OpFailure> {
        self.event(Op::Enum, &r.path)?;
        let mut s = self.0.borrow_mut();
        if matches!(s.case, Case::InvalidUtf8) {
            out[0] = 255;
            return Ok(EnumValue::Name(1));
        }
        let mut names = vec![".".to_string(), "..".to_string()];
        for path in s.stats.keys() {
            if path != "/"
                && path
                    .rsplit_once('/')
                    .map(|(p, _)| if p.is_empty() { "/" } else { p })
                    == Some(r.path.as_str())
            {
                names.push(path.rsplit('/').next().unwrap().into());
            }
        }
        if r.path == "/sealed/runtime" {
            match s.case {
                Case::Surplus => names.insert(2, "evil".into()),
                Case::Duplicate => names.push("node".into()),
                Case::Missing => names.retain(|v| v != "node"),
                Case::DuplicateDot => names.insert(2, ".".into()),
                _ => {}
            }
        }
        let at = *s.positions.entry(r.id).or_default();
        *s.positions.get_mut(&r.id).unwrap() += 1;
        match names.get(at) {
            None => Ok(EnumValue::End),
            Some(name) => {
                out[..name.len()].copy_from_slice(name.as_bytes());
                Ok(EnumValue::Name(name.len()))
            }
        }
    }
    fn read(&mut self, r: &Raw, offset: u64, out: &mut [u8]) -> Result<usize, OpFailure> {
        self.event(Op::Read, &r.path)?;
        let mut s = self.0.borrow_mut();
        s.reads.push((r.path.clone(), offset, out.len()));
        if let Case::Interrupts { count, eof } = s.case {
            let is_eof = offset == s.data[&r.path].len() as u64;
            if is_eof == eof && s.interruptions < count {
                s.interruptions += 1;
                return Err(OpFailure::Interrupted);
            }
        }
        if matches!(s.case, Case::EintrForever) || (matches!(s.case, Case::Eintr) && !s.interrupted)
        {
            s.interrupted = true;
            return Err(OpFailure::Interrupted);
        }
        let bytes = &s.data[&r.path];
        let offset = offset as usize;
        let mut n = bytes.len().saturating_sub(offset).min(out.len());
        if matches!(s.case, Case::Short) && n > 0 {
            n -= 1;
        }
        if n > 0 {
            out[..n].copy_from_slice(&bytes[offset..offset + n]);
            if matches!(s.case, Case::Corrupt) {
                out[0] ^= 1;
            }
        }
        if n == 0 && matches!(s.case, Case::EofExtra) {
            out[0] = 1;
            n = 1;
        }
        Ok(n)
    }
    fn metadata(&mut self, r: &Raw, op: MetaOp, out: &mut [u8]) -> Result<MetaValue, OpFailure> {
        self.event(Op::Metadata, &r.path)?;
        Ok(match op {
            MetaOp::Stat | MetaOp::AclStat => MetaValue::Stat(self.stat(r)),
            MetaOp::AclQuery => {
                MetaValue::Acl(i32::from(matches!(self.0.borrow().case, Case::AclPresent)))
            }
            MetaOp::NamesSize => {
                MetaValue::Size(if matches!(self.0.borrow().case, Case::NamesOversize) {
                    65537
                } else if matches!(self.0.borrow().case, Case::Provenance) {
                    21
                } else {
                    0
                })
            }
            MetaOp::NamesRead => {
                assert!(!out.is_empty());
                if matches!(self.0.borrow().case, Case::Provenance) {
                    out[..21].copy_from_slice(b"com.apple.provenance\0");
                    return Ok(MetaValue::Bytes(21));
                }
                MetaValue::Bytes(usize::from(matches!(
                    self.0.borrow().case,
                    Case::NamesChanged
                )))
            }
            MetaOp::Filesystem => {
                let s = self.0.borrow();
                if matches!(s.case, Case::WrongMetaVariant) {
                    return Ok(MetaValue::Stat(s.stats[&r.path].clone()));
                }
                MetaValue::Filesystem(FsObservation {
                    location: if matches!(s.case, Case::FsUnknown) {
                        Filesystem::Unknown
                    } else {
                        Filesystem::Local
                    },
                    apfs: true,
                    ownership_ignored: false,
                    noexec: matches!(s.case, Case::Noexec),
                })
            }
        })
    }
    fn cleanup(&mut self, r: Raw) -> Cleanup {
        let _ = self.event(Op::Cleanup, &r.path);
        let mut s = self.0.borrow_mut();
        assert!(s.alive.remove(&r.id));
        assert!(s.released.insert(r.id));
        if matches!(s.case, Case::CleanupUnknown | Case::CancelCleanup(_))
            || matches!(s.case,Case::CleanupAt(at) if s.calls==at)
        {
            Cleanup::Unconfirmed
        } else {
            Cleanup::Released
        }
    }
}
fn fixture(case: Case) -> (Setup, Rc<RefCell<State>>) {
    let mut f = Setup::new();
    if matches!(case, Case::Provenance) {
        for pin in &mut f.receipt.pins {
            pin.leaf.names = VisibleNames::Provenance;
            for ancestor in &mut pin.ancestors {
                ancestor.names = VisibleNames::Provenance;
            }
        }
    }
    f.receipt.pins[2].ancestors[2].stat.mode = 0o555;
    let js = if matches!(case, Case::Chunks) {
        vec![9; 65537]
    } else if matches!(case, Case::Empty) {
        Vec::new()
    } else {
        b"abc".to_vec()
    };
    let node = vec![7u8; 4096];
    let mut value: serde_json::Value = serde_json::from_slice(&f.receipt.pins[2].bytes).unwrap();
    value["entries"][2]["size"] = serde_json::json!(js.len());
    value["entries"][2]["sha256"] = serde_json::json!(format!("{:x}", Sha256::digest(&js)));
    let hash: [u8; 32] = Sha256::digest(&node).into();
    value["entries"][3]["sha256"] = serde_json::json!(hex(&hash));
    if let Case::Shape { width, depth } = case {
        let entries = value["entries"].as_array_mut().unwrap();
        for i in 0..width {
            entries.push(serde_json::json!({"kind":"file","path":format!("f{i:04}"),"mode":"0444","size":0,"sha256":format!("{:x}",Sha256::digest([]))}));
        }
        let mut path = String::new();
        for _ in 0..depth {
            if !path.is_empty() {
                path.push('/');
            }
            path.push('x');
            entries.push(serde_json::json!({"kind":"directory","path":path,"mode":"0555"}));
        }
        if depth > 0 {
            entries.push(serde_json::json!({"kind":"file","path":format!("{path}/empty"),"mode":"0444","size":0,"sha256":format!("{:x}",Sha256::digest([]))}));
        }
        entries.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    }
    f.target.index_hash = hash;
    f.target.ledger_hash = hash;
    f.receipt.pins[2].bytes = serde_json::to_vec(&value).unwrap();
    f.receipt.pins[2].leaf.stat.size = f.receipt.pins[2].bytes.len() as u64;
    f.receipt.binding.index_hash = Sha256::digest(&f.receipt.pins[2].bytes).into();
    let entries: Vec<closure::Entry> = serde_json::from_value(value["entries"].clone()).unwrap();
    f.observed = entries.clone();
    let index_path = match case {
        Case::NestedIndex => "dist/index.json",
        Case::IndexFirst => "-index.json",
        Case::IndexLast => "zz-index.json",
        _ => "index.json",
    };
    f.receipt.binding.index_path = format!("/sealed/runtime/{index_path}");
    f.observed.push(closure::Entry::File {
        path: index_path.into(),
        mode: "0444".into(),
        size: f.receipt.pins[2].bytes.len() as u64,
        sha256: hex(&f.receipt.binding.index_hash),
    });
    let mut stats = BTreeMap::new();
    for (i, path) in ["/", "/sealed", "/sealed/runtime"].iter().enumerate() {
        stats.insert(
            path.to_string(),
            f.receipt.pins[2].ancestors[i].stat.clone(),
        );
    }
    for (i, e) in entries.iter().enumerate() {
        let mut st = stats["/sealed/runtime"].clone();
        st.inode += 100 + i as u64;
        if let closure::Entry::File { size, mode, .. } = e {
            st.kind = FileType::Regular;
            st.mode = if mode == "0555" { 0o555 } else { 0o444 };
            st.size = *size;
            st.links = 1;
        }
        stats.insert(format!("/sealed/runtime/{}", e.path()), st);
    }
    if matches!(case, Case::NestedIndex) {
        f.receipt.pins[2].ancestors.push(RecordSnapshot {
            stat: stats["/sealed/runtime/dist"].clone(),
            names: VisibleNames::Empty,
        });
    }
    let mut index_stat = f.receipt.pins[2].leaf.stat.clone();
    if matches!(case, Case::IndexPin) {
        index_stat.inode += 1;
    }
    stats.insert(format!("/sealed/runtime/{index_path}"), index_stat);
    let mut data = BTreeMap::from([
        (
            "/sealed/runtime/dist/review/r2-launcher-entry.js".into(),
            js,
        ),
        ("/sealed/runtime/node".into(), node),
        (
            format!("/sealed/runtime/{index_path}"),
            f.receipt.pins[2].bytes.clone(),
        ),
    ]);
    for entry in &entries {
        if matches!(entry, closure::Entry::File { .. }) {
            data.entry(format!("/sealed/runtime/{}", entry.path()))
                .or_default();
        }
    }
    let start = Instant::now();
    let state = State {
        stats,
        data,
        positions: BTreeMap::new(),
        alive: BTreeSet::new(),
        released: BTreeSet::new(),
        next: 0,
        calls: 0,
        trace: Vec::new(),
        reads: Vec::new(),
        opens: BTreeMap::new(),
        case,
        interrupted: false,
        interruptions: 0,
        cancelled: Rc::new(AtomicBool::new(false)),
        now: Rc::new(Cell::new(start)),
        start,
        peak: 0,
    };
    (f, Rc::new(RefCell::new(state)))
}
fn run(case: Case, round: Round) -> (Result<(), Failure>, Rc<RefCell<State>>, u64, u64) {
    run_with_audit(case, round, None)
}
fn run_with_audit(
    case: Case,
    round: Round,
    audit: Option<crate::signature_boundary::positioned_read::work_audit::Audit>,
) -> (Result<(), Failure>, Rc<RefCell<State>>, u64, u64) {
    let (f, state) = fixture(case);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let active = Cell::new(false);
    let clock = || {
        if active.get() {
            let spent = audit.as_ref().map_or(0, |a| a.counts().iter().sum::<u64>());
            match case {
                Case::WorkDeadlineAt(at) if spent >= at => {
                    return now.get() + Duration::from_secs(10);
                }
                _ => {}
            }
        }
        now.get()
    };
    let mut b = SharedBudget::new(now.get(), &cancel);
    b.now = &clock;
    let mut spent = 0;
    let result =
        round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let mut quotas = Quotas {
                attempts: [if audit.is_some() { 1_000_000 } else { 10000 }; 5],
                live: 8,
                name_bytes: 100000,
            };
            if let Case::Quota(op) = case {
                if op < 5 {
                    quotas.attempts[op] = 0;
                } else {
                    quotas.live = 0;
                }
            }
            if matches!(case, Case::NamesZero) {
                quotas.name_bytes = 0;
            }
            if let Case::Work(left) = case {
                b.json_work = 1_000_000 - left;
            }
            let before = b.json_work;
            if let (Some(a), Case::WorkCancelAt(at)) = (&audit, case) {
                a.cancel_after_work(at, cancel.clone());
            }
            b.work_audit = audit.clone();
            active.set(true);
            let outcome = if matches!(case, Case::WrongScope) {
                round_declaration::with_round(&f.receipt, &f.target, &c, round, b, |wrong, b| {
                    Ok(kernel_for_test(
                        &inputs,
                        wrong,
                        Fake(state.clone()),
                        Some(quotas),
                        b,
                    ))
                })?
            } else {
                kernel_for_test(
                    &inputs,
                    scope,
                    Fake(state.clone()),
                    if matches!(case, Case::NoQuotas) {
                        None
                    } else {
                        Some(quotas)
                    },
                    b,
                )
            };
            spent = b.json_work - before;
            if let Some(a) = &audit {
                a.finish(outcome.result.as_ref().map(|_| ()).map_err(|e| *e));
            }
            b.work_audit = None;
            active.set(false);
            assert_eq!(outcome.summary.live, 0);
            assert_eq!(outcome.summary.pending_cleanup, 0);
            let observed = outcome.result?;
            assert_eq!(observed.entries, f.observed);
            assert!(!outcome.summary.retry_pending);
            assert_eq!(outcome.summary.declared_pending, 0);
            assert_eq!(outcome.summary.unconfirmed, 0);
            drop(inputs);
            phases.after_scan(&observed, b)?;
            phases.finish(b)?;
            Ok(())
        });
    let s = state.borrow();
    assert!(s.alive.is_empty());
    assert_eq!(s.next, s.released.len() as u64);
    assert!(s.peak <= 8);
    drop(s);
    (result, state, spent, b.used)
}

mod entry;
mod resource_bounds;
mod session_bridge;
mod work_accounting;
#[test]
fn all_entries_are_read_and_observed_then_accepted_by_after_scan_in_each_round() {
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        let (r, s, work, bytes) = run(Case::Good, round);
        r.unwrap();
        assert!(work > 0);
        eprintln!(
            "synthetic collector: round={round:?} work={work} payload={bytes} source_calls={} peak={}",
            s.borrow().calls,
            s.borrow().peak
        );
        assert_eq!(
            bytes,
            s.borrow()
                .data
                .values()
                .map(|v| v.len() as u64)
                .sum::<u64>()
        );
        for path in s.borrow().data.keys() {
            assert!(
                s.borrow()
                    .trace
                    .iter()
                    .any(|(op, p)| *op == Op::Read && p == path)
            );
        }
    }
    run(Case::Empty, Round::Initial).0.unwrap();
    run(Case::Eintr, Round::Initial).0.unwrap();
    run(Case::NestedIndex, Round::Initial).0.unwrap();
}
#[test]
fn no_result_on_surplus_duplicate_missing_cursor_or_path_replacement() {
    for case in [
        Case::Surplus,
        Case::Duplicate,
        Case::Missing,
        Case::CursorSwap,
        Case::PathSwap,
        Case::AncestorSwap,
        Case::IndexPin,
    ] {
        let (r, s, _, _) = run(case, Round::Initial);
        assert_eq!(r.unwrap_err(), Failure::Changed);
        assert!(
            !s.borrow()
                .trace
                .iter()
                .any(|(op, p)| *op == Op::Open && p.ends_with("/evil"))
        );
    }
}
#[test]
fn leaf_replacement_after_hash_discards_the_completed_file_result() {
    let (result, state, _, _) = run(Case::PathSwap, Round::Initial);
    assert_eq!(result.unwrap_err(), Failure::Changed);
    let s = state.borrow();
    let path = "/sealed/runtime/dist/review/r2-launcher-entry.js";
    assert!(s.reads.iter().any(|(p, _, _)| p == path));
    assert!(s.opens[path] >= 3);
}
#[test]
fn hashes_short_reads_eof_and_metadata_failures_never_publish_partial_slots() {
    for (case, expected) in [
        (Case::Corrupt, Failure::HashMismatch),
        (Case::Short, Failure::Changed),
        (Case::EofExtra, Failure::Changed),
        (Case::EintrForever, Failure::ReadFailed),
        (Case::FsUnknown, Failure::MetadataUnavailable),
        (Case::Noexec, Failure::Changed),
        (Case::CleanupUnknown, Failure::Unavailable),
    ] {
        assert_eq!(run(case, Round::Initial).0.unwrap_err(), expected);
    }
}
#[test]
fn quotas_and_foreign_scope_fail_closed() {
    assert_eq!(
        run(Case::NoQuotas, Round::Initial).0.unwrap_err(),
        Failure::Unavailable
    );
    for op in 0..6 {
        assert_eq!(
            run(Case::Quota(op), Round::Initial).0.unwrap_err(),
            Failure::Limit
        );
    }
    assert_eq!(
        run(Case::NamesZero, Round::Initial).0.unwrap_err(),
        Failure::Limit
    );
    let (r, s, _, _) = run(Case::WrongScope, Round::Initial);
    assert_eq!(r.unwrap_err(), Failure::Binding);
    assert_eq!(s.borrow().calls, 0);
}
#[test]
fn every_single_attempt_failure_releases_every_successful_handle() {
    let (_, s, _, _) = run(Case::Good, Round::Initial);
    let n = s.borrow().calls;
    for at in 1..=n {
        let op = s.borrow().trace[at as usize - 1].0;
        // cleanup has its own unconfirmed test; a release error is not retryable acquisition.
        if op == Op::Cleanup {
            continue;
        }
        let (result, state, _, _) = run(Case::Failure(at), Round::Initial);
        assert!(result.is_err());
        assert!(
            state.borrow().trace[at as usize..]
                .iter()
                .all(|(op, _)| *op == Op::Cleanup)
        );
    }
}
#[test]
fn every_attempt_can_cancel_or_expire_without_leaking_or_returning_partial_results() {
    let (_, s, _, _) = run(Case::Good, Round::Initial);
    let n = s.borrow().calls;
    for at in 1..=n {
        for (case, expected) in [
            (Case::Cancel(at), Failure::Cancelled),
            (Case::Deadline(at), Failure::Deadline),
        ] {
            let (result, state, _, _) = run(case, Round::Initial);
            assert_eq!(result.unwrap_err(), expected);
            assert!(
                state.borrow().trace[at as usize..]
                    .iter()
                    .all(|(op, _)| *op == Op::Cleanup)
            );
        }
    }
}

#[test]
fn empty_and_chunked_files_are_read_at_exact_declared_boundaries() {
    for case in [Case::Empty, Case::Chunks] {
        let (result, state, _, _) = run(case, Round::Initial);
        result.unwrap();
        let actual: Vec<_> = state
            .borrow()
            .reads
            .iter()
            .filter(|(p, _, _)| p.ends_with("r2-launcher-entry.js"))
            .map(|(_, offset, n)| (*offset, *n))
            .collect();
        assert_eq!(
            actual,
            if matches!(case, Case::Empty) {
                vec![(0, 1)]
            } else {
                vec![(0, 65536), (65536, 1), (65537, 1)]
            }
        );
    }
}
#[test]
fn three_rounds_share_one_start_payload_and_eintr_allowance() {
    let (f, state) = fixture(Case::Eintr);
    let c = context();
    let cancel = state.borrow().cancelled.clone();
    let now = state.borrow().now.clone();
    let clock = || now.get();
    let start = now.get();
    let mut b = SharedBudget::new(start, &cancel);
    b.now = &clock;
    let mut previous = 0;
    for round in [Round::Initial, Round::BeforeM4, Round::AfterM4] {
        round_declaration::with_round(&f.receipt, &f.target, &c, round, &mut b, |scope, b| {
            let d = scope.decode(b)?;
            let mut phases = d.prepare_scan(scope, PHASE_MODEL_ID, b)?;
            let inputs = phases.bind_inputs(scope, b)?;
            let outcome = kernel_for_test(
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
            let observed = outcome.result?;
            drop(inputs);
            phases.after_scan(&observed, b)?;
            phases.finish(b)
        })
        .unwrap();
        assert_eq!(b.started, start);
        assert!(b.json_work > previous);
        previous = b.json_work;
        assert_eq!(b.retries_left, 7);
    }
    assert_eq!(
        b.used,
        3 * state
            .borrow()
            .data
            .values()
            .map(|v| v.len() as u64)
            .sum::<u64>()
    );
    assert!(state.borrow().alive.is_empty());
    assert_eq!(state.borrow().next, state.borrow().released.len() as u64);
}
#[test]
fn system_ancestor_profile_does_not_widen_runtime_or_file_policy() {
    for case in 0..4 {
        let (_, state) = fixture(Case::Good);
        let cancel = state.borrow().cancelled.clone();
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let out = with_boundary(
            Fake(state.clone()),
            Some(Quotas {
                attempts: [100; 5],
                live: 4,
                name_bytes: 100,
            }),
            &mut b,
            |boundary| {
                let anchor = boundary.acquire(None, None, Kind::Anchor)?;
                let mut p = MetadataPolicy {
                    device: state.borrow().stats["/"].device,
                    kind: Kind::Directory,
                    mode: 0o755,
                    size: None,
                };
                match case {
                    0 => boundary
                        .collect_system(&anchor, &p)?
                        .record(boundary.budget)
                        .map(|_| ()),
                    1 => boundary.collect_snapshot(&anchor, &p, false).map(|_| ()),
                    2 => {
                        p.kind = Kind::File;
                        p.mode = 0o555;
                        p.size = Some(1);
                        boundary.collect_system(&anchor, &p).map(|_| ())
                    }
                    _ => {
                        let cursor = boundary.acquire(Some(&anchor), None, Kind::Cursor)?;
                        boundary.collect_system(&cursor, &p).map(|_| ())
                    }
                }
            },
        );
        if case == 0 {
            out.result.unwrap();
        } else {
            assert_eq!(out.result.unwrap_err(), Failure::Binding);
        }
        assert_eq!(out.summary.live, 0);
        assert!(state.borrow().alive.is_empty());
    }
}
#[test]
fn shared_work_limit_has_no_refund_and_cleanup_survives_selected_prefixes() {
    let (_, _, spent, _) = run(Case::Good, Round::Initial);
    for remaining in (0..64).chain(spent.saturating_sub(8)..=spent) {
        let (result, _, _, _) = run(Case::Work(remaining), Round::Initial);
        // AfterScan needs additional work after collection; all prefixes still fail closed.
        if remaining < spent {
            assert_eq!(result.unwrap_err(), Failure::Limit);
        }
    }
}
