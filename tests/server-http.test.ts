import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';

// ── Mocks ─────────────────────────────────────────────────────────────────────
// A controllable stand-in for StreamableHTTPServerTransport. Its handleRequest
// simulates the real transport's session lifecycle by invoking the
// onsessioninitialized callback the first time it runs. Everything referenced by
// a vi.mock factory must live in vi.hoisted (factories are hoisted to the top).
const { transportInstances, state, MockTransport, mockIsInit, mockCreateServer, mockIsConfigured } =
  vi.hoisted(() => {
    const transportInstances: any[] = [];
    const state = { sessionCounter: 0 };
    class MockTransport {
      opts: any;
      sessionId: string | undefined;
      onclose: (() => void) | undefined;
      handleRequest = vi.fn(async () => {
        if (!this.sessionId && this.opts?.sessionIdGenerator) {
          this.sessionId = `sess-${++state.sessionCounter}`;
          await this.opts.onsessioninitialized?.(this.sessionId);
        }
      });
      close = vi.fn(async () => {
        this.onclose?.();
      });
      constructor(opts: any) {
        this.opts = opts;
        transportInstances.push(this);
      }
    }
    return {
      transportInstances,
      state,
      MockTransport,
      mockIsInit: vi.fn(),
      mockCreateServer: vi.fn(() => ({ connect: vi.fn(async () => {}) })),
      mockIsConfigured: vi.fn(() => true),
    };
  });

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: MockTransport,
}));
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  isInitializeRequest: mockIsInit,
}));
vi.mock('../src/server.js', () => ({
  createServer: mockCreateServer,
  isInstanceConfigured: mockIsConfigured,
  SERVER_NAME: 'servicenow-mcp',
}));
vi.mock('../src/tools/index.js', () => ({
  getTools: () => [{ name: 'a' }, { name: 'b' }],
}));

import {
  getHttpConfig,
  jsonRpcError,
  readJsonBody,
  handleHttpRequest,
  createHttpServer,
  activeSessionCount,
  closeAllSessions,
  type HttpConfig,
} from '../src/server-http.js';

// ── Helpers ─────────────────────────────────────────────────────────────────
function mockReq(opts: { method: string; url?: string; headers?: Record<string, string>; body?: unknown }) {
  const json = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const req = Readable.from(json ? [Buffer.from(json)] : []) as any;
  req.method = opts.method;
  req.url = opts.url ?? '/mcp';
  req.headers = { host: 'localhost', authorization: 'Bearer test-token', ...(opts.headers ?? {}) };
  return req;
}

function mockRes() {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    headersSent: false,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    writeHead(code: number, hdrs?: Record<string, string>) {
      this.statusCode = code;
      this.headersSent = true;
      if (hdrs) for (const [k, v] of Object.entries(hdrs)) this.headers[k.toLowerCase()] = v;
      return this;
    },
    end(chunk?: string) {
      if (chunk) this.body += chunk;
      this.ended = true;
      return this;
    },
  };
  return res;
}

const CFG: HttpConfig = {
  port: 3000,
  host: '127.0.0.1',
  path: '/mcp',
  corsOrigin: '*',
  authToken: 'test-token',
};

beforeEach(() => {
  transportInstances.length = 0;
  state.sessionCounter = 0;
  mockIsInit.mockReset().mockReturnValue(false);
  mockCreateServer.mockClear();
  closeAllSessions();
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (/^MCP_HTTP_/.test(k)) delete process.env[k];
  }
});

// ── getHttpConfig ─────────────────────────────────────────────────────────────
describe('getHttpConfig', () => {
  it('uses safe defaults', () => {
    const cfg = getHttpConfig();
    expect(cfg).toMatchObject({ port: 3000, host: '127.0.0.1', path: '/mcp', corsOrigin: '*' });
    expect(cfg.allowedHosts).toBeUndefined();
    expect(cfg.allowedOrigins).toBeUndefined();
  });

  it('reads overrides from the environment', () => {
    process.env.MCP_HTTP_PORT = '8080';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    process.env.MCP_HTTP_PATH = '/rpc';
    process.env.MCP_HTTP_CORS_ORIGIN = 'https://claude.ai';
    process.env.MCP_HTTP_ALLOWED_HOSTS = 'a.example.com, b.example.com';
    process.env.MCP_HTTP_ALLOWED_ORIGINS = 'https://claude.ai';
    const cfg = getHttpConfig();
    expect(cfg).toMatchObject({ port: 8080, host: '0.0.0.0', path: '/rpc', corsOrigin: 'https://claude.ai' });
    expect(cfg.allowedHosts).toEqual(['a.example.com', 'b.example.com']);
    expect(cfg.allowedOrigins).toEqual(['https://claude.ai']);
  });

  it('falls back to the default port for an unparseable value', () => {
    process.env.MCP_HTTP_PORT = 'not-a-number';
    expect(getHttpConfig().port).toBe(3000);
  });
});

// ── jsonRpcError ──────────────────────────────────────────────────────────────
describe('jsonRpcError', () => {
  it('builds a JSON-RPC error envelope', () => {
    expect(JSON.parse(jsonRpcError(-32000, 'oops'))).toEqual({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'oops' },
      id: null,
    });
  });
});

// ── readJsonBody ──────────────────────────────────────────────────────────────
describe('readJsonBody', () => {
  it('parses a JSON body', async () => {
    expect(await readJsonBody(mockReq({ method: 'POST', body: { a: 1 } }))).toEqual({ a: 1 });
  });
  it('returns undefined for an empty body', async () => {
    expect(await readJsonBody(mockReq({ method: 'POST' }))).toBeUndefined();
  });
});

// ── handleHttpRequest ─────────────────────────────────────────────────────────
describe('handleHttpRequest', () => {
  it('rejects MCP requests without the configured bearer token', async () => {
    const res = mockRes();
    await handleHttpRequest(
      mockReq({ method: 'POST', headers: { authorization: '' }, body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      res,
      CFG
    );
    expect(res.statusCode).toBe(401);
    expect(mockCreateServer).not.toHaveBeenCalled();
  });

  it('answers CORS preflight with 204', async () => {
    const res = mockRes();
    await handleHttpRequest(mockReq({ method: 'OPTIONS' }), res, CFG);
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-expose-headers']).toBe('Mcp-Session-Id');
  });

  it('serves /health', async () => {
    const res = mockRes();
    await handleHttpRequest(mockReq({ method: 'GET', url: '/health' }), res, CFG);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'ok', tools: 2 });
  });

  it('404s an unknown path', async () => {
    const res = mockRes();
    await handleHttpRequest(mockReq({ method: 'GET', url: '/nope' }), res, CFG);
    expect(res.statusCode).toBe(404);
  });

  it('opens a session on an initialize POST and routes to the transport', async () => {
    mockIsInit.mockReturnValue(true);
    const res = mockRes();
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      res,
      CFG
    );
    expect(mockCreateServer).toHaveBeenCalledTimes(1);
    expect(transportInstances).toHaveLength(1);
    expect(transportInstances[0].handleRequest).toHaveBeenCalledTimes(1);
    expect(activeSessionCount()).toBe(1);
  });

  it('reuses the transport for a known session id', async () => {
    mockIsInit.mockReturnValue(true);
    // First, initialize to register a session.
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      mockRes(),
      CFG
    );
    const sid = transportInstances[0].sessionId!;
    mockIsInit.mockReturnValue(false);

    // Second call with the session id must not create another server/transport.
    await handleHttpRequest(
      mockReq({ method: 'POST', headers: { 'mcp-session-id': sid }, body: { jsonrpc: '2.0', method: 'tools/list', id: 2 } }),
      mockRes(),
      CFG
    );
    expect(mockCreateServer).toHaveBeenCalledTimes(1);
    expect(transportInstances).toHaveLength(1);
    expect(transportInstances[0].handleRequest).toHaveBeenCalledTimes(2);
  });

  it('400s a non-initialize POST without a session', async () => {
    mockIsInit.mockReturnValue(false);
    const res = mockRes();
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'tools/list', id: 1 } }),
      res,
      CFG
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toMatch(/no valid session/);
    expect(mockCreateServer).not.toHaveBeenCalled();
  });

  it('400s a GET without a valid session', async () => {
    const res = mockRes();
    await handleHttpRequest(mockReq({ method: 'GET' }), res, CFG);
    expect(res.statusCode).toBe(400);
  });

  it('routes a GET with a valid session to the transport', async () => {
    mockIsInit.mockReturnValue(true);
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      mockRes(),
      CFG
    );
    const sid = transportInstances[0].sessionId!;
    const res = mockRes();
    await handleHttpRequest(mockReq({ method: 'GET', headers: { 'mcp-session-id': sid } }), res, CFG);
    expect(transportInstances[0].handleRequest).toHaveBeenCalledTimes(2);
  });

  it('terminates a session on DELETE', async () => {
    mockIsInit.mockReturnValue(true);
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      mockRes(),
      CFG
    );
    const sid = transportInstances[0].sessionId!;
    expect(activeSessionCount()).toBe(1);
    const res = mockRes();
    await handleHttpRequest(mockReq({ method: 'DELETE', headers: { 'mcp-session-id': sid } }), res, CFG);
    expect(transportInstances[0].handleRequest).toHaveBeenCalledTimes(2);
  });

  it('405s an unsupported method', async () => {
    const res = mockRes();
    await handleHttpRequest(mockReq({ method: 'PUT' }), res, CFG);
    expect(res.statusCode).toBe(405);
  });

  it('enables DNS rebinding protection when allow-lists are configured', async () => {
    mockIsInit.mockReturnValue(true);
    const cfg: HttpConfig = { ...CFG, allowedHosts: ['mcp.example.com'], allowedOrigins: ['https://claude.ai'] };
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      mockRes(),
      cfg
    );
    const opts = transportInstances[0].opts;
    expect(opts.enableDnsRebindingProtection).toBe(true);
    expect(opts.allowedHosts).toEqual(['mcp.example.com']);
    expect(opts.allowedOrigins).toEqual(['https://claude.ai']);
  });

  it('does not set DNS rebinding options by default', async () => {
    mockIsInit.mockReturnValue(true);
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      mockRes(),
      CFG
    );
    expect(transportInstances[0].opts.enableDnsRebindingProtection).toBeUndefined();
  });

  it('drops the session from the registry when the transport closes', async () => {
    mockIsInit.mockReturnValue(true);
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      mockRes(),
      CFG
    );
    expect(activeSessionCount()).toBe(1);
    transportInstances[0].onclose!(); // simulate the transport closing
    expect(activeSessionCount()).toBe(0);
  });
});

describe('closeAllSessions', () => {
  it('closes every transport and empties the registry', async () => {
    mockIsInit.mockReturnValue(true);
    await handleHttpRequest(
      mockReq({ method: 'POST', body: { jsonrpc: '2.0', method: 'initialize', id: 1 } }),
      mockRes(),
      CFG
    );
    expect(activeSessionCount()).toBe(1);
    const transport = transportInstances[0];
    closeAllSessions();
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(activeSessionCount()).toBe(0);
  });

  it('500s when body parsing throws', async () => {
    const req = Readable.from([Buffer.from('{ not json')]) as any;
    req.method = 'POST';
    req.url = '/mcp';
    req.headers = { host: 'localhost', authorization: 'Bearer test-token' };
    const res = mockRes();
    await handleHttpRequest(req, res, CFG);
    expect(res.statusCode).toBe(500);
  });
});

// ── createHttpServer ──────────────────────────────────────────────────────────
describe('createHttpServer', () => {
  it('returns an http.Server without listening', () => {
    const server = createHttpServer(CFG);
    expect(typeof server.listen).toBe('function');
    expect(server.listening).toBe(false);
  });
});
