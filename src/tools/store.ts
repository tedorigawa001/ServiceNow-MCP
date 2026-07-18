/**
 * ServiceNow Store tools — public Store catalog lookups (no instance auth).
 *
 * These call store.servicenow.com's public REST API:
 * `/api/sn_store/v1/store/listings` requires no authentication and is the only
 * programmatic source for per-version release notes (App Manager fetches them
 * remotely too — they are not stored in any instance table).
 *
 * search_store_apps / get_store_app_versions never touch the instance.
 * check_app_upgrade additionally reads sys_scope on the configured instance to
 * compare the installed version against the Store history.
 */
import type { ServiceNowClient } from '../servicenow/client.js';
import { ServiceNowError } from '../utils/errors.js';

const SCOPE_RE = /^[a-z0-9_]+$/i;

/** Compare dotted numeric versions ("30.3.5" vs "30.7.2"). Returns -1/0/1. */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

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
    {
      name: 'check_app_upgrade',
      description:
        'Compare the installed version of a scoped app (from sys_scope on the instance) against the ' +
        'public Store version history, and return the release notes of every newer version. ' +
        'For upgrade planning of Store apps (VR, ACC Framework, ...), whose lifecycle is independent ' +
        'of platform upgrades. Provide either listing_id, or store_query / nothing to search by app name.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'App scope on the instance, e.g. "sn_vul", "sn_agent"' },
          listing_id: { type: 'string', description: '32-char Store listing sys_id (skips the catalog search)' },
          store_query: { type: 'string', description: 'Override the Store search keywords (default: the app name from sys_scope)' },
          include_notes: { type: 'boolean', description: 'Include release notes for newer versions (default true)' },
          max_newer: { type: 'number', description: 'Max newer versions to return, newest first (default 10, max 20)' },
        },
        required: ['scope'],
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

    case 'check_app_upgrade': {
      const scope = String(args.scope || '');
      if (!scope) throw new ServiceNowError('scope is required', 'INVALID_REQUEST');
      if (!SCOPE_RE.test(scope)) {
        throw new ServiceNowError('scope must be a plain scope name (letters/digits/underscore)', 'INVALID_REQUEST');
      }

      // 1. Installed version from the instance
      const scopeResp = await _client.queryRecords({
        table: 'sys_scope',
        query: `scope=${scope}`,
        fields: 'name,scope,version',
        limit: 1,
      });
      if (scopeResp.records.length === 0) {
        throw new ServiceNowError(
          `Scope "${scope}" not found in sys_scope — app not installed, or ACL hides it from this account`,
          'NOT_FOUND'
        );
      }
      const appName = String(scopeResp.records[0].name ?? scope);
      const installed = String(scopeResp.records[0].version ?? '');

      // 2. Resolve the Store listing
      let listingId = args.listing_id ? String(args.listing_id) : '';
      let matchedTitle: string | undefined;
      let matchedBy: 'listing_id' | 'exact_title' | 'first_result' = 'listing_id';
      if (listingId) {
        if (!SYS_ID_RE.test(listingId)) {
          throw new ServiceNowError('listing_id must be a 32-char sys_id', 'INVALID_REQUEST');
        }
      } else {
        const q = String(args.store_query || appName);
        const search = await storeGet(`/listings?query=${encodeURIComponent(q)}&limit=10`);
        const listings = search?.listings || [];
        if (listings.length === 0) {
          throw new ServiceNowError(`No Store listing found for "${q}" — try store_query or listing_id`, 'NOT_FOUND');
        }
        const exact = listings.find((l: any) => String(l.title).toLowerCase() === q.toLowerCase());
        const chosen = exact || listings[0];
        listingId = chosen.id;
        matchedTitle = chosen.title;
        matchedBy = exact ? 'exact_title' : 'first_result';
      }

      // 3. Version history from the Store, newest first
      const includeNotes = args.include_notes !== false;
      const maxNewer = Math.min(Math.max(Math.trunc(Number(args.max_newer) || 10), 1), 20);
      const versionsResult = await storeGet(`/listings/${listingId}/versions`);
      const all = versionsResult?.data || [];
      if (all.length === 0) {
        throw new ServiceNowError(`Store listing ${listingId} returned no versions`, 'NOT_FOUND');
      }
      const latest = String(all[0].version ?? '');

      const newer = all
        .filter((v: any) => compareVersions(String(v.version), installed) > 0)
        .slice(0, maxNewer)
        .map((v: any) => ({
          version: v.version,
          publish_date: v.publish_date,
          release_type: v.release_type,
          ...(includeNotes ? { release_notes: stripReleaseNotesHtml(v.release_notes) } : {}),
        }));
      const behind = all.filter((v: any) => compareVersions(String(v.version), installed) > 0).length;
      const upToDate = behind === 0;

      return {
        app: appName,
        scope,
        installed_version: installed,
        latest_version: latest,
        up_to_date: upToDate,
        behind_count: behind,
        listing_id: listingId,
        matched_by: matchedBy,
        ...(matchedTitle ? { matched_title: matchedTitle } : {}),
        newer_versions: newer,
        summary: upToDate
          ? `${appName} (${scope}) is up to date at ${installed}`
          : `${appName} (${scope}) is at ${installed}; latest is ${latest} — ${behind} newer release(s)` +
            (matchedBy === 'first_result' ? ' [listing matched by first search result — verify matched_title]' : ''),
      };
    }

    default:
      return null;
  }
}
