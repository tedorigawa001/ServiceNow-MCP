//! Scan-local normalization. No target metadata quota, OS source, or trusted policy producer.
use super::*;

#[derive(PartialEq, Eq)]
pub(super) enum AttributeNames {
    Empty,
    Provenance,
}
pub(super) struct MetadataSnapshot<'r, 's, S: ScanOps> {
    resource: &'r Resource<'s, S>,
    stat: Stat,
    names: AttributeNames,
}
impl<S: ScanOps> PartialEq for MetadataSnapshot<'_, '_, S> {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self.resource, other.resource)
            && self.stat == other.stat
            && self.names == other.names
    }
}
impl<S: ScanOps> Eq for MetadataSnapshot<'_, '_, S> {}
pub(super) struct MetadataPolicy {
    pub(super) device: u64,
    pub(super) kind: Kind,
    pub(super) mode: u32,
    pub(super) size: Option<u64>,
}
impl<S: ScanOps> Boundary<'_, '_, '_, S> {
    fn unsuitable<T>(&mut self, after: bool) -> Result<T, Failure> {
        self.fail(if after {
            Failure::Changed
        } else {
            Failure::Metadata
        })
    }
    pub(super) fn collect_snapshot<'r, 's>(
        &mut self,
        resource: &'r Resource<'s, S>,
        policy: &MetadataPolicy,
        after: bool,
    ) -> Result<MetadataSnapshot<'r, 's, S>, Failure> {
        self.check(resource)?;
        let kind = match (resource.kind, policy.kind, policy.mode, policy.size) {
            (Kind::File, Kind::File, 0o444 | 0o555, Some(size)) if size <= MAX_FILE => {
                FileType::Regular
            }
            (Kind::Directory | Kind::Cursor, Kind::Directory, 0o555, None) => FileType::Directory,
            _ => return self.fail(Failure::Binding),
        };
        let MetaValue::Stat(before) = self.metadata(resource, MetaOp::Stat, &mut [])? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if before.kind != kind || policy.size.is_some_and(|size| size != before.size) {
            return self.fail(Failure::Changed);
        }
        if before.uid != 0
            || before.device != policy.device
            || before.mode != policy.mode
            || (kind == FileType::Regular && before.links != 1)
            || before.mtime.nanoseconds >= 1_000_000_000
            || before.ctime.nanoseconds >= 1_000_000_000
        {
            return self.unsuitable(after);
        }
        let MetaValue::Filesystem(fs) = self.metadata(resource, MetaOp::Filesystem, &mut [])?
        else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if fs.location == Filesystem::Unknown {
            return self.fail(Failure::MetadataUnavailable);
        }
        if fs.location != Filesystem::Local || !fs.apfs || fs.ownership_ignored || fs.noexec {
            return self.unsuitable(after);
        }
        let acl = self.acquire(Some(resource), None, Kind::Acl)?;
        let MetaValue::Stat(acl_stat) = self.metadata(&acl, MetaOp::AclStat, &mut [])? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if acl_stat != before {
            return self.fail(Failure::Changed);
        }
        let MetaValue::Acl(present) = self.metadata(&acl, MetaOp::AclQuery, &mut [])? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if present != 0 {
            return self.unsuitable(after);
        }
        let MetaValue::Size(declared) = self.metadata(resource, MetaOp::NamesSize, &mut [])? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        // The primitive already rejects negative/over-64KiB sizes. Allocate only after
        // checking the independent scan copy allowance; zero still needs a one-byte probe.
        let n = declared as usize;
        let capacity = n.max(1);
        work(self.budget)?;
        if self
            .ledger
            .borrow()
            .names
            .checked_add(capacity as u64)
            .is_none_or(|v| v > self.quotas.name_bytes)
        {
            return self.fail(Failure::Limit);
        }
        let mut raw = Vec::new();
        if raw.try_reserve_exact(capacity).is_err() {
            return self.fail(Failure::Limit);
        }
        raw.resize(capacity, 0);
        self.budget.checkpoint()?;
        let MetaValue::Bytes(got) = self.metadata(resource, MetaOp::NamesRead, &mut raw)? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        if got != n {
            return self.fail(Failure::Changed);
        }
        let MetaValue::Size(confirmed) = self.metadata(resource, MetaOp::NamesSize, &mut [])?
        else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if confirmed != declared {
            return self.fail(Failure::Changed);
        }
        work(self.budget)?;
        let names = if n == 0 {
            AttributeNames::Empty
        } else if &raw[..n] == b"com.apple.provenance\0" {
            AttributeNames::Provenance
        } else {
            return self.unsuitable(after);
        };
        let MetaValue::Stat(last) = self.metadata(resource, MetaOp::Stat, &mut [])? else {
            return self.fail(Failure::MetadataUnavailable);
        };
        work(self.budget)?;
        if last != before {
            return self.fail(Failure::Changed);
        }
        drop(acl); // prepaid, exactly once, even on all earlier error paths
        self.budget.checkpoint()?;
        if self.ledger.borrow().unconfirmed != 0 {
            return self.fail(Failure::Unavailable);
        }
        Ok(MetadataSnapshot {
            resource,
            stat: before,
            names,
        })
    }
}
