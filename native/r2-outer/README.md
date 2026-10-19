# R-2 outer records: offline inspection and gated exec components

This unpublished Rust library inspects activation/ledger records and contains private
dedicated-process exec components. It has **no executable, network, OAuth, permission
repair or MCP registration**. `InspectedRecords` remains opaque and is not an execution permit.
The new `exec_installed` entry checks fixed arguments/records but refuses with
`TrustGatePending` (92) before exec: signed deployment, actual binary signatures,
closure and group exclusivity have not been implemented. There is no runtime bypass option.

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
  compared to actual binaries/index yet. Those gates, trusted signed deployment and
  pre-exec revalidation remain pending. Private exec components check cooked controlling
  TTY/FD/env/rlimits and are exercised by a test-only OS peer, not operational Node.
- Only the Darwin filesystem/exec adapters and owned OS test harness permit unsafe FFI. Raw record/path/OS/JSON errors are not
  exposed via Debug/error objects; failures are fixed enum values. Panic/native/loader
  diagnostics before a future protected bootstrap are not covered.

See [verification record](../../docs/E2E_BEST_PRACTICE_R2_OL02_RECORDS_SYNTHETIC_2026-10-19.md)
and [OL-01 design](../../docs/BEST_PRACTICE_BP5_R2_OL01_BUILD_DEPLOY_LEDGER_DESIGN.md).

## OL-03 component tests

`signature_policy` provides a bounded draft-registry parser and a pure entitlement
comparator. Its public inputs are caller-supplied data, not Security.framework proof.
No trusted registry is installed or embedded, no installed ledger-0.2 reader is enabled, and no
execution permit is issued. See [typed policy verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_TYPED_POLICY_SYNTHETIC_2026-10-19.md).

`ledger_v2::parse_and_bind` adds a separate strict in-memory ledger-0.2 schema and
registry-reference/role binding. Its Context is caller-provided data, not proof of an
inspected activation. The installed offline reader remains v0.1-only and no runtime
gate is enabled. See [ledger-0.2 verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_LEDGER_V2_SYNTHETIC_2026-10-19.md).

The separate `inspect_installed_v2_records` path connects the existing directory-FD
safe activation/ledger reader to the strict v2 parser and fixed build-registry bytes.
The internal connection is covered by synthetic sources; the production build registry
is deliberately absent, so this public no-argument entry returns `Unavailable` before
file access. There is no external registry file, path override or synthetic-policy switch.
Successful internal inspection returns an opaque non-authority value, not legacy records
usable by `exec_installed`. Legacy v0.1 offline inspection is unchanged. See
[safe-reader connection verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_LEDGER_V2_READ_SYNTHETIC_2026-10-19.md).

The private staged `signature_boundary` contract connects bound policy data, separate
validity/self checks, typed issuer/flags/entitlement observations and before/after
identity comparison. Its test-only backend verifies shared deadline/cancellation and
Rust handle cleanup, not real cryptographic validity or CF ownership. A private native
driver and macOS arm64 Security/CF FFI are now implemented but dormant; the driver is tested
with synthetic calls only. Raw entitlement/DER coexistence and missing dictionaries stop
conservatively. No operational caller, runtime gate or permit is enabled. See
[native backend design](../../docs/BEST_PRACTICE_BP5_R2_OL03_NATIVE_SECURITY_DESIGN.md) and
[native synthetic verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_NATIVE_SECURITY_SYNTHETIC_2026-10-19.md).

The separate private `raw_xml` component checks a 64KiB XML blob envelope, a closed
non-recursive plist/dict/boolean grammar and exact typed dictionary agreement. It rejects
all DOCTYPEs (including the usual plist declaration), DER and absence assertions; it returns
only API-local consistency counts. No native rejection or acquisition flag is changed and
no physical-signature/DER/absence evidence is produced. See
[raw XML synthetic verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_RAW_XML_SYNTHETIC_2026-10-19.md).
The private `physical_signature` parser inventories bounded synthetic Mach-O ranges,
SuperBlob slots and the single SHA-256 CodeDirectory subset, including wrapper hashes.
It borrows bytes only: no held-FD reader, native/API binding, page/CMS validity or
entitlement semantics is connected. Its entitlement gate always rejects (DER,
absence or unverified XML); no authority or permit is produced. See
[physical inventory synthetic verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_PHYSICAL_SIGNATURE_SYNTHETIC_2026-10-19.md).
The private `positioned_read` component stages a shared 10-second/2GiB budget,
worst-case reservations, eight shared EINTR retries and a bounded single-shot
positioned-source interface. Short reads, late responses and cancellation latch failure.
Only synthetic sources are tested: no OS pread adapter or deployment/PinnedFile hookup
is enabled. See
[positioned read synthetic verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_POSITIONED_READ_SYNTHETIC_2026-10-19.md).
The private A-pass connector shares Mach-O range validation with the pure parser,
captures header/signature bytes directly from the full-file hash stream, and parses only
those captures under the original deadline/cancel source. It returns a pending diagnostic,
not revalidated FD evidence. DER/absence and execution authority stay closed. See
[A capture synthetic verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_CAPTURE_A_SYNTHETIC_2026-10-19.md).
The B-pass consumes A from the same opaque scope identity, reuses its budget and source,
and compares the full-file hash and captured ranges without allocating a second blob.
Success is bytes-only and pending metadata; metadata/path/record/lease and real-FD
connections remain unimplemented. Changes behind B's cursor/ABA are not fully excluded.
See [B recheck synthetic verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_RECHECK_B_SYNTHETIC_2026-10-19.md).
See [boundary contract](../../docs/BEST_PRACTICE_BP5_R2_OL03_SECURITY_BOUNDARY_DESIGN.md)
and [synthetic verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_SECURITY_BOUNDARY_SYNTHETIC_2026-10-19.md).

The additional `closure::check` API parses bounded in-memory index bytes and compares a
caller-supplied binding and observation list. It returns counts only, never an execution
permit. It does not read or verify deployed files, signatures, ACLs or xattrs. The fixed
runtime gate remains closed. See [closure parser verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_CLOSURE_PARSER_SYNTHETIC_2026-10-19.md).

`deployment::inspect_deployment` adds read-only macOS arm64 directory-FD traversal,
metadata/ACL/xattr-name checks and streaming payload hashing. Production inspection
requires root-owned protected ancestors and runtime files; no public owner override is
provided. Synthetic success tests exercise the private scan component on owned temporary
files, not a trusted root-owned deployment. No execution permit is issued and the runtime
gate stays closed. See [deployment read verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_DEPLOYMENT_READ_SYNTHETIC_2026-10-19.md).

The macOS arm64 tests compile a disposable Rust peer using the development rustc/libc
artifact, then exec that peer at the synthetic fixed Node path in owned PTY children.
The fixture directly includes private OS-boundary modules; it never becomes part of
the library's public API or a trust-gate bypass in an operational launcher.
All environment/FD/cwd/umask/core-limit/signal changes happen only in these children.
The peer validates the received conditions and reports fixed PID/code metadata.
This is not a test of real Node, Developer ID/notarization or production signatures.

Parser errors=90, rejected records=91, pending trust gates=92, setup failure=93,
execve failure=94, unsupported execution adapter=95. After exec succeeds the outer
image is gone: target exit codes/signals are not mapped or retried. On setup failure
after process state changes, the dedicated child exits with 93 rather than returning
into a partially modified caller. Never call this component from a shared MCP process.

The fixed policy sends `[node, fixed-entry, check-plan|run, manifest]` to execve with an
explicit empty env, fixed cwd, umask 077 and soft/hard RLIMIT_CORE=0. stdin/stderr must
refer to the same cooked foreground controlling TTY with no pending input. stdout is
replaced with /dev/null. A bounded proc_pidinfo FD inventory closes all FD>=3 and
verifies the remaining set before exec. This assumes a dedicated single-threaded
process and is not proof against a hostile concurrent thread or a stopped kernel.
Signature/closure verification and retained-file identity protection must precede
this primitive; the current production gate deliberately cannot succeed.

See [OL-03 verification](../../docs/E2E_BEST_PRACTICE_R2_OL03_EXEC_SYNTHETIC_2026-10-19.md).
