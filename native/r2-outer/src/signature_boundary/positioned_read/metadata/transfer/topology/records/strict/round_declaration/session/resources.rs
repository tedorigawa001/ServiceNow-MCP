//! Internal accounting and fixed ScanOps hooks. No production policy constructor.
use super::*;
use std::cell::RefCell;
pub(in super::super::super) mod draft;
mod management;

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
    connected: [bool; 3],
    terminalized: [bool; 3],
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
                connected: [false; 3],
                terminalized: [false; 3],
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
pub(in super::super::super) struct Boundary<'s> {
    marker: &'s Marker,
    book: Rc<RefCell<Accounting>>,
    origin: Rc<()>,
    claim: Rc<ScanSessionClaim>,
    started: Instant,
    slot: usize,
    active: Rc<Cell<bool>>,
    round_identity: *const (),
    round_token: Rc<()>,
}
#[derive(Clone)]
pub(in super::super::super) struct Connection {
    book: Rc<RefCell<Accounting>>,
    origin: Rc<()>,
    claim: Rc<ScanSessionClaim>,
    started: Instant,
    slot: usize,
    active: Rc<Cell<bool>>,
    round_identity: *const (),
    round_token: Rc<()>,
}
// Not Clone/serde and no constructor outside the terminal binding method below.
pub(in super::super::super) struct RetiredConnection {
    _book: Rc<RefCell<Accounting>>,
    _origin: Rc<()>,
    _claim: Rc<ScanSessionClaim>,
    _started: Instant,
    _slot: usize,
    _round_identity: *const (),
    _round_token: Rc<()>,
}
impl RetiredConnection {
    pub(in super::super::super) fn require_completion(
        &self,
        lease: &RoundResourceScope<'_, '_, '_>,
        b: &SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let scope = lease.scope;
        let slot = match scope.round {
            Round::Initial => 0,
            Round::BeforeM4 => 1,
            Round::AfterM4 => 2,
        };
        let book = lease.ledger.resources.as_ref().ok_or(Failure::Binding)?;
        let a = self._book.borrow();
        if !Rc::ptr_eq(&self._book, book)
            || !Rc::ptr_eq(&self._origin, &b.inspection_origin)
            || !Rc::ptr_eq(&self._claim, &b.scan_session_claim)
            || self._started != b.started
            || self._slot != slot
            || self._round_identity != scope as *const RoundScope<'_> as *const ()
            || !Rc::ptr_eq(&self._round_token, &scope.token)
            || !std::ptr::eq(lease.ledger.receipt, scope.receipt)
            || !Rc::ptr_eq(&lease.ledger.lineage, &scope.receipt.lineage)
            || !std::ptr::eq(lease.ledger.target, scope.target)
            || !std::ptr::eq(lease.ledger.context, scope.context)
            || !lease.ledger.tokens[slot]
                .as_ref()
                .is_some_and(|t| Rc::ptr_eq(t, &scope.token))
            || !a.connected[slot]
            || !a.terminalized[slot]
        {
            return Err(Failure::Binding);
        }
        Ok(())
    }
}
struct Active(Rc<Cell<bool>>);
impl Drop for Active {
    fn drop(&mut self) {
        self.0.set(false);
    }
}
impl RoundResourceScope<'_, '_, '_> {
    pub(in super::super::super) fn with_resources(
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
        let active = Rc::new(Cell::new(true));
        let _active = Active(active.clone());
        let boundary = Boundary {
            marker: &marker,
            book,
            origin: self.ledger.origin.clone(),
            claim: self.ledger.claim.clone(),
            started: self.ledger.started,
            slot,
            active,
            round_identity: self.scope as *const RoundScope<'_> as *const (),
            round_token: self.scope.token.clone(),
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
    pub(in super::super::super) fn connect(
        &self,
        current: &RoundScope<'_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<Connection, Failure> {
        let fresh = !std::mem::replace(&mut self.book.borrow_mut().connected[self.slot], true);
        let result = (|| {
            work(b)?;
            if !fresh {
                return Err(Failure::Binding);
            }
            if super::super::super::scan_ops::collector::SESSION_ENTRY_MODEL_ID
                != "bp5-r2-session-collector-entry-0.2"
            {
                return Err(Failure::Unavailable);
            }
            self.check_binding(b)?;
            if self.round_identity != current as *const RoundScope<'_> as *const ()
                || !Rc::ptr_eq(&self.round_token, &current.token)
            {
                return Err(Failure::Binding);
            }
            b.checkpoint()?;
            Ok(Connection {
                book: self.book.clone(),
                origin: self.origin.clone(),
                claim: self.claim.clone(),
                started: self.started,
                slot: self.slot,
                active: self.active.clone(),
                round_identity: self.round_identity,
                round_token: self.round_token.clone(),
            })
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
    fn check_binding(&self, b: &SharedBudget<'_>) -> Result<(), Failure> {
        if !self.active.get()
            || self.book.borrow().terminalized[self.slot]
            || !Rc::ptr_eq(&self.origin, &b.inspection_origin)
            || !Rc::ptr_eq(&self.claim, &b.scan_session_claim)
            || self.started != b.started
        {
            return Err(Failure::Binding);
        }
        Ok(())
    }
    fn prepare(
        &self,
        op: Operation,
        acquire: bool,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        self.prepare_inner(op, acquire, b, true)
    }
    fn prepare_inner(
        &self,
        op: Operation,
        acquire: bool,
        b: &mut SharedBudget<'_>,
        charge: bool,
    ) -> Result<(), Failure> {
        let result = (|| {
            b.checkpoint()?;
            self.check_binding(b)?;
            let (session, round) = {
                let a = self.book.borrow();
                (
                    candidate(a.session, a.policy.session, op, acquire)?,
                    candidate(a.rounds[self.slot], a.policy.rounds[self.slot], op, acquire)?,
                )
            };
            if charge {
                work(b)?; // standalone accounting boundary only
                if acquire {
                    work(b)?;
                }
            } // Connected ScanOps already prepaid dispatch/cleanup exactly once.
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
impl Connection {
    pub(in super::super::super) fn abandon_cleanup(&self) {
        self.active.set(false);
        self.book.borrow_mut().terminalized[self.slot] = true;
    }
    pub(in super::super::super) fn retire_cleanup(
        &self,
        local: &super::super::super::scan_ops::cleanup::LocalTerminal<'_>,
        b: &SharedBudget<'_>,
    ) -> Result<RetiredConnection, Failure> {
        let active = self.active.replace(false);
        let mut a = self.book.borrow_mut();
        let fresh = !std::mem::replace(&mut a.terminalized[self.slot], true);
        if !active
            || !fresh
            || !a.connected[self.slot]
            || !Rc::ptr_eq(&self.origin, &b.inspection_origin)
            || !Rc::ptr_eq(&self.claim, &b.scan_session_claim)
            || self.started != b.started
        {
            return Err(Failure::Binding);
        }
        let l = local.counts();
        let u = a.rounds[self.slot];
        let total = l.attempts.iter().try_fold(0_u64, |n, v| n.checked_add(*v));
        if u.attempts != l.attempts
            || Some(u.total) != total
            || u.live != l.live
            || u.live_reserved != l.reserved_live
            || u.cleanup_reserved != l.reserved_cleanup
            || u.unconfirmed != l.unconfirmed
            || u.names != l.names
            || u.peak != l.peak
        {
            return Err(Failure::Binding);
        }
        // Fixed 3x5 conservation check; no summary re-add, variable scan or new work.
        let mut combined = Used::default();
        for round in &a.rounds {
            for (out, v) in combined.attempts.iter_mut().zip(round.attempts) {
                *out = add(*out, v)?;
            }
            combined.total = add(combined.total, round.total)?;
            combined.live = add(combined.live, round.live)?;
            combined.live_reserved = add(combined.live_reserved, round.live_reserved)?;
            combined.cleanup_reserved = add(combined.cleanup_reserved, round.cleanup_reserved)?;
            combined.unconfirmed = add(combined.unconfirmed, round.unconfirmed)?;
            combined.names = add(combined.names, round.names)?;
            combined.peak = combined.peak.max(round.peak);
        }
        if combined != a.session {
            return Err(Failure::Binding);
        }
        Ok(RetiredConnection {
            _book: self.book.clone(),
            _origin: self.origin.clone(),
            _claim: self.claim.clone(),
            _started: self.started,
            _slot: self.slot,
            _round_identity: self.round_identity,
            _round_token: self.round_token.clone(),
        })
    }
    pub(in super::super::super) fn validate(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        b.checkpoint()?;
        match self.view().check_binding(b) {
            Ok(()) => Ok(()),
            Err(e) => b.stop(e),
        }
    }
    fn view(&self) -> Boundary<'_> {
        Boundary {
            marker: &Marker,
            book: self.book.clone(),
            origin: self.origin.clone(),
            claim: self.claim.clone(),
            started: self.started,
            slot: self.slot,
            active: self.active.clone(),
            round_identity: self.round_identity,
            round_token: self.round_token.clone(),
        }
    }
    pub(in super::super::super) fn dispatch(
        &self,
        index: usize,
        acquire: bool,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        let op = match index {
            0 => Operation::Open,
            1 => Operation::Enum,
            2 => Operation::Read,
            3 => Operation::Metadata,
            _ => return b.stop(Failure::Binding),
        };
        if (index == 0 && !acquire) || (acquire && index != 0 && index != 3) {
            return b.stop(Failure::Binding);
        }
        self.view().prepare_inner(op, acquire, b, false)
    }
    pub(in super::super::super) fn check_names(
        &self,
        capacity: usize,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        b.checkpoint()?;
        if let Err(e) = self.view().check_binding(b) {
            return b.stop(e);
        }
        let a = self.book.borrow();
        let valid = capacity > 0
            && capacity <= 65536
            && add(a.session.names, capacity as u64).is_ok_and(|n| n <= a.policy.session.names)
            && add(a.rounds[self.slot].names, capacity as u64)
                .is_ok_and(|n| n <= a.policy.rounds[self.slot].names);
        drop(a);
        if valid {
            Ok(())
        } else {
            b.stop(Failure::Limit)
        }
    }
    pub(in super::super::super) fn copied_names(&self, actual: usize, capacity: usize) {
        let mut a = self.book.borrow_mut();
        a.session.names += actual.min(capacity) as u64;
        a.rounds[self.slot].names += actual.min(capacity) as u64;
    }
    pub(in super::super::super) fn acquired(&self) {
        let mut a = self.book.borrow_mut();
        let Accounting {
            session, rounds, ..
        } = &mut *a;
        for u in [session, &mut rounds[self.slot]] {
            u.live_reserved -= 1;
            u.live += 1;
            u.peak = u.peak.max(u.live);
        }
    }
    pub(in super::super::super) fn unused_acquisition(&self) {
        let mut a = self.book.borrow_mut();
        a.session.live_reserved -= 1;
        a.session.cleanup_reserved -= 1;
        a.rounds[self.slot].live_reserved -= 1;
        a.rounds[self.slot].cleanup_reserved -= 1;
    }
    pub(in super::super::super) fn release(&self, run: impl FnOnce() -> bool) {
        {
            let mut a = self.book.borrow_mut();
            let Accounting {
                session, rounds, ..
            } = &mut *a;
            for u in [session, &mut rounds[self.slot]] {
                u.live -= 1;
                u.cleanup_reserved -= 1;
                u.attempts[4] += 1;
                u.total += 1;
            }
        }
        if !run() {
            let mut a = self.book.borrow_mut();
            a.session.unconfirmed += 1;
            a.rounds[self.slot].unconfirmed += 1;
            self.claim.failure.set(Some(
                self.claim.failure.get().unwrap_or(Failure::Unavailable),
            ));
        }
    }
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

#[cfg(test)]
pub(in super::super::super) mod testing {
    use super::*;
    #[derive(Clone, Copy)]
    pub(in super::super::super::super) struct Policy {
        pub attempts: [u64; 5],
        pub round_attempts: [u64; 5],
        pub total: u64,
        pub round_total: u64,
        pub live: u64,
        pub names: u64,
    }
    pub(in super::super::super::super) fn configure(
        ledger: &mut ScanSessionLedger<'_>,
        p: Policy,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        ledger.configure_input(input(p), b)
    }
    pub(in super::super::super::super) fn input(p: Policy) -> super::super::ResourceInput {
        super::super::ResourceInput(ResourcePolicy {
            model: MODEL,
            session: Caps {
                attempts: p.attempts,
                total: p.total,
                live: p.live,
                names: p.names,
            },
            rounds: [Caps {
                attempts: p.round_attempts,
                total: p.round_total,
                live: p.live,
                names: p.names,
            }; 3],
        })
    }
    #[derive(Debug, PartialEq, Eq)]
    pub(in super::super::super::super) struct Counts {
        pub attempts: [u64; 5],
        pub total: u64,
        pub live: u64,
        pub reserved: u64,
        pub peak: u64,
        pub names: u64,
        pub unconfirmed: u64,
    }
    pub(in super::super::super::super) fn counts(
        ledger: &ScanSessionLedger<'_>,
        slot: Option<usize>,
    ) -> Counts {
        let a = ledger.resources.as_ref().unwrap().borrow();
        let u = slot.map_or(a.session, |i| a.rounds[i]);
        Counts {
            attempts: u.attempts,
            total: u.total,
            live: u.live,
            reserved: u.cleanup_reserved,
            peak: u.peak,
            names: u.names,
            unconfirmed: u.unconfirmed,
        }
    }
    // TEST ONLY: corrupt accounting, never a producer of terminal evidence.
    pub(in super::super::super::super) fn taint_terminal_names(
        ledger: &ScanSessionLedger<'_>,
        only_total: bool,
    ) {
        let mut a = ledger.resources.as_ref().unwrap().borrow_mut();
        a.session.names += 1;
        if !only_total {
            a.rounds[0].names += 1;
        }
    }
    pub(in super::super::super::super) fn acknowledge(
        mut lease: RoundResourceScope<'_, '_, '_>,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        lease.require(lease.scope, b)?;
        let round = lease.scope.round;
        lease.ledger.state = State::AwaitStrict(round);
        super::super::tests::ack_fixture(lease.ledger, round);
        lease.completed = true;
        Ok(())
    }
    pub(in super::super::super::super) fn consume_complete_claim(
        lease: &mut RoundResourceScope<'_, '_, '_>,
    ) {
        lease.ledger.complete_started[0] = true;
    }
    pub(in super::super::super::super) fn consume_after_scan_claim(
        lease: &mut RoundResourceScope<'_, '_, '_>,
    ) {
        lease.ledger.after_scan_started[0] = true;
    }
    pub(in super::super::super::super) fn consume_records_claim(
        lease: &mut RoundResourceScope<'_, '_, '_>,
    ) {
        lease.ledger.records_started[0] = true;
    }
    pub(in super::super::super::super) fn consume_final_index_claim(
        lease: &mut RoundResourceScope<'_, '_, '_>,
    ) {
        lease.ledger.final_index_started[0] = true;
    }
    pub(in super::super::super::super) fn consume_final_clock_claim(
        lease: &mut RoundResourceScope<'_, '_, '_>,
    ) {
        lease.ledger.final_clock_started[0] = true;
    }
    pub(in super::super::super::super) fn consume_ack_claim(
        lease: &mut RoundResourceScope<'_, '_, '_>,
    ) {
        lease.ledger.ack_started[0] = true;
    }
    pub(in super::super::super::super) fn ack_state(
        ledger: &ScanSessionLedger<'_>,
    ) -> ([bool; 3], bool, bool) {
        (
            ledger.ack_started,
            ledger.state == State::Finished,
            matches!(ledger.state, State::Stopped(_)),
        )
    }
    pub(in super::super::super::super) fn final_clock_state(
        ledger: &ScanSessionLedger<'_>,
    ) -> (bool, bool) {
        (
            ledger.final_clock_started[0],
            matches!(ledger.state, State::Stopped(_)),
        )
    }
    pub(in super::super::super::super) fn final_index_state(
        ledger: &ScanSessionLedger<'_>,
    ) -> (bool, bool) {
        (
            ledger.final_index_started[0],
            matches!(ledger.state, State::Stopped(_)),
        )
    }
    pub(in super::super::super::super) fn records_state(
        ledger: &ScanSessionLedger<'_>,
    ) -> (bool, bool) {
        (
            ledger.records_started[0],
            matches!(ledger.state, State::Stopped(_)),
        )
    }
    pub(in super::super::super::super) fn after_scan_state(
        ledger: &ScanSessionLedger<'_>,
    ) -> (bool, bool) {
        (
            ledger.after_scan_started[0],
            matches!(ledger.state, State::Stopped(_)),
        )
    }
    pub(in super::super::super::super) fn completion_state(
        ledger: &ScanSessionLedger<'_>,
    ) -> (bool, bool) {
        (
            ledger.complete_started[0],
            matches!(ledger.state, State::Stopped(_)),
        )
    }
    pub(in super::super::super::super) fn taint_completion_identity<'s>(
        lease: &mut RoundResourceScope<'_, '_, 's>,
        receipt: &'s RecordReceipt,
        target: &'s TargetDeclaration,
        context: &'s InspectionContext<'s>,
        kind: u8,
    ) {
        match kind {
            0 => lease.ledger.receipt = receipt,
            1 => lease.ledger.lineage = Rc::new(()),
            2 => lease.ledger.target = target,
            3 => lease.ledger.context = context,
            4 => lease.ledger.tokens[0] = Some(Rc::new(())),
            5 => lease.ledger.resources = None,
            6 => lease.ledger.state = State::Active(Round::BeforeM4),
            7 => {
                lease
                    .ledger
                    .resources
                    .as_ref()
                    .unwrap()
                    .borrow_mut()
                    .terminalized[0] = false
            }
            8 => {
                lease
                    .ledger
                    .resources
                    .as_ref()
                    .unwrap()
                    .borrow_mut()
                    .connected[0] = false
            }
            _ => unreachable!(),
        }
    }
}
