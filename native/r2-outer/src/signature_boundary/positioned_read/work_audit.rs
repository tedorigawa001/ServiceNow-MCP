//! Test-only accounting observer. Counts committed work, including post-charge cancellation.
use super::Failure;
use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    sync::atomic::{AtomicBool, Ordering},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub(super) enum Owner {
    Control,
    Groups,
    Route,
    Walk,
    Enumeration,
    File,
    Seal,
    Unassigned,
}
#[derive(Clone)]
pub(super) struct Audit(Rc<State>);
struct State {
    owner: Cell<Owner>,
    counts: Cell<[u64; 8]>,
    completion: Cell<Option<Result<(), Failure>>>,
    cancel: RefCell<Option<(u64, Rc<AtomicBool>)>>,
}
pub(super) struct Guard {
    audit: Audit,
    previous: Owner,
}
impl Default for Audit {
    fn default() -> Self {
        Self(Rc::new(State {
            owner: Cell::new(Owner::Unassigned),
            counts: Cell::new([0; 8]),
            completion: Cell::new(None),
            cancel: RefCell::new(None),
        }))
    }
}
impl Audit {
    pub(super) fn enter(&self, owner: Owner) -> Guard {
        Guard {
            audit: self.clone(),
            previous: self.0.owner.replace(owner),
        }
    }
    pub(super) fn charge(&self, units: u64) {
        let mut counts = self.0.counts.get();
        counts[self.0.owner.get() as usize] += units;
        self.0.counts.set(counts);
        if let Some((at, flag)) = &*self.0.cancel.borrow()
            && counts.iter().sum::<u64>() >= *at
        {
            flag.store(true, Ordering::Release);
        }
    }
    pub(super) fn counts(&self) -> [u64; 8] {
        self.0.counts.get()
    }
    pub(super) fn finish(&self, result: Result<(), Failure>) {
        self.0.completion.set(Some(result));
    }
    pub(super) fn completion(&self) -> Option<Result<(), Failure>> {
        self.0.completion.get()
    }
    pub(super) fn cancel_after_work(&self, at: u64, flag: Rc<AtomicBool>) {
        *self.0.cancel.borrow_mut() = Some((at, flag));
    }
}
impl Drop for Guard {
    fn drop(&mut self) {
        self.audit.0.owner.set(self.previous);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::shared::Budget;
    use crate::signature_boundary::positioned_read::SharedBudget;
    use std::time::Instant;

    #[test]
    fn committed_charge_is_observed_before_post_charge_cancel_and_never_refunded() {
        let cancel = Rc::new(AtomicBool::new(false));
        let audit = Audit::default();
        audit.cancel_after_work(1, cancel.clone());
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        b.work_audit = Some(audit.clone());
        let _owner = audit.enter(Owner::Control);
        assert_eq!(b.work(1), Err(Failure::Cancelled));
        assert_eq!(b.json_work, 1);
        assert_eq!(audit.counts()[Owner::Control as usize], 1);
        assert_eq!(b.work(1), Err(Failure::Cancelled));
        assert_eq!(audit.counts().iter().sum::<u64>(), 1);
    }

    #[test]
    fn scoped_owner_restores_on_error_and_failed_precharge_is_not_observed() {
        let cancel = AtomicBool::new(false);
        let audit = Audit::default();
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        b.work_audit = Some(audit.clone());
        let _owner = audit.enter(Owner::Control);
        let result = (|| {
            let _nested = audit.enter(Owner::Groups);
            b.work(2)?;
            Err::<(), _>(Failure::Changed)
        })();
        assert_eq!(result, Err(Failure::Changed));
        b.work(1).unwrap();
        assert_eq!(audit.counts()[Owner::Control as usize], 1);
        assert_eq!(audit.counts()[Owner::Groups as usize], 2);
        b.json_work = 1_000_000;
        assert_eq!(b.work(1), Err(Failure::Limit));
        assert_eq!(audit.counts().iter().sum::<u64>(), 3);
    }
}
