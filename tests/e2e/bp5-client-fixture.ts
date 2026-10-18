/** Disposable inactive metadata only. No current-set switch or handcrafted payload. */
import { randomUUID } from 'node:crypto';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const value = (v: unknown): string => String(v && typeof v === 'object' && 'value' in v ? v.value : v ?? '');
const validId = (v: string) => /^[a-f0-9]{32}$/.test(v);
export function clientReviewFixture(client: ServiceNowClient, host: string) {
  if (process.env.BP5_CLIENT_WRITE_FIXTURES !== 'true' || process.env.WRITE_ENABLED !== 'true'
    || process.env.SCRIPTING_ENABLED !== 'true' || !/^dev\d+\.service-now\.com$/.test(host)) throw Error('FIXTURE_WRITE_GATE');
  if (process.env.BP5_VERSION_HISTORY_POLICY !== 'retain') throw Error('VERSION_RETENTION_POLICY_UNCONFIRMED');
  const marker = `bp5cl_${randomUUID().replace(/-/g, '')}`;
  const owned = new Map<string, Set<string>>();
  const retainedVersions = new Set<string>();
  const requests: Record<string, number> = {};
  const postAttempts = new Set<string>();
  let setId: string | undefined, scriptId: string | undefined, blocked = 0, closing = false;
  const originalFetch = globalThis.fetch;
  const track = (table: string, id: string) => {
    if (!validId(id)) throw Error('FIXTURE_ID_INVALID');
    if (!owned.has(table)) owned.set(table, new Set());
    owned.get(table)!.add(id); return id;
  };
  const own = (table: string, id: string) => owned.get(table)?.has(id) === true;
  const guard: typeof fetch = async (url, init = {}) => {
    const u = new URL(String(url)), method = init.method ?? 'GET';
    const match = /^\/api\/now\/table\/(sys_update_set|sys_script_client|sys_update_xml|sys_update_version|sys_cluster_state)(?:\/([a-f0-9]{32}))?$/.exec(u.pathname);
    let allowed = method === 'POST' && u.pathname === '/oauth_token.do';
    const table = match?.[1], id = match?.[2];
    if (match && method === 'GET') allowed = true;
    if (match && method === 'POST' && !id && !closing && !postAttempts.has(table!)) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      allowed = table === 'sys_update_set' && body.name === marker && body.is_default === false && body.state === 'in progress'
        || table === 'sys_script_client' && body.name === marker && body.active === false && body.table === 'incident'
          && body.type === 'onLoad' && body.sys_scope === 'global';
      if (allowed) postAttempts.add(table!);
    }
    if (table === 'sys_update_xml' && id && method === 'PATCH' && own(table, id) && setId && !closing) {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      allowed = Object.keys(body).length === 1 && body.update_set === setId;
    }
    if (table && table !== 'sys_update_version' && id && method === 'DELETE' && closing && own(table, id)) allowed = true;
    if (u.protocol !== 'https:' || u.host !== host || !allowed) { blocked++; throw Error('FIXTURE_REQUEST_GUARD'); }
    const key = `${method} ${table ?? 'oauth_token'}`;
    requests[key] = (requests[key] ?? 0) + 1;
    const signals = [AbortSignal.timeout(15000), ...(init.signal ? [init.signal] : [])];
    return originalFetch(url, { ...init, redirect: 'error', signal: AbortSignal.any(signals) });
  };
  const rows = async (table: string, query: string, fields: string) => {
    const result = await client.queryRecords({ table, query, fields, limit: 20 });
    if (result.records.length >= 20) throw Error('FIXTURE_METADATA_LIMIT');
    return result.records;
  };
  async function recover() {
    // A timed-out POST may have succeeded. Recover only the unique, preflight-empty marker.
    for (const table of ['sys_update_set', 'sys_script_client']) {
      if (!postAttempts.has(table)) continue;
      for (const r of await rows(table, `name=${marker}`, 'sys_id,name')) {
        if (value(r.name) !== marker) throw Error('FIXTURE_OWNERSHIP_MISMATCH');
        const id = track(table, value(r.sys_id));
        if (table === 'sys_script_client') scriptId = id; else setId = id;
      }
    }
  }
  async function collectGenerated(table: 'sys_update_xml' | 'sys_update_version') {
    if (!scriptId) return [];
    const name = `sys_script_client_${scriptId}`;
    const found = await rows(table, `name=${name}`, table === 'sys_update_xml' ? 'sys_id,name,update_set,action' : 'sys_id,name');
    for (const r of found) {
      if (value(r.name) !== name) throw Error('FIXTURE_OWNERSHIP_MISMATCH');
      const id = value(r.sys_id);
      if (!validId(id)) throw Error('FIXTURE_ID_INVALID');
      if (table === 'sys_update_version') retainedVersions.add(id);
      else track(table, id);
    }
    return found;
  }
  async function create() {
    for (const table of ['sys_update_set', 'sys_script_client']) {
      if ((await rows(table, `name=${marker}`, 'sys_id')).length) throw Error('FIXTURE_MARKER_NOT_EMPTY');
    }
    setId = track('sys_update_set', value((await client.createRecord('sys_update_set', {
      name: marker, state: 'in progress', application: 'global', is_default: false,
      description: 'Disposable BP-5 inactive Client Script review fixture; never deploy.',
    })).sys_id));
    scriptId = track('sys_script_client', value((await client.createRecord('sys_script_client', {
      name: marker, table: 'incident', type: 'onLoad', active: false, global: false, sys_scope: 'global', ui_type: '0',
      script: 'function onLoad() { var fixtureAjax = new GlideAjax("MCP_BP5_NEVER_EXECUTE"); fixtureAjax.getXMLWait(); }',
    })).sys_id));
    const stored = await client.getRecord('sys_script_client', scriptId, 'sys_id,active,name,sys_scope');
    console.log('BP5_CLIENT_FIXTURE_SAFETY ' + JSON.stringify({ scriptId,
      active_false: value(stored.active) === 'false', marker_matches: value(stored.name) === marker,
      scope_global: value(stored.sys_scope) === 'global', active_field_present: 'active' in stored,
      scope_field_present: 'sys_scope' in stored }));
    if (value(stored.active) !== 'false') throw Error('FIXTURE_INACTIVE_NOT_RETAINED');
    if (value(stored.name) !== marker) throw Error('FIXTURE_NAME_NOT_RETAINED');
    if (value(stored.sys_scope) !== 'global') throw Error('FIXTURE_SCOPE_NOT_RETAINED');
    const native = await collectGenerated('sys_update_xml');
    if (native.length !== 1 || value(native[0].action) !== 'INSERT_OR_UPDATE') throw Error('NATIVE_CLIENT_CAPTURE_UNAVAILABLE');
    const xmlId = value(native[0].sys_id);
    // Move only this newly generated entry; never edit payload or existing updates.
    await client.updateRecord('sys_update_xml', xmlId, { update_set: setId });
    const linked = await client.getRecord('sys_update_xml', xmlId, 'sys_id,name,update_set,action');
    if (value(linked.update_set) !== setId || value(linked.name) !== `sys_script_client_${scriptId}`) throw Error('FIXTURE_LINK_FAILED');
    return { updateSetId: setId, scriptId, updateXmlId: xmlId };
  }
  async function cleanup() {
    closing = true;
    const errors: string[] = [];
    try { await recover(); } catch { errors.push('recover'); }
    // Delete source first, then remove generated customer updates, retaining history.
    for (const id of owned.get('sys_script_client') ?? []) {
      try {
        if ((await rows('sys_script_client', `sys_id=${id}`, 'sys_id')).length) await client.deleteRecord('sys_script_client', id);
      } catch { errors.push('sys_script_client'); }
    }
    try { await collectGenerated('sys_update_version'); } catch { errors.push('sys_update_version_discovery'); }
    for (const table of ['sys_update_xml'] as const) {
      try { await collectGenerated(table); } catch { errors.push(table + '_discovery'); }
      for (const id of owned.get(table) ?? []) {
        try {
          if ((await rows(table, `sys_id=${id}`, 'sys_id')).length) await client.deleteRecord(table, id);
        } catch { errors.push(table); }
      }
    }
    for (const id of owned.get('sys_update_set') ?? []) {
      try {
        // Do not cascade-delete an unexpected record introduced by another actor.
        if ((await rows('sys_update_xml', `update_set=${id}`, 'sys_id')).some(r => !own('sys_update_xml', value(r.sys_id)))) throw Error('FOREIGN_FIXTURE_CHILD');
        if ((await rows('sys_update_set', `sys_id=${id}`, 'sys_id')).length) await client.deleteRecord('sys_update_set', id);
      } catch { errors.push('sys_update_set'); }
    }
    for (const [table, ids] of owned) for (const id of ids) {
      try { if ((await rows(table, `sys_id=${id}`, 'sys_id')).length) errors.push(table + '_remaining'); }
      catch { errors.push(table + '_verify'); }
    }
    const summary = { owned: Object.fromEntries([...owned].map(([t, ids]) => [t, [...ids]])),
      history_policy: 'retain' as const, retained_versions: [...retainedVersions],
      cleanup_ok: errors.length === 0, cleanup_errors: [...new Set(errors)], requests, blocked,
      inactive_only: true, current_set_switched: false, payload_handcrafted: false, source_printed: false };
    console.log('BP5_CLIENT_FIXTURE_CLEANUP ' + JSON.stringify(summary));
    if (errors.length) throw Error('FIXTURE_CLEANUP_FAILED');
    return summary;
  }
  return { guard, create, cleanup };
}
