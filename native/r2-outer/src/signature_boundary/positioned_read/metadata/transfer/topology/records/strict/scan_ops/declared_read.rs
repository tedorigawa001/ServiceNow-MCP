//! Sequential size/digest and same-resource normalized metadata; no execution seal.
use super::normalized_metadata::{MetadataPolicy, MetadataSnapshot};
use super::*;
use sha2::{Digest, Sha256};

fn digest_value(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64
        || !value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    {
        return None;
    }
    let nibble = |b: u8| if b <= b'9' { b - b'0' } else { b - b'a' + 10 };
    let mut digest = [0; 32];
    for (out, pair) in digest.iter_mut().zip(value.as_bytes().as_chunks::<2>().0) {
        *out = (nibble(pair[0]) << 4) | nibble(pair[1]);
    }
    Some(digest)
}

// Only this module can construct the one-call access value, after checking declaration
// position/length/state. Consumed by transfer_once; not an execution permit or public input.
pub(super) struct DeclaredAccess<'r, 's, S: ScanOps> {
    resource: &'r Resource<'s, S>,
    offset: u64,
    length: usize,
    eof: bool,
}
impl<S: ScanOps> DeclaredAccess<'_, '_, S> {
    pub(super) fn matches(
        &self,
        resource: &Resource<'_, S>,
        offset: u64,
        length: usize,
        eof: bool,
    ) -> bool {
        std::ptr::eq(self.resource, resource)
            && self.offset == offset
            && self.length == length
            && self.eof == eof
    }
}

// Neither Clone nor serializable. Borrow both the held resource and immutable declaration.
// A future protected producer must prove the declaration's parent/path/round provenance.
pub(super) struct DeclaredFile<'r, 's, 'd, S: ScanOps> {
    resource: &'r Resource<'s, S>,
    _declaration: &'d closure::Entry,
    size: u64,
    next: u64,
    before: MetadataSnapshot<'r, 's, S>,
    policy: MetadataPolicy,
    complete: bool,
    expected_digest: [u8; 32],
    hash: Option<Sha256>,
    verified_digest: Option<[u8; 32]>,
}
impl<S: ScanOps> std::fmt::Debug for DeclaredFile<'_, '_, '_, S> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("DeclaredScanFile(pending_not_execution_authority)")
    }
}
impl<S: ScanOps> Drop for DeclaredFile<'_, '_, '_, S> {
    fn drop(&mut self) {
        if !self.complete {
            // No budget borrow or I/O from Drop. Retain pending evidence and block the next
            // normal primitive; resource cleanup remains independently prepaid and allowed.
            self.resource.ledger.borrow_mut().declared_abandoned = true;
        }
    }
}
impl<'s, S: ScanOps> Boundary<'s, '_, '_, S> {
    pub(super) fn bind_declared<'r, 'd>(
        &mut self,
        file: &'r Resource<'s, S>,
        declaration: &'d closure::Entry,
        device: u64,
    ) -> Result<DeclaredFile<'r, 's, 'd, S>, Failure> {
        self.check(file)?;
        work(self.budget)?;
        if file.kind != Kind::File || file.declared.get() {
            return self.fail(Failure::Binding);
        }
        let closure::Entry::File {
            size, sha256, mode, ..
        } = declaration
        else {
            return self.fail(Failure::Binding);
        };
        if *size > MAX_FILE {
            return self.fail(Failure::Limit);
        }
        let mode = match mode.as_str() {
            "0444" => 0o444,
            "0555" => 0o555,
            _ => return self.fail(Failure::Binding),
        };
        let policy = MetadataPolicy {
            device,
            kind: Kind::File,
            mode,
            size: Some(*size),
        };
        work(self.budget)?; // bounded 64-byte lowercase digest decode
        let Some(expected_digest) = digest_value(sha256) else {
            return self.fail(Failure::Binding);
        };
        let pending = self.ledger.borrow().declared_pending.checked_add(1);
        let Some(pending) = pending else {
            return self.fail(Failure::Limit);
        };
        let before = self.collect_snapshot(file, &policy, false)?;
        work(self.budget)?;
        work(self.budget)?;
        let hash = Sha256::new();
        self.budget.checkpoint()?;
        file.declared.set(true);
        self.ledger.borrow_mut().declared_pending = pending;
        Ok(DeclaredFile {
            resource: file,
            _declaration: declaration,
            size: *size,
            next: 0,
            before,
            policy,
            complete: false,
            expected_digest,
            hash: Some(hash),
            verified_digest: None,
        })
    }

    pub(super) fn read_declared(
        &mut self,
        file: &mut DeclaredFile<'_, 's, '_, S>,
        offset: u64,
        output: &mut [u8],
    ) -> Result<ReadStep, Failure> {
        self.check(file.resource)?;
        work(self.budget)?;
        if file.complete {
            return self.fail(Failure::Binding);
        }
        let length = (file.size - file.next).min(MAX_CHUNK as u64) as usize;
        // Exact logical chunk size preserves ceil(size/64KiB); no skip/overlap/tiny reads.
        if length == 0 || offset != file.next || output.len() != length {
            return self.fail(Failure::InvalidRange);
        }
        let access = DeclaredAccess {
            resource: file.resource,
            offset,
            length,
            eof: false,
        };
        let step = self.transfer_once(file.resource, offset, output, false, Some(access))?;
        if step == ReadStep::Complete {
            work(self.budget)?; // one bounded <=64KiB hash update of the fresh source output
            let Some(hash) = file.hash.as_mut() else {
                return self.fail(Failure::Binding);
            };
            hash.update(&*output);
            self.budget.checkpoint()?;
            work(self.budget)?; // advance only after hashing and the post-hash guard
            file.next += length as u64; // <= size <= MAX_FILE, checked before first source call
        }
        Ok(step)
    }

    pub(super) fn eof_declared(
        &mut self,
        file: &mut DeclaredFile<'_, 's, '_, S>,
        offset: u64,
        output: &mut [u8; 1],
    ) -> Result<ReadStep, Failure> {
        self.check(file.resource)?;
        work(self.budget)?;
        if file.complete {
            return self.fail(Failure::Binding);
        }
        if offset != file.size || file.next != file.size {
            return self.fail(Failure::InvalidRange);
        }
        let access = DeclaredAccess {
            resource: file.resource,
            offset,
            length: 1,
            eof: true,
        };
        let step = self.transfer_once(file.resource, offset, output, true, Some(access))?;
        if step == ReadStep::Interrupted {
            return Ok(step);
        }
        let after = self.collect_snapshot(file.resource, &file.policy, true)?;
        work(self.budget)?;
        if after != file.before {
            return self.fail(Failure::Changed);
        }
        work(self.budget)?;
        let Some(hash) = file.hash.take() else {
            return self.fail(Failure::Binding);
        };
        let actual: [u8; 32] = hash.finalize().into();
        self.budget.checkpoint()?;
        work(self.budget)?;
        let matched = actual == file.expected_digest;
        self.budget.checkpoint()?;
        if !matched {
            return self.fail(Failure::HashMismatch);
        }
        // Only EOF0 + stable post-stat + digest match finish a traversal. An unfinished binding
        // leaves pending evidence, so the scope terminal check cannot report success.
        file.complete = true;
        file.verified_digest = Some(actual);
        self.ledger.borrow_mut().declared_pending -= 1;
        Ok(ReadStep::Complete)
    }
}
impl<S: ScanOps> DeclaredFile<'_, '_, '_, S> {
    pub(super) fn initial_record(
        &self,
        b: &mut SharedBudget<'_>,
    ) -> Result<RecordSnapshot, Failure> {
        self.before.record(b)
    }
    pub(super) fn observation(
        &mut self,
        b: &mut SharedBudget<'_>,
    ) -> Result<closure::Entry, Failure> {
        work(b)?;
        if !self.complete {
            return b.stop(Failure::Binding);
        }
        let Some(digest) = self.verified_digest.take() else {
            return b.stop(Failure::Binding);
        };
        let snapshot = self.before.record(b)?;
        // Bounded path/mode/digest output allocation, only AFTER actual read/hash success.
        use crate::json::shared::Budget;
        b.work(3)?;
        let value = closure::Entry::File {
            path: self._declaration.path().into(),
            mode: format!("{:04o}", snapshot.stat.mode),
            size: snapshot.stat.size,
            sha256: hex(&digest),
        };
        b.checkpoint()?;
        Ok(value)
    }
}
