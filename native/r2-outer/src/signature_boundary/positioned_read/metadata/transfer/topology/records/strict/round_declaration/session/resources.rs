//! Session accounting only. No production policy constructor or ScanOps connection.
use super::*;
use std::cell::RefCell;

const MODEL: &str = "bp5-r2-session-allocation-0.1";
#[derive(Clone, Copy)]
pub(super) enum Operation {
    Open = 0,
    Enum = 1,
    Read = 2,
    Metadata = 3,
}
#[derive(Clone, Copy)]
struct Caps {
    attempts: [u64; 5],
    total: u64,
    live: u64,
    names: u64,
}
// Deliberately no production constructor. Raw model quantities are not a policy.
pub(super) struct ResourcePolicy {
    model: &'static str,
    session: Caps,
    rounds: [Caps; 3],
}
#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
struct Used {
    attempts: [u64; 5],
    total: u64,
    cleanup_reserved: u64,
    live_reserved: u64,
    live: u64,
    peak: u64,
    names: u64,
    unconfirmed: u64,
}
pub(super) struct Accounting {
    policy: ResourcePolicy,
    session: Used,
    rounds: [Used; 3],
}
impl ScanSessionLedger<'_> {
    pub(super) fn configure_resources(
        &mut self,
        policy: ResourcePolicy,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            work(b)?; // fixed five-class policy block, not quantity-model approval
            self.binding(b)?;
            if self.resources.is_some() || self.state != State::Expect(Round::Initial) {
                return Err(Failure::Binding);
            }
            if policy.model != MODEL {
                return Err(Failure::Unavailable);
            }
            b.checkpoint()?;
            self.resources = Some(Rc::new(RefCell::new(Accounting {
                policy,
                session: Used::default(),
                rounds: [Used::default(); 3],
            })));
            Ok(())
        })();
        match result {
            Ok(()) => Ok(()),
            Err(e) => self.fail(e, b),
        }
    }
}
struct Marker;
pub(super) struct Boundary<'s> {
    marker: &'s Marker,
    book: Rc<RefCell<Accounting>>,
    origin: Rc<()>,
    claim: Rc<ScanSessionClaim>,
    started: Instant,
    slot: usize,
}
impl RoundResourceScope<'_, '_, '_> {
    pub(super) fn with_resources(
        &mut self,
        b: &mut SharedBudget<'_>,
        run: impl for<'s> FnOnce(&Boundary<'s>, &mut SharedBudget<'_>) -> Result<(), Failure>,
    ) -> Result<(), Failure> {
        self.require(self.scope, b)?;
        let Some(book) = self.ledger.resources.clone() else {
            return self.ledger.fail(Failure::Unavailable, b);
        };
        let slot = match self.scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        let marker = Marker;
        let boundary = Boundary {
            marker: &marker,
            book,
            origin: self.ledger.origin.clone(),
            claim: self.ledger.claim.clone(),
            started: self.ledger.started,
            slot,
        };
        let result = run(&boundary, b);
        // Leaked/forgotten owners are not cleanup evidence. Never reset their counters.
        let used = boundary.book.borrow().rounds[slot];
        let result = result.and_then(|()| {
            if used.live != 0
                || used.live_reserved != 0
                || used.cleanup_reserved != 0
                || used.unconfirmed != 0
            {
                Err(Failure::Unavailable)
            } else {
                b.checkpoint()
            }
        });
        match result {
            Ok(()) => Ok(()), // DOES NOT acknowledge round/strict completion
            Err(e) => self.ledger.fail(e, b),
        }
    }
}
fn add(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_add(b).ok_or(Failure::Limit)
}
fn candidate(mut u: Used, cap: Caps, op: Operation, acquire: bool) -> Result<Used, Failure> {
    if u.unconfirmed != 0 {
        return Err(Failure::Unavailable);
    }
    let i = op as usize;
    u.attempts[i] = add(u.attempts[i], 1)?;
    u.total = add(u.total, 1)?;
    if u.attempts[i] > cap.attempts[i] || u.total > cap.total {
        return Err(Failure::Limit);
    }
    if acquire {
        u.cleanup_reserved = add(u.cleanup_reserved, 1)?;
        u.live_reserved = add(u.live_reserved, 1)?;
    }
    // Include existing reservations on EVERY operation, not only acquire.
    if add(u.attempts[4], u.cleanup_reserved)? > cap.attempts[4]
        || add(u.total, u.cleanup_reserved)? > cap.total
        || add(u.live, u.live_reserved)? > cap.live
    {
        return Err(Failure::Limit);
    }
    Ok(u)
}
impl Boundary<'_> {
    fn prepare(
        &self,
        op: Operation,
        acquire: bool,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let result = (|| {
            b.checkpoint()?;
            if !Rc::ptr_eq(&self.origin, &b.inspection_origin)
                || !Rc::ptr_eq(&self.claim, &b.scan_session_claim)
                || self.started != b.started
            {
                return Err(Failure::Binding);
            }
            let (session, round) = {
                let a = self.book.borrow();
                (
                    candidate(a.session, a.policy.session, op, acquire)?,
                    candidate(a.rounds[self.slot], a.policy.rounds[self.slot], op, acquire)?,
                )
            };
            work(b)?; // fixed paired accounting/dispatch block
            if acquire {
                work(b)?;
            } // prepaid cleanup: no new work in Drop
            b.checkpoint()?;
            let mut a = self.book.borrow_mut();
            a.session = session;
            a.rounds[self.slot] = round;
            Ok(())
        })();
        match result {
            Ok(()) => Ok(()),
            Err(e) => b.stop(e),
        }
    }
    pub(super) fn attempt(
        &self,
        op: Operation,
        b: &mut SharedBudget<'_>,
        run: impl FnOnce() -> Result<(), Failure>,
    ) -> Result<(), Failure> {
        if matches!(op, Operation::Open) {
            return b.stop(Failure::Binding);
        }
        self.prepare(op, false, b)?;
        let result = run();
        match result {
            Ok(()) => b.checkpoint(),
            Err(e) => b.stop(e),
        }
    }
    pub(super) fn acquire<T: Resource>(
        &self,
        op: Operation,
        b: &mut SharedBudget<'_>,
        run: impl FnOnce() -> Result<T, Failure>,
    ) -> Result<Owner<'_, T>, Failure> {
        if !matches!(op, Operation::Open | Operation::Metadata) {
            return b.stop(Failure::Binding);
        }
        self.prepare(op, true, b)?;
        let mut pending = Acquisition {
            book: self.book.clone(),
            slot: self.slot,
            committed: false,
        };
        let result = run().map(|raw| {
            let mut a = self.book.borrow_mut();
            let Accounting {
                session, rounds, ..
            } = &mut *a;
            for u in [session, &mut rounds[self.slot]] {
                u.live_reserved -= 1;
                u.live += 1;
                u.peak = u.peak.max(u.live);
            }
            pending.committed = true;
            Owner {
                _marker: self.marker,
                raw: Some(raw),
                book: self.book.clone(),
                claim: self.claim.clone(),
                slot: self.slot,
            }
        });
        drop(pending); // no-handle failure returns ONLY unused cleanup/live reservations
        // The successful resource is already RAII-owned before a late cancel/deadline.
        b.checkpoint()?;
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
    pub(super) fn copy_names(
        &self,
        capacity: u64,
        b: &mut SharedBudget<'_>,
        run: impl FnOnce() -> Result<u64, Failure>,
    ) -> Result<(), Failure> {
        let valid = {
            let a = self.book.borrow();
            capacity > 0
                && capacity <= 65536
                && add(a.session.names, capacity).is_ok_and(|n| n <= a.policy.session.names)
                && add(a.rounds[self.slot].names, capacity)
                    .is_ok_and(|n| n <= a.policy.rounds[self.slot].names)
        };
        if !valid {
            return b.stop(Failure::Limit);
        }
        self.prepare(Operation::Metadata, false, b)?;
        match run() {
            Ok(n) => {
                let mut a = self.book.borrow_mut();
                // bounded actual bytes survive late/malformed responses; no capacity refund
                a.session.names += n.min(capacity);
                a.rounds[self.slot].names += n.min(capacity);
                drop(a);
                if n > capacity {
                    return b.stop(Failure::ReadFailed);
                }
                b.checkpoint()
            }
            Err(e) => b.stop(e),
        }
    }
}
struct Acquisition {
    book: Rc<RefCell<Accounting>>,
    slot: usize,
    committed: bool,
}
impl Drop for Acquisition {
    fn drop(&mut self) {
        if !self.committed {
            let mut a = self.book.borrow_mut();
            a.session.cleanup_reserved -= 1;
            a.session.live_reserved -= 1;
            a.rounds[self.slot].cleanup_reserved -= 1;
            a.rounds[self.slot].live_reserved -= 1;
        }
    }
}
// Single non-panicking release attempt; false means unconfirmed, never retry a numeric FD.
pub(super) trait Resource {
    fn release(self) -> bool;
}
pub(super) struct Owner<'s, T: Resource> {
    _marker: &'s Marker,
    raw: Option<T>,
    book: Rc<RefCell<Accounting>>,
    claim: Rc<ScanSessionClaim>,
    slot: usize,
}
impl<T: Resource> Drop for Owner<'_, T> {
    fn drop(&mut self) {
        if let Some(raw) = self.raw.take() {
            {
                let mut a = self.book.borrow_mut();
                a.session.live -= 1;
                a.session.cleanup_reserved -= 1;
                a.session.attempts[4] += 1;
                a.session.total += 1;
                a.rounds[self.slot].live -= 1;
                a.rounds[self.slot].cleanup_reserved -= 1;
                a.rounds[self.slot].attempts[4] += 1;
                a.rounds[self.slot].total += 1;
            }
            if !raw.release() {
                let mut a = self.book.borrow_mut();
                a.session.unconfirmed += 1;
                a.rounds[self.slot].unconfirmed += 1;
                self.claim.failure.set(Some(
                    self.claim.failure.get().unwrap_or(Failure::Unavailable),
                ));
            }
        }
    }
}

#[cfg(test)]
mod tests;
