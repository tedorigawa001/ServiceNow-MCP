//! Pure index/observation checks only. Never execution authority or an OS file verifier.
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Instant;
const MAX_BYTES: usize = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 100_000;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Index {
    schema_version: String,
    release_id: String,
    generation: u64,
    entries: Vec<Entry>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ClosureFailure {
    Invalid,
    Limit,
    Binding,
    Set,
    Deadline,
}
pub struct Binding<'a> {
    pub release_id: &'a str,
    pub generation: u64,
    pub index_sha256: &'a str,
    pub index_path: &'a str,
    pub node_path: &'a str,
}
/// Counts from pure data comparison, not a permit and not proof of OS metadata or file bytes.
#[derive(Debug)]
pub struct CheckedIndex {
    pub entries: usize,
    pub file_bytes: u64,
}
/// `observed` is caller-supplied evidence, not read by this function. `started` must be the
/// original outer-inspection start, not a freshly reset budget in a future OS adapter.
/// No file, subprocess, network or execution operation is performed.
pub fn check(
    bytes: &[u8],
    binding: &Binding<'_>,
    observed: &[Entry],
    started: Instant,
) -> Result<CheckedIndex, ClosureFailure> {
    budget(started)?;
    if bytes.len() > MAX_BYTES || observed.len() > MAX_ENTRIES + 1 {
        return Err(ClosureFailure::Limit);
    }
    let decoded = crate::json::decode_bounded(bytes, MAX_BYTES, MAX_ENTRIES, started);
    budget(started)?;
    let index: Index = decoded.map_err(|_| ClosureFailure::Invalid)?;
    header(&index, binding, || format!("{:x}", Sha256::digest(bytes)))?;
    check_entries(
        &index,
        bytes.len(),
        binding,
        Some(observed),
        &mut || budget(started),
        |e| e,
    )
}
// Keep the legacy header/digest evaluation order; the staged shared caller supplies an
// already authenticated digest, while public check retains its existing decode-first contract.
fn header(
    index: &Index,
    binding: &Binding<'_>,
    digest: impl FnOnce() -> String,
) -> Result<(), ClosureFailure> {
    if index.schema_version != "bp5-r2-closure-index-0.1"
        || !release(&index.release_id)
        || index.generation == 0
        || index.generation > 9_007_199_254_740_991
    {
        return Err(ClosureFailure::Invalid);
    }
    if index.release_id != binding.release_id
        || index.generation != binding.generation
        || !hex(binding.index_sha256)
        || digest() != binding.index_sha256
        || !path(binding.index_path)
        || !path(binding.node_path)
        || binding.index_path == binding.node_path
    {
        return Err(ClosureFailure::Binding);
    }
    Ok(())
}
fn check_entries<E>(
    index: &Index,
    index_bytes: usize,
    binding: &Binding<'_>,
    observed: Option<&[Entry]>,
    step: &mut impl FnMut() -> Result<(), E>,
    error: impl Fn(ClosureFailure) -> E,
) -> Result<CheckedIndex, E> {
    let mut expected = BTreeMap::new();
    let mut folded = BTreeSet::from([binding.index_path.to_ascii_lowercase()]);
    let mut total = index_bytes as u64;
    let mut previous: Option<&str> = None;
    for entry in &index.entries {
        step()?;
        validate(entry, binding.node_path).map_err(&error)?;
        let p = entry.path();
        if p == binding.index_path
            || previous.is_some_and(|v| v >= p)
            || !folded.insert(p.to_ascii_lowercase())
        {
            return Err(error(ClosureFailure::Invalid));
        }
        if let Entry::File { size, .. } = entry {
            total = total
                .checked_add(*size)
                .ok_or_else(|| error(ClosureFailure::Limit))?;
            if total > MAX_FILE_BYTES {
                return Err(error(ClosureFailure::Limit));
            }
        }
        previous = Some(p);
        expected.insert(p, entry);
    }
    if !matches!(expected.get(binding.node_path), Some(Entry::File { .. }))
        || binding.node_path == "dist/review/r2-launcher-entry.js"
        || !matches!(
            expected.get("dist/review/r2-launcher-entry.js"),
            Some(Entry::File { .. })
        )
    {
        return Err(error(ClosureFailure::Binding));
    }
    for p in expected
        .keys()
        .copied()
        .chain(std::iter::once(binding.index_path))
    {
        step()?;
        let mut parent = p;
        while let Some((prefix, _)) = parent.rsplit_once('/') {
            step()?;
            if !matches!(expected.get(prefix), Some(Entry::Directory { .. })) {
                return Err(error(ClosureFailure::Invalid));
            }
            parent = prefix;
        }
    }
    // A declaration-only result is NOT an observation or evidence of files on disk.
    if let Some(observed) = observed {
        let mut actual = BTreeMap::new();
        for entry in observed {
            step()?;
            validate(entry, binding.node_path).map_err(&error)?;
            if actual.insert(entry.path(), entry).is_some() {
                return Err(error(ClosureFailure::Set));
            }
        }
        let expected_index = Entry::File {
            path: binding.index_path.into(),
            mode: "0444".into(),
            size: index_bytes as u64,
            sha256: binding.index_sha256.into(),
        };
        step()?;
        if actual.remove(binding.index_path) != Some(&expected_index)
            || actual.len() != expected.len()
        {
            return Err(error(ClosureFailure::Set));
        }
        // Avoid one uncheckpointed aggregate map comparison over up to 100,000 entries.
        for (path, entry) in &expected {
            step()?;
            if actual.get(path) != Some(entry) {
                return Err(error(ClosureFailure::Set));
            }
        }
    }
    step()?;
    Ok(CheckedIndex {
        entries: index.entries.len(),
        file_bytes: total,
    })
}
#[allow(dead_code)]
pub(crate) mod shared;
fn budget(started: Instant) -> Result<(), ClosureFailure> {
    if Instant::now()
        .checked_duration_since(started)
        .is_none_or(|d| d >= std::time::Duration::from_secs(10))
    {
        Err(ClosureFailure::Deadline)
    } else {
        Ok(())
    }
}
fn release(v: &str) -> bool {
    !v.is_empty() && v.len() <= 128 && !v.chars().any(char::is_control)
}
fn hex(v: &str) -> bool {
    v.len() == 64
        && v.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
pub(crate) fn path(v: &str) -> bool {
    !v.is_empty()
        && v.len() <= 4096
        && v.split('/').count() <= 64
        && v.bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._@+/-".contains(&c))
        && v.split('/')
            .all(|c| !c.is_empty() && c != "." && c != ".." && c.len() <= 255)
}
/// Validate the full declaration before any deployment payload is read. Still not execution authority.
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub(crate) fn declared(
    bytes: &[u8],
    binding: &Binding<'_>,
    started: Instant,
) -> Result<Vec<Entry>, ClosureFailure> {
    let index: Index = crate::json::decode_bounded(bytes, MAX_BYTES, MAX_ENTRIES, started)
        .map_err(|_| ClosureFailure::Invalid)?;
    let mut entries = index.entries;
    entries.push(Entry::File {
        path: binding.index_path.into(),
        mode: "0444".into(),
        size: bytes.len() as u64,
        sha256: binding.index_sha256.into(),
    });
    check(bytes, binding, &entries, started)?;
    entries.pop();
    Ok(entries)
}
fn validate(e: &Entry, node: &str) -> Result<(), ClosureFailure> {
    if !path(e.path()) {
        return Err(ClosureFailure::Invalid);
    }
    let lower = e.path().to_ascii_lowercase();
    if matches!(e, Entry::File { .. })
        && e.path() != node
        && [".node", ".dylib", ".so", ".dll"]
            .iter()
            .any(|suffix| lower.ends_with(suffix))
    {
        return Err(ClosureFailure::Invalid);
    }
    match e {
        Entry::Directory { mode, .. } if mode == "0555" => Ok(()),
        Entry::File {
            path,
            mode,
            size,
            sha256,
        } if mode == if path == node { "0555" } else { "0444" }
            && *size <= MAX_FILE_BYTES
            && hex(sha256) =>
        {
            Ok(())
        }
        _ => Err(ClosureFailure::Invalid),
    }
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum Entry {
    #[serde(rename = "file")]
    File {
        path: String,
        mode: String,
        size: u64,
        sha256: String,
    },
    #[serde(rename = "directory")]
    Directory { path: String, mode: String },
}
impl Entry {
    pub(crate) fn path(&self) -> &str {
        match self {
            Self::File { path, .. } | Self::Directory { path, .. } => path,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    #[test]
    fn node_without_compiled_entry_is_not_complete() {
        let bytes = br#"{"schema_version":"bp5-r2-closure-index-0.1","release_id":"test","generation":1,"entries":[{"kind":"file","path":"node","mode":"0555","size":1,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}"#;
        let hash = format!("{:x}", Sha256::digest(bytes));
        let binding = Binding {
            release_id: "test",
            generation: 1,
            index_sha256: &hash,
            index_path: "index.json",
            node_path: "node",
        };
        let observed = vec![
            Entry::File {
                path: "node".into(),
                mode: "0555".into(),
                size: 1,
                sha256: "a".repeat(64),
            },
            Entry::File {
                path: "index.json".into(),
                mode: "0444".into(),
                size: bytes.len() as u64,
                sha256: hash.clone(),
            },
        ];
        assert_eq!(
            check(bytes, &binding, &observed, Instant::now()).unwrap_err(),
            ClosureFailure::Binding
        );
    }
}
