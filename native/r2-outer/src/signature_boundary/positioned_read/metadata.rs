//! Typed source observations only. No stat/ACL/xattr syscalls, trusted opener or permit.
use super::capture::ComparedAB;
use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in crate::signature_boundary) enum Phase {
    M0,
    M1,
    M2,
    M3,
    M4,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(in crate::signature_boundary) enum FileType {
    Regular,
    Directory,
    Symlink,
    Other,
    Unknown,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(in crate::signature_boundary) struct Timestamp {
    pub seconds: i64,
    pub nanoseconds: u32,
}
#[derive(Clone, PartialEq, Eq)]
pub(in crate::signature_boundary) struct Stat {
    pub device: u64,
    pub inode: u64,
    pub kind: FileType,
    pub uid: u32,
    pub gid: u32,
    // Permissions + all special bits, with file type represented separately. No silent masking.
    pub mode: u32,
    pub links: u64,
    pub size: u64,
    pub mtime: Timestamp,
    pub ctime: Timestamp,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(in crate::signature_boundary) enum Acl {
    Absent,
    Present,
    Unknown,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub(in crate::signature_boundary) enum Filesystem {
    Local,
    NonLocal,
    Unknown,
}
#[derive(Clone)]
pub(in crate::signature_boundary) struct Observation {
    pub before: Stat,
    pub after: Stat,
    pub acl: Acl,
    pub filesystem: Filesystem,
    pub declared_name_bytes: u32,
    // None is unknown/unavailable, NOT an empty successful name listing.
    pub names: Option<Vec<u8>>,
}
#[derive(Clone, Copy)]
pub(in crate::signature_boundary) enum RetrievalFailure {
    Unavailable,
}
pub(in crate::signature_boundary) trait MetadataSource:
    PositionedSource
{
    // Future adapter must acquire before/ACL/names/after over its SAME held FD, bounded before allocation.
    // No default success; phase is a fixed workflow event, not permission to pick another FD.
    fn metadata(&mut self, phase: Phase) -> Result<Observation, RetrievalFailure>;
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Names {
    Empty,
    Provenance,
}
#[derive(Clone, PartialEq, Eq)]
struct Snapshot {
    stat: Stat,
    acl: Acl,
    filesystem: Filesystem,
    names: Names,
}
fn normalize(value: Observation, device: u64, size: u64) -> Result<Snapshot, Failure> {
    if value.before != value.after {
        return Err(Failure::Changed);
    }
    let stat = value.after;
    if value.declared_name_bytes > 65536 || value.names.as_ref().is_some_and(|b| b.len() > 65536) {
        return Err(Failure::Limit);
    }
    let raw = value.names.ok_or(Failure::Metadata)?;
    if raw.len() != value.declared_name_bytes as usize {
        return Err(Failure::Changed);
    }
    let names = if raw.is_empty() {
        Names::Empty
    } else if raw == b"com.apple.provenance\0" {
        Names::Provenance
    } else {
        return Err(Failure::Metadata);
    };
    if stat.kind != FileType::Regular
        || stat.uid != 0
        || stat.mode != 0o555
        || stat.links != 1
        || stat.device != device
        || stat.size != size
        || !(32..=MAX_FILE).contains(&stat.size)
        || stat.mtime.nanoseconds >= 1_000_000_000
        || stat.ctime.nanoseconds >= 1_000_000_000
        || value.acl != Acl::Absent
        || value.filesystem != Filesystem::Local
    {
        return Err(Failure::Metadata);
    }
    Ok(Snapshot {
        stat,
        acl: value.acl,
        filesystem: value.filesystem,
        names,
    })
}
struct Flow {
    baseline: Snapshot,
    next: Option<Phase>,
    device: u64,
}
impl Flow {
    fn start<S: MetadataSource>(
        r: &mut ReadScope<'_, '_, S>,
        device: u64,
    ) -> Result<Self, Failure> {
        let baseline = observe(r, Phase::M0, device, None)?;
        Ok(Self {
            baseline,
            next: Some(Phase::M1),
            device,
        })
    }
    fn advance<S: MetadataSource>(
        &mut self,
        r: &mut ReadScope<'_, '_, S>,
        phase: Phase,
    ) -> Result<(), Failure> {
        r.checkpoint()?;
        if self.next != Some(phase) {
            return r.budget.stop(Failure::SourceMismatch);
        }
        observe(r, phase, self.device, Some(&self.baseline))?;
        self.next = match phase {
            Phase::M1 => Some(Phase::M2),
            Phase::M2 => Some(Phase::M3),
            Phase::M3 => Some(Phase::M4),
            Phase::M4 => None,
            Phase::M0 => return r.budget.stop(Failure::SourceMismatch),
        };
        Ok(())
    }
}
fn observe<S: MetadataSource>(
    r: &mut ReadScope<'_, '_, S>,
    phase: Phase,
    device: u64,
    baseline: Option<&Snapshot>,
) -> Result<Snapshot, Failure> {
    r.checkpoint()?;
    let result = r.source.metadata(phase);
    r.checkpoint()?; // Even a late error or successful observation must stop here.
    let raw = result.map_err(|_| Failure::MetadataUnavailable)?;
    let snapshot = normalize(raw, device, r.file_bytes).map_err(|reason| {
        if baseline.is_some() && reason == Failure::Metadata {
            Failure::Changed
        } else {
            reason
        }
    })?;
    if baseline.is_some_and(|old| old != &snapshot) {
        return Err(Failure::Changed);
    }
    r.checkpoint()?;
    Ok(snapshot)
}
pub(in crate::signature_boundary) struct ComparedM0M4 {
    bytes: ComparedAB,
    baseline: Snapshot,
}
impl std::fmt::Debug for ComparedM0M4 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ComparedM0M4(source_only_pending_path_record_lease_not_execution_authority)")
    }
}
impl ComparedM0M4 {
    pub(in crate::signature_boundary) fn entitlement_gate(
        &self,
    ) -> Result<(), physical_signature::Rejection> {
        self.bytes.entitlement_gate()
    }
}
impl<S: MetadataSource> ReadScope<'_, '_, S> {
    pub(in crate::signature_boundary) fn compare_m0_m4(
        &mut self,
        expected: &[u8; 32],
        device: u64,
    ) -> Result<ComparedM0M4, Failure> {
        let result = (|| {
            let mut flow = Flow::start(self, device)?;
            let a = self.capture_staged(expected, &mut |r, p| flow.advance(r, p))?;
            let bytes = self.recheck_b(a)?;
            flow.advance(self, Phase::M4)?;
            self.checkpoint()?;
            if flow.next.is_some() {
                return Err(Failure::SourceMismatch);
            }
            Ok(ComparedM0M4 {
                bytes,
                baseline: flow.baseline,
            })
        })();
        match result {
            Ok(v) => Ok(v),
            Err(reason) => self.budget.stop(reason),
        }
    }
}
#[cfg(test)]
mod tests;
