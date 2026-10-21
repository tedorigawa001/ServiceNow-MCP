//! Quantity-only model of the current fixed kernel. No policy, reservation or session permit.
use super::*;

pub(super) const MODEL_ID: &str = "bp5-r2-scan-resource-0.2";
const KERNEL_ID: &str = "bp5-r2-collector-work-0.1";
const XATTR_POLICY_ID: &str = "bp5-r2-scan-xattr-names-0.1";
pub(super) struct Shape {
    pub(super) entries: u64, // includes virtual index
    pub(super) files: u64,
    pub(super) directories: u64,
    pub(super) root_depth: u64,
    pub(super) edges: u64, // sum of relative component counts, including virtual index
    pub(super) chunks: u64,
    pub(super) bytes: u64,
}
pub(super) struct Quantities {
    pub(super) base: [u64; 5], // Open, Enum, Read, Metadata (including ACL init), Cleanup
    pub(super) round: [u64; 5],
    pub(super) three: [u64; 5],
    pub(super) round_total: u64,
    pub(super) three_total: u64,
    pub(super) snapshots: u64,
    pub(super) xattr_round: u64,
    pub(super) xattr_three: u64,
    pub(super) enum_buffer_three: u64,
    pub(super) payload_three: u64,
    pub(super) peak_owners: u64,
    pub(super) retries: u8,
}
impl std::fmt::Debug for Quantities {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ScanResourceQuantities(not_policy_or_admission_authority)")
    }
}
fn add(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_add(b).ok_or(Failure::Limit)
}
fn mul(a: u64, b: u64) -> Result<u64, Failure> {
    a.checked_mul(b).ok_or(Failure::Limit)
}
fn xattr_contract(policy: &str, allowed: &[u8], capacity: usize) -> Result<(), Failure> {
    if policy != XATTR_POLICY_ID || allowed != b"com.apple.provenance\0" || capacity != 65536 {
        return Err(Failure::Unavailable);
    }
    Ok(())
}
fn xattr_bound(snapshots: u64) -> Result<u64, Failure> {
    // Prior completed snapshots copy at most 21 bytes. Only the final read can copy
    // an unknown 64KiB list: normalization then stops sticky before any new snapshot.
    let prior = snapshots.checked_sub(1).ok_or(Failure::Binding)?;
    add(mul(prior, 21)?, 65536)
}
fn sum(values: &[u64; 5]) -> Result<u64, Failure> {
    values.iter().try_fold(0, |n, v| add(n, *v))
}
fn row<T>(
    b: &mut SharedBudget<'_>,
    run: impl FnOnce() -> Result<T, Failure>,
) -> Result<T, Failure> {
    work(b)?;
    let value = run()?;
    b.checkpoint()?;
    Ok(value)
}
// Raw scalar input is NOT accepted-declaration evidence. Only synthetic callers exist.
// A later protected profile/binding stage is required before resource policy can use this model.
pub(super) fn calculate(
    s: &Shape,
    expected: &str,
    b: &mut SharedBudget<'_>,
) -> Result<Quantities, Failure> {
    let result = (|| {
        row(b, || {
            // 1: fixed, independently declared kernel model
            if expected != MODEL_ID || KERNEL_ID != collector::KERNEL_MODEL_ID {
                return Err(Failure::Unavailable);
            }
            xattr_contract(
                normalized_metadata::NAMES_POLICY_ID,
                normalized_metadata::ALLOWED_NONEMPTY_NAMES,
                MAX_XATTR_NAMES_BYTES,
            )
        })?;
        let retries = b.retries_left;
        row(b, || {
            // 2: scalar envelope, not proof of individual file limits or provenance
            if s.entries == 0
                || s.entries > 100_001
                || s.files == 0
                || add(s.files, s.directories)? != s.entries
                || !(1..=64).contains(&s.root_depth)
                || s.edges < s.entries
                || s.edges > mul(64, s.entries)?
                || s.bytes == 0
                || s.bytes > MAX_BYTES
                || s.bytes > mul(s.files, MAX_FILE)?
                || s.chunks < s.bytes.div_ceil(MAX_CHUNK as u64)
                || s.chunks > s.bytes
                || retries > EINTR_RETRIES
            {
                return Err(Failure::Binding);
            }
            Ok(())
        })?;
        let (t, walk_opens) = row(b, || {
            // 3: initial/root rewalk/final root rewalk + entry walk/rewalk
            let t = add(s.directories, 1)?;
            let walks = add(mul(2, s.entries)?, 3)?;
            Ok((
                t,
                add(mul(walks, add(s.root_depth, 1)?)?, mul(2, s.edges)?)?,
            ))
        })?;
        let (opens, snapshots) = row(b, || {
            // 4: cursor/child, bind/post-file, final held root
            Ok((
                add(add(walk_opens, t)?, s.entries)?,
                add(
                    add(
                        add(add(walk_opens, s.entries)?, mul(2, t)?)?,
                        mul(2, s.files)?,
                    )?,
                    1,
                )?,
            ))
        })?;
        let base = row(b, || {
            // 5: each snapshot has nine Metadata calls and one ACL cleanup
            Ok([
                opens,
                add(s.entries, mul(3, t)?)?,
                add(s.chunks, s.files)?,
                mul(9, snapshots)?,
                add(opens, snapshots)?,
            ])
        })?;
        let (round, round_total) = row(b, || {
            // 6: component tails may not both happen
            let mut round = base;
            round[1] = add(round[1], 1)?;
            round[2] = add(round[2], add(retries.into(), 1)?)?;
            Ok((round, add(add(sum(&base)?, retries.into())?, 1)?))
        })?;
        let (three, three_total) = row(b, || {
            // 7: retry and terminal event ONCE across all rounds
            let mut three = [0; 5];
            for (out, n) in three.iter_mut().zip(base) {
                *out = mul(3, n)?;
            }
            three[1] = add(three[1], 1)?;
            three[2] = add(three[2], add(retries.into(), 1)?)?;
            Ok((three, add(add(mul(3, sum(&base)?)?, retries.into())?, 1)?))
        })?;
        let (xattr_round, xattr_three, enum_buffer_three, payload_three) = row(b, || {
            // 8
            Ok((
                xattr_bound(snapshots)?,
                xattr_bound(mul(3, snapshots)?)?,
                mul(three[1], 255)?,
                mul(3, add(s.bytes, s.files)?)?,
            ))
        })?;
        row(b, || Ok(()))?; // 9: terminal publication; not a reservation or a quota constructor
        Ok(Quantities {
            base,
            round,
            three,
            round_total,
            three_total,
            snapshots,
            xattr_round,
            xattr_three,
            enum_buffer_three,
            payload_three,
            peak_owners: 5,
            retries,
        })
    })();
    match result {
        Ok(v) => Ok(v),
        Err(e) => b.stop(e),
    }
}

#[cfg(test)]
mod tests;
