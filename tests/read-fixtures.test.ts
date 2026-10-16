import { describe, expect, it, vi } from 'vitest';
import type { ServiceNowClient } from '../src/servicenow/client.js';
import { withReadFixture } from './e2e/read-fixtures.js';

const safeOptions = { enabled: true, writeEnabled: true, instanceUrl: 'https://dev123.service-now.com' };
function fakeApi() {
  const rows = new Map<string, Record<string, unknown>>();
  const created: Array<{ table: string; row: Record<string, unknown> }> = [];
  const deleted: string[] = [];
  const api = {
    createRecord: vi.fn(async (table: string, fields: Record<string, unknown>) => {
      if (table === 'sn_grc_indicator' && fields.active !== true) {
        throw new Error('indicator references require an active insert');
      }
      const sys_id = (created.length + 1).toString(16).padStart(32, '0');
      const row: Record<string, unknown> = { ...fields, sys_id };
      // Observed Task rules: explicit state=3 reopens this insert, whereas
      // active=false with the scope state is closed to state=3 by task closer.
      if (table === 'sn_audit_engagement') {
        if (fields.state === '3') row.active = true;
        else if (fields.active === false) row.state = '3';
      }
      created.push({ table, row });
      rows.set(`${table}/${sys_id}`, row);
      return row;
    }),
    getRecord: vi.fn(async (table: string, id: string) => rows.get(`${table}/${id}`) ??
      (table === 'sn_grc_item' ? rows.get(`sn_risk_risk/${id}`) : undefined)),
    updateRecord: vi.fn(async (table: string, id: string, fields: Record<string, unknown>) => {
      const row = rows.get(`${table}/${id}`);
      if (!row) throw new Error('record missing');
      Object.assign(row, fields);
      return row;
    }),
    deleteRecord: vi.fn(async (table: string, id: string) => { deleted.push(`${table}/${id}`); rows.delete(`${table}/${id}`); }),
    queryRecords: vi.fn(async ({ table, query }: { table: string; query: string }) => {
      const row = rows.get(`${table}/${query.replace('sys_id=', '')}`);
      return { records: row ? [row] : [], count: row ? 1 : 0 };
    }),
  };
  return { client: api as unknown as ServiceNowClient, api, rows, created, deleted };
}

describe('read E2E fixtures', () => {
  it('rejects and cleans fixtures whose required relationship was silently dropped by the instance', async () => {
    const db = fakeApi();
    const read = db.api.getRecord.getMockImplementation()!;
    db.api.getRecord.mockImplementation(async (table, id) => {
      const row = await read(table, id);
      return table === 'sn_risk_risk' ? { ...row, profile: '' } : row;
    });
    await expect(withReadFixture(db.client, 'risk', async () => undefined, safeOptions)).rejects.toThrow('sn_risk_risk.profile');
    expect(db.rows.size).toBe(0);
  });
  it('cleans the owned parents when creating a dependent fixture fails', async () => {
    const db = fakeApi();
    const originalCreate = db.api.createRecord.getMockImplementation()!;
    db.api.createRecord.mockImplementation(async (table, fields) => {
      if (table === 'sn_risk_definition') throw new Error('insert rejected');
      return originalCreate(table, fields);
    });
    await expect(withReadFixture(db.client, 'risk', async () => undefined, safeOptions)).rejects.toThrow('insert rejected');
    expect(db.rows.size).toBe(0);
  });

  it('continues cleaning other records and reports both assertion and cleanup failures', async () => {
    const db = fakeApi();
    const originalDelete = db.api.deleteRecord.getMockImplementation()!;
    db.api.deleteRecord.mockImplementation(async (table, id) => {
      if (table === 'sn_risk_risk') throw new Error('delete rejected');
      await originalDelete(table, id);
    });
    const assertion = new Error('verification rejected');
    const error = await withReadFixture(db.client, 'risk', async () => { throw assertion; }, safeOptions).catch(e => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toContain(assertion);
    expect(db.rows.size).toBe(1);
    expect([...db.rows.keys()][0]).toMatch(/^sn_risk_risk\//);
  });
  it('deactivates a manual indicator before verification while retaining its owned references', async () => {
    const db = fakeApi();
    await withReadFixture(db.client, 'indicator', async fixture => {
      const indicator = db.created.find(r => r.table === 'sn_grc_indicator')!.row;
      expect(indicator).toMatchObject({ sys_id: fixture?.sysId, active: false, type: 'manual', category: 'Risk Indicator' });
      expect(db.rows.has(`sn_grc_profile/${indicator.entity}`)).toBe(true);
      expect(db.rows.has(`sn_risk_risk/${indicator.item}`)).toBe(true);
    }, safeOptions);
    expect(db.rows.size).toBe(0);
  });
  it('cleans the graph without verification if deactivation fails', async () => {
    const db = fakeApi();
    const verify = vi.fn();
    db.api.updateRecord.mockRejectedValue(new Error('deactivation rejected'));
    await expect(withReadFixture(db.client, 'indicator', verify, safeOptions)).rejects.toThrow('deactivation rejected');
    expect(verify).not.toHaveBeenCalled();
    expect(db.rows.size).toBe(0);
  });
  it('rejects an indicator that remains active despite a successful PATCH response', async () => {
    const db = fakeApi();
    const verify = vi.fn();
    db.api.updateRecord.mockImplementation(async (table, id) => db.rows.get(`${table}/${id}`)!);
    await expect(withReadFixture(db.client, 'indicator', verify, safeOptions)).rejects.toThrow('sn_grc_indicator.active');
    expect(verify).not.toHaveBeenCalled();
    expect(db.rows.size).toBe(0);
  });
  it('uses exclusively owned references for an inactive draft risk and cleans the graph in reverse', async () => {
    const db = fakeApi();
    await withReadFixture(db.client, 'risk', async fixture => {
      const risk = db.created.find(r => r.table === 'sn_risk_risk')!.row;
      expect(risk).toMatchObject({ sys_id: fixture?.sysId, active: false, state: 'draft' });
      expect(db.rows.has(`sn_risk_definition/${risk.statement}`)).toBe(true);
      expect(db.rows.has(`sn_grc_profile/${risk.profile}`)).toBe(true);
      expect(db.rows.get(`sn_grc_profile/${risk.profile}`)?.active).toBe(true);
      expect(db.rows.get(`sn_risk_definition/${risk.statement}`)?.name).not.toBe(risk.name);
    }, safeOptions);
    expect(db.rows.size).toBe(0);
    expect(db.deleted).toEqual([...db.created].reverse().map(({ table, row }) => `${table}/${row.sys_id}`));
  });
  it('creates only an inactive completed engagement with a bounded audit period', async () => {
    const db = fakeApi();
    await withReadFixture(db.client, 'engagement', async fixture => {
      expect(db.created[0]).toMatchObject({ table: 'sn_audit_engagement', row: {
        name: fixture?.mark, active: false, state: '3', engagement_type: '4',
      } });
      expect(db.created[0].row.audit_period_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(String(db.created[0].row.audit_period_end)).getTime() -
        new Date(String(db.created[0].row.audit_period_start)).getTime()).toBe(86_400_000);
      expect(String(db.created[0].row.work_start)).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
      expect(String(db.created[0].row.work_start) < String(db.created[0].row.work_end)).toBe(true);
    }, safeOptions);
    expect(db.rows.size).toBe(0);
  });
  it.each([
    { field: 'active', value: true },
    { field: 'state', value: '1' },
  ])('rejects a normalized engagement with unsafe $field', async ({ field, value }) => {
    const db = fakeApi();
    const read = db.api.getRecord.getMockImplementation()!;
    db.api.getRecord.mockImplementation(async (table, id) => ({ ...await read(table, id), [field]: value }));
    await expect(withReadFixture(db.client, 'engagement', async () => undefined, safeOptions))
      .rejects.toThrow(`sn_audit_engagement.${field}`);
    expect(db.rows.size).toBe(0);
  });
  it('removes fixtures even when verification throws, preserving the original error', async () => {
    const db = fakeApi();
    const failure = new Error('detail assertion failed');
    await expect(withReadFixture(db.client, 'discovery', async () => { throw failure; }, safeOptions)).rejects.toBe(failure);
    expect(db.rows.size).toBe(0);
  });

  it('fails rather than silently succeeding when deletion leaves a record behind', async () => {
    const db = fakeApi();
    db.api.deleteRecord.mockImplementation(async () => undefined);
    await expect(withReadFixture(db.client, 'discovery', async () => undefined, safeOptions)).rejects.toThrow('Read fixture cleanup failed');
  });

  it('cleans up a record when the instance ignores its safe terminal state', async () => {
    const db = fakeApi();
    db.api.getRecord.mockResolvedValue({ state: 'Starting' });
    await expect(withReadFixture(db.client, 'discovery', async () => undefined, safeOptions)).rejects.toThrow('safety field');
    expect(db.rows.size).toBe(0);
  });

  it('supplies an inactive security incident for a bounded read', async () => {
    const db = fakeApi();
    await withReadFixture(db.client, 'security_incident', async fixture => {
      expect(db.created[0]).toMatchObject({ table: 'sn_si_incident', row: { short_description: fixture?.mark, active: false } });
    }, safeOptions);
    expect(db.rows.size).toBe(0);
  });
  it('provides a terminal discovery row only for the verification and removes it afterwards', async () => {
    const db = fakeApi();
    await withReadFixture(db.client, 'discovery', async fixture => {
      expect(fixture?.query).toBe(`sys_id=${fixture?.sysId}`);
      expect(db.created[0].row).toMatchObject({ state: 'Completed', description: fixture?.mark });
      expect(db.rows.size).toBe(1);
    }, safeOptions);
    expect(db.rows.size).toBe(0);
    expect(db.api.queryRecords).toHaveBeenCalledWith(expect.objectContaining({ table: 'discovery_status', fields: 'sys_id' }));
  });
  it.each([
    { writeEnabled: false, instanceUrl: 'https://dev123.service-now.com' },
    { writeEnabled: true, instanceUrl: 'https://production.service-now.com' },
    { writeEnabled: true, instanceUrl: 'http://dev123.service-now.com' },
    { writeEnabled: true, instanceUrl: 'https://dev123.service-now.com.evil.test' },
  ])('refuses unsafe writes before touching the instance: %j', async options => {
    const createRecord = vi.fn();
    const verify = vi.fn();
    await expect(withReadFixture({ createRecord } as unknown as ServiceNowClient, 'discovery', verify,
      { enabled: true, ...options })).rejects.toThrow(/requires/);
    expect(createRecord).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
  it('leaves the instance untouched when fixture mode is disabled', async () => {
    const createRecord = vi.fn();
    const client = { createRecord } as unknown as ServiceNowClient;
    const result = await withReadFixture(client, 'discovery', async fixture => fixture, {
      enabled: false, writeEnabled: false, instanceUrl: 'https://production.service-now.com',
    });
    expect(result).toBeUndefined();
    expect(createRecord).not.toHaveBeenCalled();
  });
});
