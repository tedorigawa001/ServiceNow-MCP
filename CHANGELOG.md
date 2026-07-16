# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
