//! Inert record/ownership contract. No record reader, OS opener, source activation or permit.
use super::collector::MetadataOps;
use super::*;
use crate::signature_policy::Role;

// Opaque ownership origin, not an OS identity or a caller-supplied FD number.
trait ResourceOrigin {
    fn resource_origin(&self) -> &Rc<()>;
}

// Clone applies only to comparison data, never to the session, target or owned resources.
#[derive(Clone, PartialEq, Eq)]
struct RecordBinding {
    activation_path: String,
    activation_hash: [u8; 32],
    ledger_path: String,
    ledger_hash: [u8; 32],
    index_path: String,
    index_hash: [u8; 32],
    release: String,
    generation: u64,
    execution_uid: u32,
    reader_gid: u32,
    product_version: String,
    os_build: String,
    registry_schema: String,
    registry_id: String,
    registry_hash: [u8; 32],
    node_policy: String,
    runtime_root: String,
    start_wall_ms: u64,
    approved_wall_ms: u64,
    activation_expires_ms: u64,
    ledger_expires_ms: u64,
}
#[derive(Clone, PartialEq, Eq)]
enum SizeEvidence {
    Indexed(u64),
    ObservedBounded(u64),
}
#[derive(Clone, PartialEq, Eq)]
struct TargetDeclaration {
    role: Role,
    path: String,
    relative: String,
    ledger_hash: [u8; 32],
    index_hash: [u8; 32],
    size: SizeEvidence,
    mode: u32,
    policy: String,
    policy_role: Role,
}
struct BoundTarget<'s> {
    records: &'s RecordBinding,
    lineage: &'s Rc<()>,
    target: &'s TargetDeclaration,
    chain_names: Vec<String>,
    bytes: u64,
}
// Only this private module can construct these types. There is intentionally no installed-record
// producer yet; synthetic comparison inputs are not root-approved record evidence.
fn absolute(path: &str) -> Result<Vec<String>, Failure> {
    absolute_components(path, 64)
}
fn absolute_components(path: &str, max_depth: usize) -> Result<Vec<String>, Failure> {
    if path.len() > 4096 || path.chars().any(char::is_control) {
        return Err(Failure::Binding);
    }
    let parts = path
        .strip_prefix('/')
        .ok_or(Failure::Binding)?
        .split('/')
        .collect::<Vec<_>>();
    if parts.is_empty()
        || parts.len() > max_depth
        || parts
            .iter()
            .any(|v| v.is_empty() || *v == "." || *v == ".." || v.len() > 255 || v.contains('\\'))
    {
        return Err(Failure::Binding);
    }
    Ok(parts.into_iter().map(str::to_owned).collect())
}
fn text(value: &str, max: usize) -> bool {
    !value.is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}
fn bind<'s>(
    records: &'s RecordBinding,
    lineage: &'s Rc<()>,
    target: &'s TargetDeclaration,
) -> Result<BoundTarget<'s>, Failure> {
    if records.activation_path != crate::ACTIVATION_PATH
        || records.generation == 0
        || records.generation > 9_007_199_254_740_991
        || records.execution_uid == 0
        || records.reader_gid == 0
        || !text(&records.release, 128)
        || !text(&records.product_version, 32)
        || !text(&records.os_build, 32)
        || records.registry_schema != "bp5-r2-signature-registry-0.1"
        || !crate::signature_policy::id(&records.registry_id)
        || !crate::signature_policy::id(&records.node_policy)
    {
        return Err(Failure::Binding);
    }
    absolute(&records.ledger_path)?;
    let root = absolute(&records.runtime_root)?;
    absolute_components(&records.index_path, 128)?;
    if !records
        .index_path
        .starts_with(&format!("{}/", records.runtime_root))
    {
        return Err(Failure::Binding);
    }
    // Launcher size/root policy is still unapproved. No synthetic flag can enable this role.
    if target.role != Role::Node {
        return Err(Failure::Unavailable);
    }
    if !crate::closure::path(&target.relative)
        || target.path != format!("{}/{}", records.runtime_root, target.relative)
        || target.path == records.index_path
        || target.ledger_hash != target.index_hash
        || target.mode != 0o555
        || target.policy_role != Role::Node
        || target.policy != records.node_policy
    {
        return Err(Failure::Binding);
    }
    absolute_components(&target.path, 128)?;
    let bytes = match target.size {
        SizeEvidence::Indexed(n) if (32..=MAX_FILE).contains(&n) => n,
        _ => return Err(Failure::Binding),
    };
    let mut chain_names = vec!["/".to_owned()];
    chain_names.extend(root);
    let mut relative = target.relative.split('/').collect::<Vec<_>>();
    relative.pop();
    chain_names.extend(relative.into_iter().map(str::to_owned));
    Ok(BoundTarget {
        records,
        lineage,
        target,
        chain_names,
        bytes,
    })
}
struct Ancestor<R> {
    resource: R,
    component: String,
}
struct OpenedTarget<R> {
    lineage: Rc<()>,
    records: RecordBinding,
    target: TargetDeclaration,
    root_device: u64,
    initial: Observation,
    initial_origin: Rc<()>,
    // Drop leaf before ancestors on all failure paths, including before the move.
    leaf: R,
    ancestors: Vec<Ancestor<R>>,
}
struct TransferSource<R> {
    leaf: R,
}
struct HeldTargetScope<'s, R> {
    source: TransferSource<R>,
    ancestors: Vec<Ancestor<R>>,
    bound: &'s BoundTarget<'s>,
    initial: Snapshot,
    initial_origin: Rc<()>,
}
struct TransferDiagnostic;
impl std::fmt::Debug for TransferDiagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MovedTarget(pending_m0_topology_records_not_execution_authority)")
    }
}
impl TransferDiagnostic {
    fn execution_gate(&self) -> Result<(), Failure> {
        Err(Failure::Unavailable)
    }
}
fn record_time(records: &RecordBinding, wall_ms: u64, margin: u64) -> Result<(), Failure> {
    if records.approved_wall_ms > records.start_wall_ms || wall_ms < records.start_wall_ms {
        return Err(Failure::Binding);
    }
    let minimum = wall_ms.checked_add(margin).ok_or(Failure::Binding)?;
    if records.activation_expires_ms <= minimum || records.ledger_expires_ms <= minimum {
        return Err(Failure::Expired);
    }
    Ok(())
}
fn attach<'s, R: ResourceOrigin>(
    bound: &'s BoundTarget<'s>,
    opened: OpenedTarget<R>,
) -> Result<HeldTargetScope<'s, R>, Failure> {
    if opened
        .ancestors
        .len()
        .checked_add(3)
        .is_none_or(|n| n > 132)
    {
        return Err(Failure::Limit);
    }
    if !Rc::ptr_eq(&opened.lineage, bound.lineage)
        || !Rc::ptr_eq(&opened.initial_origin, opened.leaf.resource_origin())
        || opened.records != *bound.records
        || opened.target != *bound.target
        || opened.ancestors.len() != bound.chain_names.len()
        || opened
            .ancestors
            .iter()
            .zip(&bound.chain_names)
            .any(|(a, b)| a.component != *b)
    {
        return Err(Failure::Binding);
    }
    let initial = normalize(opened.initial, opened.root_device, bound.bytes)?;
    Ok(HeldTargetScope {
        source: TransferSource { leaf: opened.leaf },
        ancestors: opened.ancestors,
        bound,
        initial,
        initial_origin: opened.initial_origin,
    })
}
fn with_target<R: ResourceOrigin>(
    budget: &mut SharedBudget<'_>,
    records: &RecordBinding,
    lineage: &Rc<()>,
    declaration: &TargetDeclaration,
    open: impl FnOnce(&BoundTarget<'_>) -> Result<OpenedTarget<R>, Failure>,
    use_source: impl FnOnce(&HeldTargetScope<'_, R>) -> Result<(), Failure>,
) -> Result<TransferDiagnostic, Failure> {
    let result = (|| {
        budget.checkpoint()?;
        record_time(records, records.start_wall_ms, 460_000)?;
        let bound = bind(records, lineage, declaration)?;
        budget.checkpoint()?;
        let opened = open(&bound);
        budget.checkpoint()?; // A late successful OpenedTarget still owns all resources and drops.
        let held = attach(&bound, opened?)?;
        budget.checkpoint()?;
        let used = use_source(&held); // Private synthetic boundary; no caller-selected runtime hook.
        budget.checkpoint()?;
        if let Err(reason) = used {
            let result = budget.stop(reason);
            drop(held);
            return result;
        }
        drop(held); // Includes source leaf and chain, before the final guard/diagnostic.
        budget.checkpoint()?;
        let elapsed = (budget.now)()
            .checked_duration_since(budget.started)
            .ok_or(Failure::Deadline)?;
        let elapsed = u64::try_from(elapsed.as_millis()).map_err(|_| Failure::Limit)?;
        let wall = records
            .start_wall_ms
            .checked_add(elapsed)
            .ok_or(Failure::Binding)?;
        record_time(records, wall, 450_000)?;
        budget.checkpoint()?;
        Ok(TransferDiagnostic)
    })();
    match result {
        Ok(value) => Ok(value),
        Err(reason) => budget.stop(reason),
    }
}

// Consume the scope so all owned resources are dropped before returning either a pending
// diagnostic or a failure. No source/snapshot/expected-hash override parameter exists.
struct OpenBoundComparison {
    compared: ComparedM0M4,
}
impl std::fmt::Debug for OpenBoundComparison {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("OpenBoundComparison(pending_topology_records_lease_not_execution_authority)")
    }
}
impl OpenBoundComparison {
    fn entitlement_gate(&self) -> Result<(), physical_signature::Rejection> {
        self.compared.entitlement_gate()
    }
}
fn review_opened_target<R: MetadataOps + ResourceOrigin>(
    mut held: HeldTargetScope<'_, R>,
    budget: &mut SharedBudget<'_>,
) -> Result<OpenBoundComparison, Failure> {
    let result = (|| {
        budget.checkpoint()?;
        if !Rc::ptr_eq(&held.initial_origin, held.source.leaf.resource_origin()) {
            return Err(Failure::SourceMismatch);
        }
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
            let raw = r.collect_metadata_after_open(p, device)?;
            r.checkpoint()?;
            if !Rc::ptr_eq(origin, r.source.resource_origin()) {
                return Err(Failure::SourceMismatch);
            }
            if p == Phase::M0 {
                let snapshot = normalize(raw.clone(), device, bytes).map_err(|e| {
                    if e == Failure::Metadata {
                        Failure::Changed
                    } else {
                        e
                    }
                })?;
                if snapshot != *expected {
                    return Err(Failure::Changed);
                }
                r.checkpoint()?;
            }
            Ok(raw)
        })
    })();
    // Latch before resource release; drop-time cancel must not overwrite an earlier failure.
    let result = match result {
        Ok(value) => Ok(value),
        Err(reason) => budget.stop(reason),
    };
    drop(held);
    budget.checkpoint()?;
    result.map(|compared| OpenBoundComparison { compared })
}
#[cfg(test)]
mod tests;
mod topology;
