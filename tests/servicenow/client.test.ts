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
