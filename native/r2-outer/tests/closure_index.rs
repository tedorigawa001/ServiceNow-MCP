use r2_outer_records::closure::{Binding, ClosureFailure, Entry, check};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};

fn document() -> Value {
    json!({"schema_version":"bp5-r2-closure-index-0.1","release_id":"synthetic","generation":1,
        "entries":[
            {"kind":"directory","path":"dist","mode":"0555"},
            {"kind":"directory","path":"dist/review","mode":"0555"},
            {"kind":"file","path":"dist/review/r2-launcher-entry.js","mode":"0444","size":1,"sha256":"a".repeat(64)},
            {"kind":"file","path":"node","mode":"0555","size":1,"sha256":"b".repeat(64)}]})
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn observations(v: &Value, bytes: &[u8]) -> Vec<Entry> {
    let mut entries: Vec<Entry> = serde_json::from_value(v["entries"].clone()).unwrap();
    entries.push(Entry::File {
        path: "index.json".into(),
        mode: "0444".into(),
        size: bytes.len() as u64,
        sha256: hash(bytes),
    });
    entries
}
fn run(bytes: &[u8], observed: &[Entry]) -> Result<(), ClosureFailure> {
    let hash = hash(bytes);
    check(
        bytes,
        &Binding {
            release_id: "synthetic",
            generation: 1,
            index_sha256: &hash,
            index_path: "index.json",
            node_path: "node",
        },
        observed,
        Instant::now(),
    )
    .map(|_| ())
}
fn check_document(v: Value) -> Result<(), ClosureFailure> {
    let bytes = serde_json::to_vec(&v).unwrap();
    // Independent observation of the unchanged baseline, not a filesystem assertion.
    let observed = observations(&document(), &bytes);
    run(&bytes, &observed)
}
#[test]
fn full_minimal_tree_and_unordered_observations_match() {
    let v = document();
    let bytes = serde_json::to_vec(&v).unwrap();
    let mut observed = observations(&v, &bytes);
    observed.reverse();
    assert_eq!(run(&bytes, &observed), Ok(()));
}
#[test]
fn missing_compiled_entry_cannot_be_a_complete_index() {
    let mut v = document();
    v["entries"].as_array_mut().unwrap().remove(2);
    let bytes = serde_json::to_vec(&v).unwrap();
    assert!(run(&bytes, &observations(&v, &bytes)).is_err());
}
#[test]
fn index_path_case_alias_is_rejected_even_if_observations_agree() {
    let mut v = document();
    v["entries"].as_array_mut().unwrap().insert(
        0,
        json!({"kind":"file","path":"Index.json","mode":"0444","size":1,"sha256":"a".repeat(64)}),
    );
    let bytes = serde_json::to_vec(&v).unwrap();
    assert!(run(&bytes, &observations(&v, &bytes)).is_err());
}
#[test]
fn native_addon_cannot_be_approved_by_index_alone() {
    let mut v = document();
    v["entries"].as_array_mut().unwrap().insert(
        0,
        json!({"kind":"file","path":"addon.node","mode":"0444","size":1,"sha256":"a".repeat(64)}),
    );
    let bytes = serde_json::to_vec(&v).unwrap();
    assert!(run(&bytes, &observations(&v, &bytes)).is_err());
}
#[test]
fn strict_json_rejects_duplicates_at_every_object_level() {
    let bytes = serde_json::to_string(&document()).unwrap();
    for bad in [
        bytes.replacen("\"generation\":1", "\"generation\":1,\"generation\":1", 1),
        bytes.replacen(
            "\"mode\":\"0555\"",
            "\"mode\":\"0555\",\"mode\":\"0555\"",
            1,
        ),
    ] {
        assert!(run(bad.as_bytes(), &[]).is_err());
    }
}
#[test]
fn strict_json_rejects_unknown_fields_and_variant_fields() {
    for (target, key, value) in [
        (0, "size", json!(0)),
        (0, "sha256", json!("a".repeat(64))),
        (2, "xattrs", json!([])),
        (2, "extra", json!(true)),
    ] {
        let mut v = document();
        v["entries"][target][key] = value;
        assert_eq!(check_document(v), Err(ClosureFailure::Invalid));
    }
    let mut v = document();
    v["extra"] = json!(1);
    assert_eq!(check_document(v), Err(ClosureFailure::Invalid));
}
#[test]
fn strict_json_rejects_bom_trailing_data_invalid_utf8_and_numbers() {
    let good = serde_json::to_vec(&document()).unwrap();
    for bad in [
        [b"\xef\xbb\xbf".as_slice(), &good].concat(),
        [good.as_slice(), b" {}"].concat(),
        vec![0xff],
        b"NaN".to_vec(),
    ] {
        assert!(run(&bad, &[]).is_err());
    }
    let text = String::from_utf8(good).unwrap();
    for number in [
        "-1",
        "1.0",
        "1e0",
        "9007199254740992",
        "18446744073709551616",
    ] {
        let bad = text.replacen("\"generation\":1", &format!("\"generation\":{number}"), 1);
        assert!(run(bad.as_bytes(), &[]).is_err());
    }
}
#[test]
fn strict_json_rejects_excessive_nesting_and_array_count() {
    let nested = format!("{}0{}", "[".repeat(18), "]".repeat(18));
    assert!(run(nested.as_bytes(), &[]).is_err());
    let bad = format!("{{\"entries\":[{}]}}", vec!["null"; 100_001].join(","));
    assert!(run(bad.as_bytes(), &[]).is_err());
}
#[test]
fn byte_bound_accepts_exact_16mib_and_rejects_one_more() {
    let v = document();
    let mut bytes = serde_json::to_vec(&v).unwrap();
    bytes.resize(16 * 1024 * 1024, b' ');
    assert_eq!(run(&bytes, &observations(&v, &bytes)), Ok(()));
    bytes.push(b' ');
    assert_eq!(run(&bytes, &[]), Err(ClosureFailure::Limit));
}
#[test]
fn release_generation_schema_and_raw_hash_are_bound() {
    for (key, value) in [
        ("release_id", json!("other")),
        ("generation", json!(2)),
        ("schema_version", json!("future")),
        ("generation", json!(0)),
    ] {
        let mut v = document();
        v[key] = value;
        assert!(check_document(v).is_err());
    }
    let v = document();
    let bytes = serde_json::to_vec(&v).unwrap();
    let observed = observations(&v, &bytes);
    assert_eq!(
        check(
            &bytes,
            &Binding {
                release_id: "synthetic",
                generation: 1,
                index_sha256: &"a".repeat(64),
                index_path: "index.json",
                node_path: "node"
            },
            &observed,
            Instant::now()
        )
        .unwrap_err(),
        ClosureFailure::Binding
    );
    let mut changed = bytes.clone();
    changed.push(b' ');
    let old_hash = hash(&bytes);
    assert_eq!(
        check(
            &changed,
            &Binding {
                release_id: "synthetic",
                generation: 1,
                index_sha256: &old_hash,
                index_path: "index.json",
                node_path: "node"
            },
            &observed,
            Instant::now()
        )
        .unwrap_err(),
        ClosureFailure::Binding
    );
}
#[test]
fn paths_are_not_normalized_into_acceptance() {
    for path in [
        "/absolute",
        "../escape",
        "a/../escape",
        "a//b",
        "a/./b",
        "a/",
        "a\\b",
        "a%2fb",
        "é",
        "a\u{0000}b",
        "",
    ] {
        let mut v = document();
        v["entries"][2]["path"] = json!(path);
        assert!(check_document(v).is_err());
    }
    for path in [
        "a".repeat(256),
        vec!["a"; 65].join("/"),
        vec!["a".repeat(255); 17].join("/"),
    ] {
        let mut v = document();
        v["entries"][2]["path"] = json!(path);
        assert!(check_document(v).is_err());
    }
}
#[test]
fn duplicate_case_collision_and_noncanonical_order_are_rejected() {
    let mut v = document();
    v["entries"].as_array_mut().unwrap().swap(0, 1);
    assert!(check_document(v).is_err());
    let mut v = document();
    let duplicate = v["entries"][0].clone();
    v["entries"].as_array_mut().unwrap().insert(0, duplicate);
    assert!(check_document(v).is_err());
    let mut v = document();
    v["entries"]
        .as_array_mut()
        .unwrap()
        .insert(0, json!({"kind":"directory","path":"DIST","mode":"0555"}));
    assert!(check_document(v).is_err());
}
#[test]
fn parents_must_exist_and_be_directories() {
    let mut v = document();
    v["entries"].as_array_mut().unwrap().remove(1);
    assert!(check_document(v).is_err());
    let mut v = document();
    v["entries"][0] =
        json!({"kind":"file","path":"dist","mode":"0444","size":1,"sha256":"a".repeat(64)});
    assert!(check_document(v).is_err());
}
#[test]
fn index_is_not_self_listed_and_must_be_observed_exactly_once() {
    let v = document();
    let bytes = serde_json::to_vec(&v).unwrap();
    let mut observed = observations(&v, &bytes);
    let extra = observed.last().unwrap().clone();
    observed.push(extra);
    assert_eq!(run(&bytes, &observed), Err(ClosureFailure::Set));
    observed.pop();
    observed.pop();
    assert_eq!(run(&bytes, &observed), Err(ClosureFailure::Set));
    let mut v = document();
    v["entries"].as_array_mut().unwrap().insert(
        3,
        json!({"kind":"file","path":"index.json","mode":"0444","size":1,"sha256":"a".repeat(64)}),
    );
    assert!(check_document(v).is_err());
}
#[test]
fn observations_must_match_exact_paths_modes_sizes_and_hashes() {
    let v = document();
    let bytes = serde_json::to_vec(&v).unwrap();
    let good = observations(&v, &bytes);
    for mutation in 0..7 {
        let mut observed = good.clone();
        match mutation {
            0 => {
                observed.remove(2);
            }
            1 => observed.push(Entry::Directory {
                path: "extra".into(),
                mode: "0555".into(),
            }),
            2 => {
                if let Entry::File { size, .. } = &mut observed[2] {
                    *size += 1
                }
            }
            3 => {
                if let Entry::File { sha256, .. } = &mut observed[2] {
                    *sha256 = "c".repeat(64)
                }
            }
            4 => {
                if let Entry::File { mode, .. } = &mut observed[2] {
                    *mode = "0555".into()
                }
            }
            5 => {
                if let Entry::File { size, .. } = observed.last_mut().unwrap() {
                    *size += 1
                }
            }
            _ => {
                observed[2] = Entry::Directory {
                    path: "dist/review/r2-launcher-entry.js".into(),
                    mode: "0555".into(),
                };
            }
        }
        assert!(run(&bytes, &observed).is_err());
    }
}
#[test]
fn size_sum_includes_index_and_accepts_exact_2gib() {
    let mut v = document();
    v["entries"][3]["size"] = json!(2u64 * 1024 * 1024 * 1024 - 1000);
    let length = serde_json::to_vec(&v).unwrap().len() as u64;
    v["entries"][3]["size"] = json!(2u64 * 1024 * 1024 * 1024 - length - 1);
    let bytes = serde_json::to_vec(&v).unwrap();
    assert_eq!(bytes.len() as u64, length);
    assert_eq!(run(&bytes, &observations(&v, &bytes)), Ok(()));
    v["entries"][3]["size"] = json!(2u64 * 1024 * 1024 * 1024 - length);
    assert_eq!(check_document(v), Err(ClosureFailure::Limit));
}
#[test]
fn types_modes_hashes_and_size_shapes_are_closed() {
    for (key, value) in [
        ("kind", json!("symlink")),
        ("kind", json!("socket")),
        ("mode", json!("4755")),
        ("mode", json!(444)),
        ("sha256", json!("A".repeat(64))),
        ("size", json!(-1)),
        ("size", json!(1.0)),
        ("size", json!(u64::MAX)),
    ] {
        let mut v = document();
        v["entries"][2][key] = value;
        assert!(check_document(v).is_err());
    }
}
#[test]
fn expired_and_future_start_times_stop_without_acceptance() {
    let v = document();
    let bytes = serde_json::to_vec(&v).unwrap();
    let digest = hash(&bytes);
    let observed = observations(&v, &bytes);
    let binding = Binding {
        release_id: "synthetic",
        generation: 1,
        index_sha256: &digest,
        index_path: "index.json",
        node_path: "node",
    };
    for started in [
        Instant::now() - Duration::from_secs(10),
        Instant::now() + Duration::from_secs(100),
    ] {
        assert_eq!(
            check(&bytes, &binding, &observed, started).unwrap_err(),
            ClosureFailure::Deadline
        );
    }
}
#[test]
fn observation_count_is_checked_before_building_a_map() {
    let observed = vec![
        Entry::Directory {
            path: "a".into(),
            mode: "0555".into()
        };
        100_002
    ];
    assert_eq!(run(b"{}", &observed), Err(ClosureFailure::Limit));
}
#[test]
fn exact_entry_count_accepts_100000_and_rejects_100001() {
    let mut v = document();
    let entries = v["entries"].as_array_mut().unwrap();
    let node = entries.pop().unwrap();
    for i in 0..99_996 {
        entries.push(json!({"kind":"directory","path":format!("m{i:06}"),"mode":"0555"}));
    }
    entries.push(node);
    assert_eq!(entries.len(), 100_000);
    let bytes = serde_json::to_vec(&v).unwrap();
    assert_eq!(run(&bytes, &observations(&v, &bytes)), Ok(()));
    let entries = v["entries"].as_array_mut().unwrap();
    let node = entries.pop().unwrap();
    entries.push(json!({"kind":"directory","path":"m999999","mode":"0555"}));
    entries.push(node);
    let bytes = serde_json::to_vec(&v).unwrap();
    assert!(run(&bytes, &[]).is_err());
}
#[test]
fn maximum_path_bytes_and_depth_are_not_silently_truncated() {
    for components in [
        vec!["z".repeat(254); 16]
            .into_iter()
            .chain(["z".repeat(16)])
            .collect::<Vec<_>>(),
        vec!["z".into(); 64],
    ] {
        let mut v = document();
        let entries = v["entries"].as_array_mut().unwrap();
        let mut path = String::new();
        for component in components {
            if !path.is_empty() {
                path.push('/');
            }
            path.push_str(&component);
            entries.push(json!({"kind":"directory","path":path,"mode":"0555"}));
        }
        let bytes = serde_json::to_vec(&v).unwrap();
        assert_eq!(run(&bytes, &observations(&v, &bytes)), Ok(()));
        let entries = v["entries"].as_array_mut().unwrap();
        let last = entries.last_mut().unwrap();
        last["path"] = json!(format!("{}/z", last["path"].as_str().unwrap()));
        let bytes = serde_json::to_vec(&v).unwrap();
        assert!(run(&bytes, &observations(&v, &bytes)).is_err());
    }
}
#[test]
fn all_supported_native_suffixes_are_refused_in_any_case() {
    for name in ["addon.NODE", "addon.dylib", "addon.so", "addon.dll"] {
        let mut v = document();
        v["entries"].as_array_mut().unwrap().insert(
            0,
            json!({"kind":"file","path":name,"mode":"0444","size":1,"sha256":"a".repeat(64)}),
        );
        let bytes = serde_json::to_vec(&v).unwrap();
        assert!(run(&bytes, &observations(&v, &bytes)).is_err());
    }
}
#[test]
fn index_parent_is_required_and_cannot_be_a_file() {
    let v = document();
    let bytes = serde_json::to_vec(&v).unwrap();
    let digest = hash(&bytes);
    let mut observed = observations(&v, &bytes);
    if let Entry::File { path, .. } = observed.last_mut().unwrap() {
        *path = "absent/index.json".into();
    }
    let binding = Binding {
        release_id: "synthetic",
        generation: 1,
        index_sha256: &digest,
        index_path: "absent/index.json",
        node_path: "node",
    };
    assert_eq!(
        check(&bytes, &binding, &observed, Instant::now()).unwrap_err(),
        ClosureFailure::Invalid
    );
}
