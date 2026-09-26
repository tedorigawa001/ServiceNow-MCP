import { it, expect } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeSmartQueryToolCall } from '../../src/tools/smart-query.js';
import { executeCoreToolCall } from '../../src/tools/core.js';

e2eDescribe('E2E – smart query (read-only)', () => {
  it('resolves Japanese incident intent using inherited task fields', async () => {
    const plan = await executeSmartQueryToolCall(getE2EClient(), 'smart_query', {
      description: '未解決 優先度1 未割当 インシデント', execute: false,
    });
    expect(plan.table).toBe('incident');
    expect(plan.inheritance_chain).toContain('task');
    expect(plan.encoded_query).toBe('priority=1^active=true^assigned_toISEMPTY');
    expect(plan.unmatched_intents).toEqual([]);
    expect(plan.executed).toBe(false);
    expect(plan).not.toHaveProperty('records');
  });

  it('executes an incident search whose returned records agree with query_records', async ctx => {
    const client = getE2EClient();
    const result = await executeSmartQueryToolCall(client, 'smart_query', {
      description: 'open incidents', limit: 5,
    });
    expect(result.executed).toBe(true);
    expect(result.encoded_query).toBe('active=true');
    expect(Array.isArray(result.records)).toBe(true);
    expect(result.records.length).toBeLessThanOrEqual(5);
    ctx.skip(result.records.length === 0, 'no visible active incident to compare');
    const ids = result.records.map((r: { sys_id: string }) => r.sys_id).sort();
    const direct = await executeCoreToolCall(client, 'query_records', {
      table: 'incident', query: `active=true^sys_idIN${ids.join(',')}`,
      fields: 'sys_id,active', limit: 5,
    });
    expect(direct.records.map((r: { sys_id: string }) => r.sys_id).sort()).toEqual(ids);
  });

  it('reports an unsupported priority intent instead of querying a nonexistent field', async () => {
    const result = await executeSmartQueryToolCall(getE2EClient(), 'smart_query', {
      description: 'P1 locations', table: 'cmn_location', execute: false,
    });
    expect(result.table_resolution).toBe('hint');
    expect(result.encoded_query).toBe('');
    expect(result.unmatched_intents).toContain('priority=1');
    expect(result.executed).toBe(false);
  });
});
