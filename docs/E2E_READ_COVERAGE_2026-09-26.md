# Read-only E2E expansion — 2026-09-26

Target: dev441827 PDI and the public ServiceNow Store catalog. Tests invoke the
same tool executors as server dispatch with the real client; they do not test the
MCP transport handshake or client-side JSON Schema validation.

## Results

| Suite | Passed | Skipped | Verification |
|---|---:|---:|---|
| `smart-query.e2e.test.ts` | 3 | 0 | Japanese intent, inherited fields, query_records result identity comparison, unsupported-field reporting |
| `usem-read.e2e.test.ts` | 13 | 4 | SLA lists, approval/exception lists, integration lists and run identity by number/id, rule list/detail without changes |
| `now-assist-read.e2e.test.ts` | 2 | 0 | Active VA topics and PI model metadata only |
| `store-read.e2e.test.ts` | 3 | 0 | Listing IDs, version history, optional notes, installed-version comparison using an exact-title listing |
| Total | 21 | 4 | 25 cases, no failures |

The added suites target 19 distinct tools across seven modules. 17 tools were
actually exercised successfully. `get_remediation_sla` (VI, legacy RT, group)
and `get_group_sla` were skipped because no visible source records existed.
This is **not** a statement of repository-wide coverage or line/branch coverage.
Empty list results establish that the read path works, not that every filter or
field is validated against populated data.

## Safety and reproducibility

- Set `RUN_E2E=true`, configure a PDI with the usual instance/OAuth settings,
  and set `WRITE_ENABLED=false` and `SCRIPTING_ENABLED=false`.
- The Now Assist metadata suite requires the existing `NOW_ASSIST_ENABLED=true`
  gate; no inference, generated content, work notes, or playbooks are invoked.
- Run only the four suites above with `vitest run -c vitest.e2e.config.ts` and
  their explicit file paths. Optional tables are checked through `sys_db_object`;
  absent tables and missing fixtures are explicit skips. API/ACL errors are not
  swallowed or converted into successful tests.
- The Store tests send only public product search terms/listing IDs to the public
  catalog. No instance credentials or record contents are sent to Store.
- No records were created, updated, activated, or deleted. The deferred
  remediation-rule persistence investigation was not resumed.

Validation: normal suite 1,591 passed (60 files); production build succeeded;
the four added test files passed ESLint with zero warnings after type cleanup.

## Remaining work

1. Provide approved disposable VI/RT/group fixtures to exercise the four skipped
   detail cases. Creating them is a separate write-test scope.
2. Extend USEM to parameter masking and additional configuration rule families;
   current coverage does not include every read operation or every filter.
3. Now Assist AI invocation and agentic playbooks remain untested deliberately.
4. Store matching fallback, older versions, and failure behavior remain covered
   primarily by unit tests, not exhaustive live scenarios.
5. Resolve a local configuration warning: the wizard `instances.json` failed JSON
   parsing at position 67. These runs authenticated through the existing Claude
   configuration's OAuth environment variables. The wizard file was not changed.

