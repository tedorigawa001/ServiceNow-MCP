import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import { withBoundedUpdateSetSource } from '../../src/review/bounded-source.js';

const parent = 'a'.repeat(32);
const client = (token = 'user-a') => new ServiceNowClient({ instanceUrl: 'https://example.service-now.com',
  authMode: 'per-user', perUserBearerToken: token, oauth: { clientId: '', clientSecret: '' } });
const json = (result: unknown) => new Response(JSON.stringify({ result }));
const parentRow = { sys_id: parent, state: 'in progress', application: 'global',
  sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' };
const row = (value: string) => ({ sys_id: value.padStart(32, '0'), update_set: parent,
  name: 'sys_script_' + value.padStart(32, '0'), type: 'Business Rule', action: 'INSERT_OR_UPDATE',
  sys_updated_on: parentRow.sys_updated_on, sys_mod_count: '0' });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('bounded BP-5 acquisition', () => {
  it('uses only the pinned client and fixed parent fields without following redirects', async () => {
    const fetcher = vi.fn(async () => json({ sys_id: parent, state: 'in progress', application: 'global',
      sys_updated_on: '2026-10-17 00:00:00', sys_mod_count: '0' }));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async source => {
      expect((await source.readParent()).sys_id).toBe(parent);
      expect(source.stats().requests).toBe(1);
    }, { fetch: fetcher });
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe(`/api/now/table/sys_update_set/${parent}`);
    expect(url.searchParams.get('sysparm_fields')).toBe('sys_id,state,application,sys_updated_on,sys_mod_count');
    expect(init.redirect).toBe('error');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer user-a');
  });
  it('cancels a response as soon as actual streamed bytes exceed the cap, ignoring Content-Length', async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(c) { c.enqueue(new Uint8Array(40)); c.enqueue(new Uint8Array(40)); }, cancel,
    }), { headers: { 'Content-Length': '1' } }));
    await expect(withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { responseBytes: 64 } })).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1])('checks the exact response byte boundary (excess=%i)', async excess => {
    const body = JSON.stringify({ result: parentRow });
    const cap = Buffer.byteLength(body);
    const fetcher = vi.fn(async () => new Response(body + ' '.repeat(excess)));
    const run = withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { responseBytes: cap } });
    if (excess) await expect(run).rejects.toMatchObject({ code: 'receive_budget_exceeded' });
    else await expect(run).resolves.toEqual(parentRow);
  });
  it('does not treat a release-table 403 as permission to switch identity or block fallback evidence', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow))
      .mockResolvedValueOnce(new Response('secret server error', { status: 403 }))
      .mockResolvedValueOnce(json([]));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      await expect(s.readReleaseRows()).rejects.toMatchObject({ code: 'access_denied' });
      expect((await s.listMetadata()).rows).toEqual([]);
    }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, init] of fetcher.mock.calls) expect(new Headers(init.headers).get('Authorization')).toBe('Bearer user-a');
  });
  it('aborts a stalled body at the whole-run deadline and forbids later requests', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const cancel = vi.fn();
    const fetcher = vi.fn(async (_url, init) => { signal = init?.signal as AbortSignal;
      return new Response(new ReadableStream({ cancel })); });
    const pending = withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { deadlineMs: 100, requestTimeoutMs: 1000 } });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'deadline_exceeded' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds retries, per-HTTP timeouts and retry backoff within the same deadline', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const pending = withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { requestTimeoutMs: 10, retryDelayMs: 5, deadlineMs: 100 } });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'upstream_unavailable' });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('detects changes to the max+1 sentinel during final verification', async () => {
    const row = (id: string) => ({ sys_id: id.repeat(32), update_set: parent, name: 'sys_script_' + id.repeat(32),
      type: 'Business Rule', action: 'INSERT_OR_UPDATE', sys_updated_on: parentRow.sys_updated_on, sys_mod_count: '0' });
    const first = [row('1'), row('2')];
    const changed = structuredClone(first); changed[1].sys_mod_count = '1';
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(first))
      .mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(changed));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent, max_records: 1 }, async s => {
      await s.readParent();
      expect(await s.listMetadata()).toMatchObject({ metadata_seen: 2, truncated: true, rows: [first[0]] });
      expect(await s.verify()).toEqual({ consistency: 'changed' });
    }, { fetch: fetcher });
  });
  it('pins OAuth credentials before awaits and never refreshes or falls back after a 401', async () => {
    const oauth = { clientId: 'original-id', clientSecret: 'original-secret' };
    const selected = new ServiceNowClient({ instanceUrl: 'https://original.service-now.com', oauth });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fixed-token', expires_in: 3600 })))
      .mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(new Response('hidden', { status: 401 }));
    const run = withBoundedUpdateSetSource(selected, { update_set_sys_id: parent }, async s => {
      await s.readParent();
      await s.listMetadata();
    }, { fetch: fetcher });
    oauth.clientId = 'changed-id'; oauth.clientSecret = 'changed-secret';
    await expect(run).rejects.toMatchObject({ code: 'authentication_failed' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://original.service-now.com/oauth_token.do');
    expect(new URLSearchParams(fetcher.mock.calls[0][1].body).get('client_id')).toBe('original-id');
    expect(new URLSearchParams(fetcher.mock.calls[0][1].body).get('client_secret')).toBe('original-secret');
    for (const [, init] of fetcher.mock.calls.slice(1)) expect(init.headers.Authorization).toBe('Bearer fixed-token');
  });
  it('includes stalled OAuth acquisition in the whole-run deadline', async () => {
    vi.useFakeTimers();
    const selected = new ServiceNowClient({ instanceUrl: 'https://example.service-now.com',
      oauth: { clientId: 'id', clientSecret: 'secret' } });
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const run = withBoundedUpdateSetSource(selected, { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { deadlineMs: 100, requestTimeoutMs: 1000 } });
    const assertion = expect(run).rejects.toMatchObject({ code: 'deadline_exceeded' });
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain('/oauth_token.do');
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('stops on 401 headers without waiting for an endless error body or retrying credentials', async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 401 }));
    await expect(withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { requestTimeoutMs: 5, retryDelayMs: 1 } }))
      .rejects.toMatchObject({ code: 'authentication_failed' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('rejects unbound per-user and unsupported impersonation before fetching anything', async () => {
    const fetcher = vi.fn();
    const unbound = new ServiceNowClient({ instanceUrl: 'https://example.service-now.com', authMode: 'per-user',
      oauth: { clientId: 'service-id', clientSecret: 'service-secret' } });
    await expect(withBoundedUpdateSetSource(unbound, { update_set_sys_id: parent }, s => s.readParent(), { fetch: fetcher }))
      .rejects.toMatchObject({ code: 'authentication_failed' });
    await expect(withBoundedUpdateSetSource(client().withUser({ sysId: 'b'.repeat(32) }), { update_set_sys_id: parent },
      s => s.readParent(), { fetch: fetcher })).rejects.toMatchObject({ code: 'authentication_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('enforces a cumulative decoded body budget across error responses and retries', async () => {
    const fetcher = vi.fn(async () => new Response('x'.repeat(40), { status: 500 }));
    await expect(withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { responseBytes: 64, totalBytes: 70, retryDelayMs: 1 } }))
      .rejects.toMatchObject({ code: 'receive_budget_exceeded', message: 'receive_budget_exceeded' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('counts rejected payloads against the cumulative budget and never fetches beyond selection', async () => {
    const rows = [row('1'), row('2'), row('3')];
    const detail = (n: number) => ({ sys_id: rows[n].sys_id, update_set: parent, name: rows[n].name,
      action: rows[n].action, sys_updated_on: rows[n].sys_updated_on, sys_mod_count: rows[n].sys_mod_count, payload: 'x'.repeat(8) });
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(rows))
      .mockResolvedValueOnce(json([detail(0)])).mockResolvedValueOnce(json([detail(1)]));
    const run = withBoundedUpdateSetSource(client(), { update_set_sys_id: parent, max_records: 2 }, async s => {
      await s.readParent(); await s.listMetadata();
      await expect(s.readPayload(rows[2].sys_id)).rejects.toMatchObject({ code: 'invalid_input' });
      await expect(s.readPayload(rows[0].sys_id)).rejects.toMatchObject({ code: 'payload_limit' });
      expect(s.stats().payload_bytes).toBe(8);
      await s.readPayload(rows[1].sys_id);
    }, { fetch: fetcher, limits: { payloadBytes: 4, totalPayloadBytes: 12 } });
    await expect(run).rejects.toMatchObject({ code: 'payload_budget_exceeded' });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('preserves final verification attempts when normal acquisition exhausts its request quota', async () => {
    const metadata = [row('1')];
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(metadata))
      .mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(metadata));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent(); await s.listMetadata();
      await expect(s.readPayload(metadata[0].sys_id)).rejects.toMatchObject({ code: 'request_budget_exceeded' });
      expect(await s.verify()).toEqual({ consistency: 'stable_observation' });
      expect(s.stats().requests).toBe(4);
      await expect(s.verify()).rejects.toMatchObject({ code: 'invalid_input' });
    }, { fetch: fetcher, limits: { requests: 6 } });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('counts all metadata rows, including unsupported/deleted records, and caps max+1 at 101', async () => {
    const rows = Array.from({ length: 101 }, (_, n) => row((n + 1).toString(16)));
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(rows));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent, max_records: 100 }, async s => {
      await s.readParent();
      expect(await s.listMetadata()).toMatchObject({ metadata_seen: 101, truncated: true });
      const url = fetcher.mock.calls[1][0] as URL;
      expect(url.searchParams.get('sysparm_limit')).toBe('101');
      expect(url.searchParams.get('sysparm_fields')).not.toContain('payload');
      await expect(s.readPayload(rows[100].sys_id)).rejects.toMatchObject({ code: 'invalid_input' });
    }, { fetch: fetcher });
  });
  it.each(['too_many', 'duplicate', 'wrong_parent', 'missing_column', 'unsorted'])('rejects %s metadata', async kind => {
    let rows: unknown[] = [row('1')];
    if (kind === 'too_many') rows = [row('1'), row('2'), row('3')];
    if (kind === 'duplicate') rows = [row('1'), row('1')];
    if (kind === 'wrong_parent') rows = [{ ...row('1'), update_set: 'f'.repeat(32) }];
    if (kind === 'missing_column') rows = [{ sys_id: row('1').sys_id }];
    if (kind === 'unsorted') rows = [row('2'), row('1')];
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json(rows));
    await expect(withBoundedUpdateSetSource(client(), { update_set_sys_id: parent, max_records: 1 }, async s => {
      await s.readParent(); await s.listMetadata();
    }, { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('supports external cancellation during a stalled fetch without exposing the abort reason', async () => {
    const external = new AbortController();
    let started!: () => void;
    const fetching = new Promise<void>(resolve => { started = resolve; });
    const fetcher = vi.fn(() => { started(); return new Promise<Response>(() => {}); });
    const run = withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(), { fetch: fetcher, signal: external.signal });
    const assertion = expect(run).rejects.toMatchObject({ code: 'cancelled', message: 'cancelled' });
    await fetching; external.abort(new Error('private token/body'));
    await assertion;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('releases admission slots after cancellation and enforces one principal / two process-wide runs', async () => {
    let releaseFirst!: () => void; let releaseSecond!: () => void;
    let firstStarted!: () => void; let secondStarted!: () => void;
    const firstReady = new Promise<void>(r => { firstStarted = r; });
    const secondReady = new Promise<void>(r => { secondStarted = r; });
    const first = withBoundedUpdateSetSource(client('one'), { update_set_sys_id: parent }, async () => {
      firstStarted(); await new Promise<void>(r => { releaseFirst = r; });
    });
    await firstReady;
    await expect(withBoundedUpdateSetSource(client('one'), { update_set_sys_id: parent }, async () => {}))
      .rejects.toMatchObject({ code: 'review_busy' });
    const second = withBoundedUpdateSetSource(client('two'), { update_set_sys_id: parent }, async () => {
      secondStarted(); await new Promise<void>(r => { releaseSecond = r; });
    });
    try {
      await secondReady;
      await expect(withBoundedUpdateSetSource(client('three'), { update_set_sys_id: parent }, async () => {}))
        .rejects.toMatchObject({ code: 'review_busy' });
    } finally { releaseFirst(); releaseSecond(); await Promise.all([first, second]); }
    await expect(withBoundedUpdateSetSource(client('one'), { update_set_sys_id: parent }, async () => 'ok')).resolves.toBe('ok');
  });
  it('cancels a late HTTP response after an uncooperative fetch missed the deadline', async () => {
    vi.useFakeTimers();
    let deliver!: (response: Response) => void;
    const cancel = vi.fn();
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { deliver = resolve; }));
    const run = withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { deadlineMs: 50 } });
    const assertion = expect(run).rejects.toMatchObject({ code: 'deadline_exceeded' });
    await vi.advanceTimersByTimeAsync(50); await assertion;
    deliver(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('does not allow a response or payload byte budget to be raised by an internal option', async () => {
    const fetcher = vi.fn();
    await expect(withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, s => s.readParent(),
      { fetch: fetcher, limits: { responseBytes: 4 * 1024 * 1024 + 1 } })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('reads only build_name and strips unexpected node addresses or certificates', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow))
      .mockResolvedValueOnce(json([{ build_name: 'Australia', address: 'private-address', certificate: 'private-cert' }]));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent();
      expect(await s.readReleaseRows()).toEqual([{ build_name: 'Australia' }]);
      const url = fetcher.mock.calls[1][0] as URL;
      expect(url.searchParams.get('sysparm_fields')).toBe('build_name');
      expect(url.searchParams.get('sysparm_limit')).toBe('21');
    }, { fetch: fetcher });
  });
  it('keeps the source closed after its callback returns', async () => {
    const fetcher = vi.fn(async () => json(parentRow));
    const source = await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => s, { fetch: fetcher });
    await expect(source.readParent()).rejects.toMatchObject({ code: 'closed' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a payload whose version changed since metadata collection', async () => {
    const meta = row('1');
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json([meta]))
      .mockResolvedValueOnce(json([{ sys_id: meta.sys_id, update_set: parent, name: meta.name, action: meta.action,
        sys_updated_on: meta.sys_updated_on, sys_mod_count: '1', payload: '<synthetic />' }]));
    await expect(withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent(); await s.listMetadata(); await s.readPayload(meta.sys_id);
    }, { fetch: fetcher })).rejects.toMatchObject({ code: 'changed_during_review' });
  });
  it('charges UTF-8 payload bytes even when another required detail field is missing', async () => {
    const metadata = row('1');
    const fetcher = vi.fn().mockResolvedValueOnce(json(parentRow)).mockResolvedValueOnce(json([metadata]))
      .mockResolvedValueOnce(json([{ sys_id: metadata.sys_id, payload: '😀😀' }]));
    await withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async s => {
      await s.readParent(); await s.listMetadata();
      await expect(s.readPayload(metadata.sys_id)).rejects.toMatchObject({ code: 'invalid_response' });
      expect(s.stats().payload_bytes).toBe(8);
    }, { fetch: fetcher });
  });
  it('rejects asynchronous work that returns after the deadline even if its timer could not run', async () => {
    let elapsed = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    await expect(withBoundedUpdateSetSource(client(), { update_set_sys_id: parent }, async () => {
      elapsed = 60001; return 'late success';
    })).rejects.toMatchObject({ code: 'deadline_exceeded' });
  });
  it.each([
    { update_set_sys_id: parent, max_records: 101 }, { update_set_sys_id: parent, max_records: 0 },
    { update_set_sys_id: parent, release: 'Australia' }, { update_set_sys_id: parent + '^ORactive=true' },
  ])('rejects unsupported acquisition input before I/O ($max_records)', async input => {
    const fetcher = vi.fn();
    await expect(withBoundedUpdateSetSource(client(), input, s => s.readParent(), { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
