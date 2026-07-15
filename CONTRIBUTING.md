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

Read-only coverage of the major tables: `incident`, `change_request`,
`problem`, `sys_user`, `cmdb_ci`.

1. Copy `instances.example.json` to `instances.json` (gitignored) and fill in
   your PDI's OAuth credentials, or set `SERVICENOW_INSTANCE_URL` +
   `SERVICENOW_OAUTH_CLIENT_ID`/`SERVICENOW_OAUTH_CLIENT_SECRET` in a local
   `.env` (also gitignored).
2. Run: `npm run test:e2e`

Without `RUN_E2E=true` and a configured instance, the whole suite is skipped —
so it never runs by accident in CI or a plain `npm test`.

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
