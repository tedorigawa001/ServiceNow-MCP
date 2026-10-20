//! Sequential size-bound subset; no digest, complete metadata policy, or execution seal.
use super::*;

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
    before: Stat,
    complete: bool,
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
    ) -> Result<DeclaredFile<'r, 's, 'd, S>, Failure> {
        self.check(file)?;
        work(self.budget)?;
        if file.kind != Kind::File || file.declared.get() {
            return self.fail(Failure::Binding);
        }
        let closure::Entry::File { size, .. } = declaration else {
            return self.fail(Failure::Binding);
        };
        if *size > MAX_FILE {
            return self.fail(Failure::Limit);
        }
        let pending = self.ledger.borrow().declared_pending.checked_add(1);
        let Some(pending) = pending else {
            return self.fail(Failure::Limit);
        };
        let MetaValue::Stat(before) = self.metadata(file, MetaOp::Stat, &mut [])? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if before.kind != FileType::Regular || before.size != *size {
            return self.fail(Failure::Changed);
        }
        file.declared.set(true);
        self.ledger.borrow_mut().declared_pending = pending;
        Ok(DeclaredFile {
            resource: file,
            _declaration: declaration,
            size: *size,
            next: 0,
            before,
            complete: false,
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
        let MetaValue::Stat(after) = self.metadata(file.resource, MetaOp::Stat, &mut [])? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if after != file.before {
            return self.fail(Failure::Changed);
        }
        // Only EOF0 + stable post-stat finish a traversal. Dropping an unfinished binding
        // leaves pending evidence, so the scope terminal check cannot report success.
        file.complete = true;
        self.ledger.borrow_mut().declared_pending -= 1;
        Ok(ReadStep::Complete)
    }
}
