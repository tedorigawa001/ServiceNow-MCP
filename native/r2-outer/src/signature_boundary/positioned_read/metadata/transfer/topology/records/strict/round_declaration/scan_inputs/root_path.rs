//! Comparison-only root rewalk. Synthetic producers only; no OS adapter or execution seal.
use super::*;
use crate::json::shared::Budget;
use crate::signature_boundary::positioned_read::metadata::collector::FsObservation;
use std::cell::{Cell, RefCell};

// This aggregate is bounded comparison data, NOT a credited native metadata primitive.
struct Observation {
    before: Stat,
    after: Stat,
    acl: Acl,
    filesystem: FsObservation,
    names: VisibleNames,
}
#[derive(Clone, Copy)]
enum SourceError {
    Interrupted,
    WouldBlock,
    Unavailable,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Release {
    Complete,
    Unconfirmed,
}
trait RootPathSource<R: ResourceOrigin> {
    type Temporary;
    // One bounded attempt. No retry, read, path substitution or default success.
    fn held(&mut self, root: &R) -> Result<Observation, SourceError>;
    // Resolve the fixed trusted '/', never reuse a possibly renamed retained root.
    fn anchor(&mut self) -> Result<Self::Temporary, SourceError>;
    fn child(
        &mut self,
        parent: &Self::Temporary,
        name: &str,
    ) -> Result<Self::Temporary, SourceError>;
    fn temporary(&mut self, resource: &Self::Temporary) -> Result<Observation, SourceError>;
    // No panic/retry. A numeric descriptor must not be released a second time on failure.
    fn release(&mut self, resource: Self::Temporary) -> Release;
}

// A future secure root owner must mint this privately. There is intentionally no
// production constructor or conversion from paths, raw FD numbers or observations.
struct RootBinding<'p, 'i, 'd, 's, 'r, R: ResourceOrigin> {
    inputs: &'p ScanInputs<'i, 'd, 's, 'r>,
    resource: &'p R,
    origin: Rc<()>,
    baseline: &'s RecordSnapshot,
    started: Cell<bool>,
}
impl<R: ResourceOrigin> std::fmt::Debug for RootBinding<'_, '_, '_, '_, '_, R> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanRootBinding(synthetic_only_not_execution_authority)")
    }
}
#[derive(Default)]
struct Ledger {
    attempts: u32,
    live: u32,
    peak: u32,
    releases: u32,
    unconfirmed: u32,
}
struct Temporary<R: ResourceOrigin, S: RootPathSource<R>> {
    source: Rc<RefCell<S>>,
    ledger: Rc<RefCell<Ledger>>,
    raw: Option<S::Temporary>,
}
impl<R: ResourceOrigin, S: RootPathSource<R>> Drop for Temporary<R, S> {
    fn drop(&mut self) {
        if let Some(raw) = self.raw.take() {
            let result = self.source.borrow_mut().release(raw);
            let mut l = self.ledger.borrow_mut();
            l.live -= 1;
            l.releases += 1;
            if result != Release::Complete {
                l.unconfirmed += 1;
            }
        }
    }
}
fn guard(ledger: &RefCell<Ledger>, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    b.checkpoint()?;
    if ledger.borrow().unconfirmed != 0 {
        return b.stop(Failure::Unavailable);
    }
    Ok(())
}
fn begin(ledger: &RefCell<Ledger>, acquire: bool, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
    guard(ledger, b)?;
    // h<=64: at most 65 opens + 65 temporary observations + 2 held observations.
    // This synthetic per-rewalk cap is NOT the approved scan operation quota.
    if ledger.borrow().attempts >= 132 || (acquire && ledger.borrow().live >= 2) {
        return b.stop(Failure::Limit);
    }
    b.work(if acquire { 2 } else { 1 })?; // acquisition prepays exactly one cleanup
    ledger.borrow_mut().attempts += 1;
    Ok(())
}
fn acquire<R: ResourceOrigin, S: RootPathSource<R>>(
    source: &Rc<RefCell<S>>,
    ledger: &Rc<RefCell<Ledger>>,
    parent: Option<&Temporary<R, S>>,
    name: Option<&str>,
    b: &mut SharedBudget<'_>,
) -> Result<Temporary<R, S>, Failure> {
    begin(ledger, true, b)?;
    let raw = match (parent, name) {
        (None, None) => source.borrow_mut().anchor(),
        (Some(parent), Some(name)) => source
            .borrow_mut()
            .child(parent.raw.as_ref().ok_or(Failure::Binding)?, name),
        _ => return b.stop(Failure::Binding),
    };
    // Own even late successes BEFORE the post-operation checkpoint.
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
fn compare(
    raw: Observation,
    baseline: &RecordSnapshot,
    root: bool,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    work(b)?;
    if raw.before != raw.after {
        return b.stop(Failure::Changed);
    }
    if raw.after.kind == FileType::Unknown
        || raw.acl == Acl::Unknown
        || raw.filesystem.location == Filesystem::Unknown
        || raw.names == VisibleNames::Unknown
    {
        return b.stop(Failure::MetadataUnavailable);
    }
    let s = &raw.after;
    // Explicit synthetic subset, not an approved profile for every macOS system ancestor.
    if raw.acl != Acl::Absent
        || raw.filesystem.location != Filesystem::Local
        || !raw.filesystem.apfs
        || raw.filesystem.ownership_ignored
        || raw.filesystem.noexec
        || !matches!(raw.names, VisibleNames::Empty | VisibleNames::Provenance)
        || s.kind != FileType::Directory
        || s.uid != 0
        || s.links == 0
        || if root {
            s.mode != 0o555
        } else {
            ![0o555, 0o755].contains(&s.mode)
        }
        || s.mtime.nanoseconds >= 1_000_000_000
        || s.ctime.nanoseconds >= 1_000_000_000
        || s != &baseline.stat
        || raw.names != baseline.names
    {
        return b.stop(Failure::Changed);
    }
    b.checkpoint()
}
fn observe<R: ResourceOrigin, S: RootPathSource<R>>(
    source: &Rc<RefCell<S>>,
    ledger: &RefCell<Ledger>,
    held: Option<&R>,
    temporary: Option<&Temporary<R, S>>,
    baseline: &RecordSnapshot,
    root: bool,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    begin(ledger, false, b)?;
    let raw = match (held, temporary) {
        (Some(r), None) => source.borrow_mut().held(r),
        (None, Some(r)) => source
            .borrow_mut()
            .temporary(r.raw.as_ref().ok_or(Failure::Binding)?),
        _ => return b.stop(Failure::Binding),
    };
    guard(ledger, b)?;
    compare(
        raw.map_err(|_| Failure::MetadataUnavailable)?,
        baseline,
        root,
        b,
    )
}
fn binding<R: ResourceOrigin>(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    bound: &RootBinding<'_, '_, '_, '_, '_, R>,
    current: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    inputs.guard(current, b)?;
    work(b)?;
    if !std::ptr::eq(inputs, bound.inputs)
        || !std::ptr::eq(inputs.root, bound.baseline)
        || !Rc::ptr_eq(&bound.origin, bound.resource.resource_origin())
    {
        return b.stop(Failure::Binding);
    }
    Ok(())
}
fn recheck<R: ResourceOrigin, S: RootPathSource<R>>(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    bound: &RootBinding<'_, '_, '_, '_, '_, R>,
    current: &RoundScope<'_>,
    source: S,
    b: &mut SharedBudget<'_>,
) -> Result<(), Failure> {
    let source = Rc::new(RefCell::new(source));
    let ledger = Rc::new(RefCell::new(Ledger::default()));
    let result = (|| {
        binding(inputs, bound, current, b)?;
        work(b)?;
        if bound.started.replace(true) {
            return Err(Failure::Binding);
        }
        work(b)?;
        let receipt = inputs.declaration.scope.receipt;
        let components = absolute(&receipt.binding.runtime_root)?;
        let ancestors = &receipt.pins[2].ancestors;
        if ancestors.len() <= components.len()
            || !std::ptr::eq(&ancestors[components.len()], bound.baseline)
        {
            return Err(Failure::Binding);
        }
        observe(
            &source,
            &ledger,
            Some(bound.resource),
            None,
            bound.baseline,
            true,
            b,
        )?;
        binding(inputs, bound, current, b)?;
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
        for (i, component) in components.iter().enumerate() {
            binding(inputs, bound, current, b)?;
            let next = acquire(&source, &ledger, Some(&cursor), Some(component), b)?;
            observe(
                &source,
                &ledger,
                None,
                Some(&next),
                &ancestors[i + 1],
                i + 1 == components.len(),
                b,
            )?;
            cursor = next; // old parent cleanup was prepaid; never gate Drop on cancellation
            guard(&ledger, b)?;
        }
        drop(cursor);
        guard(&ledger, b)?;
        binding(inputs, bound, current, b)?;
        observe(
            &source,
            &ledger,
            Some(bound.resource),
            None,
            bound.baseline,
            true,
            b,
        )?;
        binding(inputs, bound, current, b)?;
        Ok(())
    })();
    // All temporary owners have dropped on EVERY path before cleanup status is judged.
    let result = stop(result, b);
    guard(&ledger, b)?;
    if ledger.borrow().live != 0 {
        return b.stop(Failure::Unavailable);
    }
    result
}

#[cfg(test)]
mod tests;
