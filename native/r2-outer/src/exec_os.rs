//! Private, dedicated single-threaded process only. No spawn, shell, PATH search or result remapping.
#![allow(unsafe_code)]
use crate::launch_args::{Arguments, absolute};
use std::{convert::Infallible, ffi::CString};
pub(crate) const SETUP_FAILED: i32 = 93;
pub(crate) const EXEC_FAILED: i32 = 94;
pub(crate) struct Image {
    node: CString,
    cwd: CString,
    argv: Vec<CString>,
}
impl Image {
    pub fn new(node: &str, cwd: &str, args: Arguments) -> Result<Self, i32> {
        if !absolute(node)
            || !absolute(cwd)
            || !node.strip_prefix(cwd).is_some_and(|s| s.starts_with('/'))
        {
            return Err(SETUP_FAILED);
        }
        let argv = [
            node.to_string(),
            format!("{cwd}/dist/review/r2-launcher-entry.js"),
            args.mode.as_str().into(),
            args.manifest,
        ];
        let strings = argv
            .into_iter()
            .map(|s| CString::new(s).map_err(|_| SETUP_FAILED))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            node: CString::new(node).map_err(|_| SETUP_FAILED)?,
            cwd: CString::new(cwd).map_err(|_| SETUP_FAILED)?,
            argv: strings,
        })
    }
    pub fn replace(self) -> Result<Infallible, i32> {
        replace(self)
    }
}
#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
fn replace(_: Image) -> Result<Infallible, i32> {
    Err(95)
}
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn replace(image: Image) -> Result<Infallible, i32> {
    use std::{
        mem::{MaybeUninit, size_of},
        ptr,
    };
    // Allocate all buffers/argv pointers before changing process state. No Rust unwind after transition.
    let mut fds = vec![
        libc::proc_fdinfo {
            proc_fd: 0,
            proc_fdtype: 0
        };
        65536
    ];
    let mut argv = image.argv.iter().map(|s| s.as_ptr()).collect::<Vec<_>>();
    argv.push(ptr::null());
    let env = [ptr::null::<libc::c_char>()];
    // SAFETY: fixed fds and bounded output buffers. This primitive must only run in its owned dedicated process.
    unsafe {
        let mut a = MaybeUninit::<libc::stat>::uninit();
        let mut b = MaybeUninit::<libc::stat>::uninit();
        let mut term = MaybeUninit::<libc::termios>::uninit();
        if libc::isatty(0) != 1
            || libc::isatty(2) != 1
            || libc::fstat(0, a.as_mut_ptr()) != 0
            || libc::fstat(2, b.as_mut_ptr()) != 0
            || libc::tcgetattr(0, term.as_mut_ptr()) != 0
            || libc::tcgetpgrp(0) != libc::getpgrp()
        {
            return Err(SETUP_FAILED);
        }
        let (a, b, term) = (a.assume_init(), b.assume_init(), term.assume_init());
        if a.st_rdev != b.st_rdev
            || a.st_dev != b.st_dev
            || a.st_ino != b.st_ino
            || term.c_lflag & (libc::ICANON | libc::ISIG) != (libc::ICANON | libc::ISIG)
        {
            return Err(SETUP_FAILED);
        }
        let mut queued = 0i32;
        if libc::ioctl(0, libc::FIONREAD, &mut queued) != 0 || queued != 0 {
            return Err(SETUP_FAILED);
        }
        let cwd = libc::open(
            image.cwd.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC,
        );
        if cwd < 0 {
            return Err(SETUP_FAILED);
        }
        let null = libc::open(c"/dev/null".as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC);
        if null < 0 {
            libc::close(cwd);
            return Err(SETUP_FAILED);
        }
        // From here any failure exits this process: returning to a caller with partial state is unsafe.
        if libc::fchdir(cwd) != 0 || libc::dup2(null, 1) < 0 {
            libc::_exit(SETUP_FAILED);
        }
        for fd in 0..=2 {
            let flags = libc::fcntl(fd, libc::F_GETFD);
            if flags < 0 || libc::fcntl(fd, libc::F_SETFD, flags & !libc::FD_CLOEXEC) < 0 {
                libc::_exit(SETUP_FAILED);
            }
        }
        libc::umask(0o077);
        let core = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        let mut actual = MaybeUninit::<libc::rlimit>::uninit();
        if libc::setrlimit(libc::RLIMIT_CORE, &core) != 0
            || libc::getrlimit(libc::RLIMIT_CORE, actual.as_mut_ptr()) != 0
        {
            libc::_exit(SETUP_FAILED);
        }
        let actual = actual.assume_init();
        if actual.rlim_cur != 0 || actual.rlim_max != 0 {
            libc::_exit(SETUP_FAILED);
        }
        let mut mask = MaybeUninit::<libc::sigset_t>::uninit();
        if libc::sigemptyset(mask.as_mut_ptr()) != 0
            || libc::sigprocmask(libc::SIG_SETMASK, mask.as_ptr(), ptr::null_mut()) != 0
        {
            libc::_exit(SETUP_FAILED);
        }
        // Inherited SIG_IGN survives exec (e.g. nohup ignores SIGHUP). Reset every catchable signal
        // so the replacement stays bound to its terminal. 32 is Darwin NSIG; libc does not export it.
        for signal in 1..32 {
            if signal != libc::SIGKILL
                && signal != libc::SIGSTOP
                && libc::signal(signal, libc::SIG_DFL) == libc::SIG_ERR
            {
                libc::_exit(SETUP_FAILED);
            }
        }
        let bytes = (fds.len() * size_of::<libc::proc_fdinfo>()) as i32;
        let n = libc::proc_pidinfo(
            libc::getpid(),
            libc::PROC_PIDLISTFDS,
            0,
            fds.as_mut_ptr().cast(),
            bytes,
        );
        if n <= 0 || n >= bytes || !(n as usize).is_multiple_of(size_of::<libc::proc_fdinfo>()) {
            libc::_exit(SETUP_FAILED);
        }
        for f in &fds[..n as usize / size_of::<libc::proc_fdinfo>()] {
            if f.proc_fd < 0 {
                libc::_exit(SETUP_FAILED);
            }
            if f.proc_fd >= 3 && libc::close(f.proc_fd) != 0 {
                libc::_exit(SETUP_FAILED);
            }
        }
        let n = libc::proc_pidinfo(
            libc::getpid(),
            libc::PROC_PIDLISTFDS,
            0,
            fds.as_mut_ptr().cast(),
            bytes,
        );
        if n != 3 * size_of::<libc::proc_fdinfo>() as i32
            || fds[..3].iter().any(|f| !(0..=2).contains(&f.proc_fd))
        {
            libc::_exit(SETUP_FAILED);
        }
        libc::execve(image.node.as_ptr(), argv.as_ptr(), env.as_ptr());
        libc::_exit(EXEC_FAILED); // No raw errno, path, shell fallback, retry or exception formatting.
    }
}
