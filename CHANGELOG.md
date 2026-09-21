# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.11.3] — 2026-09-20

### Fixed

- **All five outbound SOAP Message tools targeted the wrong tables and could not work.** `list_soap_messages`, `get_soap_message`, `list_soap_message_functions`, `create_soap_message`, and `create_soap_message_function` read from and wrote to `sys_web_service` / `sys_web_service_function`. `sys_web_service` is the *inbound* Scripted Web Service table (it has `script` and `wsdl_compliance`, no endpoint or authentication columns), and `sys_web_service_function` does not exist at all. The outbound tables are `sys_soap_message` and `sys_soap_message_function`, linked by `soap_message`.
  - `list_soap_messages` silently returned inbound scripted web services; `get_soap_message` and `list_soap_message_functions` threw `Invalid table`; `create_soap_message` wrote `endpoint`/`namespace`/`active` into a table that has none of those columns, so ServiceNow discarded them and created an unrelated inbound record; `create_soap_message_function` threw.
  - Now targets the correct tables and only the columns that exist on them. This corrects the input schemas of the two write tools: `create_soap_message` requires only `name` (the endpoint URL belongs to each function, not the message), and `create_soap_message_function` takes `function_name`, `soap_endpoint`, `soap_action`, and `envelope` — the previous `name`, `active`, and `soap_message_template` had no backing column. Nothing could have depended on the old contract, since none of it ever reached a real SOAP Message record.
  - Caught by the new live E2E coverage, not by the unit tests: the mocks had been written to the same wrong table names, so they agreed with the bug. Their expectations now assert the real tables and columns.
- **`list_security_playbooks` queried a table that does not exist.** It read `sn_si_playbook`, which is not part of Security Incident Response or any other plugin, so it threw `Invalid table` even on an instance with SIR installed. SIR playbooks are Process Automation Designer definitions in `sys_pd_process_definition`, shipped in the `sn_si_aw` (Security Incident Analyst Workspace) scope — the stock Malware, Phishing, and Failed Login templates. The tool now queries that table scoped to `sn_si_aw`; the old `category` filter (no such column) is replaced by a label/name `query`. Surfaced the moment SIR was installed on the PDI: the plugin-presence gate had been treating the missing table as "plugin absent", which is exactly the blind spot such a gate has for a misspelled table.

- **`run_security_playbook` inserted into a table that does not exist and could never start anything.** It wrote `{playbook, incident, ...parameters}` into `sn_si_playbook_execution`, which is not a table. Rebuilt to do what the SIR Analyst Workspace does (`sn_si_aw.AnalystWorkspaceSIRUtil.startPlaybooks`): resolve the playbook to a `sys_pd_process_definition` in the `sn_si_aw` scope, refuse drafts and inactive definitions, refuse a duplicate while an execution for that playbook is still queued/in progress on the incident (`sys_pd_context`), then start it via `sn_playbook.PlaybookExperience.triggerPlaybook('<package source>.<name>', incidentGr)` from a one-time `sysauto_script` — the same mechanism `restore_archived_record` uses. Optional `wait_seconds` polls `sys_pd_context` and returns the execution.
  - **Now a Scripting-tier tool** (`SCRIPTING_ENABLED=true`), since it executes server-side script; it was Write-tier before. `playbook` accepts a sys_id or scoped name (`playbook_sys_id` still works as an alias); the old `parameters` object is gone — `triggerPlaybook` takes none and the values were only ever spread into the phantom row.
  - Three things learned live and encoded: the API wants the fully qualified name (`sn_si_aw.security_incident_malware_manual_template_v1` — the bare `name` is rejected as "missing or inactive"); the five stock SIR playbooks are shipped as `status=draft` templates that the product itself filters out, so the tool rejects them up front (`CONFLICT`) instead of scheduling a script that fails server-side; and between scheduling and execution a repeat call used to queue a second job, so a pending job for the same incident + playbook now returns `already_scheduled` (the job is keyed on the two sys_ids because `sysauto_script.name` is capped at 100 characters and a name built from the scoped name was being truncated, which silently defeated the lookup). The job is deleted once its execution has been observed.
  - Verified live against a published copy of the Automated Malware template: draft rejection, scheduling with the exact product start call for the incident, `already_scheduled` on a repeat call with exactly one job queued, and cleanup. The start-and-observe E2E is gated on a published SIR playbook and additionally skips — with the reason — when the instance scheduler does not run the job inside the wait budget, since a starved scheduler is an instance condition rather than a tool defect. On the PDI used here the job first never ran within budget because all eight scheduler workers were held by a NIST NVD import stuck in a 429 (rate-limit) retry loop — the integration had no API key configured; the same condition starves `restore_archived_record` and every other `sysauto_script`-based operation. Once that run was cancelled the full start-and-observe test passed: the execution appeared in `sys_pd_context` and the repeat call returned `already_running`.

- **`scan_vulnerabilities` inserted into a table that does not exist** (`sn_vul_scan_request`) and could never start anything. Rebuilt on the real model: an on-demand VR scan is an `sn_vul_scan` record whose targets are linked through an m2m table (`sn_vul_m2m_scan_configuration_item` for CIs, `sn_vul_m2m_scan_source` for Vulnerable Items) and whose move to `processing` is what the async "Process scan request" rule hands to the scanner integration — the path `sn_vul.VulnerabilityScanUtil.createScanFromTask` and the "Initiate Scan" / "Rescan" actions take.
  - **Now a Scripting-tier tool** (`SCRIPTING_ENABLED=true`). None of that path is reachable through the Table API: `sn_sec_cmn_scan.state` is dictionary read-only, so a REST update silently keeps `draft`, and the m2m write ACL requires `sn_vul_scan.state=new`, so REST inserts land with blank references. Verified both ways live before choosing the design. The scan is therefore created by a run-once `sysauto_script` (as `run_security_playbook` does) that reports back through `syslog`; the tool waits `wait_seconds` (default 30) for it, returns the scan, and deletes the job — or returns `scan_scheduled` with the job if the scheduler has not run it yet.
  - Inputs changed to what the model has: `ci_sys_ids` **or** `vulnerable_item_sys_ids` (one source table per scan, max 200), optional `scanner_sys_id` (defaults to the active default `sn_vul_scanner`), `initiate` (default true; `false` leaves a Draft to launch from the UI) and `wait_seconds`. The old `group` and `scan_type` had no backing columns. Guards mirror the product: every target must exist, a target already in a queued/processing/scanning scan returns `already_running`, and initiating without an active scanner is refused up front (`CONFLICT`) instead of creating a scan that the async rule immediately errors out — Vulnerability Response can only launch scans through a scanner integration (Qualys, Tenable, Rapid7, …).
  - Verified live on real CIs: the Draft path links both targets (which REST could not); with a temporary stub scanner the initiate path went `draft → processing → scanning` through the product's async rule within ~17 s and a repeat call returned `already_running`. The E2E exercises the Draft path only, so a configured scanner never receives a scan from the test suite; VR tables refuse cross-scope deletes, so the test cancels its scan from a script rather than deleting it.
- `run_security_playbook` no longer sends a `description` when scheduling its job; `sysauto_script` has no such column and ServiceNow was discarding it.

### Added

- **Live E2E coverage 50 → 206 tools (10.1% → 41.5%); modules with no E2E 30 → 7.** Six new read-only suites — `platform-config`, `integration-tables`, `itom-tables`, `catalog-portal`, `optional-plugins`, `script-tables` — exercise every read tool that can run without an id and chain into the matching `get_*` where a record exists. The remaining uncovered modules are the USEM family (deferred on purpose), `now-assist` (needs `NOW_ASSIST_ENABLED` and the plugin), `store` (external API), and `smart-query`.
- **`skipUnlessTables` / `tableExists` helpers** in `tests/e2e/helpers.ts`. Modules backed by optional plugins (GRC, HRSD, CSM, DevOps, Mobile, SecOps, Agile, Event Management, …) now gate each test on the table's presence in `sys_db_object`: an absent plugin reports "skipped — table not on this instance", while a present table that the tool still cannot read is a real failure. The existing GRC read and write suites are retrofitted onto the gate — they had been hard-failing with `Invalid table` since the PDI was re-provisioned without GRC.
- **`scriptingE2eDescribe`** for the scripting-tier list/get tools, which sit behind `SCRIPTING_ENABLED` even though they never write.

### Changed

- E2E files now run sequentially (`fileParallelism: false` in `vitest.e2e.config.ts`). Thirteen suites hitting one PDI in parallel produced spurious 30 s timeouts on the incident/group write tests that pass every time in isolation.
- Live tests get a longer request budget. `tests/e2e/setup.ts` defaults `REQUEST_TIMEOUT_MS` to 120 s (an explicit value in the environment still wins), and the write suite raises its own test timeout to match. The production default stays 30 s. The write tests delete every record they create, and ServiceNow cascades a delete through every table that references it — a `sys_user_group` delete measured 21–23 s on a PDI still digesting a plugin install, which exceeded the client's 30 s abort and failed the test after its assertions had already passed.

---

## [1.11.2] — 2026-09-14

### Changed

- **Node.js floor raised to `>=20.19.0`** (was `>=20.0.0`). The test toolchain below now depends on `vite` 8 / `rolldown`, which require `^20.19.0 || >=22.12.0`, and the docs had stated 20.19+ as the intended floor since before 1.11.1 — the `engines` field was the part that lagged. README, `docs/INSTALLATION.md`, `docs/CLIENT_SETUP.md`, and every `clients/*/SETUP.md` now agree with `engines`. The runtime itself (`dist/` + `dependencies`) does not need 20.19; this tightening matters for anyone building or testing from source, and consumers on 20.0–20.18 will see an `EBADENGINE` warning at install.

### Security

- **Test toolchain: `vitest` / `@vitest/coverage-v8` `^3.2.7` → `4.1.11`.** 1.11.1 stopped at 3.2.7 because Node 20.12's bundled npm 10.5.0 could not resolve the vitest 4 tree (`Cannot read properties of null (reading 'edgesOut')`). With Node 20.19 / npm 10.8.2 that resolves cleanly. Full suite runs about 4× faster under vite 8 / rolldown (≈11 s → ≈2.5 s).
- **`hono` override `^4.12.34` → `4.13.5`** (exact pin).
- `npm audit`: 2 findings, unchanged — both the known-unreachable `exceljs` → `uuid@8.3.2` (see 1.11.1 / 1.9.1).
- Verified: `tsc` clean, ESLint 0 errors, 59 test files / 1553 tests pass, `--coverage` runs clean on the new provider, the opt-in E2E config still skips without `RUN_E2E`, the read-only PDI E2E passes live, and the Streamable HTTP transport boots (496 tools) and completes a real `initialize` + `tools/list` JSON-RPC round trip on the pinned hono.

---

## [1.11.1] — 2026-09-05

### Security

Dependency-only release: no tool, API, or behaviour changes.

- **Refreshed the transitive overrides that had drifted back into vulnerable ranges.** As in 1.9.2, new advisories were published against the exact versions the previous overrides pinned — pinning a "fixed" version is not a one-time fix.
  - `fast-uri` `^3.1.5` → `^3.1.7` — 1.9.2 pinned 3.1.5, and three new advisories (repeated hostname percent-decoding SSRF, malformed IPv6 normalization SSRF, host confusion via skipped IDN canonicalization) cover `3.0.0 - 3.1.5`. This chain (`@modelcontextprotocol/sdk` → `ajv` → `fast-uri`) is genuinely exercised, since the SDK validates request schemas with ajv. `ajv@8.20.0` asks for `^3.0.1`, so 3.1.7 is a non-breaking bump.
  - `js-yaml` → `^4.3.2` — via `eslint` → `@eslint/eslintrc`; the quadratic-CPU advisories cover `4.0.0 - 4.3.0` and `@eslint/eslintrc` asks for `^4.1.1`.
  - `ip-address` → `^10.7.0`, `qs` → `^6.16.0`, `body-parser` → `^2.3.0` — reached only through `@modelcontextprotocol/sdk`'s Express-based OAuth Authorization Server handlers, which this project never imports (`server-http.ts` builds directly on `node:http`). Unreachable in practice, but each fix sits inside the parents' own semver ranges, so they were taken rather than recorded as accepted risk.
  - `brace-expansion` pinned per minimatch major (`minimatch@3` → `^1.1.18`, `minimatch@9` → `^2.1.4`, `minimatch@10` → `^5.0.9`) — the production copy arrives via `exceljs` → `archiver`/`unzipper` → `glob` → `minimatch`. A flat override would have forced one major onto trees that require different ones; scoping by parent keeps each inside its range. `exceljs`-scoped nested overrides were tried first and did not reach the deeper `archiver-utils`/`rimraf` copies.
- **Upgraded the test toolchain to clear the two critical advisories**: `vitest` and `@vitest/coverage-v8` `^2.1.9` → `^3.2.7`. The advisories cover `<=3.2.5` (arbitrary file read/execute through the Vitest UI server, plus the `vite`/`esbuild`/`postcss`/`nanoid` chain beneath it), and 3.2.7 sits outside that range.
  - **Deliberately not `vitest` 5**, which is what npm proposes as the fix: it requires Node `^22.12.0 || ^24.0.0 || >=26.0.0`, while this project supports `>=20.0.0`. Taking it would quietly raise the floor for anyone cloning the repo to run the suite. `vitest` 4 keeps `^20.0.0` but needs a newer npm than the 10.5.0 bundled with Node 20.12, which cannot resolve that tree at all (`Cannot read properties of null (reading 'edgesOut')`).
- **Scope of these overrides.** npm honours an `overrides` block only at the install root, so this release pins the tree for this repository, its CI, and anyone installing from source. Consumers of the published package resolve `dependencies` themselves — for these particular advisories a fresh install already lands on the patched versions, because every affected package is reached through a caret range that resolves to the fixed release.
- **`npm audit`: 16 findings → 2.** Both remaining are `exceljs` → `uuid@8.3.2` (counted twice) and are unchanged from the 1.9.1 analysis: the advisory only affects uuid v3/v5/v6 when a `buf` argument is supplied and exceljs uses v4, while the only npm-offered fix is a breaking downgrade to `exceljs@3.4.0`.
- Verified: `tsc` clean, ESLint 0 errors, 59 test files / 1553 tests pass on the new vitest, `--coverage` runs clean under the upgraded provider, the opt-in E2E config still skips correctly without `RUN_E2E`, the read-only PDI E2E passes against a live instance, and the Streamable HTTP transport boots end-to-end (496 tools) completing a real `initialize` + `tools/list` JSON-RPC round trip — which exercises the ajv/`fast-uri` path directly.

---

## [1.11.0] — 2026-08-26

### Added

- **`scan_update_set_sca`** (`updateset.ts`, Tier 0 / read-only): inventories an Update Set's script-bearing changes and detects third-party components with exact, evidence-backed versions. First phase of the Update Set SCA roadmap (see `docs/ROADMAP.md` #13).
  - Resolves the target Update Set by sys_id or exact name (no fuzzy matching; ambiguous names are rejected) and paginates `sys_update_xml`, capping at `max_records` (1–100, default 50) with one extra row fetched so truncation is always explicit.
  - Restricts text extraction to an allowlist of script-bearing change types (Business Rule, Script Include, Client Script, UI Script, UI Action, Script Action, Scheduled Script Execution, Scripted REST Resource, Service Portal Widget); everything else is counted but skipped. Payloads over 512 KiB are skipped without being read into the result.
  - Detects components only where an exact version is present: npm lockfile v1/v3 structures and `package.json`-style manifests embedded in a script field, versioned CDN URLs (jsDelivr, unpkg, cdnjs), and `require`/`import` module specifiers pinned to an exact version (`package@1.2.3`). Version ranges, `latest`/aliases, and bare package names are never reported as an installed version.
  - Normalizes npm components by ecosystem, package name, and exact version; emits a PURL and direct/transitive/unknown dependency classification while retaining all distinct hashed evidence.
  - Queries OSV for exact-version npm components by default (optional local-only mode). Results include advisory IDs, aliases, severity, CVSS vectors, fixed versions, and source. Lookups have a five-second per-component timeout, a 50-component cap, and a one-hour in-memory cache; failures are explicitly reported as incomplete coverage.
  - Defines a versioned SCA JSON contract with severity summary, assessment, coverage counters, limitations, and top-level errors so an AI can report findings without interpreting raw script content. A no-findings response is explicitly not a clean-security verdict.
  - Separates unversioned or alias-based references into `unresolved_references` and never sends them to OSV. Arbitrary string literals are not considered library references, and external-artifact hash verification is explicitly reported as not performed.
  - Adds boundary coverage for payload secret non-disclosure, oversized OSV responses, pagination, and the 50-component lookup cap. Component caps now correctly set `lookup.truncated` so partial coverage cannot be presented as complete.
  - Adds an opt-in, read-only PDI E2E test that compares bounded SCA inventory metadata with `preview_update_set` and verifies source non-disclosure.
  - Source code, payload contents, and the surrounding script text around a detected component are never returned — only metadata, byte counts, and SHA-256 hashes of the payload and of the specific matched token.
  - Added to the `platform_developer` tool package.

### Fixed

- Fixed a regex-literal syntax error in the SCA CDATA-unwrapping helper (introduced during this feature's development, never released) that broke `tsc`/module loading entirely.

---

## [1.10.2] — 2026-08-23

### Security

- **Preserved impersonation on direct authenticated endpoints.** `uploadAttachment()` and `getXmlStats()` now use the same authenticated-header builder as ordinary Table API requests, so `X-Sn-Impersonate` is included in impersonation mode and those calls cannot silently execute with service-account privileges.
- **Bounded attachment decoding.** Attachment uploads now accept only standard Base64 and reject payloads larger than 10 MiB after decoding before obtaining OAuth credentials or allocating the decoded buffer. The MCP schema and tool documentation expose the limit.
- **Blocked XLSX ZIP expansion attacks before parsing.** `import_excel_to_import_set` now reads ZIP central-directory metadata before passing a workbook to ExcelJS. It rejects ZIP64/multi-disk archives, more than 200 entries, entries over 25 MiB uncompressed, more than 50 MiB total expansion, and compression ratios over 100:1.

### Verification

- Added regression coverage for direct-endpoint impersonation, bounded Base64 attachment uploads, and XLSX ZIP expansion limits.
- Verified the self-cleaning Excel Import Set write E2E against the PDI: Import Set creation, workbook attachment, staging-row creation and linking, then deletion of all test artifacts.

---

## [1.10.1] — 2026-08-16

### Fixed

- **`create_business_rule` silently created rules that could never fire.** The tool only ever set `name`/`collection`/`when`/`script`/`condition`/`active`/`order` on `sys_script`, leaving `action_insert`/`action_update`/`action_delete` at ServiceNow's row default of `false`. A business rule with `when: "before"`/`"after"`/`"async"` needs at least one of those three flags `true` to ever execute — so every rule created through this tool silently never ran, regardless of `when` or `condition`, unless the caller separately edited it in the ServiceNow UI afterward.
  - Found via live testing on a PDI while investigating async business rule execution: an `async` rule created through the tool never fired on insert, with no error at creation time or execution time.
  - `create_business_rule` now sets `action_insert`/`action_update` to `true` and `action_delete` to `false` by default (matching the ServiceNow "New Business Rule" form defaults), and accepts optional `action_insert`/`action_update`/`action_delete` booleans to override.
  - `update_business_rule` now allows updating `action_insert`/`action_update`/`action_delete` on existing rules.

---

## [1.10.0] — 2026-08-12

### Added

- **Data Management (13 tools)** (`data-management.ts`): manage ServiceNow Data Management Policies, archive rules, destroy rules, Table Cleanup Rules (Auto Flush), and archive restores.
  - `list_data_management_policies` / `get_data_management_policy` / `create_data_management_policy`
  - `list_archive_rules` / `create_archive_rule` / `set_archive_rule_active`
  - `create_destroy_rule` / `set_destroy_rule_active`
  - `list_cleanup_rules` / `create_cleanup_rule` / `set_cleanup_rule_active`
  - `get_archive_restore_status` / `restore_archived_record`
  - Safety design: every rule-creation tool always creates the rule **inactive** — nothing is archived, destroyed, or cleaned up until a separate, explicit activation call. Activating an archive, destroy, or cleanup rule requires `confirmation: "I_UNDERSTAND"`; activating an archive or destroy rule additionally requires an **active Data Management Policy** to already exist for the target table. `set_destroy_rule_active` and `set_cleanup_rule_active` are marked destructive (they permanently delete data); `restore_archived_record` requires both `WRITE_ENABLED=true` and `SCRIPTING_ENABLED=true` since it schedules a one-time script (`GlideArchiveRestore`) — the `archive_log_sys_id` is strictly validated as a sys_id before being interpolated into that script, so no injection is possible through it.
  - Added to the `system_administrator` package (72 → 85 tools).
  - Verified live against a PDI: inactive policy/archive/destroy rule creation, `retain_references`, confirmation-gate rejection, and the active-policy-gate rejection all behave as designed. 11 unit tests added.

---

## [1.9.2] — 2026-08-02

### Security

- **Refreshed transitive dependency overrides**: new advisories were published against the `fast-uri`/`hono` versions pinned in 1.8.2's overrides (`fast-uri` host-confusion via backslash authority introducer, `hono` ReDoS in CORS middleware). Bumped overrides to `fast-uri` `^3.1.5` and `hono` `^4.12.34` (resolves to 4.13.0). Verified live: built and ran the Streamable HTTP transport and confirmed a JSON-RPC request round-trips correctly against the updated dependency tree.
- **Investigated a new transitive chain** (`@modelcontextprotocol/sdk` → `express-rate-limit` → `ip-address`, 3 high-severity SSRF/trust-boundary advisories): confirmed unreachable — `express-rate-limit`/`ip-address` are used exclusively inside the SDK's built-in OAuth Authorization Server route handlers (`server/auth/handlers/*`), which this project never imports (`src/server.ts`/`src/server-http.ts` only import `server/index.js`, `server/stdio.js`, `server/streamableHttp.js`, and `types.js`). No dependency change needed.
- `exceljs`'s `uuid` finding (unreachable, documented in 1.9.1) and the devDependency-only findings (vitest/vite/esbuild/postcss toolchain, now also flagging `postcss` via `vite`) remain unchanged — none are shipped in the published package.

1517 tests pass, tsc clean.

---

## [1.9.1] — 2026-07-31

### Security

- **Fixed CSV/Excel formula injection (CWE-1236) in `import_excel_to_import_set`**: the formula-cell rejection added in 1.9.0 only caught genuine Excel formula cells; a plain string cell whose text merely starts with `=`, `+`, `-`, or `@` (e.g. typed literally, not entered as a formula) passed through unmodified into the staging table. If that data is later exported via ServiceNow's own Export to Excel/CSV and reopened, such values are interpreted as live formulas by the spreadsheet application. Now neutralized per the OWASP CSV Injection mitigation: string cell values matching that pattern are prefixed with a single quote before insertion, so they round-trip as literal text. Verified live against a PDI (`=cmd|'/c calc'!A1` → `'=cmd|'/c calc'!A1`, `-Confidential` → `'-Confidential`). Found during a security check of the 1.9.0 Excel feature; the `exceljs`→`archiver`/`glob`/`uuid` dependency chain flagged by `npm audit` was also investigated and confirmed unreachable (this server only calls `workbook.xlsx.load()`, never the writer path that pulls in `archiver`; `uuid` is called without the vulnerable `buf` argument) — no dependency change needed. 1 regression test added.

---

## [1.9.0] — 2026-07-30

### Added

- **`import_excel_to_import_set`** (`integration.ts`): securely upload a Base64 `.xlsx` workbook, parse one selected worksheet, create and attach the workbook to a ServiceNow Import Set, insert parsed rows into its staging table, and optionally start a Transform Map. This provides an auditable Excel→Import Set workflow for MCP clients.
  - Staging rows are now always bound to their Import Set through `sys_import_set`; `create_import_set_row` gained the required `import_set_sys_id` parameter and applies the same binding.
  - Defensive limits: `.xlsx` only, 10 MiB input, 500 data rows, 50 columns, strict Base64/ZIP validation, formula-cell rejection, and rejection of `sys_*` / prototype-pollution field names. Write operations remain gated by `WRITE_ENABLED=true`.
  - Supports optional worksheet selection, import-set labels, Excel-header→staging-column mapping, and Transform Map execution.

### Verification

- Added unit coverage for workbook parsing, column mapping, formula/system-field rejection, attachment upload, staging-row binding, and optional Transform Map execution.
- Added a self-cleaning PDI E2E test that creates an Import Set from an in-memory workbook, verifies its attachment and staging row, then deletes all created artifacts.

---

## [1.8.2] — 2026-07-22

### Security

- **Eliminated all `dependencies` (production) vulnerabilities via `npm overrides`**: `@modelcontextprotocol/sdk@1.29.0` transitively pulled in vulnerable `@hono/node-server` (<2.0.5, Windows-only path traversal in `serve-static`), `hono` (4.0.0-4.12.26, JSX XSS / cross-request context leak / header dedup issue), and `fast-uri` (3.0.0-3.1.3, host-confusion via IDN/backslash parsing, reached via `ajv-formats`). None of these were actually exploitable through this server's code paths — `src/server-http.ts` uses Node's built-in `http.createServer` and only imports `getRequestListener` (a plain HTTP↔Web-Request adapter) from `@hono/node-server`, never hono's routing/JSX/serve-static; no tool inputSchema in this codebase declares `format: "uri"`, so the `fast-uri` code path is never exercised by our own tools. Overridden anyway to close the gap: `@hono/node-server` → `^2.0.11`, `hono` → `^4.12.31`, `fast-uri` → `^3.1.4`. Verified the override doesn't break the HTTP transport: built and ran the Streamable HTTP server (`MCP_TRANSPORT=http`) against `getRequestListener@2.0.11` and confirmed it correctly handles a live JSON-RPC request end-to-end. `npm audit` now reports zero findings in `dependencies` — the remaining 9 are all `devDependencies` (vitest/vite/esbuild toolchain), never shipped.

---

## [1.8.1] — 2026-07-21

### Security

- **Fixed encoded-query injection in two write tools**: `schedule_cab_meeting` (`change.ts`) and `retire_knowledge_article` (`knowledge.ts`) resolved a human-friendly id (`change_id` / `article_id`) to a sys_id via `number=X^ORsys_id=X`, then wrote to the resolved record — without stripping `^` from X first. An id like `CHG0001^ORDERBYDESCsys_created_on` could select a different record than intended, silently misdirecting the write (CAB scheduling / KB article retirement) to the wrong change request or article. Both now sanitize with `sanitizeLikeValue()` before building the lookup query, matching the existing pattern in `itam.ts`'s `track_asset_lifecycle`. Found during a general security check of the MCP server; regression tests added.
- **Fixed the same class of issue in four read tools** (second, impact-ranked batch): `get_incident` (`incident.ts`), `get_change_request` (`change.ts`), `get_knowledge_article` (`knowledge.ts`), and `get_remediation_sla`/`get_group_sla` (`usem-sla.ts`) all resolved `number_or_sysid` the same unsanitized way. Read-only, so the impact is a wrong record being returned rather than a wrong write — but `get_remediation_sla`/`get_group_sla` touch VR/security data, and `get_incident`/`get_change_request` are high-traffic tools. Same `sanitizeLikeValue()` fix; 6 regression tests added.
- **Closed the remaining instances of the same pattern** (third, final batch — a full-codebase sweep for `X=${args...}^ORY=${args...}` single-record lookups found no further unsanitized cases beyond these): `get_catalog_item` (`catalog.ts`), `get_script_include` and `get_changeset` (`script.ts`). All other `number_or_sysid`/`sys_id_or_name` lookups across the codebase (grc-*.ts, csm.ts, problem.ts, task.ts, usem.ts, usem-integration.ts, hrsd.ts, security.ts) were already sanitized via `sanitizeLikeValue`/`queryValue`/a shared resolver, or constrained by a strict format regex (catalog.ts's REQ/RITM number lookups) — confirmed clean, not just assumed. Every write tool that resolves an id via a free-text lookup before mutating (`schedule_cab_meeting`, `retire_knowledge_article`, `track_asset_lifecycle`) is now sanitized; no further write-path instances of this pattern exist. 3 regression tests added.

Verified end-to-end against a live PDI: all 33 read-only E2E tests and all 8 write-operation E2E tests (self-cleaning create/update/delete) pass with these fixes applied — no regressions.

---

## [1.8.0] — 2026-07-18

### Added

- **`list_ecc_queue`** (`discovery.ts`): inspect the ECC Queue — the instance⇄MID job/result bus — with agent/topic/name/queue/state/time filters. Payload excluded by default (huge); `include_payload` opts in. MID names are auto-prefixed to `mid.server.<name>`.
- **`check_app_upgrade`** (`store.ts`): compare a scoped app's installed version (`sys_scope`) against the public Store version history and return release notes for every newer version. Store apps upgrade independently of platform releases (ACC-F, VR, ...), so this is the upgrade-planning primitive. Listing resolution: explicit `listing_id`, exact-title search match, or first result (flagged for verification). Verified live: sn_vul 30.3.5 → latest 30.7.2, 3 newer releases, exact-title match.

### Changed

- **`get_mid_server_health`** (`discovery.ts`): now includes extension contexts (MID Web Server / ACC Websocket Endpoint with status and error_message) and an `upgrade_note` when the MID reports Upgrading — a persistent old version across restarts indicates a failing upgrade (on Docker hosts, overlayfs cannot rename image-layer directories; keep the install dir on a volume).

Hardening: `check_app_upgrade` re-validates search-derived listing ids as 32-char sys_ids before building the versions URL (never trusts the external API's response shape), and `list_ecc_queue` documents that payloads can contain sensitive data (command output, host details, credential references).

Packages: `itom_engineer` 30 → 34 (adds `list_ecc_queue` + the 3 Store tools), `secops_analyst` 102 → 103 (adds `check_app_upgrade`). 11 unit tests added (1502 total). Completes ROADMAP #12 (12-3/12-4/12-5).

---

## [1.7.0] — 2026-07-18

### Added

- **`list_mid_extension_contexts`** (`discovery.ts`): list MID Server extension contexts (`ecc_agent_ext_context`) — MID Web Server, ACC Websocket Endpoint, etc. — with status and error_message. Born from a live ACC verification session: agents get `handshake failed with status 404` until the "ACC Websocket Endpoint" context exists (created by "Setup ACC Listener" on the MID Server record), and this table is where that shows. Filters sanitize `^` to prevent encoded-query injection. Added to the `itom_engineer` package (now 30 tools).

### Changed

- **`check_table_access`** (`core.ts`): each result now carries a `status` explaining *why* access failed — `not_installed` (Invalid table: the providing plugin/app is absent), `no_access` (403: table exists but ACL denies the account), `empty` (readable but zero rows — truly empty or ACL row filtering), or `accessible` — plus a human-readable `hint`. The summary counts not-installed and ACL-denied tables. This turns the tool into a plugin-installation check as well (verified live: `sn_agent_policy=empty`, `sn_agent_api_key=not_installed`, `sys_scope=accessible` on a Zurich PDI with ACC Framework installed).

Docs: added the previously missing "Discovery & MID/ACC Diagnostics" section to TOOLS.md covering all 12 tools of `discovery.ts`. 7 unit tests added.

---

## [1.6.0] — 2026-07-16

### Added

**ServiceNow Store tools (2)** — `store.ts`, a new module that calls store.servicenow.com's public catalog API (no instance authentication):

- **`search_store_apps`**: keyword search of the public Store catalog, returning `listing_id` values.
- **`get_store_app_versions`**: per-version release notes (new features / bug fixes), publish dates, and release types for a Store app, with HTML notes converted to readable text.

Release notes are not stored in any instance table — `sys_app_version`/`sys_store_app`/`sys_remote_app` have no notes column and App Manager fetches them remotely — so this public API is the only programmatic source. Verified live against the Store: Vulnerability Response returns 20 versions (24.0.10 through 30.7.2). Both tools are included in the `secops_analyst` package (now 102 tools) for upgrade planning alongside `sys_app_version` queries. `listing_id` is validated as a 32-char sys_id to prevent URL injection; 14 unit tests added (1487 total).

---

## [1.5.11] — 2026-07-15

### Fixed

Three unsanitized free-text/identifier-injection sites remained in `ml.ts` after the 1.5.10 audit, found in a follow-up review and fixed with the codebase-wide `sanitizeLikeValue()` convention:

- **`ml_predict_change_risk`**: `type`/`category`.
- **`ml_forecast_incidents`**: `category`/`priority`.
- **`ml_virtual_agent_nlu`**: `topic_sys_id`.

Added regression tests confirming `^` is stripped from each so it cannot inject extra encoded-query clauses. 1473 tests pass, `tsc` clean.

---

## [1.5.10] — 2026-07-14

### Fixed

Same unsanitized free-text/identifier-injection pattern fixed progressively since 1.5.5, found in six more modules and fixed by applying the codebase-wide `sanitizeLikeValue()` convention:

- **`ml.ts`**: `ml_train_incident_classifier`/`ml_train_change_risk`'s `solution_name`, `ml_model_training_history`'s `model_sys_id`.
- **`agile.ts`**: the whole module had zero sanitization — fixed across `list_stories` (`sprint`/`state`), `list_epics` (`project`/`state`), and `list_scrum_tasks` (`story_sys_id`/`assigned_to`).
- **`devops.ts`**: `list_deployments`'s `pipeline_sys_id`/`environment`/`state`.
- **`app-studio.ts`**: `list_scoped_apps`'s `query`, `get_scoped_app`'s `id`.
- **`problem.ts`**: `get_problem`'s `number_or_sysid`.
- **`task.ts`**: `get_task`'s `number_or_sysid`.
- **`va.ts`**: the whole module had zero sanitization — fixed across `list_va_topics_full`'s `category`, `get_va_conversation`'s `conversation_id`, and `list_va_conversations`'s `topic_sys_id`/`user_sys_id`.

### Added

**Complete test coverage for all 476 tools in the project** — this closes out the coverage audit that started this session at 261/476 (55%) tools with zero test references. Final batch: `reporting.ts` (6 tools), `va.ts` (6 tools), `ml.ts` (5 tools), `security.ts` (5 tools, already correctly sanitized), `agile.ts` (4 tools), `devops.ts` (4 tools), `app-studio.ts` (3 tools), `incident.ts` (2 tools), `problem.ts` (2 tools), `task.ts` (2 tools), `now-assist.ts` (1 tool), and `updateset.ts` (1 tool, including a `RESULT_TOO_LARGE` regression test for `export_update_set`'s 2000-change cap). 1470 tests pass, `tsc` clean.

---

## [1.5.9] — 2026-07-14

### Fixed

- **`atf.ts`**: `get_atf_suite`'s name lookup was unsanitized.
- **`deployment.ts`**: `find_artifact`'s `name`/`scope` were unsanitized.
- **`itam.ts`**: the whole module had zero query sanitization — fixed across `list_assets` (`state`/`assigned_to`/`location`), `list_asset_contracts` (`asset_sys_id`), `track_asset_lifecycle` (`asset_id`, used in a two-clause OR query), and `get_license_optimization` (`software_name`).

All three match the same unsanitized free-text/identifier-injection pattern fixed progressively since 1.5.5 (`integration.ts`) — fixed by applying the codebase-wide `sanitizeLikeValue()` convention.

### Added

- **Test coverage for 30 more previously-untested tools**: `atf.ts` (9 tools, new `tests/tools/atf.test.ts`), `deployment.ts` (7 tools), `itam.ts` (7 tools), and `mobile.ts` (7 tools, already safe — every filterable field is a sys_id reference, not free text).

---

## [1.5.8] — 2026-07-14

### Fixed

- **`csm.ts` had zero query sanitization anywhere in the module** — the same class of gap already fixed in `integration.ts`/`flow.ts`/`sys-properties.ts`, but this time affecting every free-text/identifier value in the file: `account`/`contact`/`state`/`priority` filters on `list_csm_cases`, `name_or_sysid` lookups on `get_csm_account`/`get_csm_contact`, `number_or_sysid` on `get_csm_case`, `case_sysid` on `get_csm_case_sla`, and `account_sysid`/`query` on `list_csm_contacts`/`list_csm_accounts`/`list_csm_products`. Fixed by applying `sanitizeLikeValue()` throughout.

### Added

- **Test coverage for 19 more previously-untested tools**: `hrsd.ts` (10 tools, already correctly sanitized) and `csm.ts` (9 tools, including regression tests for the sanitization fix above). `csm.ts` previously only had write-field-allowlist tests.

---

## [1.5.7] — 2026-07-14

### Fixed

- **`sys-properties.ts`'s `category`/`type` filters were not sanitized** — `list_system_properties`'s `category`/`type` and `export_properties`'s `category` were interpolated directly into encoded queries, unlike the rest of the module (`get_system_property`, `set_system_property`, `delete_system_property`, `bulk_set_properties`, `import_properties`, `validate_property`, `get_property_history` already sanitize the property name via `sanitizePropertyName()`). Fixed by applying the same helper to `category`/`type`.

### Added

- **Test coverage for 34 more previously-untested tools**, continuing the coverage pass: `sys-properties.ts` (12 tools, new `tests/tools/sys-properties.test.ts`, including regression tests for the sanitization fix above and sensitive-value masking across get/list/search/export/history), `notification.ts` (11 tools, already correctly sanitized), and `performance.ts` (11 tools, already correctly sanitized).

---

## [1.5.6] — 2026-07-14

### Fixed

- **`flow.ts` had the same unsanitized query-injection gap fixed in `integration.ts` (1.5.5)** — `args.category`/`args.query`/`args.status`/`args.name_or_sysid` were interpolated directly into encoded queries across `list_flows`, `get_flow`, `list_flow_executions`, `list_subflows`, `get_subflow`, `list_action_instances`, `get_process_automation`, and `list_process_automations`. Fixed by applying `sanitizeLikeValue()` at every affected site.

### Added

- **Test coverage for 47 more previously-untested tools**, continuing the coverage pass from 1.5.4/1.5.5: `flow.ts` (16 tools, new `tests/tools/flow.test.ts`, including regression tests for the sanitization fix above), `workspace.ts` (16 tools, new `tests/tools/workspace.test.ts` — no sanitization gap here since every filterable field is a sys_id reference, not free text), and `portal.ts` (15 tools — confirmed its existing `sanitizeLikeValue()` usage was already correct).

---

## [1.5.5] — 2026-07-14

### Fixed

- **`integration.ts` free-text/identifier values were not sanitized before being interpolated into encoded queries** — the only tools module not following the codebase-wide `sanitizeLikeValue()` convention (already used in `notification.ts`, `portal.ts`, `security.ts`, `performance.ts`, `sam.ts`, `reporting.ts`, and the `grc-*.ts` modules). A caller could pass e.g. `sys_id_or_name: "Jira^ORactive=true"` and inject an extra encoded-query clause into `get_rest_message`/`get_transform_map`/`get_event_registry_entry`, or similarly via the `query`/`type`/`state` params on `list_rest_messages`, `list_transform_maps`, `list_data_sources`, `list_event_registry`, `list_event_log`, `list_oauth_applications`, `list_credential_aliases`, and `list_import_sets`'s `state` field. Fixed by applying `sanitizeLikeValue()` at every affected site; `list_import_sets`'s `query` param is intentionally left as pass-through since it's documented as a full encoded-query filter (same by-design pattern as `catalog.ts`'s `list_requests`/`list_approvals`).

### Added

- Regression tests for `create_import_set_row` (WRITE_ENABLED gate, required-fields check, staging-table/import-set mismatch, `sys_*` field rejection, successful insert) — previously only partially covered by a combined test elsewhere.
- Tests confirming the new query sanitization for the 8 affected tools above.

### Changed

- Fixed inconsistent `WRITE_ENABLED` env-var cleanup in `catalog.test.ts`/`integration.test.ts` — every `describe` block that sets it in `beforeEach` now restores it in `afterEach`, preventing state from leaking into later tests when vitest reuses a worker.
- Replaced `length > 0` tool-count assertions in `integration.test.ts`/`script.test.ts` with pinned counts (24 and 27), matching the existing pattern in `core.test.ts`.

---

## [1.5.4] — 2026-07-14

### Added

- **Test coverage for 76 previously-untested tools**, first batch of a broader test-coverage pass (an audit found 261 of 476 tools with zero test references). Prioritized by impact: `core.ts` (14 foundational/CMDB read tools) plus `list_instances`/`switch_instance`/`get_current_instance` (multi-instance routing, tested in `router.test.ts` since that's where the logic actually lives), `integration.ts` (23 tools: REST/SOAP Messages, Transform Maps, Import Sets, Event Registry, OAuth/credential listing — new `tests/tools/integration.test.ts`), `catalog.ts` (19 tools: catalog item CRUD/search/order, approval rules and lifecycle, SLA lookup, full request/RITM lifecycle), and `script.ts` (18 tools: Business Rules, Script Includes, Client Scripts, Changesets, UI Policies, UI Actions, ACLs — including a regression test confirming `requireScripting()` gates every tool in the module, not just writes).

No production code changed in this release; test-only.

---

## [1.5.3] — 2026-07-14

### Fixed

- **Record-count logic corrected across 8 more tools** — second pattern-search pass for the same bug class fixed in 1.5.2. `get_security_dashboard`, `get_mobile_analytics`, `ml_forecast_incidents`, `get_devops_insights`, `validate_deployment`, `get_license_optimization`, `ml_predict_change_risk`, and `ml_detect_anomalies` all previously reported totals derived from a capped `queryRecords(limit:N)` fetch's `.count`/`.records.length` instead of the true match count, silently wrong once a query matched more than `N` records (in `get_security_dashboard`'s case, `limit:1`, meaning every field was always 0 or 1). Fixed by sourcing totals from ungrouped `runAggregateQuery` calls; `get_devops_insights` now uses a status-grouped aggregate query for an exact per-status breakdown instead of any capped fetch. Tools whose calculations genuinely need per-record data (`ml_predict_change_risk`, `ml_detect_anomalies`) keep a bounded sample but now report the sample size and an honest `note` alongside the accurate total. None of the eight had prior test coverage for this logic — added for all, including new `tests/tools/mobile.test.ts` and `tests/tools/devops.test.ts` (neither test file previously existed).

---

## [1.5.2] — 2026-07-13

### Fixed

- **Record-count logic corrected across 5 tools** — `get_table_record_count`, `compare_record_counts`, `analyze_data_quality`, `ml_virtual_agent_nlu`, and `ml_process_optimization` all previously reported wrong or silently truncated totals. Root cause: `runAggregateQuery`'s `groupBy` parameter was required, so callers wanting an ungrouped total passed `''`, which always failed client-side validation and threw before any request was sent — `get_table_record_count`/`compare_record_counts` silently fell back to `queryRecords(limit:1).count` (always 0 or 1), and `analyze_data_quality` was similarly always wrong. `ml_virtual_agent_nlu`/`ml_process_optimization` separately undercounted past their fetch's `limit` (500/1000) without warning. `groupBy` is now optional on `runAggregateQuery`; all five tools now use accurate ungrouped aggregate queries. None of the five had any prior test coverage — added for all.

---

## [1.5.1] — 2026-07-13

### Fixed

- **`update_compliance_control` no longer lists `state` as a writable field** — confirmed live that REST Table API writes to `sn_compliance_control.state` are silently ignored (HTTP 200, value never persists) regardless of target value; only the in-app "Attest" UI Action can actually change it. Listing it as writable was misleading. Full investigation (including how GRC assessments actually get issued) recorded in [GRC_DESIGN.md](docs/GRC_DESIGN.md) section 5a.

---

## [1.5.0] — 2026-07-12

### Added

- **GRC (Governance, Risk, Compliance) tooling** — four new modules covering Audit Management (`sn_audit_*`: Engagements, Control Tests, dashboard), Policy and Compliance Management (`sn_grc_*`/`sn_compliance_*`: Entities, Policies, Controls, Control Objectives, Policy Exceptions, Issues, dashboard), Risk Management (`sn_risk_*`: Risks, Risk Statement library, Risk Criteria scale, dashboard), and Indicator/KRI (`sn_grc_indicator*`: Indicators, Indicator Results, dashboard). 41 new tools, all verified live against a PDI rather than assumed from documentation — see [GRC_DESIGN.md](docs/GRC_DESIGN.md) for the investigation, including confirmed cases where a business rule silently overrides client-supplied writes (`sn_risk_risk` `impact`/`likelihood`/`score`/`justification`/`response`/`classification`) or rejects mismatched `entity`/`item` pairs on `sn_grc_indicator` (HTTP 403) — those write paths are intentionally restricted to what was confirmed to actually persist.
- Replaces 6 broken pre-existing GRC tools in `security.ts` (`list_grc_risks`, `get_grc_risk`, `list_grc_controls`, `create_grc_risk`, `get_compliance_assessment`, `list_audit_results`) that pointed at nonexistent tables (`sn_compliance_assessment`, `sn_audit_result`) or used a field set that didn't match the real schema.

### Changed

- `secops_analyst` tool package grows from 61 to 100 tools with the new GRC modules.

---

## [1.4.0] — 2026-07-12

### Security

- **Write-field allowlists extended to remaining tool families** — `update_user`/`update_group`, USEM/VR rule create+update, agile (`update_story`/`update_epic`/`update_scrum_task`), `update_task`, scripting (`update_business_rule`/`update_script_include`/`update_client_script`/`update_ui_action`), `update_scoped_app`, `update_portal_widget`, `update_report`/`update_scheduled_job`, and `update_va_topic` now reject any field outside a curated allowlist (default-deny), closing the mass-assignment gap that remained after 1.2.0's initial rollout.
- **Schema-level defense in depth** — every allowlisted `fields` parameter now also declares `properties` for each allowed key plus `additionalProperties: false` in its JSON input schema, so MCP-client-side schema validation rejects undeclared fields before a call reaches server code, not just the runtime check. USEM rule tools use a closed union schema across all `rule_type` variants, since the allowed set depends on a sibling parameter.
- **USEM query literal sanitization** — user-supplied filter values in `usem.ts` (`cmdb_ci`, `assignment_group`, `assigned_to`, CVE/number lookups) now pass through `sanitizeLikeValue`, while caller-supplied raw `query` strings remain intentionally unsanitized (the existing opt-in raw-query design).

### Fixed

- `update_portal_widget` and `update_report` no longer mutate the caller-supplied `fields` object when remapping friendly field names (`server_script`→`script`, `query`→`filter_fields`); both now operate on a shallow copy.

---

## [1.3.0] — 2026-07-12

### Added

- **USEM remediation workflow completion** — added `create_vulnerable_item`, `list_remediation_task_findings`, and `get_finding_grouping_status` so SecOps users can create VIs with the vulnerability reference intact, inspect VI <-> Remediation Task links, and diagnose grouping failures in one call.
- **Cross-table Remediation Task lookup** — `list_remediation_tasks` now queries both `sn_vul_remediation_task` and the rule-engine-backed `sn_vul_vulnerability` table, annotates each record with `source_table`, reports `by_table` counts, and globally sorts/limits merged results.
- **Smarter Remediation Task resolution** — `get_remediation_task` now routes VUL numbers directly to `sn_vul_vulnerability`, falls back from `task_number` to VUL `number` for non-VUL identifiers, and tries both tables for sys_id lookups when the first table returns NOT_FOUND.

### Changed

- `secops_analyst` now includes the new USEM remediation workflow tools.
- ROADMAP and tool documentation now mark USEM remediation workflow item 11 complete and describe the cross-table RT behavior.

### Fixed

- `get_remediation_task` no longer hides ACL/auth/network failures behind cross-table fallback; only genuine NOT_FOUND responses fall through to the second table.

---

## [1.2.0] — 2026-07-11

### Security

- **Write-field allowlists on all create/update tools** — `incident`, `problem`, `change_request`, CSM case, HR case, HR profile, asset, knowledge article, catalog item, notification, PA dashboard, security incident, and vulnerability writes now reject any field outside a curated allowlist (default-deny). AI-supplied arguments can no longer set arbitrary columns such as `sys_id`, workflow, or ACL-adjacent fields. Rejected requests name both the offending fields and the full allowed-field list.
- **Encoded-query sanitization across list/search tools** — free-text and reference filters in `security`, `hrsd`, `sam`, `portal`, `reporting`, `performance`, `notification`, and the MCP resource layer are passed through `sanitizeLikeValue` (strips `^` clause separators and NUL) before interpolation, preventing encoded-query injection.
- **API path traversal guard** — the raw `/api/` REST helper rejects `.` / `..` / `%2e` path segments before URL normalization can hide an escape, and validates any embedded `sysparm_query`.
- **Scheduled-job scripting gate** — `create_scheduled_job` and `update_scheduled_job` now require `SCRIPTING_ENABLED=true` (not just `WRITE_ENABLED`), matching their server-side script (RCE) surface.

### Changed

- Field-allowlist `VALIDATION_ERROR` messages now include the allowed-field list, so a caller rejected for an undeclared field can see what is permitted.

---

## [1.1.0] — 2026-07-11

### Added

- **USEM `sn_sec_*` configuration coverage** — `list_usem_rules` and the generic rule tools now cover `rollup`, `exception_config`, `calculator_config`, `risk_field`, and `risk_score_weight`, closing the remaining KB2556844 migration-table gaps.
- **`get_risk_calculator_details`** — one-call explanation of a USEM Risk Calculator (group → rules → weighted risk fields → score-weight bands).
- **`list_integration_parameters`** — USEM integration parameter definitions (`sn_sec_int_config`) and per-implementation values (`sn_sec_int_impl_config`), with secret-value masking; encrypted `password_value` columns are never returned.

### Security

- **HTTP resource limits** — Streamable HTTP now enforces a 1 MiB request-body cap (413), a 100-session cap (429), and 30-minute idle-session expiry, configurable via `MCP_HTTP_MAX_BODY_BYTES` / `MCP_HTTP_MAX_SESSIONS` / `MCP_HTTP_SESSION_IDLE_TIMEOUT_MS`.
- **Per-connection instance isolation** — a new `InstanceContext` scopes `switch_instance` state to each MCP connection, preventing one session's instance switch from leaking into another over shared HTTP.
- **Write-boundary tightening** — `create_import_set_row` requires the owning `import_set_sys_id` and a matching staging table; `create_acl` requires validated roles; `update_acl` allows only `description`.

### Changed

- Setup writers emit `npx <pkg> server` with VS Code `inputs` for secrets, so no plaintext secrets are written to `.vscode/mcp.json`.

---

## [1.0.8] — 2026-07-11

### Security

- **HTTP MCP authentication** — Streamable HTTP requests now require an explicit Bearer token before a session or tool invocation is accepted
- **Encoded-query validation** — CMDB, active-event, and aggregate-query helpers now apply the shared ServiceNow JavaScript-expression allowlist
- **Per-user fail-closed behavior** — instances without a bound per-user token now fail at API use rather than falling back to service-account authority
- **Claude Code setup hardening** — configuration values are passed as process arguments instead of a shell command; Windows uses the `claude.cmd` shim

### Changed

- Documented `MCP_HTTP_AUTH_TOKEN` and the required Authorization header for Streamable HTTP MCP clients

---

## [1.0.2] — 2026-06-07

### Security

- **Sensitive property masking** — `sys-properties.ts` now masks values of password2-type, `private=true`, and name-pattern-matched properties (`secret`, `token`, `key`, `password`, `credential`, etc.) across all read paths including `bulk_get`, `export`, `validate`, and `history`
- **Encoded query injection prevention** — added `sanitizePropertyName()` and `sanitizeSearchTerm()` helpers in `sys-properties.ts`; added field-value validators (sys_id format, REQ/RITM number format, stage/state enum checks) in `catalog.ts`; sanitized free-text search values in SOAP tools in `integration.ts`
- **File permission hardening** — `config-store.ts` and `auth.ts` now apply `chmodSync(path, 0o600)` after every `writeFileSync` to prevent other-user read of credential files
- **Update Set XML safety** — `export_update_set` now paginates to guarantee completeness and throws `RESULT_TOO_LARGE` (with UI export link) instead of silently returning truncated XML when change count exceeds 2,000

### Added

#### New Tools
- **Catalog request lifecycle** (`catalog.ts`) — `list_requests`, `get_request`, `list_request_items`, `get_request_item`, `cancel_request`, `update_request_item` for full `sc_request` / `sc_req_item` / `sc_task` tracking
- **SOAP Message support** (`integration.ts`) — `list_soap_messages`, `get_soap_message`, `list_soap_message_functions`, `create_soap_message`, `create_soap_message_function` for `sys_web_service` / `sys_web_service_function` management
- **`auth test` CLI command** — tests OAuth connectivity against a configured instance and reports grant type and API user

#### Tool Packages
- `service_desk` package now includes `list_requests`, `get_request`, `list_request_items`, `get_request_item`
- `catalog_builder` package now includes the full request lifecycle tools
- `integration_engineer` package now includes all SOAP message tools

### Changed

- **OAuth-only authentication** — Basic Auth removed entirely from client, CLI wizard, env var writers, and all documentation; only `client_credentials` and `password` grant types are supported
- **Auto grant-type detection** — `ServiceNowClient` selects `client_credentials` when only `clientId`/`clientSecret` are configured; switches to `password` grant when `username`+`password` are also present — no explicit configuration required
- **Update Set XML export** — `export_update_set` now returns real importable XML assembled from `sys_update_xml.payload` fields, replacing the previous metadata-only response
- **`NOW_ASSIST_ENABLED` env var** — corrected from `NOWASSIST_ENABLED` (broken) to `NOW_ASSIST_ENABLED` (matches `permissions.ts`)
- **OAuth setup documentation** — Application Registry creation now documented as **New Inbound Integration Experience** with **Token Format: JWT** required; deprecated UI option called out explicitly
- **Installation** — changed from `npm install -g` to build-from-source (`git clone` → `npm install` → `npm run build` → `npm run setup`)

### Fixed

- **Password Grant credentials lost on reload** — `instances.ts` wizard config loader was reading `c['username']`/`c['password']`; corrected to `c['oauthUsername']`/`c['oauthPassword']` to match the keys saved by `setup.ts`
- **`auth test` command** — was documented in README but not implemented; now registered as `auth test [instanceName]` in CLI

### Removed

- Basic Auth code paths (`authMethod: 'basic'`, `SERVICENOW_BASIC_USERNAME`, `SERVICENOW_BASIC_PASSWORD`, `SERVICENOW_AUTH_METHOD`)
- All Basic Auth examples from `server.json`, `instances.example.json`, client config templates, and all documentation

---

## [1.0.0] — 2026-03-01

### Initial Release

The most comprehensive ServiceNow MCP server — 400+ tools across all modules.

#### Core
- **400+ MCP tools** covering 31+ ServiceNow modules
- **Multi-instance support** — connect to unlimited instances (dev, staging, prod, customer tenants) simultaneously
- **Role-based tool packages** — 14 persona-specific packages (service_desk, platform_developer, system_administrator, etc.)
- **5-tier permission system** — read-only by default; write, CMDB, scripting, Now Assist, and ATF each require explicit opt-in
- **OAuth 2.0** (client_credentials / password grant)

#### CLI
- **`servicenow-mcp setup`** — interactive wizard detects AI clients and writes config automatically
- **`servicenow-mcp auth login/logout/whoami`** — per-user OAuth flow
- **`servicenow-mcp instances list/remove`** — manage configured instances

#### MCP Features
- **11 slash commands** (`/morning-standup`, `/p1-alerts`, `/my-tickets`, `/create-incident`, etc.)
- **6 @ mention resources** (`@my-incidents`, `@open-changes`, `@sla-breaches`, etc.)
- **Custom commands** via `servicenow-mcp.commands.json`

#### Module Coverage
ITSM, ITOM, CMDB, HRSD, CSM, SecOps, GRC, Agile, ATF, Flow Designer, Scripting, Now Assist, Service Portal, UI Builder, Integration Hub, Notifications, Attachments, Performance Analytics, System Properties, Update Sets, Virtual Agent, ITAM, DevOps, Scoped Applications, and more.

#### AI Client Support
Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, GitHub Copilot, Continue.dev, Cline, JetBrains, Amazon Q, Google AI Studio, ChatGPT, Gemini, Grok, Ollama, and any MCP-compatible client.
