import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findOneByNumber } from '../../src/utils/record-lookup.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const queryRecords = vi.fn();
const client = { queryRecords } as unknown as ServiceNowClient;
const page = (records: Record<string, unknown>[]) => ({ count: records.length, records });

beforeEach(() => queryRecords.mockReset());

describe('findOneByNumber', () => {
  it('returns the record when the number is unique, asking for two to detect duplicates', async () => {
    queryRecords.mockResolvedValueOnce(page([{ sys_id: 'a'.repeat(32), number: 'VIT0010001' }]));
    const r = await findOneByNumber(client, { table: 'sn_vul_vulnerable_item', value: 'VIT0010001', label: 'Vulnerable Item' });
    expect(r).toMatchObject({ number: 'VIT0010001' });
    expect(queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'sn_vul_vulnerable_item', query: 'number=VIT0010001', limit: 2 }));
  });

  it('returns null when nothing matches', async () => {
    queryRecords.mockResolvedValueOnce(page([]));
    await expect(findOneByNumber(client, { table: 't', value: 'X1', label: 'Thing' })).resolves.toBeNull();
  });

  it('fails with AMBIGUOUS_NUMBER and lists the candidates newest first when the number is reused', async () => {
    queryRecords
      .mockResolvedValueOnce(page([{ sys_id: '1' }, { sys_id: '2' }]))
      .mockResolvedValueOnce(page([
        { sys_id: 'b'.repeat(32), sys_created_on: '2026-10-14 11:44:42', short_description: 'CVE-2019-1113 detected on ApplicationServerHelpdesk' },
        { sys_id: 'c'.repeat(32), sys_created_on: '2023-01-22 05:29:01', short_description: '' },
        { sys_id: 'd'.repeat(32), sys_created_on: '2022-06-19 06:05:47', short_description: 'CVE-2013-0108 detected on CRMBK-SD-4210' },
      ]));
    const error = await findOneByNumber(client, { table: 'sn_vul_vulnerable_item', value: 'VIT0010001', label: 'Vulnerable Item' }).catch((e) => e);
    expect(error).toMatchObject({ code: 'AMBIGUOUS_NUMBER' });
    expect(error.message).toContain('Vulnerable Item number VIT0010001 is not unique on this instance (3 records). Pass the sys_id instead.');
    expect(error.message.indexOf('b'.repeat(32))).toBeLessThan(error.message.indexOf('d'.repeat(32)));
    expect(queryRecords.mock.calls[1][0]).toMatchObject({ query: 'number=VIT0010001^ORDERBYDESCsys_created_on', limit: 10 });
  });

  it('honours a different number column and neutralises query operators in the value', async () => {
    queryRecords.mockResolvedValueOnce(page([{ sys_id: 'e'.repeat(32) }]));
    await findOneByNumber(client, { table: 'sn_vul_remediation_task', numberField: 'task_number', value: 'RT1^ORactive=true', label: 'Remediation Task' });
    const { query } = queryRecords.mock.calls[0][0];
    expect(query.startsWith('task_number=RT1')).toBe(true);
    expect(query).not.toContain('^ORactive=true');
  });
});
