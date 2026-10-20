use super::*;

#[test]
fn decode_once_then_fresh_semantics_match_existing_check() {
    let f = fixture();
    let mut b = Synthetic::default();
    let before = index_decode_count();
    let parsed = decode_declaration(&f.bytes, &f.binding(), &mut b).unwrap();
    let initial = b.work;
    assert_eq!(index_decode_count(), before + 1);
    let out = parsed
        .recheck(&f.binding(), Some(&f.observed), &mut b)
        .unwrap();
    parsed.recheck(&f.binding(), None, &mut b).unwrap();
    assert_eq!(index_decode_count(), before + 1);
    assert!(b.work > initial);
    assert_eq!(parsed.entries().len(), 4);
    let old = run(&f, &mut Synthetic::default()).unwrap();
    assert_eq!(out.entries, old.checked.entries);
    assert_eq!(out.file_bytes, old.checked.file_bytes);
    assert_eq!(
        format!("{parsed:?}"),
        "DecodedDeclaration(pure_pending_round_binding_not_execution_authority)"
    );
}
#[test]
fn recheck_reauthenticates_hash_and_all_header_fields_without_decode() {
    let f = fixture();
    let parsed = decode_declaration(&f.bytes, &f.binding(), &mut Synthetic::default()).unwrap();
    let before = index_decode_count();
    let wrong_hash = "f".repeat(64);
    let mut hash_binding = f.binding();
    hash_binding.index_sha256 = &wrong_hash;
    // No observation is supplied: a later index-entry Set failure must not mask
    // removal of raw authentication itself.
    assert_eq!(
        parsed
            .recheck(&hash_binding, None, &mut Synthetic::default())
            .unwrap_err(),
        Rejection::Closure(ClosureFailure::Binding)
    );
    for case in 0..5 {
        let mut binding = f.binding();
        let wrong = "f".repeat(64);
        match case {
            0 => binding.index_sha256 = &wrong,
            1 => binding.release_id = "other",
            2 => binding.generation = 2,
            3 => binding.index_path = "else.json",
            _ => binding.node_path = "dist/review/r2-launcher-entry.js",
        };
        assert!(
            parsed
                .recheck(&binding, Some(&f.observed), &mut Synthetic::default())
                .is_err()
        );
    }
    assert_eq!(index_decode_count(), before);
}
#[test]
fn every_entry_and_index_observation_difference_still_fails() {
    let f = fixture();
    let parsed = decode_declaration(&f.bytes, &f.binding(), &mut Synthetic::default()).unwrap();
    for case in 0..5 {
        let mut observed = f.observed.clone();
        match case {
            0 => {
                observed.pop();
            }
            1 => observed.push(observed[0].clone()),
            2 => {
                if let Entry::File { sha256, .. } = &mut observed[2] {
                    *sha256 = "f".repeat(64);
                }
            }
            3 => {
                if let Entry::File { size, .. } = observed.last_mut().unwrap() {
                    *size += 1;
                }
            }
            _ => {
                observed[0] = Entry::Directory {
                    path: "extra".into(),
                    mode: "0555".into(),
                };
            }
        };
        assert_eq!(
            parsed
                .recheck(&f.binding(), Some(&observed), &mut Synthetic::default())
                .unwrap_err(),
            Rejection::Closure(ClosureFailure::Set)
        );
    }
}
#[test]
fn semantic_invariants_are_reexecuted_not_just_cached_counts() {
    let f = fixture();
    let mut parsed = decode_declaration(&f.bytes, &f.binding(), &mut Synthetic::default()).unwrap();
    // Test-only internal corruption: production has no mutable view/constructor.
    parsed.index.entries[0] = Entry::Directory {
        path: "../escape".into(),
        mode: "0555".into(),
    };
    assert_eq!(
        parsed
            .recheck(&f.binding(), None, &mut Synthetic::default())
            .unwrap_err(),
        Rejection::Closure(ClosureFailure::Invalid)
    );
}
#[test]
fn decode_still_hash_first_and_strict_for_authenticated_invalid_input() {
    let mut f = fixture();
    let before = index_decode_count();
    assert!(matches!(
        decode_declaration(b"{", &f.binding(), &mut Synthetic::default()),
        Err(Rejection::Closure(ClosureFailure::Binding))
    ));
    assert_eq!(index_decode_count(), before);
    for bytes in [
        b"{".to_vec(),
        b"\xff".to_vec(),
        [f.bytes.clone(), b" trailing".to_vec()].concat(),
        String::from_utf8(f.bytes.clone())
            .unwrap()
            .replacen("\"generation\":1", "\"generation\":1,\"generation\":1", 1)
            .into_bytes(),
    ] {
        f.bytes = bytes;
        f.hash = format!("{:x}", Sha256::digest(&f.bytes));
        assert!(matches!(
            decode_declaration(&f.bytes, &f.binding(), &mut Synthetic::default()),
            Err(Rejection::Json(json::Rejection::InvalidRecord))
        ));
    }
}
#[test]
fn every_recheck_checkpoint_retains_cancel_and_deadline() {
    let f = fixture();
    let parsed = decode_declaration(&f.bytes, &f.binding(), &mut Synthetic::default()).unwrap();
    for observation in [None, Some(f.observed.as_slice())] {
        let mut normal = Synthetic::default();
        parsed
            .recheck(&f.binding(), observation, &mut normal)
            .unwrap();
        for reason in [Stop::Deadline, Stop::Cancelled] {
            for fail in 1..=normal.checks {
                let mut b = Synthetic {
                    reason,
                    fail,
                    ..Synthetic::default()
                };
                assert_eq!(
                    budget_reason(
                        parsed
                            .recheck(&f.binding(), observation, &mut b)
                            .unwrap_err()
                    ),
                    Some(reason)
                );
            }
        }
    }
}
#[test]
fn reused_tree_still_respects_accumulated_work_and_local_observation_limit() {
    let f = fixture();
    let parsed = decode_declaration(&f.bytes, &f.binding(), &mut Synthetic::default()).unwrap();
    let mut b = Synthetic::default();
    parsed.recheck(&f.binding(), None, &mut b).unwrap();
    b.cap = b.work;
    assert_eq!(
        budget_reason(parsed.recheck(&f.binding(), None, &mut b).unwrap_err()),
        Some(Stop::Limit)
    );
    let observed = vec![f.observed[0].clone(); 100002];
    assert_eq!(
        parsed
            .recheck(&f.binding(), Some(&observed), &mut Synthetic::default())
            .unwrap_err(),
        Rejection::Closure(ClosureFailure::Limit)
    );
}
