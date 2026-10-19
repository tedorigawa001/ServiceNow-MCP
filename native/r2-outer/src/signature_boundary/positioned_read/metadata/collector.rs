//! Single-attempt typed boundary only. No OS implementation, FD constructor or permit.
use super::*;

const MAX_METADATA_CALLS: u32 = 100; // Two roles, five observations, ten calls including cleanup.
const MAX_NAMES: usize = 65536;
const MAX_NAME_BYTES: u64 = 10 * MAX_NAMES as u64;

#[derive(Clone, Copy)]
pub(in crate::signature_boundary) enum OpFailure {
    Unavailable,
    Interrupted,
    Range,
}
#[derive(Clone, Copy)]
pub(in crate::signature_boundary) enum StatPoint {
    Before,
    After,
}
pub(in crate::signature_boundary) struct FsObservation {
    pub location: Filesystem,
    pub apfs: bool,
    pub ownership_ignored: bool,
    pub noexec: bool,
}
// Each method is exactly one attempt. No hidden retry, path access, FD replacement or clock reset.
// A future OS implementation must decode ABI/errno without exposing raw values in errors.
pub(in crate::signature_boundary) trait MetadataOps:
    PositionedSource
{
    type AclHandle;
    fn stat(&mut self, phase: Phase, point: StatPoint) -> Result<Stat, OpFailure>;
    fn filesystem(&mut self, phase: Phase) -> Result<FsObservation, OpFailure>;
    fn acl_init(&mut self, phase: Phase) -> Result<Self::AclHandle, OpFailure>;
    fn acl_stat(&mut self, phase: Phase, handle: &mut Self::AclHandle) -> Result<Stat, OpFailure>;
    fn acl_query(&mut self, phase: Phase, handle: &mut Self::AclHandle) -> Result<i32, OpFailure>;
    // Like filesec_free: infallible release, called once for every successfully returned handle.
    fn acl_free(&mut self, handle: Self::AclHandle);
    fn names_size(&mut self, phase: Phase) -> Result<i64, OpFailure>;
    fn names_read(&mut self, phase: Phase, output: &mut [u8]) -> Result<usize, OpFailure>;
}

impl SharedBudget<'_> {
    fn metadata_attempt(&mut self, reserve_cleanup: bool) -> Result<(), Failure> {
        self.checkpoint()?;
        let extra = if reserve_cleanup { 2 } else { 1 };
        if self.metadata_calls + self.metadata_cleanup_reserved + extra > MAX_METADATA_CALLS {
            return self.stop(Failure::Limit);
        }
        self.metadata_calls += 1;
        self.metadata_cleanup_reserved += u32::from(reserve_cleanup);
        Ok(())
    }
    fn metadata_names(&mut self, bytes: usize) -> Result<(), Failure> {
        let Some(total) = self.metadata_name_bytes.checked_add(bytes as u64) else {
            return self.stop(Failure::Limit);
        };
        // Record successful copy bytes even when the response will be rejected as late.
        self.metadata_name_bytes = total;
        self.checkpoint()?;
        if total > MAX_NAME_BYTES {
            return self.stop(Failure::Limit);
        }
        Ok(())
    }
    fn metadata_name_allowance(&mut self, requested: usize) -> Result<(), Failure> {
        self.checkpoint()?;
        if self
            .metadata_name_bytes
            .checked_add(requested as u64)
            .is_none_or(|total| total > MAX_NAME_BYTES)
        {
            return self.stop(Failure::Limit);
        }
        Ok(())
    }
}

// Owns the returned handle BEFORE any post-operation checkpoint. Cleanup remains reserved even
// when cancellation, deadline or unwinding prevents the next observation operation.
struct AclGuard<'r, 'b, 'a, S: MetadataOps> {
    scope: &'r mut ReadScope<'b, 'a, S>,
    handle: Option<S::AclHandle>,
}
impl<S: MetadataOps> Drop for AclGuard<'_, '_, '_, S> {
    fn drop(&mut self) {
        self.scope.budget.metadata_cleanup_reserved -= 1;
        if let Some(handle) = self.handle.take() {
            self.scope.budget.metadata_calls += 1;
            self.scope.source.acl_free(handle);
        }
    }
}

impl<S: MetadataOps> ReadScope<'_, '_, S> {
    fn metadata_op<T>(
        &mut self,
        range_is_change: bool,
        op: impl FnOnce(&mut S) -> Result<T, OpFailure>,
    ) -> Result<T, Failure> {
        self.budget.metadata_attempt(false)?;
        let result = op(self.source);
        self.checkpoint()?;
        result.map_err(|error| match error {
            OpFailure::Range if range_is_change => Failure::Changed,
            _ => Failure::MetadataUnavailable,
        })
    }
    fn collect_metadata(&mut self, phase: Phase, device: u64) -> Result<Observation, Failure> {
        let result = self.collect_metadata_inner(phase, device);
        match result {
            Ok(value) => Ok(value),
            Err(Failure::Metadata) if phase != Phase::M0 => self.budget.stop(Failure::Changed),
            Err(reason) => self.budget.stop(reason),
        }
    }
    fn collect_metadata_inner(
        &mut self,
        phase: Phase,
        device: u64,
    ) -> Result<Observation, Failure> {
        let before = self.metadata_op(false, |s| s.stat(phase, StatPoint::Before))?;
        check_stat(&before, device, self.file_bytes)?;
        self.checkpoint()?;
        let fs = self.metadata_op(false, |s| s.filesystem(phase))?;
        if fs.location != Filesystem::Local || !fs.apfs || fs.ownership_ignored || fs.noexec {
            return Err(Failure::Metadata);
        }
        self.checkpoint()?;
        self.budget.metadata_attempt(true)?;
        let mut guard = AclGuard {
            scope: self,
            handle: None,
        };
        let init = guard.scope.source.acl_init(phase);
        // Do not discard a late successful init without first giving the guard ownership.
        let initialized = match init {
            Ok(handle) => {
                guard.handle = Some(handle);
                true
            }
            Err(_) => false,
        };
        guard.scope.checkpoint()?;
        if !initialized {
            return Err(Failure::MetadataUnavailable);
        }
        let acl_stat = {
            let handle = guard.handle.as_mut().ok_or(Failure::MetadataUnavailable)?;
            guard
                .scope
                .metadata_op(false, |s| s.acl_stat(phase, handle))?
        };
        if acl_stat != before {
            return Err(Failure::Changed);
        }
        guard.scope.checkpoint()?;
        let present = {
            let handle = guard.handle.as_mut().ok_or(Failure::MetadataUnavailable)?;
            guard
                .scope
                .metadata_op(false, |s| s.acl_query(phase, handle))?
        };
        match present {
            0 => {}
            1 => return Err(Failure::Metadata),
            _ => return Err(Failure::MetadataUnavailable),
        }
        guard.scope.checkpoint()?;
        let declared = guard.scope.metadata_op(true, |s| s.names_size(phase))?;
        if declared < 0 {
            return Err(Failure::MetadataUnavailable);
        }
        let n = usize::try_from(declared).map_err(|_| Failure::Limit)?;
        if n > MAX_NAMES {
            return Err(Failure::Limit);
        }
        // Scope exclusively owns the shared budget throughout allocation and the one copy.
        guard.scope.budget.metadata_name_allowance(n.max(1))?;
        let mut names = Vec::new();
        names
            .try_reserve_exact(n.max(1))
            .map_err(|_| Failure::Limit)?;
        names.resize(n.max(1), 0);
        guard.scope.checkpoint()?;
        guard.scope.budget.metadata_attempt(false)?;
        let result = guard.scope.source.names_read(phase, &mut names);
        if let Ok(got) = result {
            guard.scope.budget.metadata_names(got.min(names.len()))?;
        }
        guard.scope.checkpoint()?;
        let got = result.map_err(|e| match e {
            OpFailure::Range => Failure::Changed,
            _ => Failure::MetadataUnavailable,
        })?;
        if got != n {
            return Err(Failure::Changed);
        }
        names.truncate(n);
        let confirmed = guard.scope.metadata_op(true, |s| s.names_size(phase))?;
        if confirmed < 0 {
            return Err(Failure::MetadataUnavailable);
        }
        if confirmed != declared {
            return Err(Failure::Changed);
        }
        normalize_names(&names)?;
        guard.scope.checkpoint()?;
        let after = guard
            .scope
            .metadata_op(false, |s| s.stat(phase, StatPoint::After))?;
        if after != before {
            return Err(Failure::Changed);
        }
        // Release before the final checkpoint; cleanup may itself take time or observe cancel.
        drop(guard);
        self.checkpoint()?;
        Ok(Observation {
            before,
            after,
            acl: Acl::Absent,
            filesystem: Filesystem::Local,
            declared_name_bytes: n as u32,
            names: Some(names),
        })
    }
    pub(in crate::signature_boundary) fn compare_collected_m0_m4(
        &mut self,
        expected: &[u8; 32],
        device: u64,
    ) -> Result<ComparedM0M4, Failure> {
        self.compare_metadata(expected, device, &mut |r, p| r.collect_metadata(p, device))
    }
}

#[cfg(test)]
mod tests;
