//! Test-only OS boundary peer. Never a production launcher/verification bypass.
#[path = "../../src/exec_os.rs"]
mod exec_os;
#[path = "../../src/launch_args.rs"]
mod launch_args;
use std::{io::Write, os::unix::ffi::OsStrExt};
fn stop(code: i32) -> ! {
    std::process::exit(code)
}
fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    if args.get(1).is_some_and(|s| s == "driver") {
        if args.len() != 5 {
            stop(96);
        }
        let (case, root, manifest) = (&args[2], &args[3], &args[4]);
        let input = if case == "invalid" {
            vec![
                "run".into(),
                manifest.clone(),
                "--import".into(),
                "PRIVATE_PRELOAD".into(),
            ]
        } else if case == "default" {
            vec![manifest.clone()]
        } else {
            vec![case.clone(), manifest.clone()]
        };
        let parsed = match launch_args::parse(&input) {
            Ok(v) => v,
            Err(_) => stop(90),
        };
        // Deliberately inherit extra non-CLOEXEC descriptors and hostile signal state in this owned process.
        unsafe {
            let fd = libc::open(c"/dev/null".as_ptr(), libc::O_RDONLY);
            if fd < 0 || libc::dup2(fd, 200) < 0 || libc::dup2(fd, 201) < 0 {
                stop(96);
            }
            libc::close(fd);
            for signal in [
                libc::SIGINT,
                libc::SIGHUP,
                libc::SIGQUIT,
                libc::SIGTSTP,
                libc::SIGUSR1,
            ] {
                libc::signal(signal, libc::SIG_IGN);
            }
            let mut mask = std::mem::MaybeUninit::<libc::sigset_t>::uninit();
            libc::sigemptyset(mask.as_mut_ptr());
            libc::sigaddset(mask.as_mut_ptr(), libc::SIGTERM);
            libc::sigprocmask(libc::SIG_SETMASK, mask.as_ptr(), std::ptr::null_mut());
        }
        let node = if manifest.ends_with("exec-fail.json") {
            format!("{root}/missing-node")
        } else {
            format!("{root}/node")
        };
        let cwd = if manifest.ends_with("cwd-fail.json") {
            format!("{root}/missing-dir")
        } else {
            root.clone()
        };
        let image = match exec_os::Image::new(&node, &cwd, parsed) {
            Ok(v) => v,
            Err(c) => stop(c),
        };
        match image.replace() {
            Err(c) => stop(c),
            Ok(x) => match x {},
        }
    }
    // Replacement peer: the Rust runtime is alive but no application sockets/files have been opened.
    if args.len() != 4 {
        stop(97);
    }
    let root = args[1]
        .strip_suffix("/dist/review/r2-launcher-entry.js")
        .unwrap_or("");
    if root.is_empty()
        || args[0] != format!("{root}/node")
        || !["check-plan", "run"].contains(&args[2].as_str())
        || std::path::Path::new(&args[3]).parent() != Some(std::path::Path::new(root))
        || std::env::current_dir().unwrap().as_os_str().as_bytes() != root.as_bytes()
    {
        stop(97);
    }
    if std::env::vars().any(|(k, v)| {
        k != "__CF_USER_TEXT_ENCODING"
            || !v.split(':').all(|s| {
                s.strip_prefix("0x")
                    .is_some_and(|h| !h.is_empty() && h.bytes().all(|b| b.is_ascii_hexdigit()))
            })
    }) {
        stop(97);
    }
    unsafe {
        let mut limit = std::mem::MaybeUninit::<libc::rlimit>::uninit();
        if libc::getrlimit(libc::RLIMIT_CORE, limit.as_mut_ptr()) != 0 {
            stop(97);
        }
        let limit = limit.assume_init();
        if limit.rlim_cur != 0 || limit.rlim_max != 0 || libc::umask(0o077) != 0o077 {
            stop(97);
        }
        if libc::fcntl(200, libc::F_GETFD) != -1 || libc::fcntl(201, libc::F_GETFD) != -1 {
            stop(97);
        }
        let mut mask = std::mem::MaybeUninit::<libc::sigset_t>::uninit();
        if libc::sigprocmask(0, std::ptr::null(), mask.as_mut_ptr()) != 0 {
            stop(97);
        }
        let mask = mask.assume_init();
        if libc::sigismember(&mask, libc::SIGINT) != 0
            || libc::sigismember(&mask, libc::SIGTERM) != 0
        {
            stop(97);
        }
        // No catchable signal may remain SIG_IGN: an inherited ignore (e.g. nohup) would survive exec.
        // The Rust runtime installs its own SIGSEGV/SIGBUS handlers, so test for SIG_IGN, not SIG_DFL.
        for signal in 1..32 {
            // Darwin NSIG; libc does not export it for macOS.
            // Rust std (like Node) sets SIGPIPE to SIG_IGN during its own startup, so it is not observable here.
            if signal == libc::SIGKILL || signal == libc::SIGSTOP || signal == libc::SIGPIPE {
                continue;
            }
            let mut action = std::mem::MaybeUninit::<libc::sigaction>::uninit();
            if libc::sigaction(signal, std::ptr::null(), action.as_mut_ptr()) != 0
                || action.assume_init().sa_sigaction == libc::SIG_IGN
            {
                stop(97);
            }
        }
    }
    let name = std::path::Path::new(&args[3])
        .file_stem()
        .unwrap()
        .to_str()
        .unwrap();
    let code = name.parse::<i32>().unwrap_or(97);
    if args[2] != if code == 0 { "check-plan" } else { "run" } {
        stop(97);
    }
    if ![0, 10, 64, 70, 71, 72, 73, 80, 81, 82, 124, 130].contains(&code) {
        stop(97);
    }
    let _ = std::io::stdout().write_all(b"PRIVATE_STDOUT_TRAP\n");
    eprintln!("OS_EXEC_OK:{}:{}", std::process::id(), code);
    stop(code);
}
