#![allow(unsafe_code)]
use std::{
    fs::{self, File},
    io::Read,
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::process::{CommandExt, ExitStatusExt},
    },
    path::PathBuf,
    process::{Command, Stdio},
    sync::{Arc, Mutex, OnceLock, Weak},
    time::{Duration, Instant},
};
struct Probe(PathBuf);
impl std::ops::Deref for Probe {
    type Target = PathBuf;
    fn deref(&self) -> &PathBuf {
        &self.0
    }
}
impl Drop for Probe {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn probe() -> Arc<Probe> {
    static PROBE: OnceLock<Mutex<Weak<Probe>>> = OnceLock::new();
    let mut slot = PROBE
        .get_or_init(|| Mutex::new(Weak::new()))
        .lock()
        .unwrap();
    if let Some(value) = slot.upgrade() {
        return value;
    }
    let root = std::env::temp_dir().join(format!("r2-ol03-exec-{}", std::process::id()));
    fs::create_dir(&root).unwrap();
    let root = Arc::new(Probe(fs::canonicalize(root).unwrap()));
    let deps = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();
    let libc = fs::read_dir(&deps)
        .unwrap()
        .filter_map(|e| {
            let p = e.unwrap().path();
            let n = p.file_name()?.to_str()?;
            (n.starts_with("liblibc-") && n.ends_with(".rlib")).then_some(p)
        })
        .collect::<Vec<_>>();
    assert_eq!(libc.len(), 1, "ambiguous test-only libc build input");
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exec_probe.rs");
    let output = Command::new("rustc")
        .args(["--edition=2024", "-Awarnings"])
        .arg(source)
        .arg("--extern")
        .arg(format!("libc={}", libc[0].display()))
        .arg("-L")
        .arg(format!("dependency={}", deps.display()))
        .arg("-o")
        .arg(root.join("node"))
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "fixture compile failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    *slot = Arc::downgrade(&root);
    root
}
struct ResultRow {
    code: Option<i32>,
    signal: Option<i32>,
    out: String,
    terminal: String,
    pid: u32,
}
fn run(code: &str, mode: &str, tty: bool, raw: bool) -> ResultRow {
    let root = probe();
    let mut master = -1;
    let mut slave = -1;
    assert_eq!(
        unsafe {
            libc::openpty(
                &mut master,
                &mut slave,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        },
        0
    );
    let mut master = unsafe { File::from_raw_fd(master) };
    let slave = unsafe { File::from_raw_fd(slave) };
    unsafe {
        let f = libc::fcntl(master.as_raw_fd(), libc::F_GETFL);
        assert!(libc::fcntl(master.as_raw_fd(), libc::F_SETFL, f | libc::O_NONBLOCK) >= 0);
    }
    if raw {
        unsafe {
            let mut t = std::mem::MaybeUninit::<libc::termios>::uninit();
            assert_eq!(libc::tcgetattr(slave.as_raw_fd(), t.as_mut_ptr()), 0);
            let mut t = t.assume_init();
            t.c_lflag &= !libc::ICANON;
            assert_eq!(libc::tcsetattr(slave.as_raw_fd(), libc::TCSANOW, &t), 0);
        }
    }
    let mut command = Command::new(root.join("node"));
    command
        .args([
            "driver",
            mode,
            root.to_str().unwrap(),
            &format!("{}/{}.json", root.display(), code),
        ])
        .env("NODE_OPTIONS", "--import PRIVATE_NODE_PRELOAD")
        .env("NODE_PATH", "PRIVATE_NODE_PATH")
        .env("PRIVATE_TOKEN", "PRIVATE_SHOULD_NOT_PROPAGATE")
        .env("RUST_BACKTRACE", "full")
        .env("PATH", "/PRIVATE_HOSTILE_PATH")
        .stdout(Stdio::piped())
        .stdin(if tty {
            Stdio::from(slave.try_clone().unwrap())
        } else {
            Stdio::null()
        })
        .stderr(Stdio::from(slave.try_clone().unwrap()));
    if tty {
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() < 0
                    || libc::ioctl(0, 0x20007461u64, 0) < 0
                    || libc::tcsetpgrp(0, libc::getpgrp()) != 0
                {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
    let mut child = command.spawn().unwrap();
    let pid = child.id();
    drop(slave);
    let end = Instant::now() + Duration::from_secs(5);
    let mut terminal = Vec::new();
    let mut b = [0u8; 4096];
    let status = loop {
        match master.read(&mut b) {
            Ok(n) => terminal.extend_from_slice(&b[..n]),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => {}
        }
        if let Some(status) = child.try_wait().unwrap() {
            break status;
        }
        if Instant::now() > end {
            let _ = child.kill();
            let _ = child.wait();
            panic!("owned OS fixture deadline");
        }
        std::thread::sleep(Duration::from_millis(2));
    };
    while let Ok(n) = master.read(&mut b) {
        if n == 0 {
            break;
        }
        terminal.extend_from_slice(&b[..n]);
    }
    let mut out = String::new();
    child
        .stdout
        .take()
        .unwrap()
        .read_to_string(&mut out)
        .unwrap();
    ResultRow {
        code: status.code(),
        signal: status.signal(),
        out,
        terminal: String::from_utf8(terminal).unwrap(),
        pid,
    }
}
#[test]
fn real_exec_preserves_codes_and_enforces_os_contract() {
    let _lease = probe();
    for code in [0, 10, 64, 70, 71, 72, 73, 80, 81, 82, 124, 130] {
        let row = run(
            &code.to_string(),
            if code == 0 { "default" } else { "run" },
            true,
            false,
        );
        assert_eq!(row.code, Some(code), "{}", row.terminal);
        assert_eq!(row.signal, None);
        assert!(row.out.is_empty());
        assert!(
            row.terminal
                .contains(&format!("OS_EXEC_OK:{}:{}", row.pid, code))
        );
        assert!(!row.terminal.contains("PRIVATE"));
    }
}
#[test]
fn actual_exec_failure_is_fixed_nonzero_without_diagnostics() {
    let row = run("exec-fail", "run", true, false);
    assert_eq!(row.code, Some(94));
    assert_eq!(row.signal, None);
    assert!(row.out.is_empty() && row.terminal.is_empty());
}
#[test]
fn non_tty_raw_and_cwd_fail_before_exec() {
    for (code, tty, raw) in [
        ("0", false, false),
        ("0", true, true),
        ("cwd-fail", true, false),
    ] {
        let row = run(code, "run", tty, raw);
        assert_eq!(row.code, Some(93));
        assert!(row.out.is_empty() && row.terminal.is_empty());
    }
}
#[test]
fn argv_injection_is_rejected_before_exec() {
    let row = run("0", "invalid", true, false);
    assert_eq!(row.code, Some(90));
    assert!(row.out.is_empty() && row.terminal.is_empty());
}
