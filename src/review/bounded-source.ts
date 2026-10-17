/** Fixed BP-5 acquisition primitives only; no release resolver, analysis or MCP registration. */
import { z } from 'zod';
import type { ServiceNowClient } from '../servicenow/client.js';
import { BoundedReadError, type BoundedReadOptions, type BoundedReadSession } from '../servicenow/bounded-read.js';

const id = z.string().regex(/^[a-f0-9]{32}$/);
const inputSchema = z.strictObject({ update_set_sys_id: id, max_records: z.number().int().min(1).max(100).default(20) });
const version = { sys_updated_on: z.string().min(1).max(40), sys_mod_count: z.string().regex(/^\d{1,20}$/) };
const parentSchema = z.strictObject({ sys_id: id, state: z.string().max(100), application: z.string().max(32), ...version });
const metadataSchema = z.strictObject({ sys_id: id, update_set: id, name: z.string().min(1).max(200),
  type: z.string().max(200), action: z.string().max(40), ...version });
export type ReviewMetadata = z.infer<typeof metadataSchema>;
const parentFields = 'sys_id,state,application,sys_updated_on,sys_mod_count';
const metadataFields = 'sys_id,update_set,name,type,action,sys_updated_on,sys_mod_count';

export class BoundedUpdateSetSource {
  private parent?: z.infer<typeof parentSchema>;
  private metadata?: ReviewMetadata[];
  private readonly attempted = new Set<string>();
  private finalStarted = false;
  private releaseRead = false;
  constructor(private readonly session: BoundedReadSession, private readonly input: z.infer<typeof inputSchema>) {}
  get startedAt() { return this.session.startedAt; }
  get authMode() { return this.session.authMode; }
  stats() { return this.session.stats(); }
  private path(table: string, fields: string, query?: string, limit?: number, sysId?: string) {
    const params = new URLSearchParams({ sysparm_fields: fields, sysparm_display_value: 'false', sysparm_exclude_reference_link: 'true' });
    if (query) params.set('sysparm_query', query);
    if (limit !== undefined) params.set('sysparm_limit', String(limit));
    return `/api/now/table/${table}${sysId ? '/' + sysId : ''}?${params}`;
  }
  private async rows(path: string, max: number, final = false): Promise<unknown[]> {
    const value = await this.session.get(path, final);
    if (!value || typeof value !== 'object' || !('result' in value) || !Array.isArray(value.result)
      || value.result.length > max) throw new BoundedReadError('invalid_response');
    return value.result;
  }
  private async fetchParent(final = false) {
    const value = await this.session.get(this.path('sys_update_set', parentFields, undefined, undefined, this.input.update_set_sys_id), final);
    const parsed = parentSchema.safeParse(value && typeof value === 'object' && 'result' in value ? value.result : null);
    if (!parsed.success || parsed.data.sys_id !== this.input.update_set_sys_id) throw new BoundedReadError('invalid_response');
    return parsed.data;
  }
  async readParent() {
    if (this.parent || this.finalStarted) throw new BoundedReadError('invalid_input');
    const parent = await this.fetchParent();
    this.parent = structuredClone(parent);
    return parent;
  }
  async readReleaseRows() {
    if (!this.parent || this.releaseRead || this.finalStarted) throw new BoundedReadError('invalid_input');
    this.releaseRead = true;
    const rows = await this.rows(this.path('sys_cluster_state', 'build_name', undefined, 21), 21);
    // Never retain unexpected internal addresses/certificates, even if a server ignores fields.
    return rows.map(row => {
      const value = row && typeof row === 'object' && 'build_name' in row ? row.build_name : null;
      if (value !== null && (typeof value !== 'string' || value.length > 40)) throw new BoundedReadError('invalid_response');
      return { build_name: value };
    });
  }
  private async fetchMetadata(final = false) {
    if (!this.parent) throw new BoundedReadError('invalid_input');
    const rows = await this.rows(this.path('sys_update_xml', metadataFields,
      `update_set=${this.input.update_set_sys_id}^ORDERBYsys_id`, this.input.max_records + 1), this.input.max_records + 1, final);
    const parsed = z.array(metadataSchema).safeParse(rows);
    if (!parsed.success || parsed.data.some(row => row.update_set !== this.input.update_set_sys_id)
      || new Set(parsed.data.map(row => row.sys_id)).size !== rows.length
      || parsed.data.some((row, i) => i > 0 && row.sys_id <= parsed.data[i - 1].sys_id)) throw new BoundedReadError('invalid_response');
    return parsed.data;
  }
  async listMetadata() {
    if (this.metadata || this.finalStarted) throw new BoundedReadError('invalid_input');
    const rows = await this.fetchMetadata();
    this.metadata = structuredClone(rows);
    return { rows: rows.slice(0, this.input.max_records), metadata_seen: rows.length, truncated: rows.length > this.input.max_records };
  }
  async readPayload(sysId: string) {
    if (!id.safeParse(sysId).success || !this.metadata || this.finalStarted || this.attempted.has(sysId)) throw new BoundedReadError('invalid_input');
    const original = this.metadata.slice(0, this.input.max_records).find(row => row.sys_id === sysId);
    if (!original) throw new BoundedReadError('invalid_input');
    this.attempted.add(sysId);
    const fields = 'sys_id,update_set,name,action,sys_updated_on,sys_mod_count,payload';
    const rows = await this.rows(this.path('sys_update_xml', fields,
      `sys_id=${sysId}^update_set=${this.input.update_set_sys_id}`, 1), 1);
    if (rows.length !== 1) throw new BoundedReadError('not_found_or_not_visible');
    const raw = rows[0];
    if (raw && typeof raw === 'object' && 'payload' in raw && typeof raw.payload === 'string') this.session.chargePayload(raw.payload);
    const parsed = metadataSchema.omit({ type: true }).extend({ payload: z.string() }).safeParse(rows[0]);
    if (!parsed.success) throw new BoundedReadError('invalid_response');
    for (const key of ['sys_id', 'update_set', 'name', 'action', 'sys_updated_on', 'sys_mod_count'] as const) {
      if (original[key] !== parsed.data[key]) throw new BoundedReadError('changed_during_review');
    }
    return parsed.data;
  }
  async verify() {
    if (!this.parent || !this.metadata || this.finalStarted) throw new BoundedReadError('invalid_input');
    this.finalStarted = true;
    const parent = await this.fetchParent(true);
    const observed = await this.fetchMetadata(true);
    return { consistency: JSON.stringify(parent) === JSON.stringify(this.parent)
      && JSON.stringify(observed) === JSON.stringify(this.metadata) ? 'stable_observation' as const : 'changed' as const };
  }
}

/** The callback's source is internal: payload must never be forwarded as an MCP response. */
export async function withBoundedUpdateSetSource<T>(client: ServiceNowClient, input: unknown,
  work: (source: BoundedUpdateSetSource) => Promise<T>, options?: BoundedReadOptions): Promise<T> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new BoundedReadError('invalid_input');
  const session = client.createBoundedReadSession(options);
  return session.run(() => work(new BoundedUpdateSetSource(session, parsed.data)));
}
