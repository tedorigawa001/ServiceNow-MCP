//! Private comparison-only topology contract. No OS implementation or execution authority.
use super::*;

const MAX_TOPOLOGY_CALLS: u32 = 16384;

// Already bounded names classification: no name/value/string allocation at this boundary.
#[derive(Clone, Copy, PartialEq, Eq)]
enum VisibleNames {
    Empty,
    Provenance,
    Disallowed,
    Unknown,
}
#[derive(Clone)]
struct TopologyObservation {
    before: Stat,
    after: Stat,
    acl: Acl,
    filesystem: Filesystem,
    names: VisibleNames,
}
#[derive(Clone, PartialEq, Eq)]
struct TopologySnapshot {
    stat: Stat,
    names: VisibleNames,
}
fn snapshot(raw: TopologyObservation, directory: bool) -> Result<TopologySnapshot, Failure> {
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
    // These are synthetic comparison constraints, NOT approved system-ancestor profiles.
    if raw.acl != Acl::Absent
        || raw.filesystem != Filesystem::Local
        || raw.names == VisibleNames::Disallowed
        || s.uid != 0
        || s.mtime.nanoseconds >= 1_000_000_000
        || s.ctime.nanoseconds >= 1_000_000_000
        || if directory {
            s.kind != FileType::Directory || ![0o555, 0o755].contains(&s.mode) || s.links == 0
        } else {
            s.kind != FileType::Regular || s.mode != 0o555 || s.links != 1
        }
    {
        return Err(Failure::Changed);
    }
    Ok(TopologySnapshot {
        stat: raw.after,
        names: raw.names,
    })
}
struct AncestorBaseline {
    origin: Rc<()>,
    snapshot: TopologySnapshot,
}
// Minted only beside an open receipt in this private module/tests. No public constructor,
// serialization, installed-record producer or conversion from an existing diagnostic.
struct TopologyReceipt {
    lineage: Rc<()>,
    records: RecordBinding,
    target: TargetDeclaration,
    ancestors: Vec<AncestorBaseline>,
}

trait TopologySource<R> {
    type Temporary;
    // Each method is one bounded attempt. No hidden retries, payload reads, or path fallback.
    fn observe_held(&mut self, resource: &R) -> Result<TopologyObservation, Failure>;
    // Must resolve the fixed trusted "/", not reuse the retained possibly renamed directory.
    fn open_anchor(&mut self) -> Result<Self::Temporary, Failure>;
    fn open_child(
        &mut self,
        parent: &Self::Temporary,
        component: &str,
        directory: bool,
    ) -> Result<Self::Temporary, Failure>;
    fn observe_temporary(
        &mut self,
        resource: &Self::Temporary,
    ) -> Result<TopologyObservation, Failure>;
}
fn attempt<T>(
    budget: &mut SharedBudget<'_>,
    operation: impl FnOnce() -> Result<T, Failure>,
) -> Result<T, Failure> {
    budget.checkpoint()?;
    if budget.topology_calls >= MAX_TOPOLOGY_CALLS {
        return budget.stop(Failure::Limit);
    }
    budget.topology_calls += 1;
    let result = operation();
    // Late successful resources remain owned by `result` and drop even on cancellation.
    budget.checkpoint()?;
    result
}
fn check_binding<R: ResourceOrigin>(
    bound: &BoundTarget<'_>,
    ancestors: &[Ancestor<R>],
    receipt: &TopologyReceipt,
) -> Result<(), Failure> {
    if !Rc::ptr_eq(bound.lineage, &receipt.lineage)
        || *bound.records != receipt.records
        || *bound.target != receipt.target
        || ancestors.len() != bound.chain_names.len()
        || receipt.ancestors.len() != ancestors.len()
        || ancestors.is_empty()
        || ancestors.len().checked_add(3).is_none_or(|n| n > 132)
    {
        return Err(Failure::Binding);
    }
    for ((held, baseline), component) in ancestors
        .iter()
        .zip(&receipt.ancestors)
        .zip(&bound.chain_names)
    {
        if held.component != *component
            || !Rc::ptr_eq(held.resource.resource_origin(), &baseline.origin)
        {
            return Err(Failure::SourceMismatch);
        }
    }
    Ok(())
}
fn recheck<R: ResourceOrigin, S: TopologySource<R>>(
    bound: &BoundTarget<'_>,
    ancestors: &[Ancestor<R>],
    initial: &Snapshot,
    receipt: &TopologyReceipt,
    source: &mut S,
    budget: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    budget.checkpoint()?;
    check_binding(bound, ancestors, receipt)?;
    for (held, baseline) in ancestors.iter().zip(&receipt.ancestors) {
        let raw = attempt(budget, || source.observe_held(&held.resource))?;
        if !Rc::ptr_eq(held.resource.resource_origin(), &baseline.origin) {
            return Err(Failure::SourceMismatch);
        }
        if snapshot(raw, true)? != baseline.snapshot {
            return Err(Failure::Changed);
        }
    }
    // Rewalk ALL edges from a fresh anchor, not from any held intermediate parent.
    // Streaming RAII: at most current+next temporary resources; neither reaches pread/parser.
    let mut current = attempt(budget, || source.open_anchor())?;
    let raw = attempt(budget, || source.observe_temporary(&current))?;
    if snapshot(raw, true)? != receipt.ancestors[0].snapshot {
        return Err(Failure::Changed);
    }
    for (component, baseline) in bound
        .chain_names
        .iter()
        .skip(1)
        .zip(receipt.ancestors.iter().skip(1))
    {
        let next = attempt(budget, || source.open_child(&current, component, true))?;
        let raw = attempt(budget, || source.observe_temporary(&next))?;
        if snapshot(raw, true)? != baseline.snapshot {
            return Err(Failure::Changed);
        }
        current = next;
    }
    let leaf_name = bound
        .target
        .relative
        .rsplit('/')
        .next()
        .ok_or(Failure::Binding)?;
    let leaf = attempt(budget, || source.open_child(&current, leaf_name, false))?;
    let raw = attempt(budget, || source.observe_temporary(&leaf))?;
    let leaf = snapshot(raw, false)?;
    let names = match initial.names {
        Names::Empty => VisibleNames::Empty,
        Names::Provenance => VisibleNames::Provenance,
    };
    if leaf.stat != initial.stat || leaf.names != names {
        return Err(Failure::Changed);
    }
    check_binding(bound, ancestors, receipt)?;
    budget.checkpoint()
}

struct TopologyComparison {
    compared: ComparedM0M4,
}
impl std::fmt::Debug for TopologyComparison {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("TopologyComparison(synthetic_pending_records_lease_not_execution_authority)")
    }
}
impl TopologyComparison {
    fn entitlement_gate(&self) -> Result<(), physical_signature::Rejection> {
        self.compared.entitlement_gate()
    }
}
fn review_topology_target<R: MetadataOps + ResourceOrigin, S: TopologySource<R>>(
    mut held: HeldTargetScope<'_, R>,
    receipt: TopologyReceipt,
    mut source: S,
    budget: &mut SharedBudget<'_>,
) -> Result<TopologyComparison, Failure> {
    let result = (|| {
        budget.checkpoint()?;
        if !Rc::ptr_eq(&held.initial_origin, held.source.leaf.resource_origin()) {
            return Err(Failure::SourceMismatch);
        }
        recheck(
            held.bound,
            &held.ancestors,
            &held.initial,
            &receipt,
            &mut source,
            budget,
        )?;
        let expected = &held.initial;
        let origin = &held.initial_origin;
        let device = expected.stat.device;
        let bytes = held.bound.bytes;
        let mut read = budget.begin(&mut held.source.leaf, bytes)?;
        read.compare_metadata(&held.bound.target.ledger_hash, device, &mut |r, p| {
            r.checkpoint()?;
            if !Rc::ptr_eq(origin, r.source.resource_origin()) {
                return Err(Failure::SourceMismatch);
            }
            // compare_metadata invokes M4 only AFTER B. No arbitrary optional finalizer.
            if p == Phase::M4 {
                recheck(
                    held.bound,
                    &held.ancestors,
                    expected,
                    &receipt,
                    &mut source,
                    r.budget,
                )?;
            }
            let raw = r.collect_metadata_after_open(p, device)?;
            r.checkpoint()?;
            if !Rc::ptr_eq(origin, r.source.resource_origin()) {
                return Err(Failure::SourceMismatch);
            }
            if p == Phase::M0 && normalize(raw.clone(), device, bytes)? != *expected {
                return Err(Failure::Changed);
            }
            Ok(raw)
        })
    })();
    let result = match result {
        Ok(value) => Ok(value),
        Err(reason) => budget.stop(reason),
    };
    drop(source);
    drop(held);
    budget.checkpoint()?;
    result.map(|compared| TopologyComparison { compared })
}

#[cfg(test)]
mod tests;
