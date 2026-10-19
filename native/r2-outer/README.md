# R-2 outer records: OL-02 offline library

This unpublished Rust library inspects activation/ledger records. It has **no executable,
Node spawn/exec, network, OAuth, permission repair or MCP registration**. A successful
`InspectedRecords` is opaque and is not an execution permit.

The sole installed-record entry point uses the fixed proposed activation location in
`src/lib.rs`; no argv/env/path override is exposed. That location has not been deployed.
Do not invoke it against operational configuration as part of the synthetic tests.

## Local verification

The experimental development requires the observed Rust/Cargo 1.98.1 versions in
[TOOLCHAIN.md](TOOLCHAIN.md); verify them before running. Five direct dependencies
are pinned in Cargo.toml and the resolved closure in Cargo.lock. This is
not a reviewed/vendored/signed production toolchain or deployment approval.
The commands below assume these dependencies/toolchain are already available locally;
they must not download or install tools as a runtime fallback.

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
```

Tests use a private synthetic filesystem boundary and clocks, plus a disposable local
FD/symlink fixture. No root-owned activation, real ledger, group, account or permissions
outside the disposable fixture are created or modified. The native reader is macOS
arm64-only; other hosts fail closed. Rust tests are separate from npm/Vitest and must
be run explicitly; npm users do not gain a Rust build dependency.

## Contract and remaining gates

- Strict typed Serde schemas reject unknown/duplicate keys, including escaped and nested
  duplicates, invalid UTF-8, trailing data, over-64KiB input and depth over 16. Dates use
  exactly `YYYY-MM-DDTHH:mm:ss.sssZ`. Unsigned IDs/integers, fixed schema/policy/entry,
  binary metadata, entitlement lists, paths and release/generation/hash bindings are checked.
- Activation owner=0, mode=0440, GID=declared reader group; ledger owner=execution UID,
  mode=0600. Both must be single-link regular files. Ancestors have trusted owners and
  no group/other write or special bits. All extended ACL properties are conservatively
  refused, including empty/deny-only ACLs. This is stricter than the existing TS reader.
- Native `openat` uses no-follow, directory FDs, close-on-exec and nonblocking opens;
  metadata/ACL and path/FD identities are checked before/after bounded reads. The two
  records are read again and exact bytes/identity compared. Ledger SHA-256 is over the
  original bytes, not normalized JSON.
- Initial validity is strictly greater than 460 seconds, final validity strictly greater
  than 450 seconds; elapsed >=10 seconds fails. Wall/monotonic elapsed drift over 1ms
  fails (1ms sampling-rounding allowance). This observes elapsed time after local I/O;
  a stalled kernel/filesystem call cannot be preempted by this library. NTP slewing alone
  can exceed 1ms if inspection takes seconds; measure frequency on real hosts (fail-closed).
- Because deny-only ACLs on ancestors are refused, a ledger under a macOS home directory
  (default `group:everyone deny delete`) is always refused. Place it under an
  administrator-created, root-owned, ACL-free directory instead.
- Group membership is checked for the executing UID, not exclusivity of all group
  members. Membership uses `getgroups`, which on macOS may return at most 16 groups; a
  user in more groups can be refused (fail-closed). Test >16 groups or switch to
  `getgrouplist` in OL-03. Signature requirements/entitlements/closure hashes are schema-checked, not
  compared to actual binaries/index yet. Those gates, actual TTY/FD/env/rlimits, trusted
  signed deployment, and pre-exec revalidation belong to OL-03+.
- Only the Darwin adapter permits unsafe FFI. Raw record/path/OS/JSON errors are not
  exposed via Debug/error objects; failures are fixed enum values. Panic/native/loader
  diagnostics before a future protected bootstrap are not covered.

See [verification record](../../docs/E2E_BEST_PRACTICE_R2_OL02_RECORDS_SYNTHETIC_2026-10-19.md)
and [OL-01 design](../../docs/BEST_PRACTICE_BP5_R2_OL01_BUILD_DEPLOY_LEDGER_DESIGN.md).
