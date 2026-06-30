import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSmartQueryToolDefinitions,
  executeSmartQueryToolCall,
  resolveTableByKeyword,
  buildSmartQueryPlan,
  extractSearchTokens,
} from '../../src/tools/smart-query.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {
  queryRecords: vi.fn(),
} as unknown as ServiceNowClient;

const qr = () => mockClient.queryRecords as ReturnType<typeof vi.fn>;

// Default field set covering task-derived tables.
const TASK_FIELDS = new Set(['priority', 'active', 'assigned_to', 'state', 'short_description']);

/**
 * Wire queryRecords so smart_query's client-backed lookups resolve:
 *  - sys_db_object name=<table>          → the table itself (super_class empty)
 *  - sys_dictionary nameIN...            → the provided element list
 *  - any other table (the final query)   → records payload
 */
function wireClient(opts: { table: string; fields: string[]; queryResult?: any }) {
  qr().mockImplementation(async (params: any) => {
    if (params.table === 'sys_db_object') {
      if (params.query.startsWith('name=')) {
        return { count: 1, records: [{ name: opts.table, super_class: '' }] };
      }
      return { count: 0, records: [] };
    }
    if (params.table === 'sys_dictionary') {
      return { count: opts.fields.length, records: opts.fields.map(element => ({ element })) };
    }
    return opts.queryResult ?? { count: 0, records: [] };
  });
}

describe('getSmartQueryToolDefinitions', () => {
  it('returns a single smart_query tool requiring description', () => {
    const defs = getSmartQueryToolDefinitions();
    expect(defs.length).toBe(1);
    expect(defs[0].name).toBe('smart_query');
    expect(defs[0].inputSchema.required).toContain('description');
  });
});

describe('resolveTableByKeyword', () => {
  it('maps incident keywords', () => {
    expect(resolveTableByKeyword('open incidents').table).toBe('incident');
    expect(resolveTableByKeyword('未解決のインシデント').table).toBe('incident');
  });

  it('prefers "change request" over the bare "request"', () => {
    expect(resolveTableByKeyword('this week change requests').table).toBe('change_request');
  });

  it('maps vulnerable items and users', () => {
    expect(resolveTableByKeyword('critical vulnerable items').table).toBe('sn_vul_vulnerable_item');
    expect(resolveTableByKeyword('list active users').table).toBe('sys_user');
  });

  it('returns no table when nothing matches', () => {
    const r = resolveTableByKeyword('something completely unrelated zzz');
    expect(r.table).toBeUndefined();
    expect(r.candidates).toEqual([]);
  });
});

describe('buildSmartQueryPlan', () => {
  it('infers priority from P1 and from critical', () => {
    expect(buildSmartQueryPlan('P1 incidents', TASK_FIELDS).encoded_query).toBe('priority=1');
    expect(buildSmartQueryPlan('critical tickets', TASK_FIELDS).encoded_query).toBe('priority=1');
    expect(buildSmartQueryPlan('優先度2の障害', TASK_FIELDS).encoded_query).toBe('priority=2');
  });

  it('infers open vs closed via the active flag', () => {
    expect(buildSmartQueryPlan('open items', TASK_FIELDS).encoded_query).toBe('active=true');
    expect(buildSmartQueryPlan('active users', TASK_FIELDS).encoded_query).toBe('active=true');
    expect(buildSmartQueryPlan('resolved items', TASK_FIELDS).encoded_query).toBe('active=false');
    expect(buildSmartQueryPlan('未解決', TASK_FIELDS).encoded_query).toBe('active=true');
  });

  it('does not treat "inactive" as active=true', () => {
    // "closed/resolved" not present, and \bactive\b must not fire inside "inactive"
    expect(buildSmartQueryPlan('inactive users', TASK_FIELDS).encoded_query).toBe('');
  });

  it('infers assignment conditions', () => {
    expect(buildSmartQueryPlan('assigned to me', TASK_FIELDS).encoded_query).toBe(
      'assigned_to=javascript:gs.getUserID()'
    );
    expect(buildSmartQueryPlan('unassigned tickets', TASK_FIELDS).encoded_query).toBe('assigned_toISEMPTY');
  });

  it('infers time windows on sys_created_on', () => {
    expect(buildSmartQueryPlan('created today', TASK_FIELDS).encoded_query).toBe(
      'sys_created_on>=javascript:gs.beginningOfToday()'
    );
    expect(buildSmartQueryPlan('last month', TASK_FIELDS).encoded_query).toBe(
      'sys_created_on>=javascript:gs.beginningOfLastMonth()^sys_created_on<=javascript:gs.endOfLastMonth()'
    );
    expect(buildSmartQueryPlan('先月', TASK_FIELDS).encoded_query).toBe(
      'sys_created_on>=javascript:gs.beginningOfLastMonth()^sys_created_on<=javascript:gs.endOfLastMonth()'
    );
  });

  it('approximates week windows with the allowlisted daysAgo function', () => {
    expect(buildSmartQueryPlan('opened this week', TASK_FIELDS).encoded_query).toBe(
      'sys_created_on>=javascript:gs.daysAgo(7)'
    );
    expect(buildSmartQueryPlan('先週', TASK_FIELDS).encoded_query).toBe(
      'sys_created_on>=javascript:gs.daysAgo(14)^sys_created_on<=javascript:gs.daysAgo(7)'
    );
  });

  it('parses "last N days" with a clamped integer (injection-safe)', () => {
    expect(buildSmartQueryPlan('last 30 days', TASK_FIELDS).encoded_query).toBe(
      'sys_created_on>=javascript:gs.daysAgo(30)'
    );
    expect(buildSmartQueryPlan('過去7日', TASK_FIELDS).encoded_query).toBe(
      'sys_created_on>=javascript:gs.daysAgo(7)'
    );
  });

  it('switches to sys_updated_on when "updated" is mentioned', () => {
    expect(buildSmartQueryPlan('updated today', TASK_FIELDS).encoded_query).toBe(
      'sys_updated_on>=javascript:gs.beginningOfToday()'
    );
  });

  it('combines multiple conditions with ^', () => {
    const plan = buildSmartQueryPlan('open P1 incidents from last month', TASK_FIELDS);
    expect(plan.encoded_query).toBe(
      'priority=1^active=true^sys_created_on>=javascript:gs.beginningOfLastMonth()^sys_created_on<=javascript:gs.endOfLastMonth()'
    );
    expect(plan.conditions).toHaveLength(3);
  });

  it('drops conditions whose field is absent and reports them in unmatched', () => {
    const plan = buildSmartQueryPlan('P1 assigned to me', new Set(['active'])); // no priority/assigned_to
    expect(plan.encoded_query).toBe('');
    expect(plan.unmatched).toContain('priority=1');
    expect(plan.unmatched).toContain('assigned to me');
  });
});

describe('extractSearchTokens', () => {
  it('extracts ASCII words of length >= 5', () => {
    expect(extractSearchTokens('open the asset records')).toEqual(['asset', 'records']);
  });

  it('extracts Japanese kanji/katakana tokens (the bug fix)', () => {
    // A plain split on [^A-Za-z0-9_]+ would drop all of these.
    expect(extractSearchTokens('勤怠管理の申請')).toEqual(['勤怠管理', '申請']);
    expect(extractSearchTokens('ワークフローの設定')).toEqual(['ワークフロー', '設定']);
  });

  it('does not glue hiragana inflection onto kanji compounds', () => {
    expect(extractSearchTokens('申請して承認')).toEqual(['申請', '承認']);
  });

  it('caps the token list at 5', () => {
    expect(extractSearchTokens('alpha bravo charlie delta echo foxtrot golf').length).toBe(5);
  });
});

describe('executeSmartQueryToolCall', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null for an unrelated tool name', async () => {
    expect(await executeSmartQueryToolCall(mockClient, 'other', { description: 'x' })).toBeNull();
  });

  it('requires a non-empty description', async () => {
    await expect(
      executeSmartQueryToolCall(mockClient, 'smart_query', { description: '   ' })
    ).rejects.toThrow('description');
  });

  it('resolves the table by keyword, builds the query, and executes it', async () => {
    wireClient({
      table: 'incident',
      fields: ['priority', 'active'],
      queryResult: { count: 2, records: [{ number: 'INC1' }, { number: 'INC2' }] },
    });
    const result = await executeSmartQueryToolCall(mockClient, 'smart_query', {
      description: 'open P1 incidents',
    });
    expect(result.table).toBe('incident');
    expect(result.table_resolution).toBe('keyword');
    expect(result.encoded_query).toBe('priority=1^active=true');
    expect(result.executed).toBe(true);
    expect(result.count).toBe(2);
    // The final executed call uses the resolved table + encoded query.
    const finalCall = qr().mock.calls.find(c => c[0].table === 'incident');
    expect(finalCall[0].query).toBe('priority=1^active=true');
  });

  it('honors execute=false (preview only — no query against the data table)', async () => {
    wireClient({ table: 'incident', fields: ['priority', 'active'] });
    const result = await executeSmartQueryToolCall(mockClient, 'smart_query', {
      description: 'open incidents',
      execute: false,
    });
    expect(result.executed).toBe(false);
    expect(result.encoded_query).toBe('active=true');
    // Only metadata lookups happened; no call against the incident table.
    expect(qr().mock.calls.some(c => c[0].table === 'incident')).toBe(false);
  });

  it('honors an explicit table hint over keyword resolution', async () => {
    wireClient({ table: 'sn_vul_vulnerable_item', fields: ['active'], queryResult: { count: 0, records: [] } });
    const result = await executeSmartQueryToolCall(mockClient, 'smart_query', {
      description: 'open ones',
      table: 'sn_vul_vulnerable_item',
    });
    expect(result.table).toBe('sn_vul_vulnerable_item');
    expect(result.table_resolution).toBe('hint');
  });

  it('falls back to a sys_db_object label search for Japanese custom-table text', async () => {
    // Keyword map misses "勤怠管理の申請"; the label search must still find a token.
    qr().mockImplementation(async (params: any) => {
      if (params.table === 'sys_db_object') {
        if (params.query.startsWith('labelLIKE勤怠管理')) {
          return { count: 1, records: [{ name: 'u_kintai_request', label: '勤怠管理申請' }] };
        }
        if (params.query === 'name=u_kintai_request') {
          return { count: 1, records: [{ name: 'u_kintai_request', super_class: '' }] };
        }
        return { count: 0, records: [] };
      }
      if (params.table === 'sys_dictionary') return { count: 1, records: [{ element: 'active' }] };
      return { count: 3, records: [{ number: 'X1' }] };
    });
    const result = await executeSmartQueryToolCall(mockClient, 'smart_query', {
      description: '勤怠管理の申請',
    });
    expect(result.table).toBe('u_kintai_request');
    expect(result.table_resolution).toBe('sys_db_object');
    expect(result.executed).toBe(true);
  });

  it('throws when no table can be resolved', async () => {
    await expect(
      executeSmartQueryToolCall(mockClient, 'smart_query', { description: 'zzz nothing here zzz' })
    ).rejects.toThrow('Could not resolve a table');
  });

  it('clamps limit to the 1..1000 range', async () => {
    wireClient({ table: 'incident', fields: ['active'], queryResult: { count: 0, records: [] } });
    await executeSmartQueryToolCall(mockClient, 'smart_query', {
      description: 'open incidents',
      limit: 99999,
    });
    const finalCall = qr().mock.calls.find(c => c[0].table === 'incident');
    expect(finalCall[0].limit).toBe(1000);
  });
});
