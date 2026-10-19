//! Evidence over an already securely opened FD; no path opening/owner override here.
use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    os::unix::{
        ffi::OsStrExt,
        fs::{FileExt, MetadataExt, OpenOptionsExt},
    },
};
struct PinnedFile {
    file: File,
    path: String,
    started: Instant,
    cancelled: Rc<AtomicBool>,
}
impl PinnedFile {
    fn guard(&self) -> Result<(), Rejection> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err(Rejection::Cancelled);
        }
        if Instant::now()
            .checked_duration_since(self.started)
            .is_none_or(|d| d >= Duration::from_secs(10))
        {
            return Err(Rejection::Deadline);
        }
        Ok(())
    }
    fn inspect(&self) -> Result<(Identity, Layout), Rejection> {
        self.guard()?;
        let before = self.file.metadata().map_err(|_| Rejection::ApiFailed)?;
        if !before.is_file()
            || before.nlink() != 1
            || before.len() < 32
            || before.len() > 512 * 1024 * 1024
        {
            return Err(Rejection::Unsupported);
        }
        let mut head = [0u8; 32];
        self.file
            .read_exact_at(&mut head, 0)
            .map_err(|_| Rejection::ApiFailed)?;
        // MH_MAGIC_64, CPU_TYPE_ARM64, CPU_SUBTYPE_ARM64_ALL, MH_EXECUTE (not arm64e/fat).
        let word = |i| u32::from_le_bytes(head[i..i + 4].try_into().unwrap());
        let layout =
            if word(0) == 0xfeedfacf && word(4) == 0x0100000c && word(8) == 0 && word(12) == 2 {
                Layout::ThinArm64
            } else {
                Layout::Unsupported
            };
        let mut hash = Sha256::new();
        let mut offset = 0;
        let mut buffer = [0u8; 65536];
        while offset < before.len() {
            self.guard()?;
            let count = usize::try_from((before.len() - offset).min(buffer.len() as u64))
                .map_err(|_| Rejection::Limit)?;
            self.file
                .read_exact_at(&mut buffer[..count], offset)
                .map_err(|_| Rejection::IdentityChanged)?;
            hash.update(&buffer[..count]);
            offset += count as u64;
        }
        let after = self.file.metadata().map_err(|_| Rejection::ApiFailed)?;
        let stamp = |m: &std::fs::Metadata| {
            (
                m.dev(),
                m.ino(),
                m.len(),
                m.uid(),
                m.gid(),
                m.mode(),
                m.nlink(),
                m.mtime(),
                m.mtime_nsec(),
                m.ctime(),
                m.ctime_nsec(),
            )
        };
        if stamp(&before) != stamp(&after) {
            return Err(Rejection::IdentityChanged);
        }
        self.guard()?;
        Ok((
            Identity {
                device: before.dev(),
                inode: before.ino(),
                size: before.len(),
                sha256: format!("{:x}", hash.finalize()),
            },
            layout,
        ))
    }
}
impl Evidence for PinnedFile {
    fn checkpoint(&self) -> Result<(), Rejection> {
        self.guard()
    }
    fn path(&self) -> &str {
        &self.path
    }
    fn identity(&self) -> Result<Identity, Rejection> {
        self.inspect().map(|v| v.0)
    }
    fn path_identity(&self) -> Result<Identity, Rejection> {
        self.guard()?;
        let file = std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC | libc::O_NONBLOCK)
            .open(&self.path)
            .map_err(|_| Rejection::IdentityChanged)?;
        let other = PinnedFile {
            file,
            path: self.path.clone(),
            started: self.started,
            cancelled: self.cancelled.clone(),
        };
        other.identity()
    }
    fn layout(&self) -> Result<Layout, Rejection> {
        self.inspect().map(|v| v.1)
    }
}
// Intentionally no public constructor, installed-record hook or test-owner bypass.
// Future connection must supply the deployment inspector's retained FD + exact approved path.
fn staged_backend(
    file: File,
    path: &std::path::Path,
    started: Instant,
    cancelled: Rc<AtomicBool>,
) -> Result<Native<super::ffi::SystemApi, PinnedFile>, Rejection> {
    let path = std::str::from_utf8(path.as_os_str().as_bytes())
        .map_err(|_| Rejection::Unsupported)?
        .to_owned();
    if !path.starts_with('/') || path.len() > 4096 {
        return Err(Rejection::IdentityChanged);
    }
    Ok(Native {
        api: Rc::new(super::ffi::SystemApi),
        evidence: PinnedFile {
            file,
            path,
            started,
            cancelled,
        },
    })
}
