//! Functional synthetic collector over ScanOps. No approved OS/quota producer or admission.
use super::super::round_declaration::{
    RoundScope,
    scan_inputs::{Layout, ScanInputs},
};
use super::normalized_metadata::MetadataPolicy;
use super::*;

struct Step<'a> {
    name: Option<&'a str>,
    policy: MetadataPolicy,
    system: bool,
    expected: RecordSnapshot,
}
struct Walk<'s, S: ScanOps> {
    resource: Resource<'s, S>,
    record: RecordSnapshot,
}
fn vector<T>(n: usize, b: &mut SharedBudget<'_>) -> Result<Vec<T>, Failure> {
    work(b)?;
    if n > 100_001 {
        return b.stop(Failure::Limit);
    }
    let mut v = Vec::new();
    v.try_reserve_exact(n).map_err(|_| Failure::Limit)?;
    Ok(v)
}
fn policy(entry: &closure::Entry, device: u64) -> Result<MetadataPolicy, Failure> {
    Ok(match entry {
        closure::Entry::Directory { mode, .. } if mode == "0555" => MetadataPolicy {
            device,
            kind: Kind::Directory,
            mode: 0o555,
            size: None,
        },
        closure::Entry::File { mode, size, .. } if *size <= MAX_FILE => MetadataPolicy {
            device,
            kind: Kind::File,
            size: Some(*size),
            mode: match mode.as_str() {
                "0444" => 0o444,
                "0555" => 0o555,
                _ => return Err(Failure::Binding),
            },
        },
        closure::Entry::File { .. } => return Err(Failure::Limit),
        _ => return Err(Failure::Binding),
    })
}
fn directory(
    entries: &[&closure::Entry],
    path: &str,
    b: &mut SharedBudget<'_>,
) -> Result<usize, Failure> {
    // The accepted declaration, excluding the appended index, is strictly sorted.
    let (mut low, mut high) = (0, entries.len() - 1);
    while low < high {
        work(b)?;
        let mid = low + (high - low) / 2;
        match entries[mid].path().cmp(path) {
            std::cmp::Ordering::Less => low = mid + 1,
            std::cmp::Ordering::Greater => high = mid,
            std::cmp::Ordering::Equal => {
                return if matches!(entries[mid], closure::Entry::Directory { .. }) {
                    Ok(mid)
                } else {
                    b.stop(Failure::Binding)
                };
            }
        }
    }
    b.stop(Failure::Binding)
}
fn route<'a>(
    layout: &'a Layout<'_>,
    entries: &[&'a closure::Entry],
    cached: &[Option<RecordSnapshot>],
    target: Option<usize>,
    b: &mut SharedBudget<'_>,
) -> Result<Vec<Step<'a>>, Failure> {
    let mut steps = vector(129, b)?;
    for i in 0..=layout.components.len() {
        work(b)?;
        let expected = layout.ancestors.get(i).ok_or(Failure::Binding)?.clone();
        steps.push(Step {
            name: if i == 0 {
                None
            } else {
                Some(layout.components[i - 1].as_str())
            },
            system: i < layout.components.len(),
            policy: MetadataPolicy {
                device: expected.stat.device,
                kind: Kind::Directory,
                mode: expected.stat.mode,
                size: None,
            },
            expected,
        });
    }
    if let Some(target) = target {
        let path = entries[target].path();
        let mut prefix = String::new();
        work(b)?;
        prefix
            .try_reserve_exact(path.len())
            .map_err(|_| Failure::Limit)?;
        for (depth, part) in path.split('/').enumerate() {
            work(b)?;
            if !prefix.is_empty() {
                prefix.push('/');
            }
            prefix.push_str(part);
            let slot = if prefix == path {
                target
            } else {
                directory(entries, &prefix, b)?
            };
            let expected = cached[slot].as_ref().ok_or(Failure::Binding)?.clone();
            if target == entries.len() - 1 {
                work(b)?;
                let pinned = if prefix == path {
                    layout.index_record
                } else {
                    layout
                        .ancestors
                        .get(layout.components.len() + depth + 1)
                        .ok_or(Failure::Binding)?
                };
                if &expected != pinned {
                    return b.stop(Failure::Changed);
                }
            }
            steps.push(Step {
                name: Some(part),
                system: false,
                policy: policy(entries[slot], layout.root.stat.device)?,
                expected,
            });
        }
    }
    b.checkpoint()?;
    Ok(steps)
}
impl<'s, S: ScanOps> Boundary<'s, '_, '_, S> {
    fn clean(&mut self) -> Result<(), Failure> {
        self.budget.checkpoint()?;
        if self.ledger.borrow().unconfirmed != 0 {
            return self.fail(Failure::Unavailable);
        }
        Ok(())
    }
    fn record(
        &mut self,
        r: &Resource<'_, S>,
        p: &MetadataPolicy,
        system: bool,
        after: bool,
    ) -> Result<RecordSnapshot, Failure> {
        if system {
            self.collect_system(r, p)?.record(self.budget)
        } else {
            self.collect_snapshot(r, p, after)?.record(self.budget)
        }
    }
    fn compare(
        &mut self,
        actual: &RecordSnapshot,
        expected: &RecordSnapshot,
    ) -> Result<(), Failure> {
        work(self.budget)?;
        if actual != expected {
            return self.fail(Failure::Changed);
        }
        Ok(())
    }
    fn walk(&mut self, steps: &[Step<'_>]) -> Result<Walk<'s, S>, Failure> {
        work(self.budget)?;
        if steps.is_empty() || steps.len() > 129 {
            return self.fail(Failure::Binding);
        }
        let mut current = self.acquire(None, None, Kind::Anchor)?;
        let mut record = self.record(&current, &steps[0].policy, steps[0].system, true)?;
        self.compare(&record, &steps[0].expected)?;
        for step in &steps[1..] {
            let next = self.acquire(Some(&current), step.name, step.policy.kind)?;
            record = self.record(&next, &step.policy, step.system, true)?;
            self.compare(&record, &step.expected)?;
            current = next;
            self.clean()?;
        }
        Ok(Walk {
            resource: current,
            record,
        })
    }
    fn rewalk(&mut self, steps: &[Step<'_>]) -> Result<(), Failure> {
        let walk = self.walk(steps)?;
        drop(walk);
        self.clean()
    }
    fn enumerate_directory(
        &mut self,
        held: &Resource<'s, S>,
        before: &RecordSnapshot,
        p: &MetadataPolicy,
        entries: &[&closure::Entry],
        parent: &str,
        cached: &mut [Option<RecordSnapshot>],
    ) -> Result<(), Failure> {
        fn parent_of(path: &str) -> &str {
            path.rsplit_once('/').map_or("", |(p, _)| p)
        }
        let mut count = 0usize;
        for entry in entries {
            work(self.budget)?;
            if parent_of(entry.path()) == parent {
                count = count.checked_add(1).ok_or(Failure::Limit)?;
            }
        }
        let mut slots = vector(count, self.budget)?;
        let mut expected = vector(count, self.budget)?;
        for (slot, e) in entries.iter().enumerate() {
            work(self.budget)?;
            if parent_of(e.path()) == parent {
                slots.push(slot);
                expected.push(child_set::ExpectedChild {
                    name: e.path().rsplit('/').next().ok_or(Failure::Binding)?,
                    kind: policy(e, p.device)?.kind,
                });
            }
        }
        // Only the appended index can be out of order. Charge comparisons and shifts.
        if slots.last() == Some(&(entries.len() - 1)) {
            let last = slots.len() - 1;
            let (mut low, mut high) = (0, last);
            while low < high {
                work(self.budget)?;
                let mid = low + (high - low) / 2;
                match expected[mid].name.cmp(expected[last].name) {
                    std::cmp::Ordering::Less => low = mid + 1,
                    std::cmp::Ordering::Greater => high = mid,
                    std::cmp::Ordering::Equal => return self.fail(Failure::Binding),
                }
            }
            if low != last {
                use crate::json::shared::Budget;
                self.budget.work(((last + 1 - low) * 2) as u64)?;
                slots[low..].rotate_right(1);
                expected[low..].rotate_right(1);
            }
        }
        self.children_checked(
            held,
            &expected,
            |b, cursor| {
                let actual = b.record(cursor, p, false, false)?;
                b.compare(&actual, before)
            },
            |b, index, child| {
                let slot = slots[index];
                work(b.budget)?;
                if cached[slot].is_some() {
                    return b.fail(Failure::Changed);
                }
                let actual = b.record(&child, &policy(entries[slot], p.device)?, false, false)?;
                cached[slot] = Some(actual);
                drop(child);
                b.clean()
            },
        )?;
        let after = self.record(held, p, false, true)?;
        self.compare(&after, before)
    }
    fn file_observation(
        &mut self,
        walk: &Walk<'s, S>,
        entry: &closure::Entry,
        device: u64,
    ) -> Result<closure::Entry, Failure> {
        let mut file = self.bind_declared(&walk.resource, entry, device)?;
        let initial = file.initial_record(self.budget)?;
        self.compare(&initial, &walk.record)?;
        let closure::Entry::File { size, .. } = entry else {
            return self.fail(Failure::Binding);
        };
        let mut buffer = [0u8; MAX_CHUNK];
        let mut offset = 0;
        while offset < *size {
            let n = (*size - offset).min(MAX_CHUNK as u64) as usize;
            match self.read_declared(&mut file, offset, &mut buffer[..n])? {
                ReadStep::Complete => offset += n as u64,
                ReadStep::Interrupted => {}
            }
        }
        let mut eof = [0];
        while self.eof_declared(&mut file, *size, &mut eof)? == ReadStep::Interrupted {}
        file.observation(self.budget)
    }
}
// Called only by this private synthetic integration harness. Missing quotas fail closed.
pub(super) fn collect<S: ScanOps>(
    inputs: &ScanInputs<'_, '_, '_, '_>,
    current: &RoundScope<'_>,
    source: S,
    quotas: Option<Quotas>,
    budget: &mut SharedBudget<'_>,
) -> Outcome<ClosureObservation> {
    with_boundary(source, quotas, budget, |b| {
        let layout = inputs.layout(current, b.budget)?;
        let n = layout.entries.len().checked_add(1).ok_or(Failure::Limit)?;
        let mut entries = vector(n, b.budget)?;
        let mut cached = vector(n, b.budget)?;
        let mut observed = vector(n, b.budget)?;
        for entry in layout.entries.iter().chain(std::iter::once(layout.index)) {
            work(b.budget)?;
            entries.push(entry);
            cached.push(None);
            observed.push(None);
        }
        let root_steps = route(&layout, &entries, &cached, None, b.budget)?;
        let root = b.walk(&root_steps)?;
        let root_policy = MetadataPolicy {
            device: layout.root.stat.device,
            kind: Kind::Directory,
            mode: 0o555,
            size: None,
        };
        b.enumerate_directory(
            &root.resource,
            &root.record,
            &root_policy,
            &entries,
            "",
            &mut cached,
        )?;
        b.rewalk(&root_steps)?;
        for (slot, entry) in entries.iter().enumerate() {
            work(b.budget)?;
            if observed[slot].is_some() {
                return b.fail(Failure::Binding);
            }
            let steps = route(&layout, &entries, &cached, Some(slot), b.budget)?;
            let walk = b.walk(&steps)?;
            let observation = match entry {
                closure::Entry::Directory { .. } => {
                    b.enumerate_directory(
                        &walk.resource,
                        &walk.record,
                        &policy(entry, root_policy.device)?,
                        &entries,
                        entry.path(),
                        &mut cached,
                    )?;
                    work(b.budget)?;
                    closure::Entry::Directory {
                        path: entry.path().into(),
                        mode: format!("{:04o}", walk.record.stat.mode),
                    }
                }
                closure::Entry::File { .. } => {
                    b.file_observation(&walk, entry, root_policy.device)?
                }
            };
            drop(walk);
            b.clean()?;
            b.rewalk(&steps)?;
            work(b.budget)?;
            observed[slot] = Some(observation);
        }
        let final_root = b.record(&root.resource, &root_policy, false, true)?;
        b.compare(&final_root, &root.record)?;
        drop(root);
        b.clean()?;
        b.rewalk(&root_steps)?;
        let mut output = vector(n, b.budget)?;
        for slot in observed {
            work(b.budget)?;
            output.push(slot.ok_or(Failure::Changed)?);
        }
        inputs.complete(current, output, b.budget)
    })
}

#[cfg(test)]
mod tests;
