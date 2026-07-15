# Contributing to servicenow-mcp

Thank you for considering contributing!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

```bash
npm run dev  # Start in watch mode
npm test     # Run tests
npm run lint # Check code style
```

## E2E Tests (optional, against a real PDI)

`npm test` only runs the mocked unit suite. There's also an opt-in E2E suite in
`tests/e2e/` that exercises the tool executors against a real ServiceNow
instance (a free [Personal Developer Instance](https://developer.servicenow.com)
works well) — useful for confirming query-building/sanitization logic actually
produces valid encoded queries, not just what the mocks accept.

Read-only coverage of the major ITSM/CMDB tables (`incident`, `change_request`,
`problem`, `sys_user`, `cmdb_ci`), tables shared across modules
(`sys_user_group`, generic `task`, `kb_knowledge`, `sc_cat_item`), Vulnerability
Response (`sn_vul_vulnerable_item`, `sn_vul_remediation_task` /
`sn_vul_vulnerability`, `sn_vul_nvd_entry`), and GRC (`sn_audit_engagement`,
`sn_risk_risk`, `sn_grc_profile`, `sn_grc_indicator`).

1. Copy `instances.example.json` to `instances.json` (gitignored) and fill in
   your PDI's OAuth credentials, or set `SERVICENOW_INSTANCE_URL` +
   `SERVICENOW_OAUTH_CLIENT_ID`/`SERVICENOW_OAUTH_CLIENT_SECRET` in a local
   `.env` (also gitignored).
2. Run: `npm run test:e2e`

Without `RUN_E2E=true` and a configured instance, the whole suite is skipped —
so it never runs by accident in CI or a plain `npm test`.

### Write-tool tests (create/update)

`tests/e2e/write-operations.e2e.test.ts` exercises create/update on incident,
problem, change_request, sys_user_group, kb_knowledge, sn_vul_vulnerability
(Vulnerability Group), sn_risk_risk, and sn_grc_profile (GRC Entity). Each
test deletes what it created in a `finally` block, so a failing assertion
never leaves data behind — but only point this at a disposable PDI, never a
shared or production instance.

Not covered: `create_remediation_task` (sn_vul_remediation_task) — on a real
instance its ACL rejected a bare insert with only `short_description`; VR
remediation tasks are normally produced by the rule engine from a
Vulnerability Group rather than created directly via the API.

Run: `npm run test:e2e:write` (sets `WRITE_ENABLED=true` in addition to
`RUN_E2E=true`; without it this file's tests are skipped even if the rest of
the E2E suite runs).

## Pull Request Process

1. Update documentation
2. Add tests for new features
3. Run `npm run lint && npm run type-check && npm test`
4. Update CHANGELOG.md
5. Create PR with clear title and description

## Official Documentation Only

Only reference official ServiceNow documentation from:
- docs.servicenow.com
- developer.servicenow.com

Do not reference community answers, blogs, or third-party tutorials.

Thank you for contributing!
