//! Staged held-File source. No opener, installed-record entry, native Security API or permit.
use super::{collector::*, *};

// No Debug/Display: only finite classifications cross this boundary.
struct Errno(i32);
trait RawApi {
    type File;
    type Acl;
    fn stat(&mut self, file: &Self::File) -> Result<libc::stat, Errno>;
    fn fs(&mut self, file: &Self::File) -> Result<libc::statfs, Errno>;
    fn acl_init(&mut self) -> Result<Self::Acl, Errno>;
    fn acl_stat(&mut self, file: &Self::File, acl: &mut Self::Acl) -> Result<libc::stat, Errno>;
    fn acl_query(&mut self, acl: &mut Self::Acl) -> Result<i32, Errno>;
    // Returned owned Acl is released by Drop; never clone it or return a borrowed handle.
    fn names_size(&mut self, file: &Self::File) -> Result<isize, Errno>;
    fn names_read(&mut self, file: &Self::File, output: &mut [u8]) -> Result<isize, Errno>;
    fn pread(&mut self, file: &Self::File, offset: i64, output: &mut [u8]) -> Result<isize, Errno>;
}
struct HeldSource<A: RawApi> {
    file: A::File,
    api: A,
}
impl<A: RawApi> std::fmt::Debug for HeldSource<A> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HeldMetadataSource(staged_not_execution_authority)")
    }
}
fn op_error(error: Errno) -> OpFailure {
    match error.0 {
        libc::EINTR => OpFailure::Interrupted,
        libc::ERANGE => OpFailure::Range,
        _ => OpFailure::Unavailable,
    }
}
fn decode_stat(raw: libc::stat) -> Result<Stat, OpFailure> {
    let mode = u32::from(raw.st_mode);
    let type_mask = u32::from(libc::S_IFMT);
    if mode & !(type_mask | 0o7777) != 0 {
        return Err(OpFailure::Unavailable);
    }
    let kind = match raw.st_mode & libc::S_IFMT {
        libc::S_IFREG => FileType::Regular,
        libc::S_IFDIR => FileType::Directory,
        libc::S_IFLNK => FileType::Symlink,
        libc::S_IFIFO | libc::S_IFCHR | libc::S_IFBLK | libc::S_IFSOCK => FileType::Other,
        _ => return Err(OpFailure::Unavailable),
    };
    fn time(seconds: i64, nanos: i64) -> Result<Timestamp, OpFailure> {
        if !(0..1_000_000_000).contains(&nanos) {
            return Err(OpFailure::Unavailable);
        }
        Ok(Timestamp {
            seconds,
            nanoseconds: nanos as u32,
        })
    }
    Ok(Stat {
        // Darwin dev_t is signed i32. Match MetadataExt::dev's sign-extended u64 cast,
        // not a checked signed->unsigned conversion or a truncating u32 reinterpretation.
        device: raw.st_dev as u64,
        inode: raw.st_ino,
        kind,
        uid: raw.st_uid,
        gid: raw.st_gid,
        mode: mode & !type_mask, // Only the explicitly decoded file type is removed.
        links: u64::from(raw.st_nlink),
        size: u64::try_from(raw.st_size).map_err(|_| OpFailure::Unavailable)?,
        mtime: time(raw.st_mtime, raw.st_mtime_nsec)?,
        ctime: time(raw.st_ctime, raw.st_ctime_nsec)?,
    })
}
fn decode_fs(raw: libc::statfs) -> Result<FsObservation, OpFailure> {
    let end = raw
        .f_fstypename
        .iter()
        .position(|b| *b == 0)
        .ok_or(OpFailure::Unavailable)?;
    if end == 0 {
        return Err(OpFailure::Unavailable);
    }
    let apfs = end == 4
        && raw.f_fstypename[..end]
            .iter()
            .zip(b"apfs")
            .all(|(a, b)| *a as u8 == *b);
    Ok(FsObservation {
        location: if raw.f_flags & libc::MNT_LOCAL as u32 != 0 {
            Filesystem::Local
        } else {
            Filesystem::NonLocal
        },
        apfs,
        ownership_ignored: raw.f_flags & libc::MNT_IGNORE_OWNERSHIP as u32 != 0,
        noexec: raw.f_flags & libc::MNT_NOEXEC as u32 != 0,
    })
}
impl<A: RawApi> PositionedSource for HeldSource<A> {
    fn pread(&mut self, offset: u64, output: &mut [u8]) -> Result<usize, IoFailure> {
        let offset = i64::try_from(offset).map_err(|_| IoFailure::Failed)?;
        if output.is_empty()
            || output.len() > MAX_CHUNK
            || offset.checked_add(output.len() as i64).is_none()
        {
            return Err(IoFailure::Failed);
        }
        let n = self
            .api
            .pread(&self.file, offset, output)
            .map_err(|e| match e.0 {
                libc::EINTR => IoFailure::Interrupted,
                libc::EAGAIN => IoFailure::WouldBlock,
                _ => IoFailure::Failed,
            })?;
        // Preserve nonnegative counts for ReadScope's accounting/short/oversize checks.
        usize::try_from(n).map_err(|_| IoFailure::Failed)
    }
}
impl<A: RawApi> MetadataOps for HeldSource<A> {
    type AclHandle = A::Acl;
    fn stat(&mut self, _: Phase, _: StatPoint) -> Result<Stat, OpFailure> {
        decode_stat(self.api.stat(&self.file).map_err(op_error)?)
    }
    fn filesystem(&mut self, _: Phase) -> Result<FsObservation, OpFailure> {
        decode_fs(self.api.fs(&self.file).map_err(op_error)?)
    }
    fn acl_init(&mut self, _: Phase) -> Result<Self::AclHandle, OpFailure> {
        self.api.acl_init().map_err(op_error)
    }
    fn acl_stat(&mut self, _: Phase, handle: &mut Self::AclHandle) -> Result<Stat, OpFailure> {
        decode_stat(self.api.acl_stat(&self.file, handle).map_err(op_error)?)
    }
    fn acl_query(&mut self, _: Phase, handle: &mut Self::AclHandle) -> Result<i32, OpFailure> {
        // Keep invalid sentinel values intact: the collector classifies them as unavailable.
        self.api.acl_query(handle).map_err(op_error)
    }
    fn acl_free(&mut self, handle: Self::AclHandle) {
        drop(handle);
    }
    fn names_size(&mut self, _: Phase) -> Result<i64, OpFailure> {
        let n = self.api.names_size(&self.file).map_err(op_error)?;
        if n < 0 {
            return Err(OpFailure::Unavailable);
        }
        Ok(n as i64)
    }
    fn names_read(&mut self, _: Phase, output: &mut [u8]) -> Result<usize, OpFailure> {
        if output.is_empty() || output.len() > 65536 {
            return Err(OpFailure::Unavailable);
        }
        let n = self.api.names_read(&self.file, output).map_err(op_error)?;
        usize::try_from(n).map_err(|_| OpFailure::Unavailable)
    }
}

// No public constructor or runtime caller. Future secure opener must move its owned File here,
// with trusted binding/ancestor/record/lease checks supplied separately. This function proves none.
fn staged_held_source(file: std::fs::File) -> HeldSource<ffi::SystemApi> {
    HeldSource {
        file,
        api: ffi::SystemApi,
    }
}

#[allow(unsafe_code)]
mod ffi;
#[cfg(test)]
mod tests;
