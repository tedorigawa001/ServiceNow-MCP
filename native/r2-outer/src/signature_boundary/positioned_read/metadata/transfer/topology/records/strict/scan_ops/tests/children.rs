use super::super::child_set::ExpectedChild;
use super::*;

fn expected() -> [ExpectedChild<'static>; 3] {
    [
        ExpectedChild {
            name: ".hidden",
            kind: Kind::File,
        },
        ExpectedChild {
            name: "dir",
            kind: Kind::Directory,
        },
        ExpectedChild {
            name: "index.json",
            kind: Kind::File,
        },
    ]
}
fn names(state: &Rc<RefCell<State>>, values: &[&str]) {
    state
        .borrow_mut()
        .names
        .extend(values.iter().map(|s| Ok(Some(s.as_bytes().to_vec()))));
}

#[test]
fn all_children_in_any_order_and_dots_once_are_accepted() {
    for entries in [
        vec!["index.json", ".", "dir", "..", ".hidden"],
        vec![".hidden", "dir", "index.json"],
        vec!["..", "dir", ".hidden", ".", "index.json"],
    ] {
        let (source, state, stop, tick) = fixture();
        names(&state, &entries);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let mut visits = Vec::new();
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, i, child| {
                assert!(matches!(child.kind, Kind::File | Kind::Directory));
                visits.push(i);
                Ok(())
            })
        });
        assert_eq!(out.result, Ok(()));
        visits.sort_unstable();
        assert_eq!(visits, [0, 1, 2]);
        assert_eq!(
            state.borrow().counts,
            [5, entries.len() as u64 + 1, 0, 0, 5]
        );
        assert_eq!((out.summary.live, out.summary.pending_cleanup), (0, 0));
        assert!(!state.borrow().duplicate);
        assert_eq!(
            (b.retries_left, b.used, b.metadata_calls, b.topology_calls),
            (8, 0, 0, 0)
        );
    }
}

#[test]
fn unknown_name_is_rejected_before_child_open_or_visit() {
    for unknown in [
        "giant.bin",
        "unknown-directory",
        "index.json.extra",
        "Index.json",
    ] {
        let (source, state, stop, tick) = fixture();
        names(&state, &[unknown, ".hidden", "dir", "index.json"]);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, _, _| panic!("unknown child visited"))
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(state.borrow().counts, [2, 1, 0, 0, 2]);
        assert_eq!(state.borrow().names.len(), 3);
    }
}

#[test]
fn extra_after_complete_set_and_duplicate_do_not_open_again() {
    for tail in ["extra", "index.json", "dir", ".hidden"] {
        let (source, state, stop, tick) = fixture();
        names(
            &state,
            &[".hidden", "dir", "index.json", tail, "extra-later"],
        );
        let mut b = SharedBudget::new(tick.get(), &stop);
        let mut visited = 0;
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, _, _| {
                visited += 1;
                Ok(())
            })
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(visited, 3);
        assert_eq!(state.borrow().counts, [5, 4, 0, 0, 5]);
        assert_eq!(state.borrow().names.len(), 1);
        assert!(!state.borrow().duplicate);
    }
}

#[test]
fn missing_is_rejected_at_eof_and_empty_set_is_supported() {
    for entries in [vec![], vec![".hidden"], vec![".hidden", "dir"]] {
        let (source, state, stop, tick) = fixture();
        names(&state, &entries);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, _, _| Ok(()))
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(state.borrow().counts[1], entries.len() as u64 + 1);
        assert_eq!(out.summary.live, 0);
    }
    for entries in [vec![], vec![".", ".."], vec!["surplus"]] {
        let (source, state, stop, tick) = fixture();
        names(&state, &entries);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &[], |_, _, _| panic!("empty set visited"))
        });
        assert_eq!(
            out.result,
            if entries == ["surplus"] {
                Err(Failure::Changed)
            } else {
                Ok(())
            }
        );
        assert_eq!(state.borrow().counts[0], 2);
    }
}

#[test]
fn repeated_dot_and_invalid_frame_stop_before_any_child_open() {
    for entries in [
        vec![".", "."],
        vec!["..", ".."],
        vec![".", "..", "."],
        vec!["bad/name"],
    ] {
        let (source, state, stop, tick) = fixture();
        names(&state, &entries);
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, _, _| panic!("invalid name visited"))
        });
        assert_eq!(out.result, Err(Failure::Changed));
        assert_eq!(state.borrow().counts[0], 2);
        assert_eq!(out.summary.live, 0);
    }
}

#[test]
fn invalid_expected_set_is_rejected_before_cursor_acquisition() {
    for entries in [
        vec![
            ExpectedChild {
                name: "x",
                kind: Kind::File,
            },
            ExpectedChild {
                name: "x",
                kind: Kind::File,
            },
        ],
        vec![
            ExpectedChild {
                name: "z",
                kind: Kind::File,
            },
            ExpectedChild {
                name: "a",
                kind: Kind::File,
            },
        ],
        vec![ExpectedChild {
            name: "..",
            kind: Kind::File,
        }],
        vec![ExpectedChild {
            name: "a/b",
            kind: Kind::File,
        }],
        vec![ExpectedChild {
            name: "acl",
            kind: Kind::Acl,
        }],
    ] {
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &entries, |_, _, _| Ok(()))
        });
        assert_eq!(out.result, Err(Failure::Binding));
        assert_eq!(state.borrow().counts, [1, 0, 0, 0, 1]);
    }
}

#[test]
fn visitor_failure_and_cleanup_unknown_stop_before_next_enumerate() {
    for unconfirmed in [false, true] {
        let (source, state, stop, tick) = fixture();
        names(&state, &["dir", ".hidden", "index.json"]);
        if unconfirmed {
            state.borrow_mut().cleanup.push_back(Cleanup::Unconfirmed);
        }
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, _, _| {
                if unconfirmed {
                    Ok(())
                } else {
                    Err(Failure::HashMismatch)
                }
            })
        });
        assert_eq!(
            out.result,
            Err(if unconfirmed {
                Failure::Unavailable
            } else {
                Failure::HashMismatch
            })
        );
        assert_eq!(state.borrow().counts, [3, 1, 0, 0, 3]);
        assert_eq!(out.summary.unconfirmed, u64::from(unconfirmed));
    }
}

#[test]
fn late_enum_cancel_or_deadline_never_opens_child() {
    for hook in [Hook::Cancel, Hook::Deadline] {
        let (source, state, stop, tick) = fixture();
        names(&state, &["dir"]);
        state.borrow_mut().at = Some((3, hook)); // anchor, cursor, first enum
        let now = || tick.get();
        let mut b = SharedBudget::new(tick.get(), &stop);
        b.now = &now;
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, _, _| panic!("cancelled child visited"))
        });
        assert_eq!(
            out.result,
            Err(match hook {
                Hook::Cancel => Failure::Cancelled,
                Hook::Deadline => Failure::Deadline,
            })
        );
        assert_eq!(state.borrow().counts, [2, 1, 0, 0, 2]);
        assert_eq!((out.summary.live, out.summary.pending_cleanup), (0, 0));
    }
}

#[test]
fn lookup_and_seen_work_is_charged_and_exhaustion_releases_all_owners() {
    for available in 0..=22 {
        let (source, state, stop, tick) = fixture();
        names(&state, &["one"]);
        let mut b = SharedBudget::new(tick.get(), &stop);
        b.json_work = 1_000_000 - available;
        let entries = [ExpectedChild {
            name: "one",
            kind: Kind::File,
        }];
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &entries, |_, _, _| Ok(()))
        });
        assert_eq!(
            out.result,
            if available == 22 {
                Ok(())
            } else {
                Err(Failure::Limit)
            }
        );
        assert!(b.json_work <= 1_000_000);
        assert_eq!((out.summary.live, out.summary.pending_cleanup), (0, 0));
        assert_eq!(state.borrow().counts[0], state.borrow().counts[4]);
        assert!(!state.borrow().duplicate);
        if available == 22 {
            assert_eq!(state.borrow().counts, [3, 2, 0, 0, 3]);
        }
    }
}

#[test]
fn expected_length_cap_precedes_allocation_and_source_io() {
    for n in [100_001, 100_002] {
        let storage: Vec<String> = (0..n).map(|i| format!("c{i:06}")).collect();
        let entries: Vec<_> = storage
            .iter()
            .map(|s| ExpectedChild {
                name: s,
                kind: Kind::File,
            })
            .collect();
        let (source, state, stop, tick) = fixture();
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &entries, |_, _, _| Ok(()))
        });
        assert_eq!(
            out.result,
            if n == 100_001 {
                Err(Failure::Changed)
            } else {
                Err(Failure::Limit)
            }
        );
        assert_eq!(state.borrow().counts[0], if n == 100_001 { 2 } else { 1 });
        assert_eq!(state.borrow().counts[1], u64::from(n == 100_001));
        if n > 100_001 {
            assert_eq!(b.json_work, 5);
        }
    }
}

#[test]
fn seen_state_is_local_to_each_parent_and_nested_resources_release_once() {
    let parents = [
        ExpectedChild {
            name: "a",
            kind: Kind::Directory,
        },
        ExpectedChild {
            name: "b",
            kind: Kind::Directory,
        },
    ];
    let leaf = [ExpectedChild {
        name: "same",
        kind: Kind::File,
    }];
    let (source, state, stop, tick) = fixture();
    for item in [
        Some("a"),
        Some("same"),
        None,
        Some("b"),
        Some("same"),
        None,
        None,
    ] {
        state
            .borrow_mut()
            .names
            .push_back(Ok(item.map(|s| s.as_bytes().to_vec())));
    }
    let mut b = SharedBudget::new(tick.get(), &stop);
    let mut visits = 0;
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        s.children(&a, &parents, |s, _, directory| {
            s.children(&directory, &leaf, |_, _, _| {
                visits += 1;
                Ok(())
            })
        })
    });
    assert_eq!(out.result, Ok(()));
    assert_eq!(visits, 2);
    assert_eq!(state.borrow().counts, [8, 7, 0, 0, 8]);
    assert_eq!(out.summary.peak, 5);
    assert!(!state.borrow().duplicate);
}

#[test]
fn swallowed_visitor_failure_still_stops_and_enum_error_is_not_missing() {
    let (source, state, stop, tick) = fixture();
    names(&state, &["dir", ".hidden"]);
    let mut b = SharedBudget::new(tick.get(), &stop);
    let out = with_boundary(source, Some(quotas()), &mut b, |s| {
        let a = s.acquire(None, None, Kind::Anchor)?;
        s.children(&a, &expected(), |s, _, _| {
            let _ = s.fail::<()>(Failure::HashMismatch);
            Ok(())
        })
    });
    assert_eq!(out.result, Err(Failure::HashMismatch));
    assert_eq!(state.borrow().counts, [3, 1, 0, 0, 3]);
    for e in [OpFailure::Interrupted, OpFailure::Unavailable] {
        let (source, state, stop, tick) = fixture();
        state.borrow_mut().names.push_back(Err(e));
        let mut b = SharedBudget::new(tick.get(), &stop);
        let out = with_boundary(source, Some(quotas()), &mut b, |s| {
            let a = s.acquire(None, None, Kind::Anchor)?;
            s.children(&a, &expected(), |_, _, _| Ok(()))
        });
        assert_eq!(out.result, Err(Failure::ReadFailed));
        assert_eq!(state.borrow().counts, [2, 1, 0, 0, 2]);
        assert_eq!(b.retries_left, 8);
    }
}
