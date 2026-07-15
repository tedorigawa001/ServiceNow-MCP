import dotenv from 'dotenv';

// E2E runs against a real instance, so load the same .env a local server run
// would use (SN_INSTANCES_CONFIG or SERVICENOW_* vars) instead of tests/setup.ts's
// fake SERVICENOW_INSTANCE_URL used by the mocked unit-test suite.
dotenv.config({ quiet: true });
