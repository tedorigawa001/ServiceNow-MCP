//! Pending A-pass capture, not held-FD identity, metadata revalidation, or signature authority.
use super::*;
use sha2::{Digest, Sha256};

pub(in crate::signature_boundary) struct CapturedA {
    header: Vec<u8>,
    signature: Vec<u8>,
    full_hash: [u8; 32],
    file_bytes: u64,
    entitlement_stop: physical_signature::Rejection,
}
impl std::fmt::Debug for CapturedA {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CapturedA(pending_revalidation_not_execution_authority)")
    }
}
impl CapturedA {
    pub(in crate::signature_boundary) fn entitlement_gate(
        &self,
    ) -> Result<(), physical_signature::Rejection> {
        Err(self.entitlement_stop)
    }
}
fn parser_failure(e: physical_signature::Rejection) -> Failure {
    match e {
        physical_signature::Rejection::Deadline => Failure::Deadline,
        physical_signature::Rejection::Cancelled => Failure::Cancelled,
        other => Failure::Parser(other),
    }
}
fn allocate(n: usize) -> Result<Vec<u8>, Failure> {
    if n > 5 * 1024 * 1024 {
        return Err(Failure::Limit);
    }
    let mut bytes = Vec::new();
    bytes.try_reserve_exact(n).map_err(|_| Failure::Limit)?;
    bytes.resize(n, 0);
    Ok(bytes)
}
fn read_chunks<S: PositionedSource>(
    r: &mut ReadScope<'_, '_, S>,
    bytes: &mut [u8],
) -> Result<(), Failure> {
    let mut offset = 0u64;
    for chunk in bytes.chunks_mut(MAX_CHUNK) {
        r.read(offset, chunk)?;
        offset = offset
            .checked_add(chunk.len() as u64)
            .ok_or(Failure::InvalidRange)?;
    }
    r.checkpoint()
}
fn same<S: PositionedSource>(
    r: &mut ReadScope<'_, '_, S>,
    a: &[u8],
    b: &[u8],
) -> Result<(), Failure> {
    if a.len() != b.len() {
        return Err(Failure::SourceMismatch);
    }
    for (a, b) in a.chunks(MAX_CHUNK).zip(b.chunks(MAX_CHUNK)) {
        r.checkpoint()?;
        if a != b {
            return Err(Failure::SourceMismatch);
        }
    }
    r.checkpoint()
}
// Copies only the intersection of this exact hashed block and the validated target range.
fn collect(target: &mut [u8], start: u64, offset: u64, block: &[u8]) -> Result<usize, Failure> {
    let end = start
        .checked_add(target.len() as u64)
        .ok_or(Failure::InvalidRange)?;
    let block_end = offset
        .checked_add(block.len() as u64)
        .ok_or(Failure::InvalidRange)?;
    let lo = start.max(offset);
    let hi = end.min(block_end);
    if lo >= hi {
        return Ok(0);
    }
    let out = usize::try_from(lo - start).map_err(|_| Failure::InvalidRange)?;
    let from = usize::try_from(lo - offset).map_err(|_| Failure::InvalidRange)?;
    let n = usize::try_from(hi - lo).map_err(|_| Failure::InvalidRange)?;
    target
        .get_mut(out..out.checked_add(n).ok_or(Failure::InvalidRange)?)
        .ok_or(Failure::InvalidRange)?
        .copy_from_slice(
            block
                .get(from..from.checked_add(n).ok_or(Failure::InvalidRange)?)
                .ok_or(Failure::InvalidRange)?,
        );
    Ok(n)
}
impl<S: PositionedSource> ReadScope<'_, '_, S> {
    pub(in crate::signature_boundary) fn capture_a(
        &mut self,
        expected: &[u8; 32],
    ) -> Result<CapturedA, Failure> {
        let result = self.capture_inner(expected);
        match result {
            Ok(v) => Ok(v),
            Err(reason) => self.budget.stop(reason),
        }
    }
    fn capture_inner(&mut self, expected: &[u8; 32]) -> Result<CapturedA, Failure> {
        self.checkpoint()?;
        let mut initial = [0u8; 32];
        self.read(0, &mut initial)?;
        let header_len = physical_signature::preflight_length(&initial, self.file_bytes)
            .map_err(parser_failure)?;
        self.checkpoint()?;
        let mut preflight = allocate(header_len)?;
        read_chunks(self, &mut preflight)?;
        same(self, &initial, &preflight[..32])?;
        let range = physical_signature::preflight_range(
            &preflight,
            self.file_bytes,
            self.budget.started,
            self.budget.cancelled,
            self.budget.now,
        )
        .map_err(parser_failure)?;
        self.checkpoint()?;
        let mut header = allocate(header_len)?;
        let mut signature = allocate(range.len())?;
        self.checkpoint()?;
        let mut buffer = [0u8; MAX_CHUNK];
        let mut offset = 0u64;
        let mut h = Sha256::new();
        let mut header_seen = 0usize;
        let mut signature_seen = 0usize;
        while offset < self.file_bytes {
            let n = (self.file_bytes - offset).min(MAX_CHUNK as u64) as usize;
            self.read(offset, &mut buffer[..n])?;
            self.checkpoint()?;
            h.update(&buffer[..n]);
            self.checkpoint()?;
            header_seen = header_seen
                .checked_add(collect(&mut header, 0, offset, &buffer[..n])?)
                .ok_or(Failure::InvalidRange)?;
            self.checkpoint()?;
            signature_seen = signature_seen
                .checked_add(collect(
                    &mut signature,
                    range.start as u64,
                    offset,
                    &buffer[..n],
                )?)
                .ok_or(Failure::InvalidRange)?;
            self.checkpoint()?;
            offset = offset.checked_add(n as u64).ok_or(Failure::InvalidRange)?;
        }
        let full_hash: [u8; 32] = h.finalize().into();
        self.checkpoint()?;
        if &full_hash != expected {
            return Err(Failure::HashMismatch);
        }
        if header_seen != header.len() || signature_seen != signature.len() {
            return Err(Failure::SourceMismatch);
        }
        self.eof()?;
        same(self, &preflight, &header)?;
        drop(preflight);
        let inventory = physical_signature::parse_inner(
            physical_signature::Input {
                file_bytes: self.file_bytes,
                header_commands: &header,
                signature: &signature,
            },
            self.budget.started,
            self.budget.cancelled,
            self.budget.now,
        )
        .map_err(parser_failure)?;
        let entitlement_stop = match inventory.entitlement_gate() {
            Err(e) => e,
            Ok(()) => {
                return Err(Failure::Parser(
                    physical_signature::Rejection::UnverifiedXml,
                ));
            }
        };
        self.checkpoint()?;
        Ok(CapturedA {
            header,
            signature,
            full_hash,
            file_bytes: self.file_bytes,
            entitlement_stop,
        })
    }
}
#[cfg(test)]
mod tests;
