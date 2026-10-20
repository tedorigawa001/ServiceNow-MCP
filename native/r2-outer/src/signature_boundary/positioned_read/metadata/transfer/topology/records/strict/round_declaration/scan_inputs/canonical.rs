//! Constant-operation reference membership, not scope/receipt authentication or authority.
use super::*;

fn in_slice(entries: &[closure::Entry], candidate: &closure::Entry) -> bool {
    let pointer = std::ptr::from_ref(candidate);
    let range = entries.as_ptr_range();
    if !range.contains(&pointer) {
        return false;
    }
    let width = std::mem::size_of::<closure::Entry>();
    // Also verify the exact element boundary; do not rely on future Entry layouts.
    // No offset_from (same-allocation precondition), integer-to-pointer conversion,
    // unsafe dereference, iteration, allocation, path comparison or address output.
    let bytes = pointer.addr() - range.start.addr();
    if width == 0 || !bytes.is_multiple_of(width) {
        return false;
    }
    entries
        .get(bytes / width)
        .is_some_and(|entry| std::ptr::eq(candidate, entry))
}
pub(super) fn contains(
    entries: &[closure::Entry],
    index: &closure::Entry,
    candidate: &closure::Entry,
    b: &mut SharedBudget<'_>,
) -> Result<bool, Failure> {
    work(b)?;
    let result = std::ptr::eq(index, candidate) || in_slice(entries, candidate);
    b.checkpoint()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry() -> closure::Entry {
        closure::Entry::Directory {
            path: "same".into(),
            mode: "0555".into(),
        }
    }
    #[test]
    fn positions_sizes_and_separate_index_use_one_unit_and_never_value_equality() {
        for n in [1, 5_500, 100_000] {
            let entries = vec![entry(); n];
            let index = entry();
            let foreign = vec![entry(); n];
            let cancelled = AtomicBool::new(false);
            let mut b = SharedBudget::new(Instant::now(), &cancelled);
            for candidate in [&entries[0], &entries[n / 2], &entries[n - 1], &index] {
                let before = b.json_work;
                assert!(contains(&entries, &index, candidate, &mut b).unwrap());
                assert_eq!(b.json_work - before, 1);
            }
            for candidate in [
                &foreign[0],
                &foreign[n - 1],
                &entries[n - 1].clone(),
                &index.clone(),
            ] {
                let before = b.json_work;
                assert!(!contains(&entries, &index, candidate, &mut b).unwrap());
                assert_eq!(b.json_work - before, 1);
            }
            let before = b.json_work;
            for _ in 0..64 {
                assert!(contains(&entries, &index, &entries[n - 1], &mut b).unwrap());
            }
            assert_eq!(b.json_work - before, 64);
            assert_eq!(
                (b.used, b.reserved, b.metadata_calls, b.topology_calls),
                (0, 0, 0, 0)
            );
        }
    }
    #[test]
    fn empty_slice_and_subslice_edges_are_exact() {
        let entries = vec![entry(); 4];
        let index = entry();
        let cancelled = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancelled);
        assert!(!contains(&[], &index, &entries[0], &mut b).unwrap());
        assert!(contains(&[], &index, &index, &mut b).unwrap());
        for (i, candidate) in entries.iter().enumerate() {
            assert_eq!(
                contains(&entries[1..3], &index, candidate, &mut b).unwrap(),
                (1..3).contains(&i)
            );
        }
    }
    #[test]
    fn work_exhaustion_cancellation_and_deadline_keep_original_failure() {
        for case in 0..3 {
            let entries = vec![entry(); 3];
            let index = entry();
            let cancel = AtomicBool::new(case == 0);
            let mut b = SharedBudget::new(Instant::now(), &cancel);
            let expected = match case {
                0 => Failure::Cancelled,
                1 => {
                    b.started -= std::time::Duration::from_secs(10);
                    Failure::Deadline
                }
                _ => {
                    b.json_work = 1_000_000;
                    Failure::Limit
                }
            };
            assert_eq!(
                contains(&entries, &index, &entries[2], &mut b).unwrap_err(),
                expected
            );
            assert_eq!(
                contains(&entries, &index, &index, &mut b).unwrap_err(),
                expected
            );
        }
    }
    #[test]
    fn deadline_at_each_checkpoint_including_result_boundary_stops_success() {
        for at in 0..3 {
            let entry = entry();
            let entries = std::slice::from_ref(&entry);
            let cancel = AtomicBool::new(false);
            let start = Instant::now();
            let calls = std::cell::Cell::new(0);
            let clock = || {
                let n = calls.get();
                calls.set(n + 1);
                if n == at {
                    return start + std::time::Duration::from_secs(10);
                }
                start
            };
            let mut b = SharedBudget::new(start, &cancel);
            b.now = &clock;
            let expected = Failure::Deadline;
            assert_eq!(
                contains(entries, &entry, &entry, &mut b).unwrap_err(),
                expected
            );
            assert_eq!(calls.get(), at + 1);
            assert!(b.json_work <= 1);
            assert_eq!(
                contains(entries, &entry, &entry, &mut b).unwrap_err(),
                expected
            );
            assert_eq!(calls.get(), at + 1);
        }
    }
}
