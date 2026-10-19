//! Staged shared budget and single-shot positioned-I/O boundary; no OS adapter or trust authority.
use super::physical_signature;
use std::{
    rc::Rc,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

const MAX_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_FILE: u64 = 512 * 1024 * 1024;
const MAX_HEADER: u64 = 1024 * 1024 + 32;
const MAX_CHUNK: usize = 65536;
const MAX_REQUESTS: u32 = 32768;
const EINTR_RETRIES: u8 = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Failure {
    Changed,
    InvalidRange,
    ReadFailed,
    Limit,
    Deadline,
    Cancelled,
    HashMismatch,
    SourceMismatch,
    Metadata,
    MetadataUnavailable,
    Parser(physical_signature::Rejection),
}
#[derive(Clone, Copy)]
pub(super) enum IoFailure {
    Interrupted,
    WouldBlock,
    Failed,
}
// One attempt only: adapters must not hide retry loops, seek, open paths or substitute FDs.
// Future held-FD owner must supply this privately; implementing it proves no file identity.
pub(super) trait PositionedSource {
    fn pread(&mut self, offset: u64, output: &mut [u8]) -> Result<usize, IoFailure>;
}

pub(super) struct SharedBudget<'a> {
    started: Instant,
    cancelled: &'a AtomicBool,
    now: &'a dyn Fn() -> Instant,
    used: u64,
    reserved: u64,
    retries_left: u8,
    failed: Option<Failure>,
    // Metadata has its own shared bounded accounting; never consumes A/B payload credit.
    metadata_calls: u32,
    metadata_cleanup_reserved: u32,
    metadata_name_bytes: u64,
}
impl std::fmt::Debug for SharedBudget<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SharedReadBudget(not_execution_authority)")
    }
}
impl<'a> SharedBudget<'a> {
    pub(super) fn new(started: Instant, cancelled: &'a AtomicBool) -> Self {
        Self {
            started,
            cancelled,
            now: &Instant::now,
            used: 0,
            reserved: 0,
            retries_left: EINTR_RETRIES,
            failed: None,
            metadata_calls: 0,
            metadata_cleanup_reserved: 0,
            metadata_name_bytes: 0,
        }
    }
    fn stop<T>(&mut self, reason: Failure) -> Result<T, Failure> {
        Err(*self.failed.get_or_insert(reason))
    }
    pub(super) fn checkpoint(&mut self) -> Result<(), Failure> {
        if let Some(reason) = self.failed {
            return Err(reason);
        }
        if self.cancelled.load(Ordering::Acquire) {
            return self.stop(Failure::Cancelled);
        }
        if (self.now)()
            .checked_duration_since(self.started)
            .is_none_or(|elapsed| elapsed >= Duration::from_secs(10))
        {
            return self.stop(Failure::Deadline);
        }
        Ok(())
    }
    /// For future index/closure adapters: charge actual successful bytes, never unique file size.
    /// Caller must checkpoint before its I/O; this records actual bytes BEFORE the post-I/O guard.
    /// Not connected to the existing deployment scanner in this stage.
    pub(super) fn account_read(&mut self, bytes: u64) -> Result<(), Failure> {
        let Some(used) = self.used.checked_add(bytes) else {
            return self.stop(Failure::Limit);
        };
        if used
            .checked_add(self.reserved)
            .is_none_or(|n| n > MAX_BYTES)
        {
            return self.stop(Failure::Limit);
        }
        self.used = used;
        self.checkpoint()
    }
    /// Reserve worst-case A/B + preflight + two EOF probes before starting an artifact.
    pub(super) fn begin<'b, S: PositionedSource>(
        &'b mut self,
        source: &'b mut S,
        file_bytes: u64,
    ) -> Result<ReadScope<'b, 'a, S>, Failure> {
        self.checkpoint()?;
        if !(32..=MAX_FILE).contains(&file_bytes) {
            return self.stop(Failure::Limit);
        }
        let Some(plan) = file_bytes
            .checked_mul(2)
            .and_then(|n| n.checked_add(32 + MAX_HEADER + 2))
        else {
            return self.stop(Failure::Limit);
        };
        let Some(reserved) = self.reserved.checked_add(plan) else {
            return self.stop(Failure::Limit);
        };
        if self
            .used
            .checked_add(reserved)
            .is_none_or(|n| n > MAX_BYTES)
        {
            return self.stop(Failure::Limit);
        }
        self.reserved = reserved;
        Ok(ReadScope {
            budget: self,
            source,
            file_bytes,
            credit: plan,
            requests: 0,
            lineage: Rc::new(()),
        })
    }
}

pub(super) struct ReadScope<'b, 'a, S: PositionedSource> {
    budget: &'b mut SharedBudget<'a>,
    source: &'b mut S,
    file_bytes: u64,
    credit: u64,
    requests: u32,
    // Opaque scope identity, not proof of an OS FD or record binding.
    lineage: Rc<()>,
}
impl<S: PositionedSource> std::fmt::Debug for ReadScope<'_, '_, S> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("PositionedReadScope(not_execution_authority)")
    }
}
impl<S: PositionedSource> ReadScope<'_, '_, S> {
    pub(super) fn checkpoint(&mut self) -> Result<(), Failure> {
        self.budget.checkpoint()
    }
    fn attempt(&mut self, offset: u64, output: &mut [u8]) -> Result<usize, Failure> {
        self.budget.checkpoint()?;
        if self.requests >= MAX_REQUESTS || output.len() as u64 > self.credit {
            return self.budget.stop(Failure::Limit);
        }
        self.requests += 1;
        loop {
            self.budget.checkpoint()?;
            let result = self.source.pread(offset, output);
            // Count returned bytes even when the response is late or subsequently rejected.
            // Impossible counts are charged conservatively up to the requested slice length.
            if let Ok(n) = result {
                let charged = n.min(output.len()) as u64;
                self.credit -= charged;
                self.budget.reserved -= charged;
                self.budget.used += charged; // covered by the reservation made before I/O
            }
            self.budget.checkpoint()?;
            match result {
                Ok(n) if n <= output.len() => return Ok(n),
                Ok(_) => return self.budget.stop(Failure::ReadFailed),
                Err(IoFailure::Interrupted) if self.budget.retries_left > 0 => {
                    self.budget.retries_left -= 1;
                }
                Err(_) => return self.budget.stop(Failure::ReadFailed),
            }
        }
    }
    /// Exact single request, never completes a positive short read with a second request.
    pub(super) fn read(&mut self, offset: u64, output: &mut [u8]) -> Result<(), Failure> {
        self.budget.checkpoint()?;
        if output.is_empty()
            || output.len() > MAX_CHUNK
            || offset
                .checked_add(output.len() as u64)
                .is_none_or(|end| end > self.file_bytes)
        {
            return self.budget.stop(Failure::InvalidRange);
        }
        let result = self.attempt(offset, output).and_then(|n| {
            if n == output.len() {
                Ok(())
            } else {
                self.budget.stop(Failure::Changed)
            }
        });
        if result.is_err() {
            output.fill(0); // bounded current slice only; not a general memory-zeroization claim
        }
        result
    }
    pub(super) fn eof(&mut self) -> Result<(), Failure> {
        let mut byte = [0u8; 1];
        match self.attempt(self.file_bytes, &mut byte)? {
            0 => Ok(()),
            _ => self.budget.stop(Failure::Changed),
        }
    }
}
impl<S: PositionedSource> Drop for ReadScope<'_, '_, S> {
    fn drop(&mut self) {
        self.budget.reserved -= self.credit;
    }
}

mod capture;
mod metadata;
#[cfg(test)]
mod tests;
