import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeCoreToolCall } from '../../src/tools/core.js';
import { executeDeploymentToolCall } from '../../src/tools/deployment.js';
import { executeIntegrationToolCall } from '../../src/tools/integration.js';
import { executeScriptToolCall } from '../../src/tools/script.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const client = { createRecord: vi.fn(), updateRecord: vi.fn(), queryRecords: vi.fn(), getRecord: vi.fn() } as unknown as ServiceNowClient;

afterEach(() => {
  delete process.env.WRITE_ENABLED;
  delete process.env.CMDB_WRITE_ENABLED;
  delete process.env.SCRIPTING_ENABLED;
  vi.clearAllMocks();
});

describe('P2 write boundaries', () => {
  it('requires the dedicated CMDB gate for CI relationships and CMDB import', async () => {
    process.env.WRITE_ENABLED = 'true';
    await expect(executeCoreToolCall(client, 'create_ci_relationship', { parent: 'a', child: 'b', type: 'Depends on::Used by' })).rejects.toMatchObject({ code: 'CMDB_WRITE_NOT_ENABLED' });
    await expect(executeDeploymentToolCall(client, 'import_cmdb_data', { table: 'cmdb_ci_server', data: [{ name: 'server' }] })).rejects.toMatchObject({ code: 'CMDB_WRITE_NOT_ENABLED' });
  });

  it('accepts only CMDB classes and an allowlisted payload for CMDB import', async () => {
    process.env.WRITE_ENABLED = 'true';
    process.env.CMDB_WRITE_ENABLED = 'true';
    await expect(executeDeploymentToolCall(client, 'import_cmdb_data', { table: 'incident', data: [{ name: 'x' }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await executeDeploymentToolCall(client, 'import_cmdb_data', { table: 'cmdb_ci_server', data: [{ name: 'x', sys_class_name: 'cmdb_ci_server' }] });
    expect(client.createRecord).not.toHaveBeenCalled();
  });

  it('binds an import row to its import set and rejects system fields', async () => {
    process.env.WRITE_ENABLED = 'true';
    (client.getRecord as ReturnType<typeof vi.fn>).mockResolvedValue({ table_name: 'u_import_ci' });
    await expect(executeIntegrationToolCall(client, 'create_import_set_row', { staging_table: 'u_import_ci', import_set_sys_id: 'a'.repeat(32), data: { sys_id: 'x' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await executeIntegrationToolCall(client, 'create_import_set_row', { staging_table: 'u_import_ci', import_set_sys_id: 'a'.repeat(32), data: { hostname: 'server-1' } });
    expect(client.createRecord).toHaveBeenCalledWith('u_import_ci', { hostname: 'server-1' });
  });

  it('creates ACL role relations and blocks mass assignment on updates', async () => {
    process.env.WRITE_ENABLED = 'true';
    process.env.SCRIPTING_ENABLED = 'true';
    (client.createRecord as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ sys_id: 'acl-id' }).mockResolvedValue({ sys_id: 'relation-id' });
    (client.queryRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1, records: [{ sys_id: 'role-id', name: 'itil' }] });
    await executeScriptToolCall(client, 'create_acl', { name: 'incident', operation: 'read', roles: 'itil' });
    expect(client.createRecord).toHaveBeenLastCalledWith('sys_security_acl_role', { sys_security_acl: 'acl-id', sys_user_role: 'role-id' });
    await expect(executeScriptToolCall(client, 'update_acl', { sys_id: 'a'.repeat(32), fields: { active: false } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
