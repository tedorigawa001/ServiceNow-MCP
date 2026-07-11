/**
 * Streamable HTTP transport for the ServiceNow MCP server.
 *
 * Complements the default stdio transport (see `server.ts`) so the same tool set
 * can be reached over HTTP — enabling browser-based clients (Claude.ai), Docker
 * deployments, shared server instances, and CI/CD callers.
 *
 * Transport selection is driven by `MCP_TRANSPORT=http`. The HTTP server uses the
 * MCP Streamable HTTP spec with per-session transports: an `initialize` request
 * mints a session id (returned via the `Mcp-Session-Id` header) which subsequent
 * requests reuse. GET opens the SSE notification stream; DELETE terminates a session.
 */
import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createServer, isInstanceConfigured, SERVER_NAME } from './server.js';
import { getTools } from './tools/index.js';
import { logger } from './utils/logging.js';

export interface HttpConfig {
  port: number;
  host: string;
  path: string;
  corsOrigin: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  authToken?: string;
}

/** Resolve HTTP transport configuration from environment variables. */
export function getHttpConfig(): HttpConfig {
  const splitList = (v?: string): string[] | undefined => {
    if (!v) return undefined;
    const parts = v.split(',').map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  };
  return {
    port: Number(process.env.MCP_HTTP_PORT) || 3000,
    // Bind to loopback by default; set MCP_HTTP_HOST=0.0.0.0 to expose externally.
    host: process.env.MCP_HTTP_HOST || '127.0.0.1',
    path: process.env.MCP_HTTP_PATH || '/mcp',
    corsOrigin: process.env.MCP_HTTP_CORS_ORIGIN || '*',
    allowedHosts: splitList(process.env.MCP_HTTP_ALLOWED_HOSTS),
    allowedOrigins: splitList(process.env.MCP_HTTP_ALLOWED_ORIGINS),
    authToken: process.env.MCP_HTTP_AUTH_TOKEN,
  };
}

/** Active transports keyed by session id (stateful mode). */
const transports = new Map<string, StreamableHTTPServerTransport>();

/** Number of live sessions — exported for observability/tests. */
export function activeSessionCount(): number {
  return transports.size;
}

/** Close and forget every active session (used on shutdown / in tests). */
export function closeAllSessions(): void {
  for (const transport of transports.values()) {
    void transport.close();
  }
  transports.clear();
}

/** Build a minimal JSON-RPC error payload. */
export function jsonRpcError(code: number, message: string, id: string | number | null = null): string {
  return JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id });
}

/** Apply permissive CORS headers so browser clients can connect. */
function applyCors(res: http.ServerResponse, cfg: HttpConfig): void {
  res.setHeader('Access-Control-Allow-Origin', cfg.corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID'
  );
  // Browsers cannot read the session id unless it is explicitly exposed.
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

/** Require an explicit bearer token before accepting an MCP HTTP request. */
function isAuthorized(req: http.IncomingMessage, cfg: HttpConfig): boolean {
  if (!cfg.authToken) return false;
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(cfg.authToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** Read and JSON-parse the request body. Returns undefined for an empty body. */
export async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return undefined;
  return JSON.parse(raw);
}

/** Create a new per-session transport wired to a fresh MCP server. */
async function createSessionTransport(cfg: HttpConfig): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
      logger.info(`HTTP session opened: ${sessionId} [${transports.size} active]`);
    },
    ...(cfg.allowedHosts || cfg.allowedOrigins
      ? {
          enableDnsRebindingProtection: true,
          allowedHosts: cfg.allowedHosts,
          allowedOrigins: cfg.allowedOrigins,
        }
      : {}),
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid && transports.delete(sid)) {
      logger.info(`HTTP session closed: ${sid} [${transports.size} active]`);
    }
  };

  const server = createServer();
  await server.connect(transport);
  return transport;
}

/**
 * Handle a single MCP HTTP request. Exported for unit testing — the listener
 * passed to `http.createServer` is a thin wrapper around this.
 */
export async function handleHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  cfg: HttpConfig = getHttpConfig()
): Promise<void> {
  applyCors(res, cfg);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Lightweight health probe for load balancers / container orchestration.
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: SERVER_NAME, tools: getTools().length, sessions: transports.size }));
    return;
  }

  if (url.pathname !== cfg.path) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(jsonRpcError(-32601, `Not found: ${url.pathname}`));
    return;
  }

  if (!isAuthorized(req, cfg)) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer',
    });
    res.end(jsonRpcError(-32001, 'Unauthorized'));
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  try {
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(body)) {
        transport = await createSessionTransport(cfg);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(jsonRpcError(-32000, 'Bad Request: no valid session id (initialize first)'));
        return;
      }

      await transport!.handleRequest(req, res, body);
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(jsonRpcError(-32000, 'Bad Request: unknown or missing session id'));
        return;
      }
      await transports.get(sessionId)!.handleRequest(req, res);
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(jsonRpcError(-32601, `Method not allowed: ${req.method}`));
  } catch (error) {
    logger.error('HTTP request handling failed', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(jsonRpcError(-32603, 'Internal server error'));
    }
  }
}

/** Build the Node HTTP server (without listening). Exported for tests. */
export function createHttpServer(cfg: HttpConfig = getHttpConfig()): http.Server {
  return http.createServer((req, res) => {
    void handleHttpRequest(req, res, cfg);
  });
}

/** Start the Streamable HTTP server, listening on the configured host/port. */
export async function startHttpServer(): Promise<http.Server> {
  if (!isInstanceConfigured()) {
    logger.error('No ServiceNow instance configured. Set SERVICENOW_INSTANCE_URL or SN_INSTANCES_CONFIG.');
    process.exit(1);
  }

  const cfg = getHttpConfig();
  const server = createHttpServer(cfg);

  await new Promise<void>((resolve) => server.listen(cfg.port, cfg.host, resolve));
  logger.info(
    `${SERVER_NAME} server running on http://${cfg.host}:${cfg.port}${cfg.path} ` +
      `[${getTools().length} tools]`
  );

  const shutdown = () => {
    logger.info('Shutting down HTTP server...');
    closeAllSessions();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}
