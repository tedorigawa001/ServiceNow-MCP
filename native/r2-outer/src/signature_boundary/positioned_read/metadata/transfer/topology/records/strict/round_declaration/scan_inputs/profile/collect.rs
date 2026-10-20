//! Temporary per-normal-slot counts only. No child vectors, cached directory or OS source.
use super::*;

pub(super) fn add(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_add(b).ok_or(Failure::Limit)
}
fn mul(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_mul(b).ok_or(Failure::Limit)
}
fn ell(n: u64) -> u64 {
    u64::from(64 - n.leading_zeros())
}
fn parent_slot(
    entries: &[closure::Entry],
    path: &str,
    b: &mut SharedBudget<'_>,
) -> Result<usize, Failure> {
    let (mut low, mut high) = (0, entries.len());
    while low < high {
        work(b)?;
        let mid = low + (high - low) / 2;
        match entries[mid].path().cmp(path) {
            std::cmp::Ordering::Less => low = mid + 1,
            std::cmp::Ordering::Greater => high = mid,
            std::cmp::Ordering::Equal => return Ok(mid),
        }
    }
    Err(Failure::Binding)
}
pub(super) fn counts(
    layout: &Layout<'_>,
    scope: &RoundScope<'_>,
    b: &mut SharedBudget<'_>,
) -> Result<(Shape, u64, u64), Failure> {
    work(b)?; // allocation guard; no E+1 array and no caller counts
    let n = layout.entries.len();
    let e = n.checked_add(1).ok_or(Failure::Limit)?;
    if n > 100_000 || !(1..=64).contains(&layout.components.len()) {
        return Err(Failure::Limit);
    }
    n.checked_mul(std::mem::size_of::<u64>())
        .ok_or(Failure::Limit)?;
    let mut counts = Vec::new();
    counts.try_reserve_exact(n).map_err(|_| Failure::Limit)?;
    for _ in 0..n {
        work(b)?;
        counts.push(0u64);
    }
    let mut s = Shape {
        n: n as u64,
        e: e as u64,
        h: layout.components.len() as u64,
        ..Shape::default()
    };
    let (mut virtual_parent, mut nested) = (None, 0u64);
    for (i, entry) in layout
        .entries
        .iter()
        .chain(std::iter::once(layout.index))
        .enumerate()
    {
        let virtual_index = i == n;
        work(b)?; // entry-local envelope
        match entry {
            closure::Entry::File {
                size,
                mode,
                sha256,
                path,
            } => {
                if *size > MAX_FILE {
                    return Err(Failure::Limit);
                }
                if !matches!(mode.as_str(), "0444" | "0555") {
                    return Err(Failure::Binding);
                }
                if virtual_index {
                    if *size == 0 || *size > 16 * 1024 * 1024 {
                        return Err(Failure::Limit);
                    }
                    if mode != "0444"
                        || path != &scope.index_path
                        || sha256 != &scope.hash
                        || *size != scope.receipt.pins[2].bytes.len() as u64
                    {
                        return Err(Failure::Binding);
                    }
                }
            }
            closure::Entry::Directory { mode, .. } => {
                if virtual_index || mode != "0555" {
                    return Err(Failure::Binding);
                }
            }
        }
        work(b)?; // type counters
        match entry {
            closure::Entry::File { .. } => s.f = add(s.f, 1)?,
            closure::Entry::Directory { .. } => s.d = add(s.d, 1)?,
        }
        let (mut depth, mut offset, mut parent_end) = (0u64, 0usize, 0usize);
        for component in entry.path().split('/') {
            work(b)?;
            depth = add(depth, 1)?;
            if depth > 64 {
                return Err(Failure::Limit);
            }
            if component.is_empty() {
                return Err(Failure::Binding);
            }
            if depth > 1 {
                parent_end = offset.checked_sub(1).ok_or(Failure::Binding)?;
            }
            offset = offset
                .checked_add(component.len())
                .and_then(|v| v.checked_add(1))
                .ok_or(Failure::Limit)?;
        }
        work(b)?; // aggregate depth
        s.k = add(s.k, depth)?;
        s.p = add(s.p, depth.checked_sub(1).ok_or(Failure::Limit)?)?;
        if virtual_index {
            s.kv = depth;
        }
        work(b)?; // bytes/chunks, also charged for a directory
        if let closure::Entry::File { size, .. } = entry {
            s.l = add(s.l, *size)?;
            if s.l > MAX_BYTES {
                return Err(Failure::Limit);
            }
            let chunks = add(size / 65536, u64::from(!size.is_multiple_of(65536)))?;
            s.c = add(s.c, chunks)?;
            if virtual_index {
                s.bv = *size;
                s.cv_chunks = chunks;
            }
        }
        // Retain the last separator during the already-charged component pass.
        let parent = entry.path().get(..parent_end).ok_or(Failure::Binding)?;
        let slot = if parent.is_empty() {
            None
        } else {
            let slot = parent_slot(layout.entries, parent, b)?;
            work(b)?; // nested parent check and count
            if !matches!(
                layout.entries.get(slot),
                Some(closure::Entry::Directory { .. })
            ) {
                return Err(Failure::Binding);
            }
            nested = add(nested, 1)?;
            Some(slot)
        };
        work(b)?; // parent commit
        match slot {
            None => s.c0 = add(s.c0, 1)?,
            Some(slot) => {
                let count = counts.get_mut(slot).ok_or(Failure::Binding)?;
                *count = add(*count, 1)?;
            }
        }
        if virtual_index {
            virtual_parent = slot;
        }
    }
    work(b)?; // root fold
    s.j = mul(s.c0, ell(s.c0))?;
    s.cmax = s.c0;
    let mut total = s.c0;
    for (entry, count) in layout.entries.iter().zip(&counts) {
        work(b)?; // every normal slot, including zero-count files
        match entry {
            closure::Entry::File { .. } => {
                if *count != 0 {
                    return Err(Failure::Binding);
                }
            }
            closure::Entry::Directory { .. } => {
                work(b)?;
                s.j = add(s.j, mul(*count, ell(*count))?)?;
                total = add(total, *count)?;
                s.cmax = s.cmax.max(*count);
            }
        }
    }
    work(b)?; // final virtual parent lookup
    s.cv = match virtual_parent {
        None => s.c0,
        Some(slot) => *counts.get(slot).ok_or(Failure::Binding)?,
    };
    b.checkpoint()?;
    // counts/layout are not stored in the result; all allocation owns itself on error too.
    Ok((s, total, nested))
}
