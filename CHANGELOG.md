# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
