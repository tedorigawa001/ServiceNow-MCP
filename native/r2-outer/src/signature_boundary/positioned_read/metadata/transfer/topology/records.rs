//! Internal record rereads and strict synthetic verification. No installed reader or permit.
use super::*;
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Activation,
    Ledger,
    Index,
}
const KINDS: [Kind; 3] = [Kind::Activation, Kind::Ledger, Kind::Index];
impl Kind {
    fn limit(self) -> usize {
        match self {
            Self::Index => 16 * 1024 * 1024,
            _ => 65536,
        }
    }
    fn path(self, b: &RecordBinding) -> &str {
        match self {
            Self::Activation => &b.activation_path,
            Self::Ledger => &b.ledger_path,
            Self::Index => &b.index_path,
        }
    }
    fn hash(self, b: &RecordBinding) -> &[u8; 32] {
        match self {
            Self::Activation => &b.activation_hash,
            Self::Ledger => &b.ledger_hash,
            Self::Index => &b.index_hash,
        }
    }
}
#[derive(Clone, PartialEq, Eq)]
struct RecordSnapshot {
    stat: Stat,
    names: VisibleNames,
}
struct RecordPin {
    kind: Kind,
    bytes: Vec<u8>,
    ancestors: Vec<RecordSnapshot>,
    leaf: RecordSnapshot,
}
struct ClockReading {
    wall_ms: u64,
    monotonic_ms: u64,
}
struct RecordReceipt {
    lineage: Rc<()>,
    binding: RecordBinding,
    start_monotonic_ms: u64,
    pins: [RecordPin; 3],
    #[cfg(test)]
    release_watch: Option<ReleaseWatch>,
}
trait RecordSource {
    type Handle;
    fn clock(&mut self) -> Result<ClockReading, Failure>;
    fn open_anchor(&mut self, kind: Kind) -> Result<Self::Handle, Failure>;
    fn open_child(
        &mut self,
        parent: &Self::Handle,
        component: &str,
        directory: bool,
    ) -> Result<Self::Handle, Failure>;
    fn observe(&mut self, handle: &Self::Handle) -> Result<TopologyObservation, Failure>;
    fn read(
        &mut self,
        handle: &Self::Handle,
        offset: u64,
        out: &mut [u8],
    ) -> Result<usize, Failure>;
    // Historical contract tests only. The strict pipeline never calls a source projection.
    #[cfg(test)]
    fn revalidate(&mut self, bytes: [&[u8]; 3]) -> Result<RecordBinding, Failure>;
}
fn normalize_record(
    raw: TopologyObservation,
    kind: Kind,
    directory: bool,
    b: &RecordBinding,
) -> Result<RecordSnapshot, Failure> {
    if raw.before != raw.after {
        return Err(Failure::Changed);
    }
    if raw.acl == Acl::Unknown
        || raw.filesystem == Filesystem::Unknown
        || raw.names == VisibleNames::Unknown
        || raw.after.kind == FileType::Unknown
    {
        return Err(Failure::MetadataUnavailable);
    }
    let s = &raw.after;
    let owner = if kind == Kind::Ledger {
        b.execution_uid
    } else {
        0
    };
    let mode = match kind {
        Kind::Activation => 0o440,
        Kind::Ledger => 0o600,
        Kind::Index => 0o444,
    };
    if raw.acl != Acl::Absent
        || raw.filesystem != Filesystem::Local
        || raw.names == VisibleNames::Disallowed
        || s.mtime.nanoseconds >= 1_000_000_000
        || s.ctime.nanoseconds >= 1_000_000_000
        || if directory {
            s.kind != FileType::Directory
                || s.links == 0
                || s.mode & !0o777 != 0
                || s.mode & 0o022 != 0
                || !(s.uid == 0 || (kind == Kind::Ledger && s.uid == owner))
        } else {
            s.kind != FileType::Regular
                || s.links != 1
                || s.uid != owner
                || s.mode != mode
                || s.size == 0
                || s.size > kind.limit() as u64
                || (kind == Kind::Activation && s.gid != b.reader_gid)
        }
    {
        return Err(Failure::Changed);
    }
    Ok(RecordSnapshot {
        stat: raw.after,
        names: raw.names,
    })
}
fn validate_receipt(
    receipt: &RecordReceipt,
    bound: &BoundTarget<'_>,
    budget: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    budget.checkpoint()?;
    if !Rc::ptr_eq(&receipt.lineage, bound.lineage) || receipt.binding != *bound.records {
        return Err(Failure::Binding);
    }
    record_time(&receipt.binding, receipt.binding.start_wall_ms, 460_000)?;
    for (kind, pin) in KINDS.into_iter().zip(&receipt.pins) {
        let components = absolute_components(kind.path(&receipt.binding), 128)?;
        if pin.kind != kind
            || pin.ancestors.len() != components.len()
            || pin.bytes.is_empty()
            || pin.bytes.len() > kind.limit()
            || pin.leaf.stat.size != pin.bytes.len() as u64
        {
            return Err(Failure::Binding);
        }
        let mut hash = Sha256::new();
        for chunk in pin.bytes.chunks(MAX_CHUNK) {
            budget.checkpoint()?;
            hash.update(chunk);
        }
        let digest: [u8; 32] = hash.finalize().into();
        if digest != *kind.hash(&receipt.binding) {
            return Err(Failure::HashMismatch);
        }
        budget.checkpoint()?;
    }
    Ok(())
}
fn clock_check<S: RecordSource>(
    s: &mut S,
    receipt: &RecordReceipt,
    budget: &mut SharedBudget<'_>,
    margin: u64,
) -> Result<ClockReading, Failure> {
    let reading = attempt(budget, || s.clock())?;
    let wall = reading
        .wall_ms
        .checked_sub(receipt.binding.start_wall_ms)
        .ok_or(Failure::Expired)?;
    let mono = reading
        .monotonic_ms
        .checked_sub(receipt.start_monotonic_ms)
        .ok_or(Failure::Expired)?;
    let elapsed = (budget.now)()
        .checked_duration_since(budget.started)
        .ok_or(Failure::Deadline)?;
    let elapsed = u64::try_from(elapsed.as_millis()).map_err(|_| Failure::Limit)?;
    if wall.abs_diff(mono) > 1 || mono.abs_diff(elapsed) > 1 {
        return Err(Failure::Expired);
    }
    record_time(&receipt.binding, reading.wall_ms, margin)?;
    budget.checkpoint()?;
    Ok(reading)
}
fn reread_bytes<S: RecordSource>(
    s: &mut S,
    receipt: &RecordReceipt,
    budget: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    clock_check(s, receipt, budget, 450_000)?;
    for pin in &receipt.pins {
        let kind = pin.kind;
        let current = walk_record(s, pin, &receipt.binding, budget)?;
        let mut buffer = vec![0; MAX_CHUNK.min(pin.bytes.len())];
        let mut offset = 0;
        while offset < pin.bytes.len() {
            let n = buffer.len().min(pin.bytes.len() - offset);
            let copied = read_once(s, &current, offset as u64, &mut buffer[..n], budget)?;
            if copied == 0 {
                return Err(Failure::ReadFailed);
            }
            if buffer[..copied] != pin.bytes[offset..offset + copied] {
                return Err(Failure::Changed);
            }
            offset += copied;
        }
        if read_once(s, &current, offset as u64, &mut buffer[..1], budget)? != 0 {
            return Err(Failure::Changed);
        }
        let raw = attempt(budget, || s.observe(&current))?;
        if normalize_record(raw, kind, false, &receipt.binding)? != pin.leaf {
            return Err(Failure::Changed);
        }
        drop(current);
        // Resolve the namespace AGAIN after reading: a held old file alone cannot prove
        // the approved path still resolves to it. Release it first to keep peak <=2.
        drop(walk_record(s, pin, &receipt.binding, budget)?);
    }
    Ok(())
}
#[cfg(test)]
fn reread<S: RecordSource>(
    s: &mut S,
    receipt: &RecordReceipt,
    budget: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    reread_bytes(s, receipt, budget)?;
    let projection = attempt(budget, || {
        s.revalidate([
            &receipt.pins[0].bytes,
            &receipt.pins[1].bytes,
            &receipt.pins[2].bytes,
        ])
    })?;
    if projection != receipt.binding {
        return Err(Failure::Changed);
    }
    clock_check(s, receipt, budget, 450_000).map(|_| ())
}
fn walk_record<S: RecordSource>(
    s: &mut S,
    pin: &RecordPin,
    b: &RecordBinding,
    budget: &mut SharedBudget<'_>,
) -> Result<S::Handle, Failure> {
    let kind = pin.kind;
    let components = absolute_components(kind.path(b), 128)?;
    let mut current = attempt(budget, || s.open_anchor(kind))?;
    let raw = attempt(budget, || s.observe(&current))?;
    if normalize_record(raw, kind, true, b)? != pin.ancestors[0] {
        return Err(Failure::Changed);
    }
    for (i, component) in components.iter().enumerate() {
        let directory = i + 1 < components.len();
        let next = attempt(budget, || s.open_child(&current, component, directory))?;
        let raw = attempt(budget, || s.observe(&next))?;
        let expected = if directory {
            &pin.ancestors[i + 1]
        } else {
            &pin.leaf
        };
        if normalize_record(raw, kind, directory, b)? != *expected {
            return Err(Failure::Changed);
        }
        current = next;
    }
    Ok(current)
}
fn read_once<S: RecordSource>(
    s: &mut S,
    h: &S::Handle,
    offset: u64,
    out: &mut [u8],
    budget: &mut SharedBudget<'_>,
) -> Result<usize, Failure> {
    budget.checkpoint()?;
    if budget.topology_calls >= MAX_TOPOLOGY_CALLS {
        return budget.stop(Failure::Limit);
    }
    budget.topology_calls += 1;
    let result = s.read(h, offset, out);
    if let Ok(n) = result {
        budget.account_read(n as u64)?;
        if n > out.len() {
            return Err(Failure::ReadFailed);
        }
    }
    budget.checkpoint()?;
    result
}
struct RecordComparison {
    compared: ComparedM0M4,
}
impl std::fmt::Debug for RecordComparison {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RecordComparison(synthetic_pending_lease_os_reader_not_execution_authority)")
    }
}
impl RecordComparison {
    fn entitlement_gate(&self) -> Result<(), physical_signature::Rejection> {
        self.compared.entitlement_gate()
    }
}
#[cfg(test)]
fn review_record_target<R: MetadataOps + ResourceOrigin, T: TopologySource<R>, S: RecordSource>(
    mut held: HeldTargetScope<'_, R>,
    topology: TopologyReceipt,
    mut topology_source: T,
    records: RecordReceipt,
    mut record_source: S,
    budget: &mut SharedBudget<'_>,
) -> Result<RecordComparison, Failure> {
    let result = (|| {
        validate_receipt(&records, held.bound, budget)?;
        clock_check(&mut record_source, &records, budget, 460_000)?;
        let compared = compare_topology(
            &mut held,
            &topology,
            &mut topology_source,
            budget,
            &mut |b| reread(&mut record_source, &records, b),
        )?;
        // The held target and original record evidence are still alive after M4.
        reread(&mut record_source, &records, budget)?;
        budget.checkpoint()?;
        Ok(compared)
    })();
    let result = match result {
        Ok(v) => Ok(v),
        Err(e) => budget.stop(e),
    };
    drop(record_source);
    drop(topology_source);
    drop(held);
    drop(records);
    budget.checkpoint()?;
    result.map(|compared| RecordComparison { compared })
}

mod strict;
#[cfg(test)]
mod tests;
