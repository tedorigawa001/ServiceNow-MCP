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
  it('returns 17 tool definitions', () => {
    expect(getUsemToolDefinitions().length).toBe(17);
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
        'create_vulnerable_item',
        'get_finding_grouping_status',
        'list_remediation_task_findings',
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

  it('sanitizes literal filter values without changing raw encoded query opt-in', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemToolCall(mockClient, 'list_vulnerable_items', {
      state: '1^ORactive=false',
      cmdb_ci: 'ci123^ORsys_idISNOTEMPTY',
      assignment_group: 'grp1^ORactive=false',
      query: 'active=true',
    });
    expect(qr().mock.calls[0][0].query).toBe(
      'state=1ORactive=false^cmdb_ci=ci123ORsys_idISNOTEMPTY^assignment_group=grp1ORactive=false^active=true'
    );
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

  it('sanitizes query-breaking characters in VI number lookups', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'get_vulnerable_item', {
        number_or_sysid: 'VIT0010003^ORsys_idISNOTEMPTY',
      })
    ).rejects.toThrow('Vulnerable Item not found');
    expect(qr().mock.calls[0][0].query).not.toContain('^');
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

  it('queries BOTH backing tables with the same filters and merges with source_table', async () => {
    qr().mockImplementation(async (params: any) =>
      params.table === 'sn_vul_remediation_task'
        ? { count: 1, records: [{ task_number: 'RTASK1', risk_score: '50' }] }
        : { count: 2, records: [{ number: 'VUL1', risk_score: '90' }, { number: 'VUL2', risk_score: '10' }] }
    );
    const result = await executeUsemToolCall(mockClient, 'list_remediation_tasks', {
      state: '10',
      assignment_group: 'g1',
      assigned_to: 'u1',
    });
    const tables = qr().mock.calls.map((c: any) => c[0].table).sort();
    expect(tables).toEqual(['sn_vul_remediation_task', 'sn_vul_vulnerability']);
    for (const call of qr().mock.calls) {
      expect(call[0].query).toBe('state=10^assignment_group=g1^assigned_to=u1');
    }
    expect(result.count).toBe(3);
    expect(result.by_table).toEqual({ sn_vul_remediation_task: 1, sn_vul_vulnerability: 2 });
    // globally re-sorted by risk_score desc, not concatenated per table
    expect(result.records.map((r: any) => r.source_table)).toEqual([
      'sn_vul_vulnerability',
      'sn_vul_remediation_task',
      'sn_vul_vulnerability',
    ]);
  });

  it('re-applies the limit after merging and sorts across tables', async () => {
    qr().mockImplementation(async (params: any) =>
      params.table === 'sn_vul_remediation_task'
        ? { count: 2, records: [{ task_number: 'RT1', risk_score: '40' }, { task_number: 'RT2', risk_score: '20' }] }
        : { count: 2, records: [{ number: 'VUL1', risk_score: '95' }, { number: 'VUL2', risk_score: '60' }] }
    );
    const result = await executeUsemToolCall(mockClient, 'list_remediation_tasks', { limit: 2 });
    expect(result.count).toBe(2);
    expect(result.records.map((r: any) => r.number ?? r.task_number)).toEqual(['VUL1', 'VUL2']);
    // per-table match counts still report the full picture
    expect(result.by_table).toEqual({ sn_vul_remediation_task: 2, sn_vul_vulnerability: 2 });
  });

  it('sorts display_value:"all" risk scores ({value} objects) correctly', async () => {
    qr().mockImplementation(async (params: any) =>
      params.table === 'sn_vul_remediation_task'
        ? { count: 1, records: [{ task_number: 'RT1', risk_score: { value: '30' } }] }
        : { count: 1, records: [{ number: 'VUL1', risk_score: { value: '80' } }] }
    );
    const result = await executeUsemToolCall(mockClient, 'list_remediation_tasks', { display_value: 'all' });
    expect(result.records[0].number).toBe('VUL1');
  });

  it('sanitizes literal filters before querying both remediation-task tables', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemToolCall(mockClient, 'list_remediation_tasks', {
      state: '10^ORactive=false',
      assignment_group: 'g1^ORsys_idISNOTEMPTY',
      assigned_to: 'u1^ORactive=false',
    });
    for (const call of qr().mock.calls) {
      expect(call[0].query).toBe('state=10ORactive=false^assignment_group=g1ORsys_idISNOTEMPTY^assigned_to=u1ORactive=false');
    }
  });
});

describe('get_remediation_task', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches by sys_id when a 32-char hex id is given', async () => {
    getRec().mockResolvedValue({ sys_id: 'a'.repeat(32) });
    await executeUsemToolCall(mockClient, 'get_remediation_task', { number_or_sysid: 'a'.repeat(32) });
    expect(getRec()).toHaveBeenCalledWith('sn_vul_remediation_task', 'a'.repeat(32));
  });

  it('falls back to sn_vul_vulnerability only on NOT_FOUND', async () => {
    const { ServiceNowError } = await import('../../src/utils/errors.js');
    getRec()
      .mockRejectedValueOnce(new ServiceNowError('Record not found', 'NOT_FOUND'))
      .mockResolvedValueOnce({ sys_id: 'a'.repeat(32), number: 'VUL0010007' });
    const result = await executeUsemToolCall(mockClient, 'get_remediation_task', {
      number_or_sysid: 'a'.repeat(32),
    });
    expect(getRec()).toHaveBeenNthCalledWith(1, 'sn_vul_remediation_task', 'a'.repeat(32));
    expect(getRec()).toHaveBeenNthCalledWith(2, 'sn_vul_vulnerability', 'a'.repeat(32));
    expect(result.source_table).toBe('sn_vul_vulnerability');
  });

  it('rethrows non-NOT_FOUND errors from the first table instead of falling back', async () => {
    const { ServiceNowError } = await import('../../src/utils/errors.js');
    getRec().mockRejectedValueOnce(new ServiceNowError('Access denied', 'AUTHENTICATION_FAILED'));
    await expect(
      executeUsemToolCall(mockClient, 'get_remediation_task', { number_or_sysid: 'a'.repeat(32) })
    ).rejects.toThrow('Access denied');
    expect(getRec()).toHaveBeenCalledTimes(1);
  });

  it('resolves by task_number when not a sys_id', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ task_number: 'RTASK0001' }] });
    const result = await executeUsemToolCall(mockClient, 'get_remediation_task', { number_or_sysid: 'RTASK0001' });
    expect(qr().mock.calls[0][0].table).toBe('sn_vul_remediation_task');
    expect(qr().mock.calls[0][0].query).toBe('task_number=RTASK0001');
    expect(result.source_table).toBe('sn_vul_remediation_task');
  });

  it('targets sn_vul_vulnerability directly for VUL-prefixed numbers', async () => {
    qr().mockResolvedValue({ count: 1, records: [{ number: 'VUL0010007' }] });
    const result = await executeUsemToolCall(mockClient, 'get_remediation_task', { number_or_sysid: 'VUL0010007' });
    expect(qr()).toHaveBeenCalledTimes(1);
    expect(qr().mock.calls[0][0].table).toBe('sn_vul_vulnerability');
    expect(qr().mock.calls[0][0].query).toBe('number=VUL0010007');
    expect(result.source_table).toBe('sn_vul_vulnerability');
  });

  it('tries sn_vul_vulnerability second for non-VUL numbers', async () => {
    qr()
      .mockResolvedValueOnce({ count: 0, records: [] })
      .mockResolvedValueOnce({ count: 1, records: [{ number: 'XYZ1' }] });
    const result = await executeUsemToolCall(mockClient, 'get_remediation_task', { number_or_sysid: 'XYZ1' });
    expect(qr().mock.calls[1][0].table).toBe('sn_vul_vulnerability');
    expect(result.source_table).toBe('sn_vul_vulnerability');
  });

  it('throws NOT_FOUND when neither table matches', async () => {
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

  it('sanitizes query-breaking characters in group number lookups', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'get_vulnerability_group', {
        number_or_sysid: 'VUL0000103^ORsys_idISNOTEMPTY',
      })
    ).rejects.toThrow('Vulnerability Group not found');
    expect(qr().mock.calls[0][0].query).not.toContain('^');
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

  it('sanitizes query-breaking characters in CVE filters and exact lookup', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await executeUsemToolCall(mockClient, 'list_nvd_entries', {
      cve: 'CVE-2018^ORidISNOTEMPTY',
      score_min: 7,
    });
    expect(qr().mock.calls[0][0].query).toBe('idLIKECVE-2018ORidISNOTEMPTY^v3_base_score>=7');

    await expect(
      executeUsemToolCall(mockClient, 'get_nvd_entry_by_cve', {
        cve: 'CVE-2018-1002203^ORidISNOTEMPTY',
      })
    ).rejects.toThrow('NVD entry not found');
    expect(qr().mock.calls[1][0].query).toBe('id=CVE-2018-1002203ORidISNOTEMPTY');
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

  it('update_vulnerability_group requires sys_id', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'update_vulnerability_group', { state: '2' })
    ).rejects.toThrow('sys_id is required');
  });
});

describe('create_vulnerable_item', () => {
  const ORIGINAL = process.env.WRITE_ENABLED;
  const VUL_ID = 'b'.repeat(32);
  const CI_ID = 'c'.repeat(32);
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WRITE_ENABLED = 'true';
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.WRITE_ENABLED;
    else process.env.WRITE_ENABLED = ORIGINAL;
  });

  it('is blocked without WRITE_ENABLED', async () => {
    delete process.env.WRITE_ENABLED;
    await expect(
      executeUsemToolCall(mockClient, 'create_vulnerable_item', { vulnerability: VUL_ID, cmdb_ci: CI_ID })
    ).rejects.toThrow('Write operations are disabled');
  });

  it('requires vulnerability and cmdb_ci', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'create_vulnerable_item', { vulnerability: VUL_ID })
    ).rejects.toThrow('vulnerability and cmdb_ci are required');
  });

  it('rejects non-sys_id references', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'create_vulnerable_item', { vulnerability: 'CVE-2018-1', cmdb_ci: CI_ID })
    ).rejects.toThrow('must be 32-char sys_ids');
  });

  it('returns without PATCH when the insert keeps the vulnerability reference', async () => {
    createRec().mockResolvedValue({
      sys_id: 'vi1'.padEnd(32, '0'),
      number: 'VIT0010042',
      vulnerability: { value: VUL_ID, link: 'x' },
    });
    const result = await executeUsemToolCall(mockClient, 'create_vulnerable_item', {
      vulnerability: VUL_ID,
      cmdb_ci: CI_ID,
      short_description: 'test VI',
    });
    expect(createRec()).toHaveBeenCalledWith('sn_vul_vulnerable_item', {
      vulnerability: VUL_ID,
      cmdb_ci: CI_ID,
      short_description: 'test VI',
    });
    expect(updateRec()).not.toHaveBeenCalled();
    expect(result.vulnerability_set).toBe(true);
    expect(result.vulnerability_restored_via_patch).toBe(false);
  });

  it('re-applies the vulnerability via PATCH when the insert BR clears it', async () => {
    const sysId = 'd'.repeat(32);
    createRec().mockResolvedValue({ sys_id: sysId, number: 'VIT0010043', vulnerability: '' });
    updateRec().mockResolvedValue({
      sys_id: sysId,
      number: 'VIT0010043',
      vulnerability: { value: VUL_ID, link: 'x' },
    });
    const result = await executeUsemToolCall(mockClient, 'create_vulnerable_item', {
      vulnerability: VUL_ID,
      cmdb_ci: CI_ID,
    });
    expect(updateRec()).toHaveBeenCalledWith('sn_vul_vulnerable_item', sysId, { vulnerability: VUL_ID });
    expect(result.vulnerability_set).toBe(true);
    expect(result.vulnerability_restored_via_patch).toBe(true);
    expect(result.summary).toContain('re-applied via PATCH');
  });

  it('warns when the reference is cleared again after the PATCH', async () => {
    const sysId = 'e'.repeat(32);
    createRec().mockResolvedValue({ sys_id: sysId, number: 'VIT0010044', vulnerability: '' });
    updateRec().mockResolvedValue({ sys_id: sysId, number: 'VIT0010044', vulnerability: '' });
    const result = await executeUsemToolCall(mockClient, 'create_vulnerable_item', {
      vulnerability: VUL_ID,
      cmdb_ci: CI_ID,
    });
    expect(result.vulnerability_set).toBe(false);
    expect(result.warning).toContain('could not be re-applied');
  });
});

describe('list_remediation_task_findings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires exactly one of remediation_task / vulnerable_item', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'list_remediation_task_findings', {})
    ).rejects.toThrow('exactly one');
    await expect(
      executeUsemToolCall(mockClient, 'list_remediation_task_findings', {
        remediation_task: 'a'.repeat(32),
        vulnerable_item: 'b'.repeat(32),
      })
    ).rejects.toThrow('exactly one');
  });

  it('lists VIs of a remediation task by sys_id', async () => {
    const rtId = 'a'.repeat(32);
    qr().mockResolvedValue({ count: 2, records: [{}, {}] });
    const result = await executeUsemToolCall(mockClient, 'list_remediation_task_findings', {
      remediation_task: rtId,
    });
    const call = qr().mock.calls[0][0];
    expect(call.table).toBe('sn_vul_m2m_vul_group_item');
    expect(call.query).toBe(`sn_vul_vulnerability=${rtId}`);
    expect(result.direction).toBe('remediation_task_to_vulnerable_items');
    expect(result.count).toBe(2);
  });

  it('resolves a VUL number before querying the m2m', async () => {
    const rtId = 'f'.repeat(32);
    qr()
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: rtId }] })
      .mockResolvedValueOnce({ count: 1, records: [{}] });
    await executeUsemToolCall(mockClient, 'list_remediation_task_findings', {
      remediation_task: 'VUL0010007',
    });
    expect(qr().mock.calls[0][0].table).toBe('sn_vul_vulnerability');
    expect(qr().mock.calls[0][0].query).toBe('number=VUL0010007');
    expect(qr().mock.calls[1][0].query).toBe(`sn_vul_vulnerability=${rtId}`);
  });

  it('lists remediation tasks of a VI, resolving the VIT number', async () => {
    const viId = '1'.repeat(32);
    qr()
      .mockResolvedValueOnce({ count: 1, records: [{ sys_id: viId }] })
      .mockResolvedValueOnce({ count: 1, records: [{}] });
    const result = await executeUsemToolCall(mockClient, 'list_remediation_task_findings', {
      vulnerable_item: 'VIT0010003',
    });
    expect(qr().mock.calls[0][0].table).toBe('sn_vul_vulnerable_item');
    expect(qr().mock.calls[1][0].table).toBe('sn_vul_m2m_vul_group_item');
    expect(qr().mock.calls[1][0].query).toBe(`sn_vul_vulnerable_item=${viId}`);
    expect(result.direction).toBe('vulnerable_item_to_remediation_tasks');
  });

  it('throws NOT_FOUND when the number does not resolve', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'list_remediation_task_findings', { remediation_task: 'VUL9999999' })
    ).rejects.toThrow('Remediation Task not found');
  });

  it('sanitizes query-breaking characters in number lookups', async () => {
    qr().mockResolvedValue({ count: 0, records: [] });
    await expect(
      executeUsemToolCall(mockClient, 'list_remediation_task_findings', {
        remediation_task: 'VUL1^sys_idISNOTEMPTY',
      })
    ).rejects.toThrow('not found');
    expect(qr().mock.calls[0][0].query).not.toContain('^');
  });
});

describe('get_finding_grouping_status', () => {
  const VI_ID = '9'.repeat(32);

  const mockStatusQueries = (opts: {
    vi: Record<string, any>;
    links?: any[];
    rules?: any[];
  }) => {
    qr().mockImplementation(async (params: any) => {
      if (params.table === 'sn_vul_vulnerable_item') {
        return { count: 1, records: [opts.vi] };
      }
      if (params.table === 'sn_vul_m2m_vul_group_item') {
        return { count: (opts.links ?? []).length, records: opts.links ?? [] };
      }
      if (params.table === 'sn_sec_rem_task_rule') {
        return { count: (opts.rules ?? []).length, records: opts.rules ?? [] };
      }
      throw new Error(`unexpected table ${params.table}`);
    });
  };

  beforeEach(() => vi.clearAllMocks());

  it('requires vulnerable_item', async () => {
    await expect(
      executeUsemToolCall(mockClient, 'get_finding_grouping_status', {})
    ).rejects.toThrow('vulnerable_item is required');
  });

  it('reports grouped when m2m links exist', async () => {
    mockStatusQueries({
      vi: {
        number: { value: 'VIT0005765' },
        vulnerability: { value: 'vul1' },
        cmdb_ci: { value: 'ci1' },
        is_in_group: { value: 'true' },
      },
      links: [
        { 'sn_vul_vulnerability.number': { value: 'VUL0010007' }, 'sn_vul_vulnerability.auto_vi_refresh': { value: 'true' } },
      ],
      rules: [{ rule_name: 'r1' }],
    });
    const result = await executeUsemToolCall(mockClient, 'get_finding_grouping_status', { vulnerable_item: VI_ID });
    expect(result.status).toBe('grouped');
    expect(result.checks).toEqual({ vulnerability_set: true, cmdb_ci_set: true, is_in_group: true });
    expect(result.linked_remediation_tasks).toHaveLength(1);
  });

  it('flags the cleared vulnerability reference first', async () => {
    mockStatusQueries({
      vi: {
        number: { value: 'VIT0010009' },
        vulnerability: { value: '' },
        cmdb_ci: { value: 'ci1' },
        is_in_group: { value: 'false' },
      },
      rules: [{ rule_name: 'r1' }],
    });
    const result = await executeUsemToolCall(mockClient, 'get_finding_grouping_status', { vulnerable_item: VI_ID });
    expect(result.status).toBe('blocked_no_vulnerability');
    expect(result.diagnosis[0]).toContain('vulnerability');
    expect(result.diagnosis[0]).toContain('create_vulnerable_item');
  });

  it('reports missing active rules', async () => {
    mockStatusQueries({
      vi: {
        number: { value: 'VIT1' },
        vulnerability: { value: 'vul1' },
        cmdb_ci: { value: 'ci1' },
        is_in_group: { value: 'false' },
      },
      rules: [],
    });
    const result = await executeUsemToolCall(mockClient, 'get_finding_grouping_status', { vulnerable_item: VI_ID });
    expect(result.status).toBe('blocked_no_active_rules');
  });

  it('falls through to rule-mismatch/not-triggered with auto_vi_refresh guidance', async () => {
    mockStatusQueries({
      vi: {
        number: { value: 'VIT1' },
        vulnerability: { value: 'vul1' },
        cmdb_ci: { value: 'ci1' },
        is_in_group: { value: 'false' },
      },
      rules: [{ rule_name: 'r1', condition: 'x' }],
    });
    const result = await executeUsemToolCall(mockClient, 'get_finding_grouping_status', { vulnerable_item: VI_ID });
    expect(result.status).toBe('not_grouped_rule_mismatch_or_not_triggered');
    expect(result.diagnosis[0]).toContain('auto_vi_refresh');
  });

  it('resolves a VIT number before diagnosing', async () => {
    qr().mockImplementation(async (params: any) => {
      if (params.table === 'sn_vul_vulnerable_item' && params.query === 'number=VIT0005765') {
        return { count: 1, records: [{ sys_id: VI_ID }] };
      }
      if (params.table === 'sn_vul_vulnerable_item') {
        return {
          count: 1,
          records: [{ number: { value: 'VIT0005765' }, vulnerability: { value: 'v' }, cmdb_ci: { value: 'c' }, is_in_group: { value: 'true' } }],
        };
      }
      return { count: 0, records: [] };
    });
    const result = await executeUsemToolCall(mockClient, 'get_finding_grouping_status', { vulnerable_item: 'VIT0005765' });
    // resolver hit first, then the diagnosis ran with no links and no active rules
    expect(result.status).toBe('blocked_no_active_rules');
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
