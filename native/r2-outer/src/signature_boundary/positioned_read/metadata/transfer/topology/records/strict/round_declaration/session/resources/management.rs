//! MA-01: bounded SYNTHETIC trace arithmetic only. Never requirement evidence or a permit.
use super::*;
use crate::json::shared::Budget;
mod recipes;

const MODEL: &str = "bp5-r2-management-trace-0.1";
const MAX_EVENTS: usize = 512;
const SLOTS: usize = 64;
const MAX_REQUEST: u64 = 16 * 1024 * 1024;
const MAX_CUMULATIVE: u64 = 256 * 1024 * 1024;
const MAX_LIVE: u64 = 128 * 1024 * 1024;
const MAX_ALIGNMENT: u32 = 4096;
const ENTRY_WORK: u64 = 3;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Class {
    Control,
    Declaration,
    Profile,
    Collector,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    B0,
    B1,
    B2,
    B3,
    B4,
    S0,
    BX,
}
#[derive(Clone, Copy)]
struct Request {
    id: u8,
    bytes: u64,
    alignment: u32,
    class: Class,
}
#[derive(Clone, Copy)]
enum Event {
    Advance(Phase),
    Reserve(Request),
    Grow { old: u8, new: Request },
    Commit(u8),
    FailNoBlock(u8),
    Move { id: u8, to: Class },
    Borrow(u8),
    CloneRef(u8),
    ReleaseConfirmed(u8),
    ReleaseUnconfirmed(u8),
}
#[derive(Clone, Copy)]
enum End {
    Closed,
    CarryOut,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Vacant,
    Pending,
    Owned,
    Retired,
}
#[derive(Clone, Copy)]
struct Slot {
    kind: Kind,
    bytes: u64,
    alignment: u32,
    class: Class,
    old: Option<u8>,
    grower: Option<u8>,
}
impl Slot {
    const EMPTY: Self = Self {
        kind: Kind::Vacant,
        bytes: 0,
        alignment: 1,
        class: Class::Control,
        old: None,
        grower: None,
    };
}
#[derive(Default)]
struct Demand {
    attempts: u64,
    cumulative: u64,
    peak: u64,
    maximum: u64,
}
struct Totals {
    demand: Demand,
    live: u64,
    carry_in: u64,
}
struct ClosedSyntheticTrace {
    demand: Demand,
    carry_in: u64,
}
struct SyntheticCarryOut {
    demand: Demand,
    carry_in: u64,
    live: u64,
    blocks: u64,
}
enum SyntheticEstimate {
    Closed(ClosedSyntheticTrace),
    Carry(SyntheticCarryOut),
}
impl std::fmt::Debug for SyntheticEstimate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SyntheticManagementEstimate(not_requirement_parts_cleanup_or_permit)")
    }
}

// Local synthetic attempt only: no production budget claim, issuer or registry is added.
struct Attempt {
    origin: Rc<()>,
    started: Instant,
    used: bool,
}
impl Attempt {
    fn new(b: &SharedBudget<'_>) -> Self {
        Self {
            origin: b.inspection_origin.clone(),
            started: b.started,
            used: false,
        }
    }
    fn run(
        &mut self,
        carry: &[Request],
        events: &[Event],
        end: End,
        expected: &str,
        b: &mut SharedBudget<'_>,
    ) -> Result<SyntheticEstimate, Failure> {
        let duplicate = std::mem::replace(&mut self.used, true);
        let result = (|| {
            work(b)?; // one-shot before all fallible work
            if duplicate {
                return Err(Failure::Binding);
            }
            work(b)?;
            if expected != MODEL {
                return Err(Failure::Unavailable);
            }
            if !Rc::ptr_eq(&self.origin, &b.inspection_origin) || self.started != b.started {
                return Err(Failure::Binding);
            }
            work(b)?; // O(1) envelope before scratch/iteration
            // Worst-case pre-check: never start scratch/iteration that cannot finish. The three
            // entry units above are already spent and are part of the upper bound.
            let upper = work_upper(carry.len(), events.len())?;
            if !b.work_available(upper - ENTRY_WORK) {
                return Err(Failure::Limit);
            }
            b.work(SLOTS as u64)?; // precharge all 64 fixed slot initializations
            let mut slots = [Slot::EMPTY; SLOTS];
            let mut totals = Totals {
                demand: Demand::default(),
                live: 0,
                carry_in: 0,
            };
            let mut phase = Phase::B0;
            for request in carry {
                work(b)?; // carry header
                let i = index(request.id, b)?;
                work(b)?; // layout and initial peak arithmetic
                validate(*request)?;
                if slots[i].kind != Kind::Vacant {
                    return Err(Failure::Binding);
                }
                let live = add(totals.live, request.bytes)?;
                if live > MAX_LIVE {
                    return Err(Failure::Limit);
                }
                work(b)?; // publication, no allocation attempt for carry-in
                slots[i] = owned(*request);
                totals.live = live;
                totals.carry_in = live;
                totals.demand.peak = live;
            }
            for event in events {
                work(b)?; // event/terminal-phase envelope
                if phase == Phase::S0 {
                    return Err(Failure::Binding);
                }
                work(b)?; // one bounded operation/checked arithmetic row
                match *event {
                    Event::Advance(next) => {
                        if !next_phase(phase, next) {
                            return Err(Failure::Binding);
                        }
                        phase = next;
                    }
                    Event::Reserve(r) => {
                        if phase == Phase::BX {
                            return Err(Failure::Binding);
                        }
                        let i = index(r.id, b)?;
                        reserve(&mut slots, i, r, None, &mut totals)?;
                    }
                    Event::Grow { old, new } => {
                        if phase == Phase::BX {
                            return Err(Failure::Binding);
                        }
                        let i = index(old, b)?;
                        let j = index(new.id, b)?;
                        if slots[i].kind != Kind::Owned
                            || slots[i].grower.is_some()
                            || new.bytes <= slots[i].bytes
                            || new.class != slots[i].class
                        {
                            return Err(Failure::Binding);
                        }
                        reserve(&mut slots, j, new, Some(old), &mut totals)?;
                        slots[i].grower = Some(new.id);
                    }
                    Event::Commit(id) | Event::FailNoBlock(id) => {
                        let i = index(id, b)?;
                        if slots[i].kind != Kind::Pending {
                            return Err(Failure::Binding);
                        }
                        if let Some(old) = slots[i].old {
                            let j = index(old, b)?;
                            if slots[j].kind != Kind::Owned || slots[j].grower != Some(id) {
                                return Err(Failure::Binding);
                            }
                            slots[j].grower = None;
                        }
                        if matches!(event, Event::Commit(_)) {
                            // A delayed allocation result in BX is owned, not silently discarded.
                            slots[i].kind = Kind::Owned;
                        } else {
                            totals.live = sub(totals.live, slots[i].bytes)?;
                            slots[i].kind = Kind::Retired;
                        }
                        slots[i].old = None;
                    }
                    Event::Move { id, to } => {
                        let i = require_owned(&slots, id, b)?;
                        slots[i].class = to;
                    }
                    Event::Borrow(id) | Event::CloneRef(id) => {
                        require_owned(&slots, id, b)?;
                    }
                    Event::ReleaseConfirmed(id) => {
                        let i = require_owned(&slots, id, b)?;
                        if slots[i].grower.is_some() {
                            return Err(Failure::Binding);
                        }
                        totals.live = sub(totals.live, slots[i].bytes)?;
                        slots[i].kind = Kind::Retired;
                    }
                    Event::ReleaseUnconfirmed(id) => {
                        require_owned(&slots, id, b)?;
                        return Err(Failure::Unavailable); // never subtract uncertain ownership
                    }
                }
                work(b)?; // event publication, then cancellation/deadline observation
                b.checkpoint()?;
            }
            let mut live = 0;
            let mut blocks = 0;
            for slot in &slots {
                work(b)?; // final exact scratch conservation, including pending slots
                if slot.kind == Kind::Pending || slot.grower.is_some() {
                    return Err(Failure::Binding);
                }
                if slot.kind == Kind::Owned {
                    live = add(live, slot.bytes)?;
                    blocks += 1;
                }
            }
            work(b)?; // end/axis relations
            if live != totals.live
                || totals.demand.maximum > totals.demand.cumulative
                || totals.demand.peak > add(totals.carry_in, totals.demand.cumulative)?
            {
                return Err(Failure::Binding);
            }
            match end {
                End::Closed if phase != Phase::BX || live != 0 => return Err(Failure::Binding),
                End::CarryOut if phase != Phase::S0 => return Err(Failure::Binding),
                _ => (),
            }
            work(b)?; // no parts, policy, real resource or completion evidence
            b.checkpoint()?;
            Ok(match end {
                End::Closed => SyntheticEstimate::Closed(ClosedSyntheticTrace {
                    demand: totals.demand,
                    carry_in: totals.carry_in,
                }),
                End::CarryOut => SyntheticEstimate::Carry(SyntheticCarryOut {
                    demand: totals.demand,
                    carry_in: totals.carry_in,
                    live,
                    blocks,
                }),
            })
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
}
fn next_phase(from: Phase, to: Phase) -> bool {
    matches!(
        (from, to),
        (Phase::B0, Phase::B1)
            | (Phase::B1, Phase::B2)
            | (Phase::B2, Phase::B3)
            | (Phase::B3, Phase::B4)
            | (Phase::B4, Phase::S0)
    ) || (to == Phase::BX && !matches!(from, Phase::BX | Phase::S0))
}
fn add(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_add(b).ok_or(Failure::Limit)
}
// Calculator cost only; not a work reservation, cap approval or admission witness.
fn work_upper(carry: usize, events: usize) -> Result<u64, Failure> {
    if carry > SLOTS || events > MAX_EVENTS {
        return Err(Failure::Limit);
    }
    let carry = u64::try_from(carry).map_err(|_| Failure::Limit)?;
    let events = u64::try_from(events).map_err(|_| Failure::Limit)?;
    add(
        133,
        add(
            carry.checked_mul(4).ok_or(Failure::Limit)?,
            events.checked_mul(5).ok_or(Failure::Limit)?,
        )?,
    )
}
fn sub(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_sub(b).ok_or(Failure::Binding)
}
fn validate(r: Request) -> Result<(), Failure> {
    if r.bytes == 0
        || r.bytes > MAX_REQUEST
        || r.alignment == 0
        || r.alignment > MAX_ALIGNMENT
        || !r.alignment.is_power_of_two()
    {
        return Err(Failure::Limit);
    }
    Ok(())
}
fn index(id: u8, b: &mut SharedBudget<'_>) -> Result<usize, Failure> {
    work(b)?;
    if id == 0 || usize::from(id) > SLOTS {
        return Err(Failure::Limit);
    }
    Ok(usize::from(id) - 1)
}
fn require_owned(
    slots: &[Slot; SLOTS],
    id: u8,
    b: &mut SharedBudget<'_>,
) -> Result<usize, Failure> {
    let i = index(id, b)?;
    if slots[i].kind != Kind::Owned {
        return Err(Failure::Binding);
    }
    Ok(i)
}
fn owned(r: Request) -> Slot {
    Slot {
        kind: Kind::Owned,
        bytes: r.bytes,
        alignment: r.alignment,
        class: r.class,
        old: None,
        grower: None,
    }
}
fn reserve(
    slots: &mut [Slot; SLOTS],
    i: usize,
    r: Request,
    old: Option<u8>,
    t: &mut Totals,
) -> Result<(), Failure> {
    validate(r)?;
    if slots[i].kind != Kind::Vacant {
        return Err(Failure::Binding);
    }
    if let Some(old) = old {
        let previous = &slots[usize::from(old) - 1]; // previously range-checked by fixed caller
        if previous.alignment != r.alignment {
            return Err(Failure::Binding);
        }
    }
    let attempts = add(t.demand.attempts, 1)?;
    let cumulative = add(t.demand.cumulative, r.bytes)?;
    let live = add(t.live, r.bytes)?;
    if attempts > MAX_EVENTS as u64 || cumulative > MAX_CUMULATIVE || live > MAX_LIVE {
        return Err(Failure::Limit);
    }
    *t = Totals {
        demand: Demand {
            attempts,
            cumulative,
            peak: t.demand.peak.max(live),
            maximum: t.demand.maximum.max(r.bytes),
        },
        live,
        carry_in: t.carry_in,
    };
    slots[i] = Slot {
        kind: Kind::Pending,
        old,
        ..owned(r)
    };
    Ok(())
}

#[cfg(test)]
mod tests;
