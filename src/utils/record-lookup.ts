import { sanitizeLikeValue, type ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from './errors.js';

/**
 * Find the single record whose number column equals `value`.
 *
 * Record numbers are not guaranteed unique: when an instance's number counter
 * is reset or demo data is loaded, new records are issued numbers that already
 * exist (seen on a PDI, where three Vulnerable Items shared VIT0010001). Taking
 * the first match then silently returns a different record. This fetches up to
 * two matches and fails with AMBIGUOUS_NUMBER, listing the candidates, when the
 * number is not unique, so the caller can retry with a sys_id.
 *
 * Returns null when nothing matches.
 */
export async function findOneByNumber(
  client: ServiceNowClient,
  params: { table: string; value: string; label: string; numberField?: string; fields?: string; display_value?: boolean | 'all' },
): Promise<Record<string, any> | null> {
  const numberField = params.numberField ?? 'number';
  const query = `${numberField}=${sanitizeLikeValue(String(params.value))}`;
  const resp = await client.queryRecords({ table: params.table, query, fields: params.fields, display_value: params.display_value, limit: 2 });
  if (resp.records.length === 0) return null;
  if (resp.records.length === 1) return resp.records[0] as Record<string, any>;

  const candidates = await client.queryRecords({
    table: params.table,
    query: `${query}^ORDERBYDESCsys_created_on`,
    fields: 'sys_id,sys_created_on,short_description',
    limit: 10,
  });
  const listed = candidates.records.map((r: any) => {
    const sysId = typeof r.sys_id === 'object' && r.sys_id ? r.sys_id.value : r.sys_id;
    const created = typeof r.sys_created_on === 'object' && r.sys_created_on ? r.sys_created_on.value : r.sys_created_on;
    const sd = typeof r.short_description === 'object' && r.short_description ? r.short_description.value : r.short_description;
    return `${sysId} (created ${created}${sd ? `, "${String(sd).slice(0, 60)}"` : ''})`;
  });
  throw new ServiceNowError(
    `${params.label} number ${params.value} is not unique on this instance (${listed.length}${listed.length === 10 ? '+' : ''} records). ` +
    `Pass the sys_id instead. Candidates, newest first: ${listed.join('; ')}`,
    'AMBIGUOUS_NUMBER',
  );
}
