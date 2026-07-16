/**
 * ServiceNow Store tools — public Store catalog lookups (no instance auth).
 *
 * These call store.servicenow.com's public REST API, not the configured
 * instance: `/api/sn_store/v1/store/listings` requires no authentication and
 * is the only programmatic source for per-version release notes (App Manager
 * fetches them remotely too — they are not stored in any instance table).
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const STORE_BASE_URL = 'https://store.servicenow.com/api/sn_store/v1/store';
const SYS_ID_RE = /^[0-9a-f]{32}$/i;
const REQUEST_TIMEOUT_MS = 15000;

async function storeGet(path: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${STORE_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ServiceNowError(
        `ServiceNow Store API returned ${response.status} for ${path}`,
        'EXTERNAL_API_ERROR'
      );
    }
    return (await response.json()).result;
  } catch (err) {
    if (err instanceof ServiceNowError) throw err;
    throw new ServiceNowError(
      `ServiceNow Store API request failed: ${err instanceof Error ? err.message : String(err)}`,
      'EXTERNAL_API_ERROR'
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Convert the Store's HTML release notes to readable plain text. */
export function stripReleaseNotesHtml(html: string): string {
  return (html || '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|ul|ol|div|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getStoreToolDefinitions() {
  return [
    {
      name: 'search_store_apps',
      description:
        'Search the public ServiceNow Store catalog by keyword (no instance auth needed). ' +
        'Returns listing_id values usable with get_store_app_versions.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords, e.g. "vulnerability response"' },
          limit: { type: 'number', description: 'Max results (default 10, max 50)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_store_app_versions',
      description:
        'Get version history with release notes (new features / bug fixes) for a Store app ' +
        'from the public Store API. Release notes are not stored in any instance table — ' +
        'this is the only programmatic source. Use search_store_apps to find the listing_id.',
      inputSchema: {
        type: 'object',
        properties: {
          listing_id: { type: 'string', description: '32-char Store listing sys_id (from search_store_apps)' },
          limit: { type: 'number', description: 'Max versions to return, newest first (default 5, max 20)' },
          include_notes: { type: 'boolean', description: 'Include release notes text (default true)' },
        },
        required: ['listing_id'],
      },
    },
  ];
}

export async function executeStoreToolCall(
  _client: ServiceNowClient,
  name: string,
  args: Record<string, any>
): Promise<any> {
  switch (name) {
    case 'search_store_apps': {
      if (!args.query) throw new ServiceNowError('query is required', 'INVALID_REQUEST');
      const limit = Math.min(Math.max(Math.trunc(Number(args.limit) || 10), 1), 50);
      const result = await storeGet(
        `/listings?query=${encodeURIComponent(String(args.query))}&limit=${limit}`
      );
      const listings = (result?.listings || []).map((l: any) => ({
        listing_id: l.id,
        title: l.title,
        tagline: l.tagline,
        company: l.company?.name,
        type: l.type,
        price_type: l.price_type,
        latest_publish_date: l.latest_publish_date,
      }));
      return {
        count: listings.length,
        total_matches: Number(result?.numResults) || listings.length,
        apps: listings,
        summary: `Found ${listings.length} Store app(s) for "${args.query}"`,
      };
    }

    case 'get_store_app_versions': {
      if (!args.listing_id) throw new ServiceNowError('listing_id is required', 'INVALID_REQUEST');
      if (!SYS_ID_RE.test(String(args.listing_id))) {
        throw new ServiceNowError('listing_id must be a 32-char sys_id', 'INVALID_REQUEST');
      }
      const limit = Math.min(Math.max(Math.trunc(Number(args.limit) || 5), 1), 20);
      const includeNotes = args.include_notes !== false;
      const result = await storeGet(`/listings/${args.listing_id}/versions`);
      const all = result?.data || [];
      const versions = all.slice(0, limit).map((v: any) => ({
        version: v.version,
        publish_date: v.publish_date,
        release_type: v.release_type,
        ...(includeNotes ? { release_notes: stripReleaseNotesHtml(v.release_notes) } : {}),
      }));
      return {
        count: versions.length,
        total_versions: all.length,
        versions,
        summary: `Returning ${versions.length} of ${all.length} version(s), newest first`,
      };
    }

    default:
      return null;
  }
}
