import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeUsemToolCall, getUsemToolDefinitions } from '../../src/tools/usem.js';
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

describe('getUsemToolDefinitions', () => {
  it('returns 14 tool definitions', () => {
    expect(getUsemToolDefinitions().length).toBe(14);
  });

  it('all tools have name, description and inputSchema', () => {
    getUsemToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });

  it('exposes the expected tool names', () => {
    const names = getUsemToolDefinitions().map(t => t.name).sort();
    expect(names).toEqual(
      [
        'add_vi_to_remediation_task',
        'create_remediation_task',
        'create_vulnerability_group',
        'get_nvd_entry_by_cve',
        'get_remediation_task',
        'get_usem_dashboard',
        'get_vulnerability_group',
        'get_vulnerable_item',
        'list_nvd_entries',
        'list_remediation_tasks',
        'list_vulnerability_groups',
        'list_vulnerable_items',
        'update_remediation_task',
        'update_vulnerability_group',
      ].sort()
    );
  });
});

describe('executeUsemToolCall – unknown tool', () => {
  it('returns null so the router can fall through', async () => {
    expect(await executeUsemToolCall(mockClient, 'not_a_usem_tool', {})).toBeNull();
  });
});

describe('list_vulnerable_items', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a state + risk filter and orders by -risk_score', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ number: 'VIT1' }, { number: 'VIT2' }] });
    const result = await executeUsemToolCall(mockClient, 'list_vulnerable_items', {
      state: '1',
      risk_score_min: 50,
      cmdb_ci: 'ci123',
      assignment_group: 'grp1',
      query: 'active=true',
    });
    expect(result.count).toBe(2);
    expect(result.summary).toContain('2 vulnerable item');
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_vulnerable_item');
    expect(call.orderBy).toBe('-risk_score');
    expect(call.query).toBe('state=1^risk_score>=50^cmdb_ci=ci123^assignment_group=grp1^active=true');
  });

  it('uses stateIN for comma-separated states', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemToolCall(mockClient, 'list_vulnerable_items', { state: '1,2,10' });
    expect(qr().mock.calls[0][0].query).toBe('stateIN1,2,10');
  });

  it('defaults to an empty query when no filters provided', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemToolCall(mockClient, 'list_vulnerable_items', {});
    expect(qr().mock.calls[0][0].query).toBe('');
    expect(qr().mock.calls[0][0].limit).toBe(25);
  });
});

describe('get_vulnerable_item', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id when a 32-char hex id is given', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemToolCall(mockClient, 'get_vulnerable_item', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_vul_vulnerable_item', 'a'.repeat(32));
  });

  it('resolves by number when not a sys_id', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'VIT0010003' }] });
    const result = await executeUsemToolCall(mockClient, 'get_vulnerable_item', { number_or_sysid: 'VIT0010003' });
    expect(qr().mock.calls[0][0].query).toBe('number=VIT0010003');
    expect(result.number).toBe('VIT0010003');
  });

  it('throws NOT_FOUND when number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'get_vulnerable_item', { number_or_sysid: 'VITxxxx' })
    ).rejects.toThrow('Vulnerable Item not found');
  });

  it('throws when identifier missing', async () => {
    await expect(executeUsemToolCall(mockClient, 'get_vulnerable_item', {})).rejects.toThrow('number_or_sysid is required');
  });
});

describe('list_remediation_tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by state, group, assignee', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ task_number: 'RTASK1' }] });
    await executeUsemToolCall(mockClient, 'list_remediation_tasks', {
      state: '10',
      assignment_group: 'g1',
      assigned_to: 'u1',
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_remediation_task');
    expect(call.query).toBe('state=10^assignment_group=g1^assigned_to=u1');
  });
});

describe('get_remediation_task', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves by task_number when not a sys_id', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ task_number: 'RTASK0001' }] });
    await executeUsemToolCall(mockClient, 'get_remediation_task', { number_or_sysid: 'RTASK0001' });
    expect(qr().mock.calls[0][0].query).toBe('task_number=RTASK0001');
  });

  it('throws NOT_FOUND when not found', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'get_remediation_task', { number_or_sysid: 'RTASKxxx' })
    ).rejects.toThrow('Remediation Task not found');
  });
});

describe('list_vulnerability_groups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries sn_vul_vulnerability with state + risk filter, ordered by -risk_score', async () => {
    qr().mockResolvedValue({ count: 2, records: [{ number: 'VUL1' }, { number: 'VUL2' }] });
    const result = await executeUsemToolCall(mockClient, 'list_vulnerability_groups', {
      state: '1',
      risk_score_min: 80,
      assignment_group: 'grp1',
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_vulnerability');
    expect(call.orderBy).toBe('-risk_score');
    expect(call.query).toBe('state=1^risk_score>=80^assignment_group=grp1');
    expect(result.summary).toContain('2 vulnerability group');
  });
});

describe('get_vulnerability_group', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id when a 32-char hex id is given', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemToolCall(mockClient, 'get_vulnerability_group', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_vul_vulnerability', 'a'.repeat(32));
  });

  it('resolves by VUL number otherwise', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'VUL0000103' }] });
    const result = await executeUsemToolCall(mockClient, 'get_vulnerability_group', { number_or_sysid: 'VUL0000103' });
    expect(qr().mock.calls[0][0].query).toBe('number=VUL0000103');
    expect(result.number).toBe('VUL0000103');
  });

  it('throws NOT_FOUND when number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'get_vulnerability_group', { number_or_sysid: 'VULxxxx' })
    ).rejects.toThrow('Vulnerability Group not found');
  });
});

describe('list_nvd_entries / get_nvd_entry_by_cve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds CVE LIKE and score filter', async () => {
    qr().mockResolvedValue({ count: 3, records: [] });
    await executeUsemToolCall(mockClient, 'list_nvd_entries', { cve: 'CVE-2018', score_min: 7 });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_nvd_entry');
    expect(call.query).toBe('idLIKECVE-2018^v3_base_score>=7');
    expect(call.orderBy).toBe('-v3_base_score');
  });

  it('looks up an exact CVE id', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ id: 'CVE-2018-1002203' }] });
    const result = await executeUsemToolCall(mockClient, 'get_nvd_entry_by_cve', { cve: 'CVE-2018-1002203' });
    expect(qr().mock.calls[0][0].query).toBe('id=CVE-2018-1002203');
    expect(result.id).toBe('CVE-2018-1002203');
  });

  it('throws NOT_FOUND for unknown CVE', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'get_nvd_entry_by_cve', { cve: 'CVE-0000-0000' })
    ).rejects.toThrow('NVD entry not found');
  });

  it('throws when cve missing', async () => {
    await expect(executeUsemToolCall(mockClient, 'get_nvd_entry_by_cve', {})).rejects.toThrow('cve is required');
  });
});

describe('get_usem_dashboard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('aggregates VI/RT counts by state and lists top-risk VIs', async () => {
    agg()
      .mockResolvedValueOnce([
        { stats: { count: '4' }, groupby_fields: [{ field: 'state', value: '3' }] },
        { stats: { count: '6' }, groupby_fields: [{ field: 'state', value: '1' }] },
      ])
      .mockResolvedValueOnce([
        { stats: { count: '2' }, groupby_fields: [{ field: 'state', value: '1' }] },
      ]);
    qr().mockResolvedValue({ count: 2, records: [{ number: 'VIT1' }, { number: 'VIT2' }] });

    const result = await executeUsemToolCall(mockClient, 'get_usem_dashboard', { top: 2 });

    expect(agg()).toHaveBeenCalledWith('sn_vul_vulnerable_item', 'state', 'COUNT');
    expect(agg()).toHaveBeenCalledWith('sn_vul_remediation_task', 'state', 'COUNT');
    expect(result.vulnerable_items.total).toBe(10);
    expect(result.vulnerable_items.open).toBe(6); // state 3 (Closed) excluded
    // by_state sorted by count desc, with labels resolved
    expect(result.vulnerable_items.by_state[0]).toEqual({ state: '1', label: 'Open', count: 6 });
    expect(result.remediation_tasks.total).toBe(2);
    expect(result.top_risk_vulnerable_items).toHaveLength(2);
    expect(qr().mock.calls[0][0].limit).toBe(2);
  });

  it('clamps top to >=1', async () => {
    agg().mockResolvedValue([]);
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemToolCall(mockClient, 'get_usem_dashboard', { top: 0 });
    expect(qr().mock.calls[0][0].limit).toBe(5); // default when Number(0)||5
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

  it('create_remediation_task is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'create_remediation_task', { short_description: 'x' })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('update_remediation_task is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'update_remediation_task', { sys_id: 'a'.repeat(32), state: '3' })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('add_vi_to_remediation_task is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'add_vi_to_remediation_task', { remediation_group: 'g', vulnerable_item: 'v' })
    ).rejects.toThrow('Write operations are disabled');
  });
});

describe('write tools – with WRITE_ENABLED', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('create_remediation_task sends only provided fields', async () => {
    createRec().mockResolvedValue({ sys_id: 'new1' });
    const result = await executeUsemToolCall(mockClient, 'create_remediation_task', {
      short_description: 'Patch openssl',
      assignment_group: 'g1',
      state: '1',
    });
    expect(createRec()).toHaveBeenCalledWith('sn_vul_remediation_task', {
      short_description: 'Patch openssl',
      assignment_group: 'g1',
      state: '1',
    });
    expect(result.summary).toContain('Patch openssl');
  });

  it('create_remediation_task requires short_description', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'create_remediation_task', {})
    ).rejects.toThrow('short_description is required');
  });

  it('update_remediation_task patches provided fields', async () => {
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemToolCall(mockClient, 'update_remediation_task', {
      sys_id: 'a'.repeat(32),
      state: '101',
      assigned_to: 'u9',
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_vul_remediation_task', 'a'.repeat(32), {
      state: '101',
      assigned_to: 'u9',
    });
  });

  it('update_remediation_task requires at least one field', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'update_remediation_task', { sys_id: 'a'.repeat(32) })
    ).rejects.toThrow('At least one field to update is required');
  });

  it('update_remediation_task requires sys_id', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'update_remediation_task', { state: '3' })
    ).rejects.toThrow('sys_id is required');
  });

  it('add_vi_to_remediation_task creates the m2m row', async () => {
    createRec().mockResolvedValue({ sys_id: 'm2m1' });
    const result = await executeUsemToolCall(mockClient, 'add_vi_to_remediation_task', {
      remediation_group: 'grp9',
      vulnerable_item: 'vi9',
    });
    expect(createRec()).toHaveBeenCalledWith('sn_vul_m2m_vul_group_item', {
      sn_vul_vulnerability: 'grp9',
      sn_vul_vulnerable_item: 'vi9',
    });
    expect(result.summary).toContain('vi9');
  });

  it('add_vi_to_remediation_task requires both ids', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'add_vi_to_remediation_task', { remediation_group: 'g' })
    ).rejects.toThrow('remediation_group and vulnerable_item are required');
  });

  it('create_vulnerability_group sends only provided fields', async () => {
    createRec().mockResolvedValue({ sys_id: 'vg1', number: 'VUL0001' });
    const result = await executeUsemToolCall(mockClient, 'create_vulnerability_group', {
      short_description: 'Critical overdue',
      assignment_group: 'g1',
      state: '1',
    });
    expect(createRec()).toHaveBeenCalledWith('sn_vul_vulnerability', {
      short_description: 'Critical overdue',
      assignment_group: 'g1',
      state: '1',
    });
    expect(result.summary).toContain('Critical overdue');
  });

  it('create_vulnerability_group requires short_description', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'create_vulnerability_group', {})
    ).rejects.toThrow('short_description is required');
  });

  it('update_vulnerability_group patches a state transition', async () => {
    updateRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemToolCall(mockClient, 'update_vulnerability_group', {
      sys_id: 'a'.repeat(32),
      state: '2',
      assigned_to: 'u1',
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_vul_vulnerability', 'a'.repeat(32), {
      state: '2',
      assigned_to: 'u1',
    });
  });

  it('update_vulnerability_group requires at least one field', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'update_vulnerability_group', { sys_id: 'a'.repeat(32) })
    ).rejects.toThrow('At least one field to update is required');
  });
});

describe('group write tools – permission gating', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WRITE_ENABLED;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('create_vulnerability_group is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'create_vulnerability_group', { short_description: 'x' })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('update_vulnerability_group is blocked without WRITE_ENABLED', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'update_vulnerability_group', { sys_id: 'a'.repeat(32), state: '2' })
    ).rejects.toThrow('Write operations are disabled');
  });
});
