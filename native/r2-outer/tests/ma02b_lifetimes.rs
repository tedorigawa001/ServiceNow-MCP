//! Compile the actual private implementation, never a stand-in type or privacy-only failure.
#![cfg(unix)]
use serde_json::Value;
use std::{
    fs::{self, File},
    os::unix::fs::DirBuilderExt,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
const LEAF: &str = "src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator/management_projection.rs";
const MAX_OUTPUT: u64 = 8 * 1024 * 1024;
struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("r2-ma02b-borrow-{}-{nonce}", std::process::id()));
        fs::DirBuilder::new().mode(0o700).create(&path).unwrap();
        Self(path)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
// Ensure compiler termination/reaping even if a filesystem/assertion error unwinds the test.
struct Compiler(Child);
impl Drop for Compiler {
    fn drop(&mut self) {
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}
fn copy_sources(from: &Path, to: &Path, depth: usize, counts: &mut (usize, u64)) {
    assert!(depth <= 64);
    fs::create_dir(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let path = entry.unwrap().path();
        let metadata = fs::symlink_metadata(&path).unwrap();
        assert!(
            !metadata.file_type().is_symlink(),
            "test source symlink refused"
        );
        let target = to.join(path.file_name().unwrap());
        if metadata.is_dir() {
            counts.0 += 1;
            assert!(counts.0 <= 4096);
            copy_sources(&path, &target, depth + 1, counts);
        } else if metadata.is_file() && path.extension().is_some_and(|e| e == "rs") {
            counts.0 += 1;
            counts.1 = counts.1.checked_add(metadata.len()).unwrap();
            assert!(counts.0 <= 4096 && counts.1 <= 16 * 1024 * 1024);
            fs::copy(path, target).unwrap();
        }
    }
}
struct Diagnostic {
    code: String,
    primary_in_fixture: bool,
}
fn check_case(
    root: &Path,
    manifest: &Path,
    original: &str,
    fixture: &Path,
) -> (bool, Vec<Diagnostic>) {
    let label = fixture.file_stem().unwrap().to_str().unwrap();
    let stdout = root.join(format!("{label}.json"));
    let stderr = root.join(format!("{label}.stderr"));
    let include = serde_json::to_string(fixture.to_str().unwrap()).unwrap();
    fs::write(
        root.join(LEAF),
        format!("{original}\ninclude!({include});\n"),
    )
    .unwrap();
    let mut command = Command::new(env!("CARGO"));
    command
        .args([
            "check",
            "--offline",
            "--locked",
            "--lib",
            "--message-format=json",
            "--quiet",
        ])
        .arg("--manifest-path")
        .arg(manifest)
        .arg("--target-dir")
        .arg(root.join("target"))
        .current_dir(root)
        .env("CARGO_TERM_COLOR", "never")
        .stdout(Stdio::from(File::create(&stdout).unwrap()))
        .stderr(Stdio::from(File::create(&stderr).unwrap()));
    for variable in [
        "RUSTC",
        "RUSTC_WRAPPER",
        "RUSTC_WORKSPACE_WRAPPER",
        "RUSTFLAGS",
        "CARGO_ENCODED_RUSTFLAGS",
        "RUSTDOCFLAGS",
        "RUSTC_BOOTSTRAP",
    ] {
        command.env_remove(variable);
    }
    let mut child = Compiler(command.spawn().unwrap());
    let deadline = Instant::now() + Duration::from_secs(90);
    let status = loop {
        if let Some(status) = child.0.try_wait().unwrap() {
            break status;
        }
        if Instant::now() >= deadline
            || fs::metadata(&stdout).unwrap().len() > MAX_OUTPUT
            || fs::metadata(&stderr).unwrap().len() > MAX_OUTPUT
        {
            let _ = child.0.kill();
            child.0.wait().unwrap();
            panic!("compiler fixture timeout/output limit (not an expected borrow rejection)");
        }
        thread::sleep(Duration::from_millis(20));
    };
    assert!(fs::metadata(&stdout).unwrap().len() <= MAX_OUTPUT);
    assert!(fs::metadata(&stderr).unwrap().len() <= MAX_OUTPUT);
    let mut diagnostics = Vec::new();
    for line in fs::read_to_string(stdout).unwrap().lines() {
        let value: Value = serde_json::from_str(line).expect("structured compiler JSON required");
        if value["reason"] != "compiler-message" || value["message"]["level"] != "error" {
            continue;
        }
        let message = &value["message"];
        let code = message["code"]["code"]
            .as_str()
            .expect("coded compiler error required")
            .to_owned();
        let primary_in_fixture = message["spans"].as_array().unwrap().iter().any(|span| {
            span["is_primary"] == true
                && span["file_name"]
                    .as_str()
                    .is_some_and(|name| Path::new(name) == fixture)
        });
        diagnostics.push(Diagnostic {
            code,
            primary_in_fixture,
        });
    }
    // Only finite diagnostic codes/case names are reported, never source bodies or environment.
    // The caller's expected-code checks decide whether this is an intentional borrow rejection.
    (status.success(), diagnostics)
}

#[test]
fn actual_ma02b_types_reject_scope_escape_and_estimate_move_with_positive_controls() {
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let scratch = Scratch::new();
    copy_sources(&source.join("src"), &scratch.0.join("src"), 0, &mut (0, 0));
    for name in ["Cargo.toml", "Cargo.lock"] {
        assert!(fs::metadata(source.join(name)).unwrap().len() <= 65536);
        fs::copy(source.join(name), scratch.0.join(name)).unwrap();
    }
    let original = fs::read_to_string(scratch.0.join(LEAF)).unwrap();
    let fixture_root = source.join("tests/fixtures/ma02b_lifetimes");
    let cases = [
        ("scope_pass.rs", None),
        ("scope_fail.rs", Some("E0521")),
        ("move_pass.rs", None),
        ("move_fail.rs", Some("E0505")),
    ];
    for (file, expected) in cases {
        let fixture = fixture_root.join(file);
        let (success, diagnostics) = check_case(
            &scratch.0,
            &scratch.0.join("Cargo.toml"),
            &original,
            &fixture,
        );
        let codes: Vec<_> = diagnostics.iter().map(|v| v.code.as_str()).collect();
        match expected {
            None => assert!(
                success && diagnostics.is_empty(),
                "positive control {file}: {codes:?}"
            ),
            Some(expected) => {
                assert!(!success, "negative case compiled: {file}");
                assert!(
                    diagnostics
                        .iter()
                        .any(|v| v.code == expected && v.primary_in_fixture),
                    "{file}: expected {expected} in fixture, got {codes:?}"
                );
                let allowed: &[&str] = if expected == "E0521" {
                    &["E0521", "E0597", "E0515"]
                } else {
                    &["E0505"]
                };
                assert!(
                    !codes.is_empty() && codes.iter().all(|code| allowed.contains(code)),
                    "unexpected/privacy/name/tooling error in {file}: {codes:?}"
                );
            }
        }
        println!("MA-02B {file}: success={success}, codes={codes:?}");
    }
}
