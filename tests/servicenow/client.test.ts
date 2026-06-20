import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServiceNowClient } from '../../src/servicenow/client.js';
import type { ServiceNowConfig } from '../../src/servicenow/types.js';

// ── fetch mock plumbing ───────────────────────────────────────────────────────

interface MockResponseInit {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
  contentLength?: string | null;
}

function mockResponse(init: MockResponseInit) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    statusText: init.statusText ?? '',
    headers: {
      get: (h: string) =>
        h.toLowerCase() === 'content-length' ? (init.contentLength ?? null) : null,
    },
    json: async () => init.json ?? {},
    text: async () => init.text ?? '',
  };
}

const TOKEN_OK = mockResponse({ json: { access_token: 'tok-123', expires_in: 1800 } });
const BASE_URL = 'https://test.service-now.com';
const VALID_SYS_ID = 'a'.repeat(32);

function baseConfig(overrides: Partial<ServiceNowConfig> = {}): ServiceNowConfig {
  return {
    instanceUrl: BASE_URL,
    oauth: { clientId: 'cid', clientSecret: 'secret', ...(overrides.oauth ?? {}) },
    retryDelayMs: 1, // minimal backoff (0 is falsy → constructor would fall back to 1000ms)
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Route fetch by URL: token endpoint → token response, everything else → `api`. */
function routeFetch(api: ReturnType<typeof mockResponse> | Error, token = TOKEN_OK) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/oauth_token.do')) return token;
    if (api instanceof Error) throw api;
    return api;
  });
}

/** Route fetch by URL substring → response, for methods that make several calls. */
function routeUrls(routes: Array<[string, ReturnType<typeof mockResponse>]>) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/oauth_token.do')) return TOKEN_OK;
    for (const [needle, res] of routes) {
      if (url.includes(needle)) return res;
    }
    throw new Error(`unrouted url: ${url}`);
  });
}

/** Find the first non-token API fetch call. */
function apiCall() {
  return fetchMock.mock.calls.find(c => !String(c[0]).includes('/oauth_token.do'))!;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ── input validation (rejects before any network call) ───────────────────────

describe('ServiceNowClient — input validation', () => {
  it('rejects an invalid table name without calling fetch', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.queryRecords({ table: 'bad-table!' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid sys_id without calling fetch', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.getRecord('incident', 'not-a-sysid'))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unsafe javascript: query expression', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(
      client.queryRecords({ table: 'incident', query: 'active=javascript:gs.dangerous()' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an allowlisted GlideSystem date function', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await expect(
      client.queryRecords({ table: 'incident', query: 'sys_created_on>=javascript:gs.beginningOfToday()' })
    ).resolves.toBeTruthy();
  });

  it('rejects a query exceeding the 4096-char limit', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.queryRecords({ table: 'incident', query: 'a'.repeat(4097) }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an invalid orderBy field', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await expect(client.queryRecords({ table: 'incident', orderBy: 'name;DROP' }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ── OAuth authentication ──────────────────────────────────────────────────────

describe('ServiceNowClient — authentication', () => {
  it('fails when clientId/secret are missing', async () => {
    const client = new ServiceNowClient({ instanceUrl: BASE_URL, oauth: { clientId: '', clientSecret: '' } });
    await expect(client.queryRecords({ table: 'incident' }))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  it('maps a failed token request to AUTHENTICATION_FAILED', async () => {
    routeFetch(mockResponse({ json: { result: [] } }), mockResponse({ ok: false, status: 401, statusText: 'Unauthorized' }));
    const client = new ServiceNowClient(baseConfig());
    await expect(client.queryRecords({ table: 'incident' }))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' });
  });

  it('uses client_credentials grant when no username/password', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await client.queryRecords({ table: 'incident' });
    const tokenCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/oauth_token.do'));
    expect(String(tokenCall![1].body)).toContain('grant_type=client_credentials');
  });

  it('uses password grant when username/password are configured', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(
      baseConfig({ oauth: { clientId: 'cid', clientSecret: 'secret', username: 'u', password: 'p' } })
    );
    await client.queryRecords({ table: 'incident' });
    const tokenCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/oauth_token.do'));
    expect(String(tokenCall![1].body)).toContain('grant_type=password');
  });

  it('caches the token across calls (single token request)', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await client.queryRecords({ table: 'incident' });
    await client.queryRecords({ table: 'problem' });
    const tokenCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/oauth_token.do'));
    expect(tokenCalls).toHaveLength(1);
  });
});

// ── HTTP error mapping & retry behaviour ──────────────────────────────────────

describe('ServiceNowClient — error mapping & retry', () => {
  it.each([
    [401, 'AUTHENTICATION_FAILED'],
    [403, 'INSUFFICIENT_PRIVILEGES'],
    [404, 'NOT_FOUND'],
    [400, 'INVALID_REQUEST'],
  ])('maps HTTP %i to %s', async (status, code) => {
    routeFetch(mockResponse({ ok: false, status, statusText: 'err', text: '' }));
    const client = new ServiceNowClient(baseConfig());
    await expect(client.queryRecords({ table: 'incident' })).rejects.toMatchObject({ code });
  });

  it('does not retry non-retryable errors (404 → one API call)', async () => {
    routeFetch(mockResponse({ ok: false, status: 404, statusText: 'Not Found', text: '' }));
    const client = new ServiceNowClient(baseConfig({ maxRetries: 3 }));
    await expect(client.queryRecords({ table: 'incident' })).rejects.toBeTruthy();
    const apiCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/now/'));
    expect(apiCalls).toHaveLength(1);
  });

  it('retries server errors up to maxRetries then fails', async () => {
    routeFetch(mockResponse({ ok: false, status: 500, statusText: 'Server Error', text: '' }));
    const client = new ServiceNowClient(baseConfig({ maxRetries: 2 }));
    await expect(client.queryRecords({ table: 'incident' })).rejects.toBeTruthy();
    const apiCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/now/'));
    expect(apiCalls).toHaveLength(3); // initial + 2 retries
  });

  it('honors maxRetries: 0 (no retry on server error)', async () => {
    routeFetch(mockResponse({ ok: false, status: 500, statusText: 'Server Error', text: '' }));
    const client = new ServiceNowClient(baseConfig({ maxRetries: 0 }));
    await expect(client.queryRecords({ table: 'incident' })).rejects.toBeTruthy();
    const apiCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/now/'));
    expect(apiCalls).toHaveLength(1); // single attempt, no retries
  });

  it('extracts the ServiceNow error message from a JSON error body', async () => {
    routeFetch(mockResponse({ ok: false, status: 400, statusText: 'Bad Request', text: JSON.stringify({ error: { message: 'Invalid field xyz' } }) }));
    const client = new ServiceNowClient(baseConfig());
    await expect(client.queryRecords({ table: 'incident' }))
      .rejects.toMatchObject({ message: 'Invalid field xyz' });
  });
});

// ── query building & response shaping ─────────────────────────────────────────

describe('ServiceNowClient — query building', () => {
  it('returns count and records on success', async () => {
    routeFetch(mockResponse({ json: { result: [{ sys_id: '1' }, { sys_id: '2' }] } }));
    const client = new ServiceNowClient(baseConfig());
    const res = await client.queryRecords({ table: 'incident' });
    expect(res.count).toBe(2);
    expect(res.records).toHaveLength(2);
  });

  it('applies a default limit of 10 and clamps requested limit to 1000', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());

    await client.queryRecords({ table: 'incident' });
    let apiUrl = String(fetchMock.mock.calls.find(c => String(c[0]).includes('/api/now/'))![0]);
    expect(apiUrl).toContain('sysparm_limit=10');

    fetchMock.mockClear();
    routeFetch(mockResponse({ json: { result: [] } }));
    await client.queryRecords({ table: 'incident', limit: 99999 });
    apiUrl = String(fetchMock.mock.calls.find(c => String(c[0]).includes('/api/now/'))![0]);
    expect(apiUrl).toContain('sysparm_limit=1000');
  });

  it('encodes descending orderBy as ORDERBYDESC', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await client.queryRecords({ table: 'incident', orderBy: '-sys_created_on' });
    const apiUrl = decodeURIComponent(String(fetchMock.mock.calls.find(c => String(c[0]).includes('/api/now/'))![0]));
    expect(apiUrl).toContain('ORDERBYDESCsys_created_on');
  });
});

// ── auth modes (impersonation / per-user) ─────────────────────────────────────

describe('ServiceNowClient — auth modes', () => {
  it('per-user mode sends the user bearer token on API requests', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig()).withUser({ bearerToken: 'user-token-xyz' });
    await client.queryRecords({ table: 'incident' });

    const apiCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/api/now/'))!;
    expect(apiCall[1].headers.Authorization).toBe('Bearer user-token-xyz');
  });

  it('impersonation mode adds the X-Sn-Impersonate header', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig()).withUser({ sysId: VALID_SYS_ID });
    await client.queryRecords({ table: 'incident' });
    const apiCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/api/now/'))!;
    expect(apiCall[1].headers['X-Sn-Impersonate']).toBe(VALID_SYS_ID);
  });

  it('withUser does not mutate the original client', async () => {
    const original = new ServiceNowClient(baseConfig());
    const impersonated = original.withUser({ sysId: VALID_SYS_ID });
    expect(impersonated).not.toBe(original);
  });
});

// ── domain wrapper methods ────────────────────────────────────────────────────

describe('ServiceNowClient — user & group lookups', () => {
  it('getUser by sys_id delegates to a sys_user GET', async () => {
    routeFetch(mockResponse({ json: { result: { sys_id: VALID_SYS_ID, user_name: 'admin' } } }));
    const client = new ServiceNowClient(baseConfig());
    const u = await client.getUser(VALID_SYS_ID);
    expect(u.user_name).toBe('admin');
    expect(String(apiCall()[0])).toContain(`/sys_user/${VALID_SYS_ID}`);
  });

  it('getUser by name queries user_name OR email and returns the first match', async () => {
    routeFetch(mockResponse({ json: { result: [{ user_name: 'jdoe' }] } }));
    const client = new ServiceNowClient(baseConfig());
    const u = await client.getUser('jdoe');
    expect(u.user_name).toBe('jdoe');
    expect(decodeURIComponent(String(apiCall()[0]))).toContain('user_name=jdoe^ORemail=jdoe');
  });

  it('getUser throws NOT_FOUND when no user matches', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await expect(client.getUser('ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('getGroup by name queries sys_user_group', async () => {
    routeFetch(mockResponse({ json: { result: [{ name: 'Network' }] } }));
    const client = new ServiceNowClient(baseConfig());
    const g = await client.getGroup('Network');
    expect(g.name).toBe('Network');
    expect(decodeURIComponent(String(apiCall()[0]))).toContain('name=Network');
  });

  it('getGroup by sys_id queries on sys_id', async () => {
    routeFetch(mockResponse({ json: { result: [{ sys_id: VALID_SYS_ID }] } }));
    const client = new ServiceNowClient(baseConfig());
    await client.getGroup(VALID_SYS_ID);
    expect(decodeURIComponent(String(apiCall()[0]))).toContain(`sys_id=${VALID_SYS_ID}`);
  });

  it('getGroup throws NOT_FOUND when empty', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await expect(client.getGroup('none')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ServiceNowClient — CMDB helpers', () => {
  it('searchCmdbCi clamps the limit to 100 and returns count', async () => {
    routeFetch(mockResponse({ json: { result: [{ sys_id: '1' }] } }));
    const client = new ServiceNowClient(baseConfig());
    const res = await client.searchCmdbCi('name=web', 500);
    expect(res.count).toBe(1);
    expect(String(apiCall()[0])).toContain('sysparm_limit=100');
  });

  it('getCmdbCi delegates to a cmdb_ci GET', async () => {
    routeFetch(mockResponse({ json: { result: { sys_id: VALID_SYS_ID } } }));
    const client = new ServiceNowClient(baseConfig());
    await client.getCmdbCi(VALID_SYS_ID);
    expect(String(apiCall()[0])).toContain(`/cmdb_ci/${VALID_SYS_ID}`);
  });

  it('listRelationships validates the sys_id', async () => {
    routeFetch(mockResponse({ json: { result: [] } })); // this method validates after authenticate()
    const client = new ServiceNowClient(baseConfig());
    await expect(client.listRelationships('bad')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('listRelationships queries parent OR child and returns relationships', async () => {
    routeFetch(mockResponse({ json: { result: [{ type: 'Depends on' }] } }));
    const client = new ServiceNowClient(baseConfig());
    const res = await client.listRelationships(VALID_SYS_ID);
    expect(res.count).toBe(1);
    expect(res.relationships).toHaveLength(1);
    expect(decodeURIComponent(String(apiCall()[0]))).toContain(`parent=${VALID_SYS_ID}^ORchild=${VALID_SYS_ID}`);
  });

  it('listDiscoverySchedules adds active filter only when activeOnly', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await client.listDiscoverySchedules(true);
    expect(decodeURIComponent(String(apiCall()[0]))).toContain('active=true');
  });

  it('listMidServers filters by status=Up when activeOnly', async () => {
    routeFetch(mockResponse({ json: { result: [] } }));
    const client = new ServiceNowClient(baseConfig());
    await client.listMidServers(true);
    expect(decodeURIComponent(String(apiCall()[0]))).toContain('status=Up');
  });

  it('listActiveEvents returns records from em_event', async () => {
    routeFetch(mockResponse({ json: { result: [{ sys_id: 'e1' }] } }));
    const client = new ServiceNowClient(baseConfig());
    const res = await client.listActiveEvents(undefined, 5);
    expect(res.count).toBe(1);
    expect(String(apiCall()[0])).toContain('/em_event');
  });

  it('cmdbHealthDashboard computes completeness across two queries', async () => {
    routeUrls([
      ['cmdb_ci_server', mockResponse({ json: { result: [{ ip_address: '1.1.1.1', os: 'linux' }, { ip_address: '', os: 'win' }] } })],
      ['cmdb_ci_network_adapter', mockResponse({ json: { result: [{ ip_address: '2.2.2.2', mac_address: 'aa' }] } })],
    ]);
    const client = new ServiceNowClient(baseConfig());
    const res = await client.cmdbHealthDashboard();
    expect(res.server_metrics.total).toBe(2);
    expect(res.server_metrics.with_ip).toBe(1);
    expect(res.server_metrics.ip_completeness).toBe('50.00');
    expect(res.network_metrics.mac_completeness).toBe('100.00');
  });

  it('cmdbHealthDashboard reports 0 completeness with no servers', async () => {
    routeUrls([
      ['cmdb_ci_server', mockResponse({ json: { result: [] } })],
      ['cmdb_ci_network_adapter', mockResponse({ json: { result: [] } })],
    ]);
    const client = new ServiceNowClient(baseConfig());
    const res = await client.cmdbHealthDashboard();
    expect(res.server_metrics.ip_completeness).toBe('0');
  });

  it('serviceMappingSummary validates sys_id and aggregates related CIs', async () => {
    routeFetch(mockResponse({ json: { result: [] } })); // validates after authenticate()
    const client = new ServiceNowClient(baseConfig());
    await expect(client.serviceMappingSummary('bad')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    routeUrls([
      [`/cmdb_ci_service/${VALID_SYS_ID}`, mockResponse({ json: { result: { name: 'Email' } } })],
      ['/cmdb_rel_ci', mockResponse({ json: { result: [{ sys_id: 'r1' }, { sys_id: 'r2' }] } })],
    ]);
    const res = await client.serviceMappingSummary(VALID_SYS_ID);
    expect(res.service.name).toBe('Email');
    expect(res.related_cis_count).toBe(2);
  });
});

describe('ServiceNowClient — record CRUD', () => {
  it('createRecord validates the table name', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.createRecord('bad table', {})).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('createRecord POSTs and returns the created record', async () => {
    routeFetch(mockResponse({ json: { result: { sys_id: 'new', number: 'INC1' } } }));
    const client = new ServiceNowClient(baseConfig());
    const r = await client.createRecord('incident', { short_description: 'x' });
    expect(r.number).toBe('INC1');
    expect(apiCall()[1].method).toBe('POST');
  });

  it('createChangeRequest POSTs to change_request', async () => {
    routeFetch(mockResponse({ json: { result: { sys_id: 'c1' } } }));
    const client = new ServiceNowClient(baseConfig());
    await client.createChangeRequest({ short_description: 'patch' });
    expect(String(apiCall()[0])).toContain('/change_request');
    expect(apiCall()[1].method).toBe('POST');
  });

  it('updateRecord validates sys_id and PATCHes', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.updateRecord('incident', 'bad', {})).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    routeFetch(mockResponse({ json: { result: { sys_id: VALID_SYS_ID } } }));
    await client.updateRecord('incident', VALID_SYS_ID, { state: '2' });
    expect(apiCall()[1].method).toBe('PATCH');
  });

  it('deleteRecord issues a DELETE and tolerates a 204 body', async () => {
    routeFetch(mockResponse({ status: 204, contentLength: '0' }));
    const client = new ServiceNowClient(baseConfig());
    await expect(client.deleteRecord('incident', VALID_SYS_ID)).resolves.toBeUndefined();
    expect(apiCall()[1].method).toBe('DELETE');
  });
});

describe('ServiceNowClient — raw API & AI helpers', () => {
  it('callNowAssist rejects an endpoint not under /api/', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.callNowAssist('/sn_va/topic', {})).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('callNowAssist POSTs to the given /api/ endpoint', async () => {
    routeFetch(mockResponse({ json: { answer: 'ok' } }));
    const client = new ServiceNowClient(baseConfig());
    const r = await client.callNowAssist('/api/sn_now_assist/x', { prompt: 'hi' });
    expect(r.answer).toBe('ok');
    expect(apiCall()[1].method).toBe('POST');
  });

  it('callApiGet rejects non-/api/ endpoints and GETs valid ones', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.callApiGet('/foo')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    routeFetch(mockResponse({ json: { result: [1] } }));
    const r = await client.callApiGet('/api/now/table/incident');
    expect(r.result).toEqual([1]);
  });

  it('runAggregateQuery validates inputs and hits the stats API', async () => {
    routeFetch(mockResponse({ json: { result: {} } })); // validates after authenticate()
    const client = new ServiceNowClient(baseConfig());
    await expect(client.runAggregateQuery('incident', 'bad;field')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    routeFetch(mockResponse({ json: { result: { stats: { count: '5' } } } }));
    const r = await client.runAggregateQuery('incident', 'priority', 'COUNT');
    expect(r.stats.count).toBe('5');
    expect(String(apiCall()[0])).toContain('/api/now/stats/incident');
    expect(decodeURIComponent(String(apiCall()[0]))).toContain('sysparm_group_by=priority');
  });

  it('naturalLanguageSearch builds a LIKE query against incident', async () => {
    routeFetch(mockResponse({ json: { result: [{ number: 'INC9' }] } }));
    const client = new ServiceNowClient(baseConfig());
    const res = await client.naturalLanguageSearch('printer down');
    expect(res.count).toBe(1);
    // URLSearchParams encodes spaces as '+', so match the unambiguous prefix.
    const url = decodeURIComponent(String(apiCall()[0]));
    expect(url).toContain('/api/now/table/incident');
    expect(url).toContain('short_descriptionLIKEprinter');
    expect(url).toContain('ORdescriptionLIKEprinter');
  });

  it('naturalLanguageUpdate is not implemented', async () => {
    const client = new ServiceNowClient(baseConfig());
    await expect(client.naturalLanguageUpdate('do x', 'incident')).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

describe('ServiceNowClient — attachment upload', () => {
  it('uploads binary content and returns the attachment result', async () => {
    routeFetch(mockResponse({ json: { result: { sys_id: 'att1', file_name: 'a.txt' } } }));
    const client = new ServiceNowClient(baseConfig());
    const r = await client.uploadAttachment('incident', VALID_SYS_ID, 'a.txt', 'text/plain', Buffer.from('hello').toString('base64'));
    expect(r.sys_id).toBe('att1');
    const call = apiCall();
    expect(String(call[0])).toContain('/api/now/attachment/file');
    expect(String(call[0])).toContain('file_name=a.txt');
    expect(call[1].method).toBe('POST');
  });

  it('maps an upload failure to ATTACHMENT_UPLOAD_FAILED', async () => {
    routeFetch(mockResponse({ ok: false, status: 400, statusText: 'Bad', text: JSON.stringify({ error: { message: 'too big' } }) }));
    const client = new ServiceNowClient(baseConfig());
    await expect(
      client.uploadAttachment('incident', VALID_SYS_ID, 'a.txt', 'text/plain', 'AA==')
    ).rejects.toMatchObject({ code: 'ATTACHMENT_UPLOAD_FAILED' });
  });
});
