//! Logical identities inside an inert draft. Not source origins, round tokens or scan authority.
use super::*;
const ORDER: [Round; 3] = [Round::Initial, Round::BeforeM4, Round::AfterM4];
const KEY_ID: &str = "bp5-r2-logical-slot-key-0.1";
struct Key {
    group: Rc<()>,
    nonce: Rc<()>,
    ordinal: usize,
    round: Round,
    model: &'static str,
}
pub(super) struct LogicalSlots {
    group: Rc<()>,
    canonical: [Rc<()>; 3],
    keys: [Key; 3],
}
pub(in super::super::super::super::super) struct LogicalSlotRef<'d> {
    key: &'d Key,
    group: &'d Rc<()>,
    owner: &'d Rc<ProtectedBridgeClaim>,
}
fn index(round: Round) -> usize {
    match round {
        Round::Initial => 0,
        Round::BeforeM4 => 1,
        Round::AfterM4 => 2,
    }
}
impl LogicalSlots {
    pub(super) fn issue(b: &mut SharedBudget<'_>) -> Result<Self, Failure> {
        work(b)?;
        let group = Rc::new(());
        let mut make = |ordinal: usize| -> Result<Key, Failure> {
            work(b)?;
            Ok(Key {
                group: group.clone(),
                nonce: Rc::new(()),
                ordinal,
                round: ORDER[ordinal],
                model: KEY_ID,
            })
        };
        let keys = [make(0)?, make(1)?, make(2)?];
        let canonical = std::array::from_fn(|i| keys[i].nonce.clone());
        b.checkpoint()?;
        Ok(Self {
            group,
            canonical,
            keys,
        })
    }
    pub(super) fn require(&self, b: &mut SharedBudget<'_>) -> Result<(), Failure> {
        for (i, round) in ORDER.iter().enumerate() {
            work(b)?;
            let k = &self.keys[i];
            if k.model != KEY_ID {
                return Err(Failure::Unavailable);
            }
            if k.ordinal != i
                || k.round != *round
                || !Rc::ptr_eq(&k.group, &self.group)
                || !Rc::ptr_eq(&k.nonce, &self.canonical[i])
                || (0..i).any(|j| Rc::ptr_eq(&k.nonce, &self.keys[j].nonce))
            {
                return Err(Failure::Binding);
            }
        }
        b.checkpoint()
    }
    pub(super) fn select<'d>(
        &'d self,
        round: Round,
        owner: &'d Rc<ProtectedBridgeClaim>,
    ) -> LogicalSlotRef<'d> {
        LogicalSlotRef {
            key: &self.keys[index(round)],
            group: &self.group,
            owner,
        }
    }
    pub(super) fn check(
        &self,
        key: &LogicalSlotRef<'_>,
        round: Round,
        b: &mut SharedBudget<'_>,
    ) -> Result<(), Failure> {
        work(b)?;
        if !std::ptr::eq(key.key, &self.keys[index(round)]) || !std::ptr::eq(key.group, &self.group)
        {
            return Err(Failure::Binding);
        }
        b.checkpoint()
    }
}
impl LogicalSlotRef<'_> {
    pub(super) fn stop(&self, e: Failure) {
        self.owner.stop_allocation(e);
    }
}
impl std::fmt::Debug for LogicalSlotRef<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("LogicalSlotRef(borrowed_inert_not_source_or_round_token)")
    }
}
#[cfg(test)]
pub(in super::super::super::super::super) enum SlotFault {
    Swap(usize, usize),
    Ordinal(usize),
    Round(usize),
    Group(usize),
    Nonce(usize),
    AliasCanonical(usize),
    Model(usize),
}
#[cfg(test)]
impl LogicalSlots {
    pub(super) fn corrupt(&mut self, f: SlotFault) {
        match f {
            SlotFault::Swap(i, j) => self.keys.swap(i, j),
            SlotFault::Ordinal(i) => self.keys[i].ordinal = 3,
            SlotFault::Round(i) => self.keys[i].round = ORDER[(i + 1) % 3],
            SlotFault::Group(i) => self.keys[i].group = Rc::new(()),
            SlotFault::Nonce(i) => self.keys[i].nonce = Rc::new(()),
            SlotFault::AliasCanonical(i) => {
                let n = self.keys[0].nonce.clone();
                self.keys[i].nonce = n.clone();
                self.canonical[i] = n;
            }
            SlotFault::Model(i) => self.keys[i].model = "unknown",
        }
    }
}
