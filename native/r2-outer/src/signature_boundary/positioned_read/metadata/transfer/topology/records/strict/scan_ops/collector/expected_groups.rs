//! Per-scan immutable child ranges. Not scope authentication, admission or an OS observation.
use super::*;

pub(super) struct ChildGroups<'p, 'e> {
    pub(super) entries: &'p [&'e closure::Entry],
    buckets: Vec<Option<usize>>,
    starts: Vec<usize>,
    counts: Vec<usize>,
    children: Vec<usize>,
}
fn name(entry: &closure::Entry) -> &str {
    entry.path().rsplit('/').next().unwrap_or("")
}
impl<'p, 'e> ChildGroups<'p, 'e> {
    pub(super) fn build(
        entries: &'p [&'e closure::Entry],
        b: &mut SharedBudget<'_>,
    ) -> Result<Self, Failure> {
        audit_owner!(b, Groups);
        let result = (|| {
            work(b)?;
            let n = entries.len();
            if n == 0 {
                return Err(Failure::Binding);
            }
            if n > 100_001 {
                return Err(Failure::Limit);
            }
            if !matches!(entries[n - 1], closure::Entry::File { .. }) {
                return Err(Failure::Binding);
            }
            let mut buckets = vector(n, b)?;
            let mut t = 1usize; // bucket0 is the runtime root
            for (slot, entry) in entries.iter().enumerate() {
                work(b)?;
                if !closure::path(entry.path())
                    || (slot > 0 && slot < n - 1 && entries[slot - 1].path() >= entry.path())
                {
                    return Err(Failure::Binding);
                }
                if matches!(entry, closure::Entry::Directory { .. }) {
                    buckets.push(Some(t));
                    t = t.checked_add(1).ok_or(Failure::Limit)?;
                } else {
                    buckets.push(None);
                }
            }
            // Every allocation is <=E; no E+1/E+2 array or raised vector limit is needed.
            let mut counts = vector(t, b)?;
            for _ in 0..t {
                work(b)?;
                counts.push(0usize);
            }
            let mut parents = vector(n, b)?;
            for entry in entries {
                work(b)?;
                let parent = entry.path().rsplit_once('/').map_or("", |(p, _)| p);
                let bucket = if parent.is_empty() {
                    0
                } else {
                    let slot = directory(entries, parent, b)?;
                    buckets[slot].ok_or(Failure::Binding)?
                };
                counts[bucket] = counts[bucket].checked_add(1).ok_or(Failure::Limit)?;
                parents.push(bucket);
            }
            let mut starts = vector(t, b)?;
            let mut total = 0usize;
            for count in &counts {
                work(b)?;
                starts.push(total);
                total = total.checked_add(*count).ok_or(Failure::Limit)?;
            }
            if total != n {
                return Err(Failure::Binding);
            }
            let mut children = vector(n, b)?;
            for _ in 0..n {
                work(b)?;
                children.push(usize::MAX);
            }
            let mut cursors = vector(t, b)?;
            for start in &starts {
                work(b)?;
                cursors.push(*start);
            }
            // Stable scatter: full-path ordering preserves basename ordering within a parent.
            for (slot, bucket) in parents.iter().copied().enumerate() {
                work(b)?;
                let at = cursors[bucket];
                let end = starts[bucket]
                    .checked_add(counts[bucket])
                    .ok_or(Failure::Limit)?;
                if at >= end || children.get(at) != Some(&usize::MAX) {
                    return Err(Failure::Binding);
                }
                children[at] = slot;
                cursors[bucket] = at.checked_add(1).ok_or(Failure::Limit)?;
            }
            for bucket in 0..t {
                work(b)?;
                if cursors[bucket] != starts[bucket] + counts[bucket] {
                    return Err(Failure::Binding);
                }
            }
            // Only the appended virtual index is out of order. Binary insert into its bucket.
            work(b)?;
            let bucket = parents[n - 1];
            let start = starts[bucket];
            let end = start + counts[bucket];
            if children.get(end - 1) != Some(&(n - 1)) {
                return Err(Failure::Binding);
            }
            let (mut low, mut high) = (start, end - 1);
            while low < high {
                work(b)?;
                let mid = low + (high - low) / 2;
                match name(entries[children[mid]]).cmp(name(entries[n - 1])) {
                    std::cmp::Ordering::Less => low = mid + 1,
                    std::cmp::Ordering::Greater => high = mid,
                    std::cmp::Ordering::Equal => return Err(Failure::Binding),
                }
            }
            if low != end - 1 {
                use crate::json::shared::Budget;
                b.work((end - low) as u64)?;
                children[low..end].rotate_right(1);
            }
            b.checkpoint()?;
            Ok(Self {
                entries,
                buckets,
                starts,
                counts,
                children,
            })
        })();
        match result {
            Ok(v) => Ok(v),
            Err(e) => b.stop(e),
        }
    }
    pub(super) fn children(
        &self,
        parent: Option<usize>,
        b: &mut SharedBudget<'_>,
    ) -> Result<&[usize], Failure> {
        work(b)?;
        let bucket = match parent {
            None => 0,
            Some(slot) => match self.buckets.get(slot).copied().flatten() {
                Some(bucket) => bucket,
                None => return b.stop(Failure::Binding),
            },
        };
        let start = self.starts[bucket];
        let end = start + self.counts[bucket];
        b.checkpoint()?;
        Ok(&self.children[start..end])
    }
}

#[cfg(test)]
mod tests;
