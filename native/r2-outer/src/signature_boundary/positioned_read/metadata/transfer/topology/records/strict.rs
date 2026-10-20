//! Fixed semantic verifier; only synthetic closure producers exist. No runtime entry or permit.
use super::*;
use crate::{closure, record_validation as r};

mod round_declaration;
mod scan_ops;
mod scan_work;

pub(super) struct InspectionContext<'a> {
    // Pinned build bytes and effective groups from a future protected context producer.
    // Supplying these in synthetic tests does not establish their operational trust.
    pub(super) registry: &'a [u8],
    pub(super) groups: &'a [u32],
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Round {
    Initial,
    BeforeM4,
    AfterM4,
}
pub(super) struct ClosureRequest<'a> {
    pub(super) lineage: &'a Rc<()>,
    pub(super) records: &'a RecordBinding,
    pub(super) round: Round,
    pub(super) token: &'a Rc<()>,
    pub(super) entries: &'a [closure::Entry],
}
// Private, non-Clone and non-serializable. No OS producer exists; synthetic data is NOT
// filesystem completeness, identity/ABA protection or an execution capability.
pub(super) struct ClosureObservation {
    pub(super) lineage: Rc<()>,
    pub(super) records: RecordBinding,
    pub(super) round: Round,
    pub(super) token: Rc<()>,
    pub(super) entries: Vec<closure::Entry>,
}
pub(super) trait ClosureSource {
    // A future collector must account EACH operation/read on this same budget. This is
    // not one credited I/O attempt and must never wrap an unbounded deployment::inspect.
    fn scan(
        &mut self,
        request: ClosureRequest<'_>,
        budget: &mut SharedBudget<'_>,
    ) -> Result<ClosureObservation, Failure>;
}
pub(super) struct ClosureInspection<'a, C> {
    pub(super) source: C,
    pub(super) context: InspectionContext<'a>,
}
fn hex(hash: &[u8; 32]) -> String {
    hash.iter().map(|v| format!("{v:02x}")).collect()
}
fn relative<'a>(path: &'a str, root: &str) -> Result<&'a str, Failure> {
    let value = path
        .strip_prefix(root)
        .and_then(|v| v.strip_prefix('/'))
        .filter(|v| closure::path(v))
        .ok_or(Failure::Binding)?;
    Ok(value)
}
fn latched(b: &SharedBudget<'_>) -> Failure {
    b.failed.unwrap_or(Failure::Binding)
}
fn work(b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    use crate::json::shared::Budget;
    b.work(1)
}
// This function cannot open files or ask the I/O source for a binding projection.
fn verify_records(
    receipt: &RecordReceipt,
    target: &TargetDeclaration,
    context: &InspectionContext<'_>,
    wall_ms: u64,
    budget: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let b = &receipt.binding;
    let validated = budget
        .validate_record_json(
            &receipt.pins[0].bytes,
            &receipt.pins[1].bytes,
            context.registry,
            &r::Pins {
                activation_hash: &b.activation_hash,
                registry_hash: &b.registry_hash,
            },
            &r::Context {
                execution_uid: b.execution_uid,
                reader_gid: b.reader_gid,
                groups: context.groups,
                product_version: &b.product_version,
                os_build: &b.os_build,
                started_wall_ms: b.start_wall_ms,
                now_wall_ms: wall_ms,
            },
        )
        .map_err(|_| latched(budget))?;
    work(budget)?;
    let (a, l) = validated.inspection_parts();
    let (root, index_path, node_path, node_hash) = l.inspection_paths();
    let (approved, activation_expires) =
        a.time().inspection_bounds().map_err(|_| Failure::Binding)?;
    let (_, ledger_expires) = l.time().inspection_bounds().map_err(|_| Failure::Binding)?;
    if a.ledger_path != b.ledger_path
        || a.ledger_sha256 != hex(&b.ledger_hash)
        || a.release_id != b.release
        || a.generation != b.generation
        || a.artifact_index_sha256 != hex(&b.index_hash)
        || approved != b.approved_wall_ms
        || activation_expires != b.activation_expires_ms
        || ledger_expires != b.ledger_expires_ms
        || root != b.runtime_root
        || index_path != b.index_path
        || l.signature_registry.schema_version != b.registry_schema
        || l.signature_registry.registry_id != b.registry_id
        || l.signature_registry.sha256 != hex(&b.registry_hash)
        || l.node.signature_policy_id != b.node_policy
        || target.path != node_path
        || target.relative != relative(node_path, root)?
        || node_hash != hex(&target.ledger_hash)
    {
        return Err(Failure::Changed);
    }
    work(budget)?;
    budget.checkpoint()
}
fn verify_node_entries(
    entries: &[closure::Entry],
    target: &TargetDeclaration,
    budget: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let mut found = false;
    for entry in entries {
        work(budget)?;
        if entry.path() == target.relative {
            found = matches!(entry, closure::Entry::File { mode, size, sha256, .. }
                if mode == "0555" && SizeEvidence::Indexed(*size) == target.size
                    && *sha256 == hex(&target.index_hash));
        }
    }
    if !found {
        return Err(Failure::Changed);
    }
    budget.checkpoint()?;
    Ok(())
}
fn strict_round<S: RecordSource, C: ClosureSource>(
    source: &mut S,
    closure_source: &mut C,
    receipt: &RecordReceipt,
    target: &TargetDeclaration,
    context: &InspectionContext<'_>,
    round: Round,
    budget: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    // All three records must match before any semantic parsing or new closure scan.
    reread_bytes(source, receipt, budget)?;
    let reading = clock_check(source, receipt, budget, 450_000)?;
    verify_records(receipt, target, context, reading.wall_ms, budget)?;
    round_declaration::with_round(receipt, target, context, round, budget, |scope, budget| {
        let plan = scope.decode(budget)?;
        let mut phases =
            plan.prepare_scan(scope, round_declaration::phases::PHASE_MODEL_ID, budget)?;
        budget.checkpoint()?;
        let observed = closure_source.scan(
            ClosureRequest {
                lineage: &receipt.lineage,
                records: &receipt.binding,
                round,
                token: scope.token(),
                entries: plan.entries(),
            },
            budget,
        );
        budget.checkpoint()?; // Drop late successes, preserving cancel/deadline.
        let observed = observed?;
        phases.after_scan(&observed, budget)?;
        drop(observed);
        // Exact record/path/metadata/time and strict record validation are NOT cached.
        reread_bytes(source, receipt, budget)?;
        let reading = clock_check(source, receipt, budget, 450_000)?;
        verify_records(receipt, target, context, reading.wall_ms, budget)?;
        phases.finish(budget)?;
        clock_check(source, receipt, budget, 450_000)?;
        Ok(())
    })
}
pub(super) fn review_strict_record_target<
    R: MetadataOps + ResourceOrigin,
    T: TopologySource<R>,
    S: RecordSource,
    C: ClosureSource,
>(
    mut held: HeldTargetScope<'_, R>,
    topology: TopologyReceipt,
    mut topology_source: T,
    records: RecordReceipt,
    mut source: S,
    inspection: ClosureInspection<'_, C>,
    budget: &mut SharedBudget<'_>,
) -> Result<RecordComparison, Failure> {
    let ClosureInspection {
        source: mut closure_source,
        context,
    } = inspection;
    let result = (|| {
        validate_receipt(&records, held.bound, budget)?;
        clock_check(&mut source, &records, budget, 460_000)?;
        strict_round(
            &mut source,
            &mut closure_source,
            &records,
            held.bound.target,
            &context,
            Round::Initial,
            budget,
        )?;
        let target = held.bound.target;
        let compared = compare_topology(
            &mut held,
            &topology,
            &mut topology_source,
            budget,
            &mut |b| {
                strict_round(
                    &mut source,
                    &mut closure_source,
                    &records,
                    target,
                    &context,
                    Round::BeforeM4,
                    b,
                )
            },
        )?;
        strict_round(
            &mut source,
            &mut closure_source,
            &records,
            held.bound.target,
            &context,
            Round::AfterM4,
            budget,
        )?;
        budget.checkpoint()?;
        Ok(compared)
    })();
    let result = match result {
        Ok(v) => Ok(v),
        Err(e) => budget.stop(e),
    };
    drop(closure_source);
    drop(source);
    drop(topology_source);
    drop(held);
    drop(records);
    budget.checkpoint()?;
    result.map(|compared| RecordComparison { compared })
}
