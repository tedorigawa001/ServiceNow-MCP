use super::*;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

fn file(path: &str) -> closure::Entry {
    closure::Entry::File {
        path: path.into(),
        mode: "0444".into(),
        size: 0,
        sha256: "a".repeat(64),
    }
}
fn dir(path: &str) -> closure::Entry {
    closure::Entry::Directory {
        path: path.into(),
        mode: "0555".into(),
    }
}
fn fixture(index: &str) -> Vec<closure::Entry> {
    let mut entries = vec![
        dir("a"),
        dir("a/empty"),
        file("a/f"),
        file("a/z"),
        dir("b"),
        file("b/f"),
        file("node"),
    ];
    entries.push(file(index));
    entries
}

#[test]
fn stable_groups_equal_a_slow_oracle_including_virtual_index_and_empty_directories() {
    for index in [
        "-index",
        "index.json",
        "zz-index",
        "a/-index",
        "a/m",
        "a/zz-index",
        "a/empty/index",
    ] {
        let values = fixture(index);
        let entries: Vec<_> = values.iter().collect();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let groups = ChildGroups::build(&entries, &mut b).unwrap();
        let mut parents = vec![None];
        parents.extend(
            entries.iter().enumerate().filter_map(|(i, e)| {
                matches!(e, closure::Entry::Directory { .. }).then_some(Some(i))
            }),
        );
        let mut seen = vec![false; entries.len()];
        for parent in parents {
            let path = parent.map_or("", |i| entries[i].path());
            let mut oracle: Vec<_> = entries
                .iter()
                .enumerate()
                .filter_map(|(i, e)| {
                    (e.path().rsplit_once('/').map_or("", |(p, _)| p) == path).then_some(i)
                })
                .collect();
            oracle.sort_by_key(|i| name(entries[*i]));
            let before = b.json_work;
            let children = groups.children(parent, &mut b).unwrap();
            assert_eq!(b.json_work - before, 1);
            assert_eq!(children, oracle);
            for slot in children {
                assert!(!seen[*slot]);
                seen[*slot] = true;
                assert!(std::ptr::eq(groups.entries[*slot], entries[*slot]));
            }
        }
        assert!(seen.into_iter().all(|v| v));
    }
}

#[test]
fn large_shape_preprocess_is_bounded_and_directory_lookup_is_constant_work() {
    let mut values = Vec::new();
    for i in 0..1000 {
        values.push(dir(&format!("d{i:04}")));
    }
    for i in 0..4500 {
        values.push(file(&format!("d{:04}/f{i:05}", i % 1000)));
    }
    values.sort_by(|a, b| a.path().cmp(b.path()));
    values.push(file("index.json"));
    let entries: Vec<_> = values.iter().collect();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    let groups = ChildGroups::build(&entries, &mut b).unwrap();
    let build = b.json_work;
    assert!(build < 100_000, "{build}");
    let mut total = groups.children(None, &mut b).unwrap().len();
    for (slot, e) in entries.iter().enumerate() {
        if matches!(e, closure::Entry::Directory { .. }) {
            total += groups.children(Some(slot), &mut b).unwrap().len();
        }
    }
    assert_eq!(total, 5501);
    assert_eq!(b.json_work - build, 1001);
    assert!(build * 50 < 2 * 5501 * 1001);
    eprintln!(
        "expected groups: E=5501 T=1001 build={build} lookup={} old_scans={}",
        b.json_work - build,
        2 * 5501 * 1001
    );
}

#[test]
fn malformed_shapes_and_non_directory_slots_fail_closed() {
    for values in [
        vec![],
        vec![dir("a")],
        vec![file("z"), file("a"), file("index")],
        vec![file("a"), file("a/f"), file("index")],
        vec![file("missing/f"), file("index")],
        fixture("a/f"),
    ] {
        let entries: Vec<_> = values.iter().collect();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        assert!(matches!(
            ChildGroups::build(&entries, &mut b),
            Err(Failure::Binding)
        ));
        assert_eq!(b.checkpoint(), Err(Failure::Binding));
    }
    for slot in [2, usize::MAX] {
        let values = fixture("index");
        let entries: Vec<_> = values.iter().collect();
        let cancel = AtomicBool::new(false);
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        let groups = ChildGroups::build(&entries, &mut b).unwrap();
        assert_eq!(groups.children(Some(slot), &mut b), Err(Failure::Binding));
    }
    let value = file("index");
    let entries = vec![&value; 100_002];
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    assert!(matches!(
        ChildGroups::build(&entries, &mut b),
        Err(Failure::Limit)
    ));
}

#[test]
fn every_work_prefix_stops_without_refund_and_preserves_cancellation_deadline() {
    let values = fixture("a/m");
    let entries: Vec<_> = values.iter().collect();
    let cancel = AtomicBool::new(false);
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    ChildGroups::build(&entries, &mut b).unwrap();
    let cost = b.json_work;
    for left in 0..cost {
        let mut b = SharedBudget::new(Instant::now(), &cancel);
        b.json_work = 1_000_000 - left;
        assert!(matches!(
            ChildGroups::build(&entries, &mut b),
            Err(Failure::Limit)
        ));
        assert!(b.json_work >= 1_000_000 - left);
        assert_eq!(b.checkpoint(), Err(Failure::Limit));
    }
    let mut b = SharedBudget::new(Instant::now(), &cancel);
    b.json_work = 1_000_000 - cost;
    ChildGroups::build(&entries, &mut b).unwrap();
    assert_eq!(b.json_work, 1_000_000);
    let cancelled = AtomicBool::new(true);
    let mut b = SharedBudget::new(Instant::now(), &cancelled);
    assert!(matches!(
        ChildGroups::build(&entries, &mut b),
        Err(Failure::Cancelled)
    ));
    let mut b = SharedBudget::new(Instant::now() - Duration::from_secs(11), &cancel);
    assert!(matches!(
        ChildGroups::build(&entries, &mut b),
        Err(Failure::Deadline)
    ));
}
