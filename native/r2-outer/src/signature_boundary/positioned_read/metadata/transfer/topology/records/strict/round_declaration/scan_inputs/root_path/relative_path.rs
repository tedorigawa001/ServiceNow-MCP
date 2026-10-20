//! Relative-path comparison contract only. No protected opener, native source or permit.
use super::*;

trait RelativeSource<R: ResourceOrigin>: RootPathSource<R> {
    // File-only open, same bounded one-attempt ownership contract as directory child().
    fn file(
        &mut self,
        parent: &Self::Temporary,
        name: &str,
    ) -> Result<Self::Temporary, SourceError>;
}
struct Edge<'e> {
    entry: &'e closure::Entry,
    snapshot: RecordSnapshot,
}
// Only a future protected initial-walk owner can mint these snapshots and resource origin.
// No production constructor from caller metadata, strings, FD numbers or prior diagnostics.
struct RelativeBinding<'v, 'c, 'p, 'i, 'd, 's, 'r, R: ResourceOrigin> {
    root: &'v RootBinding<'p, 'i, 'd, 's, 'r, R>,
    child: &'v ChildInput<'c, 'p, 'i, 'd, 's, 'r>,
    resource: &'v R,
    origin: Rc<()>,
    edges: Vec<Edge<'p>>,
    started: Cell<bool>,
}
impl<R: ResourceOrigin> std::fmt::Debug for RelativeBinding<'_, '_, '_, '_, '_, '_, '_, R> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RelativePathBinding(synthetic_only_not_execution_authority)")
    }
}
fn policy(
    entry: &closure::Entry,
    snapshot: &RecordSnapshot,
    device: u64,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    work(b)?;
    let s = &snapshot.stat;
    let valid = match entry {
        closure::Entry::Directory { mode, .. } => {
            mode == "0555" && s.kind == FileType::Directory && s.mode == 0o555 && s.links > 0
        }
        closure::Entry::File { mode, size, .. } => {
            if *size > MAX_FILE {
                return b.stop(Failure::Limit);
            }
            let mode = match mode.as_str() {
                "0444" => 0o444,
                "0555" => 0o555,
                _ => return b.stop(Failure::Binding),
            };
            s.kind == FileType::Regular && s.mode == mode && s.size == *size && s.links == 1
        }
    };
    if !valid
        || s.device != device
        || s.uid != 0
        || s.mtime.nanoseconds >= 1_000_000_000
        || s.ctime.nanoseconds >= 1_000_000_000
        || !matches!(
            snapshot.names,
            VisibleNames::Empty | VisibleNames::Provenance
        )
    {
        return b.stop(Failure::Binding);
    }
    Ok(())
}
fn validate<R: ResourceOrigin>(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    child: &ChildInput<'_, '_, '_, '_, '_, '_>,
    bound: &RelativeBinding<'_, '_, '_, '_, '_, '_, '_, R>,
    current: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    binding(inputs, bound.root, current, b)?;
    inputs.require_child(child.parent, child, current, b)?;
    work(b)?;
    if !std::ptr::eq(child, bound.child)
        || !Rc::ptr_eq(&bound.origin, bound.resource.resource_origin())
        || Rc::ptr_eq(&bound.origin, &bound.root.origin)
        || bound.edges.is_empty()
        || bound.edges.len() > 64
    {
        return b.stop(Failure::Binding);
    }
    let mut prefix = "";
    for (i, edge) in bound.edges.iter().enumerate() {
        work(b)?;
        if parent_of(edge.entry.path()).0 != prefix
            || (i + 1 < bound.edges.len()
                && !matches!(edge.entry, closure::Entry::Directory { .. }))
        {
            return b.stop(Failure::Binding);
        }
        let mut canonical = false;
        for entry in inputs.entries() {
            work(b)?;
            if std::ptr::eq(edge.entry, entry) {
                canonical = true;
                break;
            }
        }
        if !canonical {
            return b.stop(Failure::Binding);
        }
        policy(edge.entry, &edge.snapshot, inputs.root.stat.device, b)?;
        prefix = edge.entry.path();
    }
    work(b)?;
    if !std::ptr::eq(
        bound.edges.last().ok_or(Failure::Binding)?.entry,
        child.entry,
    ) {
        return b.stop(Failure::Binding);
    }
    Ok(())
}
fn guard_binding<R: ResourceOrigin>(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    bound: &RelativeBinding<'_, '_, '_, '_, '_, '_, '_, R>,
    current: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    binding(inputs, bound.root, current, b)?;
    work(b)?;
    if !Rc::ptr_eq(&bound.origin, bound.resource.resource_origin()) {
        return b.stop(Failure::Binding);
    }
    Ok(())
}
fn open_file<R: ResourceOrigin, S: RelativeSource<R>>(
    source: &Rc<RefCell<S>>,
    ledger: &Rc<RefCell<Ledger>>,
    parent: &Temporary<R, S>,
    name: &str,
    b: &mut SharedBudget<'_>,
) -> Result<Temporary<R, S>, Failure> {
    begin(ledger, true, b)?;
    let raw = source
        .borrow_mut()
        .file(parent.raw.as_ref().ok_or(Failure::Binding)?, name);
    let owned = raw.map(|raw| {
        let mut l = ledger.borrow_mut();
        l.live += 1;
        l.peak = l.peak.max(l.live);
        Temporary {
            source: source.clone(),
            ledger: ledger.clone(),
            raw: Some(raw),
        }
    });
    guard(ledger, b)?;
    owned.map_err(|_| Failure::Unavailable)
}
fn observe_relative<R: ResourceOrigin, S: RelativeSource<R>>(
    source: &Rc<RefCell<S>>,
    ledger: &RefCell<Ledger>,
    held: Option<&R>,
    temporary: Option<&Temporary<R, S>>,
    expected: &RecordSnapshot,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    begin(ledger, false, b)?;
    let raw = match (held, temporary) {
        (Some(held), None) => source.borrow_mut().held(held),
        (None, Some(temp)) => source
            .borrow_mut()
            .temporary(temp.raw.as_ref().ok_or(Failure::Binding)?),
        _ => return b.stop(Failure::Binding),
    };
    guard(ledger, b)?;
    let raw = raw.map_err(|_| Failure::MetadataUnavailable)?;
    work(b)?;
    if raw.before != raw.after {
        return b.stop(Failure::Changed);
    }
    if raw.after.kind == FileType::Unknown
        || raw.acl == Acl::Unknown
        || raw.names == VisibleNames::Unknown
        || raw.filesystem.location == Filesystem::Unknown
    {
        return b.stop(Failure::MetadataUnavailable);
    }
    if raw.acl != Acl::Absent
        || raw.filesystem.location != Filesystem::Local
        || !raw.filesystem.apfs
        || raw.filesystem.ownership_ignored
        || raw.filesystem.noexec
        || raw.after != expected.stat
        || raw.names != expected.names
    {
        return b.stop(Failure::Changed);
    }
    b.checkpoint()
}
fn recheck<R: ResourceOrigin, S: RelativeSource<R>>(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    child: &ChildInput<'_, '_, '_, '_, '_, '_>,
    bound: &RelativeBinding<'_, '_, '_, '_, '_, '_, '_, R>,
    current: &RoundScope<'_>,
    source: S,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let source = Rc::new(RefCell::new(source));
    // h,k<=64: (h+k+1) opens/observations + held root/leaf before/after.
    // A private per-rewalk cap, not new operational quota or a reset of SharedBudget.
    let ledger = Rc::new(RefCell::new(Ledger {
        attempt_limit: 262,
        ..Ledger::default()
    }));
    let result = (|| {
        validate(inputs, child, bound, current, b)?;
        work(b)?;
        if bound.started.replace(true) {
            return Err(Failure::Binding);
        }
        work(b)?;
        let receipt = inputs.declaration.scope.receipt;
        let absolute = absolute(&receipt.binding.runtime_root)?;
        let ancestors = &receipt.pins[2].ancestors;
        let leaf = &bound.edges.last().ok_or(Failure::Binding)?.snapshot;
        observe(
            &source,
            &ledger,
            Some(bound.root.resource),
            None,
            bound.root.baseline,
            true,
            b,
        )?;
        guard_binding(inputs, bound, current, b)?;
        observe_relative(&source, &ledger, Some(bound.resource), None, leaf, b)?;
        guard_binding(inputs, bound, current, b)?;
        let mut cursor = acquire(&source, &ledger, None, None, b)?;
        observe(
            &source,
            &ledger,
            None,
            Some(&cursor),
            &ancestors[0],
            false,
            b,
        )?;
        for (i, component) in absolute.iter().enumerate() {
            guard_binding(inputs, bound, current, b)?;
            let next = acquire(&source, &ledger, Some(&cursor), Some(component), b)?;
            observe(
                &source,
                &ledger,
                None,
                Some(&next),
                &ancestors[i + 1],
                i + 1 == absolute.len(),
                b,
            )?;
            cursor = next;
            guard(&ledger, b)?;
        }
        for edge in &bound.edges {
            guard_binding(inputs, bound, current, b)?;
            let name = parent_of(edge.entry.path()).1;
            let next = match edge.entry {
                closure::Entry::Directory { .. } => {
                    acquire(&source, &ledger, Some(&cursor), Some(name), b)?
                }
                closure::Entry::File { .. } => open_file(&source, &ledger, &cursor, name, b)?,
            };
            observe_relative(&source, &ledger, None, Some(&next), &edge.snapshot, b)?;
            cursor = next;
            guard(&ledger, b)?;
        }
        drop(cursor);
        guard(&ledger, b)?;
        guard_binding(inputs, bound, current, b)?;
        observe_relative(&source, &ledger, Some(bound.resource), None, leaf, b)?;
        guard_binding(inputs, bound, current, b)?;
        observe(
            &source,
            &ledger,
            Some(bound.root.resource),
            None,
            bound.root.baseline,
            true,
            b,
        )?;
        guard_binding(inputs, bound, current, b)?;
        Ok(())
    })();
    let result = stop(result, b);
    guard(&ledger, b)?;
    if ledger.borrow().live != 0 {
        return b.stop(Failure::Unavailable);
    }
    result
}

#[cfg(test)]
mod tests;
