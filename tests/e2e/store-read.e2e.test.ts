import { it, expect } from 'vitest';
import { e2eDescribe, getE2EClient } from './helpers.js';
import { executeStoreToolCall } from '../../src/tools/store.js';

type StoreVersion = { version: string; release_notes?: string };

e2eDescribe('E2E – public Store catalog (read-only)', () => {
  it('search_store_apps returns usable listing identities for Vulnerability Response', async () => {
    const result = await executeStoreToolCall(getE2EClient(), 'search_store_apps', {
      query: 'Vulnerability Response', limit: 3,
    });
    expect(Array.isArray(result.apps)).toBe(true);
    expect(result.apps.length).toBeGreaterThan(0);
    expect(result.apps.length).toBeLessThanOrEqual(3);
    expect(result.count).toBe(result.apps.length);
    expect(result.apps.every((r: { listing_id: string }) => /^[a-f0-9]{32}$/i.test(r.listing_id))).toBe(true);
  });

  it('get_store_app_versions returns versions with optional release notes', async () => {
    const client = getE2EClient();
    const search = await executeStoreToolCall(client, 'search_store_apps', { query: 'Vulnerability Response', limit: 3 });
    expect(search.apps.length).toBeGreaterThan(0);
    const listing_id = search.apps[0].listing_id;
    const withNotes = await executeStoreToolCall(client, 'get_store_app_versions', { listing_id, limit: 2 });
    const withoutNotes = await executeStoreToolCall(client, 'get_store_app_versions', { listing_id, limit: 2, include_notes: false });
    expect(withNotes.versions.length).toBeGreaterThan(0);
    expect(withNotes.versions.length).toBeLessThanOrEqual(2);
    expect(withNotes.total_versions).toBeGreaterThanOrEqual(withNotes.count);
    expect(withNotes.versions.every((v: StoreVersion) => typeof v.version === 'string' && v.version.length > 0 && typeof v.release_notes === 'string')).toBe(true);
    expect(withoutNotes.versions.every((v: StoreVersion) => !('release_notes' in v))).toBe(true);
    expect(withoutNotes.versions.map((v: StoreVersion) => v.version)).toEqual(withNotes.versions.map((v: StoreVersion) => v.version));
  });

  it('check_app_upgrade compares the installed VR version to an exact-title Store match', async ctx => {
    const client = getE2EClient();
    const installed = await client.queryRecords({ table: 'sys_scope', query: 'scope=sn_vul', fields: 'name,scope,version', limit: 1 });
    ctx.skip(installed.records.length === 0, 'sn_vul is not installed or visible');
    const search = await executeStoreToolCall(client, 'search_store_apps', { query: 'Vulnerability Response', limit: 10 });
    const listing = search.apps.find((a: { title: string }) => a.title.toLowerCase() === 'vulnerability response');
    ctx.skip(!listing, 'no exact Vulnerability Response Store listing; refusing a guessed match');
    const result = await executeStoreToolCall(client, 'check_app_upgrade', {
      scope: 'sn_vul', listing_id: listing.listing_id, include_notes: false, max_newer: 2,
    });
    expect(result.installed_version).toBe(String(installed.records[0].version));
    expect(result.listing_id).toBe(listing.listing_id);
    expect(result.matched_by).toBe('listing_id');
    expect(result.up_to_date).toBe(result.behind_count === 0);
    expect(result.newer_versions.length).toBeLessThanOrEqual(2);
    expect(result.newer_versions.every((v: StoreVersion) => !('release_notes' in v))).toBe(true);
  });
});
