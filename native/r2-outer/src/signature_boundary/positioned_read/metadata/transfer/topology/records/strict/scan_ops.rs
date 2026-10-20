//! Single-attempt internal boundary. No OS backend or operational quota/scope constructor.
use super::*;
use crate::signature_boundary::positioned_read::metadata::collector::FsObservation;
use std::cell::{Cell, RefCell};

mod child_set;
pub(super) mod collector;
mod declared_read;
mod normalized_metadata;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Anchor,
    Directory,
    File,
    Cursor,
    Acl,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Op {
    Open = 0,
    Enum = 1,
    Read = 2,
    Metadata = 3,
    Cleanup = 4,
}
#[derive(Clone, Copy)]
enum OpFailure {
    Interrupted,
    WouldBlock,
    Unavailable,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Cleanup {
    Released,
    Unconfirmed,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum MetaOp {
    Stat,
    Filesystem,
    AclStat,
    AclQuery,
    NamesSize,
    NamesRead,
}
enum MetaValue {
    Stat(Stat),
    Filesystem(FsObservation),
    Acl(i32),
    Size(i64),
    Bytes(usize),
}
enum EnumValue {
    End,
    Name(usize),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReadStep {
    Complete,
    Interrupted,
}

// Exactly one attempt per call. No hidden retry/skip/refill, path substitution, allocation
// loops or panic. Errors transfer no handle; successful handles are owned by the receiver.
// cleanup must be non-panicking and must never retry a numeric descriptor after failure.
trait ScanOps {
    type Handle;
    fn open(
        &mut self,
        parent: Option<&Self::Handle>,
        name: Option<&str>,
        kind: Kind,
    ) -> Result<Self::Handle, OpFailure>;
    fn acl_init(&mut self, file: &Self::Handle) -> Result<Self::Handle, OpFailure>;
    fn enumerate(
        &mut self,
        cursor: &Self::Handle,
        output: &mut [u8; 255],
    ) -> Result<EnumValue, OpFailure>;
    fn read(
        &mut self,
        file: &Self::Handle,
        offset: u64,
        output: &mut [u8],
    ) -> Result<usize, OpFailure>;
    fn metadata(
        &mut self,
        handle: &Self::Handle,
        op: MetaOp,
        output: &mut [u8],
    ) -> Result<MetaValue, OpFailure>;
    fn cleanup(&mut self, handle: Self::Handle) -> Cleanup;
}
// Synthetic tests supply these privately. There is NO approved operational producer.
struct Quotas {
    attempts: [u64; 5],
    live: u64,
    name_bytes: u64,
}
#[derive(Clone, Copy, PartialEq, Eq)]
struct PendingRead {
    serial: u64,
    offset: u64,
    length: usize,
    eof: bool,
}
#[derive(Default)]
struct Ledger {
    attempts: [u64; 5],
    reserved_cleanup: u64,
    reserved_live: u64,
    live: u64,
    peak: u64,
    names: u64,
    serial: u64,
    unconfirmed: u64,
    retry: Option<PendingRead>,
    declared_pending: u64,
    declared_abandoned: bool,
}
struct ScopeMarker;
struct Resource<'s, S: ScanOps> {
    _scope: &'s ScopeMarker,
    source: Rc<RefCell<S>>,
    ledger: Rc<RefCell<Ledger>>,
    raw: Option<S::Handle>,
    kind: Kind,
    serial: u64,
    declared: Cell<bool>,
}
impl<S: ScanOps> std::fmt::Debug for Resource<'_, S> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanResource(pending_not_execution_authority)")
    }
}
impl<S: ScanOps> Drop for Resource<'_, S> {
    fn drop(&mut self) {
        if let Some(raw) = self.raw.take() {
            {
                let mut l = self.ledger.borrow_mut();
                l.live -= 1;
                l.reserved_cleanup -= 1;
                l.attempts[Op::Cleanup as usize] += 1;
            }
            // Cleanup was prepaid and reserved BEFORE acquire. Never gate it on work()/cancel.
            let result = self.source.borrow_mut().cleanup(raw);
            if result != Cleanup::Released {
                self.ledger.borrow_mut().unconfirmed += 1;
            }
        }
    }
}
struct Acquisition {
    ledger: Rc<RefCell<Ledger>>,
    committed: bool,
}
impl Drop for Acquisition {
    fn drop(&mut self) {
        if !self.committed {
            let mut l = self.ledger.borrow_mut();
            l.reserved_cleanup -= 1;
            l.reserved_live -= 1;
        }
    }
}
struct Boundary<'s, 'b, 'a, S: ScanOps> {
    marker: &'s ScopeMarker,
    source: Rc<RefCell<S>>,
    ledger: Rc<RefCell<Ledger>>,
    quotas: Quotas,
    budget: &'b mut SharedBudget<'a>,
}
impl<'s, S: ScanOps> Boundary<'s, '_, '_, S> {
    fn fail<T>(&mut self, e: Failure) -> Result<T, Failure> {
        self.budget.stop(e)
    }
    fn begin(&mut self, op: Op, acquire: bool) -> Result<(), Failure> {
        self.budget.checkpoint()?;
        let valid = {
            let l = self.ledger.borrow();
            if l.unconfirmed != 0 {
                return self.budget.stop(Failure::Unavailable);
            }
            if l.declared_abandoned {
                return self.budget.stop(Failure::Changed);
            }
            if l.retry.is_some() && op != Op::Read {
                return self.budget.stop(Failure::Binding);
            }
            l.attempts[op as usize]
                .checked_add(1)
                .is_some_and(|n| n <= self.quotas.attempts[op as usize])
                && (!acquire
                    || (l.attempts[4]
                        .checked_add(l.reserved_cleanup)
                        .and_then(|n| n.checked_add(1))
                        .is_some_and(|n| n <= self.quotas.attempts[4])
                        && l.live
                            .checked_add(l.reserved_live)
                            .and_then(|n| n.checked_add(1))
                            .is_some_and(|n| n <= self.quotas.live)
                        && l.serial.checked_add(1).is_some()))
        };
        if !valid {
            return self.fail(Failure::Limit);
        }
        use crate::json::shared::Budget;
        self.budget.work(if acquire { 2 } else { 1 })?;
        let mut l = self.ledger.borrow_mut();
        l.attempts[op as usize] += 1;
        if acquire {
            l.reserved_cleanup += 1;
            l.reserved_live += 1;
        }
        Ok(())
    }
    fn check(&mut self, r: &Resource<'_, S>) -> Result<(), Failure> {
        self.budget.checkpoint()?;
        if !Rc::ptr_eq(&self.ledger, &r.ledger)
            || !Rc::ptr_eq(&self.source, &r.source)
            || r.raw.is_none()
        {
            return self.fail(Failure::Binding);
        }
        Ok(())
    }
    fn own(&self, raw: S::Handle, kind: Kind, pending: &mut Acquisition) -> Resource<'s, S> {
        let serial = {
            let mut l = self.ledger.borrow_mut();
            l.reserved_live -= 1;
            l.live += 1;
            l.peak = l.peak.max(l.live);
            l.serial += 1;
            l.serial
        };
        pending.committed = true;
        Resource {
            _scope: self.marker,
            source: self.source.clone(),
            ledger: self.ledger.clone(),
            raw: Some(raw),
            kind,
            serial,
            declared: Cell::new(false),
        }
    }
    fn acquire(
        &mut self,
        parent: Option<&Resource<'_, S>>,
        name: Option<&str>,
        kind: Kind,
    ) -> Result<Resource<'s, S>, Failure> {
        if let Some(p) = parent {
            self.check(p)?;
        }
        let valid = match kind {
            Kind::Anchor => parent.is_none() && name.is_none(),
            Kind::Directory | Kind::File => {
                parent.is_some_and(|p| matches!(p.kind, Kind::Anchor | Kind::Directory))
                    && name.is_some_and(component)
            }
            Kind::Cursor => {
                parent.is_some_and(|p| matches!(p.kind, Kind::Anchor | Kind::Directory))
                    && name.is_none()
            }
            Kind::Acl => parent.is_some_and(|p| p.kind != Kind::Acl) && name.is_none(),
        };
        if !valid {
            return self.fail(Failure::Binding);
        }
        self.begin(
            if kind == Kind::Acl {
                Op::Metadata
            } else {
                Op::Open
            },
            true,
        )?;
        let mut pending = Acquisition {
            ledger: self.ledger.clone(),
            committed: false,
        };
        let result = {
            let mut s = self.source.borrow_mut();
            if kind == Kind::Acl {
                s.acl_init(
                    parent
                        .and_then(|p| p.raw.as_ref())
                        .expect("validated parent"),
                )
            } else {
                s.open(parent.and_then(|p| p.raw.as_ref()), name, kind)
            }
        };
        // Give even a late success an owner BEFORE checking cancel/deadline.
        let owned = result.map(|raw| self.own(raw, kind, &mut pending));
        drop(pending);
        self.budget.checkpoint()?;
        owned.map_err(|_| {
            let e = if kind == Kind::Acl {
                Failure::MetadataUnavailable
            } else {
                Failure::Unavailable
            };
            let _ = self.budget.stop::<()>(e);
            self.budget.failed.unwrap_or(e)
        })
    }
    fn enumerate(
        &mut self,
        r: &Resource<'_, S>,
        out: &mut [u8; 255],
    ) -> Result<EnumValue, Failure> {
        self.check(r)?;
        if r.kind != Kind::Cursor {
            return self.fail(Failure::Binding);
        }
        self.begin(Op::Enum, false)?;
        let result = self
            .source
            .borrow_mut()
            .enumerate(r.raw.as_ref().expect("owned"), out);
        // Structural classification work, not a full expected/seen-name comparison.
        work(self.budget)?;
        let value = match result {
            Ok(v) => v,
            Err(_) => return self.fail(Failure::ReadFailed),
        };
        match value {
            EnumValue::Name(n) => {
                if n == 0 || n > out.len() {
                    return self.fail(Failure::Changed);
                }
                let valid = std::str::from_utf8(&out[..n]).ok().is_some_and(|s| {
                    !s.chars().any(char::is_control) && !s.contains('/') && !s.contains('\\')
                });
                if !valid {
                    return self.fail(Failure::Changed);
                }
            }
            EnumValue::End => {}
        }
        self.budget.checkpoint()?;
        Ok(value)
    }
    fn read_once(
        &mut self,
        r: &Resource<'_, S>,
        offset: u64,
        out: &mut [u8],
    ) -> Result<ReadStep, Failure> {
        self.transfer_once(r, offset, out, false, None)
    }
    fn eof_once(
        &mut self,
        r: &Resource<'_, S>,
        offset: u64,
        out: &mut [u8; 1],
    ) -> Result<ReadStep, Failure> {
        self.transfer_once(r, offset, out, true, None)
    }
    fn transfer_once(
        &mut self,
        r: &Resource<'_, S>,
        offset: u64,
        out: &mut [u8],
        eof: bool,
        access: Option<declared_read::DeclaredAccess<'_, '_, S>>,
    ) -> Result<ReadStep, Failure> {
        self.check(r)?;
        let authorized = match access {
            Some(access) => r.declared.get() && access.matches(r, offset, out.len(), eof),
            None => !r.declared.get(),
        };
        if !authorized {
            return self.fail(Failure::Binding);
        }
        if r.kind != Kind::File
            || out.is_empty()
            || out.len() > MAX_CHUNK
            || (eof && out.len() != 1)
            || offset
                .checked_add(out.len() as u64)
                .is_none_or(|n| n > MAX_FILE + u64::from(eof))
        {
            return self.fail(Failure::InvalidRange);
        }
        let request = PendingRead {
            serial: r.serial,
            offset,
            length: out.len(),
            eof,
        };
        if self.ledger.borrow().retry.is_some_and(|p| p != request) {
            return self.fail(Failure::Binding);
        }
        // Preserve A/B credit: this unreserved read must fit alongside ALL existing reservations.
        if self
            .budget
            .used
            .checked_add(self.budget.reserved)
            .and_then(|n| n.checked_add(out.len() as u64))
            .is_none_or(|n| n > MAX_BYTES)
        {
            return self.fail(Failure::Limit);
        }
        self.begin(Op::Read, false)?;
        let result = self
            .source
            .borrow_mut()
            .read(r.raw.as_ref().expect("owned"), offset, out);
        if let Ok(n) = result {
            self.budget.account_read(n.min(out.len()) as u64)?;
        }
        work(self.budget)?; // exactly one classification step, including EINTR
        match result {
            Ok(n) if n == if eof { 0 } else { out.len() } => {
                self.ledger.borrow_mut().retry = None;
                Ok(ReadStep::Complete)
            }
            Ok(n) if eof && n <= out.len() => {
                out.fill(0);
                self.fail(Failure::Changed)
            }
            Ok(n) if n < out.len() => {
                out.fill(0);
                self.fail(Failure::Changed)
            }
            Ok(_) => {
                out.fill(0);
                self.fail(Failure::ReadFailed)
            }
            Err(OpFailure::Interrupted) if self.budget.retries_left > 0 => {
                self.budget.retries_left -= 1;
                self.ledger.borrow_mut().retry = Some(request);
                Ok(ReadStep::Interrupted)
            }
            Err(_) => self.fail(Failure::ReadFailed),
        }
    }
    fn metadata(
        &mut self,
        r: &Resource<'_, S>,
        op: MetaOp,
        out: &mut [u8],
    ) -> Result<MetaValue, Failure> {
        self.check(r)?;
        let valid = match op {
            MetaOp::AclStat | MetaOp::AclQuery => r.kind == Kind::Acl,
            _ => r.kind != Kind::Acl,
        };
        if !valid || out.len() > 65536 {
            return self.fail(Failure::Binding);
        }
        if matches!(op, MetaOp::NamesRead) {
            if out.is_empty() {
                return self.fail(Failure::Binding);
            }
            if self
                .ledger
                .borrow()
                .names
                .checked_add(out.len() as u64)
                .is_none_or(|n| n > self.quotas.name_bytes)
            {
                return self.fail(Failure::Limit);
            }
        } else if !out.is_empty() {
            return self.fail(Failure::Binding);
        }
        self.begin(Op::Metadata, false)?;
        let result = self
            .source
            .borrow_mut()
            .metadata(r.raw.as_ref().expect("owned"), op, out);
        // Account copied bytes even for a late/malformed response, independently of target metadata.
        if let Ok(MetaValue::Bytes(n)) = &result {
            let mut l = self.ledger.borrow_mut();
            let Some(total) = l.names.checked_add((*n).min(out.len()) as u64) else {
                drop(l);
                return self.fail(Failure::Limit);
            };
            l.names = total;
        }
        self.budget.checkpoint()?;
        let value = match result {
            Ok(v) => v,
            Err(_) => return self.fail(Failure::MetadataUnavailable),
        };
        let valid = match (&op, &value) {
            (MetaOp::Stat | MetaOp::AclStat, MetaValue::Stat(_))
            | (MetaOp::Filesystem, MetaValue::Filesystem(_)) => true,
            (MetaOp::AclQuery, MetaValue::Acl(n)) => *n == 0 || *n == 1,
            (MetaOp::NamesSize, MetaValue::Size(n)) => *n >= 0 && *n <= 65536,
            (MetaOp::NamesRead, MetaValue::Bytes(n)) => *n <= out.len(),
            _ => false,
        };
        if !valid {
            return self.fail(Failure::MetadataUnavailable);
        }
        Ok(value)
    }
}
fn component(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 255
        && s != "."
        && s != ".."
        && !s.contains('/')
        && !s.contains('\\')
        && !s.chars().any(char::is_control)
}

struct Summary {
    attempts: [u64; 5],
    live: u64,
    pending_cleanup: u64,
    unconfirmed: u64,
    retry_pending: bool,
    names: u64,
    peak: u64,
    declared_pending: u64,
}
impl std::fmt::Debug for Summary {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanOpsSummary(counts_only_not_execution_authority)")
    }
}
struct Outcome<T> {
    result: Result<T, Failure>,
    summary: Summary,
}

// Private internal harness. No operational caller, approved quota producer or OS implementation.
fn with_boundary<'a, S: ScanOps, T>(
    source: S,
    quotas: Option<Quotas>,
    budget: &mut SharedBudget<'a>,
    run: impl for<'s, 'b> FnOnce(&mut Boundary<'s, 'b, 'a, S>) -> Result<T, Failure>,
) -> Outcome<T> {
    audit_owner!(budget, Control);
    let ledger = Rc::new(RefCell::new(Ledger::default()));
    let source = Rc::new(RefCell::new(source));
    let marker = ScopeMarker;
    let result = (|| {
        budget.checkpoint()?;
        let Some(quotas) = quotas else {
            return budget.stop(Failure::Unavailable);
        };
        if quotas.live > 132 || quotas.attempts.iter().any(|n| *n > 1_000_000) {
            return budget.stop(Failure::Limit);
        }
        work(budget)?; // internal scope setup, separate from dispatch/prepaid cleanup
        let mut boundary = Boundary {
            marker: &marker,
            source: source.clone(),
            ledger: ledger.clone(),
            quotas,
            budget,
        };
        let result = run(&mut boundary);
        let result = match result {
            Ok(v) => Ok(v),
            Err(e) => boundary.budget.stop(e),
        };
        drop(boundary);
        result
    })();
    drop(source); // release source ownership before the terminal guard
    let l = ledger.borrow();
    let summary = Summary {
        attempts: l.attempts,
        live: l.live,
        pending_cleanup: l.reserved_cleanup,
        unconfirmed: l.unconfirmed,
        retry_pending: l.retry.is_some(),
        names: l.names,
        peak: l.peak,
        declared_pending: l.declared_pending,
    };
    drop(l);
    if summary.live != 0 || summary.pending_cleanup != 0 || summary.unconfirmed != 0 {
        let _ = budget.stop::<()>(Failure::Unavailable);
    } else if summary.retry_pending {
        let _ = budget.stop::<()>(Failure::ReadFailed);
    } else if summary.declared_pending != 0 {
        let _ = budget.stop::<()>(Failure::Changed);
    }
    // No work is charged after a sticky stop; prepaid cleanup has still run.
    let final_guard = budget.checkpoint().and_then(|_| work(budget));
    let result = match final_guard {
        Err(e) => Err(e),
        Ok(()) => result,
    };
    Outcome { result, summary }
}

#[cfg(test)]
mod tests;
