//! Receipt/round-local input projections, NOT an OS root producer or scan/execution permit.
use super::*;
use phases::IndexPhases;

mod canonical;
pub(in super::super) mod profile;
mod root_path;
mod use_state;

pub(in super::super) struct ScanInputs<'i, 'd, 's, 'r> {
    declaration: &'d RoundDeclaration<'s, 'r>,
    phases: &'i IndexPhases<'d, 's, 'r>,
    root: &'s RecordSnapshot,
    index: closure::Entry,
    profile_started: std::cell::Cell<bool>,
    scan_started: std::cell::Cell<use_state::State>,
}
pub(in super::super) struct ParentInput<'p, 'i, 'd, 's, 'r> {
    inputs: &'p ScanInputs<'i, 'd, 's, 'r>,
    entry: Option<&'p closure::Entry>, // None is the receipt-bound runtime root, never an arbitrary path
}
pub(in super::super) struct ChildInput<'c, 'p, 'i, 'd, 's, 'r> {
    parent: &'c ParentInput<'p, 'i, 'd, 's, 'r>,
    entry: &'p closure::Entry,
}
// Read-only accepted layout for the private scan_ops collector; not an OS receipt producer.
pub(in super::super) struct Layout<'a> {
    pub(in super::super) ancestors: &'a [RecordSnapshot],
    pub(in super::super) components: Vec<String>,
    pub(in super::super) entries: &'a [closure::Entry],
    pub(in super::super) index: &'a closure::Entry,
    pub(in super::super) root: &'a RecordSnapshot,
    pub(in super::super) index_record: &'a RecordSnapshot,
}
impl std::fmt::Debug for ScanInputs<'_, '_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanInputs(receipt_round_only_not_execution_authority)")
    }
}
impl std::fmt::Debug for ParentInput<'_, '_, '_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanParent(receipt_round_only_not_path_observation)")
    }
}
impl std::fmt::Debug for ChildInput<'_, '_, '_, '_, '_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanChild(declaration_only_not_resource_observation)")
    }
}
fn stop<T>(result: Result<T, Failure>, b: &mut SharedBudget<'_>) -> Result<T, Failure> {
    match result {
        Ok(v) => Ok(v),
        Err(e) => b.stop(e),
    }
}
fn parent_of(path: &str) -> (&str, &str) {
    path.rsplit_once('/').unwrap_or(("", path))
}
pub(super) fn build<'i, 'd, 's, 'r>(
    phases: &'i IndexPhases<'d, 's, 'r>,
    current: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<ScanInputs<'i, 'd, 's, 'r>, Failure> {
    let result = (|| {
        let d = phases.input_declaration(b)?;
        d.ensure_scope(current, b)?;
        d.index_work
            .require_model(work_model::WORK_MODEL_ID, b)
            .map_err(|e| work_model::latch(e, b))?;
        phases.claim_inputs(b)?;
        work(b)?; // bounded absolute path projection (<=64 components, <=4096 bytes)
        let receipt = d.scope.receipt;
        let depth = absolute(&receipt.binding.runtime_root)?.len();
        let index = &receipt.pins[2];
        let Some(root) = index.ancestors.get(depth) else {
            return Err(Failure::Binding);
        };
        for ancestor in &index.ancestors[depth..] {
            work(b)?;
            let s = &ancestor.stat;
            if s.kind != FileType::Directory
                || s.uid != 0
                || s.mode != 0o555
                || s.device != root.stat.device
                || s.mtime.nanoseconds >= 1_000_000_000
                || s.ctime.nanoseconds >= 1_000_000_000
                || !matches!(
                    ancestor.names,
                    VisibleNames::Empty | VisibleNames::Provenance
                )
            {
                return Err(Failure::Binding);
            }
        }
        work(b)?;
        if index.leaf.stat.device != root.stat.device
            || index.leaf.stat.kind != FileType::Regular
            || index.leaf.stat.uid != 0
            || index.leaf.stat.mode != 0o444
            || index.leaf.stat.links != 1
            || index.leaf.stat.mtime.nanoseconds >= 1_000_000_000
            || index.leaf.stat.ctime.nanoseconds >= 1_000_000_000
            || !matches!(
                index.leaf.names,
                VisibleNames::Empty | VisibleNames::Provenance
            )
        {
            return Err(Failure::Binding);
        }
        work(b)?; // fixed virtual index projection; never accept a caller's index size/digest
        let index = closure::Entry::File {
            path: d.scope.index_path.clone(),
            mode: "0444".into(),
            size: receipt.pins[2].bytes.len() as u64,
            sha256: d.scope.hash.clone(),
        };
        b.checkpoint()?;
        Ok(ScanInputs {
            declaration: d,
            phases,
            root,
            index,
            profile_started: std::cell::Cell::new(false),
            scan_started: std::cell::Cell::new(use_state::State::Fresh),
        })
    })();
    stop(result, b)
}

impl<'i, 'd, 's, 'r> ScanInputs<'i, 'd, 's, 'r> {
    pub(in super::super) fn layout(
        &self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<Layout<'_>, Failure> {
        self.guard(current, b)?;
        work(b)?;
        Ok(Layout {
            ancestors: &self.declaration.scope.receipt.pins[2].ancestors,
            components: absolute(&self.declaration.scope.receipt.binding.runtime_root)?,
            entries: self.declaration.entries(),
            index: &self.index,
            root: self.root,
            index_record: &self.declaration.scope.receipt.pins[2].leaf,
        })
    }
    pub(in super::super) fn complete(
        &self,
        current: &RoundScope<'_>,
        entries: Vec<closure::Entry>,
        b: &mut SharedBudget<'_>,
    ) -> Result<ClosureObservation, Failure> {
        audit_owner!(b, Seal);
        self.guard(current, b)?;
        // Still required again by AfterScan; this is NOT permission to skip the strict phase.
        self.declaration.recheck(current, Some(&entries), b)?;
        b.checkpoint()?;
        Ok(ClosureObservation {
            lineage: current.receipt.lineage.clone(),
            records: current.receipt.binding.clone(),
            round: current.round,
            token: current.token.clone(),
            entries,
        })
    }
    fn canonical(&self, entry: &closure::Entry, b: &mut SharedBudget<'_>) -> Result<bool, Failure> {
        canonical::contains(self.declaration.entries(), &self.index, entry, b)
    }
    fn entries(&self) -> impl Iterator<Item = &closure::Entry> {
        self.declaration
            .entries()
            .iter()
            .chain(std::iter::once(&self.index))
    }
    fn guard(&self, current: &RoundScope<'_>, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        let result = (|| {
            self.declaration.ensure_scope(current, b)?;
            let declaration = self.phases.input_declaration(b)?;
            work(b)?;
            if !std::ptr::eq(self.declaration, declaration) {
                return Err(Failure::Binding);
            }
            Ok(())
        })();
        stop(result, b)
    }
    pub(in super::super) fn root<'p>(
        &'p self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<ParentInput<'p, 'i, 'd, 's, 'r>, Failure> {
        self.guard(current, b)?;
        Ok(ParentInput {
            inputs: self,
            entry: None,
        })
    }
    pub(in super::super) fn directory<'p>(
        &'p self,
        path: &str,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<ParentInput<'p, 'i, 'd, 's, 'r>, Failure> {
        let result = (|| {
            self.guard(current, b)?;
            work(b)?;
            if !closure::path(path) {
                return Err(Failure::Binding);
            }
            for entry in self.declaration.entries() {
                work(b)?;
                if entry.path() == path {
                    if !matches!(entry, closure::Entry::Directory { .. }) {
                        return Err(Failure::Binding);
                    }
                    return Ok(ParentInput {
                        inputs: self,
                        entry: Some(entry),
                    });
                }
            }
            Err(Failure::Binding)
        })();
        stop(result, b)
    }
    fn require_parent(
        &self,
        parent: &ParentInput<'_, '_, '_, '_, '_>,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        self.guard(current, b)?;
        work(b)?;
        if !std::ptr::eq(parent.inputs, self) {
            return b.stop(Failure::Binding);
        }
        if let Some(selected) = parent.entry {
            if self.canonical(selected, b)? && matches!(selected, closure::Entry::Directory { .. })
            {
                return Ok(());
            }
            return b.stop(Failure::Binding);
        }
        Ok(())
    }
    pub(in super::super) fn require_child(
        &self,
        parent: &ParentInput<'_, '_, '_, '_, '_>,
        child: &ChildInput<'_, '_, '_, '_, '_, '_>,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            self.require_parent(parent, current, b)?;
            work(b)?;
            if !std::ptr::eq(child.parent, parent) {
                return Err(Failure::Binding);
            }
            if self.canonical(child.entry, b)? && parent_of(child.entry.path()).0 == parent.path() {
                b.checkpoint()?;
                return Ok(());
            }
            Err(Failure::Binding)
        })();
        stop(result, b)
    }
}
impl<'p, 'i, 'd, 's, 'r> ParentInput<'p, 'i, 'd, 's, 'r> {
    pub(in super::super) fn path(&self) -> &str {
        self.entry.map_or("", closure::Entry::path)
    }
    pub(in super::super) fn expected<'c>(
        &'c self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<Vec<ChildInput<'c, 'p, 'i, 'd, 's, 'r>>, Failure> {
        let result = (|| {
            self.inputs.require_parent(self, current, b)?;
            let mut count = 0usize;
            for entry in self.inputs.entries() {
                work(b)?;
                if parent_of(entry.path()).0 == self.path() {
                    count += 1;
                }
            }
            work(b)?;
            if count > 100_001 {
                return Err(Failure::Limit);
            }
            let mut children = Vec::new();
            children
                .try_reserve_exact(count)
                .map_err(|_| Failure::Limit)?;
            for entry in self.inputs.entries() {
                work(b)?;
                if parent_of(entry.path()).0 == self.path() {
                    children.push(ChildInput {
                        parent: self,
                        entry,
                    });
                }
            }
            b.checkpoint()?;
            Ok(children)
        })();
        stop(result, b)
    }
}
impl<'p> ChildInput<'_, 'p, '_, '_, '_, '_> {
    pub(in super::super) fn name(&self) -> &str {
        parent_of(self.entry.path()).1
    }
    pub(in super::super) fn file(
        &self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(&'p closure::Entry, u64), Failure> {
        let result = (|| {
            let inputs = self.parent.inputs;
            inputs.require_child(self.parent, self, current, b)?;
            work(b)?;
            match self.entry {
                closure::Entry::File { size, .. } if *size > MAX_FILE => {
                    return Err(Failure::Limit);
                }
                closure::Entry::File { .. } => {}
                _ => return Err(Failure::Binding),
            }
            Ok((self.entry, inputs.root.stat.device))
        })();
        stop(result, b)
    }
}

#[cfg(test)]
mod tests;
