# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
