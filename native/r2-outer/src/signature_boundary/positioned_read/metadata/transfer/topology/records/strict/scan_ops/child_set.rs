//! Direct-child subset only; not a closure observation or an execution authority.
use super::*;

// Borrow immutable component names. A future protected producer must derive these from
// the same accepted index/parent/round; synthetic callers do NOT establish that trust.
pub(super) struct ExpectedChild<'a> {
    pub(super) name: &'a str,
    pub(super) kind: Kind,
}

impl<'s, S: ScanOps> Boundary<'s, '_, '_, S> {
    // Opens only matched, previously unseen children. The callback receives an owned child;
    // it must finish its bounded work before returning. No recursion or observation seal here.
    pub(super) fn children(
        &mut self,
        parent: &Resource<'_, S>,
        expected: &[ExpectedChild<'_>],
        mut visit: impl FnMut(&mut Self, usize, Resource<'s, S>) -> Result<(), Failure>,
    ) -> Result<(), Failure> {
        self.check(parent)?;
        if !matches!(parent.kind, Kind::Anchor | Kind::Directory) {
            return self.fail(Failure::Binding);
        }
        // Validate the length before allocation, and sorted unique names before any cursor I/O.
        work(self.budget)?;
        if expected.len() > 100_001 {
            return self.fail(Failure::Limit);
        }
        for (i, child) in expected.iter().enumerate() {
            work(self.budget)?;
            if !component(child.name)
                || !matches!(child.kind, Kind::Directory | Kind::File)
                || (i > 0 && expected[i - 1].name >= child.name)
            {
                return self.fail(Failure::Binding);
            }
        }
        work(self.budget)?; // bounded allocation; no unchecked input-size allocation
        let mut seen = Vec::new();
        if seen.try_reserve_exact(expected.len()).is_err() {
            return self.fail(Failure::Limit);
        }
        for _ in expected {
            work(self.budget)?;
            seen.push(false);
        }
        let cursor = self.acquire(Some(parent), None, Kind::Cursor)?;
        let mut dots = [false; 2];
        let mut name = [0; 255];
        loop {
            match self.enumerate(&cursor, &mut name)? {
                EnumValue::End => {
                    work(self.budget)?; // EOF classification, separate from missing scan
                    for present in &seen {
                        work(self.budget)?;
                        if !present {
                            return self.fail(Failure::Changed);
                        }
                    }
                    return self.budget.checkpoint();
                }
                EnumValue::Name(n) => {
                    work(self.budget)?;
                    // enumerate checked both n and UTF-8 before returning.
                    let value = match std::str::from_utf8(&name[..n]) {
                        Ok(value) => value,
                        Err(_) => return self.fail(Failure::Changed),
                    };
                    if value == "." || value == ".." {
                        let dot = usize::from(value == "..");
                        if dots[dot] {
                            return self.fail(Failure::Changed);
                        }
                        dots[dot] = true;
                        continue;
                    }
                    // Explicitly charge EVERY binary-search comparison. Do not hide a sort,
                    // growing HashSet, or log(N) lookup behind one constant work step.
                    let (mut low, mut high) = (0, expected.len());
                    let index = loop {
                        if low == high {
                            return self.fail(Failure::Changed);
                        }
                        work(self.budget)?;
                        let mid = low + (high - low) / 2;
                        match expected[mid].name.cmp(value) {
                            std::cmp::Ordering::Less => low = mid + 1,
                            std::cmp::Ordering::Greater => high = mid,
                            std::cmp::Ordering::Equal => break mid,
                        }
                    };
                    work(self.budget)?;
                    if seen[index] {
                        return self.fail(Failure::Changed);
                    }
                    seen[index] = true;
                    // Unknown/duplicate/dot entries NEVER reach acquire or the visitor.
                    let child = self.acquire(Some(parent), Some(value), expected[index].kind)?;
                    if let Err(e) = visit(self, index, child) {
                        return self.fail(e);
                    }
                    // A visitor may have encountered and swallowed a sticky failure, or its
                    // owner cleanup may be unconfirmed. Stop before another enumerate call.
                    self.budget.checkpoint()?;
                    if self.ledger.borrow().unconfirmed != 0 {
                        return self.fail(Failure::Unavailable);
                    }
                }
            }
        }
    }
}
