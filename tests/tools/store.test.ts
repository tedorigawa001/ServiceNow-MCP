import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeStoreToolCall, getStoreToolDefinitions, stripReleaseNotesHtml } from '../../src/tools/store.js';
import type { ServiceNowClient } from '../../src/servicenow/client.js';

const mockClient = {} as unknown as ServiceNowClient;

const LISTING_ID = '21d8a32e1be06a50a85b16db234bcb7e';

function mockFetchOnce(body: any, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response);
}

describe('getStoreToolDefinitions', () => {
  it('returns exactly 2 store tool definitions', () => {
    expect(getStoreToolDefinitions().length).toBe(2);
  });

  it('all tools have name, description and inputSchema', () => {
    getStoreToolDefinitions().forEach(t => {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    });
  });
});

describe('stripReleaseNotesHtml', () => {
  it('converts list items to dashes and strips tags', () => {
    const html = '<p><strong>New</strong></p>\r\n<ul><li>Feature A</li>\r\n<li>Fix &amp; polish</li></ul>';
    const text = stripReleaseNotesHtml(html);
    expect(text).toContain('- Feature A');
    expect(text).toContain('- Fix & polish');
    expect(text).not.toContain('<');
  });

  it('handles empty/undefined input', () => {
    expect(stripReleaseNotesHtml('')).toBe('');
    expect(stripReleaseNotesHtml(undefined as unknown as string)).toBe('');
  });
});

describe('executeStoreToolCall – unknown tool', () => {
  it('returns null', async () => {
    expect(await executeStoreToolCall(mockClient, 'not_a_tool', {})).toBeNull();
  });
});

describe('search_store_apps', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('requires query', async () => {
    await expect(executeStoreToolCall(mockClient, 'search_store_apps', {})).rejects.toThrow('query is required');
  });

  it('searches the public Store listings API and maps results', async () => {
    const fetchSpy = mockFetchOnce({
      result: {
        numResults: 89,
        listings: [
          {
            id: LISTING_ID,
            title: 'Vulnerability Response',
            tagline: 'Bring security and IT together',
            company: { name: 'ServiceNow' },
            type: 'scoped_app',
            price_type: 'paid',
            latest_publish_date: '2026-07-09',
          },
        ],
      },
    });

    const result = await executeStoreToolCall(mockClient, 'search_store_apps', { query: 'vulnerability response' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://store.servicenow.com/api/sn_store/v1/store/listings?query=vulnerability%20response&limit=10',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(result.total_matches).toBe(89);
    expect(result.apps[0]).toEqual({
      listing_id: LISTING_ID,
      title: 'Vulnerability Response',
      tagline: 'Bring security and IT together',
      company: 'ServiceNow',
      type: 'scoped_app',
      price_type: 'paid',
      latest_publish_date: '2026-07-09',
    });
  });

  it('clamps limit to 50', async () => {
    const fetchSpy = mockFetchOnce({ result: { numResults: 0, listings: [] } });
    await executeStoreToolCall(mockClient, 'search_store_apps', { query: 'x', limit: 500 });
    expect(String(fetchSpy.mock.calls[0][0])).toContain('limit=50');
  });

  it('throws EXTERNAL_API_ERROR on non-2xx responses', async () => {
    mockFetchOnce({}, 503);
    await expect(executeStoreToolCall(mockClient, 'search_store_apps', { query: 'x' }))
      .rejects.toMatchObject({ code: 'EXTERNAL_API_ERROR' });
  });

  it('wraps network failures as EXTERNAL_API_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(executeStoreToolCall(mockClient, 'search_store_apps', { query: 'x' }))
      .rejects.toMatchObject({ code: 'EXTERNAL_API_ERROR' });
  });
});

describe('get_store_app_versions', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('requires listing_id', async () => {
    await expect(executeStoreToolCall(mockClient, 'get_store_app_versions', {})).rejects.toThrow('listing_id is required');
  });

  it('rejects listing_id that is not a 32-char sys_id (no URL injection)', async () => {
    await expect(
      executeStoreToolCall(mockClient, 'get_store_app_versions', { listing_id: '../user/info' })
    ).rejects.toThrow('32-char sys_id');
  });

  it('fetches versions and strips release-notes HTML', async () => {
    const fetchSpy = mockFetchOnce({
      result: {
        data: [
          { version: '30.7.2', publish_date: '2026-07-09', release_type: 'Patch', release_notes: '<p><strong>New</strong></p><ul><li>Feature A</li></ul>' },
          { version: '30.6.1', publish_date: '2026-06-23', release_type: 'Patch', release_notes: '<ul><li>Fix B</li></ul>' },
          { version: '30.6.0', publish_date: '2026-06-16', release_type: 'Minor', release_notes: '' },
        ],
      },
    });

    const result = await executeStoreToolCall(mockClient, 'get_store_app_versions', { listing_id: LISTING_ID, limit: 2 });

    expect(fetchSpy).toHaveBeenCalledWith(
      `https://store.servicenow.com/api/sn_store/v1/store/listings/${LISTING_ID}/versions`,
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    );
    expect(result.count).toBe(2);
    expect(result.total_versions).toBe(3);
    expect(result.versions[0].version).toBe('30.7.2');
    expect(result.versions[0].release_notes).toContain('- Feature A');
    expect(result.versions[0].release_notes).not.toContain('<');
  });

  it('omits release notes when include_notes=false', async () => {
    mockFetchOnce({
      result: { data: [{ version: '30.7.2', publish_date: '2026-07-09', release_type: 'Patch', release_notes: '<p>x</p>' }] },
    });
    const result = await executeStoreToolCall(mockClient, 'get_store_app_versions', { listing_id: LISTING_ID, include_notes: false });
    expect(result.versions[0]).not.toHaveProperty('release_notes');
  });
});
