import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// The ServiceNow client aborts any request after REQUEST_TIMEOUT_MS (30 s by
// default, which is the right ceiling for an MCP server). The write E2E tests
// delete every record they create, and ServiceNow cascades a delete through
// every table that references the record — a sys_user_group delete was
// measured at 21 s on a PDI still digesting a plugin install and can exceed
// 30 s. Give live tests a longer budget without touching the production
// default; an explicit REQUEST_TIMEOUT_MS in the environment still wins.
process.env.REQUEST_TIMEOUT_MS ??= '120000';
