use crate::*;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
pub(crate) struct Native {
    start: Instant,
}
impl Native {
    pub fn new() -> Self {
        Self {
            start: Instant::now(),
        }
    }
}
impl Source for Native {
    fn clock(&self) -> Result<(u64, u64), Failure> {
        let wall = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| Failure::ClockInvalid)?
            .as_millis();
        Ok((
            u64::try_from(wall).map_err(|_| Failure::ClockInvalid)?,
            self.start.elapsed().as_millis() as u64,
        ))
    }
    fn context(&self) -> Result<Context, Failure> {
        platform_context()
    }
    fn read(&self, path: &str, role: Role, uid: u32) -> Result<Snapshot, Failure> {
        platform_read(path, role, uid)
    }
}
#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn platform_context() -> Result<Context, Failure> {
    Err(Failure::Unsupported)
}
#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn platform_read(_: &str, _: Role, _: u32) -> Result<Snapshot, Failure> {
    Err(Failure::Unsupported)
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[allow(unsafe_code)]
mod darwin {
    use super::*;
    use std::{
        ffi::{CString, c_void},
        fs::File,
        io::Read,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::fs::MetadataExt,
        },
    };
    unsafe extern "C" {
        fn filesec_init() -> *mut c_void;
        fn filesec_free(sec: *mut c_void);
        fn filesec_query_property(
            sec: *mut c_void,
            property: libc::c_int,
            present: *mut libc::c_int,
        ) -> libc::c_int;
        fn fstatx_np(fd: libc::c_int, stat: *mut libc::stat, sec: *mut c_void) -> libc::c_int;
    }
    fn no_acl(file: &File) -> Result<bool, Failure> {
        // SAFETY: filesec is owned locally, never dereferenced and freed once. fstatx writes to
        // a correctly sized Darwin stat buffer; query writes to one initialized integer.
        unsafe {
            let sec = filesec_init();
            if sec.is_null() {
                return Err(Failure::UntrustedFile);
            }
            let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
            let fetched = fstatx_np(file.as_raw_fd(), stat.as_mut_ptr(), sec);
            let mut present = -1;
            let queried = if fetched == 0 {
                filesec_query_property(sec, 5, &mut present)
            } else {
                -1
            };
            filesec_free(sec);
            if fetched != 0 || queried != 0 || !(0..=1).contains(&present) {
                return Err(Failure::UntrustedFile);
            }
            Ok(present == 0) // Conservative: reject even empty/deny ACL properties.
        }
    }
    fn metadata(f: &File) -> Result<(Metadata, Vec<u64>), Failure> {
        let m = f.metadata().map_err(|_| Failure::Unavailable)?;
        let value = Metadata {
            directory: m.is_dir(),
            regular: m.is_file(),
            uid: m.uid(),
            gid: m.gid(),
            mode: m.mode() & 0o7777,
            links: m.nlink(),
            no_acl: no_acl(f)?,
        };
        Ok((
            value,
            vec![
                m.dev(),
                m.ino(),
                m.uid() as u64,
                m.gid() as u64,
                m.mode() as u64,
                m.nlink(),
                m.size(),
                m.mtime() as u64,
                m.mtime_nsec() as u64,
                m.ctime() as u64,
                m.ctime_nsec() as u64,
            ],
        ))
    }
    fn open_at(fd: i32, name: &str, dir: bool) -> Result<File, Failure> {
        let name = CString::new(name).map_err(|_| Failure::UntrustedFile)?;
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | libc::O_NONBLOCK
            | if dir { libc::O_DIRECTORY } else { 0 };
        // SAFETY: bounded NUL-terminated name, borrowed live parent fd; positive result is owned exactly once.
        let opened = unsafe { libc::openat(fd, name.as_ptr(), flags) };
        if opened < 0 {
            return Err(Failure::UntrustedFile);
        }
        Ok(unsafe { File::from_raw_fd(opened) })
    }
    fn parent_valid(m: &Metadata, role: Role, uid: u32) -> bool {
        m.directory
            && m.no_acl
            && m.mode & 0o7022 == 0
            && (m.uid == 0 || role == Role::Ledger && m.uid == uid)
    }
    pub(super) fn read(path: &str, role: Role, uid: u32) -> Result<Snapshot, Failure> {
        let parts: Vec<_> = path
            .strip_prefix('/')
            .ok_or(Failure::UntrustedFile)?
            .split('/')
            .collect();
        if path.len() > 4096
            || parts.is_empty()
            || parts.len() > 64
            || parts
                .iter()
                .any(|s| s.is_empty() || *s == "." || *s == "..")
        {
            return Err(Failure::UntrustedFile);
        }
        let root = open_at(libc::AT_FDCWD, "/", true)?;
        let (m, id) = metadata(&root)?;
        if !parent_valid(&m, role, uid) {
            return Err(Failure::UntrustedFile);
        }
        let mut dirs = vec![root];
        let mut ancestors = vec![m];
        let mut ids = vec![id];
        for part in &parts[..parts.len() - 1] {
            let f = open_at(
                dirs.last().ok_or(Failure::UntrustedFile)?.as_raw_fd(),
                part,
                true,
            )?;
            let (m, id) = metadata(&f)?;
            if !parent_valid(&m, role, uid) {
                return Err(Failure::UntrustedFile);
            }
            dirs.push(f);
            ancestors.push(m);
            ids.push(id);
        }
        let mut file = open_at(
            dirs.last().ok_or(Failure::UntrustedFile)?.as_raw_fd(),
            parts.last().ok_or(Failure::UntrustedFile)?,
            false,
        )?;
        let (meta, before) = metadata(&file)?;
        check_file(&meta, role, uid)?;
        if before[6] > MAX_BYTES as u64 {
            return Err(Failure::UntrustedFile);
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take((MAX_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| Failure::Unavailable)?;
        if bytes.len() > MAX_BYTES || metadata(&file)? != (meta.clone(), before.clone()) {
            return Err(Failure::Changed);
        }
        // Retained directory fds prevent path-component redirection during traversal; re-open links to detect replacement.
        for (i, dir) in dirs.iter().enumerate() {
            if metadata(dir)? != (ancestors[i].clone(), ids[i].clone()) {
                return Err(Failure::Changed);
            }
            if i > 0 {
                let again = open_at(dirs[i - 1].as_raw_fd(), parts[i - 1], true)?;
                if metadata(&again)? != (ancestors[i].clone(), ids[i].clone()) {
                    return Err(Failure::Changed);
                }
            }
        }
        let again = open_at(
            dirs.last().ok_or(Failure::UntrustedFile)?.as_raw_fd(),
            parts.last().ok_or(Failure::UntrustedFile)?,
            false,
        )?;
        if metadata(&again)? != (meta.clone(), before.clone()) {
            return Err(Failure::Changed);
        }
        let identity = ids.into_iter().flatten().chain(before).collect();
        Ok(Snapshot {
            bytes,
            meta,
            ancestors,
            identity,
        })
    }
    fn sysctl(name: &str) -> Result<String, Failure> {
        let name = CString::new(name).map_err(|_| Failure::Unsupported)?;
        let mut bytes = [0u8; 128];
        let mut size = bytes.len();
        // SAFETY: bounded output buffer/size, valid NUL-terminated fixed sysctl name.
        if unsafe {
            libc::sysctlbyname(
                name.as_ptr(),
                bytes.as_mut_ptr().cast(),
                &mut size,
                std::ptr::null_mut(),
                0,
            )
        } != 0
            || size < 2
            || size > bytes.len()
            || bytes[size - 1] != 0
        {
            return Err(Failure::Unsupported);
        }
        String::from_utf8(bytes[..size - 1].to_vec()).map_err(|_| Failure::Unsupported)
    }
    pub(super) fn context() -> Result<Context, Failure> {
        // SAFETY: getuid/geteuid have no pointer arguments; getgroups writes at most the supplied buffer capacity.
        let uid = unsafe { libc::getuid() };
        if uid == 0
            || uid != unsafe { libc::geteuid() }
            || unsafe { libc::getgid() } != unsafe { libc::getegid() }
        {
            return Err(Failure::UntrustedFile);
        }
        let mut groups = [0u32; 128];
        let n = unsafe { libc::getgroups(groups.len() as i32, groups.as_mut_ptr()) };
        if n < 0 || n as usize > groups.len() {
            return Err(Failure::UntrustedFile);
        }
        let mut groups = groups[..n as usize].to_vec();
        groups.push(unsafe { libc::getgid() });
        Ok(Context {
            uid,
            groups,
            product_version: sysctl("kern.osproductversion")?,
            os_build: sysctl("kern.osversion")?,
        })
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        use std::os::unix::fs::{PermissionsExt, symlink};
        #[test]
        fn native_openat_rejects_leaf_and_directory_symlinks() {
            let dir = std::env::temp_dir().join(format!("r2-ol02-nofollow-{}", std::process::id()));
            std::fs::create_dir(&dir).unwrap();
            struct Cleanup(std::path::PathBuf);
            impl Drop for Cleanup {
                fn drop(&mut self) {
                    let _ = std::fs::remove_dir_all(&self.0);
                }
            }
            let _cleanup = Cleanup(dir.clone());
            std::fs::write(dir.join("record"), b"synthetic").unwrap();
            std::fs::set_permissions(dir.join("record"), std::fs::Permissions::from_mode(0o600))
                .unwrap();
            symlink("record", dir.join("link")).unwrap();
            symlink(".", dir.join("directory-link")).unwrap();
            let parent = File::open(&dir).unwrap();
            assert!(open_at(parent.as_raw_fd(), "link", false).is_err());
            assert!(open_at(parent.as_raw_fd(), "directory-link", true).is_err());
            let f = open_at(parent.as_raw_fd(), "record", false).unwrap();
            let (meta, _) = metadata(&f).unwrap();
            check_file(&meta, Role::Ledger, unsafe { libc::getuid() }).unwrap();
        }
    }
}
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
use darwin::{context as platform_context, read as platform_read};
