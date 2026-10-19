//! Public Darwin API calls only, each exactly one attempt. Never called by synthetic tests.
use super::*;
use std::{ffi::c_void, fs::File, mem::MaybeUninit, os::fd::AsRawFd, ptr::NonNull};
unsafe extern "C" {
    fn filesec_init() -> *mut c_void;
    fn filesec_free(sec: *mut c_void);
    fn fstatx_np(fd: libc::c_int, stat: *mut libc::stat, sec: *mut c_void) -> libc::c_int;
    fn filesec_query_property(
        sec: *mut c_void,
        property: libc::c_int,
        present: *mut libc::c_int,
    ) -> libc::c_int;
}
const FILESEC_ACL: i32 = 5; // Public sys/fcntl.h; never FILESEC_ACL_RAW/ALLOCSIZE.
pub(super) struct Filesec(NonNull<c_void>);
impl Drop for Filesec {
    fn drop(&mut self) {
        // SAFETY: sole owner of a non-null filesec_init result; no Clone/public constructor.
        unsafe { filesec_free(self.0.as_ptr()) };
    }
}
pub(super) struct SystemApi;
// SAFETY: raw must be null or a unique, unfreed result of filesec_init, never a borrowed pointer.
pub(super) unsafe fn owned_filesec(raw: *mut c_void) -> Result<Filesec, Errno> {
    NonNull::new(raw).map(Filesec).ok_or(Errno(libc::ENOMEM))
}
fn errno() -> Errno {
    Errno(
        std::io::Error::last_os_error()
            .raw_os_error()
            .unwrap_or(libc::EIO),
    )
}
fn zero_status(code: i32) -> Result<(), Errno> {
    match code {
        0 => Ok(()),
        -1 => Err(errno()),
        _ => Err(Errno(libc::EIO)),
    }
}
fn count(value: isize) -> Result<isize, Errno> {
    if value == -1 {
        Err(errno())
    } else if value < -1 {
        Err(Errno(libc::EIO))
    } else {
        Ok(value)
    }
}
impl RawApi for SystemApi {
    type File = File;
    type Acl = Filesec;
    fn stat(&mut self, file: &File) -> Result<libc::stat, Errno> {
        let mut raw = MaybeUninit::<libc::stat>::zeroed();
        // SAFETY: live borrowed File and correctly aligned, writable Darwin stat storage.
        zero_status(unsafe { libc::fstat(file.as_raw_fd(), raw.as_mut_ptr()) })?;
        Ok(unsafe { raw.assume_init() }) // Successful call; no failed output is read.
    }
    fn fs(&mut self, file: &File) -> Result<libc::statfs, Errno> {
        let mut raw = MaybeUninit::<libc::statfs>::zeroed();
        // SAFETY: same held File; output is sized/aligned for the target ABI.
        zero_status(unsafe { libc::fstatfs(file.as_raw_fd(), raw.as_mut_ptr()) })?;
        Ok(unsafe { raw.assume_init() })
    }
    fn acl_init(&mut self) -> Result<Filesec, Errno> {
        // SAFETY: no inputs; transfer ownership before any caller post-operation guard.
        let raw = unsafe { filesec_init() };
        // SAFETY: raw is exactly this call's newly owned result (or null).
        unsafe { owned_filesec(raw) }
    }
    fn acl_stat(&mut self, file: &File, acl: &mut Filesec) -> Result<libc::stat, Errno> {
        let mut raw = MaybeUninit::<libc::stat>::zeroed();
        // SAFETY: both File and unique filesec owner outlive this one synchronous call.
        zero_status(unsafe { fstatx_np(file.as_raw_fd(), raw.as_mut_ptr(), acl.0.as_ptr()) })?;
        Ok(unsafe { raw.assume_init() })
    }
    fn acl_query(&mut self, acl: &mut Filesec) -> Result<i32, Errno> {
        let mut present = -1;
        // SAFETY: owned filesec and initialized output integer; query does not transfer an ACL.
        zero_status(unsafe { filesec_query_property(acl.0.as_ptr(), FILESEC_ACL, &mut present) })?;
        Ok(present)
    }
    fn names_size(&mut self, file: &File) -> Result<isize, Errno> {
        // SAFETY: null/zero is the documented length query; options=0 for FD API.
        count(unsafe { libc::flistxattr(file.as_raw_fd(), std::ptr::null_mut(), 0, 0) })
    }
    fn names_read(&mut self, file: &File, output: &mut [u8]) -> Result<isize, Errno> {
        // SAFETY: source enforces nonempty bounded slice, passed with its exact capacity.
        count(unsafe {
            libc::flistxattr(
                file.as_raw_fd(),
                output.as_mut_ptr().cast(),
                output.len(),
                0,
            )
        })
    }
    fn pread(&mut self, file: &File, offset: i64, output: &mut [u8]) -> Result<isize, Errno> {
        // SAFETY: source checks off_t conversion/range; writable slice length is exact.
        count(unsafe {
            libc::pread(
                file.as_raw_fd(),
                output.as_mut_ptr().cast(),
                output.len(),
                offset,
            )
        })
    }
}
