import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeGrcComplianceToolCall, getGrcComplianceToolDefinitions } from '../../src/tools/grc-compliance.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
  getRecord: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  runAggregateQuery: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;
const getRec = () => mockClient.getRecord as ReturnType<typeof vi.fn>;
const createRec = () => mockClient.createRecord as ReturnType<typeof vi.fn>;
const updateRec = () => mockClient.updateRecord as ReturnType<typeof vi.fn>;
const agg = () => mockClient.runAggregateQuery as ReturnType<typeof vi.fn>;

describe('getGrcComplianceToolDefinitions', () => {
  it('returns the expected tool names', () => {
    const names = getGrcComplianceToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      [
        'list_grc_entities', 'get_grc_entity', 'create_grc_entity', 'update_grc_entity',
        'list_compliance_policies', 'get_compliance_policy', 'create_compliance_policy', 'update_compliance_policy',
        'list_compliance_controls', 'get_compliance_control', 'create_compliance_control', 'update_compliance_control',
        'list_control_objectives', 'get_control_objective',
        'list_policy_exceptions', 'get_policy_exception',
        'list_grc_issues', 'get_grc_issue', 'create_grc_issue', 'update_grc_issue',
        'get_grc_compliance_dashboard',
      ].sort()
    );
  });

  it('write-tool fields schemas are closed (additionalProperties: false)', () => {
    const defs = getGrcComplianceToolDefinitions();
    for (const name of ['update_grc_entity', 'update_compliance_policy', 'update_compliance_control', 'update_grc_issue']) {
      const tool = defs.find(t => t.name === name)!;
      const fields = (tool.inputSchema.properties as any).fields;
      expect(fields.additionalProperties).toBe(false);
    }
  });
});

describe('executeGrcComplianceToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeGrcComplianceToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('Entity (sn_grc_profile)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_grc_entities filters by profile_class/cmdb_ci/name', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ name: 'Intel' }] });
    await executeGrcComplianceToolCall(mockClient, 'list_grc_entities', {
      profile_class: 'pc1',
      cmdb_ci: 'ci1',
      name: 'Intel',
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_grc_profile');
    expect(call.query).toBe('profile_class=pc1^cmdb_ci=ci1^nameLIKEIntel');
  });

  it('get_grc_entity requires sys_id and calls getRecord', async () => {
    await expect(executeGrcComplianceToolCall(mockClient, 'get_grc_entity', {})).rejects.toThrow('sys_id is required');
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcComplianceToolCall(mockClient, 'get_grc_entity', { sys_id: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_grc_profile', 'a'.repeat(32));
  });

  describe('write tools', () => {
    const ORIGINAL = process.env.WRITE_ENABLED;
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.WRITE_ENABLED = 'true';
    });
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
      else process.env.WRITE_ENABLED = ORIGINAL;
    });

    it('create_grc_entity requires name and profile_class', async () => {
      await expect(
        executeGrcComplianceToolCall(mockClient, 'create_grc_entity', { name: 'x' })
      ).rejects.toThrow('name and profile_class are required');
    });

    it('create_grc_entity sends only provided fields', async () => {
      createRec().mockResolvedValue({ sys_id: 'e1' });
      const result = await executeGrcComplianceToolCall(mockClient, 'create_grc_entity', {
        name: 'Acme Vendor',
        profile_class: 'pc1',
        owned_by: 'u1',
      });
      expect(createRec()).toHaveBeenCalledWith('sn_grc_profile', {
        name: 'Acme Vendor',
        profile_class: 'pc1',
        owned_by: 'u1',
      });
      expect(result.summary).toContain('Acme Vendor');
    });

    it('update_grc_entity rejects undeclared fields', async () => {
      await expect(
        executeGrcComplianceToolCall(mockClient, 'update_grc_entity', { sys_id: 'a'.repeat(32), fields: { sys_id: 'x' } })
      ).rejects.toThrow('cannot be set');
    });

    it('update_grc_entity patches allowed fields', async () => {
      updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
      await executeGrcComplianceToolCall(mockClient, 'update_grc_entity', {
        sys_id: 'a'.repeat(32),
        fields: { description: 'updated' },
      });
      expect(updateRec()).toHaveBeenCalledWith('sn_grc_profile', 'a'.repeat(32), { description: 'updated' });
    });
  });
});

describe('Policy (sn_compliance_policy)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_compliance_policies builds state + category filter', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'POL1' }] });
    await executeGrcComplianceToolCall(mockClient, 'list_compliance_policies', { state: 'draft', category: 'IT' });
    expect(qr().mock.calls[0][0].table).toBe('sn_compliance_policy');
    expect(qr().mock.calls[0][0].query).toBe('state=draft^category=IT');
  });

  it('get_compliance_policy resolves by number', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'POL0010200' }] });
    const result = await executeGrcComplianceToolCall(mockClient, 'get_compliance_policy', { number_or_sysid: 'POL0010200' });
    expect(qr().mock.calls[0][0].query).toBe('number=POL0010200');
    expect(result.number).toBe('POL0010200');
  });

  it('get_compliance_policy throws NOT_FOUND', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeGrcComplianceToolCall(mockClient, 'get_compliance_policy', { number_or_sysid: 'POLxxxx' })
    ).rejects.toThrow('Compliance Policy not found');
  });
});

describe('Control (sn_compliance_control)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_compliance_controls filters by profile and key_control', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcComplianceToolCall(mockClient, 'list_compliance_controls', { profile: 'p1', key_control: true });
    expect(qr().mock.calls[0][0].query).toBe('profile=p1^key_control=true');
  });
});

describe('Control Objective (read-only)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_control_objectives filters by state', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcComplianceToolCall(mockClient, 'list_control_objectives', { state: 'published' });
    expect(qr().mock.calls[0][0].table).toBe('sn_compliance_policy_statement');
    expect(qr().mock.calls[0][0].query).toBe('state=published');
  });

  it('get_control_objective calls getRecord', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeGrcComplianceToolCall(mockClient, 'get_control_objective', { sys_id: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_compliance_policy_statement', 'a'.repeat(32));
  });
});

describe('Policy Exception (read-only)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_policy_exceptions builds numeric stateIN clause', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcComplianceToolCall(mockClient, 'list_policy_exceptions', { state: '1,2,10' });
    expect(qr().mock.calls[0][0].query).toBe('stateIN1,2,10');
  });

  it('get_policy_exception resolves by number', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'PER0000106' }] });
    const result = await executeGrcComplianceToolCall(mockClient, 'get_policy_exception', { number_or_sysid: 'PER0000106' });
    expect(result.number).toBe('PER0000106');
  });
});

describe('Issue (sn_grc_issue)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list_grc_issues filters by state/profile/classification', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeGrcComplianceToolCall(mockClient, 'list_grc_issues', { state: '0,1,2', profile: 'p1', classification: 'finding' });
    expect(qr().mock.calls[0][0].query).toBe('stateIN0,1,2^profile=p1^classification=finding');
  });

  it('get_grc_issue resolves by number and throws NOT_FOUND', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeGrcComplianceToolCall(mockClient, 'get_grc_issue', { number_or_sysid: 'IPTxxxx' })
    ).rejects.toThrow('GRC Issue not found');
  });

  describe('write tools', () => {
    const ORIGINAL = process.env.WRITE_ENABLED;
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.WRITE_ENABLED = 'true';
    });
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
      else process.env.WRITE_ENABLED = ORIGINAL;
    });

    it('create_grc_issue requires short_description', async () => {
      await expect(executeGrcComplianceToolCall(mockClient, 'create_grc_issue', {})).rejects.toThrow('short_description is required');
    });

    it('create_grc_issue sends only provided fields', async () => {
      createRec().mockResolvedValue({ sys_id: 'i1', number: 'IPT0011099' });
      const result = await executeGrcComplianceToolCall(mockClient, 'create_grc_issue', {
        short_description: 'Control test failed',
        profile: 'p1',
      });
      expect(createRec()).toHaveBeenCalledWith('sn_grc_issue', {
        short_description: 'Control test failed',
        profile: 'p1',
      });
      expect(result.summary).toContain('Control test failed');
    });

    it('update_grc_issue rejects undeclared fields', async () => {
      await expect(
        executeGrcComplianceToolCall(mockClient, 'update_grc_issue', { sys_id: 'a'.repeat(32), fields: { number: 'x' } })
      ).rejects.toThrow('cannot be set');
    });
  });

  describe('write tools – permission gating', () => {
    const ORIGINAL = process.env.WRITE_ENABLED;
    beforeEach(() => {
      vi.clearAllMocks();
      delete process.env.WRITE_ENABLED;
    });
    afterEach(() => {
      if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
      else process.env.WRITE_ENABLED = ORIGINAL;
    });

    it('create_grc_issue is blocked without WRITE_ENABLED', async () => {
      await expect(
        executeGrcComplianceToolCall(mockClient, 'create_grc_issue', { short_description: 'x' })
      ).rejects.toThrow('Write operations are disabled');
    });
  });
});

describe('get_grc_compliance_dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates policy/control/issue counts and lists top exceptions', async () => {
    agg()
      .mockResolvedValueOnce([{ stats: { count: '8' }, groupby_fields: [{ field: 'state', value: 'published' }] }])
      .mockResolvedValueOnce([{ stats: { count: '1111' }, groupby_fields: [{ field: 'state', value: 'draft' }] }])
      .mockResolvedValueOnce([
        { stats: { count: '30' }, groupby_fields: [{ field: 'state', value: '2' }] },
        { stats: { count: '8' }, groupby_fields: [{ field: 'state', value: '3' }] },
      ]);
    qr().mockResolvedValue({
      count: 1,
      records: [{ number: 'PER1', state: { value: '1' } }],
    });

    const result = await executeGrcComplianceToolCall(mockClient, 'get_grc_compliance_dashboard', { top: 1 });

    expect(result.policies.total).toBe(8);
    expect(result.controls.total).toBe(1111);
    expect(result.issues.total).toBe(38);
    expect(result.issues.open).toBe(30); // state 3 (Closed Complete) excluded
    expect(result.open_policy_exceptions[0].state_label).toBe('New');
  });
});
